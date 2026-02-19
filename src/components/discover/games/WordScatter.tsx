
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Target, Play, ChevronLeft, ChevronRight, CheckSquare, Square, RefreshCw, Check, LayoutGrid, Columns, BookOpen, Languages, CheckCircle2 } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

// Card interface simplified for grid layout
interface Card {
    id: string; // unique id for this card instance
    text: string; // the word/phrase to display
    cueId: string; // the ID of the cue it matches
    state: 'default' | 'correct' | 'incorrect';
    type: 'word' | 'meaning';
    pairId: string;
}

// Cue interface
interface Cue {
    id: string; // unique id for this cue
    text: string; // the meaning/hint to display
}

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

const MIN_WORDS = 10;
const MAX_WORDS = 50;

function shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

export const WordScatter: React.FC<Props> = ({ words, onComplete, onExit }) => {
    // Game State
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [viewMode, setViewMode] = useState<'MATRIX' | 'MATCH'>('MATRIX');
    const [sessionSize, setSessionSize] = useState(12);
    const [sources, setSources] = useState({ library: true, collocations: true, idioms: true });

    // Gameplay State
    const [cards, setCards] = useState<Card[]>([]);
    const [matchCardsLeft, setMatchCardsLeft] = useState<Card[]>([]);
    const [matchCardsRight, setMatchCardsRight] = useState<Card[]>([]);
    const [cues, setCues] = useState<Cue[]>([]);
    const [currentCueIndex, setCurrentCueIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [answeredCueIds, setAnsweredCueIds] = useState<Set<string>>(new Set());

    // Matching State (Split view)
    const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
    const [selectedRightId, setSelectedRightId] = useState<string | null>(null);

    // Memoize the unanswered cues and their original indices for navigation
    const unansweredCues = useMemo(() => {
        return cues
            .map((cue, index) => ({ ...cue, originalIndex: index }))
            .filter(cue => !answeredCueIds.has(cue.id));
    }, [cues, answeredCueIds]);
    
    // Game setup
    useEffect(() => {
        if (gameState !== 'PLAYING') return;

        const allPairs: { text: string; d: string; cueId: string; }[] = [];
        words.forEach(word => {
            if (sources.library && word.meaningVi && word.meaningVi.trim()) {
                allPairs.push({ text: word.word, d: word.meaningVi, cueId: `cue-${word.id}-word` });
            }
            if (sources.collocations) {
                const wordCollocs = (word.collocationsArray || []).filter(c => !c.isIgnored && c.d && c.d.trim());
                wordCollocs.forEach((c, index) => {
                    allPairs.push({ text: c.text, d: c.d!, cueId: `cue-${word.id}-col-${index}` });
                });
            }
            if (sources.idioms) {
                const wordIdioms = (word.idiomsList || []).filter(i => !i.isIgnored && i.d && i.d.trim());
                wordIdioms.forEach((i, index) => {
                    allPairs.push({ text: i.text, d: i.d!, cueId: `cue-${word.id}-idm-${index}` });
                });
            }
        });

        if (allPairs.length < MIN_WORDS) {
            alert(`Not enough items found (found ${allPairs.length}, need min ${MIN_WORDS}).`);
            setGameState('SETUP');
            return;
        }

        const shuffledPairs = shuffleArray(allPairs);
        const gamePairs = shuffledPairs.slice(0, sessionSize);

        const newCues: Cue[] = [];
        const newCards: Card[] = [];
        const left: Card[] = [];
        const right: Card[] = [];

        gamePairs.forEach(pair => {
            const pairId = pair.cueId;
            newCues.push({ id: pairId, text: pair.d });
            
            // Matrix card
            newCards.push({ id: `card-${pairId}`, text: pair.text, cueId: pairId, pairId, state: 'default', type: 'word' });
            
            // Match cards
            left.push({ id: `l-${pairId}`, text: pair.text, cueId: pairId, pairId, state: 'default', type: 'word' });
            right.push({ id: `r-${pairId}`, text: pair.d, cueId: pairId, pairId, state: 'default', type: 'meaning' });
        });

        setCards(shuffleArray(newCards));
        setMatchCardsLeft(shuffleArray(left));
        setMatchCardsRight(shuffleArray(right));
        setCues(shuffleArray(newCues));
        setCurrentCueIndex(0);
        setScore(0);
        setAnsweredCueIds(new Set());
        setSelectedLeftId(null);
        setSelectedRightId(null);
        
    }, [gameState, sessionSize, words, sources]);

    // Game over check
    useEffect(() => {
        if (gameState === 'PLAYING' && sessionSize > 0 && answeredCueIds.size === sessionSize) {
             setTimeout(() => onComplete(score), 800);
        }
    }, [gameState, answeredCueIds, sessionSize, score, onComplete]);

    const handleMatrixCardClick = (clickedCard: Card) => {
        const currentCue = cues[currentCueIndex];
        if (!currentCue || answeredCueIds.has(currentCue.id) || clickedCard.state !== 'default') return;

        if (clickedCard.cueId === currentCue.id) {
            setScore(s => s + 10);
            setCards(prev => prev.map(c => c.id === clickedCard.id ? {...c, state: 'correct'} : c));
            setMatchCardsLeft(prev => prev.map(c => c.pairId === clickedCard.pairId ? {...c, state: 'correct'} : c));
            setMatchCardsRight(prev => prev.map(c => c.pairId === clickedCard.pairId ? {...c, state: 'correct'} : c));

            setTimeout(() => {
                const newAnsweredIds = new Set(answeredCueIds).add(currentCue.id);
                setAnsweredCueIds(newAnsweredIds);

                let nextUnansweredIndex = -1;
                for (let i = currentCueIndex + 1; i < cues.length; i++) {
                    if (!newAnsweredIds.has(cues[i].id)) {
                        nextUnansweredIndex = i;
                        break;
                    }
                }
                if (nextUnansweredIndex === -1) {
                    for (let i = 0; i < currentCueIndex; i++) {
                        if (!newAnsweredIds.has(cues[i].id)) {
                            nextUnansweredIndex = i;
                            break;
                        }
                    }
                }
                if (nextUnansweredIndex !== -1) setCurrentCueIndex(nextUnansweredIndex);
            }, 400); 
        } else {
            setScore(s => Math.max(0, s - 5));
            setCards(prev => prev.map(c => c.id === clickedCard.id ? {...c, state: 'incorrect'} : c));
            setTimeout(() => {
                setCards(prev => prev.map(c => c.id === clickedCard.id ? {...c, state: 'default'} : c));
            }, 600);
        }
    };

    const handleMatchClick = (card: Card) => {
        if (card.state === 'correct' || card.state === 'incorrect') return;

        if (card.type === 'word') {
            if (selectedRightId) {
                checkPairMatch(card.id, selectedRightId);
            } else {
                setSelectedLeftId(card.id === selectedLeftId ? null : card.id);
            }
        } else {
            if (selectedLeftId) {
                checkPairMatch(selectedLeftId, card.id);
            } else {
                setSelectedRightId(card.id === selectedRightId ? null : card.id);
            }
        }
    };

    const checkPairMatch = (leftId: string, rightId: string) => {
        const left = matchCardsLeft.find(c => c.id === leftId);
        const right = matchCardsRight.find(c => c.id === rightId);

        if (left && right && left.pairId === right.pairId) {
            // Match found
            setScore(s => s + 10);
            const nextAnswered = new Set(answeredCueIds).add(left.pairId);
            setAnsweredCueIds(nextAnswered);

            setMatchCardsLeft(prev => prev.map(c => c.id === leftId ? {...c, state: 'correct'} : c));
            setMatchCardsRight(prev => prev.map(c => c.id === rightId ? {...c, state: 'correct'} : c));
            setCards(prev => prev.map(c => c.pairId === left.pairId ? {...c, state: 'correct'} : c));

            setSelectedLeftId(null);
            setSelectedRightId(null);
        } else {
            // Error
            setScore(s => Math.max(0, s - 5));
            setMatchCardsLeft(prev => prev.map(c => c.id === leftId ? {...c, state: 'incorrect'} : c));
            setMatchCardsRight(prev => prev.map(c => c.id === rightId ? {...c, state: 'incorrect'} : c));
            setTimeout(() => {
                setMatchCardsLeft(prev => prev.map(c => ({...c, state: c.state === 'incorrect' ? 'default' : c.state})));
                setMatchCardsRight(prev => prev.map(c => ({...c, state: c.state === 'incorrect' ? 'default' : c.state})));
                setSelectedLeftId(null);
                setSelectedRightId(null);
            }, 600);
        }
    };
    
    const handlePrevCue = () => {
        const currentUnansweredIdx = unansweredCues.findIndex(c => c.originalIndex === currentCueIndex);
        if (currentUnansweredIdx > 0) {
            const prevCue = unansweredCues[currentUnansweredIdx - 1];
            setCurrentCueIndex(prevCue.originalIndex);
        }
    };

    const handleNextCue = () => {
        const currentUnansweredIdx = unansweredCues.findIndex(c => c.originalIndex === currentCueIndex);
        if (currentUnansweredIdx < unansweredCues.length - 1) {
            const nextCue = unansweredCues[currentUnansweredIdx + 1];
            setCurrentCueIndex(nextCue.originalIndex);
        }
    };

    const currentCue = cues[currentCueIndex];
    const currentUnansweredIdx = unansweredCues.findIndex(c => c.originalIndex === currentCueIndex);

    if (gameState === 'SETUP') {
        const CheckboxOption: React.FC<{ label: string; checked: boolean; onChange: () => void; }> = ({ label, checked, onChange }) => (
            <label className="flex items-center gap-3 p-3 rounded-2xl bg-neutral-50 border-2 border-transparent hover:border-fuchsia-100 cursor-pointer transition-all" onClick={onChange}>
                {checked ? <CheckSquare size={18} className="text-fuchsia-600" /> : <Square size={18} className="text-neutral-300" />}
                <span className="font-bold text-xs text-neutral-800">{label}</span>
            </label>
        );

        const canStart = sources.library || sources.collocations || sources.idioms;

        return (
            <div className="flex flex-col h-full relative p-6 items-center animate-in fade-in overflow-y-auto">
                <div className="text-center space-y-2 mb-6 mt-auto">
                    <div className="w-16 h-16 bg-fuchsia-100 text-fuchsia-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <RefreshCw size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Word Scatter</h2>
                    <p className="text-neutral-500 font-medium text-sm max-w-sm mx-auto">Match hidden words to their definitions.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-auto">
                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-4 flex flex-col justify-center">
                         <label htmlFor="sessionSize" className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block text-left px-1">
                            Items: <span className="text-xl font-black text-fuchsia-600">{sessionSize}</span>
                         </label>
                         <input
                            id="sessionSize"
                            type="range"
                            min={MIN_WORDS}
                            max={MAX_WORDS}
                            value={sessionSize}
                            onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                            className="w-full h-2 bg-neutral-100 rounded-full appearance-none cursor-pointer accent-fuchsia-500"
                        />
                         <div className="flex justify-between text-[9px] font-black text-neutral-300 uppercase px-1">
                             <span>{MIN_WORDS}</span>
                             <span>{MAX_WORDS}</span>
                         </div>
                    </div>
                    
                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-2">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block text-left px-1">Content Sources</label>
                        <div className="grid grid-cols-1 gap-2">
                            <CheckboxOption label="Library Definitions" checked={sources.library} onChange={() => setSources(s => ({ ...s, library: !s.library }))} />
                            <CheckboxOption label="Collocations" checked={sources.collocations} onChange={() => setSources(s => ({ ...s, collocations: !s.collocations }))} />
                            <CheckboxOption label="Idioms" checked={sources.idioms} onChange={() => setSources(s => ({ ...s, idioms: !s.idioms }))} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 w-full max-w-md">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={() => setGameState('PLAYING')} disabled={!canStart} className="flex-1 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95">
                        <Play size={18} fill="white"/> Start
                    </button>
                </div>
            </div>
        );
    }

    const progress = (answeredCueIds.size / sessionSize) * 100;

    return (
        <div className="flex flex-col h-full relative p-4 md:p-6 bg-white rounded-[2.5rem]">
            <header className="flex justify-between items-center mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => onComplete(score)} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Finish</button>
                    <div className="flex bg-neutral-100 p-1 rounded-xl">
                        <button onClick={() => setViewMode('MATRIX')} className={`p-2 rounded-lg transition-all ${viewMode === 'MATRIX' ? 'bg-white shadow-sm text-fuchsia-600' : 'text-neutral-400 hover:text-neutral-600'}`} title="Matrix View"><LayoutGrid size={18}/></button>
                        <button onClick={() => setViewMode('MATCH')} className={`p-2 rounded-lg transition-all ${viewMode === 'MATCH' ? 'bg-white shadow-sm text-fuchsia-600' : 'text-neutral-400 hover:text-neutral-600'}`} title="Match View"><Columns size={18}/></button>
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    <div className="text-neutral-400 font-black text-[10px] uppercase tracking-widest">Progress</div>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-fuchsia-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            {viewMode === 'MATRIX' ? (
                <>
                    {/* MATRIX VIEW */}
                    <div className="shrink-0 mb-6 py-6 px-8 bg-neutral-50 border border-neutral-200 rounded-[2rem] shadow-sm relative overflow-hidden flex flex-col items-center">
                        <div className="flex items-center justify-between w-full">
                            <button onClick={handlePrevCue} disabled={currentUnansweredIdx <= 0} className="p-3 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-neutral-900 disabled:opacity-20 transition-all shadow-sm">
                                <ChevronLeft size={24} />
                            </button>
                            <div className="text-center flex-1 px-10">
                                {currentCue ? (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <p className="text-[10px] font-black uppercase text-fuchsia-500 tracking-widest flex items-center justify-center gap-1.5 mb-2"><Target size={12}/> Find the term for:</p>
                                        <h3 className="text-lg md:text-xl font-bold text-neutral-800 leading-tight">{currentCue.text}</h3>
                                    </div>
                                ) : <p className="text-center font-black text-emerald-600 text-xl animate-bounce">CLEARED!</p>}
                            </div>
                             <button onClick={handleNextCue} disabled={currentUnansweredIdx >= unansweredCues.length - 1} className="p-3 bg-white border border-neutral-200 rounded-xl text-neutral-400 hover:text-neutral-900 disabled:opacity-20 transition-all shadow-sm">
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
                        <div className={`grid gap-3 ${
                            sessionSize <= 12 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 
                            sessionSize <= 24 ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6' : 
                            'grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
                        }`}>
                            {cards.map(card => {
                                const isCorrect = card.state === 'correct';
                                const isIncorrect = card.state === 'incorrect';
                                return (
                                    <button
                                        key={card.id}
                                        onClick={() => handleMatrixCardClick(card)}
                                        disabled={isCorrect}
                                        className={`
                                            relative h-16 px-2 rounded-2xl border-2 transition-all duration-300 flex items-center justify-center text-center shadow-sm font-bold text-xs leading-tight
                                            ${isCorrect ? 'bg-emerald-500 border-emerald-500 text-white scale-90 opacity-0 pointer-events-none' : isIncorrect ? 'bg-rose-50 border-rose-500 text-rose-600 animate-shake' : 'bg-white border-neutral-100 text-neutral-700 hover:border-fuchsia-300 hover:text-neutral-900 hover:-translate-y-0.5 active:scale-95'}
                                        `}
                                    >
                                        <span className="line-clamp-2">{card.text}</span>
                                        {isCorrect && <Check size={20} className="absolute inset-auto animate-ping" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            ) : (
                /* MATCH VIEW */
                <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                    <div className="grid grid-cols-2 gap-10">
                        {/* Left Section: English Words */}
                        <div className="space-y-4">
                            <h3 className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 flex items-center justify-center gap-2"><BookOpen size={12}/> English</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {matchCardsLeft.map(card => {
                                    const isSelected = selectedLeftId === card.id;
                                    const isCorrect = card.state === 'correct';
                                    const isIncorrect = card.state === 'incorrect';
                                    if (isCorrect) return <div key={card.id} className="h-16 flex items-center justify-center text-teal-500 opacity-20"><CheckCircle2 size={32}/></div>;
                                    
                                    let style = "bg-white border-neutral-200 text-neutral-800 hover:border-fuchsia-300 hover:-translate-y-0.5";
                                    if (isSelected) style = "bg-fuchsia-600 border-fuchsia-600 text-white shadow-lg ring-4 ring-fuchsia-100 scale-105";
                                    if (isIncorrect) style = "bg-red-50 border-red-500 text-red-700 animate-shake";

                                    return (
                                        <button 
                                            key={card.id} 
                                            onClick={() => handleMatchClick(card)}
                                            className={`h-16 px-4 rounded-xl border-b-4 font-bold text-sm transition-all duration-200 flex items-center justify-center text-center leading-tight shadow-sm ${style}`}
                                        >
                                            {card.text}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Section: Meanings */}
                        <div className="space-y-4">
                            <h3 className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 flex items-center justify-center gap-2"><Languages size={12}/> Meaning</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {matchCardsRight.map(card => {
                                    const isSelected = selectedRightId === card.id;
                                    const isCorrect = card.state === 'correct';
                                    const isIncorrect = card.state === 'incorrect';
                                    if (isCorrect) return <div key={card.id} className="h-20 flex items-center justify-center text-teal-500 opacity-20"><CheckCircle2 size={32}/></div>;
                                    
                                    let style = "bg-white border-neutral-200 text-neutral-700 hover:border-indigo-300 hover:-translate-y-0.5";
                                    if (isSelected) style = "bg-indigo-600 border-indigo-600 text-white shadow-lg ring-4 ring-indigo-100 scale-105";
                                    if (isIncorrect) style = "bg-red-50 border-red-500 text-red-700 animate-shake";

                                    return (
                                        <button 
                                            key={card.id} 
                                            onClick={() => handleMatchClick(card)}
                                            className={`min-h-20 px-4 py-3 rounded-xl border-b-4 font-medium text-xs transition-all duration-200 flex items-center justify-center text-center leading-relaxed shadow-sm ${style}`}
                                        >
                                            {card.text}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <footer className="shrink-0 mt-2 flex items-center justify-between text-[10px] font-black uppercase text-neutral-400 tracking-widest px-4 border-t border-neutral-100 pt-4">
                <span>Total Items: {sessionSize}</span>
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Matched</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-neutral-200"></div> Hidden</span>
                </div>
                <span>Completed: {answeredCueIds.size}</span>
            </footer>
        </div>
    );
};
