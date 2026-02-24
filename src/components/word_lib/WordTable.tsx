import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { VocabularyItem, ReviewGrade, WordFamily, PrepositionPattern, User, WordQuality, WordTypeOption, WordBook, WordBookItem, ParaphraseOption } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { getWordDetailsPrompt, getHintsPrompt, getBulkParaphrasePrompt } from '../../services/promptService';
import { WordTableUI, WordTableUIProps, DEFAULT_VISIBILITY } from './WordTable_UI';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, SourceFilter, CompositionFilter, BookFilter } from './WordTable_UI';
import { normalizeAiResponse, mergeAiResultIntoWord } from '../../utils/vocabUtils';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { stringToWordArray } from '../../utils/text';
import ConfirmationModal from '../common/ConfirmationModal';
import { Unlink, Trash2 } from 'lucide-react';
import UniversalAiModal from '../common/UniversalAiModal';
import { createNewWord } from '../../utils/srs';
import { TagTreeNode } from '../common/TagBrowser';
import * as db from '../../app/db';
import { useToast } from '../../contexts/ToastContext';

// Define interface for persisted filter settings to fix TypeScript inference errors
interface PersistedFilters {
    query?: string;
    activeFilters?: FilterType[];
    refinedFilter?: RefinedFilter;
    statusFilter?: StatusFilter;
    registerFilter?: RegisterFilter;
    sourceFilter?: SourceFilter;
    compositionFilter?: CompositionFilter;
    bookFilter?: BookFilter;
    specificBookId?: string;
    isFilterMenuOpen?: boolean;
    page?: number;
    pageSize?: number;
}

interface Props {
  user: User;
  words: VocabularyItem[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSearch: (query: string) => void;
  onFilterChange: (filters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter, source: SourceFilter, composition: CompositionFilter, book: BookFilter, specificBookId: string }) => void;
  onAddWords: (wordsInput: string, types: Set<WordTypeOption>) => Promise<void>;
  onViewWord: (word: VocabularyItem) => void; // This is for OPENING the view modal
  onEditWord: (word: VocabularyItem) => void; // This is for OPENING the edit modal
  onDelete: (word: VocabularyItem) => Promise<void>;
  onHardDelete?: (word: VocabularyItem) => Promise<void>;
  // FIX: Corrected typo from onBoldDelete to onBulkDelete
  onBulkDelete?: (ids: Set<string>) => Promise<void>;
  onBulkHardDelete?: (ids: Set<string>) => Promise<void>;
  onPractice: (ids: Set<string>) => void;
  settingsKey: string;
  context: 'library' | 'unit';
  initialFilter?: string | null;
  forceExpandAdd?: boolean;
  onExpandAddConsumed?: () => void;
  onWordRenamed?: (renames: { id: string; oldWord: string; newWord: string }[]) => void;
  showTagBrowserButton?: boolean;
  tagTree?: TagTreeNode[];
  selectedTag?: string | null;
  onSelectTag?: (tag: string | null) => void;
  onOpenWordBook?: () => void;
}

const LIBRARY_FILTERS_KEY = 'vocab_pro_library_filters_v2';

// Groups definition for exclusive logic
const GROUP_CONTENT: WordTypeOption[] = ['vocab', 'idiom', 'phrasal', 'collocation', 'phrase'];
const GROUP_ATTRIBUTE: WordTypeOption[] = ['archive'];

