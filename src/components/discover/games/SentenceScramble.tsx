import React, { useState } from 'react';
import { ArrowLeft, Volume2, Play, Check, Shuffle, Brain, Zap, Layers } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';
import { speak } from '../../../utils/audio';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface SentenceItem {
    id: string;
    word: string;
    originalSentence: string;
    shuffledChunks: string[];
}

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

export const SentenceScramble: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
    const [sessionSize, setSessionSize] = useState(10);
    
    const [queue, setQueue] = useState<SentenceItem[]>([]);
    const [selectedChunks, setSelectedChunks] = useState<string[]>([]);
    // Track which source index each selected chunk came from so we can restore it on remove
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);
    
    // New state for insertion position
    const [insertionIndex, setInsertionIndex] = useState(0);

    const getFirstSentence = (text: string): string => {
        const match = text.match(/.*?[.!?](?:\s|$)/);
        return match ? match[0].trim() : text.trim();
    };

    const chunkify = (sentence: string, diff: Difficulty): string[] => {
        const wordsArr = sentence.split(/\s+/).filter(Boolean);
        if (diff === 'HARD') return wordsArr;

        const chunks: string[] = [];
        let i = 0;
        const maxChunkSize = diff === 'EASY' ? 3 : 2;

        while (i < wordsArr.length) {
            const size = Math.floor(Math.random() * maxChunkSize) + 1;
            const chunk = wordsArr.slice(i, i + size).join(' ');
            chunks.push(chunk);
            i += size;
        }
        return chunks;
    };

    const handleStartGame = () => {
        const candidates = words.filter(w => w.example && w.example.trim().split(/\s+/).filter(Boolean).length >= 5);
        if (candidates.length < 5) {
            alert("Not enough words with suitable example sentences (need at least 5).");
            return;
        }

        const shuffledCandidates = [...candidates].sort(() => Math.random() - 0.5);
        const newQueue = shuffledCandidates.slice(0, sessionSize).map(w => {
            const originalSentence = getFirstSentence(w.example);
            const chunks = chunkify(originalSentence, difficulty);
            const shuffled = [...chunks].sort(() => Math.random() - 0.5);
            return { id: w.id, word: w.word, originalSentence, shuffledChunks: shuffled };
        });

        setQueue(newQueue);
        setGameState('PLAYING');
        setScore(0);
        resetRound();
    };

    const resetRound = () => {
        setSelectedChunks([]);
        setSelectedIndices([]);
        setUsedIndices(new Set());
        setInsertionIndex(0);
        setIsCorrect(null);
    };

    const currentItem = queue[0];

    const handleChunkClick = (chunk: string, idx: number) => {
        if (isCorrect !== null) return;

        // Insert at the specific insertion index
        const newSelected = [...selectedChunks];
        newSelected.splice(insertionIndex, 0, chunk);
        
        setSelectedChunks(newSelected);
        // Also record which source index was used for this inserted chunk
        setSelectedIndices(prev => {
            const next = [...prev];
            next.splice(insertionIndex, 0, idx);
            return next;
        });
        setUsedIndices(prev => new Set(prev).add(idx));
        
        // Move cursor to after the inserted word
        setInsertionIndex(prev => prev + 1);
    };

    const handleRemoveChunk = (idxToRemove: number) => {
        if (isCorrect !== null) return;

        // Remove the selected chunk and restore the exact source index that contributed it
        setSelectedChunks(prev => prev.filter((_, i) => i !== idxToRemove));

        setSelectedIndices(prev => {
            const next = [...prev];
            const freedSourceIndex = next[idxToRemove];
            next.splice(idxToRemove, 1);
            // Immediately free the used index
            setUsedIndices(usedPrev => {
                const usedNext = new Set(usedPrev);
                usedNext.delete(freedSourceIndex);
                return usedNext;
            });
            return next;
        });

        // Adjust cursor if necessary
        if (insertionIndex > idxToRemove) {
            setInsertionIndex(prev => prev - 1);
        }
    };

    const handleCheck = () => {
        const assembled = selectedChunks.join(' ').toLowerCase().trim();
        const original = currentItem.originalSentence.toLowerCase().trim();
        
        if (assembled === original) {
            setIsCorrect(true);
            setScore(s => s + (difficulty === 'HARD' ? 25 : (difficulty === 'MEDIUM' ? 15 : 10)));
            setTimeout(() => {
                const nextQueue = queue.slice(1);
                setQueue(nextQueue);
                if (nextQueue.length === 0) onComplete(score + (difficulty === 'HARD' ? 25 : 15));
                else {
                    resetRound();
                }
            }, 1000);
        } else {
            setIsCorrect(false);
            setScore(s => Math.max(0, s - 5));
            setTimeout(() => setIsCorrect(null), 1500);
        }
    };

    const handleSkip = () => {
        const nextQueue = queue.slice(1);
        setQueue(nextQueue);
        if (nextQueue.length === 0) onComplete(score);
        else {
            resetRound();
        }
    };

    // Render a clickable cursor slot
    const InsertionSlot = ({ index }: { index: number }) => {
        const isActive = index === insertionIndex;
        return (
            <div 
                onClick={() => setInsertionIndex(index)}
                className={`h-8 w-2 rounded-full cursor-pointer transition-all duration-200 mx-0.5 flex items-center justify-center ${isActive ? 'bg-indigo-500 scale-110 shadow-sm' : 'bg-transparent hover:bg-neutral-200'}`}
            >
                {/* Visual helper for hover */}
                <div className={`w-1 h-4 rounded-full ${isActive ? 'bg-white/50' : 'bg-transparent'}`}></div>
            </div>
        );
    };

    if (gameState === 'SETUP') {
        const DiffButton = ({ id, label, icon: Icon, desc }: any) => (
            <button
                onClick={() => setDifficulty(id)}
                className={`p-3 rounded-2xl border-2 transition-all text-left flex flex-col gap-1 ${difficulty === id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-neutral-100 bg-white hover:border-neutral-300'}`}
            >
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${difficulty === id ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}><Icon size={14}/></div>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${difficulty === id ? 'text-emerald-700' : 'text-neutral-500'}`}>{label}</span>
                </div>
                <p className="text-[9px] font-bold text-neutral-400 leading-tight">{desc}</p>
            </button>
        );

        return (
            <div className="flex flex-col h-full relative p-6 items-center animate-in fade-in max-w-5xl mx-auto overflow-y-auto">
                <div className="text-center space-y-2 mb-6 mt-auto">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Shuffle size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Sentence Scramble</h2>
                    <p className="text-neutral-500 font-medium text-sm">Reconstruct examples to master syntax and flow.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-auto items-start">
                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col justify-center space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Session Size</span>
                                <span className="text-xl font-black text-emerald-600">{sessionSize}</span>
                            </div>
                            <input
                                type="range" min="5" max="25" step="5" value={sessionSize}
                                onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between text-[9px] font-bold text-neutral-300 uppercase tracking-tighter px-1">
                                <span>5 Items</span>
                                <span>15 Items</span>
                                <span>25 Items</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left px-1">Difficulty</span>
                        <div className="grid grid-cols-1 gap-2">
                            <DiffButton id="EASY" label="Easy" icon={Layers} desc="Chunks of 1-3 words. Great for collocations." />
                            <DiffButton id="MEDIUM" label="Medium" icon={Zap} desc="Chunks of 1-2 words. More challenging." />
                            <DiffButton id="HARD" label="Hard" icon={Brain} desc="Individual words only. True mastery." />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 w-full max-w-md">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={handleStartGame} className="flex-1 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 flex justify-center items-center gap-2"><Play size={18} fill="white"/> Start</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative p-6">
            <header className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <div className="text-neutral-400 font-black text-[10px] uppercase tracking-widest">Scramble • {difficulty}</div>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(1 - queue.length / sessionSize) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                {currentItem ? (
                    <div className="min-h-full flex flex-col items-center justify-center space-y-8 pb-10">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-4">
                                <h3 className="text-2xl font-black text-neutral-900">Build the sentence for: <span className="underline decoration-emerald-300 decoration-2 underline-offset-4">{currentItem.word}</span></h3>
                                <button 
                                    onClick={() => speak(currentItem.originalSentence)} 
                                    className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-all active:scale-90"
                                    title="Hear full sentence"
                                >
                                    <Volume2 size={24} />
                                </button>
                            </div>
                            <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">Tap chunks to insert at cursor</p>
                        </div>
                        
                        {/* Sentence Construction Area */}
                        <div className={`w-full max-w-3xl bg-neutral-50 rounded-[2.5rem] border-2 border-dashed p-8 transition-all ${isCorrect === true ? 'border-emerald-400 bg-emerald-50' : isCorrect === false ? 'border-rose-400 bg-rose-50 animate-shake' : 'border-neutral-200'}`}>
                            <div className="flex flex-wrap gap-y-3 items-center justify-center min-h-[60px]">
                                {selectedChunks.length === 0 && <span className="absolute text-lg font-bold text-neutral-300 italic pointer-events-none">Draft your sentence here...</span>}
                                
                                {/* Initial Slot */}
                                <InsertionSlot index={0} />

                                {selectedChunks.map((chunk, idx) => (
                                    <React.Fragment key={`${chunk}-${idx}`}>
                                        <button 
                                            onClick={() => handleRemoveChunk(idx)} 
                                            className={`px-4 py-2 rounded-xl text-lg font-bold shadow-sm transition-all active:scale-95 animate-in zoom-in-95 flex items-center gap-1 group ${isCorrect === true ? 'bg-emerald-600 text-white' : isCorrect === false ? 'bg-rose-600 text-white' : 'bg-white text-neutral-900 border border-neutral-100 hover:border-red-200 hover:text-red-500'}`}
                                        >
                                            {chunk} 
                                        </button>
                                        <InsertionSlot index={idx + 1} />
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>

                        {/* Source Pool */}
                        <div className="w-full max-w-3xl bg-neutral-100 rounded-[2.5rem] p-8 flex flex-wrap gap-3 justify-center">
                            {currentItem.shuffledChunks.map((chunk, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => handleChunkClick(chunk, idx)} 
                                    disabled={usedIndices.has(idx)} 
                                    className={`px-5 py-3 rounded-xl text-lg font-bold shadow-sm transition-all active:scale-95 ${usedIndices.has(idx) ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed opacity-30' : 'bg-white text-neutral-700 border-2 border-white hover:border-emerald-300 hover:text-neutral-900'}`}
                                >
                                    {chunk}
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex gap-4 pt-4">
                            <button onClick={handleSkip} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all">Skip</button>
                            <button 
                                onClick={handleCheck} 
                                disabled={selectedChunks.length === 0 || isCorrect !== null} 
                                className="px-12 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center gap-2"
                            >
                                <Check size={18} /> Check
                            </button>
                        </div>
                        
                        {isCorrect === false && (
                            <div className="animate-in slide-in-from-top-2 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center max-w-2xl">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Original Sentence</p>
                                <p className="text-sm font-bold text-emerald-900 italic">`&quot;`{currentItem.originalSentence}`&quot;`</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-neutral-300 font-black text-xl flex items-center justify-center h-full">Preparing...</div>
                )}
            </div>
        </div>
    );
};