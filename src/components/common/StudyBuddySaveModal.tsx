import React from 'react';
import { Loader2, Save, X } from 'lucide-react';

type ChatSaveSection = 'example' | 'preposition' | 'collocation' | 'paraphrase' | 'wordFamily';

interface ParsedPairItem {
    item: string;
    context: string;
    register?: string;
}

interface ParsedWordFamilyItem {
    word: string;
    note: string;
    bucket: 'nouns' | 'verbs' | 'adjs' | 'advs';
}

interface ChatSaveDraft {
    targetWord: string;
    sourceText: string;
    suggestedSections: ChatSaveSection[];
    selectedSection: ChatSaveSection;
    parsedPairs: ParsedPairItem[];
    parsedWordFamily: ParsedWordFamilyItem[];
}

interface StudyBuddySaveModalProps {
    chatSaveDraft: ChatSaveDraft | null;
    saveSectionLabels: Record<ChatSaveSection, string>;
    isSavingChatSnippet: boolean;
    normalizeSaveLine: (line: string) => string;
    inferWordFamilyBucket: (word: string, note: string) => 'nouns' | 'verbs' | 'adjs' | 'advs';
    onClose: () => void;
    onChangeTargetWord: (value: string) => void;
    onSelectSection: (section: ChatSaveSection) => void;
    onSave: () => void;
}

export const StudyBuddySaveModal: React.FC<StudyBuddySaveModalProps> = ({
    chatSaveDraft,
    saveSectionLabels,
    isSavingChatSnippet,
    normalizeSaveLine,
    inferWordFamilyBucket,
    onClose,
    onChangeTargetWord,
    onSelectSection,
    onSave,
}) => {
    if (!chatSaveDraft) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/75 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">Save To Word</p>
                        <p className="mt-1 text-sm font-bold text-neutral-900">Chon phan de luu vao word</p>
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
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                            Target Word
                        </label>
                        <input
                            type="text"
                            value={chatSaveDraft.targetWord}
                            onChange={(e) => onChangeTargetWord(e.target.value)}
                            placeholder="Nhap word can luu vao"
                            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus:bg-white"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-[11px] font-black uppercase tracking-wide text-neutral-500">
                            Save Section
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {(Object.keys(saveSectionLabels) as ChatSaveSection[]).map((section) => {
                                const isActive = chatSaveDraft.selectedSection === section;
                                const isSuggested = chatSaveDraft.suggestedSections.includes(section);
                                return (
                                    <button
                                        key={section}
                                        type="button"
                                        onClick={() => onSelectSection(section)}
                                        className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
                                            isActive
                                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                                : isSuggested
                                                    ? 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300'
                                                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
                                        }`}
                                    >
                                        {saveSectionLabels[section]}
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
