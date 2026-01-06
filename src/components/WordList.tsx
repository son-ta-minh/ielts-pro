import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, Trash2, ChevronLeft, ChevronRight, Loader2, Edit3, CheckCircle2, AlertCircle, Sparkles, Wand2, Filter, Quote, Layers, Combine, MessageSquare, Mic, CheckSquare, Square, X, ChevronDown, BookOpen, Tag, Play, AtSign, GraduationCap, Plus, Save, XCircle } from 'lucide-react';
import { VocabularyItem, ReviewGrade } from '../app/types';
import { getWordsPaged, getWordCount, bulkSaveWords, findWordByText } from '../app/db';
import { getRemainingTime, createNewWord } from '../utils/srs';
import EditWordModal from './EditWordModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import ManualRefineModal from './ManualRefineModal';

interface Props {
  userId: string;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (updated: VocabularyItem) => void;
  onStartSession: (words: VocabularyItem[]) => void;
  initialFilter?: string | null;
  onInitialFilterApplied?: () => void;
  forceExpandAdd?: boolean;
  onExpandAddConsumed?: () => void;
}

type FilterType = 'all' | 'vocab' | 'idiom' | 'phrasal' | 'colloc' | 'phrase' | 'pronun' | 'preposition';
type RefinedFilter = 'all' | 'refined' | 'not_refined';
type StatusFilter = 'all' | 'new' | 'forgot' | 'hard' | 'easy';

