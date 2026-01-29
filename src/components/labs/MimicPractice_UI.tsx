import React, { useRef, useEffect, useState } from 'react';
import { Mic, Square, Play, Ear, Eye, EyeOff, ArrowRight, RotateCw, CheckCircle2, AlertTriangle, Volume2, Waves, Eraser, X, List, RefreshCw, Zap, ChevronLeft, PanelLeft, Sparkles, Loader2, Bot, Plus, Edit2, Trash2, Save } from 'lucide-react';
import { TargetPhrase } from './MimicPractice';

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
        if (text.trim()) {
            onSave(text.trim());
        }
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
                    <textarea 
                        ref={textareaRef}
                        value={text} 
                        onChange={e => setText(e.target.value)} 
                        placeholder="e.g. It's not a matter of if, but when." 
                        rows={5} 
                        className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-base leading-relaxed" 
                        required 
                    />
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Phrase</button>
                </footer>
            </form>
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
    queue: TargetPhrase[];
    currentIndex: number;
    onSelect: (index: number) => void;
    autoSpeak: boolean;
    onToggleAutoSpeak: () => void;
    isGlobalMode: boolean;
    isAnalyzing: boolean;
    onAnalyze: () => void;
    aiAnalysis: { isCorrect: boolean, score: number, feedbackHtml: string } | null;
    // New props for manual management
    onAddItem: () => void;
    onEditItem: (item: TargetPhrase) => void;
    onDeleteItem: (itemId: string) => void;
    isModalOpen: boolean;
    editingItem: TargetPhrase | null;
    onCloseModal: () => void;
    onSaveItem: (text: string) => void;
}

