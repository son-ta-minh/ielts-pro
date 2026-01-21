import { VocabularyItem, WordFamily, PrepositionPattern } from '../app/types';
import { Challenge, ChallengeType, IpaQuizChallenge, PrepositionQuizChallenge, MeaningQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, ChallengeResult, HeteronymQuizChallenge, HeteronymForm, CollocationQuizChallenge, IdiomQuizChallenge, ParaphraseContextQuizChallenge, ParaphraseContextQuizItem } from '../components/practice/TestModalTypes';
import { getRandomMeanings } from '../app/db';

const shuffleArray = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeAnswerForGrading = (str: string): string => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();


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
        const activeCollocs = word.collocationsArray.filter(c => !c.isIgnored && c.d);
        activeCollocs.forEach(colloc => {
            list.push({
                type: 'COLLOCATION_QUIZ',
                title: 'Collocation Recall',
                word,
                fullText: colloc.text,
                cue: colloc.d!,
                answer: colloc.text
            });
        });
    }

    if (word.idiomsList && word.idiomsList.length > 0) {
        const activeIdioms = word.idiomsList.filter(i => !i.isIgnored && i.d);
        activeIdioms.forEach(idiom => {
            list.push({
                type: 'IDIOM_QUIZ',
                title: 'Idiom Recall',
                word,
                fullText: idiom.text,
                cue: idiom.d!,
                answer: idiom.text
            });
        });
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
        // Split by newline first, then by punctuation for robustness. This handles both formats.
        const sentences = word.example.trim()
            .split('\n')
            .flatMap(line => line.split(/(?<=[.?!])\s+/))
            .map(s => s.trim())
            .filter(s => s.length > 5);

        for (const sentence of sentences) {
            const wordsInSentence = sentence.split(/\s+/).filter(Boolean);
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
                
                list.push({
                    type: 'SENTENCE_SCRAMBLE',
                    title: 'Sentence Builder',
                    original: sentence.trim(),
                    shuffled: shuffleArray(chunks),
                    word
                });
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

    if (word.paraphrases && word.paraphrases.filter(p => !p.isIgnored && p.context && p.context.trim()).length >= 2) {
        list.push({ type: 'PARAPHRASE_CONTEXT_QUIZ', title: 'Paraphrase Context', word, contexts: [], paraphrases: [] });
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
        } else if (challenge.type === 'PARAPHRASE_CONTEXT_QUIZ') {
            const word = challenge.word;
            const validParaphrases = (word.paraphrases || [])
                .filter(p => !p.isIgnored && p.context && p.context.trim())
                .sort(() => Math.random() - 0.5)
                .slice(0, 5); // Take up to 5 pairs
    
            if (validParaphrases.length >= 2) {
                const contextItems: ParaphraseContextQuizItem[] = [];
                const paraphraseItems: ParaphraseContextQuizItem[] = [];
    
                validParaphrases.forEach((p, index) => {
                    const pairId = `${word.id}-${index}`;
                    contextItems.push({ id: `context-${pairId}`, text: p.context!, pairId, tone: p.tone });
                    paraphraseItems.push({ id: `word-${pairId}`, text: p.word, pairId });
                });
                
                finalChallenges.push({
                    ...challenge,
                    contexts: contextItems,
                    paraphrases: shuffleArray(paraphraseItems) // Shuffle paraphrases
                } as ParaphraseContextQuizChallenge);
            }
        }
        else {
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
        case 'SPELLING':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.word.word);
        case 'IPA_QUIZ':
            return answer === challenge.answer; // Not text input
        case 'PREPOSITION_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'MEANING_QUIZ':
            return answer === challenge.answer; // Not text input
        case 'PARAPHRASE_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'COLLOCATION_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'IDIOM_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'SENTENCE_SCRAMBLE':
            const assembled = (answer || []).join(' ');
            return normalizeAnswerForGrading(assembled) === normalizeAnswerForGrading(challenge.original);
        case 'PRONUNCIATION':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.word.word);
        case 'HETERONYM_QUIZ': {
            if (!answer) return false;
            let allCorrect = true;
            for (const form of challenge.forms) {
                if (answer[form.pos] !== form.ipa) {
                    allCorrect = false;
                    break;
                }
            }
            return allCorrect;
        }
        case 'WORD_FAMILY': {
            const details: Record<string, boolean> = {};
            let allCorrect = true;
            let testedSomething = false;

            const typeMap: Record<keyof WordFamily, string> = { nouns: 'n', verbs: 'v', adjs: 'j', advs: 'd' };

            (['nouns', 'verbs', 'adjs', 'advs'] as const).forEach(type => {
                const correctForms = (challenge.word.wordFamily?.[type] || []).filter(f => !f.isIgnored).map(f => f.word);
                if (correctForms.length > 0) {
                    testedSomething = true;
                    
                    const userFormsRaw = (answer?.[type] || '').split(',').filter(Boolean);
                    const userFormsNormalizedPool = userFormsRaw.map(f => normalizeAnswerForGrading(f));
                    
                    const shortType = typeMap[type];
                    
                    correctForms.forEach(correctForm => {
                        const normalizedCorrect = normalizeAnswerForGrading(correctForm);
                        const foundIndex = userFormsNormalizedPool.findIndex(uf => uf === normalizedCorrect);
                        
                        const isPresent = foundIndex !== -1;
                        details[`${shortType}:${correctForm}`] = isPresent; // Key is CANONICAL
                        
                        if (isPresent) {
                            userFormsNormalizedPool.splice(foundIndex, 1);
                        } else {
                            allCorrect = false;
                        }
                    });
                    
                    if (userFormsNormalizedPool.length > 0) {
                        allCorrect = false;
                    }
                }
            });

            if (!testedSomething) return true;
            
            return { correct: allCorrect, details };
        }
        case 'PARAPHRASE_CONTEXT_QUIZ': {
            const ch = challenge as ParaphraseContextQuizChallenge;
            if (!(answer instanceof Map) || answer.size === 0) {
                return { correct: false, details: {} };
            }

            const details: Record<string, boolean> = {};
            let correctCount = 0;

            ch.contexts.forEach(context => {
                const selectedParaphraseId = answer.get(context.id);
                if (selectedParaphraseId) {
                    const selectedParaphrase = ch.paraphrases.find(p => p.id === selectedParaphraseId);
                    if (selectedParaphrase && selectedParaphrase.pairId === context.pairId) {
                        details[context.id] = true;
                        correctCount++;
                    } else {
                        details[context.id] = false;
                    }
                } else {
                    details[context.id] = false;
                }
            });
            
            return {
                correct: correctCount === ch.contexts.length,
                details
            };
        }
        default:
            return false;
    }
}