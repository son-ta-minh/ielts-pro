import { LearnedStatus, StudyItem, StudyLibraryType } from '../app/types';

export type DueReviewWordCount = 10 | 20 | 30;
export type DueReviewStatusFilter = 'LEARNED' | 'EASY' | 'HARD' | 'FORGOT';
export type DueReviewTypeFilter = 'VOCAB' | 'IDIOM' | 'PHRASAL' | 'COLLOC' | 'PHRASE';

export interface DueReviewScope {
  wordCount: DueReviewWordCount;
  statuses: DueReviewStatusFilter[];
  group: string | null;
  types: DueReviewTypeFilter[];
  focusOnly: boolean;
}

export type ReviewSetupMode = 'due' | 'new';

export const DEFAULT_DUE_REVIEW_SCOPE: DueReviewScope = {
  wordCount: 10,
  statuses: ['LEARNED', 'HARD', 'FORGOT'],
  group: null,
  types: ['VOCAB', 'IDIOM', 'PHRASAL', 'COLLOC', 'PHRASE'],
  focusOnly: false
};

const SKIPPED_TODAY_KEY = 'skippedTodayWords';

const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWordType = (word: StudyItem): DueReviewTypeFilter => {
  if (word.isIdiom) return 'IDIOM';
  if (word.isPhrasalVerb) return 'PHRASAL';
  if (word.isCollocation) return 'COLLOC';
  if (word.isStandardPhrase) return 'PHRASE';
  return 'VOCAB';
};

export const getSkippedTodayWordIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SKIPPED_TODAY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date?: string; wordIds?: string[] };
    if (parsed.date !== getTodayKey()) return [];
    return Array.isArray(parsed.wordIds) ? parsed.wordIds : [];
  } catch {
    return [];
  }
};

export const setSkippedTodayWordIds = (wordIds: string[]) => {
  if (typeof window === 'undefined') return;
  const uniqueWordIds = Array.from(new Set(wordIds));
  localStorage.setItem(SKIPPED_TODAY_KEY, JSON.stringify({
    date: getTodayKey(),
    wordIds: uniqueWordIds
  }));
};

export const addSkippedTodayWordId = (wordId: string) => {
  const current = getSkippedTodayWordIds();
  if (current.includes(wordId)) return;
  setSkippedTodayWordIds([...current, wordId]);
};

export const getAvailableReviewGroups = (words: StudyItem[], libraryType: StudyLibraryType, userId: string): string[] => {
  return Array.from(new Set(
    words
      .filter((word) => word.userId === userId && (word.libraryType || 'vocab') === libraryType)
      .flatMap((word) => word.groups || [])
      .map((group) => String(group || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
};

export const selectDueReviewWords = (
  words: StudyItem[],
  libraryType: StudyLibraryType,
  userId: string,
  scope: DueReviewScope,
  skippedTodayWordIds: string[] = getSkippedTodayWordIds(),
): StudyItem[] => {
  const now = Date.now();
  const skippedSet = new Set(skippedTodayWordIds);

  return words
    .filter((word) => word.userId === userId)
    .filter((word) => (word.libraryType || 'vocab') === libraryType)
    .filter((word) => !word.isPassive)
    .filter((word) => word.learnedStatus !== LearnedStatus.IGNORED)
    .filter((word) => !!word.lastReview && word.nextReview <= now)
    .filter((word) => !skippedSet.has(word.id))
    .filter((word) => scope.statuses.length === 0 || scope.statuses.includes(word.learnedStatus as DueReviewStatusFilter))
    .filter((word) => !scope.group || !!word.groups?.some((group) => String(group || '').trim() === scope.group))
    .filter((word) => scope.types.length === 0 || scope.types.includes(getWordType(word)))
    .filter((word) => !scope.focusOnly || !!word.isFocus)
    .sort((a, b) => a.nextReview - b.nextReview)
    .slice(0, scope.wordCount);
};

export const selectNewReviewWords = (
  words: StudyItem[],
  libraryType: StudyLibraryType,
  userId: string,
  scope: DueReviewScope,
): StudyItem[] => {
  return words
    .filter((word) => word.userId === userId)
    .filter((word) => (word.libraryType || 'vocab') === libraryType)
    .filter((word) => !word.isPassive)
    .filter((word) => !word.lastReview)
    .filter((word) => word.quality !== 'RAW')
    .filter((word) => !scope.group || !!word.groups?.some((group) => String(group || '').trim() === scope.group))
    .filter((word) => scope.types.length === 0 || scope.types.includes(getWordType(word)))
    .filter((word) => !scope.focusOnly || !!word.isFocus)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, scope.wordCount);
};
