
import React from 'react';
import { BookOpen, Plus, List, Sparkles } from 'lucide-react';
import { AppView } from '../types';

interface Props {
  totalCount: number;
  dueCount: number;
  setView: (view: AppView) => void;
}

const Dashboard: React.FC<Props> = ({ totalCount, dueCount, setView }) => {
  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-3xl font-bold text-neutral-900">Dashboard</h2>
        <p className="text-neutral-500 mt-2">Ready for your next IELTS target.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Library</div>
          <div className="text-3xl font-bold">{totalCount}</div>
          <div className="text-sm text-neutral-500 mt-1">Total words</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Review</div>
          <div className="text-3xl font-bold text-orange-600">{dueCount}</div>
          <div className="text-sm text-neutral-500 mt-1">Words waiting</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Intelligence</div>
          <div className="text-sm font-bold text-blue-500 mt-1">SRS v2.0 Active</div>
          <div className="text-xs text-neutral-400 mt-1">Personalized batching</div>
        </div>
      </div>

      <div className="bg-neutral-900 rounded-3xl p-10 text-white flex flex-col md:flex-row items-center justify-between shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform">
          <BookOpen size={160} />
        </div>
        
        <div className="space-y-2 relative z-10 text-center md:text-left">
          <h3 className="text-2xl font-bold">{dueCount > 0 ? 'Review & Strengthen' : 'Learn Something New'}</h3>
          <p className="text-neutral-400 max-w-sm">
            {dueCount > 0 
              ? `You have ${dueCount} words due for review. Let's keep them in your long-term memory.`
              : `All caught up! Why not pick some new words from your library to start learning?`}
          </p>
        </div>
        
        <button 
          onClick={() => setView('REVIEW')}
          disabled={totalCount === 0}
          className={`px-8 py-4 rounded-xl font-bold transition-all flex items-center space-x-3 relative z-10 shadow-2xl ${
            totalCount === 0 
              ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
              : 'bg-white text-neutral-900 hover:scale-105 active:scale-95'
          }`}
        >
          {dueCount > 0 ? <BookOpen size={20} /> : <Sparkles size={20} className="text-yellow-500" />}
          <span>{dueCount > 0 ? `Study ${dueCount} Due Words` : 'Start Learning New Words'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => setView('ADD_WORD')} className="p-6 bg-white border border-neutral-200 rounded-2xl flex items-center space-x-4 hover:border-neutral-900 transition-colors group text-left">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-900 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
            <Plus size={24} />
          </div>
          <div>
            <div className="font-bold">Add New Word</div>
            <div className="text-sm text-neutral-500">Manual or AI-assisted entry</div>
          </div>
        </button>
        <button onClick={() => setView('BROWSE')} className="p-6 bg-white border border-neutral-200 rounded-2xl flex items-center space-x-4 hover:border-neutral-900 transition-colors group text-left">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-900 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
            <List size={24} />
          </div>
          <div>
            <div className="font-bold">Browse All</div>
            <div className="text-sm text-neutral-500">Search and manage library</div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
