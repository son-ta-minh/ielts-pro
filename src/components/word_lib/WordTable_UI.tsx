import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Trash2, ChevronLeft, ChevronRight, Loader2, Edit3, CheckCircle2, AlertCircle, Wand2, CheckSquare, Square, X, ChevronDown, Tag, AtSign, Plus, Save, Eye, Columns, Activity, Calendar, Network, Unlink, ListFilter, ShieldCheck, ShieldX, Ghost, Zap, Binary, FolderTree, BookOpen, Quote, Layers, Combine, MessageSquare, Archive, RefreshCw, PenLine, BookMarked, Image, Play } from 'lucide-react';
import { VocabularyItem, LearnedStatus, WordQuality, WordTypeOption, WordBook } from '../../app/types';
import { getRemainingTime } from '../../utils/srs';
import { TagBrowser, TagTreeNode } from '../common/TagBrowser';
import { WordRefineProgressSnapshot } from '../../services/wordRefineApi';

export type FilterType = 'all' | 'vocab' | 'idiom' | 'phrasal' | 'colloc' | 'phrase' | 'archive' | 'focus' | 'duplicate';
export type RefinedFilter = 'all' | 'raw' | 'refined' | 'verified' | 'failed' | 'not_refined';
export type StatusFilter = 'all' | 'new' | 'forgot' | 'hard' | 'easy' | 'learned';
export type RegisterFilter = 'all' | 'academic' | 'casual' | 'neutral' | 'raw';
export type CompositionFilter = 'all' | 'composed' | 'not_composed';
export type BookFilter = 'all' | 'in_book' | 'not_in_book' | 'specific';

interface VisibilitySettings {
  showIPA: boolean;
  showMeaning: boolean;
  showGroups: boolean;
  blurMeaning: boolean;
  showProgress: boolean;
  showDue: boolean;
  showAiIcon: boolean;
  showFamilyIcon: boolean;
  showPrepIcon: boolean;
  showMastery: boolean;
  showComplexity: boolean;
}

export const DEFAULT_VISIBILITY: VisibilitySettings = {
  showIPA: false,
  showMeaning: false,
  showGroups: false,
  blurMeaning: true,
  showProgress: true,
  showDue: false,
  showAiIcon: true,
  showFamilyIcon: true,
  showPrepIcon: true,
  showMastery: true,
  showComplexity: true, 
};

