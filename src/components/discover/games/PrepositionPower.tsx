
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Check, ChevronRight, Zap, Search } from 'lucide-react';
import { StudyItem } from '../../../app/types';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';

interface Props {
    words: StudyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

interface PrepositionItem {
    id: string;
    wordId: string;
    prepIndex: number;
    word: string;
    example: string;
    answer: string;
    meaning: string;
}

type GameMode = 'MASTER' | 'TOTAL';

const COMMON_PREPOSITIONS = [
    'in', 'on', 'at', 'to', 'for', 'with', 'of', 'from', 'by', 'about', 
    'into', 'through', 'over', 'under', 'between', 'among', 'against', 
    'during', 'without', 'before', 'after', 'toward', 'upon', 'within', 'along'
].sort();

export const PrepositionPower: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [gameMode, setGameMode] = useState<GameMode>('MASTER');
    const [totalItems, setTotalItems] = useState(0);
    const [masteredItems, setMasteredItems] = useState(0);
    const [queue, setQueue] = useState<PrepositionItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userGuess, setUserGuess] = useState('');
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);
    
    // Autocomplete state
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();

    const buildQuestionPool = (mode: GameMode): PrepositionItem[] => {
        const pool: PrepositionItem[] = [];

        words.forEach(w => {
            if (!w.lastReview) return; // Only include learned/reviewed words.
            if (!w.prepositions || w.prepositions.length === 0) return;

            w.prepositions.forEach((prep, prepIndex) => {
                if (prep.isIgnored || !prep.prep) return;
                if (mode === 'MASTER' && prep.lastResult === 'correct') return;

                const headword = w.word;
                const prepText = prep.prep.trim();
                const usage = (prep.usage || '').trim();
                let exampleWithBlank = '';

                // If usage already contains headword (full context), blank the preposition in-place.
                if (usage && usage.toLowerCase().includes(headword.toLowerCase())) {
                    const prepRegex = new RegExp(`\\b${prepText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (prepRegex.test(usage)) {
                        exampleWithBlank = usage.replace(prepRegex, '___');
                    } else {
                        exampleWithBlank = `${usage} [___]`;
                    }
                } else if (usage) {
                    // Usage is likely the tail after "word + prep"
                    exampleWithBlank = `${headword} ___ ${usage}`;
                } else {
                    // Final fallback when no context exists
                    exampleWithBlank = `${headword} ___`;
                }

                pool.push({
                    id: `${w.id}-${prep.prep}-${prepIndex}`,
                    wordId: w.id,
                    prepIndex,
                    word: w.word,
                    example: exampleWithBlank,
                    answer: prep.prep.toLowerCase(),
                    meaning: w.meaningVi
                });
            });
        });

        return pool;
    };

    useEffect(() => {
        let total = 0;
        let mastered = 0;

        words.forEach(word => {
            if (!word.lastReview) return; // Keep stats aligned with playable pool.
            (word.prepositions || []).forEach(prep => {
                if (prep.isIgnored || !prep.prep?.trim()) return;
                total += 1;
                if (prep.lastResult === 'correct') mastered += 1;
            });
        });

        setTotalItems(total);
        setMasteredItems(mastered);
    }, [words, gameState]);

    const saveResult = async (wasCorrect: boolean) => {
        const current = queue[currentIndex];
        if (!current) return;

        const word = dataStore.getWordById(current.wordId) || words.find(w => w.id === current.wordId);
        if (!word?.prepositions || !word.prepositions[current.prepIndex]) return;

        const updatedPrepositions = word.prepositions.map((p, idx) =>
            idx === current.prepIndex ? { ...p, lastResult: wasCorrect ? 'correct' as const : 'incorrect' as const } : p
        );

        await dataStore.saveWord({
            ...word,
            prepositions: updatedPrepositions,
            updatedAt: Date.now()
        });
    };

    const handleStartGame = () => {
        const pool = buildQuestionPool(gameMode);
        if (pool.length === 0) {
            if (gameMode === 'MASTER') {
                showToast("All preposition items mastered! Switching to Total mode.", "success");
                setGameMode('TOTAL');
            } else {
                showToast("No preposition context found in your library.", "error");
            }
            return;
        }

        const newQueue = [...pool].sort(() => Math.random() - 0.5).slice(0, sessionSize);

        setQueue(newQueue);
        setGameState('PLAYING');
        setCurrentIndex(0);
        setScore(0);
        setUserGuess('');
        setIsCorrect(null);
    };

    const currentItem = queue[currentIndex];

    useEffect(() => {
        if (gameState === 'PLAYING' && inputRef.current) {
            inputRef.current.focus();
        }
    }, [currentIndex, gameState]);

    const handleCheck = async (overrideValue?: string) => {
        if (!currentItem || isCorrect === true) return;
        
        const finalGuess = (overrideValue !== undefined ? overrideValue : userGuess).trim().toLowerCase();
        const correct = finalGuess === currentItem.answer;
        
        setIsCorrect(correct);
        setShowDropdown(false);
        
        if (correct) {
            setScore(s => s + 15);
            await saveResult(true);
            setTimeout(() => {
                if (currentIndex < queue.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                    setUserGuess('');
                    setIsCorrect(null);
                } else {
                    onComplete(score + 15);
                }
            }, 800);
        } else {
            setScore(s => Math.max(0, s - 5));
            setTimeout(() => setIsCorrect(null), 800);
        }
    };

    const handleInputChange = (val: string) => {
        setUserGuess(val);
        if (val.trim()) {
            const filtered = COMMON_PREPOSITIONS.filter(p => 
                p.startsWith(val.toLowerCase()) && p !== val.toLowerCase()
            );
            setSuggestions(filtered);
            setSelectedIndex(0);
            setShowDropdown(filtered.length > 0);
        } else {
            setShowDropdown(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showDropdown) {
            if (e.key === 'Enter') void handleCheck();
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % suggestions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                break;
            case 'Enter':
            case 'Tab': {
                e.preventDefault();
                const selected = suggestions[selectedIndex];
                setUserGuess(selected);
                setShowDropdown(false);
                void handleCheck(selected);
                break;
            }
            case 'Escape':
                setShowDropdown(false);
                break;
        }
    };

    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full relative p-6 justify-center items-center text-center space-y-8 animate-in fade-in">
                <div className="space-y-2">
                    <div className="w-20 h-20 bg-violet-100 text-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm rotate-3">
                        <Zap size={40} fill="currentColor" />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Preposition Power</h2>
                    <p className="text-neutral-500 font-medium max-w-sm">Master dependent prepositions in IELTS contexts with smart suggestions.</p>
                </div>

                <div className="w-full max-w-sm bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6">
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
                            <button onClick={() => setGameMode('MASTER')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'MASTER' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                Master
                                <p className="text-[8px] font-normal opacity-70 mt-0.5">Weak items only</p>
                            </button>
                            <button onClick={() => setGameMode('TOTAL')} className={`p-2.5 rounded-xl border-2 text-[10px] font-bold transition-all ${gameMode === 'TOTAL' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'}`}>
                                Total
                                <p className="text-[8px] font-normal opacity-70 mt-0.5">All items</p>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                         <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question Count</span>
                            <span className="text-xl font-black text-violet-600">{sessionSize}</span>
                         </div>
                         <input
                            type="range" min="5" max="30" step="5" value={sessionSize}
                            onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                            className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-violet-500"
                        />
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={handleStartGame} className="px-12 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 flex items-center gap-2"><Play size={18} fill="white"/> Start Practice</button>
                </div>
            </div>
        );
    }

    const progress = ((currentIndex) / queue.length) * 100;

    return (
        <div className="flex flex-col h-full relative p-4 md:p-8 bg-white rounded-[2.5rem]">
            <header className="flex justify-between items-center mb-10 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Exit</button>
                
                <div className="flex flex-col items-center">
                    <div className="text-neutral-400 font-black text-[10px] uppercase tracking-widest">Question {currentIndex + 1} / {queue.length}</div>
                    <div className="h-1.5 w-40 bg-neutral-100 rounded-full mt-2 overflow-hidden shadow-inner">
                        <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>

                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest min-w-[80px] text-center">{score}</div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center space-y-12 max-w-3xl mx-auto w-full">
                <div className={`w-full bg-neutral-50 border-2 rounded-[3rem] p-10 md:p-16 text-center space-y-8 transition-all duration-300 ${isCorrect === true ? 'border-emerald-400 bg-emerald-50/30' : isCorrect === false ? 'border-rose-400 bg-rose-50/30 animate-shake' : 'border-neutral-100 shadow-sm'}`}>
                    <div className="space-y-4">
                        <div className="flex items-center justify-center gap-3">
                            <span className="px-3 py-1 bg-violet-100 text-violet-700 rounded-lg text-[10px] font-black uppercase tracking-widest border border-violet-200">Fill Blank</span>
                        </div>
                    </div>

                    <div className="text-xl md:text-2xl font-medium text-neutral-700 leading-relaxed min-h-[4rem]">
                        {currentItem.example.split('___').map((part, i, arr) => (
                            <React.Fragment key={i}>
                                <span>{part}</span>
                                {i < arr.length - 1 && (
                                    <div className="inline-block mx-2 relative">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={userGuess}
                                            onChange={(e) => handleInputChange(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            disabled={isCorrect === true}
                                            placeholder="..."
                                            className={`
                                                w-[5ch] min-w-[100px] text-center bg-transparent border-b-4 outline-none font-black transition-all
                                                ${isCorrect === true ? 'border-emerald-500 text-emerald-600' : isCorrect === false ? 'border-rose-500 text-rose-600' : 'border-neutral-300 focus:border-violet-600 text-neutral-900'}
                                            `}
                                            autoComplete="off"
                                        />
                                        {isCorrect === true && <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce text-emerald-500"><Check size={20} strokeWidth={4}/></div>}
                                        
                                        {showDropdown && (
                                            <div ref={dropdownRef} className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-32 bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                                                {suggestions.map((suggestion, sIdx) => (
                                                    <button
                                                        key={suggestion}
                                                        onClick={() => {
                                                            setUserGuess(suggestion);
                                                            setShowDropdown(false);
                                                            void handleCheck(suggestion);
                                                        }}
                                                        className={`w-full px-4 py-2.5 text-sm font-bold text-left transition-colors ${selectedIndex === sIdx ? 'bg-violet-500 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}
                                                    >
                                                        {suggestion}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="flex gap-4 shrink-0">
                    <button 
                        onClick={async () => {
                            await saveResult(false);
                            if (currentIndex < queue.length - 1) {
                                setCurrentIndex(prev => prev + 1);
                                setUserGuess('');
                                setIsCorrect(null);
                            } else {
                                onComplete(score);
                            }
                        }}
                        className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all flex items-center gap-2"
                    >
                        Skip <ChevronRight size={18}/>
                    </button>

                    <button 
                        onClick={() => void handleCheck()}
                        disabled={userGuess.trim().length === 0 || isCorrect === true}
                        className="px-12 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 disabled:opacity-30 flex items-center gap-2"
                    >
                        Check Answer
                    </button>
                </div>
            </main>

            <footer className="mt-auto pt-8 flex items-center justify-between text-[10px] font-black uppercase text-neutral-300 tracking-widest border-t border-neutral-50">
                <span>IELTS VOCAB PRO • PREPOSITION POWER</span>
                <div className="flex items-center gap-2">
                    <Search size={12} />
                    <span>Type to see autocomplete suggestions</span>
                </div>
                <span>LEVEL {currentIndex + 1}</span>
            </footer>
        </div>
    );
};
