import React, { useState, useEffect, useMemo, useRef } from 'react';
import { VocabularyItem, ReviewGrade, ReviewMode, SessionType } from '../../app/types';
import { updateSRS } from '../../utils/srs';
import { calculateWordDifficultyXp } from '../../app/useAppController'; // Import directly
import { ReviewSessionUI } from './ReviewSession_UI';
import { getStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  sessionWords: VocabularyItem[];
  sessionFocus?: ReviewMode | null;
  sessionType: SessionType;
  onUpdate: (word: VocabularyItem) => void;
  onComplete: () => void;
  onContinueNewStudy?: () => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => Promise<number>; // New prop
  onRetry: () => void;
}

const ReviewSession: React.FC<Props> = ({ sessionWords: initialWords, sessionFocus, sessionType, onUpdate, onComplete, onContinueNewStudy, onGainXp, onRetry }) => {
  const { showToast } = useToast();
  const sessionWords = initialWords;
  const sessionIdentityRef = useRef<string | null>(null);
  const newWordIds = useMemo(() => new Set(initialWords.filter(w => !w.lastReview).map(w => w.id)), [initialWords]);

  const [progress, setProgress] = useState(() => {
    const saved = getStoredJSON<{current: number, max: number} | null>('vocab_pro_session_progress', null);
    if (saved && typeof saved.current === 'number' && typeof saved.max === 'number' && saved.current <= saved.max && saved.max < initialWords.length) {
      return saved;
    }
    return { current: 0, max: 0 };
  });

  const [sessionOutcomes, setSessionOutcomes] = useState<Record<string, string>>(() => getStoredJSON<Record<string, string>>('vocab_pro_session_outcomes', {}));

  const { current: currentIndex, max: maxIndexVisited } = progress;
  const [sessionFinished, setSessionFinished] = useState(false);
  const [wordInModal, setWordInModal] = useState<VocabularyItem | null>(null);
  const [editingWordInModal, setEditingWordInModal] = useState<VocabularyItem | null>(null);
  const [isTesting, setIsTesting] = useState(sessionType === 'random_test');
  
  const currentWord = sessionWords[currentIndex];
  const isNewWord = useMemo(() => !currentWord?.lastReview, [currentWord]);
  
  useEffect(() => {
    const newSessionIdentity = initialWords.map(w => w.id).sort().join(',');
    if (sessionIdentityRef.current === null || sessionIdentityRef.current !== newSessionIdentity) {
        sessionIdentityRef.current = newSessionIdentity;
        setProgress({ current: 0, max: 0 });
        setSessionOutcomes({});
        setSessionFinished(false);
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
  }, [currentIndex, sessionType]);

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
    const baseWordXp = calculateWordDifficultyXp(currentWord);
    await onGainXp(baseWordXp, updated, grade);
    nextItem();
  };
  
  const handleMisSpeak = async () => {
    if (!currentWord) return;

    showToast(`"${currentWord.word}" marked for pronunciation focus.`, 'info');

    if (isNewWord) {
        // LEARN session behavior: just flag and stay.
        const flaggedWord = { ...currentWord, needsPronunciationFocus: true };
        onUpdate(flaggedWord);
    } else {
        // REVIEW session behavior: flag AND treat it as a "Forgot" grade.
        setSessionOutcomes(prev => ({...prev, [currentWord.id]: ReviewGrade.FORGOT}));
        
        const flaggedWord = { ...currentWord, needsPronunciationFocus: true };
        const updated = updateSRS(flaggedWord, ReviewGrade.FORGOT);
        
        const baseWordXp = calculateWordDifficultyXp(currentWord);
        await onGainXp(baseWordXp, updated, ReviewGrade.FORGOT);
        
        nextItem();
    }
  };

  const handleTestComplete = async (grade: ReviewGrade, testResults?: Record<string, boolean>, stopSession = false) => {
    setIsTesting(false);
    if (!currentWord) return;
    
    // If testing a new word, don't advance the session or update SRS. Just save test results and return to the card.
    if (isNewWord) {
        const updatedWithResults = { ...currentWord, lastTestResults: { ...(currentWord.lastTestResults || {}), ...testResults } };
        onUpdate(updatedWithResults);
        showToast(grade === ReviewGrade.EASY ? 'Correct!' : 'Incorrect, try again!', grade === ReviewGrade.EASY ? 'success' : 'error');
        return; 
    }

    let outcomeStatus: string = grade;
    if (sessionType === 'random_test') {
        outcomeStatus = stopSession ? 'GAVE_UP' : (grade === ReviewGrade.EASY ? 'PASS' : 'FAIL');
    }

    setSessionOutcomes(prev => ({...prev, [currentWord.id]: outcomeStatus}));
    const updated = updateSRS(currentWord, grade);
    if (testResults) updated.lastTestResults = { ...(updated.lastTestResults || {}), ...testResults };
    
    const baseWordXp = calculateWordDifficultyXp(currentWord);
    await onGainXp(baseWordXp, updated, grade);

    if (stopSession) setSessionFinished(true);
    else nextItem();
  };
  
  const handleRetry = () => {
    sessionIdentityRef.current = null;
    onRetry();
  }
  
  return (
    <ReviewSessionUI
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
      handleMisSpeak={handleMisSpeak}
      handleTestComplete={handleTestComplete}
      handleRetry={handleRetry}
      onGainXp={onGainXp}
    />
  );
};

export default ReviewSession;