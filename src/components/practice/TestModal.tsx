import React, { useState, useMemo, useEffect } from 'react';
import { VocabularyItem, ReviewGrade } from '../../app/types';
import { TestModalUI } from './TestModal_UI';
import { Challenge, ChallengeResult, ChallengeType, CollocationQuizChallenge, IdiomQuizChallenge } from './TestModalTypes';
import { generateAvailableChallenges, prepareChallenges, gradeChallenge } from '../../utils/challengeUtils';

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onComplete: (grade: ReviewGrade, results?: Record<string, boolean>, stopSession?: boolean, counts?: { correct: number, tested: number }) => void;
  isQuickFire?: boolean;
  isModal?: boolean;
  sessionPosition?: { current: number, total: number };
  onPrevWord?: () => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number; tested: number; }) => Promise<number>;
}

const TestModal: React.FC<Props> = ({ word, onClose, onComplete, isQuickFire = false, isModal = true, sessionPosition, onPrevWord }) => {
  const [isSetupMode, setIsSetupMode] = useState(!isQuickFire);
  const [selectedChallengeTypes, setSelectedChallengeTypes] = useState<Set<ChallengeType>>(new Set());
  const [isPreparing, setIsPreparing] = useState(false);
  
  const [activeChallenges, setActiveChallenges] = useState<Challenge[]>([]);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<any[]>([]);
  const [results, setResults] = useState<(ChallengeResult | null)[] | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  
  const [ignoredIndices, setIgnoredIndices] = useState<Set<number>>(new Set());
  const [showHint, setShowHint] = useState(false);

  const availableChallenges = useMemo(() => generateAvailableChallenges(word), [word]);

  useEffect(() => {
    if (isQuickFire && availableChallenges.length > 0) {
        const prepareQuickFire = async () => {
            setIsPreparing(true);
            const randomTask = availableChallenges[Math.floor(Math.random() * availableChallenges.length)];
            const finalChallenges = await prepareChallenges([randomTask], word);
            
            setActiveChallenges(finalChallenges);
            setUserAnswers(new Array(finalChallenges.length).fill(undefined));
            setIsSetupMode(false);
            setIsPreparing(false);
        };
        prepareQuickFire();
    }
  }, [isQuickFire, availableChallenges, word]);

  useEffect(() => {
      if (isQuickFire || availableChallenges.length === 0) return;
      const history = word.lastTestResults || {};
      const hasHistory = Object.keys(history).length > 0;
      const nextSelection = new Set<ChallengeType>();

      if (!hasHistory) {
          availableChallenges.forEach(c => nextSelection.add(c.type));
      } else {
          availableChallenges.forEach(c => {
              if (c.type === 'WORD_FAMILY' && (Object.keys(history).some(k => k.startsWith('WORD_FAMILY') && history[k] === false) || history['WORD_FAMILY'] === false)) nextSelection.add(c.type);
              else if (c.type === 'PARAPHRASE_QUIZ' && (history[`PARAPHRASE_QUIZ:${c.answer}`] === false || history['PARAPHRASE_QUIZ'] === false)) nextSelection.add(c.type);
              else if (c.type === 'PREPOSITION_QUIZ' && (history[`PREPOSITION_QUIZ:${c.answer}`] === false || history['PREPOSITION_QUIZ'] === false)) nextSelection.add(c.type);
              else if (history[c.type] === false) nextSelection.add(c.type);
          });
      }
      setSelectedChallengeTypes(nextSelection);
  }, [availableChallenges, word, isQuickFire]);

  useEffect(() => { setShowHint(false); }, [currentChallengeIndex]);

  const handleToggleChallenge = (type: ChallengeType) => {
      setSelectedChallengeTypes(prev => {
          const next = new Set(prev);
          if (next.has(type)) next.delete(type); else next.add(type);
          return next;
      });
  };

  const handleStartTest = async () => {
      const selected = availableChallenges.filter(c => selectedChallengeTypes.has(c.type));
      if (selected.length === 0) return;
      setIsPreparing(true);
      const finalChallenges = await prepareChallenges(selected, word);
      
      const shuffleChallenges = (challenges: Challenge[]): Challenge[] => {
          // Separate PARAPHRASE_QUIZ, PREPOSITION_QUIZ, and other challenges.
          const paraQuizzes = challenges.filter(c => c.type === 'PARAPHRASE_QUIZ');
          const prepQuizzes = challenges.filter(c => c.type === 'PREPOSITION_QUIZ');
          const otherQuizzes = challenges.filter(c => c.type !== 'PARAPHRASE_QUIZ' && c.type !== 'PREPOSITION_QUIZ');
  
          // Shuffle the paraphrase quizzes internally to ensure their order is random.
          const shuffledPara = paraQuizzes.sort(() => Math.random() - 0.5);
  
          // Create the list of items to be shuffled: 
          // - Individual 'other' quizzes
          // - Individual shuffled paraphrase quizzes
          // - A single block for all preposition quizzes (to keep them together)
          const itemsToShuffle: (Challenge | Challenge[])[] = [...otherQuizzes, ...shuffledPara];
          if (prepQuizzes.length > 0) {
              itemsToShuffle.push(prepQuizzes);
          }
          
          // Fisher-Yates shuffle on the final list of items.
          for (let k = itemsToShuffle.length - 1; k > 0; k--) {
              const l = Math.floor(Math.random() * (k + 1));
              [itemsToShuffle[k], itemsToShuffle[l]] = [itemsToShuffle[l], itemsToShuffle[k]];
          }
  
          return itemsToShuffle.flat();
      };
      
      const shuffledChallenges = shuffleChallenges(finalChallenges);

      setActiveChallenges(shuffledChallenges);
      setUserAnswers(new Array(shuffledChallenges.length).fill(undefined));
      setIsPreparing(false);
      setIsSetupMode(false);
  };

  const currentChallenge = activeChallenges[currentChallengeIndex];

  const currentPrepositionGroup = useMemo(() => {
    if (currentChallenge?.type !== 'PREPOSITION_QUIZ') return null;
    const group: { challenge: any; index: number }[] = [];
    let startIndex = currentChallengeIndex;
    while (startIndex > 0 && activeChallenges[startIndex - 1].type === 'PREPOSITION_QUIZ') { startIndex--; }
    for (let i = startIndex; i < activeChallenges.length && activeChallenges[i].type === 'PREPOSITION_QUIZ'; i++) {
        group.push({ challenge: activeChallenges[i], index: i });
    }
    if (group.length === 0) return null;
    return { startIndex, group };
  }, [currentChallenge, currentChallengeIndex, activeChallenges]);

  const handleAnswerChange = (index: number, value: any) => {
    setUserAnswers(prev => {
      const newAnswers = [...prev];
      newAnswers[index] = value;
      return newAnswers;
    });
  };

  const checkAnswers = async (isEarlyFinish = false, stopSession = false) => {
    const newResults: (ChallengeResult | null)[] = [];
    let correctCount = 0;
    let actualTestedCount = 0;
    const resultHistory: Record<string, boolean> = {};

    activeChallenges.forEach((challenge, index) => {
      if (ignoredIndices.has(index) || (isEarlyFinish && (userAnswers[index] === undefined || userAnswers[index] === ''))) {
          newResults[index] = null;
          return;
      }
      
      actualTestedCount++;
      const result = gradeChallenge(challenge, userAnswers[index]);
      newResults[index] = result;
      const isCorrect = typeof result === 'boolean' ? result : result.correct;
      if (isCorrect) correctCount++;
      
      if (challenge.type === 'WORD_FAMILY' && typeof result === 'object' && 'details' in result) {
          resultHistory['WORD_FAMILY'] = result.correct;
          Object.entries(result.details).forEach(([type, correct]) => {
              resultHistory[`WORD_FAMILY_${type.toUpperCase()}`] = correct;
          });
      } else if (challenge.type === 'COLLOCATION_QUIZ' && typeof result === 'object' && 'details' in result) {
          resultHistory['COLLOCATION_QUIZ'] = result.correct;
          const cq = challenge as CollocationQuizChallenge;
          Object.entries(result.details).forEach(([index, correct]) => {
              const collocationText = cq.collocations[parseInt(index, 10)]?.fullText;
              if (collocationText) {
                  resultHistory[`COLLOCATION_QUIZ:${collocationText}`] = correct;
              }
          });
      } else if (challenge.type === 'IDIOM_QUIZ' && typeof result === 'object' && 'details' in result) {
          resultHistory['IDIOM_QUIZ'] = result.correct;
          const iq = challenge as IdiomQuizChallenge;
          Object.entries(result.details).forEach(([index, correct]) => {
              const idiomText = iq.idioms[parseInt(index, 10)]?.fullText;
              if (idiomText) {
                  resultHistory[`IDIOM_QUIZ:${idiomText}`] = correct;
              }
          });
      } else if (challenge.type === 'PARAPHRASE_QUIZ') {
          resultHistory[`PARAPHRASE_QUIZ:${challenge.answer}`] = isCorrect;
      } else if (challenge.type === 'PREPOSITION_QUIZ') {
          resultHistory[`PREPOSITION_QUIZ:${challenge.answer}`] = isCorrect;
      } else {
          resultHistory[challenge.type] = isCorrect;
      }
    });

    let finalGrade: ReviewGrade = ReviewGrade.HARD;
    if (actualTestedCount > 0) {
        if (correctCount === actualTestedCount) finalGrade = actualTestedCount > 1 ? ReviewGrade.EASY : ReviewGrade.HARD;
        else if (correctCount < actualTestedCount / 2) finalGrade = ReviewGrade.FORGOT;
    }
    
    const counts = { correct: correctCount, tested: actualTestedCount };

    if (isEarlyFinish || isQuickFire) {
        setResults(newResults);
        setIsFinishing(true);
        setTimeout(() => onComplete(finalGrade, resultHistory, stopSession, counts), isQuickFire ? 1500 : 2500);
    } else {
        onComplete(finalGrade, resultHistory, stopSession, counts);
    }
  };

  const isLastChallenge = useMemo(() => {
     if (currentPrepositionGroup) {
        const nextIndex = currentPrepositionGroup.startIndex + currentPrepositionGroup.group.length;
        return nextIndex >= activeChallenges.length;
     }
     return currentChallengeIndex >= activeChallenges.length - 1;
  }, [currentChallengeIndex, activeChallenges, currentPrepositionGroup]);

  const handleNextClick = () => {
    if (isLastChallenge) { checkAnswers(); return; }
    if (currentPrepositionGroup) { setCurrentChallengeIndex(currentPrepositionGroup.startIndex + currentPrepositionGroup.group.length); } 
    else { setCurrentChallengeIndex(p => p + 1); }
  };

  const handleBackClick = () => {
      if (currentChallengeIndex === 0 && sessionPosition && sessionPosition.current > 1 && onPrevWord) {
          onPrevWord();
          return;
      }
      const targetIndex = currentPrepositionGroup ? currentPrepositionGroup.startIndex - 1 : currentChallengeIndex - 1;
      if (targetIndex >= 0) setCurrentChallengeIndex(targetIndex);
  };

  const handleIgnore = () => {
      setIgnoredIndices(prev => {
          const next = new Set(prev);
          if (currentPrepositionGroup) { currentPrepositionGroup.group.forEach(item => next.add(item.index)); } 
          else { next.add(currentChallengeIndex); }
          return next;
      });
      handleNextClick();
  };

  return (
    <TestModalUI
      isModal={isModal} word={word} onClose={onClose} isSetupMode={isSetupMode} isPreparing={isPreparing} availableChallenges={availableChallenges}
      selectedChallengeTypes={selectedChallengeTypes} onToggleChallenge={handleToggleChallenge} onSetSelection={setSelectedChallengeTypes}
      onStartTest={handleStartTest} challenges={activeChallenges} currentChallenge={currentChallenge}
      currentChallengeIndex={currentChallengeIndex} userAnswers={userAnswers} handleAnswerChange={handleAnswerChange}
      results={results} isFinishing={isFinishing} currentPrepositionGroup={currentPrepositionGroup} isLastChallenge={isLastChallenge}
      handleNextClick={handleNextClick} handleBackClick={handleBackClick} handleIgnore={handleIgnore} handleFinishEarly={(stopSession = false) => checkAnswers(true, stopSession)}
      showHint={showHint} onToggleHint={() => setShowHint(!showHint)} sessionPosition={sessionPosition}
    />
  );
};

export default TestModal;