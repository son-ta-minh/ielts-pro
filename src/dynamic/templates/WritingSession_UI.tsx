
import React from 'react';
import { WritingTopic, WritingLog } from '../../app/types';
import { Loader2, ArrowLeft, Bot, Clock, BarChart } from 'lucide-react';
import { BandScoreGauge } from '../../components/common/BandScoreGauge';

export interface WritingSessionUIProps {
    topic: WritingTopic;
    step: 'PRACTICING' | 'ANALYZING' | 'RESULT';
    task1Response: string;
    setTask1Response: (val: string) => void;
    task2Response: string;
    setTask2Response: (val: string) => void;
    formattedTime: string;
    timeLeft: number;
    wordCount1: number;
    wordCount2: number;
    finalResult: WritingLog | null;
    onComplete: () => void;
    onGetEvaluation: () => void;
}

export const WritingSessionUI: React.FC<WritingSessionUIProps> = ({
    topic, step, task1Response, setTask1Response, task2Response, setTask2Response,
    formattedTime, timeLeft, wordCount1, wordCount2, finalResult, onComplete, onGetEvaluation
}) => {
    if (step === 'ANALYZING') {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh]">
                <Loader2 size={40} className="animate-spin text-neutral-400" />
                <p className="text-sm font-bold text-neutral-500 mt-4">AI is evaluating your writing...</p>
            </div>
        );
    }

    if (step === 'RESULT' && finalResult) {
        return (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
                <header><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Session Report</h2><p className="text-neutral-500 mt-1">Topic: <span className="font-bold text-neutral-700">{finalResult.topicName}</span></p></header>
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex items-center justify-between">
                    <BandScoreGauge score={finalResult.estimatedBand} />
                    <div className="text-right"><h4 className="text-[10px] font-black uppercase text-neutral-400 mb-1">Session Date</h4><p className="font-mono text-xs">{new Date(finalResult.timestamp).toLocaleString()}</p></div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                    <h4 className="text-sm font-black text-neutral-900 flex items-center gap-2"><BarChart size={16}/> Examiner's Feedback</h4>
                    <div className="text-sm text-neutral-800 leading-relaxed font-medium bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1 [&_b]:text-neutral-900" dangerouslySetInnerHTML={{ __html: finalResult.feedbackHtml }} />
                </div>
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                    <h4 className="text-sm font-black text-neutral-900">Your Responses</h4>
                    <div className="space-y-4">
                        <details className="p-4 rounded-xl border border-neutral-100 bg-neutral-50/50"><summary className="font-bold text-xs text-neutral-600 cursor-pointer">View Task 1 Response</summary><p className="text-sm font-medium italic text-neutral-700 mt-2 pt-2 border-t border-neutral-200 whitespace-pre-wrap">"{finalResult.task1Response}"</p></details>
                        <details className="p-4 rounded-xl border border-neutral-100 bg-neutral-50/50"><summary className="font-bold text-xs text-neutral-600 cursor-pointer">View Task 2 Response</summary><p className="text-sm font-medium italic text-neutral-700 mt-2 pt-2 border-t border-neutral-200 whitespace-pre-wrap">"{finalResult.task2Response}"</p></details>
                    </div>
                </div>
                <div className="flex justify-center pt-4"><button onClick={onComplete} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Back to Library</button></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <button onClick={onComplete} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors">
                    <ArrowLeft size={16} /><span>Quit Session</span>
                </button>
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 text-lg font-black px-4 py-2 rounded-xl border-2 ${timeLeft < 300 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-white text-neutral-800 border-neutral-200'}`}>
                        <Clock size={20} />
                        <span>{formattedTime}</span>
                    </div>
                    <button onClick={onGetEvaluation} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-lg">
                        <Bot size={16} /><span>Get AI Evaluation</span>
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col">
                    <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Task 1</h3>
                    <p className="text-sm font-medium text-neutral-700 mb-4 whitespace-pre-wrap">{topic.task1}</p>
                    <textarea
                        value={task1Response}
                        onChange={e => setTask1Response(e.target.value)}
                        className="w-full flex-1 p-4 bg-neutral-50/50 border border-neutral-200/80 rounded-2xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 focus:outline-none min-h-[300px]"
                        placeholder="Write at least 150 words..."
                    />
                    <p className={`text-right text-xs font-bold mt-2 ${wordCount1 < 150 ? 'text-red-500' : 'text-green-600'}`}>
                        {wordCount1} words
                    </p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col">
                    <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-2">Task 2</h3>
                    <p className="text-sm font-medium text-neutral-700 mb-4 whitespace-pre-wrap">{topic.task2}</p>
                    <textarea
                        value={task2Response}
                        onChange={e => setTask2Response(e.target.value)}
                        className="w-full flex-1 p-4 bg-neutral-50/50 border border-neutral-200/80 rounded-2xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 focus:outline-none min-h-[300px]"
                        placeholder="Write at least 250 words..."
                    />
                    <p className={`text-right text-xs font-bold mt-2 ${wordCount2 < 250 ? 'text-red-500' : 'text-green-600'}`}>
                        {wordCount2} words
                    </p>
                </div>
            </div>
        </div>
    );
};
