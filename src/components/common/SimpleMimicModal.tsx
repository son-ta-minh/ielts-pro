

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Volume2, Mic, Waves, ListPlus, Play, Pause, AudioLines, Loader2, Minimize2, Maximize2, Download, Pencil, Trash2, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { detectLanguage, speak, stopRecording, startRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult } from '../../utils/speechAnalysis';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';
import { getConfig, getServerUrl, getStudyBuddyAiUrl } from '../../app/settingsManager';
import * as dataStore from '../../app/dataStore';

const SILENCE_TIMEOUT = 3000;
const SINGLE_WORD_AUTOSTOP_DELAY = 1000;
const MIMIC_HISTORY_KEY = 'vocab_pro_mimic_audio_history';
const MIMIC_MINIMIZED_KEY = 'vocab_pro_mimic_modal_minimized';
const MIMIC_MINIMIZED_POSITION_KEY = 'vocab_pro_mimic_modal_minimized_position';
const MAX_HISTORY_ITEMS = 10;

interface MimicAudioItem {
    id: string;
    name: string;
    target: string;
    transcript: string;
    base64: string;
    mimeType: string;
    createdAt: number;
}

interface Props {
    target: string | null; // Allow null for manual input
    onClose: () => void;
    onSaveScore?: (score: number) => void;
    allowMinimized?: boolean; // default: false
}

interface IpaRhythmGuide {
    stressWords: string[];
    reduceWords: string[];
    ipaChunks: string[];
    textChunks: string[];
}

const normalizeGuideToken = (value: string) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .trim();

const chunkArray = <T,>(items: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
};

const extractJsonObject = (value: string): string | null => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return trimmed.slice(start, end + 1);
    }

    return null;
};

