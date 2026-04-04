import { StudyBuddyMemoryChunk, User, VocabularyItem, WordFamily } from '../app/types';
import { getAllWords } from '../app/dataStore';
import { detectLanguage } from './audio';
import { getAiStudyContextText } from './context_util';

export type ChatSaveSection = 'example' | 'preposition' | 'collocation' | 'paraphrase' | 'wordFamily' | 'idiom' | 'userNote';
export type ChatSaveActionType = 'examples' | 'collocations' | 'paraphrase' | 'wordFamily' | 'preposition' | 'idioms' | 'compare';
export type ChatCoachActionKey = ChatSaveActionType | 'test' | 'explain' | 'image' | 'infographic' | 'preposition' | 'idioms' | 'compare';
export type StudyBuddyTargetSection = 'coreUsage' | 'collocation' | 'wordFamily' | 'idiom' | 'paraphrase' | 'example' | 'preposition' | 'verifyData';

export interface StudyBuddyChatTarget {
    word: VocabularyItem;
    section: StudyBuddyTargetSection;
    source?: string;
}

export interface ChatSaveContext {
    actionType?: ChatSaveActionType;
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
    imageProgress?: number;
    saveContext?: ChatSaveContext;
    searchResultMeta?: ChatSearchResultMeta;
    hasMemoryWrite?: boolean;
    suppressTargetFollowUp?: boolean;
}

export const STUDY_BUDDY_TARGET_LABELS: Record<StudyBuddyTargetSection, string> = {
    coreUsage: 'Core Usage',
    collocation: 'Collocation',
    wordFamily: 'Word Family',
    idiom: 'Idiom',
    paraphrase: 'Paraphrase',
    example: 'Example',
    preposition: 'Dependent Preposition',
    verifyData: 'Verify Word Data'
};

export const SAVE_SECTION_LABELS: Record<ChatSaveSection, string> = {
    example: 'Example',
    preposition: 'Preposition',
    collocation: 'Collocation',
    paraphrase: 'Paraphrase',
    wordFamily: 'Word Family',
    idiom: 'Idiom',
    userNote: 'User Note'
};

