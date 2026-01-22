
import { VocabularyItem, ReviewGrade, WordQuality, WordSource, WordFamily } from '../app/types';
import { ChallengeType } from '../components/practice/TestModalTypes';
import { generateAvailableChallenges } from './challengeUtils';
import { getConfig } from '../app/settingsManager';
import { calculateGameEligibility } from './gameEligibility';

/**
 * Calculates a future review timestamp, anchored to midnight (00:00:00).
 * Adds a small "fuzz" factor to prevent card bunching.
 */
function getNextReviewTimestamp(baseTimestamp: number, daysToAdd: number): number {
    // Fuzzing: Add a random variation of +/- 5% to the interval to prevent "bunching"
    // (e.g., preventing 50 words learned today from all appearing exactly tomorrow).
    const fuzzFactor = 0.95 + (Math.random() * 0.1); // 0.95 to 1.05
    const fuzzedDays = Math.max(1, daysToAdd * fuzzFactor);

    const reviewDate = new Date(baseTimestamp);
    reviewDate.setHours(0, 0, 0, 0);
    reviewDate.setDate(reviewDate.getDate() + Math.round(fuzzedDays));
    return reviewDate.getTime();
}

/**
 * Enhanced SRS algorithm with Overdue Bonus (Elastic Scheduling).
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

    // Calculate actual elapsed days since last review
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const lastReviewDate = item.lastReview || now;
    const elapsedDays = Math.max(0, (now - lastReviewDate) / ONE_DAY);
    
    // Check if the item was overdue (elapsed time > scheduled interval)
    const isOverdue = elapsedDays > currentInterval;

    if (grade === ReviewGrade.FORGOT) {
      nextInterval = config.forgotInterval;
      newItem.consecutiveCorrect = 0;
      newItem.forgotCount += 1;
    } else if (grade === ReviewGrade.HARD) {
      // Hard: Standard penalty logic, no overdue bonus
      if (item.lastGrade === ReviewGrade.EASY) {
        nextInterval = Math.max(1, Math.floor(currentInterval * config.easyHardPenalty));
      } else {
        nextInterval = currentInterval === 0 ? config.initialHard : Math.max(1, Math.floor(currentInterval * config.hardHard));
      }
      newItem.consecutiveCorrect += 1;
    } else if (grade === ReviewGrade.EASY) {
      // EASY: Apply Overdue Bonus (Elastic Scheduling)
      // If the user remembers it easily AND it was overdue, we base the new interval on the ELAPSED time, 
      // not the scheduled interval. This acknowledges the stronger memory trace.
      
      let baseIntervalForCalc = currentInterval;
      
      if (isOverdue) {
          // If overdue, use the actual elapsed time as the base, essentially "skipping" the missed steps.
          baseIntervalForCalc = Math.max(currentInterval, elapsedDays);
          console.log(`[SRS] Overdue Bonus Applied: Scheduled=${currentInterval}d, Elapsed=${elapsedDays.toFixed(1)}d. New Base=${baseIntervalForCalc.toFixed(1)}d`);
      }

      if (item.lastGrade === ReviewGrade.HARD) {
        nextInterval = currentInterval === 0 ? config.initialEasy : Math.max(config.initialEasy, Math.floor(baseIntervalForCalc * config.hardEasy));
      } else {
        nextInterval = currentInterval === 0 ? config.initialEasy : Math.max(config.initialEasy, Math.floor(baseIntervalForCalc * config.easyEasy));
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
export interface KnowledgeUnit {
    key: string;
    testKeys: string[];
}

export function getLogicalKnowledgeUnits(word: VocabularyItem): KnowledgeUnit[] {
    const units: KnowledgeUnit[] = [];

    // 1. Spelling
    units.push({ key: 'spelling', testKeys: ['SPELLING'] });

    // 2. Pronunciation (Speaking)
    // Always relevant unless explicitly marked otherwise, but checking IPA or flag is a good proxy.
    if (word.ipa || word.needsPronunciationFocus) {
        units.push({ key: 'pronunciation', testKeys: ['PRONUNCIATION'] });
    }

    // 3. IPA Recognition (Listening/Reading)
    // Only if IPA is present AND mistakes are defined (distractors available).
    // If no mistakes are defined, the IPA Quiz cannot be generated, so it shouldn't count against mastery.
    if (word.ipa && word.ipa.trim() && word.ipaMistakes && word.ipaMistakes.length > 0) {
        units.push({ key: 'ipa_recognition', testKeys: ['IPA_QUIZ'] });
    }

    // 4. Meaning
    if (word.meaningVi && word.meaningVi.trim()) {
        units.push({ key: 'meaning', testKeys: ['MEANING_QUIZ'] });
    }

    // 5. Context (Sentence Scramble)
    if (word.example && word.example.trim()) {
        units.push({ key: 'context', testKeys: ['SENTENCE_SCRAMBLE'] });
    }

    // 6. Collocations
    if (word.collocationsArray) {
        // Must be NOT ignored AND have a description (d) to be testable
        word.collocationsArray.filter(c => !c.isIgnored && c.d && c.d.trim()).forEach(c => {
            const text = c.text;
            // A collocation is mastered if ANY valid test for it is passed
            units.push({ 
                key: `colloc:${text}`, 
                testKeys: [
                    `COLLOCATION_QUIZ:${text}`,              // Fill-in
                    `COLLOCATION_MULTICHOICE_QUIZ:${text}`,  // Multiple Choice
                    `COLLOCATION_CONTEXT_QUIZ:${text}`       // Match
                ] 
            });
        });
    }

    // 7. Idioms
    if (word.idiomsList) {
        // Must be NOT ignored AND have a description (d)
        word.idiomsList.filter(i => !i.isIgnored && i.d && i.d.trim()).forEach(i => {
            const text = i.text;
            units.push({ 
                key: `idiom:${text}`, 
                testKeys: [
                    `IDIOM_QUIZ:${text}`,               // Fill-in
                    `IDIOM_CONTEXT_QUIZ:${text}`        // Match
                ] 
            });
        });
    }

    // 8. Prepositions
    if (word.prepositions) {
        word.prepositions.filter(p => !p.isIgnored).forEach(p => {
            const prep = p.prep;
            units.push({ key: `prep:${prep}`, testKeys: [`PREPOSITION_QUIZ:${prep}`] });
        });
    }

    // 9. Paraphrases
    if (word.paraphrases) {
        // Must be NOT ignored AND have a context
        word.paraphrases.filter(p => !p.isIgnored && p.context && p.context.trim()).forEach(p => {
            const text = p.word;
            units.push({ 
                key: `para:${text}`, 
                testKeys: [
                    `PARAPHRASE_QUIZ:${text}`,          // Fill-in
                    `PARAPHRASE_CONTEXT_QUIZ:${text}`   // Match
                ] 
            });
        });
    }

    // 10. Word Family
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
 * A unit is passed if AT LEAST ONE of its constituent test keys has a result of `true`.
 * This allows "matching" or "multiple choice" variants to satisfy the requirement.
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
        // CHANGED: Use .some() instead of .every() because passing ANY valid test for this concept (e.g. matching OR fill) is sufficient for mastery.
        const isPassed = unit.testKeys.length > 0 && unit.testKeys.some(tKey => history[tKey] === true);
        
        if (isPassed) {
            passedCount++;
            passedUnits.push(unit.key);
        } else {
            // No keys passed
            failedUnits.push({ key: unit.key, reason: `None of [${unit.testKeys.join(', ')}] passed.` });
        }
    });

    const score = Math.round((passedCount / units.length) * 100);
    return Math.max(0, Math.min(100, score));
}
