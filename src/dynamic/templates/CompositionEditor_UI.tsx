import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeft, Save, Loader2, Link, Bot, X, Sparkles, ChevronDown, Tag, PenLine, Eye } from 'lucide-react';
import { VocabularyItem } from '../../app/types';
import WordSelectorModal from '../../components/discover/games/adventure/WordSelectorModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { parseMarkdown } from '../../utils/markdownParser';

export interface CompositionEditorUIProps {
    title: string;
    setTitle: (v: string) => void;
    path: string;
    setPath: (v: string) => void;
    tagsInput: string;
    setTagsInput: (v: string) => void;
    content: string;
    setContent: (v: string) => void;
    note: string;
    setNote: (v: string) => void;
    linkedWords: VocabularyItem[];
    wordCount: number;
    aiFeedback: string | undefined;
    isFeedbackOpen: boolean;
    setIsFeedbackOpen: (v: boolean) => void;
    isSaving: boolean;
    onCancel: () => void;
    onSave: () => void;
    onAutoLink: () => void;
    onRemoveLink: (id: string) => void;
    
    // Modal Controls
    isWordSelectorOpen: boolean;
    setIsWordSelectorOpen: (v: boolean) => void;
    allWords: VocabularyItem[]; // For selector
    handleManualLink: (selectedWords: string[]) => void;
    
    isAiModalOpen: boolean;
    setIsAiModalOpen: (v: boolean) => void;
    handleGenerateEvalPrompt: (inputs: any) => string;
    handleAiResult: (data: any) => void;
}

