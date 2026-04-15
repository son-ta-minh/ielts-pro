import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import { StudyItem, LearnedStatus, WordFamily, PrepositionPattern, User, WordTypeOption, StudyItemQuality, AppView, StudyLibraryType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import StudyItemTable from './StudyItemTable';
import ViewStudyItemModal from './ViewStudyItemModal';
import EditStudyItemModal from './EditStudyItemModal';
import ReviewSession from '../practice/ReviewSession';
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter, CompositionFilter, BookFilter } from './StudyItemTable_UI';
import { stringToWordArray } from '../../utils/text';
import { TagTreeNode } from '../common/TagBrowser';
import { getStoredJSON } from '../../utils/storage';
import { lookupWordsInGlobalLibrary } from '../../services/backupService';
import { calculateComplexity, calculateMasteryScore } from '../../utils/srs';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { autoRefineNewWords } from '../../services/wordRefinePersistence';
import { Loader2 } from 'lucide-react';

interface Props {
  user: User;
  libraryType?: StudyLibraryType;
  libraryLabel?: string;
  onDelete: (id: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onUpdate: (updated: StudyItem) => void;
  onStartSession: (words: StudyItem[]) => void;
  initialFilter?: string | null;
  onInitialFilterApplied?: () => void;
  forceExpandAdd?: boolean;
  onExpandAddConsumed?: () => void;
  onNavigate?: (view: AppView) => void;
}

const LIBRARY_FILTERS_KEY = 'vocab_pro_library_filters_v2';

const dedupeGroups = (groups: string[]): string[] => Array.from(new Set(groups.filter(Boolean)));

const buildRenamedGroupPath = (oldPath: string, nextName: string): string => {
  const parts = oldPath.split('/');
  parts[parts.length - 1] = nextName;
  return parts.join('/');
};

const renameGroupPathValue = (groupPath: string, oldPath: string, renamedPath: string): string => {
  if (groupPath === oldPath) return renamedPath;
  if (groupPath.startsWith(`${oldPath}/`)) return `${renamedPath}${groupPath.slice(oldPath.length)}`;
  return groupPath;
};

const deleteGroupPathValue = (groupPath: string, targetPath: string): string | null => {
  if (groupPath === targetPath) return null;
  if (!groupPath.startsWith(`${targetPath}/`)) return groupPath;
  return groupPath.slice(targetPath.length + 1) || null;
};

const StudyItemList: React.FC<Props> = ({ user, libraryType = 'vocab', libraryLabel = 'Word Library', onDelete, onBulkDelete, onUpdate, onStartSession, initialFilter, onInitialFilterApplied, forceExpandAdd, onExpandAddConsumed, onNavigate }) => {
  const [words, setWords] = useState<StudyItem[]>([]);
  
  // Read storage synchronously for initial state
  const tableFiltersKey = useMemo(
    () => `${LIBRARY_FILTERS_KEY}_library_${libraryType === 'kotoba' ? 'kotoba_pro_word_table_settings' : 'vocab_pro_word_table_settings'}`,
    [libraryType]
  );
  const savedState = useMemo(() => getStoredJSON<any>(tableFiltersKey, {}), [tableFiltersKey]);

  const [page, setPage] = useState(savedState.page || 0);
  const [pageSize, setPageSize] = useState(savedState.pageSize || 25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [currentQuery, setCurrentQuery] = useState(savedState.query || '');
  const [searchMeaning, setSearchMeaning] = useState(Boolean(savedState.searchMeaning));
  const [currentFilters, setCurrentFilters] = useState<{ types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter, composition: CompositionFilter, book: BookFilter, specificBookId: string }>({ types: new Set(['all']), refined: 'all', status: 'all', register: 'all', composition: 'all', book: 'all', specificBookId: '' });
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const [viewingWord, setViewingWord] = useState<StudyItem | null>(null);
  const [editingWord, setEditingWord] = useState<StudyItem | null>(null);
  const [inlineReviewWords, setInlineReviewWords] = useState<StudyItem[] | null>(null);
  const [tagTree, setTagTree] = useState<TagTreeNode[]>([]);

  const { id: userId } = user;

  const buildTagTree = useCallback(() => {
    const UNCATEGORIZED_GROUP = "Uncategorized";
    const allUserWords = dataStore.getAllWords().filter(w => w.userId === user.id && (w.libraryType || 'vocab') === libraryType);
    const wordsByLowerCase = new Map<string, StudyItem>();
    allUserWords.forEach(w => wordsByLowerCase.set(w.word.toLowerCase(), w));
    
    // 1. Group words and find all unique group paths
    const groupToDirectWordsMap = new Map<string, Set<StudyItem>>();
    const allExplicitGroups = new Set<string>();
    const uncategorizedWords: StudyItem[] = [];

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
                // Prevent cycles such as "animal" -> "animal/bird" -> "animal".
                const wouldCreateCycle =
                  parentPath === groupName ||
                  parentPath.startsWith(`${groupName}/`);
                if (!wouldCreateCycle) {
                  tempTree.get(parentPath)!.children.add(groupName);
                  node.parents.add(parentPath);
                }
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
    const buildNode = (groupName: string, lineage = new Set<string>()): TagTreeNode => {
        const nodeData = tempTree.get(groupName)!;
        const nextLineage = new Set(lineage);
        nextLineage.add(groupName);
        const children = Array.from(nodeData.children)
          .filter(child => !nextLineage.has(child))
          .sort();
        
        return {
            name: groupName.split('/').pop()!,
            path: groupName,
            children: children.map(child => buildNode(child, nextLineage)),
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
        selectedTag, 
        currentFilters.composition, 
        currentFilters.book,
        currentFilters.specificBookId,
        searchMeaning,
        libraryType
      );
      setTotal(totalCount);
      setWords(data);
    } catch (err) {
      console.error("Failed to load words from store:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize, currentQuery, currentFilters, selectedTag, searchMeaning]);

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

  const handleRenameGroup = async (path: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName.includes('/')) return;

    const renamedPath = buildRenamedGroupPath(path, trimmedName);
    if (renamedPath === path) return;

    const affectedWords = dataStore.getAllWords()
      .filter(word => word.userId === user.id && (word.libraryType || 'vocab') === libraryType)
      .filter(word => word.groups?.some(group => group === path || group.startsWith(`${path}/`)));

    if (affectedWords.length === 0) {
      if (selectedTag === path) setSelectedTag(renamedPath);
      return;
    }

    const updatedWords = affectedWords.map(word => ({
      ...word,
      groups: dedupeGroups((word.groups || []).map(group => renameGroupPathValue(group, path, renamedPath))),
      updatedAt: Date.now()
    }));

    await dataStore.bulkSaveWords(updatedWords);

    if (selectedTag === path || selectedTag?.startsWith(`${path}/`)) {
      setSelectedTag(renameGroupPathValue(selectedTag, path, renamedPath));
    }
  };

  const handleDeleteGroup = async (path: string) => {
    const affectedWords = dataStore.getAllWords()
      .filter(word => word.userId === user.id && (word.libraryType || 'vocab') === libraryType)
      .filter(word => word.groups?.some(group => group === path || group.startsWith(`${path}/`)));

    if (affectedWords.length === 0) {
      if (selectedTag === path) setSelectedTag(null);
      return;
    }

    const updatedWords = affectedWords.map(word => ({
      ...word,
      groups: dedupeGroups((word.groups || [])
        .map(group => deleteGroupPathValue(group, path))
        .filter((group): group is string => Boolean(group))),
      updatedAt: Date.now()
    }));

    await dataStore.bulkSaveWords(updatedWords);

    if (selectedTag === path) {
      setSelectedTag(null);
    } else if (selectedTag?.startsWith(`${path}/`)) {
      setSelectedTag(deleteGroupPathValue(selectedTag, path));
    }
  };

  const handleAddWords = async (input: string, types: Set<WordTypeOption>) => {
    const wordsToProcess = stringToWordArray(input);
    const newItems: StudyItem[] = [];
    
    // Determine flags based on Set membership
    const isIdiom = types.has('idiom');
    const isPhrasalVerb = types.has('phrasal');
    const isCollocation = types.has('collocation');
    const isStandardPhrase = types.has('phrase');

    const isPassive = types.has('archive');
    const isFocus = types.has('focus');

    // 1. Pre-fetch from Server Library for Quick Add
    let serverMap = new Map<string, StudyItem>();
    try {
        const serverItems = await lookupWordsInGlobalLibrary(wordsToProcess);
        serverItems.forEach(item => {
            serverMap.set(item.word.toLowerCase().trim(), item);
        });
    } catch (e) {
        console.warn("Server lookup failed in StudyItemList:", e);
    }

    for (const word of wordsToProcess) {
      const existing = dataStore.getAllWords().find(item =>
        item.userId === userId &&
        (item.libraryType || 'vocab') === libraryType &&
        item.word.toLowerCase().trim() === word.toLowerCase().trim()
      );
      
      if (existing) {
        const updatedItem = { ...existing };
        updatedItem.isIdiom = isIdiom || existing.isIdiom;
        updatedItem.isPhrasalVerb = isPhrasalVerb || existing.isPhrasalVerb;
        updatedItem.isCollocation = isCollocation || existing.isCollocation;
        updatedItem.isStandardPhrase = isStandardPhrase || existing.isStandardPhrase;
        updatedItem.isPassive = isPassive; // Override passive status if explicitly adding to archive or not
        updatedItem.isFocus = isFocus || !!existing.isFocus;
        updatedItem.updatedAt = Date.now();
        newItems.push(updatedItem); 
      } else {
        const key = word.toLowerCase().trim();
        let newItem: StudyItem;

        if (serverMap.has(key)) {
             // Use Server Data for a REFINED start
             const serverItem = serverMap.get(key)!;
             newItem = {
                 ...serverItem,
                 id: crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                 userId: userId,
                 createdAt: Date.now(),
                 updatedAt: Date.now(),
                 quality: StudyItemQuality.REFINED,
                 // Reset SRS
                 nextReview: Date.now(),
                 interval: 0,
                 easeFactor: 2.5,
                 consecutiveCorrect: 0,
                 forgotCount: 0,
                 lastReview: undefined,
                 learnedStatus: LearnedStatus.NEW,
                 lastTestResults: {},
                 libraryType,
                 // Apply local flags on top
                 isIdiom: isIdiom || serverItem.isIdiom,
                 isPhrasalVerb: isPhrasalVerb || serverItem.isPhrasalVerb,
                 isCollocation: isCollocation || serverItem.isCollocation,
                 isStandardPhrase: isStandardPhrase || serverItem.isStandardPhrase,
                 isPassive: isPassive,
                 isFocus: isFocus || !!serverItem.isFocus
             };
             // Recalc stats
             newItem.complexity = calculateComplexity(newItem);
             newItem.masteryScore = calculateMasteryScore(newItem);
             newItem.gameEligibility = calculateGameEligibility(newItem);
        } else {
            // Manual Creation (RAW)
            // Updated signature: groups is passed instead of tags
            newItem = await createNewWord(
                word, '', '', '', '', [], 
                isIdiom, isPhrasalVerb, 
                isCollocation, isStandardPhrase, isPassive, libraryType
            );
            newItem.userId = userId;
            newItem.isFocus = isFocus;
        }
        newItems.push(newItem);
      }
    }
    if (newItems.length > 0) {
      await dataStore.bulkSaveWords(newItems);
      // try {
      //   await autoRefineNewWords(newItems, user.nativeLanguage || 'Vietnamese');
      // } catch (error) {
      //   console.warn('[StudyItemList] Auto refine after add failed:', error);
      // }
    }
  };

  const handlePractice = (ids: Set<string>) => {
      const items = dataStore.getAllWords().filter(w => ids.has(w.id) && (w.libraryType || 'vocab') === libraryType);
      onStartSession(items);
  };

  // FIX: handleBulkDelete updated to accept Set<string> to match StudyItemTable prop expectation
  const handleBulkDelete = async (ids: Set<string>) => {
    await onBulkDelete(Array.from(ids));
  };
  
  const handleSaveEdit = (word: StudyItem) => {
    onUpdate(word);
    setEditingWord(null);
  };

  return (
    <>
      <StudyItemTable 
          user={user}
          words={words}
          total={total}
          loading={loading}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearch={setCurrentQuery}
          onSearchMeaningChange={setSearchMeaning}
          searchMeaning={searchMeaning}
          onFilterChange={(f) => {
             setCurrentFilters({ 
                 types: f.types, 
                 refined: f.refined, 
                 status: f.status, 
                 register: f.register,
                 composition: f.composition,
                 book: f.book,
                 specificBookId: f.specificBookId
             });
             setPage(0);
          }}
          onAddWords={handleAddWords}
          onViewWord={setViewingWord}
          onEditWord={setEditingWord}
          onDelete={async (w) => { await onDelete(w.id); }}
          onBulkDelete={onBulkDelete ? handleBulkDelete : undefined}
          onPractice={handlePractice}
          settingsKey={libraryType === 'kotoba' ? 'kotoba_pro_word_table_settings' : 'vocab_pro_word_table_settings'}
          context="library"
          initialFilter={initialFilter}
          forceExpandAdd={forceExpandAdd}
          onExpandAddConsumed={onExpandAddConsumed}
          showTagBrowserButton={true}
          tagTree={tagTree}
          selectedTag={selectedTag}
          onSelectTag={handleSelectTag}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onOpenWordBook={() => onNavigate && onNavigate('WORDBOOK')}
          libraryLabel={libraryLabel}
          showWordBook={libraryType === 'vocab'}
      />
      {viewingWord && (
          <ViewStudyItemModal 
            word={viewingWord} 
            onClose={() => setViewingWord(null)} 
            onNavigateToWord={setViewingWord} 
            onOpenWordFamilyGroup={(groupId) => {
              sessionStorage.setItem('vocab_pro_word_family_target_group_id', groupId);
              setViewingWord(null);
              onNavigate?.('WORD_FAMILY');
            }}
            onEditRequest={(w) => { setViewingWord(null); setEditingWord(w); }} 
            onUpdate={onUpdate} 
            onGainXp={async () => 0}
            onStartReviewSession={(word) => {
              console.log('[InlineReview][StudyItemList] open from ViewStudyItemModal', { word: word.word, id: word.id });
              setInlineReviewWords([word]);
            }}
          /> 
      )}
      {inlineReviewWords && (
          <div className="fixed inset-0 z-[130] bg-black/35 backdrop-blur-sm">
            <Suspense fallback={<div className="fixed inset-0 z-[131] flex items-center justify-center"><Loader2 className="animate-spin text-white" size={32} /></div>}>
              <div className="h-full overflow-y-auto p-4 md:p-8 bg-white">
                <ReviewSession
                  user={user}
                  sessionWords={inlineReviewWords}
                  sessionType="custom"
                  onUpdate={onUpdate}
                  onBulkUpdate={async (updatedWords) => {
                    await dataStore.bulkSaveWords(updatedWords);
                  }}
                  onComplete={() => {
                    console.log('[InlineReview][StudyItemList] onComplete -> closing overlay');
                    const reviewedWordId = inlineReviewWords[0]?.id;
                    if (reviewedWordId) {
                      const latestWord = dataStore.getWordById(reviewedWordId);
                      if (latestWord) {
                        setViewingWord((current) => current?.id === reviewedWordId ? latestWord : current);
                      }
                    }
                    setInlineReviewWords(null);
                  }}
                  onRetry={() => setInlineReviewWords((current) => current ? [...current] : current)}
                  autoCloseOnFinish={true}
                />
              </div>
            </Suspense>
          </div>
      )}
      {editingWord && (
          <EditStudyItemModal 
            user={user} 
            word={editingWord} 
            onSave={(w) => { handleSaveEdit(w); setViewingWord(w); }}
            onClose={() => setEditingWord(null)} 
            onSwitchToView={(w) => { setEditingWord(null); setViewingWord(w); }} 
          />
      )}
    </>
  );
};

export default StudyItemList;
