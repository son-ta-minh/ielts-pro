
import { VocabularyItem, ReviewGrade } from '../types';

/**
 * Basic SRS algorithm implementation
 */
export function updateSRS(item: VocabularyItem, grade: ReviewGrade): VocabularyItem {
  const newItem = { ...item };
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (grade === ReviewGrade.FORGOT) {
    newItem.interval = 0;
    newItem.consecutiveCorrect = 0;
    newItem.easeFactor = Math.max(1.3, item.easeFactor - 0.2);
    newItem.nextReview = now + (10 * 60 * 1000); 
    newItem.forgotCount += 1;
  } else if (grade === ReviewGrade.HARD) {
    if (item.consecutiveCorrect === 0) {
      newItem.interval = 1;
    } else {
      newItem.interval = Math.max(1, Math.round(item.interval * 1.2));
    }
    newItem.consecutiveCorrect += 1;
    newItem.easeFactor = Math.max(1.3, item.easeFactor - 0.15);
    newItem.nextReview = now + (newItem.interval * ONE_DAY);
  } else if (grade === ReviewGrade.EASY) {
    if (item.consecutiveCorrect === 0) {
      newItem.interval = 4;
    } else {
      newItem.interval = Math.max(6, Math.round(item.interval * item.easeFactor));
    }
    newItem.consecutiveCorrect += 1;
    newItem.easeFactor = Math.min(2.5, item.easeFactor + 0.1);
    newItem.nextReview = now + (newItem.interval * ONE_DAY);
  }

  newItem.lastReview = now;
  newItem.updatedAt = now; // Mark as updated
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
    lastReview: undefined,
    updatedAt: now
  };
}

export function isDue(item: VocabularyItem): boolean {
  return item.nextReview <= Date.now();
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
  needsPronunciationFocus: boolean = false
): VocabularyItem {
  const now = Date.now();
  return {
    id: generateId(),
    userId: '', // Set by App
    word: word.trim(),
    ipa: ipa.trim(),
    meaningVi: meaningVi.trim(),
    example: example.trim(),
    note: note.trim(),
    tags,
    isIdiom,
    needsPronunciationFocus,
    createdAt: now,
    updatedAt: now,
    nextReview: now, 
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0
  };
}
