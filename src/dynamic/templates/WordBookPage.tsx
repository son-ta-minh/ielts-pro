
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, WordBook, WordBookItem, VocabularyItem, FocusColor, WordQuality, Unit } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { BookMarked, Plus, Loader2, ArrowLeft, Trash2, ChevronLeft, ChevronRight, Pen, FolderPlus, Volume2, Eye, Sparkles, BookOpen, FilePlus, Library, Palette, Image as ImageIcon, Link as LinkIcon, Type, Move, Layers3 } from 'lucide-react';
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

interface Props {
  user: User;
}

export const WordBookPage: React.FC<Props> = ({ user }) => {
    const [books, setBooks] = useState<WordBook[]>([]);
    const [allLibraryWords, setAllLibraryWords] = useState<VocabularyItem[]>([]);
    const [allUnits, setAllUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeBook, setActiveBook] = useState<WordBook | null>(null);
    
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) setIsColorPickerOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        setLoading(false);
    }, [user.id]);

    useEffect(() => { loadBooks(); }, [loadBooks]);

    useEffect(() => {
        if (activeBook) {
            const parts = activeBook.topic.split(':').map(p => p.trim());
            const displayTopic = parts.length > 1 ? parts.slice(1).join(':').trim() : activeBook.topic;
            setEditableTitle(displayTopic);
            setEditableIcon(activeBook.icon);
            setCustomColorUrl(activeBook.color?.startsWith('http') || activeBook.color?.startsWith('data:image') ? activeBook.color : '');
            const map = new Map<string, VocabularyItem>();
            allLibraryWords.forEach(w => map.set(w.word.toLowerCase(), w));
            setLibraryWordsMap(map);
            const savedColors = getStoredJSON(`wordbook_focus_${activeBook.id}`, {});
            setWordFocusColors(savedColors);
        }
    }, [activeBook, user.id, allLibraryWords]);

    const allShelves = useMemo(() => {
        const shelvesFromBooks = new Set(books.map(b => b.topic.split(':')[0].trim()).filter(Boolean));
        const combined = new Set([...customShelves, ...Array.from(shelvesFromBooks)]);
        
        const sorted = Array.from(combined).sort((a, b) => {
            if (a === 'General') return -1;
            if (b === 'General') return 1;
            return a.localeCompare(b);
        });

        // Only default to General if absolutely no shelves exist
        return sorted.length > 0 ? sorted : ['General'];
    }, [books, customShelves]);

    useEffect(() => {
        if (shelfToSelect && allShelves.includes(shelfToSelect)) {
            const newIndex = allShelves.findIndex(s => s === shelfToSelect);
            if (newIndex !== -1) setCurrentShelfIndex(newIndex);
            setShelfToSelect(null);
        }
    }, [allShelves, shelfToSelect]);

    // Ensure index is valid
    useEffect(() => {
        if (currentShelfIndex >= allShelves.length) {
            setCurrentShelfIndex(Math.max(0, allShelves.length - 1));
        }
    }, [allShelves.length]);

    const currentShelfName = allShelves[currentShelfIndex] || 'General';
    const booksOnCurrentShelf = useMemo(() => books.filter(b => (b.topic.split(':')[0].trim() || 'General') === currentShelfName), [books, currentShelfName]);
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
                return { ...b, topic: `${finalNewName}: ${bookTitle}` };
            });
            await Promise.all(updatedBooks.map(b => dataStore.saveWordBook(b)));
            const newCustomShelves = customShelves.map(s => s === oldName ? finalNewName : s);
            setCustomShelves(newCustomShelves);
            setStoredJSON('wordbook_custom_shelves', newCustomShelves);
            await loadBooks();
            setShelfToSelect(finalNewName);
            showToast(`Renamed to "${finalNewName}".`, 'success');
        } else setIsRenameShelfModalOpen(false);
    };
    
    const handleRemoveShelf = () => {
        if (booksOnCurrentShelf.length > 0) { showToast("Cannot remove a shelf that contains books.", "error"); return; }
        if (window.confirm(`Are you sure you want to delete the empty shelf "${currentShelfName}"?`)) {
            const newCustomShelves = customShelves.filter(s => s !== currentShelfName);
            setCustomShelves(newCustomShelves);
            setStoredJSON('wordbook_custom_shelves', newCustomShelves);
            setCurrentShelfIndex(p => Math.max(0, p - 1));
        }
    };

    const navigateShelf = (direction: 1 | -1) => setCurrentShelfIndex((currentShelfIndex + direction + allShelves.length) % allShelves.length);

    const handleGenerateBook = async (data: any) => {
        setIsAiModalOpen(false);
        setLoading(true);
        try {
            const aiTopic = data.topic || 'Untitled';
            const topicParts = aiTopic.split(':').map((p: string) => p.trim());
            const bookTitle = topicParts.length > 1 ? topicParts.slice(1).join(': ').trim() : aiTopic;
            const finalTopic = `${currentShelfName}: ${bookTitle}`;
            const newBook: WordBook = { id: `wb-${Date.now()}`, userId: user.id, topic: finalTopic, icon: data.icon, words: data.words, color: data.color, createdAt: Date.now(), updatedAt: Date.now() };
            await dataStore.saveWordBook(newBook);
            showToast("Word Book created!", "success");
            await loadBooks();
        } catch (e: any) { showToast(e.message || "Failed to create Word Book.", "error"); } finally { setLoading(false); }
    };

    const handleNewEmptyBook = async () => {
        try {
            const newBook: WordBook = { id: `wb-${Date.now()}`, userId: user.id, topic: `${currentShelfName}: Untitled Book`, icon: '📖', words: [], createdAt: Date.now(), updatedAt: Date.now() };
            await dataStore.saveWordBook(newBook);
            await loadBooks();
            showToast("New empty book created.", "success");
        } catch (e: any) { showToast(e.message || "Failed to create empty book.", "error"); }
    };

    const handleDeleteBook = async () => {
        if (bookToDelete) {
            await dataStore.deleteWordBook(bookToDelete.id, user.id);
            showToast("Word Book deleted.", "success");
            setBookToDelete(null);
            setActiveBook(null);
            await loadBooks();
        }
    };

    const handleConfirmMoveBook = async (targetShelf: string) => {
        if (!bookToMove) return;
        const parts = bookToMove.topic.split(':').map(p => p.trim());
        const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
        const newTopic = `${targetShelf}: ${bookTitle}`;
        
        const updatedBook = { ...bookToMove, topic: newTopic, updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setBookToMove(null);
        await loadBooks();
        showToast(`Moved to "${targetShelf}".`, 'success');
    };

    const handleAddToLibrary = async (item: WordBookItem) => {
        if (!activeBook) return;
        setAddingWord(item.word);
        try {
            const newWord = createNewWord(item.word, '', item.definition, '', `From Word Book: ${activeBook.topic}`, [activeBook.topic.split(':')[0].trim()]);
            newWord.userId = user.id;
            await db.saveWord(newWord);
            setLibraryWordsMap(prev => new Map(prev).set(item.word.toLowerCase(), newWord));
            showToast(`'${item.word}' added to your main library!`, 'success');
        } catch (e) { showToast('Failed to add word to library.', 'error'); } finally { setAddingWord(null); }
    };

    const handleWordFocusChange = (word: string, color: FocusColor | null) => {
        if (!activeBook) return;
        const newColors = { ...wordFocusColors, [word]: color };
        setWordFocusColors(newColors);
        setStoredJSON(`wordbook_focus_${activeBook.id}`, newColors);
    };

    const handleSaveBookTitle = async () => {
        if (!activeBook) return;
        const parts = activeBook.topic.split(':').map(p => p.trim());
        const originalDisplayTopic = parts.length > 1 ? parts.slice(1).join(':').trim() : activeBook.topic;
        if (!editableTitle.trim() || editableTitle.trim() === originalDisplayTopic) { setIsEditingTitle(false); setEditableTitle(originalDisplayTopic); return; }
        const shelfName = parts[0].trim();
        const newTopic = `${shelfName}: ${editableTitle.trim()}`;
        const updatedBook = { ...activeBook, topic: newTopic, updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        setBooks(prevBooks => prevBooks.map(b => b.id === updatedBook.id ? updatedBook : b));
        setIsEditingTitle(false);
    };

    const handleSaveBookIcon = async () => {
        if (!activeBook) return;
        const newIcon = editableIcon.trim();
        if (newIcon === activeBook.icon) { setIsEditingIcon(false); return; }
        const updatedBook = { ...activeBook, icon: newIcon, updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        setBooks(prevBooks => prevBooks.map(b => b.id === updatedBook.id ? updatedBook : b));
        setIsEditingIcon(false);
    };

    const handleUpdateBookDesign = async (changes: Partial<WordBook>) => {
        if (!activeBook) return;
        const updatedBook = { ...activeBook, ...changes, updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        setBooks(prevBooks => prevBooks.map(b => b.id === updatedBook.id ? updatedBook : b));
    };
    
    const handleRemoveWordFromBook = async (wordToRemove: string) => {
        if (!activeBook) return;
        const updatedWords = activeBook.words.filter(w => w.word !== wordToRemove);
        const updatedBook = { ...activeBook, words: updatedWords, updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        showToast(`'${wordToRemove}' removed from book.`, 'success');
    };

    const handleMoveWordToAnotherBook = async (targetBookId: string) => {
        if (!activeBook || !wordMovingTarget) return;
        const targetBook = books.find(b => b.id === targetBookId);
        if (!targetBook) return;

        if (targetBook.words.some(w => w.word.toLowerCase() === wordMovingTarget.word.toLowerCase())) {
            showToast("Word already exists in destination book.", "error");
            return;
        }

        setLoading(true);
        try {
            const updatedSourceWords = activeBook.words.filter(w => w.word !== wordMovingTarget.word);
            const updatedSourceBook = { ...activeBook, words: updatedSourceWords, updatedAt: Date.now() };
            const updatedTargetWords = [...targetBook.words, wordMovingTarget].sort((a,b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
            const updatedTargetBook = { ...targetBook, words: updatedTargetWords, updatedAt: Date.now() };
            await dataStore.bulkSaveWordBooks([updatedSourceBook, updatedTargetBook]);
            setActiveBook(updatedSourceBook);
            setBooks(prev => prev.map(b => b.id === updatedSourceBook.id ? updatedSourceBook : b.id === updatedTargetBook.id ? updatedTargetBook : b));
            setWordMovingTarget(null);
            showToast(`Moved to "${targetBook.topic.split(':').pop()?.trim()}"`, 'success');
        } catch (e) {
            showToast("Move failed.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveNewWordToBook = async (word: string, definition: string) => {
        if (!activeBook || !word) return;
        if (activeBook.words.some(w => w.word.toLowerCase() === word.toLowerCase())) { showToast("Word already exists in this book.", "error"); return; }
        const updatedWords = [...activeBook.words, { word, definition }];
        const updatedBook = { ...activeBook, words: updatedWords.sort((a,b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase())), updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        showToast(`'${word}' added.`, 'success');
        setIsAddWordModalOpen(false);
    };
    
    const handleSaveFromLibrary = async (wordsToAdd: VocabularyItem[]) => {
        if (!activeBook) return;
        const existingBookWords = new Set(activeBook.words.map(w => w.word.toLowerCase()));
        const newBookItems: WordBookItem[] = wordsToAdd.filter(w => !existingBookWords.has(w.word.toLowerCase())).map(w => ({ word: w.word, definition: w.meaningVi }));
        if (newBookItems.length === 0) { showToast("All selected words are already in this book.", "info"); setIsAddFromLibraryModalOpen(false); return; }
        const updatedWords = [...activeBook.words, ...newBookItems].sort((a,b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
        const updatedBook = { ...activeBook, words: updatedWords, updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        showToast(`Added ${newBookItems.length} words from your library.`, 'success');
        setIsAddFromLibraryModalOpen(false);
        setIsAddFromUnitModalOpen(false);
    };

    const handleSaveWordUpdate = async (updatedWord: VocabularyItem) => {
        await db.saveWord(updatedWord);
        setLibraryWordsMap(prev => new Map(prev).set(updatedWord.word.toLowerCase(), updatedWord));
        if (viewingWord && viewingWord.id === updatedWord.id) setViewingWord(updatedWord);
        if (editingWord && viewingWord && editingWord.id === updatedWord.id) setEditingWord(updatedWord);
    };

    const handleGenerateAutoAddPrompt = (inputs: { request: string }) => {
        if (!activeBook) return "";
        const existingWords = activeBook.words.map(w => w.word);
        return getAutoAddWordsToBookPrompt(activeBook.topic, existingWords, inputs.request);
    };

    const handleAutoAddWords = async (newWords: WordBookItem[]) => {
        if (!activeBook || !newWords || newWords.length === 0) { showToast("AI did not return any new words.", "info"); setIsAutoAddModalOpen(false); return; }
        const existingWordsLower = new Set(activeBook.words.map(w => w.word.toLowerCase()));
        const uniqueNewWords = newWords.filter(nw => nw.word && !existingWordsLower.has(nw.word.toLowerCase()));
        if (uniqueNewWords.length === 0) { showToast("AI returned words that are already in the book.", "info"); setIsAutoAddModalOpen(false); return; }
        const updatedWords = [...activeBook.words, ...uniqueNewWords];
        const updatedBook = { ...activeBook, words: updatedWords.sort((a,b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase())), updatedAt: Date.now() };
        await dataStore.saveWordBook(updatedBook);
        setActiveBook(updatedBook);
        showToast(`Added ${uniqueNewWords.length} new words via AI.`, 'success');
        setIsAutoAddModalOpen(false);
    };

    const deleteBookConfirmationMessage = useMemo(() => {
        if (!bookToDelete) return null;
        const bookParts = bookToDelete.topic.split(':');
        const displayTitle = bookParts[bookParts.length - 1].trim();
        return <>Are you sure you want to delete <strong>"{displayTitle}"</strong>? This is permanent.</>;
    }, [bookToDelete]);

    const moveBookConfirmationTitle = useMemo(() => {
        if (!bookToMove) return "";
        const bookParts = bookToMove.topic.split(':');
        return bookParts[bookParts.length - 1].trim();
    }, [bookToMove]);

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>;

    if (activeBook) {
        return (
            <div className="h-full flex flex-col animate-in fade-in duration-500">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 gap-4 shrink-0 bg-white border-b border-neutral-100 z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setActiveBook(null)} className="flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors"> <ArrowLeft size={16}/> Back </button>
                        <div className="flex items-center gap-4">
                            {isEditingIcon ? (
                                <input value={editableIcon} onChange={(e) => setEditableIcon(e.target.value)} onBlur={handleSaveBookIcon} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} autoFocus placeholder="Emoji/URL" className="text-2xl w-24 text-center bg-neutral-100 border border-neutral-300 rounded-lg py-1 outline-none ring-2 ring-indigo-300" />
                            ) : (
                                <div onClick={() => setIsEditingIcon(true)} className="p-1 rounded-lg hover:bg-neutral-100 cursor-pointer min-w-10 flex items-center justify-center">
                                    {activeBook.icon ? (
                                        <BookIcon icon={activeBook.icon} className="text-2xl w-10 h-10 flex items-center justify-center mx-auto" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-300">
                                            <ImageIcon size={18} />
                                        </div>
                                    )}
                                </div>
                            )}
                            {isEditingTitle ? (
                                <input value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} onBlur={handleSaveBookTitle} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} autoFocus className="text-xl font-black text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-lg px-2 py-1 outline-none ring-2 ring-indigo-300" />
                            ) : (
                                <div onClick={() => setIsEditingTitle(true)} className="group/title relative p-1 rounded-lg hover:bg-neutral-100 cursor-pointer flex items-center gap-2">
                                    <h2 className="text-xl font-black text-neutral-900 tracking-tight" style={{ color: activeBook.titleColor || '#171717', fontSize: activeBook.titleSize ? `${activeBook.titleSize}px` : 'inherit' }}>{editableTitle}</h2>
                                    <Pen size={14} className="text-neutral-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="relative" ref={colorPickerRef}>
                            <button onClick={() => setIsColorPickerOpen(!isColorPickerOpen)} className={`p-2.5 rounded-xl transition-all border shadow-sm flex items-center justify-center gap-2 ${isColorPickerOpen ? 'bg-neutral-900 text-white border-neutral-900 shadow-md' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'}`} title="Change Cover Design">
                                <Palette size={18} />
                                {isColorPickerOpen && <span className="text-[10px] font-black uppercase tracking-widest mr-1">Design</span>}
                            </button>
                            {isColorPickerOpen && (
                                <div className="absolute top-full right-0 mt-3 p-5 bg-white rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-neutral-100 z-[100] animate-in fade-in zoom-in-95 origin-top-right w-80 space-y-5">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 px-1 border-b border-neutral-50 pb-2"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Select Cover Color</span></div>
                                        <div className="grid grid-cols-5 gap-3 justify-items-center">
                                            {COLORS.map(c => (<button key={c} onClick={() => handleUpdateBookDesign({ color: c })} className={`w-8 h-8 rounded-full transition-all hover:scale-125 active:scale-90 ${activeBook.color === c ? 'ring-2 ring-neutral-900 ring-offset-2 scale-110 shadow-md' : 'opacity-90 hover:opacity-100 shadow-sm border border-black/5'}`} style={{ backgroundColor: c }} title="Choose color" />))}
                                        </div>
                                    </div>
                                    <div className="space-y-3 pt-2 border-t border-neutral-50">
                                        <div className="flex items-center gap-2 px-1"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Title Font Style</span></div>
                                        <div className="space-y-3 px-1">
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-5 gap-3 justify-items-center">
                                                    {TITLE_COLORS.map(c => (<button key={c} onClick={() => handleUpdateBookDesign({ titleColor: c })} className={`w-6 h-6 rounded-md border transition-all ${activeBook.titleColor === c ? 'ring-2 ring-indigo-500' : 'border-neutral-200'}`} style={{ backgroundColor: c }} />))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 bg-neutral-50 p-2 rounded-xl">
                                                <Type size={14} className="text-neutral-400" />
                                                <input type="range" min="12" max="48" value={activeBook.titleSize || 24} onChange={(e) => handleUpdateBookDesign({ titleSize: parseInt(e.target.value) })} className="flex-1 accent-neutral-900 h-1" />
                                                <span className="text-[10px] font-black text-neutral-500 w-5">{activeBook.titleSize || 24}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3 pt-2 border-t border-neutral-50">
                                        <div className="flex items-center justify-between px-1"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Layout Positioning</span><button onClick={() => handleUpdateBookDesign({ titleTop: undefined, titleLeft: undefined, iconTop: undefined, iconLeft: undefined })} className="text-[8px] font-black text-indigo-600 hover:underline uppercase">Center All</button></div>
                                        <div className="grid grid-cols-2 gap-4 px-1">
                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1"><Type size={10}/> Title (Top/Left %)</label>
                                                <div className="flex gap-1">
                                                    <input type="number" value={activeBook.titleTop ?? 50} onChange={e => handleUpdateBookDesign({ titleTop: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" />
                                                    <input type="number" value={activeBook.titleLeft ?? 50} onChange={e => handleUpdateBookDesign({ titleLeft: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1"><Move size={10}/> Icon (Top/Left %)</label>
                                                <div className="flex gap-1">
                                                    <input type="number" value={activeBook.iconTop ?? 40} onChange={e => handleUpdateBookDesign({ iconTop: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" />
                                                    <input type="number" value={activeBook.iconLeft ?? 50} onChange={e => handleUpdateBookDesign({ iconLeft: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pt-2 border-t border-neutral-50">
                                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1.5"><ImageIcon size={10}/> Custom Image URL / Base64</label>
                                        <div className="flex gap-2">
                                            <input value={customColorUrl} onChange={(e) => setCustomColorUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { handleUpdateBookDesign({ color: customColorUrl.trim() }); setIsColorPickerOpen(false); } }} placeholder="https://..." className="flex-1 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-neutral-900 outline-none" />
                                            <button onClick={() => handleUpdateBookDesign({ color: customColorUrl.trim() })} className="p-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800" ><Plus size={14}/></button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsAutoAddModalOpen(true)} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-neutral-50 transition-all"><Sparkles size={14} className="text-amber-500"/> Auto Add</button>
                            <button onClick={() => setIsAddFromUnitModalOpen(true)} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-neutral-50 transition-all"><Layers3 size={14}/> Unit</button>
                            <button onClick={() => setIsAddFromLibraryModalOpen(true)} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-neutral-50 transition-all"><Library size={14}/> Library</button>
                            <button onClick={() => setIsAddWordModalOpen(true)} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-neutral-50 transition-all"><FilePlus size={14}/> Add Word</button>
                        </div>
                    </div>
                </header>
                
                <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-neutral-50/50 relative">
                    {/* Units Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
                        {activeBook.words.map((item, i) => {
                             const isBookmarked = libraryWordsMap.has(item.word.toLowerCase());
                             const bookmarkedItem = isBookmarked ? libraryWordsMap.get(item.word.toLowerCase()) : null;
                             const focusColor = wordFocusColors[item.word] || null;
                             const isAdding = addingWord === item.word;
                             let cardBadge: CardBadge | undefined;
                             if (!isBookmarked) cardBadge = { label: 'Not in library', colorClass: 'bg-neutral-50 text-neutral-500 border-neutral-100' };
                             else if (bookmarkedItem && (bookmarkedItem.quality === WordQuality.RAW || bookmarkedItem.quality === WordQuality.REFINED)) cardBadge = { label: 'Not verified', colorClass: 'bg-amber-50 text-amber-700 border-amber-100' };
                             else { const statusInfo = getStatusInfo(bookmarkedItem); if (statusInfo) cardBadge = { label: statusInfo.text, colorClass: statusInfo.classes }; }

                             return (
                                <UniversalCard
                                    key={i}
                                    onClick={() => isBookmarked && bookmarkedItem && setViewingWord(bookmarkedItem)}
                                    title={<h3 className="font-black text-lg text-neutral-900 tracking-tight leading-tight line-clamp-2">{item.word}</h3>}
                                    badge={cardBadge} focusColor={focusColor} onFocusChange={(color) => handleWordFocusChange(item.word, color)}
                                    actions={
                                        <div className="flex items-center gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); speak(item.word); }} className="p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-lg transition-colors" aria-label={`Pronounce ${item.word}`}><Volume2 size={14} /></button>
                                            <button onClick={(e) => { e.stopPropagation(); setWordMovingTarget(item); }} className="p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-lg transition-colors" title="Move to another book"><Move size={14}/></button>
                                            {isBookmarked && bookmarkedItem ? (
                                                <button onClick={(e) => { e.stopPropagation(); setViewingWord(bookmarkedItem); }} className="p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-lg transition-colors" title="View Details"><Eye size={14}/></button>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); handleAddToLibrary(item); }} disabled={isAdding} className="p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-lg transition-colors" title="Add to Library">
                                                    {isAdding ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                                                </button>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveWordFromBook(item.word); }} className="p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors" title="Remove from this book"><Trash2 size={14}/></button>
                                        </div>
                                    }
                                >
                                    <p className="text-sm text-neutral-600 leading-relaxed">{item.definition}</p>
                                </UniversalCard>
                             );
                        })}
                    </div>
                </main>
                {viewingWord && <ViewWordModal word={viewingWord} onClose={() => setViewingWord(null)} onNavigateToWord={setViewingWord} onUpdate={handleSaveWordUpdate} onEditRequest={(word) => { setViewingWord(null); setEditingWord(word); }} onGainXp={async () => 0} isViewOnly={false} />}
                {editingWord && <EditWordModal user={user} word={editingWord} onSave={handleSaveWordUpdate} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setViewingWord(word); }}/>}
                <AddWordToBookModal isOpen={isAddWordModalOpen} onClose={() => setIsAddWordModalOpen(false)} onSave={handleSaveNewWordToBook} />
                <AddFromLibraryModal isOpen={isAddFromLibraryModalOpen} onClose={() => setIsAddFromLibraryModalOpen(false)} onSave={handleSaveFromLibrary} libraryWords={allLibraryWords} wordsInBook={activeBook.words} />
                <AddFromUnitModal isOpen={isAddFromUnitModalOpen} onClose={() => setIsAddFromUnitModalOpen(false)} onSave={handleSaveFromLibrary} units={allUnits} libraryWords={allLibraryWords} wordsInBook={activeBook.words} />
                {isAutoAddModalOpen && <UniversalAiModal isOpen={isAutoAddModalOpen} onClose={() => setIsAutoAddModalOpen(false)} type="GENERATE_UNIT" title="Auto-Add Words" description="Let AI suggest new words for your book." onGeneratePrompt={handleGenerateAutoAddPrompt} onJsonReceived={handleAutoAddWords} actionLabel="Add to Book" closeOnSuccess={false} />}
                <MoveWordToBookModal 
                    isOpen={!!wordMovingTarget} 
                    onClose={() => setWordMovingTarget(null)} 
                    onConfirm={handleMoveWordToAnotherBook} 
                    books={books} 
                    currentBookId={activeBook.id} 
                    wordText={wordMovingTarget?.word || ''} 
                />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Bookmark%20Tabs.png" className="w-10 h-10 object-contain" alt="Word Books" />
                    <div>
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Word Books</h2>
                        <p className="text-neutral-500 mt-1 font-medium">Visual vocabulary collections by topic.</p>
                    </div>
                </div>
                 <button onClick={handleAddShelf} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm"><FolderPlus size={14}/> Add Shelf</button>
            </header>

            <div className="px-12 pt-10 pb-4 rounded-3xl" style={{ backgroundColor: '#4e342e', backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 1px, transparent 1px, transparent 30px)`, boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5)' }}>
                <div className="flex items-center justify-between group mb-12 relative -top-3.5" style={{ borderBottom: '3px solid rgba(0,0,0,0.4)', paddingBottom: '0.1rem', boxShadow: '0 5px 5px -3px rgba(0,0,0,0.5)' }}>
                    <button onClick={() => navigateShelf(-1)} className="p-3 bg-black/20 text-white/50 rounded-full hover:bg-black/40 hover:text-white transition-all"><ChevronLeft size={24}/></button>
                    <div className="flex items-center gap-4">
                        <div className="bg-gradient-to-b from-slate-200 to-slate-400 px-6 py-2 rounded-lg shadow-inner border-t border-slate-400/50 w-fit flex items-center gap-4"><h3 className="text-xl font-black text-neutral-900 tracking-tight">{currentShelfName}</h3></div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={handleRenameShelf} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white" title="Rename Shelf"><Pen size={14}/></button>
                            <button onClick={handleRemoveShelf} disabled={booksOnCurrentShelf.length > 0 || currentShelfName === 'General'} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/20" title={booksOnCurrentShelf.length > 0 ? "Cannot remove non-empty shelf" : "Remove Empty Shelf"}><Trash2 size={14}/></button>
                        </div>
                    </div>
                    <button onClick={() => navigateShelf(1)} className="p-3 bg-black/20 text-white/50 rounded-full hover:bg-black/40 hover:text-white transition-all"><ChevronRight size={24}/></button>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,10rem)] gap-x-8 gap-y-10 min-h-[50vh] -mt-12" style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 14rem, rgba(0,0,0,0.4) 14rem, rgba(0,0,0,0.4) 14.25rem, transparent 14.25rem, transparent 16.5rem)` }}>
                    {booksOnCurrentShelf.map(book => (
                        <WordBookCard 
                            key={book.id} 
                            book={book} 
                            onClick={() => setActiveBook(book)}
                            onMove={(e) => { e.stopPropagation(); setBookToMove(book); }}
                            onDelete={(e) => { e.stopPropagation(); setBookToDelete(book); }}
                        />
                    ))}
                    <div className="group [perspective:1000px] translate-y-0">
                        <div className="relative w-full aspect-[5/7] rounded-lg bg-neutral-800/50 border-2 border-dashed border-neutral-500/50 transition-all duration-300 group-hover:border-neutral-400 group-hover:bg-neutral-800/80 group-hover:shadow-xl flex flex-col items-stretch justify-center overflow-hidden">
                            <button onClick={() => setIsAiModalOpen(true)} className="flex-1 flex flex-col items-center justify-center p-2 text-center text-neutral-400 hover:bg-white/5 transition-colors"><Sparkles size={28} className="mb-2 text-amber-400/80"/><h3 className="font-sans text-xs font-black uppercase tracking-wider">New via AI</h3></button>
                            <div className="w-4/5 mx-auto h-px bg-neutral-50/50"></div>
                            <button onClick={handleNewEmptyBook} className="flex-1 flex flex-col items-center justify-center p-2 text-center text-neutral-400 hover:bg-white/5 transition-colors"><BookOpen size={28} className="mb-2 text-neutral-400/80"/><h3 className="font-sans text-xs font-black uppercase tracking-wider">New Empty</h3></button>
                        </div>
                    </div>
                </div>
            </div>
            {isAiModalOpen && (<UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="GENERATE_UNIT" title="Create a New Word Book" description={`Enter a topic for the "${currentShelfName}" shelf.`} onGeneratePrompt={(inputs) => getGenerateWordBookPrompt(`${currentShelfName}: ${inputs.request}`)} onJsonReceived={handleGenerateBook} actionLabel="Create" closeOnSuccess={true} />)}
            <ConfirmationModal isOpen={!!bookToDelete} title="Delete Word Book?" message={deleteBookConfirmationMessage} confirmText="Delete" isProcessing={false} onConfirm={handleDeleteBook} onClose={() => setBookToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
            <MoveBookModal isOpen={!!bookToMove} onClose={() => setBookToMove(null)} onConfirm={handleConfirmMoveBook} shelves={allShelves} currentShelf={bookToMove?.topic.split(':')[0].trim() || 'General'} bookTitle={moveBookConfirmationTitle} />
            <AddShelfModal isOpen={isAddShelfModalOpen} onClose={() => setIsAddShelfModalOpen(false)} onSave={handleConfirmAddShelf} />
            <RenameShelfModal isOpen={isRenameShelfModalOpen} onClose={() => setIsRenameShelfModalOpen(false)} onSave={handleConfirmRenameShelf} initialName={currentShelfName} />
        </div>
    );
};
