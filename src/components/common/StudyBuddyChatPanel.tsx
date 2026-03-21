import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, Loader2, Mic, Save, Send, Sparkles, StopCircle, Trash2, Volume2, X } from 'lucide-react';
import { ChatSearchMatch, ChatTurn } from '../../utils/studyBuddyChatUtils';
import { StudyBuddyMemoryChunk } from '../../app/types';

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
                    <div className={`leading-relaxed break-words select-text text-neutral-900 ${turn.role === 'assistant' ? '[&_code]:bg-neutral-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md' : ''}`}>
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
                            {`${turn.content || (turn.role === 'assistant' && isChatLoading ? '...' : '')}${turn.role === 'assistant' && turn.kind !== 'status' && turn.hasMemoryWrite ? ' ✍️' : ''}`}
                        </ReactMarkdown>
                        {turn.role === 'assistant' && turn.kind !== 'status' && turn.searchResultMeta?.moreMatches?.length ? (
                            <SearchMoreMatches matches={turn.searchResultMeta.moreMatches} />
                        ) : null}
                    </div>
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
}) => (
    <div
        ref={chatPanelRef}
        className="pointer-events-auto absolute bottom-20 left-0 z-50 flex h-[42rem] min-h-[32rem] w-[46rem] min-w-[28rem] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-5rem)] flex-col rounded-[2rem] border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-xl overflow-hidden select-text animate-in fade-in slide-in-from-bottom-2 duration-200 relative"
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
                <button
                    type="button"
                    onClick={onToggleContextAware}
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
                    onClick={onToggleConversationMode}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                        isConversationMode
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-neutral-200 bg-white text-neutral-500'
                    }`}
                    title="Toggle voice conversation mode"
                >
                    <Mic size={12} className={isConversationMode ? 'animate-pulse' : ''} />
                    {isConversationMode ? 'Conversation On' : 'Conversation'}
                </button>
                <button
                    type="button"
                    onClick={onToggleChatAudio}
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

        {chatCoachActionBar}

        <div className="border-t border-neutral-100 p-3 bg-white">
            <div className="flex items-end gap-2">
                <textarea
                    value={chatInput}
                    onChange={(e) => onChatInputChange(e.target.value)}
                    onKeyDown={onChatInputKeyDown}
                    rows={3}
                    placeholder={isConversationMode ? 'Conversation mode dang bat. Hay noi de tro chuyen voi AI.' : 'Hoi StudyBuddy AI... Shift+Enter de xuong dong'}
                    disabled={isConversationMode}
                    className={`flex-1 resize-none rounded-2xl border px-4 py-3 text-sm outline-none transition-colors ${
                        isConversationMode
                            ? 'border-rose-100 bg-rose-50/70 text-rose-700'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-800 focus:border-neutral-900 focus:bg-white'
                    }`}
                />
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={onToggleChatMic}
                        disabled={isConversationMode}
                        className={`w-11 h-9 rounded-2xl border flex items-center justify-center transition-colors ${
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
                    {isChatLoading ? (
                        <button
                            type="button"
                            onClick={onStopChatStream}
                            className="h-11 min-w-[7.5rem] rounded-2xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 flex items-center justify-center gap-2 px-3 transition-colors"
                            title="Stop current response or search"
                        >
                            <StopCircle size={18} />
                            <span className="text-[11px] font-black uppercase tracking-[0.14em]">Stop</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onSendChat}
                            disabled={!chatInput.trim() || isConversationMode}
                            className="w-11 h-11 rounded-2xl bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                            title="Send"
                        >
                            <Send size={18} />
                        </button>
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
