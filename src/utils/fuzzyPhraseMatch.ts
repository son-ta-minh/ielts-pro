const DEFAULT_TOKEN_MATCH_THRESHOLD = 0.72;
const MIN_QUERY_TOKEN_COVERAGE = 0.8;
const CONTENT_TOKEN_MATCH_THRESHOLD = 0.84;
const STOPWORD_TOKENS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'so',
  'of', 'in', 'on', 'at', 'by', 'for', 'to', 'from', 'with', 'about',
  'as', 'into', 'through', 'over', 'after', 'before', 'between', 'under',
  'against', 'during', 'without', 'within', 'along', 'per', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'any', 'both', 'her', 'his', 'hers',
  'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'whose',
  'my', 'your', 'our', 'us', 'me', 'he', 'she', 'it'
]);

export const normalizeFuzzyText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\[|\]|\{|\}/g, '')            // remove brackets but keep content
    .replace(/-/g, ' ')                      // replace hyphens with spaces
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeFuzzyToken = (token: string) => {
  let stem = token.toLowerCase().trim();
  if (!stem) return '';

  if (stem.length > 4 && stem.endsWith('ies')) return `${stem.slice(0, -3)}y`;
  if (stem.length > 5 && stem.endsWith('ing')) stem = stem.slice(0, -3);
  else if (stem.length > 4 && stem.endsWith('ied')) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 4 && stem.endsWith('ed')) stem = stem.slice(0, -2);
  else if (stem.length > 4 && stem.endsWith('es')) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith('s')) stem = stem.slice(0, -1);

  if (/(bb|dd|ff|gg|ll|mm|nn|pp|rr|tt)$/.test(stem)) {
    stem = stem.slice(0, -1);
  }

  return stem;
};

export const tokenizeFuzzyText = (value: string) =>
  normalizeFuzzyText(value)       // hyphens converted to spaces
    .split(' ')
    .map((token) => normalizeFuzzyToken(token))
    .filter(Boolean);

const getLevenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const dp = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
};

const getTokenSimilarity = (left: string, right: string) => {
  if (left === right) return 1;
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  const distance = getLevenshteinDistance(left, right);
  return 1 - distance / maxLength;
};

const getPhraseCharacterSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizeFuzzyText(left).replace(/\s+/g, ' ').trim();
  const normalizedRight = normalizeFuzzyText(right).replace(/\s+/g, ' ').trim();
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const distance = getLevenshteinDistance(normalizedLeft, normalizedRight);
  return 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length);
};

export const isSubsequenceMatch = (query: string, source: string, threshold = 0.8) => {
  // normalize: lowercase, remove punctuation except spaces
  const q = query.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const s = source.toLowerCase().replace(/[^\w\s]/g, '').trim();

  if (!q || !s) return false;

  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (q[i] === s[j]) {
      i++;
    }
  }

  const coverage = i / q.length;

  console.log('[SubsequenceMatch]', { query, source, coverage, threshold, matched: i, total: q.length });

  return coverage >= threshold;
};

type WindowMatchStats = {
  score: number;
  matchedWeight: number;
  matchedCount: number;
  contentMatchedCount: number;
  contentTokenCount: number;
  coverage: number;
  precision: number;
};

