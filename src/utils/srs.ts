import { VocabularyItem, ReviewGrade, WordQuality, WordSource, WordFamily } from '../app/types';
import { ChallengeType } from '../components/practice/TestModalTypes';
import { generateAvailableChallenges } from './challengeUtils';
import { getConfig } from '../app/settingsManager';
import { calculateGameEligibility } from './gameEligibility';

/**
 * Calculates a future review timestamp, anchored to midnight (00:00:00).
 */
function getNextReviewTimestamp(baseTimestamp: number, daysToAdd: number): number {
    const reviewDate = new Date(baseTimestamp);
    reviewDate.setHours(0, 0, 0, 0);
    reviewDate.setDate(reviewDate.getDate() + Math.round(daysToAdd));
    return reviewDate.getTime();
}

/**
 * Enhanced SRS algorithm.
 */
export function updateSRS(item: VocabularyItem, grade: ReviewGrade): VocabularyItem {
  const config = getConfig().srs;
  const newItem = { ...item };
  const now = Date.now();
  
  if (grade === ReviewGrade.LEARNED) {
    newItem.consecutiveCorrect = 1;
    newItem.interval = config.initialHard;
    newItem.nextReview = getNextReviewTimestamp(now, config.initialHard);
  } else {
    let currentInterval = item.interval || 0;
    let nextInterval = 1;

    if (grade === ReviewGrade.FORGOT) {
      nextInterval = config.forgotInterval;
      newItem.consecutiveCorrect = 0;
      newItem.forgotCount += 1;
    } else if (grade === ReviewGrade.HARD) {
      if (item.lastGrade === ReviewGrade.EASY) {
        nextInterval = Math.max(1, Math.floor(currentInterval * config.easyHardPenalty));
      } else {
        nextInterval = currentInterval === 0 ? config.initialHard : Math.max(1, Math.floor(currentInterval * config.hardHard));
      }
      newItem.consecutiveCorrect += 1;
    } else if (grade === ReviewGrade.EASY) {
      if (item.lastGrade === ReviewGrade.HARD) {
        nextInterval = currentInterval === 0 ? config.initialEasy : Math.max(config.initialEasy, Math.floor(currentInterval * config.hardEasy));
      } else {
        nextInterval = currentInterval === 0 ? config.initialEasy : Math.max(config.initialEasy, Math.floor(currentInterval * config.easyEasy));
      }
      newItem.consecutiveCorrect += 1;
    }
    
    newItem.interval = Math.round(nextInterval);
    newItem.nextReview = getNextReviewTimestamp(now, newItem.interval);
  }

  newItem.lastGrade = grade;
  newItem.lastReview = now;
  newItem.updatedAt = now; 
  
  // Recalculate everything
  newItem.complexity = calculateComplexity(newItem);
  newItem.masteryScore = calculateMasteryScore(newItem);
  newItem.gameEligibility = calculateGameEligibility(newItem);
  
  return newItem;
}

export function resetProgress(item: VocabularyItem): VocabularyItem {
  const now = Date.now();
  const resetItem: VocabularyItem = {
    ...item,
    nextReview: now,
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    lastGrade: undefined,
    lastReview: undefined,
    updatedAt: now,
    lastXpEarnedTime: undefined,
    lastTestResults: {} // Clear test history on full reset
  };
  resetItem.complexity = calculateComplexity(resetItem);
  resetItem.masteryScore = calculateMasteryScore(resetItem);
  resetItem.gameEligibility = calculateGameEligibility(resetItem);
  return resetItem;
}

export function isDue(item: VocabularyItem): boolean {
  return item.nextReview <= Date.now();
}

export function getRemainingTime(nextReview: number): { label: string; urgency: 'due' | 'soon' | 'later' } {
  const now = Date.now();
  const diff = nextReview - now;
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (diff <= 0) return { label: 'DUE', urgency: 'due' };
  const days = Math.ceil(diff / ONE_DAY);
  return { label: `${days}d`, urgency: days <= 1 ? 'soon' : 'later' };
}

export function createNewWord(
  word: string, ipa: string, meaningVi: string, example: string, note: string, tags: string[],
  isIdiom = false, needsPronunciationFocus = false, isPhrasalVerb = false,
  isCollocation = false, isStandardPhrase = false, isPassive = false, source: WordSource = 'manual'
): VocabularyItem {
  const now = Date.now();
  const newItem: VocabularyItem = {
    id: crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    userId: '', word: word.trim(), ipa: ipa.trim(), meaningVi: meaningVi.trim(), example: example.trim(), note, tags,
    isIdiom, isPhrasalVerb, isCollocation, isStandardPhrase, needsPronunciationFocus, isPassive,
    register: 'raw', quality: WordQuality.RAW, source, isExampleLocked: false,
    createdAt: now, updatedAt: now, nextReview: now, interval: 0, easeFactor: 2.5, consecutiveCorrect: 0, forgotCount: 0,
    lastTestResults: {}
  };
  newItem.complexity = calculateComplexity(newItem);
  newItem.masteryScore = calculateMasteryScore(newItem);
  newItem.gameEligibility = calculateGameEligibility(newItem);
  return newItem;
}

