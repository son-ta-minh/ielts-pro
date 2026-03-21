import { User } from '../app/types';
import { detectLanguage } from './audio';
import { getAiStudyContextText } from './context_util';

export type ChatSaveSection = 'example' | 'preposition' | 'collocation' | 'paraphrase' | 'wordFamily';
export type ChatCoachActionKey = 'examples' | 'collocations' | 'paraphrase' | 'wordFamily';

export interface ChatSaveContext {
    actionType?: ChatCoachActionKey;
    targetWord?: string;
    sourceSelection?: string;
}

export interface ChatSearchMatch {
    word: string;
    section: string;
    text: string;
    register?: string;
    context?: string;
    hint?: string;
}

export interface ChatSearchResultMeta {
    moreMatches: ChatSearchMatch[];
}

export interface ChatTurn {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    kind?: 'message' | 'status';
    saveContext?: ChatSaveContext;
    searchResultMeta?: ChatSearchResultMeta;
}

export const SAVE_SECTION_LABELS: Record<ChatSaveSection, string> = {
    example: 'Example',
    preposition: 'Preposition',
    collocation: 'Collocation',
    paraphrase: 'Paraphrase',
    wordFamily: 'Word Family'
};

const STUDY_BUDDY_SYSTEM_PROMPT = 'You are StudyBuddy, an IELTS and English learning coach. Give practical, concise help with clear examples. Prefer simple formatting and answer in Vietnamese when the learner writes in Vietnamese.';
const SENTENCE_ENDINGS = new Set(['.', '!', '?', '。', '！', '？']);
const VIETNAMESE_CHAR_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const ENGLISH_CHAR_REGEX = /[a-z]/i;
const SPECIAL_CHUNK_SPLIT_REGEX = /(\s*[()"'“”‘’.,!?;:]+\s*)/g;

export function buildStudyBuddyMessages(
    user: User,
    isContextAware: boolean,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    extraSystemMessages: string[] = []
) {
    const profileLines = [
        `Learner name: ${user.name || 'Unknown'}`,
        `App level: ${Number.isFinite(user.level) ? user.level : 'Unknown'}`,
        user.currentLevel ? `English level: ${user.currentLevel}` : null,
        user.target ? `Target: ${user.target}` : null,
        user.nativeLanguage ? `Native language: ${user.nativeLanguage}` : null,
        user.role ? `Role: ${user.role}` : null,
        user.note ? `Learner note: ${user.note}` : null
    ].filter(Boolean);

    const contextMessage = (() => {
        if (!isContextAware) {
            return 'Fast mode is active, so no personal study context is attached. If the user asks about their own learning status, recent learned words, hard/forgotten words, or focus words, explicitly tell them to switch the toggle from "Fast mode" to "Context aware".';
        }
        try {
            const contextText = getAiStudyContextText().trim();
            return contextText
                ? `Here is the learner's current study context. Use it when helpful, especially for personalization, revision priorities, deep dives, and choosing examples.\n\n${contextText}`
                : 'No study context is currently available.';
        } catch {
            return 'No study context is currently available.';
        }
    })();

    return [
        { role: 'system' as const, content: STUDY_BUDDY_SYSTEM_PROMPT },
        { role: 'system' as const, content: `Here is the learner profile. Always use it as lightweight personalization context when giving advice, examples, tone, and study guidance.\n\n${profileLines.join('\n')}` },
        { role: 'system' as const, content: contextMessage },
        ...extraSystemMessages.map((content) => ({ role: 'system' as const, content })),
        ...messages
    ];
}

export function createChatTurn(role: ChatTurn['role'], content: string): ChatTurn {
    return {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        kind: 'message',
        content
    };
}

export function getStudyBuddySttLang(draft: string, preferredUiLanguage: 'vi' | 'en'): string {
    const cleanDraft = draft.trim();
    const detected = cleanDraft ? detectLanguage(cleanDraft) : preferredUiLanguage;
    return detected === 'vi' ? 'vi-VN' : 'en-US';
}

export function normalizeConversationTranscript(text: string): string {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

export function shouldForceSubmitConversationTurn(text: string, maxChars: number, maxWords: number): boolean {
    const normalized = normalizeConversationTranscript(text);
    if (!normalized) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return normalized.length >= maxChars || wordCount >= maxWords;
}

export function splitSpeakableSentences(text: string): { sentences: string[]; remainder: string } {
    const sentences: string[] = [];
    let segmentStart = 0;
    let i = 0;

    while (i < text.length) {
        const char = text[i];
        if (SENTENCE_ENDINGS.has(char)) {
            let end = i + 1;
            while (end < text.length && /["')\]]/.test(text[end])) end += 1;
            if (end >= text.length || /\s/.test(text[end])) {
                const sentence = text.slice(segmentStart, end).trim();
                if (sentence) sentences.push(sentence);
                segmentStart = end;
                i = end;
                continue;
            }
        } else if (char === '\n') {
            const sentence = text.slice(segmentStart, i).trim();
            if (sentence) sentences.push(sentence);
            segmentStart = i + 1;
        }
        i += 1;
    }

    return {
        sentences,
        remainder: text.slice(segmentStart).trim()
    };
}

function detectSegmentLanguage(chunk: string): 'vi' | 'en' | null {
    const normalized = chunk.trim();
    if (!normalized) return null;
    if (VIETNAMESE_CHAR_REGEX.test(normalized)) return 'vi';

    const words = normalized.match(/[A-Za-zÀ-ỹĐđ]+(?:['’-][A-Za-zÀ-ỹĐđ]+)*/g) || [];
    if (words.length === 0) return null;

    let englishLikeCount = 0;
    for (const word of words) {
        if (ENGLISH_CHAR_REGEX.test(word)) {
            englishLikeCount += 1;
        }
    }

    const englishRatio = englishLikeCount / words.length;
    if (englishRatio >= 0.6) return 'en';
    if (englishLikeCount > 0) return 'vi';
    return null;
}

export function splitMixedLanguageSegments(text: string): Array<{ lang: 'vi' | 'en'; text: string }> {
    const normalized = text
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return [];

    const tokens = normalized
        .split(SPECIAL_CHUNK_SPLIT_REGEX)
        .map((part) => part.trim())
        .filter(Boolean);
    const segments: Array<{ lang: 'vi' | 'en'; text: string }> = [];
    let activeLang: 'vi' | 'en' | null = null;
    let buffer = '';
    let pendingDelimiter = '';

    const flush = () => {
        const clean = buffer.trim();
        if (activeLang && clean) {
            segments.push({ lang: activeLang, text: clean });
        }
        buffer = '';
        activeLang = null;
    };

    for (const token of tokens) {
        const tokenLang = detectSegmentLanguage(token);

        if (!tokenLang) {
            if (activeLang) {
                buffer += `${buffer ? ' ' : ''}${token}`;
            } else {
                pendingDelimiter += `${pendingDelimiter ? ' ' : ''}${token}`;
            }
            continue;
        }

        if (!activeLang) {
            activeLang = tokenLang;
            buffer = `${pendingDelimiter}${pendingDelimiter ? ' ' : ''}${token}`.trim();
            pendingDelimiter = '';
            continue;
        }

        if (tokenLang === activeLang) {
            buffer += `${buffer ? ' ' : ''}${token}`;
            continue;
        }

        flush();
        activeLang = tokenLang;
        buffer = `${pendingDelimiter}${pendingDelimiter ? ' ' : ''}${token}`.trim();
        pendingDelimiter = '';
    }

    if (pendingDelimiter && activeLang) {
        buffer += `${buffer ? ' ' : ''}${pendingDelimiter}`;
    }
    flush();

    return segments.length > 0
        ? segments
        : [{ lang: detectLanguage(normalized), text: normalized }];
}
