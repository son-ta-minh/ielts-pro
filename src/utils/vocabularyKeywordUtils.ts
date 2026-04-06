import { StudyItem } from '../app/types';
import { buildIgnoredTokenRemovalVariants } from './headwordHighlightMap';

export function normalizeKeywordText(value: string): string {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export function normalizeVocabularyKeywords(
    keywords?: string[] | null,
    headword?: string | null
): string[] {
    const normalizedHeadword = normalizeKeywordText(headword || '');
    const seen = new Set<string>();
    const result: string[] = [];

    (keywords || []).forEach((keyword) => {
        const cleaned = String(keyword || '').trim().replace(/\s+/g, ' ');
        const normalized = normalizeKeywordText(cleaned);
        if (!normalized) return;
        if (normalized === normalizedHeadword) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        result.push(cleaned);
    });

    return result;
}

export function withNormalizedVocabularyKeywords<T extends Pick<StudyItem, 'word' | 'keywords'>>(item: T): T {
    return {
        ...item,
        keywords: normalizeVocabularyKeywords(item.keywords, item.word)
    };
}

export function hasExactKeywordMatch(item: Pick<StudyItem, 'keywords'>, text: string): boolean {
    const target = normalizeKeywordText(text);
    if (!target) return false;
    return (item.keywords || []).some((keyword) => normalizeKeywordText(keyword) === target);
}

export function matchesVocabularyHeadwordOrKeyword(item: Pick<StudyItem, 'word' | 'keywords'>, text: string): boolean {
    const target = normalizeKeywordText(text);
    if (!target) return false;
    if (normalizeKeywordText(item.word) === target) return true;
    return hasExactKeywordMatch(item, text);
}

export function findWordByHeadwordOrKeyword(words: StudyItem[], userId: string, text: string): StudyItem | null {
    const target = normalizeKeywordText(text);
    if (!target) return null;

    const headwordMatch = words.find((item) => item.userId === userId && normalizeKeywordText(item.word) === target);
    if (headwordMatch) return headwordMatch;

    return words.find((item) => item.userId === userId && hasExactKeywordMatch(item, text)) || null;
}

export function findWordByStudyBuddyLookup(words: StudyItem[], userId: string, text: string): StudyItem | null {
    const directMatch = findWordByHeadwordOrKeyword(words, userId, text);
    if (directMatch) return directMatch;

    const fallbackCandidates = buildIgnoredTokenRemovalVariants(text);
    for (const candidate of fallbackCandidates) {
        const fallbackMatch = findWordByHeadwordOrKeyword(words, userId, candidate);
        if (fallbackMatch) return fallbackMatch;
    }

    const target = normalizeKeywordText(text);
    const userWords = words.filter((item) => item.userId === userId);
    for (const item of userWords) {
        const headwordVariants = buildIgnoredTokenRemovalVariants(item.word);
        if (headwordVariants.some((variant) => normalizeKeywordText(variant) === target)) {
            return item;
        }

        const keywordVariants = (item.keywords || []).flatMap((keyword) => buildIgnoredTokenRemovalVariants(keyword));
        if (keywordVariants.some((variant) => normalizeKeywordText(variant) === target)) {
            return item;
        }
    }

    return null;
}
