import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Loader2, Save, Sparkles, Eye, BookText, PenLine, FileText, ArrowLeft } from 'lucide-react';
import { VocabularyItem, Unit, User } from '../../app/types';
import UniversalAiModal from '../common/UniversalAiModal';
import { UnitEssayView } from './UnitEssayView';

const renderHighlightedVocabInput = (text: string, wordsByText: Map<string, any>): React.ReactNode => {
    if (!text) return null;
    const parts = text.split(/([;\n]+)/g); 
    return (<span>{parts.map((part, index) => { const trimmed = part.trim(); if (!trimmed || /^[;\n]+$/.test(part)) return <span key={index}>{part}</span>; const [essaySide, baseSide] = trimmed.split(':').map(s => s.trim()); const baseWord = baseSide || essaySide; const isMissing = !wordsByText.has(baseWord.toLowerCase()); if (isMissing) return <span key={index} className="bg-rose-50 text-rose-600 rounded-sm font-bold border-b border-rose-200">{part}</span>; return <span key={index} className="text-neutral-900">{part}</span>; })}</span>);
};

const UnitHeaderEditModal: React.FC<{ isOpen: boolean; onClose: () => void; initialName: string; initialDesc: string; onSave: (name: string, desc: string) => void; }> = ({ isOpen, onClose, initialName, initialDesc, onSave }) => {
    const [localName, setLocalName] = useState(initialName);
    const [localDesc, setLocalDesc] = useState(initialDesc);
    useEffect(() => { if (isOpen) { setLocalName(initialName); setLocalDesc(initialDesc); } }, [isOpen, initialName, initialDesc]);
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-8 space-y-6">
                <h3 className="text-xl font-black text-neutral-900">Edit Header</h3>
                <div className="space-y-4">
                    <input value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder="Enter unit title..." className="w-full px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-lg font-bold" autoFocus />
                    <textarea value={localDesc} onChange={(e) => setLocalDesc(e.target.value)} placeholder="Enter a brief description..." className="w-full h-32 px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium resize-none" />
                </div>
                <button onClick={() => { onSave(localName, localDesc); onClose(); }} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Update Header</button>
            </div>
        </div>
    </div>
    );
};

export interface UnitEditViewUIProps {
    user: User;
    unit: Unit;
    allWords: VocabularyItem[];
    onCancel: () => void;
    editName: string;
    setEditName: (name: string) => void;
    editDesc: string;
    setEditDesc: (desc: string) => void;
    editWords: string;
    setEditWords: (words: string) => void;
    editEssay: string;
    setEditEssay: (essay: string) => void;
    isSaving: boolean;
    handleSaveUnitChanges: () => void;
    handleGenerateUnitRefinePrompt: (inputs: { request: string; }) => string;
    handleApplyRefinement: (refined: any) => void;
}

