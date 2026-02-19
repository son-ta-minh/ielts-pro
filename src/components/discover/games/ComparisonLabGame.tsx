
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, CheckCircle2, Split, ChevronDown, SkipForward, ArrowRight, Loader2, Info } from 'lucide-react';
import { User } from '../../../app/types';
import * as db from '../../../app/db';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';

interface Props {
    user: User;
    onComplete: (score: number) => void;
    onExit: () => void;
}

type Difficulty = 'EASY' | 'HARD';
type GameMode = 'MASTER' | 'REVIEW';

interface ComparisonQuestion {
    lessonId: string;
    rowIdx: number;
    answerWord: string;
    nuance: string;
    example: string;
    choices?: string[]; // For EASY mode
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export const ComparisonLabGame: React.FC<Props> = ({ user, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
    const [gameMode, setGameMode] = useState<GameMode>('MASTER');

    // Stats
    const [totalItems, setTotalItems] = useState(0);
    const [masteredItems, setMasteredItems] = useState(0);

    const [queue, setQueue] = useState<ComparisonQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    
    // Gameplay States
    const [userAnswer, setUserAnswer] = useState('');
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showHint, setShowHint] = useState(false);

    const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
    const { showToast } = useToast();

    // Load Stats
    useEffect(() => {
        const loadStats = async () => {
            const lessons = await db.getLessonsByUserId(user.id);
            const comparisonLessons = lessons.filter(l => l.type === 'comparison' && l.comparisonRows);
            
            let total = 0;
            let mastered = 0;

            comparisonLessons.forEach(l => {
                l.comparisonRows!.forEach(row => {
                    total++;
                    if (row.lastResult === 'correct') mastered++;
                });
            });

            setTotalItems(total);
            setMasteredItems(mastered);
        };
        loadStats();
    }, [user.id, gameState]);

    // 1. Setup Phase
    const handleStartGame = async () => {
        const lessons = await db.getLessonsByUserId(user.id);
        const comparisonLessons = lessons.filter(l => l.type === 'comparison' && l.comparisonRows && l.comparisonRows.length > 0);
        
        if (comparisonLessons.length === 0) {
            showToast("No Comparison Lab lessons found in your library.", "error");
            return;
        }

        const pool: ComparisonQuestion[] = [];
        const allWords: string[] = [];

        comparisonLessons.forEach(l => {
            l.comparisonRows!.forEach(row => {
                if (row.word) allWords.push(row.word);
            });
        });

        comparisonLessons.forEach(l => {
            l.comparisonRows!.forEach((row, rowIdx) => {
                if (!row.word || !row.nuance) return;
                
                // Filter based on Game Mode
                if (gameMode === 'MASTER' && row.lastResult === 'correct') return;

                const _q: ComparisonQuestion = {
                    lessonId: l.id,
                    rowIdx,
                    answerWord: row.word,
                    nuance: row.nuance,
                    example: row.example,
                };

                if (difficulty === 'EASY') {
                    const distractors = allWords
                        .filter(w => normalize(w) !== normalize(row.word))
                        .sort(() => 0.5 - Math.random())
                        .slice(0, 5);
                    _q.choices = [row.word, ...distractors].sort(() => 0.5 - Math.random());
                }

                pool.push(_q);
            });
        });

        if (pool.length === 0) {
            if (gameMode === 'MASTER') {
                showToast("All items mastered! Switching to Review mode.", "success");
                setGameMode('REVIEW');
            } else {
                showToast("Not enough data to start game. Add more word pairs to your labs.", "error");
            }
            return;
        }

        const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, sessionSize);
        setQueue(shuffled);
        setCurrentIndex(0);
        setScore(0);
        setGameState('PLAYING');
        prepareTurn(shuffled[0]);
    };

    const prepareTurn = (_q: ComparisonQuestion) => {
        setUserAnswer('');
        setIsChecked(false);
        setIsCorrect(false);
        setShowHint(false);
        setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
    };

    const handleCheck = async () => {
        if (isSaving) return;
        
        const q = queue[currentIndex];
        const correct = normalize(userAnswer) === normalize(q.answerWord);

        setIsCorrect(correct);
        setIsChecked(true);

        if (correct) {
            setScore(s => s + 20);
            await saveResult(true);
        }
    };
    
