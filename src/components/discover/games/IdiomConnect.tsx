import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Card {
    id: string;
    text: string;
    type: 'head' | 'tail';
    pairId: string;
    matched: boolean;
    error?: boolean;
}

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

export const IdiomConnect: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [cards, setCards] = useState<Card[]>([]);
    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const candidates = words.filter(w => w.idiomsList && w.idiomsList.length > 0);
        if (candidates.length < 5) {
            alert("Not enough words with idioms found (need at least 5).");
            onExit();
            return;
        }

        const selectedWords = [...candidates].sort(() => Math.random() - 0.5).slice(0, 8);
        const newCards: Card[] = [];

        selectedWords.forEach(w => {
            if (!w.idiomsList) return;
            const validIdioms = w.idiomsList.filter(c => !c.isIgnored);
            if (validIdioms.length === 0) return;
            const targetIdiom = validIdioms[Math.floor(Math.random() * validIdioms.length)];

            const pairId = w.id + Math.random();
            const headword = w.word;
            let tailText = targetIdiom.text;

            // Collect all forms of the word to mask, including from word family
            const wordsToMask = [headword, headword + 's'];
            if (w.wordFamily) {
                if (w.wordFamily.nouns) wordsToMask.push(...w.wordFamily.nouns.map(m => m.word));
                if (w.wordFamily.verbs) wordsToMask.push(...w.wordFamily.verbs.map(m => m.word));
                if (w.wordFamily.adjs) wordsToMask.push(...w.wordFamily.adjs.map(m => m.word));
                if (w.wordFamily.advs) wordsToMask.push(...w.wordFamily.advs.map(m => m.word));
            }
            
            const uniqueWordsToMask = [...new Set(wordsToMask.map(word => word.trim()).filter(Boolean))];
            uniqueWordsToMask.sort((a, b) => b.length - a.length); // Longest first to avoid partial matches

            for (const wordToMask of uniqueWordsToMask) {
                const escapedWord = wordToMask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const maskRegex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
                tailText = tailText.replace(maskRegex, '___');
            }

            newCards.push({ id: `head-${pairId}`, text: headword, type: 'head', pairId, matched: false });
            newCards.push({ id: `tail-${pairId}`, text: tailText, type: 'tail', pairId, matched: false });
        });

        if (newCards.length === 0) {
            alert("Failed to generate game.");
            onExit();
            return;
        }

        setCards(newCards.sort(() => Math.random() - 0.5));
    }, [words]);

    const handleCardClick = (card: Card) => {
        if (card.matched || selectedCardIds.includes(card.id) || selectedCardIds.length >= 2) return;

        const newSelection = [...selectedCardIds, card.id];
        setSelectedCardIds(newSelection);

        if (newSelection.length === 2) {
            const card1 = cards.find(c => c.id === newSelection[0]);
            const card2 = cards.find(c => c.id === newSelection[1]);

            if (card1 && card2 && card1.pairId === card2.pairId && card1.id !== card2.id) {
                setTimeout(() => {
                    setCards(prev => prev.map(c => 
                        (c.id === card1.id || c.id === card2.id) ? { ...c, matched: true } : c
                    ));
                    setScore(s => s + 10);
                    setSelectedCardIds([]);
                    
                    const remaining = cards.filter(c => !c.matched && c.id !== card1.id && c.id !== card2.id).length;
                    if (remaining === 0) onComplete(score + 10);
                }, 300);
            } else {
                setCards(prev => prev.map(c => newSelection.includes(c.id) ? { ...c, error: true } : c));
                setTimeout(() => {
                    setCards(prev => prev.map(c => ({ ...c, error: false })));
                    setSelectedCardIds([]);
                }, 800);
            }
        }
    };

    return (
        <div className="flex flex-col h-full relative">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
                <div className="text-neutral-400 font-bold text-sm uppercase tracking-widest">Idiom Connect</div>
            </div>

            <div className="flex-1 bg-neutral-50/50 rounded-[3rem] border-2 border-dashed border-neutral-200 p-8 overflow-y-auto custom-scrollbar relative">
                {cards.length === 0 ? <div className="absolute inset-0 flex items-center justify-center text-neutral-300 font-black text-2xl">Loading Deck...</div> : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[100px]">
                        {cards.map(card => {
                            const isSelected = selectedCardIds.includes(card.id);
                            if (card.matched) return <div key={card.id} className="opacity-0" />;
                            
                            let cardStyle = "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400 hover:-translate-y-1 hover:shadow-md";
                            if (isSelected) cardStyle = "bg-amber-500 border-amber-500 text-white scale-105 shadow-xl ring-4 ring-amber-100";
                            if (card.error) cardStyle = "bg-red-50 border-red-500 text-white animate-shake";

                            return (
                                <button key={card.id} onClick={() => handleCardClick(card)} className={`rounded-2xl border-b-4 p-4 flex items-center justify-center text-center transition-all duration-200 ${cardStyle}`}>
                                    <span className="font-bold text-sm md:text-base leading-tight pointer-events-none select-none">{card.text}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};