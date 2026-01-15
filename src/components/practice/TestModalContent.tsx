import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Volume2, ArrowRight, RefreshCw, X, Mic, Square, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { VocabularyItem } from '../../app/types';
import { speak } from '../../utils/audio';
import { Challenge, ChallengeResult, IpaQuizChallenge, MeaningQuizChallenge, PrepositionQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, HeteronymQuizChallenge, PronunciationChallenge, CollocationQuizChallenge, IdiomQuizChallenge } from './TestModalTypes';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { normalizeAnswerForGrading } from '../../utils/challengeUtils';

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
                onAnswer(normalizeAnswerForGrading(finalTranscript));
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
}

export const TestModalContent: React.FC<TestModalContentProps> = ({
    word, currentChallenge, currentChallengeIndex, userAnswers, handleAnswerChange, results, isFinishing, currentPrepositionGroup, showHint
}) => {
    
    // --- PREPOSITION DRILL (GROUPED) ---
    if (currentPrepositionGroup) {
      return (
        <div className="flex flex-col animate-in fade-in duration-300">
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
              return (
                <div key={item.index} className="w-full bg-neutral-50 border-2 border-neutral-100 rounded-2xl p-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 shadow-sm transition-all focus-within:border-neutral-300 focus-within:shadow-md focus-within:bg-white">
                  {preContext && <span className="text-lg font-medium text-neutral-600 text-right">{preContext}</span>}
                  <div className="relative mx-1">
                    <input type="text" value={answer} onChange={(e) => handleAnswerChange(item.index, e.target.value)} disabled={isFinishing} className={`h-10 min-w-[80px] max-w-[160px] w-[12ch] text-center text-lg font-bold rounded-lg border-b-2 outline-none transition-colors ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700 decoration-red-500 line-through decoration-2') : 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-900 focus:bg-neutral-50'}`} placeholder="?" autoComplete="off" autoCorrect="off" autoCapitalize="off" />
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
        case 'COLLOCATION_QUIZ': {
            const challenge = currentChallenge as CollocationQuizChallenge;
            const answers = (userAnswers[currentChallengeIndex] || []) as string[];
            const result = results ? results[currentChallengeIndex] : null;
            const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};

            const handleCollocAnswerChange = (index: number, value: string) => {
                const newAnswers = [...answers];
                newAnswers[index] = value;
                handleAnswerChange(currentChallengeIndex, newAnswers);
            };

            const { missingCorrectAnswers } = useMemo(() => {
                console.group('[HINT DEBUG] Collocation Hints');
                if (!isFinishing) {
                    console.log('Not in finishing phase, no hints calculated.');
                    console.groupEnd();
                    return { missingCorrectAnswers: [] };
                }
            
                const correctAnswers = challenge.collocations.map(c => normalizeAnswerForGrading(c.answer));
                const userAnswers = answers.map(a => normalizeAnswerForGrading(a || ''));
                console.log('Raw user answers for hint calc:', answers);
                console.log('Normalized expected answers:', correctAnswers);
                console.log('Normalized user answers:', userAnswers);
                
                const correctPool = [...correctAnswers];
            
                userAnswers.forEach(uAns => {
                    const indexInPool = correctPool.indexOf(uAns);
                    if (indexInPool !== -1) {
                        console.log(`- User answer "${uAns}" matched. Consuming from hint pool.`);
                        correctPool.splice(indexInPool, 1);
                    } else {
                        console.log(`- User answer "${uAns}" is incorrect or a duplicate.`);
                    }
                });
                
                console.log('Final list of missing correct answers:', correctPool);
                console.groupEnd();
                return { missingCorrectAnswers: correctPool };
            }, [isFinishing, answers, challenge.collocations]);
            
            let missingAnswerIndex = 0;

            return (
                <div className="flex flex-col animate-in fade-in duration-300">
                    <div className="text-center space-y-2 mb-6">
                        <h3 className="text-lg font-black text-neutral-900">Collocation Recall</h3>
                        <p className="text-xs text-neutral-500 font-medium max-w-xs mx-auto">Recall the collocations for <span className="font-bold">"{word.word}"</span></p>
                    </div>
                    {showHint && !isFinishing && (
                        <div className="p-4 mb-4 bg-yellow-50 rounded-2xl border border-yellow-100 animate-in slide-in-from-top-2">
                            <p className="text-xs font-black text-yellow-600 uppercase tracking-widest mb-2">Correct Collocations</p>
                            <ul className="text-sm font-bold text-yellow-900 leading-relaxed list-disc pl-5">
                                {challenge.collocations.map(c => <li key={c.fullText}>{c.fullText}</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="space-y-4">
                        {challenge.collocations.map((colloc, index) => {
                            const answer = answers[index] || '';
                            const isAnswerCorrect = isFinishing && details[index.toString()] === true;
                            const isAnswerWrong = isFinishing && details[index.toString()] === false;
                            
                            let hintToShow: string | null = null;
                            if (isAnswerWrong && missingCorrectAnswers.length > missingAnswerIndex) {
                                const missingNormalized = missingCorrectAnswers[missingAnswerIndex];
                                const originalCase = challenge.collocations.find(c => normalizeAnswerForGrading(c.answer) === missingNormalized);
                                if (originalCase) {
                                    hintToShow = originalCase.answer;
                                    console.log(`[HINT DEBUG] For wrong input at index ${index}, assigning hint: "${hintToShow}"`);
                                    missingAnswerIndex++;
                                } else {
                                    console.log(`[HINT DEBUG] For wrong input at index ${index}, could not find original case for missing answer: "${missingNormalized}"`);
                                }
                            } else if (isAnswerWrong) {
                                console.log(`[HINT DEBUG] For wrong input at index ${index}, no more missing answers to assign.`);
                            }

                            return (
                                <div key={index} className="w-full relative">
                                    <input 
                                        type="text" 
                                        value={answer} 
                                        onChange={(e) => handleCollocAnswerChange(index, e.target.value)} 
                                        disabled={isFinishing} 
                                        className={`w-full h-10 px-4 text-base font-medium rounded-lg border-2 outline-none transition-colors ${
                                            isFinishing
                                                ? (isAnswerCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500 line-through decoration-red-400')
                                                : 'bg-white border-neutral-200 focus:border-neutral-900'
                                        }`}
                                        placeholder={`Collocation ${index + 1}...`}
                                        autoComplete="off" 
                                    />
                                    {isFinishing && isAnswerWrong && hintToShow && (
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-10">
                                            <div className="bg-neutral-900 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-1 animate-in zoom-in-95">
                                                <ArrowRight size={10} className="text-green-400"/> {hintToShow}
                                            </div>
                                            <div className="w-2 h-2 bg-neutral-900 rotate-45 absolute left-1/2 -translate-x-1/2 -top-1"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
      case 'IDIOM_QUIZ': {
            const challenge = currentChallenge as IdiomQuizChallenge;
            const answers = (userAnswers[currentChallengeIndex] || []) as string[];
            const result = results ? results[currentChallengeIndex] : null;
            const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};

            const handleIdiomAnswerChange = (index: number, value: string) => {
                const newAnswers = [...answers];
                newAnswers[index] = value;
                handleAnswerChange(currentChallengeIndex, newAnswers);
            };

            const { missingCorrectAnswers } = useMemo(() => {
                console.group('[HINT DEBUG] Idiom Hints');
                if (!isFinishing) {
                    console.log('Not in finishing phase, no hints calculated.');
                    console.groupEnd();
                    return { missingCorrectAnswers: [] };
                }
            
                const correctAnswers = challenge.idioms.map(c => normalizeAnswerForGrading(c.answer));
                const userAnswers = answers.map(a => normalizeAnswerForGrading(a || ''));
                console.log('Raw user answers for hint calc:', answers);
                console.log('Normalized expected answers:', correctAnswers);
                console.log('Normalized user answers:', userAnswers);
                
                const correctPool = [...correctAnswers];
            
                userAnswers.forEach(uAns => {
                    const indexInPool = correctPool.indexOf(uAns);
                    if (indexInPool !== -1) {
                        console.log(`- User answer "${uAns}" matched. Consuming from hint pool.`);
                        correctPool.splice(indexInPool, 1);
                    } else {
                        console.log(`- User answer "${uAns}" is incorrect or a duplicate.`);
                    }
                });
                
                console.log('Final list of missing correct answers:', correctPool);
                console.groupEnd();
                return { missingCorrectAnswers: correctPool };
            }, [isFinishing, answers, challenge.idioms]);
            
            let missingAnswerIndex = 0;
            
            return (
                <div className="flex flex-col animate-in fade-in duration-300">
                    <div className="text-center space-y-2 mb-6">
                        <h3 className="text-lg font-black text-neutral-900">Idiom Recall</h3>
                        <p className="text-xs text-neutral-500 font-medium max-w-xs mx-auto">Recall the idioms for <span className="font-bold">"{word.word}"</span></p>
                    </div>
                    {showHint && !isFinishing && (
                        <div className="p-4 mb-4 bg-yellow-50 rounded-2xl border border-yellow-100 animate-in slide-in-from-top-2">
                            <p className="text-xs font-black text-yellow-600 uppercase tracking-widest mb-2">Correct Idioms</p>
                            <ul className="text-sm font-bold text-yellow-900 leading-relaxed list-disc pl-5">
                                {challenge.idioms.map(c => <li key={c.fullText}>{c.fullText}</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="space-y-4">
                        {challenge.idioms.map((idiom, index) => {
                            const answer = answers[index] || '';
                            const isAnswerCorrect = isFinishing && details[index.toString()] === true;
                            const isAnswerWrong = isFinishing && details[index.toString()] === false;
                            
                            let hintToShow: string | null = null;
                            if (isAnswerWrong && missingCorrectAnswers.length > missingAnswerIndex) {
                                const missingNormalized = missingCorrectAnswers[missingAnswerIndex];
                                const originalCase = challenge.idioms.find(c => normalizeAnswerForGrading(c.answer) === missingNormalized);
                                if (originalCase) {
                                    hintToShow = originalCase.answer;
                                    console.log(`[HINT DEBUG] For wrong input at index ${index}, assigning hint: "${hintToShow}"`);
                                    missingAnswerIndex++;
                                } else {
                                    console.log(`[HINT DEBUG] For wrong input at index ${index}, could not find original case for missing answer: "${missingNormalized}"`);
                                }
                            } else if (isAnswerWrong) {
                                console.log(`[HINT DEBUG] For wrong input at index ${index}, no more missing answers to assign.`);
                            }

                            return (
                                <div key={index} className="w-full relative">
                                    <input 
                                        type="text" 
                                        value={answer} 
                                        onChange={(e) => handleIdiomAnswerChange(index, e.target.value)} 
                                        disabled={isFinishing} 
                                        className={`w-full h-10 px-4 text-base font-medium rounded-lg border-2 outline-none transition-colors ${
                                            isFinishing
                                                ? (isAnswerCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500 line-through decoration-red-400')
                                                : 'bg-white border-neutral-200 focus:border-neutral-900'
                                        }`}
                                        placeholder={`Idiom ${index + 1}...`}
                                        autoComplete="off" 
                                    />
                                    {isFinishing && isAnswerWrong && hintToShow && (
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-10">
                                            <div className="bg-neutral-900 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-1 animate-in zoom-in-95">
                                                <ArrowRight size={10} className="text-green-400"/> {hintToShow}
                                            </div>
                                            <div className="w-2 h-2 bg-neutral-900 rotate-45 absolute left-1/2 -translate-x-1/2 -top-1"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
      case 'PRONUNCIATION': {
        return <PronunciationChallengeUI 
            challenge={currentChallenge as PronunciationChallenge}
            onAnswer={(transcript) => handleAnswerChange(currentChallengeIndex, transcript)}
            isFinishing={isFinishing}
            result={results ? results[currentChallengeIndex] : null}
        />;
      }
      case 'HETERONYM_QUIZ': {
          const challenge = currentChallenge as HeteronymQuizChallenge;
          const currentAnswers = userAnswers[currentChallengeIndex] || {};
          const result = results ? results[currentChallengeIndex] : null;
          
          return (
              <div className="text-center space-y-6 animate-in fade-in duration-300">
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
              const isAlreadySelected = false; // We use indices to allow duplicates
              handleAnswerChange(currentChallengeIndex, [...currentSelection, wordStr]);
          };

          const handleRemoveWord = (idx: number) => {
              if (isFinishing) return;
              const next = [...currentSelection];
              next.splice(idx, 1);
              handleAnswerChange(currentChallengeIndex, next);
          };

          return (
            <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
                <div className="text-center space-y-1">
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Sentence Builder</p>
                    <p className="text-xs text-neutral-500 font-medium">Reconstruct the example sentence for "{word.word}".</p>
                </div>

                {/* Target Area */}
                <div className={`min-h-[120px] p-6 rounded-[2rem] border-2 border-dashed flex flex-wrap gap-2 items-center justify-center transition-all ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-neutral-50 border-neutral-200'}`}>
                    {currentSelection.length === 0 && !isFinishing && <span className="text-sm font-bold text-neutral-300 italic">Click words below to build sentence...</span>}
                    {currentSelection.map((w, i) => (
                        <button key={i} onClick={() => handleRemoveWord(i)} disabled={isFinishing} className={`px-3 py-2 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 ${isFinishing ? (isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-white text-neutral-900 border border-neutral-100 hover:border-neutral-300'}`}>
                            {w}
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
        return (
          <div className="text-center space-y-8 animate-in fade-in duration-300">
            <p className="text-sm font-bold text-neutral-500">Listen carefully and type the word.</p>
            <div className="space-y-6 flex flex-col items-center">
              <button onClick={() => speak(word.word)} className="p-6 bg-neutral-50 hover:bg-neutral-100 text-neutral-900 rounded-full shadow-sm transition-all active:scale-95"><Volume2 size={32} /></button>
              <div className="w-full max-w-sm relative">
                <input type="text" autoFocus value={answer || ''} onChange={e => handleAnswerChange(currentChallengeIndex, e.target.value)} disabled={isFinishing} className={`w-full text-center py-4 rounded-2xl border-2 text-3xl font-bold focus:outline-none tracking-[0.1em] placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : 'bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm'}`} placeholder="TYPE HERE" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
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
          <div className="text-center space-y-6 animate-in fade-in duration-300">
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
          <div className="text-center space-y-6 animate-in fade-in duration-300 flex flex-col">
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
        return (
          <div className="text-center space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
            <div className="space-y-4"><p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Recall Word Power</p><h2 className="text-3xl font-black text-neutral-900">{word.word}</h2><div className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200"><span className="text-[9px] font-black uppercase bg-white px-1.5 py-0.5 rounded border border-neutral-200 text-neutral-500">{challenge.tone}</span><span className="text-xs font-bold text-neutral-700 italic">{challenge.context}</span></div></div>
            <div className="w-full max-w-xs relative">
                <input type="text" autoFocus value={answer || ''} onChange={e => handleAnswerChange(currentChallengeIndex, e.target.value)} disabled={isFinishing} className={`w-full text-center py-4 rounded-2xl border-2 text-xl font-bold focus:outline-none placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : 'bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm'}`} placeholder="Type synonym..." autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                {((isFinishing && isWrong) || showHint) && <div className="mt-3 text-green-600 font-bold text-lg animate-in slide-in-from-top-2 bg-green-50 px-3 py-1 rounded-lg border border-green-100 inline-block">{challenge.answer}</div>}
            </div>
          </div>
        );
      }
      case 'WORD_FAMILY': {
        const answer = userAnswers[currentChallengeIndex] || {};
        const result = results ? results[currentChallengeIndex] : null;
        const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};
        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <p className="text-sm font-bold text-neutral-500 text-center">Recall related word forms.</p>
                <div className="grid grid-cols-1 gap-4">
                    {['nouns', 'verbs', 'adjs', 'advs'].map((type) => {
                        const forms = word.wordFamily?.[type as keyof typeof word.wordFamily] || [];
                        if (forms.filter(f => !f.isIgnored).length === 0) return null;
                        const label = { nouns: 'Noun', verbs: 'Verb', adjs: 'Adjective', advs: 'Adverb' }[type as keyof typeof details];
                        const val = answer[type] || '';
                        const isTypeCorrect = details[type];
                        const showFeedback = isFinishing;
                        return (
                            <div key={type} className="flex items-center gap-3">
                                <span className="w-20 text-[10px] font-black uppercase text-neutral-400 text-right">{label}</span>
                                <div className="flex-1 relative">
                                    <input type="text" value={val} onChange={e => handleAnswerChange(currentChallengeIndex, { ...answer, [type]: e.target.value })} disabled={isFinishing} className={`w-full px-4 py-2 bg-neutral-50 border-2 rounded-xl text-sm font-bold outline-none transition-all ${showFeedback ? (isTypeCorrect ? 'border-green-500 bg-green-50 text-green-800' : 'border-red-500 bg-red-50 text-red-800') : 'border-neutral-100 focus:border-neutral-900 focus:bg-white'}`} placeholder="..." />
                                    {((showFeedback && !isTypeCorrect) || showHint) && <div className="text-[10px] font-bold text-green-600 mt-1 pl-1">{forms.filter(f => !f.isIgnored).map(f => f.word).join(', ')}</div>}
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
