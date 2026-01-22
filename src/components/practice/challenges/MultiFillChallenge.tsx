import React from 'react';
import { VocabularyItem } from '../../../app/types';
import { SpeechInputButton } from './SpeechInputButton';
import { useInputValidation } from './hooks/useInputValidation';

interface Props {
    word: VocabularyItem;
    userAnswer: Record<string, string>; // { nouns: '...', verbs: '...' }
    onAnswer: (val: Record<string, string>) => void;
    isFinishing: boolean;
    resultDetails: Record<string, boolean>; // { nouns: true, verbs: false }
    showHint: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
    toggleListening: (id: string, onResult: (text: string) => void) => void;
    listeningId: string | null;
}

export const MultiFillChallenge: React.FC<Props> = ({ 
    word, userAnswer, onAnswer, isFinishing, resultDetails, showHint, containerRef, toggleListening, listeningId 
}) => {
    const { clearValidation, handleSmartChange, handleValidationKeyDown, getValidationClass } = useInputValidation();
    const forms = word.wordFamily;
    const answer = userAnswer || {};

    const handleFieldChange = (type: string, newVal: string) => {
        onAnswer({ ...answer, [type]: newVal });
    };

    return (
        <div ref={containerRef} className="space-y-6 animate-in fade-in duration-300">
            <div className="text-center space-y-1">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Word Family</p>
                <h2 className="text-3xl font-black text-neutral-900">{word.word}</h2>
                <p className="text-xs font-bold text-neutral-500">Fill related forms</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
                {['nouns', 'verbs', 'adjs', 'advs'].map((type) => {
                    const correctForms = (forms?.[type as keyof typeof forms] || []).filter(f => !f.isIgnored).map(f => f.word);
                    if (correctForms.length === 0) return null;
                    
                    const label = { nouns: 'Noun', verbs: 'Verb', adjs: 'Adjective', advs: 'Adverb' }[type];
                    const val = answer[type] || '';
                    // resultDetails keys are 'nouns', 'verbs' etc because TestModal logic maps them so? 
                    // Actually, TestModal might map specific members. Let's rely on passed resultDetails.
                    // The parent passes result.details which might be { 'nouns': false } or specific keys. 
                    // Assuming simplified passing from parent for this component structure or adapted parent logic.
                    // Based on original code: const isTypeCorrect = details[type];
                    const isTypeCorrect = resultDetails[type];
                    
                    const showFeedback = isFinishing;
                    const validationKey = `fam-${type}`;
                    const isListening = listeningId === validationKey;
                    
                    return (
                        <div key={type} className="flex items-center gap-3">
                            <span className="w-20 text-[10px] font-black uppercase text-neutral-400 text-right">{label}</span>
                            <div className="flex-1 relative flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={val} 
                                    onChange={e => {
                                        clearValidation(validationKey);
                                        handleSmartChange(e, (newVal) => handleFieldChange(type, newVal), word.word);
                                    }} 
                                    onKeyDown={(e) => {
                                        handleValidationKeyDown(e, validationKey, correctForms);
                                    }}
                                    disabled={isFinishing} 
                                    className={`w-full px-4 py-2 bg-neutral-50 border-2 rounded-xl text-sm font-bold outline-none transition-all ${showFeedback ? (isTypeCorrect ? 'border-green-500 bg-green-50 text-green-800' : 'border-red-500 bg-red-50 text-red-800') : `border-neutral-100 focus:border-neutral-900 focus:bg-white ${getValidationClass(validationKey)}`}`} 
                                    placeholder="..." 
                                />
                                {!isFinishing && (
                                    <SpeechInputButton 
                                        isListening={isListening} 
                                        onClick={() => toggleListening(validationKey, (text) => handleFieldChange(type, text))} 
                                        disabled={isFinishing}
                                    />
                                )}
                                {((showFeedback && !isTypeCorrect) || showHint) && (
                                    <div className="text-[10px] font-bold text-green-600 mt-1 pl-1">
                                        {(forms?.[type as keyof typeof forms] || []).filter(f => !f.isIgnored).map(f => f.word).join(', ')}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};