const WordList: React.FC<Props> = ({ userId, onDelete, onUpdate, onStartSession, initialFilter, onInitialFilterApplied, forceExpandAdd, onExpandAddConsumed }) => {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15); 
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [refinedFilter, setRefinedFilter] = useState<RefinedFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  
  // Add Section State
  const [isAddExpanded, setIsAddExpanded] = useState(false);
  const [quickAddInput, setQuickAddInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const totalPages = Math.ceil(total / pageSize);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isManualRefineModalOpen, setIsManualRefineModalOpen] = useState(false);

  const [wordToDelete, setWordToDelete] = useState<VocabularyItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);

  const [labFilterOpen, setLabFilterOpen] = useState(false);
  const [refinedFilterOpen, setRefinedFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  
  const labFilterRef = useRef<HTMLDivElement>(null);
  const refinedFilterRef = useRef<HTMLDivElement>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (initialFilter) {
      setActiveFilter(initialFilter as FilterType);
      onInitialFilterApplied?.();
    }
  }, [initialFilter, onInitialFilterApplied]);

  useEffect(() => {
    if (forceExpandAdd) {
      setIsAddExpanded(true);
      onExpandAddConsumed?.();
    }
  }, [forceExpandAdd, onExpandAddConsumed]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const count = await getWordCount(userId, query, activeFilter, refinedFilter, statusFilter);
      const data = await getWordsPaged(userId, page, pageSize, query, activeFilter, refinedFilter, statusFilter);
      setTotal(count);
      setWords(data);
    } catch (err) {
      console.error("Failed to load words:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize, query, activeFilter, refinedFilter, statusFilter]);

  useEffect(() => { loadPage(); }, [loadPage]);
  useEffect(() => { setPage(0); setSelectedIds(new Set()); }, [query, activeFilter, pageSize, refinedFilter, statusFilter]); 

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (labFilterRef.current && !labFilterRef.current.contains(event.target as Node)) setLabFilterOpen(false);
      if (refinedFilterRef.current && !refinedFilterRef.current.contains(event.target as Node)) setRefinedFilterOpen(false);
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) setStatusFilterOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBatchAdd = async () => {
    const wordsToProcess = quickAddInput.split(';').map(w => w.trim()).filter(Boolean);
    if (wordsToProcess.length === 0) return;
    setIsAdding(true);
    try {
      const newItems: VocabularyItem[] = [];
      for (const word of wordsToProcess) {
        const exists = await findWordByText(userId, word);
        if (!exists) {
          const newItem = createNewWord(word, '', '', '', '', []);
          newItem.userId = userId;
          newItems.push(newItem);
        }
      }
      if (newItems.length > 0) await bulkSaveWords(newItems);
      
      setNotification({ type: 'success', message: `Added ${newItems.length} items.` });
      setQuickAddInput(''); 
      setIsAddExpanded(false);
      setRefinedFilter('not_refined'); 
      loadPage();
    } catch (e) {
      setNotification({ type: 'error', message: 'Failed to add words.' });
    } finally { setIsAdding(false); }
  };

  const handleStartRefinement = () => {
    if (selectedIds.size > 0) setIsManualRefineModalOpen(true);
    else setNotification({ type: 'info', message: 'Select words to refine first.' });
  };

  const selectedWordsToRefine = useMemo(() => words.filter(w => selectedIds.has(w.id)), [words, selectedIds]);
  const toggleSelectAll = () => { if (selectedIds.size === words.length && words.length > 0) setSelectedIds(new Set()); else setSelectedIds(new Set(words.map(w => w.id))); };
  const toggleSelectOne = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const confirmDelete = async () => {
    if (!wordToDelete) return;
    setIsDeleting(true);
    try { await onDelete(wordToDelete.id); setNotification({ type: 'success', message: 'Deleted successfully.' }); setWordToDelete(null); loadPage(); } finally { setIsDeleting(false); }
  };
  const handleSaveEdit = async (updated: VocabularyItem) => { await onUpdate(updated); setWords(prev => prev.map(w => w.id === updated.id ? updated : w)); };

  const labOpts: { id: FilterType, label: string, icon: any }[] = [ { id: 'all', label: 'All Labs', icon: Filter }, { id: 'vocab', label: 'Vocabulary', icon: BookOpen }, { id: 'idiom', label: 'Idioms', icon: Quote }, { id: 'phrasal', label: 'Phrasal Verbs', icon: Layers }, { id: 'colloc', label: 'Collocations', icon: Combine }, { id: 'phrase', label: 'Phrases', icon: MessageSquare }, { id: 'preposition', label: 'Prepositions', icon: AtSign }, { id: 'pronun', label: 'Pronunciation', icon: Mic } ];
  const refOpts: { id: RefinedFilter, label: string, icon: any }[] = [ { id: 'all', label: 'Refine Status', icon: Sparkles }, { id: 'refined', label: 'Refined', icon: Wand2 }, { id: 'not_refined', label: 'Needs Refine', icon: AlertCircle } ];
  const statOpts: { id: StatusFilter, label: string, icon: any }[] = [ { id: 'all', label: 'All Studied', icon: Filter }, { id: 'new', label: 'New Only', icon: BookOpen }, { id: 'forgot', label: 'Forgot Status', icon: XCircle }, { id: 'hard', label: 'Hard Status', icon: AlertCircle }, { id: 'easy', label: 'Easy Status', icon: CheckCircle2 } ];

  const currLab = useMemo(() => labOpts.find(o => o.id === activeFilter), [activeFilter]);
  const currRef = useMemo(() => refOpts.find(o => o.id === refinedFilter), [refinedFilter]);
  const currStat = useMemo(() => statOpts.find(o => o.id === statusFilter), [statusFilter]);
  
  const isRefined = (item: VocabularyItem) => !!(item.meaningVi && item.ipa && item.example);

  const getStatusBadge = (item: VocabularyItem) => {
    if (!item.lastReview) return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-100">New</span>;
    switch (item.lastGrade) {
      case ReviewGrade.FORGOT: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-rose-50 text-rose-600 border border-rose-100">Forgot</span>;
      case ReviewGrade.HARD: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-orange-50 text-orange-600 border border-orange-100">Hard</span>;
      case ReviewGrade.EASY: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-green-50 text-green-600 border border-green-100">Easy</span>;
      default: return <span className="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase bg-neutral-50 text-neutral-400 border border-neutral-100">Studied</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative pb-24">
      {notification && (<div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] bg-neutral-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-neutral-800 animate-in slide-in-from-top-4 flex items-center space-x-2">{notification.type === 'success' ? <CheckCircle2 size={18} className="text-green-400" /> : <AlertCircle size={18} className="text-orange-400" />}<span className="text-sm font-bold">{notification.message}</span></div>)}
      
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Word Library</h2><p className="text-neutral-500 text-sm mt-1">{total} items collected.</p></div>
        <button onClick={() => setIsAddExpanded(!isAddExpanded)} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest shadow-sm">
          {isAddExpanded ? <X size={16} /> : <Plus size={16} />}
          <span>{isAddExpanded ? 'Close Add' : 'Add Words'}</span>
        </button>
      </header>

      {isAddExpanded && (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-neutral-100 shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-300">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Batch Add Words (separated by semicolon)</label>
            <textarea autoFocus value={quickAddInput} onChange={(e) => setQuickAddInput(e.target.value)} placeholder="e.g. resilient; ubiquitous; mitigate; ..." className="w-full h-24 p-5 bg-neutral-50 border border-neutral-200 rounded-3xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none transition-all shadow-inner" />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2 border-t border-neutral-50">
            <p className="text-[10px] text-neutral-400 font-bold uppercase italic">Words will be added as headwords. Refine them later with AI using the "Needs Refine" filter.</p>
            <button onClick={handleBatchAdd} disabled={isAdding || !quickAddInput.trim()} className="w-full sm:w-auto px-10 py-4 bg-neutral-900 text-white rounded-[1.5rem] font-black text-xs flex items-center justify-center space-x-3 hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest shadow-lg">
              {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              <span>{isAdding ? 'Adding Items...' : 'Save into Library'}</span>
            </button>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative w-full md:col-span-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm" /></div>
        <div className="relative w-full" ref={labFilterRef}><button onClick={() => setLabFilterOpen(!labFilterOpen)} className="w-full flex items-center justify-between text-left px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 hover:bg-neutral-100 transition-colors shadow-sm"><span className="flex items-center space-x-2 truncate">{currLab ? <currLab.icon size={16} /> : <Filter size={16} />}<span className="truncate">{currLab?.label || 'Filter Labs'}</span></span><ChevronDown size={16} className={`text-neutral-400 transition-transform ${labFilterOpen ? 'rotate-180' : ''}`} /></button>{labFilterOpen && <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-lg border border-neutral-100 z-20 p-2 max-h-60 overflow-y-auto invisible-scrollbar">{labOpts.map(o => <button key={o.id} onClick={() => { setActiveFilter(o.id); setLabFilterOpen(false); }} className={`w-full text-left flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeFilter === o.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}><o.icon size={16} /><span>{o.label}</span></button>)}</div>}</div>
        <div className="relative w-full" ref={statusFilterRef}><button onClick={() => setStatusFilterOpen(!statusFilterOpen)} className="w-full flex items-center justify-between text-left px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 hover:bg-neutral-100 transition-colors shadow-sm"><span className="flex items-center space-x-2 truncate">{currStat ? <currStat.icon size={16} /> : <GraduationCap size={16} />}<span className="truncate">{currStat?.label || 'All Studied'}</span></span><ChevronDown size={16} className={`text-neutral-400 transition-transform ${statusFilterOpen ? 'rotate-180' : ''}`} /></button>{statusFilterOpen && <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-lg border border-neutral-100 z-20 p-2">{statOpts.map(o => <button key={o.id} onClick={() => { setStatusFilter(o.id); setStatusFilterOpen(false); }} className={`w-full text-left flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${statusFilter === o.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}><o.icon size={16} /><span>{o.label}</span></button>)}</div>}</div>
        <div className="relative w-full" ref={refinedFilterRef}><button onClick={() => setRefinedFilterOpen(!refinedFilterOpen)} className="w-full flex items-center justify-between text-left px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 hover:bg-neutral-100 transition-colors shadow-sm"><span className="flex items-center space-x-2 truncate">{currRef ? <currRef.icon size={16} /> : <Sparkles size={16} />}<span className="truncate">{currRef?.label || 'Refine Status'}</span></span><ChevronDown size={16} className={`text-neutral-400 transition-transform ${refinedFilterOpen ? 'rotate-180' : ''}`} /></button>{refinedFilterOpen && <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-lg border border-neutral-100 z-20 p-2">{refOpts.map(o => <button key={o.id} onClick={() => { setRefinedFilter(o.id); setRefinedFilterOpen(false); }} className={`w-full text-left flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${refinedFilter === o.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}><o.icon size={16} /><span>{o.label}</span></button>)}</div>}</div>
      </div>

      <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]">
        {loading ? <div className="flex flex-col items-center justify-center h-80 space-y-4"><Loader2 className="animate-spin text-neutral-200" size={40} /><p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Searching...</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-neutral-50/50 border-b border-neutral-100"><th className="px-6 py-5 w-10"><button onClick={toggleSelectAll} className="text-neutral-300 hover:text-neutral-900 transition-colors">{selectedIds.size === words.length && words.length > 0 ? <CheckSquare size={18} className="text-neutral-900" /> : <Square size={18} />}</button></th><th className="px-2 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vocabulary</th><th className="px-6 py-5 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Studied Status</th><th className="px-4 py-5 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Next Review</th><th className="px-6 py-5 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Actions</th></tr></thead>
              <tbody className="divide-y divide-neutral-50">
                {words.length === 0 ? <tr><td colSpan={5} className="p-20 text-center text-sm font-medium italic text-neutral-300">No items found.</td></tr> : (words.map(item => { const isSelected = selectedIds.has(item.id); const reviewStatus = getRemainingTime(item.nextReview); return (<tr key={item.id} className={`hover:bg-neutral-50/80 cursor-pointer group transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`} onClick={() => setEditingWord(item)}><td className="px-6 py-5" onClick={(e) => toggleSelectOne(item.id, e)}>{isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-neutral-200 group-hover:text-neutral-400" />}</td><td className="px-2 py-5"><div className="flex items-center space-x-2"><div className="font-bold text-neutral-900">{item.word}</div>{isRefined(item) ? <span title="AI Refined"><Wand2 size={12} className="text-blue-500"/></span> : <span title="Needs Refine"><AlertCircle size={12} className="text-rose-500"/></span>}{!item.lastReview && <div title="New word" className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>}</div><div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1"><span className="text-[10px] font-mono text-neutral-400">{item.ipa || '/?/'}</span>{item.needsPronunciationFocus && <Mic size={12} className="text-rose-500" />}{item.tags && item.tags.length > 0 && <Tag size={12} className="text-neutral-400" />}</div></td><td className="px-6 py-5 text-center">{getStatusBadge(item)}</td><td className="px-4 py-5 text-center"><div className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${reviewStatus.urgency === 'due' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-neutral-50 text-neutral-400 border border-neutral-100'}`}><span>{reviewStatus.label}</span></div></td><td className="px-6 py-5 text-right"><div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setEditingWord(item); }} className="p-2.5 text-neutral-300 hover:text-neutral-900 transition-all"><Edit3 size={16} /></button><button onClick={(e) => { e.stopPropagation(); setWordToDelete(item); }} className="p-2.5 text-neutral-300 hover:text-red-500 transition-all"><Trash2 size={16} /></button></div></td></tr>); }))}
              </tbody>
            </table>
            <div className="p-6 bg-neutral-50/30 flex flex-col md:flex-row items-center justify-between border-t border-neutral-100 gap-4">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Page Size</span><div className="relative"><select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-2 pr-8 text-xs font-bold cursor-pointer">{[10, 15, 25, 50, 100].map(o => <option key={o} value={o}>{o}</option>)}</select><ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" /></div></div>
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Page {page + 1} of {totalPages || 1}</span>
              </div>
              <div className="flex space-x-2"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronLeft size={14} className="mr-1" /> Prev</button><button disabled={(page + 1) >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm">Next <ChevronRight size={14} className="ml-1" /></button></div>
            </div>
          </div>
        )}
      </div>

      {editingWord && <EditWordModal word={editingWord} onSave={handleSaveEdit} onClose={() => setEditingWord(null)} />}
      <DeleteConfirmationModal isOpen={!!wordToDelete} wordText={wordToDelete?.word || ''} isDeleting={isDeleting} onConfirm={confirmDelete} onClose={() => setWordToDelete(null)} />
      
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] w-full max-w-lg px-4 animate-in slide-in-from-bottom-8">
          <div className="bg-neutral-900 text-white rounded-[2rem] p-4 shadow-2xl flex items-center justify-between border border-neutral-800">
            <div className="flex items-center space-x-4 pl-2"><button onClick={() => setSelectedIds(new Set())} className="text-neutral-500 hover:text-white transition-colors"><X size={20} /></button><div><div className="text-sm font-black">{selectedIds.size} selected</div></div></div>
            <div className="flex items-center space-x-2">
              <button onClick={handleStartRefinement} className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-black flex items-center space-x-2 transition-colors"><Wand2 size={14} /> <span>REFINE</span></button>
              <button onClick={() => { const items = words.filter(w => selectedIds.has(w.id)); onStartSession(items); }} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black flex items-center space-x-2"><Play size={14} fill="currentColor"/> <span>PRACTICE</span></button>
            </div>
          </div>
        </div>
      )}

      {isManualRefineModalOpen && selectedWordsToRefine.length > 0 && <ManualRefineModal wordsToRefine={selectedWordsToRefine} onClose={() => setIsManualRefineModalOpen(false)} onComplete={() => { setIsManualRefineModalOpen(false); loadPage(); setSelectedIds(new Set()); setNotification({ type: 'success', message: 'Words refined successfully!' }); }} />}
    </div>
  );
};

export default WordList;