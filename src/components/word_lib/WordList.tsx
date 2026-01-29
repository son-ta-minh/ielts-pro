
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { VocabularyItem, ReviewGrade, WordFamily, PrepositionPattern, User, WordTypeOption, WordQuality } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import WordTable from './WordTable';
import ViewWordModal from './ViewWordModal';
import EditWordModal from './EditWordModal';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, SourceFilter, CompositionFilter, BookFilter } from './WordTable_UI';
import { stringToWordArray } from '../../utils/text';
import { TagTreeNode } from '../common/TagBrowser';

interface Props {
  user: User;
  onDelete: (id: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onUpdate: (updated: VocabularyItem) => void;
  onStartSession: (words: VocabularyItem[]) => void;
  initialFilter?: string | null;
  onInitialFilterApplied?: () => void;
  forceExpandAdd?: boolean;
  onExpandAddConsumed?: () => void;
}

const WordList: React.FC<Props> = ({ user, onDelete, onBulkDelete, onUpdate, onStartSession, initialFilter, onInitialFilterApplied, forceExpandAdd, onExpandAddConsumed }) => {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentFilters, setCurrentFilters] = useState<{ types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter, source: SourceFilter, composition: CompositionFilter, book: BookFilter }>({ types: new Set(['all']), refined: 'all', status: 'all', register: 'all', source: 'all', composition: 'all', book: 'all' });
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const [viewingWord, setViewingWord] = useState<VocabularyItem | null>(null);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [tagTree, setTagTree] = useState<TagTreeNode[]>([]);

  const { id: userId } = user;

