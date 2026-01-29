import React, { useState } from 'react';
import { Search, Trash2, ChevronLeft, ChevronRight, Loader2, Edit3, CheckCircle2, AlertCircle, Wand2, CheckSquare, Square, X, ChevronDown, Mic, Tag, Play, AtSign, Plus, Save, Eye, Columns, Activity, Calendar, Network, Unlink, ArrowDownAZ, ListFilter, Copy, ShieldCheck, ShieldX, Ghost, Zap, GitCommit, Binary, FolderTree, BookOpen, Quote, Layers, Combine, MessageSquare, Archive, RefreshCw, Sparkles, PenLine, BookMarked } from 'lucide-react';
import { VocabularyItem, ReviewGrade, WordQuality, WordTypeOption } from '../../app/types';
import { getRemainingTime } from '../../utils/srs';
import ConfirmationModal from '../common/ConfirmationModal';
import UniversalAiModal from '../common/UniversalAiModal';
import { TagBrowser, TagTreeNode } from '../common/TagBrowser';

export type FilterType = 'all' | 'vocab' | 'idiom' | 'phrasal' | 'colloc' | 'phrase' | 'pronun' | 'preposition' | 'archive' | 'duplicate';
export type RefinedFilter = 'all' | 'raw' | 'refined' | 'verified' | 'failed' | 'not_refined';
export type StatusFilter = 'all' | 'new' | 'forgot' | 'hard' | 'easy' | 'learned';
export type RegisterFilter = 'all' | 'academic' | 'casual' | 'neutral' | 'raw';
export type SourceFilter = 'all' | 'app' | 'manual' | 'refine';
export type CompositionFilter = 'all' | 'composed' | 'not_composed';
export type BookFilter = 'all' | 'in_book' | 'not_in_book';

