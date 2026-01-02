
import React, { useState, useEffect, useMemo } from 'react';
import { Combine, Play, Search, Trash2, Edit3, Loader2, Calendar, MessageSquareText } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getCollocations } from '../services/db';
import { isDue } from '../utils/srs';
import EditWordModal from './EditWordModal';

interface Props {
  userId: string;
  onUpdate: (word: VocabularyItem) => void;
  onDelete: (id: string) => void;
  onStartSession: (words: VocabularyItem[]) => void;
}

const CollocationLab: React.FC<Props> = ({ userId, onUpdate, onDelete, onStartSession }) => {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [query, setQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    const data = await getCollocations(userId);
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
          <div className="inline-flex items-center px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
            <Combine size={12} className="mr-1.5" /> Lexical Resource
          </div>
          <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Collocation Lab</h2>
          <p className="text-neutral-500 mt-2 font-medium">Study long phrases, fixed expressions, and sentence patterns. These help you achieve natural flow in Writing and Speaking.</p>
        </div>
        
        {items.length > 0 && (
          <div className="flex flex-col items-end space-y-2">
            <button 
              onClick={handleStartSRSStudy}
              className={`px-8 py-4 rounded-[1.5rem] font-black shadow-xl flex items-center space-x-3 transition-all active:scale-95 ${
                dueItems.length > 0 
                ? 'bg-indigo-600 text-white shadow-indigo-200/50 hover:bg-indigo-700' 
                : 'bg-neutral-900 text-white shadow-neutral-200/50 hover:bg-neutral-800'
              }`}
            >
              <Play size={20} fill="currentColor" />
              <span>{dueItems.length > 0 ? `Review ${dueItems.length} Due Phrases` : 'Study All Phrases'}</span>
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
          placeholder="Search phrases or collocations..."
          className="w-full pl-14 pr-6 py-5 bg-white border-2 border-neutral-100 rounded-[2rem] text-lg font-medium focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-indigo-200" size={40} />
            <p className="text-xs font-black text-neutral-300 uppercase tracking-widest">Scanning Expressions...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-[3rem] text-center flex flex-col items-center justify-center text-neutral-400 space-y-4">
            <Combine size={48} strokeWidth={1.5} className="opacity-20 text-indigo-500" />
            <p className="font-medium max-w-xs">No expressions found. Mark multi-word items as "Collocations" to see them organized here.</p>
          </div>
        ) : (
          filtered.map(item => {
            const due = isDue(item);
            return (
              <div key={item.id} className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all ${due ? 'border-indigo-600 shadow-md ring-4 ring-indigo-50' : 'border-neutral-50 shadow-sm hover:border-indigo-100'}`}>
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${due ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                        {due ? 'Due for Review' : 'Scheduled'}
                      </div>
                      <span className="text-[10px] text-neutral-400 font-bold uppercase flex items-center">
                        <Calendar size={10} className="mr-1" />
                        Next: {new Date(item.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <h4 className="text-2xl font-black text-neutral-900 leading-tight">
                      {item.word}
                    </h4>

                    <div className="flex items-start space-x-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-50">
                      <MessageSquareText size={18} className="text-indigo-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold text-indigo-900">{item.meaningVi}</p>
                        <p className="text-sm text-neutral-600 mt-2 italic">"{item.example}"</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col justify-end space-x-2 md:space-x-0 md:space-y-2 shrink-0">
                    <button 
                      onClick={() => setEditingWord(item)}
                      className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl hover:bg-neutral-900 hover:text-white transition-all shadow-sm"
                      title="Edit Phrase"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => onDelete(item.id).then(loadData)}
                      className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
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

export default CollocationLab;
