import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PenLine, ChevronDown, Timer, Plus, Play, Pause, StopCircle, Clock4, Trash2
} from 'lucide-react';
export type FocusTimerCategory = 'Vocabulary' | 'Grammar' | 'Idiom' | 'Speaking' | 'Listening' | 'Writing' | 'Reading' | 'Custom';

type FocusTimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface FocusTimerHistory {
    id: string;
    name: string;
    category: FocusTimerCategory;
    durationSeconds: number;
    stoppedAt: number;
}

export const FOCUS_TIMER_CATEGORIES: FocusTimerCategory[] = ['Vocabulary','Grammar','Idiom','Speaking','Listening','Writing','Reading','Custom'];

const FOCUS_CATEGORY_BADGES: Record<FocusTimerCategory, { color: string; bg: string }> = {
    Vocabulary: { color: 'text-blue-600', bg: 'bg-blue-50' },
    Grammar: { color: 'text-purple-600', bg: 'bg-purple-50' },
    Idiom: { color: 'text-orange-600', bg: 'bg-orange-50' },
    Speaking: { color: 'text-emerald-600', bg: 'bg-emerald-50' },
    Listening: { color: 'text-cyan-600', bg: 'bg-cyan-50' },
    Writing: { color: 'text-rose-600', bg: 'bg-rose-50' },
    Reading: { color: 'text-amber-600', bg: 'bg-amber-50' },
    Custom: { color: 'text-neutral-600', bg: 'bg-neutral-100' }
};

const FOCUS_CATEGORY_STROKES: Record<FocusTimerCategory, string> = {
    Vocabulary: '#2563eb',
    Grammar: '#7c3aed',
    Idiom: '#ea580c',
    Speaking: '#059669',
    Listening: '#0891b2',
    Writing: '#e11d48',
    Reading: '#d97706',
    Custom: '#525252'
};

export interface FocusTimerRecord {
    id: string;
    name: string;
    category: FocusTimerCategory;
    elapsedSeconds: number;
    alarmAfterSeconds?: number;
    lastAlarmAtElapsedSeconds?: number | null;
    lastStart?: number | null;
    lastActivatedAt?: number | null;
    status: FocusTimerStatus;
    createdAt: number;
}

export interface FocusPeriodPanelProps {
    visible?: boolean;
    timers: FocusTimerRecord[];
    history: FocusTimerHistory[];
    form: { name: string; category: FocusTimerCategory; hours: string; minutes: string };
    error: string | null;
    showForm: boolean;
    editingTimerId: string | null;
    elapsedEditorId: string | null;
    elapsedInputs: Record<string, { hours: string; minutes: string }>;
    limitReached: boolean;
    onFormChange: (field: 'hours' | 'minutes' | 'name' | 'category', value: string) => void;
    onToggleForm: () => void;
    onCreate: () => void;
    onStart: (id: string) => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onStop: (id: string) => void;
    onRemove: (id: string) => void;
    onEdit: (timer: FocusTimerRecord) => void;
    onToggleElapsedEditor: (id: string | null) => void;
    onElapsedInputChange: (id: string, field: 'hours' | 'minutes', value: string) => void;
    onSetElapsed: (id: string) => void;
    onDeleteHistory: (id: string) => void;
    clockTick: number;
}

