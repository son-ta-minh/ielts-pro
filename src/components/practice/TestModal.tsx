
import React, { useState, useMemo, useEffect } from 'react';
import { VocabularyItem, ReviewGrade } from '../../app/types';
import { TestModalUI } from './TestModal_UI';
import { Challenge, ChallengeType, RecapData } from './TestModalTypes';
import { generateAvailableChallenges, prepareChallenges } from '../../utils/challengeUtils';
import { Loader2 } from 'lucide-react';
import { calculateMasteryScore, getLogicalKnowledgeUnits } from '../../utils/srs';
import { useTestEngine } from './hooks/useTestEngine';
import { mergeTestResultsByGroup } from '../../utils/testResultUtils';

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onComplete: (grade: ReviewGrade, results?: Record<string, boolean>, stopSession?: boolean, counts?: { correct: number, tested: number }) => void;
  isQuickFire?: boolean;
  isModal?: boolean;
  sessionPosition?: { current: number, total: number };
  onPrevWord?: () => void;
  disableHints?: boolean;
  forceShowHint?: boolean;
  skipSetup?: boolean;
  challengeFilter?: (challenge: Challenge) => boolean;
  skipRecap?: boolean;
}

const SHORT_TYPE_MAP: Record<string, string> = {
    'SPELLING': 'sp', 'IPA_QUIZ': 'iq', 'PREPOSITION_QUIZ': 'pq',
    'WORD_FAMILY': 'wf', 'MEANING_QUIZ': 'mq', 'PARAPHRASE_QUIZ': 'prq',
    'SENTENCE_SCRAMBLE': 'sc', 'HETERONYM_QUIZ': 'hq', 'PRONUNCIATION': 'p',
    'COLLOCATION_QUIZ': 'cq', 'IDIOM_QUIZ': 'idq',
    'PARAPHRASE_CONTEXT_QUIZ': 'pcq', 'COLLOCATION_CONTEXT_QUIZ': 'ccq',
    'COLLOCATION_MULTICHOICE_QUIZ': 'cmq', 'IDIOM_CONTEXT_QUIZ': 'icq'
};

const AUX_CHALLENGE_TYPES: string[] = [
    'PARAPHRASE_CONTEXT_QUIZ',
    'COLLOCATION_CONTEXT_QUIZ',
    'IDIOM_CONTEXT_QUIZ',
    'COLLOCATION_MULTICHOICE_QUIZ',
    'HETERONYM_QUIZ'
];

// --- PRIORITY LOGIC ---

const PRIORITIES = {
    collocation: {
        easy: ['COLLOCATION_CONTEXT_QUIZ', 'COLLOCATION_MULTICHOICE_QUIZ', 'COLLOCATION_QUIZ'],
        hard: ['COLLOCATION_QUIZ', 'COLLOCATION_CONTEXT_QUIZ', 'COLLOCATION_MULTICHOICE_QUIZ']
    },
    paraphrase: {
        easy: ['PARAPHRASE_CONTEXT_QUIZ', 'PARAPHRASE_QUIZ'],
        hard: ['PARAPHRASE_QUIZ', 'PARAPHRASE_CONTEXT_QUIZ']
    },
    idiom: {
        easy: ['IDIOM_CONTEXT_QUIZ', 'IDIOM_QUIZ'],
        hard: ['IDIOM_QUIZ', 'IDIOM_CONTEXT_QUIZ']
    }
};

// Set of all types that are part of a priority group to avoid adding them twice
const GROUPED_TYPES = new Set([
    ...PRIORITIES.collocation.easy,
    ...PRIORITIES.paraphrase.easy,
    ...PRIORITIES.idiom.easy
]);

