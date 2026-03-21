import { StudyBuddyMemoryChunk } from '../app/types';

export const MAX_STUDY_BUDDY_MEMORY_CHUNKS = 100;
const MEMORY_DIRECTIVE_REGEXES = [
    /\[\s*(?:W_UMEM|W_?MEM|WMEM|W)\s+([\s\S]*?)\s*\]/gi,
    /\[\s*W_[A-Z0-9]+\s+([\s\S]*?)\s*\]/gi,
    /\[\s*W_([^\[\]]+?)\s*\]/gi,
];

function normalizeMemoryText(text: string) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function canonicalizeMemoryText(text: string) {
    const normalized = normalizeMemoryText(text)
        .replace(/^\[\s*|\s*\]$/g, '')
        .replace(/^(?:W_?UMEM|W_?MEM|WMEM|UMEM|MEM|T_W_UMEM)\s*[:\-]?\s*/i, '')
        .replace(/^(?:ghi nhớ|hãy nhớ|remember|note|lưu ý)\s*[:\-]?\s*/i, '')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .trim();

    return normalized;
}

function isMeaningfulMemoryText(text: string) {
    const value = canonicalizeMemoryText(text);
    if (!value) return false;
    if (value.length < 4) return false;
    if (/^(?:umem|w_?umem|w_?mem|wmem|mem)$/i.test(value)) return false;
    if (/^[\W_]+$/i.test(value)) return false;
    if (/^(?:ghi nhớ|hãy nhớ|remember|note|lưu ý)$/i.test(value)) return false;
    return true;
}

function clampName(value: string) {
    return normalizeMemoryText(value)
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .trim();
}

function extractRememberClause(text: string) {
    return normalizeMemoryText(text)
        .replace(/^(rằng|rang|that)\s+/i, '')
        .replace(/^(giúp tôi|giu[p|́] toi|giup minh|giúp mình)\s+/i, '')
        .replace(/^(là|la)\s+/i, '')
        .replace(/[.?!\s]+$/g, '')
        .trim();
}

function addMemoryIfValid(memories: Set<string>, text: string) {
    const clause = canonicalizeMemoryText(extractRememberClause(text));
    if (!clause) return;
    if (!isMeaningfulMemoryText(clause)) return;
    memories.add(clause);
}

export function mergeStudyBuddyMemoryChunks(
    currentChunks: StudyBuddyMemoryChunk[],
    nextTexts: string[],
    source: StudyBuddyMemoryChunk['source'] = 'auto'
) {
    const normalizedExisting = new Set<string>();
    const cleanedCurrent = (currentChunks || []).reduce<StudyBuddyMemoryChunk[]>((acc, chunk) => {
        const text = canonicalizeMemoryText(chunk.text);
        const key = text.toLowerCase();
        if (!isMeaningfulMemoryText(text) || normalizedExisting.has(key)) return acc;
        normalizedExisting.add(key);
        acc.push({ ...chunk, text });
        return acc;
    }, []);

    const additions = nextTexts
        .map((text) => canonicalizeMemoryText(text))
        .filter((text) => isMeaningfulMemoryText(text))
        .filter((text) => {
            const key = text.toLowerCase();
            if (normalizedExisting.has(key)) return false;
            normalizedExisting.add(key);
            return true;
        })
        .map((text) => ({
            id: `sbmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text,
            createdAt: Date.now(),
            source,
        }));

    const merged = [...additions, ...cleanedCurrent].slice(0, MAX_STUDY_BUDDY_MEMORY_CHUNKS);
    return {
        merged,
        additions,
    };
}

export function extractStudyBuddyMemoryTexts(input: string) {
    const source = String(input || '').trim();
    if (!source) return [];

    const memories = new Set<string>();

    const userNamePatterns = [
        /\b(?:toi|tôi|mình|em|anh|chị|my name is|i am|i'm)\s+(?:tên là|la)\s+([^,.;!\n]+)/i,
        /\b(?:my name is|i am|i'm)\s+([^,.;!\n]+)/i,
        /\bgọi tôi là\s+([^,.;!\n]+)/i,
    ];

    const assistantNamePatterns = [
        /\b(?:còn bạn|bạn|ban|you|studybuddy|ai)(?:\s+từ nay)?\s*(?:tên là|la|called|be called|name is)\s+([^,.;!\n]+)/i,
        /\bgọi bạn là\s+([^,.;!\n]+)/i,
    ];

    userNamePatterns.forEach((pattern) => {
        const match = source.match(pattern);
        const name = clampName(match?.[1] || '');
        if (name) {
            memories.add(`User name: ${name}`);
        }
    });

    assistantNamePatterns.forEach((pattern) => {
        const match = source.match(pattern);
        const name = clampName(match?.[1] || '');
        if (name) {
            memories.add(`Assistant name: ${name}`);
        }
    });

    const rememberPatterns = [
        /\b(?:hãy nhớ|hay nho|nhớ rằng|nho rang|hãy luôn nhớ|hay luon nho|từ nay hãy nhớ|tu nay hay nho|từ nay nhớ|tu nay nho|ghi nhớ|ghi nhớ rằng|ghi nho|ghi nho rang|nhớ giúp tôi|nho giup toi|nhớ giùm tôi|nho gium toi|đừng quên|dung quen)\b[:\s,-]*(.+)$/i,
        /\b(?:please remember|remember that|remember|don't forget|do not forget)\b[:\s,-]*(.+)$/i,
    ];

    rememberPatterns.forEach((pattern) => {
        const match = source.match(pattern);
        addMemoryIfValid(memories, match?.[1] || '');
    });

    const quotedMemoryPatterns = [
        /\b(?:hãy nhớ|ghi nhớ|nhớ giúp tôi|đừng quên)\b[^"'“”]*["“]([^"”]+)["”]/i,
        /\b(?:please remember|remember|don't forget)\b[^"'“”]*["“]([^"”]+)["”]/i,
    ];

    quotedMemoryPatterns.forEach((pattern) => {
        const match = source.match(pattern);
        addMemoryIfValid(memories, match?.[1] || '');
    });

    return Array.from(memories);
}

export function parseStudyBuddyMemoryDirectives(input: string) {
    const raw = String(input || '');
    const memories: string[] = [];
    const seen = new Set<string>();

    MEMORY_DIRECTIVE_REGEXES.forEach((regex) => {
        for (const match of raw.matchAll(regex)) {
            const text = canonicalizeMemoryText(match[1] || '');
            const key = text.toLowerCase();
            if (!isMeaningfulMemoryText(text) || seen.has(key)) continue;
            seen.add(key);
            memories.push(text);
        }
    });

    let visibleText = raw;
    MEMORY_DIRECTIVE_REGEXES.forEach((regex) => {
        visibleText = visibleText.replace(regex, '');
    });

    const trailingDirectiveMatch = visibleText.match(/\[W(?:_UMEM|_?MEM|MEM|_[A-Z0-9]+)?(?:\s|_)[^[\]]*$/i);
    if (trailingDirectiveMatch && trailingDirectiveMatch.index !== undefined) {
        visibleText = visibleText.slice(0, trailingDirectiveMatch.index);
    }

    return {
        visibleText: visibleText.replace(/\n{3,}/g, '\n\n').trim(),
        memories
    };
}
