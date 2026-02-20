
import { InteractiveTranscript } from '../common/InteractiveTranscript';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FreeTalkItem, UserRecording, VocabularyItem } from '../../app/types';
import { TargetPhrase } from '../labs/MimicPractice';
import { MimicPracticeUI } from '../labs/MimicPractice_UI';
import { startRecording, stopRecording, speak, stopSpeaking } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult } from '../../utils/speechAnalysis';
import * as dataStore from '../../app/dataStore';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { Mic, Play, Square, Pause, Save, Upload, Trash2, Calendar, FileAudio, LayoutList, Mic2, X, BookText, Loader2, RotateCcw, Check } from 'lucide-react';
import ConfirmationModal from '../common/ConfirmationModal';
import { AudioTrimmer } from '../common/AudioTrimmer';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    item: FreeTalkItem | null;
}

type PracticeMode = 'MIMIC' | 'RECORDING';

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
        }
    };

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
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh] overflow-hidden relative">
                
                {/* Header Switcher */}
                <div className="px-8 py-4 border-b border-neutral-100 flex items-center justify-between bg-white z-10">
                    <div className="flex bg-neutral-100 p-1 rounded-xl">
                        <button onClick={() => { setMode('MIMIC'); stopAllAudio(); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'MIMIC' ? 'bg-white shadow-sm text-indigo-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                            <LayoutList size={14}/> Mimic
                        </button>
                        <button onClick={() => { setMode('RECORDING'); stopAllAudio(); }} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'RECORDING' ? 'bg-white shadow-sm text-rose-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                            <Mic2 size={14}/> Recording
                        </button>
                    </div>
                     <h3 className="text-sm font-black text-neutral-900 truncate max-w-md hidden md:block">{item.title}</h3>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {mode === 'MIMIC' ? (
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
                    ) : (
                        <div className="h-full flex flex-col p-8 overflow-y-auto custom-scrollbar bg-neutral-50/50">
                            {/* CLOSE BUTTON */}
                            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full z-50"><X size={20} /></button>

                            <div className="max-w-2xl mx-auto w-full space-y-6 pb-20">
                                
                                {/* 1. RECORDER / REVIEW - COMPACT REDESIGN */}
                                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden transition-all">
                                    {rawRecording ? (
                                        <div className="p-4 flex flex-col gap-4 animate-in fade-in">
                                            {/* Header */}
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-black uppercase text-neutral-400 tracking-widest">Review</h4>
                                                <span className="text-xs font-bold text-neutral-500">{formatTime(recordingDuration)}</span>
                                            </div>
                                            {/* Trimmer */}
                                            <div className="flex-1 min-h-[10rem]">
                                                <AudioTrimmer 
                                                    audioBlob={rawRecording} 
                                                    onTrim={(blob) => { setTrimmedRecording(blob); showToast("Trimmed!", "success"); }} 
                                                    onCancel={() => {}} 
                                                />
                                            </div>
                                            {/* Footer Buttons */}
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={handleDiscardRecording} 
                                                    className="p-3 text-neutral-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                    title="Discard"
                                                >
                                                    <RotateCcw size={18}/>
                                                </button>
                                                <button 
                                                    onClick={handleSaveRecording} 
                                                    disabled={isUploading}
                                                    className="px-4 py-3 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-neutral-800 transition-all shadow-lg flex items-center gap-2"
                                                >
                                                    {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>}
                                                    <span className="hidden sm:inline">{isUploading ? 'Saving...' : 'Save'}</span>
                                                </button>
                                            </div>
                                        </div>
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
                                                    <p className={`text-lg font-black font-mono tracking-widest leading-none ${isLongRecording ? 'text-rose-600' : 'text-neutral-800'}`}>
                                                        {formatTime(recordingDuration)}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-1">
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
                                    <h4 className="text-xs font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
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
                                                        />
                                                    ) : (
                                                        <div className="p-6 text-lg font-medium leading-relaxed whitespace-pre-wrap">
                                                            {scriptItem.content}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
                                            <div className="text-lg font-medium text-neutral-800 leading-relaxed whitespace-pre-wrap">
                                                {item.content}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {/* 3. REFERENCE AUDIO */}
                                {item.audioLinks && item.audioLinks.length > 0 && (
                                    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
                                        <h4 className="text-xs font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2"><FileAudio size={14}/> Reference Audio</h4>
                                        <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                                            {item.audioLinks.map((url, idx) => {
                                                const isPlaying = currentPlayingRef === url;
                                                return (
                                                    <div key={idx}>
                                                        <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isPlaying ? 'bg-indigo-50 border-indigo-100' : 'bg-neutral-50 border-neutral-100'}`}>
                                                            <span className={`text-xs font-bold truncate max-w-[200px] ${isPlaying ? 'text-indigo-700' : 'text-neutral-600'}`}>
                                                                {decodeURIComponent(url.split('/').pop() || `Track ${idx + 1}`)}
                                                            </span>
                                                            <button onClick={() => playAudio(url, url, null)} className={`p-2 rounded-full transition-all ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50'}`}>
                                                                {isPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                                                            </button>
                                                        </div>
                                                        {isPlaying && (
                                                             <div className="flex items-center gap-3 px-2 pt-2 animate-in fade-in slide-in-from-top-1">
                                                                <span className="text-[10px] font-mono font-bold text-neutral-400 w-8 text-right">{formatTime(playbackTime)}</span>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max={playbackDuration || 100} 
                                                                    value={playbackTime} 
                                                                    onChange={handleSeek}
                                                                    className="flex-1 h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                />
                                                                <span className="text-[10px] font-mono font-bold text-neutral-400 w-8 text-left">{formatTime(playbackDuration)}</span>
                                                             </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 4. HISTORY */}
                                <div className="space-y-4">
                                     <h4 className="text-xs font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2"><Calendar size={14}/> Recordings History ({activeRecordings.length})</h4>
                                     {activeRecordings.length === 0 ? (
                                         <div className="text-center py-8 text-neutral-300 italic text-xs">No recordings yet.</div>
                                     ) : (
                                         <div className="grid gap-3">
                                             {activeRecordings.map((rec) => {
                                                 const isPlaying = currentPlayingUser === rec.id;
                                                 return (
                                                     <div key={rec.id} className="flex flex-col bg-white rounded-2xl border border-neutral-200 shadow-sm hover:border-neutral-300 transition-colors overflow-hidden">
                                                         <div className="flex items-center justify-between p-4">
                                                             <div className="flex items-center gap-3">
                                                                 <button onClick={() => playAudio(rec.url, null, rec.id)} className={`p-3 rounded-full transition-all ${isPlaying ? 'bg-indigo-600 text-white shadow-md' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                                                                     {isPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                                                                 </button>
                                                                 <div>
                                                                     <p className="text-xs font-bold text-neutral-800">{new Date(rec.timestamp).toLocaleString()}</p>
                                                                     <p className="text-[10px] font-medium text-neutral-400">{formatTime(rec.duration || 0)}</p>
                                                                 </div>
                                                             </div>
                                                             <button onClick={() => setRecToDelete(rec)} className="p-2 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                                                 <Trash2 size={16} />
                                                             </button>
                                                         </div>
                                                         
                                                         {isPlaying && (
                                                             <div className="px-4 pb-4 pt-0 flex items-center gap-3 animate-in fade-in slide-in-from-top-1 bg-white">
                                                                <span className="text-[10px] font-mono font-bold text-neutral-400 w-8 text-right">{formatTime(playbackTime)}</span>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max={playbackDuration || 100} 
                                                                    value={playbackTime} 
                                                                    onChange={handleSeek}
                                                                    className="flex-1 h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                />
                                                                <span className="text-[10px] font-mono font-bold text-neutral-400 w-8 text-left">{formatTime(playbackDuration)}</span>
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
