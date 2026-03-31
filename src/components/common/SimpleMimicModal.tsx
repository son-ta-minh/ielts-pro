

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Volume2, Mic, Waves, ListPlus, Play, AudioLines, Loader2, Edit2, Minimize2, Maximize2, Download } from 'lucide-react';
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
    const [isMinimized, setIsMinimized] = useState(false);
    const [editedTarget, setEditedTarget] = useState(target || '');
    const [isEditing, setIsEditing] = useState(false);
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
        return saved ? Number(saved) : 1.5;
    });
    const autoPlayRef = useRef<any>(null);
    const audioPlaybackRef = useRef<AudioContext | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    const recognitionManager = useRef(new SpeechRecognitionManager());
    const silenceTimerRef = useRef<any>(null);
    const singleWordStopTimerRef = useRef<any>(null);
    const lastActivityRef = useRef(Date.now());
    const autoStopTriggeredRef = useRef(false);
    const stopInFlightRef = useRef(false);
    const { showToast } = useToast();
    const isFreeTalkMode = !editedTarget.trim();
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
        if (isFreeTalkMode) return;
        if (isRecording && editedTarget && transcript) {
            const result = analyzeSpeechLocally(editedTarget, transcript);
            setAnalysis(result);
            if (result.score >= 100 && !autoStopTriggeredRef.current) {
                autoStopTriggeredRef.current = true;
                stopSession(transcript);
            }
        }
    }, [transcript, isRecording, editedTarget, isFreeTalkMode]);

    const fetchIpa = useCallback(async () => {
        if (isFreeTalkMode) return;
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
    }, [editedTarget, ipa, showIpa, showToast, isFreeTalkMode]);

    const stopSession = useCallback(async (currentTranscript: string) => {
        if (stopInFlightRef.current) return;
        stopInFlightRef.current = true;
        if (silenceTimerRef.current) {
            clearInterval(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (singleWordStopTimerRef.current) {
            clearTimeout(singleWordStopTimerRef.current);
            singleWordStopTimerRef.current = null;
        }
        recognitionManager.current.stop();
        setIsRecording(false);
        isRecordingRef.current = false;
        autoStopTriggeredRef.current = false;
        try {
            const audioResult = await stopRecording();
            if (audioResult) {
                setUserAudio(audioResult);
            }
            if (!isFreeTalkMode && editedTarget) {
                const result = analyzeSpeechLocally(editedTarget, currentTranscript);
                setAnalysis(result);
                if (onSaveScore) {
                    onSaveScore(result.score);
                }
            }
        } finally {
            stopInFlightRef.current = false;
        }
    }, [editedTarget, onSaveScore, isFreeTalkMode]);

    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        setTimeLeft(SILENCE_TIMEOUT);
    }, []);

    const startSilenceCountdown = useCallback((currentText: string) => {
        if (isFreeTalkMode) return;
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);

        const hasRecognizedText = currentText
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .length > 0;
        if (!hasRecognizedText) {
            setTimeLeft(SILENCE_TIMEOUT);
            return;
        }
        
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
    }, [stopSession, isFreeTalkMode]);

    useEffect(() => {
        return () => {
            if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
            if (singleWordStopTimerRef.current) clearTimeout(singleWordStopTimerRef.current);
            recognitionManager.current.stop();
        };
    }, []);

    const stopPlayback = useCallback(() => {
        if (audioPlaybackRef.current) {
            audioPlaybackRef.current.close().catch(() => {});
            audioPlaybackRef.current = null;
        }
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current.currentTime = 0;
            if (audioElementRef.current.src.startsWith('blob:')) {
                URL.revokeObjectURL(audioElementRef.current.src);
            }
            audioElementRef.current = null;
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('mimic_play_speed', String(playSpeed));
    }, [playSpeed]);

    useEffect(() => {
        return () => {
            stopPlayback();
        };
    }, [stopPlayback]);

    const handleToggleRecord = async () => {
        if (!isFreeTalkMode && !editedTarget) return;
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

                // Auto start word highlight after 0.5s when recording begins
                setTimeout(() => {
                    if (isRecordingRef.current) {
                        handleAutoPlay();
                    }
                }, 500);
                
                resetActivity();

                recognitionManager.current.start(
                    (final, interim) => {
                        const fullText = [final, interim].filter(Boolean).join(' ').trim();
                        setTranscript(fullText);
                        const hasRecognizedText = fullText
                            .toLowerCase()
                            .replace(/[^\p{L}\p{N}]+/gu, ' ')
                            .trim()
                            .length > 0;
                        if (!isFreeTalkMode && hasRecognizedText) {
                            resetActivity();
                            startSilenceCountdown(fullText);
                        }
                        if (!isFreeTalkMode && isSingleWordTarget && !singleWordStopTimerRef.current) {
                            if (hasRecognizedText) {
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
                            setTranscript(final.trim());
                            stopSession(final);
                        }
                    }
                );
            } catch (_e) {
                console.error(_e);
                setIsRecording(false);
                isRecordingRef.current = false;
                stopInFlightRef.current = false;
            }
        }
    };

    const handlePlayUserAudio = useCallback(async () => {
        if (!userAudio) return;
        stopPlayback();

        try {
            const raw = atob(userAudio.base64);
            const arrayBuffer = new ArrayBuffer(raw.length);
            const view = new Uint8Array(arrayBuffer);
            for (let i = 0; i < raw.length; i++) {
                view[i] = raw.charCodeAt(i);
            }

            const audioCtx = new AudioContext();
            audioPlaybackRef.current = audioCtx;
            const buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 1.8;
            source.connect(gainNode).connect(audioCtx.destination);
            await audioCtx.resume();
            source.start();
            source.onended = () => {
                source.disconnect();
                gainNode.disconnect();
                stopPlayback();
            };
        } catch (_e) {
            console.error('Failed to play recorded audio via AudioContext, trying fallback', _e);
            try {
                const raw = atob(userAudio.base64);
                const view = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) {
                    view[i] = raw.charCodeAt(i);
                }
                const blob = new Blob([view.buffer], { type: userAudio.mimeType });
                const url = URL.createObjectURL(blob);
                const audioEl = new Audio(url);
                audioElementRef.current = audioEl;
                audioEl.onended = () => {
                    URL.revokeObjectURL(url);
                    audioElementRef.current = null;
                };
                await audioEl.play();
            } catch (fallbackError) {
                console.error('Fallback playback also failed', fallbackError);
            }
        }
    }, [userAudio, stopPlayback]);

    const handleSaveUserAudio = useCallback(() => {
        if (!userAudio) {
            showToast('No recording to save.', 'info');
            return;
        }

        try {
            const raw = atob(userAudio.base64);
            const view = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
                view[i] = raw.charCodeAt(i);
            }

            const blob = new Blob([view.buffer], { type: userAudio.mimeType });
            const url = URL.createObjectURL(blob);
            const extension = userAudio.mimeType.includes('mp4')
                ? 'm4a'
                : userAudio.mimeType.includes('wav')
                    ? 'wav'
                    : 'webm';
            const label = editedTarget.trim()
                ? editedTarget.trim().slice(0, 32).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
                : 'free-talk';

            const link = document.createElement('a');
            link.href = url;
            link.download = `mimic-${label || 'recording'}-${Date.now()}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch {
            showToast('Unable to save recording.', 'error');
        }
    }, [editedTarget, showToast, userAudio]);

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

    const handleEnterFreeTalkMode = () => {
        setEditedTarget('');
        setIsEditing(false);
        setAnalysis(null);
        setShowIpa(false);
        setIpa(null);
        setIpaWords(null);
        setHoverIndex(null);
        if (isAutoPlaying) {
            clearTimeout(autoPlayRef.current);
            setIsAutoPlaying(false);
        }
    };

    if (isMinimized) {
        return (
            <div className="fixed bottom-5 right-5 z-[10000] flex items-center gap-3 rounded-full border border-neutral-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-md">
                <button
                    onClick={handleToggleRecord}
                    className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all transform active:scale-105 ${
                        isRecording
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/40 ring-8 ring-rose-500/10'
                            : 'bg-neutral-900 text-white shadow-lg hover:scale-105'
                    }`}
                    title={isRecording ? 'Stop recording' : 'Start recording'}
                >
                    {isRecording && (
                        <>
                            <span className="absolute inset-0 rounded-full border-4 border-rose-300/70 animate-ping" />
                            <span className="absolute inset-0 rounded-full border border-white/30 animate-pulse" />
                        </>
                    )}
                    {isRecording ? (
                        timeLeft <= 1000 ? (
                            <span className="relative z-10 text-lg font-black tabular-nums">{(timeLeft / 1000).toFixed(1)}</span>
                        ) : (
                            <Waves size={24} className="relative z-10 animate-pulse" />
                        )
                    ) : (
                        <Mic size={24} className="relative z-10" />
                    )}
                </button>
                {userAudio && (
                    <button
                        onClick={handlePlayUserAudio}
                        disabled={isRecording}
                        className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                            !isRecording ? 'bg-indigo-100 text-indigo-600 hover:text-indigo-900' : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
                        }`}
                        title="Play recording"
                    >
                        <Play size={18} fill={!isRecording ? "currentColor" : "none"} />
                    </button>
                )}
                <button
                    onClick={() => setIsMinimized(false)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-all hover:bg-neutral-200 hover:text-neutral-900"
                    title="Restore window"
                >
                    <Maximize2 size={18} />
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-5xl rounded-[2.5rem] shadow-2xl border border-neutral-200 p-8 flex flex-col items-center gap-6 relative">
                <button
                    onClick={() => setIsMinimized(true)}
                    className="absolute top-6 right-20 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-all"
                    title="Minimize"
                >
                    <Minimize2 size={18} />
                </button>
                <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-all">
                    <X size={20} />
                </button>

                <div className="text-center space-y-2 mt-2">
                    <div className="flex items-center justify-center gap-3">
                        <h3 className="text-xl font-bold text-neutral-900 leading-tight">
                            Recording Studio
                        </h3>
                        <button
                            onClick={() => {
                                if (isFreeTalkMode) {
                                    setIsEditing(true);
                                } else {
                                    handleEnterFreeTalkMode();
                                }
                            }}
                            className="px-3 py-1.5 text-[11px] font-bold rounded-full border border-neutral-200 bg-white text-neutral-700 hover:text-neutral-900 shadow-sm"
                        >
                            {isFreeTalkMode ? 'Add Text' : 'Free Talk'}
                        </button>
                    </div>
                </div>

                {!isFreeTalkMode && (
                <div className="w-full p-6 bg-neutral-50 rounded-[2rem] border border-neutral-200 flex flex-col items-center gap-3 min-h-[120px] overflow-hidden relative group">
                    {isEditing ? (
                        <div className="w-full relative">
                            <textarea
                                value={editedTarget}
                                onChange={(e) => setEditedTarget(e.target.value)}
                                placeholder="Enter text to practice..." 
                                className="w-full h-32 p-4 bg-white border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-base leading-relaxed"
                            />
                            <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                <button
                                    onClick={handleEnterFreeTalkMode}
                                    className="px-3 py-1.5 bg-white text-neutral-700 border border-neutral-200 rounded-lg text-xs font-bold shadow-sm hover:bg-neutral-50"
                                >
                                    Free Talk
                                </button>
                                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-bold shadow-sm">
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : isFreeTalkMode ? null : (
                        <>
                            <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 w-full">
                                {editedTarget
                                    .split(/\s+/)
                                    .filter(Boolean)
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
                    
                    {showIpa && ipa && !isEditing && !isFreeTalkMode && (
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
                )}

                <div className="flex flex-col items-center gap-4 w-full">
                    {isRecording ? (
                        isFreeTalkMode && transcript ? (
                            <p className="max-w-full whitespace-pre-wrap break-words text-center text-sm font-medium italic text-neutral-500">
                                &quot;{transcript}&quot;
                            </p>
                        ) : (
                            <div className="flex items-center gap-2 text-rose-500 animate-pulse">
                                <Waves size={20} />
                                <span className="text-xs font-black uppercase tracking-widest">Listening...</span>
                            </div>
                        )
                    ) : transcript && (
                        <p className="max-w-full whitespace-pre-wrap break-words text-center text-sm font-medium italic text-neutral-500">
                            &quot;{transcript}&quot;
                        </p>
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
                    {/* Speak button */}
                    {!isFreeTalkMode && (
                        <button onClick={() => speak(editedTarget)} disabled={!editedTarget.trim()} className="p-4 rounded-2xl bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-all" title="Listen">
                            <Volume2 size={24} />
                        </button>
                    )}
                    
                    {/* Show IPA button */}
                    {!isFreeTalkMode && (
                        <button 
                            onClick={fetchIpa} 
                            disabled={isIpaLoading}
                            className={`p-4 rounded-2xl transition-all ${showIpa ? 'bg-indigo-600 text-white shadow-md' : 'bg-neutral-100 text-neutral-600 hover:text-indigo-600'}`} 
                            title="Show Phonetic (IPA)"
                        >
                            {isIpaLoading ? <Loader2 size={24} className="animate-spin" /> : <AudioLines size={24} />}
                        </button>
                    )}

                    {/* Play Highlight and Speed Selector */}
                    {!isFreeTalkMode && (
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
                    )}

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
                    {userAudio && (
                        <button 
                            onClick={handlePlayUserAudio}
                            disabled={isRecording}
                            className={`p-4 rounded-2xl transition-all ${!isRecording ? 'bg-indigo-100 text-indigo-600 hover:text-indigo-900' : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'}`}
                            title="Play recording"
                        >
                            <Play size={24} fill={!isRecording ? "currentColor" : "none"} />
                        </button>
                    )}
                    {userAudio && (
                        <button
                            onClick={handleSaveUserAudio}
                            disabled={isRecording}
                            className={`p-4 rounded-2xl transition-all ${!isRecording ? 'bg-emerald-100 text-emerald-600 hover:text-emerald-900' : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'}`}
                            title="Save audio"
                        >
                            <Download size={24} />
                        </button>
                    )}
                    {!isFreeTalkMode && (
                        <button onClick={handleAddToQueue} disabled={!editedTarget.trim()} className="p-4 rounded-2xl bg-neutral-100 text-neutral-600 hover:text-indigo-600 transition-all" title="Save to Pronunciation Page">
                            <ListPlus size={24} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
