import React, { useState, useEffect, useCallback } from 'react';
import { AppView, User, StudyItem, DailyStreakSnapshot, DailyGoalSnapshot, StudyLibraryType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { isSrsIgnored } from '../../utils/srs';
import * as db from '../../app/db';
import { DashboardUI, DashboardUIProps, StudyStats } from './Dashboard_UI';
import { getConfig } from '../../app/settingsManager';

export interface LibraryDashboardStats {
  totalCount: number;
  dueCount: number;
  newCount: number;
  studyingCount: number;
  masteredCount: number;
  rawCount: number;
  refinedCount: number;
  forgottenCount: number;
  hardCount: number;
  easyCount: number;
  focusedCount: number;
}

interface Props {
  userId: string;
  user: User;
  totalCount: number;
  dueCount: number;
  newCount: number;
  xpToNextLevel: number;
  wotd: StudyItem | null;
  onViewWotd: (word: StudyItem) => void;
  setView: (view: AppView) => void;
  lastBackupTime: number | null;
  onBackup: () => void;
  onRestore: () => void; // This is now a generic trigger
  onNavigateToWordList: (filter: string) => void;
  onStartDueReview: () => void;
  onStartNewLearn: () => void;
  onStartStatusReview: (status: 'hard' | 'forgot') => void;
  onNavigateToKotobaList: (filter: string) => void;
  onStartKotobaDueReview: () => void;
  onStartKotobaNewLearn: () => void;
  onStartKotobaStatusReview: (status: 'hard' | 'forgot') => void;
  isWotdComposed?: boolean;
  onComposeWotd?: (word: StudyItem) => void;
  onRandomizeWotd?: () => void;
  // Received from controller via AppLayout
  serverStatus: 'connected' | 'disconnected';
  serverUrl?: string;
  activeServerMode?: 'home' | 'public' | null;
  isSwitchingServerMode?: boolean;
  onToggleServerMode?: (mode: 'home' | 'public') => Promise<boolean>;
  // Actions passed from controller to handle actual restore logic
  restoreFromServerAction?: () => Promise<void>;
  triggerLocalRestore?: () => void;
  // Actions passed from controller to handle actual backup logic
  onLocalBackup: () => void;
  onServerBackup?: () => Promise<void>;
  onAction?: (action: string) => void;
  onViewWord: (word: StudyItem) => void;
}

const Dashboard: React.FC<Props> = ({ 
    userId, totalCount, user, wotd, serverStatus, serverUrl, activeServerMode, isSwitchingServerMode, onToggleServerMode,
    restoreFromServerAction, triggerLocalRestore,
    onLocalBackup, onServerBackup,
    onAction,
    ...restProps 
}) => {
  const [rawCount, setRawCount] = useState(0);
  const [refinedCount, setRefinedCount] = useState(0);
  const [dayProgress, setDayProgress] = useState({ learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] });
  const [kotobaDayProgress, setKotobaDayProgress] = useState({ learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] });
  const [dailyStreaks, setDailyStreaks] = useState<DailyStreakSnapshot[]>([]);
  const [dailyGoalHistory, setDailyGoalHistory] = useState<DailyGoalSnapshot[]>([]);
  const [reviewStats, setReviewStats] = useState({ learned: 0, mastered: 0, statusForgot: 0, statusHard: 0, statusEasy: 0, statusLearned: 0, statusFocus: 0 });
  const [goalStats, setGoalStats] = useState({ totalTasks: 0, completedTasks: 0 });
  
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [libraryStats, setLibraryStats] = useState<{ vocab: LibraryDashboardStats; kotoba: LibraryDashboardStats }>({
    vocab: { totalCount: 0, dueCount: 0, newCount: 0, studyingCount: 0, masteredCount: 0, rawCount: 0, refinedCount: 0, forgottenCount: 0, hardCount: 0, easyCount: 0, focusedCount: 0 },
    kotoba: { totalCount: 0, dueCount: 0, newCount: 0, studyingCount: 0, masteredCount: 0, rawCount: 0, refinedCount: 0, forgottenCount: 0, hardCount: 0, easyCount: 0, focusedCount: 0 }
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const dailyGoals = getConfig().dailyGoals;

  const calculateLibraryDashboardStats = useCallback((words: StudyItem[], libraryType: StudyLibraryType): LibraryDashboardStats => {
    const now = Date.now();
    const activeWords = words.filter(w => w.userId === userId && (w.libraryType || 'vocab') === libraryType && !w.isPassive && !isSrsIgnored(w));
    const learningWords = activeWords.filter(w => !!w.lastReview && w.interval <= 21);

    return {
      totalCount: activeWords.length,
      dueCount: activeWords.filter(w => !!w.lastReview && w.nextReview <= now).length,
      newCount: activeWords.filter(w => !w.lastReview && w.quality === 'VERIFIED').length,
      studyingCount: learningWords.length,
      masteredCount: activeWords.filter(w => w.interval > 21).length,
      rawCount: activeWords.filter(w => w.quality === 'RAW').length,
      refinedCount: activeWords.filter(w => w.quality === 'REFINED').length,
      forgottenCount: learningWords.filter(w => w.learnedStatus === 'FORGOT').length,
      hardCount: learningWords.filter(w => w.learnedStatus === 'HARD').length,
      easyCount: learningWords.filter(w => w.learnedStatus === 'EASY').length,
      focusedCount: activeWords.filter(w => !!w.isFocus).length
    };
  }, [userId]);

  const calculateLibraryDayProgress = useCallback((words: StudyItem[], libraryType: StudyLibraryType) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const activeWords = words.filter(w => w.userId === userId && (w.libraryType || 'vocab') === libraryType && !w.isPassive && !isSrsIgnored(w));
    const learnedWords = activeWords.filter(w => w.lastReview && w.lastReview >= todayTimestamp && w.lastReviewSessionType !== 'boss_battle' && w.learnedStatus === 'LEARNED');
    const reviewedWords = activeWords.filter(w => w.lastReview && w.lastReview >= todayTimestamp && w.lastReviewSessionType !== 'boss_battle' && w.learnedStatus !== 'LEARNED');
    return {
      learned: learnedWords.length,
      reviewed: reviewedWords.length,
      learnedWords,
      reviewedWords
    };
  }, [userId]);
  
  const fetchGoalStats = async () => {
    try {
      const goals = await db.getPlanningGoalsByUserId(userId);
      let total = 0;
      let completed = 0;
      goals.forEach(g => {
        total += (g.todos?.length || 0);
        completed += (g.todos?.filter(t => t.status === 'CLOSED').length || 0);
      });
      setGoalStats({ totalTasks: total, completedTasks: completed });
    } catch (e) {
      console.warn("Failed to fetch goal stats", e);
    }
  };
  
  const fetchStudyStats = useCallback(async () => {
      setIsStatsLoading(true);
      try {
          const [
              lessons,
              units, // Reading
              irregularVerbs,
              nativeSpeakItems,
              conversations,
              freeTalkItems,
              writingTopics
          ] = await Promise.all([
              db.getLessonsByUserId(userId),
              db.getUnitsByUserId(userId),
              db.getIrregularVerbsByUserId(userId),
              db.getNativeSpeakItemsByUserId(userId),
              db.getConversationItemsByUserId(userId),
              db.getFreeTalkItemsByUserId(userId),
              db.getWritingTopicsByUserId(userId)
          ]);
          
          // Note: Words are usually already loaded in dataStore, so we can use that for speed if initialized
          const words = dataStore.getAllWords().filter(w => w.userId === userId);

          // Vocab
          const activeWords = words.filter(w => (w.libraryType || 'vocab') === 'vocab' && !w.isPassive && !isSrsIgnored(w));
          const newVocab = activeWords.filter(w => !w.lastReview && w.quality === 'VERIFIED').length;
          const dueVocab = activeWords.filter(w => w.lastReview && w.nextReview <= Date.now()).length;

          // Lessons Classification
          const grammarLessons = lessons.filter(l => l.tags?.some(t => t.toLowerCase().includes('grammar')));
          const comparisonLessons = lessons.filter(l => l.type === 'comparison');
          const scaleLessons = lessons.filter(l => l.type === 'intensity');
          
          // General lessons are ALL lessons minus those specifically tagged as Grammar.
          // This includes Comparison and Intensity lessons, as they are part of the broader Lesson Library.
          const generalLessons = lessons.filter(l => 
              !l.tags?.some(t => t.toLowerCase().includes('grammar'))
          );

          // Speaking - Pronunciation from localStorage
          const mimicQueue = JSON.parse(localStorage.getItem('vocab_pro_mimic_practice_queue') || '[]');
          const pronTotal = mimicQueue.length;
          const pronCompleted = mimicQueue.filter((m: any) => (m.lastScore || 0) >= 80).length;

          setStudyStats({
              vocab: { new: newVocab, due: dueVocab },
              lessons: {
                  general: { completed: generalLessons.filter(l => l.focusColor === 'green').length, total: generalLessons.length },
                  irregular: { completed: irregularVerbs.filter(v => v.lastTestResult === 'pass').length, total: irregularVerbs.length },
                  grammar: { completed: grammarLessons.filter(l => l.focusColor === 'green').length, total: grammarLessons.length },
                  comparison: { completed: comparisonLessons.filter(l => l.focusColor === 'green').length, total: comparisonLessons.length },
                  scale: { completed: scaleLessons.filter(l => l.focusColor === 'green').length, total: scaleLessons.length },
              },
              reading: { completed: units.filter(u => u.focusColor === 'green').length, total: units.length },
              speaking: {
                  freeTalk: { completed: freeTalkItems.filter(i => i.focusColor === 'green').length, total: freeTalkItems.length },
                  native: { completed: nativeSpeakItems.filter(i => i.focusColor === 'green').length, total: nativeSpeakItems.length },
                  conversation: { completed: conversations.filter(i => i.focusColor === 'green').length, total: conversations.length },
                  pronunciation: { completed: pronCompleted, total: pronTotal }
              },
              writing: { completed: writingTopics.filter(t => t.focusColor === 'green').length, total: writingTopics.length }
          });
      } catch (e) {
          console.error("Failed to fetch study stats", e);
      } finally {
          setIsStatsLoading(false);
      }
  }, [userId]);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      const stats = dataStore.getStats();

      if (!stats) {
        return;
      }
      
      if (stats.dayProgress) {
        setDayProgress(stats.dayProgress);
      }
      const allWords = dataStore.getAllWords();
      setLibraryStats({
        vocab: calculateLibraryDashboardStats(allWords, 'vocab'),
        kotoba: calculateLibraryDashboardStats(allWords, 'kotoba')
      });
      setKotobaDayProgress(calculateLibraryDayProgress(allWords, 'kotoba'));
      setDailyStreaks(dataStore.getDailyStreakSnapshots(userId));
      setDailyGoalHistory(dataStore.getDailyGoalHistory(userId));

      setRawCount(stats.dashboardStats.rawCount || 0);
      setRefinedCount(stats.dashboardStats.refinedCount || 0);
      
      if (stats.reviewCounts) {
        const focusCount = allWords.filter(
          w => w.userId === userId && (w.libraryType || 'vocab') === 'vocab' && !w.isPassive && !!w.isFocus
        ).length;
        setReviewStats({
            learned: stats.reviewCounts.learned || 0,
            mastered: stats.reviewCounts.mastered || 0,
            statusForgot: stats.reviewCounts.statusForgot || 0,
            statusHard: stats.reviewCounts.statusHard || 0,
            statusEasy: stats.reviewCounts.statusEasy || 0,
            statusLearned: stats.reviewCounts.statusLearned || 0,
            statusFocus: focusCount,
        });
      }
    };
    if (userId) {
      fetchDashboardStats();
      fetchGoalStats();
      fetchStudyStats(); // Initial fetch
    }

    // Listen for updates from the data store
    const handleUpdate = () => {
      fetchDashboardStats();
      fetchGoalStats();
      // fetchStudyStats is heavy, so we might not want to run it on every word save automatically, 
      // but the user has a manual Refresh button. 
      // However, if navigation happens, we might want to refresh. 
      // For now, let's leave it to manual refresh or mount.
    };

    window.addEventListener('datastore-updated', handleUpdate);
    return () => {
      window.removeEventListener('datastore-updated', handleUpdate);
    };
  }, [userId, totalCount, fetchStudyStats, calculateLibraryDashboardStats, calculateLibraryDayProgress]);
  
  const handleRestoreClick = (mode: 'server' | 'file') => {
      if (mode === 'server' && restoreFromServerAction) {
          // Direct restore without confirmation modal
          restoreFromServerAction();
      } else if (mode === 'file' && triggerLocalRestore) {
          triggerLocalRestore();
      } else {
          // Fallback if props are missing
          if (mode === 'file') restProps.onRestore();
      }
  };
  
  const handleBackupClick = (mode: 'server' | 'file') => {
      if (mode === 'server' && onServerBackup) {
          onServerBackup();
      } else if (mode === 'file') {
          onLocalBackup();
      } else {
          // Fallback
          onLocalBackup();
      }
  };

  const uiProps: DashboardUIProps = {
    user,
    totalCount,
    dueCount: restProps.dueCount,
    newCount: restProps.newCount,
    learnedCount: reviewStats.learned,
    rawCount,
    refinedCount,
    reviewStats,
    wotd,
    isWotdComposed: restProps.isWotdComposed || false,
    onRandomizeWotd: restProps.onRandomizeWotd || (() => {}),
    onComposeWotd: () => { if (restProps.onComposeWotd && wotd) restProps.onComposeWotd(wotd); },
    goalStats,
    studyStats,
    isStatsLoading,
    onRefreshStats: fetchStudyStats,
    onNavigate: restProps.setView,
    onNavigateToWordList: restProps.onNavigateToWordList,
    onStartDueReview: restProps.onStartDueReview,
    onStartNewLearn: restProps.onStartNewLearn,
    onStartStatusReview: restProps.onStartStatusReview,
    onNavigateToKotobaList: restProps.onNavigateToKotobaList,
    onStartKotobaDueReview: restProps.onStartKotobaDueReview,
    onStartKotobaNewLearn: restProps.onStartKotobaNewLearn,
    onStartKotobaStatusReview: restProps.onStartKotobaStatusReview,
    vocabLibraryStats: libraryStats.vocab,
    kotobaLibraryStats: libraryStats.kotoba,
    lastBackupTime: restProps.lastBackupTime,
    onBackup: handleBackupClick,
    onRestore: handleRestoreClick,
    dayProgress,
    kotobaDayProgress,
    dailyStreaks,
    dailyGoalHistory,
    dailyGoals,
    serverStatus,
    serverUrl,
    activeServerMode,
    isSwitchingServerMode,
    onToggleServerMode,
    onAction: onAction || (() => {}),
    onViewWord: restProps.onViewWord,
  };
  
  return (
    <>
        <DashboardUI {...uiProps} />
    </>
  );
};

export default Dashboard;
