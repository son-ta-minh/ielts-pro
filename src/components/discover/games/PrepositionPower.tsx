
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Check, ChevronRight, Volume2, HelpCircle, Zap, Search, Loader2 } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';
import { speak } from '../../../utils/audio';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

interface PrepositionItem {
    id: string;
    word: string;
    example: string;
    answer: string;
    meaning: string;
}

const COMMON_PREPOSITIONS = [
    'in', 'on', 'at', 'to', 'for', 'with', 'of', 'from', 'by', 'about', 
    'into', 'through', 'over', 'under', 'between', 'among', 'against', 
    'during', 'without', 'before', 'after', 'toward', 'upon', 'within', 'along'
].sort();

export const PrepositionPower: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [queue, setQueue] = useState<PrepositionItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userGuess, setUserGuess] = useState('');
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);
    const [showHint, setShowHint] = useState(false);
    
    // Autocomplete state
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleStartGame = () => {
        const candidates = words.filter(w => w.prepositions && w.prepositions.some(p => !p.isIgnored) && w.example);
        if (candidates.length < 3) {
            alert("Not enough vocabulary with prepositions and examples found in your library.");
            return;
        }

        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        const newQueue: PrepositionItem[] = [];

        for (const w of shuffled) {
            if (newQueue.length >= sessionSize) break;
            
            const activePreps = w.prepositions!.filter(p => !p.isIgnored);
            const shuffledPreps = [...activePreps].sort(() => Math.random() - 0.5);
            
            for (const prep of shuffledPreps) {
                const escapedWord = w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedWord}\\s+${prep.prep}\\b`, 'i');
                
                if (regex.test(w.example)) {
                    // Truncate at first period
                    let truncatedExample = w.example.split('.')[0] + '.';
                    // Double check regex still works in truncated part
                    if (regex.test(truncatedExample)) {
                        const exampleWithBlank = truncatedExample.replace(regex, `${w.word} ___`);
                        newQueue.push({ 
                            id: `${w.id}-${prep.prep}`, 
                            word: w.word, 
                            example: exampleWithBlank, 
                            answer: prep.prep.toLowerCase(),
                            meaning: w.meaningVi
                        });
                        break; 
                    }
                }
            }
        }

        if (newQueue.length < 1) {
            alert("Could not generate questions from existing data.");
            return;
        }

        setQueue(newQueue);
        setGameState('PLAYING');
        setCurrentIndex(0);
        setScore(0);
        setUserGuess('');
        setIsCorrect(null);
        setShowHint(false);
    };

    const currentItem = queue[currentIndex];

    useEffect(() => {
        if (gameState === 'PLAYING' && inputRef.current) {
            inputRef.current.focus();
        }
    }, [currentIndex, gameState]);

    const handleCheck = (overrideValue?: string) => {
        if (!currentItem || isCorrect === true) return;
        
        const finalGuess = (overrideValue !== undefined ? overrideValue : userGuess).trim().toLowerCase();
        const correct = finalGuess === currentItem.answer;
        
        setIsCorrect(correct);
        setShowDropdown(false);
        
        if (correct) {
            setScore(s => s + 15);
            setTimeout(() => {
                if (currentIndex < queue.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                    setUserGuess('');
                    setIsCorrect(null);
                    setShowHint(false);
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
            if (e.key === 'Enter') handleCheck();
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
            case 'Tab':
                e.preventDefault();
                const selected = suggestions[selectedIndex];
                setUserGuess(selected);
                setShowDropdown(false);
                handleCheck(selected);
                break;
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
                            <h3 className="text-2xl font-black text-neutral-900 tracking-tight">{currentItem.word}</h3>
                            <button onClick={() => speak(currentItem.word)} className="p-2 text-neutral-400 hover:text-violet-600 transition-colors"><Volume2 size={18}/></button>
                        </div>
                        {showHint && <p className="text-sm font-bold text-violet-600 animate-in fade-in slide-in-from-top-1">{currentItem.meaning}</p>}
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
                                                            handleCheck(suggestion);
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
                        onClick={() => setShowHint(!showHint)} 
                        className="p-4 bg-white border border-neutral-200 text-neutral-400 hover:text-violet-600 hover:border-violet-200 rounded-2xl transition-all shadow-sm"
                        title="Show meaning"
                    >
                        <HelpCircle size={24} />
                    </button>
                    
                    <button 
                        onClick={() => {
                            if (currentIndex < queue.length - 1) {
                                setCurrentIndex(prev => prev + 1);
                                setUserGuess('');
                                setIsCorrect(null);
                                setShowHint(false);
                            } else {
                                onComplete(score);
                            }
                        }}
                        className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all flex items-center gap-2"
                    >
                        Skip <ChevronRight size={18}/>
                    </button>

                    <button 
                        onClick={() => handleCheck()}
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
