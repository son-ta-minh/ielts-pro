import React, { useState, useCallback } from 'react';
import { User, VocabularyItem } from '../types';
import * as dataStore from '../dataStore';
import { processJsonImport } from '../../utils/dataHandler';
import { useToast } from '../../contexts/ToastContext';
import * as adventureService from '../../services/adventureService';
import * as db from '../db';

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

    const handleBackup = async () => {
        if (!currentUser) return;
        const [wordsData, unitsData, logsData, speakingTopicsData, speakingLogsData, writingTopicsData, writingLogsData] = await Promise.all([
          dataStore.getAllWords(), 
          dataStore.getUnitsByUserId(currentUser.id),
          dataStore.getParaphraseLogs(currentUser.id),
          db.getAllSpeakingTopicsForExport(currentUser.id),
          db.getAllSpeakingLogsForExport(currentUser.id),
          db.getAllWritingTopicsForExport(currentUser.id),
          db.getAllWritingLogsForExport(currentUser.id),
        ]);
    
        const exportObject = {
          version: 5, 
          createdAt: new Date().toISOString(),
          user: currentUser,
          vocabulary: wordsData,
          units: unitsData,
          paraphraseLogs: logsData,
          speakingTopics: speakingTopicsData,
          speakingLogs: speakingLogsData,
          writingTopics: writingTopicsData,
          writingLogs: writingLogsData,
          customAdventure: {
            chapters: adventureService.getChapters(),
            badges: adventureService.getCustomBadges()
          }
        };
        const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const sanitizedName = currentUser.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `Vocab-Pro-Backup_${sanitizedName}_${dateStr}.json`;
        
        a.click();
        URL.revokeObjectURL(url);
        const now = Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(now));
        setLastBackupTime(now);
    };
    
    const handleRestore = () => {
        console.log("useDataActions: handleRestore triggered.");
        if (!currentUser) {
            console.error("useDataActions: No current user, aborting restore.");
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';

        input.onchange = async (e) => {
            // Clean up the input element from the DOM
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }

            try {
                console.log("useDataActions: onchange event fired."); // Added for debugging
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) {
                    console.log("useDataActions: No file selected.");
                    return;
                }
                console.log(`useDataActions: File selected: ${file.name}. Processing...`);
                const result = await processJsonImport(file, currentUser.id, true);
                console.log("useDataActions: processJsonImport result:", result);
    
                if (result.type === 'success') {
                    showToast('Restore successful! The app will now reload.', 'success', 2000);
                    
                    // The reload will handle re-initializing state, but we save the user first
                    // if it was part of the import.
                    if (result.updatedUser) {
                        await onUpdateUser(result.updatedUser);
                    }

                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('force-reload'));
                    }, 2000); // Give user time to read the toast
                } else {
                    showToast(`Restore data failed. Reason: ${result.detail || result.message}`, 'error', 10000);
                }
            } catch (err) {
                console.error("A fatal error occurred in the restore onchange handler:", err);
                showToast("A fatal error occurred. Check the console for details.", 'error', 10000);
            }
        };
        
        // Append to DOM to prevent garbage collection issues before click
        document.body.appendChild(input);
        input.click();
        
        // If the user cancels, the input may remain in the DOM, but it's hidden and harmless.
        // It will be gone on next page load. This is safer than complex cancellation detection.
    };

    const handleLibraryReset = async () => {
        if (!currentUser) return;
        setIsResetting(true);
        setResetStep('Cleaning library...');
        try {
            await dataStore.clearVocabularyOnly();
            sessionStorage.removeItem('vocab_pro_skip_seed');
            await dataStore.seedDatabaseIfEmpty(true);
            await dataStore.init(currentUser.id); // Re-initialize store with new data
            refreshGlobalStats(); // Pulls from the fresh cache
            setView('DASHBOARD');
        } catch (err) {
            window.location.reload();
        } finally {
            setIsResetting(false);
        }
    };

    const updateWord = async (updatedWord: VocabularyItem) => {
        await dataStore.saveWord(updatedWord);
        // If the word currently in the global view modal is the one being updated,
        // we need to update the state to force a re-render of the modal with the new data.
        if (globalViewWord && globalViewWord.id === updatedWord.id) {
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
    };
};