export const UnitEditViewUI: React.FC<UnitEditViewUIProps> = ({ user, allWords, onCancel, editName, setEditName, editDesc, setEditDesc, editWords, setEditWords, editEssay, setEditEssay, isSaving, handleSaveUnitChanges, handleGenerateUnitRefinePrompt, handleApplyRefinement }) => {
  const [isPassagePreview, setIsPassagePreview] = useState(false);
  const [isHeaderModalOpen, setIsHeaderModalOpen] = useState(false);
  const [showRefineAiModal, setShowRefineAiModal] = useState(false);
  const vocabScrollRef = useRef<HTMLDivElement>(null);
  const vocabTextareaRef = useRef<HTMLTextAreaElement>(null);
  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);

  const handleEssayWordAction = (text: string, action: 'add' | 'remove') => {
    const rawText = text.trim();
    if (!rawText) return;
    
    const currentEntries = editWords.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
    
    if (action === 'add') {
        if (!currentEntries.some(entry => {
            const parts = entry.split(':');
            return parts[0].trim().toLowerCase() === rawText.toLowerCase();
        })) {
            const newString = currentEntries.concat(rawText).join('; ');
            setEditWords(newString);
        }
    } else {
        const textLower = rawText.toLowerCase();
        const newEntries = currentEntries.filter(entry => {
            const parts = entry.split(':');
            const essaySide = parts[0].trim().toLowerCase();
            return essaySide !== textLower;
        });
        setEditWords(newEntries.join('; '));
    }
  };

  return (
    <>
      <div className="max-w-[1600px] mx-auto space-y-4 pb-12 relative animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1"><button onClick={onCancel} className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider"><ArrowLeft size={14} /><span>Back</span></button><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Edit Unit</h2></div>
            <div className="flex items-center gap-2"><button onClick={() => setShowRefineAiModal(true)} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all"><Sparkles size={14} className="text-amber-500"/><span>AI Refine</span></button><button onClick={handleSaveUnitChanges} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-neutral-900/10">{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}<span>Save Changes</span></button></div>
        </div>
        <div className="bg-white px-5 py-4 rounded-3xl border border-neutral-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in slide-in-from-bottom-2 group"><div className="space-y-1 flex-1"><h3 className="text-xl font-black text-neutral-900 leading-tight">{editName || "Untitled Unit"}</h3><p className="text-sm font-medium text-neutral-500 leading-relaxed whitespace-pre-wrap line-clamp-2">{editDesc || "No description provided."}</p></div><button onClick={() => setIsHeaderModalOpen(true)} className="shrink-0 flex items-center space-x-2 px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs transition-all active:scale-95"><FileText size={16} /><span>Edit Header</span></button></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
            <div className="flex flex-col gap-2 h-full"><div className="flex justify-between items-center px-1 shrink-0"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><BookText size={12}/> Reading Passage</label><button onClick={() => setIsPassagePreview(!isPassagePreview)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm">{isPassagePreview ? <PenLine size={12}/> : <Eye size={12}/>}<span>{isPassagePreview ? 'Edit Text' : 'Preview'}</span></button></div><div className="flex-1 rounded-3xl border border-neutral-200 bg-white shadow-sm relative flex flex-col">{isPassagePreview ? (<UnitEssayView className="rounded-3xl" text={editEssay} vocabString={editWords} wordsByText={wordsByText} onWordAction={handleEssayWordAction} />) : (<textarea value={editEssay} onChange={(e) => setEditEssay(e.target.value)} placeholder="Paste or write your reading material here..." className="w-full h-full p-6 bg-white resize-none focus:bg-neutral-50/30 outline-none transition-all text-sm font-medium leading-relaxed text-neutral-900 placeholder:text-neutral-300 overflow-y-auto stable-scrollbar rounded-3xl" />)}</div></div>
            <div className="flex flex-col gap-2 h-full"><div className="flex justify-between items-center px-1 shrink-0"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">Target Vocabulary</label><span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{editWords.split(/[:;,\n]+/).filter(Boolean).length} items</span></div><div className="flex-1 relative rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden group"><div ref={vocabScrollRef} aria-hidden="true" className="absolute inset-0 p-6 text-sm font-medium leading-relaxed whitespace-pre-wrap pointer-events-none overflow-auto no-scrollbar font-sans">{renderHighlightedVocabInput(editWords, wordsByText)}</div><textarea ref={vocabTextareaRef} value={editWords} onChange={(e) => setEditWords(e.target.value)} onScroll={()=>{}} placeholder="word; essay_word:base_word; ..." className="absolute inset-0 w-full h-full p-6 bg-transparent resize-none outline-none transition-all text-sm font-medium leading-relaxed text-transparent caret-neutral-900 overflow-auto font-sans placeholder:text-neutral-300 focus:bg-neutral-50/10" style={{ fontVariantLigatures: 'none' }} /></div><p className="text-[9px] text-neutral-400 px-2 font-medium italic text-right shrink-0">Use <span className="text-neutral-600 font-bold">essay_word:base_word</span>. <span className="text-rose-500 font-bold">Red</span> = not in library.</p></div>
        </div>
      </div>
      <UnitHeaderEditModal isOpen={isHeaderModalOpen} onClose={() => setIsHeaderModalOpen(false)} initialName={editName} initialDesc={editDesc} onSave={(name, desc) => { setEditName(name); setEditDesc(desc); }} />
      {showRefineAiModal && (<UniversalAiModal isOpen={showRefineAiModal} onClose={() => setShowRefineAiModal(false)} type="REFINE_UNIT" title="Refine Unit" description="Update vocabulary and essay content with AI context." initialData={{ request: '' }} onGeneratePrompt={handleGenerateUnitRefinePrompt} onJsonReceived={handleApplyRefinement} actionLabel="Apply Changes" />)}
    </>
  );
};
