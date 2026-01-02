
import { VocabularyItem } from '../types';

export const DEFAULT_USER_ID = 'u-master-learner';

/**
 * High-quality starter vocabulary for IELTS
 */
export const initialVocabulary: VocabularyItem[] = [
  {
    id: "seed-1",
    userId: DEFAULT_USER_ID,
    word: "Ubiquitous",
    ipa: "/juːˈbɪkwɪtəs/",
    meaningVi: "Phổ biến ở khắp mọi nơi",
    example: "Mobile phones are now ubiquitous in modern society.",
    note: "Great for Writing Task 2 - Technology topics.",
    tags: ["Academic", "Technology"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    needsPronunciationFocus: true
  },
  {
    id: "seed-2",
    userId: DEFAULT_USER_ID,
    word: "A piece of cake",
    ipa: "/ə piːs əv keɪk/",
    meaningVi: "Dễ như ăn cháo",
    example: "I thought the exam was going to be difficult, but it was a piece of cake.",
    note: "Use in Speaking Part 1 only.",
    tags: ["Speaking", "Informal"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    isIdiom: true
  },
  {
    id: "seed-3",
    userId: DEFAULT_USER_ID,
    word: "Mitigate",
    ipa: "/ˈmɪtɪɡeɪt/",
    meaningVi: "Giảm nhẹ, làm dịu bớt",
    example: "New laws have been introduced to mitigate the effects of climate change.",
    note: "Formal synonym for 'reduce'. Very useful for Task 2.",
    tags: ["Academic", "Writing"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0
  },
  {
    id: "seed-4",
    userId: DEFAULT_USER_ID,
    word: "Entrepreneur",
    ipa: "/ˌɒntrəprəˈnɜː(r)/",
    meaningVi: "Doanh nhân",
    example: "He's a creative entrepreneur who has started several successful businesses.",
    note: "Tricky pronunciation: emphasis on the last syllable.",
    tags: ["Work", "Business"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    needsPronunciationFocus: true
  },
  {
    id: "seed-5",
    userId: DEFAULT_USER_ID,
    word: "Once in a blue moon",
    ipa: "/wʌns ɪn ə bluː muːn/",
    meaningVi: "Năm thì mười họa (rất hiếm khi)",
    example: "My sister lives in Alaska, so I only get to see her once in a blue moon.",
    note: "Idiom for frequency in Speaking.",
    tags: ["Speaking", "Frequency"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextReview: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    forgotCount: 0,
    isIdiom: true
  }
];
