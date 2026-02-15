
import { VocabularyItem, WordQuality } from '../app/types';

/**
 * Phonemes used in the IPA Sorter game.
 * If a word contains these, it's a candidate, provided they aren't part of affricates/diphthongs.
 */
const TARGET_PHONEMES = [
    'i:', 'ɪ', 'u:', 'ʊ', 'æ', 'e', 'ʌ', 'ɑ:', 'ɒ', 'ɔ:', 'eɪ', 'əʊ', 
    's', 'ʃ', 'tʃ', 'dʒ', 'θ', 'ð', 't', 'd', 'n', 'l', 'ŋ', 'v', 'w'
];

/**
 * Advanced check for the IPA Sorter.
 * Returns true if the word contains at least one target phoneme that is NOT 
 * incorrectly isolated from a larger multi-character sound.
 */
const checkIpaEligibility = (ipa: string): boolean => {
    if (!ipa || ipa.length < 2) return false;

    // We check if any of our target phonemes exist as "clean" instances
    return TARGET_PHONEMES.some(phoneme => {
        if (phoneme === 'tʃ' || phoneme === 'dʒ') return ipa.includes(phoneme);
        
        const escaped = phoneme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let regex: RegExp;
        
        if (phoneme === 'd') regex = new RegExp(`${escaped}(?!ʒ)`);
        else if (phoneme === 't') regex = new RegExp(`${escaped}(?!ʃ)`);
        else if (phoneme === 'ʃ') regex = new RegExp(`(?<!t)${escaped}`);
        else if (phoneme === 'ʒ') regex = new RegExp(`(?<!d)${escaped}`);
        else if (phoneme === 'ɪ') regex = new RegExp(`(?<![aeɔ])${escaped}`);
        else if (phoneme === 'ʊ') regex = new RegExp(`(?<![aə])${escaped}`);
        else if (phoneme === 'e') regex = new RegExp(`${escaped}(?!ɪ)`);
        else regex = new RegExp(escaped);

        return regex.test(ipa);
    });
};

/**
 * Evaluates a vocabulary item against all Discover arcade game requirements.
 */
export const calculateGameEligibility = (item: VocabularyItem): string[] => {
    // Words must be verified AND already learned/reviewed (i.e., not new) to be eligible for games.
    if (item.quality !== WordQuality.VERIFIED || !item.lastReview) {
        return [];
    }

    const eligible: string[] = [];

    // COLLO_CONNECT: Needs at least one non-ignored collocation
    if (item.collocationsArray && item.collocationsArray.some(c => !c.isIgnored)) {
        eligible.push('COLLO_CONNECT');
    }

    // IDIOM_CONNECT: Needs at least one non-ignored idiom
    if (item.idiomsList && item.idiomsList.some(i => !i.isIgnored)) {
        eligible.push('IDIOM_CONNECT');
    }

    // MEANING_MATCH: Needs a word and a native definition
    if (item.word && item.meaningVi && item.meaningVi.trim().length > 0) {
        eligible.push('MEANING_MATCH');
    }

    // IPA_SORTER: Needs valid IPA and pass phonetic cluster checks
    if (item.ipaUs && checkIpaEligibility(item.ipaUs)) {
        eligible.push('IPA_SORTER');
    }

    // SENTENCE_SCRAMBLE: Needs an example with enough words to be interesting
    if (item.example && item.example.trim().split(/\s+/).filter(Boolean).length >= 5) {
        eligible.push('SENTENCE_SCRAMBLE');
    }

    // PREPOSITION_POWER: Needs prepositions AND an example sentence
    if (item.example && item.prepositions && item.prepositions.some(p => !p.isIgnored)) {
        eligible.push('PREPOSITION_POWER');
    }

    // WORD_TRANSFORMER: Needs a word family with at least 2 unique members AND an example
    if (item.example && item.wordFamily) {
        const familyWords = [
            ...(item.wordFamily.nouns || []),
            ...(item.wordFamily.verbs || []),
            ...(item.wordFamily.adjs || []),
            ...(item.wordFamily.advs || [])
        ].filter(m => !m.isIgnored).map(m => m.word.toLowerCase());
        
        familyWords.push(item.word.toLowerCase());
        const uniqueCount = new Set(familyWords).size;
        
        if (uniqueCount >= 2) {
            eligible.push('WORD_TRANSFORMER');
        }
    }

    // PARAPHRASE_CONTEXT: Needs at least 2 non-ignored paraphrases with contexts
    if (item.paraphrases && item.paraphrases.filter(p => !p.isIgnored && p.context && p.context.trim()).length >= 2) {
        eligible.push('PARAPHRASE_CONTEXT');
    }

    return eligible;
};
