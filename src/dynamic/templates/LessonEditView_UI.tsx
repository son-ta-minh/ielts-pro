import React, { useState, useMemo } from 'react';
import { ArrowLeft, Save, Loader2, Eye, PenLine, Sparkles, BookOpen, Tag } from 'lucide-react';
import { parseMarkdown } from '../../utils/markdownParser';

interface Props {
  title: string;
  setTitle: (t: string) => void;
  description: string;
  setDescription: (d: string) => void;
  path: string;
  setPath: (p: string) => void;
  tagsInput: string;
  setTagsInput: (t: string) => void;
  content: string;
  setContent: (c: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onPractice: () => void;
  onCancel: () => void;
  onOpenAiRefine: () => void;
}

export const LessonEditViewUI: React.FC<Props> = (props) => {
    const { title, setTitle, description, setDescription, path, setPath, tagsInput, setTagsInput, content, setContent, isSaving, onSave, onPractice, onCancel, onOpenAiRefine } = props;
    const [isPreview, setIsPreview] = useState(false);

    const previewHtml = useMemo(() => {
        return parseMarkdown(content);
    }, [content]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button onClick={onCancel} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors mb-1">
            <ArrowLeft size={16} /><span>Back to Lesson Library</span>
          </button>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Edit Lesson</h2>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onPractice} disabled={isSaving} className="px-5 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-50 active:scale-95 uppercase tracking-widest shadow-sm">
                <BookOpen size={14}/>
                <span>Read Mode</span>
            </button>
            <button onClick={onOpenAiRefine} className="px-5 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-50 active:scale-95 uppercase tracking-widest shadow-sm">
                <Sparkles size={14} className="text-amber-500"/>
                <span>AI Refine</span>
            </button>
            <button onClick={onSave} disabled={isSaving} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>{isSaving ? 'Saving...' : 'Save Lesson'}</span>
            </button>
        </div>
      </header>
      
      <div className="space-y-6 bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Lesson Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Path</label>
                <input 
                    type="text" 
                    value={path} 
                    onChange={(e) => setPath(e.target.value)} 
                    placeholder="e.g. /Grammar/Tenses" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><Tag size={12}/> Tags (Keywords)</label>
                <input 
                    type="text" 
                    value={tagsInput} 
                    onChange={(e) => setTagsInput(e.target.value)} 
                    placeholder="e.g. Grammar, Writing Task 2" 
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                />
            </div>
        </div>
        <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 mb-1">Short Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 outline-none"/>
        </div>
        
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest">Content (Markdown)</label>
                <button onClick={() => setIsPreview(!isPreview)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm">
                    {isPreview ? <PenLine size={12}/> : <Eye size={12}/>}
                    <span>{isPreview ? 'Edit' : 'Preview'}</span>
                </button>
            </div>
            
            {/* Main Editor Container - FIXED HEIGHT to prevent collapse */}
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm h-[600px] relative overflow-hidden">
                {isPreview ? (
                    <div 
                        className="p-6 prose prose-sm max-w-none prose-headings:font-black prose-p:text-neutral-600 prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-y-auto absolute inset-0 bg-neutral-50/30"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                ) : (
                    <textarea 
                        value={content} 
                        onChange={(e) => setContent(e.target.value)} 
                        className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-sm leading-relaxed font-medium text-neutral-900 bg-white font-mono"
                        placeholder="# Lesson Heading&#10;&#10;Write your lesson content here using Markdown..."
                        spellCheck={false}
                    />
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
