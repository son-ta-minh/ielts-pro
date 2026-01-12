
import React from 'react';
import { Sparkles, Send, Loader2, AlertCircle, CheckCircle2, Lightbulb, FileText, Mic, RefreshCw, ChevronDown, Plus, ChevronRight, ChevronLeft, Zap, ArrowRight, SlidersHorizontal, Bot, XCircle, AlertTriangle } from 'lucide-react';
import { ParaphraseMode, User } from '../../app/types';
import UniversalAiModal, { AiActionType } from '../common/UniversalAiModal';

type Step = 'SETUP' | 'PRACTICE' | 'RESULT';

const paraphraseModes = [
    { mode: ParaphraseMode.VARIETY, title: "Same Tone", desc: "rewriting with a different structure", icon: RefreshCw },
    { mode: ParaphraseMode.MORE_ACADEMIC, title: "Academic", desc: "elevating sentences to a formal style", icon: FileText },
    { mode: ParaphraseMode.LESS_ACADEMIC, title: "Casual", desc: "making sentences sound more natural", icon: Mic },
];

const ScoreBar = ({ label, score, colorClass }: { label: string, score: number, colorClass: string }) => (
    <div className="flex flex-col gap-1 w-full">
        <div className="flex justify-between items-end">
            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">{label}</span>
            <span className={`text-xs font-black ${colorClass}`}>{score}</span>
        </div>
        <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-1000 ${colorClass.replace('text-', 'bg-')}`} style={{ width: `${score}%` }} />
        </div>
    </div>
);

export interface ParaphrasePracticeUIProps {
    step: Step;
    setStep: (step: Step) => void;
    user: User;
    error: { message: string, isNetwork?: boolean } | null;
    setError: (error: { message: string, isNetwork?: boolean } | null) => void;
    isGenerating: boolean;
    generationStatus: string;
    elapsedSeconds: number;
    originalSentence: string;
    handleOriginalSentenceChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleGetTask: () => void;
    setAiModalState: React.Dispatch<React.SetStateAction<{ isOpen: boolean, type: AiActionType, initialData?: any }>>;
    showHints: boolean;
    setShowHints: (show: boolean) => void;
    hints: string[];
    currentHintIndex: number;
    setCurrentHintIndex: (index: number) => void;
    userDraft: string;
    setUserDraft: (draft: string) => void;
    isEvaluating: boolean;
    evaluationMode: ParaphraseMode;
    isModeDropdownOpen: boolean;
    setIsModeDropdownOpen: (open: boolean) => void;
    modeDropdownRef: React.RefObject<HTMLDivElement>;
    handleEvaluationModeChange: (mode: ParaphraseMode) => void;
    handleEvaluate: () => void;
    evaluation: { score: number; meaningScore: number; lexicalScore: number; grammarScore: number; feedback: string; modelAnswer: string } | null;
    handleRetry: () => void;
    handleNewTask: () => void;
    aiModalState: { isOpen: boolean, type: AiActionType, initialData?: any };
    handleGeneratePrompt: (inputs: any) => string;
    handleManualJsonReceived: (data: any) => void;
    aiEnabled: boolean;
}

export const ParaphrasePracticeUI: React.FC<ParaphrasePracticeUIProps> = (props) => {
    const {
        step, setStep, error, setError, isGenerating, generationStatus, elapsedSeconds,
        originalSentence, handleOriginalSentenceChange, handleGetTask, setAiModalState,
        showHints, setShowHints, hints, currentHintIndex, setCurrentHintIndex,
        userDraft, setUserDraft, isEvaluating, evaluationMode, isModeDropdownOpen,
        setIsModeDropdownOpen, modeDropdownRef, handleEvaluationModeChange, handleEvaluate,
        evaluation, handleRetry, handleNewTask, aiModalState, handleGeneratePrompt,
        handleManualJsonReceived, aiEnabled
    } = props;

    const currentEvaluationModeInfo = paraphraseModes.find(m => m.mode === evaluationMode)!;

    const renderSetup = () => (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="relative group px-1">
          <div className="flex justify-between items-end mb-3">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Source Material</label>
              <div className="flex gap-2">
                  {aiEnabled && (
                    <button onClick={handleGetTask} disabled={isGenerating} className="flex items-center space-x-1.5 px-4 py-2 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-all text-[10px] font-black uppercase tracking-wider disabled:opacity-50 active:scale-95">
                        {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="fill-amber-700" />}
                        <span>Quick Challenge</span>
                    </button>
                  )}
                  <button onClick={() => setAiModalState({ isOpen: true, type: 'GENERATE_PARAPHRASE' })} className="flex items-center space-x-1.5 px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition-all text-[10px] font-black uppercase tracking-wider active:scale-95 shadow-sm">
                      <SlidersHorizontal size={12} />
                      <span>Custom Scenario</span>
                  </button>
              </div>
          </div>
          <textarea value={originalSentence} onChange={handleOriginalSentenceChange} placeholder="Type a sentence you want to paraphrase..." className="w-full h-32 p-6 bg-white border border-neutral-200 rounded-[2rem] placeholder:text-neutral-300 focus:ring-4 focus:ring-neutral-100 focus:border-neutral-300 focus:outline-none resize-none font-medium text-neutral-900 leading-relaxed text-lg transition-all shadow-sm" />
          {isGenerating && (
            <div className="absolute inset-0 top-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 rounded-[2rem] animate-in fade-in duration-300 z-10">
                <div className="relative"><Loader2 className="animate-spin text-neutral-900" size={32} /><div className="absolute inset-0 flex items-center justify-center"><span className="text-[8px] font-black">{elapsedSeconds}s</span></div></div>
                <p className="text-[10px] font-black text-neutral-900 uppercase tracking-[0.2em]">{generationStatus}</p>
            </div>
          )}
        </div>
        {originalSentence.trim() && !isGenerating && (
          <div className="flex justify-center animate-in slide-in-from-bottom-2 duration-300">
            <button onClick={() => setStep('PRACTICE')} className="group relative px-10 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-3 hover:bg-neutral-800 transition-all shadow-xl active:scale-95 uppercase tracking-widest overflow-hidden">
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span>Start Practice</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>
    );
  
    const renderPractice = () => (
      <div className="max-w-2xl mx-auto relative pt-2">
        <div className="flex flex-col items-end mb-2">
           <div className="flex justify-end w-full mb-2">
               {hints.length > 0 && (<button onClick={() => setShowHints(!showHints)} className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-amber-100 transition-colors"><Lightbulb size={12} className={showHints ? 'fill-amber-500' : ''} /><span>{showHints ? 'Hide Hints' : 'Reveal Hints'}</span></button>)}
           </div>
           {showHints && hints.length > 0 && (
              <div className="w-full mb-2 bg-amber-50/50 p-3 rounded-xl border border-amber-100/50 animate-in slide-in-from-top-2 flex flex-col gap-2">
                  <div className="flex justify-between items-start gap-3">
                      <div className="flex gap-2 items-start"><span className="text-[9px] font-black text-amber-400 bg-white w-5 h-5 flex items-center justify-center rounded-full shrink-0 shadow-sm mt-0.5">{currentHintIndex + 1}</span><span className="text-xs font-medium text-amber-900 leading-tight pt-0.5">{hints[currentHintIndex]}</span></div>
                      {hints.length > 1 && (<div className="flex items-center space-x-1 shrink-0"><button onClick={() => setCurrentHintIndex((currentHintIndex - 1 + hints.length) % hints.length)} className="p-1.5 bg-white rounded-lg text-amber-400 hover:text-amber-600 shadow-sm transition-colors hover:bg-amber-50"><ChevronLeft size={12} /></button><button onClick={() => setCurrentHintIndex((currentHintIndex + 1) % hints.length)} className="p-1.5 bg-white rounded-lg text-amber-400 hover:text-amber-600 shadow-sm transition-colors hover:bg-amber-50"><ChevronRight size={12} /></button></div>)}
                  </div>
              </div>
           )}
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
          <div className="bg-neutral-50 px-5 py-4 rounded-2xl border border-neutral-100/80"><span className="flex items-center text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1"><FileText size={10} className="mr-1" /> Original</span><p className="text-base font-medium text-neutral-800 leading-relaxed">{originalSentence}</p></div>
          <div className="space-y-1"><textarea value={userDraft} onChange={(e) => setUserDraft(e.target.value)} disabled={isEvaluating} placeholder="Type your paraphrase here..." className="w-full h-28 p-4 bg-white border border-neutral-200 rounded-2xl placeholder:text-neutral-300 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none font-medium text-neutral-800 leading-relaxed transition-all shadow-inner text-sm"/></div>
          <div className="relative" ref={modeDropdownRef}>
            <button onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)} className="w-full flex items-center justify-between text-left px-4 py-3 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors shadow-sm group"><div className="flex items-center space-x-2"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest group-hover:text-neutral-600 transition-colors">Tone Evaluation:</span><div className="flex items-center space-x-2 text-neutral-900"><currentEvaluationModeInfo.icon size={14} className="text-neutral-500"/><span className="text-xs font-bold">{currentEvaluationModeInfo.title}</span></div></div><ChevronDown size={14} className={`text-neutral-400 transition-transform ${isModeDropdownOpen ? 'rotate-180' : ''}`} /></button>
            {isModeDropdownOpen && (<div className="absolute bottom-full mb-2 w-full bg-white rounded-xl shadow-xl border border-neutral-100 z-20 p-1 animate-in fade-in zoom-in-95">{paraphraseModes.map(item => { const Icon = item.icon; return (<button key={item.mode} onClick={() => handleEvaluationModeChange(item.mode)} className={`w-full text-left flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${evaluationMode === item.mode ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}><Icon size={14} className={`shrink-0 ${evaluationMode === item.mode ? 'text-white' : 'text-neutral-400'}`} /><div className="flex flex-col"><span className="text-xs font-bold">{item.title}</span></div></button>); })}</div>)}
          </div>
          <div className="flex gap-2 pt-1">
              {aiEnabled && (
                <button onClick={handleEvaluate} disabled={!userDraft.trim() || isEvaluating} className="flex-[2] py-3.5 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">{isEvaluating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="fill-yellow-400 text-yellow-400" />}<span>{isEvaluating ? 'Judging...' : 'Quick Evaluate'}</span></button>
              )}
              <button onClick={() => setAiModalState({ isOpen: true, type: 'EVALUATE_PARAPHRASE', initialData: { original: originalSentence, draft: userDraft, mode: evaluationMode } })} disabled={!userDraft.trim()} className="flex-1 py-3.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center justify-center space-x-2 hover:bg-neutral-50 transition-all active:scale-98 uppercase tracking-widest shadow-sm disabled:opacity-50"><Bot size={14} /><span>Manual AI Evaluate</span></button>
          </div>
        </div>
      </div>
    );
  
    const renderResult = () => (
      <div className="max-w-3xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white px-6 py-6 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col md:flex-row items-stretch justify-between gap-6">
          <div className="flex flex-col justify-center min-w-[140px]"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Overall Score</span><div className="flex items-baseline gap-2"><span className={`text-5xl font-black leading-none ${evaluation!.score >= 80 ? 'text-green-600' : evaluation!.score >= 60 ? 'text-orange-600' : 'text-rose-600'}`}>{evaluation!.score}</span><span className="text-sm font-bold text-neutral-400">/ 100</span></div><span className="text-[10px] font-bold text-neutral-500 mt-2 bg-neutral-100 px-2 py-1 rounded-lg w-fit">Est. Score {(evaluation!.score / 10).toFixed(1)}</span></div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 border-l border-neutral-100 pl-0 md:pl-6"><ScoreBar label="Meaning" score={evaluation!.meaningScore} colorClass="text-blue-500" /><ScoreBar label="Lexical" score={evaluation!.lexicalScore} colorClass="text-purple-500" /><ScoreBar label="Grammar" score={evaluation!.grammarScore} colorClass="text-pink-500" /></div>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-neutral-200 shadow-sm space-y-5">
          <div className="space-y-2"><span className="flex items-center text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><AlertCircle size={12} className="mr-1" /> Examiner's Analysis</span><div className="text-neutral-800 text-sm leading-relaxed font-medium bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" dangerouslySetInnerHTML={{ __html: evaluation!.feedback }} /></div>
          <div className="pt-4 border-t border-neutral-100 space-y-3"><span className="flex items-center text-[10px] font-black text-green-600 uppercase tracking-widest px-1"><CheckCircle2 size={12} className="mr-1" /> Examiner's Improvement</span><div className="bg-green-50/30 border border-green-100 rounded-2xl p-4 space-y-4"><div className="space-y-1"><span className="text-[9px] font-black text-neutral-400 uppercase tracking-wider block mb-1">Original</span><p className="text-sm font-medium text-neutral-500 leading-relaxed">{originalSentence}</p></div><div className="space-y-1"><span className="text-[9px] font-black text-green-600 uppercase tracking-wider block mb-1">Alternative</span><p className="text-sm font-medium text-neutral-900 leading-relaxed">"{evaluation!.modelAnswer}"</p></div></div></div>
        </div>
        <div className="flex justify-center pt-2 pb-6"><button onClick={handleRetry} className="flex items-center space-x-2 px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black text-xs hover:bg-neutral-50 hover:border-neutral-300 transition-all active:scale-95 uppercase tracking-widest shadow-sm"><RefreshCw size={14} /><span>Retry Paraphrase</span></button></div>
      </div>
    );

    return (
        <div className="space-y-12 pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1"><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Paraphrase Lab</h2><p className="text-neutral-500 font-medium text-sm">Master the art of rewording for writing & speaking.</p></div>
                <button onClick={handleNewTask} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest shadow-sm"><Plus size={16} /><span>New Task</span></button>
            </header>
            {error && (<div className="max-w-2xl mx-auto p-5 bg-red-50 border border-red-100 rounded-3xl flex items-center justify-between text-red-700 animate-in slide-in-from-top-2"><div className="flex items-center space-x-3"><AlertTriangle size={20} /><span className="text-sm font-bold">{error.message}</span></div><button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full transition-colors"><XCircle size={18}/></button></div>)}
            <div className="min-h-[500px]">{step === 'SETUP' && renderSetup()}{step === 'PRACTICE' && renderPractice()}{step === 'RESULT' && renderResult()}</div>
            {aiModalState.isOpen && (<UniversalAiModal isOpen={aiModalState.isOpen} onClose={() => setAiModalState(prev => ({ ...prev, isOpen: false }))} type={aiModalState.type} title={aiModalState.type === 'GENERATE_PARAPHRASE' ? 'Generate Task' : 'Evaluate Paraphrase'} description={aiModalState.type === 'GENERATE_PARAPHRASE' ? 'Define context and tone for your practice.' : 'Review your draft before evaluation.'} initialData={aiModalState.initialData} onGeneratePrompt={handleGeneratePrompt} onJsonReceived={handleManualJsonReceived} actionLabel="Process"/>)}
        </div>
    );
};