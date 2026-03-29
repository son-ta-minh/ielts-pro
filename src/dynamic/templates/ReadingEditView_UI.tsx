
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Loader2, Save, Sparkles, Eye, BookText, PenLine, FileText, ArrowLeft, Tag, HelpCircle, X, Plus, AlertCircle, Link2, FileAudio, Headphones, Trash2 } from 'lucide-react';
import { VocabularyItem, Unit, User } from '../../app/types';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { EssayReader } from './EssayReader';
import { stringToWordArray } from '../../utils/text';
import { FileSelector } from '../../components/common/FileSelector';

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

export interface ReadingEditViewUIProps {
    user: User;
    unit: Unit;
    allWords: VocabularyItem[];
    allLibraryTags: string[];
    onCancel: () => void;
    editName: string;
    setEditName: (name: string) => void;
    editDesc: string;
    setEditDesc: (desc: string) => void;
    editPath: string;
    setEditPath: (path: string) => void;
    editTags: string;
    setEditTags: (tags: string) => void;
    editWords: string;
    setEditWords: (words: string) => void;
    editEssay: string;
    setEditEssay: (essay: string) => void;
    editEssayFileLink?: Unit['essayFileLink'];
    setEditEssayFileLink: React.Dispatch<React.SetStateAction<Unit['essayFileLink'] | undefined>>;
    editAnswerFileLink?: Unit['answerFileLink'];
    setEditAnswerFileLink: React.Dispatch<React.SetStateAction<Unit['answerFileLink'] | undefined>>;
    editAudioLinks: string[];
    setEditAudioLinks: React.Dispatch<React.SetStateAction<string[]>>;
    editComprehensionQuestions: { question: string; answer: string; }[];
    setEditComprehensionQuestions: React.Dispatch<React.SetStateAction<{ question: string; answer: string; }[]>>;
    isSaving: boolean;
    handleSaveUnitChanges: () => void;
    handleGenerateUnitRefinePrompt: (inputs: { request: string; }) => string;
    handleApplyRefinement: (refined: any) => void;
}

