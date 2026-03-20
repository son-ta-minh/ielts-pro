
import React, { useState, useEffect, useRef } from 'react';
import { User, AppView, WordQuality, VocabularyItem, CollocationDetail, ParaphraseOption, PrepositionPattern, WordFamily } from '../../app/types';
import { Bot, NotebookPen, ListCollapse, BringToFront, Blocks, X, MessageSquare, Languages, Volume2, Mic, Binary, Loader2, Plus, Eye, Search, Wrench, Pause, Play, Square, PenTool, Star, Sparkles, Send, StopCircle, Save } from 'lucide-react';
import { getConfig, SystemConfig, getServerUrl, getStudyBuddyAiUrl } from '../../app/settingsManager';
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking, getIsSpeaking, getIsAudioPaused, getIsSingleWordPlayback, getPlaybackRate, setPlaybackRate, getAudioProgress, seekAudio, getMarkPoints, detectLanguage, prefetchSpeech } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { SimpleMimicModal } from './SimpleMimicModal';
import * as dataStore from '../../app/dataStore';
import { createNewWord, calculateComplexity, calculateMasteryScore } from '../../utils/srs';
import { lookupWordsInGlobalLibrary } from '../../services/backupService';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { ToolsModal } from '../tools/ToolsModal';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import ReactMarkdown from 'react-markdown';
import { getAiStudyContextText } from '../../utils/context_util';
import { autoRefineNewWords } from '../../services/wordRefinePersistence';

const MAX_READ_LENGTH = 1000;
const MAX_MIMIC_LENGTH = 1600;
const CHAT_AUDIO_PREFETCH_AHEAD = 2;
const STUDY_BUDDY_AI_REQUEST_CONFIG = {
    temperature: 0.2,
    top_p: 0.85,
    repetition_penalty: 1.15
} as const;

interface Props {
    user: User;
    stats: { due: number; new: number; total: number; };
    currentView: AppView;
    lastBackupTime: number | null;
    onNavigate: (view: string, params?: any) => void;
    onViewWord?: (word: VocabularyItem, tab?: string) => void;
    isAnyModalOpen?: boolean;
}

interface Message {
    text?: string;
    texts?: string[];
    action?: string;
    actionLabel?: string;
    actionUrl?: string;
    cambridge?: {
        word?: string;
        pronunciations?: CambridgePronunciation[];
    };
    icon?: React.ReactNode;
}

interface CambridgePronunciation {
    partOfSpeech?: string | null;
    ipaUs?: string | null;
    ipaUk?: string | null;
    audioUs?: string | null;
    audioUk?: string | null;
}


interface CambridgeSimpleResult {
    exists: boolean;
    url?: string;
    word?: string;
    pronunciations?: CambridgePronunciation[];
}

interface ChatTurn {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    saveContext?: ChatSaveContext;
}

type ChatSaveSection = 'example' | 'preposition' | 'collocation' | 'paraphrase' | 'wordFamily';
type ChatCoachActionKey = 'examples' | 'collocations' | 'paraphrase' | 'wordFamily';

interface ChatSaveContext {
    actionType?: ChatCoachActionKey;
    targetWord?: string;
    sourceSelection?: string;
}

interface ParsedPairItem {
    item: string;
    context: string;
    register?: string;
}

interface ParsedWordFamilyItem {
    word: string;
    note: string;
    bucket: keyof WordFamily;
}

interface ChatSaveDraft {
    turnId: string;
    sourceText: string;
    targetWord: string;
    suggestedSections: ChatSaveSection[];
    selectedSection: ChatSaveSection;
    parsedPairs: ParsedPairItem[];
    parsedWordFamily: ParsedWordFamilyItem[];
}

interface ChatSpeechChunk {
    lang: 'vi' | 'en';
    text: string;
    preloadedBlob?: Blob | null;
    prefetchPromise?: Promise<Blob | null> | null;
}

// External helper to show any message in StudyBuddy
export const showStudyBuddyMessage = (text: string, iconType: 'example' | 'info' = 'info') => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-show-message', {
            detail: { text, iconType }
        })
    );
};

export const requestStudyBuddyChatResponse = (prompt: string) => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-chat-request', {
            detail: { prompt }
        })
    );
};

export const pushStudyBuddyAssistantMessage = (content: string) => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-chat-response', {
            detail: { content }
        })
    );
};

export const startStudyBuddyAssistantStream = (requestId: string) => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-chat-stream-start', {
            detail: { requestId }
        })
    );
};

export const appendStudyBuddyAssistantStream = (requestId: string, delta: string) => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-chat-stream-delta', {
            detail: { requestId, delta }
        })
    );
};

export const finishStudyBuddyAssistantStream = (requestId: string) => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-chat-stream-end', {
            detail: { requestId }
        })
    );
};

export const failStudyBuddyAssistantStream = (requestId: string, message: string) => {
    window.dispatchEvent(
        new CustomEvent('studybuddy-chat-stream-error', {
            detail: { requestId, message }
        })
    );
};

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
};

const AVATAR_DEFINITIONS = {
    woman_teacher: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Woman%20Teacher.png', bg: 'bg-indigo-50' },
    man_teacher: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Man%20Teacher.png', bg: 'bg-blue-50' },
    fox: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png', bg: 'bg-orange-100' },
    koala: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png', bg: 'bg-teal-100' },
    pet: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png', bg: 'bg-pink-100' },
    owl: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png', bg: 'bg-yellow-100' },
    panda: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png', bg: 'bg-emerald-100' },
    unicorn: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png', bg: 'bg-purple-100' },
};

const STUDY_BUDDY_SYSTEM_PROMPT = 'You are StudyBuddy, an IELTS and English learning coach. Give practical, concise help with clear examples. Prefer simple formatting and answer in Vietnamese when the learner writes in Vietnamese.';

const getStudyBuddyUserProfileMessage = (user: User): string => {
    const profileLines = [
        `Learner name: ${user.name || 'Unknown'}`,
        `App level: ${Number.isFinite(user.level) ? user.level : 'Unknown'}`,
        user.currentLevel ? `English level: ${user.currentLevel}` : null,
        user.target ? `Target: ${user.target}` : null,
        user.nativeLanguage ? `Native language: ${user.nativeLanguage}` : null,
        user.role ? `Role: ${user.role}` : null,
        user.note ? `Learner note: ${user.note}` : null
    ].filter(Boolean);

    return `Here is the learner profile. Always use it as lightweight personalization context when giving advice, examples, tone, and study guidance.\n\n${profileLines.join('\n')}`;
};

const getStudyBuddyContextMessage = (isContextAware: boolean): string => {
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
};

const buildStudyBuddyMessages = (
    user: User,
    isContextAware: boolean,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
) => ([
    { role: 'system' as const, content: STUDY_BUDDY_SYSTEM_PROMPT },
    { role: 'system' as const, content: getStudyBuddyUserProfileMessage(user) },
    { role: 'system' as const, content: getStudyBuddyContextMessage(isContextAware) },
    ...messages
]);

const createChatTurn = (role: ChatTurn['role'], content: string): ChatTurn => ({
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content
});

const getStudyBuddySttLang = (draft: string, preferredUiLanguage: 'vi' | 'en'): string => {
    const cleanDraft = draft.trim();
    const detected = cleanDraft ? detectLanguage(cleanDraft) : preferredUiLanguage;
    return detected === 'vi' ? 'vi-VN' : 'en-US';
};

const SENTENCE_ENDINGS = new Set(['.', '!', '?', '。', '！', '？']);
const SAVE_SECTION_LABELS: Record<ChatSaveSection, string> = {
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

const stripMarkdownForSave = (text: string): string =>
    text
        .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
        .replace(/```/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\r/g, '')
        .trim();

const normalizeSaveLine = (line: string): string =>
    stripMarkdownForSave(line)
        .replace(/^\s*[-*•]+\s*/, '')
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/^\s*>\s*/, '')
        .trim();

const cleanExampleSentence = (line: string): string =>
    normalizeSaveLine(line)
        .replace(/^["'`]+/, '')
        .replace(/["'`]+$/, '')
        .trim();

const normalizeParaphraseTone = (value?: string): ParaphraseOption['tone'] => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'academic') return 'academic';
    if (normalized === 'casual') return 'casual';
    if (normalized === 'intensified') return 'intensified';
    if (normalized === 'softened') return 'softened';
    return 'synonym';
};

const extractRegisterFromParaphraseLine = (item: string, context: string): {
    item: string;
    context: string;
    register?: string;
} => {
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
};

const detectWordFamilyBucketFromTag = (value?: string): keyof WordFamily | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'noun' || normalized === 'nouns' || normalized === 'n') return 'nouns';
    if (normalized === 'verb' || normalized === 'verbs' || normalized === 'v') return 'verbs';
    if (normalized === 'adjective' || normalized === 'adjectives' || normalized === 'adj') return 'adjs';
    if (normalized === 'adverb' || normalized === 'adverbs' || normalized === 'adv') return 'advs';
    return null;
};

const parseStructuredPairs = (text: string): ParsedPairItem[] => {
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
};

const countLikelySentences = (text: string): number => {
    const cleaned = stripMarkdownForSave(text);
    const matches = cleaned.match(/[.!?](?=\s|$)/g);
    return matches?.length || 0;
};

const inferWordFamilyBucket = (word: string, note: string): keyof WordFamily => {
    const combined = `${word} ${note}`.toLowerCase();
    if (/\badverb\b|\badv\b/.test(combined) || /ly$/.test(word.toLowerCase())) return 'advs';
    if (/\badjective\b|\badj\b/.test(combined) || /(ous|ful|less|able|ible|ive|al|ic|ical|ish|ary)$/.test(word.toLowerCase())) return 'adjs';
    if (/\bverb\b/.test(combined) || /(ate|fy|ise|ize|en)$/.test(word.toLowerCase())) return 'verbs';
    return 'nouns';
};

const parseWordFamilyItems = (text: string): ParsedWordFamilyItem[] => {
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
};

const getSuggestedSaveSections = (text: string, context?: ChatSaveContext): ChatSaveSection[] => {
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
};

const mergeTextBlock = (current: string | undefined, incoming: string): string => {
    const normalizedIncoming = stripMarkdownForSave(incoming);
    if (!normalizedIncoming) return current || '';
    const normalizedCurrent = stripMarkdownForSave(current || '');
    if (!normalizedCurrent) return normalizedIncoming;
    if (normalizedCurrent.toLowerCase().includes(normalizedIncoming.toLowerCase())) return current || normalizedCurrent;
    return `${current?.trim() || normalizedCurrent}\n${normalizedIncoming}`.trim();
};

const splitSpeakableSentences = (text: string): { sentences: string[]; remainder: string } => {
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
};

