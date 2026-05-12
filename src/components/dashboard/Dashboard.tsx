import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Trash2 } from 'lucide-react';
import { AppView, User, StudyItem, DailyStreakSnapshot, DailyGoalSnapshot, StudyLibraryType, ReviewMode } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { isSrsIgnored } from '../../utils/srs';
import * as db from '../../app/db';
import { DashboardUI, DashboardUIProps, StudyStats } from './Dashboard_UI';
import { getConfig } from '../../app/settingsManager';
import { addSkippedTodayWordId, DEFAULT_DUE_REVIEW_SCOPE, DueReviewScope, getAvailableReviewGroups, getSkippedTodayWordIds, DueReviewStatusFilter, DueReviewTypeFilter, ReviewSetupMode, selectDueReviewWords, selectNewReviewWords } from '../../utils/dueReview';

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
  onStartDueReview: (scope?: DueReviewScope, preselectedWords?: StudyItem[]) => void;
  onStartNewLearn: (scope?: DueReviewScope, preselectedWords?: StudyItem[]) => void;
  onNavigateToKotobaList: (filter: string) => void;
  onStartKotobaDueReview: (scope?: DueReviewScope, preselectedWords?: StudyItem[]) => void;
  onStartKotobaNewLearn: (scope?: DueReviewScope, preselectedWords?: StudyItem[]) => void;
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

const STATUS_OPTIONS: DueReviewStatusFilter[] = ['LEARNED', 'EASY', 'HARD', 'FORGOT'];
const TYPE_OPTIONS: DueReviewTypeFilter[] = ['VOCAB', 'IDIOM', 'PHRASAL', 'COLLOC', 'PHRASE'];
const RECALL_MODE_OPTIONS: Array<{ value: ReviewMode.PHONETIC | ReviewMode.MEANING | ReviewMode.QUIZ; label: string }> = [
  { value: ReviewMode.PHONETIC, label: 'IPA' },
  { value: ReviewMode.MEANING, label: 'Meaning' },
  { value: ReviewMode.QUIZ, label: 'Quiz' }
];

