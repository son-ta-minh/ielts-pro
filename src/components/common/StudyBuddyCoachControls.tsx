import React from 'react';
import { Bot, Eye, GraduationCap, Image as ImageIcon, Loader2, Mic, PenTool, Plus, Search, Volume2, Wand, Wrench } from 'lucide-react';

interface ChatCoachActionBarProps {
    hasSelection: boolean;
    activeChatCoachAction: string | null;
    isAlreadyInLibrary: boolean;
    isAddingToLibrary: boolean;
    isAnyModalOpen?: boolean;
    onRestoreSelection: (event: React.MouseEvent) => void;
    onSearch: () => void;
    onTranslate: () => void;
    onReadAndIpa: () => void;
    onAddToLibrary: () => void;
    onViewWord: () => void;
    onExamples: () => void;
    onExplain: () => void;
    onImage: () => void;
    onTest: () => void;
    onCollocations: () => void;
    onParaphrase: () => void;
    onIdiom: () => void;
    onCompare: () => void;
    onWordFamily: () => void;
}

export const StudyBuddyChatCoachActionBar: React.FC<ChatCoachActionBarProps> = ({
    hasSelection,
    activeChatCoachAction,
    isAlreadyInLibrary,
    isAddingToLibrary,
    isAnyModalOpen,
    onRestoreSelection,
    onSearch,
    onTranslate,
    onReadAndIpa,
    onAddToLibrary,
    onViewWord,
    onExamples,
    onExplain,
    onImage,
    onTest,
    onCollocations,
    onParaphrase,
    onIdiom,
    onCompare,
    onWordFamily,
}) => {
    const baseButtonClass = 'rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

    const renderButtonLabel = (actionKey: string, idleLabel: string) => (
        activeChatCoachAction === actionKey
            ? <Loader2 size={14} className="animate-spin" />
            : idleLabel
    );

    return (
        <div className="grid min-w-[12rem] gap-1 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl">
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onSearch}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-teal-50 text-teal-600 hover:bg-teal-100`}
                    title="Search Vocabulary Library"
                >
                    {renderButtonLabel('search', 'Search')}
                </button>
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onImage}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-violet-50 text-violet-700 hover:bg-violet-100`}
                    title="Generate Image"
                >
                    {renderButtonLabel('image', 'Image')}
                </button>
        </div>
    );
};

interface ChatStudyMenuProps {
    activeChatCoachAction: string | null;
    hasSelection: boolean;
    showIdiom?: boolean;
    showCompare?: boolean;
    onImage: () => void;
    onExamples: () => void;
    onExplain: () => void;
    onPreposition: () => void;
    onCollocations: () => void;
    onParaphrase: () => void;
    onIdiom: () => void;
    onCompare: () => void;
    onWordFamily: () => void;
    onTestCollocations: () => void;
    onTestPreposition: () => void;
    onTestParaphrase: () => void;
    onTestWordFamily: () => void;
}

