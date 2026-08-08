
import React, { useState, useCallback, createElement, Fragment } from 'react';
import { User, StudyItem, DataScope } from '../types';
import * as dataStore from '../dataStore';
import { processJsonImport, generateJsonExport, ImportResult } from '../../utils/dataHandler';
import { useToast } from '../../contexts/ToastContext';

import { calculateMasteryScore } from '../../utils/srs';
import { restoreFromServer } from '../../services/backupService';
import { saveBackupToGoogleDrive, restoreBackupFromGoogleDrive, getGoogleDriveErrorDisplay } from '../../services/googleDriveBackupService';
import { getConfig, saveConfig } from '../../app/settingsManager';

interface UseDataActionsProps {
    currentUser: User | null;
    setView: (view: any) => void;
    refreshGlobalStats: () => void;
    sessionWords: StudyItem[] | null;
    setSessionWords: React.Dispatch<React.SetStateAction<StudyItem[] | null>>;

    globalViewWord: StudyItem | null;
    setGlobalViewWord: React.Dispatch<React.SetStateAction<StudyItem | null>>;
    onUpdateUser: (user: User) => Promise<void>;

}

export const useDataActions = (props: UseDataActionsProps) => {
    const { currentUser, setView, refreshGlobalStats, sessionWords, setSessionWords, globalViewWord, setGlobalViewWord, onUpdateUser } = props;
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
            planning: true, questionBank: true
        };
        
        const exportData = await generateJsonExport(currentUser.id, currentUser, fullScope);

        // Dashboard/local export should be human-readable.
        const prettyJson = JSON.stringify(exportData, null, 2);
        const blob = new Blob([prettyJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vocab-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const now = Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(now));
        localStorage.setItem('vocab_pro_local_last_modified', String(now));
        refreshBackupTime();
        sessionStorage.removeItem('vocab_pro_just_restored');
        showToast('Backup file downloaded.', 'success');
    };

    const handleGoogleDriveBackup = async () => {
        if (!currentUser) return;
        try {
            await saveBackupToGoogleDrive(currentUser.id, currentUser);
            refreshBackupTime();
            showToast('Saved to Google Drive.', 'success');
        } catch (error) {
            console.error('[Google Drive Backup] Failed:', error);
            const errorDisplay = getGoogleDriveErrorDisplay(error);
            if (errorDisplay.enableUrl) {
                showToast(createElement(
                    Fragment,
                    null,
                    createElement('span', null, 'Google Drive API is not enabled. '),
                    createElement(
                        'a',
                        {
                            href: errorDisplay.enableUrl,
                            target: '_blank',
                            rel: 'noreferrer',
                            className: 'underline font-black',
                        },
                        'Enable it here'
                    )
                ), 'error', 10000);
            } else {
                showToast(errorDisplay.message || 'Google Drive backup failed.', 'error');
            }
        }
    };
    
    const handleRestoreSuccess = async (result: ImportResult, preservedConfigJson: string | null, serverMtime?: number) => {
        dataStore.cancelPendingBackup();
        
        // Lấy config vừa được processJsonImport ghi vào LocalStorage (chứa settings từ bản backup)
        const restoredConfig = getConfig();

        if (preservedConfigJson) {
            try {
                const oldActiveConfig = JSON.parse(preservedConfigJson);
                // CHỈ giữ lại phần 'server' để không bị mất kết nối tới server hiện tại
                // Các phần khác (audioCoach, srs, interface...) sẽ dùng từ bản backup
                const finalConfig = {
                    ...restoredConfig,
                    server: oldActiveConfig.server 
                };
                localStorage.setItem('vocab_pro_system_config', JSON.stringify(finalConfig));
                window.dispatchEvent(new Event('config-updated'));
            } catch (e) {
                console.error("[Restore] Failed to merge config", e);
            }
        }

        sessionStorage.setItem('vocab_pro_just_restored', 'true');
        
        const syncTime = serverMtime || result.backupTimestamp || Date.now();

        // CRITICAL FIX: Ensure DataStore reloads from IndexedDB into Memory immediately
        // This fixes the issue where local restore required a manual refresh
        const targetUserId = result.updatedUser?.id || currentUser?.id;
        if (targetUserId) {
            await dataStore.forceReload(targetUserId);
        }

        if (result.updatedUser) {
            localStorage.setItem('vocab_pro_current_user_id', result.updatedUser.id);
            localStorage.setItem('vocab_pro_current_user_name', result.updatedUser.name);
            await onUpdateUser(result.updatedUser);
        }

        // Keep local sync markers aligned with the restored backup after any restore-time writes.
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(syncTime));
        localStorage.setItem('vocab_pro_local_last_modified', String(syncTime));

        const config = getConfig();
        saveConfig({ ...config, sync: { ...config.sync, lastSyncTime: syncTime } }, true);
        
        showToast('Restore successful!', 'success', 2000);
        refreshGlobalStats();
        
        // Use Soft UI Reload (React Key Reset) instead of Hard Browser Reload
        window.dispatchEvent(new Event('vocab-pro-restore-complete'));
        window.dispatchEvent(new Event('vocab-pro-force-ui-reload'));

        setTimeout(() => {
            (window as any).isRestoring = false;
        }, 1000);
    };

    const restoreFromServerAction = async (forcedIdentifier?: string, serverMtime?: number) => {
        const currentActiveConfig = getConfig();
        const preservedConfigJson = JSON.stringify(currentActiveConfig);

        (window as any).isRestoring = true;
        dataStore.cancelPendingBackup();

        try {
            const identifier = forcedIdentifier || (currentUser ? currentUser.name || currentUser.id : null);
            if (!identifier) {
                (window as any).isRestoring = false;
                return;
            }

            await dataStore.wipeAllLocalData();
            
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

    const restoreFromGoogleDriveAction = async () => {
        const currentActiveConfig = getConfig();
        const preservedConfigJson = JSON.stringify(currentActiveConfig);

        (window as any).isRestoring = true;
        dataStore.cancelPendingBackup();
        showToast('Downloading from Google Drive...', 'info', 10000);

        try {
            const targetUserId = currentUser?.id || 'temp-google-drive-restore';
            const targetUserName = currentUser?.name || targetUserId;

            await dataStore.wipeAllLocalData();

            if (preservedConfigJson) {
                localStorage.setItem('vocab_pro_system_config', preservedConfigJson);
                window.dispatchEvent(new Event('config-updated'));
            }

            const result = await restoreBackupFromGoogleDrive(targetUserId, targetUserName);
            if (result && result.type === 'success') {
                await handleRestoreSuccess(result, preservedConfigJson);
            } else {
                showToast('Google Drive restore failed.', 'error');
                (window as any).isRestoring = false;
            }
        } catch (err) {
            console.error('[Google Drive Restore] Failed:', err);
            const errorDisplay = getGoogleDriveErrorDisplay(err);
            if (errorDisplay.enableUrl) {
                showToast(createElement(
                    Fragment,
                    null,
                    createElement('span', null, 'Google Drive API is not enabled. '),
                    createElement(
                        'a',
                        {
                            href: errorDisplay.enableUrl,
                            target: '_blank',
                            rel: 'noreferrer',
                            className: 'underline font-black',
                        },
                        'Enable it here'
                    )
                ), 'error', 10000);
            } else {
                showToast(errorDisplay.message || 'Google Drive restore encountered a fatal error.', 'error');
            }
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
                    planning: true, questionBank: true
                };

                (window as any).isRestoring = true;
                
                const tempId = currentUser ? currentUser.id : 'temp-restore';
                const result = await processJsonImport(file, tempId, fullScope);
    
                if (result.type === 'success') {
                    await handleRestoreSuccess(result, preservedConfigJson);
                    // Removed window.location.reload() to make it "less expensive" and smoother
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
        } catch {
            window.location.reload();
        }
    };

    const updateWord = async (updatedWord: StudyItem) => {
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
    const bulkUpdateWords = async (updatedWords: StudyItem[]) => { await dataStore.bulkSaveWords(updatedWords); };

    return {
        lastBackupTime, refreshBackupTime, handleBackup, handleGoogleDriveBackup, restoreFromServerAction, restoreFromGoogleDriveAction,
        triggerLocalRestore, handleLibraryReset, updateWord, deleteWord, bulkDeleteWords, bulkUpdateWords
    };
};