const WordTable: React.FC<Props> = ({ 
  user,
  words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
  onSearch, onFilterChange, onAddWords, onViewWord, onEditWord, onDelete, onHardDelete, onBulkDelete, onBulkHardDelete, onPractice,
  settingsKey, context, initialFilter, forceExpandAdd, onExpandAddConsumed, onWordRenamed,
  showTagBrowserButton, tagTree, selectedTag, onSelectTag, onOpenWordBook
}) => {
  // Load persisted filters with explicit typing to fix property access errors
  const persistedFilters = useMemo(() => getStoredJSON<PersistedFilters>(LIBRARY_FILTERS_KEY, {}), []);
  const { showToast } = useToast();

  const [query, setQuery] = useState(persistedFilters.query || '');
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(() => {
    if (Array.isArray(persistedFilters.activeFilters)) {
      return new Set(persistedFilters.activeFilters);
    }
    return new Set(['all']);
  });
  const [refinedFilter, setRefinedFilter] = useState<RefinedFilter>(persistedFilters.refinedFilter || 'all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(persistedFilters.statusFilter || 'all');
  const [registerFilter, setRegisterFilter] = useState<RegisterFilter>(persistedFilters.registerFilter || 'all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(persistedFilters.sourceFilter || 'all');
  const [compositionFilter, setCompositionFilter] = useState<CompositionFilter>(persistedFilters.compositionFilter || 'all');
  const [bookFilter, setBookFilter] = useState<BookFilter>(persistedFilters.bookFilter || 'all');
  const [specificBookId, setSpecificBookId] = useState<string>(persistedFilters.specificBookId || '');
  
  const [isAddExpanded, setIsAddExpanded] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(persistedFilters.isFilterMenuOpen || false);
  const [quickAddInput, setQuickAddInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  // Use a ref to track if this is the first mount to avoid resetting page index
  const isFirstMount = useRef(true);

  // Persistence effect
  useEffect(() => {
    setStoredJSON(LIBRARY_FILTERS_KEY, {
        query,
        activeFilters: Array.from(activeFilters),
        refinedFilter,
        statusFilter,
        registerFilter,
        sourceFilter,
        compositionFilter,
        bookFilter,
        specificBookId,
        isFilterMenuOpen,
        page,      // Save current page
        pageSize   // Save current pageSize
    });
  }, [query, activeFilters, refinedFilter, statusFilter, registerFilter, sourceFilter, compositionFilter, bookFilter, specificBookId, isFilterMenuOpen, page, pageSize]);

  // New state for Word Type selection in Quick Add
  // Default to 'vocab' selected
  const [selectedWordTypes, setSelectedWordTypes] = useState<Set<WordTypeOption>>(new Set(['vocab']));
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wordToDelete, setWordToDelete] = useState<VocabularyItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [wordToHardDelete, setWordToHardDelete] = useState<VocabularyItem | null>(null);
  const [isHardDeleting, setIsHardDeleting] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkHardDeleteModalOpen, setIsBulkHardDeleteModalOpen] = useState(false);
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isParaModalOpen, setIsParaModalOpen] = useState(false);
  const [isHintModalOpen, setIsHintModalOpen] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);
  
  // Add to Book states
  const [isAddToBookModalOpen, setIsAddToBookModalOpen] = useState(false);
  const [availableBooks, setAvailableBooks] = useState<WordBook[]>([]);

  const viewMenuRef = useRef<HTMLDivElement>(null);

  const [visibility, setVisibility] = useState(() => {
    const stored = getStoredJSON(settingsKey, null);
    if (stored) return { ...DEFAULT_VISIBILITY, ...stored };
    return DEFAULT_VISIBILITY;
  });

  useEffect(() => { setStoredJSON(settingsKey, visibility); }, [visibility, settingsKey]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) setIsViewMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (initialFilter) {
      const refinedFilterValues: RefinedFilter[] = ['raw', 'refined', 'verified', 'failed', 'not_refined'];
      if (refinedFilterValues.includes(initialFilter as RefinedFilter)) {
        // It's a quality filter. Set the refinedFilter state and reset the type filter.
        setRefinedFilter(initialFilter as RefinedFilter);
        setActiveFilters(new Set(['all']));
      } else {
        // It's a type filter (idiom, vocab, etc.). Set the type filter and reset the quality filter.
        setActiveFilters(new Set([initialFilter as FilterType]));
        setRefinedFilter('all');
      }
      setIsFilterMenuOpen(true);
    }
  }, [initialFilter]);

  useEffect(() => {
    if (forceExpandAdd) {
      setIsAddExpanded(true);
      onExpandAddConsumed?.();
    }
  }, [forceExpandAdd]);

  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
      onFilterChange({ types: activeFilters, refined: refinedFilter, status: statusFilter, register: registerFilter, source: sourceFilter, composition: compositionFilter, book: bookFilter, specificBookId });
      
      // If it's the first mount, do NOT reset the page to 0. 
      // Allow WordList to initialize it from storage.
      if (isFirstMount.current) {
          isFirstMount.current = false;
      } else {
          onPageChange(0);
          setSelectedIds(new Set());
      }
  }, [activeFilters, refinedFilter, statusFilter, registerFilter, sourceFilter, compositionFilter, bookFilter, specificBookId]);

  useEffect(() => { if (notification) { const t = setTimeout(() => setNotification(null), 4000); return () => clearTimeout(t); } }, [notification]);

  const handleToggleFilter = (type: FilterType) => {
      setActiveFilters(prev => {
          const next = new Set(prev);
          if (type === 'all') {
              return new Set(['all']);
          }
          next.delete('all');
          
          if (next.has(type)) {
              next.delete(type);
          } else {
              next.add(type);
          }

          if (next.size === 0) {
              return new Set(['all']);
          }
          return next;
      });
  };

  const handleTypeToggle = (type: WordTypeOption) => {
      setSelectedWordTypes(prev => {
          const next = new Set<WordTypeOption>(prev);
          
          const removeGroupFromSet = (set: Set<WordTypeOption>, group: WordTypeOption[]) => {
              group.forEach(g => set.delete(g));
          };

          if (GROUP_CONTENT.includes(type)) {
              if (next.has(type)) {
                  next.delete(type);
              } else {
                  removeGroupFromSet(next, GROUP_CONTENT);
                  next.add(type);
              }
          } else if (GROUP_ATTRIBUTE.includes(type)) {
               if (next.has(type)) {
                   next.delete(type);
               } else {
                   removeGroupFromSet(next, GROUP_ATTRIBUTE);
                   next.add(type);
               }
          }
          return next;
      });
  };

  const handleBatchAddSubmit = async () => {
    if (!quickAddInput.trim()) return;
    setIsAdding(true);
    try {
        await onAddWords(quickAddInput, selectedWordTypes);
        setNotification({ type: 'success', message: 'Words added successfully.' });
        setQuickAddInput('');
        setIsAddExpanded(false);
    } catch (e) { setNotification({ type: 'error', message: 'Failed to add words.' }); } 
    finally { setIsAdding(false); }
  };
  
  const selectedWordsToRefine = useMemo(() => words.filter(w => selectedIds.has(w.id)), [words, selectedIds]);

  const selectedRawWords = useMemo(
    () => words.filter(w => selectedIds.has(w.id) && w.quality === WordQuality.RAW),
    [words, selectedIds]
  );
  
  const selectedWordsMissingHints = useMemo(() =>
    words.filter(w =>
      selectedIds.has(w.id) &&
      (
          (w.collocationsArray && w.collocationsArray.some(c => !c.d)) ||
          (w.idiomsList && w.idiomsList.some(i => !i.d))
      )
    ),
    [words, selectedIds]
  );

  const handleConfirmBulkDelete = async () => {
    // FIX: Prop renamed to onBulkDelete
    if (!onBulkDelete || selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
        await onBulkDelete(selectedIds);
        setNotification({ type: 'success', message: `${context === 'unit' ? 'Unlinked' : 'Deleted'} ${selectedIds.size} item(s).` });
        setSelectedIds(new Set());
    } catch (e) {
        setNotification({ type: 'error', message: 'Failed to remove items.' });
    } finally {
        setIsDeleting(false);
        setIsBulkDeleteModalOpen(false);
    }
  };

  const handleConfirmBulkHardDelete = async () => {
    if (!onBulkHardDelete || selectedRawWords.length === 0) return;
    setIsHardDeleting(true);
    try {
        const idsToDelete = new Set(selectedRawWords.map(w => w.id));
        await onBulkHardDelete(idsToDelete);
        setNotification({ type: 'success', message: `Permanently deleted ${idsToDelete.size} raw item(s).` });
        setSelectedIds(prev => {
            const next = new Set(prev);
            idsToDelete.forEach(id => next.delete(id));
            return next;
        });
    } catch (e) {
        setNotification({ type: 'error', message: 'Failed to delete items.' });
    } finally {
        setIsHardDeleting(false);
        setIsBulkHardDeleteModalOpen(false);
    }
  };

  const handleBulkVerify = async (ids: Set<string>) => {
    const allWordsFromStore = dataStore.getAllWords();
    const itemsToUpdate = allWordsFromStore
        .filter(w => ids.has(w.id))
        .map(w => ({ ...w, quality: WordQuality.VERIFIED, updatedAt: Date.now() }));

    if (itemsToUpdate.length > 0) {
        await dataStore.bulkSaveWords(itemsToUpdate);
        setNotification({ type: 'success', message: `Marked ${itemsToUpdate.length} item(s) as Verified.` });
        setSelectedIds(new Set());
    }
  };

  const handleAddToPronunciation = () => {
      const selectedItems = words.filter(w => selectedIds.has(w.id));
      if (selectedItems.length === 0) return;

      const currentQueue = getStoredJSON<any[]>('vocab_pro_mimic_practice_queue', []);
      const existingTexts = new Set(currentQueue.map(i => i.text.toLowerCase().trim()));
      
      let addedCount = 0;
      const newItems = [];

      selectedItems.forEach(item => {
          const text = item.word;
          if (!existingTexts.has(text.toLowerCase().trim())) {
              newItems.push({
                  id: `pronun-${Date.now()}-${Math.random()}`,
                  text: text,
                  sourceWord: item.word,
                  type: 'Library Word'
              });
              existingTexts.add(text.toLowerCase().trim());
              addedCount++;
          }
      });

      if (addedCount > 0) {
          const updatedQueue = [...currentQueue, ...newItems];
          setStoredJSON('vocab_pro_mimic_practice_queue', updatedQueue);
          setNotification({ type: 'success', message: `Added ${addedCount} words to Pronunciation.` });
          setSelectedIds(new Set());
      } else {
          setNotification({ type: 'info', message: 'Selected words are already in Pronunciation queue.' });
      }
  };

  const handleAiRefinementResult = async (results: any[]) => {
    if (!Array.isArray(results)) throw new Error('Response must be an array.');

    const aiMap = new Map<string, any[]>();
    results.forEach(rawResult => {
        const key = (rawResult.og || rawResult.original || rawResult.hw || rawResult.headword || '').toLowerCase();
        if (key) {
            if (!aiMap.has(key)) aiMap.set(key, []);
            aiMap.get(key)?.push(rawResult);
        }
    });

    const originalWordsMap = new Map<string, VocabularyItem>(selectedWordsToRefine.map(w => [w.word.toLowerCase(), w]));
    const itemsToSave: VocabularyItem[] = [];
    const itemsToDeleteIds: string[] = [];
    const renames: { id: string; oldWord: string; newWord: string }[] = [];

    for (const [originalKey, originalItem] of originalWordsMap) {
        const candidates = aiMap.get(originalKey);
        if (!candidates || candidates.length === 0) continue;
        
        const rawAiResult = candidates[0];
        const tempNormalized = normalizeAiResponse(rawAiResult);
        const suggestedHeadword = (tempNormalized.headword || tempNormalized.word || '').trim();

        if (suggestedHeadword) {
            const originalWordCount = originalItem.word.trim().split(/\s+/).length;
            const newWordCount = suggestedHeadword.trim().split(/\s+/).length;

            if (originalWordCount !== newWordCount) {
                const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                if (existingHeadwordItem) {
                    const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, rawAiResult);
                    itemsToSave.push(mergedItem);
                } else {
                    // Fix: createNewWord expects 12 arguments if source is refined. Added 'false' for isPassive.
                    const newItem = createNewWord(suggestedHeadword, '', '', '', '', [], false, false, false, false, false, 'refine');
                    newItem.userId = originalItem.userId;
                    const finalNewItem = mergeAiResultIntoWord(newItem, rawAiResult);
                    itemsToSave.push(finalNewItem);
                }
            } else {
                const isRenaming = suggestedHeadword.toLowerCase() !== originalItem.word.toLowerCase();
                if (isRenaming) {
                    const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                    if (existingHeadwordItem && existingHeadwordItem.id !== originalItem.id) {
                        const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, rawAiResult);
                        itemsToSave.push(mergedItem);
                        itemsToDeleteIds.push(originalItem.id);
                        renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
                    } else {
                        let updatedItem = mergeAiResultIntoWord(originalItem, rawAiResult);
                        updatedItem.word = suggestedHeadword;
                        itemsToSave.push(updatedItem);
                        renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
                    }
                } else {
                    itemsToSave.push(mergeAiResultIntoWord(originalItem, rawAiResult));
                }
            }
        } else {
            itemsToSave.push(mergeAiResultIntoWord(originalItem, rawAiResult));
        }
    }

    if (itemsToDeleteIds.length > 0) await dataStore.bulkDeleteWords(itemsToDeleteIds);
    if (itemsToSave.length > 0) {
        await dataStore.bulkSaveWords(itemsToSave);
        if (renames.length > 0 && onWordRenamed) onWordRenamed(renames);
        let msg = `Refined ${itemsToSave.length} words.`;
        if (itemsToDeleteIds.length > 0) msg += ` Merged ${itemsToDeleteIds.length} duplicates.`;
        else if (renames.length > 0) msg += ` Renamed ${renames.length} to base forms.`;
        setNotification({ type: 'success', message: msg });
        setSelectedIds(new Set());
    }
    setIsAiModalOpen(false);
  };

  const handleParaAiResult = async (results: any[]) => {
    if (!Array.isArray(results)) throw new Error('Response must be an array.');
    const originalWordsMap = new Map<string, VocabularyItem>(selectedWordsToRefine.map(w => [w.word.toLowerCase(), w]));
    const itemsToSave: VocabularyItem[] = [];
    for (const result of results) {
        const originalWord = originalWordsMap.get(result.og?.toLowerCase());
        if (!originalWord) continue;
        const newParaphrases: ParaphraseOption[] = (result.para || []).map((p: any) => ({ word: p.w, tone: p.t, context: p.c, isIgnored: false }));
        itemsToSave.push({ ...originalWord, paraphrases: newParaphrases, updatedAt: Date.now() });
    }
    if (itemsToSave.length > 0) {
        await dataStore.bulkSaveWords(itemsToSave);
        setNotification({ type: 'success', message: `Refined paraphrases for ${itemsToSave.length} words.` });
        setSelectedIds(new Set());
    }
    setIsParaModalOpen(false);
  };

  const handleGenerateRefinePrompt = (inputs: { words: string }) => getWordDetailsPrompt(stringToWordArray(inputs.words), user.nativeLanguage || 'Vietnamese');
  const handleGenerateParaPrompt = (inputs: { words: string }) => getBulkParaphrasePrompt(selectedWordsToRefine);
  const handleGenerateHintPrompt = (inputs: any) => getHintsPrompt(selectedWordsMissingHints);

  const handleHintAiResult = async (results: any[]) => {
    if (!Array.isArray(results)) {
        setNotification({ type: 'error', message: 'Invalid response from AI.' });
        return;
    }

    const wordsToUpdate: VocabularyItem[] = [];
    const originalWordsMap = new Map<string, VocabularyItem>(selectedWordsMissingHints.map(w => [w.word.toLowerCase(), w]));

    for (const result of results) {
        const originalWord = originalWordsMap.get(result.og?.toLowerCase());
        if (!originalWord) continue;

        let changed = false;
        const updatedWord = { ...originalWord };

        // Process collocations
        if (result.col && originalWord.collocationsArray) {
            const newCollocsMap = new Map(result.col.map((c: any) => [c.text.toLowerCase(), c.d]));
            updatedWord.collocationsArray = (updatedWord.collocationsArray || []).map(existingColloc => {
                if (!existingColloc.d) {
                    const newHint = newCollocsMap.get(existingColloc.text.toLowerCase());
                    if (newHint) {
                        changed = true;
                        return { ...existingColloc, d: String(newHint) };
                    }
                }
                return existingColloc;
            });
        }

        // Process idioms
        if (result.idm && originalWord.idiomsList) {
            const newIdiomsMap = new Map(result.idm.map((i: any) => [i.text.toLowerCase(), i.d]));
            updatedWord.idiomsList = (updatedWord.idiomsList || []).map(existingIdiom => {
                if (!existingIdiom.d) {
                    const newHint = newIdiomsMap.get(existingIdiom.text.toLowerCase());
                    if (newHint) {
                        changed = true;
                        return { ...existingIdiom, d: String(newHint) };
                    }
                }
                return existingIdiom;
            });
        }

        if (changed) {
            updatedWord.updatedAt = Date.now();
            wordsToUpdate.push(updatedWord);
        }
    }

    if (wordsToUpdate.length > 0) {
        await dataStore.bulkSaveWords(wordsToUpdate);
        setNotification({ type: 'success', message: `Added hints to ${wordsToUpdate.length} word(s).` });
        setSelectedIds(new Set());
    } else {
        setNotification({ type: 'info', message: 'No new hints were added.' });
    }
    setIsHintModalOpen(false);
  };
  
  const handleOpenAddToBookModal = async () => {
    const books = await db.getWordBooksByUserId(user.id);
    setAvailableBooks(books);
    setIsAddToBookModalOpen(true);
  };

  const handleConfirmAddToBook = async (bookId: string) => {
    const targetBook = availableBooks.find(b => b.id === bookId);
    if (!targetBook) return;

    const wordsToAdd = words.filter(w => selectedIds.has(w.id));
    const existingBookWords = new Set(targetBook.words.map(w => w.word.toLowerCase()));
    
    const newBookItems: WordBookItem[] = wordsToAdd
        .filter(w => !existingBookWords.has(w.word.toLowerCase()))
        .map(w => ({ word: w.word, definition: w.meaningVi }));
        
    if (newBookItems.length === 0) {
        setNotification({ type: 'info', message: "All selected words are already in this book." });
        setIsAddToBookModalOpen(false);
        return;
    }

    const updatedWords = [...targetBook.words, ...newBookItems].sort((a,b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
    const updatedBook = { ...targetBook, words: updatedWords, updatedAt: Date.now() };
    
    await dataStore.saveWordBook(updatedBook);
    // Notify store to update book word index for filters
    await dataStore.notifyWordBookChange(user.id);

    setNotification({ type: 'success', message: `Added ${newBookItems.length} words to "${targetBook.topic.split(':').pop()?.trim()}".` });
    setIsAddToBookModalOpen(false);
    setSelectedIds(new Set());
  };

  // Pre-fetch books list for the specific book filter dropdown
  useEffect(() => {
    const fetchBooks = async () => {
        const allBooks = await db.getWordBooksByUserId(user.id);
        setAvailableBooks(allBooks);
    };
    fetchBooks();
  }, [user.id]);

  // Single-word delete handler
  const handleConfirmDelete = async () => {
    if (!onDelete || !wordToDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(wordToDelete);
      setNotification({ type: 'success', message: `Deleted "${wordToDelete.word}".` });
      setWordToDelete(null);
    } catch (e) {
      setNotification({ type: 'error', message: 'Failed to delete word.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const uiProps: Omit<WordTableUIProps, 'viewingWord' | 'setViewingWord' | 'editingWord' | 'setEditingWord'> = {
    words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
    onPractice, context, onDelete,
    onViewWord, onEditWord,
    query, setQuery, activeFilters, refinedFilter, statusFilter, registerFilter, sourceFilter, compositionFilter, bookFilter, specificBookId, onSpecificBookChange: setSpecificBookId, isAddExpanded,
    isFilterMenuOpen, quickAddInput, setQuickAddInput, isAdding, isViewMenuOpen,
    selectedIds, setSelectedIds, 
    wordToDelete, setWordToDelete, isDeleting, setIsDeleting,
    wordToHardDelete, setWordToHardDelete, isHardDeleting, setIsHardDeleting, onHardDelete,
    isAiModalOpen, setIsAiModalOpen, notification, viewMenuRef, visibility,
    setVisibility, handleToggleFilter, handleBatchAddSubmit,
    // FIX: Renamed typo onBoldDelete to onBulkDelete
    onOpenBulkDeleteModal: onBulkDelete ? () => setIsBulkDeleteModalOpen(true) : undefined,
    onBulkVerify: handleBulkVerify,
    onOpenBulkHardDeleteModal: onBulkHardDelete && selectedRawWords.length > 0 ? () => setIsBulkHardDeleteModalOpen(true) : undefined,
    selectedWordsToRefine, handleGenerateRefinePrompt, handleAiRefinementResult,
    selectedRawWordsCount: selectedRawWords.length,
    selectedWordsMissingHintsCount: selectedWordsMissingHints.length,
    onOpenHintModal: () => setIsHintModalOpen(true),
    setStatusFilter, setRefinedFilter, setRegisterFilter, setSourceFilter, setCompositionFilter, setBookFilter, setIsViewMenuOpen, setIsFilterMenuOpen,
    setIsAddExpanded,
    settingsKey,
    showTagBrowserButton,
    tagTree,
    selectedTag,
    onSelectTag,
    selectedTypes: selectedWordTypes,
    toggleType: handleTypeToggle,
    onOpenWordBook,
    onOpenAddToBookModal: handleOpenAddToBookModal,
    isAddToBookModalOpen,
    setIsAddToBookModalOpen,
    wordBooks: availableBooks,
    onConfirmAddToBook: handleConfirmAddToBook,
    // New prop for Pronunciation Queue
    onAddToPronunciation: handleAddToPronunciation,
    onOpenParaModal: () => setIsParaModalOpen(true)
  };

  return (
    <>
      <WordTableUI {...uiProps} />
      {/* Single-word delete confirmation modal */}
      <ConfirmationModal
        isOpen={!!wordToDelete}
        title={context === 'unit' ? `Unlink Word?` : `Delete Word?`}
        message={context === 'unit' ? `Remove "${wordToDelete?.word}" from this unit? It will remain in your library.` : `Permanently delete "${wordToDelete?.word}"? This action cannot be undone.`}
        confirmText={context === 'unit' ? 'UNLINK' : 'DELETE'}
        isProcessing={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setWordToDelete(null)}
        confirmButtonClass={context === 'unit' ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200" : "bg-red-600 text-white hover:bg-red-700 shadow-red-200"}
        icon={context === 'unit' ? <Unlink size={40} className="text-orange-50"/> : <Trash2 size={40} className="text-red-500"/>}
      />
      {/* Bulk delete modal */}
      {onBulkDelete && <ConfirmationModal 
        isOpen={isBulkDeleteModalOpen}
        title={context === 'unit' ? `Unlink ${selectedIds.size} Words?` : `Delete ${selectedIds.size} Words?`}
        message={context === 'unit' ? `Remove ${selectedIds.size} selected words from this unit? They will remain in your library.` : `Permanently delete ${selectedIds.size} selected words? This action cannot be undone.`}
        confirmText={context === 'unit' ? `UNLINK ${selectedIds.size}` : `DELETE ${selectedIds.size}`}
        isProcessing={isDeleting}
        onConfirm={handleConfirmBulkDelete}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        confirmButtonClass={context === 'unit' ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200" : "bg-red-600 text-white hover:bg-red-700 shadow-red-200"}
        icon={context === 'unit' ? <Unlink size={40} className="text-orange-50"/> : <Trash2 size={40} className="text-red-500"/>}
      />}
      {/* Bulk hard delete modal */}
      {onBulkHardDelete && (
        <ConfirmationModal 
          isOpen={isBulkHardDeleteModalOpen}
          title={`Delete ${selectedRawWords.length} Raw Words?`}
          message={`Permanently delete ${selectedRawWords.length} selected RAW words from your entire library? This action cannot be undone.`}
          confirmText={`DELETE ${selectedRawWords.length} RAW WORDS`}
          isProcessing={isHardDeleting}
          onConfirm={handleConfirmBulkHardDelete}
          onClose={() => setIsBulkHardDeleteModalOpen(false)}
          confirmButtonClass={"bg-red-600 text-white hover:bg-red-700 shadow-red-200"}
          icon={<Trash2 size={40} className="text-red-500"/>}
        />
      )}
      {/* AI hint modal */}
       {isHintModalOpen && selectedWordsMissingHints.length > 0 && (
        <UniversalAiModal 
            isOpen={isHintModalOpen} 
            onClose={() => setIsHintModalOpen(false)} 
            type="REFINE_WORDS"
            title="Refine Hints"
            description={`Generating hints for ${selectedWordsMissingHints.length} selected word(s).`}
            initialData={{}}
            user={user}
            onGeneratePrompt={handleGenerateHintPrompt}
            onJsonReceived={handleHintAiResult}
            actionLabel="Apply Hints"
            hidePrimaryInput={true}
        />
      )}
      {/* AI refine modal */}
      {isAiModalOpen && selectedWordsToRefine.length > 0 && (
        <UniversalAiModal 
            isOpen={isAiModalOpen} 
            onClose={() => setIsAiModalOpen(false)} 
            type="REFINE_WORDS" 
            title="Refine Selected Words"
            description={`Generating details for ${selectedWordsToRefine.length} selected word(s).`}
            initialData={{ words: selectedWordsToRefine.map(w => w.word).join('; ') }} 
            user={user}
            onGeneratePrompt={handleGenerateRefinePrompt} 
            onJsonReceived={handleAiRefinementResult} 
            actionLabel="Apply to All"
        />
      )}
      {/* AI paraphrase modal */}
      {isParaModalOpen && selectedWordsToRefine.length > 0 && (
        <UniversalAiModal 
            isOpen={isParaModalOpen} 
            onClose={() => setIsParaModalOpen(false)} 
            type="REFINE_WORDS" 
            title="Refine Paraphrases"
            description={`Generating fresh paraphrases for ${selectedWordsToRefine.length} selected word(s). This will OVERWRITE existing data.`}
            initialData={{ words: selectedWordsToRefine.map(w => w.word).join('; ') }} 
            user={user}
            onGeneratePrompt={handleGenerateParaPrompt} 
            onJsonReceived={handleParaAiResult} 
            actionLabel="Overwrite Paraphrases"
        />
      )}
    </>
  );
};

export default WordTable;