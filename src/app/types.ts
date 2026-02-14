
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

export type FocusColor = 'green' | 'yellow' | 'red';

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

export type WordTypeOption = 'vocab' | 'idiom' | 'phrasal' | 'collocation' | 'phrase' | 'pronun' | 'preposition' | 'archive';

export type SessionType = 'due' | 'new' | 'custom' | 'new_study' | 'random_test' | 'boss_battle' | null;

export interface DataScope {
  user: boolean;
  vocabulary: boolean;
  lesson: boolean;
  reading: boolean;
  writing: boolean;
  speaking: boolean;
  listening: boolean;
  mimic: boolean;
  wordBook: boolean;
  planning: boolean;
}

export interface WordFamilyMember {
  word: string;
  ipa: string;
  ipaUs?: string;
  ipaUk?: string;
  pronSim?: 'same' | 'near' | 'different';
  isIgnored?: boolean;
}

export interface WordFamily {
  nouns: WordFamilyMember[];
  verbs: WordFamilyMember[];
  adjs: WordFamilyMember[];
  advs: WordFamilyMember[];
}

export interface MapNode {
  id: number;
  type: 'standard' | 'key_fragment' | 'treasure' | 'boss';
  isDefeated?: boolean;
  boss_details?: {
    name: string;
    image: string;
    hp: number;
    dialogueIntro: string;
    dialogueWin: string;
    dialogueLose: string;
  };
}

export interface AdventureProgress {
  currentNodeIndex: number;
  energyShards: number;
  energy: number;
  keys: number;
  keyFragments: number;
  badges: string[]; // For medals/huy hiệu
  hpPotions?: number; // New: Healing item
  wisdomFruits?: number; // New: Hint item
  lastDailyEnergyAwardDate?: string;
  dailyEnergyAwarded?: number; // Tracks total energy earned today
  unlockedChapterIds?: string[];
  completedSegmentIds?: string[];
  segmentStars?: Record<string, number>;
  map?: MapNode[];
}

export interface LessonPreferences {
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
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
  peakLevel?: number;
  adventure: AdventureProgress;
  adventureLastDailyStar?: string; // YYYY-MM-DD format
  isAdmin?: boolean;
  lessonPreferences?: LessonPreferences;
}

export interface PrepositionPattern {
  prep: string;
  usage: string;
  isIgnored?: boolean;
}

export type ParaphraseTone = 'intensified' | 'softened' | 'synonym' | 'academic' | 'casual';

export interface ParaphraseOption {
  word: string;
  tone: ParaphraseTone;
  context: string;
  isIgnored?: boolean;
}

export interface CollocationDetail {
  text: string;
  isIgnored?: boolean;
  d?: string; // Descriptive text
}

export type WordSource = 'app' | 'manual' | 'refine';

export interface VocabularyItem {
  id: string;
  userId: string; 
  word: string; 
  v2?: string;  
  v3?: string;  
  ipa: string;
  ipaUs?: string;
  ipaUk?: string;
  pronSim?: 'same' | 'near' | 'different';
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
  isInterrogative?: boolean;
  isExclamatory?: boolean;
  isImperative?: boolean;
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
  lastReviewSessionType?: SessionType;
  forgotCount: number;
  
