import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, MessageCircle, AlertCircle, CheckCircle2, Lightbulb, FileText, Mic, RefreshCw, ChevronDown, Check, Clipboard, XCircle, AlertTriangle, Eye, Plus, ChevronRight, ChevronLeft } from 'lucide-react';
import { ParaphraseMode, User } from '../app/types';
import { generateParaphraseTaskWithHints, generateHintsForSentence, evaluateParaphrase, getParaphraseTaskPrompt, getEvaluationPrompt } from '../services/geminiService';

interface Props { user: User; }

type Step = 'SETUP' | 'PRACTICE' | 'RESULT';
type GenerationTone = 'CASUAL' | 'ACADEMIC';
type TaskInputMode = 'GENERATE' | 'MANUAL';

const generationTones = [
    { id: 'CASUAL', title: "Casual" },
    { id: 'ACADEMIC', title: "Academic" },
];

const paraphraseModes = [
    { mode: ParaphraseMode.VARIETY, title: "Same Tone", desc: "rewriting with a different structure", icon: RefreshCw },
    { mode: ParaphraseMode.MORE_ACADEMIC, title: "Academic", desc: "elevating sentences to a formal style", icon: FileText },
    { mode: ParaphraseMode.LESS_ACADEMIC, title: "Casual", desc: "making sentences sound more natural", icon: Mic },
];

const AI_TIMEOUT_MS = 40000;

