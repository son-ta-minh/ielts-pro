
import React, { useState, useEffect, useRef } from 'react';
import { ConversationItem, ConversationSentence } from '../../app/types';
import { speak, stopSpeaking, startRecording, stopRecording } from '../../utils/audio';
import { X, UserCircle, Headphones, Play, Pause, Users, MessageSquare, Mic, Square as SquareIcon, Languages, Target as TargetIcon, LayoutGrid, ChevronsLeft, ChevronLeft, ChevronRight, Loader2, Ear, Download, Sparkles, Info, Volume2 } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally } from '../../utils/speechAnalysis';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../common/ConfirmationModal';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import * as dataStore from '../../app/dataStore';

// --- Helper: WAV Encoder for combining audio ---
function bufferToWav(abuffer: AudioBuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0; // scale
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }
}

interface ConversationPracticeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: ConversationItem | null;
}

export const ConversationPracticeModal: React.FC<ConversationPracticeModalProps> = ({ isOpen, onClose, item }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPlayingAll, setIsPlayingAll] = useState(false);
    const [actingAs, setActingAs] = useState<string | null>(null); // Name of character user is playing
    const [isUserTurn, setIsUserTurn] = useState(false);
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(true); // Default: Focus on current turn
    
    // Role change confirmation state
    const [roleChangeCandidate, setRoleChangeCandidate] = useState<string | null>(null);

    // User recordings state
    const [userRecordings, setUserRecordings] = useState<Record<number, { base64: string, mime: string }>>({});
    // AI audio cache to avoid re-fetching
    const [aiAudioCache, setAiAudioCache] = useState<Record<number, { base64: string, mime: string }>>({});
    
    // Inline recording state
    const [isRecordingUser, setIsRecordingUser] = useState(false);
    const [userTranscript, setUserTranscript] = useState('');
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const [userAudioMime, setUserAudioMime] = useState<string>('audio/webm');
    const [isListeningForStt, setIsListeningForStt] = useState(false);
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    
    // Score tracking
    const sessionScores = useRef<number[]>([]);
    
    // Preview Full Audio State
    const [isPreviewing, setIsPreviewing] = useState(false);

    const [config] = useState(() => getConfig());
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const recognitionManager = useRef(new SpeechRecognitionManager());
    const activeAudioRef = useRef<HTMLAudioElement | null>(null);
    const { showToast } = useToast();

    const stopAllAudio = () => {
        if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            activeAudioRef.current.src = "";
            activeAudioRef.current = null;
        }
        stopSpeaking(); // Browser fallback stop
    };

    // Clear all audio caches when modal closes to save RAM
    const handleClose = async () => {
        stopAllAudio();
        recognitionManager.current.stop();
        
        // Save score if practiced
        if (item && sessionScores.current.length > 0) {
            const avg = Math.round(sessionScores.current.reduce((a, b) => a + b, 0) / sessionScores.current.length);
            await dataStore.saveConversationItem({
                ...item,
                bestScore: avg,
                updatedAt: Date.now()
            });
        }
        
        // Clear caches
        setAiAudioCache({});
        setUserRecordings({});
        setUserAudioUrl(null);
        sessionScores.current = [];
        onClose();
    };

    // Autoplay & Turn Management Logic
    useEffect(() => {
        if (!(isPlaying || isPlayingAll) || !item) return;
        
        let isCancelled = false;

        const runCurrentItem = async () => {
            if (currentIndex >= item.sentences.length || isCancelled) return;
            
            const s = item.sentences[currentIndex];
            
            // 1. CHECK IF USER TURN (Skip check if isPlayingAll is active)
            if (!isPlayingAll && actingAs && s.speakerName === actingAs) {
                setIsPlaying(false);
                setIsUserTurn(true);
                return;
            }

            // 2. CHECK FOR USER SOUND (Priority in Play All mode)
            const userAudioData = userRecordings[currentIndex];
            if (userAudioData && isPlayingAll) {
                stopAllAudio();
                await new Promise((resolve) => {
                    const audio = new Audio(`data:${userAudioData.mime};base64,${userAudioData.base64}`);
                    activeAudioRef.current = audio;
                    audio.onended = () => resolve(true);
                    audio.onerror = () => resolve(false);
                    audio.play().catch(() => resolve(false));
                    
                    if (isCancelled) {
                        audio.pause();
                        resolve(false);
                    }
                });
            } else {
                // 3. AI Speaker Logic with Cache Check
                const cachedAiAudio = aiAudioCache[currentIndex];
                if (cachedAiAudio) {
                    stopAllAudio();
                    await new Promise((resolve) => {
                        const audio = new Audio(`data:${cachedAiAudio.mime};base64,${cachedAiAudio.base64}`);
                        activeAudioRef.current = audio;
                        audio.onended = () => resolve(true);
                        audio.onerror = () => resolve(false);
                        audio.play().catch(() => resolve(false));

                        if (isCancelled) {
                            audio.pause();
                            resolve(false);
                        }
                    });
                } else {
                    // FETCH AND CACHE
                    const sp = item.speakers.find(src => src.name === s.speakerName);
                    let voice = sp?.voiceName;
                    let accent = sp?.accentCode;

                    if (!voice) {
                        const activeType = sp?.sex === 'male' ? 'male' : 'female';
                        const coach = config.audioCoach.coaches[activeType];
                        voice = coach.enVoice;
                        accent = coach.enAccent;
                    }

                    try {
                        const serverUrl = getServerUrl(config);
                        const payload = { text: s.text, language: 'en', accent, voice };
                        const res = await fetch(`${serverUrl}/speak`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        if (res.ok) {
                            const blob = await res.blob();
                            const reader = new FileReader();
                            const base64Promise = new Promise<string>((resolve) => {
                                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                            });
                            reader.readAsDataURL(blob);
                            const base64 = await base64Promise;
                            const mime = res.headers.get('Content-Type') || 'audio/aiff';

                            setAiAudioCache(prev => ({ ...prev, [currentIndex]: { base64, mime } }));
                            
                            if (!isCancelled) {
                                stopAllAudio();
                                const audio = new Audio(`data:${mime};base64,${base64}`);
                                activeAudioRef.current = audio;
                                await new Promise((resolve) => {
                                    audio.onended = () => resolve(true);
                                    audio.onerror = () => resolve(false);
                                    audio.play().catch(() => resolve(false));
                                    
                                    if (isCancelled) {
                                        audio.pause();
                                        resolve(false);
                                    }
                                });
                            }
                        } else {
                            // Fallback to browser speak if server fails
                            await speak(s.text, true, 'en', voice, accent);
                        }
                    } catch (e) {
                        console.error("Playback error", e);
                    }
                }
            }

            if (!isCancelled && (isPlaying || isPlayingAll)) {
                if (currentIndex < item.sentences.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                } else {
                    setIsPlaying(false);
                    setIsPlayingAll(false);
                }
            }
        };

        runCurrentItem();
        return () => { isCancelled = true; };
    }, [isPlaying, isPlayingAll, currentIndex, item, actingAs]);

    // Auto-scroll logic
    useEffect(() => {
        const activeEl = itemRefs.current[currentIndex];
        if (activeEl && scrollContainerRef.current) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentIndex, isPlaying, isPlayingAll, isUserTurn, isFocusMode]);
    
    // --- ROLE CHANGE LOGIC WITH CONFIRMATION ---
    const hasProgress = currentIndex > 0 || Object.keys(userRecordings).length > 0;

    const requestRoleChange = (role: string | null) => {
        if (hasProgress) {
            setRoleChangeCandidate(role); // Triggers Modal
        } else {
            // Apply immediately if fresh start
            confirmRoleChange(role);
        }
    };

    const confirmRoleChange = (role: string | null) => {
        // Reset everything
        stopAllAudio();
        setIsPlaying(false);
        setIsPlayingAll(false);
        setIsUserTurn(false);
        setCurrentIndex(0);
        setUserRecordings({}); 
        sessionScores.current = [];
        // We keep AI cache as that is expensive/slow to re-fetch
        
        setActingAs(role);
        setRoleChangeCandidate(null); // Close modal if open via state
        
        // If switching to spectator, we might want to auto-play or just reset.
        // Let's just reset and let user decide.
        if (role) {
             showToast(`Role changed to ${role}. Practice reset.`, 'info');
        } else {
             showToast("Role changed to Spectator. Practice reset.", 'info');
        }
    };

    if (!isOpen || !item || !item.sentences || item.sentences.length === 0) return null;

    const sentences = item.sentences;
    const activeSentence = sentences[currentIndex];
    
    // --- NAVIGATION HANDLERS ---
    const handleNavFirst = () => {
        stopAllAudio();
        setIsUserTurn(false);
        setCurrentIndex(0);
    };

    const handleNavPrev = () => {
        if (currentIndex > 0) {
            stopAllAudio();
            setIsUserTurn(false);
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleNavNext = () => {
        if (currentIndex < sentences.length - 1) {
            stopAllAudio();
            setIsUserTurn(false);
            setCurrentIndex(prev => prev + 1);
        }
    };
    
    // --- USER INTERACTION HANDLERS ---
    
    const handleToggleRecording = async () => {
        if (isRecordingUser) {
            recognitionManager.current.stop();
            setIsListeningForStt(false);
            const result = await stopRecording();
            if (result) {
                setUserAudioUrl(result.base64);
                setUserAudioMime(result.mimeType);
            }
            setIsRecordingUser(false);
        } else {
            stopAllAudio(); 
            setUserTranscript('');
            setUserAudioUrl(null);
            try {
                await startRecording();
                setIsRecordingUser(true);
                setIsListeningForStt(true);
                recognitionManager.current.start(
                    (final, interim) => setUserTranscript(final + interim),
                    (finalTranscript) => setUserTranscript(finalTranscript)
                );
            } catch (e) {
                console.error("Failed to start recording", e);
                setIsRecordingUser(false);
            }
        }
    };

    const handlePlayUserAudio = (index?: number) => {
        const audioData = index !== undefined ? userRecordings[index] : (userAudioUrl ? { base64: userAudioUrl, mime: userAudioMime } : null);
        if (audioData) {
            stopAllAudio();
            const audio = new Audio(`data:${audioData.mime};base64,${audioData.base64}`);
            activeAudioRef.current = audio;
            audio.play();
        }
    };

    const handleConfirmUserTurn = () => {
        if (userAudioUrl) {
            setUserRecordings(prev => ({ ...prev, [currentIndex]: { base64: userAudioUrl, mime: userAudioMime } }));
            // Analyze and score
            if (activeSentence) {
                const result = analyzeSpeechLocally(activeSentence.text, userTranscript);
                sessionScores.current.push(result.score);
            }
        }
        
        setIsUserTurn(false);
        setUserTranscript('');
        setUserAudioUrl(null);
        if (currentIndex < sentences.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setIsPlaying(true);
        } else {
            setIsPlaying(false);
        }
    };

    const handleSpeakAiSentence = async (s: ConversationSentence, idx: number) => {
        stopAllAudio();
        const cached = aiAudioCache[idx];
        if (cached) {
            const audio = new Audio(`data:${cached.mime};base64,${cached.base64}`);
            activeAudioRef.current = audio;
            audio.play();
            return;
        }

        const sp = item.speakers.find(src => src.name === s.speakerName);
        let voice = sp?.voiceName;
        let accent = sp?.accentCode;

        if (!voice) {
            const activeType = sp?.sex === 'male' ? 'male' : 'female';
            const coach = config.audioCoach.coaches[activeType];
            voice = coach.enVoice;
            accent = coach.enAccent;
        }

        const serverUrl = getServerUrl(config);
        const payload = { text: s.text, language: 'en', accent, voice };
        try {
            const res = await fetch(`${serverUrl}/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const blob = await res.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    const mime = res.headers.get('Content-Type') || 'audio/aiff';
                    setAiAudioCache(prev => ({ ...prev, [idx]: { base64, mime } }));
                };
                reader.readAsDataURL(blob);
                const audio = new Audio(URL.createObjectURL(blob));
                activeAudioRef.current = audio;
                audio.play();
            } else {
                speak(s.text, false, 'en', voice, accent);
            }
        } catch (e) {
            speak(s.text, false, 'en', voice, accent);
        }
    };

    const handleToggleFullPlayback = () => {
        if (isPlayingAll) {
            setIsPlayingAll(false);
            stopAllAudio();
        } else {
            stopAllAudio();
            setIsPlaying(false);
            setIsUserTurn(false);
            setIsPlayingAll(true);
            setCurrentIndex(0);
        }
    };

    // Shared logic for generating full audio buffer
    const generateFullAudioBuffer = async () => {
         const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
         const segments: AudioBuffer[] = [];
         let hasContent = false;

         for (let i = 0; i < item.sentences.length; i++) {
             const userRec = userRecordings[i];
             const aiRec = aiAudioCache[i];
             
             const data = userRec || aiRec;
             if (!data) continue; 
             hasContent = true;

             const binaryString = atob(data.base64);
             const bytes = new Uint8Array(binaryString.length);
             for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
             
             try {
                 const decodedBuffer = await audioCtx.decodeAudioData(bytes.buffer);
                 segments.push(decodedBuffer);
             } catch (e) {
                 console.warn(`Failed to decode segment ${i}`, e);
             }
         }

         if (!hasContent || segments.length === 0) return null;

         const totalLength = segments.reduce((sum, buf) => sum + buf.length, 0);
         const combinedBuffer = audioCtx.createBuffer(
             segments[0].numberOfChannels,
             totalLength,
             segments[0].sampleRate
         );

         let offset = 0;
         segments.forEach(buf => {
             for (let channel = 0; channel < buf.numberOfChannels; channel++) {
                 combinedBuffer.getChannelData(channel).set(buf.getChannelData(channel), offset);
             }
             offset += buf.length;
         });
         
         return combinedBuffer;
    };

    const handlePreviewFullAudio = async () => {
        if (isPreviewing) return;
        setIsPreviewing(true);
        stopAllAudio();

        try {
            const buffer = await generateFullAudioBuffer();
            if (!buffer) {
                showToast("No audio segments available to play.", "info");
                setIsPreviewing(false);
                return;
            }

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.onended = () => setIsPreviewing(false);
            source.start(0);

            // Store ref to stop if needed (not activeAudioRef as it's an Audio Element, but close enough concept)
            // Ideally we'd store source node, but simplest is just let it play out or stop via context if implemented.
            // For now, simple play.

        } catch (e) {
            console.error("Preview failed", e);
            showToast("Failed to preview audio.", "error");
            setIsPreviewing(false);
        }
    };

    const handleSaveAll = async () => {
        if (isSavingAll) return;
        setIsSavingAll(true);
        showToast("Generating full audio file...", "info");

        try {
            const combinedBuffer = await generateFullAudioBuffer();
            
            if (!combinedBuffer) {
                showToast("No audio segments available to save.", "info");
                setIsSavingAll(false);
                return;
            }

            const wavBlob = bufferToWav(combinedBuffer);
            const url = URL.createObjectURL(wavBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Full_Dialogue_${item.title.replace(/\s+/g, '_')}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast("Audio file saved!", "success");
        } catch (e) {
            console.error("Save All failed", e);
            showToast("Error generating audio file.", "error");
        } finally {
            setIsSavingAll(false);
        }
    };

    const hasAnyRecordings = Object.keys(userRecordings).length > 0 || Object.keys(aiAudioCache).length > 0;

    // Filter list to only show current sentence when practicing if focus mode is on
    const visibleSentences = isFocusMode 
        ? [sentences[currentIndex]] 
        : sentences;

    const handleSaveScore = (score: number) => {
        sessionScores.current.push(score);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh] overflow-hidden">
                <header className="px-4 sm:px-8 py-4 sm:py-6 border-b border-neutral-100 flex flex-col sm:flex-row gap-4 sm:gap-0 sm:justify-between sm:items-center shrink-0 bg-white z-10">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-black text-neutral-900 tracking-tight leading-none">{item.title}</h3>
                        <div className="flex items-center gap-3">
                             <div className="flex items-center gap-1 text-[9px] font-black uppercase text-neutral-400">
                                <UserCircle size={10}/> Role Play:
                             </div>
                             <div className="flex bg-neutral-100 p-0.5 rounded-lg">
                                <button onClick={() => requestRoleChange(null)} className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${!actingAs && !isPlayingAll ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>Spectator</button>
                                {item.speakers.map(s => (
                                    <button key={s.name} onClick={() => requestRoleChange(s.name)} className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${actingAs === s.name ? 'bg-indigo-600 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>Act as {s.name}</button>
                                ))}
                             </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex bg-neutral-100 p-1 rounded-xl gap-1">
                            <button onClick={handleToggleFullPlayback} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${isPlayingAll ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-900'}`} title="Play whole conversation non-stop">
                                <Headphones size={14} /> 
                                {isPlayingAll ? 'Stop' : 'Play All'}
                            </button>
                            {!isPlayingAll && (
                                <>
                                    <button onClick={() => { stopAllAudio(); setIsPlaying(true); setIsPlayingAll(false); }} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${isPlaying ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-700'}`}><Play size={14} fill="currentColor"/> Play</button>
                                    <button onClick={() => { setIsPlaying(false); stopAllAudio(); }} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${!isPlaying ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-900'}`}><Pause size={14} fill="currentColor"/> Pause</button>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={handleClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                    </div>
                </header>

                <div className="bg-neutral-50/50 py-6 px-8 border-b border-neutral-100 shrink-0">
                    <div className="flex justify-center items-end gap-10 md:gap-20">
                        {item.speakers.map((s, idx) => {
                            const isTalking = activeSentence.speakerName === s.name;
                            const isUser = actingAs === s.name;
                            return (
                                <div key={idx} className="flex flex-col items-center relative group">
                                    {isTalking && (
                                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-3 py-1.5 rounded-xl text-lg animate-bounce shadow-xl whitespace-nowrap z-20">
                                            {activeSentence.icon || '💬'}
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 rotate-45"></div>
                                        </div>
                                    )}
                                    
                                    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-3xl md:text-4xl transition-all duration-300 ${isTalking ? 'bg-white scale-110 shadow-2xl ring-4 ring-indigo-500/20' : 'bg-neutral-200/50 grayscale opacity-40'} ${isUser ? 'border-2 border-indigo-500' : ''}`}>
                                        {s.sex === 'male' ? '👨' : '👩'}
                                    </div>
                                    <div className={`mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors ${isTalking ? 'bg-neutral-900 text-white' : 'text-neutral-400 bg-neutral-100'} ${isUser ? 'ring-1 ring-indigo-500' : ''}`}>
                                        {isUser ? 'YOU' : s.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                {/* TOOLBAR: Mode & Navigation */}
                <div className="px-6 py-2 bg-white border-b border-neutral-100 flex items-center justify-between">
                    {/* Display Mode Toggle */}
                    <div className="flex bg-neutral-100 p-1 rounded-lg gap-1">
                        <button 
                            onClick={() => setIsFocusMode(true)} 
                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5 transition-all ${isFocusMode ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                            title="Show current turn only"
                        >
                            <TargetIcon size={12} /> Focus
                        </button>
                        <button 
                            onClick={() => setIsFocusMode(false)} 
                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5 transition-all ${!isFocusMode ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                            title="Show full script"
                        >
                            <LayoutGrid size={12} /> Script
                        </button>
                    </div>

                    {/* Manual Navigation - Only visible in Focus Mode */}
                    {isFocusMode && (
                        <div className="flex items-center gap-1 bg-neutral-50 p-1 rounded-lg border border-neutral-100 animate-in fade-in slide-in-from-right-2">
                             <button onClick={handleNavFirst} disabled={currentIndex === 0 || isUserTurn} className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all rounded hover:bg-white"><ChevronsLeft size={16}/></button>
                             <div className="w-px h-4 bg-neutral-200"></div>
                             <button onClick={handleNavPrev} disabled={currentIndex === 0 || isUserTurn} className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all rounded hover:bg-white"><ChevronLeft size={16}/></button>
                             <button onClick={handleNavNext} disabled={currentIndex === sentences.length - 1 || isUserTurn} className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all rounded hover:bg-white"><ChevronRight size={16}/></button>
                        </div>
                    )}
                </div>

                <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-4 custom-scrollbar bg-white scroll-smooth pb-48 sm:pb-32">
                    {visibleSentences.map((s, i) => {
                        const actualIndex = isFocusMode ? currentIndex : i;
                        const isCurrent = isFocusMode ? true : i === currentIndex;
                        const isUserRole = actingAs === s.speakerName;
                        const sp = item.speakers.find(src => src.name === s.speakerName);
                        const isMale = sp?.sex === 'male';
                        const hasUserRecording = userRecordings[actualIndex] !== undefined;

                        const needsToAct = isUserTurn && actualIndex === currentIndex;

                        return (
                            <div 
                                key={`${actualIndex}-${i}`} 
                                ref={el => { if (isCurrent) itemRefs.current[actualIndex] = el; }}
                                onClick={() => { if (!isPlaying && !isPlayingAll && !isUserTurn && !isFocusMode) { setCurrentIndex(i); stopAllAudio(); } }} 
                                className={`flex items-start gap-4 p-4 rounded-[2rem] transition-all border-2 ${isCurrent ? 'bg-indigo-50/30 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-neutral-50'} ${isPlaying || isPlayingAll || isUserTurn || isFocusMode ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-xl shadow-sm ${isMale ? 'bg-blue-100' : 'bg-pink-100'} ${isCurrent ? 'scale-110 ring-2 ring-white' : ''}`}>
                                    {isUserRole ? '🌟' : (s.icon || (isMale ? '👨' : '👩'))}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isCurrent ? 'text-indigo-600' : 'text-neutral-400'}`}>
                                            {isUserRole ? `YOU (as ${s.speakerName})` : s.speakerName}
                                        </span>
                                        
                                        <div className="flex items-center gap-1">
                                            {hasUserRecording && (
                                                <button onClick={(e) => { e.stopPropagation(); handlePlayUserAudio(actualIndex); }} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all" title="Listen back to your attempt">
                                                    <Mic size={14}/>
                                                </button>
                                            )}

                                            {isCurrent && !isPlaying && !isPlayingAll && !isUserTurn && (
                                                <div className="flex items-center gap-2 animate-in fade-in zoom-in-95">
                                                    <button onClick={(e) => { e.stopPropagation(); handleSpeakAiSentence(s, actualIndex); }} className="p-2 bg-neutral-900 text-white rounded-xl hover:scale-105 transition-transform"><Volume2 size={14}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setMimicTarget(s.text); }} className="p-2 bg-rose-500 text-white rounded-xl hover:scale-105 transition-transform"><Mic size={14}/></button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <p className={`text-sm md:text-lg leading-relaxed font-bold transition-colors ${isCurrent ? 'text-neutral-900' : 'text-neutral-500'}`}>
                                        {s.text}
                                    </p>

                                    {needsToAct && (
                                        <div className="mt-4 p-6 bg-white border-2 border-indigo-500 rounded-[2rem] shadow-xl animate-in zoom-in-95 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-indigo-600">
                                                    <Languages size={18}/>
                                                    <span className="text-xs font-black uppercase tracking-widest">Your Turn to Speak</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleSpeakAiSentence(s, actualIndex)} className="p-2 bg-neutral-100 text-neutral-600 rounded-lg hover:text-neutral-900 transition-all" title="Listen to Model">
                                                        <Volume2 size={16}/>
                                                    </button>
                                                    {isListeningForStt && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span>}
                                                </div>
                                            </div>

                                            <div className="min-h-[60px] p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex flex-col items-center justify-center text-center">
                                                {userTranscript ? (
                                                    <p className="text-sm font-medium italic text-neutral-800 leading-relaxed">"{userTranscript}"</p>
                                                ) : (
                                                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Tap mic and read the sentence aloud</p>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-center gap-4">
                                                <button 
                                                    onClick={handleToggleRecording} 
                                                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all transform active:scale-90 ${isRecordingUser ? 'bg-red-500 text-white animate-pulse ring-8 ring-red-100' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
                                                >
                                                    {isRecordingUser ? <SquareIcon size={24} fill="white" /> : <Mic size={24} />}
                                                </button>
                                                
                                                {userAudioUrl && (
                                                    <button onClick={() => handlePlayUserAudio()} className="p-4 bg-white border border-neutral-200 text-neutral-600 rounded-2xl hover:text-indigo-600 hover:border-indigo-300 transition-all">
                                                        <Play size={20} fill="currentColor"/>
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={handleConfirmUserTurn} 
                                                    disabled={isRecordingUser}
                                                    className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                                                >
                                                    Confirm & Continue
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </main>
                
                <footer className="px-4 sm:px-8 py-4 sm:py-6 border-t border-neutral-100 bg-white/80 backdrop-blur-md flex flex-col sm:flex-row gap-4 sm:gap-0 sm:justify-between sm:items-center shrink-0 absolute bottom-0 left-0 right-0 z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={handleNavPrev} disabled={currentIndex === 0 || isUserTurn} className="p-3 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all"><ChevronLeft size={20}/></button>
                        <div className="flex flex-col items-center min-w-[80px]">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-1">Sentence</span>
                            <span className="text-sm font-black text-neutral-900">{currentIndex + 1} / {sentences.length}</span>
                        </div>
                        <button onClick={handleNavNext} disabled={currentIndex === sentences.length - 1 || isUserTurn} className="p-3 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all"><ChevronRight size={20}/></button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
                         {isPlayingAll ? (
                             <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-2xl shadow-lg animate-in fade-in">
                                <Headphones size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Full Playback Mode</span>
                             </div>
                         ) : isUserTurn ? (
                             <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in slide-in-from-right-2">
                                <Sparkles size={14} className="text-indigo-600" />
                                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Waiting for User</span>
                             </div>
                         ) : !isPlaying && (
                             <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-neutral-50 rounded-2xl border border-indigo-100 animate-in fade-in">
                                <Info size={14} className="text-neutral-400" />
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Manual Mode Active</span>
                             </div>
                         )}
                         
                         <button 
                             onClick={handlePreviewFullAudio}
                             disabled={isPreviewing || !hasAnyRecordings}
                             className={`px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50 ${isPreviewing ? 'bg-amber-100 text-amber-700' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                             title="Listen to full audio without downloading"
                         >
                             {isPreviewing ? <Loader2 size={14} className="animate-spin" /> : <Ear size={14}/>}
                             <span className="hidden sm:inline">{isPreviewing ? 'Playing...' : 'Listen Full'}</span>
                         </button>

                         <button 
                            onClick={handleSaveAll}
                            disabled={isSavingAll || !hasAnyRecordings}
                            className="px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            title="Save all audio (User & AI) to one file"
                         >
                            {isSavingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14}/>}
                            <span className="hidden sm:inline">Save All</span>
                         </button>

                         <button onClick={handleClose} className="px-8 py-3 bg-neutral-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg active:scale-95">Finish Session</button>
                    </div>
                </footer>
            </div>
            {mimicTarget && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} onSaveScore={handleSaveScore} />}
            
            <ConfirmationModal
                 isOpen={!!roleChangeCandidate}
                 title="Switch Role?"
                 message="Changing roles will reset your current practice progress. Recordings will be lost."
                 confirmText="Switch & Reset"
                 isProcessing={false}
                 onConfirm={() => confirmRoleChange(roleChangeCandidate)}
                 onClose={() => setRoleChangeCandidate(null)}
            />
        </div>
    );
};
