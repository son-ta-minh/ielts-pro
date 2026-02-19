
import React, { useState } from 'react';
import { ArrowLeft, Play, BookOpen, Languages, RefreshCw, CheckCircle2 } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Card {
    id: string;
    text: string;
    type: 'word' | 'meaning';
    pairId: string;
    matched: boolean;
    error?: boolean;
}

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

export const MeaningMatch: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [sessionSize, setSessionSize] = useState(12);
    
    const [leftCards, setLeftCards] = useState<Card[]>([]);
    const [rightCards, setRightCards] = useState<Card[]>([]);
    const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
    const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
    const [score, setScore] = useState(0);

    const handleStartGame = () => {
        const candidates = words.filter(w => w.word && w.meaningVi && w.meaningVi.trim().length > 0);
        if (candidates.length < 10) {
            alert(`Not enough words with meanings found (found ${candidates.length}, need at least 10).`);
            return;
        }

        const size = Math.min(candidates.length, sessionSize);
        const selectedWords = [...candidates].sort(() => Math.random() - 0.5).slice(0, size);
        
        const newLeft: Card[] = [];
        const newRight: Card[] = [];

        selectedWords.forEach(w => {
            const pairId = w.id + Math.random();
            const headword = w.word;
            let meaningText = w.meaningVi;

            // Mask word forms in definition
            const wordsToMask = [headword];
            if (w.wordFamily) {
                if (w.wordFamily.nouns) wordsToMask.push(...w.wordFamily.nouns.map(m => m.word));
                if (w.wordFamily.verbs) wordsToMask.push(...w.wordFamily.verbs.map(m => m.word));
                if (w.wordFamily.adjs) wordsToMask.push(...w.wordFamily.adjs.map(m => m.word));
                if (w.wordFamily.advs) wordsToMask.push(...w.wordFamily.advs.map(m => m.word));
            }
            
            const uniqueWordsToMask = [...new Set(wordsToMask.map(word => word.trim()).filter(Boolean))];
            uniqueWordsToMask.sort((a, b) => b.length - a.length);

            for (const wordToMask of uniqueWordsToMask) {
                const escapedWord = wordToMask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const maskRegex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
                meaningText = meaningText.replace(maskRegex, '___');
            }
            
            newLeft.push({ id: `word-${pairId}`, text: headword, type: 'word', pairId, matched: false });
            newRight.push({ id: `meaning-${pairId}`, text: meaningText, type: 'meaning', pairId, matched: false });
        });

        setLeftCards(newLeft.sort(() => Math.random() - 0.5));
        setRightCards(newRight.sort(() => Math.random() - 0.5));
        setScore(0);
        setSelectedLeftId(null);
        setSelectedRightId(null);
        setGameState('PLAYING');
    };

    const checkMatch = (leftId: string, rightId: string) => {
        const leftCard = leftCards.find(c => c.id === leftId);
        const rightCard = rightCards.find(c => c.id === rightId);

        if (leftCard && rightCard && leftCard.pairId === rightCard.pairId) {
            // Success
            setTimeout(() => {
                setLeftCards(prev => prev.map(c => c.id === leftId ? { ...c, matched: true } : c));
                setRightCards(prev => prev.map(c => c.id === rightId ? { ...c, matched: true } : c));
                setScore(s => s + 10);
                setSelectedLeftId(null);
                setSelectedRightId(null);
                
                // Check win
                const remaining = leftCards.filter(c => !c.matched && c.id !== leftId).length;
                if (remaining === 0) onComplete(score + 10);
            }, 300);
        } else {
            // Error
            setLeftCards(prev => prev.map(c => c.id === leftId ? { ...c, error: true } : c));
            setRightCards(prev => prev.map(c => c.id === rightId ? { ...c, error: true } : c));
            setScore(s => Math.max(0, s - 5));

            setTimeout(() => {
                setLeftCards(prev => prev.map(c => ({ ...c, error: false })));
                setRightCards(prev => prev.map(c => ({ ...c, error: false })));
                setSelectedLeftId(null);
                setSelectedRightId(null);
            }, 800);
        }
    };

    const handleCardClick = (card: Card) => {
        if (card.matched || card.error) return;

        if (card.type === 'word') {
            if (selectedRightId) {
                checkMatch(card.id, selectedRightId);
            } else {
                setSelectedLeftId(card.id === selectedLeftId ? null : card.id);
            }
        } else {
            if (selectedLeftId) {
                checkMatch(selectedLeftId, card.id);
            } else {
                setSelectedRightId(card.id === selectedRightId ? null : card.id);
            }
        }
    };

    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full relative p-6 justify-center items-center text-center space-y-8 animate-in fade-in">
                <div className="space-y-2">
                    <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Languages size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Meaning Match Setup</h2>
                    <p className="text-neutral-500 font-medium">Connect English words to their definitions.</p>
                </div>

                <div className="w-full max-w-sm bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
                    <div className="space-y-4">
                         <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Pairs in Session</span>
                            <span className="text-xl font-black text-teal-600">{sessionSize}</span>
                         </div>
                         <input
                            type="range" min="10" max="30" step="1" value={sessionSize}
                            onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                        />
                         <div className="flex justify-between text-[10px] font-black text-neutral-300 uppercase">
                             <span>Min 10</span>
                             <span>Max 30</span>
                         </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={handleStartGame} className="px-12 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 flex items-center gap-2"><Play size={18} fill="white"/> Start Game</button>
                </div>
            </div>
        );
    }

    const progress = Math.round((leftCards.filter(c => c.matched).length / leftCards.length) * 100);

    return (
        <div className="flex flex-col h-full relative p-6">
            <header className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <div className="text-neutral-400 font-black text-[10px] uppercase tracking-widest">Meaning Match • Progress</div>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-teal-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                <div className="grid grid-cols-2 gap-10">
                    {/* Left Section: English Words */}
                    <div className="space-y-4">
                        <h3 className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-4 flex items-center justify-center gap-2"><BookOpen size={12}/> English</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {leftCards.map(card => {
                                const isSelected = selectedLeftId === card.id;
                                if (card.matched) return <div key={card.id} className="h-16 flex items-center justify-center text-teal-500 opacity-20"><CheckCircle2 size={32}/></div>;
                                
                                let style = "bg-white border-neutral-200 text-neutral-800 hover:border-teal-300 hover:-translate-y-0.5";
                                if (isSelected) style = "bg-teal-600 border-teal-600 text-white shadow-lg ring-4 ring-teal-100 scale-105";
                                if (card.error) style = "bg-red-50 border-red-500 text-red-700 animate-shake";

                                return (
                                    <button 
                                        key={card.id} 
                                        onClick={() => handleCardClick(card)}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {rightCards.map(card => {
                                const isSelected = selectedRightId === card.id;
                                if (card.matched) return <div key={card.id} className="h-20 flex items-center justify-center text-teal-500 opacity-20"><CheckCircle2 size={32}/></div>;
                                
                                let style = "bg-white border-neutral-200 text-neutral-700 hover:border-indigo-300 hover:-translate-y-0.5";
                                if (isSelected) style = "bg-indigo-600 border-indigo-600 text-white shadow-lg ring-4 ring-indigo-100 scale-105";
                                if (card.error) style = "bg-red-50 border-red-500 text-red-700 animate-shake";

                                return (
                                    <button 
                                        key={card.id} 
                                        onClick={() => handleCardClick(card)}
                                        className={`min-h-20 px-4 py-3 rounded-xl border-b-4 font-medium text-xs transition-all duration-200 flex items-center justify-center text-center leading-relaxed shadow-sm ${style}`}
                                    >
                                        {card.text}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-center pt-10">
                    <button onClick={() => setGameState('SETUP')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"><RefreshCw size={14} /> Reset Game</button>
                </div>
            </div>
        </div>
    );
};
