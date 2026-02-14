
import React, { useState, useEffect, useMemo } from 'react';
import { User, NativeSpeakItem, VocabularyItem, FocusColor, SpeakingBook, ConversationItem, FreeTalkItem, AppView } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Mic, Plus, Edit3, Trash2, AudioLines, Sparkles, MessageSquare, Play, Target, Library, FolderPlus, Pen, Move, ArrowLeft, MessageCircle, Tag, Shuffle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { TagBrowser } from '../../components/common/TagBrowser';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getRefineNativeSpeakPrompt, getGenerateConversationPrompt } from '../../services/promptService';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { ResourceActions } from '../page/ResourceActions';
import { useShelfLogic } from '../../app/hooks/useShelfLogic';
import { AddShelfModal, RenameShelfModal, MoveBookModal } from '../../components/wordbook/ShelfModals';
import { UniversalBook } from '../../components/common/UniversalBook';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { GenericBookDetail, GenericBookItem } from '../../components/common/GenericBookDetail';
import { ShelfSearchBar } from '../../components/common/ShelfSearchBar';
import { SimpleMimicModal } from '../../components/common/SimpleMimicModal';

// Import extracted components
import { AddEditNativeSpeakModal } from '../../components/speaking/AddEditNativeSpeakModal';
import { AddEditConversationModal } from '../../components/speaking/AddEditConversationModal';
import { AddEditFreeTalkModal } from '../../components/speaking/AddEditFreeTalkModal';
import { SpeakingPracticeModal } from '../../components/speaking/SpeakingPracticeModal';
import { ConversationPracticeModal } from '../../components/speaking/ConversationPracticeModal';
import { FreeTalkPracticeModal } from '../../components/speaking/FreeTalkPracticeModal';

const VIEW_SETTINGS_KEY = 'vocab_pro_speaking_card_view';

interface Props {
  user: User;
  onNavigate?: (view: AppView) => void;
}

type SpeakingItem = 
  | { type: 'card'; data: NativeSpeakItem }
  | { type: 'conversation'; data: ConversationItem }
  | { type: 'free_talk'; data: FreeTalkItem };

