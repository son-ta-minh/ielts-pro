import { VocabularyItem } from '../app/types';
import { getConfig, getServerUrl, getStudyBuddyAiUrl } from '../app/settingsManager';
import { getAllWords } from '../app/dataStore';
import { getWordDetailsPrompt } from './promptService';
import { normalizeAiResponse } from '../utils/vocabUtils';

const WORD_REFINE_API_CONFIG = {
    temperature: 0.2,
    top_p: 0.85,
    repetition_penalty: 1.15
} as const;

const MAX_REFINE_ATTEMPTS = 5;
const REFINE_ATTEMPT_TIMEOUT_MS = 120000;
const VIETNAMESE_HINT_PATTERN = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const ENGLISH_LEAK_PATTERN = /\b(the|and|with|for|to|from|of|in|on|at|by|an|a|is|are)\b/i;
const VALID_REGISTERS = new Set(['academic', 'casual', 'neutral']);
const VALID_PARAPHRASE_TONES = new Set(['academic', 'casual', 'neutral']);
const PHRASE_LIKE_TYPES = new Set(['idiom', 'phrasal_verb', 'collocation', 'phrase']);
const WORD_REFINE_DEBUG_STORAGE_KEY = 'vocab_pro_debug_refine_api';

export type WordRefineMeaningMode = 'vi' | 'en';
export type WordRefinePhraseIpaMode = 'cambridge' | 'generated';

export interface WordRefineSetup {
    meaningLanguage: WordRefineMeaningMode;
    collocationCount: number;
    includeParaphrases: boolean;
    includeIdioms: boolean;
    exampleCount: number;
    includePrepositions: boolean;
    phraseIpaMode: WordRefinePhraseIpaMode;
    includeGroupsIfMissing: boolean;
}

export const DEFAULT_WORD_REFINE_SETUP: WordRefineSetup = {
    meaningLanguage: 'vi',
    collocationCount: 3,
    includeParaphrases: true,
    includeIdioms: false,
    exampleCount: 1,
    includePrepositions: true,
    phraseIpaMode: 'generated',
    includeGroupsIfMissing: false
};

export interface WordRefineApiResult {
    results: any[];
    attempts: number;
    finalIssues: Array<{
        word: string;
        issues: string[];
        droppedFields: RetryField[];
        savedPartially: boolean;
    }>;
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
    setup?: Partial<WordRefineSetup>;
    onProgress?: (snapshot: WordRefineProgressSnapshot) => void;
    onWordValidated?: (payload: {
        word: VocabularyItem;
        results: any[];
        wordIndex: number;
        totalWords: number;
        attempts: number;
        partial?: boolean;
        issues?: string[];
    }) => Promise<void> | void;
}

type RetryField =
    | 'pronunciation'
    | 'headword'
    | 'meaningVi'
    | 'example'
    | 'register'
    | 'collocationsArray'
    | 'idiomsList'
    | 'paraphrases'
    | 'prepositionsArray'
    | 'groups';

interface ValidationState {
    issues: string[];
    retryFields: RetryField[];
}

interface CambridgePronunciationPayload {
    ipaUs?: string;
    ipaUk?: string;
    pronSim?: 'same' | 'near' | 'different';
}

const normalizeParaphraseTone = (value: string): string => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return normalized;
    if (normalized === 'near synonym' || normalized === 'near-synonym' || normalized === 'near_synonym') {
        return 'synonym';
    }
    return normalized;
};

const stripIpaDelimiters = (value: string): string => String(value || '').replace(/^\/+|\/+$/g, '').trim();

const normalizeIpaForComparison = (value: string): string => stripIpaDelimiters(value)
    .toLowerCase()
    .replace(/[ˈˌ.]/g, '')
    .replace(/ɡ/g, 'g')
    .replace(/əʊ/g, 'oʊ')
    .replace(/ɚ/g, 'ər')
    .replace(/ɝ/g, 'ər')
    .replace(/i/g, 'iː')
    .replace(/u/g, 'uː');

