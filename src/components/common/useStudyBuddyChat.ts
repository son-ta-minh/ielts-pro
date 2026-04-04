import React from 'react';
import { Languages } from 'lucide-react';
import { StudyBuddyImageSettings, StudyBuddyMemoryChunk, User } from '../../app/types';
import { SystemConfig, getServerUrl, getStudyBuddyAiUrl } from '../../app/settingsManager';
import { getStudyBuddyExplainPrompt } from '../../services/prompts/getStudyBuddyExplainPrompt';
import { getStudyBuddyTestPrompt } from '../../services/prompts/getStudyBuddyTestPrompt';
import * as dataStore from '../../app/dataStore';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import {
    buildStudyBuddyMessages,
    buildStudyBuddyTargetSystemMessage,
    formatStudyBuddyTargetAssistantFinal,
    formatStudyBuddyTargetAssistantPreview,
    ChatCoachActionKey,
    ChatSearchMatch,
    ChatSaveActionType,
    ChatSaveContext,
    ChatTurn,
    StudyBuddyChatTarget,
    createChatTurn,
    getStudyBuddySttLang,
    normalizeConversationTranscript,
    shouldForceSubmitConversationTurn,
    splitSpeakableSentences
} from '../../utils/studyBuddyChatUtils';
import { parseStudyBuddyMemoryDirectives } from '../../utils/studyBuddyMemoryUtils';
import { normalizeStudyBuddyImageSettings } from '../../utils/studyBuddyImageUtils';

type MenuPos = { x: number; y: number; placement: 'top' | 'bottom' } | null;
type CoachVoiceConfig = {
    name?: string;
    persona?: string;
    viVoice?: string;
    viAccent?: string;
};

type StudyBuddyTestFocusArea = 'collocation' | 'preposition' | 'paraphrase' | 'wordFamily';

interface StudyBuddyTestOptionPayload {
    isCorrect?: string | boolean;
    explanation?: string;
}

interface StudyBuddyTestQuestionPayload {
    q?: string;
    o?: Record<string, StudyBuddyTestOptionPayload>;
}

interface StudyBuddyBufferedTestEntry {
    markdown: string | null;
    pending: Promise<string | null> | null;
    controller?: AbortController | null;
}

interface ValidatedStudyBuddyTestQuestion {
    question: string;
    normalizedOptions: Array<{
        label: string;
        isCorrect: boolean;
        explanation: string;
    }>;
}

interface StudyBuddyTestValidationResult {
    questions: ValidatedStudyBuddyTestQuestion[];
    errors: string[];
}

const STUDY_BUDDY_MEMORY_DIRECTIVE_MESSAGE = `If the user reveals durable personal info or asks you to remember something for future chats, append one hidden memory directive on its own line using this preferred syntax: [W_UMEM short memory chunk]. Example: [W_UMEM User prefers concise answers]. Keep each memory chunk minimal. Only store durable user preferences, identity facts, stable long-term goals, or preferred assistant behavior. Do not use memory for temporary task details, recent chat content, what the learner just asked, what word they are currently studying, or any learning-history summary such as "learner studied word X", "learner learned core usage of Y", "learner asked about collocations", or similar vocabulary progress/history because Context Aware mode already handles study context. Fast mode only disables Word Library study context, not long-term chat memory. Do not say that memory is unavailable just because Fast mode is on.`;

function normalizeTestCorrectFlag(value: string | boolean | undefined): boolean {
    if (typeof value === 'boolean') return value;
    return String(value || '').trim().toLowerCase() === 'true';
}

function extractJsonArrayString(raw: string): string {
    const trimmed = String(raw || '').trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const unfenced = (fenceMatch?.[1] || trimmed).trim();
    const start = unfenced.indexOf('[');
    const end = unfenced.lastIndexOf(']');
    if (start >= 0 && end > start) {
        return unfenced.slice(start, end + 1);
    }
    return unfenced;
}

