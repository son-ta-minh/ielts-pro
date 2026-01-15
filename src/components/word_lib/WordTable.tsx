import React, { useState, useEffect, useRef, useMemo } from 'react';
import { VocabularyItem, ParaphraseOption, WordQuality } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { getWordDetailsPrompt } from '../../services/promptService';
import { WordTableUI, WordTableUIProps, DEFAULT_VISIBILITY } from './WordTable_UI';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, SourceFilter } from './WordTable_UI';
import { normalizeAiResponse, mergeAiResultIntoWord } from '../../utils/vocabUtils';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { stringToWordArray } from '../../utils/text';
import ConfirmationModal from '../common/ConfirmationModal';
import { Unlink, Trash2 } from 'lucide-react';
// FIX: Import UniversalAiModal to resolve 'Cannot find name' error.
import UniversalAiModal from '../common/UniversalAiModal';
import { createNewWord } from '../../utils/srs';

interface Props {
  words: VocabularyItem[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSearch: (query: string) => void;
  onFilterChange: (filters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter, source: SourceFilter }) => void;
  onAddWords: (wordsInput: string) => Promise<void>;
  onViewWord: (word: VocabularyItem) => void; // This is for OPENING the view modal
  onEditWord: (word: VocabularyItem) => void; // This is for OPENING the edit modal
  onDelete: (word: VocabularyItem) => Promise<void>;
  onHardDelete?: (word: VocabularyItem) => Promise<void>;
  onBulkDelete?: (ids: Set<string>) => Promise<void>;
  onBulkHardDelete?: (ids: Set<string>) => Promise<void>;
  onPractice: (ids: Set<string>) => void;
  settingsKey: string;
  context: 'library' | 'unit';
  initialFilter?: string | null;
  forceExpandAdd?: boolean;
  onExpandAddConsumed?: () => void;
  onWordRenamed?: (renames: { id: string; oldWord: string; newWord: string }[]) => void;
}

const WordTable: React.FC<Props> = ({ 
  words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
  onSearch, onFilterChange, onAddWords, onViewWord, onEditWord, onDelete, onHardDelete, onBulkDelete, onBulkHardDelete, onPractice,
  settingsKey, context, initialFilter, forceExpandAdd, onExpandAddConsumed, onWordRenamed
}) => {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(new Set(['all']));
  const [refinedFilter, setRefinedFilter] = useState<RefinedFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [registerFilter, setRegisterFilter] = useState<RegisterFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  
  const [isAddExpanded, setIsAddExpanded] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [quickAddInput, setQuickAddInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [wordToDelete, setWordToDelete] = useState<VocabularyItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [wordToHardDelete, setWordToHardDelete] = useState<VocabularyItem | null>(null);
  const [isHardDeleting, setIsHardDeleting] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkHardDeleteModalOpen, setIsBulkHardDeleteModalOpen] = useState(false);
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'info', message: string} | null>(null);
  
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
      const newFilters = new Set([initialFilter as FilterType]);
      setActiveFilters(newFilters);
      onFilterChange({ types: newFilters, refined: refinedFilter, status: statusFilter, register: registerFilter, source: sourceFilter });
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
    onFilterChange({ types: activeFilters, refined: refinedFilter, status: statusFilter, register: registerFilter, source: sourceFilter });
    onPageChange(0);
    setSelectedIds(new Set());
  }, [activeFilters, refinedFilter, statusFilter, registerFilter, sourceFilter]);

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

  const handleBatchAddSubmit = async () => {
    if (!quickAddInput.trim()) return;
    setIsAdding(true);
    try {
        await onAddWords(quickAddInput);
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

  const handleConfirmBulkDelete = async () => {
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
                    const newItem = createNewWord(suggestedHeadword, '', '', '', '', [], false, false, false, false, false, false, 'refine');
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

  const handleGenerateRefinePrompt = (inputs: { words: string }) => getWordDetailsPrompt(stringToWordArray(inputs.words), 'Vietnamese');
  
  const uiProps: Omit<WordTableUIProps, 'viewingWord' | 'setViewingWord' | 'editingWord' | 'setEditingWord'> = {
    words, total, loading, page, pageSize, onPageChange, onPageSizeChange,
    onPractice, context, onDelete,
    onViewWord, onEditWord,
    query, setQuery, activeFilters, refinedFilter, statusFilter, registerFilter, sourceFilter, isAddExpanded,
    isFilterMenuOpen, quickAddInput, setQuickAddInput, isAdding, isViewMenuOpen,
    selectedIds, setSelectedIds, 
    wordToDelete, setWordToDelete, isDeleting, setIsDeleting,
    wordToHardDelete, setWordToHardDelete, isHardDeleting, setIsHardDeleting, onHardDelete,
    isAiModalOpen, setIsAiModalOpen, notification, viewMenuRef, visibility,
    setVisibility, handleToggleFilter, handleBatchAddSubmit,
    onOpenBulkDeleteModal: onBulkDelete ? () => setIsBulkDeleteModalOpen(true) : undefined,
    onBulkVerify: handleBulkVerify,
    onOpenBulkHardDeleteModal: onBulkHardDelete && selectedRawWords.length > 0 ? () => setIsBulkHardDeleteModalOpen(true) : undefined,
    selectedWordsToRefine, handleGenerateRefinePrompt, handleAiRefinementResult,
    selectedRawWordsCount: selectedRawWords.length,
    setStatusFilter, setRefinedFilter, setRegisterFilter, setSourceFilter, setIsViewMenuOpen, setIsFilterMenuOpen,
    setIsAddExpanded,
    settingsKey,
  };

  return (
    <>
      <WordTableUI {...uiProps} />
      {onBulkDelete && <ConfirmationModal 
        isOpen={isBulkDeleteModalOpen}
        title={context === 'unit' ? `Unlink ${selectedIds.size} Words?` : `Delete ${selectedIds.size} Words?`}
        message={context === 'unit' ? `Remove ${selectedIds.size} selected words from this unit? They will remain in your library.` : `Permanently delete ${selectedIds.size} selected words? This action cannot be undone.`}
        confirmText={context === 'unit' ? `UNLINK ${selectedIds.size}` : `DELETE ${selectedIds.size}`}
        isProcessing={isDeleting}
        onConfirm={handleConfirmBulkDelete}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        confirmButtonClass={context === 'unit' ? "bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200" : "bg-red-600 text-white hover:bg-red-700 shadow-red-200"}
        icon={context === 'unit' ? <Unlink size={40} className="text-orange-500"/> : <Trash2 size={40} className="text-red-500"/>}
      />}
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
    </>
  );
};

export default WordTable;