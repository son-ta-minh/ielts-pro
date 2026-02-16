
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Unit, VocabularyItem, User } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, CompositionFilter, BookFilter } from '../../components/word_lib/WordTable_UI';
import { ReadingStudyViewUI } from './ReadingStudyView_UI';
import { useToast } from '../../contexts/ToastContext';
import { stringToWordArray } from '../../utils/text';
import { filterItem } from '../../app/db';
import { exportUnitsToJson } from '../../utils/dataHandler';

interface Props {
  user: User;
  unit: Unit;
  allWords: VocabularyItem[];
  onBack: () => void;
  onDataChange: () => void;
  onStartSession: (words: VocabularyItem[]) => void;
  onSwitchToEdit: () => void;
  onUpdateUser: (user: User) => Promise<void>;
}

export const ReadingStudyView: React.FC<Props> = ({ user, unit, allWords, onDataChange, onStartSession, onUpdateUser, ...props }) => {
  const [viewingWord, setViewingWord] = useState<VocabularyItem | null>(null);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  
  const [unitTablePage, setUnitTablePage] = useState(0);
  const [unitTablePageSize, setUnitTablePageSize] = useState(10);
  const [unitTableQuery, setUnitTableQuery] = useState('');
  const [unitTableFilters, setUnitTableFilters] = useState<{ 
      types: Set<FilterType>, 
      refined: RefinedFilter, 
      status: StatusFilter, 
      register: RegisterFilter,
      composition: CompositionFilter,
      book: BookFilter
  }>({ 
      types: new Set(['all']), 
      refined: 'all', 
      status: 'all', 
      register: 'all',
      composition: 'all',
      book: 'all'
  });
  
  const [isComprehensionModalOpen, setIsComprehensionModalOpen] = useState(false);
  const [comprehensionAnswers, setComprehensionAnswers] = useState<Record<number, string>>({});
  const [comprehensionResults, setComprehensionResults] = useState<Record<number, 'correct' | 'incorrect' | null>>({});

  const wordsById = useMemo(() => new Map(allWords.map(w => [w.id, w])), [allWords]);
  const { showToast } = useToast();

  const unitWords = useMemo(() => (unit.wordIds.map(id => wordsById.get(id)).filter(Boolean) as VocabularyItem[]), [unit, wordsById]);
  
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

  const handleFilterChange = useCallback((filters: { 
      types: Set<FilterType>, 
      refined: RefinedFilter, 
      status: StatusFilter, 
      register: RegisterFilter,
      composition: CompositionFilter,
      book: BookFilter
  }) => {
      setUnitTableFilters(filters);
      setUnitTablePage(0);
  }, []);

  const handleOpenComprehensionModal = () => {
    if (unit.comprehensionQuestions && unit.comprehensionQuestions.length > 0) {
        const initialResults: Record<number, null> = {};
        unit.comprehensionQuestions.forEach((_, index) => {
            initialResults[index] = null;
        });
        setComprehensionResults(initialResults);
        setComprehensionAnswers({});
        setIsComprehensionModalOpen(true);
    } else {
        showToast('This unit has no comprehension questions.', 'info');
    }
  };

  const filteredUnitWords = useMemo(() => {
    return unitWords.filter(item =>
        filterItem(
            item,
            unitTableQuery,
            Array.from(unitTableFilters.types),
            unitTableFilters.refined,
            unitTableFilters.status,
            unitTableFilters.register,
            'all',
            null,
            unitTableFilters.composition,
            dataStore.getComposedWordIds(),
            unitTableFilters.book,
            dataStore.getBookWordIds()
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
    if(wordToRemove && newVocabString) { 
        newVocabString = stringToWordArray(newVocabString).filter(entry => { 
            const [essay, base] = entry.split(':'); 
            return (base || essay).trim().toLowerCase() !== wordToRemove.word.toLowerCase(); 
        }).join('; '); 
    }
    const updatedUnit = { ...unit, wordIds: unit.wordIds.filter(id => id !== wordId), customVocabString: newVocabString, updatedAt: Date.now() };
    await dataStore.saveUnit(updatedUnit);
    onDataChange();
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
    onDataChange();
  };

  const handleHardDeleteWord = async (wordToDelete: VocabularyItem) => {
    await handleRemoveWordFromUnit(wordToDelete.id);
    await dataStore.deleteWord(wordToDelete.id);
    showToast(`"${wordToDelete.word}" permanently deleted.`, 'success');
    onDataChange();
  };

  const handleBulkHardDeleteRawWords = async (wordIds: Set<string>) => {
    await handleBulkRemoveWordsFromUnit(wordIds);
    await dataStore.bulkDeleteWords(Array.from(wordIds));
    showToast(`Permanently deleted ${wordIds.size} raw word(s).`, 'success');
    onDataChange();
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
        let wordToAdd: VocabularyItem | null = null;
        let wordIdToAdd: string;
        
        if (existingWord) {
            wordIdToAdd = existingWord.id;
        } else {
            const isPhrase = rawText.includes(' ');
            wordToAdd = createNewWord(rawText, '', '', '', '', ['ielts'], false, false, false, false, isPhrase);
            wordToAdd.userId = user.id;
            wordIdToAdd = wordToAdd.id;
        }
        
        const newWordIds = Array.from(new Set([...unit.wordIds, wordIdToAdd]));
        entries.push(rawText);
        const newVocabString = entries.join('; ');
        
        // ATOMIC UPDATE: Save word (if new) and unit in one go to prevent double-write cooldown
        await dataStore.saveWordAndUnit(wordToAdd, { ...unit, customVocabString: newVocabString, wordIds: newWordIds, updatedAt: Date.now() });
    }
    onDataChange();
  };

  const handleSaveWordUpdate = async (updatedWord: VocabularyItem) => {
    await dataStore.saveWord(updatedWord);
    if (viewingWord && viewingWord.id === updatedWord.id) {
        setViewingWord(updatedWord);
    }
  };
  
  const handleExportUnit = async () => {
    try {
        await exportUnitsToJson([unit], user.id);
        showToast(`Unit "${unit.name}" exported successfully.`, 'success');
    } catch (e) {
        showToast('Failed to export unit.', 'error');
    }
  };

  return (
    <ReadingStudyViewUI
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
      onWordAction={handleEssayWordAction}
      onUpdateUser={onUpdateUser}
      handleExportUnit={handleExportUnit}
      isComprehensionModalOpen={isComprehensionModalOpen}
      onOpenComprehensionModal={handleOpenComprehensionModal}
      onCloseComprehensionModal={() => setIsComprehensionModalOpen(false)}
      comprehensionAnswers={comprehensionAnswers}
      onComprehensionAnswerChange={(index, value) => setComprehensionAnswers(prev => ({...prev, [index]: value}))}
      comprehensionResults={comprehensionResults}
      onComprehensionResultChange={(index, result) => setComprehensionResults(prev => ({...prev, [index]: result}))}
    />
  );
}

export default ReadingStudyView;
