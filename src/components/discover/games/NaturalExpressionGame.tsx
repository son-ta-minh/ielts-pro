
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, CheckCircle2, Mic, Volume2, Info, ArrowRight, MessageSquare, SkipForward } from 'lucide-react';
import { NativeSpeakAnswer } from '../../../app/types';
import * as db from '../../../app/db';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';
import { speak } from '../../../utils/audio';
import { SpeechRecognitionManager } from '../../../utils/speechRecognition';

interface Props {
    userId: string;
    onComplete: (score: number) => void;
    onExit: () => void;
}

type GameMode = 'MASTER' | 'REVIEW';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface GameQuestion {
    id: string; // Unique question ID
    nativeSpeakItemId: string; // Parent Item ID
    answerIndex: number; // Index in the parent item's answers array
    answer: NativeSpeakAnswer;
    maskedSentence: string;
    choices?: string[]; // Only for EASY mode
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export const NaturalExpressionGame: React.FC<Props> = ({ userId, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [gameMode, setGameMode] = useState<GameMode>('MASTER');
    const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
    
    // Data Stats
    const [totalExpressions, setTotalExpressions] = useState(0);
    const [masteredExpressions, setMasteredExpressions] = useState(0);
    
    // Gameplay
    const [queue, setQueue] = useState<GameQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [userAnswer, setUserAnswer] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    
    const recognitionManager = useRef(new SpeechRecognitionManager());
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();

    // Fetch stats on mount
    const loadStats = async () => {
        const items = await db.getNativeSpeakItemsByUserId(userId);
        let total = 0;
        let mastered = 0;
        
        items.forEach(item => {
            item.answers.forEach(ans => {
                total++;
                if (ans.lastResult === 'correct') {
                    mastered++;
                }
            });
        });
        setTotalExpressions(total);
        setMasteredExpressions(mastered);
    };

    useEffect(() => {
        loadStats();
    }, [userId, gameState]);

    // Auto-scroll to bottom when answer is checked/skipped to show feedback
    useEffect(() => {
        if (isChecked) {
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
        }
    }, [isChecked]);

    const generateQuestions = async () => {
        const items = await db.getNativeSpeakItemsByUserId(userId);
        let eligibleItems = items;

        if (gameMode === 'MASTER') {
            // Prioritize items with any incorrect or never-answered questions
            const weakItems = items.filter(i => i.answers.some(ans => ans.lastResult !== 'correct'));
            if (weakItems.length > 0) {
                eligibleItems = weakItems;
            } else {
                showToast("All items mastered! Switching to review mode.", "info");
            }
        }

        if (eligibleItems.length === 0) {
            showToast("No expressions found.", "error");
            return;
        }

        // Flatten all answers
        const pool: GameQuestion[] = [];
        const allExpressionPhrases: string[] = [];

        items.forEach(item => {
            item.answers.forEach(ans => {
                const match = ans.sentence.match(/\{(.*?)\}/);
                if (match) {
                     allExpressionPhrases.push(match[1]);
                }
            });
        });

        eligibleItems.forEach(item => {
            item.answers.forEach((ans, idx) => {
                // If in MASTER mode, only add never mastered or previously incorrect
                if (gameMode === 'MASTER' && ans.lastResult === 'correct') return;

                const match = ans.sentence.match(/\{(.*?)\}/);
                if (match) {
                    const targetPhrase = match[1];
                    const masked = ans.sentence.replace(match[0], '_______');
                    
                    let choices: string[] | undefined;
                    if (difficulty === 'EASY') {
                        const distractors = allExpressionPhrases
                            .filter(p => p !== targetPhrase)
                            .sort(() => 0.5 - Math.random())
                            .slice(0, 3);
                        choices = [targetPhrase, ...distractors].sort(() => 0.5 - Math.random());
                    }

                    pool.push({
                        id: `${item.id}-${idx}`,
                        nativeSpeakItemId: item.id,
                        answerIndex: idx,
                        answer: ans,
                        maskedSentence: masked,
                        choices
                    });
                }
            });
        });
        
        // Shuffle and take top 10
        const gameQueue = pool.sort(() => 0.5 - Math.random()).slice(0, 10);
        setQueue(gameQueue);
        setCurrentIndex(0);
        setScore(0);
        setUserAnswer('');
        setIsChecked(false);
        setIsCorrect(false);
        setShowHint(false);
        setGameState('PLAYING');
    };
    
    const handleStartRecording = () => {
        setIsRecording(true);
        setUserAnswer('');
        recognitionManager.current.start(
            (final, interim) => setUserAnswer(final + interim),
            (final) => setUserAnswer(final)
        );
    };

    const handleStopRecording = () => {
        setIsRecording(false);
        recognitionManager.current.stop();
    };

    const recordResult = async (isCorrect: boolean) => {
        const currentQ = queue[currentIndex];
        const key = `${currentQ.nativeSpeakItemId}-${currentQ.answerIndex}`;
        
        // 1. Update session state for summary
        // setQuestionResults(prev => ({ ...prev, [key]: isCorrect ? 'correct' : 'incorrect' }));
        
        // 2. SAVE TO DB IMMEDIATELY so progress is not lost on quit
        const items = await db.getNativeSpeakItemsByUserId(userId);
        const item = items.find(i => i.id === currentQ.nativeSpeakItemId);
        
        if (item) {
            const updatedAnswers = item.answers.map((ans, idx) => {
                if (idx === currentQ.answerIndex) {
                    return { ...ans, lastResult: isCorrect ? 'correct' as const : 'incorrect' as const };
                }
                return ans;
            });
            
            const correctCount = updatedAnswers.filter(a => a.lastResult === 'correct').length;
            const newScore = Math.round((correctCount / updatedAnswers.length) * 100);

            await dataStore.saveNativeSpeakItem({ 
                ...item, 
                answers: updatedAnswers,
                bestScore: newScore,
                updatedAt: Date.now()
            });
        }
    };

    const checkAnswer = () => {
        if (isCorrect) return;
        
        const currentQ = queue[currentIndex];
        const match = currentQ.answer.sentence.match(/\{(.*?)\}/);
        const targetPhrase = match ? match[1] : '';
        
        const isMatch = normalize(userAnswer).includes(normalize(targetPhrase));
        
        setIsCorrect(isMatch);
        setIsChecked(true);
        
        if (isMatch) {
            setScore(s => s + 10);
            recordResult(true);
        }
        // Incorrect answers do not save immediately to allow retry
    };

    const handleSkip = () => {
        recordResult(false);
        nextQuestion();
    };
    
    const nextQuestion = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setUserAnswer('');
            setIsChecked(false);
            setIsCorrect(false);
            setShowHint(false);
        } else {
            setGameState('SUMMARY');
            setTimeout(() => onComplete(score), 2000);
        }
    };

    const currentQ = queue[currentIndex];

    // --- RENDER: SETUP ---
    if (gameState === 'SETUP') {
        const DiffButton = ({ id, label, desc }: { id: Difficulty, label: string, desc: string }) => (
            <button 
                onClick={() => setDifficulty(id)}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left group ${difficulty === id ? 'bg-amber-50 border-amber-500 shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${difficulty === id ? 'text-amber-700' : 'text-neutral-400'}`}>{label}</span>
                    {difficulty === id && <CheckCircle2 size={14} className="text-amber-600" />}
                </div>
                <span className="text-[10px] font-bold text-neutral-400 leading-tight">{desc}</span>
            </button>
        );

        return (
            <div className="flex flex-col h-full items-center p-6 animate-in fade-in overflow-y-auto">
                <div className="text-center space-y-2 mb-8 mt-auto">
                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm rotate-3">
                        <MessageSquare size={32} fill="currentColor" />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Natural Expression</h2>
                    <p className="text-neutral-500 font-medium max-w-xs mx-auto">Master native phrases by using them in context.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-auto">
                    {/* LEFT COLUMN: Stats & Settings */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6 flex flex-col justify-between">
                        <div className="flex justify-between items-center bg-neutral-50 p-3 rounded-2xl">
                             <div className="text-center flex-1 border-r border-neutral-200">
                                 <p className="text-2xl font-black text-emerald-500">{masteredExpressions}</p>
                                 <p className="text-[10px] font-bold text-neutral-400 uppercase">Mastered</p>
                             </div>
                             <div className="text-center flex-1">
                                 <p className="text-2xl font-black text-neutral-900">{totalExpressions}</p>
                                 <p className="text-[10px] font-bold text-neutral-400 uppercase">Total</p>
                             </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Game Mode</p>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setGameMode('MASTER')} className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${gameMode === 'MASTER' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Master It
                                    <p className="text-[9px] font-normal opacity-70 mt-1">Focus on weak items</p>
                                </button>
                                <button onClick={() => setGameMode('REVIEW')} className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${gameMode === 'REVIEW' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Review All
                                    <p className="text-[9px] font-normal opacity-70 mt-1">Random practice</p>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Difficulty */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-3">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Difficulty</p>
                        <div className="grid grid-cols-1 gap-3 h-full">
                            <DiffButton id="EASY" label="EASY" desc="Select from list" />
                            <DiffButton id="MEDIUM" label="MEDIUM" desc="Fill missing part" />
                            <DiffButton id="HARD" label="HARD" desc="Type entire phrase" />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 w-full max-w-md">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={generateQuestions} className="flex-1 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 flex justify-center items-center gap-2">
                        <Play size={18} fill="white" /> Start
                    </button>
                </div>
            </div>
        );
    }

    // --- RENDER: SUMMARY ---
    if (gameState === 'SUMMARY') {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 animate-in zoom-in-95">
                 <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full mb-4 shadow-inner">
                    <CheckCircle2 size={48} />
                 </div>
                 <h2 className="text-3xl font-black text-neutral-900">Session Complete!</h2>
                 <p className="text-neutral-500 font-medium">Your progress has been saved to the library.</p>
                 <div className="mt-8 text-6xl font-black text-neutral-900">{score}</div>
                 <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-2">Points Earned</p>
            </div>
        );
    }

    // --- RENDER: GAMEPLAY ---
    
    const toneColor = currentQ.answer.tone === 'academic' ? 'bg-purple-100 text-purple-700' : currentQ.answer.tone === 'semi-academic' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-600';
    
    return (
        <div className="flex flex-col h-full relative p-6 max-w-3xl mx-auto">
             <header className="flex justify-between items-center mb-8 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase text-neutral-300 tracking-widest">Question {currentIndex + 1} of {queue.length}</span>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${((currentIndex) / queue.length) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            {/* Main Scrollable Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar w-full">
                <div className="min-h-full flex flex-col items-center justify-center space-y-8 pb-4">
                
                {/* Context Card */}
                <div className="w-full bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-xl text-center space-y-4 relative overflow-hidden shrink-0">
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 px-4 py-1 rounded-b-xl text-[10px] font-black uppercase tracking-widest ${toneColor}`}>
                        {currentQ.answer.tone}
                    </div>
                    
                    <div className="mt-4">
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Situation / Context</p>
                        <h3 className="text-2xl md:text-3xl font-black text-neutral-900 leading-tight">
                            &quot;{currentQ.answer.anchor}&quot;
                        </h3>
                    </div>

                    {/* Content Area Based on Difficulty */}
                    <div className="min-h-[100px] flex items-center justify-center py-4">
                        {difficulty === 'HARD' ? (
                             <div className="text-neutral-400 text-sm font-medium italic">
                                 (Expression Hidden - Speak or Type it)
                             </div>
                        ) : (
                             <p className="text-lg md:text-xl text-neutral-700 font-medium">
                                 {currentQ.maskedSentence}
                             </p>
                        )}
                    </div>
                    
                    {/* Clue/Audio Area - Always visible if user requests */}
                    <div className="flex justify-center">
                         <div className="flex items-center gap-3 bg-yellow-50 px-4 py-2 rounded-xl">
                            <button onClick={() => speak(currentQ.answer.sentence)} className="p-2 bg-white text-yellow-600 rounded-full shadow-sm hover:scale-110 transition-transform"><Volume2 size={16}/></button>
                            <span className="text-xs font-bold text-yellow-800 italic">{currentQ.answer.note || "Listen to the example"}</span>
                        </div>
                    </div>
                </div>

                {/* Input Area */}
                <div className="w-full max-w-md space-y-4 shrink-0">
                    {difficulty === 'EASY' ? (
                         <div className="grid grid-cols-1 gap-2">
                             {currentQ.choices?.map(choice => (
                                 <button
                                    key={choice}
                                    onClick={() => setUserAnswer(choice)}
                                    disabled={isCorrect}
                                    className={`p-4 rounded-xl border-2 font-bold text-sm transition-all ${userAnswer === choice ? 'bg-amber-50 border-amber-500 text-amber-900' : 'bg-white border-neutral-100 text-neutral-600 hover:border-neutral-300'}`}
                                 >
                                     {choice}
                                 </button>
                             ))}
                         </div>
                    ) : (
                        <div className="relative">
                             <textarea 
                                ref={inputRef as any}
                                value={userAnswer}
                                onChange={(e) => setUserAnswer(e.target.value)}
                                disabled={isCorrect || isRecording}
                                placeholder={difficulty === 'HARD' ? "Type the full expression..." : "Type the missing part..."}
                                className={`w-full p-5 pr-14 bg-white border-2 rounded-2xl text-lg font-bold outline-none transition-all resize-none ${isChecked ? (isCorrect ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-rose-500 bg-rose-50 text-rose-800') : 'border-neutral-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-50'}`}
                                rows={2}
                             />
                             <div className="absolute right-3 bottom-3">
                                <button 
                                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                                    className={`p-2 rounded-full transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                                >
                                    {isRecording ? <div className="w-4 h-4 bg-white rounded-sm" /> : <Mic size={20}/>}
                                </button>
                             </div>
                        </div>
                    )}
                </div>

                {/* Feedback & Actions */}
                <div className="w-full max-w-md flex gap-3 shrink-0">
                     {!isCorrect ? (
                         <>
                             <button 
                                onClick={handleSkip}
                                className="flex-1 py-4 bg-white border border-neutral-200 text-neutral-400 rounded-2xl font-black text-sm uppercase tracking-widest hover:text-neutral-600 hover:border-neutral-300 transition-all flex items-center justify-center gap-2"
                             >
                                 <SkipForward size={16}/> Skip
                             </button>
                             <button 
                                onClick={() => setShowHint(true)}
                                disabled={showHint}
                                className="flex-1 py-4 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                             >
                                 <Info size={16}/> Hint
                             </button>
                             <button 
                                onClick={checkAnswer} 
                                disabled={!userAnswer.trim()} 
                                className="flex-[2] py-4 bg-neutral-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                            >
                                 {isChecked ? 'Retry' : 'Check'}
                             </button>
                         </>
                     ) : (
                         <div className="w-full space-y-4 animate-in slide-in-from-bottom-2 pb-6">
                             <div className="p-4 rounded-2xl flex items-center gap-3 border-2 bg-emerald-50 border-emerald-100 text-emerald-800">
                                <CheckCircle2 size={24} />
                                <div>
                                    <h4 className="font-black text-lg uppercase tracking-tight">Correct!</h4>
                                    <p className="text-xs font-bold opacity-80">Great job!</p>
                                </div>
                             </div>
                             
                             <button onClick={nextQuestion} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 hover:bg-emerald-700">
                                 <ArrowRight size={18}/> {currentIndex === queue.length - 1 ? 'Finish' : 'Continue'}
                             </button>
                         </div>
                     )}
                </div>
                
                {/* Result Reveal Block */}
                {(isCorrect || showHint) && (
                     <div className="w-full max-w-md p-5 bg-white border-2 border-neutral-100 rounded-2xl shadow-sm relative overflow-hidden animate-in slide-in-from-bottom-2">
                         <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                         <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">The Correct Expression</p>
                         <p className="text-xl font-black text-emerald-600 leading-snug">{currentQ.answer.sentence.replace(/{|}/g, '')}</p>
                     </div>
                )}
                
                {/* Scroll Anchor */}
                <div ref={bottomRef} />
                
                </div>
            </div>
        </div>
    );
};