export const StudyBuddyChatStudyMenu: React.FC<ChatStudyMenuProps> = ({
    activeChatCoachAction,
    hasSelection,
    showIdiom = true,
    showCompare = true,
    onImage,
    onExamples,
    onExplain,
    onPreposition,
    onCollocations,
    onParaphrase,
    onIdiom,
    onCompare,
    onWordFamily,
    onTestCollocations,
    onTestPreposition,
    onTestParaphrase,
    onTestWordFamily,
}) => {
    const renderButtonLabel = (actionKey: string, idleLabel: string) => (
        activeChatCoachAction === actionKey
            ? <Loader2 size={14} className="animate-spin" />
            : idleLabel
    );

    const baseButtonClass = 'rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

    return (
        <div className="grid min-w-[23rem] grid-cols-2 gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl">
            <div className="space-y-1">
                <p className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">Study</p>
                <button type="button" onClick={onExplain} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-cyan-50 text-cyan-700 hover:bg-cyan-100`}>
                    {renderButtonLabel('explain', 'Explain')}
                </button>
                <button type="button" onClick={onExamples} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-blue-50 text-blue-700 hover:bg-blue-100`}>
                    {renderButtonLabel('examples', 'Examples')}
                </button>
                <button type="button" onClick={onCollocations} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-amber-50 text-amber-700 hover:bg-amber-100`}>
                    {renderButtonLabel('collocations', 'Collocations')}
                </button>
                <button type="button" onClick={onPreposition} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-sky-50 text-sky-700 hover:bg-sky-100`}>
                    {renderButtonLabel('preposition', 'Preposition')}
                </button>
                <button type="button" onClick={onParaphrase} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                    {renderButtonLabel('paraphrase', 'Paraphrase')}
                </button>
                {showIdiom ? (
                    <button type="button" onClick={onIdiom} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                        {renderButtonLabel('idioms', 'Idioms')}
                    </button>
                ) : null}
                {showCompare ? (
                    <button type="button" onClick={onCompare} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                        {renderButtonLabel('compare', 'Compare')}
                    </button>
                ) : null}
                <button type="button" onClick={onWordFamily} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                    {renderButtonLabel('wordFamily', 'Word Family')}
                </button>
                <button type="button" onClick={onImage} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-violet-50 text-violet-700 hover:bg-violet-100`}>
                    {renderButtonLabel('image', 'Image')}
                </button>
            </div>
            <div className="space-y-1">
                <p className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500">Test</p>
                <button type="button" onClick={onTestCollocations} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100`}>
                    {renderButtonLabel('test-collocation', 'Collocation')}
                </button>
                <button type="button" onClick={onTestPreposition} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100`}>
                    {renderButtonLabel('test-preposition', 'Preposition')}
                </button>
                <button type="button" onClick={onTestParaphrase} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100`}>
                    {renderButtonLabel('test-paraphrase', 'Paraphrase')}
                </button>
                <button type="button" onClick={onTestWordFamily} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} w-full bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100`}>
                    {renderButtonLabel('test-wordFamily', 'Word Family')}
                </button>
            </div>
        </div>
    );
};

interface CommandBoxProps {
    commandBoxRef: React.RefObject<HTMLDivElement | null>;
    isChatOpen: boolean;
    isAlreadyInLibrary: boolean;
    isAddingToLibrary: boolean;
    isAnyModalOpen?: boolean;
    selectedText?: string;
    serverUrl?: string;
    onRestoreSelectedRange: (event: React.MouseEvent) => void;
    onRestoreSelectedRangeHover: () => void;
    onTranslateSelection: () => void;
    onReadAndIpa: () => void;
    onSpeakSelection: () => void;
    onOpenChatPanel: (selectedText?: string) => void;
    onAddToLibrary: () => void;
    onViewWord: () => void;
    onOpenSearchPage: (selectedText?: string) => void;
    onOpenTools: () => void;
    onExamples: (selectedText?: string) => void;
    onExplain: (selectedText?: string) => void;
    onBriefExplain: (selectedText?: string) => void;
    onCollocations: (selectedText?: string) => void;
    onParaphrase: (selectedText?: string) => void;
}

export const StudyBuddyCommandBox: React.FC<CommandBoxProps> = ({
    commandBoxRef,
    isChatOpen,
    isAlreadyInLibrary,
    isAddingToLibrary,
    isAnyModalOpen,
    selectedText,
    serverUrl = '',
    onRestoreSelectedRange,
    onRestoreSelectedRangeHover,
    onTranslateSelection,
    onReadAndIpa,
    onSpeakSelection,
    onOpenChatPanel,
    onAddToLibrary,
    onViewWord,
    onOpenSearchPage,
    onOpenTools,
    onExamples,
    onExplain,
    onBriefExplain,
    onCollocations,
    onParaphrase,
}) => {
    const [isAiMenuOpen, setIsAiMenuOpen] = React.useState(false);
    const hasSelection = Boolean(selectedText?.trim());
    const handleAiAction = (action: (selectedText?: string) => void) => {
        setIsAiMenuOpen(false);
        onRestoreSelectedRangeHover();
        const latestSelectedText = (
            window.getSelection?.()?.toString().trim()
            || selectedText?.trim()
            || ''
        ).trim();
        onOpenChatPanel();
        window.setTimeout(() => {
            action(latestSelectedText);
        }, 0);
    };

    return (
        <div
            ref={commandBoxRef}
            onMouseDown={onRestoreSelectedRange}
            onMouseEnter={onRestoreSelectedRangeHover}
            className="select-none bg-white/95 backdrop-blur-xl p-1.5 rounded-[1.8rem] shadow-2xl border border-neutral-200 flex flex-col gap-1 w-[150px] animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="grid grid-cols-4 gap-1">
                <button type="button" onClick={onTranslateSelection} className="aspect-square bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition-all active:scale-90 shadow-sm font-black text-xs" title="Đọc Tiếng Việt">VI</button>
                <button type="button" onClick={onReadAndIpa} className="aspect-square bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-100 transition-all active:scale-90 shadow-sm" title="Read English"><Volume2 size={15}/></button>
                <button type="button" onClick={onSpeakSelection} className="aspect-square bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center hover:bg-amber-100 transition-all active:scale-95 shadow-sm" title="Mimic Practice"><Mic size={15}/></button>
                <div
                    onMouseEnter={() => setIsAiMenuOpen(true)}
                    onMouseLeave={() => setIsAiMenuOpen(false)}
                    className="relative"
                >
                    <button
                        type="button"
                        onMouseDown={onRestoreSelectedRange}
                        disabled={!hasSelection}
                        className="aspect-square w-full rounded-2xl bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 flex items-center justify-center text-white shadow-lg transition-all hover:brightness-105 hover:shadow-2xl hover:backdrop-blur-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        title="AI Menu"
                    >
                        <Bot size={18} className="text-white drop-shadow-md"/>
                    </button>
                    {isAiMenuOpen ? (
                        <div
                            className="absolute left-full top-0 z-10 grid min-w-[128px] gap-1 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl"
                            onMouseDown={onRestoreSelectedRange}
                        >
                            <button
                                type="button"
                                onClick={() => handleAiAction(onExplain)}
                                disabled={!hasSelection}
                                className="rounded-xl bg-cyan-50 px-3 py-2 text-left text-[11px] font-bold text-cyan-700 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                IELTS Usage
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAiAction(onBriefExplain)}
                                disabled={!hasSelection}
                                className="rounded-xl bg-teal-50 px-3 py-2 text-left text-[11px] font-bold text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Explain
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAiAction(onExamples)}
                                disabled={!hasSelection}
                                className="rounded-xl bg-blue-50 px-3 py-2 text-left text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Example
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAiAction(onCollocations)}
                                disabled={!hasSelection}
                                className="rounded-xl bg-amber-50 px-3 py-2 text-left text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Collocations
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAiAction(onParaphrase)}
                                disabled={!hasSelection}
                                className="rounded-xl bg-rose-50 px-3 py-2 text-left text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Paraphrase
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
                <button type="button" onClick={onOpenTools} className="aspect-square bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Tools"><Wrench size={15}/></button>
                {!isAlreadyInLibrary ? (
                    <button
                        type="button"
                        onClick={onAddToLibrary}
                        disabled={isAddingToLibrary}
                        className="aspect-square bg-green-50 text-green-600 rounded-2xl flex items-center justify-center hover:bg-green-100 transition-all active:scale-90 shadow-sm"
                        title="Add to Library"
                    >
                        {isAddingToLibrary ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onViewWord}
                        disabled={isAnyModalOpen}
                        className="aspect-square bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center hover:bg-sky-100 transition-all active:scale-90 shadow-sm"
                        title="View Word Details"
                    >
                        <Eye size={15} />
                    </button>
                )}
                <button type="button" onClick={() => onOpenSearchPage(selectedText)} className="aspect-square bg-cyan-50 text-cyan-700 rounded-2xl flex items-center justify-center hover:bg-cyan-100 transition-all active:scale-95 shadow-sm" title="Open Search Page"><Search size={15}/></button>
            </div>
        </div>
    );
};
