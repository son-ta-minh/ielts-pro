import React, { useState, useMemo } from 'react';
import { IrregularVerb } from '../../app/types';
import { X, ArrowRight, Check, RefreshCw, BarChart, CheckCircle, XCircle } from 'lucide-react';

interface Props {
  verbs: IrregularVerb[];
  mode: 'headword' | 'random';
  onComplete: (results: { verbId: string, result: 'pass' | 'fail', incorrectForms: ('v1'|'v2'|'v3')[] }[]) => void;
  onExit: () => void;
}

export const IrregularVerbsPractice: React.FC<Props> = ({ verbs, mode, onComplete, onExit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionResults, setSessionResults] = useState<{ verbId: string, result: 'pass' | 'fail', incorrectForms: ('v1'|'v2'|'v3')[] }[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  const practiceQueue = useMemo(() => verbs.map(v => {
    let promptType: 'v1' | 'v2' | 'v3' = 'v1';
    if (mode === 'random') {
        const forms: ('v1' | 'v2' | 'v3')[] = ['v1'];
        if (v.v2) forms.push('v2');
        if (v.v3) forms.push('v3');
        promptType = forms[Math.floor(Math.random() * forms.length)];
    }
    return { verb: v, promptType };
  }), [verbs, mode]);

  const currentItem = practiceQueue[currentIndex];
  if (!currentItem) return null;

  const { verb, promptType } = currentItem;

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
    } else {
      setIsFinished(true);
    }
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

    return (
      <div className="space-y-1">
        <label className="block text-xs font-bold text-neutral-500">{label}</label>
        <div className="relative">
            <input value={value} onChange={e => setAnswers(prev => ({ ...prev, [form]: e.target.value }))} disabled={isAnswered} onKeyDown={e => { if (e.key === 'Enter' && !isAnswered) handleCheck(); }} className={`w-full px-4 py-3 border border-neutral-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-neutral-900 outline-none transition-colors ${inputClass}`} />
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

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">Practice Session</h3>
            <p className="text-sm text-neutral-500">Verb {currentIndex + 1} of {practiceQueue.length}</p>
          </div>
          <button type="button" onClick={onExit} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 grid grid-cols-3 gap-4">
          {renderInputField('v1', 'V1 (Base)')}
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
                <Check size={14}/> <span>Check Answer</span>
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};