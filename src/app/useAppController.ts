
import { useState, useCallback, useEffect, useRef } from 'react';
import { AppView, User, VocabularyItem } from './types';
import { useToast } from '../contexts/ToastContext';
import { useAuthAndUser } from './hooks/useAuthAndUser';
import { useSession } from './hooks/useSession';
import { useGamification, calculateWordDifficultyXp as movedCalc } from './hooks/useGamification';
import { useDataFetching } from './hooks/useDataFetching';
import { useDataActions } from './hooks/useDataActions';
import { getDueWords, getNewWords } from './db';
import * as dataStore from './dataStore';
import * as db from './db';
import { getConfig, getServerUrl, saveConfig } from './settingsManager';
import { performAutoBackup, fetchServerBackups, ServerBackupItem } from '../services/backupService';
import { DEFAULT_USER_ID } from '../data/user_data';
import { scanForServer } from '../utils/networkScanner';

// Re-export for backward compatibility with external components that might import from here.
export const calculateWordDifficultyXp = movedCalc;

export const useAppController = () => {
    const { showToast } = useToast();
    
    // --- Primary State & UI Hooks ---
    const { currentUser, isLoaded, handleLogin, handleLogout, handleUpdateUser, setCurrentUser, shouldSkipAuth } = useAuthAndUser();
    const [view, setView] = useState<AppView>('AUTH');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [globalViewWord, setGlobalViewWord] = useState<VocabularyItem | null>(null);
    const [initialListFilter, setInitialListFilter] = useState<string | null>(null);
    const [forceExpandAdd, setForceExpandAdd] = useState(false);
    const [lastMasteryScoreUpdateTimestamp, setLastMasteryScoreUpdateTimestamp] = useState(Date.now());
    
    // Server Status State
    const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected'>('disconnected');
    
    // Connection Modal State
    const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
    const [connectionScanStatus, setConnectionScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
    const [scanningUrl, setScanningUrl] = useState(''); // Tracking current scan URL for UI
    const hasCheckedInitialConnection = useRef(false);
    const scanAbortControllerRef = useRef<AbortController | null>(null);
    
    // Unsaved Changes Tracking & Backup Timer
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [nextAutoBackupTime, setNextAutoBackupTime] = useState<number | null>(null);

    // New state to pass a word to Writing Practice
    const [writingContextWord, setWritingContextWord] = useState<VocabularyItem | null>(null);
    
    // --- Auto Restore Logic State ---
    const [autoRestoreCandidates, setAutoRestoreCandidates] = useState<ServerBackupItem[]>([]);
    const [isAutoRestoreOpen, setIsAutoRestoreOpen] = useState(false);
    const hasCheckedAutoRestore = useRef(false);

    // Resetting State
    const [isResetting, setIsResetting] = useState(false);
    const [resetStep, setResetStep] = useState('');


    // --- Composed Logic Hooks ---
    const { sessionWords, setSessionWords, sessionType, sessionFocus, startSession, clearSessionState } = useSession({ setView, setIsSidebarOpen });
    
    const { stats, wotd, setWotd, apiUsage, refreshGlobalStats, isWotdComposed, randomizeWotd } = useDataFetching({ currentUser, view, onUpdateUser: handleUpdateUser });

    // --- Server Connection Check with Auto-Scan ---
    const checkServerConnection = useCallback(async (allowScan = false, urlOverride?: string, forceScan = false, signal?: AbortSignal) => {
        const config = getConfig();
        const url = urlOverride || getServerUrl(config);

        const tryConnect = async (targetUrl: string) => {
             const controller = new AbortController();
             const id = setTimeout(() => controller.abort(), 1200); // Tighter timeout for interactive feel
             
             // If master signal is aborted, abort this check too
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

        // 1. Try provided URL or current config (Unless we are forced to skip and scan)
        if (!forceScan) {
            setScanningUrl(url);
            const isConnected = await tryConnect(url);
            
            if (isConnected) {
                setServerStatus('connected');
                // If we used a custom/manual URL override that worked, update the config
                if (urlOverride) {
                     const newConfig = { ...config, server: { ...config.server, useCustomUrl: true, customUrl: urlOverride } };
                     saveConfig(newConfig, true);
                     showToast(`Connected to ${urlOverride}`, "success");
                }
                return true;
            }
        }

        // 2. If failed and scan is allowed (only if no override was provided), try to find it
        if ((!urlOverride && allowScan) || forceScan) {
            if (signal?.aborted) return false;
            
            const scanResult = await scanForServer((url) => {
                setScanningUrl(url); // Update UI with current scanning URL
            }, signal);

            if (scanResult) {
                // Update config with found server details
                const newConfig = { 
                    ...config, 
                    server: { 
                        ...config.server, 
                        host: scanResult.host, 
                        port: scanResult.port,
                        useCustomUrl: false // Reset to standard host:port if found via scan
                    } 
                };
                saveConfig(newConfig, true); 
                setServerStatus('connected');
                showToast(`Server found at ${scanResult.host}:${scanResult.port}`, "success");
                return true;
            }
        }
        
        // Don't downgrade status if we were aborted (another scan might be starting)
        if (!signal?.aborted) {
            setServerStatus('disconnected');
        }
        return false;
    }, [showToast]);

    // Function specifically for the modal interaction
    const handleScanAndConnect = async (urlOverride?: string) => {
        // Stop any existing scan process
        if (scanAbortControllerRef.current) {
            scanAbortControllerRef.current.abort();
        }
        
        scanAbortControllerRef.current = new AbortController();
        const signal = scanAbortControllerRef.current.signal;

        setConnectionScanStatus('scanning');
        
        try {
            // UX: Small delay to ensure the user sees the scanning animation
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, 800);
                signal.addEventListener('abort', () => {
                    clearTimeout(t);
                    reject(new Error('aborted'));
                });
            });

            const allowAutoScan = !urlOverride;
            const forceScan = !urlOverride; // Bypass initial check if it's a generic "Scan" button click
            
            const success = await checkServerConnection(allowAutoScan, urlOverride, forceScan, signal);
            
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
        if (scanAbortControllerRef.current) {
            scanAbortControllerRef.current.abort();
            scanAbortControllerRef.current = null;
        }
        setConnectionScanStatus('failed');
    };
    
    // Check if the user is truly the default seed user
    const isStrictDefaultUser = useCallback(() => {
        return currentUser && currentUser.id === DEFAULT_USER_ID && currentUser.name === 'Vocab Master';
    }, [currentUser]);

    // Initial Load Logic
    useEffect(() => {
        if (isLoaded && !hasCheckedInitialConnection.current) {
             hasCheckedInitialConnection.current = true;
             
             const isDefault = isStrictDefaultUser();

             if (isDefault) {
                 setIsConnectionModalOpen(true);
                 setConnectionScanStatus('scanning');
             }

             // We don't use the ref for initial boot scan as it's not user-stoppable in the same way
             checkServerConnection(true).then((connected) => {
                 if (connected) {
                     setServerStatus('connected');
                     if (isDefault) {
                         setConnectionScanStatus('success');
                         setTimeout(() => setIsConnectionModalOpen(false), 800);
                     }
                 } else {
                     if (isDefault) {
                         setConnectionScanStatus('failed');
                     }
                 }
             });
             
             const interval = setInterval(() => checkServerConnection(false), 30000);
             window.addEventListener('config-updated', () => checkServerConnection(false));

             return () => {
                 clearInterval(interval);
                 window.removeEventListener('config-updated', () => checkServerConnection(false));
             };
        }
    }, [isLoaded, checkServerConnection, isStrictDefaultUser]);
    
    // --- Auto Restore Logic Effect ---
    useEffect(() => {
        const checkForBackups = async () => {
             if (hasCheckedAutoRestore.current) return;

             if (isLoaded && serverStatus === 'connected' && isStrictDefaultUser() && !isConnectionModalOpen) {
                 hasCheckedAutoRestore.current = true;
                 try {
                     const backups = await fetchServerBackups();
                     if (backups && backups.length > 0) {
                         setAutoRestoreCandidates(backups);
                         setIsAutoRestoreOpen(true);
                     }
                 } catch (e) {
                     console.warn("[AutoRestore] Failed to fetch backups on init:", e);
                 }
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
        setIsAutoRestoreOpen(false);
        await restoreFromServerAction(identifier);
    };

    const handleLocalRestoreSetup = () => {
        setIsAutoRestoreOpen(false);
        triggerLocalRestore();
    };

    const handleNewUserSetup = async (e?: any) => {
        setIsAutoRestoreOpen(false);
        setIsResetting(true);
        setResetStep('Wiping all data and preparing new profile...');
        
        try {
            await dataStore.wipeAllLocalData(); 
            const defaultUser = await db.seedDatabaseIfEmpty(true);
            
            if (defaultUser) {
                handleLogin(defaultUser);
                setView('SETTINGS');
                showToast("Welcome! Your data has been wiped. Please set up your new profile.", "success");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to prepare new profile.", "error");
        } finally {
            setIsResetting(false);
        }
    };

    const handleSwitchUser = async () => {
        const connected = await checkServerConnection(true);

        if (!connected) {
            setIsConnectionModalOpen(true);
            setConnectionScanStatus('failed'); 
            return;
        }

        if (currentUser && currentUser.id !== DEFAULT_USER_ID) {
             showToast("Syncing current profile...", "info");
             try {
                await performAutoBackup(currentUser.id, currentUser, true);
             } catch (e) {
                 console.error("Backup failed", e);
                 showToast("Backup failed, proceeding...", "error");
             }
        }

        try {
            await dataStore.clearVocabularyOnly();
            const backups = await fetchServerBackups();
            setAutoRestoreCandidates(backups);
            setIsAutoRestoreOpen(true);
        } catch (e) {
             showToast("Failed to fetch user list from server.", "error");
        }
    };

    useEffect(() => {
         const onDataUpdate = () => {
             if (serverStatus === 'connected' && !(window as any).isRestoring) {
                setHasUnsavedChanges(true);
             }
         };

         const onRestoreComplete = () => {
             setHasUnsavedChanges(false);
             setNextAutoBackupTime(null);
         };
         
         const onBackupScheduled = (e: Event) => {
             const customEvent = e as CustomEvent;
             if (customEvent.detail && customEvent.detail.targetTime) {
                 setNextAutoBackupTime(customEvent.detail.targetTime);
             }
         };
         
         const onBackupComplete = (e: Event) => {
             const customEvent = e as CustomEvent;
             if (customEvent.detail) {
                 if (customEvent.detail.success) {
                     setHasUnsavedChanges(false);
                     setNextAutoBackupTime(null);
                     refreshBackupTime();
                 } else {
                     setHasUnsavedChanges(true);
                     setNextAutoBackupTime(null);
                 }
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
    }, [serverStatus, refreshBackupTime]);

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

        if (lastDate !== todayStr) {
            dailyAwarded = 0; 
        }

        if (totalEarnedToday > dailyAwarded) {
            const diff = totalEarnedToday - dailyAwarded;
            const newEnergy = (adventure.energy || 0) + diff;

            const updatedUser: User = {
                ...currentUser,
                adventure: {
                    ...adventure,
                    energy: newEnergy,
                    dailyEnergyAwarded: totalEarnedToday,
                    lastDailyEnergyAwardDate: todayStr
                }
            };

            await handleUpdateUser(updatedUser);
            showToast(`Daily Progress: +${diff} Energy ⚡`, 'success');
        }
    };

    useEffect(() => {
        if (isLoaded && currentUser) {
            checkEnergyRewards();
        }
    }, [stats, isLoaded, currentUser?.id]); 

    const updateWordAndNotify = async (updatedWord: VocabularyItem) => {
        const oldWord = dataStore.getWordById(updatedWord.id);
        if (!oldWord || oldWord.masteryScore !== updatedWord.masteryScore) {
            setLastMasteryScoreUpdateTimestamp(Date.now());
        }
        await dataStore.saveWord(updatedWord);
        
        if (sessionWords) {
            setSessionWords(prevWords => (prevWords || []).map(w => w.id === updatedWord.id ? updatedWord : w));
        }
        if (globalViewWord && globalViewWord.id === updatedWord.id) {
            setGlobalViewWord(updatedWord);
        }
        
        await checkEnergyRewards();
    };
    
    const triggerServerBackup = async () => {
        if (!currentUser) return;
        setHasUnsavedChanges(false);
        setNextAutoBackupTime(null);
        
        await performAutoBackup(currentUser.id, currentUser, true);
        showToast("Sync to Server initiated.", "success");
    };

    const handleBackupWrapper = async () => {
        if (serverStatus === 'connected' && currentUser) {
            await triggerServerBackup();
        } else {
            await handleBackup();
        }
    };
    
    const bulkUpdateWordsAndNotify = async (updatedWords: VocabularyItem[]) => {
        await bulkUpdateWords(updatedWords);
        await checkEnergyRewards();
    };
    
    const saveWordAndUserAndUpdateState = async (word: VocabularyItem, user: User) => {
        await dataStore.saveWordAndUser(word, user);
        setCurrentUser(user);

        const oldWord = dataStore.getWordById(word.id);
        if (!oldWord || oldWord.masteryScore !== word.masteryScore) {
            setLastMasteryScoreUpdateTimestamp(Date.now());
        }
        if (sessionWords) {
            setSessionWords(prevWords => (prevWords || []).map(w => w.id === word.id ? word : w));
        }
        if (globalViewWord && globalViewWord.id === word.id) {
            setGlobalViewWord(word);
        }
        
        await checkEnergyRewards();
    };

    const { gainExperienceAndLevelUp, recalculateXpAndLevelUp, xpGained, xpToNextLevel } = useGamification({ 
        currentUser, 
        onUpdateUser: handleUpdateUser,
        onSaveWordAndUser: saveWordAndUserAndUpdateState,
    });


    // --- Connecting Logic & Event Handlers ---

    useEffect(() => {
        if (isLoaded) {
            if (shouldSkipAuth && currentUser) {
                setView('DASHBOARD');
            } else if (!currentUser) {
                setView('AUTH');
            }
        }
    }, [isLoaded, shouldSkipAuth, currentUser?.id]);

    const handleLoginAndNavigate = (user: User) => {
        handleLogin(user);
        setView('DASHBOARD');
    };

    const handleLogoutAndNavigate = () => {
        handleLogout();
        setView('AUTH');
        setIsSidebarOpen(false);
    };

    const handleSessionComplete = useCallback(() => {
        clearSessionState();
        setView('DASHBOARD');
        refreshGlobalStats();
    }, [clearSessionState, refreshGlobalStats]);

    const handleRetrySession = useCallback(() => {
        if (!sessionWords || sessionWords.length === 0 || !sessionType) {
            handleSessionComplete();
            return;
        }
        const wordIds = sessionWords.map(w => w.id);
        const allWords = dataStore.getAllWords();
        const wordsToRetry = allWords.filter(w => wordIds.includes(w.id));
        
        if (wordsToRetry.length > 0) {
            startSession(wordsToRetry, sessionType, sessionFocus);
        } else {
            handleSessionComplete();
        }
    }, [sessionWords, sessionType, sessionFocus, startSession, handleSessionComplete]);

    const startDueReviewSession = useCallback(async () => {
        if (!currentUser) return;
        const words = await getDueWords(currentUser.id, 30);
        startSession(words, 'due');
    }, [currentUser, startSession]);

    const startNewLearnSession = useCallback(async () => {
        if (!currentUser) return;
        const words = await getNewWords(currentUser.id, 20);
        startSession(words, 'new');
    }, [currentUser, startSession]);
  
    const handleNavigateToList = (filter: string) => {
        setInitialListFilter(filter);
        setView('BROWSE');
    };
  
    const openAddWordLibrary = () => {
        setView('BROWSE');
        setForceExpandAdd(true);
    };
    
    const handleComposeWithWord = (word: VocabularyItem) => {
        setWritingContextWord(word);
        setView('WRITING');
    };

    const consumeWritingContext = () => {
        setWritingContextWord(null);
    };
    
    // --- Returned Controller Object ---
    return {
        view, setView,
        currentUser, 
        isLoaded,
        isResetting, resetStep,
        isSidebarOpen, setIsSidebarOpen,
        handleLogin: handleLoginAndNavigate, 
        handleLogout: handleLogoutAndNavigate, 
        handleUpdateUser,
        sessionWords, sessionFocus, sessionType, startSession, handleSessionComplete,
        stats, wotd, refreshGlobalStats, isWotdComposed, randomizeWotd,
        globalViewWord, setGlobalViewWord,
        lastBackupTime, 
        handleBackup: handleBackupWrapper, 
        triggerLocalBackup: handleBackup, 
        triggerServerBackup, 
        
        restoreFromServerAction: handleAutoRestoreAction, 
        triggerLocalRestore,     
        handleLibraryReset,
        initialListFilter, setInitialListFilter,
        forceExpandAdd, setForceExpandAdd,
        apiUsage,
        updateWord: updateWordAndNotify,
        deleteWord,
        bulkDeleteWords,
        bulkUpdateWords: bulkUpdateWordsAndNotify, 
        handleNavigateToList,
        openAddWordLibrary,
        clearSessionState,
        handleRetrySession,
        gainExperienceAndLevelUp,
        recalculateXpAndLevelUp,
        xpGained,
        xpToNextLevel,
        startDueReviewSession,
        startNewLearnSession,
        lastMasteryScoreUpdateTimestamp,
        writingContextWord,
        handleComposeWithWord,
        consumeWritingContext,
        serverStatus, 
        hasUnsavedChanges, 
        nextAutoBackupTime, 
        
        isAutoRestoreOpen,
        setIsAutoRestoreOpen,
        autoRestoreCandidates,
        handleNewUserSetup,
        handleLocalRestoreSetup,
        handleSwitchUser,

        isConnectionModalOpen,
        setIsConnectionModalOpen,
        connectionScanStatus,
        scanningUrl, // Returning new state
        handleScanAndConnect,
        handleStopScan
    };
};
