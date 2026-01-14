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

    // --- Composed Logic Hooks ---
    const { sessionWords, setSessionWords, sessionType, sessionFocus, startSession, clearSessionState } = useSession({ setView, setIsSidebarOpen });
    
    const { stats, wotd, setWotd, apiUsage, refreshGlobalStats } = useDataFetching({ currentUser, view, onUpdateUser: handleUpdateUser });

    const { isResetting, resetStep, lastBackupTime, handleBackup, handleRestore, handleLibraryReset, updateWord, deleteWord, bulkDeleteWords } = useDataActions({
        currentUser, setView, refreshGlobalStats,
        sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord,
        onUpdateUser: handleUpdateUser
    });

    const saveWordAndUserAndUpdateState = useCallback(async (word: VocabularyItem, user: User) => {
        await dataStore.saveWordAndUser(word, user);
        setCurrentUser(user);
        // Also update the word in the current session if it exists
        if (sessionWords) {
            setSessionWords(prevWords => 
                (prevWords || []).map(w => w.id === word.id ? word : w)
            );
        }
    }, [setCurrentUser, sessionWords, setSessionWords]);

    const { gainExperienceAndLevelUp, xpGained, xpToNextLevel } = useGamification({ 
        currentUser, 
        onSaveWordAndUser: saveWordAndUserAndUpdateState 
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
        stats, wotd, refreshGlobalStats,
        globalViewWord, setGlobalViewWord,
        lastBackupTime, handleBackup, handleRestore, handleLibraryReset,
        initialListFilter, setInitialListFilter,
        forceExpandAdd, setForceExpandAdd,
        apiUsage,
        updateWord,
        deleteWord,
        bulkDeleteWords,
        handleNavigateToList,
        openAddWordLibrary,
        clearSessionState,
        handleRetrySession,
        gainExperienceAndLevelUp,
        xpGained,
        xpToNextLevel,
        startDueReviewSession,
        startNewLearnSession
    };
};