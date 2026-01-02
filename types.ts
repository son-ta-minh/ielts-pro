
export enum ReviewGrade {
  FORGOT = 'FORGOT',
  HARD = 'HARD',
  EASY = 'EASY'
}

export enum ParaphraseMode {
  SPEAK_TO_WRITE = 'SPEAK_TO_WRITE',
  WRITE_TO_SPEAK = 'WRITE_TO_SPEAK',
  VARIETY = 'VARIETY'
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  lastLogin: number;
}

export interface VocabularyItem {
  id: string;
  userId: string; 
  word: string;
  ipa: string;
  meaningVi: string;
  example: string;
  note: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  
  // New flags
  isIdiom?: boolean;
  isPhrasalVerb?: boolean;
  isCollocation?: boolean;
  needsPronunciationFocus?: boolean;

  // SRS Fields
  nextReview: number; 
  interval: number; 
  easeFactor: number; 
  consecutiveCorrect: number;
  lastReview?: number;
  forgotCount: number;
}

export interface ReviewStats {
  total: number;
  dueCount: number;
  masteredCount: number;
  weakWords: VocabularyItem[];
}

export type AppView = 'AUTH' | 'DASHBOARD' | 'ADD_WORD' | 'REVIEW' | 'BROWSE' | 'INSIGHTS' | 'SETTINGS' | 'PARAPHRASE' | 'SMART_SELECT' | 'IDIOM_LAB' | 'PRONUNCIATION_LAB' | 'PHRASAL_VERB_LAB' | 'COLLOCATION_LAB';
