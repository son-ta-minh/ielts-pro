import { VocabularyItem, ParaphraseTone } from '../../app/types';

export type ChallengeType = 'SPELLING' | 'IPA_QUIZ' | 'PREPOSITION_QUIZ' | 'WORD_FAMILY' | 'MEANING_QUIZ' | 'PARAPHRASE_QUIZ' | 'SENTENCE_SCRAMBLE' | 'HETERONYM_QUIZ' | 'PRONUNCIATION' | 'COLLOCATION_QUIZ' | 'IDIOM_QUIZ';

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

export interface CollocationToTest {
    fullText: string;
    answer: string;
    headword: string;
    position: 'pre' | 'post';
}
export interface CollocationQuizChallenge extends BaseChallenge {
    type: 'COLLOCATION_QUIZ';
    collocations: CollocationToTest[];
}

export type IdiomToTest = CollocationToTest;

export interface IdiomQuizChallenge extends BaseChallenge {
    type: 'IDIOM_QUIZ';
    idioms: IdiomToTest[];
}

export type Challenge = SpellingChallenge | IpaQuizChallenge | PrepositionQuizChallenge | WordFamilyChallenge | MeaningQuizChallenge | ParaphraseQuizChallenge | SentenceScrambleChallenge | HeteronymQuizChallenge | PronunciationChallenge | CollocationQuizChallenge | IdiomQuizChallenge;

export type ChallengeResult = boolean | {
    correct: boolean;
    details: Record<string, boolean>;
};