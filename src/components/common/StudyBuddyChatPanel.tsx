import React, { useEffect, useState } from 'react';
import { Brain, ChevronUp, Loader2, Mic, Save, Send, Sparkles, StopCircle, Trash2, Volume2, Wrench, X } from 'lucide-react';
import { ChatSearchMatch, ChatTurn } from '../../utils/studyBuddyChatUtils';
import { StudyBuddyMemoryChunk } from '../../app/types';
import { parseMarkdown } from '../../utils/markdownParser';

const STUDY_BUDDY_CHAT_PANEL_SIZE_KEY = 'studybuddy_chat_panel_size_v1';
const SAVE_ACTION_LABELS: Record<string, string> = {
    examples: 'Save Examples',
    collocations: 'Save Collocations',
    paraphrase: 'Save Paraphrase',
    wordFamily: 'Save Word Family'
};

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

function SearchMoreMatches({ matches }: { matches: ChatSearchMatch[] }) {
    if (!matches.length) return null;

    return (
        <details className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
            <summary className="cursor-pointer list-none text-[11px] font-black uppercase tracking-[0.16em] text-neutral-600">
                More results
            </summary>
            <div className="mt-3 space-y-3">
                {matches.map((item, index) => (
                    <div key={`${item.word}-${item.section}-${index}`} className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900">
                        <p className="text-sm font-black">{index + 2}. {item.word || 'Unknown'}</p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                            {formatSearchSectionLabel(item.section)}
                        </p>
                        <blockquote className="mt-2 border-l-4 border-neutral-300 bg-neutral-50/80 px-3 py-2 italic text-neutral-600">
                            {item.text || ''}
                        </blockquote>
                    </div>
                ))}
            </div>
        </details>
    );
}

function renderBubbleHtml(turn: ChatTurn, isChatLoading: boolean) {
    const content = `${turn.content || (turn.role === 'assistant' && isChatLoading ? '...' : '')}${turn.role === 'assistant' && turn.kind !== 'status' && turn.hasMemoryWrite ? ' ✍️' : ''}`;
    return { __html: parseMarkdown(content) };
}

