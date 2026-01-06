
export enum ReviewGrade {
  FORGOT = 'FORGOT',
  HARD = 'HARD',
  EASY = 'EASY'
}

export enum ReviewMode {
  STANDARD = 'STANDARD',       // Show Word -> Recall Meaning
  SPELLING = 'SPELLING',       // Listen/IPA -> Type Word
  MEANING = 'MEANING',         // Show Meaning -> Recall Word
  PHONETIC = 'PHONETIC',       // Show IPA -> Recall Word
  IRREGULAR = 'IRREGULAR',     // V1 -> Type V2 & V3 (Specific for irregular verbs)
  PREPOSITION = 'PREPOSITION'  // Show example with blank -> Fill preposition
}

export enum ParaphraseMode {
  VARIETY = 'VARIETY',
  MORE_ACADEMIC = 'MORE_ACADEMIC',
  LESS_ACADEMIC = 'LESS_ACADEMIC'
}

export interface WordFamilyMember {
  word: string;
  ipa: string;
}

export interface WordFamily {
  nouns: WordFamilyMember[];
  verbs: WordFamilyMember[];
  adjs: WordFamilyMember[];
  advs: WordFamilyMember[];
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  lastLogin: number;
  role?: string;
  currentLevel?: string;
  target?: string;
}

export interface PrepositionPattern {
  prep: string;
  usage: string; // A short phrase that follows the preposition, e.g., "the promotion" for "delighted with"
}

export interface VocabularyItem {
  id: string;
  userId: string; 
  word: string; 
  v2?: string;  
  v3?: string;  
  ipa: string;
  meaningVi: string;
  example: string;
  collocations?: string; // Essential IELTS collocations
  note: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  
  // Word Family
  wordFamily?: WordFamily;

  // New field for preposition practice
  prepositions?: PrepositionPattern[];

  // Classification flags
  isIdiom?: boolean;
  isPhrasalVerb?: boolean;
  isCollocation?: boolean;
  isStandardPhrase?: boolean;
  isIrregular?: boolean; 
  needsPronunciationFocus?: boolean;
  isExampleLocked?: boolean;
  isPassive?: boolean; // Flag for literary/archaic words not for active study

  // SRS Fields
  nextReview: number; 
  interval: number; 
  easeFactor: number; 
  consecutiveCorrect: number;
  lastReview?: number;
  lastGrade?: ReviewGrade; // New field to track previous rating
  forgotCount: number;
}

// New Unit Interface for custom collections
export interface Unit {
  id: string;
  userId: string;
  name: string;
  description: string;
  wordIds: string[];
  customVocabString?: string; // Stores "essay_word:base_word" mappings
  createdAt: number;
  updatedAt: number;
  essay?: string;
}

export type AppView = 'AUTH' | 'DASHBOARD' | 'REVIEW' | 'REVIEW_DUE' | 'LEARN_NEW' | 'BROWSE' | 'INSIGHTS' | 'SETTINGS' | 'PARAPHRASE' | 'UNITS_LAB';
