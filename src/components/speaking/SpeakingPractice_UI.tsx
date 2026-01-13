import React from 'react';
import { SpeakingLog } from '../../app/types';
import { Mic, Loader2, Play, AlertTriangle, Square, Check, Volume2, ArrowRight, RefreshCw, BarChart, ChevronRight } from 'lucide-react';
import { speak } from '../../utils/audio';
import { BandScoreGauge } from '../common/BandScoreGauge';

type SpeakingStep = 'IDLE' | 'LOADING_QUESTIONS' | 'READY' | 'RECORDING' | 'ANALYZING' | 'RESULT';

interface Props {
  step: SpeakingStep;
  error: string | null;
  topic: string;
  questions: string[];
  currentQuestionIndex: number;
  currentResult: Omit<SpeakingLog, 'id' | 'userId' | 'timestamp' | 'part'> | null;
  history: SpeakingLog[];
  onStartPractice: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onNextQuestion: () => void;
  onRestart: () => void;
}

export const SpeakingPracticeUI: React.FC<Props> = (props) => {
  const { step, error, topic, questions, currentQuestionIndex, currentResult, history, onStartPractice, onStartRecording, onStopRecording, onNextQuestion, onRestart } = props;

  const renderContent = () => {
    if (step === 'IDLE' || step === 'LOADING_QUESTIONS') {
      return (
        <>
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><Mic size={28}/> Speaking Studio</h2>
              <p className="text-neutral-500 mt-2 font-medium">Practice IELTS speaking questions and get instant AI feedback.</p>
            </div>
            <button onClick={onStartPractice} disabled={step === 'LOADING_QUESTIONS'} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-lg disabled:opacity-50">
              {step === 'LOADING_QUESTIONS' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              <span>{step === 'LOADING_QUESTIONS' ? 'GENERATING...' : 'Start Part 1 Practice'}</span>
            </button>
          </header>
          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 flex items-center gap-2"><AlertTriangle size={16}/> {error}</div>}
          <div className="space-y-4">
            <h3 className="font-bold text-neutral-700 text-sm flex items-center gap-2"><BarChart size={16}/> Practice History</h3>
            {history.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">Your past speaking sessions will appear here.</div>
            ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                    {history.map(log => (
                        <details key={log.id} className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm cursor-pointer group">
                            <summary className="flex justify-between items-center font-medium text-sm text-neutral-800">
                                <div className='flex flex-col'>
                                    {/* FIX: Use topicName and the first question from sessionRecords array */}
                                    <span className="font-bold">{log.topicName}: <span className="font-medium">{log.sessionRecords[0]?.question}</span></span>
                                    <span className="text-xs text-neutral-400 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <BandScoreGauge score={log.estimatedBand} />
                                    <ChevronRight size={16} className="text-neutral-400 group-open:rotate-90 transition-transform" />
                                </div>
                            </summary>
                            <div className="mt-4 pt-4 border-t border-neutral-100 space-y-4">
                                {/* FIX: Use the first transcript from sessionRecords array */}
                                <div><h4 className="text-[9px] font-black uppercase text-neutral-400 mb-1">Your Answer</h4><p className="text-xs italic text-neutral-600">"{log.sessionRecords[0]?.userTranscript}"</p></div>
                                <div><h4 className="text-[9px] font-black uppercase text-neutral-400 mb-1">Feedback</h4><div className="text-xs text-neutral-700 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" dangerouslySetInnerHTML={{ __html: log.feedbackHtml }} /></div>
                                {/* FIX: Remove modelAnswer as it does not exist on SpeakingLog */}
                            </div>
                        </details>
                    ))}
                </div>
            )}
          </div>
        </>
      );
    }
    
    const question = questions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === questions.length - 1;

    return (
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center animate-in fade-in duration-500">
            <div className="w-full space-y-8">
                <div className="space-y-2">
                    <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full inline-block border border-indigo-100">{topic}</p>
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question {currentQuestionIndex + 1} of {questions.length}</p>
                </div>
                
                <div className="flex items-center justify-center gap-4">
                    <h1 className="text-2xl font-bold text-neutral-900">{question}</h1>
                    <button onClick={() => speak(question)} className="p-3 text-neutral-400 bg-neutral-50 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"><Volume2 size={20}/></button>
                </div>
                
                {step === 'READY' && <button onClick={onStartRecording} className="mx-auto w-24 h-24 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 hover:scale-105 transition-all active:scale-95"><Mic size={32}/></button>}
                {step === 'RECORDING' && <button onClick={onStopRecording} className="mx-auto w-24 h-24 bg-neutral-900 text-white rounded-full flex items-center justify-center shadow-lg shadow-neutral-500/30 animate-pulse"><Square size={28} fill="white"/></button>}
                {step === 'ANALYZING' && <div className="mx-auto w-24 h-24 bg-neutral-100 text-neutral-400 rounded-full flex items-center justify-center"><Loader2 size={32} className="animate-spin"/></div>}

                {step === 'RESULT' && currentResult && (
                    <div className="w-full text-left space-y-4 pt-4 animate-in fade-in duration-500">
                        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex justify-between items-center">
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-neutral-400 mb-1">Your Answer</h4>
                                {/* FIX: Access userTranscript from the sessionRecords array */}
                                <p className="text-sm italic text-neutral-600">"{currentResult.sessionRecords?.[currentQuestionIndex]?.userTranscript}"</p>
                            </div>
                            <BandScoreGauge score={currentResult.estimatedBand} />
                        </div>
                        <details className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm cursor-pointer group">
                            <summary className="font-bold text-sm text-neutral-800 flex justify-between items-center">
                                View Detailed Feedback
                                <ChevronRight size={16} className="text-neutral-400 group-open:rotate-90 transition-transform" />
                            </summary>
                            <div className="mt-4 pt-4 border-t border-neutral-100 space-y-4">
                                <div><h4 className="text-[9px] font-black uppercase text-neutral-400 mb-1">Feedback</h4><div className="text-xs text-neutral-700 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" dangerouslySetInnerHTML={{ __html: currentResult.feedbackHtml }} /></div>
                                {/* FIX: Remove modelAnswer as it does not exist */}
                            </div>
                        </details>
                        <div className="flex gap-3">
                            <button onClick={onRestart} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-500 rounded-xl font-bold text-xs hover:bg-neutral-50 transition-all active:scale-95 uppercase tracking-widest"><RefreshCw size={14} /></button>
                            <button onClick={onNextQuestion} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest">
                                <span>{isLastQuestion ? 'Finish Session' : 'Next Question'}</span>
                                {isLastQuestion ? <Check size={14} /> : <ArrowRight size={14} />}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
        {renderContent()}
    </div>
  );
};