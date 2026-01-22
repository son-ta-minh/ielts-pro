import React, { useState, useEffect } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { ChallengeResult } from '../TestModalTypes';

interface GameItemUI {
    id: string;
    text: string;
    pairId: string;
    matchId?: string;
    tone?: string; 
}

interface MatchingChallengeProps<T extends { id: string; text: string; pairId: string }> {
    challenge: { contexts: T[]; items: T[] };
    answer: Map<string, string> | undefined;
    onAnswer: (answer: Map<string, string>) => void;
    isFinishing: boolean;
    result: ChallengeResult | null;
    showHint: boolean;
    itemLabel: (item: T) => React.ReactNode;
    instructionText: string;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const MatchingChallenge = <T extends { id: string; text: string; pairId: string }>({ 
    challenge, answer, onAnswer, isFinishing, result, showHint, itemLabel, instructionText, containerRef 
}: MatchingChallengeProps<T>) => {
    const [contexts, setContexts] = useState<GameItemUI[]>(challenge.contexts.map((c: any) => ({...c})));
    const [items, setItems] = useState<GameItemUI[]>(challenge.items.map((p: any) => ({...p})));
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

    const updateAnswer = (contextId: string, itemId: string | null) => {
        const newAnswer = new Map(answer);
        if (itemId === null) {
            newAnswer.delete(contextId);
        } else {
            for (const [key, value] of newAnswer.entries()) {
                if (value === itemId) newAnswer.delete(key);
            }
            newAnswer.set(contextId, itemId);
        }
        onAnswer(newAnswer);
    };

    useEffect(() => {
        const newContexts = challenge.contexts.map((c: any) => ({...c}));
        const newItems = challenge.items.map((p: any) => ({...p}));

        if (answer) {
            for (const [contextId, itemId] of answer.entries()) {
                const contextIndex = newContexts.findIndex(c => c.id === contextId);
                if (contextIndex !== -1) newContexts[contextIndex].matchId = itemId;
            }
        }
        setContexts(newContexts);
        setItems(newItems);
    }, [answer, challenge]);

    const handleItemSelect = (id: string) => {
        if (isFinishing) return;
        setSelectedItemId(currentId => currentId === id ? null : id);
    };

    const handleContextSelect = (contextId: string) => {
        if (isFinishing || !selectedItemId) return;
        updateAnswer(contextId, selectedItemId);
        setSelectedItemId(null);
    };
    
    const details = (result && typeof result === 'object' && 'details' in result) ? result.details : {};

    const handleReset = () => {
        if (!isFinishing) {
            onAnswer(new Map());
        }
    };

    return (
        <div ref={containerRef} className="flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="text-center">
                <p className="text-xs text-neutral-500 font-medium">{instructionText}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                    {contexts.map((item: any) => {
                        const isCorrect = isFinishing && details[item.id] === true;
                        const isIncorrect = isFinishing && details[item.id] === false;
                        const matchedItem = challenge.items.find((p: any) => p.id === item.matchId);
                        const correctItemText = challenge.items.find((p: any) => p.pairId === item.pairId)?.text;

                        let borderClass = 'border-neutral-200';
                        if (isFinishing) {
                            if (isCorrect) borderClass = 'border-green-400 bg-green-50';
                            if (isIncorrect) borderClass = 'border-red-400 bg-red-50';
                        } else if (showHint) {
                            borderClass = 'border-yellow-400 bg-yellow-50';
                        }
                        else if (item.matchId) {
                           borderClass = 'border-neutral-400 bg-neutral-50';
                        }
                        
                        return (
                            <button key={item.id} onClick={() => handleContextSelect(item.id)} disabled={isFinishing || !selectedItemId} className={`relative w-full p-3 rounded-xl border-2 text-left transition-all duration-200 ${borderClass} disabled:cursor-not-allowed`}>
                                {itemLabel(item)}
                                <p className="font-medium text-xs leading-snug text-neutral-600">{item.text}</p>
                                
                                {item.matchId && !isFinishing && !showHint && <p className="font-bold text-xs mt-2 pt-2 border-t border-neutral-200">{matchedItem?.text}</p>}
                                
                                {showHint && !isFinishing && (
                                    <div className="mt-2 pt-2 border-t flex items-center gap-2 text-yellow-700 animate-in fade-in">
                                        <Check size={14} className="text-yellow-600"/>
                                        <p className="font-bold text-xs">{correctItemText}</p>
                                    </div>
                                )}

                                {isFinishing && (
                                    <div className="mt-2 pt-2 border-t flex items-center gap-2">
                                        {isCorrect ? <Check size={14} className="text-green-500"/> : <X size={14} className="text-red-500"/>}
                                        <p className={`font-bold text-xs ${isIncorrect ? 'text-red-700' : 'text-green-700'}`}>{matchedItem?.text || 'No selection'}</p>
                                    </div>
                                )}
                                {isFinishing && isIncorrect && <p className="text-[10px] text-green-700 font-bold mt-1">Correct: {correctItemText}</p>}
                            </button>
                        );
                    })}
                </div>
                <div className="space-y-3">
                    {items.map(item => {
                        const isSelected = selectedItemId === item.id;
                        const isUsed = answer?.has(contexts.find(c => c.matchId === item.id)?.id || '');

                        let buttonClass = `bg-white border-neutral-200 text-neutral-800 hover:border-neutral-900`;
                        if (isFinishing && isUsed) {
                            buttonClass = `bg-neutral-100 border-neutral-200 text-neutral-400 opacity-60`;
                        } else if (isSelected) {
                            buttonClass = `bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100`;
                        } else if (isUsed) {
                            buttonClass = `bg-neutral-100 border-neutral-200 text-neutral-400 opacity-60`;
                        }
                        
                        return (
                             <button key={item.id} onClick={() => handleItemSelect(item.id)} disabled={isFinishing || isUsed} className={`w-full p-3 rounded-xl border-2 text-left transition-all duration-200 disabled:cursor-not-allowed ${buttonClass}`}>
                                <p className="font-bold text-sm leading-snug">{item.text}</p>
                            </button>
                        );
                    })}
                </div>
            </div>
            {answer && answer.size > 0 && !isFinishing && (
                <div className="flex justify-center pt-2">
                    <button onClick={handleReset} className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                        <RefreshCw size={12} /> Reset
                    </button>
                </div>
            )}
        </div>
    );
};
