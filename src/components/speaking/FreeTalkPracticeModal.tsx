
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FreeTalkItem, VocabularyItem } from '../../app/types';
import { TargetPhrase } from '../labs/MimicPractice';
import { MimicPracticeUI } from '../labs/MimicPractice_UI';
import { startRecording, stopRecording, speak, stopSpeaking } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { analyzeSpeechLocally, AnalysisResult } from '../../utils/speechAnalysis';
import * as dataStore from '../../app/dataStore';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    item: FreeTalkItem | null;
}

export const FreeTalkPracticeModal: React.FC<Props> = ({ isOpen, onClose, item }) => {
    const { showToast } = useToast();
    
    // Data State
    const [queue, setQueue] = useState<TargetPhrase[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    
    // UI State
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    
    // Practice State
    const [isRecording, setIsRecording] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    const [fullTranscript, setFullTranscript] = useState('');
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const [localAnalysis, setLocalAnalysis] = useState<AnalysisResult | null>(null);
    
    const [autoSpeak, setAutoSpeak] = useState(false);
    const [autoReveal, setAutoReveal] = useState(() => getStoredJSON('vocab_pro_mimic_autoreveal', true));

    // Save autoReveal setting changes (shared with main MimicPractice)
    useEffect(() => {
        setStoredJSON('vocab_pro_mimic_autoreveal', autoReveal);
    }, [autoReveal]);

    // IPA State
    const [ipa, setIpa] = useState<string | null>(null);
    const [showIpa, setShowIpa] = useState(false);
    const [isIpaLoading, setIsIpaLoading] = useState(false);

    // Refs
    const recognitionManager = useRef(new SpeechRecognitionManager());
    const userAudioPlayer = useRef<HTMLAudioElement | null>(null);

    // Initialize: Split paragraph into sentences
    useEffect(() => {
        if (isOpen && item) {
            // Robust sentence splitting
            const sentences = item.content.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [item.content];
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
            resetPracticeState();
        } else {
            // Cleanup on close
            stopSpeaking();
            recognitionManager.current.stop();
        }
    }, [isOpen, item]);

    const target = queue[currentIndex] || null;

    // Reset state when target changes
    useEffect(() => {
        resetPracticeState();
        if (autoSpeak && target) {
            const t = setTimeout(() => speak(target.text), 500);
            return () => clearTimeout(t);
        }
    }, [target?.id]);

    const resetPracticeState = () => {
        setIsRecording(false);
        setIsRevealed(autoReveal); // Use preference
        setFullTranscript('');
        setUserAudioUrl(null);
        setLocalAnalysis(null);
        setIpa(null);
        setShowIpa(false);
    };

    const saveProgress = async (currentQueue: TargetPhrase[]) => {
        if (!item) return;
        
        const sentenceScores: Record<number, number> = {};
        const scores: number[] = [];

        // Build the sentenceScores map from the current queue which holds all session data
        currentQueue.forEach((p, idx) => {
            if (p.lastScore !== undefined) {
                sentenceScores[idx] = p.lastScore;
                scores.push(p.lastScore);
            }
        });

        let averageScore = item.bestScore || 0;
        if (scores.length > 0) {
            const totalScore = scores.reduce((acc, curr) => acc + curr, 0);
            averageScore = Math.round(totalScore / scores.length);
        }
        
        // Save to DB immediately with sentence scores map
        await dataStore.saveFreeTalkItem({
            ...item,
            bestScore: averageScore,
            sentenceScores,
            updatedAt: Date.now()
        });
    };

    // --- Actions ---

    const handleToggleRecord = async () => {
        if (!target) return;
        
        if (isRecording) {
            // Stop
            setIsRecording(false);
            recognitionManager.current.stop();
            
            try {
                const result = await stopRecording();
                if (result) setUserAudioUrl(result.base64);
                
                // Analyze
                const analysis = analyzeSpeechLocally(target.text, fullTranscript);
                setLocalAnalysis(analysis);
                
                // Update score in queue immediately
                const updatedQueue = queue.map((p, idx) => idx === currentIndex ? { ...p, lastScore: analysis.score } : p);
                setQueue(updatedQueue);
                
                // Save progress to DB immediately
                await saveProgress(updatedQueue);
                
            } catch (e) {
                console.error(e);
            }
        } else {
            // Start
            resetPracticeState(); // Clear previous attempt
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

    const handlePlayTarget = () => {
        if (target) speak(target.text);
    };

    const handlePlayUser = () => {
        if (userAudioUrl) {
            const audio = new Audio(`data:audio/webm;base64,${userAudioUrl}`);
            audio.play();
        }
    };

    const handleFetchIpa = async () => {
        if (!target) return;
        if (ipa) {
            setShowIpa(!showIpa);
            return;
        }

        setIsIpaLoading(true);
        try {
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
        } catch (e) {
            showToast("Failed to fetch IPA", "error");
        } finally {
            setIsIpaLoading(false);
        }
    };

    const handleNext = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handlePageSizeChange = (s: number) => {
        setPageSize(s);
        setPage(0);
    };
    
    // --- Render ---

    if (!isOpen || !item) return null;

    const totalPages = Math.ceil(queue.length / pageSize);
    const pagedItems = queue.slice(page * pageSize, (page + 1) * pageSize);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl border border-neutral-200 flex h-[85vh] overflow-hidden relative">
                <MimicPracticeUI 
                    // Data
                    targetText={target?.text || null}
                    sourceWord={item.title}
                    type="Free Talk"
                    isEmpty={queue.length === 0}
                    
                    // State
                    isRecording={isRecording}
                    isRevealed={isRevealed}
                    userTranscript={fullTranscript}
                    matchStatus={null}
                    userAudioUrl={userAudioUrl}
                    
                    // Analysis
                    localAnalysis={localAnalysis}
                    aiAnalysis={null}
                    isAnalyzing={false}
                    onAnalyze={() => {}}

                    // IPA
                    ipa={ipa}
                    showIpa={showIpa}
                    isIpaLoading={isIpaLoading}
                    onToggleIpa={handleFetchIpa}

                    // Actions
                    onToggleRecord={handleToggleRecord}
                    onPlayTarget={handlePlayTarget}
                    onPlayUser={handlePlayUser}
                    onToggleReveal={() => setIsRevealed(!isRevealed)}
                    onNext={handleNext}
                    onClearTranscript={() => setFullTranscript('')}
                    onClose={onClose}
                    
                    // Pagination & List
                    pagedItems={pagedItems}
                    page={page}
                    pageSize={pageSize}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                    onSelect={(relIdx) => setCurrentIndex((page * pageSize) + relIdx)}
                    currentAbsoluteIndex={currentIndex}
                    
                    // Options
                    autoSpeak={autoSpeak}
                    onToggleAutoSpeak={() => setAutoSpeak(!autoSpeak)}
                    autoReveal={autoReveal}
                    onToggleAutoReveal={() => setAutoReveal(!autoReveal)}
                    
                    isGlobalMode={true} // Using global mode style for better spacing
                    
                    // Stub out editing features for this mode
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
        </div>
    );
};