const scoreTokenWindow = (queryTokens: string[], sourceTokens: string[]): WindowMatchStats => {
  if (queryTokens.length === 0 || sourceTokens.length === 0) {
    return { score: 0, matchedWeight: 0, matchedCount: 0, contentMatchedCount: 0, contentTokenCount: 0, coverage: 0, precision: 0 };
  }

  let matchedWeight = 0;
  let matchedCount = 0;
  let contentMatchedCount = 0;
  const contentTokenCount = queryTokens.filter((token) => !STOPWORD_TOKENS.has(token)).length;
  const used = new Set<number>();

  queryTokens.forEach((queryToken) => {
    let bestIndex = -1;
    let bestScore = 0;

    sourceTokens.forEach((sourceToken, index) => {
      if (used.has(index)) return;
      const score = getTokenSimilarity(queryToken, sourceToken);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const isStopword = STOPWORD_TOKENS.has(queryToken);
    const requiredThreshold = isStopword ? DEFAULT_TOKEN_MATCH_THRESHOLD : CONTENT_TOKEN_MATCH_THRESHOLD;

    if (bestIndex >= 0 && bestScore >= requiredThreshold) {
      used.add(bestIndex);
      matchedWeight += bestScore;
      matchedCount += 1;
      if (!isStopword) {
        contentMatchedCount += 1;
      }
    }
  });

  const coverage = matchedWeight / queryTokens.length;
  const precision = matchedWeight / sourceTokens.length;
  return {
    score: coverage * 0.78 + precision * 0.22,
    matchedWeight,
    matchedCount,
    contentMatchedCount,
    contentTokenCount,
    coverage,
    precision
  };
};

const getBestWindowMatchStats = (query: string, source: string): WindowMatchStats => {
  const queryTokens = tokenizeFuzzyText(query);
  const sourceTokens = tokenizeFuzzyText(source);
  console.log('[BestWindowMatch] Tokens:', { queryTokens, sourceTokens });
  if (queryTokens.length === 0 || sourceTokens.length === 0) {
    return { score: 0, matchedWeight: 0, matchedCount: 0, contentMatchedCount: 0, contentTokenCount: 0, coverage: 0, precision: 0 };
  }

  const minWindowSize = Math.max(1, queryTokens.length - 1);
  const maxWindowSize = Math.min(sourceTokens.length, queryTokens.length + 4);
  let bestStats = scoreTokenWindow(queryTokens, sourceTokens);

  for (let windowSize = minWindowSize; windowSize <= maxWindowSize; windowSize += 1) {
    for (let start = 0; start <= sourceTokens.length - windowSize; start += 1) {
      const windowTokens = sourceTokens.slice(start, start + windowSize);
      const stats = scoreTokenWindow(queryTokens, windowTokens);
      if (
        stats.score > bestStats.score
        || (stats.score === bestStats.score && stats.matchedCount > bestStats.matchedCount)
        || (stats.score === bestStats.score && stats.matchedCount === bestStats.matchedCount && stats.coverage > bestStats.coverage)
      ) {
        bestStats = stats;
      }
    }
  }

  return bestStats;
};

const getRequiredMatchCount = (tokenCount: number) => {
  if (tokenCount <= 1) return 1;
  return Math.max(2, Math.ceil(tokenCount * MIN_QUERY_TOKEN_COVERAGE));
};

export const getFuzzyPhraseScore = (query: string, source: string) => {
  const queryTokens = tokenizeFuzzyText(query);
  if (queryTokens.length === 0) return 0;

  const bestStats = getBestWindowMatchStats(query, source);

  const characterScore = getPhraseCharacterSimilarity(query, source);
  return Math.max(bestStats.score, characterScore * 0.88);
};

export const isFuzzyPhraseMatch = (query: string, source: string, threshold = 0.7) => {
  // if (isSubsequenceMatch(query, source)) {
  //   console.log('[FuzzyMatch] Subsequence early match:', { query, source });
  //   return true;
  // }

  const queryTokens = tokenizeFuzzyText(query);
  if (queryTokens.length === 0) {
    console.log('[FuzzyMatch] No valid tokens in query:', { query, source });
    return false;
  }

  const bestStats = getBestWindowMatchStats(query, source);
  if (bestStats.contentTokenCount > 0) {
    const requiredContentMatches = Math.max(
      1,
      Math.floor(bestStats.contentTokenCount * 0.7)
    );

    if (bestStats.contentMatchedCount < requiredContentMatches) {
      console.log('[FuzzyMatch] Content tokens not sufficiently matched:', {
        query,
        source,
        bestStats,
        requiredContentMatches
      });
      return false;
    }
  } else {
    const requiredMatchCount = getRequiredMatchCount(queryTokens.length);
    if (bestStats.matchedCount < requiredMatchCount) {
      console.log('[FuzzyMatch] Required match count not met:', { query, source, bestStats, requiredMatchCount });
      return false;
    }
  }

  const finalScore = Math.max(bestStats.score, getPhraseCharacterSimilarity(query, source) * 0.88);
  console.log('[FuzzyMatch] Final score:', { query, source, bestStats, finalScore, threshold });
  return finalScore >= threshold;
};
