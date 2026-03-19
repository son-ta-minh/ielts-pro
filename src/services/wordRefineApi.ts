import { VocabularyItem } from '../app/types';
import { getConfig, getStudyBuddyAiUrl } from '../app/settingsManager';
import { getWordDetailsPrompt } from './promptService';
import { normalizeAiResponse } from '../utils/vocabUtils';

const WORD_REFINE_API_CONFIG = {
    temperature: 0.2,
    top_p: 0.85,
    repetition_penalty: 1.15
} as const;

const MAX_REFINE_ATTEMPTS = 5;
const MAX_PARALLEL_REFINE_WORDS = 3;
const REFINE_ATTEMPT_TIMEOUT_MS = 120000;
const VIETNAMESE_HINT_PATTERN = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const ENGLISH_LEAK_PATTERN = /\b(the|and|with|for|to|from|of|in|on|at|by|an|a|is|are)\b/i;
const VALID_REGISTERS = new Set(['academic', 'casual', 'neutral']);
const VALID_PARAPHRASE_TONES = new Set(['academic', 'casual', 'synonym', 'intensified', 'softened']);
const PHRASE_LIKE_TYPES = new Set(['idiom', 'phrasal_verb', 'collocation', 'phrase']);
const WORD_REFINE_DEBUG_STORAGE_KEY = 'vocab_pro_debug_refine_api';

export interface WordRefineApiResult {
    results: any[];
    attempts: number;
}

export interface WordRefineProgressSnapshot {
    stage:
        | 'starting'
        | 'requesting'
        | 'received'
        | 'parsed'
        | 'validating'
        | 'retrying'
        | 'success'
        | 'error'
        | 'aborted';
    attempt: number;
    maxAttempts: number;
    message: string;
    rawText?: string;
    issues?: string[];
}

interface RunWordRefineWithRetryOptions {
    signal?: AbortSignal;
    onProgress?: (snapshot: WordRefineProgressSnapshot) => void;
    onWordValidated?: (payload: {
        word: VocabularyItem;
        results: any[];
        wordIndex: number;
        totalWords: number;
        attempts: number;
    }) => Promise<void> | void;
}

type RetryField =
    | 'headword'
    | 'meaningVi'
    | 'example'
    | 'register'
    | 'collocationsArray'
    | 'paraphrases'
    | 'prepositionsArray';

interface ValidationState {
    issues: string[];
    retryFields: RetryField[];
}

