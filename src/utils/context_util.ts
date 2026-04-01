import { LearnedStatus, VocabularyItem, WordQuality } from '../app/types';
import * as dataStore from '../app/dataStore';
import { isSrsIgnored } from './srs';

const DEFAULT_LIMIT = 12;
const SEARCH_MAX_RESULTS = 8;
const SEARCH_MAX_HITS_PER_WORD = 5;

export interface StudyWordContext {
  word: string;
  meaningVi: string;
  example: string;
  note: string;
  learnedStatus: LearnedStatus;
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

export interface VocabularySearchHit {
  path: string;
  value: string;
}

export interface VocabularySearchResult {
  word: VocabularyItem;
  hits: VocabularySearchHit[];
  score: number;
  matchedQueries: string[];
}

export interface VocabularySearchContextPayload {
  text: string;
  resultCount: number;
  results: VocabularySearchResult[];
  queries: string[];
}

const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vocab_pro_current_user_id');
};

const collectTextNodes = (value: unknown, path: string, output: VocabularySearchHit[]) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) output.push({ path, value: trimmed });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectTextNodes(item, `${path}[${index}]`, output);
    });
    return;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('isIgnored' in obj && obj.isIgnored === true) return;

    Object.entries(obj).forEach(([key, child]) => {
      const nextPath = path ? `${path}.${key}` : key;
      collectTextNodes(child, nextPath, output);
    });
  }
};

const isExcludedSearchPath = (path: string) => {
  const lower = path.toLowerCase();
  return lower === 'collocations'
    || lower.startsWith('collocations.')
    || lower.startsWith('lesson');
};

const getFriendlyPathLabel = (path: string) => {
  const lower = path.toLowerCase();

  if (!path) return 'General';
  if (lower === 'word') return 'Headword';

  if (lower.startsWith('collocationsarray')) {
    if (lower.endsWith('.text')) return 'Collocation Text';
    if (lower.endsWith('.d')) return 'Collocation Context';
    return 'Collocation';
  }

  if (lower.startsWith('wordfamily')) return 'Word Family';
  if (lower.startsWith('meaning')) return 'Meaning';
  if (lower.startsWith('example')) return 'Example';
  if (lower.startsWith('paraphrase')) return 'Paraphrase';
  if (lower.startsWith('preposition')) return 'Preposition';
  if (lower.startsWith('context')) return 'Context';

  return 'Text';
};

const getPathWeight = (path: string) => {
  const lower = path.toLowerCase();
  if (lower === 'word') return 12;
  if (lower.startsWith('collocationsarray') && lower.endsWith('.text')) return 9;
  if (lower.startsWith('collocationsarray') && lower.endsWith('.d')) return 8;
  if (lower.startsWith('meaning')) return 6;
  if (lower.startsWith('example')) return 5;
  if (lower.startsWith('paraphrase')) return 4;
  if (lower.startsWith('preposition')) return 4;
  if (lower.startsWith('wordfamily')) return 3;
  return 2;
};

const normalizeSearchQueries = (queries: string[]): string[] => {
  const seen = new Set<string>();
  return queries
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item.length >= 2)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const normalizeWordContext = (word: VocabularyItem): StudyWordContext => ({
  word: word.word,
  meaningVi: word.meaningVi || '',
  example: word.example || '',
  note: word.note || '',
  learnedStatus: word.learnedStatus,
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
    .filter((word) => word.userId === userId && !word.isPassive && word.quality !== WordQuality.FAILED && !isSrsIgnored(word));
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

    const gradeWeight = (item: VocabularyItem) => item.learnedStatus === LearnedStatus.FORGOT ? 2 : item.learnedStatus === LearnedStatus.HARD ? 1 : 0;
    const gradeDiff = gradeWeight(b) - gradeWeight(a);
    if (gradeDiff !== 0) return gradeDiff;

    return (a.masteryScore ?? 0) - (b.masteryScore ?? 0);
  });