const ParaphrasePractice: React.FC<Props> = ({ user }) => {
  const [step, setStep] = useState<Step>('SETUP');
  const [taskInputMode, setTaskInputMode] = useState<TaskInputMode>('GENERATE');
  const [generationTone, setGenerationTone] = useState<GenerationTone>('CASUAL');
  const [evaluationMode, setEvaluationMode] = useState<ParaphraseMode>(ParaphraseMode.VARIETY);
  
  const [originalSentence, setOriginalSentence] = useState('');
  const [userDraft, setUserDraft] = useState('');
  const [context, setContext] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<{message: string, isNetwork?: boolean} | null>(null);
  
  const [evaluation, setEvaluation] = useState<{ score: number; feedback: string; modelAnswer: string } | null>(null);
  
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  const [showHints, setShowHints] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [evalPromptCopied, setEvalPromptCopied] = useState(false);

  const isCancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  
  const [manualJsonInput, setManualJsonInput] = useState('');
  const [manualJsonError, setManualJsonError] = useState<string | null>(null);

  const [manualEvalInput, setManualEvalInput] = useState('');
  const [isManualEvalMode, setIsManualEvalMode] = useState(false);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setIsModeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        stopTimer();
    };
  }, []);

  const startTimer = () => {
      stopTimer();
      setElapsedSeconds(0);
      setGenerationStatus('Initializing API connection...');
      timerRef.current = window.setInterval(() => {
          setElapsedSeconds(prev => {
              const next = prev + 1;
              if (next === 3) setGenerationStatus('Waiting for Gemini response...');
              if (next === 12) setGenerationStatus('Analyzing sentence structure...');
              if (next === 22) setGenerationStatus('Request is taking longer than expected...');
              return next;
          });
      }, 1000);

      timeoutRef.current = window.setTimeout(() => {
          if (isGenerating) {
              handleCancelGeneration();
              setError({ message: "Request Timeout. Please check your network connection or API Key." });
          }
      }, AI_TIMEOUT_MS);
  };

  const stopTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timerRef.current = null;
      timeoutRef.current = null;
  };

  const handleNewTask = () => {
    setStep('SETUP');
    setOriginalSentence('');
    setUserDraft('');
    setHints([]);
    setCurrentHintIndex(0);
    setEvaluation(null);
    setError(null);
    setShowHints(false);
    setManualJsonInput('');
    setManualJsonError(null);
    setManualEvalInput('');
    setIsManualEvalMode(false);
    isCancelledRef.current = false;
    stopTimer();
  };
  
  const handleTaskModeChange = (newMode: TaskInputMode) => {
    setTaskInputMode(newMode);
  };

  const handleEvaluationModeChange = (newMode: ParaphraseMode) => {
    setEvaluationMode(newMode);
    setIsModeDropdownOpen(false);
  };

  const handleToneChange = (newTone: GenerationTone) => {
    if (generationTone !== newTone) {
        setGenerationTone(newTone);
    }
  };

  const handleCopyPrompt = () => {
    const prompt = getParaphraseTaskPrompt(generationTone, evaluationMode, user, context);
    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const handleCopyEvalPrompt = () => {
    if (!originalSentence || !userDraft) return;
    const prompt = getEvaluationPrompt(originalSentence, userDraft, evaluationMode);
    navigator.clipboard.writeText(prompt);
    setEvalPromptCopied(true);
    setTimeout(() => setEvalPromptCopied(false), 2000);
  };

  const handleCancelGeneration = () => {
    isCancelledRef.current = true;
    setIsGenerating(false);
    stopTimer();
  };

  const cleanSentenceField = (text: string): string => {
    if (!text) return '';
    return text.replace(/^(Sentence:|Task:|English:)\s*/i, '')
               .replace(/\s*(Hint|Hints|Gợi ý):.*$/is, '')
               .trim();
  };

  const handleGetTask = async () => {
    if (!navigator.onLine) {
        setError({ message: "You are currently offline. Please connect to the internet.", isNetwork: true });
        return;
    }

    setIsGenerating(true);
    isCancelledRef.current = false;
    setError(null);
    
    startTimer();

    try {
      const result = await generateParaphraseTaskWithHints(generationTone, evaluationMode, user, context);
      if (isCancelledRef.current) return;
      if (!result || !result.sentence) throw new Error("AI returned an empty response.");
      
      setOriginalSentence(cleanSentenceField(result.sentence));
      setHints(result.hints || []);
      setCurrentHintIndex(0);
    } catch (e: any) {
      if (isCancelledRef.current) return;
      console.error(e);
      setError({ message: "Connection to AI failed. Check your network or API Key settings." });
    } finally {
      if (!isCancelledRef.current) {
          setIsGenerating(false);
          stopTimer();
      }
    }
  };

  const handleOriginalSentenceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setOriginalSentence(e.target.value);
    setHints([]);
    setCurrentHintIndex(0);
    setShowHints(false);
    setEvaluation(null);
    setUserDraft('');
    setManualJsonInput('');
    setManualJsonError(null);
  };

  const parseManualJson = (jsonString: string) => {
    setManualJsonInput(jsonString);
    if (!jsonString.trim()) {
      return;
    }
    try {
      let cleanedJson = jsonString.trim();
      if (cleanedJson.startsWith('```json')) cleanedJson = cleanedJson.substring(7);
      if (cleanedJson.endsWith('```')) cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);
      
      const parsed = JSON.parse(cleanedJson);
      if (parsed.sentence && typeof parsed.sentence === 'string') {
        setOriginalSentence(cleanSentenceField(parsed.sentence));
        setHints(Array.isArray(parsed.hints) ? parsed.hints : []);
        setCurrentHintIndex(0);
        setManualJsonError(null);
      } else {
        setManualJsonError("JSON must contain a 'sentence' field.");
      }
    } catch (e: any) {
      setManualJsonError("Invalid JSON format.");
    }
  };

  const handleManualEvalParse = (jsonString: string) => {
    setManualEvalInput(jsonString);
    if (!jsonString.trim()) return;
    try {
        let cleanedJson = jsonString.trim();
        if (cleanedJson.startsWith('```json')) cleanedJson = cleanedJson.substring(7);
        if (cleanedJson.endsWith('```')) cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);
        const parsed = JSON.parse(cleanedJson);
        if (typeof parsed.score === 'number' && parsed.feedback) {
            setEvaluation(parsed);
            setIsManualEvalMode(false);
            setManualEvalInput('');
            setStep('RESULT');
        }
    } catch (e) {}
  };

  const handleEvaluate = async () => {
    if (!userDraft.trim() || !originalSentence) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const result = await evaluateParaphrase(originalSentence, userDraft, evaluationMode);
      setEvaluation(result);
      setStep('RESULT');
    } catch (e: any) {
      setError({ message: "An error occurred during evaluation." });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleRetry = () => {
    setEvaluation(null);
    setStep('PRACTICE');
  };

  const currentEvaluationModeInfo = paraphraseModes.find(m => m.mode === evaluationMode)!;

  const renderSetup = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Compact Control Card */}
      <div className="bg-white p-5 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]"><Sparkles size={14} className="mr-2 text-yellow-500" /> AI Generate</span>
          <div className="flex bg-neutral-100 p-1 rounded-xl">
              <button onClick={() => handleTaskModeChange('GENERATE')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${taskInputMode === 'GENERATE' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400'}`}>Auto</button>
              <button onClick={() => handleTaskModeChange('MANUAL')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${taskInputMode === 'MANUAL' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400'}`}>Paste</button>
          </div>
        </div>

        {taskInputMode === 'GENERATE' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-neutral-50 p-1 rounded-2xl border border-neutral-200/70">
                <div className="flex bg-neutral-200/50 p-1 rounded-xl shrink-0">
                    {generationTones.map(t => (
                        <button key={t.id} onClick={() => handleToneChange(t.id as GenerationTone)} className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${generationTone === t.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>{t.title}</button>
                    ))}
                </div>
                <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Topic context (optional)..." className="flex-grow px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold placeholder:text-neutral-300 focus:ring-2 focus:ring-neutral-900 focus:outline-none transition-all" />
            </div>
            
            <div className="flex gap-2">
                <button 
                  onClick={handleGetTask} 
                  disabled={isGenerating} 
                  className="flex-[2] py-3 bg-amber-500 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-2 hover:bg-amber-600 shadow-lg shadow-amber-500/10 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} className="text-yellow-200" />}
                  <span className="whitespace-nowrap uppercase tracking-widest">{isGenerating ? 'Generating...' : 'AI Generate'}</span>
                </button>

                <button 
                  onClick={handleCopyPrompt} 
                  title="Copy prompt for Gemini Web" 
                  className="flex-1 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black text-xs flex items-center justify-center space-x-2 hover:bg-neutral-50 transition-all active:scale-[0.98]"
                >
                  {promptCopied ? <Check size={14} className="text-green-600"/> : <Clipboard size={14} />}
                  <span className="whitespace-nowrap uppercase tracking-widest">{promptCopied ? 'Copied' : 'Prompt'}</span>
                </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 animate-in fade-in duration-300">
            <input type="text" value={manualJsonInput} onChange={(e) => parseManualJson(e.target.value)} placeholder='Manual AI Response JSON...' className="w-full px-5 py-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs font-mono placeholder:text-neutral-400 focus:ring-2 focus:ring-purple-400 focus:outline-none shadow-inner" />
            {manualJsonError && <div className="flex items-center space-x-2 text-red-600 text-[10px] font-bold px-1"><AlertCircle size={12} /><span>{manualJsonError}</span></div>}
          </div>
        )}
      </div>

      {/* Output Section */}
      <div className="space-y-4">
        <div className="relative group px-1">
          <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-2">Original Sentence</label>
          <textarea 
            value={originalSentence} 
            onChange={handleOriginalSentenceChange} 
            placeholder="Type or generate an original sentence..." 
            className="w-full h-24 p-4 bg-white border border-neutral-200 rounded-2xl placeholder:text-neutral-200 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none font-medium text-neutral-900 leading-relaxed text-base transition-all"
          />
          {isGenerating && (
            <div className="absolute inset-0 top-6 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center space-y-2 rounded-2xl animate-in fade-in duration-300">
                <div className="relative">
                    <Loader2 className="animate-spin text-neutral-900" size={24} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[6px] font-black">{elapsedSeconds}s</span>
                    </div>
                </div>
                <p className="text-[8px] font-black text-neutral-900 uppercase tracking-[0.2em]">{generationStatus}</p>
            </div>
          )}
        </div>

        {/* Centered Compact Practice Button */}
        {originalSentence.trim() && !isGenerating && (
          <div className="flex justify-center animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setStep('PRACTICE')}
              className="px-8 py-3 bg-neutral-900 text-white rounded-2xl font-black text-[10px] flex items-center justify-center space-x-2 hover:bg-neutral-800 transition-all shadow-lg active:scale-95 uppercase tracking-[0.2em]"
            >
              <ChevronRight size={14} />
              <span>Practice</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderPractice = () => (
    <div className="max-w-2xl mx-auto relative pt-2">
      {/* 1. Hints Section Toggle - Positioned at top-right for quick access */}
      <div className="flex flex-col items-end mb-2">
         <div className="flex justify-end w-full mb-2">
             {hints.length > 0 && (
                <button onClick={() => setShowHints(!showHints)} className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-amber-100 transition-colors">
                    <Lightbulb size={12} className={showHints ? 'fill-amber-500' : ''} />
                    <span>{showHints ? 'Hide Hints' : 'Reveal Hints'}</span>
                </button>
             )}
         </div>

         {showHints && hints.length > 0 && (
            <div className="w-full mb-2 bg-amber-50/50 p-3 rounded-xl border border-amber-100/50 animate-in slide-in-from-top-2 flex flex-col gap-2">
                <div className="flex justify-between items-start gap-3">
                    <div className="flex gap-2 items-start">
                        <span className="text-[9px] font-black text-amber-400 bg-white w-5 h-5 flex items-center justify-center rounded-full shrink-0 shadow-sm mt-0.5">
                            {currentHintIndex + 1}
                        </span>
                        <span className="text-xs font-medium text-amber-900 leading-tight pt-0.5">
                            {hints[currentHintIndex]}
                        </span>
                    </div>
                    {hints.length > 1 && (
                        <div className="flex items-center space-x-1 shrink-0">
                            <button onClick={() => setCurrentHintIndex(p => (p - 1 + hints.length) % hints.length)} className="p-1.5 bg-white rounded-lg text-amber-400 hover:text-amber-600 shadow-sm transition-colors hover:bg-amber-50"><ChevronLeft size={12} /></button>
                            <button onClick={() => setCurrentHintIndex(p => (p + 1) % hints.length)} className="p-1.5 bg-white rounded-lg text-amber-400 hover:text-amber-600 shadow-sm transition-colors hover:bg-amber-50"><ChevronRight size={12} /></button>
                        </div>
                    )}
                </div>
            </div>
         )}
      </div>

      {/* 2. Unified Workspace Card */}
      <div className="bg-white p-5 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
        
        {/* Original Sentence Reference Block */}
        <div className="bg-neutral-50 px-5 py-4 rounded-2xl border border-neutral-100/80">
            <span className="flex items-center text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1"><FileText size={10} className="mr-1" /> Original</span>
            <p className="text-base font-medium text-neutral-800 leading-relaxed">{originalSentence}</p>
        </div>

        {/* User Input Area */}
        <div className="space-y-1">
            <textarea value={userDraft} onChange={(e) => setUserDraft(e.target.value)} disabled={isEvaluating} placeholder="Type your paraphrase here..." className="w-full h-28 p-4 bg-white border border-neutral-200 rounded-2xl placeholder:text-neutral-300 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none font-medium text-neutral-800 leading-relaxed transition-all shadow-inner text-sm"/>
        </div>

        {/* Evaluation Mode Selector (Moved Below) */}
        <div className="relative" ref={modeDropdownRef}>
          <button onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)} className="w-full flex items-center justify-between text-left px-4 py-3 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors shadow-sm group">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest group-hover:text-neutral-600 transition-colors">Tone Evaluation:</span>
              <div className="flex items-center space-x-2 text-neutral-900">
                  <currentEvaluationModeInfo.icon size={14} className="text-neutral-500"/>
                  <span className="text-xs font-bold">{currentEvaluationModeInfo.title}</span>
              </div>
            </div>
            <ChevronDown size={14} className={`text-neutral-400 transition-transform ${isModeDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {isModeDropdownOpen && (
            <div className="absolute bottom-full mb-2 w-full bg-white rounded-xl shadow-xl border border-neutral-100 z-20 p-1 animate-in fade-in zoom-in-95">
              {paraphraseModes.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.mode} onClick={() => handleEvaluationModeChange(item.mode)} className={`w-full text-left flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${evaluationMode === item.mode ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}>
                    <Icon size={14} className={`shrink-0 ${evaluationMode === item.mode ? 'text-white' : 'text-neutral-400'}`} />
                    <div className="flex flex-col"><span className="text-xs font-bold">{item.title}</span></div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Manual Paste Logic (Conditional) */}
        {isManualEvalMode && (
            <div className="animate-in fade-in duration-300">
                <input type="text" value={manualEvalInput} onChange={(e) => handleManualEvalParse(e.target.value)} placeholder='Paste Evaluation JSON Here...' className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-400 focus:outline-none shadow-inner" />
            </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
            <button onClick={handleEvaluate} disabled={!userDraft.trim() || isEvaluating} className="flex-[2] py-3.5 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
                {isEvaluating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{isEvaluating ? 'Checking' : 'Evaluate'}</span>
            </button>
            
            <button 
                onClick={handleCopyEvalPrompt} 
                disabled={!userDraft.trim()} 
                title="Copy prompt" 
                className="flex-1 py-3.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center justify-center space-x-2 hover:bg-neutral-50 transition-all active:scale-98 uppercase tracking-widest"
            >
                {evalPromptCopied ? <Check size={14} className="text-green-600"/> : <Clipboard size={14} />}
                <span>{evalPromptCopied ? 'Copied' : 'Prompt'}</span>
            </button>
            
            <button 
                onClick={() => setIsManualEvalMode(!isManualEvalMode)} 
                title="Manual Paste" 
                className={`flex-1 py-3.5 rounded-xl font-black text-xs flex items-center justify-center space-x-2 transition-all active:scale-98 uppercase tracking-widest ${isManualEvalMode ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-white border border-neutral-200 text-neutral-600'}`}
            >
                <Eye size={14} />
                <span>Paste</span>
            </button>
        </div>
      </div>
    </div>
  );

  const renderResult = () => (
    <div className="max-w-3xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 duration-500">
      {/* Compact Performance Row */}
      <div className="bg-white px-6 py-4 rounded-2xl border border-neutral-200 shadow-sm flex flex-row items-center justify-between">
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Performance Score</span>
            <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black leading-none ${evaluation!.score >= 80 ? 'text-green-600' : evaluation!.score >= 60 ? 'text-orange-600' : 'text-rose-600'}`}>{evaluation!.score}</span>
                <span className="text-xs font-bold text-neutral-500">/ 100</span>
            </div>
        </div>
        
        <div className="flex flex-col items-end min-w-[140px]">
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Estimated Band {(evaluation!.score / 10).toFixed(1)}</span>
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-[2000ms] ${evaluation!.score >= 80 ? 'bg-green-500' : evaluation!.score >= 60 ? 'bg-orange-500' : 'bg-rose-500'}`} style={{ width: `${evaluation!.score}%` }}/>
            </div>
        </div>
      </div>

      {/* Analysis & Suggestion Card */}
      <div className="bg-white p-5 rounded-[2rem] border border-neutral-200 shadow-sm space-y-5">
        {/* Analysis Section */}
        <div className="space-y-2">
            <span className="flex items-center text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><AlertCircle size={12} className="mr-1" /> Examiner's Analysis</span>
            <div 
              className="text-neutral-800 text-sm leading-relaxed font-medium bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" 
              dangerouslySetInnerHTML={{ __html: evaluation!.feedback }} 
            />
        </div>

        {/* Suggestion & Comparison Section */}
        <div className="pt-4 border-t border-neutral-100 space-y-3">
            <span className="flex items-center text-[10px] font-black text-green-600 uppercase tracking-widest px-1"><CheckCircle2 size={12} className="mr-1" /> Examiner's Improvement</span>
            
            <div className="bg-green-50/30 border border-green-100 rounded-2xl p-4 space-y-4">
                {/* Original Context */}
                <div className="space-y-1">
                    <span className="text-[9px] font-black text-neutral-400 uppercase tracking-wider block mb-1">Original</span>
                    <p className="text-sm font-medium text-neutral-500 leading-relaxed">{originalSentence}</p>
                </div>
                
                {/* Suggestion */}
                <div className="space-y-1">
                    <span className="text-[9px] font-black text-green-600 uppercase tracking-wider block mb-1">Alternative</span>
                    <p className="text-sm font-medium text-neutral-900 leading-relaxed">"{evaluation!.modelAnswer}"</p>
                </div>
            </div>
        </div>
      </div>

      <div className="flex justify-center pt-2 pb-6">
        <button 
          onClick={handleRetry} 
          className="flex items-center space-x-2 px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black text-xs hover:bg-neutral-50 hover:border-neutral-300 transition-all active:scale-95 uppercase tracking-widest shadow-sm"
        >
          <RefreshCw size={14} />
          <span>Retry Paraphrase</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-12 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Paraphrase Lab</h2>
          <p className="text-neutral-500 font-medium text-sm">Master the art of rewording for IELTS Writing & Speaking.</p>
        </div>
        <button onClick={handleNewTask} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest shadow-sm">
          <Plus size={16} />
          <span>New Task</span>
        </button>
      </header>

      {error && (
        <div className="max-w-2xl mx-auto p-5 bg-red-50 border border-red-100 rounded-3xl flex items-center justify-between text-red-700 animate-in slide-in-from-top-2">
          <div className="flex items-center space-x-3">
            <AlertTriangle size={20} />
            <span className="text-sm font-bold">{error.message}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-full transition-colors"><XCircle size={18}/></button>
        </div>
      )}

      <div className="min-h-[500px]">
        {step === 'SETUP' && renderSetup()}
        {step === 'PRACTICE' && renderPractice()}
        {step === 'RESULT' && renderResult()}
      </div>
    </div>
  );
};

export default ParaphrasePractice;