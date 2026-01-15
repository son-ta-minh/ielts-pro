import React, { useState, useCallback, useEffect } from 'react';
import { VocabularyItem, ReviewGrade, WordFamily, PrepositionPattern, User } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import WordTable from './WordTable';
import ViewWordModal from './ViewWordModal';
import EditWordModal from './EditWordModal';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, SourceFilter } from './WordTable_UI';
import { stringToWordArray } from '../../utils/text';

interface Props {
  user: User;
  onDelete: (id: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onUpdate: (updated: VocabularyItem) => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => Promise<number>;
  onStartSession: (words: VocabularyItem[]) => void;
  initialFilter?: string | null;
  onInitialFilterApplied?: () => void;
  forceExpandAdd?: boolean;
  onExpandAddConsumed?: () => void;
}

const WordList: React.FC<Props> = ({ user, onDelete, onBulkDelete, onUpdate, onGainXp, onStartSession, initialFilter, onInitialFilterApplied, forceExpandAdd, onExpandAddConsumed }) => {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentFilters, setCurrentFilters] = useState<{ types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter, source: SourceFilter }>({ types: new Set(['all']), refined: 'all', status: 'all', register: 'all', source: 'all' });
  
  const [viewingWord, setViewingWord] = useState<VocabularyItem | null>(null);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);

  const { id: userId } = user;

  const fetchData = useCallback(() => {
    setLoading(true);
    try {
      const filterArray = Array.from(currentFilters.types) as string[];
      const { words: data, totalCount } = dataStore.getWordsPaged(userId, page, pageSize, currentQuery, filterArray, currentFilters.refined, currentFilters.status, currentFilters.register, currentFilters.source);
      setTotal(totalCount);
      setWords(data);
    } catch (err) {
      console.error("Failed to load words from store:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize, currentQuery, currentFilters]);

  useEffect(() => {
    fetchData();
    window.addEventListener('datastore-updated', fetchData);
    return () => {
      window.removeEventListener('datastore-updated', fetchData);
    }
  }, [fetchData]);

  const handleAddWords = async (input: string) => {
    const wordsToProcess = stringToWordArray(input);
    const newItems: VocabularyItem[] = [];
    for (const word of wordsToProcess) {
      const exists = await dataStore.findWordByText(userId, word);
      if (!exists) {
        const newItem = createNewWord(word, '', '', '', '', []);
        newItem.userId = userId;
        newItems.push(newItem);
      }
    }
    if (newItems.length > 0) await dataStore.bulkSaveWords(newItems);
  };

  const handlePractice = (ids: Set<string>) => {
      const items = dataStore.getAllWords().filter(w => ids.has(w.id));
      onStartSession(items);
  };

  const handleBulkDelete = async (ids: Set<string>) => {
    await onBulkDelete(Array.from(ids));
  };
  
  const handleSaveEdit = (word: VocabularyItem) => {
    onUpdate(word);
    setEditingWord(null);
  };

  return (
    <>
      <WordTable 
          words={words}
          total={total}
          loading={loading}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearch={setCurrentQuery}
          onFilterChange={setCurrentFilters}
          onAddWords={handleAddWords}
          onViewWord={setViewingWord}
          onEditWord={setEditingWord}
          onDelete={async (w) => { await onDelete(w.id); }}
          onBulkDelete={handleBulkDelete}
          onPractice={handlePractice}
          settingsKey="ielts_pro_library_view_settings"
          context="library"
          initialFilter={initialFilter}
          forceExpandAdd={forceExpandAdd}
          onExpandAddConsumed={onExpandAddConsumed}
      />
      {viewingWord && <ViewWordModal word={viewingWord} onClose={() => setViewingWord(null)} onNavigateToWord={setViewingWord} onUpdate={onUpdate} onGainXp={onGainXp} onEditRequest={(word) => { setViewingWord(null); setEditingWord(word); }} isViewOnly={false} />}
      {editingWord && <EditWordModal user={user} word={editingWord} onSave={handleSaveEdit} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setViewingWord(word); }}/>}
    </>
  );
};

export default WordList;
