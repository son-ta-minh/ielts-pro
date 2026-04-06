import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StudyItem, ReviewGrade, SessionType, User, LearnedStatus } from '../../app/types';
import { updateSRS, calculateMasteryScore, isSrsIgnored } from '../../utils/srs';
import { mergeTestResultsByGroup, normalizeTestResultKeys } from '../../utils/testResultUtils';
import { ReviewSessionUI } from './ReviewSession_UI';
import { getStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';

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
  // --- Learn session: persist queue for the day, only update if needed ---
  const LEARN_QUEUE_KEY = `vocab_pro_learn_queue_${user.id}`;
  const LEARN_QUEUE_DATE_KEY = `vocab_pro_learn_queue_date_${user.id}`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const [learnQueue, setLearnQueue] = useState<StudyItem[]>([]);

  useEffect(() => {
    console.log('[InlineReview][ReviewSession] mount', {
      sessionType,
      autoCloseOnFinish,
      words: initialWords.map((word) => ({ id: word.id, word: word.word }))
    });
    return () => {
      console.log('[InlineReview][ReviewSession] unmount');
    };
  }, []);

  useEffect(() => {
    if (sessionType === 'new' || sessionType === 'new_study') {
      let queueIds: string[] = [];
      let storedDate = '';
      try {
        queueIds = JSON.parse(sessionStorage.getItem(LEARN_QUEUE_KEY) || '[]');
        storedDate = sessionStorage.getItem(LEARN_QUEUE_DATE_KEY) || '';
      } catch {}

      let queue: StudyItem[] = [];
      if (storedDate === todayStr && queueIds.length > 0) {
        // Only remove words that are no longer 'New', keep order
        queue = queueIds
          .map(id => initialWords.find(w => w.id === id))
          .filter(w => w && !isSrsIgnored(w) && (!w.lastReview || w.learnedStatus !== LearnedStatus.LEARNED)) as StudyItem[];
      } else {
        // Only create a new queue if none exists for today
        const newWords = initialWords.filter(w => !isSrsIgnored(w) && (!w.lastReview || w.learnedStatus !== LearnedStatus.LEARNED));
        queue = newWords.slice(0, 20);
      }

      // If queue is less than 20, append new 'New' words not already in queue
      const alreadyInQueue = new Set(queue.map(w => w.id));
      const newWords = initialWords.filter(w => !isSrsIgnored(w) && (!w.lastReview || w.learnedStatus !== LearnedStatus.LEARNED));
      for (const w of newWords) {
        if (queue.length >= 20) break;
        if (!alreadyInQueue.has(w.id)) queue.push(w);
      }

      // Save updated queue to sessionStorage
      sessionStorage.setItem(LEARN_QUEUE_KEY, JSON.stringify(queue.map(w => w.id)));
      sessionStorage.setItem(LEARN_QUEUE_DATE_KEY, todayStr);
      setLearnQueue(queue);
    } else {
      setLearnQueue(initialWords);
    }
  }, [initialWords, sessionType]);

  const sessionWords = (sessionType === 'new' || sessionType === 'new_study') ? learnQueue : initialWords;
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
  const latestWordStatesRef = useRef<Map<string, StudyItem>>(new Map());
  
  const queueWord = sessionWords[currentIndex];
  const currentWord = queueWord
    ? (sessionUpdates.get(queueWord.id) || latestWordStatesRef.current.get(queueWord.id) || queueWord)
    : undefined;
  const isNewWord = useMemo(() => !currentWord?.lastReview, [currentWord]);

  useEffect(() => {
    console.log('[InlineReview][ReviewSession] state', {
      currentIndex,
      sessionFinished,
      isTesting,
      isQuickReviewMode,
      currentWord: currentWord?.word
    });
  }, [currentIndex, sessionFinished, isTesting, isQuickReviewMode, currentWord?.word]);

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
    if (autoCloseOnFinish && currentIndex >= sessionWords.length - 1) {
      console.log('[InlineReview][ReviewSession] handleReview -> auto close path');
      await persistInlineReviewAndClose(updated);
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
        if (autoCloseOnFinish && currentIndex >= sessionWords.length - 1) {
          console.log('[InlineReview][ReviewSession] quick review -> auto close path', {
            autoGrade,
            currentWord: updated.word
          });
          lastTestResultsRef.current = null;
          await persistInlineReviewAndClose(updated);
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
    <ReviewSessionUI
      user={user}
      initialWords={initialWords}
      sessionWords={sessionWords}
      sessionType={sessionType}
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
  );
};

export default ReviewSession;
