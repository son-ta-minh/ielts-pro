import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { CheckCircle2, Loader2, Wand2, X } from 'lucide-react';
import { User, StudyItem, StudyItemQuality, StudyLibraryType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { runWordRefineWithRetry, WordRefineProgressSnapshot } from '../../services/wordRefineApi';
import { applyAiRefinementResultsToWords } from '../../services/wordRefinePersistence';

const AUTO_REFINE_STORAGE_KEY = 'vocab_pro_auto_refine_state_v1';

type AutoRefineStatus = 'idle' | 'running' | 'completed';

interface AutoRefineState {
    status: AutoRefineStatus;
    userId: string | null;
    libraryType: StudyLibraryType;
    startedAt: number | null;
    totalWords: number;
    completedCount: number;
    successCount: number;
    failedCount: number;
    pendingWordIds: string[];
    currentWordId: string | null;
    currentWordText: string | null;
    progress: WordRefineProgressSnapshot | null;
}

interface AutoRefineContextValue {
    state: AutoRefineState;
    startAutoRefine: (libraryType?: StudyLibraryType) => Promise<void>;
    stopAutoRefine: () => void;
}

const DEFAULT_AUTO_REFINE_STATE: AutoRefineState = {
    status: 'idle',
    userId: null,
    libraryType: 'vocab',
    startedAt: null,
    totalWords: 0,
    completedCount: 0,
    successCount: 0,
    failedCount: 0,
    pendingWordIds: [],
    currentWordId: null,
    currentWordText: null,
    progress: null
};

const AutoRefineContext = createContext<AutoRefineContextValue>({
    state: DEFAULT_AUTO_REFINE_STATE,
    startAutoRefine: async () => undefined,
    stopAutoRefine: () => undefined
});

const compactRefineSnapshotForHistory = (snapshot: WordRefineProgressSnapshot): WordRefineProgressSnapshot => ({
    ...snapshot,
    rawText: undefined,
    issues: Array.isArray(snapshot.issues)
        ? snapshot.issues.slice(0, 3).map((issue) => String(issue).slice(0, 240))
        : undefined
});

const loadPersistedAutoRefineState = (): AutoRefineState => {
    try {
        const raw = window.localStorage.getItem(AUTO_REFINE_STORAGE_KEY);
        if (!raw) return DEFAULT_AUTO_REFINE_STATE;
        const parsed = JSON.parse(raw);
        const nextState: AutoRefineState = {
            ...DEFAULT_AUTO_REFINE_STATE,
            ...parsed,
            pendingWordIds: Array.isArray(parsed?.pendingWordIds) ? parsed.pendingWordIds : []
        };
        if (nextState.status === 'running') {
            return {
                ...DEFAULT_AUTO_REFINE_STATE,
                status: 'completed',
                userId: nextState.userId,
                libraryType: nextState.libraryType || 'vocab',
                startedAt: nextState.startedAt,
                totalWords: nextState.totalWords,
                completedCount: nextState.completedCount,
                successCount: nextState.successCount,
                failedCount: nextState.failedCount,
                progress: {
                    stage: 'aborted',
                    attempt: 1,
                    maxAttempts: 1,
                    message: 'Auto Refine was stopped because the page reloaded.'
                }
            };
        }
        return nextState;
    } catch {
        return DEFAULT_AUTO_REFINE_STATE;
    }
};

const getWordById = (wordId: string, userId: string): StudyItem | null => {
    return dataStore.getAllWords().find((word) => word.id === wordId && word.userId === userId) || null;
};

const getWordLabel = (wordId: string | null, userId: string | null): string | null => {
    if (!wordId || !userId) return null;
    return getWordById(wordId, userId)?.word || null;
};

const hasUserWordsHydrated = (userId: string | null): boolean => {
    if (!userId) return false;
    return dataStore.getAllWords().some((word) => word.userId === userId);
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
    const persistTimeoutRef = useRef<number | null>(null);

    const updateState = useCallback((updater: React.SetStateAction<AutoRefineState>) => {
        setState((current) => {
            const next = typeof updater === 'function'
                ? (updater as (prev: AutoRefineState) => AutoRefineState)(current)
                : updater;
            stateRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (persistTimeoutRef.current) {
            window.clearTimeout(persistTimeoutRef.current);
        }
        persistTimeoutRef.current = window.setTimeout(() => {
            const persistedState = {
                ...state,
                progress: state.progress
                    ? {
                        stage: state.progress.stage,
                        attempt: state.progress.attempt,
                        maxAttempts: state.progress.maxAttempts,
                        message: state.progress.message,
                        issues: state.progress.issues
                    }
                    : null
            };
            window.localStorage.setItem(AUTO_REFINE_STORAGE_KEY, JSON.stringify(persistedState));
        }, 250);
        return () => {
            if (persistTimeoutRef.current) {
                window.clearTimeout(persistTimeoutRef.current);
                persistTimeoutRef.current = null;
            }
        };
    }, [state]);

    const setProgressSnapshot = useCallback((snapshot: WordRefineProgressSnapshot) => {
        const compact = compactRefineSnapshotForHistory(snapshot);
        updateState((current) => ({
            ...current,
            progress: compact
        }));
    }, [updateState]);

    const markWordProcessed = useCallback((wordId: string, wordText: string, options: {
        success: boolean;
        progress?: WordRefineProgressSnapshot | null;
    }) => {
        updateState((current) => {
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
    }, [updateState]);

    const processQueue = useCallback(async () => {
        if (!currentUser) return;
        if (processingRef.current) return;
        if (stateRef.current.status !== 'running') return;
        if (stateRef.current.userId !== currentUser.id) return;
        if (stateRef.current.pendingWordIds.length > 0 && !hasUserWordsHydrated(currentUser.id)) return;

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

                updateState((current) => ({
                    ...current,
                    currentWordId: wordId,
                    currentWordText: fallbackWordLabel
                }));

                if (!liveWord || liveWord.quality !== StudyItemQuality.RAW || !!liveWord.isPassive) {
                    markWordProcessed(wordId, fallbackWordLabel, { success: true });
                    showToast(`Auto Refine skipped "${fallbackWordLabel}" because it is no longer an active RAW word.`, 'info', 2500);
                    continue;
                }
                if ((liveWord.libraryType || 'vocab') !== stateRef.current.libraryType) {
                    markWordProcessed(wordId, fallbackWordLabel, { success: true });
                    showToast(`Auto Refine skipped "${fallbackWordLabel}" because it belongs to another library.`, 'info', 2500);
                    continue;
                }

                let wordSaved = false;
                let partialSave = false;

                try {
                    const { finalIssues } = await runWordRefineWithRetry(
                        [liveWord],
                        currentUser.nativeLanguage || 'Vietnamese',
                        {
                            onProgress: () => {},
                            onWordValidated: async ({ word, results, partial, issues }) => {
                                await applyAiRefinementResultsToWords(results, [word]);
                                wordSaved = true;
                                partialSave = !!partial;
                            }
                        }
                    );

                    if (wordSaved) {
                        markWordProcessed(wordId, liveWord.word, { success: true });
                        setProgressSnapshot({
                            stage: partialSave ? 'error' : 'success',
                            attempt: 1,
                            maxAttempts: 1,
                            message: partialSave
                                ? `"${liveWord.word}" saved partially.`
                                : `"${liveWord.word}" refined successfully.`
                        });
                        showToast(
                            partialSave
                                ? `Auto Refine saved "${liveWord.word}" with partial fields.`
                                : `Auto Refine refined "${liveWord.word}".`,
                            partialSave ? 'info' : 'success',
                            2600
                        );
                    } else {
                        markWordProcessed(wordId, liveWord.word, { success: false });
                        setProgressSnapshot({
                            stage: 'error',
                            attempt: 1,
                            maxAttempts: 1,
                            message: `Auto Refine could not save "${liveWord.word}".`
                        });
                        showToast(`Auto Refine could not refine "${liveWord.word}".`, 'error', 3200);
                    }
                } catch (error) {
                    markWordProcessed(wordId, liveWord.word, { success: false });
                    setProgressSnapshot({
                        stage: 'error',
                        attempt: 1,
                        maxAttempts: 1,
                        message: `Auto Refine failed on "${liveWord.word}".`
                    });
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
                setProgressSnapshot(summarySnapshot);
                showToast(
                    `Auto Refine completed: ${stateRef.current.successCount}/${stateRef.current.totalWords} word(s) saved.`,
                    'success',
                    3500
                );
            }
        } finally {
            processingRef.current = false;
        }
    }, [currentUser, markWordProcessed, setProgressSnapshot, showToast, updateState]);

    useEffect(() => {
        if (!currentUser) return;
        if (state.status === 'running' && state.userId === currentUser.id) {
            processQueue();
        }
    }, [currentUser, processQueue, state.status, state.userId]);

    useEffect(() => {
        if (!currentUser) return;
        if (state.status !== 'running' || state.userId !== currentUser.id) return;

        const handleDataUpdate = () => {
            if (!processingRef.current && hasUserWordsHydrated(currentUser.id)) {
                processQueue();
            }
        };

        window.addEventListener('datastore-updated', handleDataUpdate);
        return () => window.removeEventListener('datastore-updated', handleDataUpdate);
    }, [currentUser, processQueue, state.status, state.userId]);

    const startAutoRefine = useCallback(async (libraryType: StudyLibraryType = 'vocab') => {
        if (!currentUser) return;
        if (stateRef.current.status === 'running' && stateRef.current.userId === currentUser.id) {
            return;
        }

        const rawWords = dataStore.getAllWords()
            .filter((word) =>
                word.userId === currentUser.id &&
                (word.libraryType || 'vocab') === libraryType &&
                word.quality === StudyItemQuality.RAW &&
                !word.isPassive
            );

        if (rawWords.length === 0) {
            showToast(`No RAW words found for ${libraryType === 'kotoba' ? 'Kotoba' : 'Word Library'} Auto Refine.`, 'info');
            return;
        }

        const startingSnapshot: WordRefineProgressSnapshot = {
            stage: 'starting',
            attempt: 0,
            maxAttempts: 1,
            message: `Auto Refine queued ${rawWords.length} RAW word(s).`
        };

        updateState({
            status: 'running',
            userId: currentUser.id,
            libraryType,
            startedAt: Date.now(),
            totalWords: rawWords.length,
            completedCount: 0,
            successCount: 0,
            failedCount: 0,
            pendingWordIds: rawWords.map((word) => word.id),
            currentWordId: null,
            currentWordText: null,
            progress: startingSnapshot
        });
        showToast(`Auto Refine started for ${rawWords.length} RAW word(s) in ${libraryType === 'kotoba' ? 'Kotoba' : 'Word Library'}.`, 'info', 2600);
    }, [currentUser, showToast, updateState]);

    const stopAutoRefine = useCallback(() => {
        if (stateRef.current.status !== 'running') return;
        const completedSnapshot: WordRefineProgressSnapshot = {
            stage: 'aborted',
            attempt: 1,
            maxAttempts: 1,
            message: `Auto Refine stopped after ${stateRef.current.completedCount}/${stateRef.current.totalWords} word(s).`
        };
        updateState((current) => ({
            ...current,
            status: 'completed',
            currentWordId: null,
            currentWordText: null,
            progress: completedSnapshot
        }));
        showToast('Auto Refine stopped.', 'info', 2200);
    }, [showToast, updateState]);

    const contextValue = useMemo<AutoRefineContextValue>(() => ({
        state,
        startAutoRefine,
        stopAutoRefine
    }), [startAutoRefine, state, stopAutoRefine]);

    return (
        <AutoRefineContext.Provider value={contextValue}>
            {children}
        </AutoRefineContext.Provider>
    );
};

const useAutoRefine = () => useContext(AutoRefineContext);

export const AutoRefineDashboardControl: React.FC<{
    libraryType?: StudyLibraryType;
    rawCount?: number;
}> = ({ libraryType = 'vocab', rawCount }) => {
    const { state, startAutoRefine, stopAutoRefine } = useAutoRefine();
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const isRunning = state.status === 'running' && state.libraryType === libraryType;
    const hasProgress = state.totalWords > 0 && state.libraryType === libraryType;
    const progressPercent = state.totalWords > 0
        ? Math.min(100, Math.round((state.completedCount / state.totalWords) * 100))
        : 0;

    const handlePrimaryClick = async () => {
        if (isRunning) {
            setIsPanelOpen((current) => !current);
            return;
        }
        await startAutoRefine(libraryType);
        setIsPanelOpen(true);
    };

    return (
        <>
            <div className="relative">
                <button
                    onClick={handlePrimaryClick}
                    disabled={!rawCount || rawCount <= 0}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest shadow-sm transition-all ${
                        (!rawCount || rawCount <= 0)
                            ? 'border-neutral-100 bg-neutral-100 text-neutral-400 cursor-not-allowed'
                            : isRunning
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                >
                    {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    <span>{isRunning ? 'Auto Refine Running' : `Auto Refine ${rawCount || 0} words`}</span>
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
                            <div />
                            {isRunning && (
                                <button
                                    onClick={stopAutoRefine}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-700 hover:bg-rose-100"
                                >
                                    <X size={12} />
                                    <span>Stop AutoRefine</span>
                                </button>
                            )}
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
        </>
    );
};