const ChatHistoryList = React.memo(({
    chatHistory,
    isChatLoading,
    onOpenSaveModal,
}: {
    chatHistory: ChatTurn[];
    isChatLoading: boolean;
    onOpenSaveModal: (turn: ChatTurn) => void;
}) => (
    <>
        {chatHistory.map((turn) => (
            <div key={turn.id} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative max-w-[85%] rounded-[1.4rem] px-4 py-3 text-sm shadow-sm ${
                    turn.kind === 'status'
                        ? 'border border-amber-200 bg-amber-50/90 text-amber-900 rounded-bl-md'
                        : turn.role === 'user'
                        ? 'bg-white border border-neutral-200 text-neutral-900 rounded-br-md'
                        : 'bg-white border border-neutral-200 text-neutral-900 rounded-bl-md'
                }`}>
                    {turn.kind === 'status' && (
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                            <Loader2 size={11} className="animate-spin" />
                            Library Lookup
                        </div>
                    )}
                    {turn.role === 'assistant' && turn.kind !== 'status' && turn.saveContext?.targetWord && (
                        <div className="mb-2 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onOpenSaveModal(turn)}
                                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-black tracking-wide text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-900"
                                title={`Save this response for ${turn.saveContext.targetWord}`}
                            >
                                <Save size={11} />
                                {SAVE_ACTION_LABELS[turn.saveContext.actionType || ''] || 'Save'}
                            </button>
                        </div>
                    )}
                    <div
                        className="leading-relaxed break-words select-text text-neutral-900 [&_a]:font-semibold [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-md [&_code]:bg-neutral-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-rose-700 [&_ol]:mb-2 [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:mb-2 [&_p]:whitespace-pre-wrap [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-neutral-200 [&_pre]:bg-white [&_pre]:px-4 [&_pre]:py-3 [&_pre]:text-[12px] [&_pre]:leading-6 [&_table]:min-w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs [&_td]:border-b [&_td]:border-neutral-100 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border-b [&_th]:border-neutral-200 [&_th]:px-3 [&_th]:py-2 [&_th]:font-black [&_thead]:bg-neutral-100 [&_thead]:text-neutral-700 [&_ul]:mb-2 [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1"
                        dangerouslySetInnerHTML={renderBubbleHtml(turn, isChatLoading)}
                    />
                        {turn.role === 'assistant' && turn.kind !== 'status' && turn.searchResultMeta?.moreMatches?.length ? (
                            <SearchMoreMatches matches={turn.searchResultMeta.moreMatches} />
                        ) : null}
                </div>
            </div>
        ))}
    </>
));

interface StudyBuddyChatPanelProps {
    chatPanelRef: React.RefObject<HTMLDivElement | null>;
    chatScrollRef: React.RefObject<HTMLDivElement | null>;
    isConversationMode: boolean;
    isChatListening: boolean;
    isChatLoading: boolean;
    isContextAware: boolean;
    isChatAudioEnabled: boolean;
    chatHistory: ChatTurn[];
    hasChatTextSelection: boolean;
    chatInput: string;
    headerDescription: string;
    memoryChunks: StudyBuddyMemoryChunk[];
    isMemoryPanelOpen: boolean;
    chatCoachActionBar: React.ReactNode;
    chatSaveModal: React.ReactNode;
    onToggleContextAware: () => void;
    onToggleConversationMode: () => void;
    onToggleChatAudio: () => void;
    onToggleMemoryPanel: () => void;
    onDeleteMemory: (memoryId: string) => void;
    onClearChatHistory: () => void;
    onClose: () => void;
    onOpenSaveModal: (turn: ChatTurn) => void;
    onPointerDownInside: () => void;
    onChatInputChange: (value: string) => void;
    onChatInputKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onToggleChatMic: () => void;
    onStopChatStream: () => void;
    onSendChat: () => void;
}

export const StudyBuddyChatPanel: React.FC<StudyBuddyChatPanelProps> = ({
    chatPanelRef,
    chatScrollRef,
    isConversationMode,
    isChatListening,
    isChatLoading,
    isContextAware,
    isChatAudioEnabled,
    chatHistory,
    hasChatTextSelection,
    chatInput,
    headerDescription,
    memoryChunks,
    isMemoryPanelOpen,
    chatCoachActionBar,
    chatSaveModal,
    onToggleContextAware,
    onToggleConversationMode,
    onToggleChatAudio,
    onToggleMemoryPanel,
    onDeleteMemory,
    onClearChatHistory,
    onClose,
    onOpenSaveModal,
    onPointerDownInside,
    onChatInputChange,
    onChatInputKeyDown,
    onToggleChatMic,
    onStopChatStream,
    onSendChat,
}) => {
    const [isCoachMenuOpen, setIsCoachMenuOpen] = useState(false);
    const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);

    useEffect(() => {
        const panel = chatPanelRef.current;
        if (!panel) return;

        const TOP_SAFE_MARGIN = 8;
        let width = 0;
        let height = 0;
        let frameId: number | null = null;

        try {
            const raw = window.localStorage.getItem(STUDY_BUDDY_CHAT_PANEL_SIZE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Number.isFinite(parsed?.width) && parsed.width > 0) {
                    panel.style.width = `${parsed.width}px`;
                }
                if (Number.isFinite(parsed?.height) && parsed.height > 0) {
                    panel.style.height = `${parsed.height}px`;
                }
            }
        } catch {
            // Ignore invalid persisted size.
        }

        const clampPanelHeight = () => {
            const rect = panel.getBoundingClientRect();
            const maxHeight = Math.max(320, Math.floor(rect.bottom - TOP_SAFE_MARGIN));
            panel.style.maxHeight = `${maxHeight}px`;
            if (panel.offsetHeight > maxHeight) {
                panel.style.height = `${maxHeight}px`;
            }
        };

        const persistPanelSize = () => {
            const nextWidth = panel.offsetWidth;
            const nextHeight = panel.offsetHeight;
            if (!nextWidth || !nextHeight) return;
            if (nextWidth === width && nextHeight === height) return;
            width = nextWidth;
            height = nextHeight;
            try {
                window.localStorage.setItem(
                    STUDY_BUDDY_CHAT_PANEL_SIZE_KEY,
                    JSON.stringify({ width: nextWidth, height: nextHeight })
                );
            } catch {
                // Ignore localStorage write failures.
            }
        };

        const scheduleClamp = () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                frameId = null;
                clampPanelHeight();
                persistPanelSize();
            });
        };

        scheduleClamp();
        const resizeObserver = new ResizeObserver(scheduleClamp);
        resizeObserver.observe(panel);
        window.addEventListener('resize', scheduleClamp);

        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            window.removeEventListener('resize', scheduleClamp);
        };
    }, [chatPanelRef]);

    return (
        <div
            ref={chatPanelRef}
            className="pointer-events-auto absolute bottom-8 left-0 z-50 flex h-[42rem] min-h-[32rem] w-[46rem] min-w-[28rem] max-w-[calc(100vw-1rem)] flex-col rounded-[2rem] border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-xl overflow-hidden select-text animate-in fade-in slide-in-from-bottom-2 duration-200 relative"
            style={{ resize: 'both' }}
            onMouseDownCapture={onPointerDownInside}
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
                    <p className="text-[11px] text-neutral-500 truncate">{headerDescription}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsModeMenuOpen((prev) => !prev)}
                        className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-50"
                        title="Mode settings"
                    >
                        Mode
                        <ChevronUp size={12} className={`transition-transform ${isModeMenuOpen ? '' : 'rotate-180'}`} />
                    </button>
                    {isModeMenuOpen ? (
                        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 rounded-2xl border border-neutral-200 bg-white/98 p-2 shadow-2xl backdrop-blur-xl">
                            <button
                                type="button"
                                onClick={() => {
                                    onToggleContextAware();
                                    setIsModeMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors ${
                                    isContextAware
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'bg-white text-neutral-700 hover:bg-neutral-50'
                                }`}
                                title="Toggle study context embedding"
                            >
                                <span>Library Access</span>
                                <span className="text-[10px] uppercase tracking-wide">{isContextAware ? 'On' : 'Off'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onToggleConversationMode();
                                    setIsModeMenuOpen(false);
                                }}
                                className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors ${
                                    isConversationMode
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-white text-neutral-700 hover:bg-neutral-50'
                                }`}
                                title="Toggle voice conversation mode"
                            >
                                <span>Conversation</span>
                                <span className="text-[10px] uppercase tracking-wide">{isConversationMode ? 'On' : 'Off'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onToggleChatAudio();
                                    setIsModeMenuOpen(false);
                                }}
                                className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors ${
                                    isChatAudioEnabled
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-white text-neutral-700 hover:bg-neutral-50'
                                }`}
                                title="Toggle chat audio"
                            >
                                <span>Audio</span>
                                <span className="text-[10px] uppercase tracking-wide">{isChatAudioEnabled ? 'On' : 'Off'}</span>
                            </button>
                        </div>
                    ) : null}
                </div>
                <button
                    type="button"
                    onClick={onToggleMemoryPanel}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                        isMemoryPanelOpen
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-neutral-200 bg-white text-neutral-500'
                    }`}
                    title="View StudyBuddy memory"
                >
                    <Brain size={12} />
                    Memory {memoryChunks.length ? `(${memoryChunks.length})` : ''}
                </button>
                <button
                    type="button"
                    onClick={onClearChatHistory}
                    className="h-8 px-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-black uppercase tracking-wide"
                    title="Clear chat"
                >
                    Clear
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-neutral-400 hover:text-neutral-900"
                >
                    <X size={16} />
                </button>
            </div>
        </div>

        {isMemoryPanelOpen ? (
            <div className="border-b border-neutral-100 bg-amber-50/60 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-800">Memory Chunks</p>
                    <p className="text-[10px] font-semibold text-amber-700">Max 100</p>
                </div>
                {memoryChunks.length ? (
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {memoryChunks.map((chunk) => (
                            <div key={chunk.id} className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-white/90 px-3 py-2">
                                <p className="min-w-0 flex-1 text-sm leading-relaxed text-neutral-800">{chunk.text}</p>
                                <button
                                    type="button"
                                    onClick={() => onDeleteMemory(chunk.id)}
                                    className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                                    title="Delete memory"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-neutral-600">
                        No saved memory yet. StudyBuddy will store small memory chunks when you tell it to remember something.
                    </p>
                )}
            </div>
        ) : null}

        <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[linear-gradient(180deg,#fafafa_0%,#ffffff_100%)] select-text"
            onMouseDownCapture={onPointerDownInside}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <ChatHistoryList
                chatHistory={chatHistory}
                isChatLoading={isChatLoading}
                onOpenSaveModal={onOpenSaveModal}
            />
        </div>

        <div className="border-t border-neutral-100 p-3 bg-white">
            <div className="flex items-center gap-2">
                <textarea
                    value={chatInput}
                    onChange={(e) => onChatInputChange(e.target.value)}
                    onKeyDown={onChatInputKeyDown}
                    rows={1}
                    placeholder={isConversationMode ? 'Conversation mode is ON. Say something...' : 'Ask me anything...'}
                    disabled={isConversationMode}
                    className={`min-h-[2.75rem] flex-1 resize-none rounded-2xl border px-4 py-3 text-sm outline-none transition-colors ${
                        isConversationMode
                            ? 'border-rose-100 bg-rose-50/70 text-rose-700'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-800 focus:border-neutral-900 focus:bg-white'
                    }`}
                />
                <div className="relative flex items-center gap-2 shrink-0">
                    {isCoachMenuOpen ? (
                        <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-20 w-[min(42rem,calc(100vw-2rem))] max-w-[42rem] rounded-[1.5rem] border border-neutral-200 bg-white/98 p-3 shadow-2xl backdrop-blur-xl">
                            {chatCoachActionBar}
                        </div>
                    ) : null}
                    {isChatLoading ? (
                        <button
                            type="button"
                            onClick={onStopChatStream}
                            className="h-10 w-10 rounded-2xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 flex items-center justify-center transition-colors"
                            title="Stop current response or search"
                        >
                            <StopCircle size={18} />
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onSendChat}
                                disabled={!chatInput.trim() || isConversationMode}
                                className="h-10 w-10 rounded-2xl bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                title="Send"
                            >
                                <Send size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={onToggleChatMic}
                                disabled={isConversationMode}
                                className={`h-10 w-10 rounded-2xl border flex items-center justify-center transition-colors ${
                                    isConversationMode
                                        ? 'bg-neutral-100 text-neutral-300 border-neutral-200 cursor-not-allowed'
                                        : isChatListening
                                        ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                                        : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                                }`}
                                title={isConversationMode ? 'Conversation mode is using the microphone' : isChatListening ? 'Stop voice input' : 'Start voice input'}
                            >
                                <Mic size={18} className={isChatListening ? 'animate-pulse' : ''} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsCoachMenuOpen((prev) => !prev)}
                                className="h-10 w-10 rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition-colors"
                                title="Open coach commands"
                            >
                                <div className="relative flex items-center justify-center">
                                    <Wrench size={16} />
                                    <ChevronUp size={12} className={`absolute -top-2 -right-2 transition-transform ${isCoachMenuOpen ? '' : 'rotate-180'}`} />
                                </div>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>

            {chatSaveModal}
            <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-300">
                Resize
            </div>
        </div>
    );
};
