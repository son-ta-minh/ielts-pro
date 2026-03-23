import { ParaphraseOption, WordFamily } from '../app/types';
import { ChatCoachActionKey, ChatSaveContext, ChatSaveSection } from './studyBuddyChatUtils';

export interface CambridgePronunciation {
    partOfSpeech?: string | null;
    ipaUs?: string | null;
    ipaUk?: string | null;
    audioUs?: string | null;
    audioUk?: string | null;
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

export function extractCompareTargetCandidates(text: string): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();

    const push = (value?: string) => {
        const cleaned = stripMarkdownForSave(String(value || ''))
            .replace(/\|/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!cleaned) return;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(cleaned);
    };

    const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
    const tableLines = lines.filter((line) => line.includes('|'));

    if (tableLines.length >= 2) {
        tableLines.slice(2).forEach((line) => {
            const cells = line
                .split('|')
                .map((cell) => stripMarkdownForSave(cell).trim())
                .filter(Boolean);
            if (cells.length > 0) push(cells[0]);
        });
    }

    if (candidates.length === 0) {
        const boldMatches = Array.from(String(text || '').matchAll(/\*\*([^*]+)\*\*/g));
        boldMatches.forEach((match) => push(match[1]));
    }

    if (candidates.length === 0) {
        lines.forEach((line) => {
            const normalized = normalizeSaveLine(line);
            if (!normalized) return;
            const splitMatch = normalized.split(/:| - /).map((part) => part.trim()).filter(Boolean);
            if (splitMatch.length > 0) push(splitMatch[0]);
        });
    }

    return candidates.slice(0, 8);
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

const COACH_ACTION_TO_SAVE_SECTION: Partial<Record<ChatCoachActionKey, ChatSaveSection>> = {
    examples: 'example',
    collocations: 'collocation',
    paraphrase: 'paraphrase',
    wordFamily: 'wordFamily',
    preposition: 'preposition',
    idioms: 'idiom',
    compare: 'userNote'
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

export function stripMarkdownForSave(text: string): string {
    return text
        .replace(/\s*\[FOLLOWUP:\s*[^|\]]+\|[^\]]+\]/gi, '')
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