const STUDY_BUDDY_SYSTEM_PROMPT = 'You are StudyBuddy, an IELTS and English learning coach. Give practical, concise help with clear examples. Prefer simple formatting and answer in Vietnamese when the learner writes in Vietnamese. You are allowed to remember durable user preferences or identity details through hidden memory directives when the app asks you to do so. Do not claim that you cannot store memory unless the user asks for something unsafe. Use learner profile and long-term memory quietly as background context. Do not spontaneously mention or summarize the learner profile, personal details, goals, role, or memory unless the user asks, the task directly depends on it, or a brief reference is genuinely helpful.';
const SENTENCE_ENDINGS = new Set(['.', '!', '?', '。', '！', '？']);
const VIETNAMESE_CHAR_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const ENGLISH_CHAR_REGEX = /[a-z]/i;
const SPECIAL_CHUNK_SPLIT_REGEX = /(\s*[()"'“”‘’.,!?;:]+\s*)/g;

export function buildStudyBuddyMessages(
    user: User,
    isContextAware: boolean,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    extraSystemMessages: string[] = [],
    memoryChunks: StudyBuddyMemoryChunk[] = [],
    coachIdentity?: {
        name?: string;
        persona?: string;
    },
    options?: {
        includeStudyContext?: boolean;
    }
) {
    const profileLines = [
        `Learner name: ${user.name || 'Unknown'}`,
        `App level: ${Number.isFinite(user.level) ? user.level : 'Unknown'}`,
        user.currentLevel ? `English level: ${user.currentLevel}` : null,
        user.target ? `Target: ${user.target}` : null,
        user.nativeLanguage ? `Native language: ${user.nativeLanguage}` : null,
        user.role ? `Role: ${user.role}` : null
    ].filter(Boolean);

    const lessonPreferenceLines = [
        user.lessonPreferences?.language ? `Preferred lesson language: ${user.lessonPreferences.language}` : null,
        user.lessonPreferences?.targetAudience ? `Preferred lesson audience: ${user.lessonPreferences.targetAudience}` : null,
        user.lessonPreferences?.tone ? `Preferred lesson tone: ${user.lessonPreferences.tone}` : null,
    ].filter(Boolean);

    const contextMessage = (() => {
        if (options?.includeStudyContext === false) {
            return 'Study context injection is disabled for this request. Use only the explicitly provided target record and instructions.';
        }
        if (!isContextAware) {
            return 'Fast mode is active, so no study context from the learner\'s Word Library is attached. This only affects library/context-aware study data. It does not disable long-term chat memory. If the user asks about their own learning status, recent learned words, hard/forgotten words, or focus words from the library, explicitly tell them to switch the toggle from "Fast mode" to "Context aware".';
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
        ...(coachIdentity?.name || coachIdentity?.persona
            ? [{
                role: 'system' as const,
                content: `Coach identity for this chat. Stay consistent with it in tone and self-reference.\n\nCoach name: ${coachIdentity?.name || 'StudyBuddy'}\nCoach persona: ${coachIdentity?.persona || 'general coach'}`
            }]
            : []),
        { role: 'system' as const, content: `Here is the learner profile. Use it only as quiet background personalization context for advice, examples, tone, and study guidance. Do not proactively mention, list, or restate this profile unless the user asks for it or it is directly relevant to the current reply.\n\n${profileLines.join('\n')}` },
        ...(lessonPreferenceLines.length > 0
            ? [{
                role: 'system' as const,
                content: `Here are the learner's lesson preferences. Follow them when giving explanations, examples, mini-lessons, and generated practice unless the user asks otherwise.\n\n${lessonPreferenceLines.join('\n')}`
            }]
            : []),
        { role: 'system' as const, content: contextMessage },
        ...(memoryChunks.length > 0
            ? [{
                role: 'system' as const,
                content: `Long-term memory about the learner and this assistant. Use it quietly when relevant, but do not proactively mention, quote, or summarize it unless the user asks or it is directly helpful for the current reply.\n\n${memoryChunks
                    .slice(0, 100)
                    .map((chunk, index) => `${index + 1}. ${chunk.text}`)
                    .join('\n')}`
            }]
            : []),
        ...extraSystemMessages.map((content) => ({ role: 'system' as const, content })),
        ...messages
    ];
}

function formatWordFamilySection(wordFamily?: WordFamily | null) {
    if (!wordFamily) return '';
    return [
        ...(wordFamily.nouns || []).filter((item) => !item.isIgnored).map((item) => `- noun: ${item.word}`),
        ...(wordFamily.verbs || []).filter((item) => !item.isIgnored).map((item) => `- verb: ${item.word}`),
        ...(wordFamily.adjs || []).filter((item) => !item.isIgnored).map((item) => `- adjective: ${item.word}`),
        ...(wordFamily.advs || []).filter((item) => !item.isIgnored).map((item) => `- adverb: ${item.word}`),
    ].join('\n');
}

function getAllAppGroupsForWord(word: VocabularyItem) {
    return Array.from(
        new Set(
            getAllWords()
                .filter((item) => item.userId === word.userId)
                .flatMap((item) => item.groups || [])
                .map((group) => String(group || '').trim())
                .filter(Boolean)
        )
    ).sort((left, right) => left.localeCompare(right));
}

export function buildStudyBuddyTargetRecord(word: VocabularyItem) {
    return [
        `Word: ${word.word}`,
        word.meaning ? `Meaning (English): ${word.meaning}` : '',
        word.meaningVi ? `Meaning (Vietnamese): ${word.meaningVi}` : '',
        word.register ? `Register: ${word.register}` : '',
        word.type ? `Word type: ${word.type}` : '',
        word.note ? `Private note:\n${word.note}` : '',
        word.example ? `Examples:\n${word.example}` : '',
        word.prepositions?.length
            ? `Prepositions:\n${word.prepositions
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.prep}${item.usage ? `: ${item.usage}` : ''}`)
                .join('\n')}`
            : '',
        word.collocationsArray?.length
            ? `Collocations:\n${word.collocationsArray
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.text}${item.d ? `: ${item.d}` : ''}`)
                .join('\n')}`
            : '',
        word.idiomsList?.length
            ? `Idioms:\n${word.idiomsList
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.text}${item.d ? `: ${item.d}` : ''}`)
                .join('\n')}`
            : '',
        word.paraphrases?.length
            ? `Paraphrases:\n${word.paraphrases
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.word}${item.context ? `: ${item.context}` : ''}${item.tone ? ` [${item.tone}]` : ''}`)
                .join('\n')}`
            : '',
        formatWordFamilySection(word.wordFamily)
            ? `Word family:\n${formatWordFamilySection(word.wordFamily)}`
            : '',
    ].filter(Boolean).join('\n\n');
}

