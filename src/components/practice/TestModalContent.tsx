
import React, { useRef, useEffect, useState } from 'react';
import { VocabularyItem } from '../../app/types';
import { 
    Challenge, ChallengeResult, 
    PrepositionQuizChallenge, 
    ParaphraseContextQuizChallenge, ParaphraseContextQuizItem,
    CollocationContextQuizChallenge, 
    IdiomContextQuizChallenge,
    CollocationMultichoiceQuizChallenge,
    CollocationQuizChallenge, IdiomQuizChallenge, ParaphraseQuizChallenge,
    PronunciationChallenge as PronunciationChallengeType,
    HeteronymQuizChallenge,
    SentenceScrambleChallenge,
    IpaQuizChallenge, MeaningQuizChallenge
} from './TestModalTypes';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';

// Import split components
import { PrepositionDrillChallenge } from './challenges/PrepositionDrillChallenge';
import { MatchingChallenge } from './challenges/MatchingChallenge';
import { PronunciationChallenge } from './challenges/PronunciationChallenge';
import { MultipleChoiceChallenge } from './challenges/MultipleChoiceChallenge';
import { SimpleFillChallenge } from './challenges/SimpleFillChallenge';
import { MultiFillChallenge } from './challenges/MultiFillChallenge';
import { ScrambleChallenge } from './challenges/ScrambleChallenge';
import { HeteronymChallenge } from './challenges/HeteronymChallenge';
import { SpellingChallenge } from './challenges/SpellingChallenge';

interface TestModalContentProps {
    word: VocabularyItem;
    currentChallenge: Challenge;
    currentChallengeIndex: number;
    userAnswers: any[];
    handleAnswerChange: (index: number, value: any) => void;
    results: (ChallengeResult | null)[] | null;
    isFinishing: boolean;
    currentPrepositionGroup: { startIndex: number; group: { challenge: PrepositionQuizChallenge; index: number }[] } | null;
    showHint: boolean;
    onEnterPress: () => void;
}

