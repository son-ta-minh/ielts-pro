import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, WordBook, WordBookItem, VocabularyItem, FocusColor, WordQuality, Unit, ReviewGrade } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { BookMarked, Plus, Loader2, ArrowLeft, Trash2, ChevronLeft, ChevronRight, Pen, FolderPlus, Volume2, Eye, EyeOff, Sparkles, BookOpen, FilePlus, Library, Palette, Image as ImageIcon, Link as LinkIcon, Type, Move, Layers3, Edit3, Save, X, Search, Archive, Filter, CheckCircle2, Circle, Activity, ShieldCheck, Ghost, AlertCircle } from 'lucide-react';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getGenerateWordBookPrompt, getAutoAddWordsToBookPrompt } from '../../services/promptService';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { speak } from '../../utils/audio';
import { createNewWord } from '../../utils/srs';
import ViewWordModal from '../../components/word_lib/ViewWordModal';
import EditWordModal from '../../components/word_lib/EditWordModal';
import { UniversalCard, CardBadge } from '../../components/common/UniversalCard';
import { WordBookCard, COLORS, TITLE_COLORS, BookIcon } from '../../components/wordbook/WordBookCard';
import { AddShelfModal, RenameShelfModal, MoveBookModal } from '../../components/wordbook/ShelfModals';
import { AddWordToBookModal, AddFromUnitModal, AddFromLibraryModal, MoveWordToBookModal } from '../../components/wordbook/ContentModals';
import { UniversalBook } from '../../components/common/UniversalBook';
import { UniversalShelf } from '../../components/common/UniversalShelf';

interface Props {
  user: User;
}

