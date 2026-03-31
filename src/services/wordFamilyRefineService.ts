import { VocabularyItem, WordFamilyGroup } from '../app/types';
import * as db from '../app/db';
import * as dataStore from '../app/dataStore';
import { getConfig, getStudyBuddyAiUrl } from '../app/settingsManager';
import { getWordFamilyFormsPrompt } from './promptService';
import { inferWordFamilyBucket } from '../utils/studyBuddyUtils';
import { extractGroupTerms, isSingleWordCandidate, syncLibraryWordsForSavedGroup } from '../utils/wordFamilyGroupLinking';

type WordFamilyGroupData = Pick<WordFamilyGroup, 'verbs' | 'nouns' | 'adjectives' | 'adverbs'>;

const normalizeItems = (items: string[]): string[] => {
    const seen = new Set<string>();
    return items
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
        .filter((item) => {
            if (seen.has(item)) return false;
            seen.add(item);
            return true;
        });
};

const normalizeGroupData = (group: WordFamilyGroupData): WordFamilyGroupData => ({
    verbs: normalizeItems(group.verbs || []),
    nouns: normalizeItems(group.nouns || []),
    adjectives: normalizeItems(group.adjectives || []),
    adverbs: normalizeItems(group.adverbs || [])
});

const mergeGroupData = (left: WordFamilyGroupData, right: WordFamilyGroupData): WordFamilyGroupData => ({
    verbs: normalizeItems([...(left.verbs || []), ...(right.verbs || [])]),
    nouns: normalizeItems([...(left.nouns || []), ...(right.nouns || [])]),
    adjectives: normalizeItems([...(left.adjectives || []), ...(right.adjectives || [])]),
    adverbs: normalizeItems([...(left.adverbs || []), ...(right.adverbs || [])])
});

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

const extractWordFamilyJson = (rawText: string): WordFamilyGroupData => {
    const parsed = extractJsonBlock(rawText);
    const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
    if (candidate && typeof candidate === 'object') {
        return normalizeGroupData({
            verbs: Array.isArray(candidate?.verbs) ? candidate.verbs : [],
            nouns: Array.isArray(candidate?.nouns) ? candidate.nouns : [],
            adjectives: Array.isArray(candidate?.adjectives) ? candidate.adjectives : [],
            adverbs: Array.isArray(candidate?.adverbs) ? candidate.adverbs : []
        });
    }
    throw new Error('AI response is not a valid word family object.');
};

const buildSeedGroupFromWord = (word: VocabularyItem): WordFamilyGroupData => {
    const bucket = inferWordFamilyBucket(word.word, `${word.note || ''} ${word.meaningVi || ''}`);
    const headword = String(word.word || '').trim().toLowerCase();
    return normalizeGroupData({
        verbs: bucket === 'verbs' ? [headword] : [],
        nouns: bucket === 'nouns' ? [headword] : [],
        adjectives: bucket === 'adjs' ? [headword] : [],
        adverbs: bucket === 'advs' ? [headword] : []
    });
};

const findExistingGroupForWord = (word: VocabularyItem, groups: WordFamilyGroup[]): WordFamilyGroup | null => {
    if (word.wordFamilyGroupId) {
        const linked = groups.find((group) => group.id === word.wordFamilyGroupId);
        if (linked) return linked;
    }
    return groups.find((group) => extractGroupTerms(group).includes(word.word.trim().toLowerCase())) || null;
};

export const requestWordFamilyGroupRefine = async (group: WordFamilyGroupData): Promise<WordFamilyGroupData> => {
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

export const upsertWordFamilyGroupForWord = async (word: VocabularyItem): Promise<WordFamilyGroup | null> => {
    if (!isSingleWordCandidate(word.word)) return null;

    const userGroups = await db.getWordFamilyGroupsByUserId(word.userId);
    const existingGroup = findExistingGroupForWord(word, userGroups);
    const seedGroup = existingGroup
        ? mergeGroupData(normalizeGroupData(existingGroup), buildSeedGroupFromWord(word))
        : buildSeedGroupFromWord(word);
    const refinedGroup = await requestWordFamilyGroupRefine(seedGroup);
    const mergedGroup = mergeGroupData(seedGroup, refinedGroup);

    if (extractGroupTerms(mergedGroup).length === 0) {
        return null;
    }

    const now = Date.now();
    const nextGroup: WordFamilyGroup = existingGroup
        ? {
            ...existingGroup,
            ...mergedGroup,
            updatedAt: now
        }
        : {
            id: `wf-${now}-${Math.random().toString(36).slice(2, 8)}`,
            userId: word.userId,
            ...mergedGroup,
            createdAt: now,
            updatedAt: now
        };

    await db.saveWordFamilyGroup(nextGroup);
    return nextGroup;
};

export const refineAndLinkWordFamilyGroupsForWords = async (words: VocabularyItem[]): Promise<{
    groupsSaved: number;
    linkedWordsUpdated: number;
}> => {
    const pendingWordUpdates = new Map<string, VocabularyItem>();
    let groupsSaved = 0;

    for (const word of words) {
        let group: WordFamilyGroup | null = null;
        try {
            group = await upsertWordFamilyGroupForWord(word);
        } catch (error) {
            console.warn('[WordFamilyRefine] Failed to refine group for word:', word.word, error);
            continue;
        }
        if (!group) continue;
        groupsSaved += 1;

        const libraryWords = dataStore.getAllWords()
            .filter((item) => item.userId === word.userId)
            .map((item) => pendingWordUpdates.get(item.id) || item);
        const updates = syncLibraryWordsForSavedGroup(group, libraryWords);
        updates.forEach((item) => pendingWordUpdates.set(item.id, item));
    }

    if (pendingWordUpdates.size > 0) {
        await dataStore.bulkSaveWords(Array.from(pendingWordUpdates.values()));
    }

    return {
        groupsSaved,
        linkedWordsUpdated: pendingWordUpdates.size
    };
};
