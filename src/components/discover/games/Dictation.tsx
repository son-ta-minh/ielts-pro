import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Play, Keyboard, Server, Book, Loader2, Brain, Check, Volume2, Zap } from 'lucide-react';
import { VocabularyItem } from '../../../app/types';
import { speak, stopSpeaking, fetchServerVoices, VoiceDefinition } from '../../../utils/audio';
import { getConfig, getServerUrl } from '../../../app/settingsManager';
import { useToast } from '../../../contexts/ToastContext';
import { getStoredJSON, setStoredJSON } from '../../../utils/storage';

interface Props {
    words: VocabularyItem[];
    onComplete: (score: number) => void;
    onExit: () => void;
}

type Difficulty = 'EASY' | 'HARD';
type ContentSource = 'LIBRARY' | 'SERVER';

interface DictationItem {
    id: string;
    originalSentence: string;
    tokenized: { text: string; isMasked: boolean; }[];
    mode: Difficulty;
    voice?: string; // Specific voice assigned to this item
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// Improved Speech Formatting
// 1. Times (9:30:15) -> "9 30 15" (Read naturally as numbers)
// 2. Years/4-digits (1995) -> "19 95" (Read as pairs)
// 3. Other numbers -> "d i g i t s" (Read individually)
const formatForSpeech = (text: string): string => {
    return text.replace(/(\d{1,2}:\d{2}(?::\d{2})?)|(\b\d{4}\b)|(\d+)/g, (match, time, year, number) => {
        if (time) {
            // Time: Replace colons with spaces
            return time.replace(/:/g, ' ');
        }
        if (year) {
            // Year: Split into two pairs
            return `${year.slice(0, 2)} ${year.slice(2)}`;
        }
        if (number) {
            // Other numbers: Space out digits
            return number.split('').join(' ');
        }
        return match;
    });
};

export const Dictation: React.FC<Props> = ({ words, onComplete, onExit }) => {
    // Setup State
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [sessionSize, setSessionSize] = useState(10);
    const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
    const [contentSource, setContentSource] = useState<ContentSource>('LIBRARY');
    const [isServerLoading, setIsServerLoading] = useState(false);
    
    // Voice State
    const [availableVoices, setAvailableVoices] = useState<VoiceDefinition[]>([]);
    
    // Persistent Settings
    const [selectedVoices, setSelectedVoices] = useState<Set<string>>(() => {
        const saved = getStoredJSON<string[]>('dictation_selected_voices', ['System']);
        return new Set(saved);
    });
    const [hoverPreview, setHoverPreview] = useState(() => getStoredJSON<boolean>('dictation_hover_preview', true));

    // Gameplay State
    const [queue, setQueue] = useState<DictationItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    
    // Current Input State
    const [userInputs, setUserInputs] = useState<Record<number, string>>({}); // index -> value
    const [hardInput, setHardInput] = useState('');
    const [isChecked, setIsChecked] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);

    // Refs
    const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const { showToast } = useToast();

    // Persist settings
    useEffect(() => {
        setStoredJSON('dictation_selected_voices', Array.from(selectedVoices));
    }, [selectedVoices]);

    useEffect(() => {
        setStoredJSON('dictation_hover_preview', hoverPreview);
    }, [hoverPreview]);

    // Cleanup audio on unmount & Load Voices
    useEffect(() => {
        const loadVoices = async () => {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            try {
                const response = await fetchServerVoices(serverUrl);
                if (response && response.voices) {
                    // Filter for English voices (System + High Quality only)
                    const enVoices = response.voices.filter(v => 
                        v.language === 'en' && 
                        (v.name.includes('Premium') || v.name.includes('Enhanced'))
                    );
                    setAvailableVoices(enVoices);
                }
            } catch (e) {
                console.warn("Could not load server voices", e);
            }
        };
        loadVoices();

        return () => {
            stopSpeaking();
        };
    }, []);

    // Enforce HARD mode for 'SERVER' (Phrase) source
    useEffect(() => {
        if (contentSource === 'SERVER') {
            setDifficulty('HARD');
        }
    }, [contentSource]);

