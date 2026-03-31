import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User, WordFamilyGroup } from '../../../app/types';
import * as db from '../../../app/db';
import { useToast } from '../../../contexts/ToastContext';
import { WordFamilyUI } from './WordFamily_UI';
import { getConfig, getStudyBuddyAiUrl } from '../../../app/settingsManager';
import { getWordFamilyFormsPrompt } from '../../../services/promptService';

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

const extractJsonBlock = (rawText: string): any => {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] || rawText).trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const firstBracket = candidate.indexOf('[');
  const lastBracket = candidate.lastIndexOf(']');
  const objectSlice = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : null;
  const arraySlice = firstBracket >= 0 && lastBracket > firstBracket ? candidate.slice(firstBracket, lastBracket + 1) : null;
  return JSON.parse(objectSlice || arraySlice || candidate);
};

const extractWordFamilyJson = (rawText: string): { verbs: string[]; nouns: string[]; adjectives: string[]; adverbs: string[] } => {
  const parsed = extractJsonBlock(rawText);
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (candidate && typeof candidate === 'object') {
    return normalizeGroup({
      verbs: Array.isArray(candidate?.verbs) ? candidate.verbs : [],
      nouns: Array.isArray(candidate?.nouns) ? candidate.nouns : [],
      adjectives: Array.isArray(candidate?.adjectives) ? candidate.adjectives : [],
      adverbs: Array.isArray(candidate?.adverbs) ? candidate.adverbs : []
    });
  }
  throw new Error('AI response is not a valid word family object.');
};

const requestLocalWordFamilyRefine = async (group: WordFamilyGroup): Promise<{ verbs: string[]; nouns: string[]; adjectives: string[]; adverbs: string[] }> => {
  const aiUrl = getStudyBuddyAiUrl(getConfig());
  const response = await fetch(aiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: getWordFamilyFormsPrompt(group) }],
      temperature: 0.2,
      top_p: 0.85,
      repetition_penalty: 1.15,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`AI server error ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const rawText = payload?.choices?.[0]?.message?.content;
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('AI server returned empty content.');
  }
  try {
    return extractWordFamilyJson(rawText);
  } catch {
    const jsonDumpsMatch = rawText.match(/json\.dumps\s*\(\s*({[\s\S]*?})\s*\)/i);
    if (jsonDumpsMatch?.[1]) {
      const normalizedJson = jsonDumpsMatch[1]
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1');
      return extractWordFamilyJson(normalizedJson);
    }

    const pythonDictMatch = rawText.match(/return\s+({[\s\S]*?})/i) || rawText.match(/result\s*=\s*({[\s\S]*?})/i);
    if (pythonDictMatch?.[1]) {
      const normalizedJson = pythonDictMatch[1]
        .replace(/'/g, '"')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/,\s*([}\]])/g, '$1');
      return extractWordFamilyJson(normalizedJson);
    }

    throw new Error('AI response could not be parsed as word family JSON.');
  }
};

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
      await db.saveWordFamilyGroup(nextGroup);
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
      await db.deleteWordFamilyGroup(group.id);
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
      const refined = await requestLocalWordFamilyRefine(group);
      const nextGroup: WordFamilyGroup = {
        ...group,
        verbs: mergeItems(group.verbs, refined.verbs),
        nouns: mergeItems(group.nouns, refined.nouns),
        adjectives: mergeItems(group.adjectives, refined.adjectives),
        adverbs: mergeItems(group.adverbs, refined.adverbs),
        updatedAt: Date.now()
      };
      await db.saveWordFamilyGroup(nextGroup);
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
          const refined = await requestLocalWordFamilyRefine(group);
          const nextGroup: WordFamilyGroup = {
            ...group,
            verbs: mergeItems(group.verbs, refined.verbs),
            nouns: mergeItems(group.nouns, refined.nouns),
            adjectives: mergeItems(group.adjectives, refined.adjectives),
            adverbs: mergeItems(group.adverbs, refined.adverbs),
            updatedAt: Date.now()
          };
          await db.saveWordFamilyGroup(nextGroup);
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
