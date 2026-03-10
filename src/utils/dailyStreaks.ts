import { getStoredJSON, setStoredJSON } from './storage';
import { DailyGoalSnapshot, DailyStreakSnapshot } from '../app/types';

export const getDailyStreakKey = (userId: string) => `vocab_pro_daily_streak_${userId}`;
export const getDailyGoalHistoryKey = (userId: string) => `vocab_pro_daily_goal_history_${userId}`;

const sortByDateAsc = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date));

const mergeLegacyGoals = (userId: string, streaks: DailyStreakSnapshot[]): DailyStreakSnapshot[] => {
  const legacyGoals = getStoredJSON<DailyGoalSnapshot[]>(getDailyGoalHistoryKey(userId), []);
  if (!legacyGoals || legacyGoals.length === 0) return streaks;

  const map = new Map<string, DailyStreakSnapshot>();
  streaks.forEach(s => map.set(s.date, { ...s }));

  legacyGoals.forEach(g => {
    const existing = map.get(g.date);
    if (existing) map.set(g.date, { ...existing, learnGoal: g.learn, reviewGoal: g.review });
    else map.set(g.date, { date: g.date, learned: 0, reviewed: 0, learnGoal: g.learn, reviewGoal: g.review });
  });

  const merged = Array.from(map.values());
  setStoredJSON(getDailyStreakKey(userId), merged);
  setStoredJSON(getDailyGoalHistoryKey(userId), []); // clear legacy storage
  return merged;
};

export const readDailyStreaks = (userId: string): DailyStreakSnapshot[] => {
  const streaks = getStoredJSON<DailyStreakSnapshot[]>(getDailyStreakKey(userId), []);
  return sortByDateAsc(mergeLegacyGoals(userId, streaks));
};

export const writeDailyStreaks = (userId: string, items: DailyStreakSnapshot[]) => {
  setStoredJSON(getDailyStreakKey(userId), sortByDateAsc(items));
};

export const readDailyGoalHistory = (userId: string): DailyGoalSnapshot[] => {
  const streaks = readDailyStreaks(userId);
  return streaks.map(s => ({ date: s.date, learn: s.learnGoal ?? 0, review: s.reviewGoal ?? 0 }));
};