const buildFallbackIpaGuide = (sentence: string, ipaValue: string, ipaWordList?: string[] | null): IpaRhythmGuide => {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    const ipaTokens = (ipaWordList && ipaWordList.length > 0
        ? ipaWordList
        : String(ipaValue || '')
            .replace(/\//g, '')
            .replace(/\/\/+/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
    );

    const stressWords = tokens.filter((_, index) => index % 3 === 0).slice(0, Math.max(1, Math.ceil(tokens.length / 4)));
    const reduceWords = tokens.filter((_, index) => index % 3 === 2).slice(0, Math.max(0, Math.floor(tokens.length / 4)));
    const ipaChunks = chunkArray(ipaTokens, 3).map((chunk) => chunk.join(' ')).filter(Boolean);
    const textChunks = chunkArray(tokens, 3).map((chunk) => chunk.join(' ')).filter(Boolean);

    return { stressWords, reduceWords, ipaChunks, textChunks };
};

export const SimpleMimicModal: React.FC<Props> = ({ target, onClose, onSaveScore, allowMinimized = false }) => {
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false);
    const [isMinimized, setIsMinimized] = useState(() => {
        if (target && target.trim()) return false;
        return getStoredJSON<boolean>(MIMIC_MINIMIZED_KEY, true);
    });
    const [editedTarget, setEditedTarget] = useState(target || '');
    const [isEditing, setIsEditing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [userAudio, setUserAudio] = useState<{base64: string, mimeType: string} | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [timeLeft, setTimeLeft] = useState(SILENCE_TIMEOUT);
    const [activeTab, setActiveTab] = useState<'session' | 'history'>('session');
    const [history, setHistory] = useState<MimicAudioItem[]>(() => getStoredJSON<MimicAudioItem[]>(MIMIC_HISTORY_KEY, []));
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const [minimizedPosition, setMinimizedPosition] = useState<'top' | 'bottom'>(() =>
        getStoredJSON<'top' | 'bottom'>(MIMIC_MINIMIZED_POSITION_KEY, 'bottom')
    );
    const [skipRestoreAnimation, setSkipRestoreAnimation] = useState(false);
    
    // IPA States
    const [ipa, setIpa] = useState<string | null>(null);
    const [isIpaLoading, setIsIpaLoading] = useState(false);
    const [showIpa, setShowIpa] = useState(false);
    const [ipaWords, setIpaWords] = useState<string[] | null>(null);
    const [ipaRhythmGuide, setIpaRhythmGuide] = useState<IpaRhythmGuide | null>(null);
    const [isIpaRhythmLoading, setIsIpaRhythmLoading] = useState(false);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const [isAutoPlaying, setIsAutoPlaying] = useState(false);
    const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);
    const [playSpeed, setPlaySpeed] = useState<number>(() => {
        const saved = localStorage.getItem('mimic_play_speed');
        return saved ? Number(saved) : 1.5;
    });
    const autoPlayRef = useRef<any>(null);
    const audioPlaybackRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const audioBlobUrlRef = useRef<string | null>(null);

    const recognitionManager = useRef(new SpeechRecognitionManager());
    const silenceTimerRef = useRef<any>(null);
    const singleWordStopTimerRef = useRef<any>(null);
    const lastActivityRef = useRef(Date.now());
    const autoStopTriggeredRef = useRef(false);
    const stopInFlightRef = useRef(false);
    const { showToast } = useToast();
    const isFreeTalkMode = !editedTarget.trim();
    const studyBuddyAiUrl = getStudyBuddyAiUrl(getConfig());
    const isSingleWordTarget = useMemo(() => {
        const tokens = (editedTarget || '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        return tokens.length === 1;
    }, [editedTarget]);

    useEffect(() => {
        setStoredJSON(MIMIC_MINIMIZED_KEY, isMinimized);
    }, [isMinimized]);

    useEffect(() => {
        setStoredJSON(MIMIC_MINIMIZED_POSITION_KEY, minimizedPosition);
    }, [minimizedPosition]);

    useEffect(() => {
        if (target === null) return;
        setEditedTarget(target);
        setIsEditing(false);
        setAnalysis(null);
        setTranscript('');
        setUserAudio(null);
        setShowIpa(false);
        setIpaRhythmGuide(null);
        setHoverIndex(null);
        setActiveTab('session');
        setSkipRestoreAnimation(false);
        setIsMinimized(false);
    }, [target]);

    const fetchIpaRhythmGuide = useCallback(async (sentence: string, fetchedIpa: string, fetchedIpaWords?: string[] | null) => {
        const trimmedSentence = sentence.trim();
        const trimmedIpa = String(fetchedIpa || '').trim();
        if (!trimmedSentence || !trimmedIpa) {
            setIpaRhythmGuide(null);
            return;
        }

        setIsIpaRhythmLoading(true);
        try {
            const language = detectLanguage(trimmedSentence) === 'ja' ? 'Japanese' : 'English';
            const response = await fetch(studyBuddyAiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert pronunciation and speech rhythm coach. Return strict JSON only with no markdown and no extra commentary.'
                        },
                        {
                            role: 'user',
                            content: `Analyze this ${language} sentence for natural speaking rhythm.

Sentence:
${trimmedSentence}

Fetched IPA:
${trimmedIpa}

${fetchedIpaWords && fetchedIpaWords.length > 0 ? `IPA tokens:
${fetchedIpaWords.join(' | ')}
` : ''}Task:
- Choose the most important words to stress in natural speech.
- Choose words that are usually read lighter or faster for smoother rhythm.
- Break the original sentence into short natural speaking chunks.
- Break the IPA into short spoken chunks so the learner can read each chunk in one breath, not word by word.
- Keep the original wording. Do not rewrite the sentence.
- Keep chunks short and practical for shadowing.
- For Japanese, focus on natural phrasing chunks and key focus words, not exaggerated English-style stress.

Return exactly one JSON object with this shape:
{
  "stressWords": ["word1", "word2"],
  "reduceWords": ["word3", "word4"],
  "textChunks": ["chunk 1", "chunk 2", "chunk 3"],
  "ipaChunks": ["chunk 1", "chunk 2", "chunk 3"]
}`
                        }
                    ],
                    searchEnabled: false,
                    temperature: 0.3,
                    top_p: 0.85,
                    repetition_penalty: 1.02,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`IPA rhythm request failed (${response.status})`);
            }

            const payload = await response.json().catch(() => null);
            const rawContent = String(payload?.choices?.[0]?.message?.content || '').trim();
            const jsonText = extractJsonObject(rawContent);
            const parsed = jsonText ? JSON.parse(jsonText) : null;

            const guide: IpaRhythmGuide = {
                stressWords: Array.isArray(parsed?.stressWords) ? parsed.stressWords.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
                reduceWords: Array.isArray(parsed?.reduceWords) ? parsed.reduceWords.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
                textChunks: Array.isArray(parsed?.textChunks) ? parsed.textChunks.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
                ipaChunks: Array.isArray(parsed?.ipaChunks) ? parsed.ipaChunks.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
            };

            if (guide.stressWords.length === 0 && guide.reduceWords.length === 0 && guide.textChunks.length === 0 && guide.ipaChunks.length === 0) {
                setIpaRhythmGuide(buildFallbackIpaGuide(trimmedSentence, trimmedIpa, fetchedIpaWords));
                return;
            }

            const fallbackGuide = buildFallbackIpaGuide(trimmedSentence, trimmedIpa, fetchedIpaWords);
            setIpaRhythmGuide({
                stressWords: guide.stressWords,
                reduceWords: guide.reduceWords,
                textChunks: guide.textChunks.length > 0 ? guide.textChunks : fallbackGuide.textChunks,
                ipaChunks: guide.ipaChunks.length > 0 ? guide.ipaChunks : fallbackGuide.ipaChunks
            });
        } catch (error) {
            console.error(error);
            setIpaRhythmGuide(buildFallbackIpaGuide(trimmedSentence, trimmedIpa, fetchedIpaWords));
        } finally {
            setIsIpaRhythmLoading(false);
        }
    }, [studyBuddyAiUrl]);

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
                setIpaWords(null);
                setShowIpa(true);
                void fetchIpaRhythmGuide(editedTarget, existing.ipaUs, null);
                setIsIpaLoading(false);
                return;
            }

            // 2. Fallback to Server API
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const pronunciationLang = detectLanguage(editedTarget) === 'ja' ? 'ja' : 'en';
            const res = await fetch(`${serverUrl}/api/convert/pron?text=${encodeURIComponent(editedTarget)}&lang=${encodeURIComponent(pronunciationLang)}`);
            if (res.ok) {
                const data = await res.json();
                setIpa(data.ipa);
                setIpaWords(data.ipaWords || null);
                void fetchIpaRhythmGuide(editedTarget, data.ipa, data.ipaWords || null);
                setShowIpa(true);
            } else {
                showToast("IPA server unavailable", "error");
            }
        } catch {
            showToast("Failed to fetch IPA", "error");
        } finally {
            setIsIpaLoading(false);
        }
    }, [editedTarget, fetchIpaRhythmGuide, ipa, showIpa, showToast, isFreeTalkMode]);

    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        setTimeLeft(SILENCE_TIMEOUT);
    }, []);

    useEffect(() => {
        return () => {
            if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
            if (singleWordStopTimerRef.current) clearTimeout(singleWordStopTimerRef.current);
            recognitionManager.current.stop();
        };
    }, []);

    const stopPlayback = useCallback(() => {
        setPlayingAudioKey(null);
        if (audioSourceRef.current) {
            audioSourceRef.current.onended = null;
            try {
                audioSourceRef.current.stop();
            } catch {}
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (audioPlaybackRef.current) {
            audioPlaybackRef.current.close().catch(() => {});
            audioPlaybackRef.current = null;
        }
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current.currentTime = 0;
            audioElementRef.current = null;
        }
        if (audioBlobUrlRef.current) {
            URL.revokeObjectURL(audioBlobUrlRef.current);
            audioBlobUrlRef.current = null;
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

    const getRecordingExtension = useCallback((mimeType: string) => {
        if (mimeType.includes('mp4')) return 'm4a';
        if (mimeType.includes('wav')) return 'wav';
        return 'webm';
    }, []);

    const getRecordingLabel = useCallback((text: string) => {
        const normalized = text.trim().slice(0, 32).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
        return normalized || 'free-talk';
    }, []);

    const decodeAudioBytes = useCallback((base64: string) => {
        const raw = atob(base64);
        const view = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            view[i] = raw.charCodeAt(i);
        }
        return view;
    }, []);

    const saveAudioToDevice = useCallback((audio: { base64: string; mimeType: string }, label: string, createdAt = Date.now()) => {
        const bytes = decodeAudioBytes(audio.base64);
        const blob = new Blob([bytes.buffer], { type: audio.mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mimic-${getRecordingLabel(label)}-${createdAt}.${getRecordingExtension(audio.mimeType)}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [decodeAudioBytes, getRecordingExtension, getRecordingLabel]);

    const saveAudioToHistory = useCallback((audio: { base64: string; mimeType: string }, currentTranscript: string) => {
        const trimmedTarget = editedTarget.trim();
        const trimmedTranscript = currentTranscript.trim();
        const item: MimicAudioItem = {
            id: `mimic-audio-${Date.now()}`,
            name: trimmedTarget || trimmedTranscript.split(/\s+/).slice(0, 6).join(' ') || 'Free Talk',
            target: trimmedTarget,
            transcript: trimmedTranscript,
            base64: audio.base64,
            mimeType: audio.mimeType,
            createdAt: Date.now()
        };

        setHistory((prev) => {
            const next = [item, ...prev].slice(0, MAX_HISTORY_ITEMS);
            setStoredJSON(MIMIC_HISTORY_KEY, next);
            return next;
        });
    }, [editedTarget]);

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
                saveAudioToHistory(audioResult, currentTranscript);
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
    }, [editedTarget, isFreeTalkMode, onSaveScore, saveAudioToHistory]);

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
    }, [isFreeTalkMode, stopSession]);

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
    }, [editedTarget, isFreeTalkMode, isRecording, stopSession, transcript]);

    const startRecognitionSession = useCallback(() => {
        recognitionManager.current.setLanguage(detectLanguage(editedTarget || 'en'));
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
                if (!isRecordingRef.current) return;
                const trimmedFinal = final.trim();
                setTranscript(trimmedFinal);

                if (isFreeTalkMode) {
                    startRecognitionSession();
                    return;
                }

                stopSession(trimmedFinal);
            }
        );
    }, [isFreeTalkMode, isSingleWordTarget, resetActivity, startSilenceCountdown, stopSession]);

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
            stopPlayback();
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
                startRecognitionSession();
            } catch (_e) {
                console.error(_e);
                setIsRecording(false);
                isRecordingRef.current = false;
                stopInFlightRef.current = false;
            }
        }
    };

    const playAudioData = useCallback(async (audio: { base64: string; mimeType: string }, audioKey: string) => {
        if (playingAudioKey === audioKey) {
            stopPlayback();
            return;
        }

        stopPlayback();
        setPlayingAudioKey(audioKey);

        try {
            const view = decodeAudioBytes(audio.base64);
            const arrayBuffer = view.buffer.slice(0) as ArrayBuffer;

            const audioCtx = new AudioContext();
            audioPlaybackRef.current = audioCtx;
            const buffer = await audioCtx.decodeAudioData(arrayBuffer);
            const source = audioCtx.createBufferSource();
            audioSourceRef.current = source;
            source.buffer = buffer;
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 1.8;
            source.connect(gainNode).connect(audioCtx.destination);
            await audioCtx.resume();
            source.start();
            source.onended = () => {
                if (audioSourceRef.current === source) {
                    source.disconnect();
                    gainNode.disconnect();
                    stopPlayback();
                }
            };
        } catch (_e) {
            console.error('Failed to play recorded audio via AudioContext, trying fallback', _e);
            try {
                const view = decodeAudioBytes(audio.base64);
                const blob = new Blob([view.buffer], { type: audio.mimeType });
                const url = URL.createObjectURL(blob);
                audioBlobUrlRef.current = url;
                const audioEl = new Audio(url);
                audioElementRef.current = audioEl;
                audioEl.onended = () => {
                    if (audioElementRef.current === audioEl) {
                        stopPlayback();
                    }
                };
                await audioEl.play();
            } catch (fallbackError) {
                console.error('Fallback playback also failed', fallbackError);
                stopPlayback();
            }
        }
    }, [decodeAudioBytes, playingAudioKey, stopPlayback]);

    const handlePlayUserAudio = useCallback(async () => {
        if (!userAudio) return;
        await playAudioData(userAudio, 'session-recording');
    }, [playAudioData, userAudio]);

    const handleSaveUserAudio = useCallback(() => {
        if (!userAudio) {
            showToast('No recording to save.', 'info');
            return;
        }

        try {
            saveAudioToDevice(userAudio, editedTarget || transcript || 'recording');
        } catch {
            showToast('Unable to save recording.', 'error');
        }
    }, [editedTarget, saveAudioToDevice, showToast, transcript, userAudio]);

    const handleRenameHistory = useCallback((id: string) => {
        const name = renameDraft.trim();
        if (!name) {
            showToast('Name cannot be empty.', 'info');
            return;
        }

        setHistory((prev) => {
            const next = prev.map((item) => item.id === id ? { ...item, name } : item);
            setStoredJSON(MIMIC_HISTORY_KEY, next);
            return next;
        });
        setRenamingId(null);
        setRenameDraft('');
    }, [renameDraft, showToast]);

    const handleDeleteHistory = useCallback((id: string) => {
        setHistory((prev) => {
            const next = prev.filter((item) => item.id !== id);
            setStoredJSON(MIMIC_HISTORY_KEY, next);
            if (next.length === 0) {
                setUserAudio(null);
            }
            return next;
        });
        if (renamingId === id) {
            setRenamingId(null);
            setRenameDraft('');
        }
    }, [renamingId]);

    // Clear all history handler
    const handleClearAllHistory = useCallback(() => {
        setHistory([]);
        setStoredJSON(MIMIC_HISTORY_KEY, []);
        setUserAudio(null);
        setRenamingId(null);
        setRenameDraft('');
    }, []);

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
        setIpaRhythmGuide(null);
        setHoverIndex(null);
        if (isAutoPlaying) {
            clearTimeout(autoPlayRef.current);
            setIsAutoPlaying(false);
        }
    };

    const formatHistoryTime = (timestamp: number) =>
        new Date(timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

    const stressWordCounts = useMemo(() => {
        const counts = new Map<string, number>();
        (ipaRhythmGuide?.stressWords || []).forEach((word) => {
            const key = normalizeGuideToken(word);
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }, [ipaRhythmGuide]);

    const reduceWordCounts = useMemo(() => {
        const counts = new Map<string, number>();
        (ipaRhythmGuide?.reduceWords || []).forEach((word) => {
            const key = normalizeGuideToken(word);
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }, [ipaRhythmGuide]);

    const guidedSentenceWords = useMemo(() => {
        const stressRemaining = new Map(stressWordCounts);
        const reduceRemaining = new Map(reduceWordCounts);
        const textChunks = (ipaRhythmGuide?.textChunks || []).map((chunk) =>
            chunk
                .split(/\s+/)
                .filter(Boolean)
                .map((word) => normalizeGuideToken(word))
                .filter(Boolean)
        ).filter((chunk) => chunk.length > 0);
        let activeChunkIndex = 0;
        let activeChunkOffset = 0;

        return Array.from(editedTarget.matchAll(/\S+/g)).map((match) => {
                const word = match[0];
                const key = normalizeGuideToken(word);
                const stressCount = key ? (stressRemaining.get(key) || 0) : 0;
                const reduceCount = key ? (reduceRemaining.get(key) || 0) : 0;
                const emphasis = stressCount > 0 ? 'stress' : reduceCount > 0 ? 'reduce' : 'normal';

                if (key && stressCount > 0) {
                    stressRemaining.set(key, stressCount - 1);
                } else if (key && reduceCount > 0) {
                    reduceRemaining.set(key, reduceCount - 1);
                }

                while (activeChunkIndex < textChunks.length && activeChunkOffset >= textChunks[activeChunkIndex].length) {
                    activeChunkIndex += 1;
                    activeChunkOffset = 0;
                }

                let chunkIndex: number | null = null;
                if (activeChunkIndex < textChunks.length) {
                    const currentChunk = textChunks[activeChunkIndex];
                    const expectedKey = currentChunk[activeChunkOffset];
                    if (!expectedKey || expectedKey === key) {
                        chunkIndex = activeChunkIndex;
                        activeChunkOffset += 1;
                    }
                }

                return {
                    word,
                    emphasis,
                    chunkIndex,
                    start: match.index ?? 0,
                    end: (match.index ?? 0) + word.length
                };
            });
    }, [editedTarget, ipaRhythmGuide?.textChunks, reduceWordCounts, stressWordCounts]);

    const guidedSentenceGroups = useMemo(() => {
        const groups: Array<{ chunkIndex: number | null; items: Array<{ word: string; emphasis: string; originalIndex: number; prefix: string }> }> = [];

        guidedSentenceWords.forEach((item, index) => {
            const previousWord = guidedSentenceWords[index - 1];
            const prefix = editedTarget.slice(previousWord ? previousWord.end : 0, item.start);
            const currentGroup = groups[groups.length - 1];
            if (!currentGroup || currentGroup.chunkIndex !== item.chunkIndex) {
                groups.push({
                    chunkIndex: item.chunkIndex,
                    items: [{ word: item.word, emphasis: item.emphasis, originalIndex: index, prefix }]
                });
                return;
            }

            currentGroup.items.push({ word: item.word, emphasis: item.emphasis, originalIndex: index, prefix });
        });

        return groups;
    }, [editedTarget, guidedSentenceWords]);

    const guidedSentenceSuffix = useMemo(() => {
        const lastWord = guidedSentenceWords[guidedSentenceWords.length - 1];
        return editedTarget.slice(lastWord ? lastWord.end : 0);
    }, [editedTarget, guidedSentenceWords]);

    const handleRestore = useCallback(() => {
        const selectedText = window.getSelection()?.toString().trim() || '';
        if (selectedText) {
            setEditedTarget(selectedText);
            setIsEditing(false);
            setAnalysis(null);
            setTranscript('');
            setUserAudio(null);
            setShowIpa(false);
            setIpa(null);
            setIpaWords(null);
            setIpaRhythmGuide(null);
            setHoverIndex(null);
            setActiveTab('session');
        }
        setSkipRestoreAnimation(true);
        setIsMinimized(false);
    }, []);

    if (isMinimized && allowMinimized) {
        return (
            <div className={`fixed right-5 z-[10000] flex items-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur-md ${minimizedPosition === 'top' ? 'top-5' : 'bottom-5'}`}>
                <button
                    onClick={handleToggleRecord}
                    className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all transform active:scale-105 ${
                        isRecording
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/40 ring-4 ring-rose-500/10'
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
                            <span className="relative z-10 text-sm font-black tabular-nums">{(timeLeft / 1000).toFixed(1)}</span>
                        ) : (
                            <Waves size={18} className="relative z-10 animate-pulse" />
                        )
                    ) : (
                        <Mic size={18} className="relative z-10" />
                    )}
                </button>
                {userAudio && (
                    <button
                        onClick={handlePlayUserAudio}
                        disabled={isRecording}
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                            !isRecording && playingAudioKey === 'session-recording'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                : !isRecording
                                    ? 'bg-indigo-100 text-indigo-600 hover:text-indigo-900'
                                    : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
                        }`}
                        title={playingAudioKey === 'session-recording' ? 'Stop playback' : 'Play recording'}
                    >
                        {playingAudioKey === 'session-recording'
                            ? <Pause size={15} fill={!isRecording ? "currentColor" : "none"} />
                            : <Play size={15} fill={!isRecording ? "currentColor" : "none"} />}
                    </button>
                )}
                <div className="overflow-hidden rounded-full border border-neutral-200 shadow-sm">
                    <button
                        onClick={() => setMinimizedPosition((current) => current === 'top' ? 'bottom' : 'top')}
                        className="flex h-6 w-10 items-center justify-center bg-neutral-100 text-neutral-700 transition-all hover:bg-neutral-200 hover:text-neutral-900"
                        title={minimizedPosition === 'top' ? 'Move down' : 'Move up'}
                    >
                        {minimizedPosition === 'top' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                    <button
                        onClick={handleRestore}
                        className="flex h-6 w-10 items-center justify-center border-t border-neutral-200 bg-emerald-100 text-emerald-700 transition-all hover:bg-emerald-200 hover:text-emerald-900"
                        title="Restore window"
                    >
                        <Maximize2 size={14} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${skipRestoreAnimation ? '' : 'animate-in fade-in duration-200'}`}>
            <div className="bg-white w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-5xl rounded-[2.5rem] shadow-2xl border border-neutral-200 p-8 flex flex-col items-center gap-6 relative">
                {allowMinimized ? (
                    <button
                        onClick={() => {
                            setSkipRestoreAnimation(false);
                            setIsMinimized(true);
                        }}
                        className="absolute top-6 right-6 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-all"
                        title="Minimize"
                    >
                        <Minimize2 size={18} />
                    </button>
                ) : (
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-all"
                        title="Close"
                    >
                        <span className="text-lg font-bold">×</span>
                    </button>
                )}

                <div className="flex w-fit max-w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setActiveTab('session');
                                handleEnterFreeTalkMode();
                            }}
                            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeTab === 'session' && isFreeTalkMode && !isEditing ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                        >
                            Free Talk
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('session');
                                setIsEditing(true);
                            }}
                            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeTab === 'session' && (!isFreeTalkMode || isEditing) ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                        >
                            Mimic
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                        >
                            History ({history.length})
                        </button>
                    </div>
                </div>

                {activeTab === 'session' && (!isFreeTalkMode || isEditing) && (
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
                                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-bold shadow-sm">
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : isFreeTalkMode ? null : (
                        <>
                            <div className={`w-full whitespace-pre-wrap break-words text-center leading-relaxed ${getFontSizeClass(editedTarget)}`}>
                                {guidedSentenceGroups.map((group, groupIndex) => (
                                    <React.Fragment key={`chunk-${groupIndex}`}>
                                        {group.items[0]?.prefix || ''}
                                        <span
                                            className={`inline align-baseline box-decoration-clone ${showIpa && group.chunkIndex !== null ? 'border-b-2 border-indigo-300 pb-0.5' : ''}`}
                                        >
                                        {group.items.map(({ word, emphasis, originalIndex, prefix }, itemIndex) => {
                                            const wordAnalysis = analysis?.words[originalIndex];
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

                                            const emphasisClass = showIpa
                                                ? emphasis === 'stress'
                                                    ? 'font-black'
                                                : emphasis === 'reduce'
                                                        ? 'italic text-neutral-400'
                                                        : 'font-bold'
                                                : 'font-bold';
                                            const hoverClass = hoverIndex === originalIndex ? 'bg-indigo-100/70 ring-2 ring-indigo-200 ring-offset-1' : 'bg-transparent';

                                            return (
                                                <React.Fragment key={originalIndex}>
                                                    {itemIndex > 0 ? prefix : ''}
                                                    <span
                                                        onClick={() => speak(word)}
                                                        onMouseEnter={() => setHoverIndex(originalIndex)}
                                                        onMouseLeave={() => setHoverIndex(null)}
                                                        className={`${emphasisClass} cursor-pointer transition-colors leading-normal px-1 rounded ${colorClass} ${hoverClass}`}
                                                    >
                                                        {word}
                                                    </span>
                                                </React.Fragment>
                                            );
                                        })}
                                        </span>
                                    </React.Fragment>
                                ))}
                                {guidedSentenceSuffix}
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
                            {isIpaRhythmLoading && (
                                <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
                                    <Loader2 size={12} className="animate-spin" />
                                    <span>AI guiding chunks...</span>
                                </span>
                            )}
                        </div>
                    )}
                </div>
                )}

                {activeTab === 'session' && (
                <>
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
                            className={`p-4 rounded-2xl transition-all ${
                                !isRecording && playingAudioKey === 'session-recording'
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : !isRecording
                                        ? 'bg-indigo-100 text-indigo-600 hover:text-indigo-900'
                                        : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
                            }`}
                            title={playingAudioKey === 'session-recording' ? 'Stop playback' : 'Play recording'}
                        >
                            {playingAudioKey === 'session-recording'
                                ? <Pause size={24} fill={!isRecording ? "currentColor" : "none"} />
                                : <Play size={24} fill={!isRecording ? "currentColor" : "none"} />}
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
                </>
                )}

                {activeTab === 'history' && (
                    <div className="w-full space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-neutral-600">History ({history.length})</p>
                            {history.length > 0 && (
                                <button
                                    onClick={handleClearAllHistory}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-all"
                                    title="Clear all recordings"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                        {history.length === 0 ? (
                            <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-sm text-neutral-500">
                                Your last 10 recordings will appear here.
                            </div>
                        ) : (
                            history.map((item) => (
                                <div key={item.id} className="rounded-[2rem] border border-neutral-200 bg-white px-5 py-4 shadow-sm">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0 flex-1 space-y-2">
                                            {renamingId === item.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={renameDraft}
                                                        onChange={(e) => setRenameDraft(e.target.value)}
                                                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold outline-none focus:border-neutral-900"
                                                        placeholder="Recording name"
                                                    />
                                                    <button
                                                        onClick={() => handleRenameHistory(item.id)}
                                                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white"
                                                        title="Save name"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-sm font-bold text-neutral-900">{item.name}</p>
                                                    <button
                                                        onClick={() => {
                                                            setRenamingId(item.id);
                                                            setRenameDraft(item.name);
                                                        }}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-neutral-100 hover:text-neutral-900"
                                                        title="Rename"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                                                <span>{formatHistoryTime(item.createdAt)}</span>
                                                <span className="rounded-full bg-neutral-100 px-2 py-1 font-semibold text-neutral-500">
                                                    {item.target.trim() ? 'Mimic' : 'Free Talk'}
                                                </span>
                                            </div>
                                            {item.target.trim() && (
                                                <p className="line-clamp-2 text-sm font-medium text-neutral-700">{item.target}</p>
                                            )}
                                            {item.transcript.trim() && (
                                                <p className="line-clamp-2 text-xs italic text-neutral-400">&quot;{item.transcript}&quot;</p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setUserAudio({ base64: item.base64, mimeType: item.mimeType });
                                                    void playAudioData({ base64: item.base64, mimeType: item.mimeType }, item.id);
                                                }}
                                                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                                                    playingAudioKey === item.id
                                                        ? 'bg-indigo-600 text-white shadow-md'
                                                        : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                                }`}
                                                title={playingAudioKey === item.id ? 'Stop' : 'Play'}
                                            >
                                                {playingAudioKey === item.id
                                                    ? <Pause size={16} fill="currentColor" />
                                                    : <Play size={16} fill="currentColor" />}
                                            </button>
                                            <button
                                                onClick={() => saveAudioToDevice({ base64: item.base64, mimeType: item.mimeType }, item.name, item.createdAt)}
                                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition-all hover:bg-emerald-200"
                                                title="Save"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteHistory(item.id)}
                                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 transition-all hover:bg-rose-200"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
