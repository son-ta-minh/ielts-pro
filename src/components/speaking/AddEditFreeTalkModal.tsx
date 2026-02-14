
import React, { useState, useEffect } from 'react';
import { FreeTalkItem } from '../../app/types';
import { X, Save, FileText, Tag } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string, content: string, tags: string[] }) => void;
  initialData?: FreeTalkItem | null;
}

export const AddEditFreeTalkModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setContent(initialData?.content || '');
      setTagsInput(initialData?.tags?.join(', ') || '');
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSave({ 
        title: title.trim(), 
        content: content.trim(), 
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean) 
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Free Talk' : 'New Free Talk'}</h3>
            <p className="text-sm text-neutral-500">Practice speaking natural paragraphs.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Title / Topic</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., My Hometown" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none" required />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><FileText size={12}/> Speech Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Enter the full paragraph you want to practice..." rows={6} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none leading-relaxed" required />
            <p className="text-[10px] text-neutral-400 italic text-right">The app will split this into sentences for practice.</p>
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><Tag size={12}/> Tags</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="part1, personal..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button>
        </footer>
      </form>
    </div>
  );
};