/**
 * Helper to define the logical units for a word.
 * Each unit maps to one or more test keys in `lastTestResults`.
 */
interface KnowledgeUnit {
    key: string;
    testKeys: string[];
}

function getLogicalKnowledgeUnits(word: VocabularyItem): KnowledgeUnit[] {
    const units: KnowledgeUnit[] = [];

    // 1. Spelling
    units.push({ key: 'spelling', testKeys: ['SPELLING'] });

    // 2. Phonetic (IPA + Pronunciation combined)
    if (word.ipa || word.needsPronunciationFocus) {
        const phoneticTestKeys = ['PRONUNCIATION'];
        if (word.ipa && word.ipa.trim()) {
            phoneticTestKeys.push('IPA_QUIZ');
        }
        units.push({ key: 'phonetic', testKeys: phoneticTestKeys });
    }

    // 3. Meaning
    if (word.meaningVi && word.meaningVi.trim()) {
        units.push({ key: 'meaning', testKeys: ['MEANING_QUIZ'] });
    }

    // 4. Context (Sentence Scramble)
    if (word.example && word.example.trim()) {
        units.push({ key: 'context', testKeys: ['SENTENCE_SCRAMBLE'] });
    }

    // 5. Collocations
    if (word.collocationsArray) {
        word.collocationsArray.filter(c => !c.isIgnored).forEach(c => {
            const text = c.text;
            units.push({ key: `colloc:${text}`, testKeys: [`COLLOCATION_QUIZ:${text}`] });
        });
    }

    // 6. Idioms
    if (word.idiomsList) {
        word.idiomsList.filter(i => !i.isIgnored).forEach(i => {
            const text = i.text;
            units.push({ key: `idiom:${text}`, testKeys: [`IDIOM_QUIZ:${text}`] });
        });
    }

    // 7. Prepositions
    if (word.prepositions) {
        word.prepositions.filter(p => !p.isIgnored).forEach(p => {
            const prep = p.prep;
            units.push({ key: `prep:${prep}`, testKeys: [`PREPOSITION_QUIZ:${prep}`] });
        });
    }

    // 8. Paraphrases
    if (word.paraphrases) {
        word.paraphrases.filter(p => !p.isIgnored).forEach(p => {
            const text = p.word;
            units.push({ key: `para:${text}`, testKeys: [`PARAPHRASE_QUIZ:${text}`] });
        });
    }

    // 9. Word Family
    if (word.wordFamily) {
        const familyKeys: (keyof typeof word.wordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
        const typeMap: Record<keyof WordFamily, string> = { nouns: 'n', verbs: 'v', adjs: 'j', advs: 'd' };
        const headwordLower = word.word.toLowerCase();

        // Collect all valid, non-ignored members first to check for the exclusion case.
        const allValidMembers = familyKeys.flatMap(type => {
            const members = word.wordFamily![type];
            return Array.isArray(members) ? members.filter(m => !m.isIgnored && m.word) : [];
        });

        // Exclusion case: if the only member is the headword itself, it's not a distinct knowledge unit.
        if (allValidMembers.length === 1 && allValidMembers[0].word.toLowerCase() === headwordLower) {
            // Do nothing, skip adding this as a knowledge unit.
        } else {
            // Otherwise, add all valid members as distinct knowledge units.
            familyKeys.forEach(type => {
                const members = word.wordFamily![type];
                if (Array.isArray(members)) {
                    members.filter(m => !m.isIgnored && m.word).forEach(m => {
                        const text = m.word;
                        const shortType = typeMap[type];
                        units.push({ 
                            key: `fam:${shortType}:${text}`, 
                            testKeys: [`WORD_FAMILY:${shortType}:${text}`] 
                        });
                    });
                }
            });
        }
    }

    return units;
}

export function getAllValidTestKeys(word: VocabularyItem): Set<string> {
    const units = getLogicalKnowledgeUnits(word);
    const validKeys = new Set<string>();
    units.forEach(unit => {
        unit.testKeys.forEach(key => validKeys.add(key));
    });
    return validKeys;
}

/**
 * Complexity is the TOTAL COUNT of logical knowledge units.
 */
export function calculateComplexity(word: VocabularyItem): number {
    return getLogicalKnowledgeUnits(word).length;
}

/**
 * Mastery Score logic:
 * A unit is passed IFF all of its constituent, applicable test keys have a result of `true`.
 */
export function calculateMasteryScore(word: VocabularyItem): number {
    const units = getLogicalKnowledgeUnits(word);
    if (units.length === 0) {
        return 0;
    }

    const history = word.lastTestResults || {};
    let passedCount = 0;
    const passedUnits: string[] = [];
    const failedUnits: {key: string, reason: string}[] = [];

    units.forEach(unit => {
        const allPassed = unit.testKeys.length > 0 && unit.testKeys.every(tKey => history[tKey] === true);
        if (allPassed) {
            passedCount++;
            passedUnits.push(unit.key);
        } else {
            const missingKeys = unit.testKeys.filter(tKey => history[tKey] !== true);
            failedUnits.push({ key: unit.key, reason: `Missing or failed test keys: [${missingKeys.join(', ')}]` });
        }
    });

    const score = Math.round((passedCount / units.length) * 100);
    return Math.max(0, Math.min(100, score));
}