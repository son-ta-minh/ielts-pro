
import React, { useState, useEffect } from 'react';
import { AppView, User, VocabularyItem } from '../../app/types';
import * as dataStore from '../../app/dataStore';
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
}

const Dashboard: React.FC<Props> = ({ 
    userId, totalCount, user, xpToNextLevel, wotd, onViewWotd, serverStatus, 
    restoreFromServerAction, triggerLocalRestore,
    onLocalBackup, onServerBackup,
    ...restProps 
}) => {
  const [rawCount, setRawCount] = useState(0);
  const [refinedCount, setRefinedCount] = useState(0);
  const [dayProgress, setDayProgress] = useState({ learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] });
  const [reviewStats, setReviewStats] = useState({ learned: 0, mastered: 0, statusForgot: 0, statusHard: 0, statusEasy: 0, statusLearned: 0 });
  const dailyGoals = getConfig().dailyGoals;
  
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
    if (userId) fetchDashboardStats();

    // Listen for updates from the data store
    window.addEventListener('datastore-updated', fetchDashboardStats);
    return () => {
      window.removeEventListener('datastore-updated', fetchDashboardStats);
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
    wotd,
    onViewWotd,
    setView: restProps.setView,
    onNavigateToWordList: restProps.onNavigateToWordList,
    onStartDueReview: restProps.onStartDueReview,
    onStartNewLearn: restProps.onStartNewLearn,
    lastBackupTime: restProps.lastBackupTime,
    onBackup: handleBackupClick,
    onRestore: handleRestoreClick,
    dayProgress,
    dailyGoals,
    isWotdComposed: restProps.isWotdComposed,
    onComposeWotd: restProps.onComposeWotd,
    onRandomizeWotd: restProps.onRandomizeWotd,
    serverStatus,
  };
  
  return (
    <>
        <DashboardUI {...uiProps} />
    </>
  );
};

export default Dashboard;
