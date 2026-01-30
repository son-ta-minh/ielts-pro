
import React, { useRef, useEffect, useState } from 'react';
import { Mic, Square, Play, Ear, Eye, EyeOff, ArrowRight, CheckCircle2, Volume2, Waves, Eraser, X, List, Sparkles, Plus, Edit2, Trash2, Save, Info, Shuffle, ChevronLeft, ChevronRight } from 'lucide-react';
import { TargetPhrase } from './MimicPractice';
import { AnalysisResult, CharDiff } from '../../utils/speechAnalysis';
import { speak } from '../../utils/audio';

interface AddEditPhraseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (text: string) => void;
    initialData: TargetPhrase | null;
}

const AddEditPhraseModal: React.FC<AddEditPhraseModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setText(initialData?.text || '');
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen, initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (text.trim()) onSave(text.trim());
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Phrase' : 'Add New Phrase'}</h3>
                        <p className="text-sm text-neutral-500">Enter the text you want to practice mimicking.</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8">
                    <textarea ref={textareaRef} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. It's not a matter of if, but when." rows={5} className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-base leading-relaxed" required />
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Phrase</button>
                </footer>
            </form>
        </div>
    );
};

const ScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
    if (score === undefined) return <div className="w-2 h-2 rounded-full bg-neutral-200" title="Not practiced yet" />;
    
    let colorClass = 'bg-neutral-200';
    if (score >= 80) colorClass = 'bg-green-500';
    else if (score >= 50) colorClass = 'bg-yellow-400';
    else colorClass = 'bg-red-500';

    return (
        <div className={`flex items-center justify-center px-1.5 py-0.5 rounded-md ${score >= 80 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
             <span className="text-[9px] font-black">{score}</span>
        </div>
    );
};


export interface MimicPracticeUIProps {
    targetText: string | null;
    sourceWord: string;
    type: string;
    isRecording: boolean;
    isRevealed: boolean;
    userTranscript: string;
    matchStatus: 'match' | 'close' | 'miss' | null;
    userAudioUrl: string | null;
    onToggleRecord: () => void;
    onPlayTarget: () => void;
    onPlayUser: () => void;
    onToggleReveal: () => void;
    onNext: () => void;
    onClearTranscript: () => void;
    isEmpty: boolean;
    onClose?: () => void;
    
    // Pagination Props
    pagedItems: TargetPhrase[];
    page: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (p: number) => void;
    onPageSizeChange: (s: number) => void;
    onSelect: (relativeIndex: number) => void;
    currentAbsoluteIndex: number;
    
    autoSpeak: boolean;
    onToggleAutoSpeak: () => void;
    isGlobalMode: boolean;
    isAnalyzing: boolean;
    onAnalyze: () => void;
    aiAnalysis: { isCorrect: boolean, score: number, feedbackHtml: string } | null;
    localAnalysis: AnalysisResult | null;
    onAddItem: () => void;
    onEditItem: (item: TargetPhrase) => void;
    onDeleteItem: (item: TargetPhrase) => void;
    onRandomize: () => void;
    isModalOpen: boolean;
    editingItem: TargetPhrase | null;
    onCloseModal: () => void;
    onSaveItem: (text: string) => void;
}

export const MimicPracticeUI: React.FC<MimicPracticeUIProps> = ({
    targetText, sourceWord, isRecording, isRevealed, userTranscript,
    userAudioUrl, onToggleRecord, onPlayTarget, onPlayUser, onToggleReveal, onNext, onClearTranscript, isEmpty, onClose,
    pagedItems, page, pageSize, totalPages, onPageChange, onPageSizeChange, onSelect, currentAbsoluteIndex,
    autoSpeak, onToggleAutoSpeak, isGlobalMode,
    localAnalysis, onAddItem, onEditItem, onDeleteItem, onRandomize, isModalOpen, editingItem, onCloseModal, onSaveItem
}) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    if (isEmpty) {
        return (
            <>
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 relative bg-white">
                    {onClose && <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={24} /></button>}
                    <div className="p-4 bg-neutral-100 rounded-full text-neutral-400"><Ear size={40} /></div>
                    <h3 className="text-xl font-black text-neutral-900">Queue is Empty</h3>
                    <button onClick={onAddItem} className="mt-4 px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Plus size={14}/> Add New</button>
                </div>
                <AddEditPhraseModal isOpen={isModalOpen} onClose={onCloseModal} onSave={onSaveItem} initialData={editingItem} />
            </>
        );
    }

    const rootClasses = isGlobalMode ? 'h-full rounded-[2.5rem] shadow-sm border border-neutral-200' : 'h-full';

    return (
        <>
            <div className={`flex w-full bg-white relative overflow-hidden ${rootClasses}`}>
                <div className={`h-full border-r border-neutral-100 bg-neutral-50/50 flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-none overflow-hidden'}`}>
                    <div className="p-4 border-b border-neutral-100 bg-white space-y-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-neutral-500"><List size={18}/><span className="text-xs font-black uppercase tracking-widest">Queue</span></div>
                            <div className="flex items-center gap-1">
                                <button onClick={onToggleAutoSpeak} className={`p-2 rounded-lg border transition-all shadow-sm ${autoSpeak ? 'bg-amber-100 border-amber-200 text-amber-600' : 'bg-white border-neutral-200 text-neutral-400 hover:text-neutral-600'}`} title={`Auto Speak: ${autoSpeak ? 'ON' : 'OFF'}`}>
                                    <Sparkles size={14} fill={autoSpeak ? "currentColor" : "none"} />
                                </button>
                                <button onClick={onRandomize} className="p-2 bg-white border border-neutral-200 text-neutral-500 rounded-lg hover:text-indigo-600 transition-all shadow-sm" title="Shuffle Queue"><Shuffle size={14} /></button>
                                <button onClick={onAddItem} className="p-2 bg-neutral-900 text-white border border-neutral-900 rounded-lg hover:bg-neutral-800 transition-all shadow-sm"><Plus size={14} /></button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {pagedItems.map((item, idx) => {
                            // Calculate absolute index to check active state
                            const itemAbsoluteIndex = (page * pageSize) + idx;
                            const isActive = itemAbsoluteIndex === currentAbsoluteIndex;
                            
                            return (
                                <div key={item.id} className={`w-full text-left rounded-lg border transition-all group relative ${isActive ? 'bg-white border-neutral-900 shadow-sm ring-1 ring-neutral-900/5' : 'border-transparent hover:bg-neutral-100'}`}>
                                    <button onClick={() => onSelect(idx)} className="w-full px-3 py-3 flex items-start gap-3">
                                        <div className="mt-0.5 shrink-0"><ScoreBadge score={item.lastScore} /></div>
                                        <span className={`text-xs font-bold leading-snug line-clamp-2 ${isActive ? 'text-neutral-900' : 'text-neutral-600'}`}>{item.text}</span>
                                    </button>
                                    <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-neutral-100">
                                        <button onClick={() => onEditItem(item)} className="p-1.5 text-neutral-400 hover:text-indigo-600"><Edit2 size={12} /></button>
                                        <button onClick={() => onDeleteItem(item)} className="p-1.5 text-neutral-400 hover:text-red-600"><Trash2 size={12} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination Controls */}
                    <div className="p-3 border-t border-neutral-100 bg-white flex items-center justify-between shrink-0">
                        <select 
                            value={pageSize} 
                            onChange={(e) => onPageSizeChange(Number(e.target.value))}
                            className="bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1 text-[10px] font-bold text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                        >
                            {[10, 15, 20, 30].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <button onClick={() => onPageChange(page - 1)} disabled={page === 0} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft size={16}/></button>
                                <span className="text-[10px] font-black text-neutral-400 tabular-nums">{page + 1}/{totalPages}</span>
                                <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight size={16}/></button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 h-full flex flex-col relative overflow-y-auto">
                    {onClose && <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-900 rounded-full z-50"><X size={24} /></button>}
                    
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-10 animate-in fade-in">
                        <div className="relative w-full max-w-2xl">
                            <div className={`p-8 md:p-12 rounded-[2.5rem] border-2 text-center transition-all duration-300 min-h-[220px] flex flex-col items-center justify-center relative bg-white border-neutral-200 shadow-xl shadow-neutral-100`}>
                                {isGlobalMode && (
                                    <div className="absolute top-6 left-6 px-3 py-1 bg-neutral-50 rounded-lg text-[10px] font-black uppercase tracking-widest text-neutral-400 border border-neutral-100">
                                        Pronunciation Practice
                                    </div>
                                )}
                                <button onClick={onToggleReveal} className="absolute top-6 right-6 p-2 text-neutral-300 hover:text-indigo-500">{isRevealed ? <EyeOff size={24} /> : <Eye size={24} />}</button>
                                
                                <div className="relative px-4 w-full flex flex-wrap justify-center gap-x-3 gap-y-2">
                                    {targetText?.split(/\s+/).map((word, wIdx) => {
                                        const analysis = localAnalysis?.words[wIdx];
                                        const isWordMissing = analysis?.status === 'missing';
                                        
                                        return (
                                            <span 
                                                key={wIdx} 
                                                onClick={() => speak(word)}
                                                className={`text-4xl md:text-5xl font-black cursor-pointer hover:underline decoration-neutral-200 transition-all flex ${isRevealed || localAnalysis ? 'opacity-100' : 'text-transparent blur-lg select-none'}`}
                                            >
                                                {analysis?.chars ? (
                                                    analysis.chars.map((c: CharDiff, cIdx: number) => (
                                                        <span 
                                                            key={cIdx} 
                                                            className={
                                                                c.status === 'correct' ? 'text-emerald-500' : 
                                                                c.status === 'wrong' ? 'text-rose-500' : 
                                                                'text-rose-300'
                                                            }
                                                        >
                                                            {c.char}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className={isWordMissing ? 'text-neutral-300' : 'text-neutral-900'}>
                                                        {word}
                                                    </span>
                                                )}
                                            </span>
                                        );
                                    })}
                                    {!isRevealed && !localAnalysis && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-neutral-200 text-sm font-bold uppercase tracking-widest animate-pulse">Speak to reveal result</span>
                                        </div>
                                    )}
                                </div>

                                {localAnalysis && (
                                    <div className="mt-8 flex flex-col items-center gap-1 animate-in slide-in-from-top-2">
                                        <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Pronunciation Accuracy</div>
                                        <div className={`text-5xl font-black ${localAnalysis.score > 80 ? 'text-emerald-500' : localAnalysis.score > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                                            {localAnalysis.score}%
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="min-h-24 flex flex-col items-center justify-center w-full max-w-xl text-center">
                            {isRecording ? (
                                <div className="flex items-center gap-3 text-rose-500 animate-pulse">
                                    <Waves size={32} />
                                    <span className="font-black text-base uppercase tracking-widest">Listening...</span>
                                </div>
                            ) : !userTranscript && <p className="text-neutral-300 text-sm font-medium">Tap the microphone and read the phrase aloud</p>}
                            
                            {userTranscript && !isRecording && (
                                <div className="space-y-1 animate-in fade-in">
                                    <p className="text-neutral-400 text-[10px] font-black uppercase tracking-widest">What we heard</p>
                                    <p className="text-xl font-medium italic text-neutral-600">"{userTranscript}"</p>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-8">
                            <button onClick={onPlayTarget} className="p-6 rounded-3xl bg-white border border-neutral-200 text-neutral-600 hover:text-indigo-600 shadow-sm transition-all active:scale-95"><Volume2 size={32} /></button>
                            <button onClick={onToggleRecord} className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all transform ${isRecording ? 'bg-rose-500 text-white scale-110 ring-12 ring-rose-100' : 'bg-white border-4 border-neutral-100 text-neutral-900 hover:border-neutral-200 hover:scale-105'}`}>{isRecording ? <Square size={40} fill="currentColor" /> : <Mic size={40} />}</button>
                            <button onClick={onPlayUser} disabled={!userAudioUrl || isRecording} className={`p-6 rounded-3xl border transition-all shadow-sm ${userAudioUrl && !isRecording ? 'bg-white border-neutral-200 text-neutral-600 hover:text-indigo-600' : 'bg-neutral-50 border-neutral-100 text-neutral-300 cursor-not-allowed'}`}><Play size={28} fill={userAudioUrl && !isRecording ? "currentColor" : "none"} /></button>
                        </div>

                        <button onClick={onNext} className={`px-12 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl bg-neutral-900 text-white hover:bg-neutral-800 active:scale-95`}><span>Next Phrase</span><ArrowRight size={18} /></button>
                    </div>

                    <div className="px-10 pb-8">
                        <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-[2rem] flex items-start gap-4">
                            <div className="p-2 bg-indigo-500 text-white rounded-xl shadow-sm"><Info size={20} /></div>
                            <div className="text-[11px] text-indigo-700 leading-relaxed font-medium">
                                <b className="text-xs uppercase tracking-wider block mb-1">Visual Feedback Guide:</b>
                                <span className="text-emerald-600 font-black">GREEN</span>: Your sound was detected correctly.
                                <br/>
                                <span className="text-rose-500 font-black">RED</span>: These characters represent sounds that were missing or significantly mispronounced.
                                <br/>
                                <span className="text-neutral-400 font-black">GRAY</span>: The word was not detected in your speech.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <AddEditPhraseModal isOpen={isModalOpen} onClose={onCloseModal} onSave={onSaveItem} initialData={editingItem} />
        </>
    );
};
