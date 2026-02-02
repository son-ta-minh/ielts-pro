
import React, { useState, useCallback } from 'react';
import { User, VocabularyItem, DataScope } from '../types';
import * as dataStore from '../dataStore';
import { processJsonImport, generateJsonExport } from '../../utils/dataHandler';
import { useToast } from '../../contexts/ToastContext';
import * as db from '../db';
// Import calculateMasteryScore to fix reference error on line 153
import { calculateMasteryScore } from '../../utils/srs';

interface UseDataActionsProps {
    currentUser: User | null;
    setView: (view: any) => void;
    refreshGlobalStats: () => void;
    sessionWords: VocabularyItem[] | null;
    setSessionWords: React.Dispatch<React.SetStateAction<VocabularyItem[] | null>>;
    wotd: VocabularyItem | null;
    setWotd: React.Dispatch<React.SetStateAction<VocabularyItem | null>>;
    globalViewWord: VocabularyItem | null;
    setGlobalViewWord: React.Dispatch<React.SetStateAction<VocabularyItem | null>>;
    onUpdateUser: (user: User) => Promise<void>;
}

export const useDataActions = (props: UseDataActionsProps) => {
    const { currentUser, setView, refreshGlobalStats, sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord, onUpdateUser } = props;
    const { showToast } = useToast();

    const [isResetting, setIsResetting] = useState(false);
    const [resetStep, setResetStep] = useState('');
    const [lastBackupTime, setLastBackupTime] = useState<number | null>(
        Number(localStorage.getItem('vocab_pro_last_backup_timestamp')) || null
    );

    const handleBackup = async (customScope?: DataScope) => {
        if (!currentUser) return;
        
        // Default scope includes everything if not specified (for global backup button)
        const fullScope: DataScope = customScope || {
            user: true,
            vocabulary: true,
            lesson: true,
            reading: true,
            writing: true,
            speaking: true,
            listening: true,
            mimic: true,
            wordBook: true,
            calendar: true
        };
        
        await generateJsonExport(currentUser.id, currentUser, fullScope);
        
        const now = Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(now));
        setLastBackupTime(now);
        // Clear restore suppression if any
        sessionStorage.removeItem('vocab_pro_just_restored');
    };
    
    const handleRestore = () => {
        if (!currentUser) {
            console.error("useDataActions: No current user, aborting restore.");
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';

        input.onchange = async (e) => {
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }

            try {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                
                // Full restore logic: assumes all scopes true for quick restore action
                const fullScope: DataScope = {
                    user: true,
                    vocabulary: true,
                    lesson: true,
                    reading: true,
                    writing: true,
                    speaking: true,
                    listening: true,
                    mimic: true,
                    wordBook: true,
                    calendar: true
                };

                const result = await processJsonImport(file, currentUser.id, fullScope);
    
                if (result.type === 'success') {
                    // Mark that we just restored to suppress backup nagging
                    sessionStorage.setItem('vocab_pro_just_restored', 'true');
                    
                    showToast('Restore successful! Refreshing data...', 'success', 2000);
                    
                    // Force the dataStore to re-read from IndexedDB completely
                    await dataStore.forceReload(currentUser.id);

                    if (result.updatedUser) {
                        await onUpdateUser(result.updatedUser);
                        localStorage.setItem('vocab_pro_current_user_id', result.updatedUser.id);
                    }
                    
                    // Refresh stats for UI
                    refreshGlobalStats();

                } else {
                    showToast(`Restore data failed. Reason: ${result.detail || result.message}`, 'error', 10000);
                }
            } catch (err) {
                console.error("A fatal error occurred in the restore onchange handler:", err);
                showToast("A fatal error occurred. Check the console for details.", 'error', 10000);
            }
        };
        
        document.body.appendChild(input);
        input.click();
    };

    const handleLibraryReset = async () => {
        if (!currentUser) return;
        setIsResetting(true);
        setResetStep('Cleaning library...');
        try {
            await dataStore.clearVocabularyOnly();
            sessionStorage.removeItem('vocab_pro_skip_seed');
            await dataStore.seedDatabaseIfEmpty(true);
            await dataStore.forceReload(currentUser.id);
            refreshGlobalStats(); 
            setView('DASHBOARD');
        } catch (err) {
            console.error("Reset failed", err);
            window.location.reload();
        } finally {
            setIsResetting(false);
        }
    };

    const updateWord = async (updatedWord: VocabularyItem) => {
        await dataStore.saveWord(updatedWord);
        
        // If there's an active session, update the word in that session's state too.
        if (sessionWords) {
            setSessionWords(prevWords => 
                (prevWords || []).map(w => w.id === updatedWord.id ? updatedWord : w)
            );
        }

        // If the word currently in the global view modal is the one being updated,
        // we need to update the state to force a re-render of the modal with the new data.
        if (globalViewWord && globalViewWord.id === updatedWord.id) {
            updatedWord.masteryScore = calculateMasteryScore(updatedWord);
            setGlobalViewWord(updatedWord);
        }
    };
    
    const deleteWord = async (id: string) => {
        // If we delete the word that is currently open, we should close the modal.
        if (globalViewWord && globalViewWord.id === id) {
            setGlobalViewWord(null);
        }
        await dataStore.deleteWord(id);
    };

    const bulkDeleteWords = async (ids: string[]) => {
        await dataStore.bulkDeleteWords(ids);
    };

    const bulkUpdateWords = async (updatedWords: VocabularyItem[]) => {
        await dataStore.bulkSaveWords(updatedWords);
    };

    return {
        isResetting,
        resetStep,
        lastBackupTime,
        handleBackup,
        handleRestore,
        handleLibraryReset,
        updateWord,
        deleteWord,
        bulkDeleteWords,
        bulkUpdateWords,
    };
};