    // Helper: Fetch random lines from server folder
    const fetchServerData = async (limit: number): Promise<string[]> => {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const mapName = 'Dictation';

        try {
            const listRes = await fetch(`${serverUrl}/api/reading/files/${mapName}`);
            if (!listRes.ok) throw new Error("Could not access 'Dictation' folder on server.");
            
            const listData = await listRes.json();
            const textFiles = (listData.items || []).filter((f: any) => f.type === 'file' && !f.name.startsWith('.'));
            
            if (textFiles.length === 0) throw new Error("No files found in 'Dictation' folder.");

            const shuffledFiles = textFiles.sort(() => Math.random() - 0.5);
            const filesToFetch = shuffledFiles.slice(0, 5); 

            const pool: string[] = [];
            await Promise.all(filesToFetch.map(async (file: any) => {
                try {
                    const fileName = file.name as string;
                    const contentRes = await fetch(`${serverUrl}/api/reading/content/${mapName}/${encodeURIComponent(fileName)}`);
                    if (contentRes.ok) {
                        const data = await contentRes.json() as { essay?: string };
                        const textContent = data.essay || "";
                        if (textContent) {
                            const lines = textContent.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                            pool.push(...lines);
                        }
                    }
                } catch (e) { console.warn(`Failed to read file ${file.name}`, e); }
            }));

            if (pool.length === 0) throw new Error("No valid text lines found.");
            return pool.sort(() => Math.random() - 0.5).slice(0, limit);
        } catch (e: unknown) {
            const err = e as Error;
            showToast(err.message || "Server Error", "error");
            return [];
        }
    };

    const getRandomVoice = (): string | undefined => {
        const voiceArray = Array.from(selectedVoices);
        if (voiceArray.length === 0) return undefined;
        const randomChoice = voiceArray[Math.floor(Math.random() * voiceArray.length)];
        return randomChoice === 'System' ? undefined : randomChoice;
    };

    const startGame = async () => {
        let rawData: string[];

        if (contentSource === 'SERVER') {
            setIsServerLoading(true);
            rawData = await fetchServerData(sessionSize);
            setIsServerLoading(false);
            if (rawData.length === 0) return;
        } else {
            const candidates = words.filter(w => w.example && w.example.trim().split(/\s+/).length >= 4);
            if (candidates.length === 0) {
                showToast("No suitable example sentences found in Library.", "error");
                return;
            }
            rawData = [...candidates].sort(() => Math.random() - 0.5).slice(0, sessionSize).map(w => w.example.trim());
        }
        
        const newQueue: DictationItem[] = rawData.map((originalSentence, idx) => {
            // Normalize spaces in sentence to prevent issues with double spaces
            const cleanSentence = originalSentence.replace(/\s+/g, ' ').trim();
            const tokens = cleanSentence.split(' ');
            
            // Masking logic for Easy mode (fill in blanks)
            const maskIndices = new Set<number>();
            if (difficulty === 'EASY') {
                // 1. Force Mask Numeric Tokens (e.g., "1990", "50%", "9:30")
                tokens.forEach((t, i) => {
                    if (/\d/.test(t)) {
                        maskIndices.add(i);
                    }
                });

                // 2. Randomly mask other words until ~40% covered
                const targetMaskCount = Math.max(1, Math.floor(tokens.length * 0.4));
                let attempts = 0;
                while (maskIndices.size < targetMaskCount && attempts < 100) {
                    attempts++;
                    const r = Math.floor(Math.random() * tokens.length);
                    // Mask if not already masked and has alphanumeric content
                    if (!maskIndices.has(r) && /[a-zA-Z0-9]/.test(tokens[r])) {
                        maskIndices.add(r);
                    }
                }
            }

            const tokenized = tokens.map((t, i) => {
                const isMasked = difficulty === 'EASY' && maskIndices.has(i);
                return { text: t, isMasked };
            });

            // Assign a random voice from selected pool for this specific item
            const itemVoice = getRandomVoice();

            return { 
                id: `dict-${idx}-${Date.now()}`, 
                originalSentence: cleanSentence, 
                tokenized, 
                mode: difficulty,
                voice: itemVoice 
            };
        });

        setQueue(newQueue);
        setGameState('PLAYING');
        setCurrentIndex(0);
        setScore(0);
        setUserInputs({});
        setHardInput('');
        setIsChecked(false);
        setIsCorrect(false);
        
        // Speak first item
        setTimeout(() => {
            const firstItem = newQueue[0];
            speak(formatForSpeech(firstItem.originalSentence), false, 'en', firstItem.voice);
        }, 600);
    };

