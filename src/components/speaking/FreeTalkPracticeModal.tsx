
import { InteractiveTranscript } from '../common/InteractiveTranscript';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FreeTalkItem, UserRecording, VocabularyItem } from '../../app/types';
import { TargetPhrase } from '../labs/MimicPractice';
import { MimicPracticeUI } from '../labs/MimicPractice_UI';
import { startRecording, stopRecording, speak, stopSpeaking, playSound, getAudioProgress, seekAudio } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult } from '../../utils/speechAnalysis';
import * as dataStore from '../../app/dataStore';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { Mic, Play, Square, Pause, Save, Upload, Trash2, Calendar, FileAudio, LayoutList, Mic2, X, BookText, Loader2, RotateCcw, Check, Edit3, Volume2 } from 'lucide-react';
import ConfirmationModal from '../common/ConfirmationModal';
import { AudioTrimmer } from '../common/AudioTrimmer';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    item: FreeTalkItem | null;
}

type PracticeMode = 'MIMIC' | 'RECORDING' | 'PLAYBACK';

export const FreeTalkPracticeModal: React.FC<Props> = ({ isOpen, onClose, item: initialItem }) => {
    const { showToast } = useToast();
    const [mode, setMode] = useState<PracticeMode>('RECORDING');
    const [item, setItem] = useState<FreeTalkItem | null>(null);

    useEffect(() => {
        if (isOpen && initialItem) {
            setItem(initialItem);
        } else if (!isOpen) {
            setItem(null);
        }
    }, [isOpen, initialItem?.id]);
    
    // --- MIMIC MODE STATE ---
    const [queue, setQueue] = useState<TargetPhrase[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    
    const [isRecording, setIsRecording] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [fullTranscript, setFullTranscript] = useState('');
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const [localAnalysis, setLocalAnalysis] = useState<AnalysisResult | null>(null);
    
    const [autoSpeak, setAutoSpeak] = useState(false);
    const [autoReveal, setAutoReveal] = useState(() => getStoredJSON('vocab_pro_mimic_autoreveal', true));
    const [ipa, setIpa] = useState<string | null>(null);
    const [showIpa, setShowIpa] = useState(false);
    const [isIpaLoading, setIsIpaLoading] = useState(false);

    // --- RECORDING MODE STATE ---
    const [isLongRecording, setIsLongRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [rawRecording, setRawRecording] = useState<Blob | null>(null);
    const [trimmedRecording, setTrimmedRecording] = useState<Blob | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    // Audio Player State
    const [currentPlayingRef, setCurrentPlayingRef] = useState<string | null>(null); // url of currently playing reference
    const [currentPlayingUser, setCurrentPlayingUser] = useState<string | null>(null); // id of currently playing user recording
    const [playbackTime, setPlaybackTime] = useState(0);
    const [playbackDuration, setPlaybackDuration] = useState(0);
    const stopAtTimeRef = useRef<number | null>(null); // For segment playback
    
    // Local state to track recordings immediately without waiting for parent refresh
    const [activeRecordings, setActiveRecordings] = useState<UserRecording[]>([]);
    
    const [recToDelete, setRecToDelete] = useState<UserRecording | null>(null);

    // Refs
    const recognitionManager = useRef(new SpeechRecognitionManager());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const recordingTimerRef = useRef<any>(null);

    // Save autoReveal setting changes (shared with main MimicPractice)
    useEffect(() => {
        setStoredJSON('vocab_pro_mimic_autoreveal', autoReveal);
    }, [autoReveal]);

    // Initialize: Split paragraph into sentences for Mimic & Load Recordings
    useEffect(() => {
        if (isOpen && item) {
            // 1. Prepare Script Content for Mimic
            let mimicContent = item.content;
            
            // If scriptItems exist, filter only 'script' types and join them
            if (item.scriptItems && item.scriptItems.length > 0) {
                mimicContent = item.scriptItems
                    .filter(i => i.type === 'script')
                    .map(i => i.content)
                    .join('\n\n');
            }

            // Clean the text: remove markdown-like links and brackets
            const cleanedContent = mimicContent
                .replace(/\[([\s\S]*?)\]\([\s\S]*?\)/g, '$1') // [text](url) -> text
                .replace(/\{([\s\S]*?)\}/g, '$1')           // {text} -> text
                .replace(/\[([\s\S]*?)\]/g, '$1');          // [text] -> text

            // Robust sentence splitting
            const sentences = cleanedContent.split(/[.!?\n]+/g).filter(Boolean); // Split by punctuation AND newlines
            const phrases: TargetPhrase[] = sentences
                .map(s => s.trim())
                .filter(Boolean)
                .map((text, idx) => ({
                    id: `ft-${item.id}-${idx}`,
                    text: text,
                    sourceWord: item.title,
                    type: 'Free Talk',
                    lastScore: item.sentenceScores?.[idx] // Restore from saved
                }));

            setQueue(phrases);
            setCurrentIndex(0);
            setPage(0);
            setActiveRecordings(item.userRecordings || []); // Init local recordings
            resetPracticeState();
        } else {
            // Cleanup on close
            stopSpeaking();
            stopAllAudio();
            recognitionManager.current.stop();
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            setRawRecording(null);
            setTrimmedRecording(null);
        }
    }, [isOpen, item?.id]);

    const target = queue[currentIndex] || null;

    // Real-time analysis during recording
    useEffect(() => {
        if (isRecording && target && fullTranscript) {
            const result = analyzeSpeechLocally(target.text, fullTranscript);
            setLocalAnalysis(result);
        }
    }, [fullTranscript, isRecording, target]);

    // Reset state when target changes in Mimic
    useEffect(() => {
        if (mode === 'MIMIC') {
            resetPracticeState();
            if (autoSpeak && target) {
                const t = setTimeout(() => speak(target.text), 500);
                return () => clearTimeout(t);
            }
        }
    }, [target?.id, mode]);

    // Clean up audio object events
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
                audioRef.current = null;
            }
        };
    }, []);

    const resetPracticeState = () => {
        setIsRecording(false);
        setIsRevealed(autoReveal); 
        setFullTranscript('');
        setUserAudioUrl(null);
        setLocalAnalysis(null);
        setIpa(null);
        setShowIpa(false);
    };

    const stopAllAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setCurrentPlayingRef(null);
        setCurrentPlayingUser(null);
        setPlaybackTime(0);
        setPlaybackDuration(0);
        stopAtTimeRef.current = null;
        stopSpeaking();
    };

    const saveProgress = async (currentQueue: TargetPhrase[]) => {
        if (!item) return;
        const sentenceScores: Record<number, number> = {};
        let totalScoreSum = 0;
        
        currentQueue.forEach((p, idx) => {
            // Lấy điểm đã lưu, nếu chưa nói (undefined) thì coi là 0
            const score = p.lastScore || 0;
            if (p.lastScore !== undefined) {
                sentenceScores[idx] = p.lastScore;
            }
            totalScoreSum += score;
        });

        // Tính trung bình dựa trên TỔNG số câu trong queue thay vì số câu đã trả lời
        const averageScore = currentQueue.length > 0 
            ? Math.round(totalScoreSum / currentQueue.length) 
            : 0;

        const updatedItem = {
            ...item,
            bestScore: averageScore,
            sentenceScores,
            updatedAt: Date.now()
        };
        setItem(updatedItem);
        await dataStore.saveFreeTalkItem(updatedItem);
    };

    // --- MIMIC Actions ---
    const handleToggleRecordMimic = async () => {
        if (!target) return;
        
        if (isRecording) {
            setIsRecording(false);
            recognitionManager.current.stop();
            try {
                const result = await stopRecording();
                if (result) setUserAudioUrl(result.base64);
                const analysis = analyzeSpeechLocally(target.text, fullTranscript);
                setLocalAnalysis(analysis);
                const updatedQueue = queue.map((p, idx) => idx === currentIndex ? { ...p, lastScore: analysis.score } : p);
                setQueue(updatedQueue);
                await saveProgress(updatedQueue);
            } catch (e) { console.error(e); }
        } else {
            resetPracticeState(); 
            try {
                await startRecording();
                setIsRecording(true);
                recognitionManager.current.start(
                    (final, interim) => setFullTranscript(final + interim),
                    (final) => setFullTranscript(final)
                );
            } catch (e) {
                console.error("Mic error", e);
                setIsRecording(false);
            }
        }
    };

    const handleFetchIpa = async () => {
        if (!target) return;
        if (ipa) { setShowIpa(!showIpa); return; }
        setIsIpaLoading(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(target.text)}`);
            if (res.ok) {
                const data = await res.json();
                setIpa(data.ipa);
                setShowIpa(true);
            } else { showToast("IPA server unavailable", "error"); }
        } catch (e) { showToast("Failed to fetch IPA", "error"); } finally { setIsIpaLoading(false); }
    };

    // --- RECORDING MODE Actions ---

    // Unified Audio Player logic
    const playAudio = (url: string, refId: string | null, userId: string | null, startTime?: number, duration?: number) => {
        const isBlobSource = url.startsWith('blob:');

        // Playback/Reference audio should be controlled by shared Coach media control.
        if (!isBlobSource) {
            if ((refId && currentPlayingRef === refId) || (userId && currentPlayingUser === userId)) {
                stopAllAudio();
                if (!startTime && !duration) return;
            }
            stopAllAudio();
            if (refId) setCurrentPlayingRef(refId);
            if (userId) setCurrentPlayingUser(userId);
            setPlaybackTime(0);
            setPlaybackDuration(0);
            stopAtTimeRef.current = null;
            playSound(url, startTime, duration).then(() => {
                setCurrentPlayingRef(null);
                setCurrentPlayingUser(null);
                setPlaybackTime(0);
                setPlaybackDuration(0);
            }).catch(() => {
                showToast("Failed to play audio.", "error");
                setCurrentPlayingRef(null);
                setCurrentPlayingUser(null);
                setPlaybackTime(0);
                setPlaybackDuration(0);
            });
            return;
        }

        // If already playing this one, pause it (unless we are changing segment)
        if ((refId && currentPlayingRef === refId) || (userId && currentPlayingUser === userId)) {
            stopAllAudio();
            if (!startTime && !duration) return; // Toggle off if no specific segment requested
        }

        stopAllAudio();
        
        const audio = new Audio(url);
        audioRef.current = audio;
        
        // Setup events
        audio.addEventListener('loadedmetadata', () => {
            setPlaybackDuration(audio.duration);
            if (startTime) {
                audio.currentTime = startTime;
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            setPlaybackTime(audio.currentTime);
            if (stopAtTimeRef.current !== null && audio.currentTime >= stopAtTimeRef.current) {
                audio.pause();
                stopAllAudio();
            }
        });
        
        audio.addEventListener('ended', () => {
            stopAllAudio();
        });
        
        audio.addEventListener('error', () => {
            showToast("Failed to play audio.", "error");
            stopAllAudio();
        });

        // Set State identifiers
        if (refId) setCurrentPlayingRef(refId);
        if (userId) setCurrentPlayingUser(userId);

        if (startTime && duration) {
            stopAtTimeRef.current = startTime + duration;
        }

        audio.play().catch(e => {
            console.error("Play error", e);
            stopAllAudio();
        });
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setPlaybackTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        } else {
            seekAudio(time);
        }
    };

    useEffect(() => {
        // Sync card-level progress UI when playback is controlled by shared audio engine.
        if (audioRef.current || (!currentPlayingRef && !currentPlayingUser)) return;
        const timer = window.setInterval(() => {
            const progress = getAudioProgress();
            if (!progress) return;
            setPlaybackTime(progress.currentTime || 0);
            setPlaybackDuration(progress.duration || 0);
        }, 100);
        return () => window.clearInterval(timer);
    }, [currentPlayingRef, currentPlayingUser]);

    const handleToggleRecordLong = async () => {
        if (isLongRecording) {
            // Stop and Prepare for Review
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
            setIsLongRecording(false);
            
            try {
                const result = await stopRecording();
                if (result) {
                    // Convert Base64 back to Blob for trimming/playback
                    const byteCharacters = atob(result.base64);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: result.mimeType });
                    
                    setRawRecording(blob);
                    setTrimmedRecording(blob); // Default full
                }
            } catch (e) {
                console.error("Recording error", e);
                showToast("Failed to process recording.", "error");
            }
        } else {
            // Start
            stopAllAudio();
            setRawRecording(null);
            setTrimmedRecording(null);
            try {
                await startRecording();
                setIsLongRecording(true);
                setRecordingDuration(0);
                recordingTimerRef.current = setInterval(() => {
                    setRecordingDuration(prev => prev + 1);
                }, 1000);
            } catch (e) {
                showToast("Could not access microphone.", "error");
            }
        }
    };

    const handleDiscardRecording = () => {
        setRawRecording(null);
        setTrimmedRecording(null);
        setRecordingDuration(0);
        setIsEditing(false);
    };

    const handleSaveRecording = async () => {
        if (!trimmedRecording || !item) return;
        setIsUploading(true);

        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            
            // Determine map name
            let mapName = "Recordings";
            try {
                const mapsRes = await fetch(`${serverUrl}/api/audio/mappings`);
                if (mapsRes.ok) {
                    const maps = await mapsRes.json();
                    const keys = Object.keys(maps);
                    if (keys.length > 0) mapName = keys[0];
                }
            } catch(e) {}
            
            const filename = `rec_${Date.now()}.webm`;
            const formData = new FormData();
            formData.append('mapName', mapName);
            formData.append('filename', filename);
            formData.append('audio', trimmedRecording, filename);

            const uploadRes = await fetch(`${serverUrl}/api/audio/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (uploadRes.ok) {
                const uploadData = await uploadRes.json();
                
                // Estimate duration from recording timer (rough) or let server handle metadata later
                // For simplicity, we use the recorded duration state
                const finalDuration = recordingDuration; 

                const newRecording: UserRecording = {
                    id: `rec-${Date.now()}`,
                    url: `${serverUrl}/api/audio/stream/${mapName}/${filename}`,
                    mapName: mapName,
                    filename: filename,
                    timestamp: Date.now(),
                    duration: finalDuration
                };
                
                // 1. Update LOCAL state immediately
                const updatedRecordings = [newRecording, ...activeRecordings];
                setActiveRecordings(updatedRecordings);

                // 2. Update DB persistence
                const updatedItem = {
                    ...item,
                    userRecordings: updatedRecordings,
                    updatedAt: Date.now()
                };
                setItem(updatedItem);
                await dataStore.saveFreeTalkItem(updatedItem);
                
                showToast("Recording saved!", "success");
                
                // Reset Recording State to allow new recording
                setRawRecording(null);
                setTrimmedRecording(null);
                setRecordingDuration(0);
            } else {
                showToast("Upload failed.", "error");
            }
        } catch (e) {
            console.error("Save error", e);
            showToast("Failed to save recording.", "error");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteRecording = async () => {
        if (!recToDelete || !item) return;
        
        // 1. Delete from Server
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        
        try {
            await fetch(`${serverUrl}/api/audio/file?mapName=${encodeURIComponent(recToDelete.mapName)}&filename=${encodeURIComponent(recToDelete.filename)}`, {
                method: 'DELETE'
            });
        } catch (e) {
            console.warn("Server delete failed, removing local reference anyway.");
        }

        // 2. Update Local State
        const updatedRecordings = activeRecordings.filter(r => r.id !== recToDelete.id);
        setActiveRecordings(updatedRecordings);

        // 3. Update DB
        const updatedItem = {
            ...item,
            userRecordings: updatedRecordings,
            updatedAt: Date.now()
        };
        setItem(updatedItem);
        await dataStore.saveFreeTalkItem(updatedItem);

        showToast("Recording deleted.", "success");
        setRecToDelete(null);
    };

    const handleScriptUpdate = async (index: number, newContent: string) => {
        if (!item) return;
        
        const updatedScriptItems = item.scriptItems ? [...item.scriptItems] : [];
        
        if (updatedScriptItems[index]) {
            updatedScriptItems[index] = {
                ...updatedScriptItems[index],
                content: newContent
            };
            
            const updatedItem = {
                ...item,
                scriptItems: updatedScriptItems,
                updatedAt: Date.now()
            };
            setItem(updatedItem);
            await dataStore.saveFreeTalkItem(updatedItem);
        }
    };

    const handlePlaySegment = (filename: string | undefined, start: number | undefined, duration: number | undefined, textFallback: string) => {
        if (filename && item?.audioLinks) {
            const url = item.audioLinks.find(l => l.endsWith(filename)) || filename;
            playAudio(url, url, null, start, duration);
        } else {
            speak(textFallback);
        }
    };

    // --- Render ---

    if (!isOpen || !item) return null;

    const totalPages = Math.ceil(queue.length / pageSize);
    const pagedItems = queue.slice(page * pageSize, (page + 1) * pageSize);

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl rounded-[3rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh] overflow-hidden relative">
                
                {/* Header Switcher */}
                <div className="px-8 py-4 border-b border-neutral-100 flex items-center justify-between bg-white z-10">
                    <div className="flex bg-neutral-100 p-1 rounded-xl">
                        <button onClick={() => { setMode('MIMIC'); stopAllAudio(); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'MIMIC' ? 'bg-white shadow-sm text-indigo-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                            <LayoutList size={14}/> Mimic
                        </button>
                        <button onClick={() => { setMode('RECORDING'); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'RECORDING' ? 'bg-white shadow-sm text-rose-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                            <Mic2 size={14}/> Essay
                        </button>
                        <button onClick={() => { setMode('PLAYBACK'); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'PLAYBACK' ? 'bg-white shadow-sm text-emerald-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                            <Play size={14}/> Playback
                        </button>
                    </div>
                     <h3 className="text-xs font-black text-neutral-900 truncate max-w-md hidden md:block">{item.title}</h3>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {mode === 'MIMIC' && (
                        <div className="h-full flex">
                             {/* Re-use existing Mimic UI structure but constrained to this container */}
                            <MimicPracticeUI 
                                targetText={target?.text || null}
                                sourceWord={item.title}
                                type="Free Talk"
                                isEmpty={queue.length === 0}
                                isRecording={isRecording}
                                isRevealed={isRevealed}
                                userTranscript={fullTranscript}
                                matchStatus={null}
                                userAudioUrl={userAudioUrl}
                                localAnalysis={localAnalysis}
                                aiAnalysis={null}
                                isAnalyzing={false}
                                onAnalyze={() => {}}
                                ipa={ipa}
                                showIpa={showIpa}
                                isIpaLoading={isIpaLoading}
                                onToggleIpa={handleFetchIpa}
                                onToggleRecord={handleToggleRecordMimic}
                                onPlayTarget={() => target && speak(target.text)}
                                onPlayUser={() => {
                                    if (userAudioUrl) {
                                        const audio = new Audio(`data:audio/webm;base64,${userAudioUrl}`);
                                        audio.play();
                                    }
                                }}
                                onToggleReveal={() => setIsRevealed(!isRevealed)}
                                onNext={() => currentIndex < queue.length - 1 && setCurrentIndex(p => p + 1)}
                                onClearTranscript={() => setFullTranscript('')}
                                onClose={onClose}
                                pagedItems={pagedItems}
                                page={page}
                                pageSize={pageSize}
                                totalPages={totalPages}
                                onPageChange={setPage}
                                onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
                                onSelect={(relIdx) => setCurrentIndex((page * pageSize) + relIdx)}
                                currentAbsoluteIndex={currentIndex}
                                autoSpeak={autoSpeak}
                                onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
                                autoReveal={autoReveal}
                                onToggleAutoReveal={() => setAutoReveal(!autoReveal)}
                                isGlobalMode={true}
                                onAddItem={() => showToast("Editing not available in practice mode", "info")}
                                onEditItem={() => {}}
                                onDeleteItem={() => {}}
                                onRandomize={() => {}}
                                isModalOpen={false}
                                editingItem={null}
                                onCloseModal={() => {}}
                                onSaveItem={() => {}}
                            />
                        </div>
                    )}
                    {mode === 'RECORDING' && (
                        <div className="h-full flex flex-col p-8 overflow-y-auto custom-scrollbar bg-neutral-50/50">
                            {/* CLOSE BUTTON */}
                            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full z-50"><X size={20} /></button>

                            <div className="max-w-5xl mx-auto w-full space-y-6 pb-20">
                                
                                {/* 1. RECORDER / REVIEW - COMPACT REDESIGN */}
                                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden transition-all">
                                    {rawRecording ? (
                                        isEditing ? (
                                            <div className="p-4 flex flex-col gap-4 animate-in fade-in">
                                                {/* Header */}
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Edit Recording</h4>
                                                    <button onClick={() => setIsEditing(false)} className="text-xs font-bold text-neutral-500 hover:text-neutral-800">Cancel</button>
                                                </div>
                                                {/* Trimmer */}
                                                <div className="flex-1 min-h-[10rem]">
                                                    <AudioTrimmer 
                                                        audioBlob={rawRecording} 
                                                        onTrim={(blob) => { setTrimmedRecording(blob); setIsEditing(false); showToast("Trimmed!", "success"); }} 
                                                        onCancel={() => setIsEditing(false)} 
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-3 flex items-center gap-3 animate-in fade-in">
                                                {/* Play/Pause Button */}
                                                <button 
                                                    onClick={() => {
                                                        if (currentPlayingRef === 'preview') {
                                                            stopAllAudio();
                                                        } else {
                                                            const url = URL.createObjectURL(trimmedRecording || rawRecording);
                                                            playAudio(url, 'preview', null);
                                                        }
                                                    }}
                                                    className={`p-2 rounded-full transition-all flex-shrink-0 ${currentPlayingRef === 'preview' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                                                >
                                                    {currentPlayingRef === 'preview' ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                                                </button>

                                                {/* Progress Bar */}
                                                <div className="flex-1 flex items-center gap-2 min-w-0">
                                                     <span className="text-[9px] font-mono font-bold text-neutral-400 w-8 text-right flex-shrink-0">{formatTime(currentPlayingRef === 'preview' ? playbackTime : 0)}</span>
                                                     <input 
                                                        type="range" 
                                                        min="0" 
                                                        max={currentPlayingRef === 'preview' ? playbackDuration : recordingDuration} 
                                                        value={currentPlayingRef === 'preview' ? playbackTime : 0} 
                                                        onChange={handleSeek}
                                                        className="flex-1 h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 min-w-0"
                                                        disabled={currentPlayingRef !== 'preview'}
                                                    />
                                                    <span className="text-[9px] font-mono font-bold text-neutral-400 w-8 text-left flex-shrink-0">{formatTime(currentPlayingRef === 'preview' ? playbackDuration : recordingDuration)}</span>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-1 flex-shrink-0 border-l border-neutral-100 pl-2 ml-1">
                                                    <button onClick={() => setIsEditing(true)} className="p-2 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit">
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button onClick={handleDiscardRecording} className="p-2 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Discard">
                                                        <RotateCcw size={16} />
                                                    </button>
                                                    <button onClick={handleSaveRecording} disabled={isUploading} className="p-2 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Save">
                                                        {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Check size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div className="p-4 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={handleToggleRecordLong}
                                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all transform active:scale-95 shadow-lg ${isLongRecording ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-100' : 'bg-rose-600 text-white hover:bg-rose-700'}`}
                                                >
                                                    {isLongRecording ? <Square size={16} fill="currentColor"/> : <Mic size={20}/>}
                                                </button>
                                                <div>
                                                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                                        {isLongRecording ? 'Recording...' : 'Tap to Record'}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            {/* Visualizer Placeholder or Status */}
                                            {isLongRecording && (
                                                <div className="flex gap-1 h-4 items-end">
                                                    {[...Array(5)].map((_, i) => (
                                                        <div key={i} className="w-1 bg-rose-400 rounded-full animate-bounce" style={{ height: '100%', animationDelay: `${i * 0.1}s` }}></div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 2. SPEECH CONTENT (Script & Notes) */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                                        <BookText size={14}/> Script & Notes
                                    </h4>
                                    
                                    {item.scriptItems && item.scriptItems.length > 0 ? (
                                        <div className="space-y-4">
                                            {item.scriptItems.map((scriptItem, idx) => (
                                                <div 
                                                    key={scriptItem.id || idx} 
                                                    className={`rounded-3xl border shadow-sm transition-all overflow-hidden ${
                                                        scriptItem.type === 'note' 
                                                            ? 'bg-yellow-50/50 border-yellow-100 text-yellow-900 italic relative' 
                                                            : 'bg-white border-neutral-200 text-neutral-800'
                                                    }`}
                                                >
                                                    {scriptItem.type === 'note' && (
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-yellow-300/50"/>
                                                    )}
                                                    
                                                    {scriptItem.type === 'script' ? (
                                                        <InteractiveTranscript 
                                                            rawText={scriptItem.content}
                                                            onUpdate={(newText) => handleScriptUpdate(idx, newText)}
                                                            audioLinks={item.audioLinks || []}
                                                            onPlaySegment={handlePlaySegment}
                                                            showDash={true}
                                                            fontSize="text-xs"
                                                            compact={true}
                                                        />
                                                    ) : (
                                                        <div className="p-4 text-xs font-medium leading-relaxed whitespace-pre-wrap font-mono">
                                                            {scriptItem.content}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm">
                                            <div className="text-xs font-medium text-neutral-800 leading-relaxed whitespace-pre-wrap font-mono">
                                                {item.content}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'PLAYBACK' && (
                        <div className="h-full flex flex-col p-8 overflow-y-auto custom-scrollbar bg-neutral-50/50">
                            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full z-50"><X size={20} /></button>
                            
                            <div className="max-w-5xl mx-auto w-full space-y-8 pb-20">
                                {/* 1. REFERENCE AUDIO */}
                                {item.audioLinks && item.audioLinks.length > 0 && (
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase text-neutral-500 tracking-widest flex items-center gap-2"><FileAudio size={16}/> Reference Audio</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {item.audioLinks.map((url, idx) => {
                                                const isPlaying = currentPlayingRef === url;
                                                return (
                                                    <div key={idx} className={`rounded-2xl border transition-all overflow-hidden ${isPlaying ? 'bg-indigo-50 border-indigo-200 shadow-lg' : 'bg-white border-neutral-200 hover:border-neutral-300'}`}>
                                                        <div className="flex items-center justify-between p-3 gap-3">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <button onClick={() => playAudio(url, url, null)} className={`w-12 h-12 rounded-full transition-all flex-shrink-0 flex items-center justify-center ${isPlaying ? 'bg-indigo-600 text-white shadow-md' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                                                                    {isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                                                                </button>
                                                                 <span className={`text-sm font-bold truncate ${isPlaying ? 'text-indigo-800' : 'text-neutral-800'}`}>
                                                                    {decodeURIComponent(url.split('/').pop() || `Track ${idx + 1}`)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {isPlaying && (
                                                             <div className="flex items-center gap-2 px-4 pb-3 pt-0 animate-in fade-in slide-in-from-top-1">
                                                                <span className="text-xs font-mono font-bold text-neutral-500 w-10 text-right">{formatTime(playbackTime)}</span>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max={playbackDuration || 100} 
                                                                    value={playbackTime} 
                                                                    onChange={handleSeek}
                                                                    className="flex-1 h-1.5 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                />
                                                                <span className="text-xs font-mono font-bold text-neutral-500 w-10 text-left">{formatTime(playbackDuration)}</span>
                                                             </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 2. HISTORY */}
                                <div className="space-y-4">
                                     <h4 className="text-xs font-black uppercase text-neutral-500 tracking-widest flex items-center gap-2"><Calendar size={16}/> Recordings History ({activeRecordings.length})</h4>
                                     {activeRecordings.length === 0 ? (
                                         <div className="text-center py-8 text-neutral-400 italic text-sm">No recordings yet.</div>
                                     ) : (
                                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                             {activeRecordings.map((rec) => {
                                                 const isPlaying = currentPlayingUser === rec.id;
                                                 return (
                                                     <div key={rec.id} className="flex flex-col bg-white rounded-2xl border border-neutral-200 shadow-sm hover:border-neutral-300 transition-colors overflow-hidden">
                                                         <div className="flex items-center justify-between p-3 gap-3">
                                                             <div className="flex items-center gap-3 min-w-0">
                                                                 <button onClick={() => playAudio(rec.url, null, rec.id)} className={`w-12 h-12 rounded-full transition-all flex-shrink-0 flex items-center justify-center ${isPlaying ? 'bg-indigo-600 text-white shadow-md' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                                                                     {isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                                                                 </button>
                                                                 <div className="min-w-0">
                                                                     <p className={`text-sm font-bold truncate ${isPlaying ? 'text-indigo-800' : 'text-neutral-800'}`}>{new Date(rec.timestamp).toLocaleString()}</p>
                                                                     <p className="text-xs font-medium text-neutral-500">{formatTime(rec.duration || 0)}</p>
                                                                 </div>
                                                             </div>
                                                             <button onClick={() => setRecToDelete(rec)} className="p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all flex-shrink-0">
                                                                 <Trash2 size={18} />
                                                             </button>
                                                         </div>
                                                         
                                                         {isPlaying && (
                                                             <div className="flex items-center gap-2 px-4 pb-3 pt-0 animate-in fade-in slide-in-from-top-1 bg-white">
                                                                <span className="text-xs font-mono font-bold text-neutral-500 w-10 text-right">{formatTime(playbackTime)}</span>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max={playbackDuration || 100} 
                                                                    value={playbackTime} 
                                                                    onChange={handleSeek}
                                                                    className="flex-1 h-1.5 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                />
                                                                <span className="text-xs font-mono font-bold text-neutral-500 w-10 text-left">{formatTime(playbackDuration)}</span>
                                                             </div>
                                                         )}
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <ConfirmationModal 
                isOpen={!!recToDelete}
                title="Delete Recording?"
                message="This will permanently delete the audio file from the server."
                confirmText="Delete"
                isProcessing={false}
                onConfirm={handleDeleteRecording}
                onClose={() => setRecToDelete(null)}
                confirmButtonClass="bg-red-600 text-white hover:bg-red-700"
            />
        </div>
    );
};
