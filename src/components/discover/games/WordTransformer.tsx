import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

interface TransformerItem {
    id: string;
    word: string;
    sentence: string;
    hintWord: string;
    answer: string;
}

export const WordTransformer: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [queue, setQueue] = useState<TransformerItem[]>([]);
    const [userGuess, setUserGuess] = useState('');
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const candidates = words.filter(w => w.wordFamily && (w.wordFamily.nouns?.length || 0) + (w.wordFamily.verbs?.length || 0) + (w.wordFamily.adjs?.length || 0) + (w.wordFamily.advs?.length || 0) >= 2 && w.example && w.example.trim().split(/\s+/).filter(Boolean).length >= 5);
        if (candidates.length < 5) {
            alert("Not enough words with rich word families (need at least 5).");
            onExit();
            return;
        }

        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        const newQueue: TransformerItem[] = [];

        for (const word of shuffled) {
            const members: string[] = [];
            if (word.wordFamily) {
                if (word.wordFamily.nouns) members.push(...word.wordFamily.nouns.filter(m => !m.isIgnored).map(m => m.word));
                if (word.wordFamily.verbs) members.push(...word.wordFamily.verbs.filter(m => !m.isIgnored).map(m => m.word));
                if (word.wordFamily.adjs) members.push(...word.wordFamily.adjs.filter(m => !m.isIgnored).map(m => m.word));
                if (word.wordFamily.advs) members.push(...word.wordFamily.advs.filter(m => !m.isIgnored).map(m => m.word));
            }
            if (!members.includes(word.word)) members.push(word.word);
            
            const unique = Array.from(new Set(members.map(w => w.toLowerCase().trim())));
            if (unique.length < 2) continue;

            const example = word.example.trim();
            const wordsInExample = example.split(/\s+|(?=[.,!?;:"])/).filter(Boolean).map(w => w.toLowerCase().replace(/[.,!?;:"]$/, ''));
            
            // Find an answer candidate in the example
            const potentialAnswers = unique.filter(m => wordsInExample.includes(m));
            if (potentialAnswers.length === 0) continue;

            const answer = potentialAnswers[Math.floor(Math.random() * potentialAnswers.length)];
            // Hint must be a *different* form
            const hints = unique.filter(m => m !== answer);
            if (hints.length === 0) continue;
            const hint = hints[Math.floor(Math.random() * hints.length)];

            // Create blank
            const regex = new RegExp(`\\b(${answer})\\b`, 'i');
            const match = example.match(regex);
            if (match && match[1]) {
                const sentence = example.replace(match[1], '___');
                newQueue.push({ id: word.id + answer, word: word.word, sentence, hintWord: hint, answer });
            }
            if (newQueue.length >= 15) break;
        }

        if (newQueue.length < 5) {
            alert(`Failed to create enough transformer items (found ${newQueue.length}). Need at least 5.`);
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
            setScore(s => s + 20);
            setTimeout(() => {
                const nextQueue = queue.slice(1);
                setQueue(nextQueue);
                if (nextQueue.length === 0) onComplete(score + 20);
                else {
                    setUserGuess('');
                    setIsCorrect(null);
                }
            }, 800);
        } else {
            setScore(s => Math.max(0, s - 10));
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
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">Word Transformer</div>
            </div>

            {currentItem ? (
                <div className="flex flex-col items-center justify-center flex-1 space-y-8">
                    <div className="space-y-2 text-center">
                        <h3 className="text-2xl font-black text-neutral-900 leading-tight">Word Transformation</h3>
                        <p className="text-neutral-500 text-sm font-medium">Transform &quot;<span className="font-bold text-orange-600">{currentItem.hintWord}</span>&quot; to fit.</p>
                    </div>

                    <div className="w-full max-w-xl bg-white p-8 rounded-[2rem] shadow-xl border border-neutral-200 text-center space-y-6">
                        <div className="text-xl font-medium text-neutral-800 leading-relaxed">
                            {currentItem.sentence.split('___').map((part, i, arr) => (
                                <React.Fragment key={i}>
                                    {part}
                                    {i < arr.length - 1 && (
                                        <input 
                                            type="text" 
                                            value={userGuess} 
                                            onChange={(e) => setUserGuess(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleCheck(); }}
                                            disabled={isCorrect === true}
                                            className={`inline-block w-32 h-10 mx-2 p-2 text-center text-xl font-bold rounded-lg border-b-2 outline-none transition-colors duration-200 ${isCorrect === true ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : isCorrect === false ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-neutral-50 border-neutral-300 focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm'}`}
                                            autoFocus autoComplete="off"
                                        />
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                        {isCorrect === false && <div className="text-center text-rose-600 font-bold text-sm animate-in fade-in slide-in-from-top-1">Incorrect! Hint: &quot;{currentItem.answer}&quot;.</div>}
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