    const handleHint = () => {
        setShowHint(true);
    };

    const saveResult = async (wasCorrect: boolean) => {
        setIsSaving(true);
        const q = queue[currentIndex];
        try {
            const lessons = await db.getLessonsByUserId(user.id);
            const lesson = lessons.find(l => l.id === q.lessonId);
            if (lesson && lesson.comparisonRows) {
                const updatedRows = [...lesson.comparisonRows];
                updatedRows[q.rowIdx] = {
                    ...updatedRows[q.rowIdx],
                    lastResult: wasCorrect ? 'correct' : 'incorrect'
                };

                await dataStore.saveLesson({
                    ...lesson,
                    comparisonRows: updatedRows,
                    updatedAt: Date.now()
                });
            }
        } catch (_e) {
            console.error("Failed to save result", _e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = () => {
        if (currentIndex < queue.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            prepareTurn(queue[nextIdx]);
        } else {
            setGameState('SUMMARY');
        }
    };

    const handleSkip = async () => {
        await saveResult(false);
        handleNext();
    };

    // --- RENDER SETUP ---
    if (gameState === 'SETUP') {
        const DiffButton = ({ id, label, desc }: { id: Difficulty, label: string, desc: string }) => (
            <button 
                onClick={() => setDifficulty(id)}
                className={`flex flex-col items-start p-3 rounded-2xl border-2 transition-all text-left group ${difficulty === id ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}
            >
                <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${difficulty === id ? 'text-indigo-700' : 'text-neutral-400'}`}>{label}</span>
                    {difficulty === id && <CheckCircle2 size={14} className="text-indigo-600" />}
                </div>
                <span className="text-[9px] font-bold text-neutral-400 leading-tight">{desc}</span>
            </button>
        );

        return (
            <div className="flex flex-col h-full items-center p-6 animate-in fade-in overflow-y-auto">
                <div className="text-center space-y-2 mb-6 mt-auto">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm -rotate-3">
                        <Split size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Word Contrast</h2>
                    <p className="text-neutral-500 font-medium text-sm max-w-xs mx-auto">Distinguish confusing word pairs based on usage nuance.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-auto items-start">
                    {/* LEFT COLUMN: Stats & Settings */}
                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-5 flex flex-col justify-between">
                        <div className="flex justify-between items-center bg-neutral-50 p-3 rounded-2xl">
                             <div className="text-center flex-1 border-r border-neutral-200">
                                 <p className="text-2xl font-black text-emerald-500">{masteredItems}</p>
                                 <p className="text-[10px] font-bold text-neutral-400 uppercase">Mastered</p>
                             </div>
                             <div className="text-center flex-1">
                                 <p className="text-2xl font-black text-neutral-900">{totalItems}</p>
                                 <p className="text-[10px] font-bold text-neutral-400 uppercase">Total</p>
                             </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Game Mode</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setGameMode('MASTER')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'MASTER' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Master It
                                    <p className="text-[8px] font-normal opacity-70 mt-0.5">Focus on weak items</p>
                                </button>
                                <button onClick={() => setGameMode('REVIEW')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'REVIEW' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Review All
                                    <p className="text-[8px] font-normal opacity-70 mt-0.5">Random practice</p>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question Count</span>
                                <span className="text-xl font-black text-indigo-600">{sessionSize}</span>
                            </div>
                            <input
                                type="range" min="5" max="25" step="5" value={sessionSize}
                                onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Difficulty */}
                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-2">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Difficulty</p>
                        <div className="grid grid-cols-1 gap-2">
                            <DiffButton id="EASY" label="Easy" desc="Select from list" />
                            <DiffButton id="HARD" label="Hard" desc="Type from memory" />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 w-full max-w-md">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={handleStartGame} className="flex-1 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 flex justify-center items-center gap-2">
                        <Play size={18} fill="white" /> Start
                    </button>
                </div>
            </div>
        );
    }

    if (gameState === 'SUMMARY') {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 animate-in zoom-in-95">
                 <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full mb-4 shadow-inner">
                    <CheckCircle2 size={48} />
                 </div>
                 <h2 className="text-3xl font-black text-neutral-900">Practice Complete!</h2>
                 <p className="text-neutral-500 font-medium">History marks updated in your comparison labs.</p>
                 <div className="mt-8 text-6xl font-black text-neutral-900">{score}</div>
                 <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-2">Points Earned</p>
                 <button onClick={() => onComplete(score)} className="mt-8 px-10 py-3 bg-neutral-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-neutral-800 shadow-lg">Back to Discover</button>
            </div>
        );
    }

    const currentQ = queue[currentIndex];

    return (
        <div className="flex flex-col h-full relative p-6 max-w-4xl mx-auto">
            <header className="flex justify-between items-center mb-8 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase text-neutral-300 tracking-widest">Question {currentIndex + 1} of {queue.length}</span>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(currentIndex / queue.length) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center space-y-12 pb-20">
                
                {/* Nuance Clue Card */}
                <div className="w-full bg-white p-10 rounded-[3rem] border-2 border-neutral-100 shadow-xl text-center space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="space-y-1">
                        <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-2">Identify the word based on nuance:</p>
                        <h3 className="text-xl md:text-2xl font-medium text-neutral-800 leading-relaxed italic">
                            &quot;{currentQ.nuance}&quot;
                        </h3>
                    </div>
                    {currentQ.example && (
                        <div className="mt-4 pt-4 border-t border-neutral-50">
                             <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest mb-1">Usage Example</p>
                             <p className="text-sm font-bold text-neutral-500">&quot;{currentQ.example.replace(new RegExp(currentQ.answerWord, 'gi'), '_______')}&quot;</p>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="w-full max-w-md space-y-4">
                    {difficulty === 'EASY' ? (
                        <div className="relative">
                            <select 
                                ref={inputRef as any}
                                value={userAnswer}
                                disabled={isCorrect}
                                onChange={e => setUserAnswer(e.target.value)}
                                className={`w-full p-4 bg-white border-2 rounded-2xl text-lg font-black outline-none transition-all appearance-none cursor-pointer ${isChecked ? (normalize(userAnswer) === normalize(currentQ.answerWord) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-rose-500 bg-rose-50 text-rose-800') : 'border-neutral-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'}`}
                            >
                                <option value="">Select word...</option>
                                {currentQ.choices?.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {!isCorrect && <ChevronDown size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />}
                        </div>
                    ) : (
                        <input 
                            ref={inputRef as any}
                            type="text"
                            value={userAnswer}
                            disabled={isCorrect}
                            onChange={e => setUserAnswer(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !isCorrect && handleCheck()}
                            placeholder="Type the word..."
                            className={`w-full p-4 bg-white border-2 rounded-2xl text-lg font-black outline-none transition-all text-center placeholder:text-neutral-200 ${isChecked ? (normalize(userAnswer) === normalize(currentQ.answerWord) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-rose-500 bg-rose-50 text-rose-800') : 'border-neutral-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 shadow-sm'}`}
                            autoComplete="off"
                        />
                    )}

                    {(isCorrect || showHint) && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in slide-in-from-top-2 text-center shadow-sm">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Correct Answer</p>
                            <p className="text-xl font-black text-emerald-900">{currentQ.answerWord}</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="w-full max-w-xs flex gap-3">
                    {!isCorrect ? (
                        <>
                             <button onClick={handleSkip} className="flex-1 py-4 bg-white border border-neutral-200 text-neutral-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:text-neutral-600 transition-all flex items-center justify-center gap-2">
                                <SkipForward size={16}/> Skip
                             </button>
                             {/* Show Hint if Checked but not correct */}
                             {isChecked && !isCorrect && (
                                <button onClick={handleHint} disabled={showHint} className="flex-1 py-4 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-100 transition-all flex items-center justify-center gap-2">
                                    <Info size={16}/> Hint
                                </button>
                             )}
                             <button onClick={handleCheck} disabled={isSaving || !userAnswer.trim()} className="flex-[2] py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                                <span>{isChecked ? 'Retry' : 'Check'}</span>
                             </button>
                        </>
                    ) : (
                        <button onClick={handleNext} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 bg-emerald-600 text-white`}>
                            <span>{currentIndex === queue.length - 1 ? 'Finish' : 'Next Question'}</span>
                            <ArrowRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
