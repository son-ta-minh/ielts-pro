import React, { useState, useEffect } from 'react';
import { SpeakingTopic } from '../../app/types';
import { X, Mic, CheckSquare, Square, Shuffle, Play } from 'lucide-react';

interface Props {
  topic: SpeakingTopic | null;
  onClose: () => void;
  onStart: (questions: string[]) => void;
}

const SpeakingPracticeSetupModal: React.FC<Props> = ({ topic, onClose, onStart }) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (topic) {
      // Select all by default when modal opens
      selectAll();
    }
  }, [topic]);

  if (!topic) return null;

  const toggleSelection = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(topic.questions.map((_, i) => i)));
  };

  const selectNone = () => {
    setSelectedIndices(new Set());
  };

  const selectRandom = (count: number) => {
    const indices = Array.from({ length: topic.questions.length }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      // FIX: Replaced destructuring swap with a standard temp variable swap
      // to resolve misleading compiler errors about arithmetic operations and index types.
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }
    const selected = indices.slice(0, Math.min(count, indices.length));
    setSelectedIndices(new Set(selected));
  };
  
  const handleStart = () => {
    // FIX: Cast result of Array.from to number[] to resolve 'unknown' type error when 'i' is used as an index for topic.questions.
    const selectedQuestions = (Array.from(selectedIndices) as number[])
      .sort((a, b) => a - b) // Ensure original order
      .map(i => topic.questions[i]);
    if(selectedQuestions.length > 0) {
      onStart(selectedQuestions);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-2xl font-black text-neutral-900 leading-tight flex items-center gap-3"><Mic size={24}/> Practice Setup</h3>
            <p className="text-neutral-500 text-sm font-medium mt-1">Topic: <span className="font-bold text-neutral-700">{topic.name}</span></p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        
        <main className="p-8 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Select Questions ({selectedIndices.size} / {topic.questions.length})</label>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-neutral-100 hover:bg-neutral-200 rounded-md">All</button>
              <button onClick={selectNone} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-neutral-100 hover:bg-neutral-200 rounded-md">None</button>
              <button onClick={() => selectRandom(5)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-neutral-100 hover:bg-neutral-200 rounded-md"><Shuffle size={12}/> Random 5</button>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {topic.questions.map((q, i) => {
              const isSelected = selectedIndices.has(i);
              return (
                <button 
                  key={i} 
                  onClick={() => toggleSelection(i)}
                  className={`w-full flex items-start gap-3 text-left p-3 rounded-xl transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-neutral-50'}`}
                >
                  {isSelected ? <CheckSquare size={18} className="text-indigo-600 mt-0.5 shrink-0" /> : <Square size={18} className="text-neutral-300 mt-0.5 shrink-0" />}
                  <span className={`font-medium text-sm ${isSelected ? 'text-indigo-900' : 'text-neutral-700'}`}>{q}</span>
                </button>
              );
            })}
          </div>
        </main>
        
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button onClick={handleStart} disabled={selectedIndices.size === 0} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 disabled:opacity-50 uppercase tracking-widest shadow-lg">
            <Play size={16} />
            <span>Start Practice ({selectedIndices.size} Qs)</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SpeakingPracticeSetupModal;