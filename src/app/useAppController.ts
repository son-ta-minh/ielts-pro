import { useState, useCallback } from 'react';
import { AppView, User, VocabularyItem } from './types';
import { useToast } from '../contexts/ToastContext';
import { useAuthAndUser } from './hooks/useAuthAndUser';
import { useSession } from './hooks/useSession';
import { useGamification } from './hooks/useGamification';
import { useDataFetching } from './hooks/useDataFetching';
import { useDataActions } from './hooks/useDataActions';
import { getDueWords, getNewWords, getAllWordsForExport } from './db';

export const calculateWordDifficultyXp = (word: VocabularyItem): number => {
    if (word.isPassive) return 0;
    let baseXP = 50;
    if (word.ipaMistakes?.length) baseXP += 20;
    if (word.collocationsArray) baseXP += Math.min(word.collocationsArray.filter(c => !c.isIgnored).length * 10, 50);
    if (word.idiomsList) baseXP += Math.min(word.idiomsList.filter(c => !c.isIgnored).length * 15, 45);
    if (word.prepositions) baseXP += Math.min(word.prepositions.filter(p => !p.isIgnored).length * 10, 40);
    if (word.wordFamily) {
        const familyCount = (word.wordFamily.nouns?.filter(m => !m.isIgnored).length || 0) +
                            (word.wordFamily.verbs?.filter(m => !m.isIgnored).length || 0) +
                            (word.wordFamily.adjs?.filter(m => !m.isIgnored).length || 0) +
                            (word.wordFamily.advs?.filter(m => !m.isIgnored).length || 0);
        baseXP += Math.min(familyCount * 5, 50);
    }
    if (word.paraphrases) baseXP += Math.min(word.paraphrases.filter(p => !p.isIgnored).length * 10, 30);
    if (word.isIrregular) baseXP += 20;
    if (word.needsPronunciationFocus) baseXP += 15;
    if (word.isIdiom || word.isPhrasalVerb || word.isCollocation || word.isStandardPhrase) baseXP += 10;
    if (word.word.length > 7) baseXP += 5;
    if (word.word.length > 10) baseXP += 5;
    return Math.round(baseXP);
};

export const useAppController = () => {
    const { showToast } = useToast();
    
    // --- Primary State & UI Hooks ---
    const { currentUser, isLoaded, handleLogin, handleLogout, handleUpdateUser, setCurrentUser } = useAuthAndUser();
    const [view, setView] = useState<AppView>('AUTH');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [globalViewWord, setGlobalViewWord] = useState<VocabularyItem | null>(null);
    const [initialListFilter, setInitialListFilter] = useState<string | null>(null);
    const [forceExpandAdd, setForceExpandAdd] = useState(false);

    // --- Composed Logic Hooks ---
    const { sessionWords, setSessionWords, sessionType, sessionFocus, startSession, clearSessionState } = useSession({ setView, setIsSidebarOpen });
    
    const { gainExperienceAndLevelUp, xpGained, xpToNextLevel } = useGamification({ currentUser, onUpdateUser: handleUpdateUser, sessionWords, setSessionWords });

    const { stats, wotd, setWotd, apiUsage, refreshGlobalStats } = useDataFetching({ currentUser, view, onUpdateUser: handleUpdateUser });

    const { isResetting, resetStep, lastBackupTime, handleBackup, handleRestore, handleLibraryReset, updateWord, deleteWord, bulkDeleteWords } = useDataActions({
        currentUser, setView, refreshGlobalStats,
        sessionWords, setSessionWords, wotd, setWotd, globalViewWord, setGlobalViewWord,
        onUpdateUser: handleUpdateUser
    });

    // --- Connecting Logic & Event Handlers ---
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

    const handleRetrySession = useCallback(async () => {
        if (!sessionWords || sessionWords.length === 0 || !currentUser || !sessionType) {
            handleSessionComplete();
            return;
        }
        const wordIds = sessionWords.map(w => w.id);
        const allWords = await getAllWordsForExport(currentUser.id);
        const wordsToRetry = allWords.filter(w => wordIds.includes(w.id));
        
        if (wordsToRetry.length > 0) startSession(wordsToRetry, sessionType, sessionFocus);
        else handleSessionComplete();
    }, [sessionWords, currentUser, sessionType, sessionFocus, startSession, handleSessionComplete]);

    const handleStartNewStudy = useCallback(async () => {
        if (!currentUser) return;
        const [due, freshNews] = await Promise.all([ getDueWords(currentUser.id, 50), getNewWords(currentUser.id, 20) ]);
        const dueForSession = due.sort(() => Math.random() - 0.5).slice(0, 7);
        const newForSession = freshNews.sort(() => Math.random() - 0.5).slice(0, 3);
        startSession([...dueForSession, ...newForSession], 'new_study');
    }, [currentUser, startSession]);
  
    const handleStartRandomTest = useCallback(async () => {
        if (!currentUser) return;
        const allWords = await getAllWordsForExport(currentUser.id);
        const activeWords = allWords.filter(w => !w.isPassive);
        if (activeWords.length === 0) return;
        const shuffled = [...activeWords].sort(() => Math.random() - 0.5);
        const sessionSize = Math.min(20, shuffled.length);
        startSession(shuffled.slice(0, sessionSize), 'random_test');
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
        sessionWords, sessionFocus, sessionType, startSession, handleSessionComplete, handleStartNewStudy, handleStartRandomTest,
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
    };
};