const sortByHardness = (words: VocabularyItem[]) =>
  [...words].sort((a, b) => {
    const aScore = [
      a.learnedStatus === LearnedStatus.HARD ? 3 : 0,
      a.learnedStatus === LearnedStatus.FORGOT ? 2 : 0,
      a.isFocus ? 1 : 0,
      -(a.masteryScore ?? 0),
      a.forgotCount || 0,
    ];
    const bScore = [
      b.learnedStatus === LearnedStatus.HARD ? 3 : 0,
      b.learnedStatus === LearnedStatus.FORGOT ? 2 : 0,
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
    words.filter((word) => word.learnedStatus === LearnedStatus.LEARNED || (word.learnedStatus === LearnedStatus.NEW && !!word.lastReview))
  )
    .slice(0, DEFAULT_LIMIT)
    .map(normalizeWordContext);

  const mostForgottenWords = sortByForgotSeverity(
    words.filter((word) => (word.forgotCount || 0) > 0 || word.learnedStatus === LearnedStatus.FORGOT)
  )
    .slice(0, DEFAULT_LIMIT)
    .map(normalizeWordContext);

  const hardestWords = sortByHardness(
    words.filter((word) => word.learnedStatus === LearnedStatus.HARD || word.learnedStatus === LearnedStatus.FORGOT || (word.masteryScore ?? 0) < 45)
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
      hardWords: words.filter((word) => word.learnedStatus === LearnedStatus.HARD).length,
      forgotWords: words.filter((word) => word.learnedStatus === LearnedStatus.FORGOT).length,
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

export const searchVocabularyForPrompt = (
  queries: string[],
  options?: {
    includeArchive?: boolean;
    limit?: number;
  }
): VocabularySearchResult[] => {
  const normalizedQueries = normalizeSearchQueries(queries);
  if (normalizedQueries.length === 0) return [];

  const userId = getCurrentUserId();
  const words = userId
    ? dataStore.getAllWords().filter((word) => word.userId === userId)
    : [];

  return words
    .filter((word) => options?.includeArchive || !word.isPassive)
    .map((word) => {
      const entries: VocabularySearchHit[] = [];
      collectTextNodes(word, '', entries);

      const allHits = entries.filter((entry) => !isExcludedSearchPath(entry.path));
      const matchedQueries = new Set<string>();
      const scoredHits = allHits
        .map((entry) => {
          const lowerValue = entry.value.toLowerCase();
          const entryMatchedQueries = normalizedQueries.filter((query) => lowerValue.includes(query));
          if (entryMatchedQueries.length === 0) return null;

          entryMatchedQueries.forEach((query) => matchedQueries.add(query));
          return {
            ...entry,
            hitScore: getPathWeight(entry.path) * entryMatchedQueries.length
          };
        })
        .filter((entry): entry is VocabularySearchHit & { hitScore: number } => entry !== null)
        .sort((a, b) => b.hitScore - a.hitScore || a.path.localeCompare(b.path));

      const wordLower = word.word.toLowerCase();
      const wordMatches = normalizedQueries.filter((query) => wordLower.includes(query));
      wordMatches.forEach((query) => matchedQueries.add(query));

      if (matchedQueries.size === 0) return null;

      const score = scoredHits.reduce((sum, item) => sum + item.hitScore, 0)
        + (wordMatches.some((query) => wordLower.startsWith(query)) ? 10 : 0)
        + wordMatches.length * 6
        + matchedQueries.size * 3;

      return {
        word,
        hits: scoredHits.slice(0, SEARCH_MAX_HITS_PER_WORD).map(({ path, value }) => ({ path, value })),
        score,
        matchedQueries: Array.from(matchedQueries)
      };
    })
    .filter((item): item is VocabularySearchResult => item !== null)
    .sort((a, b) => b.score - a.score || b.word.updatedAt - a.word.updatedAt)
    .slice(0, options?.limit || SEARCH_MAX_RESULTS);
};

export const buildVocabularySearchContext = (
  prompt: string,
  queries: string[],
  options?: {
    includeArchive?: boolean;
    limit?: number;
  }
): VocabularySearchContextPayload => {
  const normalizedQueries = normalizeSearchQueries(queries);
  if (!prompt.trim() || normalizedQueries.length === 0) {
    console.info('[StudyBuddy][LibrarySearch] Skip search context', {
      reason: !prompt.trim() ? 'empty-prompt' : 'no-normalized-queries',
      prompt,
      queries,
    });
    return {
      text: 'No vocabulary search hints were generated for this prompt.',
      resultCount: 0,
      results: [],
      queries: normalizedQueries
    };
  }

  const results = searchVocabularyForPrompt(normalizedQueries, options);
  console.info('[StudyBuddy][LibrarySearch] Search executed', {
    prompt,
    queries: normalizedQueries,
    resultCount: results.length,
    results: results.map((result) => ({
      word: result.word.word,
      score: result.score,
      matchedQueries: result.matchedQueries,
      hits: result.hits.map((hit) => ({
        path: hit.path,
        value: hit.value,
      })),
    })),
  });

  if (results.length === 0) {
    return {
      text: [
      'Vocabulary reminder search:',
      `User prompt: ${prompt}`,
      `Generated search queries: ${normalizedQueries.join(' | ')}`,
      'No matching vocabulary items were found in the local database.'
      ].join('\n'),
      resultCount: 0,
      results,
      queries: normalizedQueries
    };
  }

  return {
    text: [
    'Vocabulary reminder search:',
    `User prompt: ${prompt}`,
    `Generated search queries: ${normalizedQueries.join(' | ')}`,
    ...results.map((result, index) => {
      const hitLines = result.hits.length > 0
        ? result.hits.map((hit) => `- ${getFriendlyPathLabel(hit.path)}: ${hit.value}`)
        : ['- No supporting text hit captured'];

      return [
        `${index + 1}. Headword: ${result.word.word}`,
        `Meaning: ${result.word.meaningVi || '-'}`,
        `Example: ${result.word.example || '-'}`,
        `Matched queries: ${result.matchedQueries.join(', ') || '-'}`,
        ...hitLines
      ].join('\n');
    })
    ].join('\n\n'),
    resultCount: results.length,
    results,
    queries: normalizedQueries
  };
};

export const getAiStudyContextText = (): string => {
  const snapshot = getStudyContextSnapshot();

  const formatWords = (title: string, words: StudyWordContext[]) => {
    if (words.length === 0) return `${title}: none`;
    return [
      `${title}:`,
      ...words.map((word, index) =>
        `${index + 1}. ${word.word} | vi: ${word.meaningVi || '-'} | forgot=${word.forgotCount} | mastery=${word.masteryScore} | learnedStatus=${word.learnedStatus || 'N/A'}${word.isFocus ? ' | FOCUS' : ''}`
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
