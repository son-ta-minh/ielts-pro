
import React, { useRef, useEffect } from 'react';
import { IrregularVerb } from '../../../app/types';
import { X, ArrowRight, Check, RefreshCw, BarChart, CheckCircle, XCircle, Zap, Eye } from 'lucide-react';

export interface IrregularVerbsPracticeUIProps {
    verbs: IrregularVerb[];
    mode: 'headword' | 'random' | 'quick';
    currentIndex: number;
    practiceQueue: { verb: IrregularVerb; promptType: 'v1' | 'v2' | 'v3' }[];
    answers: Record<string, string>;
    onAnswerChange: (field: string, value: string) => void;
    onEnterPress: () => void;
    isAnswered: boolean;
    isFinished: boolean;
    isRevealed: boolean;
    sessionResults: { verbId: string; result: 'pass' | 'fail'; incorrectForms: ('v1' | 'v2' | 'v3')[] }[];
    onCheck: () => void;
    onNext: () => void;
    onQuickAnswer: (result: 'pass' | 'fail') => void;
    onReveal: () => void;
    onFinish: () => void;
    onExit: () => void;
}

export const IrregularVerbsPracticeUI: React.FC<IrregularVerbsPracticeUIProps> = ({
    verbs,
    mode,
    currentIndex,
    practiceQueue,
    answers,
    onAnswerChange,
    onEnterPress,
    isAnswered,
    isFinished,
    isRevealed,
    sessionResults,
    onCheck,
    onNext,
    onQuickAnswer,
    onReveal,
    onFinish,
    onExit
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus first empty input when moving to next question
    useEffect(() => {
        if (!isFinished && !isAnswered && inputRef.current) {
            inputRef.current.focus();
        }
    }, [currentIndex, isAnswered, isFinished]);

    const currentItem = practiceQueue[currentIndex];

    // Render Logic for Inputs
    const renderInputField = (form: 'v1' | 'v2' | 'v3', label: string) => {
        if (!currentItem) return null;
        const { verb, promptType } = currentItem;
        
        // Find the first input field to auto-focus
        const forms: ('v1' | 'v2' | 'v3')[] = ['v1', 'v2', 'v3'];
        const firstInputForm = forms.find(f => f !== promptType);
        const isFirstInput = form === firstInputForm;

        if (promptType === form) {
            return (
                <div className="space-y-1">
                    <label className="block text-xs font-bold text-neutral-500">{label}</label>
                    <div className="w-full px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-xl font-bold text-lg text-neutral-900">
                        {verb[form]}
                    </div>
                </div>
            );
        }

        const value = answers[form] || '';
        const isFieldCorrect = (value || '').trim().toLowerCase() === verb[form].toLowerCase();

        let inputClass = "bg-white focus:bg-white focus:border-neutral-900";
        if (isAnswered) {
            inputClass = isFieldCorrect 
                ? "bg-green-50 border-green-500 text-green-800" 
                : "bg-red-50 border-red-500 text-red-800";
        }

        return (
            <div className="space-y-1">
                <label className="block text-xs font-bold text-neutral-500">{label}</label>
                <div className="relative">
                    <input
                        ref={isFirstInput ? inputRef : null}
                        value={value}
                        onChange={e => onAnswerChange(form, e.target.value)}
                        disabled={isAnswered}
                        onKeyDown={e => { if (e.key === 'Enter' && !isAnswered) onEnterPress(); }}
                        className={`w-full px-4 py-3 border-2 border-neutral-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-neutral-900 outline-none transition-colors ${inputClass}`}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                    />
                    {isAnswered && !isFieldCorrect && (
                        <div className="absolute top-full mt-1 text-xs font-bold text-green-600 animate-in fade-in slide-in-from-top-1">
                            {verb[form]}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (isFinished) {
        const correctCount = sessionResults.filter(r => r.result === 'pass').length;
        return (
            <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                    <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center">
                        <div>
                             <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><BarChart size={20}/> Session Recap</h3>
                             <p className="text-sm text-neutral-500">You got {correctCount} out of {verbs.length} correct.</p>
                        </div>
                    </header>
                    <main className="p-6 overflow-y-auto space-y-2">
                        {verbs.map(v => {
                            const result = sessionResults.find(r => r.verbId === v.id);
                            const wasCorrect = result?.result === 'pass';
                            return (
                                <div key={v.id} className={`p-3 rounded-lg flex items-center justify-between border ${wasCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                    <span className="font-bold text-sm text-neutral-800">{v.v1} <span className="text-neutral-400 font-normal">→ {v.v2}, {v.v3}</span></span>
                                    {wasCorrect ? <CheckCircle className="text-green-500" size={18} /> : <XCircle className="text-red-500" size={18} />}
                                </div>
                            );
                        })}
                    </main>
                    <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                        <button onClick={onFinish} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-colors">Finish</button>
                    </footer>
                </div>
            </div>
        );
    }

    if (mode === 'quick' && currentItem) {
        return (
            <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                    <header className="px-8 py-4 border-b border-neutral-100 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><Zap size={16} /></div>
                            <h3 className="text-lg font-black text-neutral-900">Quick Review</h3>
                        </div>
                        <button type="button" onClick={onExit} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={16} /></button>
                    </header>
                    <main className="p-8 flex flex-col items-center text-center space-y-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 bg-neutral-100 px-2 py-1 rounded-md">Verb {currentIndex + 1} of {practiceQueue.length}</p>
                        <div className="min-h-[100px] flex flex-col justify-center w-full">
                            <h2 className="text-4xl font-black text-neutral-900 mb-2">{currentItem.verb.v1}</h2>
                            {isRevealed ? (
                                <p className="text-xl font-mono text-neutral-600 animate-in fade-in slide-in-from-bottom-2 bg-neutral-50 py-2 rounded-xl border border-neutral-200">{currentItem.verb.v2}, {currentItem.verb.v3}</p>
                            ) : (
                                <div className="h-[46px] flex items-center justify-center">
                                    <div className="w-16 h-2 bg-neutral-100 rounded-full animate-pulse"></div>
                                </div>
                            )}
                        </div>
                    </main>
                    <footer className="px-6 pb-6 pt-2 flex items-stretch gap-3">
                        <button onClick={() => onQuickAnswer('fail')} className="flex-1 py-4 bg-white border-2 border-neutral-100 text-neutral-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-2xl flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 group">
                            <RefreshCw size={20} className="group-hover:rotate-180 transition-transform"/>
                            <span className="text-[9px] font-black uppercase tracking-widest">Forgot</span>
                        </button>
                        <button onClick={onReveal} disabled={isRevealed} className="flex-1 py-4 bg-white border-2 border-neutral-100 text-neutral-500 hover:text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50 rounded-2xl flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 disabled:opacity-50 disabled:bg-neutral-50">
                            <Eye size={20} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Show</span>
                        </button>
                        <button onClick={() => onQuickAnswer('pass')} className="flex-1 py-4 bg-white border-2 border-neutral-100 text-neutral-500 hover:text-green-600 hover:border-green-200 hover:bg-green-50 rounded-2xl flex flex-col items-center justify-center space-y-1 transition-all active:scale-95 group">
                            <Check size={20} className="group-hover:scale-110 transition-transform"/>
                            <span className="text-[9px] font-black uppercase tracking-widest">Known</span>
                        </button>
                    </footer>
                </div>
            </div>
        );
    }

    // Headword & Random mode
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Verb Practice</h3>
                        <p className="text-sm text-neutral-500 font-medium">Verb {currentIndex + 1} of {practiceQueue.length}</p>
                    </div>
                    <button type="button" onClick={onExit} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 grid grid-cols-1 gap-6">
                    {renderInputField('v1', 'V1 (Base Form)')}
                    {renderInputField('v2', 'V2 (Past Simple)')}
                    {renderInputField('v3', 'V3 (Past Participle)')}
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    {isAnswered ? (
                        <button onClick={onNext} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-800 transition-all active:scale-95">
                            <span>{currentIndex === practiceQueue.length - 1 ? 'Finish' : 'Next'}</span>
                            <ArrowRight size={14} />
                        </button>
                    ) : (
                        <button onClick={onCheck} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 shadow-lg shadow-indigo-200">
                            <Check size={14} />
                            <span>Check Answer</span>
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
};
