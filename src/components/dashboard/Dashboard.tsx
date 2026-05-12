import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Trash2 } from 'lucide-react';
import { AppView, User, StudyItem, DailyStreakSnapshot, DailyGoalSnapshot, StudyLibraryType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { isSrsIgnored } from '../../utils/srs';
import * as db from '../../app/db';
import { DashboardUI, DashboardUIProps, StudyStats } from './Dashboard_UI';
import { getConfig } from '../../app/settingsManager';
import { addSkippedTodayWordId, DEFAULT_DUE_REVIEW_SCOPE, DueReviewScope, getAvailableReviewGroups, getSkippedTodayWordIds, DueReviewStatusFilter, DueReviewTypeFilter, selectDueReviewWords } from '../../utils/dueReview';

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
  onStartNewLearn: () => void;
  onStartStatusReview: (status: 'hard' | 'forgot') => void;
  onNavigateToKotobaList: (filter: string) => void;
  onStartKotobaDueReview: (scope?: DueReviewScope, preselectedWords?: StudyItem[]) => void;
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

const STATUS_OPTIONS: DueReviewStatusFilter[] = ['LEARNED', 'EASY', 'HARD', 'FORGOT'];
const TYPE_OPTIONS: DueReviewTypeFilter[] = ['VOCAB', 'IDIOM', 'PHRASAL', 'COLLOC', 'PHRASE'];

const ReviewDueConfigModal: React.FC<{
  isOpen: boolean;
  libraryType: StudyLibraryType;
  scope: DueReviewScope;
  previewWords: StudyItem[];
  allGroups: string[];
  groupQuery: string;
  onScopeChange: (next: DueReviewScope) => void;
  onGroupQueryChange: (value: string) => void;
  onRemoveWord: (wordId: string) => void;
  onStart: () => void;
  onClose: () => void;
}> = ({ isOpen, libraryType, scope, previewWords, allGroups, groupQuery, onScopeChange, onGroupQueryChange, onRemoveWord, onStart, onClose }) => {
  const filteredGroups = useMemo(() => {
    const normalizedQuery = groupQuery.trim().toLowerCase();
    return allGroups.filter((group) => !normalizedQuery || group.toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [allGroups, groupQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-[2rem] border border-neutral-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-neutral-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-neutral-900">Configure Due Review</h3>
            <p className="text-sm text-neutral-500 mt-1">{libraryType === 'kotoba' ? 'Choose your kotoba review scope before starting.' : 'Choose your review scope before starting.'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[340px,1fr] gap-0 min-h-0 flex-1">
          <div className="p-6 border-b xl:border-b-0 xl:border-r border-neutral-100 overflow-y-auto space-y-5">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">Words</div>
              <div className="flex gap-2">
                {[10, 20, 30].map((count) => (
                  <button
                    key={count}
                    onClick={() => onScopeChange({ ...scope, wordCount: count as 10 | 20 | 30 })}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-black border transition-all ${scope.wordCount === count ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">Status</div>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((status) => {
                  const active = scope.statuses.includes(status);
                  return (
                    <button
                      key={status}
                      onClick={() => onScopeChange({
                        ...scope,
                        statuses: active ? scope.statuses.filter((item) => item !== status) : [...scope.statuses, status]
                      })}
                      className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${active ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">Group</div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={groupQuery}
                  onChange={(event) => onGroupQueryChange(event.target.value)}
                  placeholder="Search group..."
                  className="w-full pl-9 pr-3 py-3 bg-white border border-neutral-200 rounded-2xl text-sm focus:ring-1 focus:ring-neutral-900 outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    onGroupQueryChange('');
                    onScopeChange({ ...scope, group: null });
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${scope.group === null ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                >
                  All groups
                </button>
                {filteredGroups.map((group) => (
                  <button
                    key={group}
                    onClick={() => {
                      onGroupQueryChange(group);
                      onScopeChange({ ...scope, group });
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${scope.group === group ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">Type</div>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((type) => {
                  const active = scope.types.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => onScopeChange({
                        ...scope,
                        types: active ? scope.types.filter((item) => item !== type) : [...scope.types, type]
                      })}
                      className={`px-3 py-2 rounded-xl text-xs font-black border transition-all ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => onScopeChange({ ...scope, focusOnly: !scope.focusOnly })}
              className={`w-full px-4 py-3 rounded-2xl text-sm font-black border transition-all ${scope.focusOnly ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}`}
            >
              Focus only: {scope.focusOnly ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">Preview</div>
                <div className="text-2xl font-black text-neutral-900 mt-1">{previewWords.length} word{previewWords.length === 1 ? '' : 's'}</div>
              </div>
              <button
                onClick={onStart}
                disabled={previewWords.length === 0}
                className="px-5 py-3 rounded-2xl bg-neutral-900 text-white text-sm font-black hover:bg-neutral-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Review
              </button>
            </div>

            <div className="space-y-3">
              {previewWords.length === 0 ? (
                <div className="p-6 rounded-3xl border border-dashed border-neutral-200 text-sm text-neutral-500 bg-neutral-50">
                  No due words match the current scope.
                </div>
              ) : previewWords.map((word) => (
                <div key={word.id} className="flex items-start gap-3 p-4 rounded-3xl border border-neutral-200 bg-white">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-neutral-900 break-words">{word.display || word.word}</div>
                    <div className="text-xs text-neutral-500 mt-1 break-words">{word.meaningVi}</div>
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                      <span className="px-2 py-1 rounded-full bg-neutral-100">{word.learnedStatus}</span>
                      {!!word.groups?.length && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">{word.groups[0]}</span>}
                      {!!word.isFocus && <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">Focus</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveWord(word.id)}
                    className="p-2 rounded-xl text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Skip for today"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
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
  const [dueConfigState, setDueConfigState] = useState<{ isOpen: boolean; libraryType: StudyLibraryType }>({ isOpen: false, libraryType: 'vocab' });
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
    () => selectDueReviewWords(allWords, dueConfigState.libraryType, userId, dueReviewScope, skippedTodayWordIds),
    [allWords, dueConfigState.libraryType, userId, dueReviewScope, skippedTodayWordIds]
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

  const openDueReviewConfig = (libraryType: StudyLibraryType) => {
    setDueReviewScope(DEFAULT_DUE_REVIEW_SCOPE);
    setGroupQuery('');
    setSkippedTodayWordIds(getSkippedTodayWordIds());
    setDueConfigState({ isOpen: true, libraryType });
  };

  const handleSkipPreviewWord = (wordId: string) => {
    addSkippedTodayWordId(wordId);
    setSkippedTodayWordIds(getSkippedTodayWordIds());
  };

  const handleStartConfiguredDueReview = () => {
    if (duePreviewWords.length === 0) return;
    if (dueConfigState.libraryType === 'kotoba') {
      restProps.onStartKotobaDueReview(dueReviewScope, duePreviewWords);
    } else {
      restProps.onStartDueReview(dueReviewScope, duePreviewWords);
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
    onStartDueReview: () => openDueReviewConfig('vocab'),
    onStartNewLearn: restProps.onStartNewLearn,
    onStartStatusReview: restProps.onStartStatusReview,
    onNavigateToKotobaList: restProps.onNavigateToKotobaList,
    onStartKotobaDueReview: () => openDueReviewConfig('kotoba'),
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
        <ReviewDueConfigModal
          isOpen={dueConfigState.isOpen}
          libraryType={dueConfigState.libraryType}
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
