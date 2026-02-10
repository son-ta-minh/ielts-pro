import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Volume2, Mic, Waves, ListPlus, Play, AudioLines, Loader2 } from 'lucide-react';
import { speak, stopRecording, startRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult, CharDiff } from '../../utils/speechAnalysis';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import * as dataStore from '../../app/dataStore';

const SILENCE_TIMEOUT = 3000;

interface Props {
    target: string;
    onClose: () => void;
}

export const SimpleMimicModal: React.FC<Props> = ({ target, onClose }) => {
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false);
    const [transcript, setTranscript] = useState('');
    const [userAudio, setUserAudio] = useState<{base64: string, mimeType: string} | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [timeLeft, setTimeLeft] = useState(SILENCE_TIMEOUT);
    
    // IPA States
    const [ipa, setIpa] = useState<string | null>(null);
    const [isIpaLoading, setIsIpaLoading] = useState(false);
    const [showIpa, setShowIpa] = useState(false);

    const recognitionManager = useRef(new SpeechRecognitionManager());
    const silenceTimerRef = useRef<any>(null);
    const lastActivityRef = useRef(Date.now());
    const { showToast } = useToast();

    const fetchIpa = useCallback(async () => {
        if (ipa) {
            setShowIpa(!showIpa);
            return;
        }

        setIsIpaLoading(true);
        try {
            // 1. Check Library first from cached store (reliable and fast)
            const cleaned = target.trim().toLowerCase();
            const existing = dataStore.getAllWords().find(w => w.word.toLowerCase() === cleaned);
            if (existing && existing.ipa) {
                setIpa(existing.ipa);
                setShowIpa(true);
                setIsIpaLoading(false);
                return;
            }

            // 2. Fallback to Server API
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(target)}`);
            if (res.ok) {
                const data = await res.json();
                setIpa(data.ipa);
                setShowIpa(true);
            } else {
                showToast("IPA server unavailable", "error");
            }
        } catch (e) {
            showToast("Failed to fetch IPA", "error");
        } finally {
            setIsIpaLoading(false);
        }
    }, [target, ipa, showIpa, showToast]);

    const stopSession = useCallback(async (currentTranscript: string) => {
        if (silenceTimerRef.current) {
            clearInterval(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        recognitionManager.current.stop();
        const audioResult = await stopRecording();
        if (audioResult) {
            setUserAudio(audioResult);
        }
        setIsRecording(false);
        isRecordingRef.current = false;
        setAnalysis(analyzeSpeechLocally(target, currentTranscript));
    }, [target]);

    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        setTimeLeft(SILENCE_TIMEOUT);
    }, []);

    const startSilenceCountdown = useCallback((currentText: string) => {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        
        lastActivityRef.current = Date.now();
        setTimeLeft(SILENCE_TIMEOUT);

        silenceTimerRef.current = setInterval(() => {
            const now = Date.now();
            const elapsed = now - lastActivityRef.current;
            const remaining = Math.max(0, SILENCE_TIMEOUT - elapsed);
            
            setTimeLeft(remaining);

            if (remaining <= 0 && isRecordingRef.current) {
                stopSession(currentText);
            }
        }, 50); 
    }, [stopSession]);

    useEffect(() => {
        return () => {
            if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
            recognitionManager.current.stop();
        };
    }, []);

    const handleToggleRecord = async () => {
        if (isRecording) {
            await stopSession(transcript);
        } else {
            setTranscript('');
            setAnalysis(null);
            setUserAudio(null);
            try {
                await startRecording();
                setIsRecording(true);
                isRecordingRef.current = true;
                
                resetActivity();
                startSilenceCountdown(''); 

                recognitionManager.current.start(
                    (final, interim) => {
                        const fullText = final + interim;
                        setTranscript(fullText);
                        resetActivity();
                    },
                    (final) => {
                        if (isRecordingRef.current) {
                            setTranscript(final);
                            stopSession(final);
                        }
                    }
                );
            } catch (e) {
                console.error(e);
                setIsRecording(false);
                isRecordingRef.current = false;
            }
        }
    };

    const handlePlayUserAudio = () => {
        if (userAudio) {
            const audio = new Audio(`data:${userAudio.mimeType};base64,${userAudio.base64}`);
            audio.play();
        }
    };

    const handleAddToQueue = () => {
        const queue = getStoredJSON<any[]>('vocab_pro_mimic_practice_queue', []);
        
        // Simple duplicate check based on text
        if (queue.some((item: any) => item.text === target)) {
            showToast("Already in Pronunciation Queue", "info");
            return;
        }

        const newItem = {
            id: `quick-save-${Date.now()}`,
            text: target,
            sourceWord: target.length > 30 ? target.substring(0, 30) + '...' : target,
            type: 'Quick Practice'
        };

        setStoredJSON('vocab_pro_mimic_practice_queue', [...queue, newItem]);
        showToast("Saved to Pronunciation Page", "success");
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 p-8 flex flex-col items-center gap-6 relative">
                <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-all">
                    <X size={20} />
                </button>

                <div className="text-center space-y-1 mt-2">
                    <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Mimic Practice</span>
                    <h3 className="text-xl font-bold text-neutral-900 leading-tight">Practice Selected Phrase</h3>
                </div>

                <div className="w-full p-6 bg-neutral-50 rounded-[2rem] border border-neutral-200 flex flex-col items-center gap-3 min-h-[120px] overflow-hidden">
                    <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 overflow-y-auto custom-scrollbar max-h-[25vh] items-center">
                        {target.split(/\s+/).map((word, wIdx) => {
                            const wordResult = analysis?.words[wIdx];
                            return (
                                <span key={wIdx} onClick={() => speak(word)} className="text-2xl font-black cursor-pointer hover:underline decoration-neutral-300 transition-all flex">
                                    {wordResult?.chars ? wordResult.chars.map((c: CharDiff, cIdx: number) => (
                                        <span key={cIdx} className={c.status === 'correct' ? 'text-emerald-500' : c.status === 'wrong' ? 'text-rose-500' : 'text-neutral-300'}>
                                            {c.char}
                                        </span>
                                    )) : <span className="text-neutral-900">{word}</span>}
                                </span>
                            );
                        })}
                    </div>
                    
                    {showIpa && ipa && (
                        <div className="px-4 py-1.5 bg-white border border-neutral-200 rounded-xl text-sm font-mono font-medium text-neutral-500 animate-in slide-in-from-top-2 duration-300">
                            {ipa}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center gap-4 w-full">
                    {isRecording ? (
                        <div className="flex items-center gap-2 text-rose-500 animate-pulse">
                            <Waves size={20} />
                            <span className="text-xs font-black uppercase tracking-widest">Listening...</span>
                        </div>
                    ) : transcript && (
                        <p className="text-sm font-medium italic text-neutral-500 line-clamp-2">"{transcript}"</p>
                    )}

                    {analysis && (
                        <div className="text-center animate-in zoom-in-95">
                             <div className={`text-4xl font-black ${analysis.score > 80 ? 'text-emerald-500' : analysis.score > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {analysis.score}%
                             </div>
                             <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Accuracy</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 pt-2">
                    <button onClick={() => speak(target)} className="p-4 rounded-2xl bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-all" title="Listen">
                        <Volume2 size={24} />
                    </button>
                    
                    <button 
                        onClick={fetchIpa} 
                        disabled={isIpaLoading}
                        className={`p-4 rounded-2xl transition-all ${showIpa ? 'bg-indigo-600 text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:text-indigo-600'}`} 
                        title="Show Phonetic (IPA)"
                    >
                        {isIpaLoading ? <Loader2 size={24} className="animate-spin" /> : <AudioLines size={24} />}
                    </button>

                    <button 
                        onClick={handleToggleRecord} 
                        className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all transform active:scale-105 ${isRecording ? 'bg-rose-600 text-white scale-110 shadow-rose-500/50 ring-8 ring-rose-500/10' : 'bg-white border-4 border-neutral-100 text-neutral-900 hover:scale-105'}`}
                        title="Record"
                    >
                        {isRecording ? (
                            timeLeft <= 1000 ? (
                                <span className="text-2xl font-black tabular-nums animate-in fade-in duration-300">{(timeLeft/1000).toFixed(1)}</span>
                            ) : (
                                <Waves size={28} className="animate-pulse" />
                            )
                        ) : (
                            <Mic size={28} />
                        )}
                    </button>
                    <button 
                        onClick={handlePlayUserAudio}
                        disabled={!userAudio || isRecording}
                        className={`p-4 rounded-2xl transition-all ${userAudio && !isRecording ? 'bg-indigo-100 text-indigo-600 hover:text-indigo-900' : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'}`}
                        title="Play recording"
                    >
                        <Play size={24} fill={userAudio && !isRecording ? "currentColor" : "none"} />
                    </button>
                    <button onClick={handleAddToQueue} className="p-4 rounded-2xl bg-neutral-100 text-neutral-600 hover:text-indigo-600 transition-all" title="Save to Pronunciation Page">
                        <ListPlus size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
};