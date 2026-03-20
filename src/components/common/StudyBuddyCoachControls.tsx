import React from 'react';
import { Blocks, Bot, BringToFront, Eye, Languages, ListCollapse, Loader2, Mic, NotebookPen, PenTool, Plus, Search, Volume2, Wrench } from 'lucide-react';

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
    onCollocations: () => void;
    onParaphrase: () => void;
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
    onCollocations,
    onParaphrase,
    onWordFamily,
}) => {
    const baseButtonClass = 'h-8 rounded-2xl flex items-center justify-center px-3 text-[10px] font-black uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

    return (
        <div className="border-t border-neutral-100 bg-neutral-50/90 px-0 py-0">
            <div className="grid grid-cols-8 gap-2">
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onSearch}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-teal-50 text-teal-600 hover:bg-teal-100`}
                    title="Search Vocabulary Library"
                >
                    {activeChatCoachAction === 'search' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onTranslate}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-indigo-50 text-indigo-600 hover:bg-indigo-100`}
                    title="Translate to Vietnamese"
                >
                    {activeChatCoachAction === 'translate' ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                </button>
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onReadAndIpa}
                    disabled={!hasSelection}
                    className={`${baseButtonClass} bg-purple-50 text-purple-600 hover:bg-purple-100`}
                    title="Read in English"
                >
                    <Volume2 size={14} />
                </button>
                {!isAlreadyInLibrary ? (
                    <button type="button" onMouseDown={onRestoreSelection} onClick={onAddToLibrary} disabled={!hasSelection || isAddingToLibrary} className={`${baseButtonClass} bg-green-50 text-green-600 hover:bg-green-100`} title="Add to Library">
                        {isAddingToLibrary ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
                    </button>
                ) : (
                    <button type="button" onMouseDown={onRestoreSelection} onClick={onViewWord} disabled={!hasSelection || isAnyModalOpen} className={`${baseButtonClass} bg-sky-50 text-sky-600 hover:bg-sky-100`} title="View Word Details">
                        <Eye size={15} />
                    </button>
                )}
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onExamples}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-blue-50 text-blue-600 hover:bg-blue-100`}
                    title="Examples"
                >
                    {activeChatCoachAction === 'examples' ? <Loader2 size={14} className="animate-spin" /> : <NotebookPen size={14} />}
                </button>
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onCollocations}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-amber-50 text-amber-600 hover:bg-amber-100`}
                    title="Collocations"
                >
                    {activeChatCoachAction === 'collocations' ? <Loader2 size={14} className="animate-spin" /> : <Blocks size={14} />}
                </button>
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onParaphrase}
                    disabled={!hasSelection || !!activeChatCoachAction}
                    className={`${baseButtonClass} bg-rose-50 text-rose-600 hover:bg-rose-100`}
                    title="Paraphrase"
                >
                    {activeChatCoachAction === 'paraphrase' ? <Loader2 size={14} className="animate-spin" /> : <BringToFront size={14} />}
                </button>
                <button
                    type="button"
                    onMouseDown={onRestoreSelection}
                    onClick={onWordFamily}
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
