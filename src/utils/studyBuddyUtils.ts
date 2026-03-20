import { detectLanguage } from './audio';
import { getAiStudyContextText } from './context_util';
import { ParaphraseOption, User, WordFamily } from '../app/types';

export interface CambridgePronunciation {
    partOfSpeech?: string | null;
    ipaUs?: string | null;
    ipaUk?: string | null;
    audioUs?: string | null;
    audioUk?: string | null;
}

export type ChatSaveSection = 'example' | 'preposition' | 'collocation' | 'paraphrase' | 'wordFamily';
export type ChatCoachActionKey = 'examples' | 'collocations' | 'paraphrase' | 'wordFamily';

export interface ChatSaveContext {
    actionType?: ChatCoachActionKey;
    targetWord?: string;
    sourceSelection?: string;
}

export interface ParsedPairItem {
    item: string;
    context: string;
    register?: string;
}

export interface ParsedWordFamilyItem {
    word: string;
    note: string;
    bucket: keyof WordFamily;
}

export interface ChatTurn {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    kind?: 'message' | 'status';
    saveContext?: ChatSaveContext;
}

export const AVATAR_DEFINITIONS = {
    woman_teacher: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Woman%20Teacher.png', bg: 'bg-indigo-50' },
    man_teacher: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Man%20Teacher.png', bg: 'bg-blue-50' },
    fox: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png', bg: 'bg-orange-100' },
    koala: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png', bg: 'bg-teal-100' },
    pet: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png', bg: 'bg-pink-100' },
    owl: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png', bg: 'bg-yellow-100' },
    panda: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png', bg: 'bg-emerald-100' },
    unicorn: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png', bg: 'bg-purple-100' },
} as const;

const STUDY_BUDDY_SYSTEM_PROMPT = 'You are StudyBuddy, an IELTS and English learning coach. Give practical, concise help with clear examples. Prefer simple formatting and answer in Vietnamese when the learner writes in Vietnamese.';
const SENTENCE_ENDINGS = new Set(['.', '!', '?', '。', '！', '？']);
const VIETNAMESE_CHAR_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const ENGLISH_CHAR_REGEX = /[a-z]/i;
const SPECIAL_CHUNK_SPLIT_REGEX = /(\s*[()"'“”‘’.,!?;:]+\s*)/g;

export const SAVE_SECTION_LABELS: Record<ChatSaveSection, string> = {
    example: 'Example',
    preposition: 'Preposition',
    collocation: 'Collocation',
    paraphrase: 'Paraphrase',
    wordFamily: 'Word Family'
};

const COACH_ACTION_TO_SAVE_SECTION: Partial<Record<ChatCoachActionKey, ChatSaveSection>> = {
    examples: 'example',
    collocations: 'collocation',
    paraphrase: 'paraphrase',
    wordFamily: 'wordFamily'
};

export function normalizeCambridgePronunciations(items?: CambridgePronunciation[]): CambridgePronunciation[] {
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
                headword: (item as any).headword || null,
                partOfSpeech: pos,
                ipaUs: null,
                ipaUk: null,
                audioUs: null,
                audioUk: null
            } as any);
            order.push(pos);
        }
        const merged: any = byPos.get(pos)!;
        if (!merged.headword && (item as any).headword) merged.headword = (item as any).headword;
        if (!merged.ipaUs && item.ipaUs) merged.ipaUs = item.ipaUs;
        if (!merged.ipaUk && item.ipaUk) merged.ipaUk = item.ipaUk;
        if (!merged.audioUs && item.audioUs) merged.audioUs = item.audioUs;
        if (!merged.audioUk && item.audioUk) merged.audioUk = item.audioUk;
    }

    return order
        .map((pos) => byPos.get(pos)!)
        .filter((p) => p.ipaUs || p.ipaUk || p.audioUs || p.audioUk);
}

export function getAvatarProps(avatarStr: string) {
    if (avatarStr.startsWith('http') || avatarStr.startsWith('data:')) {
        return { url: avatarStr, bg: 'bg-white border-2 border-neutral-100' };
    }
    return (AVATAR_DEFINITIONS as any)[avatarStr] || AVATAR_DEFINITIONS.woman_teacher;
}

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

export function stripMarkdownForSave(text: string): string {
    return text
        .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
        .replace(/```/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\r/g, '')
        .trim();
}

export function normalizeSaveLine(line: string): string {
    return stripMarkdownForSave(line)
        .replace(/^\s*[-*•]+\s*/, '')
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/^\s*>\s*/, '')
        .trim();
}

export function cleanExampleSentence(line: string): string {
    return normalizeSaveLine(line)
        .replace(/^["'`]+/, '')
        .replace(/["'`]+$/, '')
        .trim();
}

export function normalizeParaphraseTone(value?: string): ParaphraseOption['tone'] {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'academic') return 'academic';
    if (normalized === 'casual') return 'casual';
    if (normalized === 'intensified') return 'intensified';
    if (normalized === 'softened') return 'softened';
    return 'synonym';
}

