import React from 'react';
import { Languages } from 'lucide-react';
import { StudyBuddyMemoryChunk, User } from '../../app/types';
import { SystemConfig, getServerUrl, getStudyBuddyAiUrl } from '../../app/settingsManager';
import { getGenerateLessonTestPrompt } from '../../services/prompts/getGenerateLessonTestPrompt';
import { getLessonPrompt } from '../../services/prompts/getRefineLessonPrompt';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import {
    buildStudyBuddyMessages,
    ChatCoachActionKey,
    ChatSearchMatch,
    ChatSaveActionType,
    ChatSaveContext,
    ChatTurn,
    createChatTurn,
    getStudyBuddySttLang,
    normalizeConversationTranscript,
    shouldForceSubmitConversationTurn,
    splitSpeakableSentences
} from '../../utils/studyBuddyChatUtils';
import { parseStudyBuddyMemoryDirectives } from '../../utils/studyBuddyMemoryUtils';

type MenuPos = { x: number; y: number; placement: 'top' | 'bottom' } | null;
type CoachVoiceConfig = {
    name?: string;
    viVoice?: string;
    viAccent?: string;
};

const STUDY_BUDDY_MEMORY_DIRECTIVE_MESSAGE = `If the user reveals durable personal info or asks you to remember something for future chats, append one hidden memory directive on its own line using this preferred syntax: [W_UMEM short memory chunk]. Example: [W_UMEM User prefers concise answers]. Keep each memory chunk minimal. Do not use this for temporary task details. Fast mode only disables Word Library study context, not long-term chat memory. Do not say that memory is unavailable just because Fast mode is on.`;

interface UseStudyBuddyChatOptions {
    config: SystemConfig;
    user: User;
    coach: CoachVoiceConfig;
    isContextAware: boolean;
    isChatLoading: boolean;
    isChatListening: boolean;
    chatInput: string;
    chatHistory: ChatTurn[];
    coachSelectionText: string;
    selectedTextRef: React.MutableRefObject<string>;
    chatAbortRef: React.MutableRefObject<AbortController | null>;
    chatRecognitionRef: React.MutableRefObject<SpeechRecognitionManager | null>;
    chatDraftPrefixRef: React.MutableRefObject<string>;
    isChatAudioEnabledRef: React.MutableRefObject<boolean>;
    isChatListeningRef: React.MutableRefObject<boolean>;
    isConversationModeRef: React.MutableRefObject<boolean>;
    isChatSpeakingRef: React.MutableRefObject<boolean>;
    conversationTranscriptRef: React.MutableRefObject<string>;
    conversationPendingSubmitRef: React.MutableRefObject<boolean>;
    conversationSilenceTimeoutRef: React.MutableRefObject<number | null>;
    conversationRestartTimeoutRef: React.MutableRefObject<number | null>;
    chatAbortReasonRef: React.MutableRefObject<'manual' | 'conversation-interrupt' | null>;
    chatSpeechQueueRef: React.MutableRefObject<Array<{ text: string }>>;
    setMessage: React.Dispatch<React.SetStateAction<any>>;
    setMenuPos: React.Dispatch<React.SetStateAction<MenuPos>>;
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setActiveChatCoachAction: React.Dispatch<React.SetStateAction<string | null>>;
    setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
    setIsChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setChatHistory: React.Dispatch<React.SetStateAction<ChatTurn[]>>;
    setChatInput: React.Dispatch<React.SetStateAction<string>>;
    setIsChatLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setIsChatAudioEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    setIsChatListening: React.Dispatch<React.SetStateAction<boolean>>;
    setIsConversationMode: React.Dispatch<React.SetStateAction<boolean>>;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    removeChatStatusTurn: (turnId: string) => void;
    stopChatListening: () => void;
    clearChatSpeechQueue: (stopCurrentAudio?: boolean) => void;
    clearConversationSilenceTimeout: () => void;
    clearConversationRestartTimeout: () => void;
    stopChatStream: (reason?: 'manual' | 'conversation-interrupt') => void;
    queueChatSpeech: (text: string) => void;
    onFallbackTranslateSelection: () => Promise<void>;
    speakText: (text: string, queue: boolean, lang: 'vi' | 'en', voice?: string, accent?: string) => Promise<void> | void;
    studyBuddyAiRequestConfig: {
        temperature: number;
        top_p: number;
        repetition_penalty: number;
    };
    chatConversationRestartDelayMs: number;
    chatConversationSilenceMs: number;
    chatConversationMaxChars: number;
    chatConversationMaxWords: number;
    getStudyBuddyMemoryChunks: () => StudyBuddyMemoryChunk[];
    saveMemoryTexts: (memoryTexts: string[]) => Promise<void>;
}