export const TestModalContent: React.FC<TestModalContentProps> = ({
    word, currentChallenge, currentChallengeIndex, userAnswers, handleAnswerChange, results, isFinishing, currentPrepositionGroup, showHint, onEnterPress
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Speech Recognition State (Shared management for components that need it)
    const [listeningId, setListeningId] = useState<string | null>(null);
    const recognitionManager = useRef<SpeechRecognitionManager | null>(null);

    // Safer init
    useEffect(() => {
        try {
            recognitionManager.current = new SpeechRecognitionManager();
        } catch(e) {
             // Silence error
        }
        return () => {
             recognitionManager.current?.stop();
        };
    }, []);
    
    // Reset listening state when challenge changes
    useEffect(() => {
        recognitionManager.current?.stop();
        setListeningId(null);
    }, [currentChallengeIndex, currentPrepositionGroup]);

    const toggleListening = (id: string, onResult: (text: string) => void) => {
        if (!recognitionManager.current) return;
        
        if (listeningId === id) {
            recognitionManager.current.stop();
            setListeningId(null);
        } else {
            if (listeningId) recognitionManager.current.stop();
            
            onResult('');

            setListeningId(id);
            recognitionManager.current.start(
                (final, interim) => {
                    const display = final + (interim ? (final ? ' ' : '') + interim : '');
                    onResult(display);
                },
                (final) => {
                    const cleanText = final.trim().replace(/[.]/g, '');
                    onResult(cleanText); 
                    setListeningId(null);
                }
            );
        }
    };

    // Auto-focus logic
    useEffect(() => {
        const focusInput = () => {
             const firstInput = containerRef.current?.querySelector('input[type="text"]:not([disabled]), textarea:not([disabled])') as HTMLInputElement | HTMLTextAreaElement;
             if (firstInput && !containerRef.current?.contains(document.activeElement)) {
                 firstInput.focus();
             }
        };

        setTimeout(focusInput, 50);

        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            
            if (e.key === 'Enter') {
                const active = document.activeElement;
                if (active && active.tagName === 'TEXTAREA') {
                    // Allow Shift+Enter for new lines in textarea, otherwise submit
                    if (e.shiftKey) return;
                }
                e.preventDefault();
                onEnterPress();
                return;
            }
            
            if (e.key.length === 1) {
                const active = document.activeElement;
                const isInsideModal = containerRef.current?.contains(active);
                
                if (!isInsideModal) {
                     focusInput();
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [currentChallengeIndex, onEnterPress]);


    // --- PREPOSITION DRILL (GROUPED) ---
    if (currentPrepositionGroup) {
      return (
        <PrepositionDrillChallenge
            containerRef={containerRef}
            group={currentPrepositionGroup.group}
            userAnswers={userAnswers}
            results={results}
            onAnswerChange={handleAnswerChange}
            isFinishing={isFinishing}
            showHint={showHint}
            toggleListening={toggleListening}
            listeningId={listeningId}
        />
      );
    }

    // --- OTHER CHALLENGES ---
    switch (currentChallenge.type) {
        case 'PARAPHRASE_CONTEXT_QUIZ': {
            const challenge = currentChallenge as ParaphraseContextQuizChallenge;
            return (
                <MatchingChallenge
                    containerRef={containerRef}
                    challenge={{
                        contexts: challenge.contexts,
                        items: challenge.paraphrases
                    }}
                    answer={userAnswers[currentChallengeIndex]}
                    onAnswer={(newAnswer) => handleAnswerChange(currentChallengeIndex, newAnswer)}
                    isFinishing={isFinishing}
                    result={results ? results[currentChallengeIndex] : null}
                    showHint={showHint}
                    itemLabel={(item: ParaphraseContextQuizItem) => item.tone && (
                        <span className="inline-block text-[9px] font-black uppercase bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200 mb-1">
                            {item.tone}
                        </span>
                    )}
                    instructionText="Match each phrase on the right to its correct context on the left."
                />
            );
        }
        case 'COLLOCATION_CONTEXT_QUIZ': {
            const challenge = currentChallenge as CollocationContextQuizChallenge;
            return (
                <MatchingChallenge
                    containerRef={containerRef}
                    challenge={{
                        contexts: challenge.contexts,
                        items: challenge.collocations
                    }}
                    answer={userAnswers[currentChallengeIndex]}
                    onAnswer={(newAnswer) => handleAnswerChange(currentChallengeIndex, newAnswer)}
                    isFinishing={isFinishing}
                    result={results ? results[currentChallengeIndex] : null}
                    showHint={showHint}
                    itemLabel={() => null} 
                    instructionText="Match each collocation on the right to its correct definition/cue."
                />
            );
        }
        case 'IDIOM_CONTEXT_QUIZ': {
            const challenge = currentChallenge as IdiomContextQuizChallenge;
            return (
                <MatchingChallenge
                    containerRef={containerRef}
                    challenge={{
                        contexts: challenge.contexts,
                        items: challenge.idioms
                    }}
                    answer={userAnswers[currentChallengeIndex]}
                    onAnswer={(newAnswer) => handleAnswerChange(currentChallengeIndex, newAnswer)}
                    isFinishing={isFinishing}
                    result={results ? results[currentChallengeIndex] : null}
                    showHint={showHint}
                    itemLabel={() => null} 
                    instructionText="Match each idiom on the right to its correct definition/cue."
                />
            );
        }
        case 'COLLOCATION_MULTICHOICE_QUIZ': {
             const challenge = currentChallenge as CollocationMultichoiceQuizChallenge;
             return (
                <MultipleChoiceChallenge
                    containerRef={containerRef}
                    word={word}
                    title="Select Collocation"
                    cue={challenge.cue}
                    options={challenge.options}
                    answer={challenge.answer}
                    selected={userAnswers[currentChallengeIndex]}
                    onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                    isFinishing={isFinishing}
                    showHint={showHint}
                />
            );
        }
        case 'COLLOCATION_QUIZ': {
            const challenge = currentChallenge as CollocationQuizChallenge;
            const result = results ? results[currentChallengeIndex] : null;
            const isCorrect = typeof result === 'boolean' ? result : (result && typeof result === 'object' ? result.correct : null);

            return (
                <SimpleFillChallenge
                    containerRef={containerRef}
                    word={word}
                    title="Fill Collocation"
                    cue={challenge.cue}
                    answer={challenge.answer}
                    userAnswer={userAnswers[currentChallengeIndex]}
                    onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                    isFinishing={isFinishing}
                    result={isCorrect}
                    showHint={showHint}
                    toggleListening={toggleListening}
                    listeningId={listeningId}
                />
            );
        }
        case 'IDIOM_QUIZ': {
            const challenge = currentChallenge as IdiomQuizChallenge;
            const result = results ? results[currentChallengeIndex] : null;
            const isCorrect = typeof result === 'boolean' ? result : (result && typeof result === 'object' ? result.correct : null);

            return (
                <SimpleFillChallenge
                    containerRef={containerRef}
                    word={word}
                    title="Fill Idiom"
                    cue={challenge.cue}
                    answer={challenge.answer}
                    userAnswer={userAnswers[currentChallengeIndex]}
                    onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                    isFinishing={isFinishing}
                    result={isCorrect}
                    showHint={showHint}
                    toggleListening={toggleListening}
                    listeningId={listeningId}
                />
            );
        }
      case 'PRONUNCIATION': {
        return (
            <PronunciationChallenge 
                containerRef={containerRef}
                challenge={currentChallenge as PronunciationChallengeType}
                onAnswer={(transcript) => handleAnswerChange(currentChallengeIndex, transcript)}
                isFinishing={isFinishing}
                result={results ? results[currentChallengeIndex] : null}
            />
        );
      }
      case 'HETERONYM_QUIZ': {
          const challenge = currentChallenge as HeteronymQuizChallenge;
          const result = results ? results[currentChallengeIndex] : null;
          const isCorrect = typeof result === 'boolean' ? result : null;

          return (
            <HeteronymChallenge
                containerRef={containerRef}
                word={word}
                forms={challenge.forms}
                ipaOptions={challenge.ipaOptions}
                userAnswer={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                result={isCorrect}
                showHint={showHint}
            />
          );
      }
      case 'SENTENCE_SCRAMBLE': {
          const challenge = currentChallenge as SentenceScrambleChallenge;
          const result = results ? results[currentChallengeIndex] : null;
          const isCorrect = typeof result === 'boolean' ? result : null;

          return (
            <ScrambleChallenge
                containerRef={containerRef}
                word={word}
                original={challenge.original}
                shuffled={challenge.shuffled || []}
                userAnswer={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                isCorrect={isCorrect}
                showHint={showHint}
            />
          );
      }
      case 'SPELLING': {
        const result = results ? results[currentChallengeIndex] : null;
        const isCorrect = typeof result === 'boolean' ? result : null;

        return (
            <SpellingChallenge
                containerRef={containerRef}
                word={word}
                userAnswer={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                result={isCorrect}
                showHint={showHint}
                toggleListening={toggleListening}
                listeningId={listeningId}
            />
        );
      }
      case 'IPA_QUIZ': {
        const challenge = currentChallenge as IpaQuizChallenge;
        return (
            <MultipleChoiceChallenge
                containerRef={containerRef}
                word={word}
                title="Select Pronunciation"
                options={challenge.options}
                answer={challenge.answer}
                selected={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                showHint={showHint}
            />
        );
      }
      case 'MEANING_QUIZ': {
        const challenge = currentChallenge as MeaningQuizChallenge;
        return (
            <MultipleChoiceChallenge
                containerRef={containerRef}
                word={word}
                title="Select Definition"
                options={challenge.options}
                answer={challenge.answer}
                selected={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                showHint={showHint}
            />
        );
      }
      case 'PARAPHRASE_QUIZ': {
        const challenge = currentChallenge as ParaphraseQuizChallenge;
        const result = results ? results[currentChallengeIndex] : null;
        const isCorrect = typeof result === 'boolean' ? result : null;

        return (
            <SimpleFillChallenge
                containerRef={containerRef}
                word={word}
                title="Fill Paraphrase"
                contextTag={challenge.tone}
                cue={challenge.context}
                answer={challenge.answer}
                userAnswer={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                result={isCorrect}
                showHint={showHint}
                toggleListening={toggleListening}
                listeningId={listeningId}
            />
        );
      }
      case 'WORD_FAMILY': {
        const result = results ? results[currentChallengeIndex] : null;
        const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};
        
        return (
            <MultiFillChallenge
                containerRef={containerRef}
                word={word}
                userAnswer={userAnswers[currentChallengeIndex]}
                onAnswer={(val) => handleAnswerChange(currentChallengeIndex, val)}
                isFinishing={isFinishing}
                resultDetails={details}
                showHint={showHint}
                toggleListening={toggleListening}
                listeningId={listeningId}
            />
        );
      }
      default: return null;
    }
};
