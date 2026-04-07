import React from 'react';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import { ChatSaveSection } from '../../utils/studyBuddyChatUtils';
import { ParsedPairItem, ParsedWordFamilyItem } from '../../utils/studyBuddyUtils';

interface ChatSaveDraft {
    targetWord: string;
    detectedTargetWords: string[];
    libraryTargetWords: string[];
    sourceText: string;
    selectedSection: ChatSaveSection;
    availableSections: ChatSaveSection[];
    exampleLines: string[];
    parsedPairs: ParsedPairItem[];
    parsedWordFamily: ParsedWordFamilyItem[];
}

interface StudyBuddySaveModalProps {
    chatSaveDraft: ChatSaveDraft | null;
    saveSectionLabels: Record<ChatSaveSection, string>;
    isSavingChatSnippet: boolean;
    onClose: () => void;
    onChangeTargetWord: (value: string) => void;
    onChangeSection: (value: ChatSaveSection) => void;
    onRemoveExampleLine: (index: number) => void;
    onRemovePair: (index: number) => void;
    onRemoveWordFamily: (index: number) => void;
    onSave: () => void;
}

export const StudyBuddySaveModal: React.FC<StudyBuddySaveModalProps> = ({
    chatSaveDraft,
    saveSectionLabels,
    isSavingChatSnippet,
    onClose,
    onChangeTargetWord,
    onChangeSection,
    onRemoveExampleLine,
    onRemovePair,
    onRemoveWordFamily,
    onSave,
}) => {
    if (!chatSaveDraft) return null;

    const normalizedTargetWord = chatSaveDraft.targetWord.trim().toLowerCase();
    const hasLibraryTargetOptions = chatSaveDraft.libraryTargetWords.length > 0;
    const isTargetWordInLibrary = chatSaveDraft.libraryTargetWords.some(
        (word) => word.trim().toLowerCase() === normalizedTargetWord
    );

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Save To Word</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="mt-4 space-y-4">
                    <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                                Target Word
                            </label>
                            {!hasLibraryTargetOptions && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                    New
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            value={chatSaveDraft.targetWord}
                            onChange={(e) => onChangeTargetWord(e.target.value)}
                            placeholder="Enter the word to save into"
                            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus:bg-white"
                        />
                        {hasLibraryTargetOptions && (
                            <select
                                value={isTargetWordInLibrary ? chatSaveDraft.targetWord : ''}
                                onChange={(e) => onChangeTargetWord(e.target.value)}
                                className="mt-2 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus:bg-white"
                            >
                                <option value="">
                                    Choose existing word from library
                                </option>
                                {chatSaveDraft.libraryTargetWords.map((word) => (
                                    <option key={word} value={word}>
                                        {word}
                                    </option>
                                ))}
                            </select>
                        )}
                        {hasLibraryTargetOptions && isTargetWordInLibrary && (
                            <p className="mt-2 text-[11px] font-semibold text-neutral-500">
                                Saving into an existing library word.
                            </p>
                        )}
                        {chatSaveDraft.detectedTargetWords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {chatSaveDraft.detectedTargetWords.map((word) => (
                                    <button
                                        key={word}
                                        type="button"
                                        onClick={() => onChangeTargetWord(word)}
                                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-colors ${
                                            chatSaveDraft.targetWord.trim().toLowerCase() === word.trim().toLowerCase()
                                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                                : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                                        }`}
                                    >
                                        {word}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                            Save Type
                        </label>
                        {chatSaveDraft.availableSections.length > 1 ? (
                            <select
                                value={chatSaveDraft.selectedSection}
                                onChange={(e) => onChangeSection(e.target.value as ChatSaveSection)}
                                className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus:bg-white"
                            >
                                {chatSaveDraft.availableSections.map((section) => (
                                    <option key={section} value={section}>
                                        {saveSectionLabels[section]}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                                {saveSectionLabels[chatSaveDraft.selectedSection]}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                            Preview
                        </label>
                        <div className="max-h-48 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                            {chatSaveDraft.selectedSection === 'example' && (
                                <div className="space-y-2">
                                    {chatSaveDraft.exampleLines.map((line, index) => (
                                        <div key={`${line}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                            <p className="whitespace-pre-wrap leading-relaxed text-neutral-900">{line}</p>
                                            <button
                                                type="button"
                                                onClick={() => onRemoveExampleLine(index)}
                                                className="shrink-0 rounded-lg p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                title="Remove item"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(chatSaveDraft.selectedSection === 'collocation' || chatSaveDraft.selectedSection === 'paraphrase' || chatSaveDraft.selectedSection === 'preposition' || chatSaveDraft.selectedSection === 'idiom') && (
                                <div className="space-y-2">
                                    {chatSaveDraft.parsedPairs.map((item, index) => (
                                        <div key={`${item.item}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="font-bold text-neutral-900">{item.item}</p>
                                            {!!item.context && <p className="mt-1 text-neutral-600">{item.context}</p>}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => onRemovePair(index)}
                                                className="shrink-0 rounded-lg p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                title="Remove item"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {chatSaveDraft.selectedSection === 'userNote' && (
                                <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                    <p className="whitespace-pre-wrap leading-relaxed text-neutral-900">{chatSaveDraft.sourceText}</p>
                                </div>
                            )}
                            {chatSaveDraft.selectedSection === 'wordFamily' && (
                                <div className="space-y-2">
                                    {chatSaveDraft.parsedWordFamily.map((item, index) => (
                                        <div key={`${item.word}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="font-bold text-neutral-900">{item.word}</p>
                                                {!!item.note && <p className="mt-1 text-neutral-600">{item.note}</p>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">{item.bucket}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => onRemoveWordFamily(index)}
                                                    className="shrink-0 rounded-lg p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                    title="Remove item"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {chatSaveDraft.selectedSection === 'example' && chatSaveDraft.exampleLines.length === 0 && (
                                <p className="text-neutral-500">No items left to save.</p>
                            )}
                            {(chatSaveDraft.selectedSection === 'collocation' || chatSaveDraft.selectedSection === 'paraphrase' || chatSaveDraft.selectedSection === 'preposition' || chatSaveDraft.selectedSection === 'idiom') && chatSaveDraft.parsedPairs.length === 0 && (
                                <p className="text-neutral-500">No items left to save.</p>
                            )}
                            {chatSaveDraft.selectedSection === 'wordFamily' && chatSaveDraft.parsedWordFamily.length === 0 && (
                                <p className="text-neutral-500">No items left to save.</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-neutral-200 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-neutral-600 transition-colors hover:bg-neutral-100"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onSave}
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
    );
};
