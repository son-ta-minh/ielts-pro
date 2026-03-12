import React, { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; tags: string[]; content: string }) => void;
  initialData?: { title?: string; tags?: string[]; content?: string; q?: string; a?: string };
}

export const AddEditQAModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  initialData
}) => {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || initialData?.q || '');
      setTags((initialData?.tags || []).join(', '));
      setContent(initialData?.content || initialData?.a || '');
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const parsedTags = tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    onSave({
      title: title.trim(),
      tags: parsedTags,
      content: content.trim()
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[90vh]"
      >

        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-black text-neutral-900">Speaking Q&amp;A</h3>
            <p className="text-sm text-neutral-500">Create speaking practice questions.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"
          >
            <X size={20} />
          </button>
        </header>

        <main className="p-8 space-y-6 overflow-y-auto flex-1 bg-neutral-50/30">

          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-500">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Example: Daily Routine Questions"
              className="w-full p-3 rounded-xl bg-white border border-neutral-200 outline-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-500">Tags</label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="work, routine, lifestyle"
              className="w-full p-3 rounded-xl bg-white border border-neutral-200 outline-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-500">Q&A Markdown</label>

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={`Example:

[Q]**How long** does it take you to get to work?[/Q]
[A]
I usually take about 30 minutes by bus.
Sometimes it can take longer during rush hour.
[/A]

[Q]Do you enjoy exercising?[/Q]
[A]
Yes, I try to stay active by walking a lot.
I also go jogging on weekends.
[/A]`}
              className="w-full p-4 rounded-xl bg-white border border-neutral-200 outline-none text-sm leading-relaxed min-h-[300px] font-mono"
            />

          </div>

        </main>

        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end bg-neutral-50/50 rounded-b-[2.5rem]">
          <button
            type="submit"
            className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"
          >
            <Save size={14} /> Save
          </button>
        </footer>

      </form>
    </div>
  );
};