    const currentItem = queue[currentIndex];

    useEffect(() => {
        if (gameState === 'PLAYING' && !isChecked) {
            setTimeout(() => firstInputRef.current?.focus(), 150);
        }
    }, [currentIndex, gameState, isChecked]);

    const handlePlayAudio = () => {
        if (currentItem) {
            speak(formatForSpeech(currentItem.originalSentence), false, 'en', currentItem.voice);
        }
    };

    const handleSkip = () => {
        handleNext();
    };

    const handleExit = () => {
        stopSpeaking();
        onExit();
    };

    const handleCheck = () => {
        if (isChecked) return;
        let correct = true;

        if (currentItem.mode === 'HARD') {
            correct = normalize(hardInput) === normalize(currentItem.originalSentence);
        } else {
            currentItem.tokenized.forEach((token, idx) => {
                if (token.isMasked) {
                    const cleanAns = token.text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                    if (normalize(userInputs[idx] || '') !== normalize(cleanAns)) correct = false;
                }
            });
        }

        setIsCorrect(correct);
        setIsChecked(true);
        if (correct) {
            const multiplier = currentItem.mode === 'HARD' ? 25 : 15;
            setScore(s => s + multiplier);
        }
    };

    const handleNext = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setUserInputs({});
            setHardInput('');
            setIsChecked(false);
            setIsCorrect(false);
            
