import { VocabularyItem, WordFamily, PrepositionPattern } from '../app/types';
import { Challenge, ChallengeType, IpaQuizChallenge, PrepositionQuizChallenge, MeaningQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, ChallengeResult, HeteronymQuizChallenge, HeteronymForm } from '../components/practice/TestModalTypes';
import { getRandomMeanings } from '../app/db';

const shuffleArray = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

/**
 * Generates a list of all possible challenges for a given vocabulary item.
 */
export function generateAvailableChallenges(word: VocabularyItem): Challenge[] {
    const list: Challenge[] = [];
    
    list.push({ type: 'SPELLING', title: 'Spelling Drill', word });
    
    if (word.meaningVi && word.meaningVi.length > 0) {
        list.push({ type: 'MEANING_QUIZ', title: 'Meaning Recall', options: [], answer: word.meaningVi, word });
    }

    if (word.ipaMistakes && word.ipaMistakes.length > 0) {
      list.push({ type: 'IPA_QUIZ', title: 'Pronunciation Check', options: shuffleArray([word.ipa, ...word.ipaMistakes]), answer: word.ipa, word });
    }

    if (word.prepositions && word.prepositions.length > 0) {
      const activePreps = word.prepositions.filter(p => !p.isIgnored);
      activePreps.forEach((prepPattern: PrepositionPattern) => {
        const quizPhrase = prepPattern.usage ? `${word.word} ___ ${prepPattern.usage}` : `${word.word} ___`;
        list.push({ type: 'PREPOSITION_QUIZ', title: 'Fill in the Prepositions', example: quizPhrase, answer: prepPattern.prep, word });
      });
    }

    if (word.example && word.example.trim().length > 5 && word.example.length < 100) {
        const wordsInSentence = word.example.trim().split(/\s+/).filter(Boolean);
        if (wordsInSentence.length >= 3) {
            list.push({ type: 'SENTENCE_SCRAMBLE', title: 'Sentence Builder', original: word.example.trim(), shuffled: shuffleArray([...wordsInSentence]), word });
        }
    }

    if (word.wordFamily && (
        word.wordFamily.nouns?.some(m => !m.isIgnored) ||
        word.wordFamily.verbs?.some(m => !m.isIgnored) ||
        word.wordFamily.adjs?.some(m => !m.isIgnored) ||
        word.wordFamily.advs?.some(m => !m.isIgnored)
    )) {
      list.push({ type: 'WORD_FAMILY', title: 'Word Family Recall', word });
    }
    
    const formsToTest: HeteronymForm[] = [];
    const foundIpas = new Set<string>();

    if (word.wordFamily) {
        (['nouns', 'verbs', 'adjs', 'advs'] as const).forEach(posKey => {
            (word.wordFamily?.[posKey] || []).forEach(member => {
                if (member.word.toLowerCase() === word.word.toLowerCase() && member.ipa) {
                    if (!foundIpas.has(member.ipa)) {
                        formsToTest.push({ pos: posKey.slice(0, -1), ipa: member.ipa });
                        foundIpas.add(member.ipa);
                    }
                }
            });
        });
    }

    if (formsToTest.length >= 2) {
        list.push({
            type: 'HETERONYM_QUIZ',
            title: 'Heteronym Challenge',
            word,
            forms: formsToTest,
            ipaOptions: shuffleArray(formsToTest.map(f => f.ipa))
        });
    }

    if (word.paraphrases && word.paraphrases.length > 0) {
        word.paraphrases.filter(p => !p.isIgnored).forEach(para => {
            list.push({ type: 'PARAPHRASE_QUIZ', title: 'Word Power Recall', tone: para.tone, context: para.context, answer: para.word, word });
        });
    }

    return list;
}

/**
 * Prepares a list of challenges by fetching necessary data (e.g., distractor meanings).
 */
export async function prepareChallenges(challenges: Challenge[], word: VocabularyItem): Promise<Challenge[]> {
    const finalChallenges: Challenge[] = [];
    for (const challenge of challenges) {
        if (challenge.type === 'MEANING_QUIZ') {
            const distractors = await getRandomMeanings(word.userId, 3, word.id);
            const options = shuffleArray([word.meaningVi, ...distractors]);
            finalChallenges.push({ ...challenge, options } as MeaningQuizChallenge);
        } else {
            finalChallenges.push(challenge);
        }
    }
    return finalChallenges;
}

/**
 * Grades a single challenge based on the user's answer.
 */
export function gradeChallenge(challenge: Challenge, answer: any): ChallengeResult {
    switch (challenge.type) {
        case 'SPELLING': return (answer || '').trim().toLowerCase() === challenge.word.word.toLowerCase();
        case 'IPA_QUIZ': return answer === (challenge as IpaQuizChallenge).answer;
        case 'MEANING_QUIZ': return answer === (challenge as MeaningQuizChallenge).answer;
        case 'PREPOSITION_QUIZ': return (answer || '').trim().toLowerCase() === (challenge as PrepositionQuizChallenge).answer.toLowerCase();
        case 'PARAPHRASE_QUIZ': return (answer || '').trim().toLowerCase() === (challenge as ParaphraseQuizChallenge).answer.toLowerCase();
        case 'SENTENCE_SCRAMBLE': {
            const sc = challenge as SentenceScrambleChallenge;
            const userSentence = (answer || []).join(' ');
            return userSentence.toLowerCase() === sc.original.toLowerCase();
        }
        case 'HETERONYM_QUIZ': {
            const hc = challenge as HeteronymQuizChallenge;
            if (typeof answer !== 'object' || answer === null) return false;
            return hc.forms.every(form => answer[form.pos] === form.ipa);
        }
        case 'WORD_FAMILY': {
            const familyTypes: (keyof WordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
            const details: Record<string, boolean> = {};
            let allCorrect = true;
            let hasMembers = false;
            familyTypes.forEach(type => {
                const correctForms = (challenge.word.wordFamily?.[type] || []).filter(m => !m.isIgnored).map(m => m.word.toLowerCase().trim()).filter(Boolean);
                if (correctForms.length > 0) {
                    hasMembers = true;
                    const userForms = (answer?.[type] || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                    const isTypeCorrect = correctForms.length === userForms.length && correctForms.every(f => userForms.includes(f));
                    details[type] = isTypeCorrect;
                    if (!isTypeCorrect) allCorrect = false;
                }
            });
            return { correct: hasMembers && allCorrect, details };
        }
        default: return false;
    }
}