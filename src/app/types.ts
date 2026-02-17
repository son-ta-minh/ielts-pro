
export type AppView = 'AUTH' | 'DASHBOARD' | 'BROWSE' | 'REVIEW' | 'SETTINGS' | 'DISCOVER' | 'UNIT_LIBRARY' | 'WRITING' | 'SPEAKING' | 'LISTENING' | 'LESSON' | 'MIMIC' | 'IRREGULAR_VERBS' | 'NATIVE_SPEAK' | 'WORDBOOK' | 'PLANNING' | 'EXPERIMENT';

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
  STANDARD = 'STANDARD',
  SPELLING = 'SPELLING',
  MEANING = 'MEANING',
  PHONETIC = 'PHONETIC',
  IRREGULAR = 'IRREGULAR',
  PREPOSITION = 'PREPOSITION'
}

export enum ParaphraseMode {
  VARIETY = 'VARIETY',
  MORE_ACADEMIC = 'MORE_ACADEMIC',
  LESS_ACADEMIC = 'LESS_ACADEMIC'
}

export type WordTypeOption = 'vocab' | 'idiom' | 'phrasal' | 'collocation' | 'phrase' | 'archive' | 'duplicate';

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
  badges: string[];
  hpPotions?: number;
  wisdomFruits?: number;
  lastDailyEnergyAwardDate?: string;
  dailyEnergyAwarded?: number;
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
  adventureLastDailyStar?: string;
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
  d?: string;
}

export type WordSource = 'app' | 'manual' | 'refine';

export interface VocabularyItem {
  id: string;
  userId: string; 
  word: string; 
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
  groups?: string[]; 
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
  isImplicitImperative?: boolean;
  isPhrasalPhrasalVerb?: boolean;
  isIrregular?: boolean; 
  isExampleLocked?: boolean;
  isPassive?: boolean;
  quality: WordQuality;
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
  gameEligibility?: string[];
  intensityLessonId?: string;
  lesson?: {
    essay?: string;
    test?: string;
  };
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
  image?: string;
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
  label?: string; 
  description: string; 
  questions: string[]; 
  sampleAnswers?: string[]; 
  path?: string;
  tags?: string[];
  note?: string; 
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
  image?: string;
  path?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export type CompositionLabel = 'IELTS Task 1' | 'IELTS Task 2' | 'Professional' | 'Academic' | 'Informal' | 'Free Write';

export interface Composition {
  id: string;
  userId: string;
  title?: string;
  label: CompositionLabel; 
  path?: string;
  tags?: string[];
  content: string;
  linkedWordIds: string[]; 
  aiFeedback?: string; 
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
  v1: string; 
  v2: string; 
  v3: string; 
  createdAt: number;
  updatedAt: number;
  lastTestResult?: 'pass' | 'fail';
  lastTestTimestamp?: number;
  lastTestIncorrectForms?: ('v1' | 'v2' | 'v3')[];
}

export type LessonType = 'essay' | 'word' | 'intensity' | 'comparison';

export interface IntensityItem {
    word: string;
    register?: 'academic' | 'casual'; 
}

export interface IntensityRow {
    softened: IntensityItem[];
    neutral: IntensityItem[];
    intensified: IntensityItem[];
}

export interface ComparisonRow {
    word: string;
    nuance: string;
    example: string;
}

export interface Lesson {
  id: string;
  userId: string;
  type?: LessonType; 
  topic1: string; 
  topic2: string; 
  title: string;
  description: string;
  content: string; 
  listeningContent?: string; 
  testContent?: string; 
  image?: string;
  intensityRows?: IntensityRow[];
  comparisonRows?: ComparisonRow[];
  searchKeywords?: string[];
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
  title?: string; 
  text: string; 
  note?: string;
  path?: string;
  tags?: string[];
  audioLinks?: string[]; 
  image?: string;
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
    standard: string; 
    answers: NativeSpeakAnswer[];
    path?: string;
    tags: string[];
    note?: string; 
    image?: string;
    createdAt: number;
    updatedAt: number;
    focusColor?: FocusColor;
    isFocused?: boolean;
    bestScore?: number;
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
    icon?: string; 
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
    image?: string;
    createdAt: number;
    updatedAt: number;
    focusColor?: FocusColor;
    isFocused?: boolean;
    bestScore?: number;
}

export interface UserRecording {
    id: string;
    url: string; 
    mapName: string; 
    filename: string; 
    timestamp: number;
    duration?: number;
}

export interface FreeTalkItem {
  id: string;
  userId: string;
  title: string;
  content: string; 
  path?: string;
  tags: string[];
  audioLinks?: string[]; 
  image?: string;
  userRecordings?: UserRecording[]; 
  createdAt: number;
  updatedAt: number;
  focusColor?: FocusColor;
  isFocused?: boolean;
  bestScore?: number; 
  sentenceScores?: Record<number, number>; 
}

export interface WordBookItem {
  word: string;
  definition: string;
}

export interface WordBook {
  id: string;
  userId: string;
  topic: string;
  icon: string; 
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

export interface ReadingBook {
  id: string;
  userId: string;
  title: string; 
  icon?: string;
  color?: string;
  unitIds: string[]; 
  createdAt: number;
  updatedAt: number;
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

export interface LessonBook {
  id: string;
  userId: string;
  title: string; 
  icon?: string;
  color?: string;
  itemIds: string[]; 
  createdAt: number;
  updatedAt: number;
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

export interface ListeningBook {
  id: string;
  userId: string;
  title: string; 
  icon?: string;
  color?: string;
  itemIds: string[]; 
  createdAt: number;
  updatedAt: number;
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

export interface SpeakingBook {
  id: string;
  userId: string;
  title: string; 
  icon?: string;
  color?: string;
  itemIds: string[]; 
  createdAt: number;
  updatedAt: number;
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

export interface WritingBook {
  id: string;
  userId: string;
  title: string; 
  icon?: string;
  color?: string;
  itemIds: string[]; 
  createdAt: number;
  updatedAt: number;
  titleColor?: string;
  titleSize?: number;
  titleTop?: number;
  titleLeft?: number;
  iconTop?: number;
  iconLeft?: number;
}

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
  order?: number; 
  focusColor?: FocusColor;
  isFocused?: boolean;
}

export type DiscoverGame = 'MENU' | 'ADVENTURE' | 'IPA_SORTER' | 'SENTENCE_SCRAMBLE' | 'PREPOSITION_POWER' | 'PARAPHRASE_CONTEXT' | 'WORD_SCATTER' | 'DICTATION';
