import { VocabularyItem, WordQuality } from '../app/types';

export const DEFAULT_USER_ID = 'u-vocab-master';
export const LOCAL_SHIPPED_DATA_PATH = '/data/data.json';

// Fix: Added missing 'quality' property to satisfy VocabularyItem type
const birdTemplate: Omit<VocabularyItem, 'id' | 'word' | 'ipa' | 'meaningVi' | 'example' | 'tags' | 'note'> = {
    userId: '', 
    isIdiom: false,
    isPhrasalVerb: false,
    isCollocation: false,
    isStandardPhrase: false,
    needsPronunciationFocus: false,
    isPassive: false,
    isExampleLocked: false,
    quality: WordQuality.RAW,
    createdAt: 0,
    updatedAt: 0,
    nextReview: 0, 
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
};

export const initialVocabulary: VocabularyItem[] = [
];