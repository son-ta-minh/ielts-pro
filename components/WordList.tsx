
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Calendar, ChevronLeft, ChevronRight, Loader2, Edit3, Tag as TagIcon, MoreHorizontal } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getWordsPaged, getWordCount, saveWord } from '../services/db';
import EditWordModal from './EditWordModal';

interface Props {
  userId: string;
  onDelete: (id: string) => void;
  onUpdate: (updated: VocabularyItem) => void;
}

const PAGE_SIZE = 15;

const WordList: React.FC<Props> = ({ userId, onDelete, onUpdate }) => {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    const count = await getWordCount(userId);
    const data = await getWordsPaged(userId, page, PAGE_SIZE);
    setTotal(count);
    setWords(data);
    setLoading(false);
  }, [userId, page]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this word permanently?')) {
      await onDelete(id);
      loadPage();
    }
  };

  const handleSaveEdit = async (updated: VocabularyItem) => {
    await onUpdate(updated);
    // Refresh local list
    setWords(prev => prev.map(w => w.id === updated.id ? updated : w));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Word Library</h2>
          <p className="text-neutral-500 text-sm mt-1">
            <span className="font-bold text-neutral-900">{total}</span> items collected.
          </p>
        </div>
        <div className="relative group w-full md:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-neutral-900 transition-colors" size={16} />
          <input 
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keywords..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
          />
        </div>
      </header>

      <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-80 space-y-4">
            <Loader2 className="animate-spin text-neutral-200" size={40} />
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Loading Library...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 border-b border-neutral-100">
                  <th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Vocabulary</th>
                  <th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Meaning & Tags</th>
                  <th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Review Status</th>
                  <th className="px-6 py-5 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {words.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-20 text-center">
                      <div className="flex flex-col items-center text-neutral-300">
                        <MoreHorizontal size={48} className="mb-2 opacity-20" />
                        <p className="text-sm font-medium italic">No items found in this section.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  words.filter(w => w.word.toLowerCase().includes(query.toLowerCase()) || w.meaningVi.toLowerCase().includes(query.toLowerCase())).map(item => (
                    <tr 
                      key={item.id} 
                      onClick={() => setEditingWord(item)}
                      className="hover:bg-neutral-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-5">
                        <div className="font-bold text-neutral-900 text-base group-hover:text-blue-600 transition-colors">{item.word}</div>
                        <div className="text-[10px] font-mono text-neutral-400 mt-0.5">{item.ipa}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-sm text-neutral-600 font-medium mb-2">{item.meaningVi}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags && item.tags.length > 0 ? item.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-md text-[9px] font-black uppercase tracking-tighter">
                              <TagIcon size={8} className="mr-1" /> {tag}
                            </span>
                          )) : (
                            <span className="text-[9px] text-neutral-300 italic">no tags</span>
                          )}
                          {item.tags && item.tags.length > 3 && (
                            <span className="text-[9px] text-neutral-300 font-bold">+{item.tags.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className={`text-[10px] font-black uppercase mb-1 ${Date.now() > item.nextReview ? 'text-orange-500' : 'text-neutral-400'}`}>
                            {Date.now() > item.nextReview ? 'Due Now' : 'Upcoming'}
                          </span>
                          <span className="text-xs text-neutral-500 flex items-center">
                            <Calendar size={12} className="mr-1.5 opacity-50" />
                            {new Date(item.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingWord(item); }}
                            className="p-2.5 text-neutral-300 hover:text-neutral-900 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={(e) => handleDelete(e, item.id)}
                            className="p-2.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination controls */}
            <div className="p-6 bg-neutral-50/30 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                Page {page + 1} of {Math.max(1, totalPages)}
              </span>
              <div className="flex space-x-2">
                <button 
                  disabled={page === 0} 
                  onClick={() => setPage(p => p - 1)}
                  className="px-4 py-2 bg-white border border-neutral-200 rounded-xl hover:border-neutral-900 transition-all disabled:opacity-30 disabled:hover:border-neutral-200 text-xs font-bold flex items-center"
                >
                  <ChevronLeft size={14} className="mr-1" /> Previous
                </button>
                <button 
                  disabled={(page + 1) >= totalPages} 
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 bg-white border border-neutral-200 rounded-xl hover:border-neutral-900 transition-all disabled:opacity-30 disabled:hover:border-neutral-200 text-xs font-bold flex items-center"
                >
                  Next <ChevronRight size={14} className="ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingWord && (
        <EditWordModal 
          word={editingWord} 
          onSave={handleSaveEdit} 
          onClose={() => setEditingWord(null)} 
        />
      )}
    </div>
  );
};

export default WordList;
