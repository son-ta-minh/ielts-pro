export type TestResultMap = Record<string, boolean>;

const SHORT_TO_LONG_TYPE: Record<string, string> = {
  sp: 'SPELLING',
  iq: 'IPA_QUIZ',
  pq: 'PREPOSITION_QUIZ',
  wf: 'WORD_FAMILY',
  mq: 'MEANING_QUIZ',
  prq: 'PARAPHRASE_QUIZ',
  sc: 'SENTENCE_SCRAMBLE',
  hq: 'HETERONYM_QUIZ',
  p: 'PRONUNCIATION',
  cq: 'COLLOCATION_QUIZ',
  idq: 'IDIOM_QUIZ',
  pcq: 'PARAPHRASE_CONTEXT_QUIZ',
  ccq: 'COLLOCATION_CONTEXT_QUIZ',
  cmq: 'COLLOCATION_MULTICHOICE_QUIZ',
  icq: 'IDIOM_CONTEXT_QUIZ',
  wf_n: 'WORD_FAMILY_NOUNS',
  wf_v: 'WORD_FAMILY_VERBS',
  wf_j: 'WORD_FAMILY_ADJS',
  wf_d: 'WORD_FAMILY_ADVS'
};

const RESULT_GROUPS: Record<string, string[]> = {
  collocation: ['COLLOCATION_QUIZ', 'COLLOCATION_CONTEXT_QUIZ', 'COLLOCATION_MULTICHOICE_QUIZ'],
  paraphrase: ['PARAPHRASE_QUIZ', 'PARAPHRASE_CONTEXT_QUIZ'],
  idiom: ['IDIOM_QUIZ', 'IDIOM_CONTEXT_QUIZ'],
  pronunciation: ['PRONUNCIATION', 'IPA_QUIZ']
};

const TYPE_TO_GROUP: Record<string, string> = Object.fromEntries(
  Object.entries(RESULT_GROUPS).flatMap(([group, types]) => types.map(type => [type, group]))
);

const getTypeFromKey = (key: string): string => key.split(':')[0];

export const normalizeTestResultKeys = (results?: TestResultMap): TestResultMap => {
  if (!results) return {};
  const normalized: TestResultMap = {};

  Object.entries(results).forEach(([key, value]) => {
    const parts = key.split(':');
    const type = parts[0];
    const longType = SHORT_TO_LONG_TYPE[type] || type;
    const normalizedKey = [longType, ...parts.slice(1)].join(':');
    normalized[normalizedKey] = value;
  });

  return normalized;
};

export const mergeTestResultsByGroup = (existing?: TestResultMap, incoming?: TestResultMap): TestResultMap => {
  const normalizedExisting = normalizeTestResultKeys(existing);
  const normalizedIncoming = normalizeTestResultKeys(incoming);

  const touchedGroups = new Set<string>();
  Object.keys(normalizedIncoming).forEach(key => {
    const group = TYPE_TO_GROUP[getTypeFromKey(key)];
    if (group) touchedGroups.add(group);
  });

  const cleanedExisting: TestResultMap = { ...normalizedExisting };
  if (touchedGroups.size > 0) {
    Object.keys(cleanedExisting).forEach(key => {
      const group = TYPE_TO_GROUP[getTypeFromKey(key)];
      if (group && touchedGroups.has(group)) {
        delete cleanedExisting[key];
      }
    });
  }

  return { ...cleanedExisting, ...normalizedIncoming };
};

