import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Clipboard, Check, Bot, Sparkles, Command, CornerDownLeft, AlertCircle, Loader2, MessageSquareDashed, FileText, Plus, Globe, User as UserIcon, Radio, BookOpen } from 'lucide-react';
import { copyToClipboard } from '../../utils/text';
import { User, ParaphraseMode } from '../../app/types';

export type AiActionType = 'REFINE_WORDS' | 'REFINE_UNIT' | 'GENERATE_PARAPHRASE' | 'EVALUATE_PARAPHRASE' | 'GENERATE_UNIT' | 'GENERATE_CHAPTER' | 'GENERATE_SEGMENT' | 'GENERATE_LESSON';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  type: AiActionType;
  title: string;
  description?: string;
  initialData?: any;
  user?: User;
  onGeneratePrompt: (inputs: any) => string;
  onJsonReceived: (data: any) => Promise<void> | void;
  actionLabel?: string;
  hidePrimaryInput?: boolean;
  closeOnSuccess?: boolean;
}

const UniversalAiModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  type, 
  title, 
  description, 
  initialData,
  onGeneratePrompt,
  onJsonReceived,
  actionLabel = "Apply",
  hidePrimaryInput = false,
  closeOnSuccess = false
}) => {
  // --- Dynamic Input States ---
  const [wordListInput, setWordListInput] = useState('');
  const [unitRequestInput, setUnitRequestInput] = useState('');
  const [chapterRequestInput, setChapterRequestInput] = useState('');
  const [segmentRequestInput, setSegmentRequestInput] = useState('');
  
  // Paraphrase Gen State
  const [paraTone, setParaTone] = useState<'CASUAL' | 'ACADEMIC'>('CASUAL');
  const [paraContext, setParaContext] = useState('');
  const [paraMode, setParaMode] = useState<ParaphraseMode>(ParaphraseMode.VARIETY);

  // Lesson Gen State
  const [lessonTopic, setLessonTopic] = useState('');
  const [lessonAudience, setLessonAudience] = useState('');
  const [lessonLang, setLessonLang] = useState<'English'|'Vietnamese'>('English');
  const [lessonTone, setLessonTone] = useState<'friendly_elementary'|'professional_professor'>('friendly_elementary');

  // --- Common States ---
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false); // New success state
  const [promptCopied, setPromptCopied] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  
  const jsonInputRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpen = useRef<boolean | undefined>(undefined);

  // Initialize inputs only when the modal opens
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
        // Reset all dynamic input states first
        setWordListInput('');
        setUnitRequestInput('');
        setChapterRequestInput('');
        setSegmentRequestInput('');
        setParaTone('CASUAL');
        setParaContext('');
        setParaMode(ParaphraseMode.VARIETY);
        
        // Then, set initial data for the current type
        if (type === 'REFINE_WORDS' && initialData?.words) {
            const formatted = initialData.words.replace(/\n/g, '; ');
            setWordListInput(formatted);
        } else if (type === 'GENERATE_LESSON') {
            setLessonTopic('');
            setLessonAudience(initialData?.targetAudience || '');
            setLessonLang(initialData?.language || 'English');
            setLessonTone(initialData?.tone || 'friendly_elementary');
        }

        // Reset common states
        setJsonInput('');
        setError(null);
        setPromptCopied(false);
        setIsProcessing(false);
        setIsSuccess(false);
    }
    
    prevIsOpen.current = isOpen;
  }, [isOpen, type, initialData]);

  // Calculate current prompt based on inputs
  useEffect(() => {
    let inputs: any = {};
    if (type === 'REFINE_WORDS') {
        inputs = { words: hidePrimaryInput ? initialData?.words : wordListInput };
    } else if (type === 'REFINE_UNIT') {
        inputs = { request: unitRequestInput };
    } else if (type === 'GENERATE_CHAPTER') {
        inputs = { request: chapterRequestInput };
    } else if (type === 'GENERATE_SEGMENT') {
        inputs = { request: segmentRequestInput };
    } else if (type === 'GENERATE_PARAPHRASE') {
        inputs = { tone: paraTone, context: paraContext, mode: paraMode };
    } else if (type === 'EVALUATE_PARAPHRASE') {
        inputs = initialData;
    } else if (type === 'GENERATE_LESSON') {
        inputs = { topic: lessonTopic, language: lessonLang, targetAudience: lessonAudience, tone: lessonTone };
    } else if (type === 'GENERATE_UNIT') {
        inputs = { request: unitRequestInput };
    }
    
    setCurrentPrompt(onGeneratePrompt(inputs));

  // The dependency array is intentionally missing `onGeneratePrompt` to prevent re-renders, as it's a prop function.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, wordListInput, unitRequestInput, chapterRequestInput, segmentRequestInput, paraTone, paraContext, paraMode, initialData, hidePrimaryInput, lessonTopic, lessonAudience, lessonLang, lessonTone]);


  if (!isOpen) return null;

  const handleCopyPrompt = async () => {
    await copyToClipboard(currentPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
    // Auto focus the input after copy for better UX
    setTimeout(() => jsonInputRef.current?.focus(), 100);
  };

  const handleProcess = async () => {
    if (isProcessing || !jsonInput.trim()) return;
    
    setError(null);
    setIsProcessing(true); // Immediately set visual loading state

    // Use setTimeout to yield the main thread, allowing the UI to render the spinner
    // BEFORE starting the heavy JSON parsing and state updates.
    setTimeout(async () => {
        try {
            let cleanJson = jsonInput.trim();
            // Remove markdown code blocks if present
            cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
            
            let parsedData;
            try {
                parsedData = JSON.parse(cleanJson);
            } catch (e) {
                try {
                    // Fix trailing commas
                    cleanJson = cleanJson.replace(/,\s*([}\]])/g, '$1');
                    parsedData = JSON.parse(cleanJson);
                } catch (e2) {
                    throw new Error("Cannot read AI response. Please ensure you copied the full code.");
                }
            }

            // For GENERATE_LESSON, we also want to pass back the preferences to update user profile
            if (type === 'GENERATE_LESSON') {
                 await onJsonReceived({
                     result: parsedData,
                     preferences: { language: lessonLang, targetAudience: lessonAudience, tone: lessonTone }
                 });
            } else {
                 await onJsonReceived(parsedData);
            }
            
            if (closeOnSuccess) {
                onClose();
            } else {
                // Show success state and stay open
                setIsProcessing(false);
                setIsSuccess(true);
            }
            
        } catch (e: any) {
            console.error(e);
            setIsProcessing(false);
            setError(e.message || "Failed to process.");
        }
    }, 50); // 50ms delay is enough for React to repaint
  };

  const handleClearForNext = () => {
    setIsSuccess(false);
    setJsonInput('');
    setError(null);
    setTimeout(() => jsonInputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleProcess();
    }
  };

  // --- RENDER CUSTOM INPUT SECTIONS ---

  const renderRefineWordsInput = () => (
      <div className="space-y-1">
          <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Vocabulary List</label>
          <textarea 
            value={wordListInput}
            onChange={(e) => setWordListInput(e.target.value)}
            disabled={isProcessing || isSuccess}
            className="w-full h-32 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none shadow-inner leading-relaxed transition-all focus:bg-white disabled:opacity-50"
            placeholder="word1; word2; word3..."
          />
          <p className="text-[9px] text-neutral-400 px-2 text-right">Edit freely. Separated by semicolon (;) or newline.</p>
      </div>
  );

  const renderChapterGenInput = () => (
    <div className="space-y-1">
        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Chapter Requirements</label>
        <textarea 
          value={chapterRequestInput}
          onChange={(e) => setChapterRequestInput(e.target.value)}
          disabled={isProcessing || isSuccess}
          placeholder='e.g., "A chapter about Travel and Tourism"'
          className="w-full h-32 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none shadow-inner transition-all focus:bg-white disabled:opacity-50"
        />
    </div>
);

const renderSegmentGenInput = () => (
    <div className="space-y-1">
        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Sub-topic Requirements</label>
        <textarea 
          value={segmentRequestInput}
          onChange={(e) => setSegmentRequestInput(e.target.value)}
          disabled={isProcessing || isSuccess}
          placeholder='e.g., "A sub-topic about AI Ethics"'
          className="w-full h-32 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none shadow-inner transition-all focus:bg-white disabled:opacity-50"
        />
    </div>
);

  const renderRefineUnitInput = () => (
      <div className="space-y-1">
          <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Your Instructions</label>
          <textarea 
            value={unitRequestInput}
            onChange={(e) => setUnitRequestInput(e.target.value)}
            disabled={isProcessing || isSuccess}
            placeholder='e.g., "Add 5 environment words and make the essay more formal."'
            className="w-full h-32 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none shadow-inner transition-all focus:bg-white disabled:opacity-50"
          />
      </div>
  );
  
  const renderGenerateUnitInput = () => (
    <div className="space-y-1">
        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Topic or Request</label>
        <input 
          value={unitRequestInput}
          onChange={(e) => setUnitRequestInput(e.target.value)}
          disabled={isProcessing || isSuccess}
          placeholder='e.g., "Trees", "Technology", "The Ocean"'
          className="w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
        />
    </div>
);

  const renderParaphraseGenInput = () => (
      <div className="space-y-2">
          <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Context & Tone</label>
          <div className={`flex flex-col gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-2xl transition-all focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-900 focus-within:border-transparent ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
             
             {/* Tone Selector */}
             <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider pl-1">Style</span>
                <div className="flex bg-white shadow-sm border border-neutral-100 p-1 rounded-xl shrink-0">
                    {(['CASUAL', 'ACADEMIC'] as const).map(t => (
                        <button key={t} onClick={() => setParaTone(t)} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${paraTone === t ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>{t}</button>
                    ))}
                </div>
             </div>

             {/* Text Area */}
             <textarea 
                rows={3}
                value={paraContext} 
                onChange={(e) => setParaContext(e.target.value)} 
                placeholder="Describe the context (e.g., 'Writing to a professor about a missed deadline')..." 
                className="w-full bg-transparent border-none text-xs font-bold placeholder:text-neutral-300 focus:ring-0 outline-none resize-none leading-relaxed" 
             />
          </div>
      </div>
  );

  const renderEvaluateParaphraseInput = () => (
      <div className="space-y-2">
          <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Your Draft (Read-Only)</label>
          <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-2xl max-h-32 overflow-y-auto">
              <p className="text-xs font-medium text-neutral-600 leading-relaxed whitespace-pre-wrap">
                  {initialData?.draft || "No draft content found."}
              </p>
          </div>
          <p className="text-[9px] text-neutral-400 px-2 italic text-right">This content will be evaluated by AI.</p>
      </div>
  );
  
  const renderLessonGenInput = () => (
      <div className="space-y-4">
          <div className="space-y-1">
             <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><BookOpen size={10}/> Topic</label>
             <input 
                value={lessonTopic} 
                onChange={(e) => setLessonTopic(e.target.value)} 
                placeholder="e.g. Present Perfect Tense, Space Travel" 
                className="w-full px-4 py-2 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
             />
          </div>
          <div className="space-y-1">
             <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><UserIcon size={10}/> Target Audience</label>
             <input 
                value={lessonAudience} 
                onChange={(e) => setLessonAudience(e.target.value)} 
                placeholder="e.g. IELTS Beginners, Primary Students" 
                className="w-full px-4 py-2 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
             />
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><Globe size={10}/> Language</label>
                <select 
                    value={lessonLang}
                    onChange={(e) => setLessonLang(e.target.value as any)}
                    className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none appearance-none cursor-pointer"
                >
                    <option value="English">English</option>
                    <option value="Vietnamese">Vietnamese</option>
                </select>
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><Radio size={10}/> Persona</label>
                 <select 
                    value={lessonTone}
                    onChange={(e) => setLessonTone(e.target.value as any)}
                    className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none appearance-none cursor-pointer"
                >
                    <option value="friendly_elementary">Friendly Teacher</option>
                    <option value="professional_professor">Professional Prof.</option>
                </select>
              </div>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-white/10 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-neutral-200 relative ring-4 ring-neutral-100">
        
        <button onClick={onClose} disabled={isProcessing} className="absolute top-4 right-4 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-50 rounded-full transition-all z-10 disabled:opacity-0">
            <X size={18}/>
        </button>

        <div className="p-6 md:p-8 flex flex-col gap-6">
            {/* Header Area */}
            <div className="space-y-1 pr-8">
                <div className="flex items-center gap-2 text-neutral-900">
                    <div className="p-1.5 bg-neutral-900 rounded-lg text-white"><Sparkles size={14} /></div>
                    <h3 className="font-black text-lg tracking-tight">{title}</h3>
                </div>
                <p className="text-xs font-medium text-neutral-400 pl-9">{description}</p>
            </div>

            {/* Dynamic Content Area - Minimized Padding */}
            <div className="py-2">
                {!hidePrimaryInput && type === 'REFINE_WORDS' && renderRefineWordsInput()}
                {type === 'REFINE_UNIT' && renderRefineUnitInput()}
                {type === 'GENERATE_CHAPTER' && renderChapterGenInput()}
                {type === 'GENERATE_SEGMENT' && renderSegmentGenInput()}
                {type === 'GENERATE_PARAPHRASE' && renderParaphraseGenInput()}
                {type === 'EVALUATE_PARAPHRASE' && renderEvaluateParaphraseInput()}
                {type === 'GENERATE_LESSON' && renderLessonGenInput()}
                {type === 'GENERATE_UNIT' && renderGenerateUnitInput()}
            </div>

            {/* Action Flow: 1. Copy -> 2. Paste */}
            <div className="space-y-3 pt-4 border-t border-neutral-100">
                {/* Step 1 Button */}
                <div className="space-y-2">
                    <button 
                        onClick={handleCopyPrompt}
                        disabled={isProcessing || isSuccess}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-between transition-all group ${promptCopied ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300 hover:bg-white'} disabled:opacity-50`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-md ${promptCopied ? 'bg-green-200 text-green-800' : 'bg-white text-neutral-400 shadow-sm'}`}>
                                {promptCopied ? <Check size={14} /> : <Command size={14} />}
                            </div>
                            <span className="uppercase tracking-widest text-[10px]">
                                {promptCopied ? 'Command Copied' : 'Step 1: Copy Command'}
                            </span>
                        </div>
                        {!promptCopied && <span className="text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to copy</span>}
                    </button>
                    {/* Subtle User Tip */}
                    {!isProcessing && !isSuccess && (
                        <div className="flex items-center justify-center gap-1.5 text-[9px] text-neutral-400 font-medium">
                            <MessageSquareDashed size={10} />
                            <span>Tip: Use a <strong>temporary chat</strong> to keep your AI history clean.</span>
                        </div>
                    )}
                </div>

                {/* Step 2 Input - Chat Style */}
                <div className={`relative flex items-start gap-2 p-1.5 rounded-2xl border-2 transition-all ${
                    error ? 'border-red-100 bg-red-50/30' : 
                    isSuccess ? 'border-green-200 bg-green-50' :
                    'border-neutral-100 bg-white focus-within:border-neutral-900 focus-within:shadow-md'
                }`}>
                    <div className="pl-3 py-3 shrink-0">
                        {isSuccess ? <Check size={18} className="text-green-600" /> : <Bot size={18} className={error ? "text-red-400" : "text-neutral-400"} />}
                    </div>
                    <textarea
                        ref={jsonInputRef}
                        value={isSuccess ? "Data applied! Click '+' to add more." : jsonInput}
                        onChange={(e) => { setJsonInput(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        disabled={isProcessing || isSuccess}
                        placeholder={isProcessing ? "Processing data..." : "Step 2: Paste AI response (or next part)..."}
                        className={`w-full bg-transparent border-none text-xs font-medium placeholder:text-neutral-400 focus:ring-0 outline-none resize-none min-h-[70px] p-2 ${isSuccess ? 'text-green-700 font-bold' : 'text-neutral-800'}`}
                        rows={3}
                        autoComplete="off"
                    />
                    {isSuccess ? (
                        <button 
                            onClick={handleClearForNext}
                            className={`p-2.5 rounded-xl transition-all shadow-md active:scale-90 flex items-center justify-center w-10 h-10 self-end bg-green-500 text-white hover:bg-green-600`}
                            title="Add more data"
                        >
                            <Plus size={16} />
                        </button>
                    ) : (
                        <button 
                            onClick={handleProcess}
                            disabled={!jsonInput.trim() || isProcessing}
                            className={`p-2.5 rounded-xl transition-all shadow-md active:scale-90 flex items-center justify-center w-10 h-10 self-end bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-20 disabled:scale-95`}
                            title="Process (Cmd/Ctrl + Enter)"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CornerDownLeft size={16} />}
                        </button>
                    )}
                </div>
                
                {error ? (
                    <div className="flex items-center gap-2 px-2 text-red-500 animate-in slide-in-from-top-1">
                        <AlertCircle size={12} />
                        <span className="text-[10px] font-bold">{error}</span>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-1.5 text-[9px] text-neutral-400 font-medium px-2">
                        <span>Press</span>
                        <kbd className="px-1.5 py-0.5 text-[8px] font-sans font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 rounded">Cmd/Ctrl</kbd>
                        +
                        <kbd className="px-1.5 py-0.5 text-[8px] font-sans font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 rounded">Enter</kbd>
                        <span>to process</span>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default UniversalAiModal;