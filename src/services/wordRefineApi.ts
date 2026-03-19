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
const REFINE_ATTEMPT_TIMEOUT_MS = 120000;
const VIETNAMESE_HINT_PATTERN = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const ENGLISH_LEAK_PATTERN = /\b(the|and|with|for|to|from|of|in|on|at|by|an|a|is|are)\b/i;
const VALID_REGISTERS = new Set(['academic', 'casual', 'neutral']);
const VALID_PARAPHRASE_TONES = new Set(['academic', 'casual', 'synonym', 'intensified', 'softened']);
const PHRASE_LIKE_TYPES = new Set(['idiom', 'phrasal_verb', 'collocation', 'phrase']);

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

        if (!rawResult) {
            issues.push(`Missing object for "${word.word}".`);
            continue;
        }

        const normalized = normalizeAiResponse(rawResult);
        if (!normalized) {
            issues.push(`Invalid object format for "${word.word}".`);
            continue;
        }

        const headword = String(normalized.headword || normalized.word || '').trim();
        const meaningVi = String(normalized.meaningVi || '').trim();
        const example = String(normalized.example || '').trim();
        const register = String(normalized.register || '').trim().toLowerCase();
        const type = String(rawResult.type || '').trim().toLowerCase();
        const paraphrases = Array.isArray(normalized.paraphrases) ? normalized.paraphrases : [];
        const collocations = Array.isArray(normalized.collocationsArray) ? normalized.collocationsArray : [];
        const prepositions = Array.isArray(normalized.prepositionsArray) ? normalized.prepositionsArray : [];

        if (!headword) issues.push(`Missing headword for "${word.word}".`);
        if (!meaningVi) {
            issues.push(`Missing Vietnamese meaning for "${word.word}".`);
        } else if (!looksVietnameseMeaning(meaningVi)) {
            issues.push(`Meaning for "${word.word}" is not clearly Vietnamese-only.`);
        }
        if (!example) issues.push(`Missing example for "${word.word}".`);
        if (!VALID_REGISTERS.has(register)) {
            issues.push(`Invalid register for "${word.word}".`);
        }

        const isSingleWord = headword.split(/\s+/).filter(Boolean).length <= 1;
        const needsDenseDetails = isSingleWord && !PHRASE_LIKE_TYPES.has(type || 'vocabulary');

        if (needsDenseDetails && collocations.length < 1) {
            issues.push(`Collocation cannot be empty for "${word.word}".`);
        }
        if (needsDenseDetails && paraphrases.length < 1) {
            issues.push(`Paraphrases cannot be empty for "${word.word}".`);
        }

        const invalidParaphraseTone = paraphrases.some((item: any) => !VALID_PARAPHRASE_TONES.has(String(item?.tone || '').trim().toLowerCase()));
        if (invalidParaphraseTone) {
            issues.push(`Invalid paraphrase tone found for "${word.word}".`);
        }

        const missingCollocationHint = collocations.some((item: any) => !String(item?.text || '').trim() || !String(item?.d || '').trim());
        if (needsDenseDetails && missingCollocationHint) {
            issues.push(`Collocations for "${word.word}" must include both text and hint.`);
        }
        const collocationWithoutHeadword = collocations.some((item: any) => {
            const text = String(item?.text || '').trim().toLowerCase();
            return !!text && !text.includes(headword.toLowerCase());
        });
        if (needsDenseDetails && collocationWithoutHeadword) {
            issues.push(`Collocations for "${word.word}" must explicitly contain the headword "${headword}". Do not use synonyms instead.`);
        }
        const invalidPrepositionUsage = prepositions.find((item: any) => {
            const prep = String(item?.prep || '').trim().toLowerCase();
            const usage = String(item?.usage || '').trim().toLowerCase();
            if (!prep || !usage) return false;
            return !usage.includes(prep);
        });
        if (invalidPrepositionUsage) {
            issues.push(`Preposition usage for "${word.word}" must contain the preposition "${invalidPrepositionUsage.prep}" inside its context/example.`);
        }
    }

    return issues;
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

    const aggregatedResults: any[] = [];
    let totalAttempts = 0;
    options.onProgress?.({
        stage: 'starting',
        attempt: 0,
        maxAttempts: MAX_REFINE_ATTEMPTS,
        message: `Preparing sequential API refine for ${words.length} selected word(s)...`
    });

    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
        const currentWord = words[wordIndex];
        const basePrompt = getWordDetailsPrompt([currentWord.word], nativeLanguage);
        let lastIssues: string[] = [];
        let lastError: unknown = null;

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

            const retryFeedback = lastIssues.length > 0
                ? `\n\nVALIDATION FAILED ON THE PREVIOUS ATTEMPT FOR "${currentWord.word}". Fix every issue below and regenerate the FULL JSON array for this word only.\n- ${lastIssues.join('\n- ')}\n\nReturn ONLY one strict JSON array in a \`\`\`json code block.\nDo not add explanation text outside the JSON code block.`
                : '\n\nReturn ONLY one strict JSON array in a ```json code block. Do not add explanation text outside the code block.';

            try {
                const { results, rawText } = await requestWordRefineAttempt(
                    `${basePrompt}${retryFeedback}`,
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
                const issues = getValidationIssues(results, [currentWord]);
                if (issues.length === 0) {
                    aggregatedResults.push(...results);
                    await options.onWordValidated?.({
                        word: currentWord,
                        results,
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
                lastIssues = issues;
                options.onProgress?.({
                    stage: 'retrying',
                    attempt,
                    maxAttempts: MAX_REFINE_ATTEMPTS,
                    message: `Word ${wordIndex + 1}/${words.length} "${currentWord.word}": validation failed, retrying...`,
                    rawText,
                    issues
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
    }

    return { results: aggregatedResults, attempts: totalAttempts };
};
