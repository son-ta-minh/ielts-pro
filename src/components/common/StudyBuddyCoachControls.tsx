import React from 'react';
import { Bot, Eye, Loader2, Mic, PenTool, Plus, Volume2, Wrench } from 'lucide-react';

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
    onExamples: () => void;
    onExplain: () => void;
    onPreposition: () => void;
    onTest: () => void;
    onCollocations: () => void;
    onParaphrase: () => void;
    onIdiom: () => void;
    onCompare: () => void;
    onWordFamily: () => void;
}

export const StudyBuddyChatStudyMenu: React.FC<ChatStudyMenuProps> = ({
    activeChatCoachAction,
    hasSelection,
    showIdiom = true,
    showCompare = true,
    onExamples,
    onExplain,
    onPreposition,
    onTest,
    onCollocations,
    onParaphrase,
    onIdiom,
    onCompare,
    onWordFamily,
}) => {
    const renderButtonLabel = (actionKey: string, idleLabel: string) => (
        activeChatCoachAction === actionKey
            ? <Loader2 size={14} className="animate-spin" />
            : idleLabel
    );

    const baseButtonClass = 'rounded-xl px-3 py-2 text-left text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

    return (
        <div className="grid min-w-[12rem] gap-1 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl">
            <button type="button" onClick={onExplain} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-cyan-50 text-cyan-700 hover:bg-cyan-100`}>
                {renderButtonLabel('explain', 'Explain')}
            </button>
            <button type="button" onClick={onExamples} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}>
                {renderButtonLabel('examples', 'Examples')}
            </button>
            <button type="button" onClick={onCollocations} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-amber-50 text-amber-700 hover:bg-amber-100`}>
                {renderButtonLabel('collocations', 'Collocations')}
            </button>
            <button type="button" onClick={onPreposition} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-sky-50 text-sky-700 hover:bg-sky-100`}>
                {renderButtonLabel('preposition', 'Preposition')}
            </button>
            <button type="button" onClick={onParaphrase} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                {renderButtonLabel('paraphrase', 'Paraphrase')}
            </button>
            {showIdiom ? (
                <button type="button" onClick={onIdiom} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                    {renderButtonLabel('idioms', 'Idioms')}
                </button>
            ) : null}
            {showCompare ? (
                <button type="button" onClick={onCompare} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                    {renderButtonLabel('compare', 'Compare')}
                </button>
            ) : null}
            <button type="button" onClick={onWordFamily} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                {renderButtonLabel('wordFamily', 'Word Family')}
            </button>
            <button type="button" onClick={onTest} disabled={!hasSelection || !!activeChatCoachAction} className={`${baseButtonClass} bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100`}>
                {renderButtonLabel('test', 'Test')}
            </button>
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
    onRestoreSelectedRange: (event: React.MouseEvent) => void;
    onRestoreSelectedRangeHover: () => void;
    onTranslateSelection: () => void;
    onReadAndIpa: () => void;
    onSpeakSelection: () => void;
    onOpenChatPanel: (selectedText?: string) => void;
    onAddToLibrary: () => void;
    onViewWord: () => void;
    onOpenNote: () => void;
    onOpenTools: () => void;
}

export const StudyBuddyCommandBox: React.FC<CommandBoxProps> = ({
    commandBoxRef,
    isChatOpen,
    isAlreadyInLibrary,
    isAddingToLibrary,
    isAnyModalOpen,
    selectedText,
    onRestoreSelectedRange,
    onRestoreSelectedRangeHover,
    onTranslateSelection,
    onReadAndIpa,
    onSpeakSelection,
    onOpenChatPanel,
    onAddToLibrary,
    onViewWord,
    onOpenNote,
    onOpenTools,
}) => (
    <div
        ref={commandBoxRef}
        onMouseDown={onRestoreSelectedRange}
        onMouseEnter={onRestoreSelectedRangeHover}
        className="bg-white/95 backdrop-blur-xl p-1.5 rounded-[1.8rem] shadow-2xl border border-neutral-200 flex flex-col gap-1 w-[160px] animate-in fade-in zoom-in-95 duration-200"
    >
        <div className="grid grid-cols-8 gap-1">
            <button type="button" onClick={onTranslateSelection} className="col-span-2 aspect-square bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition-all active:scale-90 shadow-sm font-black text-xs" title="Đọc Tiếng Việt">VI</button>
            <button type="button" onClick={onReadAndIpa} className="col-span-2 aspect-square bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-100 transition-all active:scale-90 shadow-sm" title="Read English"><Volume2 size={15}/></button>
            <button type="button" onClick={onSpeakSelection} className="col-span-2 aspect-square bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center hover:bg-amber-100 transition-all active:scale-95 shadow-sm" title="Mimic Practice"><Mic size={15}/></button>
            {!isChatOpen && (
                <button type="button" onClick={() => onOpenChatPanel(selectedText)} className="col-span-2 aspect-square bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95 shadow-sm" title="Ask AI"><Bot size={15}/></button>
            )}
            {!isAlreadyInLibrary ? (
                <button type="button" onClick={onAddToLibrary} disabled={isAddingToLibrary} className="col-span-2 aspect-square bg-green-50 text-green-600 rounded-2xl flex items-center justify-center hover:bg-green-100 transition-all active:scale-90 shadow-sm" title="Add to Library">{isAddingToLibrary ? <Loader2 size={14} className="animate-spin"/> : <Plus size={15}/>}</button>
            ) : (
                <button type="button" onClick={onViewWord} disabled={isAnyModalOpen} className="col-span-2 aspect-square bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center hover:bg-sky-100 transition-all active:scale-90 shadow-sm" title="View Word Details"><Eye size={15}/></button>
            )}
            <button type="button" onClick={onOpenNote} className="col-span-2 aspect-square bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Open Note"><PenTool size={15}/></button>
            <button type="button" onClick={onOpenTools} className="col-span-2 aspect-square bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Tools"><Wrench size={15}/></button>
        </div>
    </div>
);