const VisibilityToggle = ({ label, checked, onChange, subItem }: { label: React.ReactNode, checked: boolean, onChange: () => void, subItem?: boolean }) => (
    <button onClick={onChange} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700 ${subItem ? 'pl-8' : ''}`}>
        <span className="flex items-center gap-2">{label}</span>
        {checked ? <CheckCircle2 size={14} className="text-green-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-neutral-200"></div>}
    </button>
);

const GroupFilterCombobox: React.FC<{
    value: string | null | undefined;
    options: string[];
    onChange: (value: string | null) => void;
}> = ({ value, options, onChange }) => {
    const [query, setQuery] = useState(value || '');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery(value || '');
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        const uniqueOptions = Array.from(new Set(options));
        if (!normalized) return uniqueOptions;
        return uniqueOptions.filter((option) => option.toLowerCase().includes(normalized));
    }, [options, query]);

    const commitValue = (nextValue: string | null) => {
        onChange(nextValue && nextValue.trim() ? nextValue.trim() : null);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                <input
                    id="group-filter"
                    value={query}
                    onChange={(e) => {
                        const nextValue = e.target.value;
                        setQuery(nextValue);
                        setIsOpen(true);
                        if (!nextValue.trim()) onChange(null);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const exactMatch = filteredOptions.find((option) => option.toLowerCase() === query.trim().toLowerCase());
                            commitValue(exactMatch || (query.trim() || null));
                        } else if (e.key === 'Escape') {
                            setIsOpen(false);
                            setQuery(value || '');
                        }
                    }}
                    placeholder="Type to filter groups..."
                    className="w-full pl-9 pr-16 py-2 rounded-lg text-xs font-bold text-neutral-900 placeholder:text-neutral-400 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {value && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('');
                                onChange(null);
                                setIsOpen(false);
                            }}
                            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                            title="Clear group filter"
                        >
                            <X size={12} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsOpen((prev) => !prev)}
                        className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                        title="Toggle group suggestions"
                    >
                        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>
            {isOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl animate-in fade-in zoom-in-95">
                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-2">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => {
                                const isSelected = value === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                            setQuery(option);
                                            commitValue(option);
                                        }}
                                        className={`w-full rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${
                                            isSelected
                                                ? 'bg-neutral-900 text-white'
                                                : 'text-neutral-800 hover:bg-neutral-100'
                                        }`}
                                        title={option}
                                    >
                                        <span className="block truncate">{option}</span>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-3 py-6 text-center text-xs font-bold text-neutral-400">
                                No groups match "{query.trim()}".
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const getStatusBadge = (item: VocabularyItem) => {
  if (!item.lastReview || item.learnedStatus === LearnedStatus.NEW) return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">New</span>;
  
  switch (item.learnedStatus) {
    case LearnedStatus.IGNORED:
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-neutral-100 text-neutral-600 border border-neutral-200 whitespace-nowrap">Ignored</span>;
    case LearnedStatus.FORGOT: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-rose-50 text-rose-600 border border-rose-100 whitespace-nowrap">Forgot</span>;
    case LearnedStatus.LEARNED: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-cyan-50 text-cyan-600 border border-cyan-100 whitespace-nowrap">Learned</span>;
    case LearnedStatus.HARD: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-orange-50 text-orange-600 border border-orange-100 whitespace-nowrap">Hard</span>;
    case LearnedStatus.EASY: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-green-50 text-green-600 border border-green-100 whitespace-nowrap">Easy</span>;
    default: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-neutral-50 text-neutral-400 border border-neutral-100 whitespace-nowrap">Studied</span>;
  }
};

const getQualityIcon = (quality: WordQuality) => {
    switch (quality) {
        case WordQuality.VERIFIED: return <span title="Verified Content"><ShieldCheck size={14} className="text-emerald-500" /></span>;
        case WordQuality.REFINED: return <span title="AI Refined - Needs Verification"><Wand2 size={14} className="text-indigo-500" /></span>;
        case WordQuality.FAILED: return <span title="Verification Failed"><ShieldX size={14} className="text-rose-500" /></span>;
        default: return <span title="Raw Content"><Ghost size={14} className="text-neutral-300" /></span>;
    }
};

const getScoreCellClasses = (score: number | undefined | null): string => {
    const s = score ?? 0;
    if (s >= 80) return 'text-green-700 bg-green-100';
    if (s >= 50) return 'text-yellow-700 bg-yellow-100';
    if (s > 0) return 'text-orange-700 bg-orange-100';
    return 'text-neutral-500 bg-neutral-100';
};

const TYPE_OPTIONS: { id: WordTypeOption; label: string; icon: React.ElementType }[] = [
    { id: 'vocab', label: 'Vocabulary', icon: BookOpen },
    { id: 'idiom', label: 'Idiom', icon: Quote },
    { id: 'phrasal', label: 'Phrasal Verb', icon: Layers },
    { id: 'collocation', label: 'Collocation', icon: Combine },
    { id: 'phrase', label: 'Phrase', icon: MessageSquare },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'focus', label: 'Focus', icon: Zap },
];

const BookIcon: React.FC<{ icon: string; className?: string }> = ({ icon, className }) => {
    if (!icon) return null;
    const isUrl = icon?.startsWith('http') || icon?.startsWith('data:image');
    if (isUrl) {
        return <img src={icon} className={`object-contain ${className}`} alt="Book icon" />;
    }
    return <span className={className}>{icon}</span>;
};

// --- AddToBookModal ---
const AddToBookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (bookId: string) => void;
    books: WordBook[];
    selectedCount: number;
}> = ({ isOpen, onClose, onConfirm, books, selectedCount }) => {
    const [query, setQuery] = useState('');
    
    const shelves = useMemo(() => {
        const map = new Map<string, WordBook[]>();
        books.forEach(b => {
            const shelfName = b.topic.split(':')[0].trim() || 'General';
            if (!map.has(shelfName)) map.set(shelfName, []);
            map.get(shelfName)!.push(b);
        });
        return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    }, [books]);

    const filteredShelves = useMemo(() => {
        if (!query.trim()) return shelves;
        const q = query.toLowerCase();
        return shelves.map(([name, bks]) => {
            const filteredBks = bks.filter(b => b.topic.toLowerCase().includes(q));
            return [name, filteredBks] as [string, WordBook[]];
        }).filter(([_, bks]) => bks.length > 0);
    }, [shelves, query]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[80vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Add to Word Book</h3>
                        <p className="text-xs text-neutral-500 font-bold mt-1 truncate">Adding {selectedCount} items...</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <div className="p-4 border-b border-neutral-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" size={14} />
                        <input 
                            value={query} 
                            onChange={e => setQuery(e.target.value)} 
                            placeholder="Search book..." 
                            className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                            autoFocus
                        />
                    </div>
                </div>
                <main className="p-4 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                    {filteredShelves.map(([shelfName, bks]) => (
                        <div key={shelfName} className="space-y-2">
                            <h4 className="px-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">{shelfName}</h4>
                            <div className="space-y-1">
                                {bks.map(b => {
                                    const displayTopic = b.topic.split(':').slice(1).join(':').trim() || b.topic;
                                    return (
                                        <button 
                                            key={b.id} 
                                            onClick={() => onConfirm(b.id)}
                                            className="w-full text-left px-4 py-3 rounded-xl border border-neutral-100 hover:border-neutral-300 hover:bg-neutral-50 transition-all font-bold text-sm text-neutral-700 flex items-center gap-3 group"
                                        >
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-neutral-100 group-hover:bg-white border border-transparent group-hover:border-neutral-200 shrink-0">
                                                <BookIcon icon={b.icon} className="text-base" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate">{displayTopic}</p>
                                                <p className="text-[10px] text-neutral-400 font-medium">{b.words.length} words</p>
                                            </div>
                                            <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-900" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {filteredShelves.length === 0 && (
                        <div className="text-center py-10 text-neutral-400 italic text-xs font-medium">No books found.</div>
                    )}
                </main>
                <footer className="px-8 py-4 border-t border-neutral-100 bg-neutral-50/50 rounded-b-[2.5rem] flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900">Cancel</button>
                </footer>
            </div>
        </div>
    );
};

export interface WordTableUIProps {
  words: VocabularyItem[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onPractice: (ids: Set<string>) => void;
  settingsKey: string;
  context: 'library' | 'unit';
  onViewWord: (word: VocabularyItem) => void;
  onEditWord: (word: VocabularyItem) => void;
  onDelete: (word: VocabularyItem) => Promise<void>;
  onHardDelete?: (word: VocabularyItem) => Promise<void>;
  query: string;
  setQuery: (q: string) => void;
  activeFilters: Set<FilterType>;
  refinedFilter: RefinedFilter;
  statusFilter: StatusFilter;
  registerFilter: RegisterFilter;
  compositionFilter: CompositionFilter;
  bookFilter: BookFilter;
  specificBookId: string;
  onSpecificBookChange: (id: string) => void;
  isAddExpanded: boolean;
  isFilterMenuOpen: boolean;
  quickAddInput: string;
  setQuickAddInput: (q: string) => void;
  isAdding: boolean;
  isViewMenuOpen: boolean;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  wordToDelete: VocabularyItem | null;
  setWordToDelete: (w: VocabularyItem | null) => void;
  isDeleting: boolean;
  setIsDeleting: (d: boolean) => void;
  wordToHardDelete?: VocabularyItem | null;
  setWordToHardDelete?: (w: VocabularyItem | null) => void;
  isHardDeleting?: boolean;
  setIsHardDeleting?: (d: boolean) => void;
  isAiModalOpen: boolean;
  setIsAiModalOpen: (o: boolean) => void;
  notification: {type: 'success' | 'error' | 'info', message: string} | null;
  viewMenuRef: React.RefObject<HTMLDivElement>;
  visibility: VisibilitySettings;
  setVisibility: (v: VisibilitySettings | ((v: VisibilitySettings) => VisibilitySettings)) => void;
  handleToggleFilter: (type: FilterType) => void;
  handleBatchAddSubmit: () => void;
  onOpenBulkDeleteModal?: () => void;
  onOpenBulkHardDeleteModal?: () => void;
  selectedWordsToRefine: VocabularyItem[];
  selectedRawWordsCount: number;
  handleGenerateRefinePrompt: (inputs: { words: string }) => string;
  handleAiRefinementResult: (results: any[]) => void;
  onApiRefineSelected: () => void;
  isApiRefining: boolean;
  apiRefineProgress: WordRefineProgressSnapshot | null;
  apiRefineHistory: WordRefineProgressSnapshot[];
  apiRefineFlushedCount: number;
  apiRefineTotalWords: number;
  isApiRefineLogOpen: boolean;
  onOpenApiRefineLog: () => void;
  onCloseApiRefineLog: () => void;
  onStopApiRefine: () => void;
  setStatusFilter: (sf: StatusFilter) => void;
  setRefinedFilter: (rf: RefinedFilter) => void;
  setRegisterFilter: (rf: RegisterFilter) => void;
  setCompositionFilter: (cf: CompositionFilter) => void;
  setBookFilter: (bf: BookFilter) => void;
  setIsViewMenuOpen: (o: boolean) => void;
  setIsFilterMenuOpen: (o: boolean) => void;
  setIsAddExpanded: (o: boolean) => void;
  selectedWordsMissingHintsCount: number;
  onOpenHintModal: () => void;
  showTagBrowserButton?: boolean;
  tagTree?: TagTreeNode[];
  selectedTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
  onRenameGroup?: (path: string, nextName: string) => Promise<void>;
  onDeleteGroup?: (path: string) => Promise<void>;
  
  // Updated props for Type Selector
  selectedTypes: Set<WordTypeOption>;
  toggleType: (type: WordTypeOption) => void;
  onOpenWordBook?: () => void;
  availableGroups: string[];
  onSetSelectedVocabularyType: (type: Exclude<WordTypeOption, 'archive' | 'focus' | 'duplicate'>) => void | Promise<void>;
  onSetSelectedArchive: (value: boolean) => void | Promise<void>;
  onSetSelectedFocus: (value: boolean) => void | Promise<void>;
  onSetSelectedQuality: (quality: WordQuality) => void | Promise<void>;
  onSetSelectedLearnedStatus: (status: LearnedStatus) => void | Promise<void>;
  onAddSelectedGroup: (group: string) => void | Promise<void>;
  onCopySelectedHeadwords: () => void | Promise<void>;
  
  // New props for Add to Book
  onOpenAddToBookModal: () => void;
  isAddToBookModalOpen: boolean;
  setIsAddToBookModalOpen: (o: boolean) => void;
  wordBooks: WordBook[];
  onConfirmAddToBook: (bookId: string) => void;
  // New prop for Pronunciation Queue
  onAddToPronunciation: () => void;
  // New prop for Bulk Paraphrase
  onOpenParaModal?: () => void;
}

export const WordTableUI: React.FC<WordTableUIProps> = ({
  words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
  onPractice, context, onViewWord, onEditWord, onDelete, onHardDelete, query, setQuery, activeFilters,
  refinedFilter, statusFilter, registerFilter, compositionFilter, bookFilter, specificBookId, onSpecificBookChange, isAddExpanded, isFilterMenuOpen, quickAddInput,
  setQuickAddInput, isAdding, isViewMenuOpen, selectedIds, setSelectedIds,
  wordToDelete, setWordToDelete, isDeleting, setIsDeleting,
  wordToHardDelete, setWordToHardDelete, isHardDeleting, setIsHardDeleting,
  isAiModalOpen, setIsAiModalOpen,
  notification, viewMenuRef, visibility, setVisibility, handleToggleFilter,
  handleBatchAddSubmit, onOpenBulkDeleteModal, onOpenBulkHardDeleteModal, selectedWordsToRefine, selectedRawWordsCount, handleGenerateRefinePrompt,
  handleAiRefinementResult, onApiRefineSelected, isApiRefining, apiRefineProgress, apiRefineHistory, isApiRefineLogOpen, onOpenApiRefineLog, onCloseApiRefineLog, onStopApiRefine, setStatusFilter, setRefinedFilter, setRegisterFilter, setCompositionFilter, setBookFilter, setIsViewMenuOpen,
  apiRefineFlushedCount, apiRefineTotalWords,
  setIsFilterMenuOpen, setIsAddExpanded, selectedWordsMissingHintsCount, onOpenHintModal,
  showTagBrowserButton, tagTree, selectedTag, onSelectTag,
  onRenameGroup, onDeleteGroup,
  selectedTypes, toggleType, onOpenWordBook,
  availableGroups, onSetSelectedVocabularyType, onSetSelectedArchive, onSetSelectedFocus, onSetSelectedQuality, onSetSelectedLearnedStatus, onAddSelectedGroup, onCopySelectedHeadwords,
  onOpenAddToBookModal, isAddToBookModalOpen, setIsAddToBookModalOpen, wordBooks, onConfirmAddToBook,
  onAddToPronunciation,
  onOpenParaModal
}) => {
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isRefineMenuOpen, setIsRefineMenuOpen] = useState(false);
  const [isSetAttributeMenuOpen, setIsSetAttributeMenuOpen] = useState(false);
  const [selectedBulkGroup, setSelectedBulkGroup] = useState('');
  const [newBulkGroup, setNewBulkGroup] = useState('');
  const groupSuggestions = useMemo(() => {
    const values: string[] = [];
    const visit = (nodes: TagTreeNode[]) => {
      nodes.forEach((node) => {
        values.push(node.path);
        if (node.children.length > 0) visit(node.children);
      });
    };
    if (tagTree) visit(tagTree);
    return values;
  }, [tagTree]);
  const totalPages = Math.ceil(total / pageSize);
  const totalApiRefineWords = apiRefineTotalWords || selectedWordsToRefine.length;
  const remainingApiRefineWords = Math.max(totalApiRefineWords - apiRefineFlushedCount, 0);
  const bulkGroupOptions = useMemo(
    () => Array.from(new Set(availableGroups.map(group => group.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [availableGroups]
  );
  const visibleColumnCount = 3
    + (visibility.showMeaning ? 1 : 0)
    + (visibility.showGroups ? 1 : 0)
    + ((visibility.showProgress || visibility.showDue) ? 1 : 0)
    + (visibility.showComplexity ? 1 : 0)
    + (visibility.showMastery ? 1 : 0);
  const defaultDeleteMessage = <span>Are you sure you want to permanently delete <span className="font-bold text-neutral-900">&quot;{wordToDelete?.word}&quot;</span>? This action cannot be undone.</span>;
  const unitUnlinkMessage = <span>Remove <span className="font-bold text-neutral-900">&quot;{wordToDelete?.word}&quot;</span> from this unit? It remains in your library.</span>;
  const handleApplyExistingGroup = async () => {
    const normalized = selectedBulkGroup.trim();
    if (!normalized) return;
    await onAddSelectedGroup(normalized);
    setSelectedBulkGroup('');
    setIsSetAttributeMenuOpen(false);
  };
  const handleApplyNewGroup = async () => {
    const normalized = newBulkGroup.trim();
    if (!normalized) return;
    await onAddSelectedGroup(normalized);
    setNewBulkGroup('');
    setIsSetAttributeMenuOpen(false);
  };
  const handleSetVocabularyType = async (type: Exclude<WordTypeOption, 'archive' | 'focus' | 'duplicate'>) => {
    await onSetSelectedVocabularyType(type);
    setIsSetAttributeMenuOpen(false);
  };
  const handleSetArchive = async (value: boolean) => {
    await onSetSelectedArchive(value);
    setIsSetAttributeMenuOpen(false);
  };
  const handleSetFocus = async (value: boolean) => {
    await onSetSelectedFocus(value);
    setIsSetAttributeMenuOpen(false);
  };
  const handleSetQuality = async (quality: WordQuality) => {
    await onSetSelectedQuality(quality);
    setIsSetAttributeMenuOpen(false);
  };
  const handleSetLearnedStatus = async (status: LearnedStatus) => {
    await onSetSelectedLearnedStatus(status);
    setIsSetAttributeMenuOpen(false);
  };
  const qualityOptions = [
    { id: WordQuality.RAW, label: 'Raw' },
    { id: WordQuality.REFINED, label: 'Refined' },
    { id: WordQuality.VERIFIED, label: 'Verified' },
    { id: WordQuality.FAILED, label: 'Failed' },
  ];
  const learnedStatusOptions = [
    { id: LearnedStatus.NEW, label: 'New' },
    { id: LearnedStatus.IGNORED, label: 'Ignored' },
    { id: LearnedStatus.LEARNED, label: 'Learned' },
    { id: LearnedStatus.FORGOT, label: 'Forgot' },
    { id: LearnedStatus.HARD, label: 'Hard' },
    { id: LearnedStatus.EASY, label: 'Easy' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      {notification && (<div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] bg-neutral-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-neutral-800 animate-in slide-in-from-top-4 flex items-center space-x-2">{notification.type === 'success' ? <CheckCircle2 size={18} className="text-green-400" /> : <AlertCircle size={18} className="text-orange-400" />}<span className="text-sm font-bold">{notification.message}</span></div>)}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
                <h2 className={`${context === 'library' ? 'text-3xl' : 'text-lg'} font-black text-neutral-900 tracking-tight`}>{context === 'library' ? 'Word Library' : 'Unit Vocabulary'}</h2>
                <p className={`${context === 'library' ? 'text-neutral-500 mt-2 font-medium' : 'text-neutral-500 text-xs font-bold mt-0.5'}`}>{total} items{context === 'library' ? ' collected.' : '.'}</p>
            </div>
            {context === 'library' && onOpenWordBook && (
                <button 
                    onClick={onOpenWordBook}
                    className="flex items-center gap-2.5 p-2 bg-white border border-neutral-200 rounded-2xl hover:border-indigo-400 hover:shadow-sm transition-all group shrink-0"
                >
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png" className="w-6 h-6 object-contain" alt="Word Book" />
                    </div>
                    <span className="text-sm font-black text-neutral-900 pr-3">Word Book</span>
                </button>
            )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <div className="relative w-full">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search words..."
                        className="w-full pl-10 pr-10 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
                    />
                    
                    {query && (
                        <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-900"
                        >
                        ✕
                        </button>
                    )}
                </div>            
            </div>
            <div className="flex gap-2">
                <div className="relative" ref={viewMenuRef}>
                    <button onClick={() => setIsViewMenuOpen(!isViewMenuOpen)} className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${isViewMenuOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="View Options">
                        <Eye size={16} /> <span className="hidden sm:inline">View</span>
                    </button>
                    {isViewMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50">Columns</div>
                            <VisibilityToggle label={<><Columns size={14}/>Meaning</>} checked={visibility.showMeaning} onChange={() => setVisibility(v => ({...v, showMeaning: !v.showMeaning}))} />
                            <VisibilityToggle label={<><FolderTree size={14}/>Group</>} checked={visibility.showGroups} onChange={() => setVisibility(v => ({...v, showGroups: !v.showGroups}))} />
                            {visibility.showMeaning && (<VisibilityToggle label="Hide until hover" subItem checked={visibility.blurMeaning} onChange={() => setVisibility(v => ({...v, blurMeaning: !v.blurMeaning}))} />)}
                            <VisibilityToggle label={<><Activity size={14}/>Progress Status</>} checked={visibility.showProgress} onChange={() => setVisibility(v => ({...v, showProgress: !v.showProgress}))} />
                            <VisibilityToggle label={<><Calendar size={14}/>Due Date</>} checked={visibility.showDue} onChange={() => setVisibility(v => ({...v, showDue: !v.showDue}))} />
                            <VisibilityToggle label={<><Zap size={14}/>Mastery Score</>} checked={visibility.showMastery} onChange={() => setVisibility(v => ({...v, showMastery: !v.showMastery}))} />
                            <VisibilityToggle label={<><Binary size={14}/>Complexity</>} checked={visibility.showComplexity} onChange={() => setVisibility(v => ({...v, showComplexity: !v.showComplexity}))} />
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 mt-1">Details</div>
                            <VisibilityToggle label="IPA Phonetic" checked={visibility.showIPA} onChange={() => setVisibility(v => ({...v, showIPA: !v.showIPA}))} />
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 mt-1">Indicators</div>
                            <VisibilityToggle label={<><Activity size={14} className="text-blue-500"/> Quality Status</>} checked={visibility.showAiIcon} onChange={() => setVisibility(v => ({...v, showAiIcon: !v.showAiIcon}))} />
                            <VisibilityToggle label={<><Network size={14} className="text-purple-500"/> Word Family</>} checked={visibility.showFamilyIcon} onChange={() => setVisibility(v => ({...v, showFamilyIcon: !v.showFamilyIcon}))} />
                            <VisibilityToggle label={<><AtSign size={14} className="text-orange-500"/> Prepositions</>} checked={visibility.showPrepIcon} onChange={() => setVisibility(v => ({...v, showPrepIcon: !v.showPrepIcon}))} />
                        </div>
                    )}
                </div>
                <button onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${isFilterMenuOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="Filter">
                    <ListFilter size={16} /> <span className="hidden sm:inline">Filter</span>
                </button>
                 {showTagBrowserButton && (
                    <button onClick={() => setIsTagBrowserOpen(!isTagBrowserOpen)} className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${isTagBrowserOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="Browse Groups">
                        <FolderTree size={16} /> <span className="hidden sm:inline">Groups</span>
                    </button>
                )}
                <button onClick={() => setIsAddExpanded(!isAddExpanded)} className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${isAddExpanded ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="Add Words">
                    <Plus size={16} /> <span className="hidden sm:inline">Add</span>
                </button>
            </div>
        </div>
        {isTagBrowserOpen && tagTree && onSelectTag && (
            <TagBrowser 
                tagTree={tagTree} 
                selectedTag={selectedTag || null} 
                onSelectTag={onSelectTag} 
                title="Group Browser" 
                icon={<FolderTree size={16} />} 
                onRenameGroup={onRenameGroup}
                onDeleteGroup={onDeleteGroup}
            />
        )}
        {isFilterMenuOpen && (
            <div className="bg-white border border-neutral-100 p-4 rounded-2xl grid gap-4 shadow-sm animate-in slide-in-from-top-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest w-16 shrink-0">Type</span>
                    <div className="flex flex-wrap gap-2">
                        {[ 'all', 'vocab', 'idiom', 'phrasal', 'colloc', 'phrase', 'archive', 'focus', 'duplicate' ].map(id => {
                            const isActive = activeFilters.has(id as FilterType);
                            const isDuplicate = id === 'duplicate';
                            let buttonClass = 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300';
                            if (isActive) {
                                buttonClass = isDuplicate ? 'bg-rose-600 text-white border-rose-600' : 'bg-neutral-900 text-white border-neutral-900';
                            }
                            return (<button key={id} onClick={() => handleToggleFilter(id as FilterType)} className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${buttonClass}`}>{id === 'all' ? 'All' : id.charAt(0).toUpperCase() + id.slice(1)}</button>)
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div>
                        <label htmlFor="status-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Status</label>
                        <select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold text-neutral-900 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'new', label: 'New' }, { id: 'learned', label: 'Learned' }, { id: 'easy', label: 'Easy' }, { id: 'hard', label: 'Hard' }, { id: 'forgot', label: 'Forgot' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="quality-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Quality</label>
                        <select id="quality-filter" value={refinedFilter} onChange={(e) => setRefinedFilter(e.target.value as RefinedFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold text-neutral-900 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                             {[ { id: 'all', label: 'Any' }, { id: 'verified', label: 'Verified' }, { id: 'refined', label: 'Refined' }, { id: 'raw', label: 'Raw' }, { id: 'failed', label: 'Failed' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="register-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Register</label>
                        <select id="register-filter" value={registerFilter} onChange={(e) => setRegisterFilter(e.target.value as RegisterFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold text-neutral-900 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'raw', label: 'Raw' }, { id: 'academic', label: 'Academic' }, { id: 'casual', label: 'Casual' }, { id: 'neutral', label: 'Neutral' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="group-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Group</label>
                        <GroupFilterCombobox
                            value={selectedTag}
                            options={groupSuggestions}
                            onChange={(nextValue) => onSelectTag?.(nextValue)}
                        />
                    </div>
                    <div>
                        <label htmlFor="composition-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1 flex items-center gap-1"><PenLine size={10}/> Usage</label>
                        <select id="composition-filter" value={compositionFilter} onChange={(e) => setCompositionFilter(e.target.value as CompositionFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold text-neutral-900 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'composed', label: 'Used in Writing' }, { id: 'not_composed', label: 'Not Used' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="book-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1 flex items-center gap-1"><BookMarked size={10}/> Book</label>
                        <div className="flex gap-1">
                            <select 
                                id="book-filter" 
                                value={bookFilter} 
                                onChange={(e) => setBookFilter(e.target.value as BookFilter)} 
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold text-neutral-900 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none ${bookFilter === 'specific' ? 'w-24' : ''}`}
                            >
                                {[ { id: 'all', label: 'Any' }, { id: 'in_book', label: 'In a Book' }, { id: 'not_in_book', label: 'Not in Book' }, { id: 'specific', label: 'Specific Book' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                            </select>
                            {bookFilter === 'specific' && (
                                <select 
                                    value={specificBookId} 
                                    onChange={(e) => onSpecificBookChange(e.target.value)}
                                    className="flex-[2] px-3 py-2 rounded-lg text-xs font-bold text-neutral-900 bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none animate-in slide-in-from-left-2"
                                >
                                    <option value="">Select Book...</option>
                                    {wordBooks.map(book => {
                                        const parts = book.topic.split(':');
                                        const display = parts.length > 1 ? parts.slice(1).join(':').trim() : book.topic;
                                        const shelf = parts.length > 1 ? parts[0].trim() : 'General';
                                        return <option key={book.id} value={book.id}>{shelf}: {display}</option>
                                    })}
                                </select>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
      {isAddExpanded && (
        <div className="bg-white p-6 rounded-[2rem] border-2 border-neutral-100 shadow-xl space-y-4 animate-in slide-in-from-top-4 duration-300">
          <div className="space-y-2">
             <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Select Type</label>
             <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map(option => {
                    const Icon = option.icon;
                    const isSelected = selectedTypes.has(option.id);
                    return (
                        <button
                            key={option.id}
                            onClick={() => toggleType(option.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${
                                isSelected 
                                ? 'bg-neutral-900 border-neutral-900 text-white shadow-sm' 
                                : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'
                            }`}
                        >
                            <Icon size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-wide">{option.label}</span>
                        </button>
                    );
                })}
             </div>
          </div>
          
          <textarea autoFocus value={quickAddInput} onChange={(e) => setQuickAddInput(e.target.value)} placeholder="e.g. resilient; ubiquitous; mitigate; ..." className="w-full h-24 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none" />
          
          <div className="flex justify-end gap-3">
             <button onClick={handleBatchAddSubmit} disabled={isAdding || !quickAddInput.trim()} className="px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
                 {isAdding ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}<span>Add Words</span>
             </button>
          </div>
        </div>
      )}
      <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]">
        {loading ? <div className="flex flex-col items-center justify-center h-80 space-y-4"><Loader2 className="animate-spin text-neutral-200" size={32} /><p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Loading...</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-neutral-50/50 border-b border-neutral-100"><th className="px-4 py-3 w-10"><button onClick={() => setSelectedIds(selectedIds.size === words.length && words.length > 0 ? new Set() : new Set(words.map(w => w.id)))} className="text-neutral-300 hover:text-neutral-900">{selectedIds.size === words.length && words.length > 0 ? <CheckSquare size={18} className="text-neutral-900" /> : <Square size={18} />}</button></th><th className="px-2 py-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vocabulary</th>{visibility.showMeaning && <th className="px-4 py-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest max-w-[200px]">Meaning / Definition</th>}{visibility.showGroups && <th className="px-4 py-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Group</th>}{(visibility.showProgress || visibility.showDue) && <th className="px-6 py-3 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Progress</th>}{visibility.showComplexity && <th className="px-4 py-3 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Complexity</th>}{visibility.showMastery && <th className="px-4 py-3 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Mastery</th>}<th className="px-6 py-3 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Actions</th></tr></thead>
              <tbody className="divide-y divide-neutral-50">
                {words.length === 0 ? <tr><td colSpan={visibleColumnCount} className="p-20 text-center text-sm font-medium italic text-neutral-300">No items found.</td></tr> : (words.map(item => { const isSelected = selectedIds.has(item.id); const reviewStatus = getRemainingTime(item.nextReview); const hasFamilyData = item.wordFamily && ((item.wordFamily.nouns?.length || 0) > 0 || (item.wordFamily.verbs?.length || 0) > 0 || (item.wordFamily.adjs?.length || 0) > 0 || (item.wordFamily.advs?.length || 0) > 0);
                    return (<tr key={item.id} className={`hover:bg-neutral-50/80 cursor-pointer group transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`} onClick={() => onViewWord(item)}><td className="px-4 py-2" onClick={(e) => { e.stopPropagation(); const next = new Set(selectedIds); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); setSelectedIds(next); }}>{isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-neutral-200 group-hover:text-neutral-400" />}</td><td className="px-2 py-2"><div className="flex items-center space-x-2"><div className="font-bold text-neutral-900">{(item.display || '').trim() || item.word}</div><div className="flex gap-1">
                      {visibility.showAiIcon && getQualityIcon(item.quality)}
                      {visibility.showFamilyIcon && hasFamilyData && (
                        <span title="Has Word Family">
                          <Network size={12} className="text-purple-500"/>
                        </span>
                      )}
                      {visibility.showPrepIcon && item.prepositions && item.prepositions.length > 0 && (
                        <span title="Has Prepositions">
                          <AtSign size={12} className="text-orange-500"/>
                        </span>
                      )}
                      {item.img && item.img.length > 0 && (
                        <span title="Has Images">
                          <Image size={12} className="text-indigo-500"/>
                        </span>
                      )}
                    </div></div>{visibility.showIPA && (<div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5"><span className="text-[10px] font-mono text-neutral-400">{item.ipaUs || '/?/'}</span></div>)}</td>{visibility.showMeaning && (<td className="px-4 py-2 max-w-[200px] align-middle"><div className={`text-sm text-neutral-600 leading-snug transition-all duration-300 ${visibility.blurMeaning ? 'opacity-0 group-hover:opacity-100 select-none cursor-help' : ''}`}>{item.meaningVi}</div></td>)}{visibility.showGroups && (<td className="px-4 py-2 align-middle"><div className="flex max-w-[280px] flex-wrap gap-1.5">{item.groups && item.groups.length > 0 ? item.groups.map((group) => (<span key={group} className="inline-flex items-center rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-bold text-neutral-600">{group}</span>)) : <span className="text-[10px] font-medium italic text-neutral-300">None</span>}</div></td>)}{(visibility.showProgress || visibility.showDue) && (<td className="px-6 py-2 text-center"><div className="flex flex-row items-center justify-center gap-2">{visibility.showProgress && getStatusBadge(item)}{visibility.showDue && <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${reviewStatus.urgency === 'due' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-neutral-50 text-neutral-400 border border-neutral-100'}`}><span>{reviewStatus.label}</span></div>}</div></td>)}{visibility.showComplexity && <td className="px-4 py-2 text-center align-middle"><span className="text-xs font-black text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">{item.complexity ?? 0}</span></td>}{visibility.showMastery && (<td className="px-4 py-2 text-center align-middle"><span className={`inline-block px-2 py-0.5 rounded-md text-xs font-black ${getScoreCellClasses(item.masteryScore)}`}>{item.masteryScore ?? 0}</span></td>)}<td className="px-6 py-2 text-right"><div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); onEditWord(item); }} className="p-2 text-neutral-300 hover:text-neutral-900 transition-all"><Edit3 size={16} /></button>{context === 'unit' && item.quality === WordQuality.RAW && onHardDelete && setWordToHardDelete && (<button onClick={(e) => { e.stopPropagation(); setWordToHardDelete(item); }} className="p-2 text-neutral-300 hover:text-red-700 transition-all" title="Delete Raw Word from Library"><Trash2 size={16} /></button>)}<button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWordToDelete(item); }} className="p-2 text-neutral-300 hover:text-rose-500 transition-all" title={context === 'unit' ? 'Unlink from Unit' : 'Delete from Library'}>{context === 'unit' ? <Unlink size={16}/> : <Trash2 size={16} />}</button></div></td></tr>); }))}
              </tbody>
            </table>
            <div className="p-6 bg-neutral-50/30 flex items-center justify-between border-t border-neutral-100">
                <div className="flex items-center space-x-2"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Size</span><select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="bg-white border border-neutral-200 rounded-lg px-2 py-1 text-xs font-bold">{[10, 25, 50, 100].map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                <div className="flex space-x-2"><button disabled={page === 0} onClick={() => onPageChange(page - 1)} className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold disabled:opacity-30"><ChevronLeft size={14} /></button><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest self-center">Page {page + 1} of {totalPages || 1}</span><button disabled={(page + 1) >= totalPages} onClick={() => onPageChange(page + 1)} className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold disabled:opacity-30"><ChevronRight size={14} /></button></div>
            </div>
          </div>
        )}
      </div>
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] w-full max-w-5xl px-4 animate-in slide-in-from-bottom-8">
          <div className="bg-neutral-900 text-white rounded-[2rem] p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-neutral-800">
            <div className="flex items-center space-x-4 pl-2 shrink-0"><button onClick={() => setSelectedIds(new Set())} className="text-neutral-500 hover:text-white transition-colors"><X size={20} /></button><div><div className="text-sm font-black">{selectedIds.size} selected</div></div></div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-4">
              <div
                className="relative"
                onMouseEnter={() => setIsActionMenuOpen(true)}
                onMouseLeave={() => setIsActionMenuOpen(false)}
              >
                <button
                  type="button"
                  className={`px-4 py-3 rounded-xl text-xs font-black flex items-center space-x-2 transition-colors ${
                    isActionMenuOpen ? 'bg-white text-neutral-900' : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <Play size={14} />
                  <span>Action</span>
                  <ChevronDown size={14} className={`transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isActionMenuOpen && (
                  <div className="absolute bottom-full right-0 z-[220] mb-0 w-64 overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white p-3 text-neutral-900 shadow-2xl">
                    <div className="space-y-2">
                      {context === 'library' && (
                        <button onClick={() => onPractice(selectedIds)} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700">
                          <Play size={14} />
                          <span>Practice</span>
                        </button>
                      )}
                      <button onClick={() => void onCopySelectedHeadwords()} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50 hover:text-neutral-900">
                        <Save size={14} />
                        <span>Copy Headword</span>
                      </button>
                      {onOpenBulkDeleteModal && (
                        <button onClick={onOpenBulkDeleteModal} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-black ${context === 'unit' ? 'border-orange-200 text-orange-700 hover:bg-orange-50' : 'border-rose-200 text-rose-700 hover:bg-rose-50'}`}>
                          {context === 'unit' ? <Unlink size={14} /> : <Trash2 size={14} />}
                          <span>{context === 'unit' ? 'Unlink' : 'Delete'}</span>
                        </button>
                      )}
                      {context === 'unit' && onOpenBulkHardDeleteModal && selectedRawWordsCount > 0 && (
                        <button onClick={onOpenBulkHardDeleteModal} className="flex w-full items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-left text-[11px] font-black text-rose-700 hover:bg-rose-50">
                          <Trash2 size={14} />
                          <span>Delete Raw ({selectedRawWordsCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div
                className="relative"
                onMouseEnter={() => setIsRefineMenuOpen(true)}
                onMouseLeave={() => setIsRefineMenuOpen(false)}
              >
                <button
                  type="button"
                  className={`px-4 py-3 rounded-xl text-xs font-black flex items-center space-x-2 transition-colors ${
                    isRefineMenuOpen ? 'bg-white text-neutral-900' : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {isApiRefining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  <span>Refine</span>
                  <ChevronDown size={14} className={`transition-transform ${isRefineMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRefineMenuOpen && (
                  <div className="absolute bottom-full right-0 z-[220] mb-0 w-64 overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white p-3 text-neutral-900 shadow-2xl">
                    <div className="space-y-2">
                      <button
                        onClick={onApiRefineSelected}
                        disabled={isApiRefining}
                        className="flex w-full items-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-left text-[11px] font-black text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isApiRefining ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        <span>Refine API</span>
                      </button>
                      <button onClick={() => { setIsAiModalOpen(true); }} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50">
                        <Wand2 size={14} />
                        <span>Refine Manual</span>
                      </button>
                      {selectedWordsMissingHintsCount > 0 && (
                        <button onClick={onOpenHintModal} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50" title="Generate hints for collocations and idioms">
                          <Zap size={14} />
                          <span>Hints ({selectedWordsMissingHintsCount})</span>
                        </button>
                      )}
                      {(apiRefineProgress || apiRefineHistory.length > 0) && (
                        <button onClick={onOpenApiRefineLog} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50">
                          <Eye size={14} />
                          <span>Refine Log</span>
                        </button>
                      )}
                      {isApiRefining && (
                        <button onClick={onStopApiRefine} className="flex w-full items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-left text-[11px] font-black text-rose-700 hover:bg-rose-50">
                          <X size={14} />
                          <span>Stop</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div
                className="relative"
                onMouseEnter={() => setIsSetAttributeMenuOpen(true)}
                onMouseLeave={() => setIsSetAttributeMenuOpen(false)}
              >
                <button
                  type="button"
                  className={`px-4 py-3 rounded-xl text-xs font-black flex items-center space-x-2 transition-colors ${
                    isSetAttributeMenuOpen
                      ? 'bg-white text-neutral-900'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <Tag size={14} />
                  <span>Set Attribute</span>
                  <ChevronDown size={14} className={`transition-transform ${isSetAttributeMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isSetAttributeMenuOpen && (
                  <div className="absolute bottom-full right-0 z-[220] mb-0 w-[22rem] overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white p-3 text-neutral-900 shadow-2xl">
                    <div className="space-y-3">
                      <div>
                        <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Vocabulary Type</div>
                        <div className="grid grid-cols-2 gap-2">
                          {TYPE_OPTIONS.filter(option => ['vocab', 'idiom', 'phrasal', 'collocation', 'phrase'].includes(option.id)).map(option => {
                            const Icon = option.icon;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => void handleSetVocabularyType(option.id as Exclude<WordTypeOption, 'archive' | 'focus' | 'duplicate'>)}
                                className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 transition-colors hover:border-neutral-900 hover:bg-neutral-50 hover:text-neutral-900"
                              >
                                <Icon size={14} />
                                <span>{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Archive</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSetArchive(true)}
                              className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700 transition-colors hover:bg-amber-100"
                            >
                              On
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSetArchive(false)}
                              className="rounded-xl bg-neutral-100 px-3 py-2 text-[11px] font-black text-neutral-700 transition-colors hover:bg-neutral-200"
                            >
                              Off
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Focus</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSetFocus(true)}
                              className="rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700 transition-colors hover:bg-sky-100"
                            >
                              On
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSetFocus(false)}
                              className="rounded-xl bg-neutral-100 px-3 py-2 text-[11px] font-black text-neutral-700 transition-colors hover:bg-neutral-200"
                            >
                              Off
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Quality Status</div>
                        <div className="grid grid-cols-2 gap-2">
                          {qualityOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => void handleSetQuality(option.id)}
                              className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 transition-colors hover:border-neutral-900 hover:bg-neutral-50 hover:text-neutral-900"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Learned Status</div>
                        <div className="grid grid-cols-2 gap-2">
                          {learnedStatusOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => void handleSetLearnedStatus(option.id)}
                              className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-[11px] font-black text-neutral-700 transition-colors hover:border-neutral-900 hover:bg-neutral-50 hover:text-neutral-900"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                        <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Group Existing</div>
                        <div className="flex gap-2">
                          <select
                            value={selectedBulkGroup}
                            onChange={(e) => setSelectedBulkGroup(e.target.value)}
                            className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                          >
                            <option value="">Select group...</option>
                            {bulkGroupOptions.map(group => (
                              <option key={group} value={group}>{group}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleApplyExistingGroup()}
                            disabled={!selectedBulkGroup.trim()}
                            className="rounded-xl bg-neutral-900 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                        <div className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Group New</div>
                        <div className="flex gap-2">
                          <input
                            value={newBulkGroup}
                            onChange={(e) => setNewBulkGroup(e.target.value)}
                            placeholder="Create new group..."
                            className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-neutral-900"
                          />
                          <button
                            type="button"
                            onClick={() => void handleApplyNewGroup()}
                            disabled={!newBulkGroup.trim()}
                            className="rounded-xl bg-neutral-900 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Create
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {isApiRefineLogOpen && apiRefineProgress && (
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[210] w-full max-w-5xl px-4">
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50/95 shadow-2xl p-4 sm:p-5 backdrop-blur">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Refine API Progress</div>
                  <div className="text-sm font-black text-amber-950">{apiRefineProgress.message}</div>
                  <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-amber-700">
                    Flushed {apiRefineFlushedCount}/{totalApiRefineWords}, remaining {remainingApiRefineWords}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    Attempt {Math.max(apiRefineProgress.attempt, 1)}/{apiRefineProgress.maxAttempts}
                  </div>
                  <button
                    onClick={onCloseApiRefineLog}
                    className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
              {apiRefineProgress.issues && apiRefineProgress.issues.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-white p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-rose-500">Validation / Error</div>
                  <div className="mt-2 text-xs font-semibold text-rose-700 whitespace-pre-wrap">
                    {apiRefineProgress.issues.slice(0, 8).join('\n')}
                  </div>
                </div>
              )}
              {apiRefineProgress.rawText && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Server Response Preview</div>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed font-mono text-neutral-700">
                    {apiRefineProgress.rawText}
                  </pre>
                </div>
              )}
              {apiRefineHistory.length > 1 && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Progress Log</div>
                  <div className="mt-2 max-h-40 overflow-auto space-y-2">
                    {apiRefineHistory.map((item, index) => (
                      <div key={`${item.stage}-${item.attempt}-${index}`} className="rounded-xl bg-neutral-50 px-3 py-2">
                        <div className="text-[11px] font-black text-neutral-700">
                          [{item.attempt}/{item.maxAttempts}] {item.stage}
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-neutral-600 whitespace-pre-wrap">
                          {item.message}
                          {item.issues && item.issues.length > 0 ? `\n${item.issues.slice(0, 3).join('\n')}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <AddToBookModal isOpen={isAddToBookModalOpen} onClose={() => setIsAddToBookModalOpen(false)} onConfirm={onConfirmAddToBook} books={wordBooks} selectedCount={selectedIds.size} />
    </div>
  );
};
