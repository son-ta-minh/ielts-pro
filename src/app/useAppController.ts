
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
    const hasCheckedInitialConnection = useRef(false);
    
    // Unsaved Changes Tracking & Backup Timer
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [nextAutoBackupTime, setNextAutoBackupTime] = useState<number | null>(null);

    // New state to pass a word to Writing Practice
    const [writingContextWord, setWritingContextWord] = useState<VocabularyItem | null>(null);
    
    // --- Auto Restore Logic State ---
    const [autoRestoreCandidates, setAutoRestoreCandidates] = useState<ServerBackupItem[]>([]);
    const [isAutoRestoreOpen, setIsAutoRestoreOpen] = useState(false);
    const hasCheckedAutoRestore = useRef(false);


    // --- Composed Logic Hooks ---
    const { sessionWords, setSessionWords, sessionType, sessionFocus, startSession, clearSessionState } = useSession({ setView, setIsSidebarOpen });
    
    const { stats, wotd, setWotd, apiUsage, refreshGlobalStats, isWotdComposed, randomizeWotd } = useDataFetching({ currentUser, view, onUpdateUser: handleUpdateUser });

    // --- Server Connection Check with Auto-Scan ---
    const checkServerConnection = useCallback(async (allowScan = false, urlOverride?: string) => {
        const config = getConfig();
        const url = urlOverride || getServerUrl(config);

        const tryConnect = async (targetUrl: string) => {
             const controller = new AbortController();
             const id = setTimeout(() => controller.abort(), 2000); // 2s timeout for manual check
             try {
                 const res = await fetch(`${targetUrl}/api/health`, { signal: controller.signal });
                 clearTimeout(id);
                 return res.ok;
             } catch {
                 return false;
             }
        };

        // 1. Try provided URL or current config
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

        // 2. If failed and scan is allowed (only if no override was provided), try to find it
        if (!isConnected && allowScan && !urlOverride && !config.server.useCustomUrl) {
            // console.log("[App] Server not found. Scanning network...");
            const scanResult = await scanForServer();
            if (scanResult) {
                // Update config with found server details
                const newConfig = { 
                    ...config, 
                    server: { 
                        ...config.server, 
                        host: scanResult.host, 
                        port: scanResult.port 
                    } 
                };
                saveConfig(newConfig, true); // Suppress backup trigger
                setServerStatus('connected');
                showToast(`Server found and connected at ${scanResult.host}:${scanResult.port}`, "success");
                return true;
            }
        }
        
        setServerStatus('disconnected');
        return false;
    }, [showToast]);

    // Function specifically for the modal interaction
    // If urlOverride is passed, we check ONLY that URL.
    // If urlOverride is undefined, we trigger the auto-scan logic.
    const handleScanAndConnect = async (urlOverride?: string) => {
        setConnectionScanStatus('scanning');
        
        // Pass true for allowScan ONLY if no URL override is provided
        const allowAutoScan = !urlOverride;
        
        const success = await checkServerConnection(allowAutoScan, urlOverride);
        
        if (success) {
            setConnectionScanStatus('success');
            setTimeout(() => setIsConnectionModalOpen(false), 1000);
            return true;
        } else {
            setConnectionScanStatus('failed');
            return false;
        }
    };
    
    const handleStopScan = () => {
        setConnectionScanStatus('failed');
    };
    
    // Check if the user is truly the default seed user (ID matches AND Name is default)
    // This prevents the modal from showing if the user customized their profile but kept the ID.
    const isStrictDefaultUser = useCallback(() => {
        return currentUser && currentUser.id === DEFAULT_USER_ID && currentUser.name === 'Vocab Master';
    }, [currentUser]);

    // Initial Load Logic: Check connection, then maybe show modal
    useEffect(() => {
        if (isLoaded && !hasCheckedInitialConnection.current) {
             hasCheckedInitialConnection.current = true;
             
             const isDefault = isStrictDefaultUser();

             if (isDefault) {
                 setIsConnectionModalOpen(true);
                 setConnectionScanStatus('scanning');
             }

             // Perform the check (this includes timeout + deep scan if allowed)
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
             
             // Periodic re-check (light check, no scan)
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

             // Only run if loaded, connected, AND user is the strict default seeded user (fresh state)
             // AND connection modal is closed (don't overlap)
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
        
        // Debounce slightly to ensure auth state is settled
        const t = setTimeout(checkForBackups, 1000);
        return () => clearTimeout(t);
    }, [isLoaded, serverStatus, isStrictDefaultUser, isConnectionModalOpen]);


    const { isResetting, resetStep, lastBackupTime, refreshBackupTime, handleBackup, restoreFromServerAction, triggerLocalRestore, handleLibraryReset, deleteWord, bulkDeleteWords, bulkUpdateWords } = useDataActions({
        currentUser, setView, refreshGlobalStats,
        sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord,
        onUpdateUser: handleUpdateUser,
        serverStatus // Pass serverStatus
    });
    
    // Wrapper for restore action to close modal
    const handleAutoRestoreAction = async (identifier?: string) => {
        setIsAutoRestoreOpen(false);
        await restoreFromServerAction(identifier);
    };

    // New: Handle "Create New Profile" flow
    const handleNewUserSetup = () => {
        setIsAutoRestoreOpen(false);
        setView('SETTINGS');
        showToast("Welcome! Please set up your new profile.", "info");
    };

    // New: Handle "Local Restore" from modal
    const handleLocalRestoreSetup = () => {
        setIsAutoRestoreOpen(false);
        triggerLocalRestore();
    };

    // Manual Switch User Action with Dynamic Scan
    const handleSwitchUser = async () => {
        // 1. Force a check/scan first
        const connected = await checkServerConnection(true);

        if (!connected) {
            // Show troubleshooting modal instead of just error toast
            setIsConnectionModalOpen(true);
            setConnectionScanStatus('failed'); // Set to failed so user sees options immediately
            return;
        }

        // 2. Backup current user if valid
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
            // 3. Clear Data
            await dataStore.clearVocabularyOnly();
            
            // 4. Fetch list for modal
            const backups = await fetchServerBackups();
            setAutoRestoreCandidates(backups);

            // 5. Open Modal
            setIsAutoRestoreOpen(true);
            
        } catch (e) {
             showToast("Failed to fetch user list from server.", "error");
        }
    };

    // --- Unsaved Changes & Backup Listeners ---
    useEffect(() => {
         const onDataUpdate = () => {
             // If connected to server AND not currently restoring, mark as unsaved
             if (serverStatus === 'connected' && !(window as any).isRestoring) {
                setHasUnsavedChanges(true);
             }
         };

         // When a local restore completes, we are in sync with the file just loaded
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
                     // If backup failed, ensure UI still shows unsaved state so user can try again
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

    // --- Helper for Energy Rewards ---
    const checkEnergyRewards = async () => {
        if (!currentUser) return;
        
        // 1. Get fresh stats
        // DataStore counts are based on UNIQUE word IDs, preventing duplicate rewards for the same word.
        const currentStats = dataStore.getStats(); 
        const { learned, reviewed } = currentStats.dayProgress;
        const todayStr = new Date().toISOString().split('T')[0];

        // 2. Calculate entitlement
        // +1 Energy for every 3 new words learned
        const earnedFromLearned = Math.floor(learned / 3);
        // +1 Energy for every 10 words reviewed (updated from 5)
        const earnedFromReviewed = Math.floor(reviewed / 10);
        const totalEarnedToday = earnedFromLearned + earnedFromReviewed;

        // 3. Compare with user state
        const adventure = currentUser.adventure;
        const lastDate = adventure.lastDailyEnergyAwardDate || '';
        let dailyAwarded = adventure.dailyEnergyAwarded || 0;

        if (lastDate !== todayStr) {
            dailyAwarded = 0; // Reset for new day if dates mismatch
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

    // Automatically check rewards when stats change (e.g. after restore, bulk update, or session complete)
    useEffect(() => {
        if (isLoaded && currentUser) {
            checkEnergyRewards();
        }
    }, [stats, isLoaded, currentUser?.id]); // Depend on stats to trigger check

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
        
        // Manual check is still useful for immediate feedback, though useEffect handles it too
        await checkEnergyRewards();
    };
    
    // Explicit trigger for Server Backup
    const triggerServerBackup = async () => {
        if (!currentUser) return;
        // Optimistic UI Update: Clear warning immediately to show responsiveness
        setHasUnsavedChanges(false);
        setNextAutoBackupTime(null);
        
        await performAutoBackup(currentUser.id, currentUser, true);
        showToast("Sync to Server initiated.", "success");
    };

    // Wrapper for handleBackup (Smart wrapper for Sidebar). 
    // If connected, uploads to server. If not, does local backup.
    const handleBackupWrapper = async () => {
        if (serverStatus === 'connected' && currentUser) {
            await triggerServerBackup();
        } else {
            // Fallback to local download
            await handleBackup();
        }
    };
    
    // Wrapper for bulk update to also check energy
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

    // FIX: Destructure `recalculateXpAndLevelUp` from `useGamification`.
    const { gainExperienceAndLevelUp, recalculateXpAndLevelUp, xpGained, xpToNextLevel } = useGamification({ 
        currentUser, 
        onUpdateUser: handleUpdateUser,
        // Fix: Pass the 'onSaveWordAndUser' prop to the 'useGamification' hook.
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
        console.log('[SESSION_DEBUG] Attempting to start DUE session...');
        const words = await getDueWords(currentUser.id, 30);
        console.log(`[SESSION_DEBUG] Found ${words.length} due words.`);
        startSession(words, 'due');
    }, [currentUser, startSession]);

    const startNewLearnSession = useCallback(async () => {
        if (!currentUser) return;
        console.log('[SESSION_DEBUG] Attempting to start NEW session...');
        const words = await getNewWords(currentUser.id, 20);
        console.log(`[SESSION_DEBUG] Found ${words.length} new words.`);
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
        handleBackup: handleBackupWrapper, // Smart wrapper (for sidebar)
        triggerLocalBackup: handleBackup, // Direct local download (for menu)
        triggerServerBackup, // Direct server upload (for menu)
        
        // Restore actions
        restoreFromServerAction: handleAutoRestoreAction, // Use wrapper to close modal
        triggerLocalRestore,     // Exposed for explicit calling
        handleLibraryReset,
        initialListFilter, setInitialListFilter,
        forceExpandAdd, setForceExpandAdd,
        apiUsage,
        updateWord: updateWordAndNotify,
        deleteWord,
        bulkDeleteWords,
        bulkUpdateWords: bulkUpdateWordsAndNotify, // Wrapped version
        handleNavigateToList,
        openAddWordLibrary,
        clearSessionState,
        handleRetrySession,
        gainExperienceAndLevelUp,
        // FIX: Add `recalculateXpAndLevelUp` to the returned object.
        recalculateXpAndLevelUp,
        xpGained,
        xpToNextLevel,
        startDueReviewSession,
        startNewLearnSession,
        lastMasteryScoreUpdateTimestamp,
        // New writing context props
        writingContextWord,
        handleComposeWithWord,
        consumeWritingContext,
        serverStatus, // Expose server status
        hasUnsavedChanges, // Expose unsaved changes state
        nextAutoBackupTime, // Expose backup timer
        
        // Auto Restore Props
        isAutoRestoreOpen,
        setIsAutoRestoreOpen,
        autoRestoreCandidates,
        handleNewUserSetup,
        handleLocalRestoreSetup,
        handleSwitchUser,

        // Connection Modal Props
        isConnectionModalOpen,
        setIsConnectionModalOpen,
        connectionScanStatus,
        handleScanAndConnect,
        handleStopScan
    };
};
