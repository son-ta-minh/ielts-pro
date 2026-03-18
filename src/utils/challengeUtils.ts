
import { VocabularyItem, WordFamily, PrepositionPattern } from '../app/types';
import { Challenge, ChallengeType, IpaQuizChallenge, IpaMatchChallenge, PrepositionQuizChallenge, MeaningQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge, ChallengeResult, HeteronymQuizChallenge, HeteronymForm, CollocationQuizChallenge, IdiomQuizChallenge, ParaphraseContextQuizChallenge, ParaphraseContextQuizItem, CollocationContextQuizChallenge, CollocationContextQuizItem, CollocationMultichoiceQuizChallenge, IdiomContextQuizChallenge, IdiomContextQuizItem } from '../components/practice/TestModalTypes';
import { getRandomMeanings } from '../app/db';
import { getConfig, getServerUrl } from '../app/settingsManager';

const shuffleArray = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normalizeAnswerForGrading = (str: string): string => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

interface CambridgePronunciation {
    partOfSpeech?: string | null;
    ipaUs?: string | null;
    ipaUk?: string | null;
}

interface CambridgeSimpleResult {
    exists: boolean;
    word?: string;
    pronunciations?: CambridgePronunciation[];
}

const normalizeCambridgePronunciations = (items?: CambridgePronunciation[]): CambridgePronunciation[] => {
    if (!Array.isArray(items) || items.length === 0) return [];
    const byPos = new Map<string, CambridgePronunciation>();
    const order: string[] = [];

    const canonicalPos = (value?: string | null): string => {
        const lower = String(value || '').toLowerCase();
        if (/\bnoun\b/.test(lower)) return 'NOUN';
        if (/\bverb\b/.test(lower)) return 'VERB';
        if (/\badjective\b/.test(lower)) return 'ADJECTIVE';
        if (/\badverb\b/.test(lower)) return 'ADVERB';
        if (/\bpronoun\b/.test(lower)) return 'PRONOUN';
        if (/\bpreposition\b/.test(lower)) return 'PREPOSITION';
        if (/\bconjunction\b/.test(lower)) return 'CONJUNCTION';
        if (/\binterjection\b/.test(lower)) return 'INTERJECTION';
        const compact = String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
        return compact || 'N/A';
    };

    for (const item of items) {
        const pos = canonicalPos(item.partOfSpeech);
        if (!byPos.has(pos)) {
            byPos.set(pos, {
                partOfSpeech: pos,
                ipaUs: null,
                ipaUk: null
            });
            order.push(pos);
        }
        const merged = byPos.get(pos)!;
        if (!merged.ipaUs && item.ipaUs) merged.ipaUs = item.ipaUs;
        if (!merged.ipaUk && item.ipaUk) merged.ipaUk = item.ipaUk;
    }

    return order
        .map(pos => byPos.get(pos)!)
        .filter(p => p.ipaUs || p.ipaUk);
};


/**
 * Generates a list of all possible challenges for a given vocabulary item.
 */