export const CompositionEditorUI: React.FC<CompositionEditorUIProps> = ({
    title, setTitle, path, setPath, tagsInput, setTagsInput, content, setContent, note, setNote,
    linkedWords, wordCount, aiFeedback, isFeedbackOpen, setIsFeedbackOpen,
    isSaving, onCancel, onSave, onAutoLink, onRemoveLink,
    isWordSelectorOpen, setIsWordSelectorOpen, allWords, handleManualLink,
    isAiModalOpen, setIsAiModalOpen, handleGenerateEvalPrompt, handleAiResult
}) => {
    const [isPreview, setIsPreview] = useState(false);
    const [isNotePreview, setIsNotePreview] = useState(false);
    const [activeTab, setActiveTab] = useState<'ESSAY' | 'NOTE'>('ESSAY');
    const [isMetaOpen, setIsMetaOpen] = useState(false);
    const [selectedWordCount, setSelectedWordCount] = useState(0);
    const previewContainerRef = useRef<HTMLDivElement | null>(null);

    const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

    const previewHtml = useMemo(() => {
        return parseMarkdown(content);
    }, [content]);

    const notePreviewHtml = useMemo(() => {
        return parseMarkdown(note);
    }, [note]);

    const handleEssaySelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const selectedText = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
        setSelectedWordCount(countWords(selectedText));
    };

    useEffect(() => {
        if (!(activeTab === 'ESSAY' && isPreview)) return;

        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                setSelectedWordCount(0);
                return;
            }

            const container = previewContainerRef.current;
            if (!container) {
                setSelectedWordCount(0);
                return;
            }

            const range = selection.getRangeAt(0);
            const anchorNode = range.commonAncestorContainer;
            const insidePreview = container.contains(anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentNode : anchorNode);

            if (!insidePreview) {
                setSelectedWordCount(0);
                return;
            }

            setSelectedWordCount(countWords(selection.toString()));
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [activeTab, isPreview]);

    return (
        <div className="w-full flex flex-col bg-neutral-50">
            {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-1 px-6 pt-0 pb-1.5 border-b border-neutral-200 bg-neutral-50">
                <div className="-mt-1">
                    <h2 className="text-2xl font-black leading-none text-neutral-900 tracking-tight flex items-center gap-2 -mt-1"><PenLine size={18}/> Compose</h2>
                </div>
                <div className="flex items-center gap-2 -mt-1">
                    <button onClick={() => setIsAiModalOpen(true)} disabled={!content.trim()} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all disabled:opacity-50">
                        <Bot size={14} className="text-indigo-500"/><span>AI Evaluate</span>
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-white border border-neutral-300 text-neutral-700 rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-50 disabled:opacity-50 uppercase tracking-widest shadow-sm"
                    >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>{isSaving ? 'Saving...' : 'Save'}</span>
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm"
                    >
                        <Save size={14} />
                        <span>Close</span>
                    </button>
                </div>
            </header>

            <div className="bg-white px-6 pt-4 pb-2 flex flex-col">
                {/* Meta Inputs (Collapsible) */}
                <div className="mb-3 bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setIsMetaOpen(v => !v)}
                        className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-neutral-50 transition-colors"
                    >
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Topic</div>
                            <div className="text-sm font-bold text-neutral-900">Edit Title</div>
                        </div>
                        <span className="text-xs font-bold text-neutral-500">
                            {isMetaOpen ? 'Collapse' : 'Expand'}
                        </span>
                    </button>

                    {isMetaOpen && (
                        <div className="px-6 pb-4 pt-1 space-y-4 border-t border-neutral-100">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Title (Optional)</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="My Awesome Essay"
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1">
                                    <Tag size={12}/> Tags (Keywords)
                                </label>
                                <input
                                    type="text"
                                    value={tagsInput}
                                    onChange={(e) => setTagsInput(e.target.value)}
                                    placeholder="e.g. Environment, Technology"
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Essay / Note Tabs + Controls */}
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2 mb-2">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('ESSAY')}
                            className={`px-4 py-2 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
                                activeTab === 'ESSAY'
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                            }`}
                        >
                            Essay
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('NOTE');
                                setSelectedWordCount(0);
                            }}
                            className={`px-4 py-2 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all ${
                                activeTab === 'NOTE'
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                            }`}
                        >
                            Note
                        </button>
                    </div>

                    {activeTab === 'ESSAY' && (
                        <div className="flex items-center gap-4">
                            <span className="px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600">
                                Total Words: {wordCount}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-100 text-[10px] font-black uppercase tracking-wider text-cyan-700">
                                Selected Words: {selectedWordCount}
                            </span>
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                Content (Markdown Supported)
                            </label>
                            <button
                                onClick={() => setIsPreview(!isPreview)}
                                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm"
                            >
                                {isPreview ? <PenLine size={12}/> : <Eye size={12}/>} 
                                <span>{isPreview ? 'Edit' : 'Preview'}</span>
                            </button>
                        </div>
                    )}

                    {activeTab === 'NOTE' && (
                        <div className="flex items-center gap-4">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                Private Note (Markdown Supported)
                            </label>
                            <button
                                onClick={() => setIsNotePreview(!isNotePreview)}
                                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm"
                            >
                                {isNotePreview ? <PenLine size={12}/> : <Eye size={12}/>} 
                                <span>{isNotePreview ? 'Edit' : 'Preview'}</span>
                            </button>
                        </div>
                    )}
                </div>

                {activeTab === 'ESSAY' && (
                    <div className="flex flex-col gap-2">
                        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm h-[510px] relative overflow-hidden">
                            {isPreview ? (
                                <div
                                    ref={previewContainerRef}
                                    className="p-6 prose prose-sm max-w-none prose-p:text-neutral-600 prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-y-auto absolute inset-0 bg-neutral-50/30"
                                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                                />
                            ) : (
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    onSelect={handleEssaySelection}
                                    onKeyUp={handleEssaySelection}
                                    className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-sm leading-relaxed font-medium text-neutral-900 bg-white"
                                    placeholder="Start writing..."
                                    spellCheck={true}
                                    autoCorrect="on"
                                    autoCapitalize="sentences"
                                    lang="en"
                                />
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'NOTE' && (
                    <div className="flex flex-col gap-2">
                        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm h-[510px] relative overflow-hidden">
                            {isNotePreview ? (
                                <div
                                    className="p-6 prose prose-sm max-w-none prose-p:text-neutral-600 prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-y-auto absolute inset-0 bg-neutral-50/30"
                                    dangerouslySetInnerHTML={{ __html: notePreviewHtml }}
                                />
                            ) : (
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-sm leading-relaxed font-medium text-neutral-900 bg-white"
                                    placeholder="Write your private notes here..."
                                    spellCheck={false}
                                />
                            )}
                        </div>
                    </div>
                )}
                
            </div>

            {/* AI Feedback Panel */}
            {aiFeedback && (
                <div className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-sm animate-in slide-in-from-bottom-4 overflow-hidden transition-all">
                     <button 
                        onClick={() => setIsFeedbackOpen(!isFeedbackOpen)}
                        className="w-full flex items-center justify-between p-6 md:px-8 hover:bg-neutral-50 transition-colors"
                     >
                        <h3 className="text-lg font-black text-indigo-900 flex items-center gap-2">
                            <Bot size={20}/> AI Feedback
                        </h3>
                        <ChevronDown size={20} className={`text-indigo-400 transition-transform ${isFeedbackOpen ? 'rotate-180' : ''}`} />
                     </button>
                     
                     {isFeedbackOpen && (
                        <div className="px-8 pb-8 pt-0 animate-in fade-in slide-in-from-top-2">
                            <div className="prose prose-sm max-w-none text-neutral-700 prose-headings:font-bold prose-headings:text-indigo-900 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" dangerouslySetInnerHTML={{ __html: aiFeedback }} />
                        </div>
                     )}
                </div>
            )}
            
            {isWordSelectorOpen && (
                <WordSelectorModal 
                    isOpen={isWordSelectorOpen}
                    onClose={() => setIsWordSelectorOpen(false)}
                    onSelect={handleManualLink}
                    allWords={allWords}
                    wordsToExclude={new Set(linkedWords.map(w => w.word))}
                    loading={false}
                />
            )}
            
            {isAiModalOpen && (
                <UniversalAiModal 
                    isOpen={isAiModalOpen}
                    onClose={() => setIsAiModalOpen(false)}
                    type="EVALUATE_PARAPHRASE"
                    title={`Evaluate Composition`}
                    description={`AI will analyze your writing based on tags: ${tagsInput || 'General'}`}
                    initialData={{}} 
                    hidePrimaryInput={true}
                    onGeneratePrompt={handleGenerateEvalPrompt}
                    onJsonReceived={handleAiResult}
                />
            )}
        </div>
    );
};
