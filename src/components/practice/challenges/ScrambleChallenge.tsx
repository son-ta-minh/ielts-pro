import React from 'react';
import { X } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';

interface Props {
    word: VocabularyItem;
    original: string;
    shuffled: string[];
    userAnswer: string[];
    onAnswer: (val: string[]) => void;
    isFinishing: boolean;
    isCorrect: boolean | null;
    showHint: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const ScrambleChallenge: React.FC<Props> = ({ 
    word, original, shuffled, userAnswer, onAnswer, isFinishing, isCorrect, showHint, containerRef 
}) => {
    const [insertionIndex, setInsertionIndex] = React.useState(0);
    const currentSelection = userAnswer || [];
    
    // Calculate used indices based on current selection
    const usedIndices = new Set<number>();
    currentSelection.forEach(wordStr => {
        // Find first unused instance of this word in shuffled array
        const idx = shuffled.findIndex((w, i) => w === wordStr && !usedIndices.has(i));
        if (idx !== -1) usedIndices.add(idx);
    });

    const handleToggleWord = (wordStr: string) => {
        if (isFinishing) return;
        const next = [...currentSelection];
        next.splice(insertionIndex, 0, wordStr);
        onAnswer(next);
        setInsertionIndex(prev => prev + 1);
    };

    const handleRemoveWord = (idxToRemove: number) => {
        if (isFinishing) return;
        const next = [...currentSelection];
        next.splice(idxToRemove, 1);
        onAnswer(next);
        if (insertionIndex > idxToRemove) {
            setInsertionIndex(prev => prev - 1);
        }
    };

    const InsertionSlot = ({ index }: { index: number }) => {
        const isActive = index === insertionIndex;
        if (isFinishing) return <div className="w-1 mx-0.5" />;
        return (
            <div 
                onClick={() => setInsertionIndex(index)}
                className={`h-8 w-2 rounded-full cursor-pointer transition-all duration-200 mx-0.5 flex items-center justify-center ${isActive ? 'bg-indigo-500 scale-110 shadow-sm' : 'bg-transparent hover:bg-neutral-200'}`}
            >
                <div className={`w-1 h-4 rounded-full ${isActive ? 'bg-white/50' : 'bg-transparent'}`}></div>
            </div>
        );
    };

    return (
      <div ref={containerRef} className="flex flex-col space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-1">
              <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Sentence Builder</p>
              <p className="text-xs text-neutral-500 font-medium">Reconstruct the example sentence for "{word.word}".</p>
          </div>

          <div className={`min-h-[120px] p-6 rounded-[2rem] border-2 border-dashed flex flex-wrap gap-y-3 items-center justify-center transition-all ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-neutral-50 border-neutral-200'}`}>
              {currentSelection.length === 0 && !isFinishing && <span className="absolute text-sm font-bold text-neutral-300 italic pointer-events-none">Click words below to build sentence...</span>}
              
              <InsertionSlot index={0} />
              {currentSelection.map((w, i) => (
                  <React.Fragment key={`${w}-${i}`}>
                      <button onClick={() => handleRemoveWord(i)} disabled={isFinishing} className={`px-3 py-2 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 flex items-center gap-1 group ${isFinishing ? (isCorrect ? 'bg-green-600 text-white' : 'bg-red-500 text-white') : 'bg-white text-neutral-900 border border-neutral-100 hover:border-red-200 hover:text-red-500'}`}>
                          {w} {!isFinishing && <X size={14} className="opacity-40 group-hover:opacity-100" />}
                      </button>
                      <InsertionSlot index={i + 1} />
                  </React.Fragment>
              ))}
          </div>

          {(isFinishing || showHint) && (
              <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100 animate-in slide-in-from-top-2">
                  <p className="text-xs font-black text-yellow-600 uppercase tracking-widest mb-1">Correct Sentence</p>
                  <p className="text-sm font-bold text-yellow-900 leading-relaxed">{original}</p>
              </div>
          )}

          <div className="flex flex-wrap gap-2 justify-center pt-4">
              {shuffled.map((w, i) => {
                  const isUsed = usedIndices.has(i);
                  return (
                      <button key={i} onClick={() => handleToggleWord(w)} disabled={isUsed || isFinishing} className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${isUsed ? 'bg-neutral-100 text-neutral-300 border-transparent cursor-default' : 'bg-white border-2 border-neutral-100 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 shadow-sm'}`}>
                          {w}
                      </button>
                  );
              })}
          </div>

          {!isFinishing && currentSelection.length > 0 && (
              <button onClick={() => onAnswer([])} className="mx-auto flex items-center space-x-1.5 text-[10px] font-black uppercase text-neutral-400 hover:text-neutral-600 transition-colors">
                  <X size={12} /><span>Reset</span>
              </button>
          )}
      </div>
    );
};
