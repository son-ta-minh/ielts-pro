import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Layers3, Loader2, Play, Search, Plus, Trash2, Edit3, X, BookOpen, ArrowLeft, ChevronRight, ChevronLeft, ChevronDown, CheckCircle2, Save, Sparkles, Eye, BookText, Unlink, PenLine, Palette, Underline, FileText, AlignLeft } from 'lucide-react';
import { VocabularyItem, Unit, ReviewGrade, User } from '../app/types';
import { getUnitsByUserId, saveUnit, deleteUnit, getAllWordsForExport, saveWord, bulkSaveWords } from '../app/db';
import ConfirmationModal from './ConfirmationModal';
import EditWordModal from './EditWordModal';
import { getRemainingTime, createNewWord } from '../utils/srs';
import RefineUnitWithAiModal from './RefineUnitWithAiModal';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[]) => void;
}

const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

// Tooltip State Interface
interface TooltipState {
    word: VocabularyItem;
    rect: DOMRect;
}

type HighlightColor = 'amber' | 'emerald' | 'sky' | 'rose';

const highlightStyles: Record<HighlightColor, string> = {
    amber: "bg-amber-200/60 text-neutral-900 border-amber-300",
    emerald: "bg-emerald-200/60 text-neutral-900 border-emerald-300",
    sky: "bg-sky-200/60 text-neutral-900 border-sky-300",
    rose: "bg-rose-200/60 text-neutral-900 border-rose-300",
};

const getStatusBadge = (item: VocabularyItem) => {
    if (!item.lastReview) return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-100">New</span>;
    switch (item.lastGrade) {
        case ReviewGrade.FORGOT: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-rose-50 text-rose-600 border border-rose-100">Forgot</span>;
        case ReviewGrade.HARD: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-orange-50 text-orange-600 border border-orange-100">Hard</span>;
        case ReviewGrade.EASY: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-green-50 text-green-600 border border-green-100">Easy</span>;
        default: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-neutral-50 text-neutral-400 border border-neutral-100">Studied</span>;
    }
};

// Helper: Parse the vocabulary string "essay:base; word" into a Map
const parseVocabMapping = (vocabString: string): Map<string, string> => {
    const map = new Map<string, string>();
    const entries = vocabString.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
    entries.forEach(entry => {
        const parts = entry.split(':').map(s => s.trim());
        const essayWord = parts[0];
        const baseWord = parts.length > 1 ? parts[1] : parts[0];
        
        if (essayWord && baseWord) {
            const essayLower = essayWord.toLowerCase();
            const baseLower = baseWord.toLowerCase();
            
            // Map the essay form to the base form
            map.set(essayLower, baseLower);
            
            // Also map the base form to itself, so if the base word appears in text, it highlights too
            if (!map.has(baseLower)) {
                map.set(baseLower, baseLower);
            }
        }
    });
    return map;
};

