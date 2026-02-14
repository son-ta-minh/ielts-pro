
import React, { useState, useEffect } from 'react';
import { NativeSpeakItem, NativeSpeakAnswer } from '../../app/types';
import { X, Plus, Trash2, Save, Tag } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { standard: string, tags: string[], note: string, answers: NativeSpeakAnswer[] }) => void;
  initialData?: NativeSpeakItem | null;
}

export const AddEditNativeSpeakModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [standard, setStandard] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<NativeSpeakAnswer[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStandard(initialData?.standard || '');
      setNote(initialData?.note || '');
      setTagsInput(initialData?.tags?.join(', ') || '');
      setAnswers(initialData?.answers || []);
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!standard.trim()) return;
    onSave({ standard: standard.trim(), tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean), note: note.trim(), answers });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Expression' : 'New Expression'}</h3>
            <p className="text-sm text-neutral-500">Define context and generate expressions.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Context / Meaning</label>
            <textarea value={standard} onChange={e => setStandard(e.target.value)} placeholder="e.g., Disagreeing politely" rows={2} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none" required />
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><Tag size={12}/> Tags</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="linking, academic..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
          <div className="space-y-3 pt-2">
             <div className="flex justify-between items-center">
                 <label className="text-xs font-bold text-neutral-500 uppercase">Answers</label>
                 <button type="button" onClick={() => setAnswers([...answers, { tone: 'semi-academic', anchor: '', sentence: '' }])} className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 transition-colors"><Plus size={14}/></button>
             </div>
             {answers.map((ans, idx) => (
                 <div key={idx} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 relative group">
                     <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
                     <div className="flex gap-2">
                         <select value={ans.tone} onChange={e => { const n = [...answers]; n[idx].tone = e.target.value as any; setAnswers(n); }} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-[10px] font-bold outline-none">
                             <option value="casual">Casual</option>
                             <option value="semi-academic">Semi-Academic</option>
                             <option value="academic">Academic</option>
                         </select>
                         <input value={ans.anchor} onChange={e => { const n = [...answers]; n[idx].anchor = e.target.value; setAnswers(n); }} placeholder="Anchor phrase" className="flex-1 px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold outline-none" />
                     </div>
                     <textarea value={ans.sentence} onChange={e => { const n = [...answers]; n[idx].sentence = e.target.value; setAnswers(n); }} placeholder="Example sentence with {curly braces}" className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-medium resize-none outline-none" rows={2} />
                 </div>
             ))}
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button>
        </footer>
      </form>
    </div>
  );
};