            const nextItem = queue[currentIndex + 1];
            setTimeout(() => {
                speak(formatForSpeech(nextItem.originalSentence), false, 'en', nextItem.voice);
            }, 500);
        } else {
            onComplete(score);
        }
    };

    const toggleVoice = (voiceName: string) => {
        setSelectedVoices(prev => {
            const next = new Set(prev);
            if (next.has(voiceName)) {
                if (next.size > 1) next.delete(voiceName); // Must allow at least one
            } else {
                next.add(voiceName);
            }
            return next;
        });
    };

    const previewVoice = (voiceName: string) => {
        if (!hoverPreview) return;
        stopSpeaking();
        const voiceId = voiceName === 'System' ? undefined : voiceName;
        speak("Voice preview.", false, 'en', voiceId);
    };

    const renderEasyMode = () => (
        <div className="flex flex-wrap gap-x-2 gap-y-5 justify-center items-center leading-relaxed">
            {currentItem.tokenized.map((token, idx) => {
                if (!token.isMasked) return <span key={idx} className="text-lg font-medium text-neutral-600">{token.text}</span>;
                
                const val = userInputs[idx] || '';
                const cleanAns = token.text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                const isItemCorrect = isChecked && normalize(val) === normalize(cleanAns);

                return (
                    <div key={idx} className="relative inline-flex flex-col items-center">
                        <input
                            ref={idx === currentItem.tokenized.findIndex(t => t.isMasked) ? (firstInputRef as any) : null}
                            type="text"
                            value={val}
                            disabled={isChecked}
                            onChange={(e) => setUserInputs(prev => ({...prev, [idx]: e.target.value}))}
                            onKeyDown={e => e.key === 'Enter' && handleCheck()}
                            className={`w-28 text-center px-2 py-1.5 rounded-lg border-b-2 font-bold text-sm outline-none transition-all ${isChecked ? (isItemCorrect ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700') : 'bg-neutral-50 border-neutral-300 focus:bg-white focus:border-indigo-600'}`}
                            autoComplete="off"
                        />
                        {isChecked && !isItemCorrect && <div className="absolute -bottom-5 text-[10px] font-black text-green-600 uppercase whitespace-nowrap">{cleanAns}</div>}
                    </div>
                );
            })}
        </div>
    );

    const renderHardMode = () => (
        <div className="w-full max-w-2xl space-y-4">
            <textarea
                ref={firstInputRef as any}
                value={hardInput}
                onChange={e => setHardInput(e.target.value)}
                disabled={isChecked}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleCheck())}
                placeholder="Type the full sentence..."
                className={`w-full p-5 rounded-3xl border-2 text-lg font-medium resize-none outline-none transition-all h-32 ${isChecked ? (isCorrect ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800') : 'bg-white border-neutral-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100'}`}
            />
            {isChecked && !isCorrect && (
                <div className="p-5 bg-green-50 border border-green-100 rounded-2xl animate-in slide-in-from-top-2">
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Correct Answer</p>
                    <p className="text-base font-bold text-green-900 leading-relaxed">{currentItem.originalSentence}</p>
                </div>
            )}
        </div>
    );

    if (gameState === 'SETUP') {
        const DiffButton = ({ id, label, icon: Icon, desc, disabled }: any) => (
            <button
                onClick={() => !disabled && setDifficulty(id)}
                disabled={disabled}
                className={`p-3 rounded-xl border-2 transition-all text-left flex flex-col gap-1 relative ${difficulty === id ? 'border-cyan-500 bg-cyan-50 shadow-md' : 'border-neutral-100 bg-white hover:border-neutral-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <div className="flex items-center gap-2">
                    <div className={`p-1 rounded-lg ${difficulty === id ? 'bg-cyan-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}><Icon size={14}/></div>
                    <span className={`text-xs font-black uppercase tracking-wider ${difficulty === id ? 'text-cyan-700' : 'text-neutral-500'}`}>{label}</span>
                </div>
                <p className="text-[9px] font-bold text-neutral-400 leading-tight">{desc}</p>
                {disabled && <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px] font-black text-xs text-neutral-400 uppercase tracking-widest">Locked</div>}
            </button>
        );

        return (
            <div className="flex flex-col h-full relative p-6 justify-center items-center text-center space-y-6 animate-in fade-in max-w-4xl mx-auto overflow-y-auto">
                <div className="space-y-2">
                    <div className="w-16 h-16 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-2"><Keyboard size={32} /></div>
                    <h2 className="text-2xl font-black text-neutral-900 tracking-tight">Dictation Lab</h2>
                    <p className="text-xs text-neutral-500 font-medium">Bridge the gap between hearing and writing.</p>
                </div>

                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
                        <div className="space-y-2">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left">Source</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setContentSource('LIBRARY')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${contentSource === 'LIBRARY' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500'}`}><Book size={16} className="mb-1"/><span className="text-[9px] font-black uppercase">Sentence</span></button>
                                <button onClick={() => setContentSource('SERVER')} className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${contentSource === 'SERVER' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-500'}`}><Server size={16} className="mb-1"/><span className="text-[9px] font-black uppercase">Phrase</span></button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Session Size</span><span className="text-sm font-black text-cyan-600">{sessionSize}</span></div>
                            <input type="range" min="5" max="30" step="5" value={sessionSize} onChange={e => setSessionSize(parseInt(e.target.value))} className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-[2rem] border border-neutral-200 shadow-sm space-y-2 flex flex-col justify-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block text-left px-1">Difficulty</span>
                        <div className="grid grid-cols-1 gap-2">
                            <DiffButton id="EASY" label="Easy" icon={Zap} desc="Type in missing words. Numbers are always masked." disabled={contentSource === 'SERVER'} />
                            <DiffButton id="HARD" label="Hard" icon={Brain} desc="Transcribe the full sentence from scratch." />
                        </div>
                    </div>
                </div>

                {/* Voice Selection */}
                <div className="w-full bg-white p-4 rounded-[2rem] border border-neutral-200 shadow-sm space-y-2">
                     <div className="flex justify-between items-center px-1">
                         <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                             <Volume2 size={12}/> Voice Pool
                         </span>
                         <label className="flex items-center gap-2 cursor-pointer group">
                             <span className="text-[9px] font-bold text-neutral-400 group-hover:text-cyan-600 transition-colors">Hover to hear</span>
                             <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${hoverPreview ? 'bg-cyan-500' : 'bg-neutral-200'}`} onClick={() => setHoverPreview(!hoverPreview)}>
                                 <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${hoverPreview ? 'translate-x-4' : 'translate-x-0'}`} />
                             </div>
                         </label>
                     </div>
                     <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
                        <button 
                            onClick={() => toggleVoice('System')}
                            onMouseEnter={() => previewVoice('System')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-2 ${selectedVoices.has('System') ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-neutral-500 border-neutral-100 hover:border-neutral-200'}`}
                        >
                            {selectedVoices.has('System') && <Check size={10}/>} System Default
                        </button>
                        {availableVoices.map(v => (
                            <button 
                                key={v.name}
                                onClick={() => toggleVoice(v.name)}
                                onMouseEnter={() => previewVoice(v.name)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-2 ${selectedVoices.has(v.name) ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-neutral-500 border-neutral-100 hover:border-neutral-200'}`}
                            >
                                {selectedVoices.has(v.name) && <Check size={10}/>} {v.name.replace('Microsoft ', '')}
                            </button>
                        ))}
                        {availableVoices.length === 0 && <span className="text-[10px] text-neutral-400 italic">Connect to server for HQ voices.</span>}
                     </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={handleExit} className="px-8 py-3 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-xl hover:bg-neutral-50 transition-all text-xs">Back</button>
                    <button onClick={startGame} disabled={isServerLoading} className="px-10 py-3 bg-cyan-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-cyan-700 transition-all shadow-xl active:scale-95 flex items-center gap-2">
                        {isServerLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="white"/>} Start
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full relative p-6 max-w-4xl mx-auto">
            <header className="flex justify-between items-center mb-8 shrink-0">
                <button onClick={handleExit} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors font-bold text-sm"><ArrowLeft size={18}/> Quit</button>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase text-neutral-300 tracking-widest">Level {currentIndex + 1} of {queue.length} • {currentItem.mode}</span>
                    <div className="h-1 w-32 bg-neutral-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${(currentIndex / queue.length) * 100}%` }} />
                    </div>
                </div>
                <div className="px-6 py-2 bg-neutral-900 text-white rounded-full font-black text-lg shadow-lg tracking-widest">{score}</div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center space-y-12">
                <button onClick={handlePlayAudio} className="w-28 h-28 bg-cyan-50 text-cyan-600 rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-all group active:scale-95 relative">
                    <Play size={48} className="ml-1.5 fill-cyan-600 group-hover:scale-110 transition-transform" />
                    {currentItem.voice && (
                        <div className="absolute -bottom-6 text-[9px] font-bold text-neutral-300 bg-white px-2 py-0.5 rounded-full shadow-sm border border-neutral-100 whitespace-nowrap">
                            {currentItem.voice}
                        </div>
                    )}
                </button>

                <div className="w-full min-h-[160px] flex items-center justify-center px-4">
                    {currentItem.mode === 'EASY' ? renderEasyMode() : renderHardMode()}
                </div>

                <div className="w-full max-w-xs flex gap-3">
                    {!isChecked ? (
                        <>
                            <button onClick={handleSkip} className="flex-1 py-4 bg-white border-2 border-neutral-200 text-neutral-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:text-neutral-600 hover:border-neutral-300 transition-all">Skip</button>
                            <button onClick={handleCheck} className="flex-[2] py-4 bg-neutral-900 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/10 active:scale-95">Check Answer</button>
                        </>
                    ) : (
                        <button onClick={handleNext} className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 ${isCorrect ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-neutral-900 text-white'}`}>
                            <span>{currentIndex === queue.length - 1 ? 'Finish' : 'Next Item'}</span>
                            <ArrowRight size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
