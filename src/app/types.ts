export enum ReviewGrade {
  FORGOT = 'FORGOT',
  HARD = 'HARD',
  EASY = 'EASY',
  LEARNED = 'LEARNED',
}

export enum WordQuality {
  RAW = 'RAW',
  REFINED = 'REFINED',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED'
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

export type SessionType = 'due' | 'new' | 'custom' | 'new_study' | 'random_test' | 'boss_battle' | null;

export interface WordFamilyMember {
  word: string;
  ipa: string;
  isIgnored?: boolean;
}

export interface WordFamily {
  nouns: WordFamilyMember[];
  verbs: WordFamilyMember[];
  adjs: WordFamilyMember[];
  advs: WordFamilyMember[];
}

export interface AdventureProgress {
  unlockedChapterIds: string[];
  completedSegmentIds: string[];
  segmentStars: Record<string, number>; // New: Tracking 1, 2, or 3 stars per segment
  badges: string[];
  keys: number;
  keyFragments: number;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  lastLogin: number;
  role?: string;
  currentLevel?: string;
  target?: string;
  nativeLanguage?: string;
  experience: number;
  level: number;
  adventure?: AdventureProgress;
  adventureLastDailyStar?: string; // YYYY-MM-DD format
}

export interface PrepositionPattern {
  prep: string;
  usage: string;
  isIgnored?: boolean;
}

export type ParaphraseTone = 'intensified' | 'softened' | 'synonym' | 'academic' | 'casual' | 'idiomatic';

export interface ParaphraseOption {
  word: string;
  tone: ParaphraseTone;
  context: string;
  isIgnored?: boolean;
}

export interface CollocationDetail {
  text: string;
  isIgnored?: boolean;
}

export type WordSource = 'app' | 'manual' | 'refine';

export interface VocabularyItem {
  id: string;
  userId: string; 
  word: string; 
  v2?: string;  
  v3?: string;  
  ipa: string;
  ipaMistakes?: string[];
  meaningVi: string;
  example: string;
  
  collocations?: string;
  collocationsArray?: CollocationDetail[];

  idioms?: string;
  idiomsList?: CollocationDetail[];

  note: string;
  tags: string[];
  groups?: string[]; // User-defined groups
  createdAt: number;
  updatedAt: number;
  
  wordFamily?: WordFamily;
  prepositions?: PrepositionPattern[];
  paraphrases?: ParaphraseOption[];

  register?: 'raw' | 'academic' | 'casual' | 'neutral';

  isIdiom?: boolean;
  isPhrasalVerb?: boolean;
  isCollocation?: boolean;
  isStandardPhrase?: boolean;
  isIrregular?: boolean; 
  needsPronunciationFocus?: boolean;
  isExampleLocked?: boolean;
  isPassive?: boolean;

  // Word Quality Tracking
  quality: WordQuality;

  // Word Source Tracking
  source?: WordSource;

  nextReview: number; 
  interval: number; 
  easeFactor: number; 
  consecutiveCorrect: number;
  lastReview?: number;
  lastGrade?: ReviewGrade;
  forgotCount: number;
  
  lastTestResults?: Record<string, boolean>;
  lastXpEarnedTime?: number;

  /** Pre-calculated eligibility for Discover arcade games */
  gameEligibility?: string[];
}

export interface Unit {
  id: string;
  userId: string;
  name: string;
  description: string;
  wordIds: string[];
  customVocabString?: string;
  createdAt: number;
  updatedAt: number;
  essay?: string;
  isLearned?: boolean;
}

export interface SpeakingTopic {
  id: string;
  userId: string;
  name: string;
  description: string;
  questions: string[];
  part2?: { cueCard: string, points: string[] };
  part3?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WritingTopic {
  id: string;
  userId: string;
  name: string;
  description: string;
  task1: string;
  task2: string;
  createdAt: number;
  updatedAt: number;
}

export interface ParaphraseLog {
  id: string;
  userId: string;
  timestamp: number;
  originalSentence: string;
  userDraft: string;
  mode: ParaphraseMode;
  overallScore: number;
  meaningScore: number;
  lexicalScore: number;
  grammarScore: number;
  feedbackHtml: string;
  modelAnswer: string;
}

export interface SpeakingSessionRecord {
  question: string;
  userTranscript: string;
}

export interface SpeakingLog {
  id: string;
  userId: string;
  timestamp: number;
  part: 'Part 1' | 'Part 2' | 'Part 3' | 'Custom' | 'Full Test';
  topicName: string;
  sessionRecords: SpeakingSessionRecord[];
  estimatedBand: number;
  feedbackHtml: string;
  audioUrls?: string[];
}

export interface WritingLog {
  id: string;
  userId: string;
  timestamp: number;
  topicName: string;
  task1Response: string;
  task2Response: string;
  estimatedBand: number;
  feedbackHtml: string;
}

export type AppView = 'AUTH' | 'DASHBOARD' | 'REVIEW' | 'REVIEW_DUE' | 'LEARN_NEW' | 'BROWSE' | 'PARAPHRASE' | 'UNIT_LIBRARY' | 'DISCOVER' | 'SETTINGS' | 'WORD_NET' | 'SPEAKING' | 'WRITING';

export type DiscoverGame = 'MENU' | 'ADVENTURE' | 'COLLO_CONNECT' | 'IPA_SORTER' | 'MEANING_MATCH' | 'SENTENCE_SCRAMBLE' | 'PREPOSITION_POWER' | 'WORD_TRANSFORMER';