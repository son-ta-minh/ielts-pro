import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Play, Sparkles } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

type RegisterLabel = 'academic' | 'casual' | 'neutral';
type GameState = 'SETUP' | 'PLAYING';
type GameMode = 'MASTER' | 'TOTAL';

interface RegisterQuestion {
    id: string;
    word: string;
    meaning?: string;
    answer: RegisterLabel;
}

const REGISTER_OPTIONS: { id: RegisterLabel; label: string }[] = [
    { id: 'academic', label: 'Academic' },
    { id: 'casual', label: 'Casual' },
    { id: 'neutral', label: 'Neutral' },
];

const normalizeRegister = (value?: VocabularyItem['register']): RegisterLabel | null => {
    if (value === 'academic' || value === 'casual' || value === 'neutral') return value;
    return null;
};

function shuffleArray<T>(array: T[]): T[] {
    const copied = [...array];
    for (let i = copied.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copied[i], copied[j]] = [copied[j], copied[i]];
    }
    return copied;
}

export const RegisterPickGame: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<GameState>('SETUP');
    const [gameMode, setGameMode] = useState<GameMode>('MASTER');
    const [sessionSize, setSessionSize] = useState(10);
    const [queue, setQueue] = useState<RegisterQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selected, setSelected] = useState<RegisterLabel | null>(null);
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const { showToast } = useToast();

    const questionPool = useMemo(() => {
        const unique = new Map<string, RegisterQuestion>();
        words.forEach((word) => {
            if (!word.lastReview) return; // Only include learned/reviewed words.
            const register = normalizeRegister(word.register);
            if (!register) return;
            const key = `${word.word.toLowerCase()}::${register}`;
            if (unique.has(key)) return;
            unique.set(key, {
                id: word.id,
                word: word.word,
                meaning: word.meaningVi,
                answer: register,
            });
        });
        return Array.from(unique.values());
    }, [words]);

    const masteredCount = useMemo(
        () => questionPool.filter(q => dataStore.getWordById(q.id)?.lastTestResults?.REGISTER_PICK === true).length,
        [questionPool]
    );

    const currentPool = useMemo(() => {
        if (gameMode === 'TOTAL') return questionPool;
        return questionPool.filter(q => dataStore.getWordById(q.id)?.lastTestResults?.REGISTER_PICK !== true);
    }, [questionPool, gameMode]);

    const currentQuestion = queue[currentIndex] || null;
    const progress = queue.length > 0 ? Math.round(((currentIndex + 1) / queue.length) * 100) : 0;

    const startGame = () => {
        if (currentPool.length === 0) {
            if (gameMode === 'MASTER') {
                showToast('All register items mastered! Switching to Total mode.', 'success');
                setGameMode('TOTAL');
            } else {
                showToast('No register-labeled words found.', 'error');
            }
            return;
        }

        const picked = shuffleArray(currentPool).slice(0, Math.min(sessionSize, currentPool.length));
        setQueue(picked);
        setCurrentIndex(0);
        setScore(0);
        setSelected(null);
        setIsChecked(false);
        setIsCorrect(false);
        setGameState('PLAYING');
    };

    const handleCheck = () => {
        if (!currentQuestion || !selected || isChecked) return;
        const correct = selected === currentQuestion.answer;
        setIsChecked(true);
        setIsCorrect(correct);
        if (correct) {
            setScore((prev) => prev + 10);
        }

        const word = dataStore.getWordById(currentQuestion.id);
        if (word) {
            dataStore.saveWord({
                ...word,
                lastTestResults: {
                    ...(word.lastTestResults || {}),
                    REGISTER_PICK: correct
                },
                updatedAt: Date.now()
            });
        }
    };

    const nextQuestion = () => {
        if (currentIndex >= queue.length - 1) {
            onComplete(score);
            return;
        }
        setCurrentIndex((prev) => prev + 1);
        setSelected(null);
        setIsChecked(false);
        setIsCorrect(false);
    };

    if (gameState === 'SETUP') {
        const availableCount = currentPool.length;
        const canStart = availableCount >= 5;

        return (
            <div className="flex flex-col h-full p-6 overflow-y-auto">
                <button onClick={onExit} className="absolute top-6 left-6 z-10 p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors">
                    <ArrowLeft size={20} />
                </button>

                <div className="m-auto w-full max-w-lg bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 text-center space-y-5">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Sparkles size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-neutral-900">Register Pick</h2>
                        <p className="text-sm text-neutral-500 mt-1">Choose whether a word is Academic, Casual, or Neutral.</p>
                    </div>

                    <div className="bg-neutral-50 rounded-2xl p-4 text-left space-y-1">
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Eligible Words</p>
                        <p className="text-2xl font-black text-neutral-900">{availableCount}</p>
                        <p className="text-xs text-neutral-500">Only learned words with `VocabularyItem.register` = `academic`, `casual`, or `neutral`.</p>
                    </div>

                    <div className="bg-neutral-50 rounded-2xl p-4 text-left space-y-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Mastered</p>
                                <p className="text-xl font-black text-emerald-600">{masteredCount}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Total</p>
                                <p className="text-xl font-black text-neutral-900">{questionPool.length}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setGameMode('MASTER')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'MASTER' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}>
                                Master
                            </button>
                            <button onClick={() => setGameMode('TOTAL')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'TOTAL' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}>
                                Total
                            </button>
                        </div>
                    </div>

                    <div className="text-left space-y-2">
                        <label htmlFor="register-pick-size" className="block text-xs font-bold text-neutral-500 uppercase tracking-widest">
                            Session Size
                        </label>
                        <input
                            id="register-pick-size"
                            type="range"
                            min={5}
                            max={Math.max(5, Math.min(30, availableCount))}
                            value={sessionSize}
                            onChange={(e) => setSessionSize(Number(e.target.value))}
                            disabled={!canStart}
                            className="w-full accent-amber-600 disabled:opacity-40"
                        />
                        <p className="text-xs text-neutral-500">{Math.min(sessionSize, availableCount)} questions</p>
                    </div>

                    <button
                        onClick={startGame}
                        disabled={!canStart}
                        className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm tracking-wide disabled:bg-neutral-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Play size={16} />
                        Start
                    </button>
                    {!canStart && (
                        <p className="text-xs text-rose-500">Need at least 5 eligible words in selected mode to start.</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full p-6">
            <button onClick={onExit} className="absolute top-6 left-6 z-10 p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors">
                <ArrowLeft size={20} />
            </button>

            <div className="w-full max-w-2xl mx-auto mt-10">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Question {currentIndex + 1} / {queue.length}</p>
                    <p className="text-xs font-bold text-neutral-500">Score: {score}</p>
                </div>
                <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden mb-6">
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
                </div>

                <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 space-y-6">
                    <div className="text-center space-y-2">
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Word</p>
                        <h2 className="text-3xl font-black text-neutral-900">{currentQuestion?.word}</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {REGISTER_OPTIONS.map((opt) => {
                            const isSelected = selected === opt.id;
                            const shouldShowCorrect = isChecked && currentQuestion?.answer === opt.id;
                            const shouldShowWrong = isChecked && isSelected && !isCorrect;

                            const classes = shouldShowCorrect
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : shouldShowWrong
                                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                                    : isSelected
                                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                                        : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50';

                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => !isChecked && setSelected(opt.id)}
                                    disabled={isChecked}
                                    className={`px-4 py-3 rounded-2xl border text-sm font-bold transition-all disabled:cursor-default ${classes}`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>

                    {isChecked && (
                        <p className={`text-sm font-bold text-center ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${currentQuestion?.answer}`}
                        </p>
                    )}

                    <div className="flex gap-2">
                        {!isChecked ? (
                            <button
                                onClick={handleCheck}
                                disabled={!selected}
                                className="w-full py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm disabled:bg-neutral-300 disabled:cursor-not-allowed"
                            >
                                Check
                            </button>
                        ) : (
                            <button
                                onClick={nextQuestion}
                                className="w-full py-3 rounded-2xl bg-neutral-900 hover:bg-neutral-700 text-white font-black text-sm flex items-center justify-center gap-2"
                            >
                                {currentIndex === queue.length - 1 ? 'Finish' : 'Next'}
                                <ArrowRight size={15} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