const isWordRefineDebugEnabled = (): boolean => {
    try {
        return typeof window !== 'undefined' && window.localStorage.getItem(WORD_REFINE_DEBUG_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const debugWordRefine = (label: string, payload: Record<string, unknown>) => {
    if (!isWordRefineDebugEnabled()) return;
    console.log(`[WordRefineAPI] ${label}`, payload);
};

const extractJsonBlock = (rawText: string): unknown => {
    const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fencedMatch?.[1] || rawText).trim();

    const firstBracket = candidate.indexOf('[');
    const lastBracket = candidate.lastIndexOf(']');
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');

    const arraySlice = firstBracket >= 0 && lastBracket > firstBracket
        ? candidate.slice(firstBracket, lastBracket + 1)
        : null;
    const objectSlice = firstBrace >= 0 && lastBrace > firstBrace
        ? candidate.slice(firstBrace, lastBrace + 1)
        : null;

    const jsonText = arraySlice || objectSlice || candidate;
    return JSON.parse(jsonText);
};

const looksVietnameseMeaning = (value: string): boolean => {
    const text = value.trim();
    if (!text) return false;
    if (VIETNAMESE_HINT_PATTERN.test(text)) return true;
    if (ENGLISH_LEAK_PATTERN.test(text)) return false;
    return text.split(/\s+/).length <= 5;
};

const getOriginalKey = (item: any): string => {
    return String(item?.og || item?.original || item?.hw || item?.headword || '')
        .trim()
        .toLowerCase();
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getHeadwordVariants = (effectiveHeadword: string, originalWord: string): string[] => {
    const variants = new Set<string>();
    const addVariant = (value?: string) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized) variants.add(normalized);
    };

    const buildMorphVariants = (value: string) => {
        const lower = value.toLowerCase();
        addVariant(lower);
        if (lower.endsWith('y') && lower.length > 1) {
            const stem = lower.slice(0, -1);
            addVariant(`${stem}ing`);
            addVariant(`${stem}ed`);
            if (stem.endsWith('z')) {
                addVariant(`${stem}${stem.slice(-1)}ing`);
                addVariant(`${stem}${stem.slice(-1)}ed`);
            }
        }
        if (lower.endsWith('ied') && lower.length > 3) addVariant(`${lower.slice(0, -3)}y`);
        if (lower.endsWith('ed') && lower.length > 2) {
            const minusOne = lower.slice(0, -1);
            const minusTwo = lower.slice(0, -2);
            addVariant(minusOne);
            addVariant(minusTwo);
            addVariant(`${minusTwo}ing`);
        }
        if (lower.endsWith('ing') && lower.length > 3) {
            addVariant(lower.slice(0, -3));
            addVariant(`${lower.slice(0, -3)}e`);
        }
        if (lower.endsWith('ies') && lower.length > 3) addVariant(`${lower.slice(0, -3)}y`);
        if (lower.endsWith('s') && lower.length > 1) addVariant(lower.slice(0, -1));
    };

    buildMorphVariants(effectiveHeadword);
    buildMorphVariants(originalWord);

    return Array.from(variants);
};

const collocationContainsHeadwordVariant = (text: string, variants: string[]): boolean => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    return variants.some((variant) => {
        const pattern = new RegExp(`(^|[^a-z])${escapeRegex(variant)}([^a-z]|$)`, 'i');
        return pattern.test(normalized);
    });
};

const mergeUniqueByText = (base: any[] = [], incoming: any[] = [], key: string) => {
    const merged = [...base];
    incoming.forEach((item) => {
        const value = String(item?.[key] || '').trim().toLowerCase();
        if (!value) return;
        const index = merged.findIndex((entry) => String(entry?.[key] || '').trim().toLowerCase() === value);
        if (index === -1) {
            merged.push(item);
            return;
        }
        merged[index] = { ...merged[index], ...item };
    });
    return merged;
};

const mergePartialRefineResult = (
    baseResult: any | null,
    incomingResult: any | null,
    replaceFields: RetryField[] = []
): any | null => {
    const normalizedIncoming = normalizeAiResponse(incomingResult);
    debugWordRefine('mergePartialRefineResult', {
        incomingOriginalKey: getOriginalKey(incomingResult),
        hasBaseResult: !!baseResult,
        incomingResult,
        normalizedIncoming,
        replaceFields
    });
    if (!normalizedIncoming) return baseResult;
    if (!baseResult) return normalizedIncoming;

    const shouldReplace = (field: RetryField) => replaceFields.includes(field);

    return {
        ...baseResult,
        ...normalizedIncoming,
        original: normalizedIncoming.original || baseResult.original,
        headword: normalizedIncoming.headword || baseResult.headword,
        ipaUs: normalizedIncoming.ipaUs || baseResult.ipaUs,
        ipaUk: normalizedIncoming.ipaUk || baseResult.ipaUk,
        pronSim: normalizedIncoming.pronSim || baseResult.pronSim,
        meaningVi: normalizedIncoming.meaningVi || baseResult.meaningVi,
        register: normalizedIncoming.register || baseResult.register,
        example: normalizedIncoming.example || baseResult.example,
        collocations: shouldReplace('collocationsArray')
            ? (normalizedIncoming.collocations || baseResult.collocations)
            : (normalizedIncoming.collocations || baseResult.collocations),
        collocationsArray: shouldReplace('collocationsArray')
            ? (normalizedIncoming.collocationsArray || baseResult.collocationsArray)
            : mergeUniqueByText(baseResult.collocationsArray, normalizedIncoming.collocationsArray, 'text'),
        idioms: normalizedIncoming.idioms || baseResult.idioms,
        idiomsList: mergeUniqueByText(baseResult.idiomsList, normalizedIncoming.idiomsList, 'text'),
        prepositionsArray: shouldReplace('prepositionsArray')
            ? (normalizedIncoming.prepositionsArray || baseResult.prepositionsArray)
            : mergeUniqueByText(baseResult.prepositionsArray, normalizedIncoming.prepositionsArray, 'prep'),
        paraphrases: shouldReplace('paraphrases')
            ? (normalizedIncoming.paraphrases || baseResult.paraphrases)
            : mergeUniqueByText(baseResult.paraphrases, normalizedIncoming.paraphrases, 'word'),
        wordFamily: normalizedIncoming.wordFamily || baseResult.wordFamily,
        isIdiom: normalizedIncoming.isIdiom ?? baseResult.isIdiom,
        isPhrasalVerb: normalizedIncoming.isPhrasalVerb ?? baseResult.isPhrasalVerb,
        isCollocation: normalizedIncoming.isCollocation ?? baseResult.isCollocation,
        isStandardPhrase: normalizedIncoming.isStandardPhrase ?? baseResult.isStandardPhrase,
        isIrregular: normalizedIncoming.isIrregular ?? baseResult.isIrregular,
        isPassive: normalizedIncoming.isPassive ?? baseResult.isPassive
    };
};

