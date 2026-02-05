
import React, { useState, useEffect, useMemo } from 'react';
import { User, ListeningItem, FocusColor, ListeningBook } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Ear, Plus, Edit3, Trash2, Volume2, Save, X, Info, Tag, Shuffle, FolderTree, Target, LayoutList, FolderPlus, Book, Move, Pen, Library, ArrowLeft } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { speak } from '../../utils/audio';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { TagBrowser } from '../../components/common/TagBrowser';
import { ResourceActions } from '../page/ResourceActions';
import { useShelfLogic } from '../../app/hooks/useShelfLogic';
import { AddShelfModal, RenameShelfModal, MoveBookModal } from '../../components/wordbook/ShelfModals';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { UniversalBook } from '../../components/common/UniversalBook';
import { GenericBookDetail, GenericBookItem } from '../../components/common/GenericBookDetail';
import { ShelfSearchBar } from '../../components/common/ShelfSearchBar';

interface Props {
  user: User;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_listening_view';

// --- Highlighted Text Renderer ---
const HighlightedText: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/({.*?})/g);
    return (
        <span>
            {parts.map((part, i) => {
                if (part.startsWith('{') && part.endsWith('}')) {
                    return <span key={i} className="bg-red-100 text-red-700 px-1 rounded-md font-bold mx-0.5 border border-red-200">{part.slice(1, -1)}</span>;
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
};

// --- Add/Edit Modal ---
interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string, note?: string, path?: string, tags?: string[]) => void;
  initialData?: ListeningItem | null;
}

const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [path, setPath] = useState('/');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setText(initialData?.text || '');
      setNote(initialData?.note || '');
      if (initialData?.path === undefined) {
        const legacyTags = initialData?.tags || [];
        const pathFromTags = legacyTags.find(t => t.startsWith('/'));
        const singleTags = legacyTags.filter(t => !t.startsWith('/'));
        setPath(pathFromTags || '/');
        setTagsInput(singleTags.join(', '));
      } else {
        setPath(initialData?.path || '/');
        setTagsInput(initialData?.tags?.join(', ') || '');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      onSave(text.trim(), note.trim(), path.trim(), finalTags);
    }
  };

  const handleWrapSelection = () => {
    const textarea = document.getElementById('listening-text-input') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    if (selectedText) {
        const newText = text.substring(0, start) + `{${selectedText}}` + text.substring(end);
        setText(newText);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Phrase' : 'New Phrase'}</h3>
            <p className="text-sm text-neutral-500">Add text you find hard to hear.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-500">
                Text content 
                <span className="font-normal text-[10px] ml-2 text-neutral-400">(Select text & click Highlight)</span>
            </label>
            <div className="relative">
                <textarea 
                    id="listening-text-input"
                    value={text} 
                    onChange={e => setText(e.target.value)} 
                    placeholder="e.g. I {wanna} go to the store." 
                    rows={4} 
                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-sm leading-relaxed" 
                    required 
                    autoFocus
                />
                <button 
                    type="button" 
                    onClick={handleWrapSelection}
                    className="absolute bottom-3 right-3 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-red-200 transition-colors"
                >
                    Highlight Selection
                </button>
            </div>
            <p className="text-[10px] text-neutral-400 italic">Tip: Use <strong>{`{curly braces}`}</strong> to mark the difficult parts.</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Note (Optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Fast speech, linking sounds..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500">Tags (Keywords)</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="linking, elision..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Item</button>
        </footer>
      </form>
    </div>
  );
};

export const ListeningCardPage: React.FC<Props> = ({ user }) => {
  const [items, setItems] = useState<ListeningItem[]>([]);
  const [listeningBooks, setListeningBooks] = useState<ListeningBook[]>([]);
  const [loading, setLoading] = useState(true);
  
  // View State
  const [viewMode, setViewMode] = useState<'LIST' | 'SHELF' | 'BOOK_DETAIL'>('LIST');
  const [activeBook, setActiveBook] = useState<ListeningBook | null>(null);

  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
      showNote: true,
      compact: false,
      showType: true
  }));

  // Filtering
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);

  // Shelf Logic Hook
  const { 
      currentShelfName, 
      booksOnCurrentShelf, 
      allShelves,
      addShelf, 
      renameShelf, 
      removeShelf, 
      nextShelf, 
      prevShelf,
      selectShelf
  } = useShelfLogic(listeningBooks, 'listening_books_shelves');

  // Shelf Modal State
  const [isAddShelfModalOpen, setIsAddShelfModalOpen] = useState(false);
  const [isRenameShelfModalOpen, setIsRenameShelfModalOpen] = useState(false);
  const [bookToMove, setBookToMove] = useState<ListeningBook | null>(null);

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ListeningItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ListeningItem | null>(null);
  const [bookToDelete, setBookToDelete] = useState<ListeningBook | null>(null);
  
  const { showToast } = useToast();

  const loadData = async () => {
    setLoading(true);
    const [userItems, userBooks] = await Promise.all([
        db.getListeningItemsByUserId(user.id),
        db.getListeningBooksByUserId(user.id)
    ]);
    setItems(userItems.sort((a, b) => b.createdAt - a.createdAt));
    setListeningBooks(userBooks.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user.id]);
  
  // Reset pagination on filter change
  useEffect(() => {
    setPage(0);
  }, [selectedTag, pageSize, focusFilter, colorFilter]);

  // Derived Logic for List View
  const filteredItems = useMemo(() => {
    let result = items;
    if (focusFilter === 'focused') result = result.filter(i => i.isFocused);
    if (colorFilter !== 'all') result = result.filter(i => i.focusColor === colorFilter);
    
    if (selectedTag) {
        if (selectedTag === 'Uncategorized') {
            result = result.filter(item => {
                const path = item.path ?? (item.tags || []).find(t => t.startsWith('/'));
                const hasPath = path && path !== '/' && path !== '';
                return !hasPath;
            });
        } else {
            result = result.filter(i => i.path?.startsWith(selectedTag) || i.tags?.includes(selectedTag));
        }
    }
    return result;
  }, [items, selectedTag, focusFilter, colorFilter]);
  
  const pagedItems = useMemo(() => {
      const start = page * pageSize;
      return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  // Handlers
  const handleNew = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ListeningItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    await dataStore.deleteListeningItem(itemToDelete.id);
    setItemToDelete(null);
    showToast("Deleted item.", "success");
    loadData();
  };

  const handleSave = async (text: string, note?: string, path?: string, tags?: string[]) => {
    try {
      const now = Date.now();
      if (editingItem) {
        const updated = { ...editingItem, text, note, path, tags, updatedAt: now };
        await dataStore.saveListeningItem(updated);
        showToast("Item updated!", "success");
      } else {
        const newItem: ListeningItem = {
          id: `lst-${now}-${Math.random()}`,
          userId: user.id,
          text,
          note,
          path,
          tags,
          createdAt: now,
          updatedAt: now
        };
        await dataStore.saveListeningItem(newItem);
        showToast("Item added!", "success");
      }
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast("Failed to save item.", "error");
    }
  };

  const handlePlay = (text: string) => {
      const cleanText = text.replace(/[{}]/g, '');
      speak(cleanText);
  };

  const handleRandomize = () => {
    setItems(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Shuffled!", "success");
  };
  
  const handleFocusChange = async (item: ListeningItem, color: FocusColor | null) => {
      const updated = { ...item, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete updated.focusColor;
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      await dataStore.saveListeningItem(updated);
  };
  
  const handleToggleFocus = async (item: ListeningItem) => {
      const updated = { ...item, isFocused: !item.isFocused, updatedAt: Date.now() };
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      await dataStore.saveListeningItem(updated);
  };

  // --- Handlers for Shelf Management ---
  const handleRenameShelfAction = (newName: string) => {
      const success = renameShelf(newName, async (oldS, newS) => {
          setLoading(true);
          const booksToUpdate = listeningBooks.filter(b => {
               const parts = b.title.split(':');
               const shelf = parts.length > 1 ? parts[0].trim() : 'General';
               return shelf === oldS;
          });

          await Promise.all(booksToUpdate.map(b => {
               const parts = b.title.split(':');
               const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
               const newFullTitle = `${newS}: ${bookTitle}`;
               return dataStore.saveListeningBook({ ...b, title: newFullTitle, updatedAt: Date.now() });
          }));
          await loadData();
      });
      if (success) setIsRenameShelfModalOpen(false);
  };

  // --- Handlers for Book Management ---
  const handleCreateEmptyBook = async () => {
    const newBook: ListeningBook = {
        id: `lb-${Date.now()}`,
        userId: user.id,
        title: `${currentShelfName}: New Book`,
        itemIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: '#ff9800',
        icon: '🎧'
    };
    await dataStore.saveListeningBook(newBook);
    await loadData();
    setActiveBook(newBook);
    setViewMode('BOOK_DETAIL');
    showToast("New book created.", "success");
  };

  const handleUpdateBook = async (updated: Partial<ListeningBook>) => {
      if (!activeBook) return;
      const newBook = { ...activeBook, ...updated, updatedAt: Date.now() };
      setListeningBooks(prev => prev.map(b => b.id === newBook.id ? newBook : b));
      setActiveBook(newBook);
      await dataStore.saveListeningBook(newBook);
  };

  const handleDeleteBook = async () => {
      if (!bookToDelete) return;
      await dataStore.deleteListeningBook(bookToDelete.id);
      showToast('Book deleted.', 'success');
      setBookToDelete(null);
      await loadData();
  };

  const handleConfirmMoveBook = async (targetShelf: string) => {
      if (!bookToMove) return;
      const parts = bookToMove.title.split(':');
      const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
      const newTitle = `${targetShelf}: ${bookTitle}`;
      
      const updatedBook = { ...bookToMove, title: newTitle, updatedAt: Date.now() };
      await dataStore.saveListeningBook(updatedBook);
      setBookToMove(null);
      await loadData();
      showToast(`Moved to "${targetShelf}".`, 'success');
  };

  // --- Data Transformation for GenericBookDetail ---
  const genericBookItems: GenericBookItem[] = useMemo(() => {
      if (!activeBook) return [];
      return activeBook.itemIds.map((id): GenericBookItem | null => {
          const item = items.find(i => i.id === id);
          if (!item) return null;
          return {
              id: item.id,
              title: item.text,
              subtitle: item.note || 'Listening Practice',
              data: item,
              focusColor: item.focusColor,
              isFocused: item.isFocused
          };
      }).filter((item): item is GenericBookItem => item !== null);
  }, [activeBook, items]);

  const availableGenericItems: GenericBookItem[] = useMemo(() => {
      return items.map(item => ({
          id: item.id,
          title: item.text,
          subtitle: `${item.text.length} characters`,
          data: item
      }));
  }, [items]);

  const handleAddItemsToBook = (ids: string[]) => {
      if (!activeBook) return;
      const newIds = Array.from(new Set([...activeBook.itemIds, ...ids]));
      handleUpdateBook({ itemIds: newIds });
  };
  
  const handleRemoveItemFromBook = (id: string) => {
      if (!activeBook) return;
      const newIds = activeBook.itemIds.filter(uid => uid !== id);
      handleUpdateBook({ itemIds: newIds });
  };
  
  const handleFocusChangeGeneric = (gItem: GenericBookItem, color: any) => {
      const item = gItem.data as ListeningItem;
      handleFocusChange(item, color);
  };

  const handleToggleFocusGeneric = (gItem: GenericBookItem) => {
      const item = gItem.data as ListeningItem;
      handleToggleFocus(item);
  };

  const handleNavigateShelf = (name: string) => {
      selectShelf(name);
      setViewMode('SHELF');
  };

  const handleNavigateBook = (book: ListeningBook) => {
      setActiveBook(book);
      setViewMode('BOOK_DETAIL');
  };

  // --- Views ---

  if (viewMode === 'BOOK_DETAIL' && activeBook) {
      return <GenericBookDetail
          book={activeBook}
          items={genericBookItems}
          availableItems={availableGenericItems}
          onBack={() => { setActiveBook(null); setViewMode('SHELF'); loadData(); }}
          onUpdateBook={handleUpdateBook}
          onAddItem={handleAddItemsToBook}
          onRemoveItem={handleRemoveItemFromBook}
          onOpenItem={(gItem) => handlePlay((gItem.data as ListeningItem).text)}
          onEditItem={(gItem) => handleEdit(gItem.data as ListeningItem)}
          onFocusChange={handleFocusChangeGeneric}
          onToggleFocus={handleToggleFocusGeneric}
          itemIcon={<Ear size={16}/>}
      />;
  }

  if (viewMode === 'SHELF') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
           {/* Header */}
           <div className="flex flex-col gap-4">
               <button onClick={() => setViewMode('LIST')} className="w-fit flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors group">
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Main Library</span>
               </button>
               
               <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <div className="shrink-0">
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Listening Shelf</h2>
                        <p className="text-neutral-500 mt-1 font-medium">Organize your listening practice.</p>
                   </div>
                   
                   <ShelfSearchBar 
                        shelves={allShelves} 
                        books={listeningBooks} 
                        onNavigateShelf={handleNavigateShelf} 
                        onNavigateBook={handleNavigateBook} 
                    />

                   <button onClick={() => setIsAddShelfModalOpen(true)} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm">
                       <FolderPlus size={14}/> Add Shelf
                   </button>
               </header>
           </div>

          <UniversalShelf
            label={currentShelfName}
            onNext={allShelves.length > 1 ? nextShelf : undefined}
            onPrev={allShelves.length > 1 ? prevShelf : undefined}
            actions={
                <div className="flex items-center gap-2">
                     <button onClick={() => setIsRenameShelfModalOpen(true)} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white" title="Rename Shelf"><Pen size={14}/></button>
                     <button onClick={removeShelf} disabled={booksOnCurrentShelf.length > 0} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/20" title="Remove Empty Shelf"><Trash2 size={14}/></button>
                </div>
            }
            isEmpty={booksOnCurrentShelf.length === 0}
            emptyAction={
                 <button onClick={handleCreateEmptyBook} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-widest border border-white/20">
                     Create First Book
                 </button>
            }
          >
             {booksOnCurrentShelf.map(book => {
                 const title = book.title;
                 const parts = title.split(':');
                 const displayTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : title;

                 return (
                    <UniversalBook
                        key={book.id}
                        id={book.id}
                        title={displayTitle}
                        subTitle={`${book.itemIds.length} Items`}
                        icon={<Ear size={24}/>}
                        color={book.color}
                        titleColor={book.titleColor}
                        titleSize={book.titleSize}
                        titleTop={book.titleTop}
                        titleLeft={book.titleLeft}
                        iconTop={book.iconTop}
                        iconLeft={book.iconLeft}

                        onClick={() => { setActiveBook(book); setViewMode('BOOK_DETAIL'); }}
                        actions={
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setBookToMove(book); }} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-neutral-700 hover:text-white transition-all shadow-sm" title="Move to Shelf"><Move size={16}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setBookToDelete(book); }} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Delete">
                                    <Trash2 size={16} />
                                </button>
                            </>
                        }
                    />
                 );
             })}
             
             {/* New Book Placeholder */}
             <div className="group [perspective:1000px] translate-y-0">
                <div className="relative w-full aspect-[5/7] rounded-lg bg-neutral-800/50 border-2 border-dashed border-neutral-500/50 transition-all duration-300 group-hover:border-neutral-400 group-hover:bg-neutral-800/80 group-hover:shadow-xl flex flex-col items-stretch justify-center overflow-hidden">
                    <button onClick={handleCreateEmptyBook} className="flex-1 flex flex-col items-center justify-center p-2 text-center text-neutral-400 hover:bg-white/5 transition-colors">
                        <Plus size={32} className="mb-2 text-neutral-500"/>
                        <h3 className="font-sans text-xs font-black uppercase tracking-wider">New Book</h3>
                    </button>
                </div>
            </div>

          </UniversalShelf>

          <ConfirmationModal
            isOpen={!!bookToDelete}
            title="Delete Book?"
            message={<>Are you sure you want to delete <strong>"{bookToDelete?.title.split(':').pop()?.trim()}"</strong>? Items inside will not be deleted.</>}
            confirmText="Delete"
            isProcessing={false}
            onConfirm={handleDeleteBook}
            onClose={() => setBookToDelete(null)}
            icon={<Trash2 size={40} className="text-red-500"/>}
          />
          
          <MoveBookModal 
            isOpen={!!bookToMove} 
            onClose={() => setBookToMove(null)} 
            onConfirm={handleConfirmMoveBook} 
            shelves={allShelves} 
            currentShelf={bookToMove ? (bookToMove.title.split(':')[0].trim()) : 'General'} 
            bookTitle={bookToMove?.title || ''} 
          />
          <AddShelfModal isOpen={isAddShelfModalOpen} onClose={() => setIsAddShelfModalOpen(false)} onSave={(name) => { if(addShelf(name)) setIsAddShelfModalOpen(false); }} />
          <RenameShelfModal isOpen={isRenameShelfModalOpen} onClose={() => setIsRenameShelfModalOpen(false)} onSave={handleRenameShelfAction} initialName={currentShelfName} />
        </div>
      );
  }

  // --- List View (Default) ---
  return (
    <>
    <ResourcePage
      title="Listening Library"
      subtitle="Practice listening reflexes and capture difficult phrases."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Headphone.png" className="w-8 h-8 object-contain" alt="Listening" />}
      centerContent={
        <ShelfSearchBar 
            shelves={allShelves} 
            books={listeningBooks} 
            onNavigateShelf={handleNavigateShelf} 
            onNavigateBook={handleNavigateBook} 
        />
      }
      config={{}}
      isLoading={loading}
      isEmpty={filteredItems.length === 0}
      emptyMessage="No difficult phrases saved."
      activeFilters={{}}
      onFilterChange={() => {}}
      pagination={{
          page,
          totalPages: Math.ceil(filteredItems.length / pageSize),
          onPageChange: setPage,
          pageSize,
          onPageSizeChange: setPageSize,
          totalItems: filteredItems.length
      }}
      aboveGrid={
        <>
            {isTagBrowserOpen && <TagBrowser items={items} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        </>
      }
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen}
                    setIsOpen={setIsViewMenuOpen}
                    customSection={
                        <>
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                                <Target size={10}/> Focus & Status
                            </div>
                            <div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2">
                                <button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                    {focusFilter === 'focused' ? 'Focused Only' : 'All Items'}
                                </button>
                                <div className="flex gap-1">
                                    <button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-50 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} />
                                </div>
                            </div>
                        </>
                    }
                    viewOptions={[
                        { label: 'Show Notes', checked: viewSettings.showNote, onChange: () => setViewSettings(v => ({...v, showNote: !v.showNote})) },
                        { label: 'Show Card Type', checked: viewSettings.showType, onChange: () => setViewSettings(v => ({...v, showType: !v.showType})) },
                        { label: 'Compact Mode', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                    ]}
                />
            }
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }}
            addActions={[{ label: 'Add Phrase', icon: Plus, onClick: handleNew }]}
            extraActions={
                 <>
                    <button onClick={handleRandomize} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button>
                    <button onClick={() => setViewMode('SHELF')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200" title="Bookshelf Mode">
                        <Library size={16} />
                        <span>Bookshelf</span>
                    </button>
                 </>
            }
        />
      }
    >
      {() => (
        <>
          {pagedItems.map(item => (
            <UniversalCard
                key={item.id}
                title={<HighlightedText text={item.text} />}
                badge={viewSettings.showType ? { label: 'Listening', colorClass: 'bg-red-50 text-red-600 border-red-100', icon: Ear } : undefined}
                tags={item.tags}
                compact={viewSettings.compact}
                onClick={() => handlePlay(item.text)}
                focusColor={item.focusColor}
                onFocusChange={(c) => handleFocusChange(item, c)}
                isFocused={item.isFocused}
                onToggleFocus={() => handleToggleFocus(item)}
                isCompleted={item.focusColor === 'green'}
                actions={
                    <>
                        <button onClick={(e) => { e.stopPropagation(); handlePlay(item.text); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Play">
                            <Volume2 size={14}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit">
                            <Edit3 size={14}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={14}/>
                        </button>
                    </>
                }
            >
                {viewSettings.showNote && item.note && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium bg-neutral-50 px-2 py-1 rounded-lg w-fit">
                        <Info size={12}/> {item.note}
                    </div>
                )}
            </UniversalCard>
          ))}
        </>
      )}
    </ResourcePage>
    
    <AddEditModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingItem} 
    />
    
    <ConfirmationModal 
        isOpen={!!itemToDelete}
        title="Delete Phrase?"
        message="Are you sure you want to remove this phrase?"
        confirmText="Delete"
        isProcessing={false}
        onConfirm={handleDelete}
        onClose={() => setItemToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
    />
    </>
  );
};

export default ListeningCardPage;