export function generateAvailableChallenges(word: VocabularyItem): Challenge[] {
    const list: Challenge[] = [];
    const debugIpaMatch = word.word?.trim().toLowerCase() === 'rebel';

    if (debugIpaMatch) {
        console.log('[IPA_MATCH debug][generate] start', {
            word: word.word,
            hasWordFamily: !!word.wordFamily,
            wordFamily: word.wordFamily
        });
    }
    
    list.push({ type: 'SPELLING', title: 'Spelling Fill', word });
    list.push({ type: 'PRONUNCIATION', title: 'Speak Out', word });
    
    if (word.meaningVi && word.meaningVi.length > 0) {
        list.push({ type: 'MEANING_QUIZ', title: 'Meaning Multi Choice', options: [], answer: word.meaningVi, word });
    }

    if (word.ipaMistakes && word.ipaMistakes.length > 0 && word.ipaUs) {
      list.push({ type: 'IPA_QUIZ', title: 'IPA Multi Choice', options: shuffleArray([word.ipaUs, ...word.ipaMistakes]), answer: word.ipaUs, word });
    }

    // IPA Match (US vs UK) – only when both exist and pronunciation differs
    if (
        word.ipaUs &&
        word.ipaUk &&
        word.pronSim === 'different'
    ) {
        list.push({
            type: 'IPA_MATCH',
            title: 'IPA Match (US vs UK)',
            word,
            matchMode: 'ACCENT',
            contexts: [],
            items: []
        } as IpaMatchChallenge);
        if (debugIpaMatch) {
            console.log('[IPA_MATCH debug][generate] added accent IPA_MATCH');
        }
    } else if (debugIpaMatch) {
        console.log('[IPA_MATCH debug][generate] no accent IPA_MATCH', {
            ipaUs: word.ipaUs,
            ipaUk: word.ipaUk,
            pronSim: word.pronSim
        });
    }

    // IPA Match (word-class homographs): same spelling appears in >=2 POS.
    // IPA itself will be fetched from server later in prepareChallenges.
    if (word.wordFamily) {
        type FamilyBucket = { pos: 'noun' | 'verb' | 'adj' | 'adv'; text: string };
        const bySpelling = new Map<string, FamilyBucket[]>();
        const familySource: Array<{ key: keyof WordFamily; pos: FamilyBucket['pos'] }> = [
            { key: 'nouns', pos: 'noun' },
            { key: 'verbs', pos: 'verb' },
            { key: 'adjs', pos: 'adj' },
            { key: 'advs', pos: 'adv' }
        ];

        familySource.forEach(({ key, pos }) => {
            (word.wordFamily?.[key] || []).forEach(member => {
                if (member.isIgnored) return;
                const spelling = (member.word || '').trim();
                if (!spelling) return;
                const normalized = spelling.toLowerCase();
                if (!bySpelling.has(normalized)) bySpelling.set(normalized, []);
                bySpelling.get(normalized)!.push({ pos, text: spelling });
            });
        });

        bySpelling.forEach((entries, spellingKey) => {
            const uniquePos = new Set(entries.map(e => e.pos));
            if (debugIpaMatch) {
                console.log('[IPA_MATCH debug][generate] candidate spelling', {
                    spellingKey,
                    entries,
                    uniquePos: Array.from(uniquePos)
                });
            }
            if (uniquePos.size < 2) {
                if (debugIpaMatch) {
                    console.log('[IPA_MATCH debug][generate] skip spelling due to <2 POS', { spellingKey });
                }
                return;
            }

            list.push({
                type: 'IPA_MATCH',
                title: `IPA Match (${entries[0].text})`,
                word,
                matchMode: 'WORD_CLASS',
                targetWord: spellingKey,
                contexts: [],
                items: []
            } as IpaMatchChallenge);
            if (debugIpaMatch) {
                console.log('[IPA_MATCH debug][generate] added WORD_CLASS placeholder', { spellingKey });
            }
        });
    } else if (debugIpaMatch) {
        console.log('[IPA_MATCH debug][generate] no wordFamily available');
    }

    if (word.collocationsArray && word.collocationsArray.length > 0) {
        // Individual Collocation Challenges
        const activeCollocs = word.collocationsArray.filter(c => !c.isIgnored && c.d);
        activeCollocs.forEach(colloc => {
            // Fill Challenge
            list.push({
                type: 'COLLOCATION_QUIZ',
                title: 'Collocation Fill',
                word,
                fullText: colloc.text,
                cue: colloc.d!,
                answer: colloc.text
            });

            // Multi Choice Challenge (only if enough distractors exist)
            if (activeCollocs.length >= 4) {
                 list.push({
                    type: 'COLLOCATION_MULTICHOICE_QUIZ',
                    title: 'Collocation Multi Choice',
                    word,
                    fullText: colloc.text,
                    cue: colloc.d!,
                    answer: colloc.text,
                    options: [] // To be filled in prepare
                });
            }
        });

        // Grouped Collocation Context Match (New)
        if (activeCollocs.length >= 2) {
            list.push({ 
                type: 'COLLOCATION_CONTEXT_QUIZ', 
                title: 'Collocation Match', 
                word, 
                contexts: [], 
                collocations: [] 
            });
        }
    }

    if (word.idiomsList && word.idiomsList.length > 0) {
        const activeIdioms = word.idiomsList.filter(i => !i.isIgnored && i.d);
        activeIdioms.forEach(idiom => {
            list.push({
                type: 'IDIOM_QUIZ',
                title: 'Idiom Fill',
                word,
                fullText: idiom.text,
                cue: idiom.d!,
                answer: idiom.text
            });
        });

        // Grouped Idiom Context Match (New)
        if (activeIdioms.length >= 2) {
            list.push({ 
                type: 'IDIOM_CONTEXT_QUIZ', 
                title: 'Idiom Match', 
                word, 
                contexts: [], 
                idioms: [] 
            });
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
        
        list.push({ type: 'PREPOSITION_QUIZ', title: 'Preposition Fill', example: quizPhrase, answer: prep, word });
      });
    }

