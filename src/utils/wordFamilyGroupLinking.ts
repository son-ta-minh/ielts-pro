import { StudyItem, WordFamilyGroup } from '../app/types';
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

const groupContainsWord = (group: WordFamilyGroup, word: string): boolean => {
    return extractGroupTerms(group).includes(word.trim().toLowerCase());
};

const getGroupsByUser = async (userId: string) => {
    return db.getWordFamilyGroupsByUserId(userId);
};

export const linkWordsToExistingWordFamilyGroups = async (words: StudyItem[]): Promise<StudyItem[]> => {
    const updates: StudyItem[] = [];
    const groupsByUser = new Map<string, WordFamilyGroup[]>();

    for (const word of words) {
        if (!isSingleWordCandidate(word.word)) continue;
        if (!groupsByUser.has(word.userId)) {
            groupsByUser.set(word.userId, await getGroupsByUser(word.userId));
        }
        const userGroups = groupsByUser.get(word.userId) || [];
        const currentGroup = word.wordFamilyGroupId
            ? userGroups.find((group) => group.id === word.wordFamilyGroupId) || null
            : null;
        const match = userGroups.find((group) => groupContainsWord(group, word.word));
        const nextId = currentGroup?.id || match?.id || null;
        if ((word.wordFamilyGroupId || null) !== nextId) {
            updates.push({ ...word, wordFamilyGroupId: nextId });
        }
    }

    return updates;
};

export const syncLibraryWordsForSavedGroup = (group: WordFamilyGroup, libraryWords: StudyItem[]): StudyItem[] => {
    const terms = new Set(extractGroupTerms(group));
    const updates: StudyItem[] = [];

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

export const unlinkLibraryWordsFromDeletedGroup = (groupId: string, libraryWords: StudyItem[]): StudyItem[] => {
    return libraryWords
        .filter((word) => (word.wordFamilyGroupId || null) === groupId)
        .map((word) => ({ ...word, wordFamilyGroupId: null }));
};

export const clearStaleWordFamilyGroupLink = async (word: StudyItem): Promise<StudyItem> => {
    if (!word.wordFamilyGroupId) return word;
    const groups = await getGroupsByUser(word.userId);
    const exists = groups.some((group) => group.id === word.wordFamilyGroupId);
    return exists ? word : { ...word, wordFamilyGroupId: null };
};
