
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, CheckCircle2, Scale, ChevronDown, SkipForward, ArrowRight, Loader2, Info } from 'lucide-react';
import { User, IntensityRow, IntensityItem } from '../../../app/types';
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

interface IntensityQuestion {
    lessonId: string;
    rowIdx: number;
    pivotWord: string;
    pivotCategory: keyof IntensityRow;
    targetCategory: keyof IntensityRow;
    expectedWords: string[]; // Normalized lowercase
    originalExpectedItems: IntensityItem[];
    choices?: string[]; // For EASY mode
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export const IntensityScaleGame: React.FC<Props> = ({ user, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
    const [gameMode, setGameMode] = useState<GameMode>('MASTER');
    
    // Stats
    const [totalItems, setTotalItems] = useState(0);
    const [masteredItems, setMasteredItems] = useState(0);

    const [queue, setQueue] = useState<IntensityQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    
    // Gameplay States
    const [userAnswers, setUserAnswers] = useState<string[]>([]);
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showHint, setShowHint] = useState(false);

    const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
    const { showToast } = useToast();

    // Load Stats
    useEffect(() => {
        const loadStats = async () => {
            const lessons = await db.getLessonsByUserId(user.id);
            const intensityLessons = lessons.filter(l => l.type === 'intensity' && l.intensityRows);
            
            let total = 0;
            let mastered = 0;

            intensityLessons.forEach(l => {
                l.intensityRows!.forEach(row => {
                    (['softened', 'neutral', 'intensified'] as const).forEach(cat => {
                        row[cat].forEach(item => {
                            total++;
                            if (item.lastResult === 'correct') mastered++;
                        });
                    });
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
        const intensityLessons = lessons.filter(l => l.type === 'intensity' && l.intensityRows && l.intensityRows.length > 0);
        
        if (intensityLessons.length === 0) {
            showToast("No Intensity Scale lessons found in your library.", "error");
            return;
        }

        // Create Pool
        const pool: IntensityQuestion[] = [];
        const allPossibleTargetWords: string[] = [];

        intensityLessons.forEach(l => {
            l.intensityRows!.forEach(row => {
                [...row.softened, ...row.neutral, ...row.intensified].forEach(item => allPossibleTargetWords.push(item.word));
            });
        });

        intensityLessons.forEach(l => {
            l.intensityRows!.forEach((row, rowIdx) => {
                const categories: (keyof IntensityRow)[] = ['softened', 'neutral', 'intensified'];
                
                categories.forEach(pivotCat => {
                    const pivotItems = row[pivotCat];
                    if (pivotItems.length === 0) return;

                    categories.forEach(targetCat => {
                        if (pivotCat === targetCat) return;
                        if (row[targetCat].length === 0) return;
                        
                        // Check mastery status of target items
                        const isTargetMastered = row[targetCat].every(i => i.lastResult === 'correct');

                        // Filter based on Game Mode
                        if (gameMode === 'MASTER' && isTargetMastered) return;

                        pivotItems.forEach(pivotItem => {
                            const q: IntensityQuestion = {
                                lessonId: l.id,
                                rowIdx,
                                pivotWord: pivotItem.word,
                                pivotCategory: pivotCat,
                                targetCategory: targetCat,
                                expectedWords: row[targetCat].map(i => normalize(i.word)),
                                originalExpectedItems: row[targetCat],
                            };

                            if (difficulty === 'EASY') {
                                const correctWords = row[targetCat].map(i => i.word);
                                const distractors = allPossibleTargetWords
                                    .filter(w => !correctWords.includes(w))
                                    .sort(() => 0.5 - Math.random())
                                    .slice(0, 5);
                                q.choices = [...correctWords, ...distractors].sort(() => 0.5 - Math.random());
                            }

                            pool.push(q);
                        });
                    });
                });
            });
        });

        if (pool.length === 0) {
            if (gameMode === 'MASTER') {
                showToast("All items mastered! Switching to Review mode.", "success");
                setGameMode('REVIEW'); // Toggle and let user click start again
            } else {
                showToast("Not enough data to start game. Add more words to your scales.", "error");
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

    const prepareTurn = (q: IntensityQuestion) => {
        setUserAnswers(new Array(q.expectedWords.length).fill(''));
        setIsChecked(false);
        setIsCorrect(false);
        setShowHint(false);
        setTimeout(() => {
            inputRefs.current[0]?.focus();
        }, 100);
    };

    const handleCheck = async () => {
        if (isSaving) return;
        
        // Only trigger validation check, NOT full submission logic if not correct yet
        const q = queue[currentIndex];
        
        const cleanUserSet = userAnswers.map(a => normalize(a)).filter(Boolean);
        const uniqueUserSet = new Set(cleanUserSet);
        
        let correct = true;
        if (uniqueUserSet.size !== q.expectedWords.length) {
            correct = false;
        } else {
            for (const expected of q.expectedWords) {
                if (!uniqueUserSet.has(expected)) {
                    correct = false;
                    break;
                }
            }
        }

        setIsChecked(true);
        setIsCorrect(correct);

        if (correct) {
            setScore(s => s + 20);
            await saveResult(true);
        }
    };

    const handleHint = () => {
        setShowHint(true);
        // Hint counts as giving up/incorrect for tracking purposes if used? 
        // For now just reveal. User can still type to proceed but maybe with reduced score?
        // Let's keep it simple: Show hint. User manually proceeds or types it in.
        // Actually, request says "Hint will reveal results".
    };

    const saveResult = async (wasCorrect: boolean) => {
        setIsSaving(true);
        const q = queue[currentIndex];
        try {
            const lessons = await db.getLessonsByUserId(user.id);
            const lesson = lessons.find(l => l.id === q.lessonId);
            if (lesson && lesson.intensityRows) {
                const updatedRows = [...lesson.intensityRows];
                const targetItems = [...updatedRows[q.rowIdx][q.targetCategory]];
                
                updatedRows[q.rowIdx][q.targetCategory] = targetItems.map(item => ({
                    ...item,
                    lastResult: wasCorrect ? 'correct' as const : 'incorrect' as const
                }));

                await dataStore.saveLesson({
                    ...lesson,
                    intensityRows: updatedRows,
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
        // Skip counts as incorrect
        await saveResult(false);
        handleNext();
    };

    // --- RENDER SETUP ---
    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full items-center p-6 animate-in fade-in overflow-y-auto">
                <div className="text-center space-y-2 mb-8 mt-auto">
                    <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm -rotate-3">
                        <Scale size={32} fill="currentColor" />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Intensity Scale</h2>
                    <p className="text-neutral-500 font-medium max-w-xs mx-auto">Drill synonyms based on their degree of intensity.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-auto">
                    {/* LEFT COLUMN: Stats & Settings */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6 flex flex-col justify-between">
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
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setGameMode('MASTER')} className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${gameMode === 'MASTER' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Master It
                                    <p className="text-[9px] font-normal opacity-70 mt-1">Focus on weak items</p>
                                </button>
                                <button onClick={() => setGameMode('REVIEW')} className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${gameMode === 'REVIEW' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Review All
                                    <p className="text-[9px] font-normal opacity-70 mt-1">Random practice</p>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question Count</span>
                                <span className="text-xl font-black text-orange-600">{sessionSize}</span>
                            </div>
                            <input
                                type="range" min="5" max="25" step="5" value={sessionSize}
                                onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Difficulty */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-3">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Difficulty</p>
                        <div className="grid grid-cols-1 gap-3 h-full">
                            <button onClick={() => setDifficulty('EASY')} className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left group ${difficulty === 'EASY' ? 'bg-orange-50 border-orange-500 shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${difficulty === 'EASY' ? 'text-orange-700' : 'text-neutral-400'}`}>Easy</span>
                                    {difficulty === 'EASY' && <CheckCircle2 size={14} className="text-orange-600" />}
                                </div>
                                <span className="text-[10px] font-bold text-neutral-400 leading-tight">Select the correct word from a list of options.</span>
                            </button>
                            <button onClick={() => setDifficulty('HARD')} className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left group ${difficulty === 'HARD' ? 'bg-orange-50 border-orange-500 shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${difficulty === 'HARD' ? 'text-orange-700' : 'text-neutral-400'}`}>Hard</span>
                                    {difficulty === 'HARD' && <CheckCircle2 size={14} className="text-orange-600" />}
                                </div>
                                <span className="text-[10px] font-bold text-neutral-400 leading-tight">Type the correct word from memory without hints.</span>
                            </button>
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
                 <h2 className="text-3xl font-black text-neutral-900">Scale Practice Complete!</h2>
                 <p className="text-neutral-500 font-medium">Progress marks updated in your library.</p>
                 <div className="mt-8 text-6xl font-black text-neutral-900">{score}</div>
                 <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-2">Points Earned</p>
                 <button onClick={() => onComplete(score)} className="mt-8 px-10 py-3 bg-neutral-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-neutral-800 shadow-lg">Back to Discover</button>
            </div>
        );
    }

    const currentQ = queue[currentIndex];
    const catLabels = { softened: 'Softened', neutral: 'Neutral', intensified: 'Intensified' };
    const catColors = { softened: 'text-blue-500 bg-blue-50 border-blue-100', neutral: 'text-neutral-500 bg-neutral-100 border-neutral-200', intensified: 'text-orange-500 bg-orange-50 border-orange-100' };

    return (
        <div className="flex flex-col h-full relative p-6 max-w-3xl mx-auto">
            <header className="flex justify-between items-center mb-8 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase text-neutral-300 tracking-widest">Question {currentIndex + 1} of {queue.length}</span>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${(currentIndex / queue.length) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center space-y-12 pb-20">
                
                {/* Question Prompt */}
                <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-center gap-3">
                         <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border ${catColors[currentQ.pivotCategory]}`}>
                             {catLabels[currentQ.pivotCategory]}
                         </span>
                         <span className="text-neutral-300">→</span>
                         <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border ${catColors[currentQ.targetCategory]}`}>
                             {catLabels[currentQ.targetCategory]}
                         </span>
                    </div>
                    
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">What is the {currentQ.targetCategory} of</p>
                        <h3 className="text-4xl font-black text-neutral-900 tracking-tighter">&quot;{currentQ.pivotWord}&quot;?</h3>
                    </div>
                </div>

                {/* Input Area */}
                <div className="w-full max-w-md space-y-3">
                    {userAnswers.map((val, idx) => (
                        <div key={idx} className="relative">
                            {difficulty === 'EASY' ? (
                                <div className="relative">
                                    <select 
                                        ref={el => { inputRefs.current[idx] = el as any; }}
                                        value={val}
                                        // Keep enabled if checked but not correct to allow retry
                                        disabled={isCorrect}
                                        onChange={e => {
                                            const next = [...userAnswers];
                                            next[idx] = e.target.value;
                                            setUserAnswers(next);
                                        }}
                                        className={`w-full p-4 bg-white border-2 rounded-2xl text-lg font-black outline-none transition-all appearance-none cursor-pointer ${isChecked ? (currentQ.expectedWords.includes(normalize(val)) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-rose-500 bg-rose-50 text-rose-800') : 'border-neutral-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-50'}`}
                                    >
                                        <option value="">Select word {idx + 1}...</option>
                                        {currentQ.choices?.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    {!isCorrect && <ChevronDown size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />}
                                </div>
                            ) : (
                                <input 
                                    ref={el => { inputRefs.current[idx] = el; }}
                                    type="text"
                                    value={val}
                                    // Keep enabled if checked but not correct
                                    disabled={isCorrect}
                                    onChange={e => {
                                        const next = [...userAnswers];
                                        next[idx] = e.target.value;
                                        setUserAnswers(next);
                                    }}
                                    onKeyDown={e => e.key === 'Enter' && !isCorrect && handleCheck()}
                                    placeholder={`Type word ${idx + 1}...`}
                                    className={`w-full p-4 bg-white border-2 rounded-2xl text-lg font-black outline-none transition-all text-center placeholder:text-neutral-200 ${isChecked ? (currentQ.expectedWords.includes(normalize(val)) ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-rose-500 bg-rose-50 text-rose-800') : 'border-neutral-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-50 shadow-sm'}`}
                                    autoComplete="off"
                                />
                            )}
                        </div>
                    ))}

                    {(isCorrect || showHint) && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in slide-in-from-top-2 text-center">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Correct Answers</p>
                            <p className="text-lg font-black text-emerald-900">{currentQ.originalExpectedItems.map(i => i.word).join(', ')}</p>
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
                             <button onClick={handleCheck} disabled={isSaving || userAnswers.some(a => !a.trim())} className="flex-[2] py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
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
