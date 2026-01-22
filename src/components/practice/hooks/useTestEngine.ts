
import { useState, useEffect, useMemo, useRef } from 'react';
import { ReviewGrade } from '../../../app/types';
import { Challenge, ChallengeResult, PrepositionQuizChallenge, ChallengeType, CollocationQuizChallenge, CollocationMultichoiceQuizChallenge, IdiomQuizChallenge, ParaphraseQuizChallenge, ParaphraseContextQuizChallenge, CollocationContextQuizChallenge, IdiomContextQuizChallenge } from '../TestModalTypes';
import { gradeChallenge } from '../../../utils/challengeUtils';

export interface TestEngine {
    challenges: Challenge[];
    currentChallengeIndex: number;
    currentChallenge: Challenge;
    userAnswers: any[];
    results: (ChallengeResult | null)[] | null;
    isFinishing: boolean;
    elapsedSeconds: number;
    currentPrepositionGroup: { startIndex: number; group: { challenge: PrepositionQuizChallenge; index: number }[] } | null;
    isLastChallenge: boolean;
    startTest: (newChallenges: Challenge[]) => void;
    setAnswer: (index: number, value: any) => void;
    handleNext: () => void;
    handleBack: () => void;
    handleIgnore: () => void;
    checkAnswers: () => { 
        finalGrade: ReviewGrade; 
        resultHistory: Record<string, boolean>; 
        detailedResults: { type: ChallengeType; passed: boolean }[];
        counts: { correct: number; tested: number };
        newResults: (ChallengeResult | null)[];
    };
    finishTest: () => void;
}

