import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User, WordFamilyGroup } from '../../../app/types';
import * as db from '../../../app/db';
import * as dataStore from '../../../app/dataStore';
import { useToast } from '../../../contexts/ToastContext';
import { WordFamilyUI } from './WordFamily_UI';
import { requestWordFamilyGroupRefine } from '../../../services/wordFamilyRefineService';
import { syncLibraryWordsForSavedGroup, unlinkLibraryWordsFromDeletedGroup } from '../../../utils/wordFamilyGroupLinking';

interface Props {
  user: User;
}

const normalizeItems = (items: string[]): string[] => {
  const seen = new Set<string>();
  return items
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.toLowerCase())
    .filter(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const normalizeGroup = (group: Pick<WordFamilyGroup, 'verbs' | 'nouns' | 'adjectives' | 'adverbs'>) => ({
  verbs: normalizeItems(group.verbs),
  nouns: normalizeItems(group.nouns),
  adjectives: normalizeItems(group.adjectives),
  adverbs: normalizeItems(group.adverbs)
});

const mergeItems = (existing: string[], incoming: string[]) => normalizeItems([...existing, ...incoming]);

const getGroupLabel = (group: WordFamilyGroup) => (
  group.verbs[0] ||
  group.nouns[0] ||
  group.adjectives[0] ||
  group.adverbs[0] ||
  'group'
);

const groupSearchText = (group: WordFamilyGroup) =>
  [group.verbs, group.nouns, group.adjectives, group.adverbs].flat().join(' ').toLowerCase();

const buildEmptyGroup = (userId: string): WordFamilyGroup => {
  const now = Date.now();
  return {
    id: `wf-${now}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    verbs: [],
    nouns: [],
    adjectives: [],
    adverbs: [],
    createdAt: now,
    updatedAt: now
  };
};

const WordFamily: React.FC<Props> = ({ user }) => {
  const [groups, setGroups] = useState<WordFamilyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WordFamilyGroup | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  useEffect(() => {
    const targetGroupId = sessionStorage.getItem('vocab_pro_word_family_target_group_id');
    if (!targetGroupId || groups.length === 0) return;

    const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
    if (targetIndex === -1) {
      sessionStorage.removeItem('vocab_pro_word_family_target_group_id');
      return;
    }

    setSelectedIds(new Set([targetGroupId]));
    setPage(Math.floor(targetIndex / pageSize));
    sessionStorage.removeItem('vocab_pro_word_family_target_group_id');
  }, [groups, pageSize]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const userGroups = await db.getWordFamilyGroupsByUserId(user.id);
      setGroups(userGroups.sort((a, b) => b.updatedAt - a.updatedAt));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(group => groupSearchText(group).includes(q));
  }, [groups, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));

  const pagedGroups = useMemo(() => {
    const safePage = Math.min(page, totalPages - 1);
    const start = safePage * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, page, pageSize, totalPages]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const handleNew = () => {
    setEditingGroup(null);
    setIsModalOpen(true);
  };

  const handleEdit = (group: WordFamilyGroup) => {
    setEditingGroup(group);
    setIsModalOpen(true);
  };

  const handleSave = async (value: { verbs: string[]; nouns: string[]; adjectives: string[]; adverbs: string[] }) => {
    const normalized = normalizeGroup(value);
    const totalWords = normalized.verbs.length + normalized.nouns.length + normalized.adjectives.length + normalized.adverbs.length;
    if (totalWords === 0) {
      showToast('Please enter at least one word.', 'info');
      return;
    }

    const base = editingGroup || buildEmptyGroup(user.id);
    const now = Date.now();
    const nextGroup: WordFamilyGroup = {
      ...base,
      ...normalized,
      userId: user.id,
      updatedAt: now,
      createdAt: editingGroup?.createdAt || now
    };

    try {
      setIsSaving(true);
      await dataStore.saveWordFamilyGroup(nextGroup);
      const libraryUpdates = syncLibraryWordsForSavedGroup(nextGroup, dataStore.getAllWords());
      if (libraryUpdates.length > 0) {
        await dataStore.bulkSaveWords(libraryUpdates);
      }
      showToast(editingGroup ? 'Word family updated.' : 'Word family created.', 'success');
      setIsModalOpen(false);
      setEditingGroup(null);
      await loadData();
    } catch (error: any) {
      showToast(error?.message || 'Failed to save word family.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (group: WordFamilyGroup) => {
    try {
      await dataStore.deleteWordFamilyGroup(group.id);
      const libraryUpdates = unlinkLibraryWordsFromDeletedGroup(group.id, dataStore.getAllWords());
      if (libraryUpdates.length > 0) {
        await dataStore.bulkSaveWords(libraryUpdates);
      }
      showToast('Word family deleted.', 'success');
      await loadData();
    } catch {
      showToast('Failed to delete word family.', 'error');
    }
  };

  const handleRefine = async (group: WordFamilyGroup) => {
    const seedCount = group.verbs.length + group.nouns.length + group.adjectives.length + group.adverbs.length;
    if (seedCount === 0) {
      showToast('Please add at least one word before auto refine.', 'info');
      return;
    }

    try {
      setIsSaving(true);
      const refined = await requestWordFamilyGroupRefine(group);
      const nextGroup: WordFamilyGroup = {
        ...group,
        verbs: mergeItems(group.verbs, refined.verbs),
        nouns: mergeItems(group.nouns, refined.nouns),
        adjectives: mergeItems(group.adjectives, refined.adjectives),
        adverbs: mergeItems(group.adverbs, refined.adverbs),
        updatedAt: Date.now()
      };
      await dataStore.saveWordFamilyGroup(nextGroup);
      const libraryUpdates = syncLibraryWordsForSavedGroup(nextGroup, dataStore.getAllWords());
      if (libraryUpdates.length > 0) {
        await dataStore.bulkSaveWords(libraryUpdates);
      }
      showToast('Word family refined.', 'success');
      await loadData();
    } catch (error: any) {
      showToast(error?.message || 'Auto refine failed.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefineSelected = async () => {
    const groupsToRefine = groups.filter(group => selectedIds.has(group.id));
    if (groupsToRefine.length === 0) {
      showToast('Please select word family groups to refine.', 'info');
      return;
    }

    const validGroups = groupsToRefine.filter(group =>
      group.verbs.length + group.nouns.length + group.adjectives.length + group.adverbs.length > 0
    );

    if (validGroups.length === 0) {
      showToast('Selected groups need at least one seed word.', 'info');
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    let failedCount = 0;

    try {
      for (const group of validGroups) {
        try {
          const refined = await requestWordFamilyGroupRefine(group);
          const nextGroup: WordFamilyGroup = {
            ...group,
            verbs: mergeItems(group.verbs, refined.verbs),
            nouns: mergeItems(group.nouns, refined.nouns),
            adjectives: mergeItems(group.adjectives, refined.adjectives),
            adverbs: mergeItems(group.adverbs, refined.adverbs),
            updatedAt: Date.now()
          };
          await dataStore.saveWordFamilyGroup(nextGroup);
          const libraryUpdates = syncLibraryWordsForSavedGroup(nextGroup, dataStore.getAllWords());
          if (libraryUpdates.length > 0) {
            await dataStore.bulkSaveWords(libraryUpdates);
          }
          successCount += 1;
          showToast(`Refined "${getGroupLabel(group)}".`, 'success', 1800);
        } catch {
          failedCount += 1;
          showToast(`Failed to refine "${getGroupLabel(group)}".`, 'error', 2200);
        }
      }

      await loadData();
      setSelectedIds(new Set());
      showToast(`Auto refine finished: ${successCount} success, ${failedCount} failed.`, failedCount > 0 ? 'info' : 'success');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <WordFamilyUI
        loading={loading}
        groups={pagedGroups}
        totalCount={filteredGroups.length}
        totalPages={totalPages}
        page={Math.min(page, totalPages - 1)}
        pageSize={pageSize}
        searchQuery={searchQuery}
        isSaving={isSaving}
        isModalOpen={isModalOpen}
        editingGroup={editingGroup}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onSearchChange={setSearchQuery}
        onPageChange={setPage}
        onPageSizeChange={(value) => setPageSize(Math.min(200, Math.max(5, value || 15)))}
        onNew={handleNew}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRefine={handleRefine}
        onRefineSelected={handleRefineSelected}
        onSave={handleSave}
        onCloseModal={() => {
          setIsModalOpen(false);
          setEditingGroup(null);
        }}
      />
    </>
  );
};

export default WordFamily;