export function useStudyBuddyChat({
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
    chatSpeechQueueRef,
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
    onFallbackTranslateSelection,
    speakText,
    studyBuddyAiRequestConfig,
    chatConversationRestartDelayMs,
    chatConversationSilenceMs,
    chatConversationMaxChars,
    chatConversationMaxWords,
    getStudyBuddyMemoryChunks,
    saveMemoryTexts,
}: UseStudyBuddyChatOptions) {
    function formatSearchSectionLabel(section: string) {
        const normalized = String(section || '').trim().toLowerCase();
        switch (normalized) {
            case 'example':
                return 'Example';
            case 'collocation':
                return 'Collocation';
            case 'paraphrase':
                return 'Paraphrase';
            case 'idiom':
                return 'Idiom';
            case 'private note':
            case 'note':
                return 'Private Note';
            default:
                return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Match';
        }
    }

    function formatSearchFinalMessage(payload: any) {
        const matches = Array.isArray(payload?.matches) ? payload.matches : [];
        if (!matches.length) {
            return {
                content: typeof payload?.response === 'string' && payload.response.trim()
                    ? `## Search Result\n\n${payload.response.trim()}`
                    : '## Search Result\n\nI could not find a relevant match in your Vocabulary Library.',
                moreMatches: [] as ChatSearchMatch[],
            };
        }

        const [bestMatch, ...restMatches] = matches;
        const extras = [
            bestMatch?.register ? `- **Register:** ${bestMatch.register}` : '',
            bestMatch?.context ? `- **Context:** ${bestMatch.context}` : '',
            bestMatch?.hint ? `- **Hint:** ${bestMatch.hint}` : ''
        ].filter(Boolean);

        const content = [
            '## Best Match',
            '',
            `**Word:** ${bestMatch?.word || 'Unknown'}`,
            `**Type:** ${formatSearchSectionLabel(bestMatch?.section || '')}`,
            '',
            `> ${bestMatch?.text || ''}`,
            ...(extras.length ? ['', ...extras] : [])
        ].join('\n');

        return {
            content,
            moreMatches: restMatches as ChatSearchMatch[],
        };
    }

    function getActiveActionText() {
        return (
            chatInput.trim()
            || selectedTextRef.current
            || coachSelectionText
            || window.getSelection()?.toString().trim()
            || ''
        ).trim();
    }

    async function submitChatPrompt(
        rawPrompt: string,
        options?: {
            continueConversation?: boolean;
            stopListening?: boolean;
        }
    ) {
        const prompt = rawPrompt.trim();
        if (!prompt || isChatLoading) return;
        const memoryChunks = getStudyBuddyMemoryChunks();
        if (options?.stopListening !== false) {
            stopChatListening();
        }

        const nextUserTurn = createChatTurn('user', prompt);
        const statusTurnId = `status-${Date.now()}`;
        const assistantId = `assistant-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        const nextHistory = [...chatHistory, nextUserTurn];
        let spokenCursor = 0;
        let conversationListenerRearmed = false;
        const extraSystemMessages = [
            ...(options?.continueConversation
                ? ['Conversation mode is active. Do not use emojis in your response.']
                : []),
            STUDY_BUDDY_MEMORY_DIRECTIVE_MESSAGE
        ];

        setChatHistory(nextHistory);
        setChatInput(options?.continueConversation ? prompt : '');
        setIsChatOpen(true);
        setIsChatLoading(true);
        setIsThinking(false);
        clearChatSpeechQueue(true);
        chatAbortReasonRef.current = null;

        const controller = new AbortController();
        chatAbortRef.current = controller;
        if (controller.signal.aborted || chatAbortRef.current !== controller) {
            removeChatStatusTurn(statusTurnId);
            setIsChatLoading(false);
            return;
        }
        setChatHistory((current) => [...current, { id: assistantId, role: 'assistant', kind: 'message', content: '' }]);

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
                        nextHistory.map((turn) => ({ role: turn.role, content: turn.content })),
                        extraSystemMessages,
                        memoryChunks
                    ),
                    ...studyBuddyAiRequestConfig,
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
            const persistedMemories = new Set<string>();

            const appendDelta = (payload: any) => {
                const delta = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;
                if (typeof delta === 'string') {
                    assistantText += delta;
                } else if (Array.isArray(delta)) {
                    for (const part of delta) {
                        if (typeof part?.text === 'string') assistantText += part.text;
                    }
                }
                const parsed = parseStudyBuddyMemoryDirectives(assistantText);
                if (parsed.memories.length) {
                    const freshMemories = parsed.memories.filter((text) => !persistedMemories.has(text));
                    if (freshMemories.length) {
                        freshMemories.forEach((text) => persistedMemories.add(text));
                        void saveMemoryTexts(freshMemories);
                    }
                }
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: parsed.visibleText, hasMemoryWrite: turn.hasMemoryWrite || parsed.memories.length > 0 }
                            : turn
                    )
                );
                removeChatStatusTurn(statusTurnId);
                if (options?.continueConversation && !conversationListenerRearmed && isConversationModeRef.current) {
                    conversationListenerRearmed = true;
                    clearConversationRestartTimeout();
                    conversationRestartTimeoutRef.current = window.setTimeout(() => {
                        conversationRestartTimeoutRef.current = null;
                        if (!isConversationModeRef.current || isChatListeningRef.current) return;
                        void startConversationListening();
                    }, chatConversationRestartDelayMs);
                }
                if (isChatAudioEnabledRef.current) {
                    const pendingChunk = parsed.visibleText.slice(spokenCursor);
                    const { sentences, remainder } = splitSpeakableSentences(pendingChunk);
                    if (sentences.length > 0) {
                        for (const sentence of sentences) {
                            queueChatSpeech(sentence);
                        }
                        spokenCursor = parsed.visibleText.length - remainder.length;
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

            const parsedFinal = parseStudyBuddyMemoryDirectives(assistantText);
            if (!parsedFinal.visibleText.trim()) {
                removeChatStatusTurn(statusTurnId);
                updateAssistantTurn(parsedFinal.memories.length ? 'OK' : 'Connected to AI but not receive response');
            } else if (isChatAudioEnabledRef.current) {
                const trailing = parsedFinal.visibleText.slice(spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }
        } catch (error: any) {
            const abortReason = chatAbortReasonRef.current;
            chatAbortReasonRef.current = null;
            if (error?.name === 'AbortError') {
                removeChatStatusTurn(statusTurnId);
                setChatHistory((current) =>
                    abortReason === 'conversation-interrupt'
                        ? current.filter((turn) => !(turn.id === assistantId && !turn.content.trim()))
                        : current.map((turn) =>
                            turn.id === assistantId && !turn.content.trim()
                                ? { ...turn, content: 'Stopped response' }
                                : turn
                        )
                );
            } else {
                removeChatStatusTurn(statusTurnId);
                console.error(error);
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: 'Not able to reach AI' }
                            : turn
                    )
                );
                showToast('StudyBuddy AI connection failed.', 'error');
            }
        } finally {
            if (chatAbortRef.current === controller) {
                chatAbortRef.current = null;
            }
            removeChatStatusTurn(statusTurnId);
            setIsChatLoading(false);
            if (options?.continueConversation && isConversationModeRef.current && !isChatListeningRef.current) {
                clearConversationRestartTimeout();
                conversationRestartTimeoutRef.current = window.setTimeout(() => {
                    conversationRestartTimeoutRef.current = null;
                    if (!isConversationModeRef.current || isChatListeningRef.current) return;
                    void startConversationListening();
                }, chatConversationRestartDelayMs);
            }
        }
    }

    async function finalizeConversationTurn(rawText?: string) {
        const prompt = normalizeConversationTranscript(rawText || conversationTranscriptRef.current);
        conversationTranscriptRef.current = '';
        conversationPendingSubmitRef.current = false;
        clearConversationSilenceTimeout();
        setChatInput(prompt);

        if (!isConversationModeRef.current) return;
        if (!prompt) {
            clearConversationRestartTimeout();
            conversationRestartTimeoutRef.current = window.setTimeout(() => {
                conversationRestartTimeoutRef.current = null;
                if (!isConversationModeRef.current || isChatListeningRef.current) return;
                void startConversationListening();
            }, chatConversationRestartDelayMs);
            return;
        }

        await submitChatPrompt(prompt, { continueConversation: true, stopListening: false });
    }

    function scheduleConversationAutoSubmit(text: string) {
        clearConversationSilenceTimeout();
        if (!isConversationModeRef.current || !normalizeConversationTranscript(text)) return;
        conversationSilenceTimeoutRef.current = window.setTimeout(() => {
            conversationSilenceTimeoutRef.current = null;
            conversationPendingSubmitRef.current = true;
            chatRecognitionRef.current?.stop();
        }, chatConversationSilenceMs);
    }

    async function startConversationListening() {
        if (!isConversationModeRef.current || isChatListeningRef.current) return;

        if (!chatRecognitionRef.current) {
            chatRecognitionRef.current = new SpeechRecognitionManager();
        }

        const supported = typeof window !== 'undefined'
            && (((window as any).SpeechRecognition) || ((window as any).webkitSpeechRecognition));
        if (!supported) {
            setIsConversationMode(false);
            isConversationModeRef.current = false;
            showToast('Speech-to-text is not supported in this browser.', 'error');
            return;
        }

        clearConversationSilenceTimeout();
        clearConversationRestartTimeout();
        conversationPendingSubmitRef.current = false;
        const sttLang = getStudyBuddySttLang(chatInput, config.interface.studyBuddyLanguage);

        try {
            setIsChatListening(true);
            await chatRecognitionRef.current.start(
                (final, interim) => {
                    if (!isConversationModeRef.current) return;

                    const combined = normalizeConversationTranscript(`${final} ${interim}`);
                    if (!combined) return;

                    if (chatAbortRef.current || isChatSpeakingRef.current || chatSpeechQueueRef.current.length > 0) {
                        stopChatStream('conversation-interrupt');
                        clearChatSpeechQueue(true);
                    }

                    conversationTranscriptRef.current = combined;
                    setChatInput(combined);
                    scheduleConversationAutoSubmit(combined);

                    if (shouldForceSubmitConversationTurn(combined, chatConversationMaxChars, chatConversationMaxWords)) {
                        conversationPendingSubmitRef.current = true;
                        clearConversationSilenceTimeout();
                        chatRecognitionRef.current?.stop();
                    }
                },
                (finalTranscript) => {
                    setIsChatListening(false);
                    clearConversationSilenceTimeout();

                    if (!isConversationModeRef.current) return;

                    const finalText = normalizeConversationTranscript(finalTranscript || conversationTranscriptRef.current);
                    conversationTranscriptRef.current = finalText;
                    setChatInput(finalText);

                    if (conversationPendingSubmitRef.current || finalText) {
                        void finalizeConversationTurn(finalText);
                        return;
                    }

                    clearConversationRestartTimeout();
                    conversationRestartTimeoutRef.current = window.setTimeout(() => {
                        conversationRestartTimeoutRef.current = null;
                        if (!isConversationModeRef.current || isChatListeningRef.current) return;
                        void startConversationListening();
                    }, chatConversationRestartDelayMs);
                },
                sttLang
            );
        } catch (error) {
            console.error(error);
            setIsChatListening(false);
            if (isConversationModeRef.current) {
                showToast('Cannot start conversation microphone.', 'error');
            }
        }
    }

    async function handleToggleConversationMode() {
        if (isConversationModeRef.current) {
            setIsConversationMode(false);
            isConversationModeRef.current = false;
            clearConversationSilenceTimeout();
            clearConversationRestartTimeout();
            conversationPendingSubmitRef.current = false;
            conversationTranscriptRef.current = '';
            stopChatStream();
            stopChatListening();
            clearChatSpeechQueue(true);
            setChatInput('');
            return;
        }

        setIsChatOpen(true);
        setIsConversationMode(true);
        isConversationModeRef.current = true;
        setIsChatAudioEnabled(true);
        setChatInput('');
        await startConversationListening();
    }

    async function handleSendChat() {
        await submitChatPrompt(chatInput, { continueConversation: false, stopListening: true });
    }

    async function handleBackgroundChatRequest(prompt: string) {
        const cleanPrompt = prompt.trim();
        if (!cleanPrompt || isChatLoading) return;
        const memoryChunks = getStudyBuddyMemoryChunks();
        stopChatListening();

        const statusTurnId = `status-bg-${Date.now()}`;
        const assistantId = `assistant-bg-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        let spokenCursor = 0;
        const extraSystemMessages = [STUDY_BUDDY_MEMORY_DIRECTIVE_MESSAGE];

        setIsChatOpen(true);
        setIsChatLoading(true);
        setIsThinking(false);
        clearChatSpeechQueue(true);

        const controller = new AbortController();
        chatAbortRef.current = controller;
        if (controller.signal.aborted || chatAbortRef.current !== controller) {
            removeChatStatusTurn(statusTurnId);
            setIsChatLoading(false);
            return;
        }
        setChatHistory((current) => [
            ...current,
            { id: assistantId, role: 'assistant', kind: 'message', content: '' }
        ]);

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
                        [{ role: 'user', content: cleanPrompt }],
                        extraSystemMessages,
                        memoryChunks
                    ),
                    ...studyBuddyAiRequestConfig,
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
            const persistedMemories = new Set<string>();

            const appendDelta = (payload: any) => {
                const delta = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;
                if (typeof delta === 'string') {
                    assistantText += delta;
                } else if (Array.isArray(delta)) {
                    for (const part of delta) {
                        if (typeof part?.text === 'string') assistantText += part.text;
                    }
                }
                const parsed = parseStudyBuddyMemoryDirectives(assistantText);
                if (parsed.memories.length) {
                    const freshMemories = parsed.memories.filter((text) => !persistedMemories.has(text));
                    if (freshMemories.length) {
                        freshMemories.forEach((text) => persistedMemories.add(text));
                        void saveMemoryTexts(freshMemories);
                    }
                }
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: parsed.visibleText, hasMemoryWrite: turn.hasMemoryWrite || parsed.memories.length > 0 }
                            : turn
                    )
                );
                removeChatStatusTurn(statusTurnId);
                if (isChatAudioEnabledRef.current) {
                    const pendingChunk = parsed.visibleText.slice(spokenCursor);
                    const { sentences, remainder } = splitSpeakableSentences(pendingChunk);
                    if (sentences.length > 0) {
                        for (const sentence of sentences) {
                            queueChatSpeech(sentence);
                        }
                        spokenCursor = parsed.visibleText.length - remainder.length;
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

            const parsedFinal = parseStudyBuddyMemoryDirectives(assistantText);
            if (!parsedFinal.visibleText.trim()) {
                removeChatStatusTurn(statusTurnId);
                updateAssistantTurn(parsedFinal.memories.length ? 'OK' : 'AI server da ket noi, nhung chua tra ve noi dung.');
            } else if (isChatAudioEnabledRef.current) {
                const trailing = parsedFinal.visibleText.slice(spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                removeChatStatusTurn(statusTurnId);
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId && !turn.content.trim()
                            ? { ...turn, content: 'Da dung phan hoi.' }
                            : turn
                    )
                );
            } else {
                removeChatStatusTurn(statusTurnId);
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
            removeChatStatusTurn(statusTurnId);
            setIsChatLoading(false);
        }
    }

    async function requestStudyBuddyAiText(userPrompt: string, isStreamed = true): Promise<string> {
        const aiUrl = getStudyBuddyAiUrl(config);
        const memoryChunks = getStudyBuddyMemoryChunks();
        const res = await fetch(aiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: buildStudyBuddyMessages(
                    user,
                    isContextAware,
                    [{ role: 'user', content: userPrompt }],
                    [],
                    memoryChunks
                ),
                ...studyBuddyAiRequestConfig,
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
    }

    async function handleChatCoachTranslate() {
        const selectedText = getActiveActionText();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;

        setActiveChatCoachAction('translate');
        setIsThinking(true);

        try {
            const translation = await requestStudyBuddyAiText(
                `Translate this into natural Vietnamese for an IELTS learner. Keep it concise and compacted, minimal, focus on meaning, max 20 words, don't need extra example.\n\nText: ${selectedText}`,
                false
            );

            setMessage({
                text: translation,
                icon: React.createElement(Languages, { size: 18, className: 'text-blue-500' })
            });
            setMenuPos(null);
            setIsOpen(true);
            await speakText(translation, false, 'vi', coach.viVoice, coach.viAccent);
        } catch (error) {
            console.error(error);
            await onFallbackTranslateSelection();
        } finally {
            setIsThinking(false);
            setActiveChatCoachAction(null);
        }
    }

    async function handleChatCoachSearch() {
        const selectedText = getActiveActionText();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;

        setActiveChatCoachAction('search');
        setIsThinking(true);
        setIsChatLoading(true);
        setIsChatOpen(true);

        const userTurn = createChatTurn('user', `Search Vocabulary Library: ${selectedText}`);
        const assistantId = `assistant-search-${Date.now()}`;

        setChatHistory((current) => [
            ...current,
            userTurn,
            { id: assistantId, role: 'assistant', kind: 'message', content: 'Mình đang thử tìm các cách diễn đạt tiếng Anh gần nhất...' }
        ]);

        try {
            const controller = new AbortController();
            chatAbortRef.current = controller;
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/studybuddy/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    data: selectedText,
                    userName: user.name
                })
            });

            if (!res.ok) {
                throw new Error(`Search server error ${res.status}`);
            }

            if (!res.body) {
                throw new Error('Search server did not return a stream.');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffered = '';
            let finalUpdated = false;
            const stageTexts: string[] = [];

            const updateAssistant = (content: string) => {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content, searchResultMeta: undefined }
                            : turn
                    )
                );
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
                        if (!raw) continue;

                        try {
                            const payload = JSON.parse(raw);
                            if (payload?.type === 'stage' && typeof payload.text === 'string' && payload.text.trim()) {
                                stageTexts.push(payload.text.trim());
                                updateAssistant(stageTexts.join('\n\n'));
                            }
                            if (payload?.type === 'final') {
                                const formatted = formatSearchFinalMessage(payload);
                                setChatHistory((current) =>
                                    current.map((turn) =>
                                        turn.id === assistantId
                                            ? {
                                                ...turn,
                                                content: formatted.content,
                                                searchResultMeta: formatted.moreMatches.length
                                                    ? { moreMatches: formatted.moreMatches }
                                                    : undefined,
                                            }
                                            : turn
                                    )
                                );
                                finalUpdated = true;
                            }
                            if (payload?.type === 'error') {
                                throw new Error(typeof payload.error === 'string' ? payload.error : 'Search request failed.');
                            }
                        } catch (error) {
                            if (error instanceof Error) throw error;
                        }
                    }
                }
            }

            if (!finalUpdated) {
                throw new Error('Search stream ended without final payload.');
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, content: 'Search canceled.' }
                            : turn
                    )
                );
                return;
            }
            console.error(error);
            setChatHistory((current) =>
                current.map((turn) =>
                    turn.id === assistantId
                        ? { ...turn, content: error?.message || 'Search request failed.' }
                        : turn
                )
            );
            showToast('Search request failed.', 'error');
        } finally {
            chatAbortRef.current = null;
            setIsChatLoading(false);
            setIsThinking(false);
            setActiveChatCoachAction(null);
        }
    }

    async function handleChatCoachPromptToChat(
        actionKey: ChatCoachActionKey,
        promptLabel: string,
        promptBuilder: (selectedText: string) => string,
        options?: {
            saveActionType?: ChatSaveActionType;
        }
    ) {
        const selectedText = getActiveActionText();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;

        const userPrompt = promptBuilder(selectedText);
        const userTurn = createChatTurn('user', `${promptLabel}: ${selectedText}`);
        const assistantId = `assistant-${actionKey}-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        const memoryChunks = getStudyBuddyMemoryChunks();
        const inferredSaveActionType = options?.saveActionType ?? (actionKey === 'test' ? undefined : actionKey);
        const saveContext: ChatSaveContext | undefined = inferredSaveActionType
            ? {
                actionType: inferredSaveActionType,
                targetWord: selectedText,
                sourceSelection: selectedText
            }
            : undefined;

        setActiveChatCoachAction(actionKey);
        setIsChatLoading(true);
        setChatHistory((current) => [
            ...current,
            userTurn,
            { id: assistantId, role: 'assistant', content: '', ...(saveContext ? { saveContext } : {}) }
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
                        [{ role: 'user', content: userPrompt }],
                        [],
                        memoryChunks
                    ),
                    ...studyBuddyAiRequestConfig,
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
                        turn.id === assistantId ? { ...turn, content: text, ...(saveContext ? { saveContext } : {}) } : turn
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
                    const lines = part.split('\n').map((line) => line.trim()).filter(Boolean);

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
    }

    async function handleChatCoachTest() {
        await handleChatCoachPromptToChat(
            'test',
            'Test',
            (selectedText) => getGenerateLessonTestPrompt(
                selectedText,
                selectedText,
                `Create a focused practice test for this query: ${selectedText}`,
                []
            )
        );
    }

    async function handleChatCoachExplain() {
        await handleChatCoachPromptToChat(
            'explain',
            'Explain',
            (selectedText) => getLessonPrompt({
                task: 'create_reading',
                topic: selectedText,
                userRequest: `Explain clearly and compactly for this query: ${selectedText}`,
                language: user.lessonPreferences?.language || 'English',
                targetAudience: user.lessonPreferences?.targetAudience || 'Adult',
                tone: user.lessonPreferences?.tone || 'professional_professor',
                coachName: coach.name || 'StudyBuddy',
                format: 'reading',
                displayDirect: true
            })
        );
    }

    async function handleToggleChatMic() {
        if (isConversationModeRef.current) return;
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
    }

    return {
        handleBackgroundChatRequest,
        handleChatCoachPromptToChat,
        handleChatCoachExplain,
        handleChatCoachSearch,
        handleChatCoachTest,
        handleChatCoachTranslate,
        handleSendChat,
        handleToggleChatMic,
        handleToggleConversationMode,
    };
}
