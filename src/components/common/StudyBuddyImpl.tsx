
import React, { useState, useEffect, useRef } from 'react';
import { User, AppView, WordQuality, VocabularyItem, CollocationDetail, ParaphraseOption, PrepositionPattern, StudyBuddyMemoryChunk, WordFamily } from '../../app/types';
import { Bot, NotebookPen, ListCollapse, BringToFront, Blocks, X, MessageSquare, Languages, Volume2, Mic, Binary, Loader2, Plus, Eye, Search, Wrench, Pause, Play, Square, PenTool, Star, Sparkles, Save } from 'lucide-react';
import { getConfig, SystemConfig, getServerUrl } from '../../app/settingsManager';
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking, getIsSpeaking, getIsAudioPaused, getIsSingleWordPlayback, getPlaybackRate, setPlaybackRate, getAudioProgress, seekAudio, getMarkPoints, detectLanguage, prefetchSpeech } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { SimpleMimicModal } from './SimpleMimicModal';
import * as dataStore from '../../app/dataStore';
import { getAllUsers, saveUser } from '../../app/db';
import { createNewWord, calculateComplexity, calculateMasteryScore } from '../../utils/srs';
import { lookupWordsInGlobalLibrary } from '../../services/backupService';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { ToolsModal } from '../tools/ToolsModal';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { autoRefineNewWords } from '../../services/wordRefinePersistence';
import { StudyBuddyChatPanel } from './StudyBuddyChatPanel';
import { StudyBuddyChatCoachActionBar, StudyBuddyCommandBox } from './StudyBuddyCoachControls';
import { StudyBuddySaveModal } from './StudyBuddySaveModal';
import { StudyBuddyMessageCard } from './StudyBuddyMessageCard';
import { useStudyBuddyChat } from './useStudyBuddyChat';
import { getStudyBuddyCoachPrompt } from '../../services/prompts/getStudyBuddyCoachPrompt';
import {
    CambridgePronunciation,
    cleanExampleSentence,
    getAvatarProps,
    getSuggestedSaveSections,
    inferWordFamilyBucket,
    mergeTextBlock,
    normalizeCambridgePronunciations,
    normalizeParaphraseTone,
    normalizeSaveLine,
    ParsedPairItem,
    ParsedWordFamilyItem,
    parseStructuredPairs,
    parseWordFamilyItems,
    stripMarkdownForSave
} from '../../utils/studyBuddyUtils';
import {
    ChatSaveSection,
    ChatTurn,
    createChatTurn,
    SAVE_SECTION_LABELS,
    splitMixedLanguageSegments,
    splitSpeakableSentences
} from '../../utils/studyBuddyChatUtils';
import { mergeStudyBuddyMemoryChunks, parseStudyBuddyMemoryDirectives } from '../../utils/studyBuddyMemoryUtils';

const MAX_READ_LENGTH = 1000;
const MAX_MIMIC_LENGTH = 1600;
const CHAT_AUDIO_PREFETCH_AHEAD = 2;
const CHAT_CONVERSATION_SILENCE_MS = 1200;
const CHAT_CONVERSATION_RESTART_DELAY_MS = 220;
const CHAT_CONVERSATION_MAX_CHARS = 220;
const CHAT_CONVERSATION_MAX_WORDS = 40;
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

interface CambridgeSimpleResult {
    exists: boolean;
    url?: string;
    word?: string;
    pronunciations?: CambridgePronunciation[];
}