if (word.example && word.example.trim().length > 5) {
        // Clean markdown tags, badges, html and bullet markers before generating sentences
        let cleaned = word.example;

        // Remove custom markdown tags like [Collocation], [Prep], [Paraphrase], etc.
        cleaned = cleaned.replace(/\[(Collocation|Prep|Paraphrase|Word Family|Idiom|Definition|Tip|Important|Compare|Caution)\]/gi, '');

        // Remove HTML tags if any were rendered
        cleaned = cleaned.replace(/<[^>]+>/g, '');

        // Remove bullet markers (- * • – — 1.)
        cleaned = cleaned.replace(/^[\s]*([\-*•–—]|\d+\.)\s*/gm, '');

        const sentences = cleaned.trim()
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
            list.push({ type: 'WORD_FAMILY', title: 'Word Family Fill', word });
        }
    }
    
    // HETERONYM_QUIZ removed because WordFamilyMember does not contain IPA info anymore.

    if (word.paraphrases && word.paraphrases.length > 0) {
        word.paraphrases.filter(p => !p.isIgnored).forEach(para => {
            list.push({ type: 'PARAPHRASE_QUIZ', title: 'Paraphrase Fill', tone: para.tone, context: para.context, answer: para.word, word });
        });
    }

    if (word.paraphrases && word.paraphrases.filter(p => !p.isIgnored && p.context && p.context.trim()).length >= 2) {
        list.push({ type: 'PARAPHRASE_CONTEXT_QUIZ', title: 'Paraphrase Match', word, contexts: [], paraphrases: [] });
    }

    return list;
}

/**
 * Prepares a list of challenges by fetching necessary data (e.g., distractor meanings).
 */
