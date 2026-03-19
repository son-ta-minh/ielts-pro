import { ReviewGrade, VocabularyItem, WordQuality } from '../app/types';
import * as dataStore from '../app/dataStore';

const DEFAULT_LIMIT = 12;

export interface StudyWordContext {
  word: string;
  meaningVi: string;
  example: string;
  note: string;
  lastGrade?: ReviewGrade;
  forgotCount: number;
  consecutiveCorrect: number;
  masteryScore: number;
  nextReview: number;
  lastReview?: number;
  isFocus: boolean;
  quality: WordQuality;
  groups: string[];
}

export interface StudyContextSnapshot {
  userId: string | null;
  generatedAt: number;
  totals: {
    totalActiveWords: number;
    learnedWords: number;
    newWords: number;
    dueWords: number;
    focusWords: number;
    hardWords: number;
    forgotWords: number;
  };
  recentlyLearnedWords: StudyWordContext[];
  mostForgottenWords: StudyWordContext[];
  hardestWords: StudyWordContext[];
  focusWords: StudyWordContext[];
}

const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vocab_pro_current_user_id');
};

const normalizeWordContext = (word: VocabularyItem): StudyWordContext => ({
  word: word.word,
  meaningVi: word.meaningVi || '',
  example: word.example || '',
  note: word.note || '',
  lastGrade: word.lastGrade,
  forgotCount: word.forgotCount || 0,
  consecutiveCorrect: word.consecutiveCorrect || 0,
  masteryScore: word.masteryScore ?? 0,
  nextReview: word.nextReview || 0,
  lastReview: word.lastReview,
  isFocus: !!word.isFocus,
  quality: word.quality,
  groups: word.groups || [],
});

const getActiveWordsForCurrentUser = (): VocabularyItem[] => {
  const userId = getCurrentUserId();
  if (!userId) return [];

  return dataStore
    .getAllWords()
    .filter((word) => word.userId === userId && !word.isPassive && word.quality !== WordQuality.FAILED);
};

const sortByRecentLearned = (words: VocabularyItem[]) =>
  [...words].sort((a, b) => {
    const aTime = a.lastReview || a.updatedAt || 0;
    const bTime = b.lastReview || b.updatedAt || 0;
    return bTime - aTime;
  });

const sortByForgotSeverity = (words: VocabularyItem[]) =>
  [...words].sort((a, b) => {
    const forgotDiff = (b.forgotCount || 0) - (a.forgotCount || 0);
    if (forgotDiff !== 0) return forgotDiff;

    const gradeWeight = (item: VocabularyItem) => item.lastGrade === ReviewGrade.FORGOT ? 2 : item.lastGrade === ReviewGrade.HARD ? 1 : 0;
    const gradeDiff = gradeWeight(b) - gradeWeight(a);
    if (gradeDiff !== 0) return gradeDiff;

    return (a.masteryScore ?? 0) - (b.masteryScore ?? 0);
  });

const sortByHardness = (words: VocabularyItem[]) =>
  [...words].sort((a, b) => {
    const aScore = [
      a.lastGrade === ReviewGrade.HARD ? 3 : 0,
      a.lastGrade === ReviewGrade.FORGOT ? 2 : 0,
      a.isFocus ? 1 : 0,
      -(a.masteryScore ?? 0),
      a.forgotCount || 0,
    ];
    const bScore = [
      b.lastGrade === ReviewGrade.HARD ? 3 : 0,
      b.lastGrade === ReviewGrade.FORGOT ? 2 : 0,
      b.isFocus ? 1 : 0,
      -(b.masteryScore ?? 0),
      b.forgotCount || 0,
    ];

    for (let i = 0; i < aScore.length; i += 1) {
      const diff = Number(bScore[i]) - Number(aScore[i]);
      if (diff !== 0) return diff;
    }
    return (a.word || '').localeCompare(b.word || '');
  });

export const getStudyContextSnapshot = (): StudyContextSnapshot => {
  const userId = getCurrentUserId();
  const words = getActiveWordsForCurrentUser();
  const now = Date.now();

  const recentlyLearnedWords = sortByRecentLearned(
    words.filter((word) => word.lastGrade === ReviewGrade.LEARNED || (!word.lastGrade && !!word.lastReview))
  )
    .slice(0, DEFAULT_LIMIT)
    .map(normalizeWordContext);

  const mostForgottenWords = sortByForgotSeverity(
    words.filter((word) => (word.forgotCount || 0) > 0 || word.lastGrade === ReviewGrade.FORGOT)
  )
    .slice(0, DEFAULT_LIMIT)
    .map(normalizeWordContext);

  const hardestWords = sortByHardness(
    words.filter((word) => word.lastGrade === ReviewGrade.HARD || word.lastGrade === ReviewGrade.FORGOT || (word.masteryScore ?? 0) < 45)
  )
    .slice(0, DEFAULT_LIMIT)
    .map(normalizeWordContext);

  const focusWords = sortByHardness(words.filter((word) => !!word.isFocus))
    .slice(0, DEFAULT_LIMIT)
    .map(normalizeWordContext);

  return {
    userId,
    generatedAt: now,
    totals: {
      totalActiveWords: words.length,
      learnedWords: words.filter((word) => !!word.lastReview).length,
      newWords: words.filter((word) => !word.lastReview).length,
      dueWords: words.filter((word) => !!word.lastReview && word.nextReview <= now).length,
      focusWords: words.filter((word) => !!word.isFocus).length,
      hardWords: words.filter((word) => word.lastGrade === ReviewGrade.HARD).length,
      forgotWords: words.filter((word) => word.lastGrade === ReviewGrade.FORGOT).length,
    },
    recentlyLearnedWords,
    mostForgottenWords,
    hardestWords,
    focusWords,
  };
};

export const getRecentlyLearnedWordsContext = (): StudyWordContext[] =>
  getStudyContextSnapshot().recentlyLearnedWords;

export const getMostForgottenWordsContext = (): StudyWordContext[] =>
  getStudyContextSnapshot().mostForgottenWords;

export const getHardWordsContext = (): StudyWordContext[] =>
  getStudyContextSnapshot().hardestWords;

export const getFocusWordsContext = (): StudyWordContext[] =>
  getStudyContextSnapshot().focusWords;

export const getAiStudyContextText = (): string => {
  const snapshot = getStudyContextSnapshot();

  const formatWords = (title: string, words: StudyWordContext[]) => {
    if (words.length === 0) return `${title}: none`;
    return [
      `${title}:`,
      ...words.map((word, index) =>
        `${index + 1}. ${word.word} | vi: ${word.meaningVi || '-'} | forgot=${word.forgotCount} | mastery=${word.masteryScore} | lastGrade=${word.lastGrade || 'N/A'}${word.isFocus ? ' | FOCUS' : ''}`
      ),
    ].join('\n');
  };

  return [
    `Study context generated at: ${new Date(snapshot.generatedAt).toISOString()}`,
    `User ID: ${snapshot.userId || 'unknown'}`,
    `Totals: active=${snapshot.totals.totalActiveWords}, learned=${snapshot.totals.learnedWords}, new=${snapshot.totals.newWords}, due=${snapshot.totals.dueWords}, focus=${snapshot.totals.focusWords}, hard=${snapshot.totals.hardWords}, forgot=${snapshot.totals.forgotWords}`,
    formatWords('Recently learned words', snapshot.recentlyLearnedWords),
    formatWords('Most forgotten words', snapshot.mostForgottenWords),
    formatWords('Hard words', snapshot.hardestWords),
    formatWords('Focus words for deep dive', snapshot.focusWords),
  ].join('\n\n');
};