const VIETNAMESE_CHAR_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const ENGLISH_CHAR_REGEX = /[a-z]/i;
const SPECIAL_CHUNK_SPLIT_REGEX = /(\s*[()"'“”‘’.,!?;:]+\s*)/g;

const detectSegmentLanguage = (chunk: string): 'vi' | 'en' | null => {
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
};

const splitMixedLanguageSegments = (text: string): Array<{ lang: 'vi' | 'en'; text: string }> => {
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
};

const ChatHistoryList = React.memo(({
    chatHistory,
    isChatLoading,
    onOpenSaveModal,
    hasChatSelection,
}: {
    chatHistory: ChatTurn[];
    isChatLoading: boolean;
    onOpenSaveModal: (turn: ChatTurn) => void;
    hasChatSelection: boolean;
}) => (
    <>
        {chatHistory.map((turn) => (
            <div key={turn.id} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative max-w-[85%] rounded-[1.4rem] px-4 py-3 text-sm shadow-sm ${
                    turn.role === 'user'
                        ? 'bg-white border border-neutral-200 text-neutral-900 rounded-br-md'
                        : 'bg-white border border-neutral-200 text-neutral-900 rounded-bl-md'
                }`}>
                    {turn.role === 'assistant' && !!turn.content.trim() && (hasChatSelection || !!turn.saveContext?.targetWord) && (
                        <button
                            type="button"
                            onClick={() => onOpenSaveModal(turn)}
                            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-900"
                            title="Save this response into a word"
                        >
                            <Save size={11} />
                            Save
                        </button>
                    )}
                    {turn.role === 'assistant' && turn.saveContext?.targetWord && (
                        <div className="mb-2 flex items-center gap-2 pr-20">
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700">
                                Target: {turn.saveContext.targetWord}
                            </span>
                        </div>
                    )}
                    <div className={`leading-relaxed break-words select-text text-neutral-900 ${turn.role === 'assistant' ? 'pr-20 [&_code]:bg-neutral-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md' : ''}`}>
                        <ReactMarkdown
                            components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
                                ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>,
                                ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                h1: ({ children }) => <h1 className="mb-2 text-base font-black tracking-tight">{children}</h1>,
                                h2: ({ children }) => <h2 className="mb-2 text-[15px] font-black tracking-tight">{children}</h2>,
                                h3: ({ children }) => <h3 className="mb-2 text-sm font-black tracking-tight">{children}</h3>,
                                blockquote: ({ children }) => (
                                    <blockquote className="mb-2 border-l-4 border-neutral-300 bg-neutral-50/80 px-3 py-2 italic text-neutral-600 last:mb-0">
                                        {children}
                                    </blockquote>
                                ),
                                a: ({ href, children }) => (
                                    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline underline-offset-2">
                                        {children}
                                    </a>
                                ),
                                table: ({ children }) => (
                                    <div className="mb-2 overflow-x-auto rounded-2xl border border-neutral-200 last:mb-0">
                                        <table className="min-w-full border-collapse text-left text-xs">{children}</table>
                                    </div>
                                ),
                                thead: ({ children }) => <thead className="bg-neutral-100 text-neutral-700">{children}</thead>,
                                th: ({ children }) => <th className="border-b border-neutral-200 px-3 py-2 font-black">{children}</th>,
                                td: ({ children }) => <td className="border-b border-neutral-100 px-3 py-2 align-top">{children}</td>,
                                code: ({ inline, className, children, ...props }: any) => {
                                    const rawCode = String(children).replace(/\n$/, '');
                                    const language = className?.replace('language-', '') || '';
                                    if (inline) {
                                        return (
                                            <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.92em] text-rose-700" {...props}>
                                                {children}
                                            </code>
                                        );
                                    }
                                    return (
                                        <div className="mb-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 last:mb-0">
                                            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                                                <span>{language || 'code'}</span>
                                            </div>
                                            <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-6">
                                                <code className={className} {...props}>{rawCode}</code>
                                            </pre>
                                        </div>
                                    );
                                },
                            }}
                        >
                            {turn.content || (turn.role === 'assistant' && isChatLoading ? '...' : '')}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
        ))}
    </>
));

export const StudyBuddy: React.FC<Props> = ({ user, onViewWord, isAnyModalOpen }) => {
    const { showToast } = useToast();
    const [config, setConfig] = useState<SystemConfig>(getConfig());
    const [isAudioPlaying, setIsAudioPlaying] = useState(getIsSpeaking());
    const [isAudioPaused, setIsAudioPaused] = useState(getIsAudioPaused());
    const [isSingleWordAudio, setIsSingleWordAudio] = useState(getIsSingleWordPlayback());
    const [showPlaybackControls, setShowPlaybackControls] = useState(false);
    const [playbackRate, setPlaybackRateState] = useState(getPlaybackRate());
    const [audioProgress, setAudioProgress] = useState({ currentTime: 0, duration: 0 });
    const [markPoints, setMarkPoints] = useState<number[]>([]);
    const [markedTime, setMarkedTime] = useState<number>(0);
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);
    const [messageIndex, setMessageIndex] = useState(0);
    const [isThinking, setIsThinking] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
        createChatTurn('assistant', 'Xin chào. Tôi có thể trả lời bất cứ thứ gì về tiếng Anh')    ]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isChatAudioEnabled, setIsChatAudioEnabled] = useState(false);
    const [isContextAware, setIsContextAware] = useState(false);
    const [isChatListening, setIsChatListening] = useState(false);
    const [activeChatCoachAction, setActiveChatCoachAction] = useState<string | null>(null);
    const [coachSelectionText, setCoachSelectionText] = useState('');
    const [hasChatTextSelection, setHasChatTextSelection] = useState(false);
    const [chatSaveDraft, setChatSaveDraft] = useState<ChatSaveDraft | null>(null);
    const [isSavingChatSnippet, setIsSavingChatSnippet] = useState(false);
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number, placement: 'top' | 'bottom' } | null>(null);
    
    const [isAlreadyInLibrary, setIsAlreadyInLibrary] = useState(false);
    const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);
    
    // Tools Modal State
    const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
    const [isNoteOnlyMode, setIsNoteOnlyMode] = useState(false);

    const commandBoxRef = useRef<HTMLDivElement>(null);
    const selectionMenuRef = useRef<HTMLDivElement>(null);
    const messageBoxRef = useRef<HTMLDivElement>(null);
    const studyBuddyRootRef = useRef<HTMLDivElement>(null);
    const chatPanelRef = useRef<HTMLDivElement>(null);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const chatAbortRef = useRef<AbortController | null>(null);
    const externalChatStreamRef = useRef<{ requestId: string; assistantId: string; spokenCursor: number } | null>(null);
    const chatRecognitionRef = useRef<SpeechRecognitionManager | null>(null);
    const chatDraftPrefixRef = useRef('');
    const chatSpeechQueueRef = useRef<ChatSpeechChunk[]>([]);
    const isChatSpeakingRef = useRef(false);
    const isChatAudioEnabledRef = useRef(isChatAudioEnabled);
    const closeMenuTimeoutRef = useRef<number | null>(null);
    const audioStatusSettleTimeoutRef = useRef<number | null>(null);
    const playbackControlsHideTimeoutRef = useRef<number | null>(null);
    const isCoachHoveredRef = useRef(false);
    const selectedTextRef = useRef<string>('');
    const selectedRangeRef = useRef<Range | null>(null);
    const shouldPreserveSelectionRef = useRef(false);
    const selectionRestoreFrameRef = useRef<number | null>(null);
    const cambridgeAudioRef = useRef<HTMLAudioElement | null>(null);
    const isOpenRef = useRef(false);
    const messageRef = useRef<Message | null>(null);
    const lastCoachLookupRef = useRef<{ word: string; at: number }>({ word: '', at: 0 });
    
    const activeType = config.audioCoach.activeCoach;
    const coach = config.audioCoach.coaches[activeType];
    const avatarInfo = getAvatarProps(coach.avatar);

    function getAvatarProps(avatarStr: string) {
        if (avatarStr.startsWith('http') || avatarStr.startsWith('data:')) {
            return { url: avatarStr, bg: 'bg-white border-2 border-neutral-100' };
        }
        return (AVATAR_DEFINITIONS as any)[avatarStr] || AVATAR_DEFINITIONS.woman_teacher;
    }

    const restoreSelectedRange = () => {
        const savedRange = selectedRangeRef.current;
        if (!savedRange || typeof window === 'undefined') return;
        const selection = window.getSelection();
        if (!selection) return;

        try {
            selection.removeAllRanges();
            selection.addRange(savedRange.cloneRange());
            selectedTextRef.current = selection.toString().trim() || selectedTextRef.current;
        } catch {
            // Ignore restore failures from detached nodes or browser quirks.
        }
    };

    const updateCoachSelection = (text: string, range?: Range | null, preserveSelection = false) => {
        const normalized = text.trim();
        selectedTextRef.current = normalized;
        setCoachSelectionText(normalized);
        if (range) {
            selectedRangeRef.current = range.cloneRange();
        }
        shouldPreserveSelectionRef.current = preserveSelection;
        if (normalized) {
            void checkLibraryExistence(normalized);
        } else {
            setIsAlreadyInLibrary(false);
        }
    };

    const disableSelectionPreservation = () => {
        shouldPreserveSelectionRef.current = false;
        if (selectionRestoreFrameRef.current !== null) {
            window.cancelAnimationFrame(selectionRestoreFrameRef.current);
            selectionRestoreFrameRef.current = null;
        }
    };


    const checkLibraryExistence = async (word: string) => {
        if (!word || !user.id) return;
        const exists = await dataStore.findWordByText(user.id, word);
        setIsAlreadyInLibrary(!!exists);
    };

    const getChatPanelSelectionText = () => {
        if (typeof window === 'undefined') return '';
        const selection = window.getSelection();
        const text = selection?.toString().trim() || '';
        if (!text) return '';
        const anchorNode = selection?.anchorNode;
        if (!anchorNode || !chatPanelRef.current?.contains(anchorNode)) return '';
        return text;
    };

    const createWordForChatSave = async (targetWord: string): Promise<VocabularyItem> => {
        const baseItem = await createNewWord(
            targetWord,
            '',
            '',
            '',
            '',
            ['coach-saved'],
            false,
            false,
            false,
            targetWord.includes(' '),
            false
        );

        return {
            ...baseItem,
            userId: user.id,
            quality: WordQuality.RAW,
            source: 'manual',
            isPassive: false
        };
    };

    const openChatSaveModal = (turn: ChatTurn) => {
        const selectedSnippet = getChatPanelSelectionText();
        const sourceText = selectedSnippet && turn.content.includes(selectedSnippet)
            ? selectedSnippet
            : (turn.content || turn.saveContext?.sourceSelection || '').trim();

        const suggestedSections = getSuggestedSaveSections(sourceText, turn.saveContext);
        setChatSaveDraft({
            turnId: turn.id,
            sourceText,
            targetWord: turn.saveContext?.targetWord || '',
            suggestedSections,
            selectedSection: suggestedSections[0] || 'example',
            parsedPairs: parseStructuredPairs(sourceText),
            parsedWordFamily: parseWordFamilyItems(sourceText)
        });
    };

    const handleSaveChatSnippet = async () => {
        if (!chatSaveDraft || isSavingChatSnippet) return;
        const targetWord = chatSaveDraft.targetWord.trim();
        const sourceText = stripMarkdownForSave(chatSaveDraft.sourceText);
        if (!targetWord) {
            showToast('Please enter a target word first.', 'error');
            return;
        }
        if (!sourceText) {
            showToast('No content available to save.', 'error');
            return;
        }

        setIsSavingChatSnippet(true);
        try {
            let word = await dataStore.findWordByText(user.id, targetWord);
            if (!word) {
                word = await createWordForChatSave(targetWord);
            }

            const updatedWord: VocabularyItem = {
                ...word,
                updatedAt: Date.now()
            };

            if (chatSaveDraft.selectedSection === 'example') {
                const cleanedExamples = sourceText
                    .split('\n')
                    .map((line) => cleanExampleSentence(line))
                    .filter(Boolean)
                    .join('\n');
                updatedWord.example = mergeTextBlock(updatedWord.example, cleanedExamples);
            }

            if (chatSaveDraft.selectedSection === 'collocation') {
                const nextItems = chatSaveDraft.parsedPairs.length > 0
                    ? chatSaveDraft.parsedPairs
                    : sourceText.split('\n').map((line) => ({ item: normalizeSaveLine(line), context: '' })).filter((item) => item.item);
                const existing = [...(updatedWord.collocationsArray || [])];
                nextItems.forEach(({ item, context }) => {
                    const normalized = item.trim().toLowerCase();
                    const index = existing.findIndex((entry) => entry.text.trim().toLowerCase() === normalized);
                    const nextEntry: CollocationDetail = { text: item.trim(), d: context.trim(), isIgnored: false };
                    if (index >= 0) {
                        existing[index] = {
                            ...existing[index],
                            d: mergeTextBlock(existing[index].d, nextEntry.d || ''),
                            isIgnored: false
                        };
                    } else {
                        existing.push(nextEntry);
                    }
                });
                updatedWord.collocationsArray = existing;
                updatedWord.collocations = existing.map((item) => item.text).join('\n');
            }

            if (chatSaveDraft.selectedSection === 'paraphrase') {
                const nextItems = chatSaveDraft.parsedPairs.length > 0
                    ? chatSaveDraft.parsedPairs
                    : sourceText.split('\n').map((line) => ({ item: normalizeSaveLine(line), context: '' })).filter((item) => item.item);
                const existing = [...(updatedWord.paraphrases || [])];
                nextItems.forEach(({ item, context, register }) => {
                    const normalized = item.trim().toLowerCase();
                    const index = existing.findIndex((entry) => entry.word.trim().toLowerCase() === normalized);
                    const nextEntry: ParaphraseOption = {
                        word: item.trim(),
                        context: context.trim(),
                        tone: normalizeParaphraseTone(register),
                        isIgnored: false
                    };
                    if (index >= 0) {
                        existing[index] = {
                            ...existing[index],
                            context: mergeTextBlock(existing[index].context, nextEntry.context || ''),
                            tone: nextEntry.tone || existing[index].tone || 'synonym',
                            isIgnored: false
                        };
                    } else {
                        existing.push(nextEntry);
                    }
                });
                updatedWord.paraphrases = existing;
            }

            if (chatSaveDraft.selectedSection === 'preposition') {
                const nextItems = chatSaveDraft.parsedPairs.length > 0
                    ? chatSaveDraft.parsedPairs
                    : sourceText.split('\n').map((line) => ({ item: normalizeSaveLine(line), context: '' })).filter((item) => item.item);
                const existing = [...(updatedWord.prepositions || [])];
                nextItems.forEach(({ item, context }) => {
                    const normalized = item.trim().toLowerCase();
                    const index = existing.findIndex((entry) => entry.prep.trim().toLowerCase() === normalized);
                    const nextEntry: PrepositionPattern = { prep: item.trim(), usage: context.trim(), isIgnored: false };
                    if (index >= 0) {
                        existing[index] = {
                            ...existing[index],
                            usage: mergeTextBlock(existing[index].usage, nextEntry.usage || ''),
                            isIgnored: false
                        };
                    } else {
                        existing.push(nextEntry);
                    }
                });
                updatedWord.prepositions = existing;
            }

            if (chatSaveDraft.selectedSection === 'wordFamily') {
                const existingFamily: WordFamily = updatedWord.wordFamily || { nouns: [], verbs: [], adjs: [], advs: [] };
                const nextItems = chatSaveDraft.parsedWordFamily.length > 0
                    ? chatSaveDraft.parsedWordFamily
                    : sourceText.split('\n')
                        .map((line) => normalizeSaveLine(line))
                        .filter(Boolean)
                        .map((word) => ({ word, note: '', bucket: inferWordFamilyBucket(word, '') as keyof WordFamily }));

                nextItems.forEach(({ word: familyWord, bucket }) => {
                    const list = [...(existingFamily[bucket] || [])];
                    const exists = list.some((entry) => entry.word.trim().toLowerCase() === familyWord.trim().toLowerCase());
                    if (!exists) {
                        list.push({ word: familyWord.trim(), isIgnored: false });
                        existingFamily[bucket] = list;
                    }
                });
                updatedWord.wordFamily = existingFamily;
            }

            await dataStore.saveWord(updatedWord);
            showToast(`Saved to ${targetWord}.`, 'success');
            setChatSaveDraft(null);
        } catch (error) {
            console.error(error);
            showToast('Failed to save this content.', 'error');
        } finally {
            setIsSavingChatSnippet(false);
        }
    };

    const stopChatStream = () => {
        if (chatAbortRef.current) {
            chatAbortRef.current.abort();
            chatAbortRef.current = null;
        }
        setIsChatLoading(false);
    };

    const stopChatListening = () => {
        chatRecognitionRef.current?.stop();
        setIsChatListening(false);
    };

    const scheduleChatSpeechPrefetch = async () => {
        if (!isChatAudioEnabledRef.current) return;
        const upcoming = chatSpeechQueueRef.current.slice(0, CHAT_AUDIO_PREFETCH_AHEAD);
        for (const chunk of upcoming) {
            if (chunk.preloadedBlob || chunk.prefetchPromise) continue;
            chunk.prefetchPromise = prefetchSpeech(chunk.text, chunk.lang)
                .then((blob) => {
                    chunk.preloadedBlob = blob;
                    chunk.prefetchPromise = null;
                    return blob;
                })
                .catch(() => {
                    chunk.prefetchPromise = null;
                    return null;
                });
        }
    };

    const processChatSpeechQueue = async () => {
        if (isChatSpeakingRef.current || !isChatAudioEnabledRef.current) return;
        const nextChunk = chatSpeechQueueRef.current.shift();
        if (!nextChunk) return;

        isChatSpeakingRef.current = true;
        const voice = nextChunk.lang === 'vi' ? coach.viVoice : coach.enVoice;
        const accent = nextChunk.lang === 'vi' ? coach.viAccent : coach.enAccent;

        try {
            const resolvedBlob = nextChunk.preloadedBlob ?? await nextChunk.prefetchPromise ?? undefined;
            await speak(nextChunk.text, false, nextChunk.lang, voice, accent, resolvedBlob, true);
        } catch {
            // Silent fail; chat should continue even if TTS is unavailable.
        } finally {
            isChatSpeakingRef.current = false;
            void scheduleChatSpeechPrefetch();
            if (isChatAudioEnabledRef.current && chatSpeechQueueRef.current.length > 0) {
                void processChatSpeechQueue();
            }
        }
    };

    const handleClearChatHistory = () => {
        setChatHistory([
            createChatTurn('assistant', 'Xin chào. Tôi có thể trả lời bất cứ thứ gì về tiếng Anh')
        ]);
        clearChatSpeechQueue(true);
    };

    const clearChatSpeechQueue = (stopCurrentAudio = false) => {
        chatSpeechQueueRef.current = [];
        if (stopCurrentAudio) {
            stopSpeaking();
            isChatSpeakingRef.current = false;
        }
    };

    const queueChatSpeech = (text: string) => {
        const segments = splitMixedLanguageSegments(text);
        if (segments.length === 0 || !isChatAudioEnabledRef.current) return;
        chatSpeechQueueRef.current.push(...segments);
        void scheduleChatSpeechPrefetch();
        void processChatSpeechQueue();
    };

    const openChatPanel = (prefill?: string) => {
        disableSelectionPreservation();

        // Always take latest selected text at click time if not explicitly provided
        const latestSelection = (prefill ?? selectedTextRef.current) || window.getSelection()?.toString().trim() || '';

        // Only set chat input if explicitly provided (not for coach actions)
        if (prefill !== undefined) {
            setChatInput(prefill);
        } else {
            setChatInput('');
        }

        setMessage(null);
        setMenuPos(null);
        setIsOpen(false);
        setIsChatOpen(true);
    };

    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (!chatRecognitionRef.current) {
            chatRecognitionRef.current = new SpeechRecognitionManager();
        }
        return () => {
            chatRecognitionRef.current?.stop();
            disableSelectionPreservation();
        };
    }, []);

    useEffect(() => {
        const handleSelectionChange = () => {
            if (!shouldPreserveSelectionRef.current) return;
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim() || '';
            if (selectedText) return;
            if (!selectedRangeRef.current) return;

            if (selectionRestoreFrameRef.current !== null) {
                window.cancelAnimationFrame(selectionRestoreFrameRef.current);
            }

            selectionRestoreFrameRef.current = window.requestAnimationFrame(() => {
                selectionRestoreFrameRef.current = null;
                if (!shouldPreserveSelectionRef.current) return;
                restoreSelectedRange();
            });
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (selectionRestoreFrameRef.current !== null) {
                window.cancelAnimationFrame(selectionRestoreFrameRef.current);
                selectionRestoreFrameRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        isChatAudioEnabledRef.current = isChatAudioEnabled;
        if (!isChatAudioEnabled) {
            clearChatSpeechQueue(true);
        } else {
            void scheduleChatSpeechPrefetch();
        }
    }, [isChatAudioEnabled]);

    useEffect(() => {
        if (!chatScrollRef.current) return;
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }, [chatHistory, isChatLoading, isChatOpen]);

    useEffect(() => {
        const handleSelectionChange = () => {
            const text = getChatPanelSelectionText();
            setHasChatTextSelection(!!text);
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    useEffect(() => {
        const shouldShow = isAudioPlaying && !isSingleWordAudio;
        if (shouldShow) {
            if (playbackControlsHideTimeoutRef.current) {
                window.clearTimeout(playbackControlsHideTimeoutRef.current);
                playbackControlsHideTimeoutRef.current = null;
            }
            setShowPlaybackControls(true);
            return;
        }

        if (playbackControlsHideTimeoutRef.current) {
            window.clearTimeout(playbackControlsHideTimeoutRef.current);
        }
        playbackControlsHideTimeoutRef.current = window.setTimeout(() => {
            setShowPlaybackControls(false);
            playbackControlsHideTimeoutRef.current = null;
        }, 260);
    }, [isAudioPlaying, isSingleWordAudio]);

    useEffect(() => {
        messageRef.current = message;
    }, [message]);

    useEffect(() => {
        const handleConfigUpdate = () => setConfig(getConfig());
        const handleAudioStatus = (event: Event) => {
            const detail = (event as CustomEvent<{ isSpeaking?: boolean; isAudioPaused?: boolean; isSingleWordPlayback?: boolean; playbackRate?: number }>).detail;
            const nextSpeaking = typeof detail?.isSpeaking === 'boolean' ? detail.isSpeaking : getIsSpeaking();
            const nextPaused = typeof detail?.isAudioPaused === 'boolean' ? detail.isAudioPaused : getIsAudioPaused();
            const nextSingle = typeof detail?.isSingleWordPlayback === 'boolean' ? detail.isSingleWordPlayback : getIsSingleWordPlayback();
            const nextRate = typeof detail?.playbackRate === 'number' ? detail.playbackRate : getPlaybackRate();
            setPlaybackRateState(nextRate);

            if (nextSpeaking) {
                if (audioStatusSettleTimeoutRef.current) {
                    window.clearTimeout(audioStatusSettleTimeoutRef.current);
                    audioStatusSettleTimeoutRef.current = null;
                }
                setIsAudioPlaying(true);
                setIsAudioPaused(nextPaused);
                setIsSingleWordAudio(nextSingle);
                return;
            }

            // Avoid UI flicker when clips switch rapidly: wait briefly before confirming "stopped".
            if (audioStatusSettleTimeoutRef.current) {
                window.clearTimeout(audioStatusSettleTimeoutRef.current);
            }
            audioStatusSettleTimeoutRef.current = window.setTimeout(() => {
                setIsAudioPlaying(getIsSpeaking());
                setIsAudioPaused(getIsAudioPaused());
                setIsSingleWordAudio(getIsSingleWordPlayback());
                audioStatusSettleTimeoutRef.current = null;
            }, 180);
        };
        const handleCoachLookupRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ word?: string; data?: CambridgeSimpleResult }>;
            const requestedWord = customEvent.detail?.word?.trim();
            const payload = customEvent.detail?.data;
            if (!requestedWord || !payload?.exists) return;
            const normalizedWord = requestedWord.toLowerCase();

            const currentMessageWord = messageRef.current?.cambridge?.word?.trim().toLowerCase();
            if (isOpenRef.current && currentMessageWord === normalizedWord) {
                if (closeMenuTimeoutRef.current) {
                    window.clearTimeout(closeMenuTimeoutRef.current);
                    closeMenuTimeoutRef.current = null;
                }
                const now = Date.now();
                lastCoachLookupRef.current = { word: normalizedWord, at: now };
                return;
            }

            const now = Date.now();
            const recent = lastCoachLookupRef.current;
            if (recent.word === normalizedWord && now - recent.at < 500) return;

            selectedTextRef.current = normalizedWord;
            // setCambridgePreview({ query: normalizedWord, data: payload });
            // setIsCambridgeValid(true);
            setIsThinking(false);
            setMenuPos(null);
            setMessage({
                actionLabel: "Go to Cambridge",
                actionUrl: payload.url,
                cambridge: {
                    word: payload.word || normalizedWord,
                    pronunciations: normalizeCambridgePronunciations(payload.pronunciations)
                },
                icon: <Search size={18} className="text-blue-500" />
            });
            lastCoachLookupRef.current = { word: normalizedWord, at: now };
            setIsOpen(true);
        };
        const handleCoachIpaFallbackRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ word?: string; ipa?: string }>;
            const requestedWord = customEvent.detail?.word?.trim();
            const ipa = customEvent.detail?.ipa;
            if (!requestedWord || !ipa) return;
            const normalizedWord = requestedWord.toLowerCase();

            const currentMessageWord = messageRef.current?.cambridge?.word?.trim().toLowerCase();
            if (isOpenRef.current && currentMessageWord === normalizedWord) return;

            selectedTextRef.current = normalizedWord;
            // setIsCambridgeValid(false);
            setIsThinking(false);
            setMenuPos(null);
            setMessage({
                text: `**IPA:** ${ipa}`,
                icon: <Binary size={18} className="text-purple-500" />
            });
            lastCoachLookupRef.current = { word: normalizedWord, at: Date.now() };
            setIsOpen(true);
        };

        const handleExternalStudyBuddyMessage = (event: Event) => {
            const custom = event as CustomEvent<{ text?: string; iconType?: 'example' | 'info' }>;
            const text = custom.detail?.text;
            const texts = Array.isArray(text) ? text : undefined;
            const iconType = custom.detail?.iconType;
            if (!text) return;

            setIsThinking(false);
            setMenuPos(null);

            setMessageIndex(0);

            setMessage({
                text: texts ? texts[0] : text,
                texts: texts,
                icon: iconType === 'example'
                    ? <MessageSquare size={18} className="text-emerald-500" />
                    : <MessageSquare size={18} className="text-blue-500" />
            });

            setIsOpen(true);
        };
        const handleExternalStudyBuddyChatRequest = (event: Event) => {
            const custom = event as CustomEvent<{ prompt?: string }>;
            const prompt = custom.detail?.prompt?.trim();
            if (!prompt) return;
            void handleBackgroundChatRequest(prompt);
        };
        const handleExternalStudyBuddyChatResponse = (event: Event) => {
            const custom = event as CustomEvent<{ content?: string }>;
            const content = custom.detail?.content?.trim();
            if (!content) return;

            setIsChatOpen(true);
            setIsChatLoading(false);
            setIsThinking(false);
            setChatHistory((current) => [
                ...current,
                createChatTurn('assistant', content)
            ]);

            if (isChatAudioEnabledRef.current) {
                queueChatSpeech(content);
            }
        };
        const handleExternalStudyBuddyChatStreamStart = (event: Event) => {
            const custom = event as CustomEvent<{ requestId?: string }>;
            const requestId = custom.detail?.requestId?.trim();
            if (!requestId) return;

            const assistantId = `assistant-stream-${requestId}`;
            externalChatStreamRef.current = { requestId, assistantId, spokenCursor: 0 };
            setIsChatOpen(true);
            setIsChatLoading(true);
            setIsThinking(false);
            clearChatSpeechQueue(true);
            setChatHistory((current) => [
                ...current,
                { id: assistantId, role: 'assistant', content: '' }
            ]);
        };
        const handleExternalStudyBuddyChatStreamDelta = (event: Event) => {
            const custom = event as CustomEvent<{ requestId?: string; delta?: string }>;
            const requestId = custom.detail?.requestId?.trim();
            const delta = custom.detail?.delta;
            const streamState = externalChatStreamRef.current;
            if (!requestId || !delta || !streamState || streamState.requestId !== requestId) return;

            let nextContent = '';
            setChatHistory((current) =>
                current.map((turn) => {
                    if (turn.id !== streamState.assistantId) return turn;
                    nextContent = `${turn.content}${delta}`;
                    return { ...turn, content: nextContent };
                })
            );

            if (isChatAudioEnabledRef.current && nextContent) {
                const pendingChunk = nextContent.slice(streamState.spokenCursor);
                const { sentences, remainder } = splitSpeakableSentences(pendingChunk);
                if (sentences.length > 0) {
                    for (const sentence of sentences) {
                        queueChatSpeech(sentence);
                    }
                    streamState.spokenCursor = nextContent.length - remainder.length;
                }
            }
        };
        const handleExternalStudyBuddyChatStreamEnd = (event: Event) => {
            const custom = event as CustomEvent<{ requestId?: string }>;
            const requestId = custom.detail?.requestId?.trim();
            const streamState = externalChatStreamRef.current;
            if (!requestId || !streamState || streamState.requestId !== requestId) return;

            if (isChatAudioEnabledRef.current) {
                const turn = chatHistory.find((item) => item.id === streamState.assistantId);
                const trailing = turn?.content.slice(streamState.spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }

            externalChatStreamRef.current = null;
            setIsChatLoading(false);
        };
        const handleExternalStudyBuddyChatStreamError = (event: Event) => {
            const custom = event as CustomEvent<{ requestId?: string; message?: string }>;
            const requestId = custom.detail?.requestId?.trim();
            const message = custom.detail?.message?.trim() || 'Khong the ket noi StudyBuddy AI luc nay.';
            const streamState = externalChatStreamRef.current;
            if (!requestId || !streamState || streamState.requestId !== requestId) return;

            setChatHistory((current) =>
                current.map((turn) =>
                    turn.id === streamState.assistantId
                        ? { ...turn, content: turn.content.trim() || message }
                        : turn
                )
            );
            externalChatStreamRef.current = null;
            setIsChatLoading(false);
        };
        window.addEventListener('config-updated', handleConfigUpdate);
        window.addEventListener('audio-status-changed', handleAudioStatus);
        window.addEventListener('coach-cambridge-lookup-request', handleCoachLookupRequest as EventListener);
        window.addEventListener('coach-ipa-fallback-request', handleCoachIpaFallbackRequest as EventListener);
        window.addEventListener('studybuddy-show-message', handleExternalStudyBuddyMessage as EventListener);
        window.addEventListener('studybuddy-chat-request', handleExternalStudyBuddyChatRequest as EventListener);
        window.addEventListener('studybuddy-chat-response', handleExternalStudyBuddyChatResponse as EventListener);
        window.addEventListener('studybuddy-chat-stream-start', handleExternalStudyBuddyChatStreamStart as EventListener);
        window.addEventListener('studybuddy-chat-stream-delta', handleExternalStudyBuddyChatStreamDelta as EventListener);
        window.addEventListener('studybuddy-chat-stream-end', handleExternalStudyBuddyChatStreamEnd as EventListener);
        window.addEventListener('studybuddy-chat-stream-error', handleExternalStudyBuddyChatStreamError as EventListener);
        
        // Initial check
        setIsAudioPlaying(getIsSpeaking());
        setIsAudioPaused(getIsAudioPaused());
        setIsSingleWordAudio(getIsSingleWordPlayback());
        setPlaybackRateState(getPlaybackRate());

        return () => {
            if (chatAbortRef.current) {
                chatAbortRef.current.abort();
                chatAbortRef.current = null;
            }
            if (audioStatusSettleTimeoutRef.current) {
                window.clearTimeout(audioStatusSettleTimeoutRef.current);
                audioStatusSettleTimeoutRef.current = null;
            }
            if (playbackControlsHideTimeoutRef.current) {
                window.clearTimeout(playbackControlsHideTimeoutRef.current);
                playbackControlsHideTimeoutRef.current = null;
            }
            window.removeEventListener('config-updated', handleConfigUpdate);
            window.removeEventListener('audio-status-changed', handleAudioStatus);
            window.removeEventListener('coach-cambridge-lookup-request', handleCoachLookupRequest as EventListener);
            window.removeEventListener('coach-ipa-fallback-request', handleCoachIpaFallbackRequest as EventListener);
            window.removeEventListener('studybuddy-show-message', handleExternalStudyBuddyMessage as EventListener);
            window.removeEventListener('studybuddy-chat-request', handleExternalStudyBuddyChatRequest as EventListener);
            window.removeEventListener('studybuddy-chat-response', handleExternalStudyBuddyChatResponse as EventListener);
            window.removeEventListener('studybuddy-chat-stream-start', handleExternalStudyBuddyChatStreamStart as EventListener);
            window.removeEventListener('studybuddy-chat-stream-delta', handleExternalStudyBuddyChatStreamDelta as EventListener);
            window.removeEventListener('studybuddy-chat-stream-end', handleExternalStudyBuddyChatStreamEnd as EventListener);
            window.removeEventListener('studybuddy-chat-stream-error', handleExternalStudyBuddyChatStreamError as EventListener);
            if (cambridgeAudioRef.current) {
                cambridgeAudioRef.current.pause();
                cambridgeAudioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const handleClickOutsidePanels = (e: MouseEvent) => {
            const target = e.target as Node;
            if (studyBuddyRootRef.current && studyBuddyRootRef.current.contains(target)) {
                return;
            }
            if (chatPanelRef.current && !chatPanelRef.current.contains(target)) {
                stopChatListening();
                setIsChatOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutsidePanels);
        return () => document.removeEventListener('mousedown', handleClickOutsidePanels);
    }, []);

    useEffect(() => {
        if (!config.interface.rightClickCommandEnabled) return;

        const openCoachMenu = (selection: Selection) => {
            if (!selection || selection.rangeCount === 0) return;

            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            const range = selection.getRangeAt(0).cloneRange(); // clone để tránh iOS mất range
            const rect = range.getBoundingClientRect();
            const placement = rect.top > 250 ? 'top' : 'bottom';

            updateCoachSelection(selectedText, range, true);

            setMenuPos({
                x: rect.left + rect.width / 2,
                y: placement === 'top' ? rect.top : rect.bottom,
                placement
            });

            setMessage(null);
            setIsOpen(true);
        };

        const handleContextMenu = (e: MouseEvent) => {
            const selection = window.getSelection();
            if (!selection || !selection.toString().trim()) return;

            e.preventDefault();
            openCoachMenu(selection);
        };

        const handleSelectionClick = (e: MouseEvent) => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            const range = selection.getRangeAt(0);
            if (chatPanelRef.current && chatPanelRef.current.contains(range.commonAncestorContainer as Node)) {
                updateCoachSelection(selectedText, range, false);
                setIsOpen(false);
                setMenuPos(null);
                return;
            }

            if (chatPanelRef.current && chatPanelRef.current.contains(e.target as Node)) {
                return;
            }
            if (isOpen) return;

            const rect = range.getBoundingClientRect();

            const x = e.clientX;
            const y = e.clientY;

            const clickedInsideSelection =
                x >= rect.left &&
                x <= rect.right &&
                y >= rect.top &&
                y <= rect.bottom;

            if (!clickedInsideSelection) return;

            openCoachMenu(selection);
        };

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;

            // Prevent closing when interacting with the chat panel
            if (chatPanelRef.current && chatPanelRef.current.contains(target)) {
                return;
            }

            if (selectionMenuRef.current && selectionMenuRef.current.contains(target)) {
                return;
            }

            const clickedOutsideCommand =
                !commandBoxRef.current ||
                !commandBoxRef.current.contains(target);

            const clickedOutsideMessage =
                !messageBoxRef.current ||
                !messageBoxRef.current.contains(target);

            if (clickedOutsideCommand && clickedOutsideMessage) {
                disableSelectionPreservation();
                updateCoachSelection('');
                setIsOpen(false);
                setMenuPos(null);
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', handleSelectionClick);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('click', handleSelectionClick);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [
        config.interface.rightClickCommandEnabled,
        config.server,
        user.id,
        isOpen
    ]);

    const handleSendChat = async () => {
        const prompt = chatInput.trim();
        if (!prompt || isChatLoading) return;
        stopChatListening();

        const nextUserTurn = createChatTurn('user', prompt);
        const assistantId = `assistant-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        const nextHistory = [...chatHistory, nextUserTurn];
        let spokenCursor = 0;

        setChatHistory([...nextHistory, { id: assistantId, role: 'assistant', content: '' }]);
        setChatInput('');
        setIsChatOpen(true);
        setIsChatLoading(true);
        setIsThinking(false);
        clearChatSpeechQueue(true);

        const controller = new AbortController();
        chatAbortRef.current = controller;

        const updateAssistantTurn = (content: string) => {
            setChatHistory((current) =>
                current.map((turn) => (turn.id === assistantId ? { ...turn, content } : turn))
            );
        };

        try {
            const res = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: buildStudyBuddyMessages(
                        user,
                        isContextAware,
                        nextHistory.map((turn) => ({ role: turn.role, content: turn.content }))
                    ),
                    ...STUDY_BUDDY_AI_REQUEST_CONFIG,
                    stream: true
                }),
                signal: controller.signal
            });

            if (!res.ok) {
                throw new Error(`AI server error ${res.status}`);
            }

            if (!res.body) {
                throw new Error('AI server did not return a stream.');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffered = '';
            let assistantText = '';

            const appendDelta = (payload: any) => {
                const delta = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;
                if (typeof delta === 'string') {
                    assistantText += delta;
                } else if (Array.isArray(delta)) {
                    for (const part of delta) {
                        if (typeof part?.text === 'string') assistantText += part.text;
                    }
                }
                updateAssistantTurn(assistantText);
                if (isChatAudioEnabledRef.current) {
                    const pendingChunk = assistantText.slice(spokenCursor);
                    const { sentences, remainder } = splitSpeakableSentences(pendingChunk);
                    if (sentences.length > 0) {
                        for (const sentence of sentences) {
                            queueChatSpeech(sentence);
                        }
                        spokenCursor = assistantText.length - remainder.length;
                    }
                }
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffered += decoder.decode(value, { stream: true });
                const events = buffered.split('\n\n');
                buffered = events.pop() || '';

                for (const eventBlock of events) {
                    const lines = eventBlock
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean);

                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        const raw = line.slice(5).trim();
                        if (!raw || raw === '[DONE]') continue;
                        try {
                            appendDelta(JSON.parse(raw));
                        } catch {
                            // Ignore partial or non-JSON chunks.
                        }
                    }
                }
            }

            buffered += decoder.decode();
            if (buffered.trim()) {
                for (const line of buffered.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const raw = trimmed.slice(5).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        appendDelta(JSON.parse(raw));
                    } catch {
                        // Ignore final malformed chunk.
                    }
                }
            }

            if (!assistantText.trim()) {
                updateAssistantTurn('AI server da ket noi, nhung chua tra ve noi dung.');
            } else if (isChatAudioEnabledRef.current) {
                const trailing = assistantText.slice(spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId && !turn.content.trim()
                            ? { ...turn, content: 'Da dung phan hoi.' }
                            : turn
                    )
                );
            } else {
                console.error(error);
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: 'Khong the ket noi AI server. Kiem tra server AI o port 63392.' }
                            : turn
                    )
                );
                showToast('StudyBuddy AI connection failed.', 'error');
            }
        } finally {
            if (chatAbortRef.current === controller) {
                chatAbortRef.current = null;
            }
            setIsChatLoading(false);
        }
    };

    const handleBackgroundChatRequest = async (prompt: string) => {
        const cleanPrompt = prompt.trim();
        if (!cleanPrompt || isChatLoading) return;
        stopChatListening();

        const assistantId = `assistant-bg-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        let spokenCursor = 0;

        setIsChatOpen(true);
        setIsChatLoading(true);
        setIsThinking(false);
        clearChatSpeechQueue(true);
        setChatHistory((current) => [
            ...current,
            { id: assistantId, role: 'assistant', content: '' }
        ]);

        const controller = new AbortController();
        chatAbortRef.current = controller;

        const updateAssistantTurn = (content: string) => {
            setChatHistory((current) =>
                current.map((turn) => (turn.id === assistantId ? { ...turn, content } : turn))
            );
        };

        try {
            const res = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: buildStudyBuddyMessages(
                        user,
                        isContextAware,
                        [{ role: 'user', content: cleanPrompt }]
                    ),
                    ...STUDY_BUDDY_AI_REQUEST_CONFIG,
                    stream: true
                }),
                signal: controller.signal
            });

            if (!res.ok) {
                throw new Error(`AI server error ${res.status}`);
            }

            if (!res.body) {
                throw new Error('AI server did not return a stream.');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffered = '';
            let assistantText = '';

            const appendDelta = (payload: any) => {
                const delta = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;
                if (typeof delta === 'string') {
                    assistantText += delta;
                } else if (Array.isArray(delta)) {
                    for (const part of delta) {
                        if (typeof part?.text === 'string') assistantText += part.text;
                    }
                }
                updateAssistantTurn(assistantText);
                if (isChatAudioEnabledRef.current) {
                    const pendingChunk = assistantText.slice(spokenCursor);
                    const { sentences, remainder } = splitSpeakableSentences(pendingChunk);
                    if (sentences.length > 0) {
                        for (const sentence of sentences) {
                            queueChatSpeech(sentence);
                        }
                        spokenCursor = assistantText.length - remainder.length;
                    }
                }
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffered += decoder.decode(value, { stream: true });
                const events = buffered.split('\n\n');
                buffered = events.pop() || '';

                for (const eventBlock of events) {
                    const lines = eventBlock
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean);

                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        const raw = line.slice(5).trim();
                        if (!raw || raw === '[DONE]') continue;
                        try {
                            appendDelta(JSON.parse(raw));
                        } catch {
                            // Ignore partial or non-JSON chunks.
                        }
                    }
                }
            }

            buffered += decoder.decode();
            if (buffered.trim()) {
                for (const line of buffered.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const raw = trimmed.slice(5).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        appendDelta(JSON.parse(raw));
                    } catch {
                        // Ignore final malformed chunk.
                    }
                }
            }

            if (!assistantText.trim()) {
                updateAssistantTurn('AI server da ket noi, nhung chua tra ve noi dung.');
            } else if (isChatAudioEnabledRef.current) {
                const trailing = assistantText.slice(spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId && !turn.content.trim()
                            ? { ...turn, content: 'Da dung phan hoi.' }
                            : turn
                    )
                );
            } else {
                console.error(error);
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: 'Khong the ket noi StudyBuddy AI luc nay.' }
                            : turn
                    )
                );
                showToast('StudyBuddy AI connection failed.', 'error');
            }
        } finally {
            if (chatAbortRef.current === controller) {
                chatAbortRef.current = null;
            }
            setIsChatLoading(false);
        }
    };

    const requestStudyBuddyAiText = async (userPrompt: string, isStreamed: boolean = true): Promise<string> => {
        const aiUrl = getStudyBuddyAiUrl(config);
        const res = await fetch(aiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: buildStudyBuddyMessages(
                    user,
                    isContextAware,
                    [{ role: 'user', content: userPrompt }]
                ),
                ...STUDY_BUDDY_AI_REQUEST_CONFIG,
                stream: isStreamed
            })
        });

        if (!res.ok) {
            throw new Error(`AI server error ${res.status}`);
        }

        const data = await res.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.trim()) {
            return content.trim();
        }
        throw new Error('AI server returned empty content.');
    };

    const handleChatCoachTranslate = async () => {
        const selectedText = selectedTextRef.current.trim();
        if (!selectedText) return;

        setActiveChatCoachAction('translate');
        setIsThinking(true);

        try {
            const translation = await requestStudyBuddyAiText(
                `Translate this into natural Vietnamese for an IELTS learner. Keep it concise and compacted, minimal, focus on meaning, max 20 words, don't need extra example.\n\nText: ${selectedText}`,
                false
            );

            setMessage({
                text: translation,
                icon: <Languages size={18} className="text-blue-500" />
            });
            setMenuPos(null);
            setIsOpen(true);
            await speak(translation, false, 'vi', coach.viVoice, coach.viAccent);
        } catch (error) {
            console.error(error);

            // Fallback to old translate (MyMemory API)
            await handleTranslateSelection();
        } finally {
            setIsThinking(false);
            setActiveChatCoachAction(null);
        }
    };

    const handleChatCoachPromptToChat = async (
        actionKey: ChatCoachActionKey,
        promptLabel: string,
        promptBuilder: (selectedText: string) => string
    ) => {
        const selectedText = selectedTextRef.current.trim();
        if (!selectedText) return;

        const userPrompt = promptBuilder(selectedText);
        const userTurn = createChatTurn('user', `${promptLabel}: ${selectedText}`);
        const assistantId = `assistant-${actionKey}-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        const saveContext: ChatSaveContext = {
            actionType: actionKey,
            targetWord: selectedText,
            sourceSelection: selectedText
        };

        setActiveChatCoachAction(actionKey);
        setIsChatLoading(true);
        setChatHistory((current) => [
            ...current,
            userTurn,
            { id: assistantId, role: 'assistant', content: '', saveContext }
        ]);

        let controller: AbortController | undefined;
        try {
            controller = new AbortController();
            chatAbortRef.current = controller;

            const res = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: buildStudyBuddyMessages(
                        user,
                        isContextAware,
                        [{ role: 'user', content: userPrompt }]
                    ),
                    ...STUDY_BUDDY_AI_REQUEST_CONFIG,
                    stream: true
                }),
                signal: controller.signal
            });

            if (!res.ok || !res.body) {
                throw new Error('Streaming failed');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            let assistantText = '';
            let buffered = '';

            const updateAssistant = (text: string) => {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId ? { ...turn, content: text, saveContext } : turn
                    )
                );
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffered += decoder.decode(value, { stream: true });
                const parts = buffered.split('\n\n');
                buffered = parts.pop() || '';

                for (const part of parts) {
                    const lines = part.split('\n').map(l => l.trim()).filter(Boolean);

                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        const raw = line.slice(5).trim();
                        if (!raw || raw === '[DONE]') continue;

                        try {
                            const json = JSON.parse(raw);
                            const delta = json?.choices?.[0]?.delta?.content;
                            if (delta) {
                                assistantText += delta;
                                updateAssistant(assistantText);
                            }
                        } catch {
                            // ignore
                        }
                    }
                }
            }

            if (!assistantText.trim()) {
                updateAssistant('Khong co noi dung tra ve.');
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId && !turn.content.trim()
                            ? { ...turn, content: 'Da dung phan hoi.' }
                            : turn
                    )
                );
            } else {
                console.error(error);
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: 'Loi khi goi StudyBuddy AI.' }
                            : turn
                    )
                );
            }
        } finally {
            if (chatAbortRef.current === controller) {
                chatAbortRef.current = null;
            }
            setIsChatLoading(false);
            setActiveChatCoachAction(null);
        }
    };

    const handleToggleChatMic = async () => {
        if (isChatListening) {
            stopChatListening();
            return;
        }

        if (!chatRecognitionRef.current) {
            chatRecognitionRef.current = new SpeechRecognitionManager();
        }

        const supported = typeof window !== 'undefined'
            && (((window as any).SpeechRecognition) || ((window as any).webkitSpeechRecognition));
        if (!supported) {
            showToast('Speech-to-text is not supported in this browser.', 'error');
            return;
        }

        const sttLang = getStudyBuddySttLang(chatInput, config.interface.studyBuddyLanguage);
        chatDraftPrefixRef.current = chatInput.trim();

        try {
            setIsChatListening(true);
            await chatRecognitionRef.current.start(
                (final, interim) => {
                    const combined = `${final}${interim}`.trim();
                    const prefix = chatDraftPrefixRef.current;
                    setChatInput(prefix ? `${prefix} ${combined}`.trim() : combined);
                },
                (finalTranscript) => {
                    const prefix = chatDraftPrefixRef.current;
                    const finalText = finalTranscript.trim();
                    setChatInput(prefix ? `${prefix} ${finalText}`.trim() : finalText);
                    setIsChatListening(false);
                },
                sttLang
            );
        } catch (error) {
            console.error(error);
            setIsChatListening(false);
            showToast('Cannot start microphone input.', 'error');
        }
    };

    const handleTranslateSelection = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;

        // If already Vietnamese, do not call translation API
        const detectedLang = detectLanguage(selectedText);

        if (detectedLang === 'vi') {
            setMessage({
                text: selectedText,
                icon: <Languages size={18} className="text-blue-500" />
            });
            setIsOpen(true);
            speak(selectedText, false, 'vi', coach.viVoice, coach.viAccent);
            return;
        }

        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null);

        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=en|vi`);
            const data = await res.json();
            if (data?.responseData?.translatedText) {
                const translation = data.responseData.translatedText;
                setMessage({
                    text: translation,
                    icon: <Languages size={18} className="text-blue-500" />
                });
                setIsOpen(true);
                speak(translation, false, 'vi', coach.viVoice, coach.viAccent);
            }
        } catch {
            showToast("Translation error!", "error");
        } finally {
            setIsThinking(false);
        }
    };

    const handleReadAndIpa = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;
        if (selectedText.length > MAX_READ_LENGTH) {
            showToast("Text is too long to read!", "error");
        } else {
            speak(selectedText, false, 'en', coach.enVoice, coach.enAccent);
        }
        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null);
        try {
            const cleaned = selectedText.toLowerCase();
            const isSingleWord = cleaned.split(/\s+/).filter(Boolean).length === 1;

            // Priority 1: Cambridge (if exact single-word entry exists)
            if (isSingleWord) {
                const serverUrl = getServerUrl(config);
                const cambridgeRes = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(cleaned)}`, {
                    cache: 'no-store'
                });
                if (cambridgeRes.ok) {
                    const raw = await cambridgeRes.text();
                    const data: CambridgeSimpleResult | null = raw ? JSON.parse(raw) : null;
                    if (data?.exists) {
                        setMessage({
                            actionLabel: "Go to Cambridge",
                            actionUrl: data.url,
                            cambridge: {
                                word: data.word || cleaned,
                                pronunciations: normalizeCambridgePronunciations(data.pronunciations)
                            },
                            icon: <Search size={18} className="text-blue-500" />
                        });
                        setIsOpen(true);
                        setIsThinking(false);
                        return;
                    }
                }
            }

            // Priority 2: Word Library IPA
            const existing = dataStore.getAllWords().find(w => w.word.toLowerCase() === cleaned);
            if (existing && existing.ipaUs) {
                setMessage({ text: `**IPA:** ${existing.ipaUs}`, icon: <Binary size={18} className="text-emerald-500" /> });
                setIsOpen(true);
                setIsThinking(false);
                return;
            }

            // Priority 3: Server IPA conversion fallback
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(selectedText)}&mode=2`);
            if (res.ok) {
                const data = await res.json();
                setMessage({ text: `**IPA:** ${data.ipa}`, icon: <Binary size={18} className="text-purple-500" /> });
                setIsOpen(true);
            }
        } catch {
            // Silent fail is acceptable here
        } finally {
            setIsThinking(false);
        }
    };

    const handleAddToLibrary = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;        if (!selectedText || isAlreadyInLibrary) return;
        setIsAddingToLibrary(true);
        try {
            let newItem: VocabularyItem;
            let serverItem: VocabularyItem | null = null;
            try {
                const results = await lookupWordsInGlobalLibrary([selectedText]);
                if (results.length > 0) serverItem = results[0];
            } catch {
                // Silent fail is acceptable here
            }

            if (serverItem) {
                newItem = {
                     ...serverItem,
                     id: crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                     userId: user.id,
                     createdAt: Date.now(),
                     updatedAt: Date.now(),
                     quality: WordQuality.REFINED,
                     source: 'refine',
                     nextReview: Date.now(),
                     interval: 0,
                     easeFactor: 2.5,
                     consecutiveCorrect: 0,
                     forgotCount: 0,
                     lastReview: undefined,
                     lastGrade: undefined,
                     lastTestResults: {},
                     groups: [...(serverItem.groups || []), 'coach-added']
                };
                newItem.isPassive = false;
                newItem.complexity = calculateComplexity(newItem);
                newItem.masteryScore = calculateMasteryScore(newItem);
                newItem.gameEligibility = calculateGameEligibility(newItem);
            } else {
                const baseItem = await createNewWord(
                    selectedText,
                    '',
                    '',
                    '',
                    '',
                    ['coach-added'],
                    false,
                    false,
                    false,
                    selectedText.includes(' '),
                    false
                );

                newItem = {
                    ...baseItem,
                    userId: user.id,
                    quality: WordQuality.RAW
                };
                newItem.isPassive = false;
            }
            console.log("Adding to library:", newItem);
            await dataStore.saveWord(newItem);
            let refineResult = { refinedCount: 0, finalIssuesCount: 0 };
            try {
                refineResult = await autoRefineNewWords([newItem], user.nativeLanguage || 'Vietnamese');
            } catch (error) {
                console.warn('[StudyBuddy] Auto refine after add failed:', error);
            }
            showToast(
                refineResult.refinedCount > 0
                    ? `"${selectedText}" added and refined!`
                    : `"${selectedText}" added!`,
                'success'
            );
            setIsAlreadyInLibrary(true);
            setIsOpen(false);
            setMenuPos(null);
        } catch {
            showToast("Add error!", "error");
        } finally {
            setIsAddingToLibrary(false);
        }
    };

    const handleViewWord = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText || !user.id || !onViewWord || isAnyModalOpen) return;
        const wordObj = await dataStore.findWordByText(user.id, selectedText);
        if (wordObj) {
            setIsOpen(false);
            setMenuPos(null);
            onViewWord(wordObj);
        }
    };

    const buildCoachPrompt = (
        selectedText: string,
        type: 'examples' | 'collocations' | 'paraphrase'
    ) => {
        const baseRules = `Rules:
- Use English only
- Do NOT translate into Vietnamese
- Keep concise, natural, IELTS-friendly
- Output MUST be a Markdown code block
- Use bullet list ONLY (-)
- Do NOT use {}, numbers, or any other symbols
- Follow the format STRICTLY`;

        if (type === 'examples') {
            return `Give max 3 example sentences for '"${selectedText}' use the exact words provided, do not paraphrases".

${baseRules}
- Each bullet = 1 natural sentence`;
        }

        if (type === 'collocations') {
            return `Give max 5 popular natural collocations for "${selectedText}".

${baseRules}
- Format: - **collocation**: short explanation`;
        }

        return `Give natural paraphrases for "${selectedText}".

${baseRules}
- Format: - **paraphrase**(Register): short explanation
- Register must be one of: Academic, Casual, Synonym
- Always put Register immediately after the paraphrase, before the colon
- Do NOT put Register at the end of the explanation
- If unsure, use Synonym`;
    };

    const ChatCoachActionBar = () => {
        const hasSelection = !!coachSelectionText;
        const baseButtonClass = 'h-8 rounded-2xl flex items-center justify-center px-3 text-[10px] font-black uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

        return (
            <div
                className="border-t border-neutral-100 bg-neutral-50/90 px-0 py-0"
                onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelectedRange();
                }}
            >
                <div className="grid grid-cols-7 gap-2">
                    <button
                        type="button"
                        onClick={handleChatCoachTranslate}
                        disabled={!hasSelection || !!activeChatCoachAction}
                        className={`${baseButtonClass} bg-indigo-50 text-indigo-600 hover:bg-indigo-100`}
                        title="Translate to Vietnamese"
                    >
                        {activeChatCoachAction === 'translate' ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                    </button>
                    <button
                        type="button"
                        onClick={handleReadAndIpa}
                        disabled={!hasSelection}
                        className={`${baseButtonClass} bg-purple-50 text-purple-600 hover:bg-purple-100`}
                        title="Read in English"
                    >
                        <Volume2 size={14} />
                    </button>
                    {!isAlreadyInLibrary ? (
                        <button type="button" onClick={handleAddToLibrary} disabled={!hasSelection || isAddingToLibrary} className={`${baseButtonClass} bg-green-50 text-green-600 hover:bg-green-100`} title="Add to Library">
                            {isAddingToLibrary ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
                        </button>
                    ) : (
                        <button type="button" onClick={handleViewWord} disabled={!hasSelection || isAnyModalOpen} className={`${baseButtonClass} bg-sky-50 text-sky-600 hover:bg-sky-100`} title="View Word Details">
                            <Eye size={15} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => handleChatCoachPromptToChat(
                            'examples',
                            'Examples',
                            (selectedText) => buildCoachPrompt(selectedText, 'examples')
                        )}
                        disabled={!hasSelection || !!activeChatCoachAction}
                        className={`${baseButtonClass} bg-blue-50 text-blue-600 hover:bg-blue-100`}
                        title="Examples"
                    >
                        {activeChatCoachAction === 'examples' ? <Loader2 size={14} className="animate-spin" /> : <NotebookPen size={14} />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleChatCoachPromptToChat(
                            'collocations',
                            'Collocations',
                            (selectedText) => buildCoachPrompt(selectedText, 'collocations')
                        )}
                        disabled={!hasSelection || !!activeChatCoachAction}
                        className={`${baseButtonClass} bg-amber-50 text-amber-600 hover:bg-amber-100`}
                        title="Collocations"
                    >
                        {activeChatCoachAction === 'collocations' ? <Loader2 size={14} className="animate-spin" /> : <Blocks size={14} />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleChatCoachPromptToChat(
                            'paraphrase',
                            'Paraphrase',
                            (selectedText) => buildCoachPrompt(selectedText, 'paraphrase')
                        )}
                        disabled={!hasSelection || !!activeChatCoachAction}
                        className={`${baseButtonClass} bg-rose-50 text-rose-600 hover:bg-rose-100`}
                        title="Paraphrase"
                    >
                        {activeChatCoachAction === 'paraphrase' ? <Loader2 size={14} className="animate-spin" /> : <BringToFront size={14} />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleChatCoachPromptToChat(
                            'wordFamily',
                            'Word Family',
                            (selectedText) => `Give word family forms for "${selectedText}" (noun, verb, adjective, adverb if possible).

Rules:
- English only
- Very concise
- Bullet list format (-)
- Each line: word form (part of speech): short meaning
- Part of speech must be one of: noun, verb, adjective, adverb`
                        )}
                        disabled={!hasSelection || !!activeChatCoachAction}
                        className={`${baseButtonClass} bg-emerald-50 text-emerald-600 hover:bg-emerald-100`}
                        title="Word Family"
                    >
                        {activeChatCoachAction === 'wordFamily' ? <Loader2 size={14} className="animate-spin" /> : <ListCollapse size={14} />}
                    </button>
                </div>
            </div>
        );
    };

    const handleCambridgeLookup = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;
        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null);
        try {
            let data: CambridgeSimpleResult | null = null;
            {
                const serverUrl = getServerUrl(config);
                const res = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(selectedText)}`);
                data = await res.json();
                // setCambridgePreview({ query: selectedText, data }); // removed
            }

            if (!data?.exists) {
                showToast("No exact Cambridge entry found.", "info");
                return;
            }
            setMessage({
                actionLabel: "Go to Cambridge",
                actionUrl: data.url,
                cambridge: {
                    word: data.word || selectedText,
                    pronunciations: normalizeCambridgePronunciations(data.pronunciations)
                },
                icon: <Search size={18} className="text-blue-500" />
            });
            setIsOpen(true);
        } catch {
            showToast("Cambridge lookup failed.", "error");
        } finally {
            setIsThinking(false);
        }
    };

    const handleSpeakSelection = () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        setIsOpen(false);
        setMenuPos(null);
        if (selectedText && selectedText.length > MAX_MIMIC_LENGTH) {
            showToast("Selection too long for mimic!", "error");
            setMimicTarget(null); // Still open modal but with no pre-filled text
        } else {
            setMimicTarget(selectedText || ''); // Pass selected text or empty string for manual input
        }
    };
    
    const handleOpenTools = () => {
        setIsOpen(false);
        setMenuPos(null);
        setIsNoteOnlyMode(false);
        setIsToolsModalOpen(true);
    };

    const handleOpenNote = () => {
        setIsOpen(false);
        setMenuPos(null);
        setIsNoteOnlyMode(true);
        setIsToolsModalOpen(true);
    };

    const playCambridgeAudio = (url?: string) => {
        if (!url) {
            showToast("Audio not available.", "info");
            return;
        }
        try {
            const resolvedUrl = url.startsWith('http')
                ? url
                : `${getServerUrl(config)}${url.startsWith('/') ? '' : '/'}${url}`;
            if (cambridgeAudioRef.current) {
                cambridgeAudioRef.current.pause();
                cambridgeAudioRef.current = null;
            }
            const audio = new Audio(resolvedUrl);
            cambridgeAudioRef.current = audio;
            audio.onerror = () => showToast("Failed to play Cambridge audio.", "error");
            audio.onended = () => {
                if (cambridgeAudioRef.current === audio) cambridgeAudioRef.current = null;
            };
            audio.play().catch(() => showToast("Failed to play Cambridge audio.", "error"));
        } catch {
            showToast("Failed to play Cambridge audio.", "error");
        }
    };

    const openCoachMenu = (e?: React.MouseEvent) => {
        // Only open on hover if there is already a valid selection
        if (!selectedRangeRef.current) return;
        // Do not trigger when hovering inside chat panel
        if (e && chatPanelRef.current && chatPanelRef.current.contains(e.target as Node)) {
            return;
        }

        // Do not auto-open when chat is open unless user has selected text
        if (isChatOpen && !selectedTextRef.current) return;

        isCoachHoveredRef.current = true;
        shouldPreserveSelectionRef.current = true;
        if (closeMenuTimeoutRef.current) {
            window.clearTimeout(closeMenuTimeoutRef.current);
            closeMenuTimeoutRef.current = null;
        }
        restoreSelectedRange();
        setIsOpen(true);
    };

    const scheduleCloseCoachMenu = () => {
        isCoachHoveredRef.current = false;
        if (closeMenuTimeoutRef.current) {
            window.clearTimeout(closeMenuTimeoutRef.current);
        }
        closeMenuTimeoutRef.current = window.setTimeout(() => {
            disableSelectionPreservation();
            setIsOpen(false);
            closeMenuTimeoutRef.current = null;
        }, messageRef.current?.cambridge ? 3000 : 300);
    };

    useEffect(() => {
        if (!isOpen || !message?.cambridge) return;
        if (isCoachHoveredRef.current) return;
        if (closeMenuTimeoutRef.current) {
            window.clearTimeout(closeMenuTimeoutRef.current);
        }
        closeMenuTimeoutRef.current = window.setTimeout(() => {
            if (isCoachHoveredRef.current) return;
            setIsOpen(false);
            closeMenuTimeoutRef.current = null;
        }, 3000);
        return () => {
            if (closeMenuTimeoutRef.current) {
                window.clearTimeout(closeMenuTimeoutRef.current);
                closeMenuTimeoutRef.current = null;
            }
        };
    }, [isOpen, message]);

    const CommandBox = () => (
        <div
            ref={commandBoxRef}
            onMouseDown={(e) => {
                e.preventDefault();
                restoreSelectedRange();
            }}
            onMouseEnter={restoreSelectedRange}
            className="bg-white/95 backdrop-blur-xl p-1.5 rounded-[1.8rem] shadow-2xl border border-neutral-200 flex flex-col gap-1 w-[160px] animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="grid grid-cols-8 gap-1">
                {/* TOP ROW (3 buttons, 2 columns each) */}
                <button type="button" onClick={handleTranslateSelection} className="col-span-2 aspect-square bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition-all active:scale-90 shadow-sm font-black text-xs" title="Đọc Tiếng Việt">VI</button>
                <button type="button" onClick={handleReadAndIpa} className="col-span-2 aspect-square bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-100 transition-all active:scale-90 shadow-sm" title="Read English"><Volume2 size={15}/></button>
                <button type="button" onClick={handleSpeakSelection} className="col-span-2 aspect-square bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center hover:bg-amber-100 transition-all active:scale-95 shadow-sm" title="Mimic Practice"><Mic size={15}/></button>
                {!isChatOpen && (
                <button type="button" onClick={() => openChatPanel(selectedTextRef.current || undefined)} className="col-span-2 aspect-square bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95 shadow-sm" title="Ask AI"><Bot size={15}/></button>
                )}
                {/* BOTTOM ROW (3 buttons, 2 columns each) */}
                {!isAlreadyInLibrary ? (
                    <button type="button" onClick={handleAddToLibrary} disabled={isAddingToLibrary} className="col-span-2 aspect-square bg-green-50 text-green-600 rounded-2xl flex items-center justify-center hover:bg-green-100 transition-all active:scale-90 shadow-sm" title="Add to Library">{isAddingToLibrary ? <Loader2 size={14} className="animate-spin"/> : <Plus size={15}/>}</button>
                ) : (
                    <button type="button" onClick={handleViewWord} disabled={isAnyModalOpen} className="col-span-2 aspect-square bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center hover:bg-sky-100 transition-all active:scale-90 shadow-sm" title="View Word Details"><Eye size={15}/></button>
                )}
                <button type="button" onClick={handleOpenNote} className="col-span-2 aspect-square bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Open Note"><PenTool size={15}/></button>
                <button type="button" onClick={handleOpenTools} className="col-span-2 aspect-square bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Tools"><Wrench size={15}/></button>
            </div>
        </div>
    );

    const formatBoldText = (text: string) => {
        const boldRegex = new RegExp('\\*\\*(.*?)\\*\\*', 'g');
        return text
            .replace(boldRegex, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>');
    };

    useEffect(() => {
        let interval: any;
        if (isAudioPlaying) {
            setMarkPoints(getMarkPoints());
            interval = setInterval(() => {
                const prog = getAudioProgress();
                if (prog) {
                    setAudioProgress(prog);
                }
            }, 100);
        } else {
            setAudioProgress({ currentTime: 0, duration: 0 });
            setMarkPoints([]);
            setIsAudioPaused(false);
            setIsSingleWordAudio(false);
        }
        return () => clearInterval(interval);
    }, [isAudioPlaying]);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        seekAudio(time);
        setAudioProgress(prev => ({ ...prev, currentTime: time }));
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const cyclePlaybackRate = () => {
        const speeds = [0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5];
        const idx = speeds.findIndex((v) => Math.abs(v - playbackRate) < 0.001);
        const next = speeds[(idx + 1) % speeds.length];
        setPlaybackRate(next);
        setPlaybackRateState(next);
    };

    return (
        <>
            {isOpen && menuPos && (
                <div
                    ref={selectionMenuRef}
                    className="fixed z-[2147483647]"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        restoreSelectedRange();
                    }}
                    onMouseEnter={() => openCoachMenu()}
                    onMouseLeave={scheduleCloseCoachMenu}
                    style={{
                        left: `${menuPos.x}px`,
                        top: `${menuPos.y}px`,
                        transform: menuPos.placement === 'top'
                            ? 'translate(-50%, -100%) translateY(-10px)'
                            : 'translate(-50%, 0) translateY(10px)'
                    }}
                >
                    <CommandBox />
                </div>
            )}
            <div ref={studyBuddyRootRef} className="fixed bottom-0 left-6 z-[2147483646] flex flex-col items-start pointer-events-none">
                <div
                    className="flex flex-col items-center pointer-events-auto group pb-0 pt-10"
                    onMouseEnter={(e) => openCoachMenu(e)}
                    onMouseLeave={scheduleCloseCoachMenu}
                >
                    <div className="relative">
                        {isChatOpen && (
                            <div
                                ref={chatPanelRef}
                                className="pointer-events-auto absolute bottom-20 left-0 z-50 w-[36rem] max-w-[calc(100vw-2rem)] rounded-[2rem] border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-xl overflow-hidden select-text animate-in fade-in slide-in-from-bottom-2 duration-200 relative"
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseEnter={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50/70">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
                                            <Sparkles size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-neutral-900 uppercase tracking-wide">StudyBuddy AI</p>
                                            <p className="text-[11px] text-neutral-500 truncate">Grammar, writing, speaking, tu vung</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setIsContextAware((prev) => !prev)}
                                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                                                isContextAware
                                                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                    : 'border-neutral-200 bg-white text-neutral-500'
                                            }`}
                                            title="Toggle study context embedding"
                                        >
                                            {isContextAware ? 'Context aware' : 'Fast mode'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsChatAudioEnabled((prev) => !prev)}
                                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                                                isChatAudioEnabled
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : 'border-neutral-200 bg-white text-neutral-500'
                                            }`}
                                            title="Toggle chat audio"
                                        >
                                            <Volume2 size={12} />
                                            Audio {isChatAudioEnabled ? 'On' : 'Off'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearChatHistory}
                                            className="h-8 px-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-black uppercase tracking-wide"
                                            title="Clear chat"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                stopChatStream();
                                                stopChatListening();
                                                setIsChatOpen(false);
                                            }}
                                            className="text-neutral-400 hover:text-neutral-900"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div
                                    ref={chatScrollRef}
                                    className="max-h-[24rem] overflow-y-auto px-4 py-4 space-y-3 bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_100%)] select-text"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <ChatHistoryList
                                        chatHistory={chatHistory}
                                        isChatLoading={isChatLoading}
                                        onOpenSaveModal={openChatSaveModal}
                                        hasChatSelection={hasChatTextSelection}
                                    />
                                </div>

                                <ChatCoachActionBar />

                                <div className="border-t border-neutral-100 p-3 bg-white">
                                    <div className="flex items-end gap-2">
                                        <textarea
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendChat();
                                                }
                                            }}
                                            rows={3}
                                            placeholder="Hoi StudyBuddy AI... Shift+Enter de xuong dong"
                                            className="flex-1 resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800 outline-none focus:border-neutral-900 focus:bg-white transition-colors"
                                        />
                                        <div className="flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={handleToggleChatMic}
                                                className={`w-11 h-9 rounded-2xl border flex items-center justify-center transition-colors ${
                                                    isChatListening
                                                        ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                                                        : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                                                }`}
                                                title={isChatListening ? 'Stop voice input' : 'Start voice input'}
                                            >
                                                <Mic size={18} className={isChatListening ? 'animate-pulse' : ''} />
                                            </button>
                                            {isChatLoading ? (
                                                <button
                                                    type="button"
                                                    onClick={stopChatStream}
                                                    className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 flex items-center justify-center transition-colors"
                                                    title="Stop response"
                                                >
                                                    <StopCircle size={18} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleSendChat}
                                                    disabled={!chatInput.trim()}
                                                    className="w-11 h-11 rounded-2xl bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                                    title="Send"
                                                >
                                                    <Send size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {chatSaveDraft && (
                                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/75 p-4 backdrop-blur-sm">
                                        <div className="w-full max-w-md rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-2xl">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Save To Word</p>
                                                    <p className="mt-1 text-sm font-bold text-neutral-900">Chon phan de luu vao word</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setChatSaveDraft(null)}
                                                    className="rounded-xl p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>

                                            <div className="mt-4 space-y-4">
                                                <div>
                                                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                                                        Target Word
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={chatSaveDraft.targetWord}
                                                        onChange={(e) => setChatSaveDraft((current) => current ? { ...current, targetWord: e.target.value } : current)}
                                                        placeholder="Nhap word can luu vao"
                                                        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus:bg-white"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                                                        Save Section
                                                    </label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(Object.keys(SAVE_SECTION_LABELS) as ChatSaveSection[]).map((section) => {
                                                            const isActive = chatSaveDraft.selectedSection === section;
                                                            const isSuggested = chatSaveDraft.suggestedSections.includes(section);
                                                            return (
                                                                <button
                                                                    key={section}
                                                                    type="button"
                                                                    onClick={() => setChatSaveDraft((current) => current ? { ...current, selectedSection: section } : current)}
                                                                    className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
                                                                        isActive
                                                                            ? 'border-neutral-900 bg-neutral-900 text-white'
                                                                            : isSuggested
                                                                                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300'
                                                                                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
                                                                    }`}
                                                                >
                                                                    {SAVE_SECTION_LABELS[section]}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                                                        Preview
                                                    </label>
                                                    <div className="max-h-48 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                                                        {chatSaveDraft.selectedSection === 'example' && (
                                                            <p className="whitespace-pre-wrap leading-relaxed">{chatSaveDraft.sourceText}</p>
                                                        )}
                                                        {(chatSaveDraft.selectedSection === 'collocation' || chatSaveDraft.selectedSection === 'paraphrase' || chatSaveDraft.selectedSection === 'preposition') && (
                                                            <div className="space-y-2">
                                                                {(chatSaveDraft.parsedPairs.length > 0
                                                                    ? chatSaveDraft.parsedPairs
                                                                    : chatSaveDraft.sourceText.split('\n').map((line) => ({ item: normalizeSaveLine(line), context: '' })).filter((item) => item.item)
                                                                ).map((item, index) => (
                                                                    <div key={`${item.item}-${index}`} className="rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                                                        <p className="font-bold text-neutral-900">{item.item}</p>
                                                                        {!!item.context && <p className="mt-1 text-neutral-600">{item.context}</p>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {chatSaveDraft.selectedSection === 'wordFamily' && (
                                                            <div className="space-y-2">
                                                                {(chatSaveDraft.parsedWordFamily.length > 0
                                                                    ? chatSaveDraft.parsedWordFamily
                                                                    : chatSaveDraft.sourceText.split('\n').map((line) => ({
                                                                        word: normalizeSaveLine(line),
                                                                        note: '',
                                                                        bucket: inferWordFamilyBucket(normalizeSaveLine(line), '')
                                                                    })).filter((item) => item.word)
                                                                ).map((item, index) => (
                                                                    <div key={`${item.word}-${index}`} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                                                        <p className="font-bold text-neutral-900">{item.word}</p>
                                                                        <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">{item.bucket}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setChatSaveDraft(null)}
                                                        className="rounded-2xl border border-neutral-200 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-neutral-600 transition-colors hover:bg-neutral-100"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveChatSnippet}
                                                        disabled={isSavingChatSnippet}
                                                        className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isSavingChatSnippet ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {isOpen && !menuPos && (
                            <div className="absolute bottom-16 left-0 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {message ? (
                                    <div ref={messageBoxRef} className="bg-white p-5 rounded-[2.5rem] shadow-2xl border border-neutral-200 w-[26rem] relative">
                                        <button onClick={() => { setMessage(null); setIsOpen(false); setMenuPos(null); }} className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-900"><X size={14}/></button>
                                        <div className="flex items-start gap-3">
                                            <div className="shrink-0 mt-1">{message.icon || <MessageSquare size={18} />}</div>
                                            <div className="text-xs font-medium text-neutral-700 leading-relaxed space-y-2">
                                                {message.cambridge ? (
                                                  <div className="space-y-4">
                                                    {Array.isArray((message.cambridge as any).wordFamily) &&
                                                    (message.cambridge as any).wordFamily.length > 0 ? (
                                                      (message.cambridge as any).wordFamily.map((entry: any, idx: number) => (
                                                        <div key={idx} className="space-y-2">
                                                          {/* Removed master headword display */}
                                                          <div className="grid grid-cols-2 gap-2">
                                                            {(entry.pronunciations || []).map((p: any, i: number) => (
                                                              <div
                                                                key={i}
                                                                className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1.5"
                                                              >
                                                                {p.headword && (
                                                                  <p className="text-[11px] font-extrabold text-indigo-700 break-words">
                                                                    {p.headword}
                                                                  </p>
                                                                )}
                                                                <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
                                                                  {p.partOfSpeech || 'N/A'}
                                                                </p>

                                                                <div className="flex items-center gap-2">
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => playCambridgeAudio(p.audioUs || undefined)}
                                                                    disabled={!p.audioUs}
                                                                    className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                      p.audioUs
                                                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                                                        : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                    }`}
                                                                  >
                                                                    US
                                                                  </button>
                                                                  <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                    {p.ipaUs ? `/${p.ipaUs}/` : 'N/A'}
                                                                  </p>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => playCambridgeAudio(p.audioUk || undefined)}
                                                                    disabled={!p.audioUk}
                                                                    className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                      p.audioUk
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                                                        : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                    }`}
                                                                  >
                                                                    UK
                                                                  </button>
                                                                  <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                    {p.ipaUk ? `/${p.ipaUk}/` : 'N/A'}
                                                                  </p>
                                                                </div>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      ))
                                                    ) : (
                                                      <div className="space-y-2">
                                                        {/* Removed master headword display */}
                                                        <div className="grid grid-cols-2 gap-2">
                                                          {(message.cambridge.pronunciations || []).map((p, idx) => (
                                                            <div
                                                              key={idx}
                                                              className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1.5"
                                                            >
                                                              {(p as any).headword && (
                                                                <p className="text-[11px] font-extrabold text-indigo-700 break-words">
                                                                  {(p as any).headword}
                                                                </p>
                                                              )}
                                                              <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
                                                                {p.partOfSpeech || 'N/A'}
                                                              </p>

                                                              <div className="flex items-center gap-2">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => playCambridgeAudio(p.audioUs || undefined)}
                                                                  disabled={!p.audioUs}
                                                                  className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                    p.audioUs
                                                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                                                      : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                  }`}
                                                                >
                                                                  US
                                                                </button>
                                                                <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                  {p.ipaUs ? `/${p.ipaUs}/` : 'N/A'}
                                                                </p>
                                                              </div>

                                                              <div className="flex items-center gap-2">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => playCambridgeAudio(p.audioUk || undefined)}
                                                                  disabled={!p.audioUk}
                                                                  className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                    p.audioUk
                                                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                                                      : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                  }`}
                                                                >
                                                                  UK
                                                                </button>
                                                                <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                  {p.ipaUk ? `/${p.ipaUk}/` : 'N/A'}
                                                                </p>
                                                              </div>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : (
                                                    (() => {
                                                        const rawText = (message.texts && message.texts.length > 0)
                                                            ? message.texts[messageIndex] || ''
                                                            : (message.text || '');
                                                        const isIPA = rawText.startsWith('IPA:');
                                                        const ipaContent = isIPA ? rawText.replace(/^IPA:\s*/, '') : rawText;
                                                        return (
                                                            <>
                                                                {isIPA && (
                                                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                                                        IPA:
                                                                    </div>
                                                                )}
                                                                <div
                                                                    style={{ lineHeight: '1.6' }}
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: formatBoldText(
                                                                            ipaContent.replace(/\s+\//g, '<br/>/')
                                                                        )
                                                                    }}
                                                                />
                                                                {message.texts && message.texts.length > 1 && (
                                                                    <div className="flex items-center gap-2 pt-2">
                                                                        <button
                                                                            onClick={() => setMessageIndex(i => Math.max(0, i - 1))}
                                                                            disabled={messageIndex === 0}
                                                                            className="px-2 py-1 text-[10px] font-bold rounded bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40"
                                                                        >
                                                                            Back
                                                                        </button>
                                                                        <span className="text-[10px] text-neutral-500">
                                                                            {messageIndex + 1} / {message.texts.length}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => setMessageIndex(i => Math.min(message.texts!.length - 1, i + 1))}
                                                                            disabled={messageIndex === message.texts.length - 1}
                                                                            className="px-2 py-1 text-[10px] font-bold rounded bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40"
                                                                        >
                                                                            Next
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()
                                                )}
                                                {message.actionUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(message.actionUrl, '_blank')}
                                                        className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
                                                    >
                                                        {message.actionLabel || 'Open'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : <CommandBox />}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                openChatPanel();
                            }}
                            className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-neutral-900 text-white border-2 border-white shadow-lg flex items-center justify-center pointer-events-auto hover:scale-105 transition-transform z-30"
                            title="Open StudyBuddy AI chat"
                        >
                            {isChatLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        </button>
                        <button onClick={(e) => { if (showPlaybackControls) { e.stopPropagation(); stopSpeaking(); } }} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 transform shadow-2xl relative z-0 ${avatarInfo.bg} ${isOpen ? 'ring-4 ring-white' : 'hover:scale-110 mb-1'}`}>
                            {isThinking ? <Loader2 size={20} className="animate-spin text-neutral-400"/> : (
                                <>
                                    <img src={avatarInfo.url} className={`w-10 h-10 object-contain ${showPlaybackControls ? 'opacity-30 scale-90 blur-[1px]' : ''}`} alt="Coach" />
                                    {showPlaybackControls && (
                                        <div className="absolute inset-0 flex items-center justify-center text-indigo-600 animate-in fade-in zoom-in duration-200">
                                            <Square size={24} fill="currentColor" />
                                        </div>
                                    )}
                                </>
                            )}
                        </button>

                        {/* Progress Bar */}
                        {showPlaybackControls && (
                            <div
                                className="absolute left-16 bottom-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-white/90 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl shadow-xl border border-neutral-200 animate-in fade-in slide-in-from-left-4 duration-300 pointer-events-auto w-[calc(100vw-6rem)] sm:w-auto max-w-[95vw] sm:max-w-none"
                                onMouseEnter={openCoachMenu}
                                onMouseLeave={scheduleCloseCoachMenu}
                            >
                                <span className="text-[10px] font-mono text-neutral-500 tabular-nums w-8">
                                    {audioProgress.duration > 0 ? formatTime(audioProgress.currentTime) : '--:--'}
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max={audioProgress.duration > 0 ? audioProgress.duration : 1}
                                    step="0.1"
                                    value={audioProgress.duration > 0 ? audioProgress.currentTime : 0}
                                    onChange={handleSeek}
                                    disabled={audioProgress.duration <= 0}
                                    className="flex-1 h-1.5 bg-neutral-100 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-700 transition-all"
                                />
                                <span className="text-[10px] font-mono text-neutral-400 tabular-nums w-8">
                                    {audioProgress.duration > 0 ? formatTime(audioProgress.duration) : '--:--'}
                                </span>
                                {/* Media Controls Row */}
                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full">
                                    <button
                                        onClick={() => {
                                            const newTime = Math.max(0, audioProgress.currentTime - 5);
                                            seekAudio(newTime);
                                            setAudioProgress(prev => ({ ...prev, currentTime: newTime }));
                                        }}
                                        className="w-6 h-6 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center border border-neutral-200"
                                        title="Rewind 5 seconds"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 8L13 12V4L7 8ZM3 8L9 12V4L3 8Z" fill="currentColor"/></svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const newTime = Math.min(audioProgress.duration, audioProgress.currentTime + 5);
                                            seekAudio(newTime);
                                            setAudioProgress(prev => ({ ...prev, currentTime: newTime }));
                                        }}
                                        className="w-6 h-6 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center border border-neutral-200"
                                        title="Forward 5 seconds"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 8L3 4V12L9 8ZM13 8L7 4V12L13 8Z" fill="currentColor"/></svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (isAudioPaused) {
                                                resumeSpeaking().catch(() => showToast("Cannot resume audio.", "error"));
                                            } else {
                                                pauseSpeaking();
                                            }
                                        }}
                                        className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center justify-center border border-indigo-100"
                                        title={isAudioPaused ? "Resume audio" : "Pause audio"}
                                    >
                                        {isAudioPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
                                    </button>
                                    <button
                                        onClick={cyclePlaybackRate}
                                        className="h-6 px-2 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center border border-neutral-200 text-[10px] font-black tabular-nums"
                                        title="Playback speed"
                                    >
                                        {playbackRate.toFixed(playbackRate % 1 === 0 ? 1 : 2)}x
                                    </button>
                                    {markPoints.length > 0 && audioProgress.duration > 0 && (
                                        <div className="flex items-center gap-1 ml-1 border-l border-neutral-200 pl-2">
                                            {markPoints.map((pt, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => { seekAudio(pt); setAudioProgress(prev => ({ ...prev, currentTime: pt })); }}
                                                    className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-100"
                                                    title={`Jump to ${formatTime(pt)}`}
                                                >
                                                    {idx + 1}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 border-l border-neutral-200 pl-1 pr-0 ml-0">
                                        <button
                                            onClick={() => setMarkedTime(audioProgress.currentTime)}
                                            className="w-6 h-6 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors flex items-center justify-center border border-yellow-200"
                                            title="Mark current time"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>
                                        </button>
                                        <button
                                            onClick={() => {
                                                seekAudio(markedTime);
                                                setAudioProgress(prev => ({ ...prev, currentTime: markedTime }));
                                            }}
                                            className="w-10 h-6 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center border border-indigo-200 text-[11px] font-bold"
                                            title={`Play at marked time (${markedTime.toFixed(1)}s)`}
                                        >
                                            {markedTime.toFixed(1)}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {mimicTarget !== null && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />}
            <ToolsModal
                user={user}
                isOpen={isToolsModalOpen}
                onClose={() => setIsToolsModalOpen(false)}
                noteOnly={isNoteOnlyMode}
            />
        </>
    );
};
