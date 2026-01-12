import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

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
}

export const PrepositionPower: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [queue, setQueue] = useState<PrepositionItem[]>([]);
    const [userGuess, setUserGuess] = useState('');
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const candidates = words.filter(w => w.prepositions && w.prepositions.some(p => !p.isIgnored) && w.example);
        if (candidates.length < 5) {
            alert("Not enough words with prepositions and examples (need at least 5).");
            onExit();
            return;
        }

        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        const newQueue = shuffled.slice(0, 15).map(w => {
            const activePreps = w.prepositions!.filter(p => !p.isIgnored);
            if (activePreps.length === 0) return null;
            
            // Find a preposition that actually follows the headword in the example
            const shuffledPreps = [...activePreps].sort(() => Math.random() - 0.5);
            
            for (const prep of shuffledPreps) {
                // Use a regex to specifically find the headword followed by the preposition
                const regex = new RegExp(`\\b${w.word}\\s+${prep.prep}\\b`, 'i');
                if (regex.test(w.example)) {
                    // If found, create the blank and return the item for the queue
                    const exampleWithBlank = w.example.replace(regex, `${w.word} ___`);
                    return { id: w.id, word: w.word, example: exampleWithBlank, answer: prep.prep };
                }
            }
            
            // If no preposition from the list was found directly following the word, this item is not usable.
            return null;
        }).filter(Boolean) as PrepositionItem[];

        if (newQueue.length < 5) {
            alert(`Failed to build a long enough preposition queue (found ${newQueue.length}). Need at least 5 usable examples.`);
            onExit();
            return;
        }
        setQueue(newQueue);
    }, []);

    const currentItem = queue[0];

    const handleCheck = () => {
        if (!currentItem) return;
        const correct = userGuess.trim().toLowerCase() === currentItem.answer.toLowerCase();
        setIsCorrect(correct);
        
        if (correct) {
            setScore(s => s + 15);
            setTimeout(() => {
                const nextQueue = queue.slice(1);
                setQueue(nextQueue);
                if (nextQueue.length === 0) onComplete(score + 15);
                else {
                    setUserGuess('');
                    setIsCorrect(null);
                }
            }, 800);
        } else {
            setScore(s => Math.max(0, s - 8));
        }
    };

    const handleSkip = () => {
        const nextQueue = queue.slice(1);
        setQueue(nextQueue);
        if (nextQueue.length === 0) onComplete(score);
        else {
            setUserGuess('');
            setIsCorrect(null);
        }
    };

    return (
        <div className="flex flex-col h-full relative p-8">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">Preposition Power</div>
            </div>

            {currentItem ? (
                <div className="flex flex-col items-center justify-center flex-1 space-y-8">
                    <div className="space-y-2 text-center">
                        <h3 className="text-2xl font-black text-neutral-900 leading-tight">Preposition for: <span className="underline decoration-violet-300">{currentItem.word}</span></h3>
                        <p className="text-neutral-500 text-sm font-medium">Fill in the missing preposition.</p>
                    </div>

                    <div className="w-full max-w-xl bg-white p-8 rounded-[2rem] shadow-xl border border-neutral-200 text-center space-y-6">
                        <div className="text-xl font-medium text-neutral-800 leading-relaxed">
                            {currentItem.example.split('___').map((part, i, arr) => (
                                <React.Fragment key={i}>
                                    {part}
                                    {i < arr.length - 1 && (
                                        <input 
                                            type="text" 
                                            value={userGuess} 
                                            onChange={(e) => setUserGuess(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleCheck(); }}
                                            disabled={isCorrect === true}
                                            className={`inline-block w-24 h-10 mx-2 p-2 text-center text-xl font-bold rounded-lg border-b-2 outline-none transition-colors duration-200 ${isCorrect === true ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : isCorrect === false ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-neutral-50 border-neutral-300 focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm'}`}
                                            autoFocus autoComplete="off"
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                        {isCorrect === false && <div className="text-center text-rose-600 font-bold text-sm animate-in fade-in slide-in-from-top-1">Incorrect! Hint: "{currentItem.answer}".</div>}
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button onClick={handleSkip} className="px-8 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all">Skip</button>
                        <button onClick={handleCheck} disabled={userGuess.trim().length === 0 || isCorrect === true} className="px-8 py-4 bg-neutral-900 text-white font-bold rounded-2xl hover:bg-neutral-800 transition-all shadow-lg disabled:opacity-50">Check</button>
                    </div>
                </div>
            ) : <div className="text-neutral-300 font-black text-xl flex items-center justify-center h-full">Loading...</div>}
        </div>
    );
};