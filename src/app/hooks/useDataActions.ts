
import React, { useState, useCallback } from 'react';
import { User, VocabularyItem, DataScope } from '../types';
import * as dataStore from '../dataStore';
import { processJsonImport, generateJsonExport, ImportResult } from '../../utils/dataHandler';
import { useToast } from '../../contexts/ToastContext';
import * as db from '../db';
// Import calculateMasteryScore to fix reference error on line 153
import { calculateMasteryScore } from '../../utils/srs';
import { restoreFromServer } from '../../services/backupService';
import { getConfig } from '../../app/settingsManager';

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
    serverStatus?: 'connected' | 'disconnected';
}

export const useDataActions = (props: UseDataActionsProps) => {
    const { currentUser, setView, refreshGlobalStats, sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord, onUpdateUser, serverStatus } = props;
    const { showToast } = useToast();

    const [isResetting, setIsResetting] = useState(false);
    const [resetStep, setResetStep] = useState('');

    // Helper to get latest timestamp from either local backup or server sync
    const getLastBackup = () => {
        const local = Number(localStorage.getItem('vocab_pro_last_backup_timestamp')) || 0;
        const config = getConfig(); 
        const server = config.sync?.lastSyncTime || 0;
        const max = Math.max(local, server);
        return max > 0 ? max : null;
    };

    const [lastBackupTime, setLastBackupTime] = useState<number | null>(getLastBackup());

    const refreshBackupTime = useCallback(() => {
        setLastBackupTime(getLastBackup());
    }, []);

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
            calendar: true,
            planning: true
        };
        
        await generateJsonExport(currentUser.id, currentUser, fullScope);
        
        const now = Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(now));
        refreshBackupTime();
        // Clear restore suppression if any
        sessionStorage.removeItem('vocab_pro_just_restored');
    };
    
    // --- Direct Restore Actions (UI must confirm first) ---
    
    const handleRestoreSuccess = async (result: ImportResult) => {
        sessionStorage.setItem('vocab_pro_just_restored', 'true');
        
        // Mark backup as current since we just restored state
        const backupTime = result.backupTimestamp || Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(backupTime));
        refreshBackupTime();
        
        showToast('Restore successful! Reloading application...', 'success', 2000);
        
        if (result.updatedUser) {
            await onUpdateUser(result.updatedUser);
            localStorage.setItem('vocab_pro_current_user_id', result.updatedUser.id);
            localStorage.setItem('vocab_pro_current_user_name', result.updatedUser.name);
            // Reload with correct ID
            await dataStore.forceReload(result.updatedUser.id);
        } else {
            await dataStore.forceReload(currentUser!.id);
        }
        
        refreshGlobalStats();
        
        // Dispatch custom event to signal restore completion with a delay to override datastore-updated
        setTimeout(() => {
            window.dispatchEvent(new Event('vocab-pro-restore-complete'));
        }, 600);
        
        // Reload page to ensure fresh state (reset all global hooks and caches)
        setTimeout(() => window.location.reload(), 1200);
    };

    const restoreFromServerAction = async (forcedIdentifier?: string) => {
        // Allow restore even if no currentUser (e.g. during fresh start or switch user flow)
        // if (!currentUser && !forcedIdentifier) return; 
        
        // Set global flag to suppress "Unsaved Changes" highlight in sidebar during bulk writes
        (window as any).isRestoring = true;

        try {
            // Use forced identifier, or Name, or fallback to ID
            const identifier = forcedIdentifier || (currentUser ? currentUser.name || currentUser.id : null);
            
            if (!identifier) {
                console.warn("[DataActions] No identifier found for restore.");
                return;
            }

            const result = await restoreFromServer(identifier);
            
            if (result && result.type === 'success') {
                sessionStorage.setItem('vocab_pro_just_restored', 'true');

                // IMMEDIATELY update the user state in the UI to reflect the switched user (name/avatar)
                if (result.updatedUser) {
                     await onUpdateUser(result.updatedUser);
                     localStorage.setItem('vocab_pro_current_user_id', result.updatedUser.id);
                     localStorage.setItem('vocab_pro_current_user_name', result.updatedUser.name);
                }

                // Mark backup as current
                const backupTime = result.backupTimestamp || Date.now();
                localStorage.setItem('vocab_pro_last_backup_timestamp', String(backupTime));
                refreshBackupTime();
                
                showToast("Restored from Server successfully! Reloading...", "success");
                
                // Dispatch event with delay
                setTimeout(() => {
                    window.dispatchEvent(new Event('vocab-pro-restore-complete'));
                }, 600);
                
                // Reload to ensure all subsystems (audio, settings) re-mount with new user context
                setTimeout(() => window.location.reload(), 1200);
            } else {
                showToast("Server restore failed. Falling back to local file...", "error");
                triggerLocalRestore();
            }
        } catch (err) {
            console.error("[UI] Error during server restore call:", err);
            triggerLocalRestore();
        } finally {
            // Clear flag after a safety buffer
            setTimeout(() => { (window as any).isRestoring = false; }, 2000);
        }
    };

    const triggerLocalRestore = () => {
        // if (!currentUser) return; // Allow even if not logged in
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
                    calendar: true,
                    planning: true
                };

                // Use current user ID as placeholder if available, otherwise generic. 
                // processJsonImport extracts real ID from file anyway.
                const tempId = currentUser ? currentUser.id : 'temp-restore';
                const result = await processJsonImport(file, tempId, fullScope);
    
                if (result.type === 'success') {
                    await handleRestoreSuccess(result);
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
        if (sessionWords) {
            setSessionWords(prevWords => 
                (prevWords || []).map(w => w.id === updatedWord.id ? updatedWord : w)
            );
        }
        if (globalViewWord && globalViewWord.id === updatedWord.id) {
            updatedWord.masteryScore = calculateMasteryScore(updatedWord);
            setGlobalViewWord(updatedWord);
        }
    };
    
    const deleteWord = async (id: string) => {
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
        refreshBackupTime,
        handleBackup,
        restoreFromServerAction, // Exposed for explicit calling
        triggerLocalRestore,     // Exposed for explicit calling
        handleLibraryReset,
        updateWord,
        deleteWord,
        bulkDeleteWords,
        bulkUpdateWords,
    };
};
