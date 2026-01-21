import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Volume2, ArrowRight, RefreshCw, X, Mic, Square, CheckCircle, XCircle, AlertTriangle, Check } from 'lucide-react';
import { VocabularyItem } from '../../app/types';
import { speak } from '../../utils/audio';
import { Challenge, ChallengeResult, IpaQuizChallenge, MeaningQuizChallenge, PrepositionQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, HeteronymQuizChallenge, PronunciationChallenge, CollocationQuizChallenge, IdiomQuizChallenge, ParaphraseContextQuizChallenge, ParaphraseContextQuizItem } from './TestModalTypes';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';

// --- START of new component for Paraphrase Context Quiz ---
interface ParaphraseContextQuizProps {
    challenge: ParaphraseContextQuizChallenge;
    answer: Map<string, string> | undefined;
    onAnswer: (answer: Map<string, string>) => void;
    isFinishing: boolean;
    result: ChallengeResult | null;
    showHint: boolean;
}

interface GameItemUI {
    id: string;
    text: string;
    pairId: string;
    tone?: string;
    state: 'default' | 'selected';
    matchId?: string;
}

const ParaphraseContextQuizUI: React.FC<ParaphraseContextQuizProps> = ({ challenge, answer, onAnswer, isFinishing, result, showHint }) => {
    const [contexts, setContexts] = useState<GameItemUI[]>(challenge.contexts.map(c => ({...c, state: 'default'})));
    const [paraphrases, setParaphrases] = useState<GameItemUI[]>(challenge.paraphrases.map(p => ({...p, state: 'default'})));
    const [selectedParaphraseId, setSelectedParaphraseId] = useState<string | null>(null);

    const updateAnswer = (contextId: string, paraphraseId: string | null) => {
        const newAnswer = new Map(answer);
        if (paraphraseId === null) {
            newAnswer.delete(contextId);
        } else {
            for (const [key, value] of newAnswer.entries()) {
                if (value === paraphraseId) newAnswer.delete(key);
            }
            newAnswer.set(contextId, paraphraseId);
        }
        onAnswer(newAnswer);
    };

    useEffect(() => {
        const newContexts: GameItemUI[] = [...challenge.contexts.map(c => ({...c, state: 'default' as const}))];
        const newParaphrases: GameItemUI[] = [...challenge.paraphrases.map(p => ({...p, state: 'default' as const}))];
        const usedParaphraseIds = new Set<string>();

        if (answer) {
            for (const [contextId, paraphraseId] of answer.entries()) {
                const contextIndex = newContexts.findIndex(c => c.id === contextId);
                if (contextIndex !== -1) newContexts[contextIndex].matchId = paraphraseId;
                usedParaphraseIds.add(paraphraseId);
            }
        }
        setContexts(newContexts);
        setParaphrases(newParaphrases);
    }, [answer, challenge]);

    const handleParaphraseSelect = (id: string) => {
        if (isFinishing) return;
        setSelectedParaphraseId(currentId => currentId === id ? null : id);
    };

    const handleContextSelect = (contextId: string) => {
        if (isFinishing || !selectedParaphraseId) return;
        updateAnswer(contextId, selectedParaphraseId);
        setSelectedParaphraseId(null);
    };
    
    const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};

    const handleReset = () => {
        if (!isFinishing) {
            onAnswer(new Map());
        }
    };

    return (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="text-center">
                <p className="text-xs text-neutral-500 font-medium">Match each phrase on the right to its correct context on the left.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                    {contexts.map(item => {
                        const isCorrect = isFinishing && details[item.id] === true;
                        const isIncorrect = isFinishing && details[item.id] === false;
                        const matchedParaphrase = challenge.paraphrases.find(p => p.id === item.matchId);
                        const correctParaphraseText = challenge.paraphrases.find(p => p.pairId === item.pairId)?.text;

                        let borderClass = 'border-neutral-200';
                        if (isFinishing) {
                            if (isCorrect) borderClass = 'border-green-400 bg-green-50';
                            if (isIncorrect) borderClass = 'border-red-400 bg-red-50';
                        } else if (showHint) {
                            borderClass = 'border-yellow-400 bg-yellow-50';
                        }
                        else if (item.matchId) {
                           borderClass = 'border-neutral-400 bg-neutral-50';
                        }
                        
                        return (
                            <button key={item.id} onClick={() => handleContextSelect(item.id)} disabled={isFinishing || !selectedParaphraseId} className={`relative w-full p-3 rounded-xl border-2 text-left transition-all duration-200 ${borderClass} disabled:cursor-not-allowed`}>
                                {item.tone && (
                                    <span className="inline-block text-[9px] font-black uppercase bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded border border-neutral-200 mb-1">
                                        {item.tone}
                                    </span>
                                )}
                                <p className="font-medium text-xs leading-snug text-neutral-600">{item.text}</p>
                                
                                {item.matchId && !isFinishing && !showHint && <p className="font-bold text-xs mt-2 pt-2 border-t border-neutral-200">{matchedParaphrase?.text}</p>}
                                
                                {showHint && !isFinishing && (
                                    <div className="mt-2 pt-2 border-t flex items-center gap-2 text-yellow-700 animate-in fade-in">
                                        <Check size={14} className="text-yellow-600"/>
                                        <p className="font-bold text-xs">{correctParaphraseText}</p>
                                    </div>
                                )}

                                {isFinishing && (
                                    <div className="mt-2 pt-2 border-t flex items-center gap-2">
                                        {isCorrect ? <Check size={14} className="text-green-500"/> : <X size={14} className="text-red-500"/>}
                                        <p className={`font-bold text-xs ${isIncorrect ? 'text-red-700' : 'text-green-700'}`}>{matchedParaphrase?.text || 'No selection'}</p>
                                    </div>
                                )}
                                {isFinishing && isIncorrect && <p className="text-[10px] text-green-700 font-bold mt-1">Correct: {correctParaphraseText}</p>}
                            </button>
                        );
                    })}
                </div>
                <div className="space-y-3">
                    {challenge.paraphrases.map(item => {
                        const isSelected = selectedParaphraseId === item.id;
                        const isUsed = answer?.has(contexts.find(c => c.matchId === item.id)?.id || '');

                        let buttonClass = `bg-white border-neutral-200 text-neutral-800 hover:border-neutral-900`;
                        if (isFinishing && isUsed) {
                            buttonClass = `bg-neutral-100 border-neutral-200 text-neutral-400 opacity-60`;
                        } else if (isSelected) {
                            buttonClass = `bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100`;
                        } else if (isUsed) {
                            buttonClass = `bg-neutral-100 border-neutral-200 text-neutral-400 opacity-60`;
                        }
                        
                        return (
                             <button key={item.id} onClick={() => handleParaphraseSelect(item.id)} disabled={isFinishing || isUsed} className={`w-full p-3 rounded-xl border-2 text-left transition-all duration-200 disabled:cursor-not-allowed ${buttonClass}`}>
                                <p className="font-bold text-sm leading-snug">{item.text}</p>
                            </button>
                        );
                    })}
                </div>
            </div>
            {answer && answer.size > 0 && !isFinishing && (
                <div className="flex justify-center pt-2">
                    <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                        <RefreshCw size={12} /> Reset
                    </button>
                </div>
            )}
        </div>
    );
};
// --- END of new component ---


