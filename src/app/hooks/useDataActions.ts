import React, { useState, useCallback } from 'react';
import { User, VocabularyItem, DataScope } from '../types';
import * as dataStore from '../dataStore';
import { processJsonImport, generateJsonExport, ImportResult } from '../../utils/dataHandler';
import { useToast } from '../../contexts/ToastContext';
import * as db from '../db';
// Import calculateMasteryScore to fix reference error on line 153
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
        // Also update local modified time when we backup (sync) to server
        localStorage.setItem('vocab_pro_local_last_modified', String(now));
        refreshBackupTime();
        // Clear restore suppression if any
        sessionStorage.removeItem('vocab_pro_just_restored');
    };
    
    // --- Direct Restore Actions (UI must confirm first) ---
    
    const handleRestoreSuccess = async (result: ImportResult, preservedConfigJson: string | null, serverMtime?: number) => {
        console.log("[RESTORE_DEBUG] handleRestoreSuccess started. serverMtime:", serverMtime);
        
        // --- FIX LỖI DISCONNECT: Ghi đè lại cấu hình server từ RAM ---
        if (preservedConfigJson) {
            console.log("[RESTORE_DEBUG] Re-applying preserved config from RAM.");
            localStorage.setItem('vocab_pro_system_config', preservedConfigJson);
            // Phát event để hệ thống reconnect ngay lập tức
            window.dispatchEvent(new Event('config-updated'));
        }

        sessionStorage.setItem('vocab_pro_just_restored', 'true');
        
        // --- FIX LỖI SAI TIMESTAMP: Cập nhật local_last_modified khớp với server ---
        // Nếu có serverMtime (thời gian file trên server), dùng nó. Nếu không dùng thời gian hiện tại.
        // Không dùng result.backupTimestamp vì đó là thời gian tạo JSON, thường cũ hơn thời gian file trên server.
        const syncTime = serverMtime || Date.now();
        localStorage.setItem('vocab_pro_last_backup_timestamp', String(syncTime));
        localStorage.setItem('vocab_pro_local_last_modified', String(syncTime));
        
        // Cập nhật config để hệ thống biết vừa sync xong
        const config = getConfig();
        saveConfig({ ...config, sync: { ...config.sync, lastSyncTime: syncTime } }, true);

        if (result.updatedUser) {
            localStorage.setItem('vocab_pro_current_user_id', result.updatedUser.id);
            localStorage.setItem('vocab_pro_current_user_name', result.updatedUser.name);
        }
        
        showToast('Restore successful! Reloading...', 'success', 2000);
        
        // Không gọi forceReload vì ta sẽ reload toàn bộ trang web
        setTimeout(() => {
            console.log("[RESTORE_DEBUG] Executing final page reload.");
            window.location.reload();
        }, 800);
    };

    const restoreFromServerAction = async (forcedIdentifier?: string, serverMtime?: number) => {
        // 1. Capture cấu hình ĐANG HOẠT ĐỘNG vào RAM
        const currentActiveConfig = getConfig();
        const preservedConfigJson = JSON.stringify(currentActiveConfig);
        console.log("[RESTORE_DEBUG] restoreFromServerAction: Captured active config.");

        // Chặn hiện thông báo "Unsaved Changes" trong khi đang ghi đè dữ liệu
        (window as any).isRestoring = true;

        try {
            const identifier = forcedIdentifier || (currentUser ? currentUser.name || currentUser.id : null);
            if (!identifier) return;

            const result = await restoreFromServer(identifier);
            if (result && result.type === 'success') {
                console.log("[RESTORE_DEBUG] Server restore API success.");
                await handleRestoreSuccess(result, preservedConfigJson, serverMtime);
            } else {
                showToast("Server restore failed. Falling back to local file...", "error");
                triggerLocalRestore();
            }
        } catch (err) {
            console.error("[UI] Error during server restore call:", err);
            triggerLocalRestore();
        } finally {
            setTimeout(() => { (window as any).isRestoring = false; }, 2000);
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
                    calendar: true, planning: true
                };

                const tempId = currentUser ? currentUser.id : 'temp-restore';
                const result = await processJsonImport(file, tempId, fullScope);
    
                if (result.type === 'success') {
                    console.log("[RESTORE_DEBUG] Local file import success.");
                    await handleRestoreSuccess(result, preservedConfigJson);
                } else {
                    showToast(`Restore failed: ${result.message}`, 'error', 5000);
                }
            } catch (err) {
                console.error("Fatal error during local restore:", err);
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
        restoreFromServerAction,
        triggerLocalRestore,
        handleLibraryReset,
        updateWord,
        deleteWord,
        bulkDeleteWords,
        bulkUpdateWords,
    };
};
