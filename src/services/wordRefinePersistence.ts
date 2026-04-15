import { StudyItem, StudyItemQuality } from '../app/types';
import * as dataStore from '../app/dataStore';
import { mergeAiResultIntoWord, normalizeAiResponse } from '../utils/vocabUtils';
import { runWordRefineWithRetry } from './wordRefineApi';

const JAPANESE_SCRIPT_PATTERN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

const looksJapaneseText = (value: string): boolean => {
    const text = String(value || '').trim();
    if (!text) return false;
    return JAPANESE_SCRIPT_PATTERN.test(text);
};

export const applyAiRefinementResultsToWords = async (
    results: any[],
    targetWords: StudyItem[],
    onWordRenamed?: (renames: { id: string; oldWord: string; newWord: string }[]) => void
): Promise<{
    itemsSaved: number;
    itemsDeleted: number;
    renamedCount: number;
}> => {
    if (!Array.isArray(results)) throw new Error('Response must be an array.');

    const applyHeadwordRenameToOriginalItem = (
        originalItem: StudyItem,
        rawAiResult: any,
        suggestedHeadword: string
    ): StudyItem => {
        const oldWord = originalItem.word.trim();
        const nextHeadword = suggestedHeadword.trim();
        const updatedItem = mergeAiResultIntoWord(originalItem, rawAiResult);

        updatedItem.word = nextHeadword;
        updatedItem.display = oldWord;

        return updatedItem;
    };

    const aiMap = new Map<string, any[]>();
    results.forEach((rawResult) => {
        const key = String(rawResult?.og || rawResult?.original || rawResult?.hw || rawResult?.headword || '')
            .trim()
            .toLowerCase();
        if (!key) return;
        if (!aiMap.has(key)) aiMap.set(key, []);
        aiMap.get(key)?.push(rawResult);
    });

    const originalWordsMap = new Map<string, StudyItem>(
        targetWords.map((word) => [word.word.toLowerCase(), word])
    );
    const itemsToSave: StudyItem[] = [];
    const itemsToDeleteIds: string[] = [];
    const renames: { id: string; oldWord: string; newWord: string }[] = [];

    for (const [originalKey, originalItem] of originalWordsMap) {
        const candidates = aiMap.get(originalKey);
        if (!candidates || candidates.length === 0) continue;

        const rawAiResult = candidates[0];
        const tempNormalized = normalizeAiResponse(rawAiResult);
        const suggestedHeadword = String(
            rawAiResult?.hw ||
            rawAiResult?.headword ||
            tempNormalized?.headword ||
            tempNormalized?.word ||
            ''
        ).trim();

        if (suggestedHeadword) {
            const canRename = originalItem.libraryType !== 'kotoba' || looksJapaneseText(suggestedHeadword);
            const isRenaming = canRename && suggestedHeadword.toLowerCase() !== originalItem.word.toLowerCase();
            if (isRenaming) {
                itemsToSave.push(applyHeadwordRenameToOriginalItem(originalItem, rawAiResult, suggestedHeadword));
                renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
            } else {
                itemsToSave.push(mergeAiResultIntoWord(originalItem, rawAiResult));
            }
        } else {
            itemsToSave.push(mergeAiResultIntoWord(originalItem, rawAiResult));
        }
    }

    if (itemsToDeleteIds.length > 0) await dataStore.bulkDeleteWords(itemsToDeleteIds);
    if (itemsToSave.length > 0) {
        await dataStore.bulkSaveWords(itemsToSave);
        if (renames.length > 0 && onWordRenamed) onWordRenamed(renames);
    }

    return {
        itemsSaved: itemsToSave.length,
        itemsDeleted: itemsToDeleteIds.length,
        renamedCount: renames.length
    };
};

export const autoRefineNewWords = async (
    words: StudyItem[],
    nativeLanguage: string = 'Vietnamese',
    onWordRenamed?: (renames: { id: string; oldWord: string; newWord: string }[]) => void
): Promise<{
    refinedCount: number;
    finalIssuesCount: number;
}> => {
    const wordsToRefine = words.filter((word) =>
        word.quality === StudyItemQuality.RAW
    );

    if (wordsToRefine.length === 0) {
        return { refinedCount: 0, finalIssuesCount: 0 };
    }

    const { results, finalIssues } = await runWordRefineWithRetry(wordsToRefine, nativeLanguage);
    const persistence = await applyAiRefinementResultsToWords(results, wordsToRefine, onWordRenamed);

    return {
        refinedCount: persistence.itemsSaved,
        finalIssuesCount: finalIssues.length
    };
};