interface ChatSaveDraft {
    turnId: string;
    sourceText: string;
    targetWord: string;
    selectedSection: ChatSaveSection;
    exampleLines: string[];
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
    const [memoryChunks, setMemoryChunks] = useState<StudyBuddyMemoryChunk[]>(user.studyBuddyMemory || []);
    const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isChatAudioEnabled, setIsChatAudioEnabled] = useState(false);
    const [isContextAware, setIsContextAware] = useState(false);
    const [isChatListening, setIsChatListening] = useState(false);
    const [isConversationMode, setIsConversationMode] = useState(false);
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
    const isChatListeningRef = useRef(isChatListening);
    const isConversationModeRef = useRef(isConversationMode);
    const conversationTranscriptRef = useRef('');
    const conversationPendingSubmitRef = useRef(false);
    const memoryChunksRef = useRef<StudyBuddyMemoryChunk[]>(user.studyBuddyMemory || []);
    const conversationSilenceTimeoutRef = useRef<number | null>(null);
    const conversationRestartTimeoutRef = useRef<number | null>(null);
    const chatAbortReasonRef = useRef<'manual' | 'conversation-interrupt' | null>(null);
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

    useEffect(() => {
        let isMounted = true;
        setMemoryChunks(user.studyBuddyMemory || []);
        memoryChunksRef.current = user.studyBuddyMemory || [];

        void (async () => {
            const storedUser = (await getAllUsers()).find((item) => item.id === user.id);
            if (isMounted && storedUser?.studyBuddyMemory) {
                setMemoryChunks(storedUser.studyBuddyMemory);
                memoryChunksRef.current = storedUser.studyBuddyMemory;
            }
        })();

        return () => {
            isMounted = false;
        };
    }, [user.id, user.studyBuddyMemory]);

    const persistMemoryChunks = async (nextChunks: StudyBuddyMemoryChunk[]) => {
        setMemoryChunks(nextChunks);
        memoryChunksRef.current = nextChunks;
        const storedUser = (await getAllUsers()).find((item) => item.id === user.id) || user;
        await saveUser({
            ...storedUser,
            studyBuddyMemory: nextChunks
        });
    };

    const saveMemoryTexts = async (memoryTexts: string[]) => {
        if (!memoryTexts.length) return;
        const { merged } = mergeStudyBuddyMemoryChunks(memoryChunksRef.current, memoryTexts, 'auto');
        if (merged.length === memoryChunksRef.current.length) return;
        await persistMemoryChunks(merged);
    };

    const handleDeleteMemory = async (memoryId: string) => {
        const nextChunks = memoryChunks.filter((chunk) => chunk.id !== memoryId);
        setMemoryChunks(nextChunks);
        await persistMemoryChunks(nextChunks);
    };

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

    const getCoachActionText = () => (
        chatInput.trim()
        || selectedTextRef.current
        || coachSelectionText
        || window.getSelection()?.toString().trim()
        || ''
    ).trim();

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
        const actionType = turn.saveContext?.actionType;
        const lockedSection: ChatSaveSection = actionType === 'examples'
            ? 'example'
            : actionType === 'collocations'
                ? 'collocation'
                : actionType === 'paraphrase'
                    ? 'paraphrase'
                    : actionType === 'wordFamily'
                        ? 'wordFamily'
                        : (getSuggestedSaveSections(sourceText, turn.saveContext)[0] || 'example');
        const exampleLines = sourceText
            .split('\n')
            .map((line) => cleanExampleSentence(line))
            .filter(Boolean);
        const parsedPairs = parseStructuredPairs(sourceText);
        const fallbackPairs = sourceText
            .split('\n')
            .map((line) => ({ item: normalizeSaveLine(line), context: '' }))
            .filter((item) => item.item);
        const parsedWordFamily = parseWordFamilyItems(sourceText);
        const fallbackWordFamily = sourceText
            .split('\n')
            .map((line) => normalizeSaveLine(line))
            .filter(Boolean)
            .map((word) => ({ word, note: '', bucket: inferWordFamilyBucket(word, '') as keyof WordFamily }));

        setChatSaveDraft({
            turnId: turn.id,
            sourceText,
            targetWord: turn.saveContext?.targetWord || '',
            selectedSection: lockedSection,
            exampleLines,
            parsedPairs: parsedPairs.length > 0 ? parsedPairs : fallbackPairs,
            parsedWordFamily: parsedWordFamily.length > 0 ? parsedWordFamily : fallbackWordFamily
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
                const cleanedExamples = chatSaveDraft.exampleLines
                    .map((line) => cleanExampleSentence(line))
                    .filter(Boolean)
                    .join('\n');
                updatedWord.example = mergeTextBlock(updatedWord.example, cleanedExamples);
            }

            if (chatSaveDraft.selectedSection === 'collocation') {
                const nextItems = chatSaveDraft.parsedPairs;
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
                const nextItems = chatSaveDraft.parsedPairs;
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
                const nextItems = chatSaveDraft.parsedPairs;
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
                const nextItems = chatSaveDraft.parsedWordFamily;

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

    const stopChatStream = (reason: 'manual' | 'conversation-interrupt' = 'manual') => {
        chatAbortReasonRef.current = reason;
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

    const clearConversationSilenceTimeout = () => {
        if (conversationSilenceTimeoutRef.current !== null) {
            window.clearTimeout(conversationSilenceTimeoutRef.current);
            conversationSilenceTimeoutRef.current = null;
        }
    };

    const clearConversationRestartTimeout = () => {
        if (conversationRestartTimeoutRef.current !== null) {
            window.clearTimeout(conversationRestartTimeoutRef.current);
            conversationRestartTimeoutRef.current = null;
        }
    };

    const removeChatStatusTurn = (turnId: string) => {
        setChatHistory((current) => current.filter((turn) => turn.id !== turnId));
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
            clearConversationSilenceTimeout();
            clearConversationRestartTimeout();
            chatRecognitionRef.current?.stop();
            disableSelectionPreservation();
        };
    }, []);

    useEffect(() => {
        const handleSelectionChange = () => {
            if (!shouldPreserveSelectionRef.current) return;
            const selection = window.getSelection();
            const anchorNode = selection?.anchorNode;
            const focusNode = selection?.focusNode;
            if (
                (anchorNode && chatPanelRef.current?.contains(anchorNode))
                || (focusNode && chatPanelRef.current?.contains(focusNode))
            ) {
                return;
            }
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
        isChatListeningRef.current = isChatListening;
    }, [isChatListening]);

    useEffect(() => {
        isConversationModeRef.current = isConversationMode;
    }, [isConversationMode]);

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
            const parsed = parseStudyBuddyMemoryDirectives(custom.detail?.content || '');
            const content = parsed.visibleText.trim();
            if (parsed.memories.length) {
                void saveMemoryTexts(parsed.memories);
            }
            if (!content) return;

            setIsChatOpen(true);
            setIsChatLoading(false);
            setIsThinking(false);
            setChatHistory((current) => [
                ...current,
                { ...createChatTurn('assistant', content), hasMemoryWrite: parsed.memories.length > 0 }
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
                    const parsed = parseStudyBuddyMemoryDirectives(`${turn.content}${delta}`);
                    nextContent = parsed.visibleText;
                    if (parsed.memories.length) {
                        void saveMemoryTexts(parsed.memories);
                    }
                    return { ...turn, content: nextContent, hasMemoryWrite: turn.hasMemoryWrite || parsed.memories.length > 0 };
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
                setIsConversationMode(false);
                isConversationModeRef.current = false;
                clearConversationSilenceTimeout();
                clearConversationRestartTimeout();
                conversationPendingSubmitRef.current = false;
                conversationTranscriptRef.current = '';
                stopChatStream();
                clearChatSpeechQueue(true);
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

    const handleTranslateSelection = async () => {
        const selectedText = getCoachActionText();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;

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

    const {
        handleBackgroundChatRequest,
        handleChatCoachPromptToChat,
        handleChatCoachExplain,
        handleChatCoachSearch,
        handleChatCoachTest,
        handleChatCoachTranslate,
        handleSendChat,
        handleToggleChatMic,
        handleToggleConversationMode,
    } = useStudyBuddyChat({
        config,
        user,
        coach,
        isContextAware,
        isChatLoading,
        isChatListening,
        chatInput,
        chatHistory,
        coachSelectionText,
        selectedTextRef,
        chatAbortRef,
        chatRecognitionRef,
        chatDraftPrefixRef,
        isChatAudioEnabledRef,
        isChatListeningRef,
        isConversationModeRef,
        isChatSpeakingRef,
        conversationTranscriptRef,
        conversationPendingSubmitRef,
        conversationSilenceTimeoutRef,
        conversationRestartTimeoutRef,
        chatAbortReasonRef,
        chatSpeechQueueRef: chatSpeechQueueRef as React.MutableRefObject<Array<{ text: string }>>,
        setMessage,
        setMenuPos,
        setIsOpen,
        setActiveChatCoachAction,
        setIsThinking,
        setIsChatOpen,
        setChatHistory,
        setChatInput,
        setIsChatLoading,
        setIsChatAudioEnabled,
        setIsChatListening,
        setIsConversationMode,
        showToast,
        removeChatStatusTurn,
        stopChatListening,
        clearChatSpeechQueue,
        clearConversationSilenceTimeout,
        clearConversationRestartTimeout,
        stopChatStream,
        queueChatSpeech,
        onFallbackTranslateSelection: handleTranslateSelection,
        speakText: speak,
        studyBuddyAiRequestConfig: STUDY_BUDDY_AI_REQUEST_CONFIG,
        chatConversationRestartDelayMs: CHAT_CONVERSATION_RESTART_DELAY_MS,
        chatConversationSilenceMs: CHAT_CONVERSATION_SILENCE_MS,
        chatConversationMaxChars: CHAT_CONVERSATION_MAX_CHARS,
        chatConversationMaxWords: CHAT_CONVERSATION_MAX_WORDS,
        getStudyBuddyMemoryChunks: () => memoryChunksRef.current,
        saveMemoryTexts,
    });

    const handleReadAndIpa = async () => {
        const selectedText = getCoachActionText();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;
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
        const selectedText = getCoachActionText();
        if (!selectedText || isAlreadyInLibrary) return;
        selectedTextRef.current = selectedText;
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
        const selectedText = getCoachActionText();
        if (!selectedText || !user.id || !onViewWord || isAnyModalOpen) return;
        selectedTextRef.current = selectedText;
        const wordObj = await dataStore.findWordByText(user.id, selectedText);
        if (wordObj) {
            setIsOpen(false);
            setMenuPos(null);
            onViewWord(wordObj);
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

    const chatHeaderDescription = isConversationMode
        ? (isChatListening ? 'Conversation mode: listening...' : isChatLoading ? 'Conversation mode: AI is replying...' : 'Conversation mode: waiting for voice...')
        : 'Grammar, writing, speaking, tu vung';

    const chatSaveModal = (
        <StudyBuddySaveModal
            chatSaveDraft={chatSaveDraft}
            saveSectionLabels={SAVE_SECTION_LABELS}
            isSavingChatSnippet={isSavingChatSnippet}
            onClose={() => setChatSaveDraft(null)}
            onChangeTargetWord={(value) => setChatSaveDraft((current) => current ? { ...current, targetWord: value } : current)}
            onRemoveExampleLine={(index) => setChatSaveDraft((current) => current ? {
                ...current,
                exampleLines: current.exampleLines.filter((_, itemIndex) => itemIndex !== index)
            } : current)}
            onRemovePair={(index) => setChatSaveDraft((current) => current ? {
                ...current,
                parsedPairs: current.parsedPairs.filter((_, itemIndex) => itemIndex !== index)
            } : current)}
            onRemoveWordFamily={(index) => setChatSaveDraft((current) => current ? {
                ...current,
                parsedWordFamily: current.parsedWordFamily.filter((_, itemIndex) => itemIndex !== index)
            } : current)}
            onSave={handleSaveChatSnippet}
        />
    );

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
                    <StudyBuddyCommandBox
                        commandBoxRef={commandBoxRef}
                        isChatOpen={isChatOpen}
                        isAlreadyInLibrary={isAlreadyInLibrary}
                        isAddingToLibrary={isAddingToLibrary}
                        isAnyModalOpen={isAnyModalOpen}
                        selectedText={selectedTextRef.current || undefined}
                        onRestoreSelectedRange={(e) => {
                            e.preventDefault();
                            restoreSelectedRange();
                        }}
                        onRestoreSelectedRangeHover={restoreSelectedRange}
                        onTranslateSelection={handleTranslateSelection}
                        onReadAndIpa={handleReadAndIpa}
                        onSpeakSelection={handleSpeakSelection}
                        onOpenChatPanel={openChatPanel}
                        onAddToLibrary={handleAddToLibrary}
                        onViewWord={handleViewWord}
                        onOpenNote={handleOpenNote}
                        onOpenTools={handleOpenTools}
                    />
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
                            <StudyBuddyChatPanel
                                chatPanelRef={chatPanelRef}
                                chatScrollRef={chatScrollRef}
                                isConversationMode={isConversationMode}
                                isChatListening={isChatListening}
                                isChatLoading={isChatLoading}
                                isContextAware={isContextAware}
                                isChatAudioEnabled={isChatAudioEnabled}
                                chatHistory={chatHistory}
                                hasChatTextSelection={hasChatTextSelection}
                                chatInput={chatInput}
                                headerDescription={chatHeaderDescription}
                                memoryChunks={memoryChunks}
                                isMemoryPanelOpen={isMemoryPanelOpen}
                                chatCoachActionBar={
                                    <StudyBuddyChatCoachActionBar
                                        hasSelection={!!getCoachActionText()}
                                        activeChatCoachAction={activeChatCoachAction}
                                        isAlreadyInLibrary={isAlreadyInLibrary}
                                        isAddingToLibrary={isAddingToLibrary}
                                        isAnyModalOpen={isAnyModalOpen}
                                        onRestoreSelection={(e) => {
                                            if (!selectedTextRef.current && !coachSelectionText) return;
                                            e.preventDefault();
                                            restoreSelectedRange();
                                        }}
                                        onSearch={handleChatCoachSearch}
                                        onTranslate={handleChatCoachTranslate}
                                        onReadAndIpa={handleReadAndIpa}
                                        onAddToLibrary={handleAddToLibrary}
                                        onViewWord={handleViewWord}
                                        onExamples={() => handleChatCoachPromptToChat('examples', 'Examples', (selectedText) => getStudyBuddyCoachPrompt(selectedText, 'examples'))}
                                        onExplain={handleChatCoachExplain}
                                        onTest={handleChatCoachTest}
                                        onCollocations={() => handleChatCoachPromptToChat('collocations', 'Collocations', (selectedText) => getStudyBuddyCoachPrompt(selectedText, 'collocations'))}
                                        onParaphrase={() => handleChatCoachPromptToChat('paraphrase', 'Paraphrase', (selectedText) => getStudyBuddyCoachPrompt(selectedText, 'paraphrase'))}
                                        onWordFamily={() => handleChatCoachPromptToChat(
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
                                    />
                                }
                                chatSaveModal={chatSaveModal}
                                onToggleContextAware={() => setIsContextAware((prev) => !prev)}
                                onToggleConversationMode={handleToggleConversationMode}
                                onToggleChatAudio={() => setIsChatAudioEnabled((prev) => !prev)}
                                onToggleMemoryPanel={() => setIsMemoryPanelOpen((prev) => !prev)}
                                onDeleteMemory={handleDeleteMemory}
                                onClearChatHistory={handleClearChatHistory}
                                onClose={() => {
                                    stopChatStream();
                                    setIsConversationMode(false);
                                    isConversationModeRef.current = false;
                                    clearConversationSilenceTimeout();
                                    clearConversationRestartTimeout();
                                    conversationPendingSubmitRef.current = false;
                                    conversationTranscriptRef.current = '';
                                    clearChatSpeechQueue(true);
                                    stopChatListening();
                                    setIsChatOpen(false);
                                }}
                                onOpenSaveModal={openChatSaveModal}
                                onPointerDownInside={() => {
                                    disableSelectionPreservation();
                                }}
                                onChatInputChange={setChatInput}
                                onChatInputKeyDown={(e) => {
                                    if (isConversationMode) return;
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendChat();
                                    }
                                }}
                                onToggleChatMic={handleToggleChatMic}
                                onStopChatStream={stopChatStream}
                                onSendChat={handleSendChat}
                            />
                        )}
                        {isOpen && !menuPos && (
                            <div className="absolute bottom-16 left-0 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {message ? (
                                    <div ref={messageBoxRef}>
                                        <StudyBuddyMessageCard
                                            message={message}
                                            messageIndex={messageIndex}
                                            onPrev={() => setMessageIndex(i => Math.max(0, i - 1))}
                                            onNext={() => setMessageIndex(i => Math.min((message.texts?.length || 1) - 1, i + 1))}
                                            onClose={() => { setMessage(null); setIsOpen(false); setMenuPos(null); }}
                                            playCambridgeAudio={playCambridgeAudio}
                                        />
                                    </div>
                                ) : (
                                    <StudyBuddyCommandBox
                                        commandBoxRef={commandBoxRef}
                                        isChatOpen={isChatOpen}
                                        isAlreadyInLibrary={isAlreadyInLibrary}
                                        isAddingToLibrary={isAddingToLibrary}
                                        isAnyModalOpen={isAnyModalOpen}
                                        selectedText={selectedTextRef.current || undefined}
                                        onRestoreSelectedRange={(e) => {
                                            e.preventDefault();
                                            restoreSelectedRange();
                                        }}
                                        onRestoreSelectedRangeHover={restoreSelectedRange}
                                        onTranslateSelection={handleTranslateSelection}
                                        onReadAndIpa={handleReadAndIpa}
                                        onSpeakSelection={handleSpeakSelection}
                                        onOpenChatPanel={openChatPanel}
                                        onAddToLibrary={handleAddToLibrary}
                                        onViewWord={handleViewWord}
                                        onOpenNote={handleOpenNote}
                                        onOpenTools={handleOpenTools}
                                    />
                                )}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                openChatPanel();
                            }}
                            className={`absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-neutral-900 text-white border-2 border-white shadow-lg flex items-center justify-center hover:scale-105 transition-all z-30 ${
                                isChatOpen ? 'opacity-0 pointer-events-none scale-90' : 'pointer-events-auto opacity-100'
                            }`}
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
