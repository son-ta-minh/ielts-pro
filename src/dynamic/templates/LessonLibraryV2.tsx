
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Lesson, VocabularyItem, SessionType, ComparisonGroup, AppView, FocusColor, LessonBook } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Edit3, Trash2, BookOpen, Plus, Tag, Shuffle, FileClock, Target, Library, FolderPlus, Pen, Move, Book, Sparkles, FolderTree, ArrowLeft, LayoutGrid } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { TagBrowser } from '../../components/common/TagBrowser';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { getConfig } from '../../app/settingsManager';
import { UniversalCard } from '../../components/common/UniversalCard';
import LessonEditView from './LessonEditView';
import LessonPracticeView from './LessonPracticeView';
import { ComparisonReadView } from './ComparisonReadView';
import { ComparisonEditView } from './ComparisonEditView';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt } from '../../services/promptService';
import { ResourceActions, AddAction } from '../page/ResourceActions';
import { ViewMenu } from '../../components/common/ViewMenu';
import { ResourceConfig } from '../types';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { UniversalBook } from '../../components/common/UniversalBook';
import { AddShelfModal, RenameShelfModal, MoveBookModal } from '../../components/wordbook/ShelfModals';
import { GenericBookDetail, GenericBookItem } from '../../components/common/GenericBookDetail';
import { useShelfLogic } from '../../app/hooks/useShelfLogic';
import { ShelfSearchBar } from '../../components/common/ShelfSearchBar';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[], type: SessionType) => void;
  onNavigate: (view: AppView) => void;
  onUpdateUser: (user: User) => Promise<void>;
  onExit?: () => void;
}

type ResourceItem = 
  | { type: 'ESSAY'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'COMPARISON'; data: ComparisonGroup; path?: string; tags?: string[]; date: number };

const lessonConfig: ResourceConfig = { filterSchema: [], viewSchema: [] };
const VIEW_SETTINGS_KEY = 'vocab_pro_lesson_view_settings';

