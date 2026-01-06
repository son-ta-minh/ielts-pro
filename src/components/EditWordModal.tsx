import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Sparkles, Loader2, Mic, Quote, Layers, Combine, MessageSquare, RotateCw, Network, Trash2, Plus, CheckCircle2, AlertCircle, Tag as TagIcon, StickyNote, Wand2, Edit3, Search, Archive, AtSign, Clipboard, Check, Eye, XCircle, GraduationCap } from 'lucide-react';
import { VocabularyItem, WordFamily, WordFamilyMember, PrepositionPattern, ReviewGrade } from '../app/types';
import { generateWordDetails } from '../services/geminiService';
import { cleanNoteIPA, createNewWord, updateSRS, resetProgress } from '../utils/srs';
import { findWordByText, saveWord } from '../app/db';

interface Props {
  word: VocabularyItem;
  onSave: (updatedWord: VocabularyItem) => void;
  onClose: () => void;
}

const parsePrepositionPatterns = (prepositionStr: string | null | undefined): PrepositionPattern[] | undefined => {
    if (!prepositionStr || typeof prepositionStr !== 'string' || prepositionStr.trim().toLowerCase() === 'null') {
        return undefined;
    }

    const multiWordPrepositions = [
        'out of', 'because of', 'according to', 'in front of', 'next to', 
        'due to', 'instead of', 'in spite of', 'on top of', 'as for', 
        'except for', 'apart from', 'along with', 'in addition to', 'in case of',
        'with regard to', 'as well as', 'in accordance with', 'on behalf of',
        'in relation to', 'in terms of', 'by means of', 'in charge of'
    ];

    const patterns = prepositionStr.split(',').map(p => p.trim()).filter(Boolean);
    if (patterns.length === 0) {
        return undefined;
    }

    const results: PrepositionPattern[] = patterns.map(pattern => {
        const sortedMultiWord = [...multiWordPrepositions].sort((a, b) => b.length - a.length);
        const foundMultiWord = sortedMultiWord.find(mwp => pattern.toLowerCase().startsWith(mwp + ' '));

        if (foundMultiWord) {
            const prep = foundMultiWord;
            const usage = pattern.substring(prep.length + 1).trim();
            return { prep, usage };
        }

        const firstSpaceIndex = pattern.indexOf(' ');
        if (firstSpaceIndex > 0) {
            const prep = pattern.substring(0, firstSpaceIndex);
            const usage = pattern.substring(firstSpaceIndex + 1).trim();
            return { prep, usage };
        }
        
        return { prep: pattern, usage: '' };
    });
    
    return results.length > 0 ? results : undefined;
};

