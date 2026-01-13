import { VocabularyItem, ReviewGrade, WordQuality, WordSource } from '../app/types';
import { getConfig } from '../app/settingsManager';

/**
 * Calculates a future review timestamp, anchored to midnight (00:00:00), as per the user's explicit request.
 * If a review happens at 4 PM, and the interval is 1 day, the next review will be scheduled for midnight of the next calendar day.
 * @param baseTimestamp The timestamp (in milliseconds) from which to calculate the future date (e.g., Date.now()).
 * @param daysToAdd The number of calendar days to add.
 * @returns The timestamp for the future review date at midnight.
 */
function getNextReviewTimestamp(baseTimestamp: number, daysToAdd: number): number {
    // Create a date object from the timestamp of the review.
    const reviewDate = new Date(baseTimestamp);
    
    // Set the time to midnight (the start of the calendar day), as requested.
    reviewDate.setHours(0, 0, 0, 0);
    
    // Add the required number of full calendar days.
    // .setDate() correctly handles rolling over months, years, and daylight saving time.
    reviewDate.setDate(reviewDate.getDate() + Math.round(daysToAdd));
    
    return reviewDate.getTime();
}


/**
 * Enhanced SRS algorithm based on user-configurable settings.
 */
export function updateSRS(item: VocabularyItem, grade: ReviewGrade): VocabularyItem {
  const config = getConfig().srs;
  const newItem = { ...item };
  const now = Date.now();
  
  if (grade === ReviewGrade.LEARNED || (grade === ReviewGrade.EASY && item.interval === 0)) {
    // New words: Schedule for midnight of the next calendar day.
    newItem.consecutiveCorrect = 1;
    newItem.interval = 1; // Conceptually, it's a 1-day interval.
    newItem.nextReview = getNextReviewTimestamp(now, 1);
    
  } else {
    // Existing logic for FORGOT, HARD, and subsequent EASY reviews.
    let currentInterval = item.interval || 0;
    let nextInterval = 1;
    const isPostThirdReview = item.consecutiveCorrect >= 3;

    if (grade === ReviewGrade.FORGOT) {
      nextInterval = config.forgotInterval;
      newItem.consecutiveCorrect = 0;
      newItem.forgotCount += 1;
      if (isPostThirdReview) {
        newItem.note = (newItem.note || '') + ' [Unstable: Forgot after mastery]';
      }
    } else if (grade === ReviewGrade.HARD) {
      if (item.lastGrade === ReviewGrade.EASY) {
        nextInterval = Math.max(1, Math.floor(currentInterval * config.easyHardPenalty));
      } else {
        nextInterval = currentInterval === 0 ? config.initialHard : Math.max(1, Math.floor(currentInterval * config.hardHard));
      }
      newItem.consecutiveCorrect += 1;
    } else if (grade === ReviewGrade.EASY) {
      // This now only handles subsequent EASY reviews, not the very first one.
      if (item.lastGrade === ReviewGrade.HARD) {
        nextInterval = Math.max(config.initialEasy, Math.floor(currentInterval * config.hardEasy));
      } else {
        nextInterval = Math.max(config.initialEasy, Math.floor(currentInterval * config.easyEasy));
      }
      newItem.consecutiveCorrect += 1;
    }
    
    newItem.interval = Math.round(nextInterval);
    newItem.nextReview = getNextReviewTimestamp(now, newItem.interval);
  }

  newItem.lastGrade = grade;
  newItem.lastReview = now;
  newItem.updatedAt = now; 
  
  return newItem;
}

export function resetProgress(item: VocabularyItem): VocabularyItem {
  const now = Date.now();
  return {
    ...item,
    nextReview: now,
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    lastGrade: undefined,
    lastReview: undefined,
    updatedAt: now,
    lastXpEarnedTime: undefined, // Reset XP earned time as well
  };
}

export function isDue(item: VocabularyItem): boolean {
  return item.nextReview <= Date.now();
}

/**
 * Calculates remaining time until next review.
 * Strictly simplified to show only "DUE" or "Xd".
 */
export function getRemainingTime(nextReview: number): { label: string; urgency: 'due' | 'soon' | 'later' } {
  const now = Date.now();
  const diff = nextReview - now;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (diff <= 0) {
    return { label: 'DUE', urgency: 'due' };
  }

  const days = Math.ceil(diff / ONE_DAY);
  
  return { 
    label: `${days}d`, 
    urgency: days <= 1 ? 'soon' : 'later' 
  };
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function createNewWord(
  word: string, 
  ipa: string, 
  meaningVi: string, 
  example: string, 
  note: string, 
  tags: string[],
  isIdiom: boolean = false,
  needsPronunciationFocus: boolean = false,
  isPhrasalVerb: boolean = false,
  isCollocation: boolean = false,
  isStandardPhrase: boolean = false,
  isPassive: boolean = false,
  source: WordSource = 'manual'
): VocabularyItem {
  const now = Date.now();
  return {
    id: generateId(),
    userId: '', 
    word: word.trim(),
    ipa: ipa.trim(),
    meaningVi: meaningVi.trim(),
    example: example.trim(),
    note: note, // Do not trim note to preserve user formatting (e.g., newlines).
    tags,
    isIdiom,
    isPhrasalVerb,
    isCollocation,
    isStandardPhrase,
    needsPronunciationFocus,
    isPassive,
    register: 'raw',
    quality: WordQuality.RAW, // New words start as RAW
    source,
    isExampleLocked: false,
    createdAt: now,
    updatedAt: now,
    nextReview: now, 
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    lastXpEarnedTime: undefined, // Initialize XP earned time
  };
}