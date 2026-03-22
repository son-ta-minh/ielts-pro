import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { CheckCircle2, Info, Loader2, Wand2, X } from 'lucide-react';
import { User, VocabularyItem, WordQuality } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { runWordRefineWithRetry, WordRefineProgressSnapshot } from '../../services/wordRefineApi';
import { applyAiRefinementResultsToWords } from '../../services/wordRefinePersistence';

const AUTO_REFINE_STORAGE_KEY = 'vocab_pro_auto_refine_state_v1';
const MAX_AUTO_REFINE_HISTORY_ITEMS = 120;

type AutoRefineStatus = 'idle' | 'running' | 'completed';

interface AutoRefineState {
    status: AutoRefineStatus;
    userId: string | null;
    startedAt: number | null;
    totalWords: number;
    completedCount: number;
    successCount: number;
    failedCount: number;
    pendingWordIds: string[];
    currentWordId: string | null;
    currentWordText: string | null;
    progress: WordRefineProgressSnapshot | null;
    history: WordRefineProgressSnapshot[];
}

interface AutoRefineContextValue {
    state: AutoRefineState;
    startAutoRefine: () => Promise<void>;
}

const DEFAULT_AUTO_REFINE_STATE: AutoRefineState = {
    status: 'idle',
    userId: null,
    startedAt: null,
    totalWords: 0,
    completedCount: 0,
    successCount: 0,
    failedCount: 0,
    pendingWordIds: [],
    currentWordId: null,
    currentWordText: null,
    progress: null,
    history: []
};

const AutoRefineContext = createContext<AutoRefineContextValue>({
    state: DEFAULT_AUTO_REFINE_STATE,
    startAutoRefine: async () => undefined
});

const compactRefineSnapshotForHistory = (snapshot: WordRefineProgressSnapshot): WordRefineProgressSnapshot => ({
    ...snapshot,
    rawText: snapshot.rawText
        ? `${snapshot.rawText.slice(0, 800)}${snapshot.rawText.length > 800 ? '\n...[truncated]' : ''}`
        : undefined
});

const loadPersistedAutoRefineState = (): AutoRefineState => {
    try {
        const raw = window.localStorage.getItem(AUTO_REFINE_STORAGE_KEY);
        if (!raw) return DEFAULT_AUTO_REFINE_STATE;
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_AUTO_REFINE_STATE,
            ...parsed,
            history: Array.isArray(parsed?.history) ? parsed.history : [],
            pendingWordIds: Array.isArray(parsed?.pendingWordIds) ? parsed.pendingWordIds : []
        };
    } catch {
        return DEFAULT_AUTO_REFINE_STATE;
    }
};

const getWordById = (wordId: string, userId: string): VocabularyItem | null => {
    return dataStore.getAllWords().find((word) => word.id === wordId && word.userId === userId) || null;
};

const getWordLabel = (wordId: string | null, userId: string | null): string | null => {
    if (!wordId || !userId) return null;
    return getWordById(wordId, userId)?.word || null;
};

