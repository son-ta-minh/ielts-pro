import React, { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

interface SentenceItem {
    id: string;
    word: string;
    originalSentence: string;
    shuffledWords: string[];
}

export const SentenceScramble: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [queue, setQueue] = useState<SentenceItem[]>([]);
    const [selectedWords, setSelectedWords] = useState<string[]>([]);
    const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const candidates = words.filter(w => w.example && w.example.trim().split(/\s+/).filter(Boolean).length >= 5);
        if (candidates.length < 5) {
            alert("Not enough words with suitable example sentences (need at least 5).");
            onExit();
            return;
        }

        const shuffledCandidates = [...candidates].sort(() => Math.random() - 0.5);
        const newQueue = shuffledCandidates.slice(0, 15).map(w => {
            const originalSentence = w.example.trim();
            const words = originalSentence.split(/\s+/).filter(Boolean);
            const shuffled = [...words].sort(() => Math.random() - 0.5);
            return { id: w.id, word: w.word, originalSentence, shuffledWords: shuffled };
        });

        if (newQueue.length === 0) {
            alert("Failed to build sentence queue.");
            onExit();
            return;
        }
        setQueue(newQueue);
    }, []);

    const currentItem = queue[0];

    const handleWordClick = (word: string, idx: number) => {
        if (isCorrect !== null) return;
        setSelectedWords(prev => [...prev, word]);
        setUsedIndices(prev => new Set(prev).add(idx));
    };

    const handleRemoveWord = (idxToRemove: number) => {
        if (isCorrect !== null) return;
        const wordToRemove = selectedWords[idxToRemove];
        const newSelected = selectedWords.filter((_, i) => i !== idxToRemove);
        setSelectedWords(newSelected);

        // Remove one instance of this word from usedIndices
        // This is simplified; assumes we can find the matching index in shuffled array that is currently used.
        const currentShuffled = currentItem.shuffledWords;
        setUsedIndices(prev => {
            const next = new Set(prev);
            for (let i = 0; i < currentShuffled.length; i++) {
                if (currentShuffled[i] === wordToRemove && next.has(i)) {
                    // Check if this specific instance was "the one" removed? 
                    // Since we removed by target index, any source index matching the word works if we assume distinct clicks.
                    // To be robust: If we have multiple same words, just free up one of them.
                    next.delete(i);
                    return next;
                }
            }
            return next;
        });
    };

    const handleCheck = () => {
        const assembled = selectedWords.join(' ').toLowerCase().trim();
        const original = currentItem.originalSentence.toLowerCase().trim();
        
        if (assembled === original) {
            setIsCorrect(true);
            setScore(s => s + 20);
            setTimeout(() => {
                const nextQueue = queue.slice(1);
                setQueue(nextQueue);
                if (nextQueue.length === 0) onComplete(score + 20);
                else {
                    setSelectedWords([]);
                    setUsedIndices(new Set());
                    setIsCorrect(null);
                }
            }, 1000);
        } else {
            setIsCorrect(false);
            setScore(s => Math.max(0, s - 10));
        }
    };

    const handleSkip = () => {
        const nextQueue = queue.slice(1);
        setQueue(nextQueue);
        if (nextQueue.length === 0) onComplete(score);
        else {
            setSelectedWords([]);
            setUsedIndices(new Set());
            setIsCorrect(null);
        }
    };

    return (
        <div className="flex flex-col h-full relative p-8">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">Sentence Scramble</div>
            </div>

            {currentItem ? (
                <div className="flex flex-col items-center justify-center flex-1 space-y-6">
                    <h3 className="text-2xl font-black text-neutral-900">Build the sentence for: <span className="underline decoration-emerald-300">{currentItem.word}</span></h3>
                    
                    <div className={`min-h-[100px] w-full max-w-2xl bg-neutral-50 rounded-[2rem] border-2 border-dashed p-6 flex flex-wrap gap-3 items-center justify-center transition-all ${isCorrect === true ? 'border-emerald-400 bg-emerald-50' : isCorrect === false ? 'border-rose-400 bg-rose-50' : 'border-neutral-200'}`}>
                        {selectedWords.length === 0 && <span className="text-lg font-bold text-neutral-300 italic">Click words below...</span>}
                        {selectedWords.map((word, idx) => (
                            <button key={idx} onClick={() => handleRemoveWord(idx)} className={`px-4 py-2.5 rounded-xl text-lg font-bold shadow-sm transition-all active:scale-95 ${isCorrect === true ? 'bg-emerald-600 text-white' : isCorrect === false ? 'bg-rose-600 text-white' : 'bg-white text-neutral-900 border border-neutral-100 hover:border-neutral-300'}`}>
                                {word} <X size={14} className="inline-block ml-1" />
                            </button>
                        ))}
                    </div>

                    {isCorrect === false && <div className="text-center text-rose-600 font-bold text-sm">Incorrect! Try again.</div>}
                    {isCorrect === true && <div className="text-center text-emerald-600 font-bold text-sm">Correct!</div>}

                    <div className="w-full max-w-2xl bg-neutral-100 rounded-[2rem] p-6 flex flex-wrap gap-3 justify-center">
                        {currentItem.shuffledWords.map((word, idx) => (
                            <button key={idx} onClick={() => handleWordClick(word, idx)} disabled={usedIndices.has(idx)} className={`px-4 py-2.5 rounded-xl text-lg font-bold shadow-sm transition-all active:scale-95 ${usedIndices.has(idx) ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed' : 'bg-white text-neutral-700 border-2 border-neutral-100 hover:border-neutral-300 hover:text-neutral-900'}`}>
                                {word}
                            </button>
                        ))}
                    </div>
                    
                    <div className="flex gap-4 pt-4">
                        <button onClick={handleSkip} className="px-8 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all">Skip</button>
                        <button onClick={handleCheck} disabled={selectedWords.length === 0 || isCorrect !== null} className="px-8 py-4 bg-neutral-900 text-white font-bold rounded-2xl hover:bg-neutral-800 transition-all shadow-lg disabled:opacity-50">Check Sentence</button>
                    </div>
                    
                    {isCorrect === false && <div className="mt-4 p-4 bg-neutral-100 rounded-2xl border border-neutral-200 text-center text-neutral-700 text-sm">Original: "{currentItem.originalSentence}"</div>}
                </div>
            ) : <div className="text-neutral-300 font-black text-xl flex items-center justify-center h-full">Loading...</div>}
        </div>
    );
};