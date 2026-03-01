

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Volume2, Mic, Waves, ListPlus, Play, AudioLines, Loader2, Edit2 } from 'lucide-react';
import { speak, stopRecording, startRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult, CharDiff } from '../../utils/speechAnalysis';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import * as dataStore from '../../app/dataStore';

const SILENCE_TIMEOUT = 3000;
const SINGLE_WORD_AUTOSTOP_DELAY = 1000;

interface Props {
    target: string | null; // Allow null for manual input
    onClose: () => void;
    onSaveScore?: (score: number) => void;
}

export const SimpleMimicModal: React.FC<Props> = ({ target, onClose, onSaveScore }) => {
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false);
    const [editedTarget, setEditedTarget] = useState(target || '');
    const [isEditing, setIsEditing] = useState(!target);
    const [transcript, setTranscript] = useState('');
    const [userAudio, setUserAudio] = useState<{base64: string, mimeType: string} | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [timeLeft, setTimeLeft] = useState(SILENCE_TIMEOUT);
    
    // IPA States
    const [ipa, setIpa] = useState<string | null>(null);
    const [isIpaLoading, setIsIpaLoading] = useState(false);
    const [showIpa, setShowIpa] = useState(false);
    const [ipaWords, setIpaWords] = useState<string[] | null>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const [isAutoPlaying, setIsAutoPlaying] = useState(false);
    const [playSpeed, setPlaySpeed] = useState<number>(() => {
        const saved = localStorage.getItem('mimic_play_speed');
        return saved ? Number(saved) : 1;
    });
    const autoPlayRef = useRef<any>(null);

    const recognitionManager = useRef(new SpeechRecognitionManager());
    const silenceTimerRef = useRef<any>(null);
    const singleWordStopTimerRef = useRef<any>(null);
    const lastActivityRef = useRef(Date.now());
    const autoStopTriggeredRef = useRef(false);
    const { showToast } = useToast();
    const isSingleWordTarget = useMemo(() => {
        const tokens = (editedTarget || '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        return tokens.length === 1;
    }, [editedTarget]);

    // Real-time analysis during recording
    useEffect(() => {
        if (isRecording && editedTarget && transcript) {
            const result = analyzeSpeechLocally(editedTarget, transcript);
            setAnalysis(result);
            if (result.score >= 100 && !autoStopTriggeredRef.current) {
                autoStopTriggeredRef.current = true;
                stopSession(transcript);
            }
        }
    }, [transcript, isRecording, editedTarget]);

    const fetchIpa = useCallback(async () => {
        if (!editedTarget) return;
        if (ipa) {
            setShowIpa(!showIpa);
            return;
        }

        setIsIpaLoading(true);
        try {
            // 1. Check Library first from cached store (reliable and fast)
            const cleaned = editedTarget.trim().toLowerCase();
            const existing = dataStore.getAllWords().find(w => w.word.toLowerCase() === cleaned);
            if (existing && existing.ipaUs) {
                setIpa(existing.ipaUs);
                setShowIpa(true);
                setIsIpaLoading(false);
                return;
            }

            // 2. Fallback to Server API
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(editedTarget)}`);
            if (res.ok) {
                const data = await res.json();
                setIpa(data.ipa);
                setIpaWords(data.ipaWords || null);
                setShowIpa(true);
            } else {
                showToast("IPA server unavailable", "error");
            }
        } catch {
            showToast("Failed to fetch IPA", "error");
        } finally {
            setIsIpaLoading(false);
        }
    }, [editedTarget, ipa, showIpa, showToast]);

    const stopSession = useCallback(async (currentTranscript: string) => {
        if (!editedTarget) return; // Should not happen if isEditingTarget is false
        if (silenceTimerRef.current) {
            clearInterval(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (singleWordStopTimerRef.current) {
            clearTimeout(singleWordStopTimerRef.current);
            singleWordStopTimerRef.current = null;
        }
        recognitionManager.current.stop();
        const audioResult = await stopRecording();
        if (audioResult) {
            setUserAudio(audioResult);
        }
        setIsRecording(false);
        isRecordingRef.current = false;
        autoStopTriggeredRef.current = false;
        const result = analyzeSpeechLocally(editedTarget, currentTranscript);
        setAnalysis(result);
        if (onSaveScore) {
            onSaveScore(result.score);
        }
    }, [editedTarget, onSaveScore]);

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
            if (singleWordStopTimerRef.current) clearTimeout(singleWordStopTimerRef.current);
            recognitionManager.current.stop();
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('mimic_play_speed', String(playSpeed));
    }, [playSpeed]);

    const handleToggleRecord = async () => {
        if (!editedTarget) return; // Cannot record without a target
        if (isEditing) setIsEditing(false); // Switch to view mode when recording starts

        if (isRecording) {
            await stopSession(transcript);
        } else {
            autoStopTriggeredRef.current = false;
            if (singleWordStopTimerRef.current) {
                clearTimeout(singleWordStopTimerRef.current);
                singleWordStopTimerRef.current = null;
            }
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
                        if (isSingleWordTarget && !singleWordStopTimerRef.current) {
                            const hasAnyWord = fullText
                                .toLowerCase()
                                .replace(/[^\p{L}\p{N}]+/gu, ' ')
                                .trim()
                                .length > 0;
                            if (hasAnyWord) {
                                singleWordStopTimerRef.current = setTimeout(() => {
                                    singleWordStopTimerRef.current = null;
                                    if (isRecordingRef.current) {
                                        stopSession(fullText);
                                    }
                                }, SINGLE_WORD_AUTOSTOP_DELAY);
                            }
                        }
                    },
                    (final) => {
                        if (isRecordingRef.current) {
                            setTranscript(final);
                            stopSession(final);
                        }
                    }
                );
            } catch (_e) {
                console.error(_e);
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
        if (!editedTarget) return;
        const queue = getStoredJSON<any[]>('vocab_pro_mimic_practice_queue', []);
        
        // Simple duplicate check based on text
        if (queue.some((item: any) => item.text === editedTarget)) {
            showToast("Already in Pronunciation Queue", "info");
            return;
        }

        const newItem = {
            id: `quick-save-${Date.now()}`,
            text: editedTarget,
            sourceWord: editedTarget.length > 30 ? editedTarget.substring(0, 30) + '...' : editedTarget,
            type: 'Quick Practice'
        };

        setStoredJSON('vocab_pro_mimic_practice_queue', [...queue, newItem]);
        showToast("Saved to Pronunciation Page", "success");
    };

    const getFontSizeClass = (text: string) => {
        const len = text.length;
        if (len < 40) return 'text-2xl md:text-3xl';
        if (len < 80) return 'text-xl md:text-2xl';
        if (len < 150) return 'text-lg md:text-xl';
        return 'text-base md:text-lg';
    };

    const estimateSyllables = (word: string) => {
        const clean = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!clean) return 1;
        const matches = clean.match(/[aeiouy]+/g);
        return matches ? matches.length : 1;
    };

    const handleAutoPlay = () => {
        if (!editedTarget) return;

        const words = editedTarget.split(/\s+/);

        if (isAutoPlaying) {
            clearTimeout(autoPlayRef.current);
            setIsAutoPlaying(false);
            setHoverIndex(null);
            return;
        }

        let index = 0;
        setIsAutoPlaying(true);
        setHoverIndex(0);

        const playNext = () => {
            if (index >= words.length) {
                setIsAutoPlaying(false);
                setHoverIndex(null);
                return;
            }

            setHoverIndex(index);

            const word = words[index];
            const syllables = estimateSyllables(word);

            // Base duration per syllable (affected by speed)
            let duration = (400 * syllables) / playSpeed;

            // Add pause for punctuation
            if (/[,.]/.test(word)) duration += 300 / playSpeed;
            if (/[!?;]/.test(word)) duration += 500 / playSpeed;
            if (/[:]/.test(word)) duration += 400 / playSpeed;

            index++;
            autoPlayRef.current = setTimeout(playNext, duration);
        };

        playNext();
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-5xl rounded-[2.5rem] shadow-2xl border border-neutral-200 p-8 flex flex-col items-center gap-6 relative">
                <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-all">
                    <X size={20} />
                </button>

                <div className="text-center space-y-1 mt-2">
                    <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Mimic Practice</span>
                    <h3 className="text-xl font-bold text-neutral-900 leading-tight">Practice Selected Phrase</h3>
                </div>

                <div className="w-full p-6 bg-neutral-50 rounded-[2rem] border border-neutral-200 flex flex-col items-center gap-3 min-h-[120px] overflow-hidden relative group">
                    {isEditing ? (
                        <div className="w-full relative">
                            <textarea
                                value={editedTarget}
                                onChange={(e) => setEditedTarget(e.target.value)}
                                placeholder="Enter text to practice..." 
                                className="w-full h-32 p-4 bg-white border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-base leading-relaxed"
                            />
                            <button onClick={() => setIsEditing(false)} className="absolute bottom-4 right-4 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-bold shadow-sm">
                                Done
                            </button>
                        </div>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full shadow-sm">
                                <Edit2 size={16} />
                            </button>
                            <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 w-full">
                                {editedTarget
                                    .split(/\s+/)
                                    .map((word, wIdx) => {
                                        const wordAnalysis = analysis?.words[wIdx];
                                        let colorClass = 'text-neutral-800';
                                        if (wordAnalysis) {
                                            switch (wordAnalysis.status) {
                                                case 'correct': colorClass = 'text-emerald-600'; break;
                                                case 'near': colorClass = 'text-amber-500'; break;
                                                case 'wrong': colorClass = 'text-rose-500'; break;
                                                case 'missing': colorClass = 'text-neutral-300'; break;
                                                default: colorClass = 'text-neutral-800';
                                            }
                                        }

                                        return (
                                            <span 
                                                key={wIdx} 
                                                onClick={() => speak(word)}
                                                onMouseEnter={() => setHoverIndex(wIdx)}
                                                onMouseLeave={() => setHoverIndex(null)}
                                                className={`${getFontSizeClass(editedTarget)} font-bold cursor-pointer transition-colors leading-normal px-1 rounded ${colorClass} ${hoverIndex === wIdx ? 'bg-indigo-100/70' : 'bg-transparent'}`}
                                            >
                                                {word}
                                            </span>
                                        );
                                    })}
                            </div>
                        </>
                    )}
                    
                    {showIpa && ipa && !isEditing && (
                        <div className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-mono font-normal text-neutral-600 leading-relaxed animate-in slide-in-from-top-2 duration-300 flex flex-wrap gap-x-2 gap-y-1 text-left">
                            {(ipaWords && ipaWords.length > 0
                                ? ipaWords
                                : ipa
                                    .replace(/\//g, '')
                                    .replace(/\/\/+/g, ' ')
                                    .split(/\s+/)
                                    .filter(Boolean)
                            ).map((word, index) => (
                                <span
                                    key={index}
                                    className={`px-1 rounded transition-all ${
                                        hoverIndex === index
                                            ? 'bg-indigo-200 text-indigo-900'
                                            : ''
                                    }`}
                                >
                                    {word}
                                </span>
                            ))}
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
                        <p className="text-sm font-medium italic text-neutral-500 line-clamp-2">&quot;{transcript}&quot;</p>
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
                    <button onClick={() => speak(editedTarget)} disabled={!editedTarget.trim()} className="p-4 rounded-2xl bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-all" title="Listen">
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

                    {/* Play Highlight and Speed Selector */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAutoPlay}
                            disabled={!editedTarget.trim()}
                            className={`p-4 rounded-2xl transition-all ${isAutoPlaying ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:text-indigo-600'}`}
                            title="Play Highlight"
                        >
                            <Waves size={24} />
                        </button>
                        <select
                            value={playSpeed}
                            onChange={(e) => setPlaySpeed(Number(e.target.value))}
                            className="text-xs border border-neutral-200 rounded-lg px-2 py-1 bg-white"
                        >
                            <option value={0.5}>75 WPM</option>
                            <option value={0.75}>110 WPM</option>
                            <option value={1}>150 WPM</option>
                            <option value={1.25}>190 WPM</option>
                            <option value={1.5}>225 WPM</option>
                            <option value={1.75}>260 WPM</option>
                            <option value={2}>300 WPM</option>
                            <option value={2.25}>325 WPM</option>
                            <option value={2.5}>350 WPM</option>
                            <option value={2.75}>375 WPM</option>
                            <option value={3}>400 WPM</option>
                        </select>
                    </div>

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
                    <button onClick={handleAddToQueue} disabled={!editedTarget.trim()} className="p-4 rounded-2xl bg-neutral-100 text-neutral-600 hover:text-indigo-600 transition-all" title="Save to Pronunciation Page">
                        <ListPlus size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
};
