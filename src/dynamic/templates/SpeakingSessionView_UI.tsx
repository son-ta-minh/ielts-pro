
import React from 'react';
import { SpeakingLog } from '../../app/types';
import { Loader2, ArrowLeft, Mic, Square, Volume2, Play, AlertTriangle, BarChart, Download, Bot, Clock, ChevronRight } from 'lucide-react';
import { BandScoreGauge } from '../../components/common/BandScoreGauge';

export interface SessionQuestion {
    question: string;
    part: 1 | 2 | 3;
    cueCard?: { cueCard: string, points: string[] };
}

export interface SpeakingSessionViewUIProps {
    step: 'PRACTICING' | 'REVIEW' | 'ANALYZING' | 'RESULT';
    topicName: string;
    currentQuestionIndex: number;
    totalQuestions: number;
    currentQuestionData: SessionQuestion;
    isRecording: boolean;
    isPreparingPart2: boolean;
    prepTimeLeft: number;
    liveTranscript: string;
    error: string | null;
    recordedAudio: Record<number, { base64: string, mimeType: string }>;
    sessionTranscripts: Record<number, string>;
    finalResult: SpeakingLog | null;
    
    // Actions
    onStartRecording: () => void;
    onStopRecording: () => void;
    onNextQuestion: () => void;
    onSkipQuestion: () => void;
    onGoToReview: () => void;
    onBackToPractice: () => void;
    onDownloadAudio: (index: number) => void;
    onPlayAudio: (index: number) => void;
    onTranscriptChange: (index: number, val: string) => void;
    onGetEvaluation: () => void;
    onComplete: () => void;
}

export const SpeakingSessionViewUI: React.FC<SpeakingSessionViewUIProps> = ({
    step, topicName, currentQuestionIndex, totalQuestions, currentQuestionData,
    isRecording, isPreparingPart2, prepTimeLeft, liveTranscript, error,
    recordedAudio, sessionTranscripts, finalResult,
    onStartRecording, onStopRecording, onNextQuestion, onSkipQuestion,
    onGoToReview, onBackToPractice, onDownloadAudio, onPlayAudio,
    onTranscriptChange, onGetEvaluation, onComplete
}) => {
    
    const isFullTest = totalQuestions > 5; // Heuristic or passed prop
    const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

    // --- RENDER: ANALYZING ---
    if (step === 'ANALYZING') {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] animate-in fade-in">
                <Loader2 size={40} className="animate-spin text-neutral-400" />
                <p className="text-sm font-bold text-neutral-500 mt-4">AI is evaluating your speaking...</p>
            </div>
        );
    }

    // --- RENDER: RESULT ---
    if (step === 'RESULT' && finalResult) {
        return (
            <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
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

    // --- RENDER: REVIEW ---
    if (step === 'REVIEW') {
        // Need to reconstruct the list of questions for the review UI
        // Since we are inside a pure UI component, we iterate through indices 0 to totalQuestions-1
        const reviewItems = Array.from({ length: totalQuestions }).map((_, i) => i);

        return (
            <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
                <header>
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Review Your Answers</h2>
                    <p className="text-neutral-500 mt-1">Review audio and transcripts before submitting for AI evaluation.</p>
                </header>
                {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 flex items-center gap-2"><AlertTriangle size={16}/> {error}</div>}
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-3">
                    {reviewItems.map((i) => {
                        const hasAudio = recordedAudio[i] !== undefined;
                        const hasTranscript = sessionTranscripts[i] !== undefined;
                        const isOpen = hasAudio || hasTranscript;

                        return (
                            <details key={i} open={isOpen} className={`p-4 rounded-xl ${isOpen ? 'bg-neutral-50' : 'bg-neutral-100 opacity-60'}`}>
                                <summary className="flex justify-between items-center cursor-pointer list-none">
                                <div>
                                    <p className="text-xs font-bold text-neutral-500">Question {i+1}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {hasAudio && <button onClick={(e) => { e.preventDefault(); onDownloadAudio(i); }} className="p-3 bg-white rounded-full shadow-sm border text-neutral-400 hover:text-neutral-900" title="Download Audio"><Download size={16}/></button>}
                                    {hasAudio && <button onClick={(e) => { e.preventDefault(); onPlayAudio(i); }} className="p-3 bg-white rounded-full shadow-sm border text-neutral-600" title="Play Audio"><Play size={16} fill="currentColor" /></button>}
                                    {!hasAudio && !hasTranscript && <span className="text-xs font-bold text-neutral-400">Skipped</span>}
                                </div>
                                </summary>
                                {hasTranscript && (
                                    <div className="mt-3 pt-3 border-t border-neutral-200 space-y-1">
                                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Editable Transcript</label>
                                        <textarea
                                            value={sessionTranscripts[i]}
                                            onChange={(e) => onTranscriptChange(i, e.target.value)}
                                            className="w-full bg-neutral-100/50 p-3 rounded-lg border border-neutral-200/50 text-sm font-medium italic text-neutral-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-colors"
                                            rows={4}
                                        />
                                    </div>
                                )}
                            </details>
                        );
                    })}
                </div>
                <div className="flex justify-between items-center pt-4">
                    <button onClick={onBackToPractice} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors"><ArrowLeft size={16} /><span>Go Back & Re-record</span></button>
                    <button onClick={onGetEvaluation} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-lg">
                        <Bot size={16} /><span>Get AI Evaluation</span>
                    </button>
                </div>
            </div>
        );
    }

    // --- RENDER: PRACTICING (DEFAULT) ---
    return (
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center animate-in fade-in duration-500">
            <button onClick={onComplete} className="absolute top-8 left-8 flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors"><ArrowLeft size={16} /><span>Quit Session</span></button>
            <div className="w-full space-y-6">
                <div className="space-y-2">
                    <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full inline-block border border-indigo-100">{topicName}</p>
                    {isFullTest && <p className="text-sm font-bold text-neutral-900">IELTS Speaking: Part {currentQuestionData.part}</p>}
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Question {currentQuestionIndex + 1} of {totalQuestions}</p>
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
                    <button onClick={onStartRecording} className="mx-auto w-24 h-24 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 hover:scale-105 transition-all active:scale-95"><Mic size={32}/></button>
                ) : (
                    <button onClick={onStopRecording} className="mx-auto w-24 h-24 bg-neutral-900 text-white rounded-full flex items-center justify-center shadow-lg shadow-neutral-500/30 animate-pulse"><Square size={28} fill="white"/></button>
                )}
                
                {error && <div className="text-xs font-bold text-red-500">{error}</div>}

                {!isRecording && !isPreparingPart2 && (
                    <div className="pt-4">
                        <button onClick={() => { if(isLastQuestion) onGoToReview(); else onSkipQuestion(); }} className="text-xs font-bold text-neutral-400 hover:text-neutral-900 p-2">
                            {isLastQuestion ? 'Go to Review' : 'Skip Question'} <ChevronRight className="inline" size={12}/>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
