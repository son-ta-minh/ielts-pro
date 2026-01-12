import React, { useState, useEffect, useRef, useMemo } from 'react';
import { VocabularyItem, ParaphraseOption, WordQuality } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { getWordDetailsPrompt, getWordTypePrompt } from '../../services/promptService';
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
  onRefine: (ids: Set<string>) => void;
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
  onSearch, onFilterChange, onAddWords, onViewWord, onEditWord, onDelete, onHardDelete, onBulkDelete, onRefine, onPractice,
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
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isWordTypeAiModalOpen, setIsWordTypeAiModalOpen] = useState(false);
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
    results.forEach(r => {
        const normalized = normalizeAiResponse(r);
        const key = (normalized.original || normalized.word || '').toLowerCase();
        if (key) {
            if (!aiMap.has(key)) aiMap.set(key, []);
            aiMap.get(key)?.push(normalized);
        }
    });

    const originalWordsMap = new Map<string, VocabularyItem>(selectedWordsToRefine.map(w => [w.word.toLowerCase(), w]));
    const itemsToSave: VocabularyItem[] = [];
    const itemsToDeleteIds: string[] = [];
    const renames: { id: string; oldWord: string; newWord: string }[] = [];

    for (const [originalKey, originalItem] of originalWordsMap) {
        const candidates = aiMap.get(originalKey);
        if (!candidates || candidates.length === 0) continue;
        
        const aiResult = candidates[0]; // Simplified: take the first result
        const suggestedHeadword = (aiResult.headword || aiResult.word || '').trim();

        if (suggestedHeadword) {
            const originalWordCount = originalItem.word.trim().split(/\s+/).length;
            const newWordCount = suggestedHeadword.trim().split(/\s+/).length;

            if (originalWordCount !== newWordCount) {
                // Word count differs: create a new word, leave original untouched.
                const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                if (existingHeadwordItem) {
                    const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, aiResult);
                    itemsToSave.push(mergedItem);
                } else {
                    const newItem = createNewWord(suggestedHeadword, '', '', '', '', [], false, false, false, false, false, false, 'refine');
                    newItem.userId = originalItem.userId;
                    const finalNewItem = mergeAiResultIntoWord(newItem, aiResult);
                    itemsToSave.push(finalNewItem);
                }
            } else {
                // Same word count: proceed with original rename/merge logic.
                const isRenaming = suggestedHeadword.toLowerCase() !== originalItem.word.toLowerCase();
                if (isRenaming) {
                    const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                    if (existingHeadwordItem && existingHeadwordItem.id !== originalItem.id) {
                        const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, aiResult);
                        itemsToSave.push(mergedItem);
                        itemsToDeleteIds.push(originalItem.id);
                        renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
                    } else {
                        let updatedItem = mergeAiResultIntoWord(originalItem, aiResult);
                        updatedItem.word = suggestedHeadword;
                        itemsToSave.push(updatedItem);
                        renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
                    }
                } else {
                    itemsToSave.push(mergeAiResultIntoWord(originalItem, aiResult));
                }
            }
        } else {
            // No headword from AI, just merge into original
            itemsToSave.push(mergeAiResultIntoWord(originalItem, aiResult));
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
        onRefine(new Set()); 
        setSelectedIds(new Set());
    }
    setIsAiModalOpen(false);
  };

  const handleGenerateRefinePrompt = (inputs: { words: string }) => getWordDetailsPrompt(stringToWordArray(inputs.words), 'Vietnamese');
  
  const handleWordTypeOverwriteResult = async (results: any[]) => {
    if (!Array.isArray(results)) {
        setNotification({ type: 'error', message: "AI response was not in the expected format."});
        return;
    }

    const aiMap = new Map<string, any>();
    results.forEach(r => {
        const key = (r.og || '').toLowerCase();
        if (key) aiMap.set(key, r);
    });

    const itemsToUpdate: VocabularyItem[] = [];
    selectedWordsToRefine.forEach(word => {
        const aiResult = aiMap.get(word.word.toLowerCase());
        if (aiResult) {
            const updatedWord = { ...word };
            // Reset all type flags first for re-classification
            updatedWord.isIdiom = false;
            updatedWord.isPhrasalVerb = false;
            updatedWord.isCollocation = false;
            updatedWord.isStandardPhrase = false;

            if (aiResult.is_idiom) updatedWord.isIdiom = true;
            else if (aiResult.is_pv) updatedWord.isPhrasalVerb = true;
            else if (aiResult.is_col) updatedWord.isCollocation = true;
            else if (aiResult.is_phr) updatedWord.isStandardPhrase = true;
            
            updatedWord.updatedAt = Date.now();
            itemsToUpdate.push(updatedWord);
        }
    });
    
    if (itemsToUpdate.length > 0) {
        await dataStore.bulkSaveWords(itemsToUpdate);
        setNotification({ type: 'success', message: `Updated word types for ${itemsToUpdate.length} words.` });
        setSelectedIds(new Set());
    }
    setIsWordTypeAiModalOpen(false);
  };


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
    onOpenWordTypeAiModal: () => setIsWordTypeAiModalOpen(true),
    selectedWordsToRefine, handleGenerateRefinePrompt, handleAiRefinementResult,
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
      {isWordTypeAiModalOpen && selectedWordsToRefine.length > 0 && (
        <UniversalAiModal 
            isOpen={isWordTypeAiModalOpen} 
            onClose={() => setIsWordTypeAiModalOpen(false)} 
            type="REFINE_WORDS" 
            title="Overwrite Word Type"
            description={`Analyzing and overwriting the type for ${selectedWordsToRefine.length} selected words.`}
            initialData={{ words: selectedWordsToRefine.map(w => w.word).join('\n') }}
            onGeneratePrompt={(inputs) => getWordTypePrompt(stringToWordArray(inputs.words))}
            onJsonReceived={handleWordTypeOverwriteResult}
            actionLabel="Overwrite Types"
            hidePrimaryInput={true}
        />
      )}
    </>
  );
};

export default WordTable;