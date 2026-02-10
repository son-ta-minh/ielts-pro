
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Clipboard, Check, Bot, Sparkles, Command, CornerDownLeft, AlertCircle, Loader2, MessageSquareDashed, FileText, Plus, Globe, User as UserIcon, Radio, BookOpen, Target, Headphones, BookText } from 'lucide-react';
import { copyToClipboard } from '../../utils/text';
import { User, ParaphraseMode } from '../../app/types';

export type AiActionType = 'REFINE_WORDS' | 'REFINE_UNIT' | 'GENERATE_PARAPHRASE' | 'EVALUATE_PARAPHRASE' | 'GENERATE_UNIT' | 'GENERATE_CHAPTER' | 'GENERATE_SEGMENT' | 'GENERATE_LESSON' | 'GENERATE_PLAN' | 'GENERATE_WORD_LESSON' | 'GENERATE_AUDIO_SCRIPT';

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

  // Lesson Common State (For Gen & Refine & Audio)
  const [lessonTopic, setLessonTopic] = useState('');
  const [lessonAudience, setLessonAudience] = useState('');
  const [lessonLang, setLessonLang] = useState<'English'|'Vietnamese'>('English');
  const [lessonTone, setLessonTone] = useState<'friendly_elementary'|'professional_professor'>('friendly_elementary');

  // Plan Gen State
  const [planRequest, setPlanRequest] = useState('');

  // --- Common States ---
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false); 
  const [promptCopied, setPromptCopied] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  
  const jsonInputRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpen = useRef<boolean | undefined>(undefined);

  const isLessonRelated = ['GENERATE_LESSON', 'GENERATE_WORD_LESSON', 'REFINE_UNIT', 'GENERATE_AUDIO_SCRIPT'].includes(type);

  // Initialize inputs only when the modal opens
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
        setWordListInput('');
        setUnitRequestInput('');
        setChapterRequestInput('');
        setSegmentRequestInput('');
        setParaTone('CASUAL');
        setParaContext('');
        setParaMode(ParaphraseMode.VARIETY);
        setPlanRequest('');
        
        if (type === 'REFINE_WORDS' && initialData?.words) {
            const formatted = initialData.words.replace(/\n/g, '; ');
            setWordListInput(formatted);
        } else if (isLessonRelated) {
            setLessonTopic('');
            setLessonAudience(initialData?.targetAudience || 'Adult');
            setLessonLang(initialData?.language || 'English');
            setLessonTone(initialData?.tone || 'friendly_elementary');
        }

        setJsonInput('');
        setError(null);
        setPromptCopied(false);
        setIsProcessing(false);
        setIsSuccess(false);
    }
    
    prevIsOpen.current = isOpen;
  }, [isOpen, type, initialData, isLessonRelated]);

  // Calculate current prompt based on inputs
  useEffect(() => {
    let inputs: any = {};
    if (type === 'REFINE_WORDS') {
        inputs = { words: hidePrimaryInput ? initialData?.words : wordListInput };
    } else if (type === 'REFINE_UNIT') {
        inputs = { request: unitRequestInput, language: lessonLang, targetAudience: lessonAudience, tone: lessonTone, format: 'reading' };
    } else if (type === 'GENERATE_AUDIO_SCRIPT') {
        inputs = { request: unitRequestInput, language: lessonLang, targetAudience: lessonAudience, tone: lessonTone, format: 'listening' };
    } else if (type === 'GENERATE_CHAPTER') {
        inputs = { request: chapterRequestInput };
    } else if (type === 'GENERATE_SEGMENT') {
        inputs = { request: segmentRequestInput };
    } else if (type === 'GENERATE_PARAPHRASE') {
        inputs = { tone: paraTone, context: paraContext, mode: paraMode };
    } else if (type === 'EVALUATE_PARAPHRASE') {
        inputs = initialData;
    } else if (type === 'GENERATE_LESSON' || type === 'GENERATE_WORD_LESSON') {
        inputs = { topic: lessonTopic, language: lessonLang, targetAudience: lessonAudience, tone: lessonTone, format: 'reading' };
    } else if (type === 'GENERATE_UNIT') {
        inputs = { request: unitRequestInput };
    } else if (type === 'GENERATE_PLAN') {
        inputs = { request: planRequest };
    }
    
    setCurrentPrompt(onGeneratePrompt(inputs));
  }, [type, wordListInput, unitRequestInput, chapterRequestInput, segmentRequestInput, paraTone, paraContext, paraMode, initialData, hidePrimaryInput, lessonTopic, lessonAudience, lessonLang, lessonTone, planRequest, onGeneratePrompt]);


  if (!isOpen) return null;

  const handleCopyPrompt = async () => {
    await copyToClipboard(currentPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
    setTimeout(() => jsonInputRef.current?.focus(), 100);
  };

  const handleProcess = async () => {
    if (isProcessing || !jsonInput.trim()) return;
    
    setError(null);
    setIsProcessing(true);

    setTimeout(async () => {
        try {
            let cleanJson = jsonInput.trim();
            cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
            
            let parsedData;
            try {
                parsedData = JSON.parse(cleanJson);
            } catch (e) {
                try {
                    cleanJson = cleanJson.replace(/,\s*([}\]])/g, '$1');
                    parsedData = JSON.parse(cleanJson);
                } catch (e2) {
                    throw new Error("Cannot read AI response. Please ensure you copied the full code.");
                }
            }

            if (isLessonRelated) {
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
                setIsProcessing(false);
                setIsSuccess(true);
            }
            
        } catch (e: any) {
            console.error(e);
            setIsProcessing(false);
            setError(e.message || "Failed to process.");
        }
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleProcess();
    }
  };

  // --- RENDER CUSTOM INPUT SECTIONS ---

  const renderLessonCommonPrefs = () => (
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
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-white/10 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-neutral-200 relative ring-4 ring-neutral-100">
        
        <button onClick={onClose} disabled={isProcessing} className="absolute top-4 right-4 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-50 rounded-full transition-all z-10 disabled:opacity-0">
            <X size={18}/>
        </button>

        <div className="p-6 md:p-8 flex flex-col gap-6">
            <div className="space-y-1 pr-8">
                <div className="flex items-center gap-2 text-neutral-900">
                    <div className="p-1.5 bg-neutral-900 rounded-lg text-white"><Sparkles size={14} /></div>
                    <h3 className="font-black text-lg tracking-tight">{title}</h3>
                </div>
                <p className="text-xs font-medium text-neutral-400 pl-9">{description}</p>
            </div>

            <div className="py-2 space-y-4">
                {/* 1. Primary Inputs based on Type */}
                {!hidePrimaryInput && type === 'REFINE_WORDS' && (
                   <div className="space-y-1">
                       <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Vocabulary List</label>
                       <textarea value={wordListInput} onChange={(e) => setWordListInput(e.target.value)} disabled={isProcessing || isSuccess} className="w-full h-32 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none shadow-inner leading-relaxed transition-all focus:bg-white disabled:opacity-50" placeholder="word1; word2; word3..." />
                       <p className="text-[9px] text-neutral-400 px-2 text-right">Edit freely. Separated by semicolon (;) or newline.</p>
                   </div>
                )}
                
                {['REFINE_UNIT', 'GENERATE_AUDIO_SCRIPT'].includes(type) && (
                   <div className="space-y-1">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Your Instructions</label>
                        <textarea 
                            value={unitRequestInput}
                            onChange={(e) => setUnitRequestInput(e.target.value)}
                            disabled={isProcessing || isSuccess}
                            placeholder={type === 'GENERATE_AUDIO_SCRIPT' ? 'e.g., "Summarize the key takeaways for a short podcast."' : 'e.g., "Add more advanced vocabulary and examples."'}
                            className="w-full h-24 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none transition-all focus:bg-white disabled:opacity-50"
                        />
                   </div>
                )}

                {(type === 'GENERATE_LESSON' || type === 'GENERATE_WORD_LESSON') && (
                    <>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><BookOpen size={10}/> Topic</label>
                            <input 
                                value={lessonTopic} 
                                onChange={(e) => setLessonTopic(e.target.value)} 
                                placeholder="e.g. Present Perfect Tense, Space Travel" 
                                className="w-full px-4 py-2 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                        {type !== 'GENERATE_WORD_LESSON' && (
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><UserIcon size={10}/> Target Audience</label>
                                <input 
                                    value={lessonAudience} 
                                    onChange={(e) => setLessonAudience(e.target.value)} 
                                    placeholder="e.g. IELTS Beginners, Primary Students" 
                                    className="w-full px-4 py-2 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                                />
                            </div>
                        )}
                    </>
                )}

                {/* 2. Common Prefs for all Lessons (Language/Persona) */}
                {isLessonRelated && renderLessonCommonPrefs()}

                {/* 3. Non-Lesson Types */}
                {type === 'GENERATE_UNIT' && (
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Topic or Request</label>
                        <input value={unitRequestInput} onChange={(e) => setUnitRequestInput(e.target.value)} disabled={isProcessing || isSuccess} placeholder='e.g., "Trees", "Technology", "The Ocean"' className="w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none" />
                    </div>
                )}
                {type === 'GENERATE_PLAN' && (
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">What is your goal?</label>
                        <textarea value={planRequest} onChange={(e) => setPlanRequest(e.target.value)} disabled={isProcessing || isSuccess} placeholder='e.g., "Prepare for IELTS in 30 days focusing on academic writing"' className="w-full h-24 p-4 bg-neutral-50/50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none transition-all focus:bg-white disabled:opacity-50" />
                    </div>
                )}
            </div>

            <div className="space-y-3 pt-4 border-t border-neutral-100">
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
                    </button>
                </div>

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
                        value={isSuccess ? "Data applied! Success." : jsonInput}
                        onChange={(e) => { setJsonInput(e.target.value); setError(null); }}
                        onKeyDown={handleKeyDown}
                        disabled={isProcessing || isSuccess}
                        placeholder={isProcessing ? "Processing data..." : "Step 2: Paste AI response..."}
                        className={`w-full bg-transparent border-none text-xs font-medium placeholder:text-neutral-400 focus:ring-0 outline-none resize-none min-h-[70px] p-2 ${isSuccess ? 'text-green-700 font-bold' : 'text-neutral-800'}`}
                        rows={3}
                        autoComplete="off"
                    />
                    <button 
                        onClick={handleProcess}
                        disabled={!jsonInput.trim() || isProcessing}
                        className={`p-2.5 rounded-xl transition-all shadow-md active:scale-90 flex items-center justify-center w-10 h-10 self-end bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-20 disabled:scale-95`}
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CornerDownLeft size={16} />}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default UniversalAiModal;