const EditWordModal: React.FC<Props> = ({ word, onSave, onClose }) => {
  const [formData, setFormData] = useState({ 
    ...word, 
    tagsString: word.tags ? word.tags.join(', ') : '',
    prepositionsString: (word.prepositions || []).map(p => `${p.prep} ${p.usage}`.trim()).join(', '),
    isIdiom: word.isIdiom || false,
    isPhrasalVerb: word.isPhrasalVerb || false,
    isCollocation: word.isCollocation || false,
    isStandardPhrase: word.isStandardPhrase || false,
    isIrregular: word.isIrregular || false,
    v2v3: [word.v2, word.v3].filter(Boolean).join(', '),
    needsPronunciationFocus: word.needsPronunciationFocus || false,
    isPassive: word.isPassive || false,
    collocations: word.collocations || '',
    wordFamily: word.wordFamily || { nouns: [], verbs: [], adjs: [], advs: [] } as WordFamily,
    // Store current status locally in form state for easy selection
    studiedStatus: word.lastReview ? word.lastGrade : 'NEW'
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [addingVariant, setAddingVariant] = useState<string | null>(null);
  const [existingVariants, setExistingVariants] = useState<Set<string>>(new Set());

  const [isManualAiOpen, setIsManualAiOpen] = useState(false);
  const [manualJsonInput, setManualJsonInput] = useState('');
  const [manualJsonError, setManualJsonError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const isCancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const checkExisting = async () => {
      const family = formData.wordFamily;
      if (!family) return;
      const allMembers = [
        ...(family.nouns || []),
        ...(family.verbs || []),
        ...(family.adjs || []),
        ...(family.advs || [])
      ].map(m => m.word.toLowerCase().trim());
      
      const found = new Set<string>();
      for (const w of allMembers) {
        if (!w) continue;
        const exists = await findWordByText(word.userId, w);
        if (exists) found.add(w);
      }
      setExistingVariants(found);
    };
    checkExisting();
    return () => stopTimer();
  }, [formData.wordFamily, word.userId]);

  const startTimer = () => {
    stopTimer();
    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const applyRefinementData = (details: any) => {
    setFormData(prev => {
      // Append new examples instead of overwriting
      let finalExample = prev.example || '';
      if (details.example && !finalExample.toLowerCase().includes(details.example.toLowerCase())) {
        finalExample = finalExample.trim() ? `${finalExample}\n${details.example}` : details.example;
      }

      // Robust de-duplicated collocations enrichment
      let finalCollocations = prev.collocations || '';
      if (details.collocations) {
        const existingLines = finalCollocations.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
        const newLines = details.collocations.split('\n').map((l: string) => l.trim()).filter((l: string) => {
          const lower = l.toLowerCase();
          return lower && !existingLines.some(existing => existing.includes(lower) || lower.includes(existing));
        });
        
        if (newLines.length > 0) {
          finalCollocations = finalCollocations.trim() ? `${finalCollocations}\n${newLines.join('\n')}` : newLines.join('\n');
        }
      }

      return {
        ...prev,
        ipa: details.ipa || prev.ipa,
        meaningVi: details.meaningVi || prev.meaningVi,
        example: finalExample,
        collocations: finalCollocations,
        prepositionsString: (typeof details.preposition === 'string' && !details.isPhrasalVerb) ? details.preposition : (details.prepositionsString || prev.prepositionsString),
        isIdiom: details.isIdiom !== undefined ? !!details.isIdiom : prev.isIdiom,
        isPhrasalVerb: details.isPhrasalVerb !== undefined ? !!details.isPhrasalVerb : prev.isPhrasalVerb,
        isCollocation: details.isCollocation !== undefined ? !!details.isCollocation : prev.isCollocation,
        isStandardPhrase: details.isStandardPhrase !== undefined ? !!details.isStandardPhrase : prev.isStandardPhrase,
        isIrregular: details.isIrregular !== undefined ? !!details.isIrregular : prev.isIrregular,
        v2v3: details.isIrregular ? [details.v2, details.v3].filter(Boolean).join(', ') : prev.v2v3,
        needsPronunciationFocus: details.needsPronunciationFocus !== undefined ? !!details.needsPronunciationFocus : prev.needsPronunciationFocus,
        isPassive: details.isPassive !== undefined ? !!details.isPassive : prev.isPassive,
        note: details.ipa ? cleanNoteIPA(prev.note, details.ipa) : prev.note,
        wordFamily: details.wordFamily || prev.wordFamily,
        tagsString: details.tags ? Array.from(new Set([...prev.tagsString.split(',').map(t => t.trim()).filter(Boolean), ...details.tags])).join(', ') : prev.tagsString
      };
    });
  };

  const handleAISuggest = async () => {
    if (!formData.word) return;
    setIsGenerating(true);
    isCancelledRef.current = false;
    startTimer();
    try {
      const details = await generateWordDetails(formData.word);
      if (isCancelledRef.current) return;
      applyRefinementData(details);
    } catch (e: any) {
      console.error(e);
    } finally {
      if (!isCancelledRef.current) {
        setIsGenerating(false);
        stopTimer();
      }
    }
  };

  const handleCancelRefinement = () => {
    isCancelledRef.current = true;
    setIsGenerating(false);
    stopTimer();
  };

  const handleCopyPrompt = () => {
    const prompt = `Analyze this list of IELTS vocabulary items: ["${formData.word}"].
    
Return a JSON array where each object corresponds to an item from the list. Each object in the array MUST strictly adhere to the following JSON schema:

\`\`\`json
{
  "word": "string",
  "ipa": "string",
  "meaningVi": "string",
  "example": "string",
  "collocations": "string (3-5 essential collocations, format: 'collocation: meaning', separated by newlines)",
  "preposition": "string | null",
  "isIdiom": "boolean",
  "isPhrasalVerb": "boolean",
  "isCollocation": "boolean",
  "isStandardPhrase": "boolean",
  "isIrregular": "boolean",
  "v2": "string | null",
  "v3": "string | null",
  "isPassive": "boolean",
  "tags": ["string"],
  "wordFamily": {
    "nouns": [{"word": "string", "ipa": "string"}],
    "verbs": [{"word": "string", "ipa": "string"}],
    "adjs": [{"word": "string", "ipa": "string"}],
    "advs": [{"word": "string", "ipa": "string"}]
  }
}
\`\`\`

CRITICAL INSTRUCTIONS:
- word: The original word from the list.
- collocations: Provide essential IELTS collocations in 'phrase: meaning' format, separated by newlines.
- preposition: provide a comma-separated list of patterns.
- tags: Suggest 3-5 relevant IELTS topic tags.`;
    
    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const handleManualJsonParse = (jsonString: string) => {
    setManualJsonInput(jsonString);
    if (!jsonString.trim()) return;
    try {
        let clean = jsonString.trim();
        if (clean.startsWith('```json')) clean = clean.substring(7);
        if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
        const parsed = JSON.parse(clean);
        const data = Array.isArray(parsed) ? parsed[0] : parsed;
        if (data) {
            applyRefinementData(data);
            setManualJsonError(null);
            setManualJsonInput('');
            setIsManualAiOpen(false);
        }
    } catch (e) {
        setManualJsonError("Invalid JSON format.");
    }
  };

  const handleAddVariantToLibrary = async (variant: WordFamilyMember) => {
    if (!variant.word || addingVariant || existingVariants.has(variant.word.toLowerCase())) return;
    
    setAddingVariant(variant.word);
    try {
      const details = await generateWordDetails(variant.word);
      const newItem = {
        ...createNewWord(
          variant.word, 
          details.ipa || variant.ipa || '', 
          details.meaningVi || 'New variant from family', 
          details.example || '', 
          `Added from word family of "${word.word}"`,
          [...word.tags, 'word-family'],
          !!details.isIdiom,
          !!details.needsPronunciationFocus,
          !!details.isPhrasalVerb,
          !!details.isCollocation,
          !!details.isStandardPhrase,
          !!details.isPassive
        ),
        userId: word.userId,
        collocations: details.collocations,
        wordFamily: details.wordFamily
      };
      await saveWord(newItem);
      setExistingVariants(prev => new Set(prev).add(variant.word.toLowerCase()));
    } catch (e) {
      console.error("Failed to add variant:", e);
    } finally {
      setAddingVariant(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { tagsString, prepositionsString, v2v3, studiedStatus, ...rest } = formData;
    
    let finalFamily = rest.wordFamily;
    if (finalFamily) {
       const hasData = (finalFamily.nouns?.length || 0) > 0 || 
                       (finalFamily.verbs?.length || 0) > 0 || 
                       (finalFamily.adjs?.length || 0) > 0 || 
                       (finalFamily.advs?.length || 0) > 0;
       if (!hasData) finalFamily = undefined;
    }

    const vParts = v2v3.split(/[,\s]+/).filter(Boolean);

    let updatedWord: VocabularyItem = {
      ...rest,
      v2: vParts[0] || '',
      v3: vParts[1] || '',
      wordFamily: finalFamily,
      prepositions: parsePrepositionPatterns(prepositionsString),
      tags: tagsString.split(',').map(t => t.trim()).filter(Boolean),
      updatedAt: Date.now()
    };

    // Apply manual studied status change
    if (studiedStatus === 'NEW') {
        updatedWord = resetProgress(updatedWord);
    } else if (studiedStatus !== word.lastGrade) {
        // If they manually changed to a grade, we use the updateSRS logic as if they just reviewed it.
        updatedWord = updateSRS(updatedWord, studiedStatus as ReviewGrade);
    }

    onSave(updatedWord);
    onClose();
  };

  const renderFamilyCardGroup = (label: string, members: WordFamilyMember[] | undefined, color: string) => {
    if (!members || members.length === 0) return null;
    return (
      <div className="space-y-2">
        <span className={`text-[9px] font-black uppercase text-${color}-600 tracking-widest ml-1`}>{label}</span>
        <div className="flex flex-col space-y-2">
          {members.map((member, idx) => {
            const isExisting = existingVariants.has(member.word.toLowerCase());
            const isProcessing = addingVariant === member.word;
            return (
              <div key={idx} className="flex items-center justify-between bg-neutral-50 p-3 rounded-2xl border border-neutral-100 group transition-all hover:bg-white hover:shadow-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-900">{member.word}</span>
                  <span className="text-[10px] font-mono text-neutral-400">{member.ipa}</span>
                </div>
                <button 
                  type="button"
                  disabled={isProcessing || isExisting}
                  onClick={() => handleAddVariantToLibrary(member)}
                  className={`p-2 rounded-xl transition-all flex items-center space-x-2 ${
                    isExisting 
                      ? 'bg-green-50 text-green-600 cursor-default' 
                      : isProcessing 
                        ? 'bg-neutral-100 text-neutral-400' 
                        : 'bg-white text-neutral-400 hover:bg-neutral-900 hover:text-white border border-neutral-100'
                  }`}
                >
                  {isExisting ? (
                    <>
                      <CheckCircle2 size={14} />
                      <span className="text-[9px] font-black uppercase">Added</span>
                    </>
                  ) : isProcessing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Plus size={14} />
                      <span className="text-[9px] font-black uppercase">Collect</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const hasAnyFamilyData = !!(
    formData.wordFamily.nouns?.length || 
    formData.wordFamily.verbs?.length || 
    formData.wordFamily.adjs?.length || 
    formData.wordFamily.advs?.length
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-8 py-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 shrink-0">
          <div className="flex items-center space-x-3">
             <div className="p-2 bg-neutral-900 text-white rounded-xl"><Edit3 size={16} /></div>
             <div>
              <h3 className="font-black text-lg text-neutral-900 leading-tight">Word Editor</h3>
              <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Update Content</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* AI Action Bar */}
        <div className="px-8 py-3 bg-neutral-900 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 text-white/50">
              <Sparkles size={14} className="text-yellow-400" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Manual AI Refinement</span>
                {isGenerating && <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest animate-pulse">Analyzing: {elapsedSeconds}s</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <button 
                  type="button" 
                  onClick={handleCancelRefinement}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] hover:bg-red-700 transition-all active:scale-95 uppercase tracking-widest"
                >
                  <XCircle size={12} />
                  <span>Cancel</span>
                </button>
              ) : (
                <>
                  <button 
                    type="button" 
                    onClick={handleAISuggest} 
                    disabled={!formData.word} 
                    className="flex items-center space-x-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-black text-[10px] hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-30 uppercase tracking-widest"
                  >
                    <Sparkles size={12} />
                    <span>AI Refine</span>
                  </button>

                  <button 
                    type="button" 
                    onClick={handleCopyPrompt} 
                    title="Copy robust prompt for external AI"
                    className="p-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all flex items-center justify-center"
                  >
                    {promptCopied ? <Check size={16} className="text-green-400" /> : <Clipboard size={16} />}
                  </button>

                  <button 
                    type="button" 
                    onClick={() => setIsManualAiOpen(!isManualAiOpen)} 
                    title="Paste AI JSON response"
                    className={`p-2 rounded-xl transition-all flex items-center justify-center ${isManualAiOpen ? 'bg-blue-50 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    <Eye size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {isManualAiOpen && !isGenerating && (
            <div className="animate-in slide-in-from-top-2 duration-200 space-y-2 pb-1">
              <textarea 
                rows={3}
                value={manualJsonInput}
                onChange={(e) => handleManualJsonParse(e.target.value)}
                placeholder='Paste AI JSON array response here...'
                className="w-full p-3 bg-neutral-800 border border-neutral-700 rounded-xl text-[10px] font-mono text-neutral-300 focus:ring-1 focus:ring-blue-500 outline-none resize-none no-scrollbar shadow-inner"
              />
              {manualJsonError && <div className="text-[10px] text-red-400 font-bold flex items-center gap-1 px-1"><AlertCircle size={10}/> {manualJsonError}</div>}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
          <div className="p-8 space-y-6 flex-1">
            {/* Classification Toggles */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-2">
              {[
                { id: 'idiom', label: 'Idiom', icon: Quote, active: formData.isIdiom },
                { id: 'colloc', label: 'Colloc.', icon: Combine, active: formData.isCollocation },
                { id: 'phrase', label: 'Phrase', icon: MessageSquare, active: formData.isStandardPhrase },
                { id: 'phrasal', label: 'Phrasal', icon: Layers, active: formData.isPhrasalVerb },
                { id: 'irregular', label: 'Irreg.', icon: RotateCw, active: formData.isIrregular },
                { id: 'pronun', label: 'Pronun.', icon: Mic, active: formData.needsPronunciationFocus },
                { id: 'passive', label: 'Archive', icon: formData.isPassive ? Archive : Trash2, active: formData.isPassive }
              ].map(btn => (
                <button 
                  key={btn.id}
                  type="button"
                  onClick={() => {
                    if (btn.id === 'pronun') setFormData(p => ({ ...p, needsPronunciationFocus: !p.needsPronunciationFocus }));
                    else if (btn.id === 'irregular') setFormData(p => ({ ...p, isIrregular: !p.isIrregular }));
                    else if (btn.id === 'passive') setFormData(p => ({ ...p, isPassive: !p.isPassive }));
                    else {
                      setFormData(p => ({
                        ...p,
                        isIdiom: btn.id === 'idiom' ? !p.isIdiom : false,
                        isCollocation: btn.id === 'colloc' ? !p.isCollocation : false,
                        isStandardPhrase: btn.id === 'phrase' ? !p.isStandardPhrase : false,
                        isPhrasalVerb: btn.id === 'phrasal' ? !p.isPhrasalVerb : false
                      }));
                    }
                  }}
                  className={`flex flex-col items-center justify-center space-y-1 py-2 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${
                    btn.active ? 'bg-neutral-900 border-neutral-900 text-white shadow-lg scale-[1.05]' : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'
                  }`}
                >
                  <btn.icon size={12} />
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Headword</label>
                  <input type="text" value={formData.word} onChange={(e) => setFormData({...formData, word: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:ring-2 focus:ring-neutral-200 outline-none transition-all shadow-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">IPA Transcription</label>
                  <input type="text" value={formData.ipa} onChange={(e) => setFormData({...formData, ipa: e.target.value})} placeholder="/.../" className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl font-mono text-sm text-neutral-600 focus:ring-2 focus:ring-neutral-200 outline-none shadow-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                   <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                     <RotateCw size={10} className="mr-1" /> Irregular Forms (V2, V3)
                   </label>
                   <input 
                    type="text" 
                    value={formData.v2v3} 
                    disabled={!formData.isIrregular}
                    onChange={(e) => setFormData({...formData, v2v3: e.target.value})} 
                    placeholder="e.g. arose, arisen" 
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm font-normal focus:ring-2 outline-none shadow-sm transition-all ${formData.isIrregular ? 'bg-orange-50 border-orange-200 text-orange-900 focus:ring-orange-100' : 'bg-neutral-50 border-neutral-200 text-neutral-300'}`} 
                  />
                 </div>
                 <div className="space-y-1.5">
                   <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                     <TagIcon size={10} className="mr-1" /> Tags
                   </label>
                   <input type="text" value={formData.tagsString} onChange={(e) => setFormData({...formData, tagsString: e.target.value})} placeholder="academic, health..." className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-normal text-neutral-600 focus:ring-2 focus:ring-neutral-200 outline-none shadow-sm" />
                 </div>
              </div>

              {/* Manual Progress Status Control */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                  <GraduationCap size={10} className="mr-1" /> Studied Status
                </label>
                <div className="grid grid-cols-4 gap-2 bg-neutral-100 p-1 rounded-2xl">
                    {[
                        { id: 'NEW', label: 'New', color: 'text-blue-600', activeBg: 'bg-blue-50 text-blue-600 border-blue-200' },
                        { id: ReviewGrade.FORGOT, label: 'Forgot', color: 'text-rose-600', activeBg: 'bg-rose-50 text-rose-600 border-rose-200' },
                        { id: ReviewGrade.HARD, label: 'Hard', color: 'text-orange-600', activeBg: 'bg-orange-50 text-orange-600 border-orange-200' },
                        { id: ReviewGrade.EASY, label: 'Easy', color: 'text-green-600', activeBg: 'bg-green-50 text-green-600 border-green-200' }
                    ].map(status => (
                        <button
                            key={status.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, studiedStatus: status.id })}
                            className={`py-2 text-[10px] font-black uppercase rounded-xl transition-all border-2 ${
                                formData.studiedStatus === status.id 
                                ? `${status.activeBg} shadow-sm border-current` 
                                : 'bg-transparent border-transparent text-neutral-400 hover:text-neutral-600'
                            }`}
                        >
                            {status.label}
                        </button>
                    ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                  <AtSign size={10} className="mr-1" /> Preposition Patterns
                </label>
                <input type="text" value={formData.prepositionsString} onChange={(e) => setFormData({...formData, prepositionsString: e.target.value})} placeholder="in something, on the table..." className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-normal text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none shadow-sm" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Vietnamese Meaning</label>
                <input type="text" value={formData.meaningVi} onChange={(e) => setFormData({...formData, meaningVi: e.target.value})} placeholder="Definition..." className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:ring-2 focus:ring-neutral-200 outline-none shadow-sm" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center justify-between">
                  <span>Usage Examples</span>
                  <span className="text-[8px] font-bold text-neutral-300 uppercase tracking-tighter italic">AI appends here</span>
                </label>
                <textarea rows={3} value={formData.example} onChange={(e) => setFormData({...formData, example: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl resize-none text-sm font-normal leading-relaxed text-neutral-900 focus:ring-2 focus:ring-neutral-900 outline-none transition-all shadow-sm" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center justify-between">
                  <span>IELTS Collocations</span>
                  <span className="text-[8px] font-bold text-neutral-300 uppercase tracking-tighter italic">AI enriched list</span>
                </label>
                <textarea rows={4} value={formData.collocations} onChange={(e) => setFormData({...formData, collocations: e.target.value})} placeholder="e.g. bear the brunt of: to suffer the worst impact..." className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl resize-none text-sm font-normal leading-relaxed text-neutral-900 focus:ring-2 focus:ring-neutral-900 outline-none transition-all shadow-sm" />
              </div>

              <div className="space-y-1.5">
                 <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                   <StickyNote size={10} className="mr-1" /> Private Note
                 </label>
                 <textarea rows={6} value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} placeholder="Add your own study notes..." className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-normal text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none shadow-inner resize-none transition-all" />
              </div>

              {/* Word Family Explorer Section */}
              <div className="pt-2 border-t border-neutral-100 mt-6 space-y-4">
                 <div className="flex items-center justify-between px-1">
                   <div className="flex items-center space-x-2">
                     <Network size={16} className="text-neutral-900" />
                     <h4 className="text-[11px] font-black text-neutral-900 uppercase tracking-widest">Word Family Explorer</h4>
                   </div>
                 </div>
                 
                 <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-all ${isGenerating ? 'opacity-40 blur-[2px] pointer-events-none' : 'opacity-100'}`}>
                   {renderFamilyCardGroup("Nouns", formData.wordFamily.nouns, "blue")}
                   {renderFamilyCardGroup("Verbs", formData.wordFamily.verbs, "green")}
                   {renderFamilyCardGroup("Adjectives", formData.wordFamily.adjs, "orange")}
                   {renderFamilyCardGroup("Adverbs", formData.wordFamily.advs, "purple")}
                 </div>

                 {!hasAnyFamilyData && !isGenerating && (
                   <div className="py-8 text-center bg-neutral-50 rounded-[2rem] border-2 border-dashed border-neutral-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">No Family Data Yet</p>
                      <p className="text-[8px] text-neutral-300 font-bold uppercase mt-1">Use AI Refine to discover the family tree</p>
                   </div>
                 )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex justify-center shrink-0">
            <button type="submit" className="px-10 py-3.5 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest">
              <Save size={16} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditWordModal;