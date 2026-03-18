import React, { useEffect } from 'react';
import { getStoredJSON, setStoredJSON } from '../utils/storage';
import { useToast } from '../contexts/ToastContext';
import { speak } from '../utils/audio';

type FocusTimerStatus = 'idle' | 'running' | 'paused' | 'completed';

interface FocusTimerRecord {
  id: string;
  name: string;
  category: string;
  elapsedSeconds: number;
  alarmAfterSeconds?: number;
  lastAlarmAtElapsedSeconds?: number | null;
  lastStart?: number | null;
  status: FocusTimerStatus;
}

const FOCUS_PERIOD_TIMERS_KEY = 'focus_period_timers';
const FOCUS_TIMERS_UPDATED_EVENT = 'focus-period-timers-updated';

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const getEffectiveElapsed = (timer: FocusTimerRecord, now: number) => {
  if (timer.status !== 'running' || !timer.lastStart) return timer.elapsedSeconds || 0;
  const delta = Math.floor((now - timer.lastStart) / 1000);
  return (timer.elapsedSeconds || 0) + Math.max(0, delta);
};

const FocusTimerAlarmWatcher: React.FC = () => {
  const { showToast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tick = () => {
      const now = Date.now();
      const timers = getStoredJSON<FocusTimerRecord[]>(FOCUS_PERIOD_TIMERS_KEY, []);
      if (!Array.isArray(timers) || timers.length === 0) return;

      const dueIds = new Set<string>();
      const dueTimers = timers.filter(timer => {
        const alarmAfter = timer.alarmAfterSeconds || 0;
        if (timer.status !== 'running' || alarmAfter <= 0) return false;
        if (timer.lastAlarmAtElapsedSeconds === alarmAfter) return false;
        const elapsed = getEffectiveElapsed(timer, now);
        const isDue = elapsed >= alarmAfter;
        if (isDue) dueIds.add(timer.id);
        return isDue;
      });

      if (dueTimers.length === 0) return;

      dueTimers.forEach(timer => {
        const timerLabel = timer.name || `${timer.category} Focus`;
        showToast(`${timerLabel} reached alarm at ${formatDuration(timer.alarmAfterSeconds || 0)}. Stop or keep going.`, 'info');
        speak(`Ting ting. ${timerLabel} hết giờ`, false, 'vi');
      });

      const nextTimers = timers.map(timer =>
        dueIds.has(timer.id)
          ? { ...timer, lastAlarmAtElapsedSeconds: timer.alarmAfterSeconds || null }
          : timer
      );
      setStoredJSON(FOCUS_PERIOD_TIMERS_KEY, nextTimers);
      window.dispatchEvent(new CustomEvent(FOCUS_TIMERS_UPDATED_EVENT, { detail: nextTimers }));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [showToast]);

  return null;
};

export default FocusTimerAlarmWatcher;
