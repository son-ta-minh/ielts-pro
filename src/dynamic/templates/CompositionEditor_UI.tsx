import React, { useState, useMemo } from 'react';
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

    const previewHtml = useMemo(() => {
        return parseMarkdown(content);
    }, [content]);

    const notePreviewHtml = useMemo(() => {
        return parseMarkdown(note);
    }, [note]);

    return (
        <div className="w-full h-screen flex flex-col bg-neutral-50">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <button onClick={onCancel} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors mb-1">
                        <ArrowLeft size={16} /><span>Back to Studio</span>
                    </button>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><PenLine size={24}/> Compose</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsAiModalOpen(true)} disabled={!content.trim()} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all disabled:opacity-50">
                        <Bot size={14} className="text-indigo-500"/><span>AI Evaluate</span>
                    </button>
                    <button onClick={onSave} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm">
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 bg-white p-10 border-t border-neutral-200 flex flex-col">
                {/* Meta Inputs */}
                <div className="space-y-4 mb-6">
                     <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Title (Optional)</label>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Awesome Essay" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><Tag size={12}/> Tags (Keywords)</label>
                        <input 
                            type="text" 
                            value={tagsInput} 
                            onChange={(e) => setTagsInput(e.target.value)} 
                            placeholder="e.g. Environment, Technology" 
                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                        />
                    </div>
                </div>

                {/* Essay / Note Tabs */}
                <div className="flex gap-2 border-b border-neutral-200 pb-2 mb-4">
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
                        onClick={() => setActiveTab('NOTE')}
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
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center px-1">
                            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest">
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
                        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm h-[500px] relative overflow-hidden">
                            {isPreview ? (
                                <div
                                    className="p-6 prose prose-sm max-w-none prose-p:text-neutral-600 prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-y-auto absolute inset-0 bg-neutral-50/30"
                                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                                />
                            ) : (
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-base leading-relaxed font-medium text-neutral-900 bg-white"
                                    placeholder="Start writing..."
                                    spellCheck={false}
                                />
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'NOTE' && (
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center px-1">
                            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest">
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
                        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm h-[500px] relative overflow-hidden">
                            {isNotePreview ? (
                                <div
                                    className="p-6 prose prose-sm max-w-none prose-p:text-neutral-600 prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-y-auto absolute inset-0 bg-neutral-50/30"
                                    dangerouslySetInnerHTML={{ __html: notePreviewHtml }}
                                />
                            ) : (
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-base leading-relaxed font-medium text-neutral-900 bg-white"
                                    placeholder="Write your private notes here..."
                                    spellCheck={false}
                                />
                            )}
                        </div>
                    </div>
                )}
                
                {/* Linked Words Footer */}
                <div className="px-4 py-4 mt-6 bg-neutral-50/50 rounded-2xl border border-neutral-100 min-h-[80px]">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                            <Link size={12} /> Linked Vocabulary ({linkedWords.length})
                        </h4>
                        <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold text-neutral-400">{wordCount} words</span>
                             <div className="w-px h-3 bg-neutral-200"></div>
                             <button onClick={onAutoLink} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-indigo-600 transition-colors" title="Auto Link Vocabulary"><Sparkles size={14} /></button>
                             <button onClick={() => setIsWordSelectorOpen(true)} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-indigo-600 transition-colors" title="Manually Link Word"><Link size={14} /></button>
                        </div>
                    </div>
                    {linkedWords.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic text-center py-2">No words linked.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {linkedWords.map(w => (
                                <div key={w.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg shadow-sm group/tag">
                                    <span className="text-xs font-bold text-neutral-700">{w.word}</span>
                                    <button onClick={() => onRemoveLink(w.id)} className="text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover/tag:opacity-100">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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