export async function prepareChallenges(challenges: Challenge[], word: VocabularyItem): Promise<Challenge[]> {
    const finalChallenges: Challenge[] = [];
    const debugIpaMatch = word.word?.trim().toLowerCase() === 'rebel';
    if (debugIpaMatch) {
        console.log('[IPA_MATCH debug][prepare] start', {
            word: word.word,
            incomingIpaMatchCount: challenges.filter(c => c.type === 'IPA_MATCH').length,
            incomingIpaMatches: challenges.filter(c => c.type === 'IPA_MATCH')
        });
    }
    for (const challenge of challenges) {
        if (challenge.type === 'MEANING_QUIZ') {
            const distractors = await getRandomMeanings(3, word.id);
            // Ensure distractors don't include the correct answer
            const filteredDistractors = distractors.filter(d => d.trim().toLowerCase() !== word.meaningVi.trim().toLowerCase());
            const options = shuffleArray([word.meaningVi, ...filteredDistractors]).slice(0, 4);
            finalChallenges.push({ ...challenge, options } as MeaningQuizChallenge);
        } 
        else if (challenge.type === 'COLLOCATION_MULTICHOICE_QUIZ') {
            const validCollocs = (word.collocationsArray || []).filter(c => !c.isIgnored && c.text !== challenge.answer);
            const distractors = validCollocs.map(c => c.text);
            const shuffledOptions = shuffleArray([challenge.answer, ...distractors]).slice(0, 4);
            finalChallenges.push({ 
                ...challenge, 
                options: shuffledOptions 
            } as CollocationMultichoiceQuizChallenge);
        }
        else if (challenge.type === 'PARAPHRASE_CONTEXT_QUIZ') {
            const word = challenge.word;
            const validParaphrases = (word.paraphrases || [])
                .filter(p => !p.isIgnored && p.context && p.context.trim())
                .sort(() => Math.random() - 0.5); // No limit

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
        else if (challenge.type === 'COLLOCATION_CONTEXT_QUIZ') {
            const word = challenge.word;
            const validCollocs = (word.collocationsArray || [])
                .filter(c => !c.isIgnored && c.d && c.d.trim())
                .sort(() => Math.random() - 0.5); // No limit

            if (validCollocs.length >= 2) {
                const contextItems: CollocationContextQuizItem[] = [];
                const collocItems: CollocationContextQuizItem[] = [];

                validCollocs.forEach((c, index) => {
                    const pairId = `${word.id}-col-${index}`;
                    contextItems.push({ id: `context-${pairId}`, text: c.d!, pairId });
                    collocItems.push({ id: `col-${pairId}`, text: c.text, pairId });
                });

                finalChallenges.push({
                    ...challenge,
                    contexts: contextItems,
                    collocations: shuffleArray(collocItems)
                } as CollocationContextQuizChallenge);
            }
        }
        else if (challenge.type === 'IDIOM_CONTEXT_QUIZ') {
            const word = challenge.word;
            const validIdioms = (word.idiomsList || [])
                .filter(i => !i.isIgnored && i.d && i.d.trim())
                .sort(() => Math.random() - 0.5); // No limit

            if (validIdioms.length >= 2) {
                const contextItems: IdiomContextQuizItem[] = [];
                const idiomItems: IdiomContextQuizItem[] = [];

                validIdioms.forEach((i, index) => {
                    const pairId = `${word.id}-idm-${index}`;
                    contextItems.push({ id: `context-${pairId}`, text: i.d!, pairId });
                    idiomItems.push({ id: `idm-${pairId}`, text: i.text, pairId });
                });

                finalChallenges.push({
                    ...challenge,
                    contexts: contextItems,
                    idioms: shuffleArray(idiomItems)
                } as IdiomContextQuizChallenge);
            }
        }
        else if (challenge.type === 'IPA_MATCH') {
            const ipaChallenge = challenge as IpaMatchChallenge;
            const word = ipaChallenge.word;

            if (ipaChallenge.matchMode === 'WORD_CLASS') {
                const lookupWord = (ipaChallenge.targetWord || word.word || '').trim().toLowerCase();
                if (!lookupWord) {
                    if (debugIpaMatch) {
                        console.log('[IPA_MATCH debug][prepare] skip WORD_CLASS due to empty lookupWord');
                    }
                    continue;
                }
                try {
                    const serverUrl = getServerUrl(getConfig());
                    const res = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(lookupWord)}`, {
                        cache: 'no-store'
                    });
                    if (!res.ok) {
                        if (debugIpaMatch) {
                            console.log('[IPA_MATCH debug][prepare] cambridge request failed', {
                                lookupWord,
                                status: res.status
                            });
                        }
                        continue;
                    }
                    const raw = await res.text();
                    const data: CambridgeSimpleResult | null = raw ? JSON.parse(raw) : null;
                    if (!data?.exists) {
                        if (debugIpaMatch) {
                            console.log('[IPA_MATCH debug][prepare] cambridge exists=false', { lookupWord, data });
                        }
                        continue;
                    }

                    const normalized = normalizeCambridgePronunciations(data.pronunciations);
                    const byIpa = new Map<string, { pos: string; ipa: string }>();
                    normalized.forEach(entry => {
                        const ipa = String(entry.ipaUs || entry.ipaUk || '').trim();
                        const pos = String(entry.partOfSpeech || '').trim();
                        if (!ipa || !pos) return;
                        const ipaKey = ipa.replace(/\s+/g, '').toLowerCase();
                        if (!byIpa.has(ipaKey)) byIpa.set(ipaKey, { pos, ipa });
                    });

                    const pairs = Array.from(byIpa.values());
                    if (debugIpaMatch) {
                        console.log('[IPA_MATCH debug][prepare] cambridge normalized', {
                            lookupWord,
                            pronunciations: data.pronunciations,
                            normalized,
                            uniquePairs: pairs
                        });
                    }
                    if (pairs.length < 2) {
                        if (debugIpaMatch) {
                            console.log('[IPA_MATCH debug][prepare] skip WORD_CLASS due to <2 unique IPA', {
                                lookupWord,
                                pairs
                            });
                        }
                        continue;
                    }

                    const contexts = pairs.map((entry, idx) => ({
                        id: `context-${word.id}-wf-${lookupWord}-${idx}`,
                        text: `${lookupWord} (${entry.pos.toLowerCase()})`,
                        pairId: `wf-${lookupWord}-${idx}`
                    }));
                    const items = shuffleArray(
                        pairs.map((entry, idx) => ({
                            id: `ipa-${word.id}-wf-${lookupWord}-${idx}`,
                            text: entry.ipa,
                            pairId: `wf-${lookupWord}-${idx}`
                        }))
                    );

                    finalChallenges.push({
                        ...ipaChallenge,
                        title: `IPA Match (${lookupWord})`,
                        targetWord: lookupWord,
                        contexts,
                        items
                    } as IpaMatchChallenge);
                    if (debugIpaMatch) {
                        console.log('[IPA_MATCH debug][prepare] pushed WORD_CLASS IPA_MATCH', {
                            lookupWord,
                            contexts,
                            items
                        });
                    }
                } catch {
                    if (debugIpaMatch) {
                        console.log('[IPA_MATCH debug][prepare] exception during WORD_CLASS lookup', { lookupWord });
                    }
                    continue;
                }
            } else if (word.ipaUs && word.ipaUk && word.pronSim === 'different') {
                const contexts = [
                    { id: `context-${word.id}-us`, text: 'US Pronunciation', pairId: 'us' },
                    { id: `context-${word.id}-uk`, text: 'UK Pronunciation', pairId: 'uk' }
                ];

                const items = shuffleArray([
                    { id: `ipa-${word.id}-us`, text: word.ipaUs, pairId: 'us' },
                    { id: `ipa-${word.id}-uk`, text: word.ipaUk, pairId: 'uk' }
                ]);

                finalChallenges.push({
                    ...ipaChallenge,
                    matchMode: 'ACCENT',
                    contexts,
                    items
                } as IpaMatchChallenge);
                if (debugIpaMatch) {
                    console.log('[IPA_MATCH debug][prepare] pushed ACCENT IPA_MATCH');
                }
            } else if (debugIpaMatch) {
                console.log('[IPA_MATCH debug][prepare] skip ACCENT IPA_MATCH due to missing ipa/pronSim', {
                    ipaUs: word.ipaUs,
                    ipaUk: word.ipaUk,
                    pronSim: word.pronSim
                });
            }
        }
        else {
            finalChallenges.push(challenge);
        }
    }
    if (debugIpaMatch) {
        console.log('[IPA_MATCH debug][prepare] done', {
            finalIpaMatchCount: finalChallenges.filter(c => c.type === 'IPA_MATCH').length,
            finalIpaMatches: finalChallenges.filter(c => c.type === 'IPA_MATCH')
        });
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
        case 'IPA_MATCH': {
            const ch = challenge as any;

            if (!(answer instanceof Map) || answer.size === 0) {
                return { correct: false, details: {} };
            }

            const details: Record<string, boolean> = {};
            let correctCount = 0;

            ch.contexts.forEach((context: any) => {
                const selectedId = answer.get(context.id);
                if (selectedId) {
                    const selectedItem = ch.items.find((i: any) => i.id === selectedId);
                    if (selectedItem && selectedItem.pairId === context.pairId) {
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
        case 'PREPOSITION_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'MEANING_QUIZ':
            return answer === challenge.answer; // Not text input
        case 'PARAPHRASE_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'COLLOCATION_QUIZ':
            return normalizeAnswerForGrading(answer || '') === normalizeAnswerForGrading(challenge.answer);
        case 'COLLOCATION_MULTICHOICE_QUIZ':
            return answer === challenge.answer;
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
        case 'COLLOCATION_CONTEXT_QUIZ': {
            const ch = challenge as CollocationContextQuizChallenge;
            if (!(answer instanceof Map) || answer.size === 0) {
                return { correct: false, details: {} };
            }

            const details: Record<string, boolean> = {};
            let correctCount = 0;

            ch.contexts.forEach(context => {
                const selectedId = answer.get(context.id);
                if (selectedId) {
                    const selectedItem = ch.collocations.find(i => i.id === selectedId);
                    if (selectedItem && selectedItem.pairId === context.pairId) {
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
        case 'IDIOM_CONTEXT_QUIZ': {
            const ch = challenge as IdiomContextQuizChallenge;
            if (!(answer instanceof Map) || answer.size === 0) {
                return { correct: false, details: {} };
            }

            const details: Record<string, boolean> = {};
            let correctCount = 0;

            ch.contexts.forEach(context => {
                const selectedId = answer.get(context.id);
                if (selectedId) {
                    const selectedItem = ch.idioms.find(i => i.id === selectedId);
                    if (selectedItem && selectedItem.pairId === context.pairId) {
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