const comparePronunciationSimilarity = (ipaUs?: string, ipaUk?: string): 'same' | 'near' | 'different' | undefined => {
    const us = normalizeIpaForComparison(ipaUs || '');
    const uk = normalizeIpaForComparison(ipaUk || '');
    if (!us && !uk) return undefined;
    if (!us || !uk) return 'same';
    if (us === uk) return 'same';

    const relaxedUs = us.replace(/ː/g, '').replace(/r/g, '');
    const relaxedUk = uk.replace(/ː/g, '').replace(/r/g, '');
    if (relaxedUs === relaxedUk) return 'near';

    const maxLen = Math.max(us.length, uk.length);
    if (maxLen === 0) return 'same';
    let diffCount = Math.abs(us.length - uk.length);
    const limit = Math.min(us.length, uk.length);
    for (let i = 0; i < limit; i += 1) {
        if (us[i] !== uk[i]) diffCount += 1;
    }
    return diffCount <= 2 ? 'near' : 'different';
};

const formatIpaValue = (value?: string | null): string | undefined => {
    const clean = stripIpaDelimiters(String(value || ''));
    return clean ? `/${clean}/` : undefined;
};

const fetchCambridgePronunciation = async (word: string): Promise<CambridgePronunciationPayload | null> => {
    const normalizedWord = String(word || '').trim();
    if (!normalizedWord) return null;

    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(normalizedWord)}`, {
            cache: 'no-store'
        });
        if (!response.ok) return null;

        const payload = await response.json().catch(() => null);
        if (!payload?.exists || !Array.isArray(payload?.pronunciations)) return null;

        const pronunciation = payload.pronunciations.find((item: any) => item?.ipaUs || item?.ipaUk);
        if (!pronunciation) return null;

        const ipaUs = formatIpaValue(pronunciation.ipaUs);
        const ipaUk = formatIpaValue(pronunciation.ipaUk);
        const pronSim = comparePronunciationSimilarity(ipaUs, ipaUk);

        if (!ipaUs && !ipaUk) return null;

        return {
            ipaUs,
            ipaUk: ipaUk || (pronSim === 'same' ? ipaUs : undefined),
            pronSim
        };
    } catch (error) {
        debugWordRefine('fetchCambridgePronunciation:error', {
            word: normalizedWord,
            error: error instanceof Error ? error.message : String(error)
        });
        return null;
    }
};

const normalizeRawParaphrases = (value: any): any[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item: any) => ({
            word: String(item?.w || item?.word || '').trim(),
            tone: normalizeParaphraseTone(String(item?.t || item?.tone || '').trim()),
            context: String(item?.c || item?.context || '').trim()
        }))
        .filter((item) => item.word);
};

const getParaphrasesFromAnyShape = (value: any): any[] => {
    if (!value) return [];
    const directParaphrases = normalizeRawParaphrases(value?.paraphrases);
    if (directParaphrases.length > 0) return directParaphrases;
    const rawPara = normalizeRawParaphrases(value?.para);
    if (rawPara.length > 0) return rawPara;
    return [];
};

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

const summarizeHttpErrorBody = (rawBody: string): string => {
    const trimmed = String(rawBody || '').trim();
    if (!trimmed) return '';

    try {
        const parsed = JSON.parse(trimmed);
        const nestedMessage = [
            parsed?.error?.message,
            parsed?.error?.details,
            parsed?.message,
            parsed?.details
        ].find((value) => typeof value === 'string' && value.trim());
        if (nestedMessage) return String(nestedMessage).trim();
    } catch {
        // Fall through to plain-text summary.
    }

    return trimmed.replace(/\s+/g, ' ').slice(0, 400);
};

const buildAiHttpErrorMessage = (status: number, bodyText: string): string => {
    const summary = summarizeHttpErrorBody(bodyText);
    return summary ? `AI server error ${status}: ${summary}` : `AI server error ${status}`;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeWordRefineSetup = (setup?: Partial<WordRefineSetup>): WordRefineSetup => ({
    meaningLanguage: setup?.meaningLanguage === 'en' ? 'en' : DEFAULT_WORD_REFINE_SETUP.meaningLanguage,
    collocationCount: clamp(Number(setup?.collocationCount ?? DEFAULT_WORD_REFINE_SETUP.collocationCount), 0, 5),
    includeParaphrases: setup?.includeParaphrases ?? DEFAULT_WORD_REFINE_SETUP.includeParaphrases,
    includeIdioms: setup?.includeIdioms ?? DEFAULT_WORD_REFINE_SETUP.includeIdioms,
    exampleCount: clamp(Number(setup?.exampleCount ?? DEFAULT_WORD_REFINE_SETUP.exampleCount), 1, 3),
    includePrepositions: setup?.includePrepositions ?? DEFAULT_WORD_REFINE_SETUP.includePrepositions,
    phraseIpaMode: setup?.phraseIpaMode === 'cambridge' ? 'cambridge' : DEFAULT_WORD_REFINE_SETUP.phraseIpaMode,
    includeGroupsIfMissing: setup?.includeGroupsIfMissing ?? DEFAULT_WORD_REFINE_SETUP.includeGroupsIfMissing
});

const normalizeGroupList = (value: any): string[] => {
    if (!Array.isArray(value)) return [];
    return Array.from(
        new Set(
            value
                .map((item) => String(item || '').trim())
                .filter(Boolean)
        )
    );
};

const isSingleWordText = (value: string): boolean => String(value || '').trim().split(/\s+/).filter(Boolean).length <= 1;

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

const ensureResultHasOriginalWord = (result: any, originalWord: string): any => {
    if (!result || typeof result !== 'object') {
        return { og: originalWord };
    }
    const normalizedOriginalWord = originalWord.trim();
    return {
        ...result,
        og: String(result?.og || result?.original || normalizedOriginalWord).trim() || normalizedOriginalWord
    };
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
    const fallbackParaphrases = getParaphrasesFromAnyShape(incomingResult);
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
            ? ((normalizedIncoming.paraphrases && normalizedIncoming.paraphrases.length > 0
                ? normalizedIncoming.paraphrases
                : fallbackParaphrases) || baseResult.paraphrases)
            : mergeUniqueByText(
                baseResult.paraphrases,
                (normalizedIncoming.paraphrases && normalizedIncoming.paraphrases.length > 0
                    ? normalizedIncoming.paraphrases
                    : fallbackParaphrases),
                'word'
            ),
        wordFamily: normalizedIncoming.wordFamily || baseResult.wordFamily,
        groups: normalizeGroupList((normalizedIncoming as any).groups || (incomingResult as any)?.gr || baseResult.groups),
        isIdiom: normalizedIncoming.isIdiom ?? baseResult.isIdiom,
        isPhrasalVerb: normalizedIncoming.isPhrasalVerb ?? baseResult.isPhrasalVerb,
        isCollocation: normalizedIncoming.isCollocation ?? baseResult.isCollocation,
        isStandardPhrase: normalizedIncoming.isStandardPhrase ?? baseResult.isStandardPhrase,
        isIrregular: normalizedIncoming.isIrregular ?? baseResult.isIrregular,
        isPassive: normalizedIncoming.isPassive ?? baseResult.isPassive
    };
};

const validateWordResult = (result: any, word: VocabularyItem, setup: WordRefineSetup): ValidationState => {
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
    const normalizedParaphrases = getParaphrasesFromAnyShape(normalized);
    const rawParaphrases = getParaphrasesFromAnyShape(result);
    const paraphrases = normalizedParaphrases.length > 0 ? normalizedParaphrases : rawParaphrases;
    const collocations = Array.isArray(normalized.collocationsArray) ? normalized.collocationsArray : [];
    const idioms = Array.isArray(normalized.idiomsList) ? normalized.idiomsList : [];
    const prepositions = Array.isArray(normalized.prepositionsArray) ? normalized.prepositionsArray : [];
    const groups = normalizeGroupList((result as any)?.gr || (result as any)?.groups || (normalized as any)?.groups);
    const expectsGroups = setup.includeGroupsIfMissing && (!word.groups || word.groups.length === 0);

    debugWordRefine('validateWordResult:start', {
        word: word.word,
        rawResult: result,
        normalized,
        effectiveHeadword,
        setup,
        counts: {
            collocations: collocations.length,
            idioms: idioms.length,
            paraphrases: paraphrases.length,
            normalizedParaphrases: normalizedParaphrases.length,
            rawParaphrases: rawParaphrases.length,
            prepositions: prepositions.length,
            groups: groups.length
        }
    });

    if (!headword) {
        issues.push(`Missing headword for "${word.word}".`);
        retryFields.add('headword');
    }
    if (!meaningVi) {
        issues.push(`Missing meaning for "${word.word}".`);
        retryFields.add('meaningVi');
    } else if (setup.meaningLanguage === 'vi' && !looksVietnameseMeaning(meaningVi)) {
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

    if (setup.collocationCount > 0 && needsDenseDetails && collocations.length < 1) {
        issues.push(`Collocations missing for "${word.word}".`);
        retryFields.add('collocationsArray');
    }
    if (setup.includeIdioms && idioms.length < 1) {
        issues.push(`Idioms missing for "${word.word}".`);
        retryFields.add('idiomsList');
    }
    if (setup.includeParaphrases && paraphrases.length < 1) {
        issues.push(`Paraphrases missing for "${word.word}".`);
        retryFields.add('paraphrases');
    }

    const invalidParaphraseTones = paraphrases
        .map((item: any) => String(item?.tone || '').trim())
        .filter((tone) => !VALID_PARAPHRASE_TONES.has(tone.toLowerCase()));
    if (setup.includeParaphrases && invalidParaphraseTones.length > 0) {
        issues.push(`Invalid paraphrase tone found for "${word.word}": ${invalidParaphraseTones.join(', ')}.`);
        retryFields.add('paraphrases');
    }

    const missingCollocationHint = collocations.some((item: any) => !String(item?.text || '').trim() || !String(item?.d || '').trim());
    if (setup.collocationCount > 0 && needsDenseDetails && missingCollocationHint) {
        issues.push(`Collocations for "${word.word}" must include both text and hint.`);
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
    if (setup.includePrepositions && missingPrepositionContext) {
        issues.push(`Preposition usage for "${word.word}" is missing context/example for preposition "${missingPrepositionContext.prep}".`);
        retryFields.add('prepositionsArray');
    }
    if (setup.includePrepositions && invalidPrepositionUsage) {
        issues.push(`Preposition usage for "${word.word}" must contain the preposition "${invalidPrepositionUsage.prep}" inside its context/example.`);
        retryFields.add('prepositionsArray');
    }
    if (setup.includePrepositions && prepositions.length === 0) {
        issues.push(`Prepositions missing for "${word.word}".`);
        retryFields.add('prepositionsArray');
    }
    if (expectsGroups && groups.length === 0) {
        issues.push(`Groups missing for "${word.word}".`);
        retryFields.add('groups');
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

const getValidationIssues = (results: any[], words: VocabularyItem[], setup: WordRefineSetup): string[] => {
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
        issues.push(...validateWordResult(rawResult, word, setup).issues);
    }

    return issues;
};

const buildConfiguredWordRefinePrompt = (
    word: VocabularyItem,
    nativeLanguage: string,
    setup: WordRefineSetup,
    options?: {
        includePronunciation?: boolean;
        pronunciationOnly?: boolean;
    }
): string => {
    const currentGroups = (word.groups || []).map((group) => String(group || '').trim()).filter(Boolean);
    const allAppGroups = Array.from(
        new Set(
            getAllWords()
                .filter((item) => item.userId === word.userId)
                .flatMap((item) => item.groups || [])
                .map((group) => String(group || '').trim())
                .filter(Boolean)
        )
    ).sort((left, right) => left.localeCompare(right));

    const basePrompt = getWordDetailsPrompt([word.word], nativeLanguage, {
        includePronunciation: options?.includePronunciation,
        meaningLanguage: setup.meaningLanguage,
        collocationCount: options?.pronunciationOnly ? 0 : setup.collocationCount,
        includeParaphrases: options?.pronunciationOnly ? false : setup.includeParaphrases,
        includeIdioms: options?.pronunciationOnly ? false : setup.includeIdioms,
        exampleCount: options?.pronunciationOnly ? 1 : setup.exampleCount,
        includePrepositions: options?.pronunciationOnly ? false : setup.includePrepositions,
        includeGroupsIfMissing: !options?.pronunciationOnly && setup.includeGroupsIfMissing && currentGroups.length === 0
    });

    const extraLines = [
        currentGroups.length > 0
            ? `Current groups for this word:\n- ${currentGroups.join('\n- ')}`
            : 'Current groups for this word: none',
        setup.includeGroupsIfMissing && currentGroups.length === 0 && allAppGroups.length > 0
            ? `Available app groups you may reuse if suitable:\n- ${allAppGroups.join('\n- ')}`
            : '',
        options?.pronunciationOnly
            ? 'For this pass, generate ONLY pronunciation fields and the minimal identity fields needed to map the result. Return og, hw, ipa_us, optional ipa_uk, optional pron_sim. Omit all other content fields.'
            : 'For this pass, follow the refine setup exactly. If a requested list has no natural item, return an empty array in the correct JSON field instead of inventing weak content.'
    ].filter(Boolean);

    return `${basePrompt}\n\n${extraLines.join('\n\n')}\n\nReturn ONLY one strict JSON array in a \`\`\`json code block. Do not add explanation text outside the code block.`;
};

