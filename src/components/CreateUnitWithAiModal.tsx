
import React, { useState, useRef, useEffect } from 'react';
import { X, Clipboard, Check, AlertTriangle, Send, Loader2, Sparkles, Eye, ArrowLeft, ClipboardList, PenTool } from 'lucide-react';
import { Unit, VocabularyItem, User } from '../app/types';
import { findWordByText, saveUnit, bulkSaveWords } from '../app/db';
import { createNewWord } from '../utils/srs';
import { generateUnitData } from '../services/geminiService';

interface Props {
  user: User;
  onUnitCreated: () => void;
  onClose: () => void;
}

const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

const CreateUnitWithAiModal: React.FC<Props> = ({ user, onUnitCreated, onClose }) => {
  const [request, setRequest] = useState('');
  const [jsonResponse, setJsonResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [modalStep, setModalStep] = useState<'input' | 'preview'>('input');
  const [previewData, setPreviewData] = useState<{name: string, description: string, words: string[], essay: string} | null>(null);
  const [editableWords, setEditableWords] = useState('');
  
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startTimer = () => {
    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleDirectGenerate = async () => {
    if (!request.trim()) return;
    setIsGenerating(true);
    setError(null);
    startTimer();
    try {
        const data = await generateUnitData(request, user);
        if (data) {
            setJsonResponse(JSON.stringify(data, null, 2));
            setModalStep('preview');
            setPreviewData(data);
            setEditableWords(data.words.join('; '));
        } else {
            setError("Failed to generate unit data. Please try the manual prompt fallback.");
        }
    } catch (e: any) {
        setError(e.message || "An error occurred during generation.");
    } finally {
        setIsGenerating(false);
        stopTimer();
    }
  };

  const handleCopy = () => {
    const finalPrompt = `You are an IELTS expert creating a vocabulary lesson unit. All generated content (name, description, words, essay) must be in English.

USER PROFILE CONTEXT:
- Role: ${user.role || 'IELTS Learner'}
- Current Level: ${user.currentLevel || 'Intermediate'}
- Target: ${user.target || 'Improve vocabulary'}

USER REQUEST FOR THIS UNIT:
"${request}"

Based on the user's request, generate a complete lesson unit in a strict JSON format.

{
  "name": "A concise name in English.",
  "description": "Short focus description in English.",
  "words": ["List of essential words. Use format 'essay_word:base_word' ONLY if the form in essay differs (e.g. 'cities:city', 'running:run'). If identical, use just 'word' (DO NOT use 'word:word')."],
  "essay": "A 250-300 word essay in English naturally using the words. Plain text, single \\n for paragraphs."
}`;

    navigator.clipboard.writeText(finalPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = async () => {
    setError(null);
    if (!jsonResponse.trim()) { setError('Response JSON cannot be empty.'); return; }
    setIsProcessing(true);
    try {
        let cleanJson = jsonResponse.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.substring(7);
        if (cleanJson.endsWith('```')) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
        const parsed = JSON.parse(cleanJson);
        if (!parsed.name || !Array.isArray(parsed.words) || typeof parsed.essay !== 'string') {
            throw new Error('Invalid JSON structure. Must contain "name", "words" (array), and "essay" (string).');
        }
        setPreviewData(parsed);
        setEditableWords(parsed.words.join('; '));
        setModalStep('preview');
    } catch (e: any) { setError(e.message || 'Failed to parse JSON.'); } 
    finally { setIsProcessing(false); }
  };

  const handleCreate = async () => {
    setError(null);
    if (!previewData) return;
    setIsProcessing(true);
    try {
      const wordsToProcess: string[] = editableWords.split(/[;\n]+/).map(w => w.trim()).filter(Boolean);
      const newWordStrings: string[] = [];
      const allWordIds: string[] = [];
      
      for (const token of wordsToProcess) {
        const [essaySide, baseSide] = token.split(':');
        const baseWord = (baseSide ? baseSide.trim() : essaySide.trim()).toLowerCase();
        
        if (!baseWord) continue;
        
        const existingWord = await findWordByText(user.id, baseWord);
        if (existingWord) {
            allWordIds.push(existingWord.id);
        } else if (!newWordStrings.includes(baseWord)) {
            newWordStrings.push(baseWord);
        }
      }
      
      if (newWordStrings.length > 0) {
        const newWordsToSave = newWordStrings.map(word => ({ 
            ...createNewWord(word, '', `Imported from unit: ${previewData.name}`, '', '', ['ielts']), 
            userId: user.id 
        }));
        await bulkSaveWords(newWordsToSave); 
        allWordIds.push(...newWordsToSave.map(w => w.id));
      }
      
      const newUnit: Unit = { 
        id: generateId(), 
        userId: user.id, 
        name: previewData.name, 
        description: previewData.description || '', 
        wordIds: allWordIds,
        customVocabString: editableWords, // Persist the mapping
        essay: previewData.essay, 
        createdAt: Date.now(), 
        updatedAt: Date.now() 
      };
      
      await saveUnit(newUnit);
      onUnitCreated();
    } catch (e: any) { setError(e.message || 'An error occurred.'); } 
    finally { setIsProcessing(false); }
  };
  
  const highlightWordsInPreview = (essay: string, wordList: string): React.ReactNode => {
    if (!essay || !wordList) return essay;
    const tokens = wordList.split(/[;\n]+/).map(w => w.trim()).filter(Boolean);
    if (tokens.length === 0) return essay;
    
    // Extract essay words (left side of :)
    const essayWords = tokens.map(token => token.split(':')[0].trim()).filter(Boolean);
    
    const escapedWords = essayWords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
    const parts = essay.split(regex);
    return (
        <>{parts.map((part, index) => (index % 2) === 1 ? <strong key={index} className="bg-purple-100 text-purple-800 font-bold px-1 rounded-md">{part}</strong> : <React.Fragment key={index}>{part}</React.Fragment>)}</>
    );
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 shrink-0">
          <div><h3 className="font-black text-xl text-neutral-900 flex items-center"><Sparkles size={20} className="mr-2 text-purple-500" /> Create Unit with AI</h3><p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{modalStep === 'input' ? 'Define lesson theme' : 'Review generated content'}</p></div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>

        {modalStep === 'input' ? (
          <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
            <div className="p-8 space-y-6 flex-1">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Describe your Lesson Theme</label>
                    <textarea value={request} onChange={(e) => setRequest(e.target.value)} placeholder='e.g., "An advanced unit about sustainable urban planning and green architecture"' className="w-full h-28 p-5 bg-neutral-50 border border-neutral-200 rounded-[2rem] text-sm font-medium focus:ring-2 focus:ring-purple-400 focus:outline-none resize-none transition-all shadow-inner" />
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center"><Sparkles size={14} className="mr-2 text-purple-500"/> AI Toolkit</span>
                        {isGenerating && <span className="text-[9px] font-black text-purple-600 animate-pulse uppercase tracking-widest">Generating: {elapsedSeconds}s</span>}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={handleDirectGenerate} disabled={isGenerating || !request.trim()} className="flex flex-col items-center justify-center space-y-1.5 py-4 px-2 rounded-2xl border-2 transition-all font-black text-[9px] uppercase tracking-wider bg-purple-600 border-purple-600 text-white shadow-lg active:scale-95 disabled:opacity-50">
                            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            <span>Direct Create</span>
                        </button>
                        <button onClick={handleCopy} disabled={isGenerating || !request.trim()} className={`flex flex-col items-center justify-center space-y-1.5 py-4 px-2 rounded-2xl border-2 transition-all font-black text-[9px] uppercase tracking-wider bg-white ${copied ? 'border-green-500 text-green-600' : 'border-neutral-100 text-neutral-400 hover:border-neutral-200 hover:text-neutral-900'} active:scale-95`}>
                            {copied ? <Check size={16} /> : <ClipboardList size={16} />}
                            <span>Copy Prompt</span>
                        </button>
                        <button onClick={() => setIsManualPasteOpen(!isManualPasteOpen)} className={`flex flex-col items-center justify-center space-y-1.5 py-4 px-2 rounded-2xl border-2 transition-all font-black text-[9px] uppercase tracking-wider ${isManualPasteOpen ? 'bg-neutral-900 border-neutral-900 text-white shadow-lg' : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'} active:scale-95`}>
                            <PenTool size={16} />
                            <span>Manual Paste</span>
                        </button>
                    </div>

                    {isManualPasteOpen && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">JSON Response Payload</label>
                            <textarea value={jsonResponse} onChange={(e) => setJsonResponse(e.target.value)} placeholder='Paste JSON object { "name": "...", "words": [...], ... }' className="w-full h-40 p-4 bg-neutral-900 text-purple-300 border border-neutral-800 rounded-[2rem] text-xs font-mono focus:ring-2 focus:ring-purple-50 outline-none resize-none shadow-2xl" />
                        </div>
                    )}
                </div>
            </div>
            
            {error && <div className="px-8 pb-4 flex items-center space-x-2 text-red-600 text-xs font-bold animate-in fade-in"><AlertTriangle size={14} /><span>{error}</span></div>}
            
            <footer className="p-6 bg-neutral-50 border-t border-neutral-100 flex justify-end shrink-0">
                <button onClick={handlePreview} disabled={isProcessing || isGenerating || !jsonResponse.trim()} className="px-10 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-3 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
                    <Eye size={16} />
                    <span>Preview Unit</span>
                </button>
            </footer>
          </div>
        ) : previewData && (
          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
            <div className="space-y-1"><h4 className="font-black text-3xl text-neutral-900 tracking-tight">{previewData.name}</h4><p className="text-sm text-neutral-500 font-medium">{previewData.description}</p></div>
            <div className="space-y-3"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Reading Material</label><div className="p-6 bg-neutral-50 rounded-[2.5rem] border border-neutral-100 shadow-inner max-h-64 overflow-y-auto"><p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{highlightWordsInPreview(previewData.essay, editableWords)}</p></div></div>
            <div className="space-y-3"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Core Vocabulary (Edit if needed)</label><textarea value={editableWords} onChange={(e) => setEditableWords(e.target.value)} className="w-full h-24 p-5 bg-white border border-neutral-200 rounded-[2rem] text-sm font-medium focus:ring-2 focus:ring-purple-400 focus:outline-none resize-none shadow-sm" /><p className="text-[9px] text-neutral-400 px-1 font-bold italic">Separate words with a semicolon (;). Use 'essay:base' for mapping.</p></div>
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start space-x-3">
              <AlertTriangle size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-blue-700 font-bold leading-tight">New words will be added to your library as basic headwords. You can refine them later with AI from the Word Library.</p>
            </div>
            {error && <div className="flex items-center space-x-2 text-red-600 text-xs font-bold"><AlertTriangle size={14} /><span>{error}</span></div>}
            <footer className="pt-4 border-t border-neutral-100 flex flex-col sm:flex-row justify-between items-center gap-6">
                <button onClick={() => { setModalStep('input'); setPreviewData(null); setError(null); }} className="w-full sm:w-auto px-6 py-4 border border-neutral-200 text-neutral-600 rounded-2xl font-bold text-xs flex items-center justify-center space-x-2 hover:bg-neutral-50"><ArrowLeft size={16} /><span>Edit Request</span></button>
                <button onClick={handleCreate} disabled={isProcessing} className="w-full sm:w-auto px-10 py-4 bg-purple-600 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-3 shadow-xl hover:bg-purple-700 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">{isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}<span>Create Unit</span></button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateUnitWithAiModal;