export const FocusPeriodPanel: React.FC<FocusPeriodPanelProps> = ({
    visible = true,
    timers,
    history,
    form,
    error,
    showForm,
    editingTimerId,
    elapsedEditorId,
    elapsedInputs,
    limitReached,
    onFormChange,
    onToggleForm,
    onCreate,
    onStart,
    onPause,
    onResume,
    onStop,
    onRemove,
    onEdit,
    onToggleElapsedEditor,
    onElapsedInputChange,
    onSetElapsed,
    onDeleteHistory,
    clockTick
}) => {
    if (!visible) return null;
    const [isExpanded, setIsExpanded] = useState(false);
    const sortedTimers = useMemo(
        () => [...timers].sort((a, b) => {
            const aSort = a.lastActivatedAt ?? a.createdAt;
            const bSort = b.lastActivatedAt ?? b.createdAt;
            return bSort - aSort;
        }),
        [timers]
    );
    const todayStops = useMemo(() => {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();
        return history.filter(entry => {
            const stopped = new Date(entry.stoppedAt);
            return stopped.getFullYear() === y && stopped.getMonth() === m && stopped.getDate() === d;
        });
    }, [history]);
    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-black text-neutral-900 tracking-tight flex items-center gap-2">
                        <Timer size={18} className="text-neutral-500" /> Focus Period
                    </h3>
                    <p className="text-[11px] text-neutral-500">Create up to 12 timers. Alarm After only triggers reminder toasts and never changes elapsed time.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggleForm}
                        className="px-3 py-1.5 rounded-full border border-neutral-200 uppercase text-[10px] font-black tracking-widest bg-white hover:border-neutral-300 transition"
                    >
                        {showForm ? (editingTimerId ? 'Cancel edit' : 'Hide form') : (editingTimerId ? 'Cancel edit' : 'New timer')}
                    </button>
                    <button
                        onClick={() => setIsExpanded((current) => !current)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 uppercase text-[10px] font-black tracking-widest bg-white hover:border-neutral-300 transition"
                    >
                        <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                        <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {isExpanded && showForm && (
                <div className="rounded-3xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select value={form.category} onChange={(e) => onFormChange('category', e.target.value)} className="w-full rounded-2xl border border-neutral-200 p-3 bg-white text-sm font-semibold">
                            {FOCUS_TIMER_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => onFormChange('name', e.target.value)}
                            className="w-full rounded-2xl border border-neutral-200 p-3 text-sm"
                            placeholder="Timer name (optional)"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                        <label className="flex flex-col text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                            Alarm hours
                            <input min="0" type="number" value={form.hours} onChange={(e) => onFormChange('hours', e.target.value)} className="w-24 rounded-2xl border border-neutral-200 p-2 text-sm" />
                        </label>
                        <label className="flex flex-col text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                            Alarm minutes
                            <input min="0" max="59" type="number" value={form.minutes} onChange={(e) => onFormChange('minutes', e.target.value)} className="w-24 rounded-2xl border border-neutral-200 p-2 text-sm" />
                        </label>
                            <button
                                onClick={onCreate}
                                disabled={limitReached}
                                className="ml-auto inline-flex items-center gap-2 py-2 px-4 rounded-2xl bg-neutral-900 text-white text-sm font-black uppercase tracking-wider transition hover:bg-neutral-800 disabled:opacity-50"
                            >
                                <Plus className="w-4 h-4 shrink-0" />
                                <span className="whitespace-nowrap">{editingTimerId ? 'Update timer' : 'Create timer'}</span>
                            </button>
                    </div>
                    {error && <p className="text-[10px] text-rose-600 font-bold">{error}</p>}
                    <p className="text-[10px] text-neutral-400">{limitReached ? `Maximum ${MAX_FOCUS_TIMERS} timers reached` : 'Timer type, name and Alarm After only appear when creating or editing a timer.'}</p>
                </div>
            )}

            {!isExpanded && (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Summary</span>
                    <span className="text-xs font-bold text-neutral-700">{sortedTimers.length} timer(s)</span>
                    <span className="text-neutral-300">•</span>
                    <span className="text-xs font-bold text-neutral-700">{todayStops.length} stop(s) today</span>
                    <span className="text-neutral-300">•</span>
                    <span className="text-xs font-bold text-neutral-700">{sortedTimers.filter(timer => timer.status === 'running').length} running</span>
                </div>
            )}

            {isExpanded && (
                <>
                    <div className="space-y-3">
                        {sortedTimers.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">No active timers yet.</div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {sortedTimers.map(timer => {
                                const displayElapsed = timer.elapsedSeconds + (timer.status === 'running' && timer.lastStart ? Math.floor((clockTick - timer.lastStart) / 1000) : 0);
                                const badge = FOCUS_CATEGORY_BADGES[timer.category];
                                return (
                                    <div key={timer.id} className="rounded-2xl border border-neutral-200 p-4 bg-neutral-50/70 h-full">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black ${badge.color} ${badge.bg}`}>
                                                    {timer.category}
                                                </div>
                                                <p className="text-sm font-bold text-neutral-900 mt-2 break-words">{timer.name || `${timer.category} Focus`}</p>
                                                <p className="text-[10px] text-neutral-500">
                                                    {timer.status === 'completed' ? 'Stopped' : timer.status === 'paused' ? 'Paused' : timer.status === 'running' ? 'Running' : 'Ready'}
                                                </p>
                                                <p className="text-[10px] text-neutral-400 mt-0.5">
                                                    Alarm After: {timer.alarmAfterSeconds && timer.alarmAfterSeconds > 0 ? formatDuration(timer.alarmAfterSeconds) : 'Off'}
                                                </p>
                                            </div>
                                            <div className="text-lg font-black text-neutral-900 text-right shrink-0">{formatDuration(displayElapsed)}</div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {(timer.status === 'idle' || timer.status === 'completed') && (
                                                <button onClick={() => onStart(timer.id)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <Play size={12} /> {timer.status === 'completed' ? 'Restart' : 'Start'}
                                                </button>
                                            )}
                                            {timer.status === 'running' && (
                                                <button onClick={() => onPause(timer.id)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <Pause size={12} /> Pause
                                                </button>
                                            )}
                                            {timer.status === 'paused' && (
                                                <button onClick={() => onResume(timer.id)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <Play size={12} /> Resume
                                                </button>
                                            )}
                                            {(timer.status === 'running' || timer.status === 'paused') && (
                                                <button onClick={() => onStop(timer.id)} className="px-3 py-1.5 rounded-full border border-rose-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-rose-600 bg-rose-50" title="Stop session">
                                                    <StopCircle size={12} /> Stop
                                                </button>
                                            )}
                                            <button onClick={() => onEdit(timer)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-neutral-600">
                                                <PenLine size={12} /> Edit
                                            </button>
                                            <button onClick={() => onToggleElapsedEditor(timer.id)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-neutral-600">
                                                Set elapsed
                                            </button>
                                            {timer.status === 'completed' && (
                                                <button onClick={() => onRemove(timer.id)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-neutral-500">
                                                    <Trash2 size={12} /> Remove
                                                </button>
                                            )}
                                        </div>
                                        {elapsedEditorId === timer.id && (
                                            <div className="flex flex-wrap items-end gap-2 mt-3 bg-white border border-dashed border-neutral-200 rounded-2xl p-3">
                                                <label className="flex flex-col text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                                                    Hours
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={elapsedInputs[timer.id]?.hours ?? Math.floor(timer.elapsedSeconds / 3600).toString()}
                                                        onChange={(e) => onElapsedInputChange(timer.id, 'hours', e.target.value)}
                                                        className="w-20 rounded-2xl border border-neutral-200 p-2 text-sm"
                                                    />
                                                </label>
                                                <label className="flex flex-col text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                                                    Minutes
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="59"
                                                        value={elapsedInputs[timer.id]?.minutes ?? Math.floor((timer.elapsedSeconds % 3600) / 60).toString()}
                                                        onChange={(e) => onElapsedInputChange(timer.id, 'minutes', e.target.value)}
                                                        className="w-20 rounded-2xl border border-neutral-200 p-2 text-sm"
                                                    />
                                                </label>
                                                <button onClick={() => onSetElapsed(timer.id)} className="px-3 py-1.5 rounded-full bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest">Apply</button>
                                                <button onClick={() => onToggleElapsedEditor(null)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest">Close</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400">Recent Stops Today</h4>
                        {todayStops.length === 0 ? (
                            <p className="text-sm text-neutral-400">No timer stopped today yet.</p>
                        ) : (
                            todayStops.slice(0, 5).map(entry => (
                                <div key={entry.id} className="rounded-2xl border border-neutral-200 p-3 bg-white">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-neutral-900">{entry.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-semibold uppercase text-neutral-400">{entry.category}</span>
                                            <button
                                                onClick={() => onDeleteHistory(entry.id)}
                                                className="px-2 py-1 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:border-neutral-300"
                                                title="Delete this history item"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-neutral-500">{entry.category} · {formatDuration(entry.durationSeconds)}</p>
                                    <p className="text-[10px] text-neutral-400">{new Date(entry.stoppedAt).toLocaleString()}</p>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export const FocusPeriodInsights: React.FC<{ history: FocusTimerHistory[]; visible?: boolean }> = ({ history, visible = true }) => {
    if (!visible) return null;
    const dailyRows = useMemo(() => {
        const toDateKey = (value: number) => {
            const d = new Date(value);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const byDate = new Map<string, Record<FocusTimerCategory, number>>();
        history.forEach(entry => {
            const date = toDateKey(entry.stoppedAt);
            if (!byDate.has(date)) {
                byDate.set(date, {
                    Vocabulary: 0,
                    Grammar: 0,
                    Idiom: 0,
                    Speaking: 0,
                    Listening: 0,
                    Writing: 0,
                    Reading: 0,
                    Custom: 0
                });
            }
            const current = byDate.get(date)!;
            current[entry.category] += entry.durationSeconds / 60;
        });
        return Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, values]) => ({ date, values }));
    }, [history]);

    const activeCategories = useMemo(
        () =>
            FOCUS_TIMER_CATEGORIES.filter(category =>
                dailyRows.some(row => row.values[category] > 0)
            ),
        [dailyRows]
    );

    const categoryTotals = useMemo(() => {
        const totals: Record<FocusTimerCategory, number> = {
            Vocabulary: 0,
            Grammar: 0,
            Idiom: 0,
            Speaking: 0,
            Listening: 0,
            Writing: 0,
            Reading: 0,
            Custom: 0
        };
        history.forEach(entry => {
            totals[entry.category] += entry.durationSeconds / 60;
        });
        return totals;
    }, [history]);

    if (dailyRows.length === 0 || activeCategories.length === 0) {
        return (
            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-black text-neutral-900">
                    <Clock4 size={16} className="text-neutral-400" /> Focus Period Insights
                </div>
                <p className="text-[10px] text-neutral-400 mt-3">Stop a timer to see minutes logged here.</p>
            </div>
        );
    }

    const maxMinutes = Math.max(
        1,
        ...dailyRows.flatMap(row => activeCategories.map(category => row.values[category]))
    );
    const paddingX = 24;
    const paddingTop = 16;
    const chartHeight = 170;
    const width = Math.max(420, paddingX * 2 + (dailyRows.length - 1) * 36);
    const step = dailyRows.length > 1 ? (width - paddingX * 2) / (dailyRows.length - 1) : 0;
    const yFor = (value: number) => paddingTop + (chartHeight - (value / maxMinutes) * chartHeight);
    const labelStep = dailyRows.length > 45 ? 10 : dailyRows.length > 20 ? 5 : 2;

    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm font-black text-neutral-900 flex items-center gap-2">
                    <Clock4 size={16} className="text-neutral-400" /> Focus Period Insights
                </div>
                <span className="text-[10px] font-semibold text-neutral-400">Full history by day</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-neutral-500">
                {activeCategories.map(category => (
                    <div key={category} className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FOCUS_CATEGORY_STROKES[category] }} />
                        <span>{category}</span>
                        <span className="text-neutral-400">({Math.round(categoryTotals[category])}m)</span>
                    </div>
                ))}
            </div>

            <div className="overflow-x-auto">
                <svg width={width} height={chartHeight + 46} className="overflow-visible">
                    {[0.25, 0.5, 0.75, 1].map(p => {
                        const y = paddingTop + chartHeight * p;
                        return <line key={p} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="3 4" strokeWidth={1} />;
                    })}

                    {activeCategories.map(category => {
                        const points = dailyRows
                            .map((row, idx) => `${paddingX + idx * step},${yFor(row.values[category])}`)
                            .join(' ');
                        return (
                            <polyline
                                key={category}
                                points={points}
                                fill="none"
                                stroke={FOCUS_CATEGORY_STROKES[category]}
                                strokeWidth={2.2}
                            />
                        );
                    })}

                    {dailyRows.map((row, idx) => {
                        const showLabel = idx % labelStep === 0 || idx === dailyRows.length - 1;
                        if (!showLabel) return null;
                        const dt = new Date(`${row.date}T00:00:00`);
                        const label = `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
                        return (
                            <text key={row.date} x={paddingX + idx * step} y={paddingTop + chartHeight + 14} textAnchor="middle" className="text-[9px] font-semibold fill-neutral-400">
                                {label}
                            </text>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};