const buildRetryPrompt = (
    word: VocabularyItem,
    nativeLanguage: string,
    setup: WordRefineSetup,
    retryFields: RetryField[],
    lastIssues: string[],
    partialResult: any | null
): string => {
    if (retryFields.length === 0) {
        return buildConfiguredWordRefinePrompt(word, nativeLanguage, setup, { includePronunciation: false });
    }

    const fieldInstructions: Record<RetryField, string> = {
        pronunciation: '- ipa_us / optional ipa_uk / optional pron_sim: regenerate pronunciation fields only.',
        headword: '- hw: correct headword/base form. Keep the full phrase if the original input is a phrase.',
        meaningVi: `- m: meaning in ${setup.meaningLanguage === 'en' ? 'English' : nativeLanguage}.`,
        example: '- ex: one natural example sentence using the exact headword.',
        register: '- reg: A-MUST / IMPORTANT. MUST be ONLY one of "academic", "casual", or "neutral". NEVER output any other register label.',
        collocationsArray: '- col: return collocations in correct schema. Each item must include both "text" and "d".',
        idiomsList: '- idm: return idioms in correct schema. Each item must include both "text" and "d".',
        paraphrases: '- para: every item must include "w", valid tone "t", and short context "c". Tone "t" MUST be ONLY one of "academic", "casual", "neutral".',
        prepositionsArray: '- prep: dependent prepositions only. Every item MUST include BOTH "p" and "c". Each usage example/context must explicitly contain the exact same preposition. If no natural dependent preposition exists, return [].',
        groups: '- gr: suggest group names as an array of strings. Only return groups that fit the word naturally.'
    };

    const fieldKeyMap: Record<RetryField, string> = {
        pronunciation: 'ipa_us, ipa_uk, pron_sim',
        headword: 'hw',
        meaningVi: 'm',
        example: 'ex',
        register: 'reg',
        collocationsArray: 'col',
        idiomsList: 'idm',
        paraphrases: 'para',
        prepositionsArray: 'prep',
        groups: 'gr'
    };

    const knownData = partialResult
        ? JSON.stringify({
            og: partialResult.original,
            hw: partialResult.headword,
            ipa_us: partialResult.ipaUs,
            ipa_uk: partialResult.ipaUk,
            pron_sim: partialResult.pronSim,
            m: partialResult.meaningVi,
            reg: partialResult.register,
            ex: partialResult.example,
            gr: partialResult.groups
        }, null, 2)
        : 'null';

    const expectedFieldExamples: Record<RetryField, string> = {
        pronunciation: `- ipa_us expected: "/dɪˈfaɪ/"`,
        headword: `- hw expected: "defy"`,
        meaningVi: `- m expected: "${setup.meaningLanguage === 'en' ? 'to resist openly' : 'thach thuc, bat tuan'}"`,
        example: `- ex expected: "Their actions showed open defiance of the rules."`,
        register: `- reg expected: "academic" OR "casual" OR "neutral"`,
        collocationsArray: `- col expected: [{"text":"surface-level analysis","d":"shallow examination of an issue"}]`,
        idiomsList: `- idm expected: [{"text":"break the ice","d":"start a friendly conversation"}]`,
        paraphrases: `- para expected: [{"w":"resistance","t":"neutral","c":"opposing authority"}]`,
        prepositionsArray: `- prep expected: [{"p":"in","c":"in the face of criticism"}]`,
        groups: `- gr expected: ["Academic Writing", "Weather"]`
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

const sanitizePartialResultForFailedFields = (partialResult: any, failedFields: RetryField[]): any => {
    if (!partialResult) return partialResult;
    const sanitized = { ...partialResult };
    const failed = new Set(failedFields);

    if (failed.has('headword')) delete sanitized.headword;
    if (failed.has('pronunciation')) {
        delete sanitized.ipaUs;
        delete sanitized.ipaUk;
        delete sanitized.pronSim;
    }
    if (failed.has('meaningVi')) delete sanitized.meaningVi;
    if (failed.has('example')) delete sanitized.example;
    if (failed.has('register')) delete sanitized.register;
    if (failed.has('collocationsArray')) {
        delete sanitized.collocationsArray;
        delete sanitized.collocations;
    }
    if (failed.has('idiomsList')) {
        delete sanitized.idiomsList;
        delete sanitized.idioms;
    }
    if (failed.has('paraphrases')) delete sanitized.paraphrases;
    if (failed.has('prepositionsArray')) {
        delete sanitized.prepositionsArray;
        delete sanitized.prepositionString;
    }
    if (failed.has('groups')) delete sanitized.groups;

    return sanitized;
};

const hasAnyUsableRefineData = (result: any): boolean => {
    if (!result) return false;
    return Boolean(
        result.headword ||
        result.ipaUs ||
        result.ipaUk ||
        result.pronSim ||
        result.meaningVi ||
        result.register ||
        result.example ||
        (Array.isArray(result.collocationsArray) && result.collocationsArray.length > 0) ||
        (Array.isArray(result.idiomsList) && result.idiomsList.length > 0) ||
        (Array.isArray(result.prepositionsArray) && result.prepositionsArray.length > 0) ||
        (Array.isArray(result.paraphrases) && result.paraphrases.length > 0) ||
        (Array.isArray(result.groups) && result.groups.length > 0) ||
        result.wordFamily ||
        result.isIdiom !== undefined ||
        result.isPhrasalVerb !== undefined ||
        result.isCollocation !== undefined ||
        result.isStandardPhrase !== undefined ||
        result.isIrregular !== undefined ||
        result.isPassive !== undefined
    );
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
            const errorBody = await response.text().catch(() => '');
            debugWordRefine('requestWordRefineAttempt:httpError', {
                attempt,
                status: response.status,
                body: errorBody.slice(0, 2000),
                promptPreview: prompt.slice(0, 1200)
            });
            throw new Error(buildAiHttpErrorMessage(response.status, errorBody));
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
                : parsed && typeof parsed === 'object'
                    ? [parsed]
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

const resolveInitialPronunciation = async (
    word: VocabularyItem,
    nativeLanguage: string,
    setup: WordRefineSetup,
    signal: AbortSignal | undefined,
    onProgress: RunWordRefineWithRetryOptions['onProgress'],
    wordIndex: number,
    totalWords: number
): Promise<any | null> => {
    const singleWord = isSingleWordText(word.word);
    const useCambridge = singleWord || setup.phraseIpaMode === 'cambridge';

    if (useCambridge) {
        onProgress?.({
            stage: 'starting',
            attempt: 0,
            maxAttempts: MAX_REFINE_ATTEMPTS,
            message: `Word ${wordIndex + 1}/${totalWords} "${word.word}": resolving IPA from Cambridge...`
        });
        const cambridgePronunciation = await fetchCambridgePronunciation(word.word);
        return cambridgePronunciation
            ? {
                original: word.word,
                ipaUs: cambridgePronunciation.ipaUs,
                ipaUk: cambridgePronunciation.ipaUk,
                pronSim: cambridgePronunciation.pronSim
            }
            : null;
    }

    onProgress?.({
        stage: 'starting',
        attempt: 0,
        maxAttempts: MAX_REFINE_ATTEMPTS,
        message: `Word ${wordIndex + 1}/${totalWords} "${word.word}": generating phrase IPA first...`
    });
    const { results } = await requestWordRefineAttempt(
        buildConfiguredWordRefinePrompt(word, nativeLanguage, setup, {
            includePronunciation: true,
            pronunciationOnly: true
        }),
        1,
        signal,
        (snapshot) => onProgress?.({
            ...snapshot,
            message: `Word ${wordIndex + 1}/${totalWords} "${word.word}": ${snapshot.message}`
        })
    );
    const matchedRawResult = results.find((item) => getOriginalKey(item) === word.word.trim().toLowerCase()) || results[0] || null;
    const normalized = normalizeAiResponse(ensureResultHasOriginalWord(matchedRawResult, word.word));
    if (!normalized?.ipaUs && !normalized?.ipaUk) return null;
    return {
        original: word.word,
        ipaUs: normalized.ipaUs,
        ipaUk: normalized.ipaUk,
        pronSim: normalized.pronSim
    };
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
    const finalIssues: WordRefineApiResult['finalIssues'] = [];
    let totalAttempts = 0;
    const setup = normalizeWordRefineSetup(options.setup);
    options.onProgress?.({
        stage: 'starting',
        attempt: 0,
        maxAttempts: MAX_REFINE_ATTEMPTS,
        message: `Preparing refine for ${words.length} selected word(s) with configured setup...`
    });

    const processSingleWord = async (wordIndex: number) => {
        const currentWord = words[wordIndex];
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

        try {
            partialResult = await resolveInitialPronunciation(
                currentWord,
                nativeLanguage,
                setup,
                options.signal,
                options.onProgress,
                wordIndex,
                words.length
            );
        } catch (error) {
            lastError = error;
            lastIssues = [error instanceof Error ? error.message : 'Failed to resolve IPA before refine.'];
        }
        if (!partialResult) {
            retryFields = ['pronunciation'];
            if (lastIssues.length === 0) {
                lastIssues = [`Pronunciation missing for "${currentWord.word}".`];
            }
        }

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
                        ? buildRetryPrompt(currentWord, nativeLanguage, setup, retryFields, lastIssues, partialResult)
                        : buildConfiguredWordRefinePrompt(currentWord, nativeLanguage, setup, { includePronunciation: false }),
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
                const matchedRawResult = results.find((item) => getOriginalKey(item) === currentWord.word.trim().toLowerCase()) || results[0] || null;
                const rawResult = ensureResultHasOriginalWord(matchedRawResult, currentWord.word);
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
                const validation = validateWordResult(partialResult, currentWord, setup);
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
            const droppedFields = retryFields;
            const sanitizedPartialResult = sanitizePartialResultForFailedFields(partialResult, droppedFields);
            const savedPartially = hasAnyUsableRefineData(sanitizedPartialResult);

            if (savedPartially) {
                aggregatedResultsByIndex.set(wordIndex, sanitizedPartialResult);
                await options.onWordValidated?.({
                    word: currentWord,
                    results: [sanitizedPartialResult],
                    wordIndex,
                    totalWords: words.length,
                    attempts: MAX_REFINE_ATTEMPTS,
                    partial: true,
                    issues: lastIssues
                });
            }

            finalIssues.push({
                word: currentWord.word,
                issues: lastIssues.length > 0
                    ? lastIssues
                    : [lastError instanceof Error ? lastError.message : `API refine failed for "${currentWord.word}".`],
                droppedFields,
                savedPartially
            });

            options.onProgress?.({
                stage: 'error',
                attempt: MAX_REFINE_ATTEMPTS,
                maxAttempts: MAX_REFINE_ATTEMPTS,
                message: savedPartially
                    ? `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": partial save applied. Invalid fields were skipped for manual review.`
                    : `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": no valid fields could be saved. Manual review required.`,
                issues: lastIssues
            });
        }
    };

    for (let index = 0; index < words.length; index += 1) {
        await processSingleWord(index);
    }

    const aggregatedResults = words
        .map((_, index) => aggregatedResultsByIndex.get(index))
        .filter(Boolean);

    return { results: aggregatedResults, attempts: totalAttempts, finalIssues };
};