const validateWordResult = (result: any, word: VocabularyItem): ValidationState => {
    const issues: string[] = [];
    const retryFields = new Set<RetryField>();
    const normalized = normalizeAiResponse(result);

    if (!result) {
        return {
            issues: [`Missing object for "${word.word}".`],
            retryFields: ['headword', 'meaningVi', 'example', 'register', 'collocationsArray', 'paraphrases', 'prepositionsArray']
        };
    }
    if (!normalized) {
        return {
            issues: [`Invalid object format for "${word.word}".`],
            retryFields: ['headword', 'meaningVi', 'example', 'register', 'collocationsArray', 'paraphrases', 'prepositionsArray']
        };
    }

    const headword = String(normalized.headword || normalized.word || '').trim();
    const effectiveHeadword = headword || word.word.trim();
    const meaningVi = String(normalized.meaningVi || '').trim();
    const example = String(normalized.example || '').trim();
    const register = String(normalized.register || '').trim().toLowerCase();
    const type = String(result.type || '').trim().toLowerCase();
    const paraphrases = Array.isArray(normalized.paraphrases) ? normalized.paraphrases : [];
    const collocations = Array.isArray(normalized.collocationsArray) ? normalized.collocationsArray : [];
    const prepositions = Array.isArray(normalized.prepositionsArray) ? normalized.prepositionsArray : [];

    debugWordRefine('validateWordResult:start', {
        word: word.word,
        rawResult: result,
        normalized,
        effectiveHeadword,
        counts: {
            collocations: collocations.length,
            paraphrases: paraphrases.length,
            prepositions: prepositions.length
        }
    });

    if (!headword) {
        issues.push(`Missing headword for "${word.word}".`);
        retryFields.add('headword');
    }
    if (!meaningVi) {
        issues.push(`Missing Vietnamese meaning for "${word.word}".`);
        retryFields.add('meaningVi');
    } else if (!looksVietnameseMeaning(meaningVi)) {
        issues.push(`Meaning for "${word.word}" is not clearly Vietnamese-only.`);
        retryFields.add('meaningVi');
    }
    if (!example) {
        issues.push(`Missing example for "${word.word}".`);
        retryFields.add('example');
    }
    if (!VALID_REGISTERS.has(register)) {
        issues.push(`Invalid register for "${word.word}".`);
        retryFields.add('register');
    }

    const isSingleWord = effectiveHeadword.split(/\s+/).filter(Boolean).length <= 1;
    const needsDenseDetails = isSingleWord && !PHRASE_LIKE_TYPES.has(type || 'vocabulary');

    if (needsDenseDetails && collocations.length < 1) {
        issues.push(`Collocation cannot be empty for "${word.word}".`);
        retryFields.add('collocationsArray');
    }
    if (needsDenseDetails && paraphrases.length < 1) {
        issues.push(`Paraphrases cannot be empty for "${word.word}".`);
        retryFields.add('paraphrases');
    }

    const invalidParaphraseTones = paraphrases
        .map((item: any) => String(item?.tone || '').trim())
        .filter((tone) => !VALID_PARAPHRASE_TONES.has(tone.toLowerCase()));
    if (invalidParaphraseTones.length > 0) {
        issues.push(`Invalid paraphrase tone found for "${word.word}": ${invalidParaphraseTones.join(', ')}.`);
        retryFields.add('paraphrases');
    }

    const missingCollocationHint = collocations.some((item: any) => !String(item?.text || '').trim() || !String(item?.d || '').trim());
    if (needsDenseDetails && missingCollocationHint) {
        issues.push(`Collocations for "${word.word}" must include both text and hint.`);
        retryFields.add('collocationsArray');
    }
    const acceptableHeadwordVariants = getHeadwordVariants(effectiveHeadword, word.word);
    const collocationsWithoutHeadword = collocations
        .map((item: any) => String(item?.text || '').trim())
        .filter((text) => !!text && !collocationContainsHeadwordVariant(text, acceptableHeadwordVariants));
    debugWordRefine('validateWordResult:collocationVariantCheck', {
        word: word.word,
        effectiveHeadword,
        acceptableHeadwordVariants,
        invalidCollocations: collocationsWithoutHeadword
    });
    if (needsDenseDetails && collocationsWithoutHeadword.length > 0) {
        issues.push(`Collocations for "${word.word}" must explicitly contain the headword "${effectiveHeadword}" or a valid inflected/base variant ${acceptableHeadwordVariants.join('/')}. Invalid values: ${collocationsWithoutHeadword.join(', ')}.`);
        retryFields.add('collocationsArray');
    }
    const invalidPrepositionUsage = prepositions.find((item: any) => {
        const prep = String(item?.prep || '').trim().toLowerCase();
        const usage = String(item?.usage || '').trim().toLowerCase();
        if (!prep || !usage) return false;
        return !usage.includes(prep);
    });
    const missingPrepositionContext = prepositions.find((item: any) => {
        const prep = String(item?.prep || '').trim();
        const usage = String(item?.usage || '').trim();
        return !!prep && !usage;
    });
    if (missingPrepositionContext) {
        issues.push(`Preposition usage for "${word.word}" is missing context/example for preposition "${missingPrepositionContext.prep}".`);
        retryFields.add('prepositionsArray');
    }
    if (invalidPrepositionUsage) {
        issues.push(`Preposition usage for "${word.word}" must contain the preposition "${invalidPrepositionUsage.prep}" inside its context/example.`);
        retryFields.add('prepositionsArray');
    }

    const validationState = { issues, retryFields: Array.from(retryFields) };
    debugWordRefine('validateWordResult:end', {
        word: word.word,
        effectiveHeadword,
        issues,
        retryFields: validationState.retryFields
    });
    return validationState;
};

