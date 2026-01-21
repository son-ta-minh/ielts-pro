import React, { useState, useMemo, useEffect } from 'react';
// FIX: Moved WordFamilyMember from './TestModalTypes' to the correct location in '../../app/types' and consolidated type imports.
import { VocabularyItem, ReviewGrade, WordFamily, WordFamilyMember } from '../../app/types';
import { TestModalUI } from './TestModal_UI';
import { Challenge, ChallengeResult, ChallengeType, CollocationQuizChallenge, IdiomQuizChallenge, ParaphraseQuizChallenge, PrepositionQuizChallenge } from './TestModalTypes';
import { generateAvailableChallenges, prepareChallenges, gradeChallenge } from '../../utils/challengeUtils';
import { Loader2 } from 'lucide-react';

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onComplete: (grade: ReviewGrade, results?: Record<string, boolean>, stopSession?: boolean, counts?: { correct: number, tested: number }) => void;
  isQuickFire?: boolean;
  isModal?: boolean;
  sessionPosition?: { current: number, total: number };
  onPrevWord?: () => void;
  disableHints?: boolean;
}

const TestModal: React.FC<Props> = ({ word, onClose, onComplete, isQuickFire = false, isModal = true, sessionPosition, onPrevWord, disableHints = false }) => {
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

  const challengeStatuses = useMemo(() => {
    const history = word.lastTestResults || {};
    const statuses = new Map<ChallengeType, { status: 'failed' | 'passed' | 'incomplete' | 'not_tested', tested: number, total: number }>();
    const uniqueTypes = Array.from(new Set(availableChallenges.map(c => c.type)));

    uniqueTypes.forEach((type: ChallengeType) => {
        const allOfType = availableChallenges.filter(c => c.type === type);
        let total = allOfType.length;
        
        const getKey = (challenge: Challenge): string | null => {
            switch(challenge.type) {
                case 'COLLOCATION_QUIZ': return `COLLOCATION_QUIZ:${(challenge as CollocationQuizChallenge).fullText}`;
                case 'IDIOM_QUIZ': return `IDIOM_QUIZ:${(challenge as IdiomQuizChallenge).fullText}`;
                case 'PREPOSITION_QUIZ': return `PREPOSITION_QUIZ:${(challenge as PrepositionQuizChallenge).answer}`;
                case 'PARAPHRASE_QUIZ': return `PARAPHRASE_QUIZ:${(challenge as ParaphraseQuizChallenge).answer}`;
                default: return challenge.type;
            }
        };
        
        if (type === 'WORD_FAMILY') {
            const familyKeys: (keyof WordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
            const typeMap: Record<keyof WordFamily, string> = { nouns: 'n', verbs: 'v', adjs: 'j', advs: 'd' };
            
            const familyMembers = familyKeys.flatMap(key => 
                (word.wordFamily?.[key] || []).map(m => ({...m, typeKey: key}))
            ).filter(m => !m.isIgnored && m.word);
            
            const totalMembers = familyMembers.length;
            if (totalMembers === 0) { 
                statuses.set(type, { status: 'not_tested', tested: 0, total: 0 }); 
                return; 
            }

            let testedMembers = 0;
            let hasFailure = false;

            familyMembers.forEach(member => {
                const shortType = typeMap[member.typeKey];
                const key = `WORD_FAMILY:${shortType}:${member.word}`;
                if (history[key] !== undefined) {
                    testedMembers++;
                    if (history[key] === false) hasFailure = true;
                }
            });
            
            let status: 'failed' | 'passed' | 'incomplete' | 'not_tested' = 'not_tested';
            if (hasFailure) status = 'failed';
            else if (testedMembers > 0 && testedMembers < totalMembers) status = 'incomplete';
            else if (testedMembers === totalMembers && totalMembers > 0) status = 'passed';
            
            statuses.set(type, { status, tested: testedMembers, total: totalMembers });
            return;
        }

        let tested = 0;
        let failed = false;

        allOfType.forEach(challenge => {
            const key = getKey(challenge);
            if (key && history[key] !== undefined) {
                tested++;
                if (history[key] === false) failed = true;
            }
        });
        
        if (tested === 0 && history[type] !== undefined) {
            tested = total;
            if(history[type] === false) failed = true;
        }

        let status: 'failed' | 'passed' | 'incomplete' | 'not_tested' = 'not_tested';
        if (failed) status = 'failed';
        else if (tested > 0 && tested < total) status = 'incomplete';
        else if (tested === total && total > 0) status = 'passed';

        statuses.set(type, { status, tested, total });
    });

    return statuses;
  }, [word, availableChallenges]);

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
      
      const hasHistory = Object.keys(word.lastTestResults || {}).length > 0;
      const nextSelection = new Set<ChallengeType>();

      if (!hasHistory) {
          availableChallenges.forEach(c => nextSelection.add(c.type));
      } else {
          challengeStatuses.forEach((statusInfo, type) => {
              if (statusInfo.status === 'failed' || statusInfo.status === 'incomplete') {
                  nextSelection.add(type);
              }
          });
      }
      setSelectedChallengeTypes(nextSelection);
  }, [availableChallenges, word, isQuickFire, challengeStatuses]);

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
          const paraQuizzes = challenges.filter(c => c.type === 'PARAPHRASE_QUIZ');
          const prepQuizzes = challenges.filter(c => c.type === 'PREPOSITION_QUIZ');
          const otherQuizzes = challenges.filter(c => c.type !== 'PARAPHRASE_QUIZ' && c.type !== 'PREPOSITION_QUIZ');
  
          const shuffledPara = paraQuizzes.sort(() => Math.random() - 0.5);
  
          const itemsToShuffle: (Challenge | Challenge[])[] = [...otherQuizzes, ...shuffledPara];
          if (prepQuizzes.length > 0) {
              itemsToShuffle.push(prepQuizzes);
          }
          
          for (let k = itemsToShuffle.length - 1; k > 0; k--) {
              const l = Math.floor(Math.random() * (k + 1));
              [itemsToShuffle[k], itemsToShuffle[l]] = [itemsToShuffle[l], itemsToShuffle[k]];
          }
  
          return itemsToShuffle.flat();
      };
      
      const shuffledChallenges = shuffleArray(finalChallenges);

      setActiveChallenges(shuffledChallenges);
      setUserAnswers(new Array(shuffledChallenges.length).fill(undefined));
      setIsPreparing(false);
      setIsSetupMode(false);
  };

  // Helper to shuffle without affecting the original array reference inside hooks if needed (though prepareChallenges does it)
  // Re-implemented simple shuffle here for the handleStartTest
  function shuffleArray<T>(array: T[]): T[] {
      const newArray = [...array];
      for (let i = newArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
      }
      return newArray;
  }

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
          Object.entries(result.details).forEach(([typedWord, correct]) => {
              resultHistory[`WORD_FAMILY:${typedWord}`] = correct as boolean;
          });
      } else if (challenge.type === 'COLLOCATION_QUIZ') {
          resultHistory[`COLLOCATION_QUIZ:${challenge.fullText}`] = isCorrect;
      } else if (challenge.type === 'IDIOM_QUIZ') {
          resultHistory[`IDIOM_QUIZ:${challenge.fullText}`] = isCorrect;
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

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !isSetupMode && !isFinishing && !isPreparing) {
            e.preventDefault();
            handleNextClick();
        }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isSetupMode, isFinishing, isPreparing, handleNextClick]);

  if (isQuickFire && (isPreparing || !currentChallenge)) {
    const loaderContent = (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
          <Loader2 className="animate-spin text-neutral-400" size={32} />
          <p className="text-xs font-black text-neutral-500 uppercase tracking-widest">Preparing Challenge...</p>
      </div>
    );

    if (isModal) {
      return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[500px] max-h-[90vh]">
            {loaderContent}
          </div>
        </div>
      );
    }
    return loaderContent;
  }

  return (
    <TestModalUI
      isModal={isModal} word={word} onClose={onClose} isSetupMode={isSetupMode} isPreparing={isPreparing} availableChallenges={availableChallenges}
      selectedChallengeTypes={selectedChallengeTypes} onToggleChallenge={handleToggleChallenge} onSetSelection={setSelectedChallengeTypes}
      onStartTest={handleStartTest} challenges={activeChallenges} currentChallenge={currentChallenge}
      currentChallengeIndex={currentChallengeIndex} userAnswers={userAnswers} handleAnswerChange={handleAnswerChange}
      results={results} isFinishing={isFinishing} currentPrepositionGroup={currentPrepositionGroup} isLastChallenge={isLastChallenge}
      handleNextClick={handleNextClick} handleBackClick={handleBackClick} handleIgnore={handleIgnore} handleFinishEarly={(stopSession = false) => checkAnswers(true, stopSession)}
      showHint={showHint} onToggleHint={() => setShowHint(!showHint)} sessionPosition={sessionPosition}
      challengeStatuses={challengeStatuses}
      disableHints={disableHints}
    />
  );
};

export default TestModal;