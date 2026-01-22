import React from 'react';
import { VocabularyItem } from '../../../app/types';
import { HeteronymForm } from '../TestModalTypes';

interface Props {
    word: VocabularyItem;
    forms: HeteronymForm[];
    ipaOptions: string[];
    userAnswer: Record<string, string>;
    onAnswer: (val: Record<string, string>) => void;
    isFinishing: boolean;
    result: boolean | null;
    showHint: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const HeteronymChallenge: React.FC<Props> = ({ 
    word, forms, ipaOptions, userAnswer, onAnswer, isFinishing, result, showHint, containerRef 
}) => {
    const currentAnswers = userAnswer || {};

    const handleSelect = (pos: string, ipa: string) => {
        onAnswer({...currentAnswers, [pos]: ipa});
    };

    return (
        <div ref={containerRef} className="text-center space-y-6 animate-in fade-in duration-300">
            <p className="text-sm font-bold text-neutral-500">
                The word <span className="font-black text-neutral-900">"{word.word}"</span> has different pronunciations. Match the IPA to the part of speech.
            </p>
            <div className="space-y-6">
                {forms.map(form => {
                    const selectedIpa = currentAnswers[form.pos];
                    
                    return (
                        <div key={form.pos} className="space-y-3">
                            <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest bg-neutral-100 py-1 rounded-md">
                                As a {form.pos}
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                {ipaOptions.map(option => {
                                    let stateClass = "bg-white border-neutral-200 hover:border-neutral-400 text-neutral-600";
                                    if (isFinishing) {
                                        if (option === form.ipa) stateClass = "bg-green-50 border-green-500 text-green-700 shadow-md";
                                        else if (option === selectedIpa) stateClass = "bg-red-50 border-red-500 text-red-700 opacity-60";
                                        else stateClass = "bg-neutral-50 border-neutral-100 text-neutral-400 opacity-50";
                                    } else if (selectedIpa === option) {
                                        stateClass = "bg-neutral-900 border-neutral-900 text-white shadow-lg";
                                    }
                                    
                                    return (
                                        <button 
                                            key={option}
                                            disabled={isFinishing}
                                            onClick={() => handleSelect(form.pos, option)}
                                            className={`p-3 rounded-xl border-2 font-mono text-base font-medium transition-all duration-200 ${stateClass}`}
                                        >
                                            {option}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            {isFinishing && result === false && !showHint &&
                <div className="text-center text-rose-600 font-bold text-sm">One or more selections were incorrect.</div>
            }
        </div>
    );
};
