import React, { useState, useMemo, useEffect, useRef } from 'react';
import { IrregularVerb } from '../../app/types';
import { X, ArrowRight, Check, RefreshCw, BarChart, CheckCircle, XCircle, Zap, Eye } from 'lucide-react';

interface Props {
  verbs: IrregularVerb[];
  mode: 'headword' | 'random' | 'quick';
  onComplete: (results: { verbId: string, result: 'pass' | 'fail', incorrectForms: ('v1'|'v2'|'v3')[] }[]) => void;
  onExit: () => void;
}

export const IrregularVerbsPractice: React.FC<Props> = ({ verbs, mode, onComplete, onExit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionResults, setSessionResults] = useState<{ verbId: string, result: 'pass' | 'fail', incorrectForms: ('v1'|'v2'|'v3')[] }[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  // --- Add refs and effect for saving on exit ---
  const onCompleteRef = useRef(onComplete);
  const sessionResultsRef = useRef(sessionResults);
  const isFinishedRef = useRef(isFinished);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    sessionResultsRef.current = sessionResults;
    isFinishedRef.current = isFinished;
  }, [sessionResults, isFinished]);

  useEffect(() => {
    return () => {
      // Automatically save progress if the session is exited early without finishing
      if (sessionResultsRef.current.length > 0 && !isFinishedRef.current) {
        onCompleteRef.current(sessionResultsRef.current);
      }
    };
  }, []); // Empty dependency array ensures this cleanup runs only on unmount with latest refs
  // --- End of new code ---

  const practiceQueue = useMemo(() => verbs.map(v => {
    let promptType: 'v1' | 'v2' | 'v3' = 'v1';
    if (mode === 'random') {
        const forms: ('v1' | 'v2' | 'v3')[] = ['v1'];
        if (v.v2) forms.push('v2');
        if (v.v3) forms.push('v3');
        promptType = forms[Math.floor(Math.random() * forms.length)];
    }
    return { verb: v, promptType };
  }).sort(() => Math.random() - 0.5), [verbs, mode]);

  const currentItem = practiceQueue[currentIndex];
  if (!currentItem) return null;

  const { verb, promptType } = currentItem;

  const firstInputForm = useMemo(() => {
    const forms: ('v1' | 'v2' | 'v3')[] = ['v1', 'v2', 'v3'];
    return forms.find(form => form !== promptType);
  }, [promptType]);

  const handleCheck = () => {
    const v1_correct = (answers.v1 || '').trim().toLowerCase() === verb.v1.toLowerCase();
    const v2_correct = (answers.v2 || '').trim().toLowerCase() === verb.v2.toLowerCase();
    const v3_correct = (answers.v3 || '').trim().toLowerCase() === verb.v3.toLowerCase();

    const isOverallCorrect = (promptType !== 'v1' ? v1_correct : true) &&
                             (promptType !== 'v2' ? v2_correct : true) &&
                             (promptType !== 'v3' ? v3_correct : true);

    const incorrectForms: ('v1'|'v2'|'v3')[] = [];
    if (promptType !== 'v1' && !v1_correct) incorrectForms.push('v1');
    if (promptType !== 'v2' && !v2_correct) incorrectForms.push('v2');
    if (promptType !== 'v3' && !v3_correct) incorrectForms.push('v3');
    
    setIsAnswered(true);
    setSessionResults(prev => [...prev, { verbId: verb.id, result: isOverallCorrect ? 'pass' : 'fail', incorrectForms }]);
  };

  const handleNext = () => {
    if (currentIndex < practiceQueue.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setAnswers({});
      setIsAnswered(false);
      setIsRevealed(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleQuickAnswer = (result: 'pass' | 'fail') => {
    if (isFinished) return;
    setSessionResults(prev => [...prev, { verbId: verb.id, result, incorrectForms: result === 'fail' ? ['v1', 'v2', 'v3'] : [] }]);
    handleNext();
  };
  
  const renderInputField = (form: 'v1' | 'v2' | 'v3', label: string) => {
    if (promptType === form) {
      return <div className="space-y-1"><label className="block text-xs font-bold text-neutral-500">{label}</label><div className="w-full px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-xl font-bold text-lg">{verb[form]}</div></div>;
    }
    
    const value = answers[form] || '';
    const isFieldCorrect = (value || '').trim().toLowerCase() === verb[form].toLowerCase();
    
    let inputClass = "bg-white focus:bg-white focus:border-neutral-900";
    if (isAnswered) {
      inputClass = isFieldCorrect ? "bg-green-50 border-green-500 text-green-800" : "bg-red-50 border-red-500 text-red-800";
    }

    const isFirst = form === firstInputForm;

    return (
      <div className="space-y-1">
        <label className="block text-xs font-bold text-neutral-500">{label}</label>
        <div className="relative">
            <input 
                value={value} 
                onChange={e => setAnswers(prev => ({ ...prev, [form]: e.target.value }))} 
                disabled={isAnswered} 
                onKeyDown={e => { if (e.key === 'Enter' && !isAnswered) handleCheck(); }} 
                className={`w-full px-4 py-3 border border-neutral-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-neutral-900 outline-none transition-colors ${inputClass}`}
                autoFocus={isFirst}
            />
            {isAnswered && !isFieldCorrect && <div className="absolute top-full mt-1 text-xs font-bold text-green-600">{verb[form]}</div>}
        </div>
      </div>
    );
  };
  
  if (isFinished) {
    const correctCount = sessionResults.filter(r => r.result === 'pass').length;
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100">
                    <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><BarChart/> Session Recap</h3>
                    <p className="text-sm text-neutral-500">You got {correctCount} out of {verbs.length} correct.</p>
                </header>
                <main className="p-6 overflow-y-auto space-y-2">
                    {verbs.map(v => {
                        const result = sessionResults.find(r => r.verbId === v.id);
                        const wasCorrect = result?.result === 'pass';
                        return (
                            <div key={v.id} className={`p-3 rounded-lg flex items-center justify-between ${wasCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                                <span className="font-bold text-sm">{v.v1}, {v.v2}, {v.v3}</span>
                                {wasCorrect ? <CheckCircle className="text-green-500" size={18}/> : <XCircle className="text-red-500" size={18}/>}
                            </div>
                        )
                    })}
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    <button onClick={() => onComplete(sessionResults)} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs uppercase tracking-widest">Finish</button>
                </footer>
            </div>
        </div>
    );
  }

  if (mode === 'quick') {
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-4 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <Zap size={16} className="text-amber-500"/>
                        <h3 className="text-lg font-black text-neutral-900">Quick Review</h3>
                    </div>
                    <button type="button" onClick={onExit} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={16}/></button>
                </header>
                <main className="p-8 flex flex-col items-center text-center space-y-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Verb {currentIndex + 1} of {practiceQueue.length}</p>
                    <div className="min-h-[80px] flex flex-col justify-center">
                        <h2 className="text-4xl font-black text-neutral-900">{verb.v1}</h2>
                        {isRevealed && (
                            <p className="text-lg font-mono text-neutral-500 animate-in fade-in mt-2">{verb.v2}, {verb.v3}</p>
                        )}
                    </div>
                </main>
                <footer className="px-6 pb-6 pt-2 flex items-stretch gap-3">
                    <button onClick={() => handleQuickAnswer('fail')} disabled={isFinished} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all">
                        <RefreshCw size={20} />
                        <span className="text-[9px] font-black uppercase">Forgot</span>
                    </button>
                    <button onClick={() => setIsRevealed(true)} disabled={isRevealed || isFinished} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all">
                        <Eye size={20} />
                        <span className="text-[9px] font-black uppercase">Show Answer</span>
                    </button>
                    <button onClick={() => handleQuickAnswer('pass')} disabled={isFinished} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all">
                        <Check size={20} />
                        <span className="text-[9px] font-black uppercase">Known</span>
                    </button>
                </footer>
            </div>
        </div>
    );
  }

  // Headword & Random mode
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">Verb Practice</h3>
            <p className="text-sm text-neutral-500">Verb {currentIndex + 1} of {practiceQueue.length}</p>
          </div>
          <button type="button" onClick={onExit} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 grid grid-cols-1 gap-4">
          {renderInputField('v1', 'V1 (Base Form)')}
          {renderInputField('v2', 'V2 (Past Simple)')}
          {renderInputField('v3', 'V3 (Past Participle)')}
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          {isAnswered ? (
            <button onClick={handleNext} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest">
              <span>{currentIndex === practiceQueue.length - 1 ? 'Finish' : 'Next'}</span>
              <ArrowRight size={14}/>
            </button>
          ) : (
            <button onClick={handleCheck} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest">
              <Check size={14}/>
              <span>Check Answer</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
