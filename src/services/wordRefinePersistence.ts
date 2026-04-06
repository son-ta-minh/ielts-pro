import { StudyItem, StudyItemQuality } from '../app/types';
import * as dataStore from '../app/dataStore';
import { createNewWord } from '../utils/srs';
import { mergeAiResultIntoWord, normalizeAiResponse } from '../utils/vocabUtils';
import { runWordRefineWithRetry } from './wordRefineApi';

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
            const originalWordCount = originalItem.word.trim().split(/\s+/).length;
            const newWordCount = suggestedHeadword.trim().split(/\s+/).length;

            if (originalWordCount !== newWordCount) {
                const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                if (existingHeadwordItem) {
                    const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, rawAiResult);
                    itemsToSave.push(mergedItem);
                } else {
                    const newItem = await createNewWord(
                        suggestedHeadword,
                        '',
                        '',
                        '',
                        '',
                        [],
                        false,
                        false,
                        false,
                        false,
                        false
                    );
                    newItem.userId = originalItem.userId;
                    const finalNewItem = mergeAiResultIntoWord(newItem, rawAiResult);
                    itemsToSave.push(finalNewItem);
                }
            } else {
                const isRenaming = suggestedHeadword.toLowerCase() !== originalItem.word.toLowerCase();
                if (isRenaming) {
                    const existingHeadwordItem = await dataStore.findWordByText(originalItem.userId, suggestedHeadword);
                    if (existingHeadwordItem && existingHeadwordItem.id !== originalItem.id) {
                        const mergedItem = mergeAiResultIntoWord(existingHeadwordItem, rawAiResult);
                        itemsToSave.push(mergedItem);
                        itemsToDeleteIds.push(originalItem.id);
                        renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
                    } else {
                        const updatedItem = mergeAiResultIntoWord(originalItem, rawAiResult);
                        updatedItem.word = suggestedHeadword;
                        itemsToSave.push(updatedItem);
                        renames.push({ id: originalItem.id, oldWord: originalItem.word, newWord: suggestedHeadword });
                    }
                } else {
                    itemsToSave.push(mergeAiResultIntoWord(originalItem, rawAiResult));
                }
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
