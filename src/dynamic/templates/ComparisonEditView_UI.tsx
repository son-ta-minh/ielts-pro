import React from 'react';
import { ArrowLeft, Sparkles, Loader2, Save } from 'lucide-react';

interface Props {
    name: string;
    setName: (v: string) => void;
    wordsInput: string;
    setWordsInput: (v: string) => void;
    path: string;
    setPath: (v: string) => void;
    tagsInput: string;
    setTagsInput: (v: string) => void;
    isSaving: boolean;
    onSave: () => void;
    onCancel: () => void;
    onOpenAiRefine: () => void;
}

export const ComparisonEditViewUI: React.FC<Props> = ({ 
    name, setName, wordsInput, setWordsInput, path, setPath, tagsInput, setTagsInput,
    isSaving, onSave, onCancel, onOpenAiRefine 
}) => {
    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
             <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <button onClick={onCancel} className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider mb-1">
                        <ArrowLeft size={14} /><span>Cancel</span>
                    </button>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Edit Comparison</h2>
                </div>
                <div className="flex items-center gap-2">
                     <button onClick={onOpenAiRefine} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all">
                        <Sparkles size={14} className="text-amber-500"/><span>AI Refine</span>
                    </button>
                     <button onClick={onSave} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm">
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>Save</span>
                    </button>
                </div>
            </header>
            
            <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6">
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Group Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Words for 'Big'" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Words to Compare</label>
                    <textarea value={wordsInput} onChange={(e) => setWordsInput(e.target.value)} rows={8} placeholder="Enter words (one per line or comma separated)..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none"/>
                    <p className="text-[10px] text-neutral-400 px-1 italic">Tip: Use AI Refine to automatically generate explanations for these words.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Path</label>
                        <input type="text" value={path} onChange={(e) => setPath(e.target.value)} placeholder="e.g. /Vocabulary/Nuance" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Tags</label>
                        <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. Adjectives, Formal" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"/>
                    </div>
                </div>
            </div>
        </div>
    );
};