export function buildStudyBuddyVerifyRecord(word: VocabularyItem) {
    const currentGroups = (word.groups || []).map((group) => String(group || '').trim()).filter(Boolean);
    const allAppGroups = getAllAppGroupsForWord(word);
    return [
        `Word: ${word.word}`,
        word.meaningVi ? `Meaning (Vietnamese): ${word.meaningVi}` : '',
        word.register ? `Register: ${word.register}` : '',
        currentGroups.length ? `Current groups:\n${currentGroups.map((group) => `- ${group}`).join('\n')}` : 'Current groups: none',
        allAppGroups.length ? `All app groups:\n${allAppGroups.map((group) => `- ${group}`).join('\n')}` : '',
        word.note ? `Private note:\n${word.note}` : '',
        word.prepositions?.length
            ? `Prepositions:\n${word.prepositions
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.prep}${item.usage ? `: ${item.usage}` : ''}`)
                .join('\n')}`
            : '',
        word.collocationsArray?.length
            ? `Collocations:\n${word.collocationsArray
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.text}`)
                .join('\n')}`
            : '',
        word.idiomsList?.length
            ? `Idioms:\n${word.idiomsList
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.text}`)
                .join('\n')}`
            : '',
        word.paraphrases?.length
            ? `Paraphrases:\n${word.paraphrases
                .filter((item) => !item.isIgnored)
                .map((item) => `- ${item.word}`)
                .join('\n')}`
            : '',
        formatWordFamilySection(word.wordFamily)
            ? `Word family:\n${formatWordFamilySection(word.wordFamily)}`
            : '',
    ].filter(Boolean).join('\n\n');
}

export function buildStudyBuddyTargetSystemMessage(target: StudyBuddyChatTarget) {
    const record = target.section === 'verifyData'
        ? buildStudyBuddyVerifyRecord(target.word)
        : buildStudyBuddyTargetRecord(target.word);

    return [
        `Current target word for this chat: ${target.word.word}`,
        `Current focus section: ${STUDY_BUDDY_TARGET_LABELS[target.section]}`,
        target.source ? `User opened AI from: ${target.source}` : '',
        '',
        'Use the vocabulary record below as persistent context for this target word until the target changes or is cleared.',
        '',
        record
    ].filter(Boolean).join('\n');
}

export function buildStudyBuddyTargetPrompt(target: StudyBuddyChatTarget) {
    const headword = target.word.word;
    const record = target.section === 'verifyData'
        ? buildStudyBuddyVerifyRecord(target.word)
        : buildStudyBuddyTargetRecord(target.word);

    switch (target.section) {
        case 'coreUsage':
            return `Explain the core usage of "${headword}" for the learner.

Focus on:
- meaning and nuance
- core usage patterns
- common prepositions or grammar patterns if available
- one or two practical examples
- short caution notes if any saved data sounds unnatural, too narrow, or misleading

Prefer Vietnamese if helpful, but keep English examples natural.

Vocabulary record:
${record}`;
        case 'collocation':
            return `Explain the collocations of "${headword}" in a practical learning way.

