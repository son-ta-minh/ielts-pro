
import React, { useState } from 'react';
import { ArrowLeft, Check, RefreshCw, Play, Zap, Split, Layers, Brain, BookOpen, ChevronDown, Link2, CheckCircle2, Quote } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Card {
    id: string;
    text: string; // The phrase with the blank (e.g., "___ herbicide")
    fullText: string; // The original full text (e.g., "apply herbicide")
    headword: string; // The parent word (e.g., "herbicide")
    context: string; // The meaning/cue
    partnerWord: string; // The word to be filled (e.g., "apply")
    choices: string[]; // Pre-shuffled options for the dropdown (Medium mode)
    pairId: string;
    // States
    isLinked: boolean;
    isFilled: boolean;
    isSelected: boolean;
    isDone: boolean;
    error: boolean;
}

type SourceType = 'PARAPHRASE' | 'COLLOCATION' | 'IDIOM' | 'MIX';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

export const ParaphraseContext: React.FC<Props> = ({ words, onComplete, onExit }) => {
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING'>('SETUP');
    const [sourceType, setSourceType] = useState<SourceType>('MIX');
    const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
    const [sessionSize, setSessionSize] = useState(8);

    const [contexts, setContexts] = useState<Card[]>([]);
    const [items, setItems] = useState<Card[]>([]);
    const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [score, setScore] = useState(0);

    const handleStartGame = () => {
        const allPairs: { context: string, fullText: string, headword: string, pairId: string }[] = [];
        
        words.forEach(word => {
            // Paraphrases
            if (sourceType === 'PARAPHRASE' || sourceType === 'MIX') {
                (word.paraphrases || []).filter(p => !p.isIgnored && p.context && p.context.trim()).forEach(p => {
                    allPairs.push({ context: p.context, fullText: p.word, headword: word.word, pairId: `${word.id}-p-${p.word}` });
                });
            }
            // Collocations
            if (sourceType === 'COLLOCATION' || sourceType === 'MIX') {
                (word.collocationsArray || []).filter(c => !c.isIgnored && c.d && c.d.trim()).forEach(c => {
                    allPairs.push({ context: c.d!, fullText: c.text, headword: word.word, pairId: `${word.id}-c-${c.text}` });
                });
            }
            // Idioms
            if (sourceType === 'IDIOM' || sourceType === 'MIX') {
                (word.idiomsList || []).filter(i => !i.isIgnored && i.d && i.d.trim()).forEach(i => {
                    allPairs.push({ context: i.d!, fullText: i.text, headword: word.word, pairId: `${word.id}-i-${i.text}` });
                });
            }
        });

        if (allPairs.length < 5) {
            alert(`Not enough items found. Add more variations or idioms to your library.`);
            return;
        }

        const size = Math.min(allPairs.length, sessionSize);
        const gamePairs = [...allPairs].sort(() => 0.5 - Math.random()).slice(0, size);

        const sessionPartnerWords = gamePairs.map(p => {
            const wordsArr = p.fullText.split(/\s+/);
            if (wordsArr.length > 1) {
                const headwordIdx = wordsArr.findIndex(w => w.toLowerCase().includes(p.headword.toLowerCase()));
                const targetIdx = headwordIdx === -1 ? 0 : (headwordIdx === 0 ? wordsArr.length - 1 : 0);
                return wordsArr[targetIdx].replace(/[^a-zA-Z]/g, '');
            }
            return p.fullText;
        });

        const newContexts: Card[] = [];
        const newItems: Card[] = [];

        gamePairs.forEach((pair, pIdx) => {
            let maskedText;
            let partnerWord = pair.fullText;
            let isPreFilled = false;

            const wordsArr = pair.fullText.split(/\s+/);
            if (wordsArr.length > 1) {
                const headwordIdx = wordsArr.findIndex(w => w.toLowerCase().includes(pair.headword.toLowerCase()));
                const targetIdx = headwordIdx === -1 ? 0 : (headwordIdx === 0 ? wordsArr.length - 1 : 0);
                partnerWord = wordsArr[targetIdx].replace(/[^a-zA-Z]/g, '');
                maskedText = wordsArr.map((w, idx) => idx === targetIdx ? '___' : w).join(' ');
            } else {
                // If it's a single word, do NOT mask it. Just show it.
                partnerWord = pair.fullText;
                maskedText = pair.fullText;
                isPreFilled = true;
            }

            const otherPartners = sessionPartnerWords.filter((w, i) => i !== pIdx && w.toLowerCase() !== partnerWord.toLowerCase());
            const choices = [partnerWord, ...Array.from(new Set(otherPartners))].sort(() => 0.5 - Math.random()).slice(0, 5);
            if (!choices.includes(partnerWord)) choices[Math.floor(Math.random() * choices.length)] = partnerWord;

            const baseCard: Omit<Card, 'id' | 'isLinked' | 'isFilled' | 'isSelected' | 'isDone' | 'error'> = {
                text: maskedText,
                fullText: pair.fullText,
                headword: pair.headword,
                context: pair.context,
                partnerWord: partnerWord,
                choices: choices,
                pairId: pair.pairId
            };

            newContexts.push({ ...baseCard, id: `ctx-${pair.pairId}`, isLinked: false, isFilled: false, isSelected: false, isDone: false, error: false } as Card);
            // If isPreFilled is true (single word), we mark isFilled as true so the game logic treats it as ready once matched.
            newItems.push({ ...baseCard, id: `itm-${pair.pairId}`, isLinked: false, isFilled: isPreFilled, isSelected: false, isDone: false, error: false } as Card);
        });

        setContexts(newContexts);
        setItems(newItems.sort(() => 0.5 - Math.random()));
        setScore(0);
        setSelectedContextId(null);
        setSelectedItemId(null);
        setGameState('PLAYING');
    };

    const checkPairComplete = (pairId: string, updatedContexts: Card[], updatedItems: Card[]) => {
        const ctx = updatedContexts.find(c => c.pairId === pairId);
        const itm = updatedItems.find(i => i.pairId === pairId);

        if (ctx?.isLinked && itm?.isFilled) {
            ctx.isDone = true;
            itm.isDone = true;
            setScore(s => s + (difficulty === 'HARD' ? 25 : (difficulty === 'MEDIUM' ? 15 : 10)));
            
            const allDone = updatedContexts.every(c => c.isDone);
            if (allDone) {
                setTimeout(() => onComplete(score + 25), 1000);
            }
        }
    };

    const handleMatch = (ctxId: string, itmId: string) => {
        const ctx = contexts.find(c => c.id === ctxId);
        const itm = items.find(i => i.id === itmId);

        if (!ctx || !itm) return;

        if (ctx.pairId === itm.pairId) {
            const nextContexts = contexts.map(c => c.id === ctxId ? { ...c, isLinked: true, isSelected: false } : c);
            const nextItems = items.map(i => i.id === itmId ? { ...i, isLinked: true, isSelected: false } : i);
            setContexts(nextContexts);
            setItems(nextItems);
            setSelectedContextId(null);
            setSelectedItemId(null);
            checkPairComplete(ctx.pairId, nextContexts, nextItems);
        } else {
            // Error feedback
            setContexts(prev => prev.map(c => c.id === ctxId ? { ...c, error: true } : c));
            setItems(prev => prev.map(i => i.id === itmId ? { ...i, error: true } : i));
            setScore(s => Math.max(0, s - 5));

            setTimeout(() => {
                setContexts(prev => prev.map(c => ({ ...c, error: false, isSelected: false })));
                setItems(prev => prev.map(i => ({ ...i, error: false, isSelected: false })));
                setSelectedContextId(null);
                setSelectedItemId(null);
            }, 600);
        }
    };

    const onContextClick = (id: string) => {
        const card = contexts.find(c => c.id === id);
        if (!card || card.isDone) return;

        if (selectedItemId) {
            handleMatch(id, selectedItemId);
        } else {
            setSelectedContextId(id === selectedContextId ? null : id);
            setContexts(prev => prev.map(c => ({ ...c, isSelected: c.id === id ? !c.isSelected : false })));
        }
    };

    const onItemClick = (id: string) => {
        const card = items.find(i => i.id === id);
        if (!card || card.isDone) return;

        if (selectedContextId) {
            handleMatch(selectedContextId, id);
        } else {
            setSelectedItemId(id === selectedItemId ? null : id);
            setItems(prev => prev.map(i => ({ ...i, isSelected: i.id === id ? !i.isSelected : false })));
        }
    };

    const handleFillSubmit = (pairId: string, value: string) => {
        const item = items.find(i => i.pairId === pairId);
        if (!item || item.isDone) return;

        const isCorrect = value.trim().toLowerCase() === item.partnerWord.toLowerCase();
        
        if (isCorrect) {
            const nextItems = items.map(i => i.pairId === pairId ? { ...i, isFilled: true, text: i.fullText } : i);
            setItems(nextItems);
            checkPairComplete(pairId, contexts, nextItems);
        } else if (value.trim().length > 0 && !item.choices.includes(value)) {
            // Only show error for typed input that is wrong and complete
            setItems(prev => prev.map(i => i.pairId === pairId ? { ...i, error: true } : i));
            setTimeout(() => setItems(prev => prev.map(i => ({ ...i, error: false }))), 600);
        }
    };

    const getCardStyles = (card: Card) => {
        if (card.isDone) return 'bg-emerald-50 border-emerald-300 text-emerald-800 opacity-50 cursor-default shadow-none';
        if (card.error) return 'bg-red-50 border-red-500 text-red-700 animate-shake';
        if (card.isSelected) return 'bg-indigo-600 border-indigo-600 text-white shadow-lg ring-4 ring-indigo-100 scale-[1.02]';
        if (card.isLinked) return 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-sm';
        return 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50 cursor-pointer shadow-sm';
    };

    if (gameState === 'SETUP') {
        const SourceButton = ({ type: t, label, icon: Icon }: { type: SourceType, label: string, icon: React.ElementType }) => (
            <button
                onClick={() => setSourceType(t)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all min-w-[70px] ${sourceType === t ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-300'}`}
            >
                <Icon size={20} className="mb-1"/>
                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            </button>
        );

        const DiffButton = ({ level, label, desc }: { level: Difficulty, label: string, desc: string }) => (
            <button
                onClick={() => setDifficulty(level)}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left group ${difficulty === level ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${difficulty === level ? 'text-indigo-700' : 'text-neutral-400'}`}>{label}</span>
                    {difficulty === level && <Check size={14} className="text-indigo-600" />}
                </div>
                <span className="text-[10px] font-bold text-neutral-400 leading-tight">{desc}</span>
            </button>
        );

        return (
            <div className="flex flex-col h-full relative p-6 items-center text-center space-y-6 animate-in fade-in overflow-y-auto">
                <div className="space-y-2 mt-auto">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Zap size={32} fill="currentColor" />
                    </div>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Context Match Setup</h2>
                    <p className="text-neutral-500 font-medium max-w-sm mx-auto">Link meanings and fill the blanks.</p>
                </div>

                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* LEFT COLUMN: Source & Size */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6 flex flex-col justify-between">
                        <div className="space-y-3">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left px-1">Source</span>
                            {/* CHANGED TO GRID */}
                            <div className="grid grid-cols-2 gap-2 w-full">
                                <SourceButton type="PARAPHRASE" label="Paraphrase" icon={Zap} />
                                <SourceButton type="COLLOCATION" label="Collocation" icon={Split} />
                                <SourceButton type="IDIOM" label="Idiom" icon={Quote} />
                                <SourceButton type="MIX" label="Mix All" icon={Layers} />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Session Items</span>
                                <span className="text-xl font-black text-indigo-600">{sessionSize}</span>
                            </div>
                            <input
                                type="range" min="5" max="20" step="1" value={sessionSize}
                                onChange={(e) => setSessionSize(parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Difficulty */}
                    <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-3">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left px-1">Difficulty</span>
                        <div className="grid grid-cols-1 gap-3">
                            <DiffButton level="EASY" label="Easy" desc="Match definitions to phrases. No typing required." />
                            <DiffButton level="MEDIUM" label="Medium" desc="Match meanings and select the missing word from a dropdown." />
                            <DiffButton level="HARD" label="Hard" desc="Match meanings and type the missing word from memory." />
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 w-full max-w-md mb-auto">
                    <button onClick={onExit} className="px-10 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all active:scale-95">Back</button>
                    <button onClick={handleStartGame} className="flex-1 py-4 bg-neutral-900 text-white font-black text-sm uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl active:scale-95 flex justify-center items-center gap-2"><Play size={18} fill="white"/> Start</button>
                </div>
            </div>
        );
    }

    const progress = (contexts.filter(c => c.isDone).length / contexts.length) * 100;

    return (
        <div className="flex flex-col h-full relative p-6">
            <header className="flex justify-between items-center mb-6 shrink-0">
                <button onClick={onExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <div className="text-neutral-400 font-black text-[10px] uppercase tracking-widest">Context Match • {difficulty}</div>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 no-scrollbar pb-10">
                <div className="grid grid-cols-2 gap-10">
                    {/* Left Column: Headword + Context */}
                    <div className="space-y-4">
                        <h3 className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-6 flex items-center justify-center gap-2"><BookOpen size={12}/> Definition & Headword</h3>
                        {contexts.map(card => (
                            <button 
                                key={card.id} 
                                onClick={() => onContextClick(card.id)} 
                                className={`relative w-full p-5 rounded-[2rem] border-2 text-left transition-all duration-200 flex flex-col gap-2 ${getCardStyles(card)}`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className={`text-lg font-black tracking-tight ${card.isSelected ? 'text-white' : 'text-indigo-600'}`}>{card.headword}</span>
                                    <div className="flex gap-2">
                                        {card.isLinked && <Link2 size={16} className={card.isSelected ? 'text-white' : 'text-indigo-400'} />}
                                        {card.isDone && <CheckCircle2 size={18} className="text-emerald-500" />}
                                    </div>
                                </div>
                                <p className={`font-medium text-sm leading-relaxed ${card.isSelected ? 'text-indigo-100' : 'text-neutral-600'}`}>{card.context}</p>
                            </button>
                        ))}
                    </div>

                    {/* Right Column: Phrases with interactive blanks */}
                    <div className="space-y-4">
                        <h3 className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-6 flex items-center justify-center gap-2"><Brain size={12}/> Target Phrase</h3>
                        {items.map(card => (
                            <div 
                                key={card.id} 
                                onClick={() => onItemClick(card.id)}
                                className={`relative w-full p-6 rounded-[2rem] border-2 text-left transition-all duration-200 ${getCardStyles(card)}`}
                            >
                                <div className={`text-lg font-bold flex flex-wrap items-center gap-x-2 leading-relaxed ${card.isSelected ? 'text-white' : 'text-neutral-900'}`}>
                                    {card.text.split(' ').map((word, i) => {
                                        if (word !== '___') return <span key={i}>{word}</span>;
                                        
                                        if (difficulty === 'MEDIUM') {
                                            return (
                                                <div key={i} className="inline-flex items-center gap-1 bg-white border-2 border-indigo-200 rounded-xl px-2 py-1 shadow-sm" onClick={e => e.stopPropagation()}>
                                                    <select 
                                                        disabled={card.isDone}
                                                        className={`appearance-none bg-transparent text-sm font-black outline-none pr-6 relative ${card.isFilled ? 'text-emerald-600' : 'text-indigo-700'}`}
                                                        onChange={(e) => handleFillSubmit(card.pairId, e.target.value)}
                                                    >
                                                        <option value="">Select...</option>
                                                        {card.choices.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <ChevronDown size={14} className="text-indigo-400 pointer-events-none -ml-5" />
                                                </div>
                                            );
                                        }

                                        if (difficulty === 'HARD') {
                                            return (
                                                <input 
                                                    key={i}
                                                    type="text" 
                                                    disabled={card.isDone}
                                                    onClick={e => e.stopPropagation()}
                                                    className={`w-32 px-3 py-1 bg-white border-2 rounded-xl text-sm font-black outline-none transition-all ${card.isFilled ? 'border-emerald-500 text-emerald-600' : 'border-indigo-200 text-indigo-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'}`}
                                                    placeholder="..."
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleFillSubmit(card.pairId, e.currentTarget.value); }}
                                                />
                                            );
                                        }

                                        return <span key={i} className="text-neutral-300 font-black">_____</span>;
                                    })}
                                </div>
                                <div className="absolute top-4 right-6 flex gap-2">
                                    {card.isLinked && <Link2 size={16} className={card.isSelected ? 'text-white' : 'text-indigo-400'} />}
                                    {card.isDone && <CheckCircle2 size={18} className="text-emerald-500" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-center pt-10">
                    <button onClick={() => setGameState('SETUP')} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"><RefreshCw size={14} /> Restart</button>
                </div>
            </div>
        </div>
    );
};