const getDeduplicatedSelection = (availableSet: Set<ChallengeType>, mode: 'easy' | 'hard'): Set<ChallengeType> => {
    const selected = new Set<ChallengeType>();
    
    // 1. Process Groups: Pick only ONE per group based on priority
    (Object.keys(PRIORITIES) as Array<keyof typeof PRIORITIES>).forEach(groupKey => {
        const priorityList = PRIORITIES[groupKey][mode];
        for (const typeStr of priorityList) {
            const type = typeStr as ChallengeType;
            if (availableSet.has(type)) {
                selected.add(type);
                break; // Found the highest priority available for this group, stop looking
            }
        }
    });

    // 2. Process Standalone Types: Add everything else that isn't in a group
    availableSet.forEach(type => {
        if (!GROUPED_TYPES.has(type as string)) {
            selected.add(type);
        }
    });

    return selected;
};

// --- END PRIORITY LOGIC ---

const TestModal: React.FC<Props> = ({ word, onClose, onComplete, isQuickFire = false, isModal = true, sessionPosition, onPrevWord, disableHints = false, forceShowHint = false, skipSetup = false, challengeFilter, skipRecap = false }) => {
  // Setup State
  const [isSetupMode, setIsSetupMode] = useState(!isQuickFire && !skipSetup);
  const [selectedChallengeTypes, setSelectedChallengeTypes] = useState<Set<ChallengeType>>(new Set());
  const [isPreparing, setIsPreparing] = useState(false);
  const [isQuickMode, setIsQuickMode] = useState(false); 
  const [showHint, setShowHint] = useState(forceShowHint);
  
  // Recap State
  const [recapData, setRecapData] = useState<RecapData | null>(null);
  
  // Engine
  const engine = useTestEngine();

  // Reset hint on new question or when forceShowHint changes
  useEffect(() => { 
      setShowHint(forceShowHint); 
  }, [engine.currentChallengeIndex, forceShowHint]);

  const availableChallenges = useMemo(() => {
      try {
        return generateAvailableChallenges(word);
      } catch (e) {
        console.error("[TestModal] Error generating challenges:", e);
        return [];
      }
  }, [word]);

  const challengeStats = useMemo(() => {
    const history = word.lastTestResults || {};
    const stats = new Map<ChallengeType, { score: number, total: number, attempted: number }>();
    const uniqueTypes = Array.from(new Set(availableChallenges.map(c => c.type)));

    const getResult = (key: string, type: ChallengeType) => {
        if (history[key] !== undefined) return history[key];
        const shortType = SHORT_TYPE_MAP[type];
        if (shortType) {
            const suffix = key.startsWith(type) ? key.substring(type.length) : '';
            const shortKey = shortType + suffix;
            return history[shortKey];
        }
        return undefined;
    };

    uniqueTypes.forEach((type: ChallengeType) => {
        const allOfType = availableChallenges.filter(c => c.type === type);
        
        // Special Case: Word Family (Aggregate score of members)
        if (type === 'WORD_FAMILY') {
            const familyKeys: (keyof WordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
            const typeMap: Record<keyof WordFamily, string> = { nouns: 'n', verbs: 'v', adjs: 'j', advs: 'd' };
            let currentScore = 0;
            const familyMembers = familyKeys.flatMap(key => (word.wordFamily?.[key] || []).map(m => ({...m, typeKey: key}))).filter(m => !m.isIgnored && m.word);
            if (familyMembers.length > 0) {
                familyMembers.forEach(member => {
                    const shortType = typeMap[member.typeKey];
                    let result = history[`WORD_FAMILY:${shortType}:${member.word}`] ?? history[`wf:${shortType}:${member.word}`] ?? history[`WORD_FAMILY_${member.typeKey.toUpperCase()}`];
                    if (result === true) currentScore++;
                });
            }
            const attemptedMembers = familyMembers.reduce((count, member) => {
                const shortType = typeMap[member.typeKey];
                const specificLongKey = `WORD_FAMILY:${shortType}:${member.word}`;
                const specificShortKey = `wf:${shortType}:${member.word}`;
                const categoryKey = `WORD_FAMILY_${member.typeKey.toUpperCase()}`;
                const hasAttempt = history[specificLongKey] !== undefined || history[specificShortKey] !== undefined || history[categoryKey] !== undefined || history['WORD_FAMILY'] !== undefined;
                return hasAttempt ? count + 1 : count;
            }, 0);
            stats.set(type, { score: currentScore, total: familyMembers.length, attempted: attemptedMembers });
            return;
        }

        // Special Case: Sentence Scramble (Group Logic - Pass ONE is enough for mastery display)
        if (type === 'SENTENCE_SCRAMBLE') {
            const anyPassed = Object.keys(history).some(key =>
                (key.startsWith('SENTENCE_SCRAMBLE') || key.startsWith('sc')) && history[key] === true
            );
            stats.set(type, {
                score: anyPassed ? 1 : 0,
                total: 1,
                attempted: Object.keys(history).some(key => key.startsWith('SENTENCE_SCRAMBLE') || key.startsWith('sc')) ? 1 : 0
            });

            return;
        }

        // Default Logic for other types
        let currentScore = 0;
        let attemptedCount = 0;
        allOfType.forEach(challenge => {
            let isPassed = false;
            let primaryKey = '';

            // 1. Determine Primary Key
            if (challenge.type === 'COLLOCATION_QUIZ') primaryKey = `COLLOCATION_QUIZ:${(challenge as any).fullText}`;
            else if (challenge.type === 'COLLOCATION_MULTICHOICE_QUIZ') primaryKey = `COLLOCATION_MULTICHOICE_QUIZ:${(challenge as any).fullText}`;
            else if (challenge.type === 'IDIOM_QUIZ') primaryKey = `IDIOM_QUIZ:${(challenge as any).fullText}`;
            else if (challenge.type === 'PREPOSITION_QUIZ') primaryKey = `PREPOSITION_QUIZ:${(challenge as any).answer}`;
            else if (challenge.type === 'PARAPHRASE_QUIZ') primaryKey = `PARAPHRASE_QUIZ:${(challenge as any).answer}`;
            else if (challenge.type === 'PARAPHRASE_CONTEXT_QUIZ') primaryKey = 'PARAPHRASE_CONTEXT_QUIZ';
            else if (challenge.type === 'COLLOCATION_CONTEXT_QUIZ') primaryKey = 'COLLOCATION_CONTEXT_QUIZ';
            else if (challenge.type === 'IDIOM_CONTEXT_QUIZ') primaryKey = 'IDIOM_CONTEXT_QUIZ';
            else primaryKey = challenge.type;

            // 2. Check Primary Key
            const primaryResult = getResult(primaryKey, type);
            if (primaryResult === true) {
                isPassed = true;
            }

            // 3. Check Alternate Keys (Cross-validation)
            if (!isPassed) {
                if (challenge.type === 'PARAPHRASE_QUIZ') {
                    const text = (challenge as any).answer;
                    if (history[`PARAPHRASE_CONTEXT_QUIZ:${text}`] === true) isPassed = true;
                }
                else if (challenge.type === 'COLLOCATION_QUIZ') {
                    const text = (challenge as any).fullText;
                    if (history[`COLLOCATION_CONTEXT_QUIZ:${text}`] === true) isPassed = true;
                    if (getResult(`COLLOCATION_MULTICHOICE_QUIZ:${text}`, 'COLLOCATION_MULTICHOICE_QUIZ' as any) === true) isPassed = true;
                }
                else if (challenge.type === 'IDIOM_QUIZ') {
                    const text = (challenge as any).fullText;
                    if (history[`IDIOM_CONTEXT_QUIZ:${text}`] === true) isPassed = true;
                }
            }

            const hasAttempt =
                primaryResult !== undefined ||
                (challenge.type === 'PARAPHRASE_QUIZ' && history[`PARAPHRASE_CONTEXT_QUIZ:${(challenge as any).answer}`] !== undefined) ||
                (challenge.type === 'COLLOCATION_QUIZ' && (
                    history[`COLLOCATION_CONTEXT_QUIZ:${(challenge as any).fullText}`] !== undefined ||
                    getResult(`COLLOCATION_MULTICHOICE_QUIZ:${(challenge as any).fullText}`, 'COLLOCATION_MULTICHOICE_QUIZ' as any) !== undefined
                )) ||
                (challenge.type === 'IDIOM_QUIZ' && history[`IDIOM_CONTEXT_QUIZ:${(challenge as any).fullText}`] !== undefined);

            if (hasAttempt) attemptedCount++;
            
            if (isPassed) currentScore++;
        });
        stats.set(type, { score: currentScore, total: allOfType.length, attempted: attemptedCount });
    });
    return stats;
  }, [word, availableChallenges]);

  // --- Auto-Start Logic ---

  useEffect(() => {
    if (isQuickFire && !isPreparing && engine.challenges.length === 0) {
        if (availableChallenges.length === 0) {
             setTimeout(onClose, 100);
             return;
        }

        const prepareQuickFire = async () => {
            setIsPreparing(true);
            let candidates = availableChallenges;
            if (challengeFilter) candidates = availableChallenges.filter(challengeFilter);
            if (candidates.length === 0) candidates = availableChallenges.filter(c => c.type !== 'SPELLING');
            if (candidates.length === 0) candidates = availableChallenges;

            const randomTask = candidates[Math.floor(Math.random() * candidates.length)];
            
            if (!randomTask) {
                setIsPreparing(false);
                setTimeout(onClose, 500);
                return;
            }

            try {
                const finalChallenges = await prepareChallenges([randomTask], word);
                if (finalChallenges.length > 0) {
                    engine.startTest(finalChallenges);
                    setIsSetupMode(false);
                } else {
                    setTimeout(onClose, 500);
                }
            } catch (err) {
                setTimeout(onClose, 500);
            } finally {
                setIsPreparing(false);
            }
        };
        prepareQuickFire();
    }
  }, [isQuickFire, availableChallenges, word, challengeFilter]);

  // Handle skipSetup prop
  useEffect(() => {
      if (skipSetup && !isQuickFire && availableChallenges.length > 0 && engine.challenges.length === 0 && !isPreparing) {
          handleQuickStart();
      }
  }, [skipSetup, isQuickFire, availableChallenges.length, engine.challenges.length, isPreparing]);

  // Logic for Auto-Selection in Setup
  useEffect(() => {
      if (isQuickFire || availableChallenges.length === 0) return;
      const hasHistory = Object.keys(word.lastTestResults || {}).length > 0;
      const nextSelection = new Set<ChallengeType>();

      if (!hasHistory && !skipSetup) {
          setIsQuickMode(false);
          availableChallenges.forEach(c => nextSelection.add(c.type));
      } else {
          setIsQuickMode(true);
          // Prefer quick/fun types if revisiting
          ['MEANING_QUIZ', 'PREPOSITION_QUIZ', 'COLLOCATION_CONTEXT_QUIZ'].forEach(t => {
               if (availableChallenges.some(c => c.type === t)) nextSelection.add(t as ChallengeType);
          });
      }
      setSelectedChallengeTypes(nextSelection);
  }, [availableChallenges, word, isQuickFire, skipSetup]);


  const handleToggleChallenge = (type: ChallengeType) => {
      setIsQuickMode(false);
      setSelectedChallengeTypes(prev => {
          const next = new Set(prev);
          if (next.has(type)) next.delete(type); else next.add(type);
          return next;
      });
  };

  const handleStartTest = async (overrideSelection?: Set<ChallengeType>) => {
      const selectionToUse = overrideSelection || selectedChallengeTypes;
      let selected = availableChallenges.filter(c => selectionToUse.has(c.type));
      
      // Special handling for SENTENCE_SCRAMBLE to avoid flooding the test with multiple examples
      // If selected, pick only ONE random sentence scramble challenge.
      if (selectionToUse.has('SENTENCE_SCRAMBLE')) {
          const scrambles = selected.filter(c => c.type === 'SENTENCE_SCRAMBLE');
          if (scrambles.length > 1) {
              const keptScramble = scrambles[Math.floor(Math.random() * scrambles.length)];
              selected = selected.filter(c => c.type !== 'SENTENCE_SCRAMBLE'); // Remove all
              selected.push(keptScramble); // Add back one
          }
      }

      if (selected.length === 0) return;
      setIsPreparing(true);
      const finalChallenges = await prepareChallenges(selected, word);
      
      // Shuffle logic
      const shuffledChallenges = finalChallenges.sort(() => Math.random() - 0.5);
      
      engine.startTest(shuffledChallenges);
      setIsPreparing(false);
      setIsSetupMode(false);
  };

  const handleQuickStart = async () => {
      const availableTypes = new Set<ChallengeType>(availableChallenges.map(c => c.type));
      const selection = new Set<ChallengeType>();

      // 1. Meaning
      if (availableTypes.has('MEANING_QUIZ')) selection.add('MEANING_QUIZ');

      // 2. Collocation (Easy Priority) - Pick exactly one best fit
      for (const t of PRIORITIES.collocation.easy) {
          if (availableTypes.has(t as ChallengeType)) {
              selection.add(t as ChallengeType);
              break;
          }
      }

      // 3. Paraphrase (Easy Priority) - Pick exactly one best fit
      for (const t of PRIORITIES.paraphrase.easy) {
          if (availableTypes.has(t as ChallengeType)) {
              selection.add(t as ChallengeType);
              break;
          }
      }

      // 4. Random from Pool (IPA, Prep, Family, Idiom)
      const randomPool: ChallengeType[] = [];
      if (availableTypes.has('IPA_QUIZ')) randomPool.push('IPA_QUIZ');
      if (availableTypes.has('PREPOSITION_QUIZ')) randomPool.push('PREPOSITION_QUIZ');
      if (availableTypes.has('WORD_FAMILY')) randomPool.push('WORD_FAMILY');
      
      // Find best available idiom type to add to random pool
      for (const t of PRIORITIES.idiom.easy) {
          if (availableTypes.has(t as ChallengeType)) {
              randomPool.push(t as ChallengeType);
              break;
          }
      }

      if (randomPool.length > 0) {
          const randomPick = randomPool[Math.floor(Math.random() * randomPool.length)];
          selection.add(randomPick);
      }

      if (selection.size === 0) {
           // Fallback if strict selection found nothing (rare, but possible if word has only spelling/pronun)
           const anySelection = getDeduplicatedSelection(availableTypes, 'easy');
           if (anySelection.size > 0) {
               setIsQuickMode(true);
               handleStartTest(anySelection);
               return;
           }
           return;
      }

      setIsQuickMode(true);
      handleStartTest(selection);
  };
  
  const handleMasterStart = () => {
      const unmasteredTypes = new Set<ChallengeType>();
      const logicalUnits = getLogicalKnowledgeUnits(word);
      const history = word.lastTestResults || {};

      // Filter logical units that have NOT been passed by ANY valid test
      const unpassedUnits = logicalUnits.filter(unit => {
          // If any key in testKeys is true, the unit is passed. We want unpassed.
          return !unit.testKeys.some(key => history[key] === true);
      });

      if (unpassedUnits.length === 0) {
           // If all units passed, but user clicked "Master It", do a general check or fallback
           // This handles cases where logicalUnits logic differs or user just wants to review
           challengeStats.forEach((stat, type) => {
               if (stat.score < stat.total) unmasteredTypes.add(type);
           });
           
           if (unmasteredTypes.size === 0) return;
           
           // Deduplicate selection, favoring easier checks (recognition) if everything is supposedly fine
           const selection = getDeduplicatedSelection(unmasteredTypes, 'easy');
           handleStartTest(selection);
           return;
      }

      // Collect required ChallengeTypes for the unpassed units
      
      availableChallenges.forEach(challenge => {
          // Construct expected keys for this challenge
          let keys: string[] = [];
          if (challenge.type === 'COLLOCATION_QUIZ') keys.push(`COLLOCATION_QUIZ:${(challenge as any).fullText}`);
          else if (challenge.type === 'COLLOCATION_MULTICHOICE_QUIZ') keys.push(`COLLOCATION_MULTICHOICE_QUIZ:${(challenge as any).fullText}`);
          else if (challenge.type === 'COLLOCATION_CONTEXT_QUIZ') { /* Batch */ }
          else if (challenge.type === 'PARAPHRASE_QUIZ') keys.push(`PARAPHRASE_QUIZ:${(challenge as any).answer}`);
          else if (challenge.type === 'PREPOSITION_QUIZ') keys.push(`PREPOSITION_QUIZ:${(challenge as any).answer}`);
          else if (challenge.type === 'SPELLING') keys.push('SPELLING');
          else if (challenge.type === 'PRONUNCIATION') keys.push('PRONUNCIATION');
          else if (challenge.type === 'MEANING_QUIZ') keys.push('MEANING_QUIZ');
          else if (challenge.type === 'IPA_QUIZ') keys.push('IPA_QUIZ');
          else if (challenge.type === 'WORD_FAMILY') keys.push('WORD_FAMILY'); 
          else if (challenge.type === 'SENTENCE_SCRAMBLE') keys.push('SENTENCE_SCRAMBLE'); // Logical unit 'context' maps here

          // If any key produced by this challenge corresponds to an unpassed unit's testKeys
          const addressesUnpassed = keys.some(k => 
              unpassedUnits.some(u => u.testKeys.includes(k) || u.testKeys.some(tk => tk.startsWith('WORD_FAMILY') && k === 'WORD_FAMILY'))
          );
          
          if (addressesUnpassed) {
              unmasteredTypes.add(challenge.type);
          }
          
          // Special handling for Context Quizzes (Batch) - if any items in them are unpassed
          if (challenge.type === 'COLLOCATION_CONTEXT_QUIZ') {
              const unpassedCollocs = unpassedUnits.filter(u => u.key.startsWith('colloc:'));
              if (unpassedCollocs.length > 0) unmasteredTypes.add(challenge.type);
          }
          if (challenge.type === 'PARAPHRASE_CONTEXT_QUIZ') {
              const unpassedParas = unpassedUnits.filter(u => u.key.startsWith('para:'));
              if (unpassedParas.length > 0) unmasteredTypes.add(challenge.type);
          }
           if (challenge.type === 'IDIOM_CONTEXT_QUIZ') {
              const unpassedIdioms = unpassedUnits.filter(u => u.key.startsWith('idiom:'));
              if (unpassedIdioms.length > 0) unmasteredTypes.add(challenge.type);
          }
      });

      if (unmasteredTypes.size === 0) {
          // Fallback if mapping failed
           challengeStats.forEach((stat, type) => { if (stat.score < stat.total) unmasteredTypes.add(type); });
      }

      // Prioritize easier validation (Multi/Match) for "Master It" to help learning, 
      // but ensure we cover the unmastered areas.
      const selection = getDeduplicatedSelection(unmasteredTypes, 'easy');
      
      setIsQuickMode(false);
      handleStartTest(selection);
  };

    const handleRetryFailed = () => {
        const history = word.lastTestResults || {};
        if (!history) return;

        const failedTypes = new Set<ChallengeType>();

        Object.entries(history).forEach(([key, value]) => {
            if (value === false) {
                const type = key.split(':')[0] as ChallengeType;
                failedTypes.add(type);
            }
        });

        if (failedTypes.size === 0) return;
        console.log("Retry Failed - failedTypes:", failedTypes);

        setIsQuickMode(false);
        handleStartTest(failedTypes);
    };

  const handleChallengeStart = async () => {
      const allTypes = new Set<ChallengeType>(availableChallenges.map(c => c.type));
      // Challenge = Hard Priority (All categories, hardest versions)
      const selection = getDeduplicatedSelection(allTypes, 'hard');

      if (selection.size === 0) return;

      setIsQuickMode(false);
      handleStartTest(selection);
  };

  const handleFinish = (stopSession = false) => {
      const { finalGrade, resultHistory, detailedResults, counts } = engine.checkAnswers();
      engine.finishTest();
     console.log("Before" + word.lastTestResults)
      if (skipRecap || isQuickFire) {
           setTimeout(() => onComplete(finalGrade, resultHistory, stopSession, counts), 1000);
      } else {
          const oldMastery = word.masteryScore || 0;
          const oldStatus = word.lastReview ? (word.lastGrade || 'NEW') : 'NEW';
          const tempWord = { ...word, lastTestResults: mergeTestResultsByGroup(word.lastTestResults, resultHistory) };
          const newMastery = calculateMasteryScore(tempWord);

          setRecapData({
              oldMastery, newMastery, oldStatus, newStatus: finalGrade,
              results: detailedResults, finalGrade, resultHistory, counts
          });
      }
  };

  const handleNext = () => {
      if (engine.isLastChallenge) {
          handleFinish(false);
      } else {
          engine.handleNext();
      }
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const filteredStats = useMemo(() => {
      const stats = new Map<ChallengeType, { score: number, total: number, attempted: number }>();
      challengeStats.forEach((stat, type) => { if (!AUX_CHALLENGE_TYPES.includes(type)) stats.set(type, stat); });
      return stats;
  }, [challengeStats]);

  const isMastered = useMemo(() => {
    // Rely on the robust calculation from srs.ts which considers all alternatives
    return calculateMasteryScore(word) === 100;
  }, [word]);

  if (!isSetupMode && !isPreparing && !engine.currentChallenge) {
    if (isModal) {
         return (
             <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                 <div className="bg-white p-6 rounded-2xl shadow-xl text-center space-y-4">
                     <p className="text-red-500 font-bold">Failed to load challenge.</p>
                     <button onClick={onClose} className="px-4 py-2 bg-neutral-100 rounded-lg text-sm font-bold">Close</button>
                 </div>
             </div>
         );
    }
    return <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4"><Loader2 className="animate-spin text-neutral-400" size={32} /><p className="text-red-500 font-bold">Error loading.</p><button onClick={onClose} className="text-xs underline text-neutral-500">Return</button></div>;
  }

  if ((isQuickFire || skipSetup) && (isPreparing || !engine.currentChallenge)) {
    const loaderContent = <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4"><Loader2 className="animate-spin text-neutral-400" size={32} /><p className="text-xs font-black text-neutral-500 uppercase tracking-widest">Preparing...</p></div>;
    if (isModal) return <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"><div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[500px]">{loaderContent}</div></div>;
    return loaderContent;
  }

  return (
    <TestModalUI
      isModal={isModal} word={word} onClose={onClose} isSetupMode={isSetupMode} isPreparing={isPreparing} availableChallenges={availableChallenges}
      selectedChallengeTypes={selectedChallengeTypes} onToggleChallenge={handleToggleChallenge} onSetSelection={(s) => { setSelectedChallengeTypes(s); setIsQuickMode(false); }}
      onStartTest={() => handleStartTest()} challenges={engine.challenges} currentChallenge={engine.currentChallenge}
      currentChallengeIndex={engine.currentChallengeIndex} userAnswers={engine.userAnswers} handleAnswerChange={engine.setAnswer}
      results={engine.results} isFinishing={engine.isFinishing} currentPrepositionGroup={engine.currentPrepositionGroup} isLastChallenge={engine.isLastChallenge}
      handleNextClick={handleNext} handleBackClick={engine.handleBack} handleIgnore={engine.handleIgnore} handleFinishEarly={handleFinish}
      showHint={showHint} onToggleHint={() => setShowHint(!showHint)} sessionPosition={sessionPosition}
      challengeStats={filteredStats} disableHints={disableHints}
      onSelectQuick={handleQuickStart} onSelectPreferred={handleMasterStart}
      onSelectZeroScore={handleMasterStart}
      onSelectPartialScore={handleChallengeStart}
      onRetryFailed={handleRetryFailed}
      isQuickMode={isQuickMode} elapsedTime={formatTime(engine.elapsedSeconds)}
      recapData={recapData}
      onRecalculateFinish={() => recapData && onComplete(recapData.finalGrade, recapData.resultHistory, false, recapData.counts)}
      isMastered={isMastered} 
    />
  );
};

export default TestModal;
