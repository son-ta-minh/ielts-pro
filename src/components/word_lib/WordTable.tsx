import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { VocabularyItem, ReviewGrade, WordFamily, PrepositionPattern, User, WordQuality, WordTypeOption, WordBook, WordBookItem, ParaphraseOption, LearnedStatus } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { getWordDetailsPrompt, getHintsPrompt, getBulkParaphrasePrompt } from '../../services/promptService';
import { WordTableUI, WordTableUIProps, DEFAULT_VISIBILITY } from './WordTable_UI';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, CompositionFilter, BookFilter } from './WordTable_UI';
import { normalizeAiResponse, mergeAiResultIntoWord } from '../../utils/vocabUtils';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { stringToWordArray } from '../../utils/text';
import ConfirmationModal from '../common/ConfirmationModal';
import { Unlink, Trash2 } from 'lucide-react';
import UniversalAiModal from '../common/UniversalAiModal';
import { createNewWord } from '../../utils/srs';
import { TagTreeNode } from '../common/TagBrowser';
import * as db from '../../app/db';
import { runWordRefineWithRetry, WordRefineProgressSnapshot, WordRefineSetup } from '../../services/wordRefineApi';

const MAX_API_REFINE_HISTORY_ITEMS = 120;

const compactRefineSnapshotForHistory = (snapshot: WordRefineProgressSnapshot): WordRefineProgressSnapshot => ({
  ...snapshot,
  rawText: snapshot.rawText
    ? `${snapshot.rawText.slice(0, 800)}${snapshot.rawText.length > 800 ? '\n...[truncated]' : ''}`
    : undefined
});

// Define interface for persisted filter settings to fix TypeScript inference errors
interface PersistedFilters {
    query?: string;
    activeFilters?: FilterType[];
    refinedFilter?: RefinedFilter;
    statusFilter?: StatusFilter;
    registerFilter?: RegisterFilter;
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
  onFilterChange: (filters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter, composition: CompositionFilter, book: BookFilter, specificBookId: string }) => void;
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
  onRenameGroup?: (path: string, nextName: string) => Promise<void>;
  onDeleteGroup?: (path: string) => Promise<void>;
  onOpenWordBook?: () => void;
}

const LIBRARY_FILTERS_KEY = 'vocab_pro_library_filters_v2';

// Groups definition for exclusive logic
const GROUP_CONTENT: WordTypeOption[] = ['vocab', 'idiom', 'phrasal', 'collocation', 'phrase'];
const GROUP_ATTRIBUTE: WordTypeOption[] = ['archive'];
const normalizeGroupLabel = (value: string): string => value.trim();
const dedupeGroups = (groups: string[]): string[] => Array.from(new Set(groups.map(normalizeGroupLabel).filter(Boolean)));

