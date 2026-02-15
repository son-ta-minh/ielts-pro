import React, { useState, useEffect } from 'react';
import { AppView, User, VocabularyItem } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import * as db from '../../app/db';
import { DashboardUI, DashboardUIProps } from './Dashboard_UI';
import { getConfig, getServerUrl } from '../../app/settingsManager';
// Removed ConfirmationModal import as it is no longer used for restore
import { AlertTriangle, Download } from 'lucide-react';

interface Props {
  userId: string;
  user: User;
  totalCount: number;
  dueCount: number;
  newCount: number;
  xpToNextLevel: number;
  wotd: VocabularyItem | null;
  onViewWotd: (word: VocabularyItem) => void;
  setView: (view: AppView) => void;
  lastBackupTime: number | null;
  onBackup: () => void;
  onRestore: () => void; // This is now a generic trigger
  onNavigateToWordList: (filter: string) => void;
  onStartDueReview: () => void;
  onStartNewLearn: () => void;
  isWotdComposed?: boolean;
  onComposeWotd?: (word: VocabularyItem) => void;
  onRandomizeWotd?: () => void;
  // Received from controller via AppLayout
  serverStatus: 'connected' | 'disconnected';
  // Actions passed from controller to handle actual restore logic
  restoreFromServerAction?: () => Promise<void>;
  triggerLocalRestore?: () => void;
  // Actions passed from controller to handle actual backup logic
  onLocalBackup: () => void;
  onServerBackup?: () => Promise<void>;
  onAction?: (action: string) => void;
}

const Dashboard: React.FC<Props> = ({ 
    userId, totalCount, user, xpToNextLevel, wotd, onViewWotd, serverStatus, 
    restoreFromServerAction, triggerLocalRestore,
    onLocalBackup, onServerBackup,
    onAction,
    ...restProps 
}) => {
  const [rawCount, setRawCount] = useState(0);
  const [refinedCount, setRefinedCount] = useState(0);
  const [dayProgress, setDayProgress] = useState({ learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] });
  const [reviewStats, setReviewStats] = useState({ learned: 0, mastered: 0, statusForgot: 0, statusHard: 0, statusEasy: 0, statusLearned: 0 });
  const [goalStats, setGoalStats] = useState({ totalTasks: 0, completedTasks: 0 });
  
  const dailyGoals = getConfig().dailyGoals;
  
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

  useEffect(() => {
    const fetchDashboardStats = async () => {
      const stats = dataStore.getStats();

      if (!stats) {
        return;
      }
      
      if (stats.dayProgress) {
        setDayProgress(stats.dayProgress);
      }

      setRawCount(stats.dashboardStats.rawCount || 0);
      setRefinedCount(stats.dashboardStats.refinedCount);
      
      if (stats.reviewCounts) {
        setReviewStats({
            learned: stats.reviewCounts.learned || 0,
            mastered: stats.reviewCounts.mastered || 0,
            statusForgot: stats.reviewCounts.statusForgot || 0,
            statusHard: stats.reviewCounts.statusHard || 0,
            statusEasy: stats.reviewCounts.statusEasy || 0,
            statusLearned: stats.reviewCounts.statusLearned || 0,
        });
      }
    };
    if (userId) {
      fetchDashboardStats();
      fetchGoalStats();
    }

    // Listen for updates from the data store
    const handleUpdate = () => {
      fetchDashboardStats();
      fetchGoalStats();
    };

    window.addEventListener('datastore-updated', handleUpdate);
    return () => {
      window.removeEventListener('datastore-updated', handleUpdate);
    };
  }, [userId, totalCount]);
  
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
    totalCount,
    dueCount: restProps.dueCount,
    newCount: restProps.newCount,
    rawCount,
    refinedCount,
    reviewStats,
    goalStats,
    setView: restProps.setView,
    onNavigateToWordList: restProps.onNavigateToWordList,
    onStartDueReview: restProps.onStartDueReview,
    onStartNewLearn: restProps.onStartNewLearn,
    lastBackupTime: restProps.lastBackupTime,
    onBackup: handleBackupClick,
    onRestore: handleRestoreClick,
    dayProgress,
    dailyGoals,
    serverStatus,
    onAction: onAction
  };
  
  return (
    <>
        <DashboardUI {...uiProps} />
    </>
  );
};

export default Dashboard;