export const MimicPracticeUI: React.FC<MimicPracticeUIProps> = ({
    targetText, sourceWord, type, isRecording, isRevealed, userTranscript,
    matchStatus, userAudioUrl, onToggleRecord, onPlayTarget, onPlayUser, onToggleReveal, onNext, onClearTranscript, isEmpty, onClose,
    queue, currentIndex, onSelect, autoSpeak, onToggleAutoSpeak, isGlobalMode,
    isAnalyzing, onAnalyze, aiAnalysis,
    onAddItem, onEditItem, onDeleteItem, isModalOpen, editingItem, onCloseModal, onSaveItem
}) => {
    const activeItemRef = useRef<HTMLButtonElement>(null);
    const listContainerRef = useRef<HTMLDivElement>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    useEffect(() => {
        if (activeItemRef.current) {
            activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentIndex]);

    if (isEmpty) {
        return (
            <>
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 relative bg-white">
                    {onClose && (
                        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors">
                            <X size={24} />
                        </button>
                    )}
                    <div className="p-4 bg-neutral-100 rounded-full text-neutral-400">
                        <Ear size={40} />
                    </div>
                    <h3 className="text-xl font-black text-neutral-900">Queue is Empty</h3>
                    <p className="text-neutral-500 max-w-xs">Click "Add New" to add phrases for practice.</p>
                    <button onClick={onAddItem} className="mt-4 px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest">
                        <Plus size={14}/> Add New
                    </button>
                </div>
                <AddEditPhraseModal 
                    isOpen={isModalOpen}
                    onClose={onCloseModal}
                    onSave={onSaveItem}
                    initialData={editingItem}
                />
            </>
        );
    }

    const effectiveRevealed = isRevealed || matchStatus === 'match' || isSidebarOpen;
    const canProceed = matchStatus === 'match' || effectiveRevealed || !!userTranscript;
    
    const rootClasses = isGlobalMode ? 'h-full rounded-[2.5rem] shadow-sm border border-neutral-200' : 'h-full';

    return (
        <>
            <div className={`flex w-full bg-white relative overflow-hidden ${rootClasses}`}>
                <div className={`h-full border-r border-neutral-100 bg-neutral-50/50 flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-80 translate-x-0 opacity-100' : 'w-0 -translate-x-full overflow-hidden opacity-0 border-none'}`}>
                    <div className="p-4 border-b border-neutral-100 bg-white space-y-3 whitespace-nowrap shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-neutral-500">
                                <List size={18}/>
                                <span className="text-xs font-black uppercase tracking-widest">Session Queue</span>
                            </div>
                            <span className="text-[10px] font-bold bg-neutral-900 text-white px-2 py-0.5 rounded-full">{queue.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={onToggleAutoSpeak}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${autoSpeak ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}
                            >
                                <Zap size={12} className={autoSpeak ? "fill-amber-700" : ""} />
                                <span>Auto Speak</span>
                            </button>
                            <button 
                                onClick={onAddItem}
                                className="p-2 bg-white border border-neutral-200 text-neutral-500 rounded-lg hover:text-neutral-900 hover:border-neutral-300 transition-all"
                                title="Add New Phrase"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                    <div ref={listContainerRef} className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {queue.map((item, idx) => {
                            const isActive = idx === currentIndex;
                            return (
                                <div 
                                    key={item.id}
                                    className={`
                                        w-full text-left rounded-lg border transition-all duration-200 group relative
                                        ${isActive 
                                            ? 'bg-white border-neutral-900 shadow-sm ring-1 ring-neutral-900/5 z-10' 
                                            : 'bg-transparent border-transparent hover:bg-neutral-100 hover:border-neutral-100 text-neutral-500 hover:text-neutral-900'
                                        }
                                    `}
                                >
                                    <button ref={isActive ? activeItemRef : null} onClick={() => onSelect(idx)} className="w-full px-3 py-2">
                                        <p className={`text-xs font-bold leading-snug line-clamp-2 ${isActive ? 'text-neutral-900' : 'text-neutral-600 group-hover:text-neutral-900'}`}>
                                            {item.text}
                                        </p>
                                    </button>
                                    <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center bg-white/50 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => onEditItem(item)} className="p-1.5 text-neutral-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50" title="Edit"><Edit2 size={12} /></button>
                                        <button onClick={() => onDeleteItem(item.id)} className="p-1.5 text-neutral-400 hover:text-red-600 rounded-full hover:bg-red-50" title="Delete"><Trash2 size={12} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 h-full flex flex-col relative overflow-y-auto">
                    <button 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="absolute top-6 left-6 p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors z-40"
                        title={isSidebarOpen ? "Close List" : "Open List"}
                    >
                        {isSidebarOpen ? <ChevronLeft size={20} /> : <List size={20} />}
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors z-50">
                            <X size={24} />
                        </button>
                    )}
                    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-10 animate-in fade-in duration-500">
                        {!targetText ? (
                            <div className="flex flex-col items-center justify-center space-y-4 animate-pulse">
                                <p className="text-neutral-400 font-bold uppercase tracking-widest text-xs">Loading Echo...</p>
                            </div>
                        ) : (
                            <>
                                <div className="text-center space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-neutral-100 rounded-full border border-neutral-200">
                                        <span className="text-[10px] font-bold text-neutral-600">From "{sourceWord}"</span>
                                    </div>
                                </div>
                                <div className="relative w-full max-w-2xl">
                                    <div className={`p-8 rounded-[2.5rem] border-2 text-center transition-all duration-300 min-h-[150px] flex flex-col items-center justify-center relative
                                        ${matchStatus === 'match' ? 'bg-green-50 border-green-200 shadow-[0_0_60px_rgba(34,197,94,0.15)]' : 
                                        matchStatus === 'miss' ? 'bg-red-50 border-red-200' :
                                        matchStatus === 'close' ? 'bg-amber-50 border-amber-200' :
                                        'bg-white border-neutral-200 shadow-xl shadow-neutral-100'}
                                    `}>
                                        {!isSidebarOpen && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onToggleReveal(); }}
                                                className="absolute top-4 right-4 p-2 text-neutral-300 hover:text-indigo-500 transition-colors z-20"
                                                title={isRevealed ? "Hide Text" : "Reveal Text"}
                                            >
                                                {isRevealed ? <EyeOff size={20} /> : <Eye size={20} />}
                                            </button>
                                        )}
                                        <div className="relative px-4 w-full">
                                            <h2 className={`text-3xl md:text-4xl font-black transition-all duration-300 leading-tight ${effectiveRevealed ? 'text-neutral-900 blur-0' : 'text-transparent blur-md select-none'}`}>
                                                {targetText}
                                            </h2>
                                            {(!effectiveRevealed) && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <span className="text-neutral-300 text-xs font-bold uppercase tracking-widest animate-pulse">Hidden</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="min-h-20 flex flex-col items-center justify-center w-full px-4 gap-2">
                                    {isRecording ? (
                                        <div className="flex items-center gap-2 text-red-500 animate-pulse">
                                            <Waves size={24} />
                                            <span className="font-bold text-sm uppercase tracking-widest">Listening...</span>
                                        </div>
                                    ) : !userTranscript && (
                                        <p className="text-neutral-300 text-sm font-medium">Tap mic to start</p>
                                    )}
                                    {userTranscript && (
                                        <div className="relative group animate-in slide-in-from-bottom-2 w-full max-w-xl text-center">
                                            <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest mb-2">You said</p>
                                            <div className="relative">
                                                <p className={`text-xl font-medium px-8 leading-relaxed ${matchStatus === 'match' ? 'text-green-600' : matchStatus === 'close' ? 'text-amber-600' : 'text-neutral-800'}`}>
                                                    "{userTranscript}"
                                                </p>
                                                {isRecording && (
                                                    <button onClick={onClearTranscript} className="absolute -right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" title="Clear Text"><Eraser size={16} /></button>
                                                )}
                                            </div>
                                            {matchStatus === 'match' && <div className="flex items-center justify-center gap-1 text-green-500 text-sm font-black uppercase mt-2"><CheckCircle2 size={16}/> Perfect Match</div>}
                                        </div>
                                    )}
                                </div>
                                {aiAnalysis && (
                                    <div className="w-full max-w-xl bg-white rounded-2xl border border-neutral-200 p-6 animate-in slide-in-from-bottom-2 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2"><Sparkles size={16} className="text-amber-500" /><span className="text-xs font-black uppercase tracking-widest text-neutral-500">AI Feedback</span></div>
                                            <span className={`text-lg font-black ${aiAnalysis.score >= 80 ? 'text-green-600' : aiAnalysis.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{aiAnalysis.score}/100</span>
                                        </div>
                                        <div className="text-sm text-neutral-700 leading-relaxed [&_b]:font-bold [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1" dangerouslySetInnerHTML={{ __html: aiAnalysis.feedbackHtml }} />
                                    </div>
                                )}
                                <div className="flex items-center gap-8">
                                    <button onClick={onPlayTarget} className="p-5 rounded-2xl bg-white border border-neutral-200 text-neutral-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-95" title="Listen to phrase"><Volume2 size={28} className={isRecording ? 'opacity-50' : ''} /></button>
                                    <button onClick={onToggleRecord} className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all transform ${isRecording ? 'bg-red-500 text-white scale-110 ring-8 ring-red-100' : 'bg-white border-4 border-neutral-100 text-neutral-900 hover:border-neutral-200 hover:scale-105'}`}>{isRecording ? <Square size={36} fill="currentColor" /> : <Mic size={36} />}</button>
                                    <button onClick={onPlayUser} disabled={!userAudioUrl || isRecording} className={`p-5 rounded-2xl border transition-all shadow-sm ${userAudioUrl && !isRecording ? 'bg-white border-neutral-200 text-neutral-600 hover:text-indigo-600 hover:border-indigo-200' : 'bg-neutral-50 border-neutral-100 text-neutral-300 cursor-not-allowed'}`} title="Replay your recording"><Play size={24} fill={userAudioUrl && !isRecording ? "currentColor" : "none"} /></button>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    {userAudioUrl && !isRecording && (
                                        <button onClick={onAnalyze} disabled={isAnalyzing} className="px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-indigo-600 transition-all active:scale-95 shadow-sm disabled:opacity-50">{isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}<span>Analyze</span></button>
                                    )}
                                    <button onClick={onNext} disabled={!canProceed} className={`px-10 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl ${canProceed ? 'bg-neutral-900 text-white hover:bg-neutral-800 active:scale-95 hover:shadow-2xl' : 'bg-neutral-100 text-neutral-300 cursor-not-allowed shadow-none'}`}><span>Next Phrase</span><ArrowRight size={16} /></button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <AddEditPhraseModal 
                isOpen={isModalOpen}
                onClose={onCloseModal}
                onSave={onSaveItem}
                initialData={editingItem}
            />
        </>
    );
};