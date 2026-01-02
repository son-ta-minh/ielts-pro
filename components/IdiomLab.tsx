
import React, { useState, useEffect, useMemo } from 'react';
import { Quote, Sparkles, Play, Search, Trash2, Edit3, Loader2, Calendar } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getIdioms } from '../services/db';
import { isDue } from '../utils/srs';
import EditWordModal from './EditWordModal';

interface Props {
  userId: string;
  onUpdate: (word: VocabularyItem) => void;
  onDelete: (id: string) => void;
  onStartSession: (words: VocabularyItem[]) => void;
}

const IdiomLab: React.FC<Props> = ({ userId, onUpdate, onDelete, onStartSession }) => {
  const [idioms, setIdioms] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [query, setQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    const data = await getIdioms(userId);
    // Sort by due date (oldest nextReview first)
    const sorted = [...data].sort((a, b) => a.nextReview - b.nextReview);
    setIdioms(sorted);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const { dueItems, upcomingItems } = useMemo(() => {
    const now = Date.now();
    return {
      dueItems: idioms.filter(i => isDue(i)),
      upcomingItems: idioms.filter(i => !isDue(i))
    };
  }, [idioms]);

  const filtered = idioms.filter(i => 
    i.word.toLowerCase().includes(query.toLowerCase()) || 
    i.meaningVi.toLowerCase().includes(query.toLowerCase())
  );

  const handleStartSRSStudy = () => {
    // If there are due items, prioritize them. Otherwise, take everything sorted by "soonest to forget"
    const sessionWords = dueItems.length > 0 ? dueItems : idioms;
    onStartSession(sessionWords);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
            <Quote size={12} className="mr-1.5" /> Natural Expression
          </div>
          <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Idiom Lab</h2>
          <p className="text-neutral-500 mt-2 font-medium">Elevate your IELTS Speaking band score by mastering common English idioms via Spaced Repetition.</p>
        </div>
        
        {idioms.length > 0 && (
          <div className="flex flex-col items-end space-y-2">
            <button 
              onClick={handleStartSRSStudy}
              className={`px-8 py-4 rounded-[1.5rem] font-black shadow-xl flex items-center space-x-3 transition-all active:scale-95 ${
                dueItems.length > 0 
                ? 'bg-amber-500 text-white shadow-amber-200/50 hover:bg-amber-600' 
                : 'bg-neutral-900 text-white shadow-neutral-200/50 hover:bg-neutral-800'
              }`}
            >
              <Play size={20} fill="currentColor" />
              <span>{dueItems.length > 0 ? `Review ${dueItems.length} Due Idioms` : 'Refresh All Idioms'}</span>
            </button>
            {dueItems.length === 0 && <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">All caught up!</span>}
          </div>
        )}
      </header>

      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search idioms..."
          className="w-full pl-14 pr-6 py-5 bg-white border-2 border-neutral-100 rounded-[2rem] text-lg font-medium focus:ring-4 focus:ring-amber-50 focus:border-amber-200 outline-none transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-amber-200" size={40} />
            <p className="text-xs font-black text-neutral-300 uppercase tracking-widest">Gathering Idioms...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-20 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-[3rem] text-center flex flex-col items-center justify-center text-neutral-400 space-y-4">
            <Quote size={48} strokeWidth={1.5} className="opacity-20" />
            <p className="font-medium max-w-xs">No idioms found. Add phrases and they will appear here based on your SRS schedule.</p>
          </div>
        ) : (
          filtered.map(item => {
            const due = isDue(item);
            return (
              <div key={item.id} className={`bg-white p-6 rounded-[2rem] border transition-all group border-b-4 ${due ? 'border-amber-500 shadow-md ring-2 ring-amber-50' : 'border-neutral-100 shadow-sm border-b-neutral-200'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-2 rounded-xl flex items-center space-x-2 ${due ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600'}`}>
                    <Quote size={16} />
                    {due && <span className="text-[10px] font-black uppercase tracking-widest">Due</span>}
                  </div>
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => setEditingWord(item)}
                      className="p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button 
                      onClick={() => onDelete(item.id).then(() => loadData())}
                      className="p-2 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h4 className="text-xl font-black text-neutral-900 mb-1">{item.word}</h4>
                <div className="flex items-center space-x-2 mb-3">
                  <p className="text-sm font-bold text-amber-600">{item.meaningVi}</p>
                  <span className="text-[10px] text-neutral-300">•</span>
                  <div className="flex items-center text-[10px] text-neutral-400 font-bold uppercase">
                    <Calendar size={10} className="mr-1" />
                    {new Date(item.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <p className="text-xs text-neutral-500 italic leading-relaxed line-clamp-2">"{item.example}"</p>
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

export default IdiomLab;