export const ReadingEditViewUI: React.FC<ReadingEditViewUIProps> = ({ allWords, allLibraryTags, onCancel, editName, setEditName, editDesc, setEditDesc, editTags, setEditTags, editWords, setEditWords, editEssay, setEditEssay, editEssayFileLink, setEditEssayFileLink, editAnswerFileLink, setEditAnswerFileLink, editAudioLinks, setEditAudioLinks, editComprehensionQuestions, setEditComprehensionQuestions, isSaving, handleSaveUnitChanges, handleGenerateUnitRefinePrompt, handleApplyRefinement }) => {
  const [isPassagePreview, setIsPassagePreview] = useState(false);
  const [isHeaderModalOpen, setIsHeaderModalOpen] = useState(false);
  const [showRefineAiModal, setShowRefineAiModal] = useState(false);
  const [isMainFileSelectorOpen, setIsMainFileSelectorOpen] = useState(false);
  const [isAnswerFileSelectorOpen, setIsAnswerFileSelectorOpen] = useState(false);
  const [isAudioSelectorOpen, setIsAudioSelectorOpen] = useState(false);
  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);
  const isLinkedFileUnit = !!editEssayFileLink;

  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagSuggestionsContainerRef = useRef<HTMLDivElement>(null);

  // Computed list of words from the input that are missing in the library
  const missingWords = useMemo(() => {
    if (!editWords.trim()) return [];
    const entries = stringToWordArray(editWords);
    return entries.filter(entry => {
        const [essaySide, baseSide] = entry.split(':');
        const baseWord = baseSide || essaySide;
        return !wordsByText.has(baseWord.toLowerCase());
    });
  }, [editWords, wordsByText]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagSuggestionsContainerRef.current && !tagSuggestionsContainerRef.current.contains(event.target as Node)) {
        setShowTagSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const parts = editTags.split(',');
    const currentTagFragment = parts[parts.length - 1].trim().toLowerCase();

    if (!currentTagFragment) {
      setShowTagSuggestions(false);
      return;
    }

    const existingTags = new Set(parts.slice(0, -1).map(p => p.trim().toLowerCase()));
    const filtered = allLibraryTags.filter(tag => 
      tag.toLowerCase().includes(currentTagFragment) &&
      !existingTags.has(tag.toLowerCase())
    );

    setTagSuggestions(filtered);
    setShowTagSuggestions(filtered.length > 0);
  }, [editTags, allLibraryTags]);

  const handleTagSuggestionClick = (suggestion: string) => {
    const parts = editTags.split(',');
    parts[parts.length - 1] = suggestion;
    setEditTags(parts.join(', ') + ', ');
    setShowTagSuggestions(false);
    tagInputRef.current?.focus();
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagSuggestions.length > 0) {
      e.preventDefault();
      handleTagSuggestionClick(tagSuggestions[0]);
    } else if (e.key === 'Escape') {
      setShowTagSuggestions(false);
    }
  };

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
  
  const handleQuestionChange = (index: number, field: 'question' | 'answer', value: string) => {
    const newQuestions = [...editComprehensionQuestions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setEditComprehensionQuestions(newQuestions);
  };

  const addQuestion = () => {
    setEditComprehensionQuestions([...editComprehensionQuestions, { question: '', answer: '' }]);
  };

  const removeQuestion = (index: number) => {
    setEditComprehensionQuestions(editComprehensionQuestions.filter((_, i) => i !== index));
  };

  const handleSelectMainFile = (fileData: any) => {
    setEditEssayFileLink({
      mapName: fileData.mapName,
      relativePath: fileData.relativePath,
      fileName: fileData.fileName,
      extension: fileData.extension
    });
  };

  const handleSelectAnswerFile = (fileData: any) => {
    setEditAnswerFileLink({
      mapName: fileData.mapName,
      relativePath: fileData.relativePath,
      fileName: fileData.fileName,
      extension: fileData.extension
    });
  };

  const handleAddAudio = (fileData: any) => {
    if (!fileData?.url) return;
    setEditAudioLinks(prev => prev.includes(fileData.url) ? prev : [...prev, fileData.url]);
  };

  const handleRemoveAudio = (index: number) => {
    setEditAudioLinks(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className="max-w-[1600px] mx-auto space-y-4 pb-12 relative animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1"><button onClick={onCancel} className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider"><ArrowLeft size={14} /><span>Back</span></button><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Edit Unit</h2></div>
            <div className="flex items-center gap-2">
                <button onClick={() => setShowRefineAiModal(true)} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all"><Sparkles size={14} className="text-amber-500"/><span>AI Refine</span></button>
                <button onClick={handleSaveUnitChanges} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-neutral-900/10">{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}<span>Save Changes</span></button>
            </div>
        </div>
        <div className="bg-white px-5 py-4 rounded-3xl border border-neutral-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in slide-in-from-bottom-2 group">
          <div className="space-y-3 flex-1">
            <h3 className="text-xl font-black text-neutral-900 leading-tight">{editName || "Untitled Unit"}</h3>
            <p className="text-sm font-medium text-neutral-500 leading-relaxed whitespace-pre-wrap line-clamp-2">{editDesc || "No description provided."}</p>
            <div className="pt-2" ref={tagSuggestionsContainerRef}>
                <div className="space-y-1 relative">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-2"><Tag size={12}/> Tags (Keywords)</label>
                    <input ref={tagInputRef} type="text" value={editTags} onChange={(e) => setEditTags(e.target.value)} onFocus={() => setShowTagSuggestions(true)} onKeyDown={handleTagKeyDown} placeholder="e.g. Environment, Technology" className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none" autoComplete="off" />
                    {showTagSuggestions && tagSuggestions.length > 0 && (
                        <div className="absolute top-full mt-2 w-full bg-white border border-neutral-200 rounded-xl shadow-lg z-10 p-1 animate-in fade-in duration-150">
                            {tagSuggestions.slice(0, 5).map(tag => ( <button key={tag} type="button" onMouseDown={() => handleTagSuggestionClick(tag)} className="w-full text-left px-3 py-1.5 rounded-md text-sm font-medium hover:bg-neutral-100">{tag}</button>))}
                        </div>
                    )}
                </div>
            </div>
          </div>
          <button onClick={() => setIsHeaderModalOpen(true)} className="shrink-0 flex items-center space-x-2 px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs transition-all active:scale-95"><FileText size={16} /><span>Edit Name & Desc</span></button>
        </div>
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><Link2 size={12}/> Server Attachments</label>
                    <p className="text-xs text-neutral-500 mt-1">Main file is enough to create a linked Reading unit. Answer sheet is optional and media can include multiple server audio tracks.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setIsMainFileSelectorOpen(true)} type="button" className="px-4 py-2 bg-neutral-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Add Main File</button>
                    <button onClick={() => setIsAnswerFileSelectorOpen(true)} type="button" disabled={!editEssayFileLink} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50">Add Answer</button>
                    <button onClick={() => setIsAudioSelectorOpen(true)} type="button" className="px-4 py-2 bg-white border border-neutral-200 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Headphones size={12}/> Add Media</button>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className={`rounded-2xl border p-4 space-y-2 ${editEssayFileLink ? 'bg-emerald-50 border-emerald-200' : 'bg-neutral-50 border-neutral-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Main File</p>
                            <p className="text-sm font-bold text-neutral-800 break-all">{editEssayFileLink?.fileName || 'Not attached yet'}</p>
                        </div>
                        {editEssayFileLink && (
                            <button type="button" onClick={() => { setEditEssayFileLink(undefined); setEditAnswerFileLink(undefined); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-white rounded-lg">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] text-neutral-500 break-all">{editEssayFileLink ? `${editEssayFileLink.mapName}/${editEssayFileLink.relativePath}` : 'Import one file from the Reading mapping.'}</p>
                </div>
                <div className={`rounded-2xl border p-4 space-y-2 ${editAnswerFileLink ? 'bg-indigo-50 border-indigo-200' : 'bg-neutral-50 border-neutral-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Answer Sheet</p>
                            <p className="text-sm font-bold text-neutral-800 break-all">{editAnswerFileLink?.fileName || 'Optional'}</p>
                        </div>
                        {editAnswerFileLink && (
                            <button type="button" onClick={() => setEditAnswerFileLink(undefined)} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-white rounded-lg">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <p className="text-[11px] text-neutral-500 break-all">{editAnswerFileLink ? `${editAnswerFileLink.mapName}/${editAnswerFileLink.relativePath}` : 'You can attach this later.'}</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 p-4 space-y-3 bg-neutral-50">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Media</p>
                            <p className="text-sm font-bold text-neutral-800">{editAudioLinks.length} audio file{editAudioLinks.length === 1 ? '' : 's'}</p>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                        {editAudioLinks.length === 0 && <p className="text-[11px] text-neutral-400 italic">No media attached.</p>}
                        {editAudioLinks.map((link, idx) => (
                            <div key={`${link}-${idx}`} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-neutral-200">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <FileAudio size={14} className="text-emerald-500 shrink-0" />
                                    <span className="text-xs font-mono text-neutral-600 truncate">{decodeURIComponent(link.split('/').pop() || `Track ${idx + 1}`)}</span>
                                </div>
                                <button type="button" onClick={() => handleRemoveAudio(idx)} className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full"><X size={14}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-420px)] min-h-[600px]">
            <div className="flex flex-col gap-2 h-full"><div className="flex justify-between items-center px-1 shrink-0"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><BookText size={12}/> Reading Passage</label>{!isLinkedFileUnit && <button onClick={() => setIsPassagePreview(!isPassagePreview)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm">{isPassagePreview ? <PenLine size={12}/> : <Eye size={12}/>}<span>{isPassagePreview ? 'Edit Text' : 'Preview'}</span></button>}</div><div className="flex-1 rounded-3xl border border-neutral-200 bg-white shadow-sm relative flex flex-col">{isLinkedFileUnit ? (<div className="h-full p-6 flex flex-col justify-center items-center text-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 rounded-3xl"><div className="p-3 bg-white rounded-2xl shadow-sm border border-neutral-200 mb-4"><Link2 size={24} className="text-emerald-600" /></div><h3 className="text-lg font-black text-neutral-900">This unit reads from a server file</h3><p className="mt-2 text-sm text-neutral-500 max-w-md">Main content is linked to <span className="font-mono text-neutral-700">{editEssayFileLink?.fileName}</span>. Use Study view to preview the file, and use the attachment tools above if you want to replace the main file or add an answer sheet.</p></div>) : isPassagePreview ? (<EssayReader className="rounded-3xl" text={editEssay} vocabString={editWords} wordsByText={wordsByText} onWordAction={handleEssayWordAction} />) : (<textarea value={editEssay} onChange={(e) => setEditEssay(e.target.value)} placeholder="Paste or write your reading material here..." className="w-full h-full p-6 bg-white resize-none focus:bg-neutral-50/30 outline-none transition-all text-sm font-medium leading-relaxed text-neutral-900 placeholder:text-neutral-300 overflow-y-auto stable-scrollbar rounded-3xl" />)}</div></div>
            <div className="flex flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar">
                {/* Vocabulary Area - Prioritized with flex-[3] */}
                <div className="flex flex-col gap-2 flex-[3] min-h-[350px]">
                    <div className="flex justify-between items-center px-1 shrink-0">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">Target Vocabulary</label>
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{editWords.split(/[:;,\n]+/).filter(Boolean).length} items</span>
                    </div>
                    <div className="flex-1 relative rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden flex flex-col">
                        <textarea 
                            value={editWords} 
                            onChange={(e) => setEditWords(e.target.value)} 
                            placeholder="word; essay_word:base_word; ..." 
                            className="w-full flex-1 p-6 bg-transparent resize-none outline-none text-sm font-medium leading-relaxed text-neutral-900 overflow-auto font-sans placeholder:text-neutral-300 focus:bg-neutral-50/10" 
                            spellCheck={false}
                        />
                    </div>
                    
                    {/* Missing Words Indicator */}
                    {missingWords.length > 0 && (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl animate-in slide-in-from-top-2 shrink-0">
                            <div className="flex items-center gap-2 mb-2 text-rose-600">
                                <AlertCircle size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Not in Library ({missingWords.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {missingWords.map((w, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-white border border-rose-200 rounded-md text-[10px] font-bold text-rose-700 shadow-sm">{w}</span>
                                ))}
                            </div>
                            <p className="mt-2 text-[9px] text-rose-400 italic">These will be automatically created when you save.</p>
                        </div>
                    )}

                    <p className="text-[9px] text-neutral-400 px-2 font-medium italic text-right shrink-0">Use <span className="text-neutral-600 font-bold">essay_word:base_word</span> format for complex sentences.</p>
                </div>

                {/* Questions Area - flex-[2] */}
                <div className="flex flex-col gap-2 flex-[2] min-h-[200px]">
                    <div className="flex justify-between items-center px-1 shrink-0"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><HelpCircle size={12}/> Comprehension Questions</label></div>
                    <div className="flex-1 space-y-3 p-4 bg-white border border-neutral-200 rounded-3xl shadow-sm overflow-y-auto custom-scrollbar">
                        {editComprehensionQuestions.map((q, index) => (
                            <div key={index} className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-2">
                                <div className="flex items-center gap-2">
                                    <textarea value={q.question} onChange={e => handleQuestionChange(index, 'question', e.target.value)} rows={2} placeholder={`Question ${index + 1}`} className="w-full text-xs font-bold text-neutral-800 p-2 bg-white rounded-lg border border-neutral-200 focus:ring-1 focus:ring-neutral-900 outline-none resize-y" />
                                    <button onClick={() => removeQuestion(index)} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full"><X size={14}/></button>
                                </div>
                                <textarea value={q.answer} onChange={e => handleQuestionChange(index, 'answer', e.target.value)} rows={2} placeholder={`Answer ${index + 1}`} className="w-full text-xs font-medium text-neutral-600 p-2 bg-white rounded-lg border border-neutral-200 focus:ring-1 focus:ring-neutral-900 outline-none resize-y" />
                            </div>
                        ))}
                        <button onClick={addQuestion} className="w-full flex items-center justify-center gap-2 py-3 bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors">
                            <Plus size={14}/> Add Question
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
      <UnitHeaderEditModal isOpen={isHeaderModalOpen} onClose={() => setIsHeaderModalOpen(false)} initialName={editName} initialDesc={editDesc} onSave={(name, desc) => { setEditName(name); setEditDesc(desc); }} />
      {showRefineAiModal && (<UniversalAiModal isOpen={showRefineAiModal} onClose={() => setShowRefineAiModal(false)} type="REFINE_UNIT" title="Refine Unit" description="Update vocabulary and essay content with AI context." initialData={{ request: '' }} onGeneratePrompt={handleGenerateUnitRefinePrompt} onJsonReceived={handleApplyRefinement} actionLabel="Apply Changes" closeOnSuccess={true} />)}
      <FileSelector isOpen={isMainFileSelectorOpen} onClose={() => setIsMainFileSelectorOpen(false)} onSelect={handleSelectMainFile} type="reading_file" title="Select Main File" />
      <FileSelector isOpen={isAnswerFileSelectorOpen} onClose={() => setIsAnswerFileSelectorOpen(false)} onSelect={handleSelectAnswerFile} type="reading_file" title="Select Answer File" />
      <FileSelector isOpen={isAudioSelectorOpen} onClose={() => setIsAudioSelectorOpen(false)} onSelect={handleAddAudio} type="audio" title="Select Audio" />
    </>
  );
};