export const WordBookPage: React.FC<Props> = ({ user }) => {
    const [books, setBooks] = useState<WordBook[]>([]);
    const [allLibraryWords, setAllLibraryWords] = useState<VocabularyItem[]>([]);
    const [allUnits, setAllUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeBook, setActiveBook] = useState<WordBook | null>(null);
    
    // State to track which words have their meaning revealed
    const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
    
    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const [filterColor, setFilterColor] = useState<FocusColor | 'none' | 'all'>('all');
    const [filterStatus, setFilterStatus] = useState<ReviewGrade | 'NEW' | 'all'>('all');
    const [filterQuality, setFilterQuality] = useState<WordQuality | 'all'>('all');

    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [bookToDelete, setBookToDelete] = useState<WordBook | null>(null);
    const [bookToMove, setBookToMove] = useState<WordBook | null>(null);
    const [isAddWordModalOpen, setIsAddWordModalOpen] = useState(false);
    const [isAddFromLibraryModalOpen, setIsAddFromLibraryModalOpen] = useState(false);
    const [isAddFromUnitModalOpen, setIsAddFromUnitModalOpen] = useState(false);
    const [isAutoAddModalOpen, setIsAutoAddModalOpen] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editableTitle, setEditableTitle] = useState('');
    const [isEditingIcon, setIsEditingIcon] = useState(false);
    const [editableIcon, setEditableIcon] = useState('');

    const [customShelves, setCustomShelves] = useState<string[]>(() => getStoredJSON('wordbook_custom_shelves', []));
    const [currentShelfIndex, setCurrentShelfIndex] = useState(0);
    const [isAddShelfModalOpen, setIsAddShelfModalOpen] = useState(false);
    const [isRenameShelfModalOpen, setIsRenameShelfModalOpen] = useState(false);
    const [shelfToSelect, setShelfToSelect] = useState<string | null>(null);

    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const [customColorUrl, setCustomColorUrl] = useState('');

    const [libraryWordsMap, setLibraryWordsMap] = useState<Map<string, VocabularyItem>>(new Map());
    const [viewingWord, setViewingWord] = useState<VocabularyItem | null>(null);
    const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
    const [wordFocusColors, setWordFocusColors] = useState<Record<string, FocusColor | null>>({});
    const [addingWord, setAddingWord] = useState<string | null>(null);
    const [wordMovingTarget, setWordMovingTarget] = useState<WordBookItem | null>(null);

    const { showToast } = useToast();

    // Side effect to handle menu closing
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) setIsColorPickerOpen(false);
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) setShowSearchSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Logic to derive status badge info
    const getStatusInfo = (word: VocabularyItem | null): { text: string; classes: string } | null => {
        if (!word) return null;
        if (!word.lastReview) return { text: 'New', classes: 'bg-blue-50 text-blue-700 border-blue-100' };
        switch (word.lastGrade) {
          case 'FORGOT': return { text: 'Forgot', classes: 'bg-rose-50 text-rose-700 border-rose-100' };
          case 'HARD': return { text: 'Hard', classes: 'bg-orange-50 text-orange-700 border-orange-100' };
          case 'EASY': return { text: 'Easy', classes: 'bg-green-50 text-green-700 border-green-100' };
          case 'LEARNED': return { text: 'Learned', classes: 'bg-cyan-50 text-cyan-700 border-cyan-100' };
          default: return { text: 'Studied', classes: 'bg-neutral-50 text-neutral-500 border-neutral-100' };
        }
    };

    // Load initial data
    const loadBooks = useCallback(async () => {
        setLoading(true);
        const [userBooks, allWords, userUnits] = await Promise.all([
            db.getWordBooksByUserId(user.id),
            db.getAllWordsForExport(user.id),
            db.getUnitsByUserId(user.id)
        ]);
        setBooks(userBooks.sort((a,b) => b.createdAt - a.createdAt));
        setAllLibraryWords(allWords);
        setAllUnits(userUnits.sort((a,b) => a.name.localeCompare(b.name)));
        
        const map = new Map<string, VocabularyItem>();
        allWords.forEach(w => map.set(w.word.toLowerCase(), w));
        setLibraryWordsMap(map);
        
        setLoading(false);
    }, [user.id]);

    useEffect(() => { loadBooks(); }, [loadBooks]);

    // Compute all available shelves
    const allShelves = useMemo(() => {
        const shelvesFromBooks = new Set(books.map(b => b.topic.split(':')[0].trim()).filter(Boolean));
        const combined = new Set([...customShelves, ...Array.from(shelvesFromBooks)]);
        
        const sorted = Array.from(combined).sort((a, b) => {
            if (a === 'General') return -1;
            if (b === 'General') return 1;
            return a.localeCompare(b);
        });

        return sorted.length > 0 ? sorted : ['General'];
    }, [books, customShelves]);

    // Search Logic
    const searchSuggestions = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        
        const shelfMatches = allShelves
            .filter(s => s.toLowerCase().includes(q))
            .map(s => ({ type: 'shelf' as const, id: s, label: s }));
            
        const bookMatches = books
            .filter(b => {
                const parts = b.topic.split(':');
                const title = parts.length > 1 ? parts.slice(1).join(':').trim() : b.topic;
                return title.toLowerCase().includes(q);
            })
            .map(b => {
                const parts = b.topic.split(':');
                const title = parts.length > 1 ? parts.slice(1).join(':').trim() : b.topic;
                return { type: 'book' as const, id: b.id, label: title, shelf: parts[0].trim() || 'General', data: b };
            });
            
        return [...shelfMatches, ...bookMatches].slice(0, 10);
    }, [searchQuery, allShelves, books]);

    const handleNavigateTo = (suggestion: any) => {
        if (suggestion.type === 'shelf') {
            const index = allShelves.findIndex(s => s === suggestion.id);
            if (index !== -1) {
                setCurrentShelfIndex(index);
                setActiveBook(null);
            }
        } else if (suggestion.type === 'book') {
            const index = allShelves.findIndex(s => s === suggestion.shelf);
            if (index !== -1) {
                setCurrentShelfIndex(index);
                setActiveBook(suggestion.data);
            }
        }
        setSearchQuery('');
        setShowSearchSuggestions(false);
    };

    // Handle book activation and sub-states initialization
    useEffect(() => {
        if (activeBook) {
            const parts = activeBook.topic.split(':').map(p => p.trim());
            const displayTopic = parts.length > 1 ? parts.slice(1).join(':').trim() : activeBook.topic;
            setEditableTitle(displayTopic);
            setEditableIcon(activeBook.icon);
            setCustomColorUrl(activeBook.color?.startsWith('http') || activeBook.color?.startsWith('data:image') ? activeBook.color : '');
            
            const savedColors = getStoredJSON(`wordbook_focus_${activeBook.id}`, {});
            setWordFocusColors(savedColors);
            
            // Reset revealed state when opening a new book
            setRevealedWords(new Set());

            // Reset filters
            setFilterColor('all');
            setFilterStatus('all');
            setFilterQuality('all');
        }
    }, [activeBook]);

    // Handle automated shelf selection
    useEffect(() => {
        if (shelfToSelect && allShelves.includes(shelfToSelect)) {
            const newIndex = allShelves.findIndex(s => s === shelfToSelect);
            if (newIndex !== -1) setCurrentShelfIndex(newIndex);
            setShelfToSelect(null);
        }
    }, [allShelves, shelfToSelect]);

    // Bounds check for shelf index
    useEffect(() => {
        if (currentShelfIndex >= allShelves.length) {
            setCurrentShelfIndex(Math.max(0, allShelves.length - 1));
        }
    }, [allShelves.length, currentShelfIndex]);

    const currentShelfName = allShelves[currentShelfIndex] || 'General';
    const booksOnCurrentShelf = useMemo(() => books.filter(b => (b.topic.split(':')[0].trim() || 'General') === currentShelfName), [books, currentShelfName]);
    
    // UI Helpers
    const handleAddShelf = () => setIsAddShelfModalOpen(true);
    const handleRenameShelf = () => setIsRenameShelfModalOpen(true);

    const handleConfirmAddShelf = (name: string) => {
        const newName = name.trim();
        if (allShelves.map(s => s.toLowerCase()).includes(newName.toLowerCase())) { showToast("Shelf name already exists.", "error"); return; }
        const newCustomShelves = [...customShelves, newName];
        setCustomShelves(newCustomShelves);
        setStoredJSON('wordbook_custom_shelves', newCustomShelves);
        setShelfToSelect(newName);
        showToast(`Shelf "${newName}" created.`, "success");
        setIsAddShelfModalOpen(false);
    };

    const handleConfirmRenameShelf = async (newName: string) => {
        const oldName = currentShelfName;
        if (newName && newName !== oldName) {
            const finalNewName = newName.trim();
            if (allShelves.map(s => s.toLowerCase()).includes(finalNewName.toLowerCase())) { showToast("Shelf name already exists.", "error"); return; }
            setIsRenameShelfModalOpen(false);
            setLoading(true);
            const booksToUpdate = books.filter(b => (b.topic.split(':')[0].trim() || 'General') === oldName);
            const updatedBooks = booksToUpdate.map(b => {
                const parts = b.topic.split(':').map(p => p.trim());
                const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
                return { ...b, topic: `${finalNewName}: ${bookTitle}`, updatedAt: Date.now() };
            });
            await db.bulkSaveWordBooks(updatedBooks);
            const newCustomShelves = customShelves.map(s => s === oldName ? finalNewName : s);
            setCustomShelves(newCustomShelves);
            setStoredJSON('wordbook_custom_shelves', newCustomShelves);
            setShelfToSelect(finalNewName);
            await loadBooks();
            showToast(`Shelf renamed to "${finalNewName}".`, "success");
        }
    };

    const handleRemoveShelf = () => {
        if (booksOnCurrentShelf.length > 0) { showToast("Cannot remove a shelf that contains books.", "error"); return; }
        if (currentShelfName === 'General') { showToast("Cannot remove General shelf.", "error"); return; }
        const newCustomShelves = customShelves.filter(s => s !== currentShelfName);
        setCustomShelves(newCustomShelves);
        setStoredJSON('wordbook_custom_shelves', newCustomShelves);
        setCurrentShelfIndex(prev => Math.max(0, prev - 1));
        showToast(`Shelf "${currentShelfName}" removed.`, "info");
    };

    const handleCreateBook = async () => {
        const newBook: WordBook = {
            id: `wb-${Date.now()}`,
            userId: user.id,
            topic: `${currentShelfName}: New Book`,
            icon: '📘',
            words: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            color: '#1a237e'
        };
        await db.saveWordBook(newBook);
        await loadBooks();
        setActiveBook(newBook);
    };

    const handleGenerateResult = async (data: any) => {
        const now = Date.now();
        const newBook: WordBook = {
            id: `wb-ai-${now}`,
            userId: user.id,
            topic: data.topic,
            icon: data.icon,
            words: data.words,
            color: data.color || '#5d4037',
            createdAt: now,
            updatedAt: now
        };
        await db.saveWordBook(newBook);
        showToast("New book generated with AI!", "success");
        setIsAiModalOpen(false);
        setActiveBook(newBook);
        await loadBooks();
    };

    const handleUpdateBook = async (updates: Partial<WordBook>) => {
        if (!activeBook) return;
        const updated = { ...activeBook, ...updates, updatedAt: Date.now() };
        setActiveBook(updated);
        await db.saveWordBook(updated);
        setBooks(prev => prev.map(b => b.id === updated.id ? updated : b));
    };

    const handleDeleteBook = async () => {
        if (!bookToDelete) return;
        await db.deleteWordBook(bookToDelete.id, user.id);
        setBookToDelete(null);
        await loadBooks();
        showToast("Book deleted.", "success");
    };

    const handleMoveBook = async (targetShelf: string) => {
        if (!bookToMove) return;
        const parts = bookToMove.topic.split(':').map(p => p.trim());
        const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
        const newTopic = `${targetShelf}: ${bookTitle}`;
        const updatedBook = { ...bookToMove, topic: newTopic, updatedAt: Date.now() };
        await db.saveWordBook(updatedBook);
        setBookToMove(null);
        await loadBooks();
        showToast(`Book moved to "${targetShelf}".`, "success");
    };

    const handleAddWord = (word: string, definition: string) => {
        if (!activeBook) return;
        const newWords = [...activeBook.words, { word, definition }].sort((a,b) => a.word.localeCompare(b.word));
        handleUpdateBook({ words: newWords });
        setIsAddWordModalOpen(false);
    };

    const handleRemoveWord = (wordText: string) => {
        if (!activeBook) return;
        const newWords = activeBook.words.filter(w => w.word !== wordText);
        handleUpdateBook({ words: newWords });
    };

    const handleAddFromLibrary = (items: VocabularyItem[]) => {
        if (!activeBook) return;
        const newItems = items.map(i => ({ word: i.word, definition: i.meaningVi }));
        const currentWords = new Set(activeBook.words.map(w => w.word.toLowerCase()));
        const filtered = newItems.filter(i => !currentWords.has(i.word.toLowerCase()));
        const combined = [...activeBook.words, ...filtered].sort((a,b) => a.word.localeCompare(b.word));
        handleUpdateBook({ words: combined });
        setIsAddFromLibraryModalOpen(false);
        showToast(`Added ${filtered.length} words from library.`, "success");
    };

    const handleAddFromUnit = (items: VocabularyItem[]) => {
        if (!activeBook) return;
        const newItems = items.map(i => ({ word: i.word, definition: i.meaningVi }));
        const currentWords = new Set(activeBook.words.map(w => w.word.toLowerCase()));
        const filtered = newItems.filter(i => !currentWords.has(i.word.toLowerCase()));
        const combined = [...activeBook.words, ...filtered].sort((a,b) => a.word.localeCompare(b.word));
        handleUpdateBook({ words: combined });
        setIsAddFromUnitModalOpen(false);
        showToast(`Added ${filtered.length} words from unit.`, "success");
    };

    const handleAutoAddResult = (newItems: any[]) => {
        if (!activeBook) return;
        const currentWords = new Set(activeBook.words.map(w => w.word.toLowerCase()));
        const filtered = newItems.filter(i => !currentWords.has(i.word.toLowerCase()));
        const combined = [...activeBook.words, ...filtered].sort((a,b) => a.word.localeCompare(b.word));
        handleUpdateBook({ words: combined });
        setIsAutoAddModalOpen(false);
        showToast(`AI suggested ${filtered.length} new words!`, "success");
    };

    const handleAddWordToLibrary = async (wordText: string, definition: string) => {
        if (addingWord) return;
        setAddingWord(wordText);
        try {
            const isPhrase = wordText.includes(' ');
            const newItem = createNewWord(wordText, '', definition, '', `Added from Word Book: ${activeBook?.topic}`, [], false, false, false, false, isPhrase);
            newItem.userId = user.id;
            await dataStore.saveWord(newItem);
            showToast(`"${wordText}" added to library.`, "success");
            await loadBooks(); // Refresh map
        } catch (e) {
            showToast("Failed to add word.", "error");
        } finally {
            setAddingWord(null);
        }
    };

    const handleUpdateWordFocus = (wordText: string, color: FocusColor | null) => {
        if (!activeBook) return;
        const next = { ...wordFocusColors, [wordText]: color };
        if (!color) delete next[wordText];
        setWordFocusColors(next);
        setStoredJSON(`wordbook_focus_${activeBook.id}`, next);
    };

    const handleMoveWordToBook = async (targetBookId: string) => {
        if (!activeBook || !wordMovingTarget) return;
        const targetBook = books.find(b => b.id === targetBookId);
        if (!targetBook) return;

        const updatedTargetWords = [...targetBook.words, wordMovingTarget].sort((a,b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
        const updatedTargetBook = { ...targetBook, words: updatedTargetWords, updatedAt: Date.now() };
        await db.saveWordBook(updatedTargetBook);
        
        const updatedCurrentWords = activeBook.words.filter(w => w.word !== wordMovingTarget.word);
        const updatedCurrentBook = { ...activeBook, words: updatedCurrentWords, updatedAt: Date.now() };
        await db.saveWordBook(updatedCurrentBook);
        
        setBooks(prev => prev.map(b => {
            if (b.id === targetBookId) return updatedTargetBook;
            if (b.id === activeBook.id) return updatedCurrentBook;
            return b;
        }));
        setActiveBook(updatedCurrentBook);
        
        setWordMovingTarget(null);
        showToast(`Moved "${wordMovingTarget.word}" to ${targetBook.topic.split(':').pop()?.trim()}`, "success");
    };

    const handleSaveTitle = () => {
        const shelf = activeBook?.topic.split(':')[0].trim() || 'General';
        const newFullTitle = `${shelf}: ${editableTitle.trim()}`;
        if (newFullTitle !== activeBook?.topic) handleUpdateBook({ topic: newFullTitle });
        setIsEditingTitle(false);
    };

    const handleSaveIcon = () => {
        if (editableIcon !== activeBook?.icon) handleUpdateBook({ icon: editableIcon.trim() });
        setIsEditingIcon(false);
    };

    const toggleReveal = (word: string) => {
        setRevealedWords(prev => {
            const next = new Set(prev);
            if (next.has(word)) next.delete(word);
            else next.add(word);
            return next;
        });
    };

    const handleSaveWordUpdate = async (updatedWord: VocabularyItem) => {
        await dataStore.saveWord(updatedWord);
        // Sync local map
        const nextMap = new Map(libraryWordsMap);
        nextMap.set(updatedWord.word.toLowerCase(), updatedWord);
        setLibraryWordsMap(nextMap);
        if (viewingWord && viewingWord.id === updatedWord.id) setViewingWord(updatedWord);
    };

    const filteredActiveWords = useMemo(() => {
        if (!activeBook) return [];
        return activeBook.words.filter(item => {
            const libraryWord = libraryWordsMap.get(item.word.toLowerCase());
            const focusColor = wordFocusColors[item.word] || 'none';

            // Filter by Color
            if (filterColor !== 'all' && focusColor !== filterColor) return false;

            // Filter by Status (Requires Library Match)
            if (filterStatus !== 'all') {
                const statusInfo = getStatusInfo(libraryWord || null);
                const derivedStatus = statusInfo?.text.toUpperCase(); // NEW, LEARNED, HARD, EASY, FORGOT
                if (derivedStatus !== filterStatus) return false;
            }

            // Filter by Quality (Requires Library Match)
            if (filterQuality !== 'all') {
                if (!libraryWord || libraryWord.quality !== filterQuality) return false;
            }

            return true;
        });
    }, [activeBook, libraryWordsMap, wordFocusColors, filterColor, filterStatus, filterQuality]);

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500">
            {activeBook ? (
                // --- RENDER: BOOK DETAIL VIEW ---
                <div className="h-full flex flex-col">
                    <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center p-4 gap-4 shrink-0 bg-white border-b border-neutral-100 z-20">
                        <div className="flex flex-wrap items-center gap-4 flex-1">
                            <button onClick={() => { setActiveBook(null); loadBooks(); }} className="flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors"> <ArrowLeft size={16}/> Back </button>
                            
                            <div className="flex items-center gap-4">
                                {isEditingIcon ? (
                                    <input value={editableIcon} onChange={(e) => setEditableIcon(e.target.value)} onBlur={handleSaveIcon} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} autoFocus placeholder="Emoji" className="text-2xl w-24 text-center bg-neutral-100 border border-neutral-300 rounded-lg py-1 outline-none ring-2 ring-indigo-300" />
                                ) : (
                                    <div onClick={() => setIsEditingIcon(true)} className="p-1 rounded-lg hover:bg-neutral-100 cursor-pointer min-w-10 flex items-center justify-center">
                                        {activeBook.icon ? (
                                            <BookIcon icon={activeBook.icon} className="text-2xl w-10 h-10 flex items-center justify-center mx-auto" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-300"><ImageIcon size={18} /></div>
                                        )}
                                    </div>
                                )}
                                
                                {isEditingTitle ? (
                                    <input value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} onBlur={handleSaveTitle} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} autoFocus className="text-xl font-black text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-lg px-2 py-1 outline-none ring-2 ring-indigo-300" />
                                ) : (
                                    <div onClick={() => setIsEditingTitle(true)} className="group/title relative p-1 rounded-lg hover:bg-neutral-100 cursor-pointer flex items-center gap-2">
                                        <h2 className="text-xl font-black text-neutral-900 tracking-tight" style={{ color: activeBook.titleColor || '#171717', fontSize: activeBook.titleSize ? `${activeBook.titleSize}px` : 'inherit' }}>{editableTitle}</h2>
                                        <Pen size={14} className="text-neutral-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                                    </div>
                                )}
                            </div>

                            {/* Moved Filter Bar here to be on same row */}
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="h-6 w-px bg-neutral-200 hidden xl:block"></div>
                                <div className="flex items-center gap-1.5">
                                    <Filter size={14} className="text-neutral-400" />
                                </div>

                                {/* Color Filter */}
                                <div className="flex bg-neutral-100 p-1 rounded-xl">
                                    <button onClick={() => setFilterColor('all')} className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filterColor === 'all' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}>All</button>
                                    <button onClick={() => setFilterColor('green')} className={`w-5 h-5 ml-1 rounded-lg bg-emerald-500 border-2 transition-all ${filterColor === 'green' ? 'border-neutral-900 scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}></button>
                                    <button onClick={() => setFilterColor('yellow')} className={`w-5 h-5 ml-1 rounded-lg bg-amber-400 border-2 transition-all ${filterColor === 'yellow' ? 'border-neutral-900 scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}></button>
                                    <button onClick={() => setFilterColor('red')} className={`w-5 h-5 ml-1 rounded-lg bg-rose-500 border-2 transition-all ${filterColor === 'red' ? 'border-neutral-900 scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}></button>
                                    <button onClick={() => setFilterColor('none')} className={`px-2 py-1 ml-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filterColor === 'none' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}>None</button>
                                </div>

                                {/* Status Filter */}
                                <select 
                                    value={filterStatus} 
                                    onChange={(e) => setFilterStatus(e.target.value as any)}
                                    className="bg-white border border-neutral-200 rounded-xl px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none cursor-pointer"
                                >
                                    <option value="all">Any Status</option>
                                    <option value="NEW">New</option>
                                    <option value="LEARNED">Learned</option>
                                    <option value="EASY">Easy</option>
                                    <option value="HARD">Hard</option>
                                    <option value="FORGOT">Forgot</option>
                                </select>

                                {/* Quality Filter */}
                                <select 
                                    value={filterQuality} 
                                    onChange={(e) => setFilterQuality(e.target.value as any)}
                                    className="bg-white border border-neutral-200 rounded-xl px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none cursor-pointer"
                                >
                                    <option value="all">Any Quality</option>
                                    <option value={WordQuality.VERIFIED}>Verified</option>
                                    <option value={WordQuality.REFINED}>Refined</option>
                                    <option value={WordQuality.RAW}>Raw</option>
                                    <option value={WordQuality.FAILED}>Failed</option>
                                </select>

                                {(filterColor !== 'all' || filterStatus !== 'all' || filterQuality !== 'all') && (
                                    <button 
                                        onClick={() => { setFilterColor('all'); setFilterStatus('all'); setFilterQuality('all'); }}
                                        className="text-[9px] font-black text-indigo-600 hover:underline uppercase"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative" ref={colorPickerRef}>
                                <button onClick={() => setIsColorPickerOpen(!isColorPickerOpen)} className={`p-2.5 rounded-xl transition-all border shadow-sm flex items-center justify-center gap-2 ${isColorPickerOpen ? 'bg-neutral-900 text-white border-neutral-900 shadow-md' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'}`} title="Change Cover Design">
                                    <Palette size={18} />
                                    {isColorPickerOpen && <span className="text-[10px] font-black uppercase tracking-widest mr-1">Design</span>}
                                </button>
                                {isColorPickerOpen && (
                                    <div className="absolute top-full right-0 mt-3 p-5 bg-white rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-neutral-100 z-[100] animate-in fade-in zoom-in-95 origin-top-right w-80 space-y-5">
                                        <div className="flex justify-center border-b border-neutral-100 pb-4">
                                            <div className="w-32 h-44 shadow-lg rounded-lg overflow-hidden transform rotate-2">
                                                <UniversalBook 
                                                    id={activeBook.id}
                                                    title={editableTitle}
                                                    icon={<BookIcon icon={activeBook.icon || ''} className="text-3xl" />}
                                                    color={activeBook.color}
                                                    titleColor={activeBook.titleColor}
                                                    titleSize={activeBook.titleSize}
                                                    titleTop={activeBook.titleTop}
                                                    titleLeft={activeBook.titleLeft}
                                                    iconTop={activeBook.iconTop}
                                                    iconLeft={activeBook.iconLeft}
                                                    onClick={() => {}}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 px-1 border-b border-neutral-50 pb-2"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cover Color</span></div>
                                            <div className="grid grid-cols-5 gap-3 justify-items-center">
                                                {COLORS.map(c => (<button key={c} onClick={() => handleUpdateBook({ color: c })} className={`w-8 h-8 rounded-full transition-all hover:scale-125 active:scale-90 ${activeBook.color === c ? 'ring-2 ring-neutral-900 ring-offset-2 scale-110 shadow-md' : 'opacity-90 hover:opacity-100 shadow-sm border border-black/5'}`} style={{ backgroundColor: c }} />))}
                                            </div>
                                        </div>
                                        <div className="space-y-3 pt-2 border-t border-neutral-50">
                                            <div className="flex items-center gap-2 px-1"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Title Style</span></div>
                                            <div className="space-y-3 px-1">
                                                <div className="grid grid-cols-5 gap-3 justify-items-center">
                                                    {TITLE_COLORS.map(c => (<button key={c} onClick={() => handleUpdateBook({ titleColor: c })} className={`w-6 h-6 rounded-md border transition-all ${activeBook.titleColor === c ? 'ring-2 ring-indigo-500' : 'border-neutral-200'}`} style={{ backgroundColor: c }} />))}
                                                </div>
                                                <div className="flex items-center gap-3 bg-neutral-50 p-2 rounded-xl">
                                                    <Type size={14} className="text-neutral-400" />
                                                    <input type="range" min="12" max="48" value={activeBook.titleSize || 24} onChange={(e) => handleUpdateBook({ titleSize: parseInt(e.target.value) })} className="flex-1 accent-neutral-900 h-1" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3 pt-2 border-t border-neutral-50">
                                            <div className="flex items-center justify-between px-1"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Layout</span><button onClick={() => handleUpdateBook({ titleTop: undefined, titleLeft: undefined, iconTop: undefined, iconLeft: undefined })} className="text-[8px] font-black text-indigo-600 hover:underline uppercase">Center All</button></div>
                                            <div className="grid grid-cols-2 gap-4 px-1">
                                                <div className="space-y-1.5"><label className="text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1">Title Pos</label><div className="flex gap-1"><input type="number" value={activeBook.titleTop ?? 50} onChange={e => handleUpdateBook({ titleTop: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /><input type="number" value={activeBook.titleLeft ?? 50} onChange={e => handleUpdateBook({ titleLeft: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /></div></div>
                                                <div className="space-y-1.5"><label className="text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1">Icon Pos</label><div className="flex gap-1"><input type="number" value={activeBook.iconTop ?? 40} onChange={e => handleUpdateBook({ iconTop: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /><input type="number" value={activeBook.iconLeft ?? 50} onChange={e => handleUpdateBook({ iconLeft: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /></div></div>
                                            </div>
                                        </div>
                                        <div className="space-y-2 pt-2 border-t border-neutral-50">
                                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Image URL</label>
                                            <div className="flex gap-2">
                                                <input value={customColorUrl} onChange={(e) => setCustomColorUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { handleUpdateBook({ color: customColorUrl.trim() }); setIsColorPickerOpen(false); } }} placeholder="https://..." className="flex-1 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-neutral-900 outline-none" />
                                                <button onClick={() => handleUpdateBook({ color: customColorUrl.trim() })} className="p-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800" ><Plus size={14}/></button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex bg-neutral-100 p-1 rounded-xl">
                                 <button onClick={() => setIsAddFromUnitModalOpen(true)} className="p-2.5 text-neutral-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all" title="Add from Unit"><Layers3 size={18}/></button>
                                 <button onClick={() => setIsAddFromLibraryModalOpen(true)} className="p-2.5 text-neutral-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all" title="Add from Library"><Library size={18}/></button>
                                 <button onClick={() => setIsAutoAddModalOpen(true)} className="p-2.5 text-neutral-500 hover:text-amber-500 hover:bg-white rounded-lg transition-all" title="Auto-Suggest Words with AI"><Sparkles size={18}/></button>
                            </div>

                            <button onClick={() => setIsAddWordModalOpen(true)} className="px-4 py-2 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-neutral-800 transition-all active:scale-95 shadow-lg shadow-neutral-900/10">
                                <Plus size={16}/> New Word
                            </button>
                        </div>
                    </header>

                    <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-neutral-50/50 relative">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
                            {filteredActiveWords.map((item, i) => {
                                const libraryWord = libraryWordsMap.get(item.word.toLowerCase());
                                const status = getStatusInfo(libraryWord || null);
                                const badges: CardBadge[] = status ? [{ label: status.text, colorClass: status.classes }] : [];
                                const isRevealed = revealedWords.has(item.word);
                                
                                return (
                                    <UniversalCard
                                        key={`${item.word}-${i}`}
                                        title={<div className="flex items-center gap-2 font-black text-neutral-900">{item.word} {libraryWord?.isPassive && <Archive size={12} className="text-neutral-300" />}</div>}
                                        badges={badges}
                                        compact={true}
                                        focusColor={wordFocusColors[item.word]}
                                        onFocusChange={(color) => handleUpdateWordFocus(item.word, color)}
                                        onClick={() => { if (libraryWord) setViewingWord(libraryWord); }}
                                        actions={
                                            <div className="flex items-center gap-1">
                                                {libraryWord ? (
                                                    <>
                                                        <button onClick={(e) => { e.stopPropagation(); setViewingWord(libraryWord); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="View in Library"><Eye size={14}/></button>
                                                        <button onClick={(e) => { e.stopPropagation(); setEditingWord(libraryWord); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit in Library"><Edit3 size={14}/></button>
                                                    </>
                                                ) : (
                                                    <button onClick={(e) => { e.stopPropagation(); handleAddWordToLibrary(item.word, item.definition); }} disabled={addingWord === item.word} className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors" title="Import to Library">{addingWord === item.word ? <Loader2 size={14} className="animate-spin" /> : <FilePlus size={14}/>}</button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); setWordMovingTarget(item); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Move to Another Book"><Move size={14}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleRemoveWord(item.word); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Remove from Book"><Trash2 size={14}/></button>
                                            </div>
                                        }
                                    >
                                        <div 
                                            className="flex flex-col items-start justify-start min-h-[40px] cursor-pointer group/reveal pt-1"
                                            onClick={(e) => { e.stopPropagation(); toggleReveal(item.word); }}
                                        >
                                            {isRevealed ? (
                                                <p className="flex-1 text-xs font-medium text-neutral-700 leading-tight text-left animate-in fade-in duration-300">
                                                    {item.definition || libraryWord?.meaningVi}
                                                </p>
                                            ) : (
                                                <div className="w-full flex justify-center py-1">
                                                    <div className="text-neutral-200 group-hover/reveal:text-neutral-400 transition-colors animate-in zoom-in duration-300">
                                                        <Eye size={18} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </UniversalCard>
                                );
                            })}
                            {filteredActiveWords.length === 0 && (
                                <div className="col-span-full py-20 text-center text-neutral-400 border-2 border-dashed border-neutral-200 rounded-3xl">
                                    <p className="font-bold">No items found matching your filters.</p>
                                    <button onClick={() => { setFilterColor('all'); setFilterStatus('all'); setFilterQuality('all'); }} className="text-sm text-indigo-600 hover:underline font-bold mt-2">Clear all filters</button>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            ) : (
                // --- RENDER: SHELF VIEW ---
                <div className="space-y-6">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-3">
                            <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png" className="w-10 h-10 object-contain" alt="Word Book" />
                            <div>
                                <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Word Book</h2>
                                <p className="text-neutral-500 mt-1 font-medium">Your thematic vocabulary collections.</p>
                            </div>
                        </div>

                        {/* Search Box */}
                        <div className="flex-1 max-w-md relative mx-0 md:mx-4" ref={searchRef}>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setShowSearchSuggestions(true); }}
                                    onFocus={() => setShowSearchSuggestions(true)}
                                    placeholder="Search shelf or book..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all shadow-sm"
                                />
                            </div>
                            {showSearchSuggestions && searchSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-neutral-100 rounded-2xl shadow-xl z-[100] overflow-hidden animate-in fade-in zoom-in-95">
                                    {searchSuggestions.map((s, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => handleNavigateTo(s)}
                                            className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-center justify-between border-b border-neutral-50 last:border-0"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-neutral-900">{s.label}</span>
                                                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                                                    {s.type === 'shelf' ? 'Shelf' : `Book • ${s.shelf}`}
                                                </span>
                                            </div>
                                            <ChevronRight size={14} className="text-neutral-300" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={handleAddShelf} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm">
                                <FolderPlus size={14}/> Add Shelf
                            </button>
                            <button onClick={() => setIsAiModalOpen(true)} className="px-6 py-3 bg-white border border-neutral-200 text-indigo-600 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm">
                                <Sparkles size={16}/> <span>Generate Book</span>
                            </button>
                            <button onClick={handleCreateBook} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-neutral-800 active:scale-95 transition-all shadow-lg shadow-neutral-900/10">
                                <Plus size={18}/> <span>New Book</span>
                            </button>
                        </div>
                    </header>

                    <UniversalShelf
                        label={currentShelfName}
                        onNext={() => setCurrentShelfIndex((currentShelfIndex + 1) % allShelves.length)}
                        onPrev={() => setCurrentShelfIndex((currentShelfIndex - 1 + allShelves.length) % allShelves.length)}
                        actions={
                            <div className="flex items-center gap-2">
                                <button onClick={handleRenameShelf} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white" title="Rename Shelf"><Pen size={14}/></button>
                                <button onClick={handleRemoveShelf} disabled={booksOnCurrentShelf.length > 0} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/20" title="Remove Empty Shelf"><Trash2 size={14}/></button>
                            </div>
                        }
                        isEmpty={booksOnCurrentShelf.length === 0}
                        emptyAction={
                            <button onClick={handleCreateBook} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-widest border border-white/20">
                                Create First Book
                            </button>
                        }
                    >
                        {booksOnCurrentShelf.map(book => (
                            <WordBookCard 
                                key={book.id} 
                                book={book} 
                                onClick={() => setActiveBook(book)} 
                                onMove={(e) => { e.stopPropagation(); setBookToMove(book); }}
                                onDelete={(e) => { e.stopPropagation(); setBookToDelete(book); }}
                            />
                        ))}
                    </UniversalShelf>
                </div>
            )}

            {/* Common Modals & Sub-views - ALWAYS RENDERED AT THE END OF THE COMPONENT */}
            {viewingWord && (
                <ViewWordModal 
                    word={viewingWord} 
                    onClose={() => setViewingWord(null)} 
                    onNavigateToWord={setViewingWord} 
                    onUpdate={handleSaveWordUpdate} 
                    onEditRequest={(w) => { setViewingWord(null); setEditingWord(w); }} 
                    onGainXp={async () => 0} 
                    isViewOnly={false} 
                />
            )}
            {editingWord && (
                <EditWordModal 
                    user={user} 
                    word={editingWord} 
                    onSave={async (w) => { await dataStore.saveWord(w); setEditingWord(null); await loadBooks(); }} 
                    onClose={() => setEditingWord(null)} 
                    onSwitchToView={(w) => { setEditingWord(null); setViewingWord(w); }} 
                />
            )}
            
            <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="GENERATE_UNIT" title="Thematic Book Creator" description="AI will design a thematic book with essential vocabulary." onGeneratePrompt={(i) => getGenerateWordBookPrompt(i.request)} onJsonReceived={handleGenerateResult} actionLabel="Generate" closeOnSuccess={true} />
            <UniversalAiModal isOpen={isAutoAddModalOpen} onClose={() => setIsAutoAddModalOpen(false)} type="REFINE_UNIT" title="AI Vocabulary Suggestion" description="Suggest more essential words for this topic." initialData={{}} onGeneratePrompt={(i) => getAutoAddWordsToBookPrompt(activeBook?.topic || '', activeBook?.words.map(w=>w.word) || [], i.request)} onJsonReceived={handleAutoAddResult} actionLabel="Suggest" />
            
            <AddWordToBookModal isOpen={isAddWordModalOpen} onClose={() => setIsAddWordModalOpen(false)} onSave={handleAddWord} />
            <AddFromLibraryModal isOpen={isAddFromLibraryModalOpen} onClose={() => setIsAddFromLibraryModalOpen(false)} onSave={handleAddFromLibrary} libraryWords={allLibraryWords} wordsInBook={activeBook?.words || []} />
            <AddFromUnitModal isOpen={isAddFromUnitModalOpen} onClose={() => setIsAddFromUnitModalOpen(false)} onSave={handleAddFromUnit} units={allUnits} libraryWords={allLibraryWords} wordsInBook={activeBook?.words || []} />
            <MoveWordToBookModal isOpen={!!wordMovingTarget} onClose={() => setWordMovingTarget(null)} onConfirm={handleMoveWordToBook} books={books} currentBookId={activeBook?.id || ''} wordText={wordMovingTarget?.word || ''} />
            
            <AddShelfModal isOpen={isAddShelfModalOpen} onClose={() => setIsAddShelfModalOpen(false)} onSave={handleConfirmAddShelf} />
            <RenameShelfModal isOpen={isRenameShelfModalOpen} onClose={() => setIsRenameShelfModalOpen(false)} onSave={handleConfirmRenameShelf} initialName={currentShelfName} />
            <MoveBookModal isOpen={!!bookToMove} onClose={() => setBookToMove(null)} onConfirm={handleMoveBook} shelves={allShelves} currentShelf={currentShelfName} bookTitle={bookToMove?.topic || ''} />
            
            <ConfirmationModal isOpen={!!bookToDelete} title="Delete Book?" message={<>Are you sure you want to delete <strong>"{bookToDelete?.topic.split(':').pop()?.trim()}"</strong>? Words inside will not be deleted from library.</>} confirmText="Delete" isProcessing={false} onConfirm={handleDeleteBook} onClose={() => setBookToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
        </div>
    );
};

export default WordBookPage;
