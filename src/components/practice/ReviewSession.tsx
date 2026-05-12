import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StudyItem, ReviewGrade, SessionType, User, LearnedStatus, ReviewMode } from '../../app/types';
import { updateSRS, calculateMasteryScore, isSrsIgnored } from '../../utils/srs';
import { mergeTestResultsByGroup, normalizeTestResultKeys } from '../../utils/testResultUtils';
import { ReviewSessionUI } from './ReviewSession_UI';
import { getStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../common/ConfirmationModal';

interface Props {
  user: User;
  sessionWords: StudyItem[];
  sessionFocus?: ReviewMode | null;
  sessionType: SessionType;
  onUpdate: (word: StudyItem) => void;
  onBulkUpdate: (words: StudyItem[]) => void;
  onComplete: () => void;
  onRetry: () => void;
  autoCloseOnFinish?: boolean;
}

const ReviewSession: React.FC<Props> = ({ user, sessionWords: initialWords, sessionFocus, sessionType, onUpdate, onBulkUpdate, onComplete, onRetry, autoCloseOnFinish = false }) => {
  const { showToast } = useToast();
  const AUTOSAVE_DELAY_MS = 1500;

  const sessionWords = initialWords;
  const sessionIdentityRef = useRef<string | null>(null);
  const [newWordIds, setNewWordIds] = useState<Set<string>>(new Set());

  const [progress, setProgress] = useState(() => {
    const saved = getStoredJSON<{current: number, max: number} | null>('vocab_pro_session_progress', null);
    if (saved && typeof saved.current === 'number' && typeof saved.max === 'number' && saved.current <= saved.max && saved.max < initialWords.length) {
      return saved;
    }
    return { current: 0, max: 0 };
  });

  const [sessionOutcomes, setSessionOutcomes] = useState<Record<string, string>>(() => getStoredJSON<Record<string, string>>('vocab_pro_session_outcomes', {}));
  const [sessionUpdates, setSessionUpdates] = useState<Map<string, StudyItem>>(new Map());
  // Store the most recent test results for the current word
  const lastTestResultsRef = useRef<Record<string, boolean> | null>(null);

  const { current: currentIndex, max: maxIndexVisited } = progress;
  const [sessionFinished, setSessionFinished] = useState(false);
  const [wordInModal, setWordInModal] = useState<StudyItem | null>(null);
  const [editingWordInModal, setEditingWordInModal] = useState<StudyItem | null>(null);
  const [isTesting, setIsTesting] = useState(sessionType === 'random_test');
  const [isQuickReviewMode, setIsQuickReviewMode] = useState(false);
  const [finishConfirmState, setFinishConfirmState] = useState<{
    isOpen: boolean;
    pendingWord: StudyItem | null;
    finalize: (() => Promise<void>) | null;
  }>({
    isOpen: false,
    pendingWord: null,
    finalize: null
  });
  const latestWordStatesRef = useRef<Map<string, StudyItem>>(new Map());
  
  const queueWord = sessionWords[currentIndex];
  const currentWord = queueWord
    ? (sessionUpdates.get(queueWord.id) || latestWordStatesRef.current.get(queueWord.id) || queueWord)
    : undefined;
  const isNewWord = useMemo(() => !currentWord?.lastReview, [currentWord]);

  useEffect(() => {
    if (sessionFinished || sessionWords.length === 0) return;
    if (currentIndex < sessionWords.length) return;

    const lastIndex = Math.max(0, sessionWords.length - 1);
    setProgress(prev => ({
      current: lastIndex,
      max: Math.min(prev.max, lastIndex)
    }));
  }, [currentIndex, sessionFinished, sessionWords.length]);

  // --- Refs for cleanup effects ---
  const sessionUpdatesRef = useRef(sessionUpdates);
  useEffect(() => { sessionUpdatesRef.current = sessionUpdates; }, [sessionUpdates]);
  const sessionFinishedRef = useRef(sessionFinished);
  useEffect(() => { sessionFinishedRef.current = sessionFinished; }, [sessionFinished]);
  const autosaveTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  
  useEffect(() => {
    const newSessionIdentity = initialWords.map(w => w.id).sort().join(',');
    if (sessionIdentityRef.current === null || sessionIdentityRef.current !== newSessionIdentity) {
        sessionIdentityRef.current = newSessionIdentity;
        setNewWordIds(new Set(initialWords.filter(w => !w.lastReview).map(w => w.id)));
        setProgress({ current: 0, max: 0 });
        setSessionOutcomes({});
        setSessionFinished(false);
        setSessionUpdates(new Map());
        latestWordStatesRef.current.clear();
        sessionStorage.removeItem('vocab_pro_session_progress');
        sessionStorage.removeItem('vocab_pro_session_outcomes');
    }
  }, [initialWords]);

  useEffect(() => { sessionStorage.setItem('vocab_pro_session_progress', JSON.stringify(progress)); }, [progress]);
  useEffect(() => { sessionStorage.setItem('vocab_pro_session_outcomes', JSON.stringify(sessionOutcomes)); }, [sessionOutcomes]);
  
  useEffect(() => {
    setWordInModal(null);
    setEditingWordInModal(null);
    setIsTesting(sessionType === 'random_test');
    setIsQuickReviewMode(false);
  }, [currentIndex, sessionType]);

  const closeFinishConfirm = useCallback(() => {
    setFinishConfirmState({
      isOpen: false,
      pendingWord: null,
      finalize: null
    });
  }, []);

  const commitSessionResults = useCallback((): Promise<void> => {
    if (isSavingRef.current) {
      return savePromiseRef.current || Promise.resolve();
    }

    const snapshot = Array.from(sessionUpdatesRef.current.values());
    if (snapshot.length === 0) {
      return Promise.resolve();
    }

    // Remove snapshot from queue before awaiting network/db write so new updates can continue queuing.
    setSessionUpdates(prev => {
      const next = new Map(prev);
      snapshot.forEach(w => next.delete(w.id));
      return next;
    });

    const wordsToUpdate = snapshot;
    if (wordsToUpdate.length === 0) return Promise.resolve();

    isSavingRef.current = true;
    const saveTask = (async () => {
      try {
        await onBulkUpdate(wordsToUpdate);
      } catch (e) {
        // Restore failed snapshot so it can be retried on next autosave/end-session.
        setSessionUpdates(prev => {
          const next = new Map(prev);
          wordsToUpdate.forEach(w => next.set(w.id, w));
          return next;
        });
        showToast('Auto-save failed, will retry.', 'error');
        console.error('commitSessionResults failed', e);
      } finally {
        isSavingRef.current = false;
        savePromiseRef.current = null;
        if (sessionUpdatesRef.current.size > 0 && !sessionFinishedRef.current) {
          if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
          }
          autosaveTimerRef.current = window.setTimeout(() => {
            autosaveTimerRef.current = null;
            commitSessionResults();
          }, AUTOSAVE_DELAY_MS);
        }
      }
    })();

    savePromiseRef.current = saveTask;
    return saveTask;
  }, [onBulkUpdate, showToast]);

  const handleOpenWordDetails = useCallback(async (word: StudyItem) => {
    const latestWord = sessionUpdatesRef.current.get(word.id) || latestWordStatesRef.current.get(word.id) || word;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    await commitSessionResults();
    setWordInModal(latestWord);
  }, [commitSessionResults]);

  const scheduleAutoSave = useCallback(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      commitSessionResults();
    }, AUTOSAVE_DELAY_MS);
  }, [commitSessionResults]);

  useEffect(() => {
    if (!sessionFinished && sessionUpdates.size > 0) {
      scheduleAutoSave();
    }
  }, [sessionUpdates, sessionFinished, scheduleAutoSave]);

  useEffect(() => {
    return () => {
        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }
        // Always flush pending updates on unmount, including when session just finished.
        if (sessionUpdatesRef.current.size > 0) {
            commitSessionResults();
        }
    };
  }, [commitSessionResults]);

  useEffect(() => {
    if (sessionFinished && sessionUpdates.size > 0) {
        commitSessionResults();
    }
  }, [sessionFinished, commitSessionResults, sessionUpdates.size]);

  const nextItem = () => {
    if (currentIndex < sessionWords.length - 1) {
      const newIndex = currentIndex + 1;
      setProgress(prev => ({ current: newIndex, max: Math.max(prev.max, newIndex) }));
    } else {
      setSessionFinished(true);
    }
  };

  const persistInlineReviewAndClose = useCallback(async (updatedWord: StudyItem) => {
    console.log('[InlineReview][ReviewSession] persistInlineReviewAndClose', {
      word: updatedWord.word,
      masteryScore: updatedWord.masteryScore,
      learnedStatus: updatedWord.learnedStatus
    });
    latestWordStatesRef.current.set(updatedWord.id, updatedWord);
    sessionUpdatesRef.current = new Map();
    setSessionUpdates(new Map());
    await onBulkUpdate([updatedWord]);
    console.log('[InlineReview][ReviewSession] persist complete -> onComplete');
    onComplete();
  }, [onBulkUpdate, onComplete]);

  const promptFinishSession = useCallback((updatedWord: StudyItem, finalize: () => Promise<void>) => {
    latestWordStatesRef.current.set(updatedWord.id, updatedWord);
    setFinishConfirmState({
      isOpen: true,
      pendingWord: updatedWord,
      finalize
    });
  }, []);

  const handleReview = async (grade: ReviewGrade) => {
    if (!currentWord) return;
    console.log('[InlineReview][ReviewSession] handleReview', {
      grade,
      currentWord: currentWord.word,
      currentIndex,
      sessionLength: sessionWords.length,
      autoCloseOnFinish
    });

    setSessionOutcomes(prev => ({...prev, [currentWord.id]: grade}));
    // Always prefer the most up-to-date lastTestResults: sessionUpdates > ref > currentWord
    let latestTestResults = undefined;
    let latestMasteryScore = undefined;
    // 1. Check if sessionUpdates already has a newer version (from practice)
    const prevUpdated = sessionUpdates.get(currentWord.id);
    if (prevUpdated && prevUpdated.lastTestResults) {
      latestTestResults = { ...prevUpdated.lastTestResults };
      latestMasteryScore = prevUpdated.masteryScore;
    } else if (lastTestResultsRef.current) {
      latestTestResults = { ...lastTestResultsRef.current };
      latestMasteryScore = calculateMasteryScore({ ...currentWord, lastTestResults: lastTestResultsRef.current });
    } else if (currentWord.lastTestResults) {
      latestTestResults = { ...currentWord.lastTestResults };
      latestMasteryScore = currentWord.masteryScore;
    }

    let updated = updateSRS(currentWord, grade);
    updated.lastReviewSessionType = sessionType;
    if (latestTestResults) {
      updated = { ...updated, lastTestResults: latestTestResults, masteryScore: latestMasteryScore };
    }
    lastTestResultsRef.current = null;
    if (currentIndex >= sessionWords.length - 1) {
      promptFinishSession(updated, async () => {
        if (autoCloseOnFinish) {
          console.log('[InlineReview][ReviewSession] handleReview -> auto close path');
          await persistInlineReviewAndClose(updated);
          return;
        }
        setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
        setSessionFinished(true);
      });
      return;
    }
    latestWordStatesRef.current.set(updated.id, updated);
    setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
    nextItem();
  };

  const handleQuickReview = () => {
    console.log('[InlineReview][ReviewSession] handleQuickReview', { currentWord: currentWord?.word });
    setIsQuickReviewMode(true);
    setIsTesting(true);
  };

  const handleManualPractice = () => {
      console.log('[InlineReview][ReviewSession] handleManualPractice', { currentWord: currentWord?.word });
      setIsQuickReviewMode(false);
      setIsTesting(true);
  };

  /**
   * Merge current and incoming test results.
   * Keep only the exact outcomes from the latest test format (no cross-format forced fail).
   */
  const applyTestResults = (word: StudyItem, results: Record<string, boolean>) => {
      const normalizedIncoming = normalizeTestResultKeys(results);
      const currentResults = mergeTestResultsByGroup(word.lastTestResults, normalizedIncoming);

      Object.entries(normalizedIncoming).forEach(([key, success]) => {
          currentResults[key] = success;
      });
      return currentResults;
  };

  const handleTestComplete = async (grade: ReviewGrade, testResults?: Record<string, boolean>, stopSession = false, counts?: { correct: number, tested: number }) => {
    console.log('[InlineReview][ReviewSession] handleTestComplete:start', {
      grade,
      stopSession,
      counts,
      isQuickReviewMode,
      autoCloseOnFinish,
      currentIndex,
      sessionLength: sessionWords.length,
      currentWord: currentWord?.word
    });
    setIsTesting(false);
    if (!currentWord) return;

    let wordWithUpdatedFlags = { ...currentWord };

    // Store testResults in ref for next handleReview
    if (testResults) {
      lastTestResultsRef.current = applyTestResults(wordWithUpdatedFlags, testResults);
    }

    if (isQuickReviewMode && counts) {
        const wrong = counts.tested - counts.correct;
        let autoGrade = ReviewGrade.FORGOT;
        if (wrong === 0) autoGrade = ReviewGrade.EASY;
        else if (wrong === 1) autoGrade = ReviewGrade.HARD;

        setSessionOutcomes(prev => ({...prev, [currentWord.id]: autoGrade}));
        
        const updated = updateSRS(wordWithUpdatedFlags, autoGrade);
        updated.lastReviewSessionType = sessionType;

        if (testResults) {
            updated.lastTestResults = lastTestResultsRef.current;
        }
        updated.masteryScore = calculateMasteryScore(updated);
        latestWordStatesRef.current.set(updated.id, updated);

        setIsQuickReviewMode(false);
        if (currentIndex >= sessionWords.length - 1) {
          lastTestResultsRef.current = null;
          promptFinishSession(updated, async () => {
            if (autoCloseOnFinish) {
              console.log('[InlineReview][ReviewSession] quick review -> auto close path', {
                autoGrade,
                currentWord: updated.word
              });
              await persistInlineReviewAndClose(updated);
              return;
            }
            setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
            setSessionFinished(true);
          });
          return;
        }
        setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
        nextItem();
        lastTestResultsRef.current = null;
        return;
    }

    if (sessionType === 'random_test') {
      let outcomeStatus: string = stopSession ? 'GAVE_UP' : (grade === ReviewGrade.EASY ? 'PASS' : 'FAIL');
      setSessionOutcomes(prev => ({...prev, [currentWord.id]: outcomeStatus}));

      const updated = updateSRS(wordWithUpdatedFlags, grade);
      updated.lastReviewSessionType = sessionType;

      if (testResults) {
          updated.lastTestResults = lastTestResultsRef.current;
      }
      updated.masteryScore = calculateMasteryScore(updated);
      latestWordStatesRef.current.set(updated.id, updated);
      
      setSessionUpdates(prev => new Map(prev).set(updated.id, updated));

      if (stopSession) {
        setSessionFinished(true);
      } else {
        nextItem();
      }
      lastTestResultsRef.current = null;
    } else {
      // Learn session: do NOT auto-next after practice, just update state and wait for user action
      const updated: StudyItem = { ...wordWithUpdatedFlags };
      if (testResults) {
        updated.lastTestResults = lastTestResultsRef.current;
      }
      updated.masteryScore = calculateMasteryScore(updated);
      latestWordStatesRef.current.set(updated.id, updated);
      setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
      // Do NOT call nextItem();
      lastTestResultsRef.current = null;
    }
  };
  
  const handleRetry = () => {
    sessionIdentityRef.current = null;
    onRetry();
  }

  const handleEndSession = () => {
    setSessionFinished(true);
  };

  const handleUpdateWordFromModal = useCallback((updatedWord: StudyItem) => {
    // Persist to global store first.
    onUpdate(updatedWord);

    // Keep review session state in sync with the latest edited data.
    latestWordStatesRef.current.set(updatedWord.id, updatedWord);
    setSessionUpdates(prev => new Map(prev).set(updatedWord.id, updatedWord));
  }, [onUpdate]);

  const handleCompleteWithFlush = useCallback(async () => {
    await commitSessionResults();
    onComplete();
  }, [commitSessionResults, onComplete]);

  useEffect(() => {
    if (!sessionFinished || !autoCloseOnFinish) return;
    console.log('[InlineReview][ReviewSession] sessionFinished effect -> handleCompleteWithFlush');
    void handleCompleteWithFlush();
  }, [sessionFinished, autoCloseOnFinish, handleCompleteWithFlush]);

  if (sessionFinished && autoCloseOnFinish) {
    console.log('[InlineReview][ReviewSession] returning null because sessionFinished && autoCloseOnFinish');
    return null;
  }
  
  return (
    <>
      <ReviewSessionUI
        user={user}
        initialWords={initialWords}
        sessionWords={sessionWords}
      sessionType={sessionType}
      sessionFocus={sessionFocus || ReviewMode.PHONETIC}
      newWordIds={newWordIds}
        progress={progress}
        setProgress={setProgress}
        sessionOutcomes={sessionOutcomes}
        sessionFinished={sessionFinished}
        wordInModal={wordInModal}
        setWordInModal={setWordInModal}
        onOpenWordDetails={handleOpenWordDetails}
        editingWordInModal={editingWordInModal}
        setEditingWordInModal={setEditingWordInModal}
        isTesting={isTesting}
        setIsTesting={setIsTesting}
        currentWord={currentWord}
        isNewWord={isNewWord}
        onUpdate={handleUpdateWordFromModal}
        onComplete={() => { void handleCompleteWithFlush(); }}
        nextItem={nextItem}
        handleReview={handleReview}
        handleTestComplete={handleTestComplete}
        handleRetry={handleRetry}
        handleEndSession={handleEndSession}
        handleQuickReview={handleQuickReview}
        handleManualPractice={handleManualPractice}
        isQuickReviewMode={isQuickReviewMode}
        autoCloseOnFinish={autoCloseOnFinish}
      />
      <ConfirmationModal
        isOpen={finishConfirmState.isOpen}
        title="Finish Session?"
        message="All words have been reviewed. Finish this session?"
        confirmText="Finish Session"
        isProcessing={false}
        confirmButtonClass="bg-neutral-900 text-white hover:bg-neutral-800 shadow-neutral-200"
        onClose={() => {
          if (finishConfirmState.pendingWord) {
            latestWordStatesRef.current.set(finishConfirmState.pendingWord.id, finishConfirmState.pendingWord);
            setSessionUpdates(prev => new Map(prev).set(finishConfirmState.pendingWord!.id, finishConfirmState.pendingWord!));
          }
          closeFinishConfirm();
        }}
        onConfirm={async () => {
          const finalize = finishConfirmState.finalize;
          closeFinishConfirm();
          if (finalize) {
            await finalize();
          }
        }}
      />
    </>
  );
};

export default ReviewSession;
