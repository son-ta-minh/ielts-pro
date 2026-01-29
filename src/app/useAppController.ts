
import { useState, useCallback, useEffect } from 'react';
import { AppView, User, VocabularyItem } from './types';
import { useToast } from '../contexts/ToastContext';
import { useAuthAndUser } from './hooks/useAuthAndUser';
import { useSession } from './hooks/useSession';
import { useGamification, calculateWordDifficultyXp as movedCalc } from './hooks/useGamification';
import { useDataFetching } from './hooks/useDataFetching';
import { useDataActions } from './hooks/useDataActions';
import { getDueWords, getNewWords } from './db';
import * as dataStore from './dataStore';

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
    
    // New state to pass a word to Writing Practice
    const [writingContextWord, setWritingContextWord] = useState<VocabularyItem | null>(null);


    // --- Composed Logic Hooks ---
    const { sessionWords, setSessionWords, sessionType, sessionFocus, startSession, clearSessionState } = useSession({ setView, setIsSidebarOpen });
    
    const { stats, wotd, setWotd, apiUsage, refreshGlobalStats, isWotdComposed, randomizeWotd } = useDataFetching({ currentUser, view, onUpdateUser: handleUpdateUser });

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

    const { isResetting, resetStep, lastBackupTime, handleBackup, handleRestore, handleLibraryReset, deleteWord, bulkDeleteWords, bulkUpdateWords } = useDataActions({
        currentUser, setView, refreshGlobalStats,
        sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord,
        onUpdateUser: handleUpdateUser
    });
    
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
        lastBackupTime, handleBackup, handleRestore, handleLibraryReset,
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
        consumeWritingContext
    };
};
