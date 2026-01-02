
import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Sparkles, Play, Search, Trash2, Edit3, Loader2, Calendar, ArrowRight } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getPhrasalVerbs } from '../services/db';
import { isDue } from '../utils/srs';
import EditWordModal from './EditWordModal';

interface Props {
  userId: string;
  onUpdate: (word: VocabularyItem) => void;
  onDelete: (id: string) => void;
  onStartSession: (words: VocabularyItem[]) => void;
}

const PhrasalVerbLab: React.FC<Props> = ({ userId, onUpdate, onDelete, onStartSession }) => {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [query, setQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    const data = await getPhrasalVerbs(userId);
    const sorted = [...data].sort((a, b) => a.nextReview - b.nextReview);
    setItems(sorted);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const { dueItems } = useMemo(() => {
    return {
      dueItems: items.filter(i => isDue(i))
    };
  }, [items]);

  const filtered = items.filter(i => 
    i.word.toLowerCase().includes(query.toLowerCase()) || 
    i.meaningVi.toLowerCase().includes(query.toLowerCase())
  );

  const handleStartSRSStudy = () => {
    const sessionWords = dueItems.length > 0 ? dueItems : items;
    onStartSession(sessionWords);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
            <Layers size={12} className="mr-1.5" /> Structure & Context
          </div>
          <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Phrasal Verb Lab</h2>
          <p className="text-neutral-500 mt-2 font-medium">Master combinations of verbs and prepositions. These are essential for scoring Band 7.0+ in both Writing and Speaking.</p>
        </div>
        
        {items.length > 0 && (
          <div className="flex flex-col items-end space-y-2">
            <button 
              onClick={handleStartSRSStudy}
              className={`px-8 py-4 rounded-[1.5rem] font-black shadow-xl flex items-center space-x-3 transition-all active:scale-95 ${
                dueItems.length > 0 
                ? 'bg-blue-500 text-white shadow-blue-200/50 hover:bg-blue-600' 
                : 'bg-neutral-900 text-white shadow-neutral-200/50 hover:bg-neutral-800'
              }`}
            >
              <Play size={20} fill="currentColor" />
              <span>{dueItems.length > 0 ? `Review ${dueItems.length} Due Cụm từ` : 'Practice All Cụm từ'}</span>
            </button>
          </div>
        )}
      </header>

      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search phrasal verbs or collocations..."
          className="w-full pl-14 pr-6 py-5 bg-white border-2 border-neutral-100 rounded-[2rem] text-lg font-medium focus:ring-4 focus:ring-blue-50 focus:border-blue-200 outline-none transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-blue-200" size={40} />
            <p className="text-xs font-black text-neutral-300 uppercase tracking-widest">Scanning Structures...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-20 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-[3rem] text-center flex flex-col items-center justify-center text-neutral-400 space-y-4">
            <Layers size={48} strokeWidth={1.5} className="opacity-20" />
            <p className="font-medium max-w-xs">No phrasal verbs found. Add multi-word expressions to see them organized here.</p>
          </div>
        ) : (
          filtered.map(item => {
            const due = isDue(item);
            return (
              <div key={item.id} className={`bg-white p-7 rounded-[2.5rem] border transition-all ${due ? 'border-blue-500 shadow-md ring-2 ring-blue-50' : 'border-neutral-100 shadow-sm'}`}>
                <div className="flex justify-between items-start mb-6">
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${due ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600'}`}>
                    {due ? 'Review Due' : 'Mastered'}
                  </div>
                  <div className="flex space-x-1">
                    <button onClick={() => setEditingWord(item)} className="p-2 text-neutral-300 hover:text-neutral-900 transition-colors"><Edit3 size={16} /></button>
                    <button onClick={() => onDelete(item.id).then(loadData)} className="p-2 text-neutral-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-baseline space-x-3">
                    <h4 className="text-2xl font-black text-neutral-900 leading-none">{item.word}</h4>
                    <span className="text-xs font-mono text-neutral-400">{item.ipa}</span>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-blue-600">
                    <ArrowRight size={14} strokeWidth={3} />
                    <p className="font-bold">{item.meaningVi}</p>
                  </div>

                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 italic text-neutral-600 text-sm leading-relaxed">
                    "{item.example}"
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-neutral-100 text-[8px] font-black uppercase text-neutral-400 rounded">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center text-[10px] text-neutral-400 font-bold uppercase">
                      <Calendar size={10} className="mr-1" />
                      {new Date(item.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingWord && (
        <EditWordModal 
          word={editingWord}
          onSave={(updated) => { onUpdate(updated); loadData(); }}
          onClose={() => setEditingWord(null)}
        />
      )}
    </div>
  );
};

export default PhrasalVerbLab;