Rules:
- explain which collocations are common, limited, awkward, or unnatural if needed
- give short usage guidance
- keep the answer concise but useful

Vocabulary record:
${record}`;
        case 'wordFamily':
            return `Explain the word family of "${headword}" for the learner.

Rules:
- clarify how each form changes meaning or usage
- point out the most useful members first
- mention awkward or doubtful items if any

Vocabulary record:
${record}`;
        case 'idiom':
            return `Explain the idioms or fixed expressions related to "${headword}".

Rules:
- say clearly if an item is not really a natural idiom
- explain usage limits and tone

Vocabulary record:
${record}`;
        case 'paraphrase':
            return `Explain the paraphrases of "${headword}" for the learner.

Rules:
- compare nuance and register
- warn clearly if a paraphrase is awkward, too broad, too narrow, or misleading

Vocabulary record:
${record}`;
        case 'preposition':
            return `Explain the dependent prepositions or preposition patterns of "${headword}" for the learner.

Rules:
- focus on which prepositions are natural and common
- explain usage limits briefly
- warn clearly if any saved pattern sounds awkward or misleading

Vocabulary record:
${record}`;
        case 'example':
            return `Teach "${headword}" through its examples.

Rules:
- explain what each example shows
- point out pattern, tone, and common usage
- if any example sounds unnatural or weak, say so briefly

Vocabulary record:
${record}`;
        case 'verifyData':
            return `Audit the saved vocabulary data for "${headword}" and report only what should be improved.

Strict output rules:
- Do not write any intro, outro, praise, summary, or confirmation that items are correct
- Report only problems, doubtful items, awkward items, misleading items, or low-value items
- If there are no issues worth fixing, reply exactly: No critical data issues found.
- Keep each point concrete and action-oriented

What to verify:
- whether the main register is accurate. The app only support to choose one of Academic, Casual, Neutral (meaning both Academic and Casual are fine). You don't need to suggest me, you only tell me whether the Register is accurate or not based on the meaning, usage, and examples of the word. If the register is inaccurate, just say "Register issue -> the correct register should be [the correct register]".
- whether collocations are natural, common enough, and worth learning. Only verify collection text, and skip the descriptive text ("d").
- whether paraphrases are natural and truly usable paraphrases for this headword
- whether each paraphrase register is accurate
- whether the current groups fit this word well
- whether this word is missing one or more useful groups from the available app groups
- whether any item is too broad, too narrow, misleading, duplicate, or unnecessary for study
- whether any item should be ignored or removed

IMPORTANT:
- Register "Neutral" in this app content means "can be used in both academic and casual depend on context."
- Don't forget to feedback for "Group" field, which is important for the learner's organization and review. If the word is currently in groups that don't fit well, point it out. If there are useful groups that the word is missing from, mention them.

Preferred format:
- [Field] issue -> suggested fix
- [Groups] weak/missing grouping -> suggested app group(s)

Vocabulary record:
${record}`;
        default:
            return `Help the learner with "${headword}" using the vocabulary record below.\n\n${record}`;
    }
}

export function buildStudyBuddyTargetFollowUpMarkdown() {
    return `[FOLLOWUP:coreUsage|Core] [FOLLOWUP:collocation|Collo] [FOLLOWUP:wordFamily|Family] [FOLLOWUP:preposition|Prep] [FOLLOWUP:idiom|Idiom] [FOLLOWUP:paraphrase|Para] [FOLLOWUP:example|Example] [FOLLOWUP:verifyData|Verify]`;
}

export function formatStudyBuddyTargetAssistantPreview(content: string, target: StudyBuddyChatTarget | null) {
    void target;
    return content.trim();
}

export function formatStudyBuddyTargetAssistantFinal(content: string, target: StudyBuddyChatTarget | null) {
    const preview = formatStudyBuddyTargetAssistantPreview(content, target);
    if (!target) return preview;
    return `${preview}\n${buildStudyBuddyTargetFollowUpMarkdown()}`;
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