function findAdjacentDuplicateWord(text: string): string | null {
    const words = String(text || '')
        .toLowerCase()
        .match(/[a-z]+(?:'[a-z]+)?/g);
    if (!words || words.length < 2) return null;

    for (let index = 1; index < words.length; index += 1) {
        if (words[index] === words[index - 1]) {
            return words[index];
        }
    }

    return null;
}

function validateStudyBuddyTestPayload(raw: string): StudyBuddyTestValidationResult {
    try {
        const parsed = JSON.parse(extractJsonArrayString(raw));
        if (!Array.isArray(parsed)) {
            return {
                questions: [],
                errors: ['Top-level JSON must be an array of question objects.']
            };
        }

        const questions: ValidatedStudyBuddyTestQuestion[] = [];
        const errors: string[] = [];

        parsed.forEach((item: StudyBuddyTestQuestionPayload, itemIndex) => {
            const questionLabel = `Question ${itemIndex + 1}`;
            const question = String(item?.q || '').trim();
            const options = item?.o && typeof item.o === 'object' ? Object.entries(item.o) : [];
            const normalizedOptions = options
                .map(([label, meta]) => ({
                    label: String(label || '').trim(),
                    isCorrect: normalizeTestCorrectFlag(meta?.isCorrect),
                    explanation: String(meta?.explanation || '').trim()
                }))
                .filter((entry) => entry.label);

            const correctCount = normalizedOptions.filter((entry) => entry.isCorrect).length;
            if (!question.includes('__')) {
                errors.push(`${questionLabel}: "q" must contain "__" as the blank.`);
            }
            if (normalizedOptions.length !== 4) {
                errors.push(`${questionLabel}: must contain exactly 4 options.`);
            }
            if (correctCount !== 1) {
                errors.push(`${questionLabel}: must contain exactly 1 correct option.`);
            }

            const questionDuplicate = findAdjacentDuplicateWord(question);
            if (questionDuplicate) {
                errors.push(`${questionLabel}: question has adjacent duplicate word "${questionDuplicate}".`);
            }

            normalizedOptions.forEach((entry, optionIndex) => {
                const optionLabel = `${questionLabel}, option ${optionIndex + 1}`;
                const optionDuplicate = findAdjacentDuplicateWord(entry.label);
                if (optionDuplicate) {
                    errors.push(`${optionLabel}: label has adjacent duplicate word "${optionDuplicate}".`);
                }

                const explanationDuplicate = findAdjacentDuplicateWord(entry.explanation);
                if (explanationDuplicate) {
                    errors.push(`${optionLabel}: explanation has adjacent duplicate word "${explanationDuplicate}".`);
                }
            });

            if (
                question.includes('__')
                && normalizedOptions.length === 4
                && correctCount === 1
                && !questionDuplicate
                && normalizedOptions.every((entry) => !findAdjacentDuplicateWord(entry.label) && !findAdjacentDuplicateWord(entry.explanation))
            ) {
                questions.push({
                    question,
                    normalizedOptions
                });
            }
        });

        return {
            questions,
            errors
        };
    } catch {
        return {
            questions: [],
            errors: ['Response is not valid JSON array format.']
        };
    }
}

function buildStudyBuddyTestMarkdown(raw: string, focusArea?: StudyBuddyTestFocusArea): string | null {
    const validation = validateStudyBuddyTestPayload(raw);
    if (validation.errors.length > 0 || validation.questions.length === 0) {
        return null;
    }

    const normalizedQuestions = validation.questions;

    const validQuestions = normalizedQuestions.flatMap((item, index) => {
        const explanationText = item.normalizedOptions
            .map((entry) => `${entry.label}: ${entry.explanation || (entry.isCorrect ? 'Fits the question.' : 'Does not fit the question.')}`)
            .join(' | ');

        return [
            item.question,
            `[Multi: ${item.normalizedOptions.map((entry) => entry.label).join(' | ')}]`,
            `[HIDDEN: ${explanationText}]`
        ];
    });

    const moreFocus = focusArea || 'general';
    return [
        ...validQuestions,
        `[TESTMORE:${moreFocus}|More question]`
    ].join('\n');
}

const STUDY_BUDDY_TEST_ERROR_MESSAGE = 'Khong the tao cau hoi hop le sau 3 lan thu. Vui long bam More question de thu lai.';

function summarizeTestValidationErrors(errors: string[]): string {
    const normalized = errors
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    if (!normalized.length) return 'Unknown validation error.';
    if (normalized.length === 1) return normalized[0];
    return `${normalized[0]} (+${normalized.length - 1} more issue${normalized.length > 2 ? 's' : ''})`;
}

interface UseStudyBuddyChatOptions {
    config: SystemConfig;
    user: User;
    coach: CoachVoiceConfig;
    chatResponseLanguage: 'vi' | 'en';
    isContextAware: boolean;
    isSearchEnabled: boolean;
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
    chatAbortReasonRef: React.MutableRefObject<'manual' | 'conversation-interrupt' | 'superseded' | null>;
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
    setActiveChatTarget: React.Dispatch<React.SetStateAction<StudyBuddyChatTarget | null>>;
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
    getStudyBuddyImageSettings: () => StudyBuddyImageSettings;
    getActiveChatTarget: () => StudyBuddyChatTarget | null;
    saveMemoryTexts: (memoryTexts: string[]) => Promise<void>;
}

export function useStudyBuddyChat({
    config,
    user,
    coach,
    chatResponseLanguage,
    isContextAware,
    isSearchEnabled,
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
    setActiveChatTarget,
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
    getStudyBuddyImageSettings,
    getActiveChatTarget,
    saveMemoryTexts,
}: UseStudyBuddyChatOptions) {
    const bufferedTestRef = React.useRef<Map<string, StudyBuddyBufferedTestEntry>>(new Map());

    function buildChatLanguageSystemMessage(language: 'vi' | 'en') {
        return language === 'vi'
            ? 'IMPORTANT: Language mode is locked to Vietnamese. Write the full reply in Vietnamese only. Do not switch to English just because the quoted word, examples, or user message are in English. If user asks to use Vietnamese, tell them switch the language toggle to English mode first.'
            : 'IMPORTANT: Language mode is locked to English. Write the full reply in English only. Do not answer in Vietnamese, even if the user writes in Vietnamese or the learner profile says Vietnamese. If user asks to use Vietnamese, tell them switch the language toggle to Vietnamese mode first.';
    }

    function buildTargetAcademicStyleSystemMessage(target: StudyBuddyChatTarget | null) {
        if (!target) return '';
        return [
            `A target word is active: ${target.word.word}.`,
            'Adopt an academic tutoring style for this target flow.',
            'Answer the requested point directly and precisely.',
            'Do not add greetings, compliments, warm-up lines, closings, or conversational filler.',
            'Do not say hello, good question, let us begin, hope this helps, or similar phrases.',
            'Stay tightly focused on the target word and the requested section.',
            'Prefer short structured explanation over chatty prose.'
        ].join(' ');
    }

    async function resolveTargetWord(selectedText: string, section: StudyBuddyChatTarget['section'], source: string) {
        const existing = await dataStore.findWordByText(user.id, selectedText);
        if (existing) {
            return { word: existing, section, source } satisfies StudyBuddyChatTarget;
        }
        return {
            word: {
                id: `studybuddy-target-${Date.now()}`,
                userId: user.id,
                word: selectedText,
                createdAt: Date.now(),
                updatedAt: Date.now()
            } as any,
            section,
            source
        } satisfies StudyBuddyChatTarget;
    }
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

    function getTestBufferKey(selectedText: string, focusArea?: StudyBuddyTestFocusArea) {
        return `${selectedText.trim().toLowerCase()}::${focusArea || 'general'}`;
    }

    function replaceTestMoreLabel(content: string, focusArea: string, label: string) {
        const escapedFocus = focusArea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return String(content || '').replace(
            new RegExp(`\\[TESTMORE:${escapedFocus}\\|[^\\]]*\\]`, 'g'),
            `[TESTMORE:${focusArea}|${label}]`
        );
    }

    function updateBufferedTestButtonLabel(selectedText: string, focusArea: StudyBuddyTestFocusArea | undefined, label: string) {
        const resolvedFocus = focusArea || 'general';
        setChatHistory((current) => {
            let updated = false;
            return [...current].reverse().map((turn) => {
                if (updated || turn.role !== 'assistant') return turn;
                if (!String(turn.content || '').includes(`[TESTMORE:${resolvedFocus}|`)) return turn;
                updated = true;
                return { ...turn, content: replaceTestMoreLabel(turn.content, resolvedFocus, label) };
            }).reverse();
        });
    }

    function cancelBufferedTestPrefetch(selectedText: string, focusArea?: StudyBuddyTestFocusArea) {
        const key = getTestBufferKey(selectedText, focusArea);
        const buffered = bufferedTestRef.current.get(key);
        if (!buffered?.pending || !buffered.controller) return false;
        buffered.controller.abort();
        bufferedTestRef.current.delete(key);
        updateBufferedTestButtonLabel(selectedText, focusArea, 'More question');
        return true;
    }

    function appendBufferedTestQuestion(
        selectedText: string,
        nextTarget: StudyBuddyChatTarget,
        focusArea: StudyBuddyTestFocusArea | undefined,
        markdown: string
    ) {
        const actionKey = focusArea ? `test-${focusArea}` : 'test';
        const assistantId = `assistant-${actionKey}-${Date.now()}`;

        setActiveChatTarget(nextTarget);
        setIsChatOpen(true);
        setChatHistory((current) => [
            ...current,
            { id: assistantId, role: 'assistant', content: markdown, suppressTargetFollowUp: true }
        ]);
        prefetchStudyBuddyTest(selectedText, nextTarget, focusArea);
    }

    async function requestStudyBuddyTestMarkdown(
        selectedText: string,
        nextTarget: StudyBuddyChatTarget,
        focusArea?: StudyBuddyTestFocusArea,
        signal?: AbortSignal,
        onStatus?: (message: string) => void
    ): Promise<string | null> {
        const aiUrl = getStudyBuddyAiUrl(config);
        const memoryChunks = getStudyBuddyMemoryChunks();
        let retryFeedback = '';

        for (let attempt = 0; attempt < 3; attempt++) {
            onStatus?.(`Generating question... (attempt ${attempt + 1}/3)`);
            const res = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: buildStudyBuddyMessages(
                        user,
                        isContextAware,
                        [{
                            role: 'user',
                            content: `${getStudyBuddyTestPrompt(selectedText, focusArea)}${retryFeedback}`
                        }],
                        [
                            buildStudyBuddyTargetSystemMessage(nextTarget),
                            buildTargetAcademicStyleSystemMessage(nextTarget),
                            buildChatLanguageSystemMessage(chatResponseLanguage)
                        ],
                        memoryChunks,
                        { name: coach.name, persona: coach.persona },
                        { includeStudyContext: nextTarget.section !== 'verifyData' }
                    ),
                    searchEnabled: isSearchEnabled,
                    ...studyBuddyAiRequestConfig,
                    stream: false
                }),
                signal
            });

            if (!res.ok) {
                throw new Error(`AI server error ${res.status}`);
            }

            const payload = await res.json().catch(() => null);
            const rawText = payload?.choices?.[0]?.message?.content;
            if (typeof rawText !== 'string' || !rawText.trim()) {
                retryFeedback = `\n\nRETRY REQUIRED:\nYour previous response was invalid because it was empty.\nReturn a fresh JSON array only.`;
                onStatus?.(`Generating question... (attempt ${attempt + 1}/3)\nFail reason: empty response.`);
                if (attempt === 2) throw new Error('AI server returned empty content.');
                continue;
            }

            const validation = validateStudyBuddyTestPayload(rawText);
            const markdown = buildStudyBuddyTestMarkdown(rawText, focusArea);
            if (markdown) {
                return markdown;
            }

            const failReason = summarizeTestValidationErrors(validation.errors);
            onStatus?.(`Generating question... (attempt ${attempt + 1}/3)\nFail reason: ${failReason}`);
            retryFeedback = `\n\nRETRY REQUIRED:
Your previous JSON failed validation.
Fix these exact problems:
- ${validation.errors.join('\n- ')}
Return a fresh corrected JSON array only. Do not explain.`;
        }

        throw new Error('AI returned invalid test JSON after retries.');
    }

    function prefetchStudyBuddyTest(
        selectedText: string,
        nextTarget: StudyBuddyChatTarget,
        focusArea?: StudyBuddyTestFocusArea
    ) {
        const key = getTestBufferKey(selectedText, focusArea);
        const current = bufferedTestRef.current.get(key);
        if (current?.markdown || current?.pending) return;

        const controller = new AbortController();
        updateBufferedTestButtonLabel(selectedText, focusArea, 'Generating next question (Click to Cancel)');

        const pending = requestStudyBuddyTestMarkdown(selectedText, nextTarget, focusArea, controller.signal)
            .then((markdown) => {
                bufferedTestRef.current.set(key, { markdown, pending: null, controller: null });
                updateBufferedTestButtonLabel(selectedText, focusArea, 'More question');
                return markdown;
            })
            .catch((error) => {
                bufferedTestRef.current.delete(key);
                if (error?.name !== 'AbortError') {
                    updateBufferedTestButtonLabel(selectedText, focusArea, 'More question');
                } else {
                    updateBufferedTestButtonLabel(selectedText, focusArea, 'More question');
                }
                return null;
            });

        bufferedTestRef.current.set(key, { markdown: null, pending, controller });
    }

    async function submitChatPrompt(
        rawPrompt: string,
        options?: {
            continueConversation?: boolean;
            stopListening?: boolean;
        }
    ) {
        const prompt = rawPrompt.trim();
        if (!prompt) return;
        if (chatAbortRef.current) {
            chatAbortReasonRef.current = 'superseded';
            chatAbortRef.current.abort();
            chatAbortRef.current = null;
        }
        const memoryChunks = getStudyBuddyMemoryChunks();
        const activeTarget = getActiveChatTarget();
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
            ...(activeTarget ? [buildStudyBuddyTargetSystemMessage(activeTarget)] : []),
            ...(activeTarget ? [buildTargetAcademicStyleSystemMessage(activeTarget)] : []),
            ...(options?.continueConversation
                ? ['Conversation mode is active. Do not use emojis in your response.']
                : []),
            buildChatLanguageSystemMessage(chatResponseLanguage),
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
                        memoryChunks,
                        { name: coach.name, persona: coach.persona },
                        { includeStudyContext: activeTarget?.section !== 'verifyData' }
                    ),
                    searchEnabled: isSearchEnabled,
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
                            ? { ...turn, content: formatStudyBuddyTargetAssistantPreview(parsed.visibleText, activeTarget), hasMemoryWrite: turn.hasMemoryWrite || parsed.memories.length > 0 }
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
                updateAssistantTurn(formatStudyBuddyTargetAssistantFinal(parsedFinal.memories.length ? 'OK' : 'Connected to AI but not receive response', activeTarget));
            } else if (isChatAudioEnabledRef.current) {
                const trailing = parsedFinal.visibleText.slice(spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }
            updateAssistantTurn(formatStudyBuddyTargetAssistantFinal(parsedFinal.visibleText, activeTarget));
        } catch (error: any) {
            const abortReason = chatAbortReasonRef.current;
            chatAbortReasonRef.current = null;
            if (error?.name === 'AbortError') {
                removeChatStatusTurn(statusTurnId);
                setChatHistory((current) =>
                    abortReason === 'conversation-interrupt' || abortReason === 'superseded'
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
                setIsChatLoading(false);
            }
            removeChatStatusTurn(statusTurnId);
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

    async function handleBackgroundChatRequest(prompt: string, targetOverride?: StudyBuddyChatTarget | null) {
        const cleanPrompt = prompt.trim();
        if (!cleanPrompt) return;
        if (chatAbortRef.current) {
            chatAbortReasonRef.current = 'superseded';
            chatAbortRef.current.abort();
            chatAbortRef.current = null;
        }
        const memoryChunks = getStudyBuddyMemoryChunks();
        const activeTarget = targetOverride ?? getActiveChatTarget();
        stopChatListening();

        const statusTurnId = `status-bg-${Date.now()}`;
        const assistantId = `assistant-bg-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        const isLanguageSettingRequest =
            cleanPrompt.startsWith('Apply the language setting:')
            || cleanPrompt.startsWith('Ap dung cai dat ngon ngu:');
        let spokenCursor = 0;
        const extraSystemMessages = [
            ...(activeTarget ? [buildStudyBuddyTargetSystemMessage(activeTarget)] : []),
            ...(activeTarget ? [buildTargetAcademicStyleSystemMessage(activeTarget)] : []),
            buildChatLanguageSystemMessage(chatResponseLanguage),
            STUDY_BUDDY_MEMORY_DIRECTIVE_MESSAGE
        ];

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
            { id: assistantId, role: 'assistant', kind: 'message', content: '', suppressTargetFollowUp: isLanguageSettingRequest }
        ]);

        const updateAssistantTurn = (content: string) => {
            setChatHistory((current) =>
                current.map((turn) => (turn.id === assistantId ? { ...turn, content, suppressTargetFollowUp: turn.suppressTargetFollowUp || isLanguageSettingRequest } : turn))
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
                        memoryChunks,
                        { name: coach.name, persona: coach.persona },
                        { includeStudyContext: activeTarget?.section !== 'verifyData' }
                    ),
                    searchEnabled: isSearchEnabled,
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
                            ? { ...turn, content: formatStudyBuddyTargetAssistantPreview(parsed.visibleText, activeTarget), hasMemoryWrite: turn.hasMemoryWrite || parsed.memories.length > 0, suppressTargetFollowUp: turn.suppressTargetFollowUp || isLanguageSettingRequest }
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
                updateAssistantTurn(formatStudyBuddyTargetAssistantFinal(parsedFinal.memories.length ? 'OK' : 'AI server da ket noi, nhung chua tra ve noi dung.', activeTarget));
            } else if (isChatAudioEnabledRef.current) {
                const trailing = parsedFinal.visibleText.slice(spokenCursor).trim();
                if (trailing) {
                    queueChatSpeech(trailing);
                }
            }
            updateAssistantTurn(formatStudyBuddyTargetAssistantFinal(parsedFinal.visibleText, activeTarget));
        } catch (error: any) {
            const abortReason = chatAbortReasonRef.current;
            chatAbortReasonRef.current = null;
            if (error?.name === 'AbortError') {
                removeChatStatusTurn(statusTurnId);
                setChatHistory((current) =>
                    abortReason === 'superseded'
                        ? current.filter((turn) => !(turn.id === assistantId && !turn.content.trim()))
                        : current.map((turn) =>
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
                setIsChatLoading(false);
            }
            removeChatStatusTurn(statusTurnId);
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
                    memoryChunks,
                    { name: coach.name, persona: coach.persona }
                ),
                searchEnabled: isSearchEnabled,
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

    async function streamInitialGreeting() {
        await handleBackgroundChatRequest(`Please greet the learner by name with one short, warm, positive sentence of encouragement.

Rules:
- Answer directly as the coach
- Keep it brief
- No bullet points
- No emojis
- Sound active and welcoming
- Use Vietnamese if the learner writes Vietnamese or their native language is Vietnamese`);
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
        actionKey: string,
        promptLabel: string,
        promptBuilder: (selectedText: string) => string,
        options?: {
            saveActionType?: ChatSaveActionType;
            targetSection?: StudyBuddyChatTarget['section'];
            inputSource?: 'auto' | 'composer' | 'selection' | 'target';
            inputText?: string;
            focusArea?: StudyBuddyTestFocusArea;
        }
    ) {
        const selectedText = (
            options?.inputText?.trim()
            || (
                options?.inputSource === 'composer'
                    ? chatInput.trim()
                    : options?.inputSource === 'selection'
                        ? (coachSelectionText || selectedTextRef.current || window.getSelection()?.toString().trim() || '').trim()
                        : options?.inputSource === 'target'
                            ? (getActiveChatTarget()?.word?.word?.trim() || '')
                            : ((getActiveChatTarget()?.word?.word?.trim() || '') || getActiveActionText())
            )
        ).trim();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;
        if (options?.inputSource === 'composer') {
            setChatInput('');
        }

        const targetSection = options?.targetSection ?? (
            actionKey === 'explain'
                ? 'coreUsage'
                : actionKey === 'collocations'
                    ? 'collocation'
                    : actionKey === 'preposition'
                        ? 'preposition'
                    : actionKey === 'wordFamily'
                        ? 'wordFamily'
                        : actionKey === 'paraphrase'
                            ? 'paraphrase'
                            : actionKey === 'test' || actionKey.startsWith('test-')
                                ? 'coreUsage'
                                : 'example'
        );
        const nextTarget = await resolveTargetWord(selectedText, targetSection, `Study Command Box ${promptLabel}`);
        setActiveChatTarget(nextTarget);

        const userPrompt = promptBuilder(selectedText);
        const userTurn = createChatTurn('user', `${promptLabel}: ${selectedText}`);
        const assistantId = `assistant-${actionKey}-${Date.now()}`;
        const aiUrl = getStudyBuddyAiUrl(config);
        const memoryChunks = getStudyBuddyMemoryChunks();
        const inferredSaveActionType = options?.saveActionType ?? (
            actionKey === 'test' || actionKey === 'explain' || actionKey.startsWith('test-')
                ? undefined
                : actionKey as ChatSaveActionType
        );
        const saveContext: ChatSaveContext | undefined = inferredSaveActionType
            ? {
                actionType: inferredSaveActionType,
                targetWord: actionKey === 'compare' ? undefined : selectedText,
                sourceSelection: selectedText
            }
            : undefined;

        setActiveChatCoachAction(actionKey);
        setIsChatLoading(true);
        setChatHistory((current) => [
            ...current,
            userTurn,
            { id: assistantId, role: 'assistant', content: '', suppressTargetFollowUp: true, ...(saveContext ? { saveContext } : {}) }
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
                        [
                            buildStudyBuddyTargetSystemMessage(nextTarget),
                            buildTargetAcademicStyleSystemMessage(nextTarget),
                            buildChatLanguageSystemMessage(chatResponseLanguage)
                        ],
                        memoryChunks,
                        { name: coach.name, persona: coach.persona },
                        { includeStudyContext: nextTarget.section !== 'verifyData' }
                    ),
                    searchEnabled: isSearchEnabled,
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
                        turn.id === assistantId ? { ...turn, content: text, suppressTargetFollowUp: true, ...(saveContext ? { saveContext } : {}) } : turn
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
                                updateAssistant(
                                    actionKey === 'test' || actionKey.startsWith('test-')
                                        ? assistantText
                                        : formatStudyBuddyTargetAssistantPreview(assistantText, nextTarget)
                                );
                            }
                        } catch {
                            // ignore
                        }
                    }
                }
            }

            if (!assistantText.trim()) {
                updateAssistant('Khong co noi dung tra ve.');
            } else {
                const testFocusArea = options?.focusArea;
                const renderedTest = actionKey === 'test' || actionKey.startsWith('test-')
                    ? buildStudyBuddyTestMarkdown(assistantText, testFocusArea)
                    : null;
                updateAssistant(renderedTest || formatStudyBuddyTargetAssistantPreview(assistantText, nextTarget));
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

    async function handleChatCoachTest(options?: {
        inputSource?: 'auto' | 'composer' | 'selection' | 'target';
        inputText?: string;
        focusArea?: StudyBuddyTestFocusArea;
    }) {
        const selectedText = (
            options?.inputText?.trim()
            || (
                options?.inputSource === 'composer'
                    ? chatInput.trim()
                    : options?.inputSource === 'selection'
                        ? (coachSelectionText || selectedTextRef.current || window.getSelection()?.toString().trim() || '').trim()
                        : options?.inputSource === 'target'
                            ? (getActiveChatTarget()?.word?.word?.trim() || '')
                            : ((getActiveChatTarget()?.word?.word?.trim() || '') || getActiveActionText())
            )
        ).trim();
        if (!selectedText || isChatLoading) return;

        selectedTextRef.current = selectedText;
        if (options?.inputSource === 'composer') {
            setChatInput('');
        }

        const focusArea = options?.focusArea;
        const promptLabel = focusArea
            ? `Test ${focusArea === 'wordFamily' ? 'Word Family' : focusArea.charAt(0).toUpperCase() + focusArea.slice(1)}`
            : 'Test';
        const actionKey = focusArea ? `test-${focusArea}` : 'test';
        const nextTarget = await resolveTargetWord(selectedText, 'coreUsage', `Study Command Box ${promptLabel}`);
        setActiveChatTarget(nextTarget);

        const bufferKey = getTestBufferKey(selectedText, focusArea);
        const buffered = bufferedTestRef.current.get(bufferKey);

        setActiveChatCoachAction(actionKey);
        setIsChatLoading(true);
        setIsChatOpen(true);

        const userTurn = createChatTurn('user', `${promptLabel}: ${selectedText}`);
        const assistantId = `assistant-${actionKey}-${Date.now()}`;
        setChatHistory((current) => [
            ...current,
            userTurn,
            { id: assistantId, role: 'assistant', content: 'Generating question... (attempt 1/3)', suppressTargetFollowUp: true }
        ]);

        try {
            const markdown = buffered?.markdown ?? await (buffered?.pending || requestStudyBuddyTestMarkdown(
                selectedText,
                nextTarget,
                focusArea,
                undefined,
                (message) => {
                    setChatHistory((current) =>
                        current.map((turn) =>
                            turn.id === assistantId
                                ? { ...turn, content: message, suppressTargetFollowUp: true }
                                : turn
                        )
                    );
                }
            ));
            bufferedTestRef.current.delete(bufferKey);

            setChatHistory((current) =>
                current.map((turn) =>
                    turn.id === assistantId
                        ? { ...turn, content: markdown || 'Khong the tao cau hoi hop le cho luc nay.', suppressTargetFollowUp: true }
                        : turn
                )
            );

            prefetchStudyBuddyTest(selectedText, nextTarget, focusArea);
        } catch (error) {
            console.error(error);
            setChatHistory((current) =>
                current.map((turn) =>
                    turn.id === assistantId
                        ? { ...turn, content: STUDY_BUDDY_TEST_ERROR_MESSAGE, suppressTargetFollowUp: true }
                        : turn
                )
            );
        } finally {
            setIsChatLoading(false);
            setActiveChatCoachAction(null);
        }
    }

    async function handleChatCoachTestMore(focusArea?: StudyBuddyTestFocusArea) {
        const selectedText = (getActiveChatTarget()?.word?.word || '').trim();
        if (!selectedText) return;

        if (cancelBufferedTestPrefetch(selectedText, focusArea)) {
            return;
        }

        const nextTarget = await resolveTargetWord(selectedText, 'coreUsage', 'StudyBuddy More Question');
        const bufferKey = getTestBufferKey(selectedText, focusArea);
        const buffered = bufferedTestRef.current.get(bufferKey);

        if (buffered?.markdown) {
            bufferedTestRef.current.delete(bufferKey);
            appendBufferedTestQuestion(selectedText, nextTarget, focusArea, buffered.markdown);
            return;
        }

        if (isChatLoading) return;
        const actionKey = focusArea ? `test-${focusArea}` : 'test';
        const assistantId = `assistant-${actionKey}-${Date.now()}`;

        setActiveChatTarget(nextTarget);
        setActiveChatCoachAction(actionKey);
        setIsChatLoading(true);
        setIsChatOpen(true);
        setChatHistory((current) => [
            ...current,
            { id: assistantId, role: 'assistant', content: 'Generating question... (attempt 1/3)', suppressTargetFollowUp: true }
        ]);

        try {
            const markdown = await requestStudyBuddyTestMarkdown(
                selectedText,
                nextTarget,
                focusArea,
                undefined,
                (message) => {
                    setChatHistory((current) =>
                        current.map((turn) =>
                            turn.id === assistantId
                                ? { ...turn, content: message, suppressTargetFollowUp: true }
                                : turn
                        )
                    );
                }
            );
            setChatHistory((current) =>
                current.map((turn) =>
                    turn.id === assistantId
                        ? { ...turn, content: markdown || STUDY_BUDDY_TEST_ERROR_MESSAGE, suppressTargetFollowUp: true }
                        : turn
                )
            );
            prefetchStudyBuddyTest(selectedText, nextTarget, focusArea);
        } catch (error) {
            console.error(error);
            setChatHistory((current) =>
                current.map((turn) =>
                    turn.id === assistantId
                        ? { ...turn, content: STUDY_BUDDY_TEST_ERROR_MESSAGE, suppressTargetFollowUp: true }
                        : turn
                )
            );
        } finally {
            setIsChatLoading(false);
            setActiveChatCoachAction(null);
        }
    }

    async function handleChatCoachExplain(options?: { inputSource?: 'auto' | 'composer' | 'selection' | 'target'; inputText?: string }) {
        await handleChatCoachPromptToChat(
            'explain',
            'Explain',
            (selectedText) => getStudyBuddyExplainPrompt(selectedText),
            options
        );
    }

    async function handleChatCoachImageRequest(mode: 'image' | 'infographic') {
        const selectedText = getActiveActionText();
        if (!selectedText) return;
        selectedTextRef.current = selectedText;

        setActiveChatCoachAction(mode);
        setIsChatLoading(true);
        setIsChatOpen(true);

        const userTurn = createChatTurn('user', `${mode === 'infographic' ? 'Infographic' : 'Image'}: ${selectedText}`);
        const assistantId = `assistant-${mode}-${Date.now()}`;

        setChatHistory((current) => [
            ...current,
            userTurn,
            { id: assistantId, role: 'assistant', kind: 'status', content: '', imageProgress: 4 }
        ]);

        try {
            const controller = new AbortController();
            chatAbortRef.current = controller;
            const serverUrl = getServerUrl(config);
            const imageSettings = normalizeStudyBuddyImageSettings(getStudyBuddyImageSettings());
            const res = await fetch(`${serverUrl}/api/studybuddy/image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    data: selectedText,
                    settings: imageSettings,
                    mode,
                    searchEnabled: isSearchEnabled
                })
            });

            if (!res.ok || !res.body) {
                const payload = await res.json().catch(() => null);
                throw new Error(payload?.error || `Image server error ${res.status}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffered = '';
            let finalUpdated = false;

            const updateAssistantProgress = (progress: number) => {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, kind: 'status', content: '', imageProgress: progress }
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

                        const payload = JSON.parse(raw);
                        if (payload?.type === 'progress' && Number.isFinite(Number(payload.progress))) {
                            updateAssistantProgress(Number(payload.progress));
                            continue;
                        }
                        if (payload?.type === 'final') {
                            setChatHistory((current) =>
                                current.map((turn) =>
                                    turn.id === assistantId
                                        ? { ...turn, kind: 'message', content: payload?.response || 'Khong tao duoc hinh.', imageProgress: undefined }
                                        : turn
                                )
                            );
                            finalUpdated = true;
                            continue;
                        }
                        if (payload?.type === 'error') {
                            throw new Error(typeof payload.error === 'string' ? payload.error : 'Image generation failed.');
                        }
                    }
                }
            }

            if (!finalUpdated) {
                throw new Error('Image stream ended without final payload.');
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, kind: 'message', content: 'Da dung tao hinh.', imageProgress: undefined }
                            : turn
                    )
                );
            } else {
                console.error(error);
                setChatHistory((current) =>
                    current.map((turn) =>
                        turn.id === assistantId
                            ? { ...turn, kind: 'message', content: error?.message || 'Khong the tao hinh luc nay.', imageProgress: undefined }
                            : turn
                    )
                );
            }
        } finally {
            chatAbortRef.current = null;
            setIsChatLoading(false);
            setActiveChatCoachAction(null);
        }
    }

    async function handleChatCoachImage() {
        await handleChatCoachImageRequest('image');
    }

    async function handleChatCoachInfographic() {
        await handleChatCoachImageRequest('infographic');
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
        streamInitialGreeting,
        handleChatCoachPromptToChat,
        handleChatCoachExplain,
        handleChatCoachInfographic,
        handleChatCoachImage,
        handleChatCoachSearch,
        handleChatCoachTest,
        handleChatCoachTestMore,
        handleChatCoachTranslate,
        handleSendChat,
        handleToggleChatMic,
        handleToggleConversationMode,
    };
}