  const buildTagTree = useCallback(() => {
    const UNCATEGORIZED_GROUP = "Uncategorized";
    const allUserWords = dataStore.getAllWords().filter(w => w.userId === user.id);
    const wordsByLowerCase = new Map<string, VocabularyItem>();
    allUserWords.forEach(w => wordsByLowerCase.set(w.word.toLowerCase(), w));
    
    // 1. Group words and find all unique group paths
    const groupToDirectWordsMap = new Map<string, Set<VocabularyItem>>();
    const allExplicitGroups = new Set<string>();
    const uncategorizedWords: VocabularyItem[] = [];

    allUserWords.forEach(word => {
        if (word.groups && word.groups.length > 0) {
            word.groups.forEach(group => {
                allExplicitGroups.add(group);
                if (!groupToDirectWordsMap.has(group)) {
                    groupToDirectWordsMap.set(group, new Set());
                }
                groupToDirectWordsMap.get(group)!.add(word);
            });
        } else {
            uncategorizedWords.push(word);
        }
    });

    // 2. Build temporary tree with parent/child links
    type TempNode = { name: string; children: Set<string>; parents: Set<string>; };
    const tempTree = new Map<string, TempNode>();

    const ensureNode = (name: string) => {
        if (!tempTree.has(name)) {
            tempTree.set(name, { name, children: new Set(), parents: new Set() });
        }
    };

    // Process path-based groups first
    allExplicitGroups.forEach(groupPath => {
        const parts = groupPath.split('/');
        for (let i = 0; i < parts.length; i++) {
            const currentPart = parts.slice(0, i + 1).join('/');
            ensureNode(currentPart);
            if (i > 0) {
                const parentPart = parts.slice(0, i).join('/');
                tempTree.get(parentPart)!.children.add(currentPart);
                tempTree.get(currentPart)!.parents.add(parentPart);
            }
        }
    });

    // Add word-based relationships on top
    tempTree.forEach((node, groupName) => {
        const wordLink = wordsByLowerCase.get(groupName.toLowerCase());
        if (wordLink?.groups) {
            wordLink.groups.forEach(parentPath => {
                const parentParts = parentPath.split('/');
                 for (let i = 0; i < parentParts.length; i++) {
                    const currentPart = parentParts.slice(0, i + 1).join('/');
                    ensureNode(currentPart);
                    if (i > 0) {
                        const parentOfCurrentPart = parentParts.slice(0, i).join('/');
                        tempTree.get(parentOfCurrentPart)!.children.add(currentPart);
                        tempTree.get(currentPart)!.parents.add(parentOfCurrentPart);
                    }
                }
                tempTree.get(parentPath)!.children.add(groupName);
                node.parents.add(parentPath);
            });
        }
    });

    // 3. Memoized function to get all words in a subtree (for unitCount)
    const subtreeWordCountCache = new Map<string, number>();
    const getSubtreeWordCount = (groupName: string): number => {
        if (subtreeWordCountCache.has(groupName)) {
            return subtreeWordCountCache.get(groupName)!;
        }

        const allDescendantGroups = new Set<string>();
        const queue = [groupName];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            allDescendantGroups.add(current);
            (tempTree.get(current)?.children || new Set()).forEach(child => queue.push(child));
        }

        const wordsInBranch = new Set<string>(); // Use word IDs for uniqueness
        allDescendantGroups.forEach(descendant => {
            (groupToDirectWordsMap.get(descendant) || new Set()).forEach(w => wordsInBranch.add(w.id));
        });

        const count = wordsInBranch.size;
        subtreeWordCountCache.set(groupName, count);
        return count;
    };
    
    // 4. Finalize tree structure
    const buildNode = (groupName: string): TagTreeNode => {
        const nodeData = tempTree.get(groupName)!;
        const children = Array.from(nodeData.children).sort();
        
        return {
            name: groupName.split('/').pop()!,
            path: groupName,
            children: children.map(buildNode),
            unitCount: getSubtreeWordCount(groupName),
        };
    };

    const rootNames = Array.from(tempTree.keys()).filter(name => (tempTree.get(name)?.parents.size || 0) === 0);
    let finalTree = rootNames.sort().map(name => buildNode(name));

    // 5. Add the "Uncategorized" group if it has words
    if (uncategorizedWords.length > 0) {
        finalTree.unshift({
            name: UNCATEGORIZED_GROUP,
            path: UNCATEGORIZED_GROUP,
            children: [],
            unitCount: uncategorizedWords.length,
        });
    }

    setTagTree(finalTree);
  }, [user.id]);

  const fetchData = useCallback(() => {
    setLoading(true);
    try {
      const filterArray = Array.from(currentFilters.types) as string[];
      const { words: data, totalCount } = dataStore.getWordsPaged(
        userId, 
        page, 
        pageSize, 
        currentQuery, 
        filterArray, 
        currentFilters.refined, 
        currentFilters.status, 
        currentFilters.register, 
        currentFilters.source, 
        selectedTag,
        currentFilters.composition,
        currentFilters.book
      );
      setTotal(totalCount);
      setWords(data);
    } catch (err) {
      console.error("Failed to load words from store:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize, currentQuery, currentFilters, selectedTag]);

  useEffect(() => {
    fetchData();
    buildTagTree();
    
    const handleDataUpdate = () => {
      fetchData();
      buildTagTree();
    };

    window.addEventListener('datastore-updated', handleDataUpdate);
    return () => {
      window.removeEventListener('datastore-updated', handleDataUpdate);
    };
  }, [fetchData, buildTagTree]);

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setPage(0);
  };

  const handleAddWords = async (input: string, types: Set<WordTypeOption>) => {
    const wordsToProcess = stringToWordArray(input);
    const newItems: VocabularyItem[] = [];
    
    // Determine flags based on Set membership
    const isIdiom = types.has('idiom');
    const isPhrasalVerb = types.has('phrasal');
    const isCollocation = types.has('collocation');
    const isStandardPhrase = types.has('phrase');

    const needsPronunciationFocus = types.has('pronun');
    const isPassive = types.has('archive');

    for (const word of wordsToProcess) {
      const existing = await dataStore.findWordByText(userId, word);
      
      if (existing) {
        const updatedItem = { ...existing };
        updatedItem.isIdiom = isIdiom;
        updatedItem.isPhrasalVerb = isPhrasalVerb;
        updatedItem.isCollocation = isCollocation;
        updatedItem.isStandardPhrase = isStandardPhrase;
        updatedItem.needsPronunciationFocus = needsPronunciationFocus;
        updatedItem.isPassive = isPassive;
        updatedItem.updatedAt = Date.now();
        newItems.push(updatedItem); 
      } else {
        const newItem = createNewWord(
            word, '', '', '', '', [], 
            isIdiom, needsPronunciationFocus, isPhrasalVerb, 
            isCollocation, isStandardPhrase, isPassive
        );
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
          user={user}
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
          // FIX: Corrected typo from onBoldDelete to onBulkDelete
          onBulkDelete={handleBulkDelete}
          onPractice={handlePractice}
          settingsKey="ielts_pro_library_view_settings"
          context="library"
          initialFilter={initialFilter}
          forceExpandAdd={forceExpandAdd}
          onExpandAddConsumed={onExpandAddConsumed}
          showTagBrowserButton={true}
          tagTree={tagTree}
          selectedTag={selectedTag}
          onSelectTag={handleSelectTag}
      />
      {viewingWord && <ViewWordModal word={viewingWord} onClose={() => setViewingWord(null)} onNavigateToWord={setViewingWord} onUpdate={onUpdate} onGainXp={async () => 0} onEditRequest={(word) => { setViewingWord(null); setEditingWord(word); }} isViewOnly={false} />}
      {editingWord && <EditWordModal user={user} word={editingWord} onSave={handleSaveEdit} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setViewingWord(word); }}/>}
    </>
  );
};

export default WordList;