interface VisibilitySettings {
  showIPA: boolean;
  showMeaning: boolean;
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

const getStatusBadge = (item: VocabularyItem) => {
  if (!item.lastReview) return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">New</span>;
  
  switch (item.lastGrade) {
    case ReviewGrade.FORGOT: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-rose-50 text-rose-600 border border-rose-100 whitespace-nowrap">Forgot</span>;
    case ReviewGrade.LEARNED: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-cyan-50 text-cyan-600 border border-cyan-100 whitespace-nowrap">Learned</span>;
    case ReviewGrade.HARD: 
      return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-orange-50 text-orange-600 border border-orange-100 whitespace-nowrap">Hard</span>;
    case ReviewGrade.EASY: 
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
    { id: 'pronun', label: 'Pronunciation', icon: Mic },
    { id: 'archive', label: 'Archive', icon: Archive },
];

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
  sourceFilter: SourceFilter;
  compositionFilter: CompositionFilter;
  bookFilter: BookFilter;
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
  onBulkVerify: (ids: Set<string>) => void;
  selectedWordsToRefine: VocabularyItem[];
  selectedRawWordsCount: number;
  handleGenerateRefinePrompt: (inputs: { words: string }) => string;
  handleAiRefinementResult: (results: any[]) => void;
  setStatusFilter: (sf: StatusFilter) => void;
  setRefinedFilter: (rf: RefinedFilter) => void;
  setRegisterFilter: (rf: RegisterFilter) => void;
  setSourceFilter: (sf: SourceFilter) => void;
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
  
  // Updated props for Type Selector
  selectedTypes: Set<WordTypeOption>;
  toggleType: (type: WordTypeOption) => void;
}

export const WordTableUI: React.FC<WordTableUIProps> = ({
  words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
  onPractice, context, onViewWord, onEditWord, onDelete, onHardDelete, query, setQuery, activeFilters,
  refinedFilter, statusFilter, registerFilter, sourceFilter, compositionFilter, bookFilter, isAddExpanded, isFilterMenuOpen, quickAddInput,
  setQuickAddInput, isAdding, isViewMenuOpen, selectedIds, setSelectedIds,
  wordToDelete, setWordToDelete, isDeleting, setIsDeleting,
  wordToHardDelete, setWordToHardDelete, isHardDeleting, setIsHardDeleting,
  isAiModalOpen, setIsAiModalOpen,
  notification, viewMenuRef, visibility, setVisibility, handleToggleFilter,
  handleBatchAddSubmit, onOpenBulkDeleteModal, onOpenBulkHardDeleteModal, onBulkVerify, selectedWordsToRefine, selectedRawWordsCount, handleGenerateRefinePrompt,
  handleAiRefinementResult, setStatusFilter, setRefinedFilter, setRegisterFilter, setSourceFilter, setCompositionFilter, setBookFilter, setIsViewMenuOpen,
  setIsFilterMenuOpen, setIsAddExpanded, selectedWordsMissingHintsCount, onOpenHintModal,
  showTagBrowserButton, tagTree, selectedTag, onSelectTag,
  selectedTypes, toggleType
}) => {
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const totalPages = Math.ceil(total / pageSize);
  const defaultDeleteMessage = <span>Are you sure you want to permanently delete <span className="font-bold text-neutral-900">"{wordToDelete?.word}"</span>? This action cannot be undone.</span>;
  const unitUnlinkMessage = <span>Remove <span className="font-bold text-neutral-900">"{wordToDelete?.word}"</span> from this unit? It remains in your library.</span>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      {notification && (<div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] bg-neutral-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-neutral-800 animate-in slide-in-from-top-4 flex items-center space-x-2">{notification.type === 'success' ? <CheckCircle2 size={18} className="text-green-400" /> : <AlertCircle size={18} className="text-orange-400" />}<span className="text-sm font-bold">{notification.message}</span></div>)}
      <div className="flex flex-col gap-4">
        <div>
            <h2 className={`${context === 'library' ? 'text-3xl' : 'text-lg'} font-black text-neutral-900 tracking-tight`}>{context === 'library' ? 'Word Library' : 'Unit Vocabulary'}</h2>
            <p className={`${context === 'library' ? 'text-neutral-500 mt-2 font-medium' : 'text-neutral-500 text-xs font-bold mt-0.5'}`}>{total} items{context === 'library' ? ' collected.' : '.'}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words..." className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm" />
            </div>
            <div className="flex gap-2">
                <div className="relative" ref={viewMenuRef}>
                    <button onClick={() => setIsViewMenuOpen(!isViewMenuOpen)} className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${isViewMenuOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="View Options">
                        <Eye size={16} /> <span className="hidden sm:inline">View</span>
                    </button>
                    {isViewMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50">Columns</div>
                            <VisibilityToggle label={<><Columns size={14}/>Meaning</>} checked={visibility.showMeaning} onChange={() => setVisibility(v => ({...v, showMeaning: !v.showMeaning}))} />
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
                <button onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${isFilterMenuOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="Filter">
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
            />
        )}
        {isFilterMenuOpen && (
            <div className="bg-white border border-neutral-100 p-4 rounded-2xl grid gap-4 shadow-sm animate-in slide-in-from-top-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest w-16 shrink-0">Type</span>
                    <div className="flex flex-wrap gap-2">
                        {[ 'all', 'vocab', 'idiom', 'phrasal', 'colloc', 'phrase', 'preposition', 'pronun', 'archive', 'duplicate' ].map(id => {
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
                        <select id="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'new', label: 'New' }, { id: 'learned', label: 'Learned' }, { id: 'easy', label: 'Easy' }, { id: 'hard', label: 'Hard' }, { id: 'forgot', label: 'Forgot' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="quality-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Quality</label>
                        <select id="quality-filter" value={refinedFilter} onChange={(e) => setRefinedFilter(e.target.value as RefinedFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                             {[ { id: 'all', label: 'Any' }, { id: 'verified', label: 'Verified' }, { id: 'refined', label: 'Refined' }, { id: 'raw', label: 'Raw' }, { id: 'failed', label: 'Failed' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="register-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Register</label>
                        <select id="register-filter" value={registerFilter} onChange={(e) => setRegisterFilter(e.target.value as RegisterFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'raw', label: 'Raw' }, { id: 'academic', label: 'Academic' }, { id: 'casual', label: 'Casual' }, { id: 'neutral', label: 'Neutral' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="source-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Source</label>
                        <select id="source-filter" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'app', label: 'App' }, { id: 'manual', label: 'Manual' }, { id: 'refine', label: 'Refine' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="composition-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1 flex items-center gap-1"><PenLine size={10}/> Usage</label>
                        <select id="composition-filter" value={compositionFilter} onChange={(e) => setCompositionFilter(e.target.value as CompositionFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'composed', label: 'Used in Writing' }, { id: 'not_composed', label: 'Not Used' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="book-filter" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1 flex items-center gap-1"><BookMarked size={10}/> In Book</label>
                        <select id="book-filter" value={bookFilter} onChange={(e) => setBookFilter(e.target.value as BookFilter)} className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white border border-neutral-200 focus:ring-2 focus:ring-neutral-900 outline-none appearance-none">
                            {[ { id: 'all', label: 'Any' }, { id: 'in_book', label: 'In a Word Book' }, { id: 'not_in_book', label: 'Not in Book' } ].map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                        </select>
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
              <thead><tr className="bg-neutral-50/50 border-b border-neutral-100"><th className="px-4 py-3 w-10"><button onClick={() => setSelectedIds(selectedIds.size === words.length && words.length > 0 ? new Set() : new Set(words.map(w => w.id)))} className="text-neutral-300 hover:text-neutral-900">{selectedIds.size === words.length && words.length > 0 ? <CheckSquare size={18} className="text-neutral-900" /> : <Square size={18} />}</button></th><th className="px-2 py-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vocabulary</th>{visibility.showMeaning && <th className="px-4 py-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest max-w-[200px]">Meaning / Definition</th>}{(visibility.showProgress || visibility.showDue) && <th className="px-6 py-3 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Progress</th>}{visibility.showComplexity && <th className="px-4 py-3 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Complexity</th>}{visibility.showMastery && <th className="px-4 py-3 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Mastery</th>}<th className="px-6 py-3 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Actions</th></tr></thead>
              <tbody className="divide-y divide-neutral-50">
                {words.length === 0 ? <tr><td colSpan={6} className="p-20 text-center text-sm font-medium italic text-neutral-300">No items found.</td></tr> : (words.map(item => { const isSelected = selectedIds.has(item.id); const reviewStatus = getRemainingTime(item.nextReview); const hasFamilyData = item.wordFamily && ((item.wordFamily.nouns?.length || 0) > 0 || (item.wordFamily.verbs?.length || 0) > 0 || (item.wordFamily.adjs?.length || 0) > 0 || (item.wordFamily.advs?.length || 0) > 0);
                    return (<tr key={item.id} className={`hover:bg-neutral-50/80 cursor-pointer group transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`} onClick={() => onViewWord(item)}><td className="px-4 py-2" onClick={(e) => { e.stopPropagation(); const next = new Set(selectedIds); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); setSelectedIds(next); }}>{isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-neutral-200 group-hover:text-neutral-400" />}</td><td className="px-2 py-2"><div className="flex items-center space-x-2"><div className="font-bold text-neutral-900">{item.word}</div><div className="flex gap-1">{visibility.showAiIcon && getQualityIcon(item.quality)}{visibility.showFamilyIcon && hasFamilyData && <span title="Has Word Family"><Network size={12} className="text-purple-500"/></span>}{visibility.showPrepIcon && item.prepositions && item.prepositions.length > 0 && <span title="Has Prepositions"><AtSign size={12} className="text-orange-500"/></span>}</div></div>{visibility.showIPA && (<div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5"><span className="text-[10px] font-mono text-neutral-400">{item.ipa || '/?/'}</span>{item.needsPronunciationFocus && <Mic size={12} className="text-rose-500" />}</div>)}</td>{visibility.showMeaning && (<td className="px-4 py-2 max-w-[200px] align-middle"><div className={`text-sm text-neutral-600 leading-snug transition-all duration-300 ${visibility.blurMeaning ? 'opacity-0 group-hover:opacity-100 select-none cursor-help' : ''}`}>{item.meaningVi}</div></td>)}{(visibility.showProgress || visibility.showDue) && (<td className="px-6 py-2 text-center"><div className="flex flex-row items-center justify-center gap-2">{visibility.showProgress && getStatusBadge(item)}{visibility.showDue && <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${reviewStatus.urgency === 'due' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-neutral-50 text-neutral-400 border border-neutral-100'}`}><span>{reviewStatus.label}</span></div>}</div></td>)}{visibility.showComplexity && <td className="px-4 py-2 text-center align-middle"><span className="text-xs font-black text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">{item.complexity ?? 0}</span></td>}{visibility.showMastery && (<td className="px-4 py-2 text-center align-middle"><span className={`inline-block px-2 py-0.5 rounded-md text-xs font-black ${getScoreCellClasses(item.masteryScore)}`}>{item.masteryScore ?? 0}</span></td>)}<td className="px-6 py-2 text-right"><div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); onEditWord(item); }} className="p-2 text-neutral-300 hover:text-neutral-900 transition-all"><Edit3 size={16} /></button>{context === 'unit' && item.quality === WordQuality.RAW && onHardDelete && setWordToHardDelete && (<button onClick={(e) => { e.stopPropagation(); setWordToHardDelete(item); }} className="p-2 text-neutral-300 hover:text-red-700 transition-all" title="Delete Raw Word from Library"><Trash2 size={16} /></button>)}<button onClick={(e) => { e.stopPropagation(); setWordToDelete(item); }} className="p-2 text-neutral-300 hover:text-rose-500 transition-all" title={context === 'unit' ? 'Unlink from Unit' : 'Delete from Library'}>{context === 'unit' ? <Unlink size={16}/> : <Trash2 size={16} />}</button></div></td></tr>); }))}
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
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] w-full max-w-4xl px-4 animate-in slide-in-from-bottom-8">
          <div className="bg-neutral-900 text-white rounded-[2rem] p-4 shadow-2xl flex items-center justify-between border border-neutral-800">
            <div className="flex items-center space-x-4 pl-2"><button onClick={() => setSelectedIds(new Set())} className="text-neutral-500 hover:text-white transition-colors"><X size={20} /></button><div><div className="text-sm font-black">{selectedIds.size} selected</div></div></div>
            <div className="flex items-center space-x-2">
              {onOpenBulkDeleteModal && (<button onClick={onOpenBulkDeleteModal} className={`px-4 py-3 rounded-xl text-xs font-black flex items-center space-x-2 transition-colors ${context === 'unit' ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-500' : 'bg-red-500/10 hover:bg-red-500/20 text-red-500'}`}>{context === 'unit' ? <Unlink size={14} /> : <Trash2 size={14} />}<span>{context === 'unit' ? 'Unlink' : 'Delete'}</span></button>)}
              {context === 'unit' && onOpenBulkHardDeleteModal && selectedRawWordsCount > 0 && (
                  <button 
                    onClick={onOpenBulkHardDeleteModal}
                    className="px-4 py-3 rounded-xl text-xs font-black flex items-center space-x-2 transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500"
                  >
                      <Trash2 size={14}/><span>Delete Raw ({selectedRawWordsCount})</span>
                  </button>
              )}
              <button onClick={() => onBulkVerify(selectedIds)} className="px-4 py-3 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-xl text-xs font-black flex items-center space-x-2 transition-colors"><ShieldCheck size={14} /> <span>Verify</span></button>
              {selectedWordsMissingHintsCount > 0 && ( <button onClick={onOpenHintModal} className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black flex items-center space-x-2 transition-colors" title="Generate hints for collocations and idioms"><Zap size={14} /> <span>Refine Hints ({selectedWordsMissingHintsCount})</span></button> )}
              <button onClick={() => { setIsAiModalOpen(true); }} className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black flex items-center space-x-2 transition-colors"><Wand2 size={14} /> <span>Refine</span></button>
              <button onClick={() => onPractice(selectedIds)} className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center space-x-2"><Play size={14} fill="currentColor"/> <span>Practice</span></button>
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal 
        isOpen={!!wordToDelete}
        title={context === 'unit' ? "Unlink Word?" : "Delete Word?"}
        message={context === 'unit' ? unitUnlinkMessage : defaultDeleteMessage}
        confirmText={context === 'unit' ? "UNLINK" : "CONFIRM DELETE"}
        isProcessing={isDeleting}
        onConfirm={async () => { if (!wordToDelete) return; setIsDeleting(true); await onDelete(wordToDelete); setIsDeleting(false); setWordToDelete(null); }}
        onClose={() => setWordToDelete(null)}
        confirmButtonClass={context === 'unit' ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200" : "bg-red-600 text-white hover:bg-red-700 shadow-red-200"}
        icon={context === 'unit' ? <Unlink size={40} className="text-orange-500"/> : <Trash2 size={40} className="text-red-500"/>}
      />
      {onHardDelete && wordToHardDelete && setWordToHardDelete && isHardDeleting !== undefined && setIsHardDeleting && (
        <ConfirmationModal 
          isOpen={!!wordToHardDelete}
          title="Permanently Delete Word?"
          message={<span>Are you sure you want to permanently delete <span className="font-bold text-neutral-900">"{wordToHardDelete?.word}"</span> from your library? This action cannot be undone.</span>}
          confirmText="CONFIRM DELETE"
          isProcessing={isHardDeleting}
          onConfirm={async () => { if (!wordToHardDelete) return; setIsHardDeleting(true); await onHardDelete(wordToHardDelete); setIsHardDeleting(false); setWordToHardDelete(null); }}
          onClose={() => setWordToHardDelete(null)}
          confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
          icon={<Trash2 size={40} className="text-red-500"/>}
        />
      )}
    </div>
  );
};