// New component for the Pronunciation Challenge
const PronunciationChallengeUI: React.FC<{
    challenge: PronunciationChallenge;
    onAnswer: (answer: string) => void;
    isFinishing: boolean;
    result: ChallengeResult | null;
}> = ({ challenge, onAnswer, isFinishing, result }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionManager = useRef(new SpeechRecognitionManager());

    useEffect(() => {
        // Cleanup function to stop recognition when the component unmounts
        return () => {
            recognitionManager.current.stop();
        };
    }, []);

    const startNewRecording = () => {
        setTranscript(''); // Clear previous transcript for the new attempt.
        setIsRecording(true);
        recognitionManager.current.start(
            (final, interim) => setTranscript(final + interim),
            (finalTranscript) => {
                setIsRecording(false);
                onAnswer(finalTranscript);
            }
        );
    };

    const stopCurrentRecording = () => {
        recognitionManager.current.stop();
        // isRecording will be set to false in the onEnd callback of the recognition manager
    };

    const handleToggleRecording = () => {
        if (isRecording) {
            stopCurrentRecording();
        } else {
            startNewRecording();
        }
    };
    
    const isCorrect = result === true;
    const isWrong = result === false;
    
    return (
        <div className="text-center space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
            <p className="text-sm font-bold text-neutral-500">Press the button and pronounce the word below.</p>
            <h2 className="text-4xl font-black text-neutral-900 tracking-tight">{challenge.word.word}</h2>
            
            <button 
                onClick={handleToggleRecording} 
                disabled={isFinishing}
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50
                    ${isRecording ? 'bg-neutral-900 text-white animate-pulse' : 'bg-red-600 text-white hover:scale-105 shadow-red-500/30'}`}
            >
                {isRecording ? <Square size={32} fill="white" /> : <Mic size={32} />}
            </button>
            
            <div className="w-full max-w-sm min-h-[6rem] p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-medium text-neutral-600 italic">
                {transcript || '...'}
            </div>

            {isFinishing && (
                <div className={`flex items-center gap-2 font-bold text-lg animate-in fade-in slide-in-from-bottom-2 ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                    {isCorrect ? <CheckCircle size={20} /> : <XCircle size={20} />}
                    <span>{isCorrect ? 'Correct!' : `Not quite. The word was "${challenge.word.word}".`}</span>
                </div>
            )}
        </div>
    );
};


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
    const [validationState, setValidationState] = useState<Record<string, 'correct' | 'incorrect' | null>>({});
    
    // Reset validation state when challenge changes
    useEffect(() => {
        setValidationState({});
    }, [currentChallengeIndex, currentPrepositionGroup]);

    // Auto-focus logic
    useEffect(() => {
        const focusInput = () => {
             const firstInput = containerRef.current?.querySelector('input[type="text"]:not([disabled]), textarea:not([disabled])') as HTMLInputElement | HTMLTextAreaElement;
             // If focus is currently NOT inside our container, force it.
             if (firstInput && !containerRef.current?.contains(document.activeElement)) {
                 firstInput.focus();
             }
        };

        // Try focusing on mount/update
        setTimeout(focusInput, 50);

        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            
            // If user types a printable char
            if (e.key.length === 1) {
                const active = document.activeElement;
                const isInsideModal = containerRef.current?.contains(active);
                
                // If focus is NOT inside the modal (e.g. it's on body or Library Search)
                // We want to capture it into the modal input.
                if (!isInsideModal) {
                     focusInput();
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [currentChallengeIndex]); // Re-run when challenge changes to find new input

    // Helper for Smart Input (space to fill answer) & Enter Key
    // Changed: Appends HEADWORD (word.word) instead of replacing whole text if text exists.
    const handleSmartChange = (
        e: React.ChangeEvent<HTMLInputElement>, 
        onChange: (val: string) => void, 
        fillValue: string
    ) => {
        const val = e.target.value;
        if (val === ' ') {
            onChange(fillValue);
        } else if (val.endsWith('  ')) {
            const prefix = val.substring(0, val.length - 2);
            const separator = prefix.length > 0 ? ' ' : '';
            onChange(prefix + separator + fillValue);
        } else {
            onChange(val);
        }
    };

    // Validation Logic for Escape Key
    const handleValidationKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        key: string,
        correctValues: string | string[]
    ) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            
            const val = e.currentTarget.value;
            // Normalizer: trim, lowercase, remove non-alphanumeric chars
            const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            
            let isCorrect = false;

            if (Array.isArray(correctValues)) {
                // Handle multiple inputs (e.g. Word Family) separated by commas
                const userInputs = val.split(',').map(normalize).filter(Boolean);
                
                if (userInputs.length === 0) {
                     setValidationState(prev => ({ ...prev, [key]: null }));
                     return;
                }

                // Create a set of normalized correct values
                const correctSet = new Set(correctValues.map(normalize));
                
                // All user inputs must be valid members of the correct set
                // This allows the user to input a subset of the correct answers and still get a 'correct' validation
                isCorrect = userInputs.every(input => correctSet.has(input));

            } else {
                const normalizedVal = normalize(val);
                if (!normalizedVal) {
                     setValidationState(prev => ({ ...prev, [key]: null }));
                     return;
                }
                isCorrect = normalize(correctValues) === normalizedVal;
            }
            
            setValidationState(prev => ({ ...prev, [key]: isCorrect ? 'correct' : 'incorrect' }));
        }
    };

    const clearValidation = (key: string) => {
        setValidationState(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const getValidationClass = (key: string) => {
        const status = validationState[key];
        if (status === 'correct') return '!border-green-500 !ring-2 !ring-green-100 !bg-green-50 text-green-900';
        if (status === 'incorrect') return '!border-red-500 !ring-2 !ring-red-100 !bg-red-50 text-red-900';
        return '';
    };

    // --- PREPOSITION DRILL (GROUPED) ---
    if (currentPrepositionGroup) {
      return (
        <div ref={containerRef} className="flex flex-col animate-in fade-in duration-300">
          <div className="text-center space-y-2 mb-6">
            <h3 className="text-lg font-black text-neutral-900">Preposition Drill</h3>
            <p className="text-xs text-neutral-500 font-medium max-w-xs mx-auto">Complete the collocations. Type the missing preposition(s).</p>
          </div>
          <div className="space-y-4">
            {currentPrepositionGroup.group.map((item) => {
              const answer = userAnswers[item.index] || '';
              const result = results ? results[item.index] : null;
              const isCorrect = typeof result === 'boolean' ? result : (result && typeof result === 'object' ? result.correct : false);
              const isWrong = result !== null && !isCorrect;
              const parts = item.challenge.example.split('___');
              const preContext = parts[0]?.trim();
              const postContext = parts[1]?.trim();
              const validationKey = `prep-${item.index}`;

              return (
                <div key={item.index} className="w-full bg-neutral-50 border-2 border-neutral-100 rounded-2xl p-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 shadow-sm transition-all focus-within:border-neutral-300 focus-within:shadow-md focus-within:bg-white">
                  {preContext && <span className="text-lg font-medium text-neutral-600 text-right">{preContext}</span>}
                  <div className="relative mx-1">
                    <input 
                        type="text" 
                        value={answer} 
                        // Preposition drill keeps original fill behavior (answer) because headword doesn't make sense here.
                        onChange={(e) => {
                            clearValidation(validationKey);
                            handleSmartChange(e, (val) => handleAnswerChange(item.index, val), item.challenge.answer);
                        }}
                        onKeyDown={(e) => {
                            handleValidationKeyDown(e, validationKey, item.challenge.answer);
                        }}
                        disabled={isFinishing} 
                        className={`h-10 min-w-[80px] max-w-[160px] w-[12ch] text-center text-lg font-bold rounded-lg border-b-2 outline-none transition-colors ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700 decoration-red-500 line-through decoration-2') : `bg-white border-neutral-300 text-neutral-900 focus:border-neutral-900 focus:bg-neutral-50 ${getValidationClass(validationKey)}`}`} 
                        placeholder="?" 
                        autoComplete="off" 
                        autoCorrect="off" 
                        autoCapitalize="off" 
                    />
                    {((isFinishing && isWrong) || showHint) && (<div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-10"><div className="bg-neutral-900 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-1 animate-in zoom-in-95"><ArrowRight size={10} className="text-green-400"/> {item.challenge.answer}</div><div className="w-2 h-2 bg-neutral-900 rotate-45 absolute left-1/2 -translate-x-1/2 -top-1"></div></div>)}
                  </div>
                  {postContext && <span className="text-lg font-medium text-neutral-800 text-left">{postContext}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // --- OTHER CHALLENGES ---
    switch (currentChallenge.type) {
        case 'PARAPHRASE_CONTEXT_QUIZ': {
            const challenge = currentChallenge as ParaphraseContextQuizChallenge;
            return (
                <div ref={containerRef}>
                    <ParaphraseContextQuizUI
                        challenge={challenge}
                        answer={userAnswers[currentChallengeIndex]}
                        onAnswer={(newAnswer) => handleAnswerChange(currentChallengeIndex, newAnswer)}
                        isFinishing={isFinishing}
                        result={results ? results[currentChallengeIndex] : null}
                        showHint={showHint}
                    />
                </div>
            );
        }
        case 'COLLOCATION_QUIZ':
        case 'IDIOM_QUIZ': {
            const challenge = currentChallenge as CollocationQuizChallenge | IdiomQuizChallenge;
            const answer = userAnswers[currentChallengeIndex];
            const result = results ? results[currentChallengeIndex] : null;
            const isCorrect = result === true;
            const isWrong = result === false;
            
            const isColloc = challenge.type === 'COLLOCATION_QUIZ';
            const validationKey = 'main';
    
            return (
              <div ref={containerRef} className="text-center space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                    {isColloc ? 'Recall Collocation' : 'Recall Idiom'}
                  </p>
                  <h2 className="text-3xl font-black text-neutral-900">{word.word}</h2>
                  <div className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200 max-w-sm">
                      <span className="text-xs font-bold text-neutral-700 italic">{challenge.cue}</span>
                  </div>
                </div>
                <div className="w-full max-w-md relative">
                    <input 
                        type="text" 
                        autoFocus 
                        value={answer || ''} 
                        // Fill with HEADWORD, not the full answer, to allow modifying base word.
                        onChange={(e) => {
                            clearValidation(validationKey);
                            handleSmartChange(e, (val) => handleAnswerChange(currentChallengeIndex, val), word.word);
                        }} 
                        onKeyDown={(e) => {
                            handleValidationKeyDown(e, validationKey, challenge.answer);
                        }}
                        disabled={isFinishing} 
                        className={`w-full text-center py-4 rounded-2xl border-2 text-xl font-bold focus:outline-none placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : `bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm ${getValidationClass(validationKey)}`}`}
                        placeholder={`Type the ${isColloc ? 'collocation' : 'idiom'}...`}
                        autoComplete="off" 
                    />
                    {((isFinishing && isWrong) || showHint) && <div className="mt-3 text-green-600 font-bold text-lg animate-in slide-in-from-top-2 bg-green-50 px-3 py-1 rounded-lg border border-green-100 inline-block">{challenge.answer}</div>}
                </div>
              </div>
            );
        }
      case 'PRONUNCIATION': {
        return (
            <div ref={containerRef}>
                <PronunciationChallengeUI 
                    challenge={currentChallenge as PronunciationChallenge}
                    onAnswer={(transcript) => handleAnswerChange(currentChallengeIndex, transcript)}
                    isFinishing={isFinishing}
                    result={results ? results[currentChallengeIndex] : null}
                />
            </div>
        );
      }
      case 'HETERONYM_QUIZ': {
          const challenge = currentChallenge as HeteronymQuizChallenge;
          const currentAnswers = userAnswers[currentChallengeIndex] || {};
          const result = results ? results[currentChallengeIndex] : null;
          
          return (
              <div ref={containerRef} className="text-center space-y-6 animate-in fade-in duration-300">
                  <p className="text-sm font-bold text-neutral-500">
                      The word <span className="font-black text-neutral-900">"{word.word}"</span> has different pronunciations. Match the IPA to the part of speech.
                  </p>
                  <div className="space-y-6">
                      {challenge.forms.map(form => {
                          const selectedIpa = currentAnswers[form.pos];
                          
                          return (
                              <div key={form.pos} className="space-y-3">
                                  <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest bg-neutral-100 py-1 rounded-md">
                                      As a {form.pos}
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2">
                                      {challenge.ipaOptions.map(option => {
                                          let stateClass = "bg-white border-neutral-200 hover:border-neutral-400 text-neutral-600";
                                          if (isFinishing) {
                                              if (option === form.ipa) stateClass = "bg-green-50 border-green-500 text-green-700 shadow-md";
                                              else if (option === selectedIpa) stateClass = "bg-red-50 border-red-500 text-red-700 opacity-60";
                                              else stateClass = "bg-neutral-50 border-neutral-100 text-neutral-400 opacity-50";
                                          } else if (selectedIpa === option) {
                                              stateClass = "bg-neutral-900 border-neutral-900 text-white shadow-lg";
                                          }
                                          
                                          return (
                                              <button 
                                                  key={option}
                                                  disabled={isFinishing}
                                                  onClick={() => handleAnswerChange(currentChallengeIndex, {...currentAnswers, [form.pos]: option})}
                                                  className={`p-3 rounded-xl border-2 font-mono text-base font-medium transition-all duration-200 ${stateClass}`}
                                              >
                                                  {option}
                                              </button>
                                          );
                                      })}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
                  {isFinishing && result === false && !showHint &&
                      <div className="text-center text-rose-600 font-bold text-sm">One or more selections were incorrect.</div>
                  }
              </div>
          );
      }
      case 'SENTENCE_SCRAMBLE': {
          const challenge = currentChallenge as SentenceScrambleChallenge;
          const currentSelection = (userAnswers[currentChallengeIndex] || []) as string[];
          const result = results ? results[currentChallengeIndex] : null;
          const isCorrect = result === true;
          
          // Map to track used indices to allow duplicates words in sentence
          const usedIndices = new Set<number>();
          currentSelection.forEach(wordStr => {
              const idx = challenge.shuffled.findIndex((w, i) => w === wordStr && !usedIndices.has(i));
              if (idx !== -1) usedIndices.add(idx);
          });

          const handleToggleWord = (wordStr: string, sourceIndex: number) => {
              if (isFinishing) return;
              handleAnswerChange(currentChallengeIndex, [...currentSelection, wordStr]);
          };

          const handleRemoveWord = (idxToRemove: number) => {
              if (isFinishing) return;
              const next = [...currentSelection];
              next.splice(idxToRemove, 1);
              handleAnswerChange(currentChallengeIndex, next);
          };

          return (
            <div ref={containerRef} className="flex flex-col space-y-6 animate-in fade-in duration-300">
                <div className="text-center space-y-1">
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Sentence Builder</p>
                    <p className="text-xs text-neutral-500 font-medium">Reconstruct the example sentence for "{word.word}".</p>
                </div>

                {/* Target Area */}
                <div className={`min-h-[120px] p-6 rounded-[2rem] border-2 border-dashed flex flex-wrap gap-2 items-center justify-center transition-all ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-neutral-50 border-neutral-200'}`}>
                    {currentSelection.length === 0 && !isFinishing && <span className="text-sm font-bold text-neutral-300 italic">Click words below to build sentence...</span>}
                    {currentSelection.map((w, i) => (
                        <button key={i} onClick={() => handleRemoveWord(i)} disabled={isFinishing} className={`px-3 py-2 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 ${isFinishing ? (isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-white text-neutral-900 border border-neutral-100 hover:border-neutral-300'}`}>
                            {w} <X size={14} className="inline-block ml-1" />
                        </button>
                    ))}
                </div>

                {/* Feedback/Hint */}
                {(isFinishing || showHint) && (
                    <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100 animate-in slide-in-from-top-2">
                        <p className="text-xs font-black text-yellow-600 uppercase tracking-widest mb-1">Correct Sentence</p>
                        <p className="text-sm font-bold text-yellow-900 leading-relaxed">{challenge.original}</p>
                    </div>
                )}

                {/* Source Pool */}
                <div className="flex flex-wrap gap-2 justify-center pt-4">
                    {challenge.shuffled.map((w, i) => {
                        const isUsed = usedIndices.has(i);
                        return (
                            <button key={i} onClick={() => handleToggleWord(w, i)} disabled={isUsed || isFinishing} className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${isUsed ? 'bg-neutral-100 text-neutral-300 border-transparent cursor-default' : 'bg-white border-2 border-neutral-100 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 shadow-sm'}`}>
                                {w}
                            </button>
                        );
                    })}
                </div>

                {!isFinishing && currentSelection.length > 0 && (
                    <button onClick={() => handleAnswerChange(currentChallengeIndex, [])} className="mx-auto flex items-center space-x-1.5 text-[10px] font-black uppercase text-neutral-400 hover:text-neutral-600 transition-colors">
                        <X size={12} /><span>Reset</span>
                    </button>
                )}
            </div>
          );
      }
      case 'SPELLING': {
        const answer = userAnswers[currentChallengeIndex];
        const result = results ? results[currentChallengeIndex] : null;
        const isCorrect = result === true;
        const isWrong = result === false;
        const validationKey = 'main';

        return (
          <div ref={containerRef} className="text-center space-y-8 animate-in fade-in duration-300">
            <p className="text-sm font-bold text-neutral-500">Listen carefully and type the word.</p>
            <div className="space-y-6 flex flex-col items-center">
              <button onClick={() => speak(word.word)} className="p-6 bg-neutral-50 hover:bg-neutral-100 text-neutral-900 rounded-full shadow-sm transition-all active:scale-95"><Volume2 size={32} /></button>
              <div className="w-full max-w-sm relative">
                <input 
                    type="text" 
                    autoFocus 
                    value={answer || ''} 
                    onChange={(e) => {
                        clearValidation(validationKey);
                        handleSmartChange(e, (val) => handleAnswerChange(currentChallengeIndex, val), word.word);
                    }} 
                    onKeyDown={(e) => {
                        handleValidationKeyDown(e, validationKey, word.word);
                    }}
                    disabled={isFinishing} 
                    className={`w-full text-center py-4 rounded-2xl border-2 text-3xl font-bold focus:outline-none tracking-[0.1em] placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : `bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm ${getValidationClass(validationKey)}`}`} 
                    placeholder="TYPE HERE" 
                    autoComplete="off" 
                    autoCorrect="off" 
                    autoCapitalize="off" 
                    spellCheck="false" 
                />
                {((isFinishing && isWrong) || showHint) && <div className="mt-4 text-xl font-black text-yellow-500 animate-in fade-in slide-in-from-bottom-2">{word.word}</div>}
              </div>
            </div>
          </div>
        );
      }
      case 'IPA_QUIZ': {
        const challenge = currentChallenge as IpaQuizChallenge;
        const selected = userAnswers[currentChallengeIndex];
        return (
          <div ref={containerRef} className="text-center space-y-6 animate-in fade-in duration-300">
            <p className="text-sm font-bold text-neutral-500">Select the correct pronunciation for "{word.word}".</p>
            <div className="grid grid-cols-1 gap-3">
              {challenge.options.map((option, idx) => {
                let stateClass = "bg-white border-neutral-200 hover:border-neutral-400 text-neutral-600";
                if (isFinishing) {
                    if (option === challenge.answer) stateClass = "bg-green-50 border-green-500 text-green-700 shadow-md";
                    else if (option === selected && option !== challenge.answer) stateClass = "bg-red-50 border-red-500 text-red-700 opacity-60";
                    else stateClass = "bg-neutral-50 border-neutral-100 text-neutral-400 opacity-50";
                } else if (showHint && option === challenge.answer) { stateClass = "bg-yellow-50 border-yellow-400 text-yellow-700 shadow-md ring-1 ring-yellow-400"; } 
                else if (selected === option) { stateClass = "bg-neutral-900 border-neutral-900 text-white shadow-lg"; }
                return (<button key={idx} disabled={isFinishing} onClick={() => handleAnswerChange(currentChallengeIndex, option)} className={`p-4 rounded-2xl border-2 font-mono text-lg font-medium transition-all duration-200 ${stateClass}`}>{option}</button>);
              })}
            </div>
          </div>
        );
      }
      case 'MEANING_QUIZ': {
        const challenge = currentChallenge as MeaningQuizChallenge;
        const selected = userAnswers[currentChallengeIndex];
        return (
          <div ref={containerRef} className="text-center space-y-6 animate-in fade-in duration-300 flex flex-col">
            <div className="space-y-1"><p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Identify Definition</p><h2 className="text-3xl font-black text-neutral-900">{word.word}</h2></div>
            <div className="grid grid-cols-1 gap-3">
              {challenge.options.map((option, idx) => {
                let stateClass = "bg-white border-neutral-200 hover:border-neutral-400 text-neutral-700";
                if (isFinishing) {
                    if (option === challenge.answer) stateClass = "bg-green-50 border-green-500 text-green-700 shadow-md ring-1 ring-green-500";
                    else if (option === selected && option !== challenge.answer) stateClass = "bg-red-50 border-red-500 text-red-700 opacity-60";
                    else stateClass = "bg-neutral-50 border-neutral-100 text-neutral-400 opacity-40";
                } else if (showHint && option === challenge.answer) { stateClass = "bg-yellow-50 border-yellow-400 text-yellow-800 shadow-md ring-1 ring-yellow-400"; } 
                else if (selected === option) { stateClass = "bg-neutral-900 border-neutral-900 text-white shadow-lg"; }
                return (<button key={idx} disabled={isFinishing} onClick={() => handleAnswerChange(currentChallengeIndex, option)} className={`p-4 rounded-2xl border-2 text-sm font-medium transition-all duration-200 text-left leading-snug active:scale-[0.98] ${stateClass}`}>{option}</button>);
              })}
            </div>
          </div>
        );
      }
      case 'PARAPHRASE_QUIZ': {
        const challenge = currentChallenge as ParaphraseQuizChallenge;
        const answer = userAnswers[currentChallengeIndex];
        const result = results ? results[currentChallengeIndex] : null;
        const isCorrect = result === true;
        const isWrong = result === false;
        const validationKey = 'main';

        return (
          <div ref={containerRef} className="text-center space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
            <div className="space-y-4"><p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Recall Word Power</p><h2 className="text-3xl font-black text-neutral-900">{word.word}</h2><div className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200"><span className="text-[9px] font-black uppercase bg-white px-1.5 py-0.5 rounded border border-neutral-200 text-neutral-500">{challenge.tone}</span><span className="text-xs font-bold text-neutral-700 italic">{challenge.context}</span></div></div>
            <div className="w-full max-w-xs relative">
                <input 
                    type="text" 
                    autoFocus 
                    value={answer || ''} 
                    // Fill with HEADWORD to allow modifying base word to synonym if needed or skip logic
                    onChange={(e) => {
                        clearValidation(validationKey);
                        handleSmartChange(e, (val) => handleAnswerChange(currentChallengeIndex, val), word.word);
                    }} 
                    onKeyDown={(e) => {
                        handleValidationKeyDown(e, validationKey, challenge.answer);
                    }}
                    disabled={isFinishing} 
                    className={`w-full text-center py-4 rounded-2xl border-2 text-xl font-bold focus:outline-none placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : `bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm ${getValidationClass(validationKey)}`}`} 
                    placeholder="Type synonym..." 
                    autoComplete="off" 
                    autoCorrect="off" 
                    autoCapitalize="off" 
                    spellCheck="false" 
                />
                {((isFinishing && isWrong) || showHint) && <div className="mt-3 text-green-600 font-bold text-lg animate-in slide-in-from-top-2 bg-green-50 px-3 py-1 rounded-lg border border-green-100 inline-block">{challenge.answer}</div>}
            </div>
          </div>
        );
      }
      case 'WORD_FAMILY': {
        const answer = userAnswers[currentChallengeIndex] || {};
        const result = results ? results[currentChallengeIndex] : null;
        const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};
        // FIX: Use currentChallenge instead of undefined 'challenge'
        const forms = currentChallenge.word.wordFamily;
        return (
            <div ref={containerRef} className="space-y-6 animate-in fade-in duration-300">
                <p className="text-sm font-bold text-neutral-500 text-center">Recall related word forms.</p>
                <div className="grid grid-cols-1 gap-4">
                    {['nouns', 'verbs', 'adjs', 'advs'].map((type) => {
                        const correctForms = (forms?.[type as keyof typeof forms] || []).filter(f => !f.isIgnored).map(f => f.word);
                        if (correctForms.length === 0) return null;
                        
                        const label = { nouns: 'Noun', verbs: 'Verb', adjs: 'Adjective', advs: 'Adverb' }[type as keyof typeof details];
                        const val = answer[type] || '';
                        const isTypeCorrect = details[type];
                        const showFeedback = isFinishing;
                        const validationKey = `fam-${type}`;
                        
                        // Pick first correct form as "answer" for auto-complete
                        const primaryCorrect = correctForms[0] || '';

                        return (
                            <div key={type} className="flex items-center gap-3">
                                <span className="w-20 text-[10px] font-black uppercase text-neutral-400 text-right">{label}</span>
                                <div className="flex-1 relative">
                                    <input 
                                        type="text" 
                                        value={val} 
                                        // Fill with HEADWORD, allowing user to modify suffix
                                        onChange={e => {
                                            clearValidation(validationKey);
                                            handleSmartChange(e, (newVal) => handleAnswerChange(currentChallengeIndex, { ...answer, [type]: newVal }), word.word);
                                        }} 
                                        onKeyDown={(e) => {
                                            handleValidationKeyDown(e, validationKey, correctForms);
                                        }}
                                        disabled={isFinishing} 
                                        className={`w-full px-4 py-2 bg-neutral-50 border-2 rounded-xl text-sm font-bold outline-none transition-all ${showFeedback ? (isTypeCorrect ? 'border-green-500 bg-green-50 text-green-800' : 'border-red-500 bg-red-50 text-red-800') : `border-neutral-100 focus:border-neutral-900 focus:bg-white ${getValidationClass(validationKey)}`}`} 
                                        placeholder="..." 
                                    />
                                    {((showFeedback && !isTypeCorrect) || showHint) && <div className="text-[10px] font-bold text-green-600 mt-1 pl-1">{(forms?.[type as keyof typeof forms] || []).filter(f => !f.isIgnored).map(f => f.word).join(', ')}</div>}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
      }
      default: return null;
    }
};