// Reusable Highlight Controls Component
const HighlightControls = ({ 
    isUnderlined, 
    toggleUnderline, 
    highlightColor, 
    setHighlightColor 
}: { 
    isUnderlined: boolean, 
    toggleUnderline: () => void, 
    highlightColor: HighlightColor, 
    setHighlightColor: (c: HighlightColor) => void 
}) => (
    <div className="flex items-center gap-3 bg-white p-1.5 rounded-full border border-neutral-200 shadow-sm">
        <button
            onClick={toggleUnderline}
            className={`p-1.5 rounded-full transition-all duration-200 ${isUnderlined ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-600'}`}
            title="Toggle Underline"
        >
            <Underline size={14} />
        </button>
        
        <div className="w-px h-4 bg-neutral-200 mx-1"></div>

        <div className="flex items-center gap-2">
            {(['amber', 'emerald', 'sky', 'rose'] as HighlightColor[]).map(color => (
                <button
                    key={color}
                    onClick={() => setHighlightColor(color)}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                        highlightColor === color 
                        ? `ring-2 ring-offset-2 ring-neutral-300 scale-110 bg-${color}-400` 
                        : `opacity-40 hover:opacity-100 bg-${color}-400`
                    }`}
                    title={`Highlight ${color}`}
                />
            ))}
        </div>
    </div>
);

const HighlightedEssay: React.FC<{ 
    text: string; 
    vocabString: string; 
    wordsByText: Map<string, VocabularyItem>; 
    isStudyMode: boolean;
    highlightColor: HighlightColor;
    isUnderlined: boolean;
    onHoverWord: (word: VocabularyItem | null, rect: DOMRect | null) => void;
}> = ({ text, vocabString, wordsByText, isStudyMode, highlightColor, isUnderlined, onHoverWord }) => {
    
    const mapping: Map<string, string> = useMemo(() => parseVocabMapping(vocabString), [vocabString]);

    if (!text) return null;
    
    // Sort keys by length descending to match longest phrases first (e.g. "look forward to" before "look")
    const sortedKeys = Array.from(mapping.keys()).sort((a: string, b: string) => b.length - a.length);
    
    if (sortedKeys.length === 0) return <span>{text}</span>;

    const escapedWords = sortedKeys.map((word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
    
    const parts = text.split(regex);
    return (
        <span>
            {parts.map((part, index) => {
                const isMatch = (index % 2) === 1;
                if (isMatch) {
                    const textLower = part.toLowerCase();
                    const baseWord = mapping.get(textLower);
                    const wordObj = baseWord ? wordsByText.get(baseWord) : undefined;
                    
                    if (isStudyMode && wordObj) {
                        return (
                            <span 
                                key={index} 
                                className={`${highlightStyles[highlightColor]} ${isUnderlined ? 'border-b-2' : ''} px-0.5 rounded-t-sm transition-all cursor-help font-semibold`}
                                onMouseEnter={(e) => onHoverWord(wordObj, e.currentTarget.getBoundingClientRect())}
                                onMouseLeave={() => onHoverWord(null, null)}
                            >
                                {part}
                            </span>
                        );
                    }
                    // Fallback for preview mode or missing words
                    return <span key={index} className="bg-neutral-200 text-neutral-900 px-0.5 rounded-sm">{part}</span>;
                }
                return <React.Fragment key={index}>{part}</React.Fragment>;
            })}
        </span>
    );
};

const renderHighlightedVocabInput = (text: string, wordsByText: Map<string, any>): React.ReactNode => {
    if (!text) return null;
    // Split by delimiters to preserve formatting while processing tokens
    const parts = text.split(/([;\n]+)/g); 
    
    return (
        <span>
            {parts.map((part, index) => {
                const trimmed = part.trim();
                // If delimiter or empty space, return as is
                if (!trimmed || /^[;\n]+$/.test(part)) {
                    return <span key={index}>{part}</span>;
                }
                
                // Parse "essay:base" or "word"
                const [essaySide, baseSide] = trimmed.split(':').map(s => s.trim());
                const baseWord = baseSide || essaySide;
                
                const isMissing = !wordsByText.has(baseWord.toLowerCase());
                
                if (isMissing) {
                    return <span key={index} className="bg-rose-50 text-rose-600 rounded-sm font-bold border-b border-rose-200">{part}</span>;
                }
                return <span key={index} className="text-neutral-900">{part}</span>;
            })}
        </span>
    );
};

// Header Edit Modal Component
const UnitHeaderEditModal = ({ 
    isOpen, 
    onClose, 
    initialName, 
    initialDesc, 
    onSave 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    initialName: string; 
    initialDesc: string; 
    onSave: (name: string, desc: string) => void;
}) => {
    const [localName, setLocalName] = useState(initialName);
    const [localDesc, setLocalDesc] = useState(initialDesc);

    // Reset local state when modal opens with new props
    useEffect(() => {
        if (isOpen) {
            setLocalName(initialName);
            setLocalDesc(initialDesc);
        }
    }, [isOpen, initialName, initialDesc]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="p-8 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2">
                            <Edit3 size={20} className="text-neutral-400"/>
                            Edit Header
                        </h3>
                        <button onClick={onClose} className="p-2 bg-neutral-50 rounded-full hover:bg-neutral-100 transition-colors">
                            <X size={20} className="text-neutral-400" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Unit Title</label>
                            <input 
                                value={localName} 
                                onChange={(e) => setLocalName(e.target.value)} 
                                placeholder="Enter unit title..." 
                                className="w-full px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-lg font-bold text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none transition-all"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Description</label>
                            <textarea 
                                value={localDesc} 
                                onChange={(e) => setLocalDesc(e.target.value)} 
                                placeholder="Enter a brief description or context..." 
                                className="w-full h-32 px-5 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium text-neutral-700 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button 
                            onClick={() => { onSave(localName, localDesc); onClose(); }} 
                            className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
                        >
                            Update Header
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const UnitsLab: React.FC<Props> = ({ user, onStartSession }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  
  const [showRefineAiModal, setShowRefineAiModal] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);

  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editWords, setEditWords] = useState('');
  const [editEssay, setEditEssay] = useState('');
  const [isPassagePreview, setIsPassagePreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [unitWordPage, setUnitWordPage] = useState(0);

  // New State for Header Modal
  const [isHeaderModalOpen, setIsHeaderModalOpen] = useState(false);

  // Highlighting State with Persistence
  const [highlightColor, setHighlightColor] = useState<HighlightColor>(() => {
      return (localStorage.getItem('ielts_pro_essay_highlight_color') as HighlightColor) || 'amber';
  });
  const [isUnderlined, setIsUnderlined] = useState(() => {
      const stored = localStorage.getItem('ielts_pro_essay_underline');
      return stored !== null ? stored === 'true' : true;
  });

  // Tooltip State
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);

  const vocabScrollRef = useRef<HTMLDivElement>(null);
  const vocabTextareaRef = useRef<HTMLTextAreaElement>(null);
  const essayInputRef = useRef<HTMLTextAreaElement>(null);

  const wordsById = useMemo(() => new Map(allWords.map(w => [w.id, w])), [allWords]);
  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);
  
  // Live Preview Map: Includes existing words AND temporary placeholders for new words being typed
  const previewWordsByText = useMemo(() => {
      const map = new Map(wordsByText);
      if (!editWords) return map;

      const entries = editWords.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
      entries.forEach(entry => {
          const parts = entry.split(':').map(s => s.trim());
          const baseWord = parts.length > 1 ? parts[1] : parts[0];
          const lowerBase = baseWord.toLowerCase();
          
          if (baseWord && !map.has(lowerBase)) {
              // Create a temporary placeholder so it highlights in preview immediately
              const tempItem = createNewWord(baseWord, '...', '(New Item)', '', '', []);
              tempItem.id = `temp-${lowerBase}`;
              map.set(lowerBase, tempItem);
          }
      });
      return map;
  }, [wordsByText, editWords]);

  const selectedUnitWords = useMemo(() => {
    if (!selectedUnit) return [];
    return selectedUnit.wordIds.map(id => wordsById.get(id)).filter(Boolean) as VocabularyItem[];
  }, [selectedUnit, wordsById]);

  const pagedUnitWords = useMemo(() => {
    const start = unitWordPage * 10;
    return selectedUnitWords.slice(start, start + 10);
  }, [selectedUnitWords, unitWordPage]);

  const totalUnitWordPages = Math.ceil(selectedUnitWords.length / 10);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userUnits, userWords] = await Promise.all([
        getUnitsByUserId(user.id),
        getAllWordsForExport(user.id)
      ]);
      setUnits(userUnits.sort((a,b) => b.createdAt - a.createdAt));
      setAllWords(userWords);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Persist Highlight Settings
  useEffect(() => {
      localStorage.setItem('ielts_pro_essay_highlight_color', highlightColor);
  }, [highlightColor]);

  useEffect(() => {
      localStorage.setItem('ielts_pro_essay_underline', String(isUnderlined));
  }, [isUnderlined]);
  
  const startEditing = (unit: Unit) => {
    setSelectedUnit(unit);
    setIsStudyMode(false);
    setEditName(unit.name);
    setEditDesc(unit.description);
    setEditEssay(unit.essay || '');
    setIsPassagePreview(false);
    
    // Prioritize customVocabString if available (preserves mapping)
    // Otherwise regenerate from wordIds (loses mapping, only base words)
    if (unit.customVocabString) {
        setEditWords(unit.customVocabString);
    } else {
        const currentWordsText = unit.wordIds
            .map(id => wordsById.get(id)?.word)
            .filter(Boolean)
            .join('; ');
        setEditWords(currentWordsText);
    }
  };

  const handleSyncVocabScroll = () => {
    if (vocabTextareaRef.current && vocabScrollRef.current) {
        vocabScrollRef.current.scrollTop = vocabTextareaRef.current.scrollTop;
        vocabScrollRef.current.scrollLeft = vocabTextareaRef.current.scrollLeft;
    }
  };

  const handleCreateEmptyUnit = async () => {
    const newUnit: Unit = { id: generateId(), userId: user.id, name: "New Unit", description: "", wordIds: [], createdAt: Date.now(), updatedAt: Date.now(), essay: "" };
    await saveUnit(newUnit);
    await loadData();
    startEditing(newUnit);
  };

  const handleSaveUnitChanges = async () => {
    if (!selectedUnit) return;
    setIsSaving(true);
    try {
        const entries = editWords.split(/[;\n]+/).map(w => w.trim()).filter(Boolean);
        const uniqueBaseWords = new Set<string>();
        
        // Extract base words for DB logic
        for(const entry of entries) {
            const [essaySide, baseSide] = entry.split(':');
            const base = baseSide ? baseSide.trim() : essaySide.trim();
            if (base) uniqueBaseWords.add(base.toLowerCase());
        }

        const finalWordIds: string[] = [];
        const newWordsToCreate: VocabularyItem[] = [];

        for (const token of uniqueBaseWords) {
            const existingWord = wordsByText.get(token);

            if (existingWord) {
                finalWordIds.push(existingWord.id);
            } else {
                const newWord = createNewWord(token, '', '', '', `Linked to unit: ${editName}`, ['ielts', 'unit-generated']);
                newWord.userId = user.id;
                newWordsToCreate.push(newWord);
                finalWordIds.push(newWord.id);
            }
        }

        if (newWordsToCreate.length > 0) await bulkSaveWords(newWordsToCreate);

        const updatedUnit: Unit = { 
            ...selectedUnit, 
            name: editName, 
            description: editDesc, 
            essay: editEssay, 
            wordIds: finalWordIds, 
            customVocabString: editWords, // Persist the manual mapping!
            updatedAt: Date.now() 
        };
        
        await saveUnit(updatedUnit);
        await loadData();
        setSelectedUnit(updatedUnit);
    } finally { setIsSaving(false); }
  };

  const handleRemoveWordFromUnit = async (wordId: string) => {
    if (!selectedUnit) return;
    
    const wordToRemove = wordsById.get(wordId);
    let newVocabString = selectedUnit.customVocabString;
    
    if (wordToRemove && newVocabString) {
        newVocabString = undefined; // Force regenerate from IDs next time
    }

    const updatedUnit = { 
        ...selectedUnit, 
        wordIds: selectedUnit.wordIds.filter(id => id !== wordId), 
        customVocabString: newVocabString, 
        updatedAt: Date.now() 
    };
    
    await saveUnit(updatedUnit);
    setSelectedUnit(updatedUnit);
    await loadData();
  };

  const handleDeleteUnit = async () => {
    if (!unitToDelete) return;
    await deleteUnit(unitToDelete.id);
    await loadData();
    setUnitToDelete(null);
    if(selectedUnit?.id === unitToDelete.id) { setSelectedUnit(null); setIsStudyMode(false); }
  };

  const handleSaveWordUpdate = async (updatedWord: VocabularyItem) => {
    await saveWord(updatedWord);
    await loadData();
  };

  const handleApplyRefinement = (refined: { name: string; description: string; words: string; essay: string }) => {
    setEditName(refined.name);
    setEditDesc(refined.description);
    setEditWords(refined.words);
    setEditEssay(refined.essay);
    setShowRefineAiModal(false);
  };

  const handleHoverWord = (word: VocabularyItem | null, rect: DOMRect | null) => {
      if (!word || !rect) {
          setActiveTooltip(null);
      } else {
          setActiveTooltip({ word, rect });
      }
  };

  const unitStats = useMemo(() => {
    const learnedWordIds = new Set(allWords.filter(w => w.lastReview && !w.isPassive).map(w => w.id));
    const statsMap = new Map<string, { isCompleted: boolean }>();
    units.forEach(unit => {
        const wordObjectsInUnit = unit.wordIds.map(id => wordsById.get(id)).filter(Boolean) as VocabularyItem[];
        const activeWordIdsInUnit = wordObjectsInUnit.filter(w => !w.isPassive).map(w => w.id);
        const isCompleted = activeWordIdsInUnit.length > 0 && activeWordIdsInUnit.every(id => learnedWordIds.has(id));
        statsMap.set(unit.id, { isCompleted });
    });
    return statsMap;
  }, [units, allWords, wordsById]);

  const filteredUnits = useMemo(() => {
      if (!query) return units;
      const lowerQuery = query.toLowerCase();
      return units.filter(u => u.name.toLowerCase().includes(lowerQuery) || u.description.toLowerCase().includes(lowerQuery));
  }, [units, query]);

  const pagedUnits = useMemo(() => {
      const start = page * pageSize;
      return filteredUnits.slice(start, start + pageSize);
  }, [filteredUnits, page, pageSize]);
  const totalListPages = Math.ceil(filteredUnits.length / pageSize);

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>;
  
  return (
    <>
      {selectedUnit ? (
        <>
          {isStudyMode ? (
            <div className="max-w-4xl mx-auto space-y-6 pb-24 relative animate-in fade-in duration-300">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <button onClick={() => { setSelectedUnit(null); setIsStudyMode(false); }} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors">
                        <ArrowLeft size={16} /><span>Back to Unit Lab</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <button onClick={() => startEditing(selectedUnit)} className="px-6 py-2 bg-neutral-100 text-neutral-600 rounded-xl font-black text-[10px] hover:bg-neutral-200 transition-all flex items-center space-x-2 active:scale-95 uppercase tracking-widest border border-neutral-200"><Edit3 size={16} /><span>Edit</span></button>
                        <button onClick={() => onStartSession(selectedUnitWords)} disabled={selectedUnitWords.length === 0} className="px-8 py-2 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm"><Play size={16} fill="white" /><span>Practice</span></button>
                    </div>
                </header>

                <div className="px-2 space-y-1">
                    <h3 className="text-xl font-bold text-neutral-900 tracking-tight">{selectedUnit.name}</h3>
                    <p className="text-xs text-neutral-500 font-medium">{selectedUnit.description || 'Focus on context.'}</p>
                </div>

                <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-3 border-b border-neutral-100 bg-neutral-50/30 flex justify-end">
                       <HighlightControls 
                          isUnderlined={isUnderlined} 
                          toggleUnderline={() => setIsUnderlined(!isUnderlined)} 
                          highlightColor={highlightColor} 
                          setHighlightColor={setHighlightColor} 
                       />
                    </div>
                    <div className="p-8 md:p-12 min-h-[30vh] max-h-[60vh] overflow-y-auto stable-scrollbar relative">
                        <div className="text-base leading-[2.2] text-neutral-800 font-normal whitespace-pre-wrap font-sans">
                            <HighlightedEssay 
                                text={selectedUnit.essay || ''} 
                                vocabString={editWords} 
                                wordsByText={wordsByText} 
                                isStudyMode={true} 
                                highlightColor={highlightColor}
                                isUnderlined={isUnderlined}
                                onHoverWord={handleHoverWord}
                            />
                        </div>
                        
                        {!selectedUnit.essay && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-300 pointer-events-none">
                                <BookText size={48} className="mb-4 opacity-10" />
                                <p className="font-bold text-neutral-400 uppercase tracking-widest text-[10px]">No content context found.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead><tr className="bg-neutral-50/50 border-b border-neutral-100"><th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vocabulary</th><th className="px-6 py-5 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th><th className="px-4 py-5 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Next Review</th><th className="px-6 py-5 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Actions</th></tr></thead>
                            <tbody className="divide-y divide-neutral-50">
                                {pagedUnitWords.length === 0 ? (
                                    <tr><td colSpan={4} className="p-20 text-center text-sm font-medium italic text-neutral-300">No words linked.</td></tr>
                                ) : (
                                    pagedUnitWords.map(word => {
                                        const reviewStatus = getRemainingTime(word.nextReview);
                                        return (
                                            <tr key={word.id} className="hover:bg-neutral-50/80 cursor-pointer group transition-colors" onClick={() => setEditingWord(word)}>
                                                <td className="px-6 py-5">
                                                    <div className="font-bold text-neutral-900">{word.word}</div>
                                                    <div className="flex items-center space-x-2 mt-1"><span className="text-[10px] font-mono text-neutral-400">{word.ipa || '/?/'}</span>{word.isPassive && <span className="text-[8px] font-black uppercase text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-md">Archived</span>}</div>
                                                </td>
                                                <td className="px-6 py-5 text-center">{getStatusBadge(word)}</td>
                                                <td className="px-4 py-5 text-center"><div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${reviewStatus.urgency === 'due' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-neutral-50 text-neutral-400 border border-neutral-100'}`}><span>{reviewStatus.label}</span></div></td>
                                                <td className="px-6 py-5 text-right"><div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setEditingWord(word); }} className="p-2.5 text-neutral-300 hover:text-neutral-900 transition-all"><Edit3 size={16} /></button><button onClick={(e) => { e.stopPropagation(); handleRemoveWordFromUnit(word.id); }} className="p-2.5 text-neutral-300 hover:text-rose-500 transition-all"><Unlink size={16} /></button></div></td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                        {totalUnitWordPages > 1 && (
                            <div className="p-6 bg-neutral-50/30 flex items-center justify-between border-t border-neutral-100">
                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Page {unitWordPage + 1} of {totalUnitWordPages}</span>
                                <div className="flex space-x-2"><button disabled={unitWordPage === 0} onClick={() => setUnitWordPage(p => p - 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronLeft size={14} /></button><button disabled={(unitWordPage + 1) >= totalUnitWordPages} onClick={() => setUnitWordPage(p => p + 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronRight size={14} /></button></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
          ) : (
            <div className="max-w-[1600px] mx-auto space-y-4 pb-12 relative animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                        <button onClick={() => { setSelectedUnit(null); setIsStudyMode(false); }} className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider">
                            <ArrowLeft size={14} /><span>Back</span>
                        </button>
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Edit Unit</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowRefineAiModal(true)} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all"><Sparkles size={14} className="text-amber-500"/><span>AI Refine</span></button>
                        <button onClick={handleSaveUnitChanges} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-neutral-900/10">{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}<span>Save Changes</span></button>
                    </div>
                </div>

                {/* Updated Header Display Card with Edit Button */}
                <div className="bg-white px-5 py-4 rounded-3xl border border-neutral-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in slide-in-from-bottom-2 group">
                    <div className="space-y-1 flex-1">
                        <h3 className="text-xl font-black text-neutral-900 leading-tight">{editName || "Untitled Unit"}</h3>
                        <p className="text-sm font-medium text-neutral-500 leading-relaxed whitespace-pre-wrap line-clamp-2">{editDesc || "No description provided."}</p>
                    </div>
                    <button 
                        onClick={() => setIsHeaderModalOpen(true)}
                        className="shrink-0 flex items-center space-x-2 px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs transition-all active:scale-95"
                    >
                        <FileText size={16} />
                        <span>Edit Header</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
                    {/* Reading Passage Column */}
                    <div className="flex flex-col gap-2 h-full">
                        <div className="flex justify-between items-center px-1 shrink-0">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><BookText size={12}/> Reading Passage</label>
                            <button onClick={() => setIsPassagePreview(!isPassagePreview)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm">
                                {isPassagePreview ? <PenLine size={12}/> : <Eye size={12}/>}
                                <span>{isPassagePreview ? 'Edit Text' : 'Preview'}</span>
                            </button>
                        </div>
                        
                        <div className="flex-1 rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm relative flex flex-col">
                            {isPassagePreview ? (
                                <>
                                     <div className="px-4 py-2 border-b border-neutral-100 bg-neutral-50/50 flex justify-end shrink-0">
                                        <HighlightControls 
                                            isUnderlined={isUnderlined} 
                                            toggleUnderline={() => setIsUnderlined(!isUnderlined)} 
                                            highlightColor={highlightColor} 
                                            setHighlightColor={setHighlightColor} 
                                        />
                                     </div>
                                     <div className="flex-1 p-6 text-sm font-medium leading-relaxed whitespace-pre-wrap overflow-y-auto stable-scrollbar text-neutral-800">
                                        <HighlightedEssay 
                                            text={editEssay} 
                                            vocabString={editWords} 
                                            wordsByText={previewWordsByText} 
                                            isStudyMode={true} 
                                            highlightColor={highlightColor}
                                            isUnderlined={isUnderlined}
                                            onHoverWord={handleHoverWord} 
                                        />
                                     </div>
                                </>
                            ) : (
                                <textarea 
                                    ref={essayInputRef}
                                    value={editEssay} 
                                    onChange={(e) => setEditEssay(e.target.value)} 
                                    placeholder="Paste or write your reading material here..." 
                                    className="w-full h-full p-6 bg-white resize-none focus:bg-neutral-50/30 outline-none transition-all text-sm font-medium leading-relaxed text-neutral-900 placeholder:text-neutral-300 overflow-y-auto stable-scrollbar" 
                                />
                            )}
                        </div>
                    </div>

                    {/* Vocabulary Column */}
                    <div className="flex flex-col gap-2 h-full">
                        <div className="flex justify-between items-center px-1 shrink-0">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><BookOpen size={12}/> Target Vocabulary</label>
                            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{editWords.split(/[:;,\n]+/).filter(Boolean).length} items</span>
                        </div>
                        
                        <div className="flex-1 relative rounded-3xl border border-neutral-200 bg-white shadow-sm overflow-hidden group">
                            {/* Background Overlay for Highlights */}
                            <div 
                                ref={vocabScrollRef} 
                                aria-hidden="true" 
                                className="absolute inset-0 p-6 text-sm font-medium leading-relaxed whitespace-pre-wrap pointer-events-none overflow-auto no-scrollbar font-sans" 
                            >
                                {renderHighlightedVocabInput(editWords, wordsByText)}
                            </div>
                            
                            {/* Foreground Transparent Textarea */}
                            <textarea 
                                ref={vocabTextareaRef} 
                                value={editWords} 
                                onChange={(e) => setEditWords(e.target.value)} 
                                onScroll={handleSyncVocabScroll} 
                                placeholder="word; essay_word:base_word; ..." 
                                className="absolute inset-0 w-full h-full p-6 bg-transparent resize-none outline-none transition-all text-sm font-medium leading-relaxed text-transparent caret-neutral-900 overflow-auto font-sans placeholder:text-neutral-300 focus:bg-neutral-50/10"
                                style={{ fontVariantLigatures: 'none' }}
                            />
                        </div>
                        <p className="text-[9px] text-neutral-400 px-2 font-medium italic text-right shrink-0">Words separated by semicolon (;). Use <span className="text-neutral-600 font-bold">essay_word:base_word</span> if different. <span className="text-rose-500 font-bold">Red</span> = not in library.</p>
                    </div>
                </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6 pb-20">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div><h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Unit Lab</h2><p className="text-neutral-500 mt-1 font-medium">Curated collections for intensive prep.</p></div>
            <button onClick={handleCreateEmptyUnit} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm"><Plus size={16} /><span>New Unit</span></button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative w-full md:col-span-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter your units..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm" />
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-neutral-50/50 border-b border-neutral-100"><th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Unit Name</th><th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vocabulary</th><th className="px-6 py-5 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th><th className="px-6 py-5 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Actions</th></tr></thead>
                    <tbody className="divide-y divide-neutral-50">
                        {pagedUnits.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-20 text-center">
                                    <div className="flex flex-col items-center justify-center text-neutral-400 space-y-4">
                                        <Layers3 size={48} strokeWidth={1.5} className="opacity-10"/>
                                        <p className="font-bold text-neutral-900 uppercase tracking-widest text-[10px]">Unit Lab Empty</p>
                                        <button onClick={handleCreateEmptyUnit} className="text-indigo-600 font-bold text-sm hover:underline">Create your first unit</button>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            pagedUnits.map(unit => {
                                const { isCompleted } = unitStats.get(unit.id) || { isCompleted: false };
                                return (
                                    <tr key={unit.id} className="hover:bg-neutral-50/80 cursor-pointer transition-colors group" onClick={() => { setSelectedUnit(unit); startEditing(unit); setIsStudyMode(true); }}>
                                        <td className="px-6 py-5"><div className="font-bold text-neutral-900 text-base">{unit.name}</div><div className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{unit.description}</div></td>
                                        <td className="px-6 py-5"><div className="text-sm font-bold text-neutral-700">{unit.wordIds.length} items</div></td>
                                        <td className="px-6 py-5 text-center">{isCompleted && <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-50 text-green-700 border border-green-100"><CheckCircle2 size={12} /><span>Mastered</span></div>}</td>
                                        <td className="px-6 py-5 text-right"><div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setSelectedUnit(unit); startEditing(unit); setIsStudyMode(true); }} className="p-2.5 text-neutral-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all"><Eye size={18}/></button><button onClick={(e) => { e.stopPropagation(); startEditing(unit); }} className="p-2.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-all"><Edit3 size={18} /></button><button onClick={(e) => { e.stopPropagation(); setUnitToDelete(unit); }} className="p-2.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button></div></td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
                <div className="p-6 bg-neutral-50/30 flex items-center justify-between border-t border-neutral-100">
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Page {page + 1} of {totalListPages || 1}</span>
                  <div className="flex space-x-2"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronLeft size={14} /></button><button disabled={(page + 1) >= totalListPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronRight size={14} /></button></div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Tooltip Portal */}
      {activeTooltip && (
        <div 
            className="fixed z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
            style={{
                top: `${activeTooltip.rect.top - 10}px`,
                left: `${activeTooltip.rect.left}px`,
                transform: 'translateY(-100%)'
            }}
        >
            <div className="bg-white px-4 py-3 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-cyan-100 flex flex-col items-start text-left space-y-1 min-w-[140px] relative">
                <div className="text-sky-600 font-sans text-xs font-bold tracking-wide">
                    {activeTooltip.word.ipa || '/?/'}
                </div>
                <div className="text-sm font-black text-slate-800 leading-none">
                    {activeTooltip.word.meaningVi}
                </div>
                <div className="absolute top-full left-4 -mt-1 w-3 h-3 bg-white border-r border-b border-cyan-100 rotate-45 transform" />
            </div>
        </div>
      )}

      <UnitHeaderEditModal 
        isOpen={isHeaderModalOpen} 
        onClose={() => setIsHeaderModalOpen(false)}
        initialName={editName}
        initialDesc={editDesc}
        onSave={(name, desc) => { setEditName(name); setEditDesc(desc); }}
      />

      {unitToDelete && <ConfirmationModal isOpen={!!unitToDelete} title="Delete Unit?" message={<>Are you sure you want to delete <strong className="capitalize">"{unitToDelete.name}"</strong>? Your library vocabulary will not be affected.</>} confirmText="Confirm Delete" isProcessing={false} onConfirm={handleDeleteUnit} onClose={() => setUnitToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>}/>}
      {editingWord && <EditWordModal word={editingWord} onSave={handleSaveWordUpdate} onClose={() => setEditingWord(null)} />}
      {showRefineAiModal && <RefineUnitWithAiModal user={user} currentData={{ name: editName, description: editDesc, words: editWords, essay: editEssay }} onApply={handleApplyRefinement} onClose={() => setShowRefineAiModal(false)} />}
    </>
  );
};

export default UnitsLab;