const WordTable: React.FC<Props> = ({ 
  user,
  words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
  onSearch, onFilterChange, onAddWords, onViewWord, onEditWord, onDelete, onHardDelete, onBulkDelete, onBulkHardDelete, onPractice,
  settingsKey, context, initialFilter, forceExpandAdd, onExpandAddConsumed, onWordRenamed,
  showTagBrowserButton, tagTree, selectedTag, onSelectTag, onRenameGroup, onDeleteGroup, onOpenWordBook
}) => {
  const filterStorageKey = useMemo(
    () => `${LIBRARY_FILTERS_KEY}_${context}_${settingsKey}`,
    [context, settingsKey]
  );

  // Load persisted filters with explicit typing to fix property access errors
  const persistedFilters = useMemo(() => getStoredJSON<PersistedFilters>(filterStorageKey, {}), [filterStorageKey]);

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
    setStoredJSON(filterStorageKey, {
        query,
        activeFilters: Array.from(activeFilters),
        refinedFilter,
        statusFilter,
        registerFilter,
        compositionFilter,
        bookFilter,
        specificBookId,
        isFilterMenuOpen,
        page,      // Save current page
        pageSize   // Save current pageSize
    });
  }, [filterStorageKey, query, activeFilters, refinedFilter, statusFilter, registerFilter, compositionFilter, bookFilter, specificBookId, isFilterMenuOpen, page, pageSize]);

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
  const [isApiRefining, setIsApiRefining] = useState(false);
  const [apiRefineProgress, setApiRefineProgress] = useState<WordRefineProgressSnapshot | null>(null);
  const [apiRefineHistory, setApiRefineHistory] = useState<WordRefineProgressSnapshot[]>([]);
  const [apiRefineFlushedCount, setApiRefineFlushedCount] = useState(0);
  const [apiRefineTotalWords, setApiRefineTotalWords] = useState(0);
  const apiRefineFlushedCountRef = useRef(0);
  const [isApiRefineLogOpen, setIsApiRefineLogOpen] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);
  
  // Add to Book states
  const [isAddToBookModalOpen, setIsAddToBookModalOpen] = useState(false);
  const [availableBooks, setAvailableBooks] = useState<WordBook[]>([]);

  const viewMenuRef = useRef<HTMLDivElement>(null);
  const apiRefineAbortRef = useRef<AbortController | null>(null);

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
    if (!initialFilter) return;

    const refinedFilterValues: RefinedFilter[] = [
        'raw',
        'refined',
        'verified',
        'failed',
        'not_refined'
    ];

    const statusValues: StatusFilter[] = [
        'new',
        'forgot',
        'hard',
        'easy',
        'learned'
    ];

    if (refinedFilterValues.includes(initialFilter as RefinedFilter)) {
        // Quality filter
        setRefinedFilter(initialFilter as RefinedFilter);
        setActiveFilters(new Set(['all']));
        setStatusFilter('all');
    } 
    else if (statusValues.includes(initialFilter as StatusFilter)) {
        // Learned status filter
        setStatusFilter(initialFilter as StatusFilter);
        setActiveFilters(new Set(['all']));
        setRefinedFilter('all');
    } 
    else {
        // Type filter (idiom, vocab, etc.)
        setActiveFilters(new Set([initialFilter as FilterType]));
        setRefinedFilter('all');
        setStatusFilter('all');
    }

    setIsFilterMenuOpen(true);
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
      onFilterChange({ types: activeFilters, refined: refinedFilter, status: statusFilter, register: registerFilter, composition: compositionFilter, book: bookFilter, specificBookId });
      
      // If it's the first mount, do NOT reset the page to 0. 
      // Allow WordList to initialize it from storage.
      if (isFirstMount.current) {
          isFirstMount.current = false;
      } else {
          onPageChange(0);
          setSelectedIds(new Set());
      }
  }, [activeFilters, refinedFilter, statusFilter, registerFilter, compositionFilter, bookFilter, specificBookId]);

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
          } else if (type === 'focus') {
              if (next.has(type)) next.delete(type);
              else next.add(type);
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
  const availableGroups = useMemo(() => {
    const allWords = dataStore.getAllWords().filter(word => word.userId === user.id);
    return Array.from(
      new Set(
        allWords.flatMap(word => (word.groups || []).map(normalizeGroupLabel).filter(Boolean))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [user.id, words]);

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

  const handleSetSelectedVocabularyType = async (type: Exclude<WordTypeOption, 'archive' | 'focus' | 'duplicate'>) => {
    if (selectedIds.size === 0) return;

    const itemsToUpdate = dataStore.getAllWords()
      .filter(word => selectedIds.has(word.id))
      .map(word => ({
        ...word,
        isIdiom: type === 'idiom',
        isPhrasalVerb: type === 'phrasal',
        isCollocation: type === 'collocation',
        isStandardPhrase: type === 'phrase',
        updatedAt: Date.now()
      }));

    if (itemsToUpdate.length === 0) return;

    await dataStore.bulkSaveWords(itemsToUpdate);
    setNotification({ type: 'success', message: `Updated vocabulary type for ${itemsToUpdate.length} word(s).` });
  };

  const handleSetSelectedArchive = async (value: boolean) => {
    if (selectedIds.size === 0) return;

    const itemsToUpdate = dataStore.getAllWords()
      .filter(word => selectedIds.has(word.id))
      .map(word => ({
        ...word,
        isPassive: value,
        updatedAt: Date.now()
      }));

    if (itemsToUpdate.length === 0) return;

    await dataStore.bulkSaveWords(itemsToUpdate);
    setNotification({ type: 'success', message: `${value ? 'Archived' : 'Unarchived'} ${itemsToUpdate.length} word(s).` });
  };

  const handleSetSelectedFocus = async (value: boolean) => {
    if (selectedIds.size === 0) return;

    const itemsToUpdate = dataStore.getAllWords()
      .filter(word => selectedIds.has(word.id))
      .map(word => ({
        ...word,
        isFocus: value,
        updatedAt: Date.now()
      }));

    if (itemsToUpdate.length === 0) return;

    await dataStore.bulkSaveWords(itemsToUpdate);
    setNotification({ type: 'success', message: `${value ? 'Focused' : 'Unfocused'} ${itemsToUpdate.length} word(s).` });
  };

  const handleSetSelectedQuality = async (quality: WordQuality) => {
    if (selectedIds.size === 0) return;

    const itemsToUpdate = dataStore.getAllWords()
      .filter(word => selectedIds.has(word.id))
      .map(word => ({
        ...word,
        quality,
        updatedAt: Date.now()
      }));

    if (itemsToUpdate.length === 0) return;

    await dataStore.bulkSaveWords(itemsToUpdate);
    setNotification({ type: 'success', message: `Set quality status to ${quality.toLowerCase()} for ${itemsToUpdate.length} word(s).` });
  };

  const handleSetSelectedLearnedStatus = async (learnedStatus: LearnedStatus) => {
    if (selectedIds.size === 0) return;

    const itemsToUpdate = dataStore.getAllWords()
      .filter(word => selectedIds.has(word.id))
      .map(word => ({
        ...word,
        learnedStatus,
        updatedAt: Date.now()
      }));

    if (itemsToUpdate.length === 0) return;

    await dataStore.bulkSaveWords(itemsToUpdate);
    setNotification({ type: 'success', message: `Set learned status to ${learnedStatus.toLowerCase()} for ${itemsToUpdate.length} word(s).` });
  };

  const handleAddSelectedGroup = async (group: string) => {
    const normalizedGroup = normalizeGroupLabel(group);
    if (!normalizedGroup || selectedIds.size === 0) return;

    const itemsToUpdate = dataStore.getAllWords()
      .filter(word => selectedIds.has(word.id))
      .map(word => ({
        ...word,
        groups: dedupeGroups([...(word.groups || []), normalizedGroup]),
        updatedAt: Date.now()
      }));

    if (itemsToUpdate.length === 0) return;

    await dataStore.bulkSaveWords(itemsToUpdate);
    setNotification({ type: 'success', message: `Added group "${normalizedGroup}" to ${itemsToUpdate.length} word(s).` });
  };

  const handleCopySelectedHeadwords = async () => {
    const selectedWords = words.filter(word => selectedIds.has(word.id));
    if (selectedWords.length === 0) return;

    const text = selectedWords.map(word => word.word).join('\n');
    await navigator.clipboard.writeText(text);
    setNotification({ type: 'success', message: `Copied ${selectedWords.length} headword(s).` });
  };

  const applyAiRefinementResults = async (
    results: any[],
    targetWords: VocabularyItem[],
    options?: { clearSelection?: boolean; closeModal?: boolean; successMessage?: string }
  ) => {
    if (!Array.isArray(results)) throw new Error('Response must be an array.');

    const aiMap = new Map<string, any[]>();
    results.forEach(rawResult => {
        const key = (rawResult.og || rawResult.original || rawResult.hw || rawResult.headword || '').toLowerCase();
        if (key) {
            if (!aiMap.has(key)) aiMap.set(key, []);
            aiMap.get(key)?.push(rawResult);
        }
    });

    const originalWordsMap = new Map<string, VocabularyItem>(targetWords.map(w => [w.word.toLowerCase(), w]));
    const itemsToSave: VocabularyItem[] = [];
    const itemsToDeleteIds: string[] = [];
    const renames: { id: string; oldWord: string; newWord: string }[] = [];

    for (const [originalKey, originalItem] of originalWordsMap) {
        const candidates = aiMap.get(originalKey);
        if (!candidates || candidates.length === 0) continue;
        
        const rawAiResult = candidates[0];
        const tempNormalized = normalizeAiResponse(rawAiResult);
        const suggestedHeadword = String(
            rawAiResult?.hw ||
            rawAiResult?.headword ||
            tempNormalized?.headword ||
            tempNormalized?.word ||
            ''
        ).trim();

        if (suggestedHeadword) {
            const originalWordCount = originalItem.word.trim().split(/\s+/).length;
            const newWordCount = suggestedHeadword.trim().split(/\s+/).length;

            if (originalWordCount !== newWordCount) {
                const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                if (existingHeadwordItem) {
                    const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, rawAiResult);
                    itemsToSave.push(mergedItem);
                } else {
                    const newItem = await createNewWord(suggestedHeadword, '', '', '', '', [], false, false, false, false, false);
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
        let msg = options?.successMessage || `Refined ${itemsToSave.length} words.`;
        if (itemsToDeleteIds.length > 0) msg += ` Merged ${itemsToDeleteIds.length} duplicates.`;
        else if (renames.length > 0) msg += ` Renamed ${renames.length} to base forms.`;
        setNotification({ type: 'success', message: msg });
        if (options?.clearSelection !== false) {
          setSelectedIds(new Set());
        }
    }
    if (options?.closeModal !== false) {
      setIsAiModalOpen(false);
    }
  };

  const handleAiRefinementResult = async (results: any[]) => {
    await applyAiRefinementResults(results, selectedWordsToRefine, {
      clearSelection: true,
      closeModal: true
    });
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

  const handleApiRefineSelected = async (setup?: Partial<WordRefineSetup>) => {
    if (selectedWordsToRefine.length === 0 || isApiRefining) return;
    const totalWordsForRun = selectedWordsToRefine.length;

    const controller = new AbortController();
    apiRefineAbortRef.current = controller;
    setIsApiRefining(true);
    setApiRefineProgress(null);
    setApiRefineHistory([]);
    setIsApiRefineLogOpen(false);
    setApiRefineFlushedCount(0);
    setApiRefineTotalWords(totalWordsForRun);
    apiRefineFlushedCountRef.current = 0;
    setNotification({ type: 'info', message: `Refining ${totalWordsForRun} word(s) by API...` });

    try {
      const { results, attempts, finalIssues } = await runWordRefineWithRetry(
        selectedWordsToRefine,
        user.nativeLanguage || 'Vietnamese',
        {
          setup,
          signal: controller.signal,
          onProgress: (snapshot) => {
            setApiRefineProgress(snapshot);
            setApiRefineHistory((current) => {
              const next = [...current, compactRefineSnapshotForHistory(snapshot)];
              return next.length > MAX_API_REFINE_HISTORY_ITEMS
                ? next.slice(next.length - MAX_API_REFINE_HISTORY_ITEMS)
                : next;
            });
          },
          onWordValidated: async ({ word, results: wordResults, partial, issues }) => {
            await applyAiRefinementResults(wordResults, [word], {
              clearSelection: false,
              closeModal: false,
              successMessage: (() => {
                apiRefineFlushedCountRef.current += 1;
                const flushed = apiRefineFlushedCountRef.current;
                setApiRefineFlushedCount(flushed);
                const remaining = Math.max(totalWordsForRun - flushed, 0);
                return partial
                  ? `Flushed ${flushed}/${totalWordsForRun}, remaining ${remaining}: "${word.word}" (partial save, invalid fields skipped).`
                  : `Flushed ${flushed}/${totalWordsForRun}, remaining ${remaining}: "${word.word}".`;
              })()
            });
            if (partial && issues && issues.length > 0) {
              setApiRefineHistory((current) => {
                const next = [...current, compactRefineSnapshotForHistory({
                  stage: 'error',
                  attempt: 1,
                  maxAttempts: 1,
                  message: `Partial save for "${word.word}". User review needed.`,
                  issues
                })];
                return next.length > MAX_API_REFINE_HISTORY_ITEMS
                  ? next.slice(next.length - MAX_API_REFINE_HISTORY_ITEMS)
                  : next;
              });
            }
          }
        }
      );
      if (results.length > 0) {
        setSelectedIds(new Set());
      }
      if (finalIssues.length > 0) {
        const summaryLines = finalIssues.map((issue) => {
          const dropped = issue.droppedFields.length > 0
            ? `Dropped: ${issue.droppedFields.join(', ')}.`
            : 'Dropped: none.';
          const allIssues = issue.issues.length > 0
            ? issue.issues.join(' | ')
            : 'Manual review required.';
          return `${issue.word}: ${allIssues} ${dropped} Saved partially: ${issue.savedPartially ? 'yes' : 'no'}.`;
        });
        const summarySnapshot: WordRefineProgressSnapshot = {
          stage: 'error',
          attempt: 1,
          maxAttempts: 1,
          message: `Refine completed with ${finalIssues.length} word(s) needing manual review.`,
          issues: summaryLines
        };
        setApiRefineProgress(summarySnapshot);
        setApiRefineHistory((current) => {
          const next = [...current, compactRefineSnapshotForHistory(summarySnapshot)];
          return next.length > MAX_API_REFINE_HISTORY_ITEMS
            ? next.slice(next.length - MAX_API_REFINE_HISTORY_ITEMS)
            : next;
        });
        setIsApiRefineLogOpen(true);
      }
      setIsAiModalOpen(false);
      setNotification({
        type: finalIssues.length > 0 ? 'info' : 'success',
        message: finalIssues.length > 0
          ? `Refined ${results.length}/${totalWordsForRun} word(s). ${finalIssues.length} word(s) still need manual review; see Logs for full errors.`
          : attempts > 1
            ? `Refined ${totalWordsForRun} word(s) by API after ${attempts} attempts.`
            : `Refined ${totalWordsForRun} word(s) by API.`
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setNotification({ type: 'info', message: 'API refine stopped.' });
      } else {
        console.error(error);
        setNotification({
          type: 'error',
          message: error instanceof Error ? error.message : 'API refine failed.'
        });
      }
    } finally {
      if (apiRefineAbortRef.current === controller) {
        apiRefineAbortRef.current = null;
      }
      setIsApiRefining(false);
    }
  };

  const handleStopApiRefine = () => {
    apiRefineAbortRef.current?.abort();
  };

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

  const handleConfirmHardDelete = async () => {
    if (!onHardDelete || !wordToHardDelete) return;
    setIsHardDeleting(true);
    try {
      await onHardDelete(wordToHardDelete);
      setNotification({ type: 'success', message: `Permanently deleted "${wordToHardDelete.word}".` });
      setWordToHardDelete(null);
    } catch (e) {
      setNotification({ type: 'error', message: 'Failed to delete raw word.' });
    } finally {
      setIsHardDeleting(false);
    }
  };

  const uiProps: Omit<WordTableUIProps, 'viewingWord' | 'setViewingWord' | 'editingWord' | 'setEditingWord'> = {
    words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
    onPractice, context, onDelete,
    onViewWord, onEditWord,
    query, setQuery, activeFilters, refinedFilter, statusFilter, registerFilter, compositionFilter, bookFilter, specificBookId, onSpecificBookChange: setSpecificBookId, isAddExpanded,
    isFilterMenuOpen, quickAddInput, setQuickAddInput, isAdding, isViewMenuOpen,
    selectedIds, setSelectedIds, 
    wordToDelete, setWordToDelete, isDeleting, setIsDeleting,
    wordToHardDelete, setWordToHardDelete, isHardDeleting, setIsHardDeleting, onHardDelete,
    notification, viewMenuRef, visibility,
    setVisibility, handleToggleFilter, handleBatchAddSubmit,
    // FIX: Renamed typo onBoldDelete to onBulkDelete
    onOpenBulkDeleteModal: onBulkDelete ? () => setIsBulkDeleteModalOpen(true) : undefined,
    onOpenBulkHardDeleteModal: onBulkHardDelete && selectedRawWords.length > 0 ? () => setIsBulkHardDeleteModalOpen(true) : undefined,
    selectedWordsToRefine,
    selectedRawWordsCount: selectedRawWords.length,
    onStartRefineSelected: handleApiRefineSelected,
    isApiRefining,
    onStopApiRefine: handleStopApiRefine,
    setStatusFilter, setRefinedFilter, setRegisterFilter, setCompositionFilter, setBookFilter, setIsViewMenuOpen, setIsFilterMenuOpen,
    setIsAddExpanded,
    settingsKey,
    showTagBrowserButton,
    tagTree,
    selectedTag,
    onSelectTag,
    onRenameGroup,
    onDeleteGroup,
    selectedTypes: selectedWordTypes,
    toggleType: handleTypeToggle,
    onOpenWordBook,
    availableGroups,
    onSetSelectedVocabularyType: handleSetSelectedVocabularyType,
    onSetSelectedArchive: handleSetSelectedArchive,
    onSetSelectedFocus: handleSetSelectedFocus,
    onSetSelectedQuality: handleSetSelectedQuality,
    onSetSelectedLearnedStatus: handleSetSelectedLearnedStatus,
    onAddSelectedGroup: handleAddSelectedGroup,
    onCopySelectedHeadwords: handleCopySelectedHeadwords,
    isAddToBookModalOpen,
    setIsAddToBookModalOpen,
    wordBooks: availableBooks,
    onConfirmAddToBook: handleConfirmAddToBook
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
      {onHardDelete && (
        <ConfirmationModal
          isOpen={!!wordToHardDelete}
          title="Delete Raw Word?"
          message={`Permanently delete "${wordToHardDelete?.word}" from your entire library? This action cannot be undone.`}
          confirmText="DELETE RAW"
          isProcessing={isHardDeleting}
          onConfirm={handleConfirmHardDelete}
          onClose={() => setWordToHardDelete(null)}
          confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
          icon={<Trash2 size={40} className="text-red-500"/>}
        />
      )}
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
