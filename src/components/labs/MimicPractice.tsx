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
    id: string; 
    text: string;
    sourceWord: string;
    type: string;
}

interface Props {
    scopedWord?: VocabularyItem;
    onClose?: () => void;
}

const MIMIC_PRACTICE_QUEUE_KEY = 'vocab_pro_mimic_practice_queue';

export const MimicPractice: React.FC<Props> = ({ scopedWord, onClose }) => {
    // Queue Management
    const [queue, setQueue] = useState<TargetPhrase[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isEmpty, setIsEmpty] = useState(false);
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<TargetPhrase | null>(null);

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

    const saveQueue = (newQueue: TargetPhrase[]) => {
        setQueue(newQueue);
        setStoredJSON(MIMIC_PRACTICE_QUEUE_KEY, newQueue);
        setIsEmpty(newQueue.length === 0);
    };

    useEffect(() => {
        const initialQueue = getStoredJSON<TargetPhrase[]>(MIMIC_PRACTICE_QUEUE_KEY, []);
        setQueue(initialQueue);
        setIsEmpty(initialQueue.length === 0);
        setCurrentIndex(0);
    }, []);

    const handleAddItem = (newPhraseText: string) => {
        const newItem: TargetPhrase = {
            id: `mimic-${Date.now()}`,
            text: newPhraseText,
            sourceWord: 'Manual',
            type: 'Phrase'
        };
        saveQueue([...queue, newItem]);
        setIsModalOpen(false);
    };

    const handleUpdateItem = (itemId: string, newText: string) => {
        saveQueue(queue.map(item => item.id === itemId ? { ...item, text: newText } : item));
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleDeleteItem = (itemId: string) => {
        const newQueue = queue.filter(item => item.id !== itemId);
        if (currentIndex >= newQueue.length && newQueue.length > 0) {
            setCurrentIndex(newQueue.length - 1);
        } else if (newQueue.length === 0) {
            setCurrentIndex(0);
        }
        saveQueue(newQueue);
        showToast("Phrase deleted.", "success");
    };

    const openModalToAdd = () => {
        setEditingItem(null);
        setIsModalOpen(true);
    };
    
    const openModalToEdit = (item: TargetPhrase) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleSaveFromModal = (text: string) => {
        if (editingItem) {
            handleUpdateItem(editingItem.id, text);
        } else {
            handleAddItem(text);
        }
    };
    
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

    // Reset interaction state when target changes
    useEffect(() => {
        if (isRecording) {
            stopRecordingSession(true); 
        }
        setIsRevealed(false);
        setFullTranscript('');
        setTranscriptOffset(0);
        setUserAudioUrl(null);
        setMatchStatus(null);
        setAiAnalysis(null);
        if (userAudioPlayer.current) {
            userAudioPlayer.current.pause();
            userAudioPlayer.current = null;
        }

        if (autoSpeakRef.current && target) {
            const timer = setTimeout(() => {
                speak(target.text);
            }, 500);
            return () => clearTimeout(timer);
        }

    }, [target?.id]);

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
                
                if (silenceTimer.current) clearTimeout(silenceTimer.current);
                silenceTimer.current = setTimeout(() => stopFnRef.current(), 5000);
                
                const currentTargetText = target.text;

                recognitionManager.current.start(
                    (final, interim) => {
                        const full = final + (interim ? (final ? ' ' : '') + interim : '');
                        setFullTranscript(full);

                        if (silenceTimer.current) clearTimeout(silenceTimer.current);
                        silenceTimer.current = setTimeout(() => stopFnRef.current(), 5000);

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
            isGlobalMode={!scopedWord}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyzeAudio}
            aiAnalysis={aiAnalysis}
            onAddItem={openModalToAdd}
            onEditItem={openModalToEdit}
            onDeleteItem={handleDeleteItem}
            isModalOpen={isModalOpen}
            editingItem={editingItem}
            onCloseModal={() => setIsModalOpen(false)}
            onSaveItem={handleSaveFromModal}
        />
    );
};
