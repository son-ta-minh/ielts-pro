const IRREGULAR_LEMMA_MAP: Record<string, string> = {
  am: 'be',
  are: 'be',
  is: 'be',
  was: 'be',
  were: 'be',
  been: 'be',
  being: 'be',
  has: 'have',
  had: 'have',
  having: 'have',
  does: 'do',
  did: 'do',
  done: 'do',
  doing: 'do',
  goes: 'go',
  went: 'go',
  gone: 'go',
  going: 'go',
  makes: 'make',
  made: 'make',
  making: 'make',
  takes: 'take',
  took: 'take',
  taken: 'take',
  taking: 'take',
  comes: 'come',
  came: 'come',
  coming: 'come',
  gets: 'get',
  got: 'get',
  gotten: 'get',
  getting: 'get',
  gives: 'give',
  gave: 'give',
  given: 'give',
  giving: 'give',
  sees: 'see',
  saw: 'see',
  seen: 'see',
  seeing: 'see',
  finds: 'find',
  found: 'find',
  finding: 'find',
  thinks: 'think',
  thought: 'think',
  thinking: 'think',
  tells: 'tell',
  told: 'tell',
  telling: 'tell',
  feels: 'feel',
  felt: 'feel',
  feeling: 'feel',
  leaves: 'leave',
  left: 'leave',
  leaving: 'leave',
  means: 'mean',
  meant: 'mean',
  meaning: 'mean',
  keeps: 'keep',
  kept: 'keep',
  keeping: 'keep',
  begins: 'begin',
  began: 'begin',
  begun: 'begin',
  beginning: 'begin',
  writes: 'write',
  wrote: 'write',
  written: 'write',
  writing: 'write',
  speaks: 'speak',
  spoke: 'speak',
  spoken: 'speak',
  speaking: 'speak',
  runs: 'run',
  ran: 'run',
  running: 'run',
  pays: 'pay',
  paid: 'pay',
  paying: 'pay',
  meets: 'meet',
  met: 'meet',
  meeting: 'meet',
  loses: 'lose',
  lost: 'lose',
  losing: 'lose',
  grows: 'grow',
  grew: 'grow',
  grown: 'grow',
  growing: 'grow',
  sells: 'sell',
  sold: 'sell',
  selling: 'sell',
  hears: 'hear',
  heard: 'hear',
  hearing: 'hear',
  brings: 'bring',
  brought: 'bring',
  bringing: 'bring',
  builds: 'build',
  built: 'build',
  building: 'build',
  chooses: 'choose',
  chose: 'choose',
  chosen: 'choose',
  choosing: 'choose',
  becomes: 'become',
  became: 'become',
  becoming: 'become',
  slips: 'slip',
  slipped: 'slip',
  slipping: 'slip'
};

const DEFAULT_TOKEN_MATCH_THRESHOLD = 0.72;
const MIN_QUERY_TOKEN_COVERAGE = 0.8;

export const normalizeFuzzyText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeFuzzyToken = (token: string) => {
  let stem = token.toLowerCase().trim();
  if (!stem) return '';

  const irregular = IRREGULAR_LEMMA_MAP[stem];
  if (irregular) return irregular;

  if (stem.length > 4 && stem.endsWith('ies')) return `${stem.slice(0, -3)}y`;
  if (stem.length > 5 && stem.endsWith('ing')) stem = stem.slice(0, -3);
  else if (stem.length > 4 && stem.endsWith('ied')) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 4 && stem.endsWith('ed')) stem = stem.slice(0, -2);
  else if (stem.length > 4 && stem.endsWith('es')) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith('s')) stem = stem.slice(0, -1);

  if (/(bb|dd|ff|gg|ll|mm|nn|pp|rr|tt)$/.test(stem)) {
    stem = stem.slice(0, -1);
  }

  return IRREGULAR_LEMMA_MAP[stem] || stem;
};

export const tokenizeFuzzyText = (value: string) =>
  normalizeFuzzyText(value)
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

type WindowMatchStats = {
  score: number;
  matchedWeight: number;
  matchedCount: number;
  coverage: number;
  precision: number;
};

const scoreTokenWindow = (queryTokens: string[], sourceTokens: string[]): WindowMatchStats => {
  if (queryTokens.length === 0 || sourceTokens.length === 0) {
    return { score: 0, matchedWeight: 0, matchedCount: 0, coverage: 0, precision: 0 };
  }

  let matchedWeight = 0;
  let matchedCount = 0;
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

    if (bestIndex >= 0 && bestScore >= DEFAULT_TOKEN_MATCH_THRESHOLD) {
      used.add(bestIndex);
      matchedWeight += bestScore;
      matchedCount += 1;
    }
  });

  const coverage = matchedWeight / queryTokens.length;
  const precision = matchedWeight / sourceTokens.length;
  return {
    score: coverage * 0.78 + precision * 0.22,
    matchedWeight,
    matchedCount,
    coverage,
    precision
  };
};

const getBestWindowMatchStats = (query: string, source: string): WindowMatchStats => {
  const queryTokens = tokenizeFuzzyText(query);
  const sourceTokens = tokenizeFuzzyText(source);
  if (queryTokens.length === 0 || sourceTokens.length === 0) {
    return { score: 0, matchedWeight: 0, matchedCount: 0, coverage: 0, precision: 0 };
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
  const queryTokens = tokenizeFuzzyText(query);
  if (queryTokens.length === 0) return false;

  const bestStats = getBestWindowMatchStats(query, source);
  const requiredMatchCount = getRequiredMatchCount(queryTokens.length);
  if (bestStats.matchedCount < requiredMatchCount) return false;

  const finalScore = Math.max(bestStats.score, getPhraseCharacterSimilarity(query, source) * 0.88);
  return finalScore >= threshold;
};