export const useTestEngine = (): TestEngine => {
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<any[]>([]);
    const [results, setResults] = useState<(ChallengeResult | null)[] | null>(null);
    const [isFinishing, setIsFinishing] = useState(false);
    const [ignoredIndices, setIgnoredIndices] = useState<Set<number>>(new Set());
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        let timer: number;
        if (isActive && !isFinishing) {
            timer = window.setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isActive, isFinishing]);

    const startTest = (newChallenges: Challenge[]) => {
        setChallenges(newChallenges);
        setUserAnswers(new Array(newChallenges.length).fill(undefined));
        setCurrentChallengeIndex(0);
        setResults(null);
        setIsFinishing(false);
        setIgnoredIndices(new Set());
        setElapsedSeconds(0);
        setIsActive(true);
    };

    const setAnswer = (index: number, value: any) => {
        setUserAnswers(prev => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const currentChallenge = challenges[currentChallengeIndex];

    const currentPrepositionGroup = useMemo(() => {
        if (currentChallenge?.type !== 'PREPOSITION_QUIZ') return null;
        const group: { challenge: any; index: number }[] = [];
        let startIndex = currentChallengeIndex;
        while (startIndex > 0 && challenges[startIndex - 1].type === 'PREPOSITION_QUIZ') { startIndex--; }
        for (let i = startIndex; i < challenges.length && challenges[i].type === 'PREPOSITION_QUIZ'; i++) {
            group.push({ challenge: challenges[i], index: i });
        }
        if (group.length === 0) return null;
        return { startIndex, group };
    }, [currentChallenge, currentChallengeIndex, challenges]);

    const isLastChallenge = useMemo(() => {
        if (currentPrepositionGroup) {
            const nextIndex = currentPrepositionGroup.startIndex + currentPrepositionGroup.group.length;
            return nextIndex >= challenges.length;
        }
        return currentChallengeIndex >= challenges.length - 1;
    }, [currentChallengeIndex, challenges, currentPrepositionGroup]);

    const handleNext = () => {
        if (isLastChallenge) return; // Should be handled by finish
        if (currentPrepositionGroup) { 
            setCurrentChallengeIndex(currentPrepositionGroup.startIndex + currentPrepositionGroup.group.length); 
        } else { 
            setCurrentChallengeIndex(p => p + 1); 
        }
    };

    const handleBack = () => {
        const targetIndex = currentPrepositionGroup ? currentPrepositionGroup.startIndex - 1 : currentChallengeIndex - 1;
        if (targetIndex >= 0) setCurrentChallengeIndex(targetIndex);
    };

    const handleIgnore = () => {
        setIgnoredIndices(prev => {
            const next = new Set(prev);
            if (currentPrepositionGroup) { 
                currentPrepositionGroup.group.forEach(item => next.add(item.index)); 
            } else { 
                next.add(currentChallengeIndex); 
            }
            return next;
        });
        handleNext();
    };

    const checkAnswers = () => {
        const newResults: (ChallengeResult | null)[] = [];
        let correctCount = 0;
        let actualTestedCount = 0;
        const resultHistory: Record<string, boolean> = {};
        const detailedResults: { type: ChallengeType; passed: boolean }[] = [];
    
        challenges.forEach((challenge, index) => {
            if (ignoredIndices.has(index)) {
                newResults[index] = null;
                return;
            }
          
            actualTestedCount++;
            const result = gradeChallenge(challenge, userAnswers[index]);
            newResults[index] = result;
            const isCorrect = typeof result === 'boolean' ? result : result.correct;
            if (isCorrect) correctCount++;
          
            detailedResults.push({ type: challenge.type, passed: isCorrect });
          
            if (challenge.type === 'WORD_FAMILY' && typeof result === 'object' && 'details' in result) {
                Object.entries(result.details).forEach(([typedWord, correct]) => {
                    resultHistory[`WORD_FAMILY:${typedWord}`] = correct as boolean;
                });
            } else if (challenge.type === 'COLLOCATION_QUIZ') {
                resultHistory[`COLLOCATION_QUIZ:${(challenge as CollocationQuizChallenge).fullText}`] = isCorrect;
            } else if (challenge.type === 'COLLOCATION_MULTICHOICE_QUIZ') {
                resultHistory[`COLLOCATION_MULTICHOICE_QUIZ:${(challenge as CollocationMultichoiceQuizChallenge).fullText}`] = isCorrect;
            } else if (challenge.type === 'IDIOM_QUIZ') {
                resultHistory[`IDIOM_QUIZ:${(challenge as IdiomQuizChallenge).fullText}`] = isCorrect;
            } else if (challenge.type === 'PARAPHRASE_QUIZ') {
                resultHistory[`PARAPHRASE_QUIZ:${(challenge as ParaphraseQuizChallenge).answer}`] = isCorrect;
            } else if (challenge.type === 'PREPOSITION_QUIZ') {
                resultHistory[`PREPOSITION_QUIZ:${(challenge as PrepositionQuizChallenge).answer}`] = isCorrect;
            } else if (challenge.type === 'PARAPHRASE_CONTEXT_QUIZ') {
                const ch = challenge as ParaphraseContextQuizChallenge;
                // If the entire batch is correct, or based on specific details (if available)
                // Since we want granular mastery, we iterate the items.
                // Assuming `result` contains details mapping contextId -> correct boolean
                if (typeof result === 'object' && result.details) {
                    ch.paraphrases.forEach(p => {
                         // Find the context that pairs with this paraphrase
                         const context = ch.contexts.find(c => c.pairId === p.pairId);
                         if (context && result.details[context.id]) {
                             resultHistory[`PARAPHRASE_CONTEXT_QUIZ:${p.text}`] = true;
                         }
                    });
                }
                resultHistory[challenge.type] = isCorrect;
            } else if (challenge.type === 'COLLOCATION_CONTEXT_QUIZ') {
                const ch = challenge as CollocationContextQuizChallenge;
                if (typeof result === 'object' && result.details) {
                    ch.collocations.forEach(c => {
                         const context = ch.contexts.find(ctx => ctx.pairId === c.pairId);
                         if (context && result.details[context.id]) {
                             resultHistory[`COLLOCATION_CONTEXT_QUIZ:${c.text}`] = true;
                         }
                    });
                }
                resultHistory[challenge.type] = isCorrect;
            } else if (challenge.type === 'IDIOM_CONTEXT_QUIZ') {
                const ch = challenge as IdiomContextQuizChallenge;
                if (typeof result === 'object' && result.details) {
                    ch.idioms.forEach(i => {
                         const context = ch.contexts.find(ctx => ctx.pairId === i.pairId);
                         if (context && result.details[context.id]) {
                             resultHistory[`IDIOM_CONTEXT_QUIZ:${i.text}`] = true;
                         }
                    });
                }
                resultHistory[challenge.type] = isCorrect;
            } else {
                resultHistory[challenge.type] = isCorrect;
            }
        });
    
        let finalGrade: ReviewGrade = ReviewGrade.HARD;
        if (actualTestedCount > 0) {
            if (correctCount === actualTestedCount) finalGrade = actualTestedCount > 1 ? ReviewGrade.EASY : ReviewGrade.HARD;
            else if (correctCount < actualTestedCount / 2) finalGrade = ReviewGrade.FORGOT;
        }

        return {
            finalGrade,
            resultHistory,
            detailedResults,
            counts: { correct: correctCount, tested: actualTestedCount },
            newResults
        };
    };

    const finishTest = () => {
        setIsActive(false);
        setIsFinishing(true);
        const { newResults } = checkAnswers();
        setResults(newResults);
    };

    return {
        challenges,
        currentChallengeIndex,
        currentChallenge,
        userAnswers,
        results,
        isFinishing,
        elapsedSeconds,
        currentPrepositionGroup,
        isLastChallenge,
        startTest,
        setAnswer,
        handleNext,
        handleBack,
        handleIgnore,
        checkAnswers,
        finishTest
    };
};
