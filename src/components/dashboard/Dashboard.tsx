import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Quote, Layers, Combine, MessageSquare, Mic, AtSign, Layers3
} from 'lucide-react';
import { AppView, User, VocabularyItem } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { DashboardUI, DashboardUIProps } from './Dashboard_UI';
import { getConfig } from '../../app/settingsManager';

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
  onRestore: () => void;
  onNavigateToWordList: (filter: string) => void;
  onStartDueReview: () => void;
  onStartNewLearn: () => void;
}

const Dashboard: React.FC<Props> = ({ userId, totalCount, user, xpToNextLevel, wotd, onViewWotd, ...restProps }) => {
  const [labStats, setLabStats] = useState<any[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(true);
  const [refinedCount, setRefinedCount] = useState(0);
  const [dayProgress, setDayProgress] = useState({ learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] });
  const dailyGoals = getConfig().dailyGoals;

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setLoadingLabs(true);
      
      const [units] = await Promise.all([
        dataStore.getUnitsByUserId(userId)
      ]);
      const stats = dataStore.getStats();

      if (!stats) {
        setLoadingLabs(false);
        return;
      }
      
      if (stats.dayProgress) {
        setDayProgress(stats.dayProgress);
      }

      setRefinedCount(stats.dashboardStats.refinedCount);

      const cats = stats.dashboardStats.categories;
      const wordLabData = [
        { name: 'Vocabulary', total: cats['vocab'].total, learned: cats['vocab'].learned, filterId: 'vocab', icon: BookOpen, color: 'emerald' },
        { name: 'Idiom', total: cats['idiom'].total, learned: cats['idiom'].learned, filterId: 'idiom', icon: Quote, color: 'amber' },
        { name: 'Phrasal Verb', total: cats['phrasal'].total, learned: cats['phrasal'].learned, filterId: 'phrasal', icon: Layers, color: 'blue' },
        { name: 'Collocation', total: cats['colloc'].total, learned: cats['colloc'].learned, filterId: 'colloc', icon: Combine, color: 'indigo' },
        { name: 'Phrase', total: cats['phrase'].total, learned: cats['phrase'].learned, filterId: 'phrase', icon: MessageSquare, color: 'teal' },
        { name: 'Preposition', total: cats['preposition'].total, learned: cats['preposition'].learned, filterId: 'preposition', icon: AtSign, color: 'violet' },
        { name: 'Pronunciation', total: cats['pronun'].total, learned: cats['pronun'].learned, filterId: 'pronun', icon: Mic, color: 'rose' },
      ];

      const learnedUnits = units.filter(u => u.isLearned).length;

      const finalStats = [...wordLabData, { name: 'Reading', total: units.length, learned: learnedUnits, view: 'UNIT_LIBRARY', icon: Layers3, color: 'purple' }];
      const order = ['Vocabulary', 'Reading', 'Idiom', 'Collocation', 'Phrasal Verb', 'Preposition', 'Phrase', 'Pronunciation'];
      finalStats.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
      
      setLabStats(finalStats);
      setLoadingLabs(false);
    };
    if (userId) fetchDashboardStats();

    // Listen for updates from the data store
    window.addEventListener('datastore-updated', fetchDashboardStats);
    return () => {
      window.removeEventListener('datastore-updated', fetchDashboardStats);
    };
  }, [userId, totalCount]);

  const uiProps: DashboardUIProps = {
    totalCount,
    dueCount: restProps.dueCount,
    newCount: restProps.newCount,
    refinedCount,
    wotd,
    onViewWotd,
    setView: restProps.setView,
    onNavigateToWordList: restProps.onNavigateToWordList,
    onStartDueReview: restProps.onStartDueReview,
    onStartNewLearn: restProps.onStartNewLearn,
    lastBackupTime: restProps.lastBackupTime,
    onBackup: restProps.onBackup,
    onRestore: restProps.onRestore,
    labStats,
    loadingLabs,
    dayProgress,
    dailyGoals,
  };
  
  return <DashboardUI {...uiProps} />;
};

export default Dashboard;