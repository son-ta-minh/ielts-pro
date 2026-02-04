
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Unit, VocabularyItem, ReadingBook, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import { Edit3, Trash2, BookOpen, Plus, Sparkles, Library, FolderTree, Tag, Target, FolderPlus, Pen, Move, Book, ArrowLeft } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import ReadingStudyView from './ReadingStudyView';
import ReadingEditView from './ReadingEditView';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { UniversalBook } from '../../components/common/UniversalBook';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getRefineUnitPrompt } from '../../services/promptService';
import { ResourcePage } from '../page/ResourcePage';
import { ResourceActions } from '../page/ResourceActions';
import { ViewMenu } from '../../components/common/ViewMenu';
import { TagBrowser } from '../../components/common/TagBrowser';
import { UniversalCard } from '../../components/common/UniversalCard';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { AddShelfModal, RenameShelfModal, MoveBookModal } from '../../components/wordbook/ShelfModals';
import { GenericBookDetail, GenericBookItem } from '../../components/common/GenericBookDetail';
import { useShelfLogic } from '../../app/hooks/useShelfLogic';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[]) => void;
  onUpdateUser: (user: User) => Promise<void>;
}

const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
const VIEW_SETTINGS_KEY = 'vocab_pro_reading_view_settings';

export const ReadingUnitPage: React.FC<Props> = ({ user, onStartSession, onUpdateUser }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [readingBooks, setReadingBooks] = useState<ReadingBook[]>([]);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // View State
  const [viewMode, setViewMode] = useState<'LIST' | 'SHELF' | 'READ' | 'EDIT' | 'BOOK_DETAIL'>('LIST');
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  const [activeBook, setActiveBook] = useState<ReadingBook | null>(null);
  
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  const [bookToDelete, setBookToDelete] = useState<ReadingBook | null>(null);
  const [showRefineAiModal, setShowRefineAiModal] = useState(false);
  
  // List View Filter State
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showDesc: true, compact: false }));
  
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
  } = useShelfLogic(readingBooks, 'reading_books_shelves');

  // Shelf Modal State (Managed locally to pass handlers)
  const [isAddShelfModalOpen, setIsAddShelfModalOpen] = useState(false);
  const [isRenameShelfModalOpen, setIsRenameShelfModalOpen] = useState(false);
  const [bookToMove, setBookToMove] = useState<ReadingBook | null>(null);

  const { showToast } = useToast();

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userUnits, userBooks, userWords] = await Promise.all([
        db.getUnitsByUserId(user.id),
        db.getReadingBooksByUserId(user.id),
        db.getAllWordsForExport(user.id)
      ]);
      setUnits(userUnits.sort((a,b) => b.createdAt - a.createdAt));
      setReadingBooks(userBooks.sort((a,b) => b.createdAt - a.createdAt));
      setAllWords(userWords);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(0); }, [selectedTag, focusFilter, colorFilter, pageSize]);

  // --- Logic for List View ---
  const filteredUnits = useMemo(() => {
      return units.filter(u => {
          if (focusFilter === 'focused' && !u.isFocused) return false;
          if (colorFilter !== 'all' && u.focusColor !== colorFilter) return false;
          
          if (selectedTag) {
              if (selectedTag === 'Uncategorized') {
                  const path = u.path;
                  const hasPath = path && path !== '/' && path !== '';
                  return !hasPath;
              }
              return u.path?.startsWith(selectedTag) || u.tags?.includes(selectedTag);
          }
          return true;
      });
  }, [units, selectedTag, focusFilter, colorFilter]);

  const pagedUnits = useMemo(() => {
      const start = page * pageSize;
      return filteredUnits.slice(start, start + pageSize);
  }, [filteredUnits, page, pageSize]);

  // --- Handlers for Shelf Management ---
  const handleRenameShelf = (newName: string) => {
      const success = renameShelf(newName, async (oldS, newS) => {
          setLoading(true);
          const booksToUpdate = readingBooks.filter(b => {
               const parts = b.title.split(':');
               const shelf = parts.length > 1 ? parts[0].trim() : 'General';
               return shelf === oldS;
          });

          await Promise.all(booksToUpdate.map(b => {
               const parts = b.title.split(':');
               const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : b.title;
               const newFullTitle = `${newS}: ${bookTitle}`;
               return db.saveReadingBook({ ...b, title: newFullTitle, updatedAt: Date.now() });
          }));
          await loadData();
      });
      if (success) setIsRenameShelfModalOpen(false);
  };
  
  // --- Handlers for Book Management ---

  const handleCreateEmptyBook = async () => {
    const newBook: ReadingBook = {
        id: `rb-${Date.now()}`,
        userId: user.id,
        title: `${currentShelfName}: New Book`,
        unitIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: '#5d4037',
        icon: '📚'
    };
    await db.saveReadingBook(newBook);
    await loadData();
    setActiveBook(newBook);
    setViewMode('BOOK_DETAIL');
    showToast("New book created.", "success");
  };

  const handleUpdateBook = (updated: Partial<ReadingBook>) => {
      if (!activeBook) return;
      const newBook = { ...activeBook, ...updated, updatedAt: Date.now() };
      // Update local state immediately for responsiveness
      setReadingBooks(prev => prev.map(b => b.id === newBook.id ? newBook : b));
      setActiveBook(newBook);
      db.saveReadingBook(newBook);
  };

  const handleDeleteBook = async () => {
      if (!bookToDelete) return;
      await db.deleteReadingBook(bookToDelete.id);
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
      await db.saveReadingBook(updatedBook);
      setBookToMove(null);
      await loadData();
      showToast(`Moved to "${targetShelf}".`, 'success');
  };

  // --- Handlers for Unit Management (List View) ---

  const handleCreateEmptyUnit = async () => {
    const newUnit: Unit = { 
        id: generateId(), 
        userId: user.id, 
        name: "New Unit", 
        description: "", 
        wordIds: [], 
        createdAt: Date.now(), 
        updatedAt: Date.now(), 
        essay: "",
        path: '/'
    };
    await db.saveUnit(newUnit);
    await loadData();
    setActiveUnit(newUnit);
    setViewMode('EDIT');
  };

  const handleDeleteUnit = async () => {
      if (!unitToDelete) return;
      await db.deleteUnit(unitToDelete.id);
      // Clean up references in books
      const booksToClean = readingBooks.filter(b => b.unitIds.includes(unitToDelete.id));
      if (booksToClean.length > 0) {
          await Promise.all(booksToClean.map(b => 
              db.saveReadingBook({ ...b, unitIds: b.unitIds.filter(id => id !== unitToDelete.id) })
          ));
      }

      showToast('Unit deleted.', 'success');
      setUnitToDelete(null);
      loadData();
  };

  const handleFocusChange = async (unit: Unit, color: FocusColor | null) => {
      const newData = { ...unit, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete newData.focusColor;
      setUnits(prev => prev.map(u => u.id === unit.id ? newData : u));
      await db.saveUnit(newData);
  };
  
  const handleToggleFocus = async (unit: Unit) => {
      const newData = { ...unit, isFocused: !unit.isFocused, updatedAt: Date.now() };
      setUnits(prev => prev.map(u => u.id === unit.id ? newData : u));
      await db.saveUnit(newData);
  };
  
  // --- Data Transformation for GenericBookDetail ---
  const genericBookItems: GenericBookItem[] = useMemo(() => {
      if (!activeBook) return [];
      return activeBook.unitIds.map((id): GenericBookItem | null => {
          const u = units.find(unit => unit.id === id);
          if (!u) return null;
          return {
              id: u.id,
              title: u.name,
              subtitle: u.description,
              data: u,
              isCompleted: u.isLearned,
              focusColor: u.focusColor,
              isFocused: u.isFocused
          };
      }).filter((item): item is GenericBookItem => item !== null);
  }, [activeBook, units]);

  const availableGenericItems: GenericBookItem[] = useMemo(() => {
      return units.map((u): GenericBookItem => ({
          id: u.id,
          title: u.name,
          subtitle: `${u.wordIds.length} words`,
          data: u
      }));
  }, [units]);
  
  const handleAddUnitsToBook = (ids: string[]) => {
      if (!activeBook) return;
      const newIds = Array.from(new Set([...activeBook.unitIds, ...ids]));
      handleUpdateBook({ unitIds: newIds });
  };
  
  const handleRemoveUnitFromBook = (id: string) => {
      if (!activeBook) return;
      const newIds = activeBook.unitIds.filter(uid => uid !== id);
      handleUpdateBook({ unitIds: newIds });
  };

  // --- Render Views ---

  if (viewMode === 'READ' && activeUnit) {
      return <ReadingStudyView user={user} unit={activeUnit} allWords={allWords} onBack={() => { 
          setViewMode(activeBook ? 'BOOK_DETAIL' : 'LIST'); 
          if (!activeBook) setActiveUnit(null); 
          loadData(); 
      }} onDataChange={loadData} onStartSession={onStartSession} onSwitchToEdit={() => setViewMode('EDIT')} onUpdateUser={onUpdateUser} />;
  }

  if (viewMode === 'EDIT' && activeUnit) {
      const allTags = [...new Set(units.flatMap(u => u.tags || []))].sort();
      return <ReadingEditView user={user} unit={activeUnit} allWords={allWords} allLibraryTags={allTags} onCancel={() => { 
          if (activeUnit.name === "New Unit" && !activeUnit.essay && activeUnit.wordIds.length === 0) { db.deleteUnit(activeUnit.id); } 
          setViewMode(activeBook ? 'BOOK_DETAIL' : 'LIST'); 
          if (!activeBook) setActiveUnit(null); 
          loadData(); 
      }} onSave={() => { loadData(); setViewMode('READ'); }} />;
  }
  
  // --- Book Detail View (Using Generic) ---
  if (viewMode === 'BOOK_DETAIL' && activeBook) {
      return <GenericBookDetail 
          book={activeBook}
          items={genericBookItems}
          availableItems={availableGenericItems}
          onBack={() => { setActiveBook(null); setViewMode('SHELF'); loadData(); }} 
          onUpdateBook={handleUpdateBook}
          onAddItem={handleAddUnitsToBook}
          onRemoveItem={handleRemoveUnitFromBook}
          onOpenItem={(item) => { setActiveUnit(item.data); setViewMode('READ'); }} 
          onEditItem={(item) => { setActiveUnit(item.data); setViewMode('EDIT'); }}
          onFocusChange={(item, color) => handleFocusChange(item.data, color)}
          onToggleFocus={(item) => handleToggleFocus(item.data)}
          itemIcon={<BookOpen size={16}/>}
      />;
  }

  // --- Shelf View ---
  if (viewMode === 'SHELF') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
           <div className="flex flex-col gap-4">
               <button onClick={() => setViewMode('LIST')} className="w-fit flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors group">
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Main Library</span>
               </button>
               
               <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <div>
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Reading Shelf</h2>
                        <p className="text-neutral-500 mt-1 font-medium">Browse your books.</p>
                   </div>
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
                 const bookParts = book.title.split(':');
                 const displayTitle = bookParts.length > 1 ? bookParts.slice(1).join(':').trim() : book.title;

                 return (
                    <UniversalBook
                        key={book.id}
                        id={book.id}
                        title={displayTitle}
                        subTitle={`${book.unitIds.length} Units`}
                        icon={<Book size={24}/>}
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
            message={<>Are you sure you want to delete <strong>"{bookToDelete?.title.split(':').pop()?.trim()}"</strong>? Units inside will not be deleted.</>}
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
          <RenameShelfModal isOpen={isRenameShelfModalOpen} onClose={() => setIsRenameShelfModalOpen(false)} onSave={handleRenameShelf} initialName={currentShelfName} />
        </div>
      );
  }

  // --- List View (Default) ---
  return (
    <>
      <ResourcePage
        title="Reading Library"
        subtitle="Curated collections for intensive reading & vocab."
        icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png" className="w-8 h-8 object-contain" alt="Reading" />}
        config={{}}
        isLoading={loading}
        isEmpty={filteredUnits.length === 0}
        emptyMessage="No reading units found."
        activeFilters={{}}
        onFilterChange={() => {}}
        pagination={{ page, totalPages: Math.ceil(filteredUnits.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredUnits.length }}
        aboveGrid={
            <>
                {isGroupBrowserOpen && <TagBrowser items={units} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="groups" title="Browse Groups" icon={<FolderTree size={16}/>} />}
                {isTagBrowserOpen && <TagBrowser items={units} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
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
                                        <button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} />
                                    </div>
                                </div>
                            </>
                        }
                        viewOptions={[
                            { label: 'Show Description', checked: viewSettings.showDesc, onChange: () => setViewSettings(v => ({...v, showDesc: !v.showDesc})) },
                            { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }
                        ]}
                    />
                }
                browseGroups={{ isOpen: isGroupBrowserOpen, onToggle: () => { setIsGroupBrowserOpen(!isGroupBrowserOpen); setIsTagBrowserOpen(false); } }}
                browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); setIsGroupBrowserOpen(false); } }}
                addActions={[
                    { label: 'AI Unit', icon: Sparkles, onClick: () => setShowRefineAiModal(true) },
                    { label: 'New Unit', icon: Plus, onClick: handleCreateEmptyUnit }
                ]}
                extraActions={
                    <button onClick={() => setViewMode('SHELF')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200" title="Bookshelf Mode">
                        <Library size={16} />
                        <span>Bookshelf</span>
                    </button>
                }
            />
        }
      >
        {() => (
            <>
                {pagedUnits.map(unit => (
                    <UniversalCard
                        key={unit.id}
                        title={unit.name}
                        tags={unit.tags}
                        compact={viewSettings.compact}
                        onClick={() => { setActiveUnit(unit); setViewMode('READ'); }}
                        focusColor={unit.focusColor}
                        onFocusChange={(c) => handleFocusChange(unit, c)}
                        isFocused={unit.isFocused}
                        onToggleFocus={() => handleToggleFocus(unit)}
                        isCompleted={unit.isLearned}
                        actions={
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setActiveUnit(unit); setViewMode('READ'); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setActiveUnit(unit); setViewMode('EDIT'); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setUnitToDelete(unit); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                            </>
                        }
                    >
                        {viewSettings.showDesc && unit.description && <p className="line-clamp-2">{unit.description}</p>}
                    </UniversalCard>
                ))}
            </>
        )}
      </ResourcePage>

      <ConfirmationModal
        isOpen={!!unitToDelete}
        title="Delete Unit?"
        message={<>Are you sure you want to delete <strong>"{unitToDelete?.name}"</strong>?</>}
        confirmText="Delete"
        isProcessing={false}
        onConfirm={handleDeleteUnit}
        onClose={() => setUnitToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
      />
      
      {showRefineAiModal && (
        <UniversalAiModal 
            isOpen={showRefineAiModal} 
            onClose={() => setShowRefineAiModal(false)} 
            type="GENERATE_UNIT" 
            title="AI Reading Unit" 
            description="Generate a new reading unit from a topic." 
            initialData={{ request: '' }} 
            onGeneratePrompt={(inputs) => getRefineUnitPrompt("New Unit", "", "", "", inputs.request, user)} 
            onJsonReceived={async (data) => {
                const newUnit: Unit = { 
                    id: generateId(), 
                    userId: user.id, 
                    name: data.name, 
                    description: data.description, 
                    wordIds: [],
                    customVocabString: (data.words || []).join('; '),
                    essay: data.essay,
                    comprehensionQuestions: data.comprehensionQuestions || [],
                    createdAt: Date.now(), 
                    updatedAt: Date.now(),
                    path: currentShelfName === 'General' ? '/' : `/${currentShelfName}`
                };
                await db.saveUnit(newUnit);
                await loadData();
                setActiveUnit(newUnit);
                setViewMode('EDIT');
            }} 
            actionLabel="Generate" 
            closeOnSuccess={true} 
        />
      )}
    </>
  );
};
