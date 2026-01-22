import React, { useRef } from 'react';
import { VocabularyItem } from '../../../app/types';
import { SpeechInputButton } from './SpeechInputButton';
import { useInputValidation } from './hooks/useInputValidation';
import { SpeechRecognitionManager } from '../../../utils/speechRecognition';

interface Props {
    word: VocabularyItem;
    title: string;
    cue?: string;
    contextTag?: string; // Optional small tag (e.g. Paraphrase Tone)
    answer: string;
    userAnswer: string;
    onAnswer: (val: string) => void;
    isFinishing: boolean;
    result: boolean | null;
    showHint: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
    toggleListening: (id: string, onResult: (text: string) => void) => void;
    listeningId: string | null;
}

export const SimpleFillChallenge: React.FC<Props> = ({ 
    word, title, cue, contextTag, answer, userAnswer, onAnswer, isFinishing, result, showHint, containerRef, toggleListening, listeningId 
}) => {
    const { clearValidation, handleSmartChange, handleValidationKeyDown, getValidationClass } = useInputValidation();
    
    const isCorrect = result === true;
    const isWrong = result === false;
    const validationKey = 'main';
    const isListening = listeningId === validationKey;

    return (
        <div ref={containerRef} className="text-center space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
            <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">{title}</p>
                <h2 className="text-3xl font-black text-neutral-900">{word.word}</h2>
                {(cue || contextTag) && (
                    <div className="inline-flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200 max-w-sm">
                        {contextTag && <span className="text-[9px] font-black uppercase bg-white px-1.5 py-0.5 rounded border border-neutral-200 text-neutral-500">{contextTag}</span>}
                        {cue && <span className="text-xs font-bold text-neutral-700 italic">{cue}</span>}
                    </div>
                )}
            </div>
            
            <div className="w-full max-w-md flex flex-col items-center gap-3">
                <div className="relative w-full">
                    <input 
                        type="text" 
                        autoFocus 
                        value={userAnswer || ''} 
                        onChange={(e) => {
                            clearValidation(validationKey);
                            handleSmartChange(e, onAnswer, word.word); // Fallback to word if space pressed, can be improved
                        }} 
                        onKeyDown={(e) => {
                            handleValidationKeyDown(e, validationKey, answer);
                        }}
                        disabled={isFinishing} 
                        className={`w-full text-center py-4 pl-12 pr-12 rounded-2xl border-2 text-xl font-bold focus:outline-none placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : `bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm ${getValidationClass(validationKey)}`}`}
                        placeholder="Type answer..."
                        autoComplete="off" 
                        autoCorrect="off" 
                        autoCapitalize="off" 
                    />
                    {!isFinishing && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <SpeechInputButton 
                                isListening={isListening} 
                                onClick={() => toggleListening(validationKey, onAnswer)} 
                                disabled={isFinishing}
                            />
                        </div>
                    )}
                </div>
                {((isFinishing && isWrong) || showHint) && (
                    <div className="text-green-600 font-bold text-lg animate-in slide-in-from-top-2 bg-green-50 px-3 py-1 rounded-lg border border-green-100 inline-block">
                        {answer}
                    </div>
                )}
            </div>
        </div>
    );
};
