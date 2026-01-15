import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Unit, VocabularyItem, User, ReviewGrade, WordQuality } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter } from '../word_lib/WordTable_UI';
import { UnitStudyViewUI } from './UnitStudyView_UI';
import { useToast } from '../../contexts/ToastContext';
import { stringToWordArray } from '../../utils/text';
import { filterItem } from '../../app/db';

interface Props {
  user: User;
  unit: Unit;
  allWords: VocabularyItem[];
  onBack: () => void;
  onDataChange: () => void;
  onStartSession: (words: VocabularyItem[]) => void;
  onSwitchToEdit: () => void;
  onUpdateUser: (user: User) => Promise<void>;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => Promise<number>;
}

const UnitStudyView: React.FC<Props> = ({ user, unit, allWords, onDataChange, onStartSession, onUpdateUser, onGainXp, ...props }) => {
  const [viewingWord, setViewingWord] = useState<VocabularyItem | null>(null);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  
  const [unitTablePage, setUnitTablePage] = useState(0);
  const [unitTablePageSize, setUnitTablePageSize] = useState(10);
  const [unitTableQuery, setUnitTableQuery] = useState('');
  const [unitTableFilters, setUnitTableFilters] = useState<{ types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter }>({ types: new Set(['all']), refined: 'all', 'status': 'all', register: 'all' });

  const wordsById = useMemo(() => new Map(allWords.map(w => [w.id, w])), [allWords]);
  const { showToast } = useToast();

  const unitWords = useMemo(() => (unit.wordIds.map(id => wordsById.get(id)).filter(Boolean) as VocabularyItem[]), [unit, wordsById]);
  
  // Add listener for global data changes to keep the view in sync
  useEffect(() => {
    window.addEventListener('datastore-updated', onDataChange);
    return () => {
      window.removeEventListener('datastore-updated', onDataChange);
    };
  }, [onDataChange]);

  const handleQueryChange = useCallback((query: string) => {
    setUnitTableQuery(query);
    setUnitTablePage(0);
  }, []);

  const handleFilterChange = useCallback((filters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter }) => {
      setUnitTableFilters(filters);
      setUnitTablePage(0);
  }, []);

  const filteredUnitWords = useMemo(() => {
    return unitWords.filter(item =>
        filterItem(
            item,
            unitTableQuery,
            Array.from(unitTableFilters.types),
            unitTableFilters.refined,
            unitTableFilters.status,
            unitTableFilters.register,
            'all' // Source filter is not applicable in this context
        )
    );
  }, [unitWords, unitTableQuery, unitTableFilters]);

  const pagedUnitWords = useMemo(() => {
      const start = unitTablePage * unitTablePageSize;
      return filteredUnitWords.slice(start, start + unitTablePageSize);
  }, [filteredUnitWords, unitTablePage, unitTablePageSize]);

  const handleRemoveWordFromUnit = async (wordId: string) => {
    let newVocabString = unit.customVocabString;
    const wordToRemove = wordsById.get(wordId);
    if(wordToRemove && newVocabString) { newVocabString = stringToWordArray(newVocabString).filter(entry => { const [essay, base] = entry.split(':'); return (base || essay).trim().toLowerCase() !== wordToRemove.word.toLowerCase(); }).join('; '); }
    const updatedUnit = { ...unit, wordIds: unit.wordIds.filter(id => id !== wordId), customVocabString: newVocabString, updatedAt: Date.now() };
    await dataStore.saveUnit(updatedUnit);
    await onDataChange();
  };

  const handleBulkRemoveWordsFromUnit = async (wordIds: Set<string>) => {
    const idsToRemove = Array.from(wordIds);
    let newVocabString = unit.customVocabString;

    if (newVocabString) {
      const wordsToRemove = new Set(idsToRemove.map(id => wordsById.get(id)?.word.toLowerCase()).filter(Boolean));
      newVocabString = stringToWordArray(newVocabString).filter(entry => {
          const [essay, base] = entry.split(':');
          return !wordsToRemove.has((base || essay).trim().toLowerCase());
      }).join('; ');
    }
  
    const updatedUnit = { ...unit, wordIds: unit.wordIds.filter(id => !idsToRemove.includes(id)), customVocabString: newVocabString, updatedAt: Date.now() };
    await dataStore.saveUnit(updatedUnit);
    await onDataChange();
  };

  const handleHardDeleteWord = async (wordToDelete: VocabularyItem) => {
    // First, remove from the current unit to ensure UI consistency
    await handleRemoveWordFromUnit(wordToDelete.id);

    // Then, permanently delete the word from the entire library
    await dataStore.deleteWord(wordToDelete.id);

    // DataStore will notify for a refresh, but we can also trigger manually if needed
    showToast(`"${wordToDelete.word}" permanently deleted.`, 'success');
  };

  const handleBulkHardDeleteRawWords = async (wordIds: Set<string>) => {
    // Unlink from unit first to maintain UI consistency and data integrity.
    await handleBulkRemoveWordsFromUnit(wordIds);
    // Then permanently delete the words from the database.
    await dataStore.bulkDeleteWords(Array.from(wordIds));
    showToast(`Permanently deleted ${wordIds.size} raw word(s).`, 'success');
  };

  const handleEssayWordAction = async (text: string, action: 'add' | 'remove') => {
    const rawText = text.trim();
    if (!rawText) return;
    const textLower = rawText.toLowerCase();
    const entries = stringToWordArray(unit.customVocabString);

    if (action === 'remove') {
        const entryIndex = entries.findIndex(e => e.split(':')[0].trim().toLowerCase() === textLower);
        if (entryIndex === -1) return;
        const entryParts = entries[entryIndex].split(':');
        const baseWord = (entryParts[1] || entryParts[0]).trim();
        entries.splice(entryIndex, 1);
        const newVocabString = entries.join('; ');
        const wordObj = allWords.find(w => w.word.toLowerCase() === baseWord.toLowerCase());
        let newWordIds = unit.wordIds;
        if (wordObj) newWordIds = unit.wordIds.filter(id => id !== wordObj.id);
        await dataStore.saveUnit({ ...unit, customVocabString: newVocabString, wordIds: newWordIds, updatedAt: Date.now() });
    } else {
        const exists = entries.some(e => e.split(':')[0].trim().toLowerCase() === textLower);
        if (exists) return;
        const existingWord = await dataStore.findWordByText(user.id, rawText);
        let wordIdToAdd: string;
        if (existingWord) wordIdToAdd = existingWord.id;
        else { const newWord = { ...createNewWord(rawText, '', '', '', `Linked from unit: ${unit.name}`, ['ielts', 'unit-linked']), userId: user.id }; await dataStore.bulkSaveWords([newWord]); wordIdToAdd = newWord.id; }
        const newWordIds = Array.from(new Set([...unit.wordIds, wordIdToAdd]));
        entries.push(rawText);
        const newVocabString = entries.join('; ');
        await dataStore.saveUnit({ ...unit, customVocabString: newVocabString, wordIds: newWordIds, updatedAt: Date.now() });
    }
    onDataChange();
  };

  const handleSaveWordUpdate = async (updatedWord: VocabularyItem) => {
    await dataStore.saveWord(updatedWord);
    // When the modal is open and we update, we need to update the state that feeds the modal
    if (viewingWord && viewingWord.id === updatedWord.id) {
        setViewingWord(updatedWord);
    }
    await onDataChange();
  };
  
  const handleToggleLearnedStatus = async () => {
    const wasLearned = unit.isLearned;
    const updatedUnit = { ...unit, isLearned: !unit.isLearned, updatedAt: Date.now() };
    await dataStore.saveUnit(updatedUnit);
    if (!wasLearned && user.adventure) {
        const newProgress = { ...user.adventure, keyFragments: (user.adventure.keyFragments || 0) + 1 };
        let assembledKey = false;
        while (newProgress.keyFragments >= 3) { newProgress.keyFragments -= 3; newProgress.keys = (newProgress.keys || 0) + 1; assembledKey = true; }
        const updatedUser = { ...user, adventure: newProgress };
        await onUpdateUser(updatedUser);
        showToast('Essay Complete! +1 Key Fragment 🎉', 'success');
        if (assembledKey) { showToast("✨ Key Fragments assembled into a Magic Key!", "success", 4000); }
    }
    await onDataChange();
  };

  return (
    <UnitStudyViewUI
      {...props}
      user={user}
      unit={unit}
      allWords={allWords}
      onDataChange={onDataChange}
      onStartSession={onStartSession}
      unitWords={unitWords}
      wordsById={wordsById}
      pagedUnitWords={pagedUnitWords}
      filteredUnitWords={filteredUnitWords}
      viewingWord={viewingWord}
      setViewingWord={setViewingWord}
      editingWord={editingWord}
      setEditingWord={setEditingWord}
      isPracticeMode={isPracticeMode}
      setIsPracticeMode={setIsPracticeMode}
      unitTablePage={unitTablePage}
      setUnitTablePage={setUnitTablePage}
      unitTablePageSize={unitTablePageSize}
      setUnitTablePageSize={setUnitTablePageSize}
      unitTableQuery={unitTableQuery}
      setUnitTableQuery={handleQueryChange}
      unitTableFilters={unitTableFilters}
      setUnitTableFilters={handleFilterChange}
      handleRemoveWordFromUnit={handleRemoveWordFromUnit}
      onBulkDelete={handleBulkRemoveWordsFromUnit}
      onHardDelete={handleHardDeleteWord}
      onBulkHardDelete={handleBulkHardDeleteRawWords}
      handleSaveWordUpdate={handleSaveWordUpdate}
      handleToggleLearnedStatus={handleToggleLearnedStatus}
      onWordAction={handleEssayWordAction}
      onUpdateUser={onUpdateUser}
      onGainXp={onGainXp}
    />
  );
}

export default UnitStudyView;