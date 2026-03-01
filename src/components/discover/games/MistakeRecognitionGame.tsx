import React, { useEffect, useState } from 'react';
import { ArrowLeft, Play, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { User } from '../../../app/types';
import * as db from '../../../app/db';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';

interface Props {
    user: User;
    onComplete: (score: number) => void;
    onExit: () => void;
}

type GameMode = 'MASTER' | 'REVIEW';

interface MistakeQuestion {
    lessonId: string;
    rowIdx: number;
    mistake: string;
    explanation: string;
    correction: string;
}

export const MistakeRecognitionGame: React.FC<Props> = ({ user, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [gameMode, setGameMode] = useState<GameMode>('MASTER');

    const [totalItems, setTotalItems] = useState(0);
    const [masteredItems, setMasteredItems] = useState(0);

    const [queue, setQueue] = useState<MistakeQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);

    const { showToast } = useToast();

    useEffect(() => {
        const loadStats = async () => {
            const lessons = await db.getLessonsByUserId(user.id);
            const mistakeLessons = lessons.filter(l => l.type === 'mistake' && l.mistakeRows);
            let total = 0;
            let mastered = 0;

            mistakeLessons.forEach(l => {
                l.mistakeRows!.forEach(row => {
                    total++;
                    if (row.lastResult === 'correct') mastered++;
                });
            });

            setTotalItems(total);
            setMasteredItems(mastered);
        };
        loadStats();
    }, [user.id, gameState]);

    const prepareTurn = () => {
        setIsRevealed(false);
    };

    const handleStartGame = async () => {
        const lessons = await db.getLessonsByUserId(user.id);
        const mistakeLessons = lessons.filter(l => l.type === 'mistake' && l.mistakeRows && l.mistakeRows.length > 0);

        if (mistakeLessons.length === 0) {
            showToast('No Mistake cards found in your library.', 'error');
            return;
        }

        const pool: MistakeQuestion[] = [];
        mistakeLessons.forEach(l => {
            l.mistakeRows!.forEach((row, rowIdx) => {
                if (!row.mistake || !row.explanation || !row.correction) return;
                if (gameMode === 'MASTER' && row.lastResult === 'correct') return;

                pool.push({
                    lessonId: l.id,
                    rowIdx,
                    mistake: row.mistake,
                    explanation: row.explanation,
                    correction: row.correction
                });
            });
        });

        if (pool.length === 0) {
            if (gameMode === 'MASTER') {
                showToast('All items mastered! Switching to Review mode.', 'success');
                setGameMode('REVIEW');
            } else {
                showToast('Not enough data to start game. Add more Mistake rows.', 'error');
            }
            return;
        }

        const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, sessionSize);
        setQueue(shuffled);
        setCurrentIndex(0);
        setScore(0);
        setGameState('PLAYING');
        prepareTurn();
    };

    const saveResult = async (wasCorrect: boolean) => {
        const q = queue[currentIndex];
        try {
            const lessons = await db.getLessonsByUserId(user.id);
            const lesson = lessons.find(l => l.id === q.lessonId);
            if (lesson && lesson.mistakeRows) {
                const updatedRows = [...lesson.mistakeRows];
                updatedRows[q.rowIdx] = {
                    ...updatedRows[q.rowIdx],
                    lastResult: wasCorrect ? 'correct' : 'incorrect'
                };

                await dataStore.saveLesson({
                    ...lesson,
                    mistakeRows: updatedRows,
                    updatedAt: Date.now()
                });
            }
        } catch (e) {
            console.error('Failed to save Mistake result', e);
        }
    };

    const moveNext = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
            prepareTurn();
        } else {
            setGameState('SUMMARY');
        }
    };

    const handleSelfEvaluate = async (wasCorrect: boolean) => {
        await saveResult(wasCorrect);
        if (wasCorrect) {
            setScore(prev => prev + 20);
        }
        moveNext();
    };

    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full items-center p-6 animate-in fade-in overflow-y-auto">
                <div className="text-center space-y-2 mb-6 mt-auto">
                    <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm -rotate-3">
                        <AlertTriangle size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Mistake Recognition</h2>
                    <p className="text-neutral-500 font-medium text-sm max-w-xs mx-auto">Spot incorrect usage, reveal explanation, then self-evaluate.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-auto items-start">
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
                                <button onClick={() => setGameMode('MASTER')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'MASTER' ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Master It
                                    <p className="text-[8px] font-normal opacity-70 mt-0.5">Focus on weak items</p>
                                </button>
                                <button onClick={() => setGameMode('REVIEW')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'REVIEW' ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                    Review All
                                    <p className="text-[8px] font-normal opacity-70 mt-0.5">Random practice</p>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question Count</span>
                                <span className="text-xl font-black text-rose-600">{sessionSize}</span>
                            </div>
                            <input
                                type="range"
                                min="5"
                                max="25"
                                step="5"
                                value={sessionSize}
                                onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
                            />
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm">
                        <p className="text-sm font-medium text-neutral-600 leading-relaxed">
                            Flow: read the incorrect phrase, think of your correction, press <strong>Reveal</strong>, then choose whether your answer was correct or not.
                        </p>
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
                <p className="text-neutral-500 font-medium">Progress updated in your Mistake cards.</p>
                <div className="mt-8 text-6xl font-black text-neutral-900">{score}</div>
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-2">Points Earned</p>
                <button onClick={() => onComplete(score)} className="mt-8 px-10 py-3 bg-neutral-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-neutral-800 shadow-lg">
                    Back to Discover
                </button>
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
                        <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${(currentIndex / queue.length) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center space-y-10 pb-12">
                <div className="w-full bg-white p-10 rounded-[3rem] border-2 border-neutral-100 shadow-xl text-center space-y-4 animate-in fade-in slide-in-from-top-4">
                    <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Find and fix this mistake (in your head):</p>
                    <h3 className="text-2xl md:text-3xl font-black text-rose-700 leading-relaxed">"{currentQ.mistake}"</h3>
                </div>

                {!isRevealed ? (
                    <button onClick={() => setIsRevealed(true)} className="px-10 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-xl active:scale-95">
                        Reveal
                    </button>
                ) : (
                    <div className="w-full space-y-5 animate-in fade-in">
                        <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Explanation</p>
                            <p className="text-sm font-medium text-amber-900">{currentQ.explanation}</p>
                        </div>
                        <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Correction</p>
                            <p className="text-xl font-black text-emerald-900">{currentQ.correction}</p>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => handleSelfEvaluate(false)} className="flex-1 py-4 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-50 transition-all">
                                Correct
                            </button>
                            <button onClick={() => handleSelfEvaluate(true)} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                                <span>Incorrect</span>
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
