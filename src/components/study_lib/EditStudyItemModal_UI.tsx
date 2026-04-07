import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Save, Sparkles, Quote, Layers, Combine, MessageSquare, RotateCw, Trash2, Plus, EyeOff, Eye, AtSign, ArrowLeft, StickyNote, Zap, Archive, Book, Info, Link as LinkIcon, ShieldCheck, ShieldX, Ghost, Wand2, ChevronDown, Users2, Lightbulb, BookText, ClipboardList, GraduationCap, Loader2 } from 'lucide-react';
import { StudyItem, WordFamily, WordFamilyMember, LearnedStatus, ParaphraseOption, PrepositionPattern, CollocationDetail, StudyItemQuality, ParaphraseTone } from '../../app/types';

const StatusDropdown: React.FC<{
    label?: string;
    options: { id: string; label: string; icon: React.ReactNode; }[];
    selectedId: string;
    onSelect: (id: string) => void;
    buttonClass?: string;
    disabled?: boolean;
}> = ({ label, options, selectedId, onSelect, buttonClass, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(o => o.id === selectedId) || options[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className={buttonClass} disabled={disabled}>
                {label && <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</span>}
                {selectedOption.icon}
                <span className="text-xs font-black uppercase tracking-wider">{selectedOption.label}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !disabled && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                    {options.map(option => (
                        <button key={option.id} type="button" onClick={() => { onSelect(option.id); setIsOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${selectedId === option.id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'}`}>
                            {option.icon}
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export interface EditStudyItemModalUIProps {
  onClose: () => void;
  onSwitchToView: () => void;
  formData: any; 
  setFormData: (field: keyof StudyItem | 'groupsString' | 'studiedStatus' | 'prepositionsList' | 'essayEdit' | 'testEdit', value: any) => void;
  setFlag: (flag: 'isIdiom' | 'isPhrasalVerb' | 'isCollocation' | 'isStandardPhrase' | 'isIrregular' | 'isPassive' | 'isFocus' | 'isFreeLesson') => void;
  familyHandler: (type: keyof WordFamily) => { update: (index: number, field: 'word', value: string) => void; toggleIgnore: (index: number) => void; remove: (index: number) => void; add: () => void; };
  prepList: { update: (index: number, changes: object) => void; toggleIgnore: (index: number) => void; remove: (index: number) => void; add: (newItem: object) => void; };
  collocList: { update: (index: number, changes: object) => void; toggleIgnore: (index: number) => void; remove: (index: number) => void; add: (newItem: object) => void; };
  idiomList: { update: (index: number, changes: object) => void; toggleIgnore: (index: number) => void; remove: (index: number) => void; add: (newItem: object) => void; };
  paraList: { 
    update: (index: number, changes: Partial<ParaphraseOption>) => void;
    toggleIgnore: (index: number) => void; 
    remove: (index: number) => void; 
    add: (newItem: Partial<ParaphraseOption>) => void;
  };
  handleSubmit: (e?: React.FormEvent) => void;
  onOpenAiRefine: () => void;
  onSuggestLearn: () => void;
  hasSuggestions: boolean;
  handleCacheImages: () => void | Promise<void>;
  onGenImg: () => void | Promise<void>;
  onSelectImage: () => void | Promise<void>;
  onFormatExamples: () => void;
  availableGroups: string[];
  onFillMeaningVi: () => void;
  onFillMeaningEn: () => void;
  isMeaningLoading: 'vi' | 'en' | null;
  onFillCambridgeIpa: () => void;
  onFillGeneratedIpa: () => void;
  isIpaLoading: 'cambridge' | 'generated' | null;
  onGenerateExamples: () => void;
  onGenerateCollocations: () => void;
  isStudyBuddyGenerating: 'examples' | 'collocations' | null;
  isSaving?: boolean;
}

type Tab = 'MAIN' | 'SOUND' | 'DETAILS' | 'CONNECTIONS' | 'USAGE';

const ListEditorSection: React.FC<{
    title: string;
    items: { text: string; d?: string; isIgnored?: boolean }[];
    onUpdate: (index: number, field: 'text' | 'd', value: string) => void;
    onToggleIgnore: (index: number) => void;
    onRemove: (index: number) => void;
    onAdd: () => void;
    placeholders: { text: string; d?: string };
    showDescription?: boolean;
}> = ({ title, items, onUpdate, onToggleIgnore, onRemove, onAdd, placeholders, showDescription = false }) => (
    <div className="space-y-2">
        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{title}</label>
        <div className="space-y-2 p-3 bg-neutral-50 border border-neutral-200 rounded-2xl">
            {(items || []).map((item, index) => (
                <div key={index} className={`bg-white p-2 rounded-lg border border-neutral-100 flex items-start gap-2 group transition-opacity ${item.isIgnored ? 'opacity-50' : ''}`}>
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <input type="text" value={item.text} onChange={e => onUpdate(index, 'text', e.target.value)} placeholder={placeholders.text} className="flex-1 px-3 py-2 bg-neutral-50/50 border border-neutral-200 rounded-lg text-xs font-bold focus:bg-white focus:ring-1 focus:ring-neutral-900 outline-none"/>
                        </div>
                        {showDescription && (
                            <input type="text" value={item.d || ''} onChange={e => onUpdate(index, 'd', e.target.value)} placeholder={placeholders.d} className="w-full px-3 py-1 bg-neutral-50/50 border border-transparent rounded-lg text-[10px] font-medium text-neutral-500 focus:bg-white focus:ring-1 focus:ring-neutral-900 focus:border-neutral-200 outline-none" />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <button type="button" onClick={() => onToggleIgnore(index)} className="p-2 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100">{item.isIgnored ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                        <button type="button" onClick={() => onRemove(index)} className="p-2 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-red-50"><X size={14} /></button>
                    </div>
                </div>
            ))}
            <button type="button" onClick={onAdd} className="w-full text-center py-2 bg-white hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-neutral-200 shadow-sm"><Plus size={12}/> Add</button>
        </div>
    </div>
);


export const EditStudyItemModalUI: React.FC<EditStudyItemModalUIProps> = (props) => {
  const {
    onClose, onSwitchToView, formData, setFormData, setFlag,
    familyHandler, prepList, collocList, idiomList, paraList, handleSubmit,
    onOpenAiRefine, onSuggestLearn, hasSuggestions,
    handleCacheImages,
    onGenImg,
    onSelectImage,
    onFormatExamples,
    availableGroups,
    onFillMeaningVi,
    onFillMeaningEn,
    isMeaningLoading,
    onFillCambridgeIpa,
    onFillGeneratedIpa,
    isIpaLoading,
    onGenerateExamples,
    onGenerateCollocations,
    isStudyBuddyGenerating,
    isSaving = false
  } = props;
  
  const [activeTab, setActiveTab] = useState<Tab>('MAIN');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  useEffect(() => {
    const imgs = (formData.img || []).filter((u: string) => (u || '').trim());
    setSelectedImages(imgs);
  }, [formData.img]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchType, setBatchType] = useState<'collocations' | 'idioms' | 'paraphrases' | 'prepositions'>('collocations');
  const [batchText, setBatchText] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(event.target as Node)) {
        setIsGroupMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const parseBatchLines = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const results: { text: string; desc?: string }[] = [];

    for (let line of lines) {
      // remove leading bullets / special chars
      line = line.replace(/^[-*•|>\s]+/, '').trim();

      // remove markdown bold if present
      line = line.replace(/\*\*(.*?)\*\*/g, '$1');

      // split by first colon
      const idx = line.indexOf(':');
      if (idx === -1) continue;

      let left = line.slice(0, idx).trim();
      const right = line.slice(idx + 1).trim();

      // final cleanup for markdown artifacts like **word** or word**
      left = left.replace(/^[*_`]+/, '').replace(/[*_`]+$/, '').trim();

      if (left) {
        results.push({ text: left, desc: right });
      }
    }

    return results;
  };

  const applyBatchImport = () => {
    const items = parseBatchLines(batchText);
    if (!items.length) return;

    if (batchType === 'collocations') {
      const payload = items.map(it => ({ text: it.text, d: it.desc || '', isIgnored: false }));
      payload.forEach(item => collocList.add(item));
    }
    if (batchType === 'idioms') {
      const payload = items.map(it => ({ text: it.text, d: it.desc || '', isIgnored: false }));
      payload.forEach(item => idiomList.add(item));
    }
    if (batchType === 'paraphrases') {
      const payload = items.map(it => ({
        word: it.text,
        context: it.desc || '',
        tone: 'neutral',
        isIgnored: false
      }));
      payload.forEach(item => paraList.add(item));
    }
    if (batchType === 'prepositions') {
      const payload = items.map(it => ({
        prep: it.text.split(/\s+/)[0],
        usage: it.desc || '',
        isIgnored: false
      }));
      payload.forEach(item => prepList.add(item));
    }

    setBatchText('');
    setBatchOpen(false);
  };
  const TABS: { id: Tab, label: string, icon: React.ElementType }[] = [
    { id: 'MAIN', label: 'Core', icon: Book },
    { id: 'CONNECTIONS', label: 'Advanced', icon: LinkIcon },
    { id: 'SOUND', label: 'Sound', icon: MessageSquare },
    { id: 'USAGE', label: 'Usage & Test', icon: BookText },
    { id: 'DETAILS', label: 'Manage', icon: Info }
  ];

  const qualityOptions = [
    { id: StudyItemQuality.RAW, label: 'Raw', icon: <Ghost size={14} className="text-neutral-400" /> },
    { id: StudyItemQuality.REFINED, label: 'Refined', icon: <Wand2 size={14} className="text-indigo-500" /> },
    { id: StudyItemQuality.VERIFIED, label: 'Verified', icon: <ShieldCheck size={14} className="text-emerald-500" /> },
    { id: StudyItemQuality.FAILED, label: 'Incorrect', icon: <ShieldX size={14} className="text-rose-500" /> },
  ];

  const learnStatusOptions = [
    { id: LearnedStatus.NEW, label: 'New', icon: <div className="w-3 h-3 rounded-full bg-blue-500"/> },
    { id: LearnedStatus.IGNORED, label: 'Ignored', icon: <div className="w-3 h-3 rounded-full bg-neutral-500"/> },
    { id: LearnedStatus.LEARNED, label: 'Learned', icon: <div className="w-3 h-3 rounded-full bg-cyan-500"/> },
    { id: LearnedStatus.FORGOT, label: 'Forgot', icon: <div className="w-3 h-3 rounded-full bg-rose-500"/> },
    { id: LearnedStatus.HARD, label: 'Hard', icon: <div className="w-3 h-3 rounded-full bg-orange-500"/> },
    { id: LearnedStatus.EASY, label: 'Easy', icon: <div className="w-3 h-3 rounded-full bg-green-500"/> },
  ];
  
  const TONE_OPTIONS: ParaphraseTone[] = ['academic', 'casual', 'neutral'];
  const currentGroups = useMemo(
    () => formData.groupsString.split(',').map((item: string) => item.trim()).filter(Boolean),
    [formData.groupsString]
  );
  const filteredGroupOptions = useMemo(() => {
    const normalizedQuery = groupQuery.trim().toLowerCase();
    return availableGroups
      .filter((group) => !currentGroups.includes(group))
      .filter((group) => !normalizedQuery || group.toLowerCase().includes(normalizedQuery))
      .slice(0, 100);
  }, [availableGroups, currentGroups, groupQuery]);
  const currentKeywords = useMemo(
    () => (formData.keywords || []).map((item: string) => item.trim()).filter(Boolean),
    [formData.keywords]
  );

  const addGroupToField = (group: string) => {
    const normalized = group.trim();
    if (!normalized || currentGroups.includes(normalized)) return;
    setFormData('groupsString', [...currentGroups, normalized].join(', '));
    setGroupQuery('');
    setIsGroupMenuOpen(false);
  };

  const removeGroupFromField = (group: string) => {
    setFormData('groupsString', currentGroups.filter((item: string) => item !== group).join(', '));
  };

  const addKeyword = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    if (currentKeywords.some((item: string) => item.toLowerCase() === normalized.toLowerCase())) return;
    setFormData('keywords', [...currentKeywords, normalized]);
    setKeywordInput('');
  };

  const removeKeyword = (keyword: string) => {
    setFormData('keywords', currentKeywords.filter((item: string) => item !== keyword));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* HEADER */}
        <header className="px-6 py-4 border-b border-neutral-100 flex flex-col gap-4 shrink-0 bg-white/80 backdrop-blur-sm z-10">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                    <button onClick={onSwitchToView} className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors"><ArrowLeft size={16} /></button>
                    <h3 className="font-black text-lg text-neutral-900 leading-none">Edit Word</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setBatchOpen(v => !v)}
                        className="px-3 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-black text-[10px] flex items-center justify-center space-x-1.5 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm"
                    >
                        <Combine size={12} />
                        <span>Batch</span>
                    </button>
                    <button 
                        type="button" 
                        onClick={onSuggestLearn} 
                        title={hasSuggestions ? "View Suggestions" : "Get Learning Suggestions"}
                        className={`px-3 py-2 border rounded-lg font-black text-[10px] flex items-center justify-center space-x-1.5 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm ${hasSuggestions ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-neutral-200 text-neutral-600'}`}>
                        <Lightbulb size={12} className={hasSuggestions ? "text-amber-500" : "text-neutral-400"} /><span>{hasSuggestions ? 'View Suggestion' : 'Suggest'}</span>
                    </button>
                    <button type="button" onClick={onOpenAiRefine} className="px-3 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-black text-[10px] flex items-center justify-center space-x-1.5 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm"><Sparkles size={12} className="text-amber-500" /><span>Manual AI</span></button>
                    <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={isSaving}
                        className="px-5 py-2 bg-neutral-900 text-white rounded-lg font-black text-[10px] flex items-center justify-center space-x-1.5 hover:bg-neutral-800 active:scale-95 transition-all shadow-md shadow-neutral-900/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-neutral-900 disabled:active:scale-100"
                    >
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        <span>{isSaving ? 'Saving...' : 'Save'}</span>
                    </button>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors ml-2"><X size={18} /></button>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex bg-neutral-100 p-1 rounded-xl w-fit">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setActiveTab(id)} className={`px-4 py-2 text-xs font-black rounded-lg transition-all flex items-center gap-2 ${activeTab === id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-800'}`}>
                            <Icon size={14}/> {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <StatusDropdown
                        label="Quality"
                        options={qualityOptions}
                        selectedId={formData.quality}
                        onSelect={(id) => setFormData('quality', id)}
                        buttonClass="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-neutral-100 transition-colors shadow-sm border border-neutral-200"
                    />
                    <StatusDropdown
                        label="Learn Status"
                        options={learnStatusOptions}
                        selectedId={formData.studiedStatus}
                        onSelect={(id) => setFormData('studiedStatus', id)}
                        buttonClass="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-neutral-100 transition-colors shadow-sm border border-neutral-200"
                    />
                </div>
            </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto no-scrollbar bg-neutral-50/50">
            <div className="p-6 space-y-6">
                {batchOpen && (
                  <div className="p-4 bg-white border border-neutral-200 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={batchType}
                        onChange={(e) => setBatchType(e.target.value as any)}
                        className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold"
                      >
                        <option value="collocations">Collocations</option>
                        <option value="idioms">Related Idioms</option>
                        <option value="paraphrases">Paraphrases</option>
                        <option value="prepositions">Prepositions</option>
                      </select>
                      <button
                        type="button"
                        onClick={applyBatchImport}
                        className="px-3 py-2 bg-neutral-900 text-white rounded-lg text-xs font-black"
                      >
                        Import
                      </button>
                    </div>
                    <textarea
                      value={batchText}
                      onChange={(e) => setBatchText(e.target.value)}
                      rows={6}
                      placeholder="- **preventive measures**: actions taken to stop a problem..."
                      className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs"
                    />
                  </div>
                )}
                {activeTab === 'MAIN' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 animate-in fade-in duration-300">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Headword</label>
                            <input type="text" value={formData.word} onChange={(e) => setFormData('word', e.target.value)} className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Display Text</label>
                            <input type="text" value={formData.display || ''} onChange={(e) => setFormData('display', e.target.value)} placeholder="Optional display text..." className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Definition / Meaning</label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={onFillMeaningVi}
                                        disabled={isMeaningLoading !== null}
                                        className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                                    >
                                        {isMeaningLoading === 'vi' ? 'Loading...' : 'VI Meaning'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onFillMeaningEn}
                                        disabled={isMeaningLoading !== null}
                                        className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                                    >
                                        {isMeaningLoading === 'en' ? 'Loading...' : 'EN Meaning'}
                                    </button>
                                </div>
                            </div>
                            <input type="text" value={formData.meaningVi} onChange={(e) => setFormData('meaningVi', e.target.value)} className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-base font-medium focus:ring-2 focus:ring-neutral-900 outline-none"/>
                        </div>
                        <div className="md:col-span-2 space-y-1">
                                <div className="flex items-center justify-between px-1">
                                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Examples</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={onGenerateExamples}
                                            disabled={isStudyBuddyGenerating !== null}
                                            className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                                        >
                                            {isStudyBuddyGenerating === 'examples' ? 'Generating...' : 'Generate'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onFormatExamples}
                                            className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors"
                                        >
                                            Format
                                        </button>
                                    </div>
                                </div>
                            <textarea rows={5} value={formData.example} onChange={(e) => setFormData('example', e.target.value)} className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 outline-none"/>
                        </div>
                        {/* Prepositions / Patterns */}
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                                <AtSign size={10} className="mr-1"/> Prepositions / Patterns
                            </label>
                            <div className="space-y-2 p-3 bg-white border border-neutral-200 rounded-2xl">
                                {formData.prepositionsList.map((item: PrepositionPattern, index: number) => (
                                    <div key={index} className={`flex items-center gap-2 transition-opacity ${item.isIgnored ? 'opacity-40' : ''}`}>
                                        <input
                                            type="text"
                                            value={item.prep}
                                            onChange={e => prepList.update(index, { prep: e.target.value })}
                                            placeholder="Prep"
                                            className="w-24 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold focus:bg-white focus:ring-1 focus:ring-neutral-900 outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={item.usage}
                                            onChange={e => prepList.update(index, { usage: e.target.value })}
                                            placeholder="Usage Context"
                                            className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-medium focus:bg-white focus:ring-1 focus:ring-neutral-900 outline-none"
                                        />
                                        <button type="button" onClick={() => prepList.toggleIgnore(index)} className="p-2 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100">
                                            {item.isIgnored ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button type="button" onClick={() => prepList.remove(index)} className="p-2 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => prepList.add({ prep: '', usage: '', isIgnored: false })}
                                    className="w-full text-center py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-neutral-200 shadow-sm"
                                >
                                    <Plus size={12}/> Add Pattern
                                </button>
                            </div>
                        </div>
                        {/* Private Note */}
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center">
                                <StickyNote size={10} className="mr-1"/> Private Note
                            </label>

                            {/* Badge Quick Insert */}
                            <div className="flex flex-wrap gap-2 px-1">
                                {['Definition', 'Caution', 'Tip', 'Important', 'Compare'].map(tag => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => {
                                            const current = formData.note || '';
                                            const insertText = `[${tag}] `;
                                            const newValue = current
                                                ? current.endsWith('\n') 
                                                    ? current + insertText 
                                                    : current + '\n' + insertText
                                                : insertText;
                                            setFormData('note', newValue);
                                        }}
                                        className="px-2 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors"
                                    >
                                        [{tag}]
                                    </button>
                                ))}
                            </div>

                            <textarea
                                rows={3}
                                value={formData.note}
                                onChange={(e) => setFormData('note', e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-600 resize-y focus:ring-1 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                    Image URLs (one per line)
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={onGenImg}
                                        className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors"
                                    >
                                        Generate
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                          if (selectedImages.length > 0) {
                                            setFormData('img', selectedImages);
                                          }
                                          onSelectImage();
                                        }}
                                        className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors"
                                    >
                                        Select Image
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCacheImages}
                                        className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors"
                                    >
                                        Cache Image
                                    </button>
                                </div>
                            </div>
                            <textarea
                                rows={3}
                                value={(formData.img || []).join('\n')}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    const arr = raw.split(/\r?\n/).map(s => s.trim());
                                    setFormData('img', arr);
                                }}
                                placeholder="https://...\nhttps://..."
                                className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'SOUND' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <div className="flex items-center justify-between px-1">
                                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Primary IPA / US</label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={onFillCambridgeIpa}
                                            disabled={isIpaLoading !== null}
                                            className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                                        >
                                            {isIpaLoading === 'cambridge' ? 'Loading...' : 'Cambridge IPA'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onFillGeneratedIpa}
                                            disabled={isIpaLoading !== null}
                                            className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                                        >
                                            {isIpaLoading === 'generated' ? 'Loading...' : 'Generated IPA'}
                                        </button>
                                    </div>
                                </div>
                                <input type="text" value={formData.ipaUs || ''} onChange={(e) => setFormData('ipaUs', e.target.value)} placeholder="/.../" className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-mono text-base text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none"/>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">IPA UK (Optional)</label>
                                <input type="text" value={formData.ipaUk || ''} onChange={(e) => setFormData('ipaUk', e.target.value)} placeholder="/.../" className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-mono text-base text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none"/>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">IPA Mistakes (comma or semicolon separated)</label>
                                <input
                                    type="text"
                                    value={(formData.ipaMistakes || []).join(', ')}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        const arr = raw
                                            .split(/[;,]/)
                                            .map((s: string) => s.trim())
                                            .filter((s: string) => s.length > 0);
                                        setFormData('ipaMistakes', arr);
                                    }}
                                    placeholder="e.g. /ˈmæskjʊlɪn/; /ˈmɑːskjʊlaɪn/"
                                    className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-mono text-sm text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">UK/US Similarity</label>
                                <div className="flex bg-neutral-100 p-1 rounded-xl w-full">
                                    {(['same', 'near', 'different'] as const).map(sim => (
                                        <button
                                            key={sim}
                                            type="button"
                                            onClick={() => setFormData('pronSim', sim)}
                                            className={`flex-1 px-3 py-3 text-xs font-black rounded-lg transition-all flex items-center justify-center ${formData.pronSim === sim ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-800'}`}>
                                            {sim.charAt(0).toUpperCase() + sim.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'DETAILS' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Flags</label>
                           <div className="flex flex-wrap gap-2 p-3 bg-white border border-neutral-200 rounded-2xl">{[{ id: 'isIdiom', label: 'Idiom', icon: Quote }, { id: 'isCollocation', label: 'Colloc.', icon: Combine }, { id: 'isStandardPhrase', label: 'Phrase', icon: MessageSquare }, { id: 'isPhrasalVerb', label: 'Phrasal', icon: Layers }, { id: 'isIrregular', label: 'Irregular', icon: RotateCw }, { id: 'isFreeLesson', label: 'Lesson', icon: GraduationCap }, { id: 'isPassive', label: 'Archive', icon: formData.isPassive ? Archive : Trash2 }, { id: 'isFocus', label: 'Focus', icon: Zap }].map(btn => (<button key={btn.id} type="button" onClick={() => setFlag(btn.id as any)} className={`flex items-center space-x-1.5 py-1.5 px-3 rounded-lg border transition-all font-bold text-[9px] uppercase tracking-wider ${formData[btn.id] ? 'bg-neutral-900 border-neutral-900 text-white shadow-sm' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}><btn.icon size={10} /><span>{btn.label}</span></button>))}</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                           <div className="space-y-2">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center"><Users2 size={10} className="mr-1"/>User Groups</label>
                                <input type="text" value={formData.groupsString} onChange={(e) => setFormData('groupsString', e.target.value)} placeholder="bird_species, env_academic..." className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-1 focus:ring-neutral-900 outline-none"/>
                                {currentGroups.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {currentGroups.map((group: string) => (
                                            <button
                                                key={group}
                                                type="button"
                                                onClick={() => removeGroupFromField(group)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 text-neutral-700 text-[10px] font-black border border-neutral-200 hover:bg-neutral-200 transition-colors"
                                                title="Remove group"
                                            >
                                                <span>{group}</span>
                                                <X size={12} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="relative" ref={groupMenuRef}>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={groupQuery}
                                            onChange={(e) => {
                                                setGroupQuery(e.target.value);
                                                setIsGroupMenuOpen(true);
                                            }}
                                            onFocus={() => setIsGroupMenuOpen(true)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (filteredGroupOptions[0]) addGroupToField(filteredGroupOptions[0]);
                                                } else if (e.key === 'Escape') {
                                                    setIsGroupMenuOpen(false);
                                                }
                                            }}
                                            placeholder="Search and add existing group..."
                                            className="w-full px-4 py-3 pr-10 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-1 focus:ring-neutral-900 outline-none"
                                        />
                                        <ChevronDown size={14} className={`absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition-transform ${isGroupMenuOpen ? 'rotate-180' : ''}`} />
                                    </div>
                                    {isGroupMenuOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
                                            <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                                                {filteredGroupOptions.length > 0 ? (
                                                    filteredGroupOptions.map((group) => (
                                                        <button
                                                            key={group}
                                                            type="button"
                                                            onClick={() => addGroupToField(group)}
                                                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors"
                                                            title={group}
                                                        >
                                                            <span className="block truncate">{group}</span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="px-3 py-4 text-center text-[11px] font-bold text-neutral-400">
                                                        No matching groups.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                           </div>
                           <div className="space-y-2">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Keywords</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={keywordInput}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ',') {
                                                e.preventDefault();
                                                addKeyword(keywordInput);
                                            }
                                        }}
                                        placeholder="build rapport, social bonding..."
                                        className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-1 focus:ring-neutral-900 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => addKeyword(keywordInput)}
                                        className="px-4 py-3 bg-neutral-900 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-neutral-800 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                                {currentKeywords.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {currentKeywords.map((keyword: string) => (
                                            <button
                                                key={keyword}
                                                type="button"
                                                onClick={() => removeKeyword(keyword)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-50 text-cyan-800 text-[10px] font-black border border-cyan-200 hover:bg-cyan-100 transition-colors"
                                                title="Remove keyword"
                                            >
                                                <span>{keyword}</span>
                                                <X size={12} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <p className="text-[11px] font-medium text-neutral-400 px-1">
                                    Search Page and StudyBuddy will use these as extra keyword matches when the headword itself does not match.
                                </p>
                           </div>
                           <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Register</label>
                                <div className="flex bg-neutral-100 p-1 rounded-xl w-fit">
                                    {(['raw', 'neutral', 'academic', 'casual'] as const).map(reg => (
                                        <button 
                                            key={reg} 
                                            type="button"
                                            onClick={() => setFormData('register', reg)}
                                            className={`px-4 py-2 text-xs font-black rounded-lg transition-all flex items-center gap-2 ${formData.register === reg || (!formData.register && reg === 'raw') ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-800'}`}>
                                            {reg.charAt(0).toUpperCase() + reg.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* Removed Prepositions / Patterns and Private Note from DETAILS tab */}
                    </div>
                )}

                {activeTab === 'CONNECTIONS' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <button
                                    type="button"
                                    onClick={onGenerateCollocations}
                                    disabled={isStudyBuddyGenerating !== null}
                                    className="px-3 py-1 text-[10px] font-bold rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition-colors disabled:opacity-50"
                                >
                                    {isStudyBuddyGenerating === 'collocations' ? 'Generating...' : 'Generate Collocations'}
                                </button>
                            </div>
                            <ListEditorSection 
                                title="Collocations" 
                                items={formData.collocationsArray} 
                                onUpdate={(i, f, v) => collocList.update(i, { [f]: v })} 
                                onToggleIgnore={collocList.toggleIgnore} 
                                onRemove={collocList.remove} 
                                onAdd={() => collocList.add({ text: '', d: '', isIgnored: false })} 
                                placeholders={{ text: "Collocation phrase...", d: "Descriptive hint..." }} 
                                showDescription={true}
                            />
                        </div>
                        <ListEditorSection 
                            title="Related Idioms" 
                            items={formData.idiomsList} 
                            onUpdate={(i, f, v) => idiomList.update(i, { [f]: v })} 
                            onToggleIgnore={idiomList.toggleIgnore} 
                            onRemove={idiomList.remove} 
                            onAdd={() => idiomList.add({ text: '', d: '', isIgnored: false })} 
                            placeholders={{ text: "Idiom or phrase...", d: "Descriptive hint..." }}
                            showDescription={true}
                        />
                        
                        <div className="space-y-2"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Word Family</label><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ListEditorSection title="Nouns" items={(formData.wordFamily?.nouns || []).map((m: any) => ({ text: m.word, isIgnored: m.isIgnored }))} onUpdate={(i, f, v) => { if (f === 'text') { familyHandler('nouns').update(i, 'word', v); } }} onToggleIgnore={familyHandler('nouns').toggleIgnore} onRemove={familyHandler('nouns').remove} onAdd={familyHandler('nouns').add} placeholders={{ text: "Noun form..." }} />
                            <ListEditorSection title="Verbs" items={(formData.wordFamily?.verbs || []).map((m: any) => ({ text: m.word, isIgnored: m.isIgnored }))} onUpdate={(i, f, v) => { if (f === 'text') { familyHandler('verbs').update(i, 'word', v); } }} onToggleIgnore={familyHandler('verbs').toggleIgnore} onRemove={familyHandler('verbs').remove} onAdd={familyHandler('verbs').add} placeholders={{ text: "Verb form..." }} />
                            <ListEditorSection title="Adjectives" items={(formData.wordFamily?.adjs || []).map((m: any) => ({ text: m.word, isIgnored: m.isIgnored }))} onUpdate={(i, f, v) => { if (f === 'text') { familyHandler('adjs').update(i, 'word', v); } }} onToggleIgnore={familyHandler('adjs').toggleIgnore} onRemove={familyHandler('adjs').remove} onAdd={familyHandler('adjs').add} placeholders={{ text: "Adjective form..." }} />
                            <ListEditorSection title="Adverbs" items={(formData.wordFamily?.advs || []).map((m: any) => ({ text: m.word, isIgnored: m.isIgnored }))} onUpdate={(i, f, v) => { if (f === 'text') { familyHandler('advs').update(i, 'word', v); } }} onToggleIgnore={familyHandler('advs').toggleIgnore} onRemove={familyHandler('advs').remove} onAdd={familyHandler('advs').add} placeholders={{ text: "Adverb form..." }} />
                        </div></div>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Zap size={10} className="text-amber-500"/> Word Power & Variations</label>
                            <div className="space-y-2 p-3 bg-white border border-neutral-200 rounded-2xl">
                              {(formData.paraphrases as ParaphraseOption[] || []).map((para, idx) => (
                                <div key={idx} className={`grid grid-cols-[1fr,auto,1fr,auto,auto] items-center gap-2 transition-opacity ${para.isIgnored ? 'opacity-40' : ''}`}>
                                  <input 
                                      type="text" 
                                      value={para.word} 
                                      onChange={e => paraList.update(idx, { word: e.target.value })} 
                                      placeholder="Variation..." 
                                      className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold focus:bg-white focus:ring-1 focus:ring-neutral-900 outline-none"
                                  />
                                  <select 
                                      value={para.tone} 
                                      onChange={e => paraList.update(idx, { tone: e.target.value as ParaphraseTone })} 
                                      className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold focus:bg-white focus:ring-1 focus:ring-neutral-900 outline-none appearance-none"
                                  >
                                      {TONE_OPTIONS.map(tone => (
                                          <option key={tone} value={tone}>{tone.charAt(0).toUpperCase() + tone.slice(1)}</option>
                                      ))}
                                  </select>
                                  <input 
                                      type="text" 
                                      value={para.context} 
                                      onChange={e => paraList.update(idx, { context: e.target.value })} 
                                      placeholder="Context..." 
                                      className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-medium focus:bg-white focus:ring-1 focus:ring-neutral-900 outline-none"
                                  />
                                  <button type="button" onClick={() => paraList.toggleIgnore(idx)} className="p-2 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100">{para.isIgnored ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                                  <button type="button" onClick={() => paraList.remove(idx)} className="p-2 text-neutral-400 hover:text-red-500 rounded-lg hover:bg-red-50"><X size={14} /></button>
                                </div>
                              ))}
                              <button 
                                type="button" 
                                onClick={() => paraList.add({ word: '', context: '', tone: 'neutral', isIgnored: false })} 
                                className="w-full text-center py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-neutral-200 shadow-sm"
                              >
                                <Plus size={12}/> Add Variation
                              </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'USAGE' && (
                  <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                          <BookText size={12}/> Usage Guide (Markdown)
                        </label>
                      </div>
                      <textarea 
                        value={formData.essayEdit} 
                        onChange={e => setFormData('essayEdit', e.target.value)} 
                        rows={12}
                        className="w-full p-4 bg-white border border-neutral-200 rounded-2xl font-mono text-xs leading-relaxed focus:ring-2 focus:ring-neutral-900 outline-none resize-y"
                        placeholder="Enter the Usage Guide Markdown content here..."
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                          <ClipboardList size={12}/> Practice Test (Markdown)
                        </label>
                      </div>
                      <textarea 
                        value={formData.testEdit} 
                        onChange={e => setFormData('testEdit', e.target.value)} 
                        rows={12}
                        className="w-full p-4 bg-white border border-neutral-200 rounded-2xl font-mono text-xs leading-relaxed focus:ring-2 focus:ring-neutral-900 outline-none resize-y"
                        placeholder="Enter the Practice Test Markdown content here..."
                      />
                    </div>
                  </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
