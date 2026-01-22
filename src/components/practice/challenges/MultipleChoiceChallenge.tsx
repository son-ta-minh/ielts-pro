import React from 'react';
import { VocabularyItem } from '../../../app/types';

interface Props {
    word: VocabularyItem;
    title: string;
    cue?: string; // Optional cue (like for collocations)
    options: string[];
    answer: string;
    selected: string;
    onAnswer: (val: string) => void;
    isFinishing: boolean;
    showHint: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const MultipleChoiceChallenge: React.FC<Props> = ({ 
    word, title, cue, options, answer, selected, onAnswer, isFinishing, showHint, containerRef 
}) => {
    return (
        <div ref={containerRef} className="text-center space-y-6 animate-in fade-in duration-300 flex flex-col">
            <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">{title}</p>
                <h2 className="text-3xl font-black text-neutral-900">{word.word}</h2>
                {cue && (
                    <div className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200 max-w-sm mx-auto mt-2">
                        <span className="text-xs font-bold text-neutral-700 italic">{cue}</span>
                    </div>
                )}
            </div>
            <div className="grid grid-cols-1 gap-3">
                {options.map((option, idx) => {
                    let stateClass = "bg-white border-neutral-200 hover:border-neutral-400 text-neutral-700";
                    if (isFinishing) {
                        if (option === answer) stateClass = "bg-green-50 border-green-500 text-green-700 shadow-md ring-1 ring-green-500";
                        else if (option === selected && option !== answer) stateClass = "bg-red-50 border-red-500 text-red-700 opacity-60";
                        else stateClass = "bg-neutral-50 border-neutral-100 text-neutral-400 opacity-40";
                    } else if (showHint && option === answer) { 
                        stateClass = "bg-yellow-50 border-yellow-400 text-yellow-800 shadow-md ring-1 ring-yellow-400"; 
                    } else if (selected === option) { 
                        stateClass = "bg-neutral-900 border-neutral-900 text-white shadow-lg"; 
                    }
                    
                    return (
                        <button 
                            key={idx} 
                            disabled={isFinishing} 
                            onClick={() => onAnswer(option)} 
                            className={`p-4 rounded-2xl border-2 text-sm font-medium transition-all duration-200 text-left leading-snug active:scale-[0.98] ${stateClass}`}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