const getValidationIssues = (results: any[], words: VocabularyItem[]): string[] => {
    const issues: string[] = [];
    const resultsByKey = new Map<string, any>();

    for (const result of results) {
        const key = getOriginalKey(result);
        if (key && !resultsByKey.has(key)) {
            resultsByKey.set(key, result);
        }
    }

    for (const word of words) {
        const key = word.word.trim().toLowerCase();
        const rawResult = resultsByKey.get(key);
        issues.push(...validateWordResult(rawResult, word).issues);
    }

    return issues;
};

const buildRetryPrompt = (
    word: VocabularyItem,
    nativeLanguage: string,
    retryFields: RetryField[],
    lastIssues: string[],
    partialResult: any | null
): string => {
    if (retryFields.length === 0) {
        return `${getWordDetailsPrompt([word.word], nativeLanguage)}\n\nReturn ONLY one strict JSON array in a \`\`\`json code block. Do not add explanation text outside the code block.`;
    }

    const fieldInstructions: Record<RetryField, string> = {
        headword: '- hw: correct headword/base form. Keep the full phrase if the original input is a phrase.',
        meaningVi: `- m: Vietnamese-only meaning in ${nativeLanguage}.`,
        example: '- ex: one natural example sentence using the exact headword.',
        register: '- reg: A-MUST / IMPORTANT. MUST be ONLY one of "academic", "casual", or "neutral". NEVER output any other register label.',
        collocationsArray: '- col: A-MUST / IMPORTANT. For a single-word headword, col MUST NOT be empty. Return 3-5 collocations. Every item must explicitly contain the exact headword and include both "text" and "d".',
        paraphrases: '- para: A-MUST / IMPORTANT. Every item must include "w", valid tone "t", and short context "c". Tone "t" MUST be ONLY one of "academic", "casual", "synonym".',
        prepositionsArray: '- prep: A-MUST / IMPORTANT. Dependent prepositions only. Every item MUST include BOTH "p" and "c". NEVER return only the preposition without context. Each usage example/context must explicitly contain the exact same preposition. Example: if p = "against", then c MUST contain "against". If no natural dependent preposition exists, return [].'
    };

    const fieldKeyMap: Record<RetryField, string> = {
        headword: 'hw',
        meaningVi: 'm',
        example: 'ex',
        register: 'reg',
        collocationsArray: 'col',
        paraphrases: 'para',
        prepositionsArray: 'prep'
    };

    const knownData = partialResult
        ? JSON.stringify({
            og: partialResult.original,
            hw: partialResult.headword,
            m: partialResult.meaningVi,
            reg: partialResult.register,
            ex: partialResult.example
        }, null, 2)
        : 'null';

    const expectedFieldExamples: Record<RetryField, string> = {
        headword: `- hw expected: "defy"`,
        meaningVi: `- m expected: "${nativeLanguage === 'Vietnamese' ? 'thach thuc, bat tuan' : 'meaning in target native language'}"`,
        example: `- ex expected: "Their actions showed open defiance of the rules."`,
        register: `- reg expected: "academic" OR "casual" OR "neutral"`,
        collocationsArray: `- col expected: [{"text":"surface-level analysis","d":"shallow examination of an issue"}]`,
        paraphrases: `- para expected: [{"w":"resistance","t":"synonym","c":"opposing authority"}]`,
        prepositionsArray: `- prep expected: [{"p":"in","c":"in the face of criticism"}]`
    };

    const expectedBlock = retryFields.length > 0
        ? retryFields.map((field) => expectedFieldExamples[field]).join('\n')
        : '- No expected fields specified.';

    const exactErrorsBlock = lastIssues.length > 0
        ? lastIssues.map((issue) => `- ${issue}`).join('\n')
        : '- No validator errors provided.';

    return `You are repairing a partially valid vocabulary JSON object for "${word.word}".

Known valid data collected from previous attempts:
\`\`\`json
${knownData}
\`\`\`

ONLY regenerate these missing/invalid fields for this word:
${retryFields.map((field) => fieldInstructions[field]).join('\n')}

CRITICAL: You must fix the EXACT validator errors below, verbatim. Do not guess. Do not paraphrase the rule. Read each error literally and make the regenerated field satisfy it exactly.

EXACT VALIDATION ERRORS TO FIX:
${exactErrorsBlock}

EXPECTED VALID OUTPUT FOR THE REQUESTED FIELDS:
${expectedBlock}

SPECIAL NOTE FOR PREPOSITIONS:
- If the validator says the context/example must contain the preposition "in", then the string in "c" must literally include the word "in".
- Example of INVALID output: {"p":"in","c":"the face of"}
- Example of VALID shape: {"p":"in","c":"in the face of criticism"}

Required JSON shape:
- Return a strict JSON array with exactly one object.
- Include "og" as "${word.word}".
- Include "hw" if known or if you are regenerating it.
- Include ONLY the requested fields above (plus "og"/"hw" when needed).
- Do not rewrite fields that were not requested.

Previous validation issues:
- ${lastIssues.join('\n- ')}

Use these JSON keys when you answer: ${retryFields.map((field) => fieldKeyMap[field]).join(', ')}.
Return ONLY one strict JSON array in a \`\`\`json code block. Do not add explanation text outside the code block.`;
};

