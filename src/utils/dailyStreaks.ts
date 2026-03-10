import { getStoredJSON, setStoredJSON } from './storage';
import { DailyGoalSnapshot, DailyStreakSnapshot } from '../app/types';

export const getDailyStreakKey = (userId: string) => `vocab_pro_daily_streak_${userId}`;
export const getDailyGoalHistoryKey = (userId: string) => `vocab_pro_daily_goal_history_${userId}`;

const sortByDateAsc = <T extends { date: string }>(items: T[]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date));

export const readDailyStreaks = (userId: string): DailyStreakSnapshot[] =>
  sortByDateAsc(getStoredJSON<DailyStreakSnapshot[]>(getDailyStreakKey(userId), []));

export const writeDailyStreaks = (userId: string, items: DailyStreakSnapshot[]) => {
  setStoredJSON(getDailyStreakKey(userId), sortByDateAsc(items));
};

export const readDailyGoalHistory = (userId: string): DailyGoalSnapshot[] =>
  sortByDateAsc(getStoredJSON<DailyGoalSnapshot[]>(getDailyGoalHistoryKey(userId), []));

export const writeDailyGoalHistory = (userId: string, items: DailyGoalSnapshot[]) => {
  setStoredJSON(getDailyGoalHistoryKey(userId), sortByDateAsc(items));
};
