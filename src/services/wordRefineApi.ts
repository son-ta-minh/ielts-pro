import { StudyItem } from '../app/types';
import { getConfig, getServerUrl, getStudyBuddyAiUrl } from '../app/settingsManager';
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
const PLACEHOLDER_MEANING_PATTERN = /^(to resist openly|thach thuc,\s*bat tuan)$/i;
const VALID_REGISTERS = new Set(['academic', 'casual', 'neutral']);
const VALID_PARAPHRASE_TONES = new Set(['academic', 'casual', 'neutral']);
const PHRASE_LIKE_TYPES = new Set(['idiom', 'phrasal_verb', 'collocation', 'phrase']);
const WORD_REFINE_DEBUG_STORAGE_KEY = 'vocab_pro_debug_refine_api';
const HIRAGANA_ONLY_PATTERN = /^[\u3040-\u309F\u30FC\s・･]+$/;
const JAPANESE_SCRIPT_PATTERN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const KATAKANA_PATTERN = /[\u30A0-\u30FF]/;
const ROMAJI_PATTERN = /\b[a-z][a-z'\-]*\b/i;

export type WordRefineMeaningMode = 'vi' | 'en';
export interface WordRefineSetup {
    includeMeaning: boolean;
    meaningLanguage: WordRefineMeaningMode;
    includeCollocations: boolean;
    collocationCount: number;
    includeExamples: boolean;
    exampleCount: number;
    includePrepositions: boolean;
    includeParaphrases: boolean;
    includeIdioms: boolean;
}

export const DEFAULT_WORD_REFINE_SETUP: WordRefineSetup = {
    includeMeaning: true,
    meaningLanguage: 'vi',
    includeCollocations: true,
    collocationCount: 3,
    includeExamples: true,
    exampleCount: 1,
    includePrepositions: true,
    includeParaphrases: true,
    includeIdioms: false
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
        word: StudyItem;
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
    | 'prepositionsArray';

interface ValidationState {
    issues: string[];
    retryFields: RetryField[];
}

interface CambridgePronunciationPayload {
    ipaUs?: string;
    ipaUk?: string;
    pronSim?: 'same' | 'near' | 'different';
}

type RefineLocale = 'default' | 'japanese';

const normalizeParaphraseTone = (value: string): string => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return normalized;
    if (normalized === 'near synonym' || normalized === 'near-synonym' || normalized === 'near_synonym') {
        return 'synonym';
    }
    return normalized;
};

const getRefineLocale = (word: StudyItem): RefineLocale => word.libraryType === 'kotoba' ? 'japanese' : 'default';

const isJapaneseLocale = (word: StudyItem): boolean => getRefineLocale(word) === 'japanese';

const isHiraganaPronunciation = (value: string): boolean => {
    const text = String(value || '').trim();
    if (!text) return false;
    return HIRAGANA_ONLY_PATTERN.test(text);
};

const looksJapaneseText = (value: string): boolean => {
    const text = String(value || '').trim();
    if (!text) return false;
    return JAPANESE_SCRIPT_PATTERN.test(text);
};

const hasRomajiLeak = (value: string): boolean => {
    const text = String(value || '').trim();
    if (!text) return false;
    return ROMAJI_PATTERN.test(text) && !looksJapaneseText(text);
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

const fetchServerIpaPronunciation = async (text: string): Promise<CambridgePronunciationPayload | null> => {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return null;

    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/convert/pron?text=${encodeURIComponent(normalizedText)}&mode=2`, {
            cache: 'no-store'
        });
        if (!response.ok) return null;

        const payload = await response.json().catch(() => null);
        const ipaUs = formatIpaValue(payload?.ipa);
        if (!ipaUs) return null;

        return {
            ipaUs,
            ipaUk: undefined,
            pronSim: 'same'
        };
    } catch (error) {
        debugWordRefine('fetchServerIpaPronunciation:error', {
            text: normalizedText,
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

const logWordRefineValidationFailure = (payload: {
    word: string;
    attempt: number;
    issues: string[];
    retryFields: RetryField[];
    rawText?: string;
    rawResult?: any;
    partialResult?: any;
    retryPrompt?: string;
}) => {
    console.groupCollapsed(`[WordRefineAPI] Validation failed for "${payload.word}" at attempt ${payload.attempt}`);
    console.warn('Issues:', payload.issues);
    console.info('Retry fields:', payload.retryFields);
    if (payload.rawText) {
        console.info('Raw AI response:', payload.rawText);
    }
    if (payload.rawResult !== undefined) {
        console.info('Matched raw result:', payload.rawResult);
    }
    if (payload.partialResult !== undefined) {
        console.info('Merged partial result:', payload.partialResult);
    }
    if (payload.retryPrompt) {
        console.info('Retry prompt sent to AI:', payload.retryPrompt);
    }
    console.groupEnd();
};

const logWordRefineAttemptError = (payload: {
    word: string;
    attempt: number;
    error: string;
    retryFields: RetryField[];
    retryPrompt?: string;
}) => {
    console.groupCollapsed(`[WordRefineAPI] Attempt error for "${payload.word}" at attempt ${payload.attempt}`);
    console.error(payload.error);
    if (payload.retryFields.length > 0) {
        console.info('Current retry fields:', payload.retryFields);
    }
    if (payload.retryPrompt) {
        console.info('Prompt sent to AI:', payload.retryPrompt);
    }
    console.groupEnd();
};

const logWordRefineRetryPrompt = (payload: {
    word: string;
    attempt: number;
    retryFields: RetryField[];
    prompt: string;
}) => {
    console.groupCollapsed(`[WordRefineAPI] Retry prompt for "${payload.word}" at attempt ${payload.attempt}`);
    console.info('Retry fields:', payload.retryFields);
    console.info('Prompt:', payload.prompt);
    console.groupEnd();
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
    includeMeaning: setup?.includeMeaning ?? DEFAULT_WORD_REFINE_SETUP.includeMeaning,
    meaningLanguage: setup?.meaningLanguage === 'en' ? 'en' : DEFAULT_WORD_REFINE_SETUP.meaningLanguage,
    includeCollocations: setup?.includeCollocations ?? DEFAULT_WORD_REFINE_SETUP.includeCollocations,
    collocationCount: clamp(Number(setup?.collocationCount ?? DEFAULT_WORD_REFINE_SETUP.collocationCount), 0, 5),
    includeExamples: setup?.includeExamples ?? DEFAULT_WORD_REFINE_SETUP.includeExamples,
    exampleCount: clamp(Number(setup?.exampleCount ?? DEFAULT_WORD_REFINE_SETUP.exampleCount), 1, 3),
    includePrepositions: setup?.includePrepositions ?? DEFAULT_WORD_REFINE_SETUP.includePrepositions,
    includeParaphrases: setup?.includeParaphrases ?? DEFAULT_WORD_REFINE_SETUP.includeParaphrases,
    includeIdioms: setup?.includeIdioms ?? DEFAULT_WORD_REFINE_SETUP.includeIdioms
});

const getRequestedContentFields = (setup: WordRefineSetup): RetryField[] => ([
    'register',
    ...(setup.includeMeaning ? ['meaningVi' as const] : []),
    ...(setup.includeExamples ? ['example' as const] : []),
    ...(setup.includeCollocations ? ['collocationsArray' as const] : []),
    ...(setup.includePrepositions ? ['prepositionsArray' as const] : []),
    ...(setup.includeParaphrases ? ['paraphrases' as const] : []),
    ...(setup.includeIdioms ? ['idiomsList' as const] : [])
]);

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
    if (PLACEHOLDER_MEANING_PATTERN.test(text)) return false;
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
    setup: WordRefineSetup,
    replaceFields: RetryField[] = []
): any | null => {
    const normalizedIncoming = normalizeAiResponse(incomingResult);
    const fallbackParaphrases = getParaphrasesFromAnyShape(incomingResult);
    const requestedFields = new Set(getRequestedContentFields(setup));
    debugWordRefine('mergePartialRefineResult', {
        incomingOriginalKey: getOriginalKey(incomingResult),
        hasBaseResult: !!baseResult,
        incomingResult,
        normalizedIncoming,
        requestedFields: Array.from(requestedFields),
        replaceFields
    });
    if (!normalizedIncoming) return baseResult;
    if (!baseResult) {
        return {
            original: normalizedIncoming.original,
            headword: normalizedIncoming.headword,
            ipaUs: normalizedIncoming.ipaUs,
            ipaUk: normalizedIncoming.ipaUk,
            pronSim: normalizedIncoming.pronSim,
            register: normalizedIncoming.register,
            isIdiom: normalizedIncoming.isIdiom,
            isPhrasalVerb: normalizedIncoming.isPhrasalVerb,
            isCollocation: normalizedIncoming.isCollocation,
            isStandardPhrase: normalizedIncoming.isStandardPhrase,
            isIrregular: normalizedIncoming.isIrregular,
            isPassive: normalizedIncoming.isPassive,
            meaningVi: requestedFields.has('meaningVi') ? normalizedIncoming.meaningVi : undefined,
            example: requestedFields.has('example') ? normalizedIncoming.example : undefined,
            collocations: requestedFields.has('collocationsArray') ? normalizedIncoming.collocations : undefined,
            collocationsArray: requestedFields.has('collocationsArray') ? normalizedIncoming.collocationsArray : undefined,
            idioms: requestedFields.has('idiomsList') ? normalizedIncoming.idioms : undefined,
            idiomsList: requestedFields.has('idiomsList') ? normalizedIncoming.idiomsList : undefined,
            prepositionsArray: requestedFields.has('prepositionsArray') ? normalizedIncoming.prepositionsArray : undefined,
            paraphrases: requestedFields.has('paraphrases')
                ? ((normalizedIncoming.paraphrases && normalizedIncoming.paraphrases.length > 0
                    ? normalizedIncoming.paraphrases
                    : fallbackParaphrases))
                : undefined
        };
    }

    const shouldReplace = (field: RetryField) => replaceFields.includes(field);

    return {
        ...baseResult,
        original: normalizedIncoming.original || baseResult.original,
        headword: baseResult.headword || normalizedIncoming.headword,
        ipaUs: normalizedIncoming.ipaUs || baseResult.ipaUs,
        ipaUk: normalizedIncoming.ipaUk || baseResult.ipaUk,
        pronSim: normalizedIncoming.pronSim || baseResult.pronSim,
        register: normalizedIncoming.register || baseResult.register,
        isIdiom: normalizedIncoming.isIdiom ?? baseResult.isIdiom,
        isPhrasalVerb: normalizedIncoming.isPhrasalVerb ?? baseResult.isPhrasalVerb,
        isCollocation: normalizedIncoming.isCollocation ?? baseResult.isCollocation,
        isStandardPhrase: normalizedIncoming.isStandardPhrase ?? baseResult.isStandardPhrase,
        isIrregular: normalizedIncoming.isIrregular ?? baseResult.isIrregular,
        isPassive: normalizedIncoming.isPassive ?? baseResult.isPassive,
        meaningVi: requestedFields.has('meaningVi')
            ? (normalizedIncoming.meaningVi || baseResult.meaningVi)
            : baseResult.meaningVi,
        example: requestedFields.has('example')
            ? (normalizedIncoming.example || baseResult.example)
            : baseResult.example,
        collocations: requestedFields.has('collocationsArray')
            ? (normalizedIncoming.collocations || baseResult.collocations)
            : baseResult.collocations,
        collocationsArray: requestedFields.has('collocationsArray')
            ? (
                shouldReplace('collocationsArray')
                    ? (normalizedIncoming.collocationsArray || baseResult.collocationsArray)
                    : mergeUniqueByText(baseResult.collocationsArray, normalizedIncoming.collocationsArray, 'text')
            )
            : baseResult.collocationsArray,
        idioms: requestedFields.has('idiomsList')
            ? (normalizedIncoming.idioms || baseResult.idioms)
            : baseResult.idioms,
        idiomsList: requestedFields.has('idiomsList')
            ? mergeUniqueByText(baseResult.idiomsList, normalizedIncoming.idiomsList, 'text')
            : baseResult.idiomsList,
        prepositionsArray: requestedFields.has('prepositionsArray')
            ? (
                shouldReplace('prepositionsArray')
                    ? (normalizedIncoming.prepositionsArray || baseResult.prepositionsArray)
                    : mergeUniqueByText(baseResult.prepositionsArray, normalizedIncoming.prepositionsArray, 'prep')
            )
            : baseResult.prepositionsArray,
        paraphrases: requestedFields.has('paraphrases')
            ? (
                shouldReplace('paraphrases')
                    ? ((normalizedIncoming.paraphrases && normalizedIncoming.paraphrases.length > 0
                        ? normalizedIncoming.paraphrases
                        : fallbackParaphrases) || baseResult.paraphrases)
                    : mergeUniqueByText(
                        baseResult.paraphrases,
                        (normalizedIncoming.paraphrases && normalizedIncoming.paraphrases.length > 0
                            ? normalizedIncoming.paraphrases
                            : fallbackParaphrases),
                        'word'
                    )
            )
            : baseResult.paraphrases
    };
};

const validateWordResult = (result: any, word: StudyItem, setup: WordRefineSetup): ValidationState => {
    const issues: string[] = [];
    const retryFields = new Set<RetryField>();
    const normalized = normalizeAiResponse(result);
    const baseRetryFields: RetryField[] = getRequestedContentFields(setup);
    const japaneseMode = isJapaneseLocale(word);

    if (!result) {
        return {
            issues: [`Missing object for "${word.word}".`],
            retryFields: baseRetryFields
        };
    }
    if (!normalized) {
        return {
            issues: [`Invalid object format for "${word.word}".`],
            retryFields: baseRetryFields
        };
    }

    const headword = String(normalized.headword || normalized.word || '').trim();
    const effectiveHeadword = headword || word.word.trim();
    const meaningVi = String(normalized.meaningVi || '').trim();
    const example = String(normalized.example || '').trim();
    const register = String(normalized.register || '').trim().toLowerCase();
    const type = String(result.type || '').trim().toLowerCase();
    const ipaUs = String(normalized.ipaUs || '').trim();
    const ipaUk = String(normalized.ipaUk || '').trim();
    const normalizedParaphrases = getParaphrasesFromAnyShape(normalized);
    const rawParaphrases = getParaphrasesFromAnyShape(result);
    const paraphrases = normalizedParaphrases.length > 0 ? normalizedParaphrases : rawParaphrases;
    const collocations = Array.isArray(normalized.collocationsArray) ? normalized.collocationsArray : [];
    const idioms = Array.isArray(normalized.idiomsList) ? normalized.idiomsList : [];
    const prepositions = Array.isArray(normalized.prepositionsArray) ? normalized.prepositionsArray : [];
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
            prepositions: prepositions.length
        }
    });

    if (setup.includeMeaning && !meaningVi) {
        issues.push(`Missing meaning for "${word.word}".`);
        retryFields.add('meaningVi');
    } else if (setup.includeMeaning && PLACEHOLDER_MEANING_PATTERN.test(meaningVi)) {
        issues.push(`Meaning for "${word.word}" reused a leaked placeholder example instead of the real meaning.`);
        retryFields.add('meaningVi');
    } else if (setup.includeMeaning && !japaneseMode && setup.meaningLanguage === 'vi' && !looksVietnameseMeaning(meaningVi)) {
        issues.push(`Meaning for "${word.word}" is not clearly Vietnamese-only.`);
        retryFields.add('meaningVi');
    }
    if (japaneseMode) {
        if (!ipaUs || !isHiraganaPronunciation(ipaUs) || KATAKANA_PATTERN.test(ipaUs)) {
            issues.push(`Pronunciation for "${word.word}" must be Hiragana-only in "ipa_us".`);
            retryFields.add('pronunciation');
        }
        if (ipaUk && (!isHiraganaPronunciation(ipaUk) || KATAKANA_PATTERN.test(ipaUk))) {
            issues.push(`Pronunciation for "${word.word}" must be Hiragana-only in "ipa_uk" when provided.`);
            retryFields.add('pronunciation');
        }
    }
    if (setup.includeExamples && !example) {
        issues.push(`Missing example for "${word.word}".`);
        retryFields.add('example');
    } else if (japaneseMode && example && !looksJapaneseText(example)) {
        issues.push(`Example for "${word.word}" must be written in Japanese.`);
        retryFields.add('example');
    }
    if (!VALID_REGISTERS.has(register)) {
        issues.push(`Invalid register for "${word.word}".`);
        retryFields.add('register');
    }

    const isSingleWord = effectiveHeadword.split(/\s+/).filter(Boolean).length <= 1;
    const needsDenseDetails = isSingleWord && !PHRASE_LIKE_TYPES.has(type || 'vocabulary');

    const invalidParaphraseTones = paraphrases
        .map((item: any) => String(item?.tone || '').trim())
        .filter((tone) => !VALID_PARAPHRASE_TONES.has(tone.toLowerCase()));
    if (setup.includeParaphrases && paraphrases.length > 0 && invalidParaphraseTones.length > 0) {
        issues.push(`Invalid paraphrase tone found for "${word.word}": ${invalidParaphraseTones.join(', ')}.`);
        retryFields.add('paraphrases');
    }
    if (japaneseMode) {
        const invalidJapaneseParaphrase = paraphrases.find((item: any) => {
            const paraWord = String(item?.word || '').trim();
            const paraContext = String(item?.context || '').trim();
            if (!paraWord) return false;
            return !looksJapaneseText(paraWord) || (!!paraContext && !looksJapaneseText(paraContext)) || hasRomajiLeak(paraWord) || hasRomajiLeak(paraContext);
        });
        if (setup.includeParaphrases && invalidJapaneseParaphrase) {
            issues.push(`Paraphrases for "${word.word}" must use Japanese text for both paraphrase and context.`);
            retryFields.add('paraphrases');
        }
    }

    const missingCollocationHint = collocations.some((item: any) => !String(item?.text || '').trim() || !String(item?.d || '').trim());
    if (setup.includeCollocations && setup.collocationCount > 0 && needsDenseDetails && collocations.length > 0 && missingCollocationHint) {
        issues.push(`Collocations for "${word.word}" must include both text and hint.`);
        retryFields.add('collocationsArray');
    }
    if (japaneseMode) {
        const invalidJapaneseCollocation = collocations.find((item: any) => {
            const text = String(item?.text || '').trim();
            const hint = String(item?.d || '').trim();
            if (!text && !hint) return false;
            return !looksJapaneseText(text) || !looksJapaneseText(hint) || hasRomajiLeak(text) || hasRomajiLeak(hint);
        });
        if (setup.includeCollocations && invalidJapaneseCollocation) {
            issues.push(`Collocations for "${word.word}" must contain Japanese text and Japanese hints.`);
            retryFields.add('collocationsArray');
        }
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
    if (setup.includePrepositions && prepositions.length > 0 && missingPrepositionContext) {
        issues.push(`Preposition usage for "${word.word}" is missing context/example for preposition "${missingPrepositionContext.prep}".`);
        retryFields.add('prepositionsArray');
    }
    if (setup.includePrepositions && prepositions.length > 0 && invalidPrepositionUsage) {
        issues.push(`Preposition usage for "${word.word}" must contain the preposition "${invalidPrepositionUsage.prep}" inside its context/example.`);
        retryFields.add('prepositionsArray');
    }
    if (japaneseMode) {
        const invalidJapanesePreposition = prepositions.find((item: any) => {
            const prep = String(item?.prep || '').trim();
            const usage = String(item?.usage || '').trim();
            if (!prep && !usage) return false;
            return !looksJapaneseText(prep) || !looksJapaneseText(usage) || hasRomajiLeak(prep) || hasRomajiLeak(usage);
        });
        if (setup.includePrepositions && invalidJapanesePreposition) {
            issues.push(`Preposition usage for "${word.word}" must be written in Japanese.`);
            retryFields.add('prepositionsArray');
        }
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

const getValidationIssues = (results: any[], words: StudyItem[], setup: WordRefineSetup): string[] => {
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
    word: StudyItem,
    nativeLanguage: string,
    setup: WordRefineSetup,
    options?: {
        includePronunciation?: boolean;
        pronunciationOnly?: boolean;
    }
): string => {
    const locale = getRefineLocale(word);
    const basePrompt = getWordDetailsPrompt([word.word], nativeLanguage, {
        locale,
        includePronunciation: !!options?.includePronunciation,
        meaningLanguage: setup.meaningLanguage,
        includeMeaning: options?.pronunciationOnly ? false : setup.includeMeaning,
        collocationCount: options?.pronunciationOnly || !setup.includeCollocations ? 0 : setup.collocationCount,
        includeExamples: options?.pronunciationOnly ? false : setup.includeExamples,
        includeParaphrases: options?.pronunciationOnly ? false : setup.includeParaphrases,
        includeIdioms: options?.pronunciationOnly ? false : setup.includeIdioms,
        exampleCount: setup.exampleCount,
        includePrepositions: options?.pronunciationOnly ? false : setup.includePrepositions
    });

    const extraLines = [
        options?.pronunciationOnly
            ? 'For this pass, generate ONLY pronunciation fields plus the always-required core metadata fields. Omit all content fields like meaning, example, collocations, idioms, paraphrases, and prepositions.'
            : 'For this pass, keep the always-required core metadata fields "reg", "type", and "is_pas", and include ONLY the optional content fields enabled by the current refine setup. Do not add disabled optional fields.'
        ,
        locale === 'japanese'
            ? 'Japanese refine mode: "ipa_us" MUST be the reading in Hiragana only. Example/collocation hint/paraphrase/preposition usage MUST be written in natural Japanese. Do not output IPA symbols, romaji, or katakana in pronunciation fields.'
            : ''
    ].filter(Boolean);

    return `${basePrompt}\n\n${extraLines.join('\n\n')}\n\nReturn ONLY one strict JSON array in a \`\`\`json code block. Do not add explanation text outside the code block.`;
};

const buildRetryPrompt = (
    word: StudyItem,
    nativeLanguage: string,
    setup: WordRefineSetup,
    retryFields: RetryField[],
    lastIssues: string[],
    partialResult: any | null
): string => {
    const locale = getRefineLocale(word);
    if (retryFields.length === 0) {
        return buildConfiguredWordRefinePrompt(word, nativeLanguage, setup, { includePronunciation: false });
    }

    const fieldInstructions: Record<RetryField, string> = {
        pronunciation: locale === 'japanese'
            ? '- ipa_us / optional ipa_uk / optional pron_sim: regenerate pronunciation fields only. For Japanese refine, use Hiragana-only reading in ipa_us and set pron_sim to "same".'
            : '- ipa_us / optional ipa_uk / optional pron_sim: regenerate pronunciation fields only.',
        headword: '- hw: correct headword/base form. Keep the full phrase if the original input is a phrase.',
        meaningVi: `- m: meaning in ${setup.meaningLanguage === 'en' ? 'English' : 'Vietnamese'}.`,
        example: locale === 'japanese'
            ? '- ex: one natural Japanese example sentence using the exact headword.'
            : '- ex: one natural example sentence using the exact headword.',
        register: '- reg: A-MUST / IMPORTANT. MUST be ONLY one of "academic", "casual", or "neutral". NEVER output any other register label.',
        collocationsArray: locale === 'japanese'
            ? '- col: return collocations in correct schema. Each item must include both "text" and "d", and both values must be in Japanese.'
            : '- col: return collocations in correct schema. Each item must include both "text" and "d".',
        idiomsList: '- idm: return idioms in correct schema. Each item must include both "text" and "d".',
        paraphrases: locale === 'japanese'
            ? '- para: every item must include "w", valid tone "t", and short context "c". Tone "t" MUST be ONLY one of "academic", "casual", "neutral". Both "w" and "c" must be in Japanese.'
            : '- para: every item must include "w", valid tone "t", and short context "c". Tone "t" MUST be ONLY one of "academic", "casual", "neutral".',
        prepositionsArray: locale === 'japanese'
            ? '- prep: Japanese particles/postpositions only. Every item MUST include BOTH "p" and "c". Both must be in Japanese, and "c" must explicitly contain the exact same particle "p". If no natural particle pattern exists, return [].'
            : '- prep: dependent prepositions only. Every item MUST include BOTH "p" and "c". Each usage example/context must explicitly contain the exact same preposition. If no natural dependent preposition exists, return [].'
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
        prepositionsArray: 'prep'
    };
    const requestedKeys = retryFields.map((field) => fieldKeyMap[field]).join(', ');
    const knownHeadword = String(partialResult?.headword || word.word || '').trim() || word.word;

    const knownData = partialResult
        ? JSON.stringify({
            og: partialResult.original,
            hw: knownHeadword,
            ipa_us: partialResult.ipaUs,
            ipa_uk: partialResult.ipaUk,
            pron_sim: partialResult.pronSim,
            m: partialResult.meaningVi,
            reg: partialResult.register,
            ex: partialResult.example
        }, null, 2)
        : 'null';

    const expectedFieldExamples: Record<RetryField, string> = {
        pronunciation: locale === 'japanese'
            ? `- ipa_us expected: "たべる"`
            : `- ipa_us expected: "/dɪˈfaɪ/"`,
        headword: '- hw expected: the corrected base word or full phrase for this specific item.',
        meaningVi: `- m expected: a concise ${setup.meaningLanguage === 'en' ? 'English' : 'Vietnamese'} meaning for this specific word. Do not copy placeholder examples from prior prompts.`,
        example: locale === 'japanese'
            ? '- ex expected: one natural Japanese sentence that uses the exact headword for this specific item.'
            : '- ex expected: one natural example sentence that uses the exact headword for this specific item.',
        register: `- reg expected: "academic" OR "casual" OR "neutral"`,
        collocationsArray: '',
        idiomsList: '',
        paraphrases: '',
        prepositionsArray: ''
    };

    const expectedBlockLines = retryFields.map((field) => expectedFieldExamples[field]).filter(Boolean);
    const expectedBlock = expectedBlockLines.length > 0
        ? expectedBlockLines.join('\n')
        : '- No fixed example output required for these fields. Omit optional list fields if none are natural.';

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

STRICT RETRY RULES:
- This is NOT a pronunciation pass unless "ipa_us" appears in the requested keys below.
- Do NOT return ipa_us, ipa_uk, or pron_sim unless those keys are explicitly requested.
- Your JSON MUST contain every requested key with a non-empty value when applicable.
- If requested keys are "m, reg", your object must include BOTH "m" and "reg".
- Never answer with only og/hw or only pronunciation fields when the requested keys are different.
${locale === 'japanese' ? '- Japanese refine mode: ipa_us must be Hiragana-only reading. Example/collocation hint/paraphrase/preposition usage must be in Japanese.' : ''}

Required JSON shape:
- Return a strict JSON array with exactly one object.
- Include "og" as "${word.word}".
- Include "hw" as "${knownHeadword}".
- Include ONLY the requested fields above (plus "og"/"hw" when needed).
- Do not rewrite fields that were not requested.

REQUESTED SHORT JSON KEYS FOR THIS RETRY:
- ${requestedKeys}

MINIMUM VALID RESPONSE SHAPE EXAMPLE:
\`\`\`json
[
  {
    "og": "${word.word}",
    "hw": "${knownHeadword}"${retryFields.includes('meaningVi') ? `,
    "m": "<fill real meaning>"` : ''}${retryFields.includes('register') ? `,
    "reg": "<academic|casual|neutral>"` : ''}${retryFields.includes('example') ? `,
    "ex": "<fill real example>"` : ''}${retryFields.includes('pronunciation') ? `,
    "ipa_us": "<fill ${locale === 'japanese' ? 'hiragana reading' : 'ipa'}>"` : ''}${retryFields.includes('pronunciation') ? `,
    "ipa_uk": "<optional ipa>"` : ''}${retryFields.includes('pronunciation') ? `,
    "pron_sim": "<same|near|different>"` : ''}
  }
]
\`\`\`

Previous validation issues:
- ${lastIssues.join('\n- ')}

Use these JSON keys when you answer: ${requestedKeys}.
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
    word: StudyItem,
    signal: AbortSignal | undefined,
    onProgress: RunWordRefineWithRetryOptions['onProgress'],
    wordIndex: number,
    totalWords: number
): Promise<any | null> => {
    if (isJapaneseLocale(word)) {
        onProgress?.({
            stage: 'starting',
            attempt: 0,
            maxAttempts: MAX_REFINE_ATTEMPTS,
            message: `Word ${wordIndex + 1}/${totalWords} "${word.word}": Japanese refine mode will generate Hiragana pronunciation from AI...`
        });
        return null;
    }

    const singleWord = isSingleWordText(word.word);
    if (singleWord) {
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
        message: `Word ${wordIndex + 1}/${totalWords} "${word.word}": resolving IPA from server route...`
    });
    if (signal?.aborted) {
        throw new DOMException('The user aborted a request.', 'AbortError');
    }
    const serverPronunciation = await fetchServerIpaPronunciation(word.word);
    return serverPronunciation
        ? {
            original: word.word,
            ipaUs: serverPronunciation.ipaUs,
            ipaUk: serverPronunciation.ipaUk,
            pronSim: serverPronunciation.pronSim
        }
        : null;
};

export const runWordRefineWithRetry = async (
    words: StudyItem[],
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

    const throwIfAborted = () => {
        if (options.signal?.aborted) {
            throw new DOMException('The user aborted a request.', 'AbortError');
        }
    };

    const processSingleWord = async (wordIndex: number) => {
        const currentWord = words[wordIndex];
        let lastIssues: string[] = [];
        let lastError: unknown = null;
        let retryFields: RetryField[] = [];
        let partialResult: any | null = null;
        let hasAttemptedFullRefine = false;

        options.onProgress?.({
            stage: 'starting',
            attempt: 0,
            maxAttempts: MAX_REFINE_ATTEMPTS,
            message: `Word ${wordIndex + 1}/${words.length}: preparing "${currentWord.word}"...`
        });

        try {
            throwIfAborted();
            partialResult = await resolveInitialPronunciation(
                currentWord,
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
                const shouldUseRetryPrompt = hasAttemptedFullRefine && lastIssues.length > 0;
                const promptForAttempt = shouldUseRetryPrompt
                    ? buildRetryPrompt(currentWord, nativeLanguage, setup, retryFields, lastIssues, partialResult)
                    : buildConfiguredWordRefinePrompt(currentWord, nativeLanguage, setup, {
                        includePronunciation: !partialResult?.ipaUs && !partialResult?.ipaUk
                    });
                if (shouldUseRetryPrompt) {
                    logWordRefineRetryPrompt({
                        word: currentWord.word,
                        attempt,
                        retryFields,
                        prompt: promptForAttempt
                    });
                }
                const { results, rawText } = await requestWordRefineAttempt(
                    promptForAttempt,
                    attempt,
                    options.signal,
                    (snapshot) => options.onProgress?.({
                        ...snapshot,
                        message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": ${snapshot.message}`
                    })
                );
                hasAttemptedFullRefine = true;
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
                partialResult = mergePartialRefineResult(partialResult, rawResult, setup, retryFields);
                debugWordRefine('attempt:partialResult', {
                    word: currentWord.word,
                    attempt,
                    partialResult
                });
                const validation = validateWordResult(partialResult, currentWord, setup);
                if (validation.issues.length === 0 && partialResult) {
                    aggregatedResultsByIndex.set(wordIndex, partialResult);
                    throwIfAborted();
                    await options.onWordValidated?.({
                        word: currentWord,
                        results: [partialResult],
                        wordIndex,
                        totalWords: words.length,
                        attempts: attempt
                    });
                    throwIfAborted();
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
                const retryPrompt = attempt < MAX_REFINE_ATTEMPTS
                    ? buildRetryPrompt(currentWord, nativeLanguage, setup, validation.retryFields, validation.issues, partialResult)
                    : undefined;
                logWordRefineValidationFailure({
                    word: currentWord.word,
                    attempt,
                    issues: validation.issues,
                    retryFields: validation.retryFields,
                    rawText,
                    rawResult,
                    partialResult,
                    retryPrompt
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
                logWordRefineAttemptError({
                    word: currentWord.word,
                    attempt,
                    error: lastIssues[0],
                    retryFields,
                    retryPrompt: attempt < MAX_REFINE_ATTEMPTS
                        ? buildRetryPrompt(currentWord, nativeLanguage, setup, retryFields, lastIssues, partialResult)
                        : undefined
                });
            }
        }

        if (!wordSucceeded) {
            const droppedFields = retryFields;
            const sanitizedPartialResult = sanitizePartialResultForFailedFields(partialResult, droppedFields);
            const savedPartially = hasAnyUsableRefineData(sanitizedPartialResult);

            if (savedPartially) {
                aggregatedResultsByIndex.set(wordIndex, sanitizedPartialResult);
                throwIfAborted();
                await options.onWordValidated?.({
                    word: currentWord,
                    results: [sanitizedPartialResult],
                    wordIndex,
                    totalWords: words.length,
                    attempts: MAX_REFINE_ATTEMPTS,
                    partial: true,
                    issues: lastIssues
                });
                throwIfAborted();
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
        throwIfAborted();
        await processSingleWord(index);
    }

    const aggregatedResults = words
        .map((_, index) => aggregatedResultsByIndex.get(index))
        .filter(Boolean);

    return { results: aggregatedResults, attempts: totalAttempts, finalIssues };
};
