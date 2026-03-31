import { VocabularyItem, WordFamilyGroup } from '../app/types';
import * as db from '../app/db';

const normalizeItems = (items: string[]): string[] => {
    const seen = new Set<string>();
    return items
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .filter((item) => {
            if (seen.has(item)) return false;
            seen.add(item);
            return true;
        });
};

const mergeItems = (left: string[], right: string[]) => normalizeItems([...left, ...right]);

export const isSingleWordCandidate = (text: string): boolean => {
    const trimmed = String(text || '').trim();
    return !!trimmed && trimmed.split(/\s+/).length === 1;
};

export const extractGroupTerms = (group: Pick<WordFamilyGroup, 'verbs' | 'nouns' | 'adjectives' | 'adverbs'>): string[] => {
    return normalizeItems([
        ...(group.verbs || []),
        ...(group.nouns || []),
        ...(group.adjectives || []),
        ...(group.adverbs || [])
    ]);
};

export const extractGroupDataFromWord = (word: VocabularyItem): Pick<WordFamilyGroup, 'verbs' | 'nouns' | 'adjectives' | 'adverbs'> => ({
    verbs: normalizeItems((word.wordFamily?.verbs || []).map((item) => item.word)),
    nouns: normalizeItems((word.wordFamily?.nouns || []).map((item) => item.word)),
    adjectives: normalizeItems((word.wordFamily?.adjs || []).map((item) => item.word)),
    adverbs: normalizeItems((word.wordFamily?.advs || []).map((item) => item.word))
});

const hasGroupData = (group: Pick<WordFamilyGroup, 'verbs' | 'nouns' | 'adjectives' | 'adverbs'>): boolean => {
    return extractGroupTerms(group).length > 0;
};

const buildGroupFromWord = (word: VocabularyItem): WordFamilyGroup => {
    const now = Date.now();
    const data = extractGroupDataFromWord(word);
    return {
        id: `wf-${now}-${Math.random().toString(36).slice(2, 8)}`,
        userId: word.userId,
        verbs: data.verbs,
        nouns: data.nouns,
        adjectives: data.adjectives,
        adverbs: data.adverbs,
        createdAt: now,
        updatedAt: now
    };
};

const groupContainsWord = (group: WordFamilyGroup, word: string): boolean => {
    return extractGroupTerms(group).includes(word.trim().toLowerCase());
};

const getGroupsByUser = async (userId: string) => {
    return db.getWordFamilyGroupsByUserId(userId);
};

export const linkWordsToExistingWordFamilyGroups = async (words: VocabularyItem[]): Promise<VocabularyItem[]> => {
    const updates: VocabularyItem[] = [];
    const groupsByUser = new Map<string, WordFamilyGroup[]>();

    for (const word of words) {
        if (!isSingleWordCandidate(word.word)) continue;
        if (!groupsByUser.has(word.userId)) {
            groupsByUser.set(word.userId, await getGroupsByUser(word.userId));
        }
        const userGroups = groupsByUser.get(word.userId) || [];
        const match = userGroups.find((group) => groupContainsWord(group, word.word));
        const nextId = match?.id || null;
        if ((word.wordFamilyGroupId || null) !== nextId) {
            updates.push({ ...word, wordFamilyGroupId: nextId });
        }
    }

    return updates;
};

export const syncRefinedWordsToWordFamilyGroups = async (words: VocabularyItem[]): Promise<VocabularyItem[]> => {
    const results = [...words];
    const groupsByUser = new Map<string, WordFamilyGroup[]>();

    for (let index = 0; index < results.length; index += 1) {
        const word = results[index];
        if (!isSingleWordCandidate(word.word)) continue;

        if (!groupsByUser.has(word.userId)) {
            groupsByUser.set(word.userId, await getGroupsByUser(word.userId));
        }
        const userGroups = groupsByUser.get(word.userId) || [];
        const extracted = extractGroupDataFromWord(word);

        let group = userGroups.find((item) => item.id === word.wordFamilyGroupId)
            || userGroups.find((item) => groupContainsWord(item, word.word))
            || null;

        if (!group && !hasGroupData(extracted)) {
            continue;
        }

        if (!group) {
            group = buildGroupFromWord(word);
            await db.saveWordFamilyGroup(group);
            userGroups.unshift(group);
        } else if (hasGroupData(extracted)) {
            const nextGroup: WordFamilyGroup = {
                ...group,
                verbs: mergeItems(group.verbs, extracted.verbs),
                nouns: mergeItems(group.nouns, extracted.nouns),
                adjectives: mergeItems(group.adjectives, extracted.adjectives),
                adverbs: mergeItems(group.adverbs, extracted.adverbs),
                updatedAt: Date.now()
            };
            await db.saveWordFamilyGroup(nextGroup);
            const targetIndex = userGroups.findIndex((item) => item.id === nextGroup.id);
            if (targetIndex >= 0) userGroups[targetIndex] = nextGroup;
            group = nextGroup;
        }

        if (group && word.wordFamilyGroupId !== group.id) {
            results[index] = { ...word, wordFamilyGroupId: group.id };
        }
    }

    return results;
};

export const syncLibraryWordsForSavedGroup = (group: WordFamilyGroup, libraryWords: VocabularyItem[]): VocabularyItem[] => {
    const terms = new Set(extractGroupTerms(group));
    const updates: VocabularyItem[] = [];

    libraryWords.forEach((word) => {
        if (word.userId !== group.userId || !isSingleWordCandidate(word.word)) return;
        const inGroup = terms.has(word.word.trim().toLowerCase());
        const currentId = word.wordFamilyGroupId || null;
        const nextId = inGroup ? group.id : (currentId === group.id ? null : currentId);
        if (currentId !== nextId) {
            updates.push({ ...word, wordFamilyGroupId: nextId });
        }
    });

    return updates;
};

export const unlinkLibraryWordsFromDeletedGroup = (groupId: string, libraryWords: VocabularyItem[]): VocabularyItem[] => {
    return libraryWords
        .filter((word) => (word.wordFamilyGroupId || null) === groupId)
        .map((word) => ({ ...word, wordFamilyGroupId: null }));
};

export const clearStaleWordFamilyGroupLink = async (word: VocabularyItem): Promise<VocabularyItem> => {
    if (!word.wordFamilyGroupId) return word;
    const groups = await getGroupsByUser(word.userId);
    const exists = groups.some((group) => group.id === word.wordFamilyGroupId);
    return exists ? word : { ...word, wordFamilyGroupId: null };
};
