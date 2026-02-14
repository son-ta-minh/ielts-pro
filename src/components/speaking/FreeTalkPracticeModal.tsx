
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FreeTalkItem } from '../../app/types';
import { X, Mic, Square, Play, ArrowRight, ChevronLeft, ChevronRight, RotateCw, Trophy, BarChart2 } from 'lucide-react';
import { startRecording, stopRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult, CharDiff } from '../../utils/speechAnalysis';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    item: FreeTalkItem | null;
}

interface SentenceResult {
    original: string;
    transcript: string;
    analysis: AnalysisResult;
}

export const FreeTalkPracticeModal: React.FC<Props> = ({ isOpen, onClose, item }) => {
    const [sentences, setSentences] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [results, setResults] = useState<Record<number, SentenceResult>>({});
    const [isSessionComplete, setIsSessionComplete] = useState(false);

    const recognitionManager = useRef(new SpeechRecognitionManager());

    useEffect(() => {
        if (isOpen && item) {
            // Split content into sentences
            const split = item.content.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [item.content];
            setSentences(split.map(s => s.trim()).filter(Boolean));
            setCurrentIndex(0);
            setResults({});
            setIsSessionComplete(false);
            setTranscript('');
            setIsRecording(false);
        }
    }, [isOpen, item]);

    const handleToggleRecord = async () => {
        if (isRecording) {
            setIsRecording(false);
            recognitionManager.current.stop();
            await stopRecording(); // Just to clean up stream

            // Analyze
            const currentSentence = sentences[currentIndex];
            const analysis = analyzeSpeechLocally(currentSentence, transcript);
            setResults(prev => ({
                ...prev,
                [currentIndex]: {
                    original: currentSentence,
                    transcript,
                    analysis
                }
            }));

        } else {
            setTranscript('');
            try {
                await startRecording(); // Request mic
                setIsRecording(true);
                recognitionManager.current.start(
                    (final, interim) => setTranscript(final + interim),
                    (final) => setTranscript(final)
                );
            } catch (e) {
                console.error("Mic error", e);
                setIsRecording(false);
            }
        }
    };

    const handleNext = () => {
        if (currentIndex < sentences.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setTranscript('');
        } else {
            setIsSessionComplete(true);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            // If going back to an already answered sentence, show previous result/transcript? 
            // For now, reset view to allow retry or viewing. 
            // Ideally we show the result state.
            setTranscript(results[currentIndex - 1]?.transcript || '');
        }
    };

    const handleRetry = () => {
        setTranscript('');
        // Clear result for current index to allow re-recording
        const newResults = { ...results };
        delete newResults[currentIndex];
        setResults(newResults);
    };

    const overallAccuracy = useMemo(() => {
        const resultValues = Object.values(results);
        if (resultValues.length === 0) return 0;
        const totalScore = resultValues.reduce((sum, r) => sum + r.analysis.score, 0);
        return Math.round(totalScore / resultValues.length);
    }, [results]);

    if (!isOpen || !item) return null;

    const currentSentence = sentences[currentIndex];
    const currentResult = results[currentIndex];

    // -- RENDER SESSION COMPLETE --
    if (isSessionComplete) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col p-8 text-center space-y-6">
                    <div className="mx-auto p-4 bg-cyan-50 rounded-full text-cyan-600 mb-2">
                        <Trophy size={48} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-neutral-900">Session Complete!</h2>
                        <p className="text-neutral-500 font-medium">Here is how you performed.</p>
                    </div>
                    
                    <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-100">
                         <div className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Overall Accuracy</div>
                         <div className={`text-6xl font-black ${overallAccuracy >= 80 ? 'text-emerald-500' : overallAccuracy >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                             {overallAccuracy}%
                         </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2 text-left custom-scrollbar pr-2">
                        {Object.values(results).map((res, i) => (
                            <div key={i} className="p-3 bg-white border border-neutral-100 rounded-xl">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Sentence {i+1}</span>
                                    <span className={`text-xs font-black ${res.analysis.score >= 80 ? 'text-green-600' : 'text-red-500'}`}>{res.analysis.score}%</span>
                                </div>
                                <p className="text-xs text-neutral-700 line-clamp-1">{res.original}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3">
                         <button onClick={() => { setIsSessionComplete(false); setCurrentIndex(0); setResults({}); setTranscript(''); }} className="flex-1 py-4 bg-neutral-100 text-neutral-600 font-bold rounded-2xl hover:bg-neutral-200 transition-all flex items-center justify-center gap-2">
                            <RotateCw size={16}/> Retry
                         </button>
                         <button onClick={onClose} className="flex-1 py-4 bg-neutral-900 text-white font-bold rounded-2xl hover:bg-neutral-800 transition-all">
                            Finish
                         </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh] overflow-hidden">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">{item.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-100">Free Talk</span>
                            <span className="text-xs text-neutral-400 font-medium">Sentence {currentIndex + 1} / {sentences.length}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center p-8 space-y-8 relative">
                     {/* Sentence Display */}
                     <div className="text-center space-y-6 w-full max-w-2xl">
                         {currentResult ? (
                             <div className="text-2xl md:text-3xl font-medium leading-relaxed flex flex-wrap justify-center gap-x-2">
                                 {currentResult.analysis.words.map((wRes, i) => (
                                     <span key={i} className={`${wRes.status === 'correct' ? 'text-green-600' : wRes.status === 'near' ? 'text-yellow-600' : 'text-red-500'} transition-colors`}>
                                         {wRes.word}
                                     </span>
                                 ))}
                             </div>
                         ) : (
                             <p className="text-2xl md:text-3xl font-medium text-neutral-800 leading-relaxed transition-all">
                                 {currentSentence}
                             </p>
                         )}
                     </div>

                     {/* Transcript Feedback */}
                     <div className="h-16 flex items-center justify-center w-full">
                         {isRecording ? (
                             <span className="text-neutral-400 italic animate-pulse">Listening...</span>
                         ) : (
                             transcript && <p className="text-neutral-500 italic">"{transcript}"</p>
                         )}
                     </div>
                     
                     {/* Controls */}
                     <div className="flex items-center gap-6">
                         {currentResult && (
                             <button onClick={handleRetry} className="p-4 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-all" title="Retry Sentence">
                                 <RotateCw size={24} />
                             </button>
                         )}

                         <button 
                            onClick={handleToggleRecord}
                            disabled={!!currentResult} // Disable record if already result, must retry
                            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-all transform hover:scale-105 active:scale-95 ${
                                isRecording 
                                ? 'bg-red-500 text-white ring-8 ring-red-100 animate-pulse' 
                                : currentResult 
                                    ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
                                    : 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-cyan-200'
                            }`}
                        >
                            {isRecording ? <Square size={32} fill="currentColor"/> : <Mic size={40} />}
                        </button>
                     </div>
                </main>

                <footer className="px-8 py-6 border-t border-neutral-100 bg-white z-10 flex justify-between items-center">
                    <button onClick={handlePrev} disabled={currentIndex === 0} className="p-3 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all">
                        <ChevronLeft size={20} />
                    </button>
                    
                    {currentResult && (
                        <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                            <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Accuracy</span>
                            <span className={`text-2xl font-black ${currentResult.analysis.score >= 80 ? 'text-green-500' : 'text-amber-500'}`}>{currentResult.analysis.score}%</span>
                        </div>
                    )}

                    <button onClick={handleNext} className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg active:scale-95">
                        <span>{currentIndex === sentences.length - 1 ? 'Finish' : 'Next'}</span>
                        <ArrowRight size={16} />
                    </button>
                </footer>
            </div>
        </div>
    );
};
