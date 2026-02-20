
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as dataStore from '../../app/dataStore';
import { speak, startRecording, stopRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { MimicPracticeUI } from './MimicPractice_UI';
import { VocabularyItem } from '../../app/types';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { analyzeSpeechLocally, AnalysisResult } from '../../utils/speechAnalysis';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../common/ConfirmationModal';
import { getConfig, getServerUrl } from '../../app/settingsManager';

export interface TargetPhrase {
    id: string; 
    text: string;
    sourceWord: string;
    type: string;
    lastScore?: number; // Track last practice score (0-100)
}

interface Props {
    scopedWord?: VocabularyItem;
    onClose?: () => void;
}

const MIMIC_PRACTICE_QUEUE_KEY = 'vocab_pro_mimic_practice_queue';

export const MimicPractice: React.FC<Props> = ({ scopedWord, onClose }) => {
    const [queue, setQueue] = useState<TargetPhrase[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isEmpty, setIsEmpty] = useState(false);
    
    // Pagination State
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<TargetPhrase | null>(null);
    
    // Delete Confirmation State
    const [itemToDelete, setItemToDelete] = useState<TargetPhrase | null>(null);

    const [autoSpeak, setAutoSpeak] = useState(() => getStoredJSON('vocab_pro_mimic_autospeak', false));
    const [autoReveal, setAutoReveal] = useState(() => getStoredJSON('vocab_pro_mimic_autoreveal', true));
    
    const autoSpeakRef = useRef(autoSpeak);

    useEffect(() => {
        setStoredJSON('vocab_pro_mimic_autospeak', autoSpeak);
        autoSpeakRef.current = autoSpeak;
    }, [autoSpeak]);

    useEffect(() => {
        setStoredJSON('vocab_pro_mimic_autoreveal', autoReveal);
    }, [autoReveal]);
    
    // Get the actual item based on current index in the FULL queue
    const target = queue[currentIndex] || null;

    const [isRecording, setIsRecording] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [fullTranscript, setFullTranscript] = useState('');
    const [transcriptOffset, setTranscriptOffset] = useState(0);
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const [userAudioMimeType, setUserAudioMimeType] = useState<string>('audio/webm');
    const [matchStatus, setMatchStatus] = useState<'match' | 'close' | 'miss' | null>(null);

    // IPA State
    const [ipa, setIpa] = useState<string | null>(null);
    const [showIpa, setShowIpa] = useState(false);
    const [isIpaLoading, setIsIpaLoading] = useState(false);

    // Analysis State (Local)
    const [localAnalysis, setLocalAnalysis] = useState<AnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const recognitionManager = useRef(new SpeechRecognitionManager());
    const userAudioPlayer = useRef<HTMLAudioElement | null>(null);
    const silenceTimer = useRef<any>(null);
    const stopFnRef = useRef<() => void>(() => {});
    const { showToast } = useToast();

    const displayTranscript = fullTranscript.substring(transcriptOffset).trimStart();

    // Real-time analysis during recording
    useEffect(() => {
        if (isRecording && target && displayTranscript) {
            const result = analyzeSpeechLocally(target.text, displayTranscript);
            setLocalAnalysis(result);
        }
    }, [displayTranscript, isRecording, target]);

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

    // Ensure page is valid when queue changes
    useEffect(() => {
        const totalPages = Math.ceil(queue.length / pageSize);
        if (page >= totalPages && totalPages > 0) {
            setPage(totalPages - 1);
        }
    }, [queue.length, pageSize]);

    // Ensure the current playing item is visible on the current page
    useEffect(() => {
        const itemPage = Math.floor(currentIndex / pageSize);
        if (itemPage !== page) {
            setPage(itemPage);
        }
    }, [currentIndex, pageSize]);

    const handleAddItem = (newPhraseText: string) => {
        const newItem: TargetPhrase = {
            id: `mimic-${Date.now()}`,
            text: newPhraseText,
            sourceWord: 'Manual',
            type: 'Phrase'
        };
        // Add to beginning of queue
        const newQueue = [newItem, ...queue];
        saveQueue(newQueue);
        setCurrentIndex(0); // Jump to new item
        setIsModalOpen(false);
    };

    const handleUpdateItem = (itemId: string, newText: string) => {
        saveQueue(queue.map(item => item.id === itemId ? { ...item, text: newText } : item));
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const requestDeleteItem = (item: TargetPhrase) => {
        setItemToDelete(item);
    };

    const confirmDelete = () => {
        if (!itemToDelete) return;
        const newQueue = queue.filter(item => item.id !== itemToDelete.id);
        
        let newIndex = currentIndex;
        if (newIndex >= newQueue.length) {
            newIndex = Math.max(0, newQueue.length - 1);
        }
        
        setCurrentIndex(newIndex);
        saveQueue(newQueue);
        setItemToDelete(null);
        showToast("Phrase removed.", "success");
    };

    const handleRandomize = () => {
        if (queue.length < 2) return;
        const shuffled = [...queue].sort(() => Math.random() - 0.5);
        saveQueue(shuffled);
        setCurrentIndex(0);
        showToast("Queue shuffled!", "success");
    };
    
    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setPage(0); // Reset to first page to avoid index issues
    };

    const openModalToAdd = () => { setEditingItem(null); setIsModalOpen(true); };
    const openModalToEdit = (item: TargetPhrase) => { setEditingItem(item); setIsModalOpen(true); };

    const handleSaveFromModal = (text: string) => {
        if (editingItem) handleUpdateItem(editingItem.id, text);
        else handleAddItem(text);
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
        } catch (e) { console.error("Audio capture failed", e); }
    }, []);

    useEffect(() => { stopFnRef.current = stopRecordingSession; }, [stopRecordingSession]);

    const handleFetchIpa = useCallback(async () => {
        if (!target) return;
        if (ipa && showIpa) {
            setShowIpa(false);
            return;
        }
        if (ipa && !showIpa) {
            setShowIpa(true);
            return;
        }

        setIsIpaLoading(true);
        try {
            // 1. Check Library first from cached store (reliable and fast)
            const cleaned = target.text.trim().toLowerCase();
            const existing = dataStore.getAllWords().find(w => w.word.toLowerCase() === cleaned);
            if (existing && existing.ipaUs) {
                setIpa(existing.ipaUs);
                setShowIpa(true);
                setIsIpaLoading(false);
                return;
            } else {
                // 2. Fallback to Server API
                const config = getConfig();
                const serverUrl = getServerUrl(config);
                const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(target.text)}`);
                if (res.ok) {
                    const data = await res.json();
                    setIpa(data.ipa);
                    setShowIpa(true);
                } else {
                    showToast("IPA server unavailable", "error");
                }
            }
        } catch {
            showToast("Failed to fetch IPA", "error");
        } finally {
            setIsIpaLoading(false);
        }
    }, [target, ipa, showIpa, showToast]);

    useEffect(() => {
        if (isRecording) stopRecordingSession(true); 
        setIsRevealed(autoReveal); // Use preference
        setFullTranscript('');
        setTranscriptOffset(0);
        setUserAudioUrl(null);
        setMatchStatus(null);
        setLocalAnalysis(null);
        setIpa(null);
        setShowIpa(false);
        if (userAudioPlayer.current) {
            userAudioPlayer.current.pause();
            userAudioPlayer.current = null;
        }
        if (autoSpeakRef.current && target) {
            const timer = setTimeout(() => speak(target.text), 500);
            return () => clearTimeout(timer);
        }
    }, [target?.id, autoReveal]); // Added autoReveal to dependency to react to toggle if needed, though usually on next item

    useEffect(() => {
        return () => {
             recognitionManager.current.stop();
             if (silenceTimer.current) clearTimeout(silenceTimer.current);
        }
    }, []);

    const handleToggleRecord = async () => {
        if (!target) return;
        if (isRecording) {
            await stopRecordingSession();
            // Local Analysis is triggered instantly on stop
            const result = analyzeSpeechLocally(target.text, displayTranscript);
            setLocalAnalysis(result);
            
            // Save the score to the item in the queue
            const updatedQueue = queue.map((item, idx) => 
                idx === currentIndex ? { ...item, lastScore: result.score } : item
            );
            saveQueue(updatedQueue); // Persist score

        } else {
            setFullTranscript('');
            setTranscriptOffset(0);
            setMatchStatus(null);
            setLocalAnalysis(null);
            try {
                await startRecording();
                setIsRecording(true);
                if (silenceTimer.current) clearTimeout(silenceTimer.current);
                silenceTimer.current = setTimeout(() => stopFnRef.current(), 10000);
                recognitionManager.current.start(
                    (final, interim) => setFullTranscript(final + interim),
                    (finalTranscript) => setFullTranscript(finalTranscript)
                );
            } catch (e) {
                console.error("Failed to start recording", e);
                setIsRecording(false);
            }
        }
    };
    
    const handleClearTranscript = () => {
        setTranscriptOffset(fullTranscript.length);
        setMatchStatus(null);
        setLocalAnalysis(null);
    };

    const handlePlayTarget = () => target && speak(target.text);

    const handlePlayUser = () => {
        if (userAudioUrl) {
            if (userAudioPlayer.current) userAudioPlayer.current.pause();
            const audio = new Audio(`data:${userAudioMimeType};base64,${userAudioUrl}`);
            userAudioPlayer.current = audio;
            audio.play();
        }
    };

    const handleNext = () => {
        if (queue.length > 0) {
            setCurrentIndex((prev) => (prev + 1) % queue.length);
        }
    };

    const handleSelect = (index: number) => {
        if (index >= 0 && index < queue.length) {
            setCurrentIndex(index);
        }
    };

    // Derived Logic for UI
    const totalPages = Math.ceil(queue.length / pageSize);
    const pagedItems = queue.slice(page * pageSize, (page + 1) * pageSize);

    return (
        <>
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
                
                // Pagination Props
                pagedItems={pagedItems}
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                // Determine absolute index for paged item clicks
                onSelect={(relativeIndex) => handleSelect((page * pageSize) + relativeIndex)}
                currentAbsoluteIndex={currentIndex}
                
                autoSpeak={autoSpeak}
                onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
                autoReveal={autoReveal}
                onToggleAutoReveal={() => setAutoReveal(!autoReveal)}

                isGlobalMode={!scopedWord}
                isAnalyzing={isAnalyzing}
                onAnalyze={() => {}} 
                aiAnalysis={localAnalysis ? { 
                    isCorrect: localAnalysis.score > 80, 
                    score: localAnalysis.score, 
                    feedbackHtml: '' 
                } : null}
                localAnalysis={localAnalysis}
                onAddItem={openModalToAdd}
                onEditItem={openModalToEdit}
                onDeleteItem={requestDeleteItem} // Pass the full item object logic here later
                onRandomize={handleRandomize}
                isModalOpen={isModalOpen}
                editingItem={editingItem}
                onCloseModal={() => setIsModalOpen(false)}
                onSaveItem={handleSaveFromModal}

                // IPA Props
                ipa={ipa}
                showIpa={showIpa}
                isIpaLoading={isIpaLoading}
                onToggleIpa={handleFetchIpa}
            />
            
            <ConfirmationModal 
                isOpen={!!itemToDelete}
                title="Delete Phrase?"
                message="Are you sure you want to remove this phrase from your pronunciation queue?"
                confirmText="Delete"
                isProcessing={false}
                onConfirm={confirmDelete}
                onClose={() => setItemToDelete(null)}
                icon={null} // Optional custom icon
                confirmButtonClass="bg-red-600 text-white hover:bg-red-700"
            />
        </>
    );
};
