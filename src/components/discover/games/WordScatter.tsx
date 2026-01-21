import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Target, Play, ChevronLeft, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

// Card interface
interface Card {
    id: string; // unique id for this card instance
    text: string; // the word/phrase to display
    cueId: string; // the ID of the cue it matches
    x: number; // position x %
    y: number; // position y %
    rotation: number; // rotation in degrees
    state: 'default' | 'correct' | 'incorrect';
    zIndex: number;
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

const MIN_WORDS = 5;
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
    const [sessionSize, setSessionSize] = useState(15);
    const [sources, setSources] = useState({ library: true, collocations: true, idioms: true });

    // Gameplay State
    const [cards, setCards] = useState<Card[]>([]);
    const [cues, setCues] = useState<Cue[]>([]);
    const [currentCueIndex, setCurrentCueIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [correctlyAnswered, setCorrectlyAnswered] = useState<string[]>([]);
    const [answeredCueIds, setAnsweredCueIds] = useState<Set<string>>(new Set());

    // Drag and Drop state
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingInfo, setDraggingInfo] = useState<{ cardId: string; offsetX: number; offsetY: number; } | null>(null);
    const pointerStartRef = useRef<{ x: number, y: number } | null>(null);

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

        if (allPairs.length < sessionSize) {
            alert(`Not enough items from selected sources for this game. Need at least ${sessionSize}, but found only ${allPairs.length}.`);
            setGameState('SETUP');
            return;
        }

        const shuffledPairs = shuffleArray(allPairs);
        const gamePairs = shuffledPairs.slice(0, sessionSize);

        const newCues: Cue[] = [];
        const newCards: Omit<Card, 'x' | 'y' | 'rotation' | 'zIndex'>[] = [];

        gamePairs.forEach(pair => {
            newCues.push({ id: pair.cueId, text: pair.d });
            newCards.push({ id: `card-${pair.cueId}`, text: pair.text, cueId: pair.cueId, state: 'default' });
        });

        // Grid-based positioning to reduce overlap
        const numCards = newCards.length;
        const containerAspectRatio = 1.6; // Assuming a roughly 16:10 or similar wide container
        const numCols = Math.ceil(Math.sqrt(numCards * containerAspectRatio));
        const numRows = Math.ceil(numCards / numCols);

        const xMargin = 10; // % from each side
        const yMargin = 10; // % from top/bottom
        const gridWidth = 100 - xMargin * 2;
        const gridHeight = 100 - yMargin * 2;

        const cellWidth = gridWidth / numCols;
        const cellHeight = gridHeight / numRows;

        // Create an array of cell indices and shuffle them
        const cellIndices = Array.from({ length: numCards }, (_, i) => i);
        shuffleArray(cellIndices);

        const positionedCards = newCards.map((card, index) => {
            const gridIndex = cellIndices[index];
            const row = Math.floor(gridIndex / numCols);
            const col = gridIndex % numCols;

            // Add random jitter within the cell
            const x = xMargin + col * cellWidth + Math.random() * cellWidth;
            const y = yMargin + row * cellHeight + Math.random() * cellHeight;

            return {
                ...card,
                x: x,
                y: y,
                rotation: Math.random() * 50 - 25,
                zIndex: index,
            };
        });

