
import React, { useState, useRef } from 'react';
import { NativeSpeakItem } from '../../app/types';
import { X, Volume2, Mic, Eye, EyeOff, Info } from 'lucide-react';
import { speak } from '../../utils/audio';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import * as dataStore from '../../app/dataStore';

const PatternRenderer: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/({.*?}|\[.*?\]|<.*?>)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('{') && part.endsWith('}')) {
                    return (
                        <span key={i} className="mx-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold font-mono text-[0.9em] border border-amber-200 inline-block shadow-sm">
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                if (part.startsWith('[') && part.endsWith(']')) {
                    return (
                         <span key={i} className="mx-1 inline-flex items-center gap-1.5 text-[10px] text-sky-700 bg-sky-100 border border-sky-200 px-2 py-1 rounded-full font-medium">
                            <Info size={12} />
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    item: NativeSpeakItem | null;
}

export const SpeakingPracticeModal: React.FC<Props> = ({ isOpen, onClose, item }) => {
    const [revealed, setRevealed] = useState<Set<number>>(new Set());
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    const sessionScores = useRef<number[]>([]);

    if (!isOpen || !item) return null;

    const toggleReveal = (idx: number) => {
        setRevealed(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const handleMimic = (sentence: string) => {
        const cleanText = sentence.replace(/{|}/g, '');
        setMimicTarget(cleanText);
    };
    
    const handleSaveScore = (score: number) => {
        sessionScores.current.push(score);
    };
    
    const handleClose = async () => {
        if (sessionScores.current.length > 0) {
            const avg = Math.round(sessionScores.current.reduce((a, b) => a + b, 0) / sessionScores.current.length);
            await dataStore.saveNativeSpeakItem({
                ...item,
                bestScore: avg,
                updatedAt: Date.now()
            });
        }
        onClose();
        sessionScores.current = [];
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[85vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">{item.standard}</h3>
                        <p className="text-xs text-neutral-500 font-bold mt-1">Native Expressions Practice</p>
                    </div>
                    <button type="button" onClick={handleClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                </header>
                <main className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-neutral-50/30">
                    {item.answers.map((ans, idx) => {
                        const isRevealed = revealed.has(idx);
                        return (
                            <div key={idx} className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-3 relative overflow-hidden group">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${ans.tone === 'academic' ? 'bg-purple-50 text-purple-700 border-purple-100' : ans.tone === 'semi-academic' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-neutral-50 text-neutral-600 border-neutral-100'}`}>{ans.tone}</span>
                                        </div>
                                        {/* Anchor represents the Situation/Context now, so it is always visible as the prompt */}
                                        <span className="text-sm font-bold text-neutral-700 leading-snug">{ans.anchor}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => toggleReveal(idx)} className={`p-2 rounded-lg transition-all ${isRevealed ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                                            {isRevealed ? <EyeOff size={16}/> : <Eye size={16}/>}
                                        </button>
                                        {isRevealed && (
                                            <>
                                                <button onClick={() => speak(ans.sentence.replace(/{|}/g, ''))} className="p-2 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Listen"><Volume2 size={16}/></button>
                                                <button onClick={() => handleMimic(ans.sentence)} className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Practice Speaking"><Mic size={16}/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="min-h-[1.5rem] flex items-center pt-2 border-t border-neutral-50">
                                    {isRevealed ? (
                                        <div className="text-base font-medium text-neutral-800 animate-in fade-in slide-in-from-top-1"><PatternRenderer text={ans.sentence} /></div>
                                    ) : (
                                        <div className="flex gap-1 items-center opacity-30 w-full">
                                            {/* Skeleton loader for hidden text */}
                                            <div className="h-2 w-12 bg-neutral-200 rounded-full"></div>
                                            <div className="h-2 w-24 bg-neutral-200 rounded-full"></div>
                                            <div className="h-2 w-8 bg-neutral-200 rounded-full"></div>
                                        </div>
                                    )}
                                </div>
                                {ans.note && isRevealed && <div className="text-[10px] text-neutral-400 font-medium italic">"{ans.note}"</div>}
                            </div>
                        );
                    })}
                </main>
                <footer className="px-8 py-4 border-t border-neutral-100 bg-white rounded-b-[2.5rem] flex justify-end">
                    <button onClick={handleClose} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md">Done</button>
                </footer>
            </div>
            {mimicTarget && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} onSaveScore={handleSaveScore} />}
        </div>
    );
};
