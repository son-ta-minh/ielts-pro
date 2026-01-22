
import { VocabularyItem, ParaphraseTone, ReviewGrade } from '../../app/types';

export type ChallengeType = 'SPELLING' | 'IPA_QUIZ' | 'PREPOSITION_QUIZ' | 'WORD_FAMILY' | 'MEANING_QUIZ' | 'PARAPHRASE_QUIZ' | 'SENTENCE_SCRAMBLE' | 'HETERONYM_QUIZ' | 'PRONUNCIATION' | 'COLLOCATION_QUIZ' | 'IDIOM_QUIZ' | 'PARAPHRASE_CONTEXT_QUIZ' | 'COLLOCATION_CONTEXT_QUIZ' | 'COLLOCATION_MULTICHOICE_QUIZ' | 'IDIOM_CONTEXT_QUIZ';

export interface BaseChallenge {
  type: ChallengeType;
  title: string;
  word: VocabularyItem;
}

export interface SpellingChallenge extends BaseChallenge { type: 'SPELLING'; }
export interface PronunciationChallenge extends BaseChallenge { type: 'PRONUNCIATION'; }
export interface IpaQuizChallenge extends BaseChallenge { type: 'IPA_QUIZ'; options: string[]; answer: string; }
export interface PrepositionQuizChallenge extends BaseChallenge { type: 'PREPOSITION_QUIZ'; example: string; answer: string; }
export interface WordFamilyChallenge extends BaseChallenge { type: 'WORD_FAMILY'; }
export interface MeaningQuizChallenge extends BaseChallenge { type: 'MEANING_QUIZ'; options: string[]; answer: string; }
export interface ParaphraseQuizChallenge extends BaseChallenge { type: 'PARAPHRASE_QUIZ'; tone: ParaphraseTone; context: string; answer: string; }
export interface SentenceScrambleChallenge extends BaseChallenge { type: 'SENTENCE_SCRAMBLE'; original: string; shuffled: string[]; }

export interface HeteronymForm {
  pos: string; // part of speech: 'noun', 'verb', etc.
  ipa: string;
}
export interface HeteronymQuizChallenge extends BaseChallenge {
  type: 'HETERONYM_QUIZ';
  forms: HeteronymForm[];
  ipaOptions: string[];
}

export interface CollocationQuizChallenge extends BaseChallenge {
    type: 'COLLOCATION_QUIZ';
    fullText: string;
    cue: string;
    answer: string;
}

export interface CollocationMultichoiceQuizChallenge extends BaseChallenge {
    type: 'COLLOCATION_MULTICHOICE_QUIZ';
    fullText: string;
    cue: string;
    answer: string;
    options: string[];
}

export interface IdiomQuizChallenge extends BaseChallenge {
    type: 'IDIOM_QUIZ';
    fullText: string;
    cue: string;
    answer: string;
}

export interface ParaphraseContextQuizItem {
    id: string;
    text: string;
    pairId: string;
    tone?: string;
}

export interface ParaphraseContextQuizChallenge extends BaseChallenge {
    type: 'PARAPHRASE_CONTEXT_QUIZ';
    contexts: ParaphraseContextQuizItem[];
    paraphrases: ParaphraseContextQuizItem[];
}

export interface CollocationContextQuizItem {
    id: string;
    text: string;
    pairId: string;
}

export interface CollocationContextQuizChallenge extends BaseChallenge {
    type: 'COLLOCATION_CONTEXT_QUIZ';
    contexts: CollocationContextQuizItem[];
    collocations: CollocationContextQuizItem[];
}

export interface IdiomContextQuizItem {
    id: string;
    text: string;
    pairId: string;
}

export interface IdiomContextQuizChallenge extends BaseChallenge {
    type: 'IDIOM_CONTEXT_QUIZ';
    contexts: IdiomContextQuizItem[];
    idioms: IdiomContextQuizItem[];
}

export type Challenge = SpellingChallenge | IpaQuizChallenge | PrepositionQuizChallenge | WordFamilyChallenge | MeaningQuizChallenge | ParaphraseQuizChallenge | SentenceScrambleChallenge | HeteronymQuizChallenge | PronunciationChallenge | CollocationQuizChallenge | CollocationMultichoiceQuizChallenge | IdiomQuizChallenge | ParaphraseContextQuizChallenge | CollocationContextQuizChallenge | IdiomContextQuizChallenge;

export type ChallengeResult = boolean | {
    correct: boolean;
    details: Record<string, boolean>;
};

export interface RecapData {
  oldMastery: number;
  newMastery: number;
  oldStatus: string;
  newStatus: ReviewGrade;
  results: { type: ChallengeType; passed: boolean }[];
  finalGrade: ReviewGrade;
  resultHistory: Record<string, boolean>;
  counts: { correct: number, tested: number };
}
