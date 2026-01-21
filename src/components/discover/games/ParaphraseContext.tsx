import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Check, X, RefreshCw } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

// New interface for game items
interface GameItem {
    id: string;
    text: string;
    pairId: string;
    state: 'default' | 'selected' | 'matched' | 'error';
}

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

export const ParaphraseContext: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [contexts, setContexts] = useState<GameItem[]>([]);
    const [paraphrases, setParaphrases] = useState<GameItem[]>([]);
    const [selectedParaphraseId, setSelectedParaphraseId] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [currentWord, setCurrentWord] = useState<VocabularyItem | null>(null);

    const hasMatches = useMemo(() => contexts.some(c => c.state === 'matched'), [contexts]);

    const handleReset = () => {
        const matchedPairsCount = contexts.filter(c => c.state === 'matched').length;
        setScore(s => Math.max(0, s - matchedPairsCount * 20));
        
        setContexts(prev => prev.map(c => ({...c, state: 'default'})));
        setParaphrases(prev => prev.map(p => ({...p, state: 'default'})));
        setSelectedParaphraseId(null);
    };

    useEffect(() => {
        const candidates = words.filter(w => 
            w.paraphrases && w.paraphrases.filter(p => !p.isIgnored && p.context && p.context.trim()).length >= 4 // Need at least 4 for a decent game
        );

        if (candidates.length === 0) {
            alert("Not enough words with contextual variations found (need at least 1 word with 4+).");
            onExit();
            return;
        }

        const gameWord = candidates[Math.floor(Math.random() * candidates.length)];
        setCurrentWord(gameWord);

        const validParaphrases = gameWord.paraphrases!
            .filter(p => !p.isIgnored && p.context && p.context.trim())
            .sort(() => Math.random() - 0.5)
            .slice(0, 5); // Take up to 5 pairs

        const contextItems: GameItem[] = [];
        const paraphraseItems: GameItem[] = [];

        validParaphrases.forEach((p, index) => {
            const pairId = `${gameWord.id}-${index}`;
            contextItems.push({ id: `context-${pairId}`, text: p.context, pairId, state: 'default' });
            paraphraseItems.push({ id: `word-${pairId}`, text: p.word, pairId, state: 'default' });
        });
        
        if (contextItems.length < 2) {
            alert("The selected word doesn't have enough valid variations to start a game.");
            onExit();
            return;
        }

        setContexts(contextItems);
        setParaphrases(paraphraseItems.sort(() => Math.random() - 0.5)); // Shuffle paraphrases
    }, [words, onExit]);

    const handleParaphraseSelect = (id: string) => {
        if (selectedParaphraseId) return; // Only one selection at a time
        setSelectedParaphraseId(id);
        setParaphrases(prev => prev.map(p => p.id === id ? { ...p, state: 'selected' } : p));
    };

    const handleContextSelect = (contextId: string) => {
        if (!selectedParaphraseId) return; // Must select a paraphrase first

        const selectedContext = contexts.find(c => c.id === contextId);
        const selectedParaphrase = paraphrases.find(p => p.id === selectedParaphraseId);

        if (!selectedContext || !selectedParaphrase) return;

        if (selectedContext.pairId === selectedParaphrase.pairId) {
            // Correct match
            setScore(s => s + 20);
            setContexts(prev => prev.map(c => c.id === contextId ? { ...c, state: 'matched' } : c));
            setParaphrases(prev => prev.map(p => p.id === selectedParaphraseId ? { ...p, state: 'matched' } : p));
            setSelectedParaphraseId(null);

            // Check for game over
            const allMatched = contexts.every(c => c.id === contextId || c.state === 'matched');
            if (allMatched) {
                setTimeout(() => onComplete(score + 20), 500);
            }
        } else {
            // Incorrect match
            setScore(s => Math.max(0, s - 5));
            setContexts(prev => prev.map(c => c.id === contextId ? { ...c, state: 'error' } : c));
            setParaphrases(prev => prev.map(p => p.id === selectedParaphraseId ? { ...p, state: 'error' } : p));

            setTimeout(() => {
                setContexts(prev => prev.map(c => c.state === 'error' ? { ...c, state: 'default' } : c));
                setParaphrases(prev => prev.map(p => p.state === 'error' ? { ...p, state: 'default' } : p));
                setSelectedParaphraseId(null);
            }, 800);
        }
    };

    const getStateClasses = (state: GameItem['state'], type: 'context' | 'paraphrase') => {
        switch (state) {
            case 'selected':
                return 'bg-indigo-600 border-indigo-600 text-white shadow-lg ring-4 ring-indigo-100';
            case 'matched':
                return 'bg-emerald-50 border-emerald-300 text-emerald-800 opacity-50 cursor-default';
            case 'error':
                return 'bg-red-500 border-red-500 text-white animate-shake';
            default:
                if (type === 'context') return 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400 hover:shadow-md disabled:hover:shadow-none disabled:hover:border-neutral-200';
                return 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-900 hover:bg-neutral-50 cursor-pointer disabled:cursor-not-allowed disabled:hover:bg-white';
        }
    };

    return (
        <div className="flex flex-col h-full relative p-6">
            <header className="flex justify-between items-center mb-4 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">Paraphrase Context</div>
            </header>

            {currentWord && (
                <div className="text-center mb-4">
                    <p className="text-sm font-bold text-neutral-500">Match variations of "<span className="text-neutral-900 underline decoration-cyan-300">{currentWord.word}</span>" to the correct context.</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-6">
                    {/* Context Column */}
                    <div className="space-y-4">
                        <h3 className="text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">Context</h3>
                        {contexts.map(item => (
                            <button 
                                key={item.id}
                                onClick={() => handleContextSelect(item.id)}
                                disabled={item.state === 'matched' || !selectedParaphraseId}
                                className={`relative w-full p-4 rounded-2xl border-2 text-left transition-all duration-200 ${getStateClasses(item.state, 'context')}`}
                            >
                                <p className="font-medium text-sm leading-snug">{item.text}</p>
                                {item.state === 'matched' && <Check size={16} className="absolute top-2 right-2"/>}
                            </button>
                        ))}
                    </div>

                    {/* Paraphrase Column */}
                    <div className="space-y-4">
                        <h3 className="text-center text-[10px] font-black uppercase tracking-widest text-neutral-400">Word / Phrase</h3>
                        {paraphrases.map(item => (
                             <button 
                                key={item.id}
                                onClick={() => handleParaphraseSelect(item.id)}
                                disabled={item.state !== 'default'}
                                className={`relative w-full p-4 rounded-2xl border-2 text-left transition-all duration-200 ${getStateClasses(item.state, 'paraphrase')}`}
                            >
                                <p className="font-bold text-sm leading-snug">{item.text}</p>
                                {item.state === 'matched' && <Check size={16} className="absolute top-2 right-2 text-emerald-500"/>}
                            </button>
                        ))}
                    </div>
                </div>
                {hasMatches && (
                    <div className="flex justify-center pt-4">
                        <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                            <RefreshCw size={12} /> Reset
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
