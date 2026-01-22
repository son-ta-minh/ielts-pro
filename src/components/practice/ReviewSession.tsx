
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { VocabularyItem, ReviewGrade, ReviewMode, SessionType, User } from '../../app/types';
import { updateSRS, calculateMasteryScore } from '../../utils/srs';
import { ReviewSessionUI } from './ReviewSession_UI';
import { getStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  user: User;
  sessionWords: VocabularyItem[];
  sessionFocus?: ReviewMode | null;
  sessionType: SessionType;
  onUpdate: (word: VocabularyItem) => void;
  onBulkUpdate: (words: VocabularyItem[]) => void;
  onComplete: () => void;
  onRetry: () => void;
}

export const logSrsUpdate = (grade: ReviewGrade, before: VocabularyItem, after: VocabularyItem) => {
    console.group(`[SRS DEBUG] Grading "${before.word}" as ${grade}`);
    console.log('Word BEFORE update:', {
        interval: before.interval,
        consecutiveCorrect: before.consecutiveCorrect,
        nextReview: new Date(before.nextReview).toLocaleString(),
        lastGrade: before.lastGrade,
    });
    console.log('Word AFTER update:', {
        interval: after.interval,
        consecutiveCorrect: after.consecutiveCorrect,
        nextReview: new Date(after.nextReview).toLocaleString(),
        lastGrade: after.lastGrade,
    });
    console.groupEnd();
};

