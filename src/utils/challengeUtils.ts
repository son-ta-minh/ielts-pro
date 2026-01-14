import { VocabularyItem, WordFamily, PrepositionPattern } from '../app/types';
import { Challenge, ChallengeType, IpaQuizChallenge, PrepositionQuizChallenge, MeaningQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, ChallengeResult, HeteronymQuizChallenge, HeteronymForm, CollocationToTest, CollocationQuizChallenge } from '../components/practice/TestModalTypes';
import { getRandomMeanings } from '../app/db';

const shuffleArray = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
            const forms = [word.word, ...(word.v2 ? [word.v2] : []), ...(word.v3 ? [word.v3] : [])];
            if (word.wordFamily) {
                if(word.wordFamily.nouns) forms.push(...word.wordFamily.nouns.map(n => n.word));
                if(word.wordFamily.verbs) forms.push(...word.wordFamily.verbs.map(v => v.word));
                if(word.wordFamily.adjs) forms.push(...word.wordFamily.adjs.map(a => a.word));
                if(word.wordFamily.advs) forms.push(...word.wordFamily.advs.map(a => a.word));
            }
            const uniqueForms = [...new Set(forms.map(f => f.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
            const regex = new RegExp(`\\b(${uniqueForms.map(escapeRegex).join('|')})\\b`, 'i');

            const collocationsToTest: CollocationToTest[] = [];
            activeCollocs.forEach(c => {
                const match = c.text.match(regex);
                if (match && typeof match.index === 'number') {
                    const headwordInVocab = match[0];
                    const index = match.index;
                    
                    const preText = c.text.substring(0, index).trim();
                    const postText = c.text.substring(index + headwordInVocab.length).trim();
            
                    let testHeadword: string;
                    let testAnswer: string;
                    let testPosition: 'pre' | 'post';
            
                    // If there is no text after the headword, the blank must be before it.
                    if (!postText && preText) {
                        const wordsInPreText = preText.split(/\s+/);
                        if (wordsInPreText.length > 1) {
                            testAnswer = wordsInPreText.slice(0, -1).join(' '); // e.g., "reach" from "reach a"
                            testHeadword = wordsInPreText.slice(-1)[0] + ' ' + headwordInVocab; // "a plateau"
                        } else {
                            testAnswer = preText;
                            testHeadword = headwordInVocab;
                        }
                        testPosition = 'post';
                    } 
                    // If there is text after the headword, the blank is after it.
                    else if (postText) {
                        testHeadword = preText ? `${preText} ${headwordInVocab}` : headwordInVocab;
                        testAnswer = postText;
                        testPosition = 'pre';
                    } else {
                        return; // continue in forEach, skip if only headword exists
                    }
            
                    collocationsToTest.push({
                        fullText: c.text,
                        headword: testHeadword,
                        answer: testAnswer,
                        position: testPosition
                    });
                }
            });

            if (collocationsToTest.length > 0) {
                list.push({ type: 'COLLOCATION_QUIZ', title: 'Collocation Recall', word, collocations: collocationsToTest });
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
        
        // Prioritize sentences with the headword that are not too long or short.
        const sentencesWithHeadword = sentences.filter(s => 
            s.length > 5 && s.length < 100 && headwordRegex.test(s)
        );

        if (sentencesWithHeadword.length > 0) {
            sentenceToTest = sentencesWithHeadword[0]; // Pick the first one
        } else {
            // Fallback: Find the first sentence that fits the criteria, regardless of headword.
            const anySuitableSentence = sentences.find(s => s.length > 5 && s.length < 100);
            if (anySuitableSentence) {
                sentenceToTest = anySuitableSentence;
            }
        }

        if (sentenceToTest) {
            const wordsInSentence = sentenceToTest.split(/\s+/).filter(Boolean);
            if (wordsInSentence.length >= 3) {
                list.push({ type: 'SENTENCE_SCRAMBLE', title: 'Sentence Builder', original: sentenceToTest.trim(), shuffled: shuffleArray([...wordsInSentence]), word });
            }
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
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

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
            return normalize(userSentence) === normalize(sc.original);
        }
        case 'HETERONYM_QUIZ': {
            const hc = challenge as HeteronymQuizChallenge;
            if (typeof answer !== 'object' || answer === null) return false;
            return hc.forms.every(form => answer[form.pos] === form.ipa);
        }
        case 'COLLOCATION_QUIZ': {
            const cq = challenge as CollocationQuizChallenge;
            const userAnswersRaw = (answer as string[] || []);
            const correctAnswersPool = cq.collocations.map(c => normalize(c.answer));
            
            const details: Record<string, boolean> = {};
            const usedCorrectAnswers = new Set<string>();
    
            userAnswersRaw.forEach((rawAns, index) => {
                const userAns = normalize(rawAns || '');
                if (userAns && correctAnswersPool.includes(userAns) && !usedCorrectAnswers.has(userAns)) {
                    details[index.toString()] = true;
                    usedCorrectAnswers.add(userAns);
                } else {
                    details[index.toString()] = false;
                }
            });
    
            const correct = Object.values(details).every(v => v);
    
            return { correct, details };
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