export function extractRegisterFromParaphraseLine(item: string, context: string) {
    const patterns = [
        /\((academic|casual|synonym)\)\s*$/i,
        /\b(academic|casual|synonym)\b\s*$/i,
        /^\((academic|casual|synonym)\)\s*/i,
        /^(academic|casual|synonym)\b[\s-]*/i
    ];

    let nextItem = item.trim();
    let nextContext = context.trim();
    let register: string | undefined;

    for (const pattern of patterns) {
        if (!register) {
            const match = nextItem.match(pattern);
            if (match) {
                register = match[1];
                nextItem = nextItem.replace(pattern, '').trim();
            }
        }
    }

    for (const pattern of patterns) {
        if (!register) {
            const match = nextContext.match(pattern);
            if (match) {
                register = match[1];
                nextContext = nextContext.replace(pattern, '').trim();
            }
        }
    }

    if (!register) {
        const trailingContextMatch = nextContext.match(/[\s,;/-]*\(?\b(academic|casual|synonym)\b\)?\s*$/i);
        if (trailingContextMatch) {
            register = trailingContextMatch[1];
            nextContext = nextContext.replace(/[\s,;/-]*\(?\b(academic|casual|synonym)\b\)?\s*$/i, '').trim();
        }
    }

    return {
        item: nextItem,
        context: nextContext,
        register
    };
}

function detectWordFamilyBucketFromTag(value?: string): keyof WordFamily | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'noun' || normalized === 'nouns' || normalized === 'n') return 'nouns';
    if (normalized === 'verb' || normalized === 'verbs' || normalized === 'v') return 'verbs';
    if (normalized === 'adjective' || normalized === 'adjectives' || normalized === 'adj') return 'adjs';
    if (normalized === 'adverb' || normalized === 'adverbs' || normalized === 'adv') return 'advs';
    return null;
}

export function parseStructuredPairs(text: string): ParsedPairItem[] {
    const lines = stripMarkdownForSave(text).split('\n');
    const items: ParsedPairItem[] = [];

    for (const rawLine of lines) {
        const line = normalizeSaveLine(rawLine);
        if (!line) continue;
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        const left = line.slice(0, colonIndex).trim();
        const context = line.slice(colonIndex + 1).trim();
        const parsed = extractRegisterFromParaphraseLine(left, context);
        if (!parsed.item) continue;
        items.push(parsed);
    }

    return items;
}

function countLikelySentences(text: string): number {
    const cleaned = stripMarkdownForSave(text);
    const matches = cleaned.match(/[.!?](?=\s|$)/g);
    return matches?.length || 0;
}

export function inferWordFamilyBucket(word: string, note: string): keyof WordFamily {
    const combined = `${word} ${note}`.toLowerCase();
    if (/\badverb\b|\badv\b/.test(combined) || /ly$/.test(word.toLowerCase())) return 'advs';
    if (/\badjective\b|\badj\b/.test(combined) || /(ous|ful|less|able|ible|ive|al|ic|ical|ish|ary)$/.test(word.toLowerCase())) return 'adjs';
    if (/\bverb\b/.test(combined) || /(ate|fy|ise|ize|en)$/.test(word.toLowerCase())) return 'verbs';
    return 'nouns';
}

export function parseWordFamilyItems(text: string): ParsedWordFamilyItem[] {
    const lines = stripMarkdownForSave(text).split('\n');
    const items: ParsedWordFamilyItem[] = [];

    for (const rawLine of lines) {
        const line = normalizeSaveLine(rawLine);
        if (!line) continue;
        const colonIndex = line.indexOf(':');
        const dashIndex = line.indexOf(' - ');
        const splitIndex = colonIndex >= 0 ? colonIndex : dashIndex;
        let word = line;
        let note = '';
        let bucketFromTag: keyof WordFamily | null = null;

        if (splitIndex >= 0) {
            word = line.slice(0, splitIndex).trim();
            note = line.slice(splitIndex + (colonIndex >= 0 ? 1 : 3)).trim();
        }

        const tagMatch = word.match(/\(([^()]+)\)\s*$/);
        if (tagMatch) {
            bucketFromTag = detectWordFamilyBucketFromTag(tagMatch[1]);
            word = word.replace(/\(([^()]+)\)\s*$/, '').trim();
        }

        word = word.replace(/\b(noun|verb|adjective|adverb|adj|adv)\b/gi, '').replace(/[()]/g, '').trim();
        if (!word) continue;
        items.push({
            word,
            note,
            bucket: bucketFromTag || inferWordFamilyBucket(word, note)
        });
    }

    return items;
}

export function getSuggestedSaveSections(text: string, context?: ChatSaveContext): ChatSaveSection[] {
    const suggestions: ChatSaveSection[] = [];
    const actionSection = context?.actionType ? COACH_ACTION_TO_SAVE_SECTION[context.actionType] : undefined;
    const parsedPairs = parseStructuredPairs(text);
    const lineCount = stripMarkdownForSave(text).split('\n').map((line) => normalizeSaveLine(line)).filter(Boolean).length;
    const sentenceCount = countLikelySentences(text);

    if (actionSection) suggestions.push(actionSection);
    if ((lineCount > 1 || sentenceCount > 1) && parsedPairs.length === 0) suggestions.push('example');
    if (parsedPairs.length > 0) suggestions.push('collocation', 'paraphrase', 'preposition');
    if ((context?.actionType === 'wordFamily' || lineCount > 1) && parseWordFamilyItems(text).length > 0) suggestions.push('wordFamily');
    if (suggestions.length === 0) suggestions.push('example');

    return Array.from(new Set(suggestions));
}

export function mergeTextBlock(current: string | undefined, incoming: string): string {
    const normalizedIncoming = stripMarkdownForSave(incoming);
    if (!normalizedIncoming) return current || '';
    const normalizedCurrent = stripMarkdownForSave(current || '');
    if (!normalizedCurrent) return normalizedIncoming;
    if (normalizedCurrent.toLowerCase().includes(normalizedIncoming.toLowerCase())) return current || normalizedCurrent;
    return `${current?.trim() || normalizedCurrent}\n${normalizedIncoming}`.trim();
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
