
import { useState, useCallback, useEffect, useRef } from 'react';
import { AppView, User, VocabularyItem, DiscoverGame } from './types';
import { useToast } from '../contexts/ToastContext';
import { useAuthAndUser } from './hooks/useAuthAndUser';
import { useSession } from './hooks/useSession';
import { useGamification, calculateWordDifficultyXp as movedCalc } from './hooks/useGamification';
import { useDataFetching } from './hooks/useDataFetching';
import { useDataActions } from './hooks/useDataActions';
import { getDueWords, getNewWords, saveUser } from './db';
import * as dataStore from './dataStore';
import * as db from './db';
import { getConfig, getServerUrl, saveConfig } from './settingsManager';
import { performAutoBackup, fetchServerBackups, ServerBackupItem } from '../services/backupService';
import { DEFAULT_USER_ID } from '../data/user_data';
import { scanForServer } from '../utils/networkScanner';
import { generateMap } from '../data/adventure_map';

export const calculateWordDifficultyXp = movedCalc;

export const useAppController = () => {
    const { showToast } = useToast();
    
    const { currentUser, isLoaded, handleLogin, handleLogout, handleUpdateUser, setCurrentUser, shouldSkipAuth } = useAuthAndUser();
    const [view, setView] = useState<AppView>('AUTH');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [globalViewWord, setGlobalViewWord] = useState<VocabularyItem | null>(null);
    const [initialListFilter, setInitialListFilter] = useState<string | null>(null);
    const [forceExpandAdd, setForceExpandAdd] = useState(false);
    const [lastMasteryScoreUpdateTimestamp, setLastMasteryScoreUpdateTimestamp] = useState(Date.now());
    
    const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected'>('disconnected');
    const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
    const [connectionScanStatus, setConnectionScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
    const [scanningUrl, setScanningUrl] = useState(''); 
    const hasCheckedInitialConnection = useRef(false);
    const scanAbortControllerRef = useRef<AbortController | null>(null);

    const [syncPrompt, setSyncPrompt] = useState<{ isOpen: boolean; type: 'push' | 'restore'; localDate: string; serverDate: string; serverId: string; serverMtime: number } | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const hasCheckedSyncThisSession = useRef(false);
    
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [nextAutoBackupTime, setNextAutoBackupTime] = useState<number | null>(null);

    const [writingContextWord, setWritingContextWord] = useState<VocabularyItem | null>(null);
    const [targetLessonId, setTargetLessonId] = useState<string | null>(null);
    const consumeTargetLessonId = useCallback(() => setTargetLessonId(null), []);

    // NEW: State for deep-linking to a specific tag in Lesson Library
    const [targetLessonTag, setTargetLessonTag] = useState<string | null>(null);
    const consumeTargetLessonTag = useCallback(() => setTargetLessonTag(null), []);

    // NEW: State for deep-linking to specific game
    const [targetGameMode, setTargetGameMode] = useState<DiscoverGame | null>(null);
    const consumeTargetGameMode = useCallback(() => setTargetGameMode(null), []);

    const [planningAction, setPlanningAction] = useState<'AI' | 'IMPORT' | null>(null);
    const consumePlanningAction = useCallback(() => setPlanningAction(null), []);

    const [autoRestoreCandidates, setAutoRestoreCandidates] = useState<ServerBackupItem[]>([]);
    const [isAutoRestoreOpen, setIsAutoRestoreOpen] = useState(false);
    const hasCheckedAutoRestore = useRef(false);

    const [isResetting, setIsResetting] = useState(false);
    const [resetStep, setResetStep] = useState('');

    const { sessionWords, setSessionWords, sessionType, sessionFocus, startSession, clearSessionState } = useSession({ setView, setIsSidebarOpen });
    const { stats, wotd, setWotd, apiUsage, refreshGlobalStats, isWotdComposed, randomizeWotd } = useDataFetching({ currentUser, view, onUpdateUser: handleUpdateUser });

    const checkServerConnection = useCallback(async (allowScan = false, urlOverride?: string, forceScan = false, signal?: AbortSignal) => {
        const config = getConfig();
        const url = urlOverride || getServerUrl(config);

        const tryConnect = async (targetUrl: string) => {
             const controller = new AbortController();
             const id = setTimeout(() => controller.abort(), 1200); 
             const onAbort = () => controller.abort();
             signal?.addEventListener('abort', onAbort);

             try {
                 const res = await fetch(`${targetUrl}/api/health`, { 
                     signal: controller.signal,
                     mode: 'cors'
                 });
                 clearTimeout(id);
                 signal?.removeEventListener('abort', onAbort);
                 return res.ok;
             } catch {
                 clearTimeout(id);
                 signal?.removeEventListener('abort', onAbort);
                 return false;
             }
        };

        if (!forceScan) {
            setScanningUrl(url);
            const isConnected = await tryConnect(url);
            if (isConnected) {
                setServerStatus('connected');
                if (!config.sync.autoBackupEnabled) {
                    saveConfig({ ...config, sync: { ...config.sync, autoBackupEnabled: true } }, true);
                }
                if (urlOverride) {
                     const newConfig = { ...config, server: { ...config.server, useCustomUrl: true, customUrl: urlOverride }, sync: { ...config.sync, autoBackupEnabled: true } };
                     saveConfig(newConfig, true);
                     showToast(`Connected to ${urlOverride}`, "success");
                }
                return true;
            }
        }

        if ((!urlOverride && allowScan) || forceScan) {
            if (signal?.aborted) return false;
            const scanResult = await scanForServer((url) => { setScanningUrl(url); }, signal);
            if (scanResult) {
                const newConfig = { 
                    ...config, 
                    server: { ...config.server, host: scanResult.host, port: scanResult.port, useCustomUrl: false },
                    sync: { ...config.sync, autoBackupEnabled: true }
                };
                saveConfig(newConfig, true); 
                setServerStatus('connected');
                showToast(`Server found at ${scanResult.host}:${scanResult.port}`, "success");
                return true;
            }
        }
        
        if (!signal?.aborted) {
            setServerStatus('disconnected');
        }
        return false;
    }, [showToast]);

    const handleScanAndConnect = async (urlOverride?: string) => {
        if (scanAbortControllerRef.current) scanAbortControllerRef.current.abort();
        scanAbortControllerRef.current = new AbortController();
        const signal = scanAbortControllerRef.current.signal;
        setConnectionScanStatus('scanning');
        try {
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, 800);
                signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
            });
            const success = await checkServerConnection(!urlOverride, urlOverride, !urlOverride, signal);
            if (signal.aborted) return false;
            if (success) {
                setConnectionScanStatus('success');
                setTimeout(() => setIsConnectionModalOpen(false), 1000);
                return true;
            } else {
                setConnectionScanStatus('failed');
                return false;
            }
        } catch (e: any) {
            if (e.message === 'aborted') return false;
            setConnectionScanStatus('failed');
            return false;
        }
    };
    
    const handleStopScan = () => {
        if (scanAbortControllerRef.current) { scanAbortControllerRef.current.abort(); scanAbortControllerRef.current = null; }
        setConnectionScanStatus('failed');
    };
    
    const isStrictDefaultUser = useCallback(() => {
        return currentUser && currentUser.id === DEFAULT_USER_ID && currentUser.name === 'Vocab Master';
    }, [currentUser]);

    useEffect(() => {
        if (isLoaded && !hasCheckedInitialConnection.current) {
             hasCheckedInitialConnection.current = true;
             const isDefault = isStrictDefaultUser();
             if (isDefault) { setIsConnectionModalOpen(true); setConnectionScanStatus('scanning'); }
             checkServerConnection(true).then((connected) => {
                 if (connected) {
                     setServerStatus('connected');
                     if (isDefault) { setConnectionScanStatus('success'); setTimeout(() => setIsConnectionModalOpen(false), 800); }
                 } else if (isDefault) { setConnectionScanStatus('failed'); }
             });
             const interval = setInterval(() => checkServerConnection(false), 30000);
             window.addEventListener('config-updated', () => checkServerConnection(false));
             return () => { clearInterval(interval); window.removeEventListener('config-updated', () => checkServerConnection(false)); };
        }
    }, [isLoaded, checkServerConnection, isStrictDefaultUser]);

    useEffect(() => {
        const performSyncCheck = async () => {
            if (!isLoaded || serverStatus !== 'connected' || !currentUser || hasCheckedSyncThisSession.current || isConnectionModalOpen || isAutoRestoreOpen) return;
            hasCheckedSyncThisSession.current = true;
            try {
                const backups = await fetchServerBackups();
                const identifier = currentUser.name || currentUser.id;
                const userBackup = backups.find(b => b.id === identifier || b.name === identifier);
                if (userBackup) {
                    const serverTime = new Date(userBackup.date).getTime();
                    const localTime = Number(localStorage.getItem('vocab_pro_local_last_modified') || 0);
                    const THRESHOLD = 2000;
                    if (serverTime > localTime + THRESHOLD) {
                        setSyncPrompt({ isOpen: true, type: 'restore', localDate: localTime === 0 ? 'Never' : new Date(localTime).toLocaleString(), serverDate: new Date(serverTime).toLocaleString(), serverId: userBackup.id, serverMtime: serverTime });
                    } else if (localTime > serverTime + THRESHOLD) {
                        setSyncPrompt({ isOpen: true, type: 'push', localDate: new Date(localTime).toLocaleString(), serverDate: new Date(serverTime).toLocaleString(), serverId: userBackup.id, serverMtime: serverTime });
                    }
                }
            } catch (e) { console.warn("[Sync] Initial check failed:", e); }
        };
        const t = setTimeout(performSyncCheck, 2000);
        return () => clearTimeout(t);
    }, [isLoaded, serverStatus, currentUser?.id, isConnectionModalOpen, isAutoRestoreOpen]);
    
    useEffect(() => {
        const checkForBackups = async () => {
             if (hasCheckedAutoRestore.current) return;
             const isSuppressed = sessionStorage.getItem('vocab_pro_suppress_auto_restore') === 'true';
             if (isLoaded && serverStatus === 'connected' && isStrictDefaultUser() && !isConnectionModalOpen && !isSuppressed) {
                 hasCheckedAutoRestore.current = true;
                 try {
                     const backups = await fetchServerBackups();
                     if (backups && backups.length > 0) { setAutoRestoreCandidates(backups); setIsAutoRestoreOpen(true); }
                 } catch (e) { console.warn("[AutoRestore] Failed to fetch backups on init:", e); }
             }
        };
        const t = setTimeout(checkForBackups, 1000);
        return () => clearTimeout(t);
    }, [isLoaded, serverStatus, isStrictDefaultUser, isConnectionModalOpen]);

    const { lastBackupTime, refreshBackupTime, handleBackup, restoreFromServerAction, triggerLocalRestore, handleLibraryReset, deleteWord, bulkDeleteWords, bulkUpdateWords } = useDataActions({
        currentUser, setView, refreshGlobalStats,
        sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord,
        onUpdateUser: handleUpdateUser,
        serverStatus
    });
    
    const handleAutoRestoreAction = async (identifier?: string) => {
        setSyncPrompt(null); setIsAutoRestoreOpen(false); setIsSyncing(true);
        try {
            const backups = await fetchServerBackups();
            const target = backups.find(b => b.id === identifier);
            const mtime = target ? new Date(target.date).getTime() : undefined;
            await restoreFromServerAction(identifier, mtime);
            setIsSyncing(false);
        } catch (e) { setIsSyncing(false); showToast("Restore failed.", "error"); }
    };

    const handleLocalRestoreSetup = () => { setIsAutoRestoreOpen(false); triggerLocalRestore(); };

    const handleNewUserSetup = async (e?: any) => {
        sessionStorage.setItem('vocab_pro_suppress_auto_restore', 'true');
        setIsAutoRestoreOpen(false); setIsResetting(true); setResetStep('Wiping all data and preparing new profile...');
        try {
            await dataStore.wipeAllLocalData(); 
            const defaultUser = await db.seedDatabaseIfEmpty(true);
            if (defaultUser) { handleLogin(defaultUser); setView('SETTINGS'); showToast("Welcome! Your data has been wiped. Please set up your new profile.", "success"); }
        } catch (e) { showToast("Failed to prepare new profile.", "error"); } finally { setIsResetting(false); }
    };

    const handleSwitchUser = async () => {
        const connected = await checkServerConnection(true);
        if (!connected) { setIsConnectionModalOpen(true); setConnectionScanStatus('failed'); return; }
        sessionStorage.removeItem('vocab_pro_suppress_auto_restore');
        hasCheckedAutoRestore.current = false;
        if (currentUser && currentUser.id !== DEFAULT_USER_ID) {
             showToast("Syncing current profile...", "info");
             try { await performAutoBackup(currentUser.id, currentUser, true); } catch (e) { showToast("Backup failed, proceeding...", "error"); }
        }
        try {
            await dataStore.clearVocabularyOnly();
            const backups = await fetchServerBackups();
            setAutoRestoreCandidates(backups);
            setIsAutoRestoreOpen(true);
        } catch (e) { showToast("Failed to fetch user list from server.", "error"); }
    };

    const handleSyncPush = async () => {
        if (!currentUser) return;
        setIsSyncing(true);
        try { await performAutoBackup(currentUser.id, currentUser, true); showToast("Cloud backup updated!", "success"); setSyncPrompt(null); } catch (e) { showToast("Push failed.", "error"); } finally { setIsSyncing(false); }
    };

    const handleSyncRestore = async () => {
        if (!syncPrompt) return;
        setIsSyncing(true);
        try { await restoreFromServerAction(syncPrompt.serverId, syncPrompt.serverMtime); setSyncPrompt(null); setIsSyncing(false); } catch (e) { showToast("Restore failed.", "error"); setIsSyncing(false); }
    };

    useEffect(() => {
         const onDataUpdate = () => {
             // Sửa: Luôn bật highlight khi có thay đổi, UI sẽ dựa vào serverStatus để hiển thị icon
             if (!(window as any).isRestoring) {
                setHasUnsavedChanges(true);
             }
         };

         const onRestoreComplete = () => { setHasUnsavedChanges(false); setNextAutoBackupTime(null); };
         
         const onBackupScheduled = (e: Event) => {
             const customEvent = e as CustomEvent;
             if (customEvent.detail && customEvent.detail.targetTime) setNextAutoBackupTime(customEvent.detail.targetTime);
         };
         
         const onBackupComplete = (e: Event) => {
             const customEvent = e as CustomEvent;
             if (customEvent.detail) {
                 if (customEvent.detail.success) { 
                     setHasUnsavedChanges(false); 
                     setNextAutoBackupTime(null); 
                     refreshBackupTime(); 
                     // Thêm: Thông báo cho người dùng khi sync ngầm xong
                     showToast("Cloud sync complete!", "success", 2000);
                 } 
                 else setHasUnsavedChanges(true);
             }
         };

         window.addEventListener('datastore-updated', onDataUpdate);
         window.addEventListener('vocab-pro-restore-complete', onRestoreComplete);
         window.addEventListener('backup-scheduled', onBackupScheduled);
         window.addEventListener('backup-complete', onBackupComplete);
         return () => {
            window.removeEventListener('datastore-updated', onDataUpdate);
            window.removeEventListener('vocab-pro-restore-complete', onRestoreComplete);
            window.removeEventListener('backup-scheduled', onBackupScheduled);
            window.removeEventListener('backup-complete', onBackupComplete);
         };
    }, [refreshBackupTime, showToast]);

    const checkEnergyRewards = async () => {
        if (!currentUser) return;
        const currentStats = dataStore.getStats(); 
        const { learned, reviewed } = currentStats.dayProgress;
        const todayStr = new Date().toISOString().split('T')[0];
        const earnedFromLearned = Math.floor(learned / 3);
        const earnedFromReviewed = Math.floor(reviewed / 10);
        const totalEarnedToday = earnedFromLearned + earnedFromReviewed;
        const adventure = currentUser.adventure;
        const lastDate = adventure.lastDailyEnergyAwardDate || '';
        let dailyAwarded = adventure.dailyEnergyAwarded || 0;
        if (lastDate !== todayStr) dailyAwarded = 0; 
        if (totalEarnedToday > dailyAwarded) {
            const diff = totalEarnedToday - dailyAwarded;
            const updatedUser: User = { ...currentUser, adventure: { ...adventure, energy: (adventure.energy || 0) + diff, dailyEnergyAwarded: totalEarnedToday, lastDailyEnergyAwardDate: todayStr } };
            await handleUpdateUser(updatedUser);
            showToast(`Daily Progress: +${diff} Energy ⚡`, 'success', 2000);
        }
    };

    useEffect(() => { if (isLoaded && currentUser) checkEnergyRewards(); }, [stats, isLoaded, currentUser?.id]); 

    const updateWordAndNotify = async (updatedWord: VocabularyItem) => {
        const oldWord = dataStore.getWordById(updatedWord.id);
        if (!oldWord || oldWord.masteryScore !== updatedWord.masteryScore) setLastMasteryScoreUpdateTimestamp(Date.now());
        await dataStore.saveWord(updatedWord);
        if (sessionWords) setSessionWords(prevWords => (prevWords || []).map(w => w.id === updatedWord.id ? updatedWord : w));
        if (globalViewWord && globalViewWord.id === updatedWord.id) setGlobalViewWord(updatedWord);
        await checkEnergyRewards();
    };
    
    const triggerServerBackup = async () => {
        if (!currentUser) return;
        setHasUnsavedChanges(false);
        setNextAutoBackupTime(null);
        await performAutoBackup(currentUser.id, currentUser, true);
        // showToast này đã được tích hợp trong onBackupComplete
    };

    const handleBackupWrapper = async () => { if (serverStatus === 'connected' && currentUser) await triggerServerBackup(); else await handleBackup(); };
    const bulkUpdateWordsAndNotify = async (updatedWords: VocabularyItem[]) => { await bulkUpdateWords(updatedWords); await checkEnergyRewards(); };
    const saveWordAndUserAndUpdateState = async (word: VocabularyItem, user: User) => {
        await dataStore.saveWordAndUser(word, user);
        setCurrentUser(user);
        const oldWord = dataStore.getWordById(word.id);
        if (!oldWord || oldWord.masteryScore !== word.masteryScore) setLastMasteryScoreUpdateTimestamp(Date.now());
        if (sessionWords) setSessionWords(prevWords => (prevWords || []).map(w => w.id === word.id ? word : w));
        if (globalViewWord && globalViewWord.id === word.id) setGlobalViewWord(word);
        await checkEnergyRewards();
    };

    const { gainExperienceAndLevelUp, recalculateXpAndLevelUp, xpGained, xpToNextLevel } = useGamification({ currentUser, onUpdateUser: handleUpdateUser, onSaveWordAndUser: saveWordAndUserAndUpdateState });

    useEffect(() => { if (isLoaded) { if (shouldSkipAuth && currentUser) setView('DASHBOARD'); else if (!currentUser) setView('AUTH'); } }, [isLoaded, shouldSkipAuth, currentUser?.id]);

    const handleLoginAndNavigate = async (user: User) => {
        if (user.id !== DEFAULT_USER_ID) sessionStorage.removeItem('vocab_pro_suppress_auto_restore');
        if (!user.adventure.map) { user.adventure.map = generateMap(100); await db.saveUser(user); }
        setCurrentUser(user);
        localStorage.setItem('vocab_pro_current_user_id', user.id);
        localStorage.setItem('vocab_pro_current_user_name', user.name);
        await db.saveUser({ ...user, lastLogin: Date.now() });
    };

    const handleLogoutAndNavigate = () => { setCurrentUser(null); localStorage.removeItem('vocab_pro_current_user_id'); };
    const handleSessionComplete = useCallback(() => { clearSessionState(); setView('DASHBOARD'); refreshGlobalStats(); }, [clearSessionState, refreshGlobalStats]);
    const handleRetrySession = useCallback(() => {
        if (!sessionWords || sessionWords.length === 0 || !sessionType) { handleSessionComplete(); return; }
        const wordIds = sessionWords.map(w => w.id);
        const wordsToRetry = dataStore.getAllWords().filter(w => wordIds.includes(w.id));
        if (wordsToRetry.length > 0) startSession(wordsToRetry, sessionType, sessionFocus);
        else handleSessionComplete();
    }, [sessionWords, sessionType, sessionFocus, startSession, handleSessionComplete]);

    const startDueReviewSession = useCallback(async () => { if (!currentUser) return; const words = await getDueWords(currentUser.id, 30); startSession(words, 'due'); }, [currentUser, startSession]);
    const startNewLearnSession = useCallback(async () => { if (!currentUser) return; const words = await getNewWords(currentUser.id, 20); startSession(words, 'new'); }, [currentUser, startSession]);
    const handleNavigateToList = (filter: string) => { setInitialListFilter(filter); setView('BROWSE'); };
    const openAddWordLibrary = () => { setView('BROWSE'); setForceExpandAdd(true); };
    const handleComposeWithWord = (word: VocabularyItem) => { setWritingContextWord(word); setView('WRITING'); };
    const consumeWritingContext = () => setWritingContextWord(null);

    const handleSpecialAction = (action: string, params?: any) => {
        switch(action) {
            case 'REVIEW': startDueReviewSession(); break;
            case 'BROWSE': startNewLearnSession(); break;
            case 'LESSON': if (params && params.lessonId) setTargetLessonId(params.lessonId); setView('LESSON'); break;
            case 'LESSON_GRAMMAR': setTargetLessonTag('Grammar'); setView('LESSON'); break; // Added
            case 'IRREGULAR_VERBS': setView('IRREGULAR_VERBS'); break;
            case 'MIMIC': setView('MIMIC'); break; 
            case 'PLAN_AI': setPlanningAction('AI'); setView('PLANNING'); break;
            case 'PLAN_IMPORT': setPlanningAction('IMPORT'); setView('PLANNING'); break;
            
            // GAMES (Map them to DISCOVER view)
            case 'COLLO_CONNECT':
            case 'DICTATION':
            case 'SENTENCE_SCRAMBLE':
            case 'MEANING_MATCH':
            case 'IPA_SORTER':
            case 'PREPOSITION_POWER':
            case 'WORD_TRANSFORMER':
            case 'PARAPHRASE_CONTEXT':
            case 'IDIOM_CONNECT':
            case 'WORD_SCATTER':
            case 'ADVENTURE':
                setTargetGameMode(action as DiscoverGame);
                setView('DISCOVER');
                break;
                
            default: setView(action as AppView);
        }
    };
    
    return {
        view, setView, currentUser, isLoaded, isResetting, resetStep, isSidebarOpen, setIsSidebarOpen,
        handleLogin: handleLoginAndNavigate, handleLogout: handleLogoutAndNavigate, handleUpdateUser,
        sessionWords, sessionFocus, sessionType, startSession, handleSessionComplete,
        stats, wotd, refreshGlobalStats, isWotdComposed, randomizeWotd, globalViewWord, setGlobalViewWord,
        lastBackupTime, handleBackup: handleBackupWrapper, triggerLocalBackup: handleBackup, triggerServerBackup,
        restoreFromServerAction: handleAutoRestoreAction, triggerLocalRestore, handleLibraryReset,
        initialListFilter, setInitialListFilter, forceExpandAdd, setForceExpandAdd, apiUsage,
        updateWord: updateWordAndNotify, deleteWord, bulkDeleteWords, bulkUpdateWords: bulkUpdateWordsAndNotify,
        handleNavigateToList, openAddWordLibrary, clearSessionState, handleRetrySession,
        gainExperienceAndLevelUp, recalculateXpAndLevelUp, xpGained, xpToNextLevel,
        startDueReviewSession, startNewLearnSession, lastMasteryScoreUpdateTimestamp,
        writingContextWord, handleComposeWithWord, consumeWritingContext,
        targetLessonId, setTargetLessonId, consumeTargetLessonId, 
        targetLessonTag, consumeTargetLessonTag, // Added export
        targetGameMode, consumeTargetGameMode, // New exports for game linking
        planningAction, setPlanningAction, consumePlanningAction,
        serverStatus, hasUnsavedChanges, nextAutoBackupTime, isAutoRestoreOpen, setIsAutoRestoreOpen, autoRestoreCandidates,
        handleNewUserSetup, handleLocalRestoreSetup, handleSwitchUser, isConnectionModalOpen, setIsConnectionModalOpen,
        connectionScanStatus, scanningUrl, handleScanAndConnect, handleStopScan, syncPrompt, setSyncPrompt,
        isSyncing, handleSyncPush, handleSyncRestore, handleSpecialAction
    };
};