  complexity?: number;
  masteryScore?: number;
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
  path?: string;
  tags?: string[];
  customVocabString?: string;
  createdAt: number;
  updatedAt: number;
  essay?: string;
  isLearned?: boolean;
  comprehensionQuestions?: {
    question: string;
    answer: string;
  }[];
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export interface SpeakingTopic {
  id: string;
  userId: string;
  name: string;
  label?: string; // e.g. "Part 1", "Free Talk"
  description: string; // Context
  questions: string[]; // Context/Questions
  sampleAnswers?: string[]; // Format: "Tone: Answer"
  path?: string;
  tags?: string[];
  note?: string; // User Note
  part2?: { cueCard: string, points: string[] };
  part3?: string[];
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export interface WritingTopic {
  id: string;
  userId: string;
  name: string;
  description: string;
  task1: string;
  task2: string;
  path?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
}

// New Composition Type
export type CompositionLabel = 'IELTS Task 1' | 'IELTS Task 2' | 'Professional' | 'Academic' | 'Informal' | 'Free Write';

export interface Composition {
  id: string;
  userId: string;
  title?: string;
  label: CompositionLabel; // Legacy: Kept for compatibility
  path?: string;
  tags?: string[];
  content: string;
  linkedWordIds: string[]; // IDs of VocabularyItems used
  aiFeedback?: string; // HTML feedback
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
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

export interface IrregularVerb {
  id: string;
  userId: string;
  v1: string; // Base form
  v2: string; // Past simple
  v3: string; // Past participle
  createdAt: number;
  updatedAt: number;
  lastTestResult?: 'pass' | 'fail';
  lastTestTimestamp?: number;
  lastTestIncorrectForms?: ('v1' | 'v2' | 'v3')[];
}

export type LessonType = 'essay' | 'word';

export interface Lesson {
  id: string;
  userId: string;
  type?: LessonType; // 'essay' by default if undefined
  
  topic1: string; // Deprecated in V2 UI, kept for data legacy
  topic2: string; // Deprecated in V2 UI, kept for data legacy
  
  title: string;
  description: string;
  content: string; // Stored as HTML.
  listeningContent?: string; // Stored as Markdown (Listening version - Podcast style)
  testContent?: string; // Stored as Markdown (Interactive Practice Test)
  
  path?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export interface ListeningItem {
  id: string;
  userId: string;
  text: string; // Text with {curly braces} for highlighting
  note?: string;
  path?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export interface NativeSpeakAnswer {
  tone: 'casual' | 'semi-academic' | 'academic';
  anchor: string;
  sentence: string;
  note?: string;
}

export interface NativeSpeakItem {
    id: string;
    userId: string;
    standard: string; // The "Question" or "Context"
    answers: NativeSpeakAnswer[];
    path?: string;
    tags: string[];
    note?: string; // User note for context/usage explanation
    createdAt: number;
    updatedAt: number;
    focusColor?: FocusColor;
    isFocused?: boolean;
}

export interface ConversationSpeaker {
    name: string;
    sex: 'male' | 'female';
    voiceName?: string;
    accentCode?: string;
}

export interface ConversationSentence {
    speakerName: string;
    text: string;
    icon?: string; // Emoji representing emotion
}

export interface ConversationItem {
    id: string;
    userId: string;
    title: string;
    description: string;
    speakers: ConversationSpeaker[];
    sentences: ConversationSentence[];
    path?: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
    focusColor?: FocusColor;
    isFocused?: boolean;
}

export interface FreeTalkItem {
  id: string;
  userId: string;
  title: string;
  content: string; // The full paragraph text
  path?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export interface WordBookItem {
  word: string;
  definition: string;
}

export interface WordBook {
  id: string;
  userId: string;
  topic: string;
  icon: string; // Emoji
  words: WordBookItem[];
  createdAt: number;
  updatedAt: number;
  color?: string;
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

// Reading Book (Collection of Units)
export interface ReadingBook {
  id: string;
  userId: string;
  title: string; // Format: "Shelf: Name"
  icon?: string;
  color?: string;
  unitIds: string[]; // List of IDs of Units in this book
  createdAt: number;
  updatedAt: number;
  // Visual props
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

// Lesson Book (Collection of Lessons)
export interface LessonBook {
  id: string;
  userId: string;
  title: string; // Format: "Shelf: Name"
  icon?: string;
  color?: string;
  itemIds: string[]; // List of IDs of Lessons
  createdAt: number;
  updatedAt: number;
  // Visual props
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

// Listening Book (Collection of Listening Items)
export interface ListeningBook {
  id: string;
  userId: string;
  title: string; // Format: "Shelf: Name"
  icon?: string;
  color?: string;
  itemIds: string[]; // List of IDs of ListeningItems
  createdAt: number;
  updatedAt: number;
  // Visual props
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

// Speaking Book (Collection of Speaking Topics & NativeSpeakItems)
export interface SpeakingBook {
  id: string;
  userId: string;
  title: string; // Format: "Shelf: Name"
  icon?: string;
  color?: string;
  itemIds: string[]; // List of IDs of SpeakingTopics, NativeSpeakItems or ConversationItems
  createdAt: number;
  updatedAt: number;
  // Visual props
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

// Writing Book (Collection of Writing Topics & Compositions)
export interface WritingBook {
  id: string;
  userId: string;
  title: string; // Format: "Shelf: Name"
  icon?: string;
  color?: string;
  itemIds: string[]; // List of IDs of WritingTopics or Compositions
  createdAt: number;
  updatedAt: number;
  // Visual props
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

// Planning Feature
export type PlanningStatus = 'NEW' | 'IN_PROGRESS' | 'CLOSED';

export interface PlanningTodo {
  id: string;
  text: string;
  status: PlanningStatus;
}

export interface PlanningGoal {
  id: string;
  userId: string;
  title: string;
  description: string;
  todos: PlanningTodo[];
  createdAt: number;
  updatedAt: number;
  order?: number; // New field for drag and drop sorting
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export type AppView = 'AUTH' | 'DASHBOARD' | 'REVIEW' | 'BROWSE' | 'UNIT_LIBRARY' | 'DISCOVER' | 'SETTINGS' | 'SPEAKING' | 'WRITING' | 'IRREGULAR_VERBS' | 'MIMIC' | 'LESSON' | 'LISTENING' | 'NATIVE_SPEAK' | 'EXPERIMENT' | 'WORDBOOK' | 'PLANNING';

export type DiscoverGame = 'MENU' | 'ADVENTURE' | 'COLLO_CONNECT' | 'IPA_SORTER' | 'MEANING_MATCH' | 'SENTENCE_SCRAMBLE' | 'PREPOSITION_POWER' | 'WORD_TRANSFORMER' | 'IDIOM_CONNECT' | 'PARAPHRASE_CONTEXT' | 'WORD_SCATTER';
