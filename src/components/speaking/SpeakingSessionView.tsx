import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { User, SpeakingTopic, SpeakingLog, SpeakingSessionRecord } from '../../app/types';
import * as db from '../../app/db';
import { getSpeakingEvaluationFromTextPrompt } from '../../services/promptService';
import { startRecording, stopRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { Loader2, ArrowLeft, Mic, Square, Volume2, Play, AlertTriangle, ChevronRight, BarChart, Download, Bot, Clock } from 'lucide-react';
import { speak } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import UniversalAiModal from '../common/UniversalAiModal';

interface Props {
  user: User;
  topic: SpeakingTopic;
  onComplete: () => void;
}

// FIX: Add 'ANALYZING' to SessionStep type to allow its use in setStep.
type SessionStep = 'PRACTICING' | 'REVIEW' | 'ANALYZING' | 'RESULT';

interface SessionQuestion {
  question: string;
  part: 1 | 2 | 3;
  cueCard?: { cueCard: string, points: string[] };
}

const downloadAudio = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:audio/webm;base64,${base64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const SpeakingSessionView: React.FC<Props> = ({ user, topic, onComplete }) => {
  const [step, setStep] = useState<SessionStep>('PRACTICING');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  
  const [recordedAudio, setRecordedAudio] = useState<Record<number, string>>({});
  const [sessionTranscripts, setSessionTranscripts] = useState<Record<number, string>>({});
  const [liveTranscript, setLiveTranscript] = useState('');

  const [isPreparingPart2, setIsPreparingPart2] = useState(false);
  const [prepTimeLeft, setPrepTimeLeft] = useState(60);

  const [finalResult, setFinalResult] = useState<SpeakingLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [transcriptsForEval, setTranscriptsForEval] = useState<{ question: string; transcript: string }[] | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const audioPlayers = useRef<Record<number, HTMLAudioElement>>({});
  const recognitionManager = useRef(new SpeechRecognitionManager());
  const prepTimerRef = useRef<number | null>(null);
  const { showToast } = useToast();

  const isFullTest = useMemo(() => !!topic.part2, [topic]);
  const allQuestions = useMemo<SessionQuestion[]>(() => {
    if (!topic) return [];
    const p1 = (topic.questions || []).map(q => ({ question: q, part: 1 as const }));
    const p2 = topic.part2 ? [{ question: 'Part 2 Cue Card', part: 2 as const, cueCard: topic.part2 }] : [];
    const p3 = (topic.part3 || []).map(q => ({ question: q, part: 3 as const }));
    return [...p1, ...p2, ...p3];
  }, [topic]);

  const currentQuestionData = allQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;

  const handleStartRecording = useCallback(async () => {
    try {
      await startRecording();
      setIsRecording(true);
      setError(null);
      setLiveTranscript('');
      
      recognitionManager.current.start(
        (final, interim) => setLiveTranscript(final + interim),
        (finalTranscript) => setSessionTranscripts(prev => ({ ...prev, [currentQuestionIndex]: finalTranscript }))
      );
    } catch (err) {
      console.error(err);
      setError('Could not start recording. Please ensure microphone permissions are granted.');
    }
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (currentQuestionData?.part === 2 && !isRecording && step === 'PRACTICING' && !isPreparingPart2) {
        setIsPreparingPart2(true);
        setPrepTimeLeft(60);
        
        prepTimerRef.current = window.setInterval(() => {
            setPrepTimeLeft(prev => {
                if (prev <= 1) {
                    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
                    setIsPreparingPart2(false);
                    handleStartRecording();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current); };
    }
  }, [currentQuestionIndex, currentQuestionData, isRecording, step, handleStartRecording]);

  useEffect(() => {
    return () => {
      // FIX: The 'remove' method is for DOM elements, and these audio players are not in the DOM.
      // Instead, we stop playback and release the audio resource to prevent memory leaks.
      Object.values(audioPlayers.current).forEach(player => {
        // Fix: Explicitly cast player to HTMLAudioElement to resolve 'unknown' type error.
        (player as HTMLAudioElement).pause();
        (player as HTMLAudioElement).src = '';
      });
      recognitionManager.current.stop();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, []);
  
  const handleStopRecording = async () => {
    try {
      const audioBase64 = await stopRecording();
      recognitionManager.current.stop();
      if (!audioBase64) throw new Error("Recording was empty.");

      setRecordedAudio(prev => ({ ...prev, [currentQuestionIndex]: audioBase64 }));
      setIsRecording(false);
      
      if (isLastQuestion) {
        setStep('REVIEW');
      } else {
        setCurrentQuestionIndex(prev => prev + 1);
      }
    } catch (e) {
      setError('Failed to save recording.');
      setIsRecording(false);
    }
  };
  
  const playRecording = (index: number) => {
    const audioBase64 = recordedAudio[index];
    if (audioBase64) {
        if (!audioPlayers.current[index]) {
            audioPlayers.current[index] = new Audio(`data:audio/webm;base64,${audioBase64}`);
        }
        audioPlayers.current[index].play();
    }
  };

  const handleGetEvaluation = () => {
    const transcripts = allQuestions
        .map((q, i) => ({ question: q.cueCard ? q.cueCard.cueCard : q.question, transcript: sessionTranscripts[i] || '' }))
        .filter(item => item.transcript);

    if (transcripts.length === 0) {
        showToast("No answers were transcribed to evaluate.", "error");
        return;
    }
    setTranscriptsForEval(transcripts);
    setIsAiModalOpen(true);
  };

  const handleGenerateEvalPrompt = () => {
    if (!transcriptsForEval) return '';
    return getSpeakingEvaluationFromTextPrompt(topic.name, transcriptsForEval);
  };

  const handleAiEvaluationResult = async (result: { band: number; feedback: string }) => {
    try {
        if (!result || typeof result.band !== 'number' || !result.feedback || !transcriptsForEval) {
            throw new Error("Invalid JSON structure from AI or missing transcripts.");
        }

        setStep('ANALYZING');
      
        const newLog: SpeakingLog = {
            id: `spk-${Date.now()}`,
            userId: user.id,
            timestamp: Date.now(),
            part: isFullTest ? 'Full Test' : 'Custom',
            topicName: topic.name,
            sessionRecords: transcriptsForEval.map(t => ({ question: t.question, userTranscript: t.transcript })),
            estimatedBand: result.band,
            feedbackHtml: result.feedback,
        };

        await db.saveSpeakingLog(newLog);
        setFinalResult(newLog);
        setStep('RESULT');
        setIsAiModalOpen(false);
        setTranscriptsForEval(null);

    } catch (e: any) {
      console.error(e);
      throw new Error(e.message || 'Failed to process AI response.');
    }
  };
  
  if (step === 'RESULT' && finalResult) {
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <header><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Session Report</h2><p className="text-neutral-500 mt-1">Topic: <span className="font-bold text-neutral-700">{finalResult.topicName}</span></p></header>
            <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex items-center justify-between">
                <div><h4 className="text-[10px] font-black uppercase text-neutral-400 mb-1">Overall Band Score</h4><p className="text-5xl font-black">{finalResult.estimatedBand.toFixed(1)}</p></div>
                <div className="text-right"><h4 className="text-[10px] font-black uppercase text-neutral-400 mb-1">Session Date</h4><p className="font-mono text-xs">{new Date(finalResult.timestamp).toLocaleString()}</p></div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                <h4 className="text-sm font-black text-neutral-900 flex items-center gap-2"><BarChart size={16}/> Examiner's Feedback</h4>
                <div className="text-sm text-neutral-800 leading-relaxed font-medium bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" dangerouslySetInnerHTML={{ __html: finalResult.feedbackHtml }} />
            </div>
            <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                <h4 className="text-sm font-black text-neutral-900">Transcripts</h4>
                <div className="space-y-4">
                    {finalResult.sessionRecords.map((rec, i) => (
                        <div key={i} className="p-4 rounded-xl border border-neutral-100 bg-neutral-50/50">
                            <p className="text-xs font-bold text-neutral-500 mb-1">{rec.question}</p>
                            <p className="text-sm font-medium italic text-neutral-700">"{rec.userTranscript}"</p>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex justify-center pt-4"><button onClick={onComplete} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Back to Library</button></div>
        </div>
    );
  }
  
  if (step === 'REVIEW') {
      return (
        <>
        <div className="max-w-3xl mx-auto space-y-6">
            <header>
                <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Review Your Answers</h2>
                <p className="text-neutral-500 mt-1">Review audio and transcripts before submitting for AI evaluation.</p>
            </header>
            {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 flex items-center gap-2"><AlertTriangle size={16}/> {error}</div>}
            <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-3">
                {allQuestions.map((q, i) => (
                    <details key={i} open={recordedAudio[i] !== undefined || sessionTranscripts[i] !== undefined} className={`p-4 rounded-xl ${recordedAudio[i] !== undefined || sessionTranscripts[i] !== undefined ? 'bg-neutral-50' : 'bg-neutral-100 opacity-60'}`}>
                        <summary className="flex justify-between items-center cursor-pointer list-none">
                          <div>
                            <p className="text-xs font-bold text-neutral-500">Question {i+1} {isFullTest && `(Part ${q.part})`}</p>
                            <p className="text-sm font-medium text-neutral-800">{q.cueCard ? q.cueCard.cueCard : q.question}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {recordedAudio[i] && <button onClick={(e) => { e.preventDefault(); downloadAudio(recordedAudio[i], `q${i+1}_${topic.name.replace(/\s+/g, '_')}.webm`)}} className="p-3 bg-white rounded-full shadow-sm border text-neutral-400 hover:text-neutral-900" title="Download Audio"><Download size={16}/></button>}
                            {recordedAudio[i] && <button onClick={(e) => { e.preventDefault(); playRecording(i)}} className="p-3 bg-white rounded-full shadow-sm border text-neutral-600" title="Play Audio"><Play size={16} fill="currentColor" /></button>}
                            {!recordedAudio[i] && sessionTranscripts[i] === undefined && <span className="text-xs font-bold text-neutral-400">Skipped</span>}
                          </div>
                        </summary>
                        {(sessionTranscripts[i] !== undefined) && (
                            <div className="mt-3 pt-3 border-t border-neutral-200 space-y-1">
                                <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Editable Transcript</label>
                                <textarea
                                    value={sessionTranscripts[i]}
                                    onChange={(e) => setSessionTranscripts(prev => ({ ...prev, [i]: e.target.value }))}
                                    className="w-full bg-neutral-100/50 p-3 rounded-lg border border-neutral-200/50 text-sm font-medium italic text-neutral-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-colors"
                                    rows={4}
                                />
                            </div>
                        )}
                    </details>
                ))}
            </div>
            <div className="flex justify-between items-center pt-4">
                <button onClick={() => setStep('PRACTICING')} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors"><ArrowLeft size={16} /><span>Go Back & Re-record</span></button>
                <button onClick={handleGetEvaluation} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-lg">
                    <Bot size={16} /><span>Get AI Evaluation</span>
                </button>
            </div>
        </div>
        <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="EVALUATE_PARAPHRASE" title="Manual AI Evaluation" description="Your answers are transcribed in the prompt below. Copy it, get JSON from your AI, then paste the result." onGeneratePrompt={handleGenerateEvalPrompt} onJsonReceived={handleAiEvaluationResult}/>
        </>
      )
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center animate-in fade-in duration-500">
        <button onClick={onComplete} className="absolute top-8 left-8 flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors"><ArrowLeft size={16} /><span>Quit Session</span></button>
        <div className="w-full space-y-6">
            <div className="space-y-2">
                <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full inline-block border border-indigo-100">{topic.name}</p>
                {isFullTest && <p className="text-sm font-bold text-neutral-900">IELTS Speaking: Part {currentQuestionData.part}</p>}
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question {currentQuestionIndex + 1} of {allQuestions.length}</p>
            </div>
            
            {currentQuestionData.part === 2 && currentQuestionData.cueCard ? (
                <div className="p-6 bg-white border border-neutral-200 rounded-2xl text-left space-y-3">
                    <h1 className="text-lg font-bold text-neutral-900">{currentQuestionData.cueCard.cueCard}</h1>
                    <ul className="list-disc pl-5 space-y-1">
                        {currentQuestionData.cueCard.points.map((p, i) => <li key={i} className="text-sm font-medium text-neutral-700">{p}</li>)}
                    </ul>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-4">
                    <h1 className="text-2xl font-bold text-neutral-900">{currentQuestionData.question}</h1>
                    <button onClick={() => speak(currentQuestionData.question)} className="p-3 text-neutral-400 bg-neutral-50 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"><Volume2 size={20}/></button>
                </div>
            )}

            <div className="min-h-[4rem] text-lg font-medium text-neutral-500 italic px-4">
                {liveTranscript}
            </div>
            
            {isPreparingPart2 ? (
                <div className="flex flex-col items-center gap-4 animate-in fade-in">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full" viewBox="0 0 100 100"><circle className="text-neutral-200" strokeWidth="5" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50"/><circle className="text-indigo-500 transition-all duration-1000 linear" strokeWidth="5" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={(2 * Math.PI * 45) * (1 - prepTimeLeft/60)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" transform="rotate(-90 50 50)"/></svg>
                        <div className="absolute flex flex-col items-center"><Clock size={20} className="text-indigo-500" /><span className="text-2xl font-black text-indigo-500">{prepTimeLeft}</span></div>
                    </div>
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Prepare your answer (1 minute)</p>
                </div>
            ) : !isRecording ? (
                <button onClick={handleStartRecording} className="mx-auto w-24 h-24 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 hover:scale-105 transition-all active:scale-95"><Mic size={32}/></button>
            ) : (
                <button onClick={handleStopRecording} className="mx-auto w-24 h-24 bg-neutral-900 text-white rounded-full flex items-center justify-center shadow-lg shadow-neutral-500/30 animate-pulse"><Square size={28} fill="white"/></button>
            )}
            
            {error && <div className="text-xs font-bold text-red-500">{error}</div>}

            {!isRecording && !isPreparingPart2 && (
                <div className="pt-4">
                    <button onClick={() => { if(isLastQuestion) setStep('REVIEW'); else setCurrentQuestionIndex(p => p+1); }} className="text-xs font-bold text-neutral-400 hover:text-neutral-900 p-2">
                        {isLastQuestion ? 'Go to Review' : 'Skip Question'} <ChevronRight className="inline" size={12}/>
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};

export default SpeakingSessionView;