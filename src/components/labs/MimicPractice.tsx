
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as dataStore from '../../app/dataStore';
import { speak, startRecording, stopRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { MimicPracticeUI } from './MimicPractice_UI';
import { VocabularyItem } from '../../app/types';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { analyzePronunciation } from '../../services/geminiService';
import { useToast } from '../../contexts/ToastContext';

export interface TargetPhrase {
    id: string; // Add a unique ID for React keys
    text: string;
    sourceWord: string;
    type: 'Collocation' | 'Idiom' | 'Paraphrase';
}

interface Props {
    scopedWord?: VocabularyItem;
    onClose?: () => void;
}

export const MimicPractice: React.FC<Props> = ({ scopedWord, onClose }) => {
    // Queue Management
    const [queue, setQueue] = useState<TargetPhrase[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isEmpty, setIsEmpty] = useState(false);
    
    // Initialize from storage, default to false
    const [autoSpeak, setAutoSpeak] = useState(() => getStoredJSON('vocab_pro_mimic_autospeak', false));
    const autoSpeakRef = useRef(autoSpeak);

    // Persist to storage on change
    useEffect(() => {
        setStoredJSON('vocab_pro_mimic_autospeak', autoSpeak);
        autoSpeakRef.current = autoSpeak;
    }, [autoSpeak]);
    
    // Derived Target
    const target = queue[currentIndex] || null;

    // Interaction State
    const [isRecording, setIsRecording] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    
    // Audio & Transcription State
    const [fullTranscript, setFullTranscript] = useState(''); // Raw accumulator
    const [transcriptOffset, setTranscriptOffset] = useState(0); // For clearing
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null); // Base64
    const [userAudioMimeType, setUserAudioMimeType] = useState<string>('audio/webm');
    const [matchStatus, setMatchStatus] = useState<'match' | 'close' | 'miss' | null>(null);

    // Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<{ isCorrect: boolean, score: number, feedbackHtml: string } | null>(null);

    // Audio & Recognition Refs
    const recognitionManager = useRef(new SpeechRecognitionManager());
    const userAudioPlayer = useRef<HTMLAudioElement | null>(null);
    const silenceTimer = useRef<any>(null);
    const stopFnRef = useRef<() => void>(() => {});
    const { showToast } = useToast();

    // Derived Display Transcript
    const displayTranscript = fullTranscript.substring(transcriptOffset).trimStart();

    const stopRecordingSession = useCallback(async (abort = false) => {
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        
        setIsRecording(false);
        recognitionManager.current.stop();
        
        try {
            const result = await stopRecording();
            if (!abort && result) {
                setUserAudioUrl(result.base64);
                setUserAudioMimeType(result.mimeType);
            }
        } catch (e) {
            console.error("Audio capture failed", e);
        }
    }, []);

    useEffect(() => {
        stopFnRef.current = stopRecordingSession;
    }, [stopRecordingSession]);

    // Initialize Queue
    const generateSession = useCallback(() => {
        // If scopedWord is provided, use only that word. Otherwise use all words.
        const sourceWords = scopedWord ? [scopedWord] : dataStore.getAllWords();
        const candidates: TargetPhrase[] = [];

        sourceWords.forEach(w => {
            if (w.isPassive) return;

            if (w.collocationsArray) {
                w.collocationsArray.filter(c => !c.isIgnored).forEach((c, idx) => {
                    if (c.text.split(' ').length > 1) { 
                        candidates.push({ id: `${w.id}-col-${idx}`, text: c.text, sourceWord: w.word, type: 'Collocation' });
                    }
                });
            }
            if (w.idiomsList) {
                w.idiomsList.filter(i => !i.isIgnored).forEach((i, idx) => {
                    candidates.push({ id: `${w.id}-idm-${idx}`, text: i.text, sourceWord: w.word, type: 'Idiom' });
                });
            }
            if (w.paraphrases) {
                w.paraphrases.filter(p => !p.isIgnored).forEach((p, idx) => {
                     candidates.push({ id: `${w.id}-para-${idx}`, text: p.word, sourceWord: w.word, type: 'Paraphrase' });
                });
            }
        });

        if (candidates.length === 0) {
            setIsEmpty(true);
            setQueue([]);
            return;
        }

        // If scoped, use all. If global, shuffle and take subset to create a "Session"
        if (scopedWord) {
            setQueue(candidates);
        } else {
            const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, 20);
            setQueue(shuffled);
        }
        
        // Reset state for new session
        setCurrentIndex(0);
        setFullTranscript('');
        setTranscriptOffset(0);
        setUserAudioUrl(null);
        setMatchStatus(null);
        setIsRevealed(false);
        setAiAnalysis(null);
    }, [scopedWord]);

    useEffect(() => {
        generateSession();
    }, [generateSession]);

    // Reset interaction state when target changes
    useEffect(() => {
        // 1. Stop recording if active (and abort saving audio to prevent race condition)
        if (isRecording) {
            stopRecordingSession(true); 
        }

        // 2. Reset UI state
        // Note: These are also called in navigation handlers to prevent UI flash,
        // but kept here to ensure consistency if target changes via other means.
        setIsRevealed(false);
        setFullTranscript('');
        setTranscriptOffset(0);
        setUserAudioUrl(null);
        setMatchStatus(null);
        setAiAnalysis(null);
        
        // 3. Cleanup player
        if (userAudioPlayer.current) {
            userAudioPlayer.current.pause();
            userAudioPlayer.current = null;
        }

        // 4. Auto Speak
        if (autoSpeakRef.current && target) {
            const timer = setTimeout(() => {
                speak(target.text);
            }, 500); // Slight delay for smoother transition
            return () => clearTimeout(timer);
        }

    }, [target?.id]); // Only reset when the specific target ID changes. Removed autoSpeak from deps.

    useEffect(() => {
        return () => {
             recognitionManager.current.stop();
             if (silenceTimer.current) clearTimeout(silenceTimer.current);
        }
    }, []);

    const normalize = (text: string) => {
        return text.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const checkMatch = (inputText: string) => {
        if (!target || !inputText) {
            setMatchStatus(null);
            return;
        }
        const normTarget = normalize(target.text);
        const normUser = normalize(inputText);
        
        if (normUser === normTarget) {
            setMatchStatus('match');
        } else if (normTarget.includes(normUser) && normUser.length > 3) {
            setMatchStatus('close');
        } else if (normUser.includes(normTarget)) {
            setMatchStatus('match'); 
        } else {
            setMatchStatus('miss');
        }
    };

    const handleToggleRecord = async () => {
        if (!target) return;

        if (isRecording) {
            await stopRecordingSession();
            checkMatch(displayTranscript);
        } else {
            setFullTranscript('');
            setTranscriptOffset(0);
            setMatchStatus(null);
            setAiAnalysis(null);
            
            try {
                await startRecording();
                setIsRecording(true);
                
                // Initialize silence timer
                if (silenceTimer.current) clearTimeout(silenceTimer.current);
                silenceTimer.current = setTimeout(() => stopFnRef.current(), 5000);
                
                const currentTargetText = target.text;

                recognitionManager.current.start(
                    (final, interim) => {
                        const full = final + (interim ? (final ? ' ' : '') + interim : '');
                        setFullTranscript(full);

                        // Reset silence timer on every transcript update
                        if (silenceTimer.current) clearTimeout(silenceTimer.current);
                        silenceTimer.current = setTimeout(() => stopFnRef.current(), 5000);

                        // Auto-stop if perfect match
                        if (normalize(full) === normalize(currentTargetText)) {
                             stopRecordingSession();
                        }
                    },
                    (finalTranscript) => {
                        setFullTranscript(finalTranscript);
                    }
                );
            } catch (e) {
                console.error("Failed to start recording", e);
                setIsRecording(false);
            }
        }
    };
    
    useEffect(() => {
        checkMatch(displayTranscript);
    }, [displayTranscript, target]);

    const handleClearTranscript = () => {
        setTranscriptOffset(fullTranscript.length);
        setMatchStatus(null);
        setAiAnalysis(null);
    };

    const handlePlayTarget = () => {
        if (target) {
            speak(target.text);
        }
    };

    const handlePlayUser = () => {
        if (userAudioUrl) {
            if (userAudioPlayer.current) {
                userAudioPlayer.current.pause();
            }
            const audio = new Audio(`data:${userAudioMimeType};base64,${userAudioUrl}`);
            userAudioPlayer.current = audio;
            audio.play();
        }
    };

    const handleAnalyzeAudio = async () => {
        if (!userAudioUrl || !target) return;
        setIsAnalyzing(true);
        try {
            const result = await analyzePronunciation(userAudioUrl, target.text, userAudioMimeType);
            setAiAnalysis(result);
        } catch (e) {
            console.error(e);
            showToast("Failed to analyze audio. Check API settings.", "error");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const resetState = () => {
        setFullTranscript('');
        setTranscriptOffset(0);
        setUserAudioUrl(null);
        setMatchStatus(null);
        setIsRevealed(false);
        setAiAnalysis(null);
    };

    const handleNext = () => {
        if (queue.length > 0) {
            resetState();
            setCurrentIndex((prev) => (prev + 1) % queue.length);
        }
    };

    const handleSelect = (index: number) => {
        if (index >= 0 && index < queue.length) {
            resetState();
            setCurrentIndex(index);
        }
    };

    const handleRefreshList = () => {
        generateSession();
    };

    return (
        <MimicPracticeUI 
            targetText={target?.text || null}
            sourceWord={target?.sourceWord || ''}
            type={target?.type || ''}
            isRecording={isRecording}
            isRevealed={isRevealed}
            userTranscript={displayTranscript}
            matchStatus={matchStatus}
            userAudioUrl={userAudioUrl}
            onToggleRecord={handleToggleRecord}
            onPlayTarget={handlePlayTarget}
            onPlayUser={handlePlayUser}
            onToggleReveal={() => setIsRevealed(!isRevealed)}
            onNext={handleNext}
            onClearTranscript={handleClearTranscript}
            isEmpty={isEmpty}
            onClose={onClose}
            queue={queue}
            currentIndex={currentIndex}
            onSelect={handleSelect}
            autoSpeak={autoSpeak}
            onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
            onRefresh={handleRefreshList}
            isGlobalMode={!scopedWord}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyzeAudio}
            aiAnalysis={aiAnalysis}
        />
    );
};
