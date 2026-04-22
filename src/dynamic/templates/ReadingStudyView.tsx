
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Unit, StudyItem, User } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, CompositionFilter, BookFilter } from '../../components/study_lib/StudyItemTable_UI';
import { ReadingStudyViewUI } from './ReadingStudyView_UI';
import { useToast } from '../../contexts/ToastContext';
import { parseVocabMapping, stringToWordArray } from '../../utils/text';
import { filterItem } from '../../app/db';
import { exportUnitsToJson } from '../../utils/dataHandler';
import { getConfig, getServerUrl } from '../../app/settingsManager';

interface Props {
  user: User;
  unit: Unit;
  allWords: StudyItem[];
  onBack: () => void;
  onDataChange: () => void;
  onStartSession: (words: StudyItem[]) => void;
  onSwitchToEdit: () => void;
  onUpdateUser: (user: User) => Promise<void>;
}

type LinkedFileContent =
  | { state: 'idle' | 'loading' }
  | { state: 'error'; message: string }
  | { state: 'text'; title: string; text: string; fileName: string; extension?: string }
  | { state: 'binary'; title: string; fileUrl: string; fileName: string; extension?: string; mimeType?: string };

export const ReadingStudyView: React.FC<Props> = ({ user, unit, allWords, onDataChange, onStartSession, onUpdateUser, ...props }) => {
  const serverUrl = getServerUrl(getConfig());
  const [viewingWord, setViewingWord] = useState<StudyItem | null>(null);
  const [editingWord, setEditingWord] = useState<StudyItem | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [note, setNote] = useState(unit.note ?? '');
  const noteSaveRef = useRef(unit.note ?? '');
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  
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

  useEffect(() => {
    setUnitTablePage(0);
    setUnitTablePageSize(10);
    setUnitTableQuery('');
    setUnitTableFilters({
      types: new Set(['all']),
      refined: 'all',
      status: 'all',
      register: 'all',
      composition: 'all',
      book: 'all'
    });
  }, [unit.id]);
  
  const [isComprehensionModalOpen, setIsComprehensionModalOpen] = useState(false);
  const [comprehensionAnswers, setComprehensionAnswers] = useState<Record<number, string>>({});
  const [comprehensionResults, setComprehensionResults] = useState<Record<number, 'correct' | 'incorrect' | null>>({});
  const [essayFileContent, setEssayFileContent] = useState<LinkedFileContent>({ state: 'idle' });
  const [answerFileContent, setAnswerFileContent] = useState<LinkedFileContent>({ state: 'idle' });

  const wordsById = useMemo(() => new Map(allWords.map(w => [w.id, w])), [allWords]);
  const { showToast } = useToast();

  const unitWords = useMemo(() => {
    const collected = new Map<string, StudyItem>();

    unit.wordIds.forEach((id) => {
      const word = wordsById.get(id);
      if (word) collected.set(word.id, word);
    });

    const vocabMapping = parseVocabMapping(unit.customVocabString);
    vocabMapping.forEach((baseWord) => {
      const matchedWord = allWords.find((item) => item.word.trim().toLowerCase() === baseWord.trim().toLowerCase());
      if (matchedWord) {
        collected.set(matchedWord.id, matchedWord);
      }
    });

    return Array.from(collected.values());
  }, [unit.wordIds, unit.customVocabString, wordsById, allWords]);
  
  useEffect(() => {
    window.addEventListener('datastore-updated', onDataChange);
    return () => {
      window.removeEventListener('datastore-updated', onDataChange);
    };
  }, [onDataChange]);

  useEffect(() => {
    setNote(unit.note ?? '');
    noteSaveRef.current = unit.note ?? '';
  }, [unit.note]);

  useEffect(() => {
    const encodePathForApi = (relativePath: string) => relativePath.split('/').map(part => encodeURIComponent(part)).join('/');

    const loadLinkedFile = async (
      link: Unit['essayFileLink'] | undefined,
      setState: React.Dispatch<React.SetStateAction<LinkedFileContent>>
    ) => {
      if (!link?.mapName || !link.relativePath) {
        setState({ state: 'idle' });
        return;
      }

      setState({ state: 'loading' });
      try {
        const encodedPath = encodePathForApi(link.relativePath);
        const res = await fetch(`${serverUrl}/api/reading/content/${encodeURIComponent(link.mapName)}/${encodedPath}`);
        if (!res.ok) {
          setState({ state: 'error', message: 'Failed to load file.' });
          return;
        }
        const data = await res.json();
        if (data.contentType === 'binary') {
          const absoluteUrl = String(data.fileUrl || '').startsWith('http') ? data.fileUrl : `${serverUrl}${data.fileUrl}`;
          setState({
            state: 'binary',
            title: data.title || link.fileName,
            fileUrl: absoluteUrl,
            fileName: link.fileName,
            extension: link.extension,
            mimeType: data.mimeType
          });
        } else {
          setState({
            state: 'text',
            title: data.title || link.fileName,
            text: data.essay || '',
            fileName: link.fileName,
            extension: link.extension
          });
        }
      } catch {
        setState({ state: 'error', message: 'Connection error while loading file.' });
      }
    };

    if (unit.readingSourceType !== 'server_file_pair') {
      setEssayFileContent({ state: 'idle' });
      setAnswerFileContent({ state: 'idle' });
      return;
    }

    loadLinkedFile(unit.essayFileLink, setEssayFileContent);
    loadLinkedFile(unit.answerFileLink, setAnswerFileContent);
  }, [serverUrl, unit.readingSourceType, unit.essayFileLink, unit.answerFileLink]);

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

  const handleSaveNote = async () => {
    if (isNoteSaving || note === noteSaveRef.current) return;
    setIsNoteSaving(true);
    try {
      const updatedUnit = { ...unit, note, updatedAt: Date.now() };
      await dataStore.saveUnit(updatedUnit);
      noteSaveRef.current = note;
      await onDataChange();
      showToast('Note saved.', 'success');
    } finally {
      setIsNoteSaving(false);
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

  const handleHardDeleteWord = async (wordToDelete: StudyItem) => {
    await handleRemoveWordFromUnit(wordToDelete.id);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await dataStore.deleteWord(wordToDelete.id);
    showToast(`"${wordToDelete.word}" permanently deleted.`, 'success');
    await onDataChange();
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
        let wordToAdd: StudyItem | null = null;
        let wordIdToAdd: string;
        
        if (existingWord) {
            wordIdToAdd = existingWord.id;
        } else {
            const isPhrase = rawText.includes(' ');
            wordToAdd = await createNewWord(
              rawText,
              '',
              '',
              '',
              '',
              [],
              false,
              false,
              false,
              isPhrase,
              false
            );
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

  const handleSaveWordUpdate = async (updatedWord: StudyItem) => {
    await dataStore.saveWord(updatedWord);
    if (viewingWord && viewingWord.id === updatedWord.id) {
        setViewingWord(updatedWord);
    }
  };
  
  const handleExportUnit = async () => {
    try {
        await exportUnitsToJson([unit], user.id);
        showToast(`Unit "${unit.name}" exported successfully.`, 'success');
    } catch {
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
      essayFileContent={essayFileContent}
      answerFileContent={answerFileContent}
      note={note}
      onNoteChange={setNote}
      onSaveNote={handleSaveNote}
      isNoteSaving={isNoteSaving}
      isNoteDirty={note !== noteSaveRef.current}
    />
  );
}

export default ReadingStudyView;