const requestWordRefineAttempt = async (
    prompt: string,
    attempt: number,
    signal?: AbortSignal,
    onProgress?: (snapshot: WordRefineProgressSnapshot) => void
): Promise<{ results: any[]; rawText: string }> => {
    const aiUrl = getStudyBuddyAiUrl(getConfig());
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(), REFINE_ATTEMPT_TIMEOUT_MS);
    const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;
    onProgress?.({
        stage: 'requesting',
        attempt,
        maxAttempts: MAX_REFINE_ATTEMPTS,
        message: `Attempt ${attempt}/${MAX_REFINE_ATTEMPTS}: sending request to AI server...`
    });
    try {
        const response = await fetch(aiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                ...WORD_REFINE_API_CONFIG,
                stream: false
            }),
            signal: combinedSignal
        });

        if (!response.ok) {
            throw new Error(`AI server error ${response.status}`);
        }

        const payload = await response.json().catch(() => null);
        const rawText = payload?.choices?.[0]?.message?.content;
        if (typeof rawText !== 'string' || !rawText.trim()) {
            throw new Error('AI server returned empty content.');
        }
        onProgress?.({
            stage: 'received',
            attempt,
            maxAttempts: MAX_REFINE_ATTEMPTS,
            message: `Attempt ${attempt}/${MAX_REFINE_ATTEMPTS}: received response from server.`,
            rawText
        });

        const parsed = extractJsonBlock(rawText);
        const arrayPayload = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as any)?.results)
                ? (parsed as any).results
                : null;

        if (!arrayPayload) {
            throw new Error('AI response is not a JSON array.');
        }

        onProgress?.({
            stage: 'parsed',
            attempt,
            maxAttempts: MAX_REFINE_ATTEMPTS,
            message: `Attempt ${attempt}/${MAX_REFINE_ATTEMPTS}: parsed JSON successfully.`,
            rawText
        });

        return { results: arrayPayload, rawText };
    } catch (error) {
        if (timeoutController.signal.aborted && !(signal?.aborted)) {
            throw new Error(`Timed out after ${Math.round(REFINE_ATTEMPT_TIMEOUT_MS / 1000)}s waiting for AI server response.`);
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
};

export const runWordRefineWithRetry = async (
    words: VocabularyItem[],
    nativeLanguage: string = 'Vietnamese',
    options: RunWordRefineWithRetryOptions = {}
): Promise<WordRefineApiResult> => {
    if (words.length === 0) {
        throw new Error('No words selected for API refine.');
    }

    const aggregatedResultsByIndex = new Map<number, any>();
    let totalAttempts = 0;
    options.onProgress?.({
        stage: 'starting',
        attempt: 0,
        maxAttempts: MAX_REFINE_ATTEMPTS,
        message: `Preparing parallel API refine for ${words.length} selected word(s), max ${Math.min(MAX_PARALLEL_REFINE_WORDS, words.length)} at a time...`
    });

    const processSingleWord = async (wordIndex: number) => {
        const currentWord = words[wordIndex];
        const basePrompt = getWordDetailsPrompt([currentWord.word], nativeLanguage);
        let lastIssues: string[] = [];
        let lastError: unknown = null;
        let retryFields: RetryField[] = [];
        let partialResult: any | null = null;

        options.onProgress?.({
            stage: 'starting',
            attempt: 0,
            maxAttempts: MAX_REFINE_ATTEMPTS,
            message: `Word ${wordIndex + 1}/${words.length}: preparing "${currentWord.word}"...`
        });

        let wordSucceeded = false;

        for (let attempt = 1; attempt <= MAX_REFINE_ATTEMPTS; attempt += 1) {
            totalAttempts += 1;
            if (options.signal?.aborted) {
                options.onProgress?.({
                    stage: 'aborted',
                    attempt,
                    maxAttempts: MAX_REFINE_ATTEMPTS,
                    message: 'API refine was stopped.'
                });
                throw new DOMException('The user aborted a request.', 'AbortError');
            }

            try {
                const { results, rawText } = await requestWordRefineAttempt(
                    lastIssues.length > 0
                        ? buildRetryPrompt(currentWord, nativeLanguage, retryFields, lastIssues, partialResult)
                        : `${basePrompt}\n\nReturn ONLY one strict JSON array in a \`\`\`json code block. Do not add explanation text outside the code block.`,
                    attempt,
                    options.signal,
                    (snapshot) => options.onProgress?.({
                        ...snapshot,
                        message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": ${snapshot.message}`
                    })
                );
                options.onProgress?.({
                    stage: 'validating',
                    attempt,
                    maxAttempts: MAX_REFINE_ATTEMPTS,
                    message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": validating AI JSON quality...`,
                    rawText
                });
                const rawResult = results.find((item) => getOriginalKey(item) === currentWord.word.trim().toLowerCase()) || results[0] || null;
                debugWordRefine('attempt:rawResult', {
                    word: currentWord.word,
                    attempt,
                    resultKeys: results.map((item) => getOriginalKey(item)),
                    rawResult
                });
                partialResult = mergePartialRefineResult(partialResult, rawResult, retryFields);
                debugWordRefine('attempt:partialResult', {
                    word: currentWord.word,
                    attempt,
                    partialResult
                });
                const validation = validateWordResult(partialResult, currentWord);
                if (validation.issues.length === 0 && partialResult) {
                    aggregatedResultsByIndex.set(wordIndex, partialResult);
                    await options.onWordValidated?.({
                        word: currentWord,
                        results: [partialResult],
                        wordIndex,
                        totalWords: words.length,
                        attempts: attempt
                    });
                    options.onProgress?.({
                        stage: 'success',
                        attempt,
                        maxAttempts: MAX_REFINE_ATTEMPTS,
                        message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": validation passed.`,
                        rawText
                    });
                    wordSucceeded = true;
                    break;
                }
                lastIssues = validation.issues;
                retryFields = validation.retryFields;
                options.onProgress?.({
                    stage: 'retrying',
                    attempt,
                    maxAttempts: MAX_REFINE_ATTEMPTS,
                    message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": validation failed, retrying fields [${validation.retryFields.join(', ')}]...`,
                    rawText,
                    issues: validation.issues
                });
                debugWordRefine('attempt:retrying', {
                    word: currentWord.word,
                    attempt,
                    issues: validation.issues,
                    retryFields: validation.retryFields,
                    partialResult
                });
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    options.onProgress?.({
                        stage: 'aborted',
                        attempt,
                        maxAttempts: MAX_REFINE_ATTEMPTS,
                        message: 'API refine was stopped.'
                    });
                    throw error;
                }
                lastError = error;
                lastIssues = [error instanceof Error ? error.message : 'Unknown AI refine error.'];
                options.onProgress?.({
                    stage: 'error',
                    attempt,
                    maxAttempts: MAX_REFINE_ATTEMPTS,
                    message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": ${lastIssues[0]}`,
                    issues: lastIssues
                });
            }
        }

        if (!wordSucceeded) {
            const suffix = lastIssues.length > 0 ? ` ${lastIssues[0]}` : '';
            if (lastError instanceof Error) {
                throw new Error(`API refine failed for "${currentWord.word}" after ${MAX_REFINE_ATTEMPTS} attempts.${suffix}`);
            }
            throw new Error(`API refine failed for "${currentWord.word}" after ${MAX_REFINE_ATTEMPTS} attempts.${suffix}`);
        }
    };

    const concurrency = Math.min(MAX_PARALLEL_REFINE_WORDS, words.length);
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < words.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await processSingleWord(currentIndex);
        }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const aggregatedResults = words
        .map((_, index) => aggregatedResultsByIndex.get(index))
        .filter(Boolean);

    return { results: aggregatedResults, attempts: totalAttempts };
};
