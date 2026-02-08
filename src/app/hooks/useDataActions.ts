
import React, { useState, useCallback } from 'react';
import { User, VocabularyItem, DataScope } from '../types';
import * as dataStore from '../dataStore';
import { processJsonImport, generateJsonExport, ImportResult } from '../../utils/dataHandler';
import { useToast } from '../../contexts/ToastContext';
import * as db from '../db';
import { calculateMasteryScore } from '../../utils/srs';
import { restoreFromServer } from '../../services/backupService';
import { getConfig, saveConfig } from '../../app/settingsManager';

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
        
        const fullScope: DataScope = customScope || {
            user: true, vocabulary: true, lesson: true, reading: true, writing: true, 
            speaking: true, listening: true, mimic: true, wordBook: true, 
            planning: true
        };
        
        await generateJsonExport(currentUser.id, currentUser, fullScope);
        
        const now = Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(now));
        localStorage.setItem('vocab_pro_local_last_modified', String(now));
        refreshBackupTime();
        sessionStorage.removeItem('vocab_pro_just_restored');
    };
    
    const handleRestoreSuccess = async (result: ImportResult, preservedConfigJson: string | null, serverMtime?: number) => {
        dataStore.cancelPendingBackup();
        
        if (preservedConfigJson) {
            localStorage.setItem('vocab_pro_system_config', preservedConfigJson);
            window.dispatchEvent(new Event('config-updated'));
        }

        sessionStorage.setItem('vocab_pro_just_restored', 'true');
        
        // CRITICAL: Set local modified time to match the server's time
        const syncTime = serverMtime || result.backupTimestamp || Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(syncTime));
        localStorage.setItem('vocab_pro_local_last_modified', String(syncTime));
        
        const config = getConfig();
        saveConfig({ ...config, sync: { ...config.sync, lastSyncTime: syncTime } }, true);

        if (result.updatedUser) {
            localStorage.setItem('vocab_pro_current_user_id', result.updatedUser.id);
            localStorage.setItem('vocab_pro_current_user_name', result.updatedUser.name);
            // Refresh app user state
            await onUpdateUser(result.updatedUser);
        }
        
        showToast('Restore successful!', 'success', 2000);
        
        // Refresh global stats to reflect new data without a page reload
        refreshGlobalStats();
        
        // Dispatch completion event to UI controllers immediately to clear any previous states
        window.dispatchEvent(new Event('vocab-pro-restore-complete'));
        
        // Final UI refresh notification
        window.dispatchEvent(new Event('vocab-pro-force-ui-reload'));

        // Delay clearing the restoration flag to swallow trailing datastore update events from the import process
        setTimeout(() => {
            (window as any).isRestoring = false;
        }, 1000);
    };

    const restoreFromServerAction = async (forcedIdentifier?: string, serverMtime?: number) => {
        const currentActiveConfig = getConfig();
        const preservedConfigJson = JSON.stringify(currentActiveConfig);

        // Set global flag to prevent backup triggers during restoration
        (window as any).isRestoring = true;
        dataStore.cancelPendingBackup();

        try {
            const identifier = forcedIdentifier || (currentUser ? currentUser.name || currentUser.id : null);
            if (!identifier) {
                (window as any).isRestoring = false;
                return;
            }

            // FRESH INSTALL SIMULATION: Wipe entire database and local storage before applying server data
            await dataStore.wipeAllLocalData();
            
            // Immediately restore server connection config so the following restore call can work
            if (preservedConfigJson) {
                localStorage.setItem('vocab_pro_system_config', preservedConfigJson);
                window.dispatchEvent(new Event('config-updated'));
            }

            const result = await restoreFromServer(identifier);
            if (result && result.type === 'success') {
                await handleRestoreSuccess(result, preservedConfigJson, serverMtime);
            } else {
                showToast("Server restore failed. Manual restore may be required.", "error");
                (window as any).isRestoring = false;
            }
        } catch (err) {
            console.error("[DataActions] Restore error:", err);
            showToast("Restore encountered a fatal error.", "error");
            (window as any).isRestoring = false;
        }
    };

    const triggerLocalRestore = () => {
        const currentActiveConfig = getConfig();
        const preservedConfigJson = JSON.stringify(currentActiveConfig);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';

        input.onchange = async (e) => {
            if (input.parentNode) input.parentNode.removeChild(input);

            try {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                
                const fullScope: DataScope = {
                    user: true, vocabulary: true, lesson: true, reading: true, writing: true, 
                    speaking: true, listening: true, mimic: true, wordBook: true, 
                    planning: true
                };

                // Set flag for local restore as well
                (window as any).isRestoring = true;
                
                const tempId = currentUser ? currentUser.id : 'temp-restore';
                const result = await processJsonImport(file, tempId, fullScope);
    
                if (result.type === 'success') {
                    await handleRestoreSuccess(result, preservedConfigJson);
                    // Local file restores still trigger reload for absolute safety as they aren't part of the "fresh server install" flow
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showToast(`Restore failed: ${result.message}`, 'error', 5000);
                    (window as any).isRestoring = false;
                }
            } catch (err) {
                console.error("Fatal error during local restore:", err);
                (window as any).isRestoring = false;
            }
        };
        
        document.body.appendChild(input);
        input.click();
    };

    const handleLibraryReset = async () => {
        if (!currentUser) return;
        try {
            await dataStore.clearVocabularyOnly();
            sessionStorage.removeItem('vocab_pro_skip_seed');
            await dataStore.seedDatabaseIfEmpty(true);
            await dataStore.forceReload(currentUser.id);
            refreshGlobalStats(); 
            setView('DASHBOARD');
        } catch (err) {
            window.location.reload();
        }
    };

    const updateWord = async (updatedWord: VocabularyItem) => {
        await dataStore.saveWord(updatedWord);
        if (sessionWords) {
            setSessionWords(prevWords => (prevWords || []).map(w => w.id === updatedWord.id ? updatedWord : w));
        }
        if (globalViewWord && globalViewWord.id === updatedWord.id) {
            updatedWord.masteryScore = calculateMasteryScore(updatedWord);
            setGlobalViewWord(updatedWord);
        }
    };
    
    const deleteWord = async (id: string) => {
        if (globalViewWord && globalViewWord.id === id) setGlobalViewWord(null);
        await dataStore.deleteWord(id);
    };

    const bulkDeleteWords = async (ids: string[]) => { await dataStore.bulkDeleteWords(ids); };
    const bulkUpdateWords = async (updatedWords: VocabularyItem[]) => { await dataStore.bulkSaveWords(updatedWords); };

    return {
        lastBackupTime, refreshBackupTime, handleBackup, restoreFromServerAction,
        triggerLocalRestore, handleLibraryReset, updateWord, deleteWord, bulkDeleteWords, bulkUpdateWords
    };
};