const ReviewDueConfigModal: React.FC<{
  isOpen: boolean;
  libraryType: StudyLibraryType;
  mode: ReviewSetupMode;
  scope: DueReviewScope;
  previewWords: StudyItem[];
  allGroups: string[];
  groupQuery: string;
  onScopeChange: (next: DueReviewScope) => void;
  onGroupQueryChange: (value: string) => void;
  onRemoveWord: (wordId: string) => void;
  onStart: () => void;
  onClose: () => void;
}> = ({ isOpen, libraryType, mode, scope, previewWords, allGroups, groupQuery, onScopeChange, onGroupQueryChange, onRemoveWord, onStart, onClose }) => {
  const filteredGroups = useMemo(() => {
    const normalizedQuery = groupQuery.trim().toLowerCase();
    return allGroups.filter((group) => !normalizedQuery || group.toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [allGroups, groupQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full sm:w-[90vw] md:w-[70vw] lg:w-[45vw] xl:w-[33vw] max-w-[600px] rounded-[2rem] border border-neutral-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-neutral-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{mode === 'new' ? 'Configure New Session' : 'Configure Due Review'}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col min-h-0 flex-1">
          <div className="p-5 border-b border-neutral-100 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black text-neutral-600">Words</div>
              <div className="flex gap-2 flex-1 justify-start">
                {[10, 20, 30].map((count) => (
                  <button
                    key={count}
                    onClick={() => onScopeChange({ ...scope, wordCount: count as 10 | 20 | 30 })}
                    className={`w-16 h-8 flex items-center justify-center rounded-xl text-xs font-black border transition-all ${scope.wordCount === count ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'due' && (
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-black text-neutral-600 pt-2">Status</div>
                <div className="flex gap-2 flex-nowrap overflow-x-auto flex-1">
                  {STATUS_OPTIONS.map((status) => {
                    const active = scope.statuses.includes(status);
                    return (
                      <button
                        key={status}
                        onClick={() => onScopeChange({
                          ...scope,
                          statuses: active
                            ? scope.statuses.filter((item) => item !== status)
                            : [...scope.statuses, status]
                        })}
                        className={`w-20 h-8 flex-shrink-0 flex items-center justify-center gap-1 rounded-lg text-xs font-black border transition-all ${
                          active
                            ? status === 'LEARNED'
                              ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                              : status === 'EASY'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : status === 'HARD'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black text-neutral-600">Group</div>

              <div className="flex-1">
                <input
                  value={groupQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    onGroupQueryChange(value);

                    const matchedGroup =
                      allGroups.find(
                        (g) => g.toLowerCase() === value.trim().toLowerCase()
                      ) || null;

                    onScopeChange({ ...scope, group: matchedGroup });
                  }}
                  list="group-list"
                  placeholder="All groups"
                  className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />

                <datalist id="group-list">
                  {allGroups.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-black text-neutral-600 pt-2">Type</div>

              <div className="grid grid-cols-6 gap-1 flex-1">
                {TYPE_OPTIONS.map((type) => {
                  const active = scope.types.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => onScopeChange({
                        ...scope,
                        types: active ? scope.types.filter((item) => item !== type) : [...scope.types, type]
                      })}
                      className={`w-full h-8 flex items-center justify-center rounded-lg text-[10px] font-black border transition-all ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                    >
                      {type}
                    </button>
                  );
                })}
                <button
                  onClick={() => onScopeChange({ ...scope, focusOnly: !scope.focusOnly })}
                  className={`w-full h-8 flex items-center justify-center rounded-lg text-[10px] font-black border transition-all ${scope.focusOnly ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
                >
                  FOCUS
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black text-neutral-600">Recall</div>
              <div className="flex gap-2 flex-1 justify-start">
                {RECALL_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onScopeChange({ ...scope, recallMode: option.value })}
                    className={`w-24 h-8 flex items-center justify-center rounded-lg text-xs font-black border transition-all ${
                      scope.recallMode === option.value
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-2 overflow-y-auto">
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={onStart}
                disabled={previewWords.length === 0}
                className="px-5 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Review
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [dueConfigState, setDueConfigState] = useState<{ isOpen: boolean; libraryType: StudyLibraryType; mode: ReviewSetupMode }>({ isOpen: false, libraryType: 'vocab', mode: 'due' });
  const [dueReviewScope, setDueReviewScope] = useState<DueReviewScope>(DEFAULT_DUE_REVIEW_SCOPE);
  const [groupQuery, setGroupQuery] = useState('');
  const [skippedTodayWordIds, setSkippedTodayWordIds] = useState<string[]>([]);
  const [libraryStats, setLibraryStats] = useState<{ vocab: LibraryDashboardStats; kotoba: LibraryDashboardStats }>({
    vocab: { totalCount: 0, dueCount: 0, newCount: 0, studyingCount: 0, masteredCount: 0, rawCount: 0, refinedCount: 0, forgottenCount: 0, hardCount: 0, easyCount: 0, focusedCount: 0 },
    kotoba: { totalCount: 0, dueCount: 0, newCount: 0, studyingCount: 0, masteredCount: 0, rawCount: 0, refinedCount: 0, forgottenCount: 0, hardCount: 0, easyCount: 0, focusedCount: 0 }
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const dailyGoals = getConfig().dailyGoals;
  const allWords = dataStore.getAllWords();
  const dueReviewGroups = useMemo(
    () => getAvailableReviewGroups(allWords, dueConfigState.libraryType, userId),
    [allWords, dueConfigState.libraryType, userId]
  );
  const duePreviewWords = useMemo(
    () => dueConfigState.mode === 'new'
      ? selectNewReviewWords(allWords, dueConfigState.libraryType, userId, dueReviewScope)
      : selectDueReviewWords(allWords, dueConfigState.libraryType, userId, dueReviewScope, skippedTodayWordIds),
    [allWords, dueConfigState.libraryType, dueConfigState.mode, userId, dueReviewScope, skippedTodayWordIds]
  );

  const calculateLibraryDashboardStats = useCallback((words: StudyItem[], libraryType: StudyLibraryType): LibraryDashboardStats => {
    const now = Date.now();
    const activeWords = words.filter(w => w.userId === userId && (w.libraryType || 'vocab') === libraryType && !w.isPassive && !isSrsIgnored(w));
    const learningWords = activeWords.filter(w => !!w.lastReview && w.interval <= 21);

    return {
      totalCount: activeWords.length,
      dueCount: activeWords.filter(w => !!w.lastReview && w.nextReview <= now).length,
      newCount: activeWords.filter(w => !w.lastReview && w.quality === 'REFINED').length,
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
          const newVocab = activeWords.filter(w => !w.lastReview && w.quality === 'REFINED').length;
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
    setSkippedTodayWordIds(getSkippedTodayWordIds());
  }, []);

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

  const openReviewConfig = (libraryType: StudyLibraryType, mode: ReviewSetupMode) => {
    setDueReviewScope(DEFAULT_DUE_REVIEW_SCOPE);
    setGroupQuery('');
    setSkippedTodayWordIds(getSkippedTodayWordIds());
    setDueConfigState({ isOpen: true, libraryType, mode });
  };

  const handleSkipPreviewWord = (wordId: string) => {
    addSkippedTodayWordId(wordId);
    setSkippedTodayWordIds(getSkippedTodayWordIds());
  };

  const handleStartConfiguredDueReview = () => {
    if (duePreviewWords.length === 0) return;
    if (dueConfigState.libraryType === 'kotoba') {
      if (dueConfigState.mode === 'new') restProps.onStartKotobaNewLearn(dueReviewScope, duePreviewWords);
      else restProps.onStartKotobaDueReview(dueReviewScope, duePreviewWords);
    } else {
      if (dueConfigState.mode === 'new') restProps.onStartNewLearn(dueReviewScope, duePreviewWords);
      else restProps.onStartDueReview(dueReviewScope, duePreviewWords);
    }
    setDueConfigState((prev) => ({ ...prev, isOpen: false }));
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
    onStartDueReview: () => openReviewConfig('vocab', 'due'),
    onStartNewLearn: () => openReviewConfig('vocab', 'new'),
    onNavigateToKotobaList: restProps.onNavigateToKotobaList,
    onStartKotobaDueReview: () => openReviewConfig('kotoba', 'due'),
    onStartKotobaNewLearn: () => openReviewConfig('kotoba', 'new'),
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
        <ReviewDueConfigModal
          isOpen={dueConfigState.isOpen}
          libraryType={dueConfigState.libraryType}
          mode={dueConfigState.mode}
          scope={dueReviewScope}
          previewWords={duePreviewWords}
          allGroups={dueReviewGroups}
          groupQuery={groupQuery}
          onScopeChange={setDueReviewScope}
          onGroupQueryChange={(value) => {
            setGroupQuery(value);
            const matchedGroup = dueReviewGroups.find((group) => group.toLowerCase() === value.trim().toLowerCase()) || null;
            setDueReviewScope((prev) => ({ ...prev, group: matchedGroup }));
          }}
          onRemoveWord={handleSkipPreviewWord}
          onStart={handleStartConfiguredDueReview}
          onClose={() => setDueConfigState((prev) => ({ ...prev, isOpen: false }))}
        />
    </>
  );
};

export default Dashboard;