export const AutoRefineProvider: React.FC<{
    currentUser: User | null;
    children: React.ReactNode;
}> = ({ currentUser, children }) => {
    const { showToast } = useToast();
    const [state, setState] = useState<AutoRefineState>(() => (
        typeof window === 'undefined' ? DEFAULT_AUTO_REFINE_STATE : loadPersistedAutoRefineState()
    ));
    const stateRef = useRef(state);
    const processingRef = useRef(false);

    useEffect(() => {
        stateRef.current = state;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(AUTO_REFINE_STORAGE_KEY, JSON.stringify(state));
        }
    }, [state]);

    const appendHistory = useCallback((snapshot: WordRefineProgressSnapshot) => {
        const compact = compactRefineSnapshotForHistory(snapshot);
        setState((current) => {
            const nextHistory = [...current.history, compact];
            return {
                ...current,
                progress: compact,
                history: nextHistory.length > MAX_AUTO_REFINE_HISTORY_ITEMS
                    ? nextHistory.slice(nextHistory.length - MAX_AUTO_REFINE_HISTORY_ITEMS)
                    : nextHistory
            };
        });
    }, []);

    const markWordProcessed = useCallback((wordId: string, wordText: string, options: {
        success: boolean;
        progress?: WordRefineProgressSnapshot | null;
    }) => {
        setState((current) => {
            const nextPendingIds = current.pendingWordIds.filter((id) => id !== wordId);
            const nextCompletedCount = current.completedCount + 1;
            const nextState: AutoRefineState = {
                ...current,
                pendingWordIds: nextPendingIds,
                completedCount: nextCompletedCount,
                successCount: current.successCount + (options.success ? 1 : 0),
                failedCount: current.failedCount + (options.success ? 0 : 1),
                currentWordId: null,
                currentWordText: null,
                progress: options.progress ?? current.progress
            };
            if (nextPendingIds.length === 0) {
                nextState.status = 'completed';
            }
            return nextState;
        });
    }, []);

    const processQueue = useCallback(async () => {
        if (!currentUser) return;
        if (processingRef.current) return;
        if (stateRef.current.status !== 'running') return;
        if (stateRef.current.userId !== currentUser.id) return;

        processingRef.current = true;
        try {
            while (
                stateRef.current.status === 'running' &&
                stateRef.current.userId === currentUser.id &&
                stateRef.current.pendingWordIds.length > 0
            ) {
                const wordId = stateRef.current.pendingWordIds[0];
                const liveWord = getWordById(wordId, currentUser.id);
                const fallbackWordLabel = liveWord?.word || getWordLabel(wordId, currentUser.id) || 'Unknown word';

                setState((current) => ({
                    ...current,
                    currentWordId: wordId,
                    currentWordText: fallbackWordLabel
                }));

                if (!liveWord || liveWord.quality !== WordQuality.RAW) {
                    const skippedSnapshot: WordRefineProgressSnapshot = {
                        stage: 'success',
                        attempt: 1,
                        maxAttempts: 1,
                        message: `Skipped "${fallbackWordLabel}" because it is no longer RAW.`
                    };
                    appendHistory(skippedSnapshot);
                    markWordProcessed(wordId, fallbackWordLabel, { success: true, progress: skippedSnapshot });
                    showToast(`Auto Refine skipped "${fallbackWordLabel}" because it is no longer RAW.`, 'info', 2500);
                    continue;
                }

                let wordSaved = false;
                let partialSave = false;
                let finalProgress: WordRefineProgressSnapshot | null = null;

                try {
                    const { finalIssues } = await runWordRefineWithRetry(
                        [liveWord],
                        currentUser.nativeLanguage || 'Vietnamese',
                        {
                            onProgress: (snapshot) => {
                                const enrichedSnapshot: WordRefineProgressSnapshot = {
                                    ...snapshot,
                                    message: `"${liveWord.word}": ${snapshot.message}`
                                };
                                finalProgress = enrichedSnapshot;
                                appendHistory(enrichedSnapshot);
                            },
                            onWordValidated: async ({ word, results, partial, issues }) => {
                                await applyAiRefinementResultsToWords(results, [word]);
                                wordSaved = true;
                                partialSave = !!partial;
                                const progressSnapshot: WordRefineProgressSnapshot = {
                                    stage: partial ? 'error' : 'success',
                                    attempt: 1,
                                    maxAttempts: 1,
                                    message: partial
                                        ? `"${word.word}" saved partially. Manual review may still be needed.`
                                        : `"${word.word}" refined successfully.`,
                                    issues
                                };
                                finalProgress = progressSnapshot;
                                appendHistory(progressSnapshot);
                            }
                        }
                    );

                    if (wordSaved) {
                        markWordProcessed(wordId, liveWord.word, { success: true, progress: finalProgress });
                        showToast(
                            partialSave
                                ? `Auto Refine saved "${liveWord.word}" with partial fields.`
                                : `Auto Refine refined "${liveWord.word}".`,
                            partialSave ? 'info' : 'success',
                            2600
                        );

                        if (finalIssues.length > 0 && !partialSave) {
                            const issueSnapshot: WordRefineProgressSnapshot = {
                                stage: 'error',
                                attempt: 1,
                                maxAttempts: 1,
                                message: `Manual review suggested for "${liveWord.word}".`,
                                issues: finalIssues.flatMap((issue) => issue.issues || [])
                            };
                            appendHistory(issueSnapshot);
                        }
                    } else {
                        const failureIssues = finalIssues.flatMap((issue) => issue.issues || []);
                        const failureSnapshot: WordRefineProgressSnapshot = {
                            stage: 'error',
                            attempt: 1,
                            maxAttempts: 1,
                            message: `Auto Refine could not save "${liveWord.word}".`,
                            issues: failureIssues.length > 0 ? failureIssues : ['No valid fields could be saved.']
                        };
                        appendHistory(failureSnapshot);
                        markWordProcessed(wordId, liveWord.word, { success: false, progress: failureSnapshot });
                        showToast(`Auto Refine could not refine "${liveWord.word}".`, 'error', 3200);
                    }
                } catch (error) {
                    const errorSnapshot: WordRefineProgressSnapshot = {
                        stage: 'error',
                        attempt: 1,
                        maxAttempts: 1,
                        message: `Auto Refine failed on "${liveWord.word}".`,
                        issues: [error instanceof Error ? error.message : 'Unknown error']
                    };
                    appendHistory(errorSnapshot);
                    markWordProcessed(wordId, liveWord.word, { success: false, progress: errorSnapshot });
                    showToast(`Auto Refine failed on "${liveWord.word}".`, 'error', 3200);
                }
            }

            if (
                stateRef.current.status === 'completed' &&
                stateRef.current.userId === currentUser.id &&
                stateRef.current.totalWords > 0
            ) {
                const summarySnapshot: WordRefineProgressSnapshot = {
                    stage: 'success',
                    attempt: 1,
                    maxAttempts: 1,
                    message: `Auto Refine completed ${stateRef.current.completedCount}/${stateRef.current.totalWords} word(s).`
                };
                appendHistory(summarySnapshot);
                showToast(
                    `Auto Refine completed: ${stateRef.current.successCount}/${stateRef.current.totalWords} word(s) saved.`,
                    'success',
                    3500
                );
            }
        } finally {
            processingRef.current = false;
        }
    }, [appendHistory, currentUser, markWordProcessed, showToast]);

    useEffect(() => {
        if (!currentUser) return;
        if (state.status === 'running' && state.userId === currentUser.id) {
            processQueue();
        }
    }, [currentUser, processQueue, state.status, state.userId]);

    const startAutoRefine = useCallback(async () => {
        if (!currentUser) return;
        if (stateRef.current.status === 'running' && stateRef.current.userId === currentUser.id) {
            return;
        }

        const rawWords = dataStore.getAllWords()
            .filter((word) => word.userId === currentUser.id && word.quality === WordQuality.RAW);

        if (rawWords.length === 0) {
            showToast('No RAW words found for Auto Refine.', 'info');
            return;
        }

        const startingSnapshot: WordRefineProgressSnapshot = {
            stage: 'starting',
            attempt: 0,
            maxAttempts: 1,
            message: `Auto Refine queued ${rawWords.length} RAW word(s).`
        };

        setState({
            status: 'running',
            userId: currentUser.id,
            startedAt: Date.now(),
            totalWords: rawWords.length,
            completedCount: 0,
            successCount: 0,
            failedCount: 0,
            pendingWordIds: rawWords.map((word) => word.id),
            currentWordId: null,
            currentWordText: null,
            progress: startingSnapshot,
            history: [compactRefineSnapshotForHistory(startingSnapshot)]
        });
        showToast(`Auto Refine started for ${rawWords.length} RAW word(s).`, 'info', 2600);
    }, [currentUser, showToast]);

    const contextValue = useMemo<AutoRefineContextValue>(() => ({
        state,
        startAutoRefine
    }), [startAutoRefine, state]);

    return (
        <AutoRefineContext.Provider value={contextValue}>
            {children}
        </AutoRefineContext.Provider>
    );
};

