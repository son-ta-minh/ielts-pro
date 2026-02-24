import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { VocabularyItem, ReviewGrade, SessionType, User } from '../../app/types';
import { updateSRS, calculateMasteryScore, getLogicalKnowledgeUnits } from '../../utils/srs';
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
  // Store the most recent test results for the current word
  const lastTestResultsRef = useRef<Record<string, boolean> | null>(null);

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
    if (latestTestResults) {
      updated = { ...updated, lastTestResults: latestTestResults, masteryScore: latestMasteryScore };
    }
    setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
    lastTestResultsRef.current = null;
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

  /**
   * Helper to merge test results. 
   * CRITICAL: If a specific test key failed, we invalidate ALL keys related to that knowledge unit 
   * to ensure the Mastery Score drops immediately.
   */
  const applyTestResults = (word: VocabularyItem, results: Record<string, boolean>) => {
      const currentResults = { ...(word.lastTestResults || {}) };
      // Get logical units (e.g., 'colloc:heavy rain' maps to ['COLLOCATION_QUIZ...', 'COLLOCATION_MULTI...'])
      const knowledgeUnits = getLogicalKnowledgeUnits(word);

      Object.entries(results).forEach(([key, success]) => {
          // Always update the specific key outcome
          currentResults[key] = success;

          if (success === false) {
              // If failed, find the unit this key belongs to
              const unit = knowledgeUnits.find(u => u.testKeys.includes(key));
              if (unit) {
                  // Invalidate ALL keys for that unit. 
                  // This ensures that failing a "Fill" test overrides a previous "Multiple Choice" pass.
                  unit.testKeys.forEach(relatedKey => {
                      currentResults[relatedKey] = false;
                  });
              }
          }
      });
      return currentResults;
  };

  const handleTestComplete = async (grade: ReviewGrade, testResults?: Record<string, boolean>, stopSession = false, counts?: { correct: number, tested: number }) => {
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

        if (testResults) {
            updated.lastTestResults = lastTestResultsRef.current;
        }
        updated.masteryScore = calculateMasteryScore(updated);

        setSessionUpdates(prev => new Map(prev).set(updated.id, updated));
        
        setIsQuickReviewMode(false);
        nextItem();
        lastTestResultsRef.current = null;
        return;
    }

    if (sessionType === 'random_test') {
      let outcomeStatus: string = stopSession ? 'GAVE_UP' : (grade === ReviewGrade.EASY ? 'PASS' : 'FAIL');
      setSessionOutcomes(prev => ({...prev, [currentWord.id]: outcomeStatus}));

      const updated = updateSRS(wordWithUpdatedFlags, grade);

      if (testResults) {
          updated.lastTestResults = lastTestResultsRef.current;
      }
      updated.masteryScore = calculateMasteryScore(updated);
      
      setSessionUpdates(prev => new Map(prev).set(updated.id, updated));

      if (stopSession) {
        setSessionFinished(true);
      } else {
        nextItem();
      }
      lastTestResultsRef.current = null;
    } else {
      // Learn session: do NOT auto-next after practice, just update state and wait for user action
      const updated: VocabularyItem = { ...wordWithUpdatedFlags };
      if (testResults) {
        updated.lastTestResults = lastTestResultsRef.current;
      }
      updated.masteryScore = calculateMasteryScore(updated);
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