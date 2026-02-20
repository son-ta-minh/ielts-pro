import React from 'react';
import { Volume2 } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';
import { speak } from '../../../utils/audio';
import { useInputValidation } from './hooks/useInputValidation';

interface Props {
    word: VocabularyItem;
    userAnswer: string;
    onAnswer: (val: string) => void;
    isFinishing: boolean;
    result: boolean | null;
    showHint: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const SpellingChallenge: React.FC<Props> = ({ 
    word, userAnswer, onAnswer, isFinishing, result, showHint, containerRef 
}) => {
    const { clearValidation, handleSmartChange, handleValidationKeyDown, getValidationClass } = useInputValidation();
    
    const isCorrect = result === true;
    const isWrong = result === false;
    const validationKey = 'main';

    return (
        <div ref={containerRef} className="text-center space-y-8 animate-in fade-in duration-300">
            <p className="text-sm font-bold text-neutral-500">Listen carefully and type the word.</p>
            <div className="space-y-6 flex flex-col items-center">
                <button onClick={() => speak(word.word)} className="p-6 bg-neutral-50 hover:bg-neutral-100 text-neutral-900 rounded-full shadow-sm transition-all active:scale-95">
                    <Volume2 size={32} />
                </button>
              
                <div className="w-full max-w-sm flex flex-col items-center gap-4">
                    <div className="relative w-full">
                        <input 
                            type="text" 
                            autoFocus 
                            value={userAnswer || ''} 
                            onChange={(e) => {
                                clearValidation(validationKey);
                                handleSmartChange(e, onAnswer, word.word);
                            }} 
                            onKeyDown={(e) => {
                                handleValidationKeyDown(e, validationKey, word.word);
                            }}
                            disabled={isFinishing} 
                            className={`w-full text-center py-4 rounded-2xl border-2 text-3xl font-bold focus:outline-none tracking-[0.1em] placeholder:text-neutral-200 transition-colors duration-200 ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600') : `bg-neutral-50 border-transparent focus:bg-white focus:border-neutral-900 text-neutral-900 shadow-sm ${getValidationClass(validationKey)}`}`} 
                            placeholder="TYPE HERE" 
                            autoComplete="off" 
                            autoCorrect="off" 
                            autoCapitalize="off" 
                            spellCheck="false" 
                        />
                    </div>
                    {((isFinishing && isWrong) || showHint) && (
                        <div className="text-xl font-black text-yellow-500 animate-in fade-in slide-in-from-bottom-2">
                            {word.word}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