const ReviewSession: React.FC<Props> = ({ user, sessionWords: initialWords, sessionFocus, sessionType, onUpdate, onBulkUpdate, onComplete, onRetry }) => {
  const { showToast } = useToast();
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
  const [sessionUpdates, setSessionUpdates] = useState<Map<string, VocabularyItem>>(new Map());

  const { current: currentIndex, max: maxIndexVisited } = progress;
  const [sessionFinished, setSessionFinished] = useState(false);
  const [wordInModal, setWordInModal] = useState<VocabularyItem | null>(null);
  const [editingWordInModal, setEditingWordInModal] = useState<VocabularyItem | null>(null);
  const [isTesting, setIsTesting] = useState(sessionType === 'random_test');
  const [isQuickReviewMode, setIsQuickReviewMode] = useState(false);
  
  const currentWord = sessionWords[currentIndex];
  const isNewWord = useMemo(() => !currentWord?.lastReview, [currentWord]);

  // --- Refs for cleanup effects ---
  const sessionUpdatesRef = useRef(sessionUpdates);
  useEffect(() => { sessionUpdatesRef.current = sessionUpdates; }, [sessionUpdates]);
  const sessionFinishedRef = useRef(sessionFinished);
  useEffect(() => { sessionFinishedRef.current = sessionFinished; }, [sessionFinished]);
  
  useEffect(() => {
    const newSessionIdentity = initialWords.map(w => w.id).sort().join(',');
    if (sessionIdentityRef.current === null || sessionIdentityRef.current !== newSessionIdentity) {
        sessionIdentityRef.current = newSessionIdentity;
        setNewWordIds(new Set(initialWords.filter(w => !w.lastReview).map(w => w.id)));
        setProgress({ current: 0, max: 0 });
        setSessionOutcomes({});
        setSessionFinished(false);
        setSessionUpdates(new Map());
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

  const commitSessionResults = useCallback(async () => {
    const wordsToUpdate = Array.from(sessionUpdatesRef.current.values());
    if (wordsToUpdate.length === 0) return;

    await onBulkUpdate(wordsToUpdate);
    setSessionUpdates(new Map());
  }, [onBulkUpdate]);

  useEffect(() => {
    return () => {
        if (!sessionFinishedRef.current && sessionUpdatesRef.current.size > 0) {
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

  const handleReview = async (grade: ReviewGrade) => {
    if (!currentWord) return;
    
    setSessionOutcomes(prev => ({...prev, [currentWord.id]: grade}));
    const updated = updateSRS(currentWord, grade);
    logSrsUpdate(grade, currentWord, updated);

    setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
    
    nextItem();
  };

  const handleQuickReview = () => {
    setIsQuickReviewMode(true);
    setIsTesting(true);
  };

  const handleManualPractice = () => {
      setIsQuickReviewMode(false);
      setIsTesting(true);
  };

  const handleTestComplete = async (grade: ReviewGrade, testResults?: Record<string, boolean>, stopSession = false, counts?: { correct: number, tested: number }) => {
    setIsTesting(false);
    if (!currentWord) return;

    let wordWithUpdatedFlags = { ...currentWord };
    if (testResults) {
        const pronunciationTestFailed = testResults['PRONUNCIATION'] === false;
        const ipaTestFailed = testResults['IPA_QUIZ'] === false;

        if ((pronunciationTestFailed || ipaTestFailed) && !wordWithUpdatedFlags.needsPronunciationFocus) {
            wordWithUpdatedFlags.needsPronunciationFocus = true;
            showToast(`"${wordWithUpdatedFlags.word}" marked for pronunciation focus.`, 'info');
        }
    }

    if (isQuickReviewMode && counts) {
        const wrong = counts.tested - counts.correct;
        let autoGrade = ReviewGrade.FORGOT;
        if (wrong === 0) autoGrade = ReviewGrade.EASY;
        else if (wrong === 1) autoGrade = ReviewGrade.HARD;

        setSessionOutcomes(prev => ({...prev, [currentWord.id]: autoGrade}));
        
        const updated = updateSRS(wordWithUpdatedFlags, autoGrade);
        logSrsUpdate(autoGrade, currentWord, updated);

        if (testResults) updated.lastTestResults = { ...(updated.lastTestResults || {}), ...testResults };
        updated.masteryScore = calculateMasteryScore(updated);

        setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
        
        setIsQuickReviewMode(false);
        nextItem();
        return;
    }

    if (sessionType === 'random_test') {
      let outcomeStatus: string = stopSession ? 'GAVE_UP' : (grade === ReviewGrade.EASY ? 'PASS' : 'FAIL');
      setSessionOutcomes(prev => ({...prev, [currentWord.id]: outcomeStatus}));

      const updated = updateSRS(wordWithUpdatedFlags, grade);
      logSrsUpdate(grade, currentWord, updated);

      if (testResults) updated.lastTestResults = { ...(updated.lastTestResults || {}), ...testResults };
      updated.masteryScore = calculateMasteryScore(updated);
      
      setSessionUpdates(prev => new Map(prev).set(updated.id, updated));

      if (stopSession) {
        setSessionFinished(true);
      } else {
        nextItem();
      }
    } else {
      const updated: VocabularyItem = { ...wordWithUpdatedFlags };
      if (testResults) {
        updated.lastTestResults = { ...(updated.lastTestResults || {}), ...testResults };
      }
      updated.masteryScore = calculateMasteryScore(updated);
      await onUpdate(updated);
    }
  };
  
  const handleRetry = () => {
    sessionIdentityRef.current = null;
    onRetry();
  }

  const handleEndSession = () => {
    setSessionFinished(true);
  };
  
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
      editingWordInModal={editingWordInModal}
      setEditingWordInModal={setEditingWordInModal}
      isTesting={isTesting}
      setIsTesting={setIsTesting}
      currentWord={currentWord}
      isNewWord={isNewWord}
      onUpdate={onUpdate}
      onComplete={onComplete}
      nextItem={nextItem}
      handleReview={handleReview}
      handleTestComplete={handleTestComplete}
      handleRetry={handleRetry}
      handleEndSession={handleEndSession}
      handleQuickReview={handleQuickReview}
      handleManualPractice={handleManualPractice}
      isQuickReviewMode={isQuickReviewMode}
    />
  );
};

export default ReviewSession;
