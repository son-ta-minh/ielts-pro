import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PrepositionQuizChallenge, ChallengeResult } from '../TestModalTypes';
import { SpeechInputButton } from './SpeechInputButton';
import { useInputValidation } from './hooks/useInputValidation';

interface Props {
    group: { challenge: PrepositionQuizChallenge; index: number }[];
    userAnswers: any[];
    results: (ChallengeResult | null)[] | null;
    onAnswerChange: (index: number, val: string) => void;
    isFinishing: boolean;
    showHint: boolean;
    toggleListening: (id: string, onResult: (text: string) => void) => void;
    listeningId: string | null;
    containerRef?: React.RefObject<HTMLDivElement>;
}

export const PrepositionDrillChallenge: React.FC<Props> = ({ 
    group, userAnswers, results, onAnswerChange, isFinishing, showHint, toggleListening, listeningId, containerRef 
}) => {
    const { clearValidation, handleSmartChange, handleValidationKeyDown, getValidationClass } = useInputValidation();

    return (
        <div ref={containerRef} className="flex flex-col animate-in fade-in duration-300">
          <div className="text-center space-y-2 mb-6">
            <h3 className="text-lg font-black text-neutral-900">Preposition Drill</h3>
            <p className="text-xs text-neutral-500 font-medium max-w-xs mx-auto">Complete the collocations. Type the missing preposition(s).</p>
          </div>
          <div className="space-y-4">
            {group.map((item) => {
              const answer = userAnswers[item.index] || '';
              const result = results ? results[item.index] : null;
              const isCorrect = typeof result === 'boolean' ? result : (result && typeof result === 'object' ? result.correct : false);
              const isWrong = result !== null && !isCorrect;
              const parts = item.challenge.example.split('___');
              const preContext = parts[0]?.trim();
              const postContext = parts[1]?.trim();
              const validationKey = `prep-${item.index}`;
              const isListening = listeningId === validationKey;

              return (
                <div key={item.index} className="w-full bg-neutral-50 border-2 border-neutral-100 rounded-2xl p-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 shadow-sm transition-all focus-within:border-neutral-300 focus-within:shadow-md focus-within:bg-white">
                  {preContext && <span className="text-lg font-medium text-neutral-600 text-right">{preContext}</span>}
                  <div className="relative mx-1 flex items-center gap-2">
                    <input 
                        type="text" 
                        value={answer} 
                        onChange={(e) => {
                            clearValidation(validationKey);
                            handleSmartChange(e, (val) => onAnswerChange(item.index, val), item.challenge.answer);
                        }}
                        onKeyDown={(e) => {
                            handleValidationKeyDown(e, validationKey, item.challenge.answer);
                        }}
                        disabled={isFinishing} 
                        className={`h-10 min-w-[80px] max-w-[160px] w-[12ch] text-center text-lg font-bold rounded-lg border-b-2 outline-none transition-colors ${isFinishing ? (isCorrect ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700 decoration-red-500 line-through decoration-2') : `bg-white border-neutral-300 text-neutral-900 focus:border-neutral-900 focus:bg-neutral-50 ${getValidationClass(validationKey)}`}`} 
                        placeholder="?" 
                        autoComplete="off" 
                        autoCorrect="off" 
                        autoCapitalize="off" 
                    />
                    {!isFinishing && (
                        <SpeechInputButton 
                            isListening={isListening} 
                            onClick={() => toggleListening(validationKey, (text) => onAnswerChange(item.index, text))} 
                            disabled={isFinishing}
                        />
                    )}
                    {((isFinishing && isWrong) || showHint) && (<div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-10"><div className="bg-neutral-900 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-1 animate-in zoom-in-95"><ArrowRight size={10} className="text-green-400"/> {item.challenge.answer}</div><div className="w-2 h-2 bg-neutral-900 rotate-45 absolute left-1/2 -translate-x-1/2 -top-1"></div></div>)}
                  </div>
                  {postContext && <span className="text-lg font-medium text-neutral-800 text-left">{postContext}</span>}
                </div>
              );
            })}
          </div>
        </div>
    );
};