const useAutoRefine = () => useContext(AutoRefineContext);

export const AutoRefineDashboardControl: React.FC = () => {
    const { state, startAutoRefine } = useAutoRefine();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [isLogOpen, setIsLogOpen] = useState(false);

    const isRunning = state.status === 'running';
    const hasProgress = state.totalWords > 0;
    const progressPercent = state.totalWords > 0
        ? Math.min(100, Math.round((state.completedCount / state.totalWords) * 100))
        : 0;

    const handlePrimaryClick = async () => {
        if (isRunning) {
            setIsPanelOpen((current) => !current);
            return;
        }
        await startAutoRefine();
        setIsPanelOpen(true);
    };

    return (
        <>
            <div className="relative">
                <button
                    onClick={handlePrimaryClick}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest shadow-sm transition-all ${
                        isRunning
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                >
                    {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    <span>{isRunning ? 'Auto Refine Running' : 'Auto Refine'}</span>
                </button>

                {isPanelOpen && hasProgress && (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[20rem] rounded-3xl border border-neutral-200 bg-white p-4 shadow-2xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-xs font-black text-neutral-900">Auto Refine Progress</div>
                                <div className="mt-1 text-[10px] font-bold text-neutral-500">
                                    {state.completedCount}/{state.totalWords} word(s) processed
                                </div>
                            </div>
                            <button
                                onClick={() => setIsPanelOpen(false)}
                                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
                            <div
                                className="h-full rounded-full bg-indigo-500 transition-all"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[10px] font-bold">
                            <span className="text-indigo-600">{progressPercent}% complete</span>
                            <span className="text-neutral-400">
                                Saved {state.successCount} / Failed {state.failedCount}
                            </span>
                        </div>

                        {state.currentWordText && (
                            <div className="mt-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                <div className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Current Word</div>
                                <div className="mt-1 text-xs font-bold text-neutral-700">{state.currentWordText}</div>
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                onClick={() => setIsLogOpen(true)}
                                className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-700 hover:bg-neutral-50"
                            >
                                <Info size={12} />
                                <span>View Refine API Log</span>
                            </button>
                            {state.status === 'completed' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                    <CheckCircle2 size={12} />
                                    Completed
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isLogOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-2xl">
                        <header className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
                            <div>
                                <h3 className="text-lg font-black text-neutral-900">Refine API Log</h3>
                                <p className="mt-1 text-xs font-medium text-neutral-400">
                                    {state.completedCount}/{state.totalWords} processed since Auto Refine started
                                </p>
                            </div>
                            <button
                                onClick={() => setIsLogOpen(false)}
                                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <X size={18} />
                            </button>
                        </header>

                        <main className="flex-1 overflow-y-auto px-6 py-5">
                            {state.history.length === 0 ? (
                                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-6 text-center text-sm font-medium text-neutral-400">
                                    No refine log yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {state.history.map((item, index) => {
                                        const toneClass = item.stage === 'error'
                                            ? 'border-rose-100 bg-rose-50'
                                            : item.stage === 'success'
                                                ? 'border-emerald-100 bg-emerald-50'
                                                : 'border-neutral-100 bg-neutral-50';
                                        const badgeClass = item.stage === 'error'
                                            ? 'bg-rose-500 text-white'
                                            : item.stage === 'success'
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-neutral-700 text-white';
                                        return (
                                            <div key={`${item.stage}-${index}-${item.message}`} className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-sm font-bold text-neutral-800">{item.message}</div>
                                                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${badgeClass}`}>
                                                        {item.stage}
                                                    </span>
                                                </div>
                                                {item.issues && item.issues.length > 0 && (
                                                    <div className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] font-medium leading-relaxed text-neutral-600">
                                                        {item.issues.join(' | ')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </main>
                    </div>
                </div>
            )}
        </>
    );
};