export const LessonLibraryV2: React.FC<Props> = ({ user, onStartSession, onNavigate, onUpdateUser }) => {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [lessonBooks, setLessonBooks] = useState<LessonBook[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter & View
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ESSAY' | 'COMPARISON'>('ALL');
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showDesc: true, compact: false }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  
  const [viewMode, setViewMode] = useState<'list' | 'shelf' | 'edit_lesson' | 'read_lesson' | 'read_comparison' | 'edit_comparison' | 'book_detail'>('list');
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeComparison, setActiveComparison] = useState<ComparisonGroup | null>(null);
  const [activeBook, setActiveBook] = useState<LessonBook | null>(null);

  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [comparisonToDelete, setComparisonToDelete] = useState<ComparisonGroup | null>(null);
  const [bookToDelete, setBookToDelete] = useState<LessonBook | null>(null);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  // --- Shelf State ---
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
  } = useShelfLogic(lessonBooks, 'lesson_books_shelves');

  const [isAddShelfModalOpen, setIsAddShelfModalOpen] = useState(false);
  const [isRenameShelfModalOpen, setIsRenameShelfModalOpen] = useState(false);
  const [bookToMove, setBookToMove] = useState<LessonBook | null>(null);

  const { showToast } = useToast();

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userLessons, userGroups, userBooks] = await Promise.all([ 
          db.getLessonsByUserId(user.id), 
          db.getComparisonGroupsByUserId(user.id),
          db.getLessonBooksByUserId(user.id)
      ]);
      const combined: ResourceItem[] = [
          ...userLessons.map(l => ({ type: 'ESSAY' as const, data: l, path: l.path, tags: l.tags, date: l.createdAt })),
          ...userGroups.map(g => ({ type: 'COMPARISON' as const, data: g, path: g.path, tags: g.tags, date: g.createdAt }))
      ];
      setResources(combined.sort((a, b) => b.date - a.date));
      setLessonBooks(userBooks.sort((a, b) => b.createdAt - a.createdAt));
    } finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  
  useEffect(() => { setPage(0); }, [selectedTag, typeFilter, focusFilter, colorFilter, pageSize]);

  // --- Logic for List View (Item Browser) ---
  const filteredResources = useMemo(() => {
    return resources.filter(res => {
      if (typeFilter !== 'ALL' && res.type !== typeFilter) return false;
      if (focusFilter === 'focused' && !res.data.isFocused) return false;
      if (colorFilter !== 'all' && res.data.focusColor !== colorFilter) return false;
      
      if (selectedTag) {
        if (selectedTag === 'Uncategorized') {
            const path = res.path ?? (res.tags || []).find(t => t.startsWith('/'));
            const hasPath = path && path !== '/';
            if (hasPath) return false;
        } else {
             if (!res.path?.startsWith(selectedTag) && !res.tags?.includes(selectedTag)) return false;
        }
      }
      return true;
    });
  }, [resources, selectedTag, typeFilter, focusFilter, colorFilter]);
  
  const pagedResources = useMemo(() => {
      const start = page * pageSize;
      return filteredResources.slice(start, start + pageSize);
  }, [filteredResources, page, pageSize]);

  // --- Handlers for Shelf Management ---
  const handleRenameShelfAction = (newName: string) => {
      const success = renameShelf(newName, async (oldS, newS) => {
          setLoading(true);
          const booksToUpdate = lessonBooks.filter(b => {
               const parts = b.title.split(':');
               const shelf = parts.length > 1 ? parts[0].trim() : 'General';
               return shelf === oldS;
          });

          await Promise.all(booksToUpdate.map(b => {
               const parts = b.title.split(':');
               const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
               const newFullTitle = `${newS}: ${bookTitle}`;
               return dataStore.saveLessonBook({ ...b, title: newFullTitle, updatedAt: Date.now() });
          }));
          await loadData();
      });
      if (success) setIsRenameShelfModalOpen(false);
  };

  // --- Handlers for Book Management ---
  const handleCreateEmptyBook = async () => {
    const newBook: LessonBook = {
        id: `lb-${Date.now()}`,
        userId: user.id,
        title: `${currentShelfName}: New Book`,
        itemIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        color: '#1a237e',
        icon: '📘'
    };
    await dataStore.saveLessonBook(newBook);
    await loadData();
    setActiveBook(newBook);
    setViewMode('book_detail');
    showToast("New book created.", "success");
  };

  const handleUpdateBook = async (updated: Partial<LessonBook>) => {
      if (!activeBook) return;
      const newBook = { ...activeBook, ...updated, updatedAt: Date.now() };
      setLessonBooks(prev => prev.map(b => b.id === newBook.id ? newBook : b));
      setActiveBook(newBook);
      await dataStore.saveLessonBook(newBook);
  };

  const handleDeleteBook = async () => {
      if (!bookToDelete) return;
      await dataStore.deleteLessonBook(bookToDelete.id);
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
      await dataStore.saveLessonBook(updatedBook);
      setBookToMove(null);
      await loadData();
      showToast(`Moved to "${targetShelf}".`, 'success');
  };

  // --- Handlers for Item Management ---
  const handleDeleteLesson = async () => { if (!lessonToDelete) return; await dataStore.deleteLesson(lessonToDelete.id); showToast('Lesson deleted.', 'success'); setLessonToDelete(null); loadData(); };
  const handleDeleteComparison = async () => { if (!comparisonToDelete) return; await dataStore.deleteComparisonGroup(comparisonToDelete.id); showToast('Comparison deleted.', 'success'); setComparisonToDelete(null); loadData(); };
  
  const handleSaveLesson = async (lesson: Lesson) => { 
      await dataStore.saveLesson(lesson); 
      showToast('Lesson saved!', 'success'); 
      setViewMode(activeBook ? 'book_detail' : 'list'); 
      setActiveLesson(null); 
      loadData(); 
  };
  
  const handleSaveComparison = async (group: ComparisonGroup) => { 
      await dataStore.saveComparisonGroup(group); 
      showToast('Comparison saved!', 'success'); 
      setViewMode('read_comparison'); 
      setActiveComparison(group); 
      loadData(); 
  };
  
  const handleNewLesson = () => {
    const newLesson: Lesson = { id: `lesson-${Date.now()}`, userId: user.id, topic1: '', topic2: '', title: `New Lesson`, description: '', content: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() };
    setActiveLesson(newLesson);
    setViewMode('edit_lesson');
  };

  const handleNewComparison = () => {
    const newGroup: ComparisonGroup = { id: `cmp-${Date.now()}`, userId: user.id, name: `New Comparison`, words: [], tags: [], comparisonData: [], createdAt: Date.now(), updatedAt: Date.now() };
    setActiveComparison(newGroup);
    setViewMode('edit_comparison');
  };

  const handleGenerateLesson = async (data: any) => {
    const { result, preferences } = data;
    if (JSON.stringify(user.lessonPreferences) !== JSON.stringify(preferences)) { await onUpdateUser({ ...user, lessonPreferences: preferences }); }
    
    const newLesson: Lesson = {
        id: `lesson-ai-${Date.now()}`, userId: user.id, title: result.title, description: result.description, content: result.content,
        tags: result.tags || [],
        createdAt: Date.now(), updatedAt: Date.now(), topic1: '', topic2: ''
    };
    await dataStore.saveLesson(newLesson);
    showToast("Lesson created with AI!", "success");
    setIsAiModalOpen(false);
    setActiveLesson(newLesson);
    setViewMode('read_lesson');
    loadData();
  };
  
  const handleFocusChange = async (item: ResourceItem, color: FocusColor | null) => {
      const newDataBase = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete newDataBase.focusColor;
      
      if (item.type === 'ESSAY') {
        await dataStore.saveLesson(newDataBase as Lesson);
      } else { 
        await dataStore.saveComparisonGroup(newDataBase as ComparisonGroup);
      }
      
      setResources(prev => prev.map(r => {
        if (r.data.id === item.data.id) {
           if (r.type === 'ESSAY') {
             return { ...r, data: { ...(r.data as Lesson), focusColor: color || undefined, updatedAt: Date.now() } };
           } else {
             return { ...r, data: { ...(r.data as ComparisonGroup), focusColor: color || undefined, updatedAt: Date.now() } };
           }
        }
        return r;
      }));
  };
  
  const handleToggleFocus = async (item: ResourceItem) => {
      const newDataBase = { ...item.data, isFocused: !item.data.isFocused, updatedAt: Date.now() };
      
      if (item.type === 'ESSAY') {
          await dataStore.saveLesson(newDataBase as Lesson);
      } else {
          await dataStore.saveComparisonGroup(newDataBase as ComparisonGroup);
      }
      
      setResources(prev => prev.map(r => {
        if (r.data.id === item.data.id) {
           if (r.type === 'ESSAY') {
             return { ...r, data: { ...(r.data as Lesson), isFocused: !r.data.isFocused, updatedAt: Date.now() } };
           } else {
             return { ...r, data: { ...(r.data as ComparisonGroup), isFocused: !r.data.isFocused, updatedAt: Date.now() } };
           }
        }
        return r;
      }));
  };

  const handleRandomize = () => {
      if (filteredResources.length === 0) {
          showToast("No items to randomize.", "info");
          return;
      }
      const randomItem = filteredResources[Math.floor(Math.random() * filteredResources.length)];
      if (randomItem.type === 'ESSAY') {
          setActiveLesson(randomItem.data as Lesson);
          setViewMode('read_lesson');
      } else {
          setActiveComparison(randomItem.data as ComparisonGroup);
          setViewMode('read_comparison');
      }
  };

  const addActions: AddAction[] = [
      { label: 'AI Lesson', icon: Sparkles, onClick: () => setIsAiModalOpen(true) },
      { label: 'New Comparison', icon: FolderPlus, onClick: handleNewComparison },
      { label: 'New Lesson', icon: Plus, onClick: handleNewLesson },
  ];

  const handleGeneratePromptWithCoach = (inputs: any) => {
      const config = (window as any).CONFIG || getConfig();
      const activeType = config.audioCoach.activeCoach;
      const coachName = config.audioCoach.coaches[activeType].name;
      return getLessonPrompt({
          topic: inputs.topic,
          language: inputs.language,
          targetAudience: inputs.targetAudience,
          tone: inputs.tone,
          coachName
      });
  };

  // --- Data Transformation for GenericBookDetail ---
  const genericBookItems: GenericBookItem[] = useMemo(() => {
      if (!activeBook) return [];
      return activeBook.itemIds.map((id): GenericBookItem | null => {
          const res = resources.find(r => r.data.id === id);
          if (!res) return null;
          
          const isLesson = res.type === 'ESSAY';
          return {
              id: res.data.id,
              title: isLesson ? (res.data as Lesson).title : (res.data as ComparisonGroup).name,
              subtitle: isLesson ? 'Lesson' : 'Comparison',
              data: res, // Pass the whole ResourceItem
              focusColor: res.data.focusColor,
              isFocused: res.data.isFocused
          };
      }).filter((item): item is GenericBookItem => item !== null);
  }, [activeBook, resources]);

  const availableGenericItems: GenericBookItem[] = useMemo(() => {
      return resources.map((res): GenericBookItem => {
          const isLesson = res.type === 'ESSAY';
          return {
              id: res.data.id,
              title: isLesson ? (res.data as Lesson).title : (res.data as ComparisonGroup).name,
              subtitle: isLesson ? 'Lesson' : 'Comparison',
              data: res // Pass the whole ResourceItem
          };
      });
  }, [resources]);

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
  
  const handleFocusChangeGeneric = (item: GenericBookItem, color: any) => {
       const res = item.data as ResourceItem;
       handleFocusChange(res, color);
  };

  const handleToggleFocusGeneric = (item: GenericBookItem) => {
       const res = item.data as ResourceItem;
       handleToggleFocus(res);
  };

  const handleNavigateShelf = (name: string) => {
      selectShelf(name);
      setViewMode('shelf');
  };

  const handleNavigateBook = (book: LessonBook) => {
      setActiveBook(book);
      setViewMode('book_detail');
  };

  // --- Views ---

  if (viewMode === 'read_lesson' && activeLesson) {
      return <LessonPracticeView lesson={activeLesson} onComplete={() => setViewMode(activeBook ? 'book_detail' : 'list')} onEdit={() => setViewMode('edit_lesson')} />;
  }
  if (viewMode === 'edit_lesson' && activeLesson) {
      return <LessonEditView lesson={activeLesson} user={user} onSave={handleSaveLesson} onPractice={(l) => { setActiveLesson(l); setViewMode('read_lesson'); }} onCancel={() => setViewMode(activeBook ? 'book_detail' : 'list')} />;
  }
  if (viewMode === 'read_comparison' && activeComparison) {
      return <ComparisonReadView group={activeComparison} onBack={() => setViewMode(activeBook ? 'book_detail' : 'list')} onEdit={() => setViewMode('edit_comparison')} />;
  }
  if (viewMode === 'edit_comparison' && activeComparison) {
      return <ComparisonEditView group={activeComparison} onSave={handleSaveComparison} onCancel={() => setViewMode(activeComparison.words.length > 0 ? 'read_comparison' : (activeBook ? 'book_detail' : 'list'))} user={user} />;
  }
  
  // --- Book Detail View (Using Generic) ---
  if (viewMode === 'book_detail' && activeBook) {
      return <GenericBookDetail
          book={activeBook}
          items={genericBookItems}
          availableItems={availableGenericItems}
          onBack={() => { setActiveBook(null); setViewMode('shelf'); loadData(); }}
          onUpdateBook={handleUpdateBook}
          onAddItem={handleAddItemsToBook}
          onRemoveItem={handleRemoveItemFromBook}
          onOpenItem={(item) => { 
               const res = item.data as ResourceItem;
               if (res.type === 'ESSAY') { setActiveLesson(res.data as Lesson); setViewMode('read_lesson'); }
               else { setActiveComparison(res.data as ComparisonGroup); setViewMode('read_comparison'); }
          }}
          onEditItem={(item) => {
               const res = item.data as ResourceItem;
               if (res.type === 'ESSAY') { setActiveLesson(res.data as Lesson); setViewMode('edit_lesson'); }
               else { setActiveComparison(res.data as ComparisonGroup); setViewMode('edit_comparison'); }
          }}
          onFocusChange={handleFocusChangeGeneric}
          onToggleFocus={handleToggleFocusGeneric}
          itemIcon={<BookOpen size={16}/>}
      />;
  }

  // --- Shelf View ---
  if (viewMode === 'shelf') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
           {/* New Header Design */}
           <div className="flex flex-col gap-4">
               <button onClick={() => setViewMode('list')} className="w-fit flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors group">
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Main Library</span>
               </button>
               
               <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <div className="flex-shrink-0">
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Lesson Shelf</h2>
                        <p className="text-neutral-500 mt-1 font-medium">Organize your knowledge.</p>
                   </div>
                   
                   <ShelfSearchBar 
                        shelves={allShelves} 
                        books={lessonBooks} 
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
                        icon={<Book size={24}/>}
                        color={book.color}
                        // Styling props
                        titleColor={book.titleColor}
                        titleSize={book.titleSize}
                        titleTop={book.titleTop}
                        titleLeft={book.titleLeft}
                        iconTop={book.iconTop}
                        iconLeft={book.iconLeft}

                        onClick={() => { setActiveBook(book); setViewMode('book_detail'); }}
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

  // --- List View (Default - Items) ---
  return (
    <>
    <ResourcePage
      title="Knowledge Library"
      subtitle="Your collection of lessons and comparisons."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Notebook.png" className="w-8 h-8 object-contain" alt="Lessons" />}
      centerContent={
        <ShelfSearchBar 
            shelves={allShelves} 
            books={lessonBooks} 
            onNavigateShelf={handleNavigateShelf} 
            onNavigateBook={handleNavigateBook} 
        />
      }
      minorSkills={ <button onClick={() => onNavigate('IRREGULAR_VERBS')} className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors"><FileClock size={16} /><span className="hidden sm:inline">Irregular Verbs</span></button> }
      pagination={{ page, totalPages: Math.ceil(filteredResources.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredResources.length }}
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen}
                    setIsOpen={setIsViewMenuOpen}
                    filterOptions={[
                        { label: 'All', value: 'ALL', isActive: typeFilter === 'ALL', onClick: () => setTypeFilter('ALL') },
                        { label: 'Lesson', value: 'ESSAY', isActive: typeFilter === 'ESSAY', onClick: () => setTypeFilter('ESSAY') },
                        { label: 'Comp.', value: 'COMPARISON', isActive: typeFilter === 'COMPARISON', onClick: () => setTypeFilter('COMPARISON') },
                    ]}
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
                        { label: 'Show Description', checked: viewSettings.showDesc, onChange: () => setViewSettings(v => ({...v, showDesc: !v.showDesc})) },
                        { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                    ]}
                />
            }
            // Removed browseGroups as per request
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }}
            addActions={addActions}
            extraActions={
                <>
                    <button onClick={handleRandomize} disabled={resources.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button>
                    <button onClick={() => setViewMode('shelf')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200" title="Bookshelf Mode">
                        <Library size={16} />
                        <span>Bookshelf</span>
                    </button>
                </>
            }
        />
      }
      aboveGrid={
        <>
            {/* TagBrowser for Groups removed */}
            {isTagBrowserOpen && <TagBrowser items={resources} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        </>
      }
      config={lessonConfig}
      activeFilters={{}}
      onFilterChange={() => {}}
      isLoading={loading}
      isEmpty={filteredResources.length === 0}
      emptyMessage="No items found matching your criteria."
    >
      {() => (
        <>
          {pagedResources.map((item) => {
            const isLesson = item.type === 'ESSAY';
            const titleContent = isLesson ? (item.data as Lesson).title : (item.data as ComparisonGroup).name;
            const onRead = isLesson ? () => { setActiveLesson(item.data as Lesson); setViewMode('read_lesson'); } : () => { setActiveComparison(item.data as ComparisonGroup); setViewMode('read_comparison'); };
            const onEdit = isLesson ? () => { setActiveLesson(item.data as Lesson); setViewMode('edit_lesson'); } : () => { setActiveComparison(item.data as ComparisonGroup); setViewMode('edit_comparison'); };
            const onDelete = isLesson ? () => setLessonToDelete(item.data as Lesson) : () => setComparisonToDelete(item.data as ComparisonGroup);

            return (
                <UniversalCard
                    key={`${item.type}-${item.data.id}`}
                    title={titleContent} 
                    // removed path prop to avoid rendering path
                    tags={item.data.tags} 
                    compact={viewSettings.compact}
                    onClick={onRead}
                    focusColor={item.data.focusColor}
                    onFocusChange={(c) => handleFocusChange(item, c)}
                    isFocused={item.data.isFocused}
                    onToggleFocus={() => handleToggleFocus(item)}
                    isCompleted={item.data.focusColor === 'green'}
                    actions={
                        <>
                            <button onClick={(e) => { e.stopPropagation(); onRead(); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                        </>
                    }
                >
                    {viewSettings.showDesc && (isLesson ? ((item.data as Lesson).description && <p className="line-clamp-2">{(item.data as Lesson).description}</p>) : (<div className="flex flex-wrap gap-1.5">{(item.data as ComparisonGroup).words.slice(0, 4).map(w => <span key={w} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-bold">{w}</span>)}{(item.data as ComparisonGroup).words.length > 4 && <span className="text-[10px] text-neutral-400 font-bold">+{ (item.data as ComparisonGroup).words.length - 4}</span>}</div>))}
                </UniversalCard>
            );
          })}
        </>
      )}
    </ResourcePage>
    <ConfirmationModal isOpen={!!lessonToDelete} title="Delete Lesson?" message="Confirm delete?" confirmText="Yes, Delete" isProcessing={false} onConfirm={handleDeleteLesson} onClose={() => setLessonToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    <ConfirmationModal isOpen={!!comparisonToDelete} title="Delete Comparison?" message="Confirm delete?" confirmText="Yes, Delete" isProcessing={false} onConfirm={handleDeleteComparison} onClose={() => setComparisonToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    <UniversalAiModal 
        isOpen={isAiModalOpen} 
        onClose={() => setIsAiModalOpen(false)} 
        type="GENERATE_LESSON" 
        title="AI Lesson Creator" 
        description="Design a custom lesson instantly." 
        initialData={user.lessonPreferences} 
        onGeneratePrompt={handleGeneratePromptWithCoach} 
        onJsonReceived={handleGenerateLesson} 
        actionLabel="Create Lesson" 
        closeOnSuccess={true} 
    />
    </>
  );
};

export default LessonLibraryV2;
