import { VocabularyItem, WordFamily, PrepositionPattern } from '../app/types';
import { Challenge, ChallengeType, IpaQuizChallenge, PrepositionQuizChallenge, MeaningQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, ChallengeResult, HeteronymQuizChallenge, HeteronymForm, CollocationToTest, CollocationQuizChallenge, IdiomToTest, IdiomQuizChallenge } from '../components/practice/TestModalTypes';
import { getRandomMeanings } from '../app/db';

const shuffleArray = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Normalizes a string for grading by lowercasing and removing all non-alphanumeric characters, including spaces.
 * Useful for single words or phrases where spacing is irrelevant, especially for speech-to-text.
 */
export const normalizeAnswerForGrading = (str: string): string => {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Generates a list of all possible challenges for a given vocabulary item.
 */
export function generateAvailableChallenges(word: VocabularyItem): Challenge[] {
    const list: Challenge[] = [];
    
    list.push({ type: 'SPELLING', title: 'Spelling Drill', word });
    list.push({ type: 'PRONUNCIATION', title: 'Speak Out', word });
    
    if (word.meaningVi && word.meaningVi.length > 0) {
        list.push({ type: 'MEANING_QUIZ', title: 'Meaning Recall', options: [], answer: word.meaningVi, word });
    }

    if (word.ipaMistakes && word.ipaMistakes.length > 0) {
      list.push({ type: 'IPA_QUIZ', title: 'Pronunciation Check', options: shuffleArray([word.ipa, ...word.ipaMistakes]), answer: word.ipa, word });
    }

    if (word.collocationsArray && word.collocationsArray.length > 0) {
        const activeCollocs = word.collocationsArray.filter(c => !c.isIgnored);
        if (activeCollocs.length > 0) {
            const collocationsToTest: CollocationToTest[] = activeCollocs.map(c => ({
                fullText: c.text,
                answer: c.text,
                headword: '', // Not used in new UI
                position: 'pre', // Dummy value, not used
            }));

            if (collocationsToTest.length > 0) {
                list.push({ type: 'COLLOCATION_QUIZ', title: 'Collocation Recall', word, collocations: collocationsToTest });
            }
        }
    }

    if (word.idiomsList && word.idiomsList.length > 0) {
        const activeIdioms = word.idiomsList.filter(i => !i.isIgnored);
        if (activeIdioms.length > 0) {
            const idiomsToTest: IdiomToTest[] = activeIdioms.map(i => ({
                fullText: i.text,
                answer: i.text,
                headword: '', // Not used in new UI
                position: 'pre', // Dummy value, not used
            }));

            if (idiomsToTest.length > 0) {
                list.push({ type: 'IDIOM_QUIZ', title: 'Idiom Recall', word, idioms: idiomsToTest });
            }
        }
    }

    if (word.prepositions && word.prepositions.length > 0) {
      const activePreps = word.prepositions.filter(p => !p.isIgnored);
      activePreps.forEach((prepPattern: PrepositionPattern) => {
        let quizPhrase = '';
        const headword = word.word;
        const prep = prepPattern.prep;
        const usage = prepPattern.usage;

        // If usage string itself contains the headword, it's a full example phrase.
        // In this case, we should blank out the preposition within that phrase.
        if (usage && usage.toLowerCase().includes(headword.toLowerCase())) {
            const regex = new RegExp(`\\b${escapeRegex(prep)}\\b`, 'i');
            // Check if the preposition is actually in the usage string before replacing
            if (regex.test(usage)) {
                quizPhrase = usage.replace(regex, '___');
            } else {
                // Fallback if prep is not found in the full usage string for some reason (e.g. data error)
                // We show the usage and append a blank, which is better than a broken sentence.
                quizPhrase = `${usage} [___]`;
            }
        } 
        // Otherwise, assume usage is the part that comes after "word + prep"
        else if (usage) {
            quizPhrase = `${headword} ___ ${usage}`;
        }
        // Fallback for no usage string
        else {
            quizPhrase = `${headword} ___`;
        }
        
        list.push({ type: 'PREPOSITION_QUIZ', title: 'Fill in the Prepositions', example: quizPhrase, answer: prep, word });
      });
    }

    if (word.example && word.example.trim().length > 5) {
        // Split into sentences using a positive lookbehind for punctuation.
        const sentences = word.example.trim().split(/(?<=[.?!])\s+/).filter(Boolean);

        let sentenceToTest: string | null = null;
        
        const headwordRegex = new RegExp(`\\b${escapeRegex(word.word)}\\b`, 'i');
        
        // Prioritize sentences with the headword that are not too short.
        const sentencesWithHeadword = sentences.filter(s => 
            s.length > 5 && headwordRegex.test(s)
        );

        if (sentencesWithHeadword.length > 0) {
            sentenceToTest = sentencesWithHeadword[0]; // Pick the first one
        } else {
            // Fallback: Find the first sentence that fits the criteria, regardless of headword.
            const anySuitableSentence = sentences.find(s => s.length > 5);
            if (anySuitableSentence) {
                sentenceToTest = anySuitableSentence;
            }
        }

        if (sentenceToTest) {
            const wordsInSentence = sentenceToTest.split(/\s+/).filter(Boolean);
            if (wordsInSentence.length >= 3) {
                const WORD_LIMIT_FOR_CHUNKING = 10;
                let chunks: string[];

                if (wordsInSentence.length > WORD_LIMIT_FOR_CHUNKING) {
                    chunks = [];
                    let i = 0;
                    while (i < wordsInSentence.length) {
                        const maxChunkSize = Math.min(3, wordsInSentence.length - i);
                        let chunkSize = 1;

                        // Approx 50% chance to create a larger chunk if possible
                        if (maxChunkSize > 1 && Math.random() < 0.5) {
                            if (maxChunkSize === 2) {
                                chunkSize = 2;
                            } else {
                                // If max is 3, 50% chance for 2, 50% chance for 3
                                chunkSize = Math.random() < 0.5 ? 2 : 3;
                            }
                        }
                        
                        const chunk = wordsInSentence.slice(i, i + chunkSize).join(' ');
                        chunks.push(chunk);
                        i += chunkSize;
                    }
                } else {
                    chunks = wordsInSentence;
                }
                
                list.push({ type: 'SENTENCE_SCRAMBLE', title: 'Sentence Builder', original: sentenceToTest.trim(), shuffled: shuffleArray(chunks), word });
            }
        }
    }

    if (word.wordFamily) {
        const allFamilyMembers = [
            ...(word.wordFamily.nouns || []),
            ...(word.wordFamily.verbs || []),
            ...(word.wordFamily.adjs || []),
            ...(word.wordFamily.advs || [])
        ];

        const activeFamilyMembers = allFamilyMembers.filter(m => !m.isIgnored && m.word.trim());

        const hasDistinctFamilyMembers = activeFamilyMembers.some(
            member => member.word.toLowerCase().trim() !== word.word.toLowerCase().trim()
        );

        if (hasDistinctFamilyMembers) {
            list.push({ type: 'WORD_FAMILY', title: 'Word Family Recall', word });
        }
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
    const normalize = normalizeAnswerForGrading;

    switch (challenge.type) {
        case 'SPELLING': {
            const userAnswer = normalize((answer || '').trim());
            const correctAnswer = normalize(challenge.word.word);
            return userAnswer === correctAnswer;
        }
        case 'PRONUNCIATION': {
            const userAnswer = normalize((answer || '').trim());
            const correctAnswer = normalize(challenge.word.word);
            return userAnswer === correctAnswer;
        }
        case 'IPA_QUIZ': return answer === (challenge as IpaQuizChallenge).answer;
        case 'MEANING_QUIZ': return answer === (challenge as MeaningQuizChallenge).answer;
        case 'PREPOSITION_QUIZ': return (answer || '').trim().toLowerCase() === (challenge as PrepositionQuizChallenge).answer.toLowerCase();
        case 'PARAPHRASE_QUIZ': {
            const userAnswer = normalize((answer || '').trim());
            const correctAnswer = normalize((challenge as ParaphraseQuizChallenge).answer);
            return userAnswer === correctAnswer;
        }
        case 'SENTENCE_SCRAMBLE': {
            const sc = challenge as SentenceScrambleChallenge;
            const userSentence = (answer || []).join(' ');
            // FIX: Use a local normalize function that preserves spaces for sentence comparison.
            const normalizeSentence = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
            return normalizeSentence(userSentence) === normalizeSentence(sc.original);
        }
        case 'HETERONYM_QUIZ': {
            const hc = challenge as HeteronymQuizChallenge;
            if (typeof answer !== 'object' || answer === null) return false;
            return hc.forms.every(form => answer[form.pos] === form.ipa);
        }
        case 'COLLOCATION_QUIZ': {
            const cq = challenge as CollocationQuizChallenge;
            const correctItems = cq.collocations;
            
            // 1. Normalize user answers into a mutable pool.
            const userAnswerPool = (answer as string[] || []).map(a => normalize(a || ''));
            
            // 2. Initialize details object keyed by the correct answer's index.
            const details: Record<string, boolean> = {};

            // 3. Iterate through each CORRECT answer to see if it was provided by the user.
            correctItems.forEach((correctItem, index) => {
                const normalizedCorrectAnswer = normalize(correctItem.answer);
                
                // 4. Find this correct answer in the user's input pool.
                const userPoolIndex = userAnswerPool.indexOf(normalizedCorrectAnswer);
                
                if (userPoolIndex !== -1) {
                    // Match found. Mark this correct answer's index as true.
                    details[index.toString()] = true;
                    // Consume the user's answer so it can't be used to match another correct answer (handles duplicates).
                    userAnswerPool.splice(userPoolIndex, 1);
                } else {
                    // No match found for this correct answer. Mark its index as false.
                    details[index.toString()] = false;
                }
            });

            // 5. Determine overall correctness.
            const isOverallCorrect = Object.values(details).every(v => v === true) && Object.values(details).length === correctItems.length;

            return { correct: isOverallCorrect, details };
        }
        case 'IDIOM_QUIZ': {
            const iq = challenge as IdiomQuizChallenge;
            const correctItems = iq.idioms;
            
            // 1. Normalize user answers into a mutable pool.
            const userAnswerPool = (answer as string[] || []).map(a => normalize(a || ''));

            // 2. Initialize details object keyed by the correct answer's index.
            const details: Record<string, boolean> = {};
            
            // 3. Iterate through each CORRECT answer to see if it was provided by the user.
            correctItems.forEach((correctItem, index) => {
                const normalizedCorrectAnswer = normalize(correctItem.answer);
                
                // 4. Find this correct answer in the user's input pool.
                const userPoolIndex = userAnswerPool.indexOf(normalizedCorrectAnswer);
                
                if (userPoolIndex !== -1) {
                    // Match found. Mark this correct answer's index as true.
                    details[index.toString()] = true;
                    // Consume the user's answer so it can't be used to match another correct answer (handles duplicates).
                    userAnswerPool.splice(userPoolIndex, 1);
                } else {
                    // No match found for this correct answer. Mark its index as false.
                    details[index.toString()] = false;
                }
            });

            // 5. Determine overall correctness.
            const isOverallCorrect = Object.values(details).every(v => v === true) && Object.values(details).length === correctItems.length;

            return { correct: isOverallCorrect, details };
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