export const SpeakingCardPage: React.FC<Props> = ({ user, onNavigate }) => {
  const [items, setItems] = useState<SpeakingItem[]>([]);
  const [speakingBooks, setSpeakingBooks] = useState<SpeakingBook[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showTags: true, compact: false, resourceType: 'ALL' }));
  const handleSettingChange = (key: string, value: any) => setViewSettings(prev => ({ ...prev, [key]: value }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  
  const [viewMode, setViewMode] = useState<'LIST' | 'SHELF' | 'BOOK_DETAIL'>('LIST');
  const [activeBook, setActiveBook] = useState<SpeakingBook | null>(null);

  // Edit Modals State
  const [isModalOpen, setIsModalOpen] = useState(false); // Native Speak
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const [isFreeTalkModalOpen, setIsFreeTalkModalOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<NativeSpeakItem | null>(null);
  const [editingConversation, setEditingConversation] = useState<ConversationItem | null>(null);
  const [editingFreeTalk, setEditingFreeTalk] = useState<FreeTalkItem | null>(null);

  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'card' | 'conversation' | 'free_talk' } | null>(null);
  
  // AI Modals
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isConversationAiModalOpen, setIsConversationAiModalOpen] = useState(false);
  const [itemToRefine, setItemToRefine] = useState<Partial<NativeSpeakItem> | null>(null);
  
  // Practice Modals State
  const [practiceModalItem, setPracticeModalItem] = useState<NativeSpeakItem | null>(null);
  const [practiceConversation, setPracticeConversation] = useState<ConversationItem | null>(null);
  const [practiceFreeTalk, setPracticeFreeTalk] = useState<FreeTalkItem | null>(null);

  const { showToast } = useToast();
  
  const { currentShelfName, booksOnCurrentShelf, allShelves, addShelf, renameShelf, removeShelf, nextShelf, prevShelf, selectShelf } = useShelfLogic(speakingBooks, 'speaking_books_shelves');
  const [isAddShelfModalOpen, setIsAddShelfModalOpen] = useState(false);
  const [isRenameShelfModalOpen, setIsRenameShelfModalOpen] = useState(false);
  const [bookToMove, setBookToMove] = useState<SpeakingBook | null>(null);
  const [bookToDelete, setBookToDelete] = useState<SpeakingBook | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [cards, conversations, freeTalks, books] = await Promise.all([ 
        db.getNativeSpeakItemsByUserId(user.id), 
        db.getConversationItemsByUserId(user.id),
        db.getFreeTalkItemsByUserId(user.id),
        db.getSpeakingBooksByUserId(user.id) 
    ]);
    const combined: SpeakingItem[] = [ 
        ...cards.map(c => ({ type: 'card' as const, data: c })), 
        ...conversations.map(c => ({ type: 'conversation' as const, data: c })),
        ...freeTalks.map(c => ({ type: 'free_talk' as const, data: c }))
    ];
    setItems(combined.sort((a, b) => b.data.createdAt - a.data.createdAt));
    setSpeakingBooks(books.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user.id]);
  useEffect(() => { setPage(0); }, [selectedTag, pageSize, focusFilter, colorFilter, viewSettings.resourceType]);
  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const hasActiveFilters = useMemo(() => {
    return viewSettings.resourceType !== 'ALL' || focusFilter !== 'all' || colorFilter !== 'all';
  }, [viewSettings.resourceType, focusFilter, colorFilter]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (viewSettings.resourceType !== 'ALL' && item.type.toUpperCase() !== viewSettings.resourceType) return false;
      if (focusFilter === 'focused' && !item.data.isFocused) return false;
      if (colorFilter !== 'all' && item.data.focusColor !== colorFilter) return false;
      if (selectedTag) {
          if (selectedTag === 'Uncategorized') { if (item.data.path && item.data.path !== '/') return false; } 
          else { if (!item.data.path?.startsWith(selectedTag) && !item.data.tags?.includes(selectedTag)) return false; }
      }
      return true;
    });
  }, [items, selectedTag, focusFilter, colorFilter, viewSettings.resourceType]);
  
  const pagedItems = useMemo(() => { const start = page * pageSize; return filteredItems.slice(start, start + pageSize); }, [filteredItems, page, pageSize]);

  // --- Handlers ---

  const handleSaveItem = async (data: any) => {
    const now = Date.now();
    if (editingItem && editingItem.id) { 
        await dataStore.saveNativeSpeakItem({ ...editingItem, ...data, updatedAt: now }); 
    } else { 
        await dataStore.saveNativeSpeakItem({ id: `ns-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data }); 
    }
    setIsModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveConversation = async (formData: Partial<ConversationItem>) => {
    const now = Date.now();
    if (editingConversation && editingConversation.id) { 
        await dataStore.saveConversationItem({ ...editingConversation, ...formData, updatedAt: now } as ConversationItem); 
    } else { 
        await dataStore.saveConversationItem({ id: `conv-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, title: formData.title || '', description: formData.description || '', speakers: formData.speakers || [], sentences: formData.sentences || [], tags: formData.tags || [] } as ConversationItem); 
    }
    setIsConversationModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveFreeTalk = async (data: { title: string, content: string, tags: string[] }) => {
    const now = Date.now();
    if (editingFreeTalk && editingFreeTalk.id) {
        await dataStore.saveFreeTalkItem({ ...editingFreeTalk, ...data, updatedAt: now });
    } else {
        await dataStore.saveFreeTalkItem({ id: `ft-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data });
    }
    setIsFreeTalkModalOpen(false); loadData(); showToast("Free Talk Saved!", "success");
  };

  const handleEditItem = (item: SpeakingItem) => {
    if (item.type === 'card') { setEditingItem(item.data as NativeSpeakItem); setIsModalOpen(true); } 
    else if (item.type === 'conversation') { setEditingConversation(item.data as ConversationItem); setIsConversationModalOpen(true); }
    else if (item.type === 'free_talk') { setEditingFreeTalk(item.data as FreeTalkItem); setIsFreeTalkModalOpen(true); }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'card') await dataStore.deleteNativeSpeakItem(itemToDelete.id);
    else if (itemToDelete.type === 'conversation') await dataStore.deleteConversationItem(itemToDelete.id);
    else if (itemToDelete.type === 'free_talk') await dataStore.deleteFreeTalkItem(itemToDelete.id);

    setItemToDelete(null); loadData(); showToast("Deleted!", "success");
  };

  const handleFocusChange = async (item: SpeakingItem, color: FocusColor | null) => {
      const updated = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete (updated as any).focusColor;
      
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else if (item.type === 'conversation') await dataStore.saveConversationItem(updated as ConversationItem);
      else if (item.type === 'free_talk') await dataStore.saveFreeTalkItem(updated as FreeTalkItem);
      
      loadData();
  };
  
  const handleToggleFocus = async (item: SpeakingItem) => {
      const updated = { ...item.data, isFocused: !item.data.isFocused, updatedAt: Date.now() };
      
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else if (item.type === 'conversation') await dataStore.saveConversationItem(updated as ConversationItem);
      else if (item.type === 'free_talk') await dataStore.saveFreeTalkItem(updated as FreeTalkItem);
      
      loadData();
  };

  const handleConversationAiResult = (data: any) => {
      setEditingConversation(prev => ({ ...prev || {}, title: data.title, description: data.description, speakers: data.speakers, sentences: data.sentences, tags: data.tags } as ConversationItem));
      setIsConversationAiModalOpen(false); showToast("Conversation generated!", "success");
  };

  // --- Shelf Navigation ---
  const handleNavigateShelf = (name: string) => { selectShelf(name); setViewMode('SHELF'); };
  const handleNavigateBook = (book: SpeakingBook) => { setActiveBook(book); setViewMode('BOOK_DETAIL'); };
  const handleCreateEmptyBook = async () => {
    const nb: SpeakingBook = { id: `sb-${Date.now()}`, userId: user.id, title: `${currentShelfName}: New Book`, itemIds: [], createdAt: Date.now(), updatedAt: Date.now(), color: '#d81b60', icon: '🗣️' };
    await dataStore.saveSpeakingBook(nb); await loadData(); setActiveBook(nb); setViewMode('BOOK_DETAIL');
  };

  const handleRenameShelfAction = (newName: string) => {
      const success = renameShelf(newName, async (oldS, nS) => {
          setLoading(true);
          const booksToUpdate = speakingBooks.filter(b => {
               const parts = b.title.split(':');
               const shelf = parts.length > 1 ? parts[0].trim() : 'General';
               return shelf === oldS;
          });

          await Promise.all(booksToUpdate.map(b => {
               const parts = b.title.split(':');
               const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
               const newFullTitle = `${nS}: ${bookTitle}`;
               return db.saveSpeakingBook({ ...b, title: newFullTitle, updatedAt: Date.now() });
          }));
          await loadData();
      });
      if (success) setIsRenameShelfModalOpen(false);
  };

  if (viewMode === 'BOOK_DETAIL' && activeBook) {
      const itemsMap = new Map<string, SpeakingItem>(items.map(i => [i.data.id, i]));
      const gItems = activeBook.itemIds.map(id => {
          const item = itemsMap.get(id); if (!item) return null;
          let subtitle = 'Expression';
          if (item.type === 'conversation') subtitle = 'Conversation';
          if (item.type === 'free_talk') subtitle = 'Free Talk';
          
          const title = item.type === 'card' ? (item.data as NativeSpeakItem).standard : (item.type === 'conversation' ? (item.data as ConversationItem).title : (item.data as FreeTalkItem).title);

          return { id, title, subtitle, data: item, focusColor: item.data.focusColor, isFocused: item.data.isFocused } as GenericBookItem;
      }).filter((x): x is GenericBookItem => x !== null);
      
      const avItems = items.map(i => {
          const title = i.type === 'card' ? (i.data as NativeSpeakItem).standard : (i.type === 'conversation' ? (i.data as ConversationItem).title : (i.data as FreeTalkItem).title);
          let subtitle = 'Expression';
          if (i.type === 'conversation') subtitle = 'Conversation';
          if (i.type === 'free_talk') subtitle = 'Free Talk';
          
          return { id: i.data.id, title, subtitle, data: i } as GenericBookItem;
      });

      return <GenericBookDetail book={activeBook} items={gItems} availableItems={avItems} onBack={() => { setActiveBook(null); setViewMode('SHELF'); loadData(); }} onUpdateBook={async (u) => { const nb = { ...activeBook, ...u }; await dataStore.saveSpeakingBook(nb); setActiveBook(nb); }} onAddItem={async (ids) => { const nb = { ...activeBook, itemIds: Array.from(new Set([...activeBook.itemIds, ...ids])) }; await dataStore.saveSpeakingBook(nb); setActiveBook(nb); }} onRemoveItem={async (id) => { const nb = { ...activeBook, itemIds: activeBook.itemIds.filter(x => x !== id) }; await dataStore.saveSpeakingBook(nb); setActiveBook(nb); }} onOpenItem={(g) => { const si = g.data as SpeakingItem; if (si.type === 'card') setPracticeModalItem(si.data); else if (si.type === 'conversation') setPracticeConversation(si.data); else setPracticeFreeTalk(si.data); }} onEditItem={(g) => handleEditItem(g.data as SpeakingItem)} onFocusChange={(g, c) => handleFocusChange(g.data as SpeakingItem, c)} onToggleFocus={(g) => handleToggleFocus(g.data as SpeakingItem)} itemIcon={<Mic size={16}/>} />;
  }

  if (viewMode === 'SHELF') {
      return (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="flex flex-col gap-4">
               <button onClick={() => setViewMode('LIST')} className="w-fit flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors group"><ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /><span>Back to Main Library</span></button>
               <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><div className="shrink-0"><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Speaking Shelf</h2><p className="text-neutral-500 mt-1 font-medium">Organize your speaking topics.</p></div><ShelfSearchBar shelves={allShelves} books={speakingBooks} onNavigateShelf={handleNavigateShelf} onNavigateBook={handleNavigateBook} /><button onClick={() => setIsAddShelfModalOpen(true)} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm"><FolderPlus size={14}/> Add Shelf</button></header>
           </div>
          <UniversalShelf label={currentShelfName} onNext={allShelves.length > 1 ? nextShelf : undefined} onPrev={allShelves.length > 1 ? prevShelf : undefined} actions={<div className="flex items-center gap-2"><button onClick={() => setIsRenameShelfModalOpen(true)} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white" title="Rename Shelf"><Pen size={14}/></button><button onClick={removeShelf} disabled={booksOnCurrentShelf.length > 0} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/20" title="Remove Empty Shelf"><Trash2 size={14}/></button></div>} isEmpty={booksOnCurrentShelf.length === 0} emptyAction={<button onClick={handleCreateEmptyBook} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-widest border border-white/20">Create First Book</button>} >
             {booksOnCurrentShelf.map(book => {
                 const displayTitle = book.title.split(':').pop()?.trim() || book.title;
                 return <UniversalBook key={book.id} id={book.id} title={displayTitle} subTitle={`${book.itemIds.length} Items`} icon={<Mic size={24}/>} color={book.color} titleColor={book.titleColor} titleSize={book.titleSize} titleTop={book.titleTop} titleLeft={book.titleLeft} iconTop={book.iconTop} iconLeft={book.iconLeft} onClick={() => { setActiveBook(book); setViewMode('BOOK_DETAIL'); }} actions={<><button onClick={(e) => { e.stopPropagation(); setBookToMove(book); }} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-neutral-700 hover:text-white transition-all shadow-sm" title="Move to Shelf"><Move size={16}/></button><button onClick={(e) => { e.stopPropagation(); setBookToDelete(book); }} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Delete"><Trash2 size={16}/></button></>} />;
             })}
             <div className="group translate-y-0"><div className="relative w-full aspect-[5/7] rounded-lg bg-neutral-800/50 border-2 border-dashed border-neutral-500/50 transition-all duration-300 group-hover:border-neutral-400 group-hover:bg-neutral-800/80 group-hover:shadow-xl flex flex-col items-stretch justify-center overflow-hidden"><button onClick={handleCreateEmptyBook} className="flex-1 flex flex-col items-center justify-center p-2 text-center text-neutral-400 hover:bg-white/5 transition-colors"><Plus size={32} className="mb-2 text-neutral-500"/><h3 className="font-sans text-xs font-black uppercase tracking-wider">New Book</h3></button></div></div>
          </UniversalShelf>
          <ConfirmationModal isOpen={!!bookToDelete} title="Delete Book?" message={<>Are you sure you want to delete <strong>"{bookToDelete?.title.split(':').pop()?.trim()}"</strong>? Items inside will not be deleted.</>} confirmText="Delete" isProcessing={false} onConfirm={async () => { if (bookToDelete) await dataStore.deleteSpeakingBook(bookToDelete.id); setBookToDelete(null); loadData(); }} onClose={() => setBookToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
          <MoveBookModal isOpen={!!bookToMove} onClose={() => setBookToMove(null)} onConfirm={async (s) => { if (bookToMove) { const nb = { ...bookToMove, title: `${s}: ${bookToMove.title.split(':').pop()?.trim()}` }; await dataStore.saveSpeakingBook(nb); setBookToMove(null); loadData(); } }} shelves={allShelves} currentShelf={bookToMove ? (bookToMove.title.split(':')[0].trim()) : 'General'} bookTitle={bookToMove?.title || ''} />
          <AddShelfModal isOpen={isAddShelfModalOpen} onClose={() => setIsAddShelfModalOpen(false)} onSave={(name) => { if(addShelf(name)) setIsAddShelfModalOpen(false); }} />
          <RenameShelfModal isOpen={isRenameShelfModalOpen} onClose={() => setIsRenameShelfModalOpen(false)} onSave={handleRenameShelfAction} initialName={currentShelfName} />
        </div>
      );
  }

  return (
    <>
    <ResourcePage title="Speaking Library" subtitle="Master natural phrases." icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png" className="w-8 h-8 object-contain" alt="Speaking" />} centerContent={<ShelfSearchBar shelves={allShelves} books={speakingBooks} onNavigateShelf={handleNavigateShelf} onNavigateBook={handleNavigateBook} />} config={{}} isLoading={loading} isEmpty={filteredItems.length === 0} emptyMessage="No items found." activeFilters={{}} onFilterChange={() => {}} pagination={{ page, totalPages: Math.ceil(filteredItems.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredItems.length }} aboveGrid={<>{isTagBrowserOpen && <TagBrowser items={items.map(i => i.data)} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}</>} minorSkills={<button onClick={() => onNavigate?.('MIMIC')} className="flex items-center gap-2 px-3 py-2 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-bold hover:bg-neutral-200 transition-colors"><Mic size={16} /><span className="hidden sm:inline">Pronunciation</span></button>} actions={<ResourceActions viewMenu={<ViewMenu isOpen={isViewMenuOpen} setIsOpen={setIsViewMenuOpen} hasActiveFilters={hasActiveFilters} filterOptions={[{ label: 'All', value: 'ALL', isActive: viewSettings.resourceType === 'ALL', onClick: () => handleSettingChange('resourceType', 'ALL') }, { label: 'Card', value: 'CARD', isActive: viewSettings.resourceType === 'CARD', onClick: () => handleSettingChange('resourceType', 'CARD') }, { label: 'Conv.', value: 'CONVERSATION', isActive: viewSettings.resourceType === 'CONVERSATION', onClick: () => handleSettingChange('resourceType', 'CONVERSATION') }, { label: 'Free Talk', value: 'FREE_TALK', isActive: viewSettings.resourceType === 'FREE_TALK', onClick: () => handleSettingChange('resourceType', 'FREE_TALK') }]} customSection={<><div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2"><Target size={10}/> Focus & Status</div><div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2"><button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>{focusFilter === 'focused' ? 'Focused Only' : 'All Items'}</button><div className="flex gap-1"><button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-50 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} /></div></div></>} viewOptions={[{ label: 'Show Tags', checked: viewSettings.showTags, onChange: () => setViewSettings(v => ({...v, showTags: !v.showTags})) }, { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }]} />} browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }} addActions={[{ label: 'New Card', icon: Plus, onClick: () => { setEditingItem(null); setIsModalOpen(true); } }, { label: 'New Conversation', icon: MessageSquare, onClick: () => { setEditingConversation(null); setIsConversationModalOpen(true); } }, { label: 'New Free Talk', icon: MessageCircle, onClick: () => { setEditingFreeTalk(null); setIsFreeTalkModalOpen(true); } }]} extraActions={<><button onClick={() => setItems([...items].sort(() => Math.random() - 0.5))} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button><button onClick={() => setViewMode('SHELF')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200" title="Bookshelf Mode"><Library size={16} /><span>Bookshelf</span></button></>} />}>
      {() => (
        <>
          {(pagedItems as SpeakingItem[]).map((item) => {
              if (item.type === 'card') {
                 return (
                    <UniversalCard
                        key={item.data.id}
                        title={<div className="flex items-center gap-2 font-black text-neutral-900">{(item.data as NativeSpeakItem).standard}</div>}
                        badge={{ label: 'Native Expression', colorClass: 'bg-teal-50 text-teal-700 border-teal-100', icon: AudioLines }}
                        tags={viewSettings.showTags ? item.data.tags : undefined}
                        compact={viewSettings.compact}
                        onClick={() => setPracticeModalItem(item.data as NativeSpeakItem)}
                        focusColor={item.data.focusColor}
                        onFocusChange={(c) => handleFocusChange(item, c)}
                        isFocused={item.data.isFocused}
                        onToggleFocus={handleToggleFocus.bind(null, item)}
                        isCompleted={item.data.focusColor === 'green'}
                        actions={
                            <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"><Edit3 size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'card' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14}/></button>
                            </div>
                        }
                    >
                        <div className="space-y-2 mt-2">
                            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as NativeSpeakItem).answers.length} variations</div>
                            <div className="flex justify-end">
                                <button onClick={(e) => { e.stopPropagation(); setPracticeModalItem(item.data as NativeSpeakItem); }} className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg active:scale-95">
                                    <Play size={14} fill="currentColor"/> Practice
                                </button>
                            </div>
                        </div>
                    </UniversalCard>
                 );
              } else if (item.type === 'conversation') {
                  return (
                    <UniversalCard 
                        key={item.data.id} 
                        title={(item.data as ConversationItem).title} 
                        badge={{ label: 'Conversation', colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: MessageSquare }} 
                        tags={viewSettings.showTags ? item.data.tags : undefined} 
                        compact={viewSettings.compact} 
                        onClick={() => setPracticeConversation(item.data as ConversationItem)} 
                        focusColor={item.data.focusColor} 
                        onFocusChange={(c) => handleFocusChange(item, c)} 
                        isFocused={item.data.isFocused} 
                        onToggleFocus={handleToggleFocus.bind(null, item)} 
                        actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'conversation' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as ConversationItem).sentences.length} lines</div>
                            <button onClick={(e) => { e.stopPropagation(); setPracticeConversation(item.data as ConversationItem); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-indigo-200 active:scale-95"><Play size={14}/> Practice</button>
                        </div>
                    </UniversalCard>
                  );
              } else {
                  return (
                    <UniversalCard 
                        key={item.data.id} 
                        title={(item.data as FreeTalkItem).title} 
                        badge={{ label: 'Free Talk', colorClass: 'bg-cyan-50 text-cyan-700 border-cyan-100', icon: MessageCircle }} 
                        tags={viewSettings.showTags ? item.data.tags : undefined} 
                        compact={viewSettings.compact} 
                        onClick={() => setPracticeFreeTalk(item.data as FreeTalkItem)} 
                        focusColor={item.data.focusColor} 
                        onFocusChange={(c) => handleFocusChange(item, c)} 
                        isFocused={item.data.isFocused} 
                        onToggleFocus={handleToggleFocus.bind(null, item)} 
                        actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'free_talk' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Paragraph</div>
                            <button onClick={(e) => { e.stopPropagation(); setPracticeFreeTalk(item.data as FreeTalkItem); }} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-cyan-600 transition-all shadow-cyan-200 active:scale-95"><Play size={14}/> Practice</button>
                        </div>
                    </UniversalCard>
                  );
              }
          })}
        </>
      )}
    </ResourcePage>
    
    <AddEditNativeSpeakModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveItem} initialData={editingItem} />
    <AddEditConversationModal isOpen={isConversationModalOpen} onClose={() => setIsConversationModalOpen(false)} onSave={handleSaveConversation} initialData={editingConversation} onOpenAiGen={() => setIsConversationAiModalOpen(true)} />
    <AddEditFreeTalkModal isOpen={isFreeTalkModalOpen} onClose={() => setIsFreeTalkModalOpen(false)} onSave={handleSaveFreeTalk} initialData={editingFreeTalk} />

    <ConfirmationModal isOpen={!!itemToDelete} title="Delete Item?" message="This action cannot be undone." confirmText="Delete" isProcessing={false} onConfirm={handleConfirmDelete} onClose={() => setItemToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    
    {isAiModalOpen && <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="REFINE_UNIT" title="Refine Expression" description="Enter instructions for AI refinement." initialData={{}} onGeneratePrompt={(i) => getRefineNativeSpeakPrompt(itemToRefine?.standard || '', i.request)} onJsonReceived={(d) => { if (d.answers) { setEditingItem(prev => ({ ...prev || { id: '', userId: user.id, createdAt: 0, updatedAt: 0, standard: '', answers: [], tags: [], note: '' }, standard: d.standard, answers: d.answers })); setIsAiModalOpen(false); showToast("Refined!", "success"); } }} actionLabel="Apply" />}
    {isConversationAiModalOpen && <UniversalAiModal isOpen={isConversationAiModalOpen} onClose={() => setIsConversationAiModalOpen(false)} type="GENERATE_UNIT" title="AI Conversation Creator" description="Enter a topic to generate a dialogue." initialData={{}} onGeneratePrompt={(i) => getGenerateConversationPrompt(i.request)} onJsonReceived={handleConversationAiResult} actionLabel="Generate" closeOnSuccess={true} />}
    
    <SpeakingPracticeModal isOpen={!!practiceModalItem} onClose={() => setPracticeModalItem(null)} item={practiceModalItem} />
    <ConversationPracticeModal isOpen={!!practiceConversation} onClose={() => setPracticeConversation(null)} item={practiceConversation} />
    <FreeTalkPracticeModal isOpen={!!practiceFreeTalk} onClose={() => setPracticeFreeTalk(null)} item={practiceFreeTalk} />
    </>
  );
};

export default SpeakingCardPage;