        setCards(shuffleArray(positionedCards));
        setCues(shuffleArray(newCues));
        setCurrentCueIndex(0);
        setScore(0);
        setCorrectlyAnswered([]);
        setAnsweredCueIds(new Set());
        
    }, [gameState, sessionSize, words, sources]);

    // Game over check
    useEffect(() => {
        if (gameState === 'PLAYING' && sessionSize > 0 && answeredCueIds.size === sessionSize) {
             setTimeout(() => onComplete(score), 800);
        }
    }, [gameState, answeredCueIds, sessionSize, score, onComplete]);

    const handleCardClick = (clickedCard: Card) => {
        const currentCue = cues[currentCueIndex];
        if (!currentCue || answeredCueIds.has(currentCue.id) || clickedCard.state !== 'default') return;

        if (clickedCard.cueId === currentCue.id) {
            setScore(s => s + 10);
            setCards(prev => prev.map(c => c.id === clickedCard.id ? {...c, state: 'correct'} : c));

            setTimeout(() => {
                const newAnsweredIds = new Set(answeredCueIds).add(currentCue.id);
                setAnsweredCueIds(newAnsweredIds);
                setCorrectlyAnswered(prev => [...prev, clickedCard.text]);
                setCards(prev => prev.filter(c => c.id !== clickedCard.id));

                let nextUnansweredIndex = -1;
    
                // Search forward from the current position
                for (let i = currentCueIndex + 1; i < cues.length; i++) {
                    if (!newAnsweredIds.has(cues[i].id)) {
                        nextUnansweredIndex = i;
                        break;
                    }
                }
            
                // If not found, search from the beginning
                if (nextUnansweredIndex === -1) {
                    for (let i = 0; i < currentCueIndex; i++) {
                        if (!newAnsweredIds.has(cues[i].id)) {
                            nextUnansweredIndex = i;
                            break;
                        }
                    }
                }

                if (nextUnansweredIndex !== -1) {
                    setCurrentCueIndex(nextUnansweredIndex);
                }
            }, 300); // Animation duration
        } else {
            setScore(s => Math.max(0, s - 5));
            setCards(prev => prev.map(c => c.id === clickedCard.id ? {...c, state: 'incorrect'} : c));
            setTimeout(() => {
                setCards(prev => prev.map(c => c.id === clickedCard.id ? {...c, state: 'default'} : c));
            }, 600);
        }
    };
    
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, cardId: string) => {
        if (cards.find(c => c.id === cardId)?.state !== 'default') return;
        e.preventDefault();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        
        pointerStartRef.current = { x: e.clientX, y: e.clientY };

        const cardRect = target.getBoundingClientRect();
        
        setDraggingInfo({
            cardId,
            offsetX: e.clientX - cardRect.left,
            offsetY: e.clientY - cardRect.top,
        });

        // Bring card to front
        setCards(prev => {
            const maxZ = Math.max(...prev.map(c => c.zIndex)) + 1;
            return prev.map(c => c.id === cardId ? { ...c, zIndex: maxZ } : c);
        });
    };
    
    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingInfo || !containerRef.current) return;
        e.preventDefault();

        const containerRect = containerRef.current.getBoundingClientRect();

        const newX = Math.min(100, Math.max(0, ((e.clientX - containerRect.left - draggingInfo.offsetX) / containerRect.width) * 100));
        const newY = Math.min(100, Math.max(0, ((e.clientY - containerRect.top - draggingInfo.offsetY) / containerRect.height) * 100));

        setCards(prev => prev.map(c => 
            c.id === draggingInfo.cardId 
            ? { ...c, x: newX, y: newY }
            : c
        ));
    };
    
    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>, card: Card) => {
        e.preventDefault();
        e.currentTarget.releasePointerCapture(e.pointerId);

        if (pointerStartRef.current) {
            const dx = e.clientX - pointerStartRef.current.x;
            const dy = e.clientY - pointerStartRef.current.y;
            if (Math.sqrt(dx*dx + dy*dy) < 5) {
                handleCardClick(card);
            }
        }
        
        setDraggingInfo(null);
        pointerStartRef.current = null;
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
    
    const currentUnansweredIdx = useMemo(() => {
        return unansweredCues.findIndex(c => c.originalIndex === currentCueIndex);
    }, [unansweredCues, currentCueIndex]);

    const getCardClasses = (state: Card['state']) => {
        switch (state) {
            case 'correct': return 'bg-emerald-500 border-emerald-400 text-white scale-75 opacity-0 shadow-xl z-20 pointer-events-none';
            case 'incorrect': return 'bg-red-500 border-red-400 text-white animate-shake z-20';
            default: return 'bg-white border-neutral-200 text-neutral-800 hover:border-fuchsia-400 hover:shadow-lg';
        }
    };

    if (gameState === 'SETUP') {
        const CheckboxOption: React.FC<{ label: string; checked: boolean; onChange: () => void; }> = ({ label, checked, onChange }) => (
            <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors" onClick={onChange}>
                {checked ? <CheckSquare size={20} className="text-fuchsia-600" /> : <Square size={20} className="text-neutral-300" />}
                <span className="font-bold text-sm text-neutral-800">{label}</span>
            </label>
        );

        const canStart = sources.library || sources.collocations || sources.idioms;

        return (
            <div className="flex flex-col h-full relative p-6 justify-center items-center text-center space-y-8">
                <div className="space-y-2">
                    <h2 className="text-3xl font-black text-neutral-900">Word Scatter Setup</h2>
                    <p className="text-neutral-500 font-medium">Choose your content and session size.</p>
                </div>

                <div className="w-full max-w-sm bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
                    <div className="space-y-2">
                         <label htmlFor="sessionSize" className="text-sm font-bold text-neutral-600">
                            Items to match: <span className="text-2xl font-black text-fuchsia-600">{sessionSize}</span>
                         </label>
                         <input
                            id="sessionSize"
                            type="range"
                            min={MIN_WORDS}
                            max={MAX_WORDS}
                            value={sessionSize}
                            onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                        />
                         <div className="flex justify-between text-xs font-bold text-neutral-400">
                             <span>{MIN_WORDS}</span>
                             <span>{MAX_WORDS}</span>
                         </div>
                    </div>
                    <div className="space-y-2 pt-6 border-t border-neutral-100">
                        <label className="text-sm font-bold text-neutral-600 px-1">Content Sources</label>
                        <CheckboxOption
                            label="Library Words"
                            checked={sources.library}
                            onChange={() => setSources(s => ({ ...s, library: !s.library }))}
                        />
                        <CheckboxOption
                            label="Collocations"
                            checked={sources.collocations}
                            onChange={() => setSources(s => ({ ...s, collocations: !s.collocations }))}
                        />
                        <CheckboxOption
                            label="Idioms"
                            checked={sources.idioms}
                            onChange={() => setSources(s => ({ ...s, idioms: !s.idioms }))}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-4 items-center">
                    <div className="flex gap-4">
                        <button onClick={onExit} className="px-8 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all">Back</button>
                        <button onClick={() => setGameState('PLAYING')} disabled={!canStart} className="px-8 py-4 bg-fuchsia-600 text-white font-bold rounded-2xl hover:bg-fuchsia-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Play size={18}/> Start Game</button>
                    </div>
                    {!canStart && <p className="text-xs text-red-500 font-bold">Please select at least one content source.</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col absolute inset-0 p-6 bg-white rounded-[2.5rem]">
            <header className="flex justify-between items-center mb-4 shrink-0">
                <button onClick={() => onComplete(score)} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Finish Early</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">Word Scatter</div>
            </header>

            <div 
                ref={containerRef}
                className="flex-1 bg-neutral-50/50 rounded-[2rem] border-2 border-dashed border-neutral-200 relative overflow-hidden touch-none"
            >
                {cards.map(card => (
                    <div
                        key={card.id}
                        role="button"
                        tabIndex={card.state === 'default' ? 0 : -1}
                        onPointerDown={(e) => handlePointerDown(e, card.id)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={(e) => handlePointerUp(e, card)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(card); }}
                        className={`absolute rounded-xl border-b-4 p-3 flex items-center justify-center text-center transition-all duration-300 cursor-grab ${getCardClasses(card.state)} ${draggingInfo?.cardId === card.id ? 'cursor-grabbing shadow-2xl scale-105' : 'hover:-translate-y-1'}`}
                        style={{
                            left: `${card.x}%`,
                            top: `${card.y}%`,
                            transform: `translate(-50%, -50%) rotate(${card.rotation}deg)`,
                            minWidth: '120px',
                            maxWidth: '200px',
                            zIndex: card.zIndex,
                        }}
                    >
                        <span className="font-bold text-sm md:text-base leading-tight pointer-events-none select-none">{card.text}</span>
                    </div>
                ))}
            </div>
            
            <footer className="shrink-0 mt-4 h-28 flex flex-col justify-center items-center gap-2 p-4 bg-white rounded-[2rem] border border-neutral-200 shadow-sm relative">
                {cues.length > 0 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-2 bg-fuchsia-500 text-white rounded-full font-black text-xs flex items-center gap-2 shadow-lg">
                       {answeredCueIds.size} / {sessionSize}
                    </div>
                )}
                <div className="flex items-center justify-between w-full px-4">
                    <button onClick={handlePrevCue} disabled={currentUnansweredIdx <= 0} className="p-3 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="text-center flex-1">
                        {currentCue ? (
                            <>
                                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center justify-center gap-1.5"><Target size={12}/> Find the phrase for:</p>
                                <p className="text-center font-bold text-neutral-800 text-base leading-tight px-4">{currentCue.text}</p>
                            </>
                        ) : (
                             cues.length > 0 && answeredCueIds.size === sessionSize
                             ? <p className="text-center font-bold text-emerald-800 text-lg">Well done!</p>
                             : <p className="text-center font-bold text-neutral-800 text-lg">Loading Game...</p>
                        )}
                    </div>
                     <button onClick={handleNextCue} disabled={currentUnansweredIdx >= unansweredCues.length - 1} className="p-3 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors">
                        <ChevronRight size={24} />
                    </button>
                </div>
            </footer>

            {correctlyAnswered.length > 0 && (
                <div className="mt-4 p-4 bg-emerald-50/50 rounded-2xl border-2 border-dashed border-emerald-200 animate-in fade-in duration-300 overflow-y-auto">
                    <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-2">Correct Answers ({correctlyAnswered.length})</h4>
                    <div className="columns-2 md:columns-4 gap-x-4 text-sm font-bold text-emerald-800">
                        {correctlyAnswered.map((word, index) => (
                            <p key={index} className="break-inside-avoid-column mb-1">{word}</p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
