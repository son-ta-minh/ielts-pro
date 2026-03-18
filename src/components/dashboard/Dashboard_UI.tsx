import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RotateCw, AlertCircle, Flame,
  Download, History, BookCopy, Sparkles, Wand2, ShieldCheck, PenLine, Shuffle, Link, HelpCircle, Cloud, FileJson, ChevronDown, HardDrive, ListTodo, FileClock, Mic, BookText, GraduationCap, AudioLines, BookOpen,
  Split, LayoutDashboard, BarChart3, Keyboard, AtSign, Puzzle, Brain, AlertTriangle,
  CloudUpload, Percent, MessagesSquare, Scale, Dumbbell, Crown,
  Timer, Plus, Play, Pause, StopCircle, Clock4, Trash2
} from 'lucide-react';
import { DayProgress } from './DayProgress';
import { AppView, User, VocabularyItem, DailyStreakSnapshot, DailyGoalSnapshot } from '../../app/types';

const getFormattedBuildDate = () => {
    const buildTimestamp = (process.env as any).BUILD_TIMESTAMP;
    if (!buildTimestamp) {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `v${year}${month}${day}_dev`;
    }
    try {
        const d = new Date(buildTimestamp);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `v${year}${month}${day}_${hours}${minutes}`;
    } catch {
        return 'v_error';
    }
};

export interface StudyStats {
    vocab: { new: number, due: number };
    lessons: {
        general: { completed: number, total: number };
        irregular: { completed: number, total: number };
        grammar: { completed: number, total: number };
        comparison: { completed: number, total: number };
        scale: { completed: number, total: number };
    };
    reading: { completed: number, total: number };
    speaking: {
        freeTalk: { completed: number, total: number };
        native: { completed: number, total: number };
        conversation: { completed: number, total: number };
        pronunciation: { completed: number, total: number };
    };
    writing: { completed: number, total: number };
}

type FocusTimerCategory = 'Vocabulary' | 'Grammar' | 'Idiom' | 'Speaking' | 'Listening' | 'Writing' | 'Reading' | 'Custom';

type FocusTimerStatus = 'idle' | 'running' | 'paused' | 'completed';

interface FocusTimerRecord {
    id: string;
    name: string;
    category: FocusTimerCategory;
    totalSeconds: number;
    remainingSeconds: number;
    status: FocusTimerStatus;
    createdAt: number;
}

interface FocusTimerHistory {
    id: string;
    name: string;
    category: FocusTimerCategory;
    durationSeconds: number;
    stoppedAt: number;
}

const FOCUS_TIMER_CATEGORIES: FocusTimerCategory[] = ['Vocabulary','Grammar','Idiom','Speaking','Listening','Writing','Reading','Custom'];

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

const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    }
    return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
};

export interface DashboardUIProps {
    user: User;
    totalCount: number;
    dueCount: number;
    newCount: number;
    learnedCount: number;
    rawCount: number;
    refinedCount: number;
    reviewStats: { learned: number; mastered: number; statusForgot: number; statusHard: number; statusEasy: number; statusLearned: number; };
    wotd: VocabularyItem | null;
    isWotdComposed: boolean;
    onRandomizeWotd: () => void;
    onComposeWotd: () => void;
    goalStats: { totalTasks: number; completedTasks: number; };
    studyStats: StudyStats | null;
    isStatsLoading: boolean;
    onRefreshStats: () => Promise<void>;
    onNavigate: (view: AppView) => void;
    onNavigateToWordList: (filter: string) => void;
    onStartDueReview: () => void;
    onStartStatusReview: (status: 'hard' | 'forgot') => void;
    onStartNewLearn: () => void;
    lastBackupTime: number | null;
    onBackup: (mode: 'server' | 'file') => void;
    onRestore: (mode: 'server' | 'file') => void;
    dayProgress: { learned: number; reviewed: number; learnedWords: VocabularyItem[]; reviewedWords: VocabularyItem[]; };
    dailyGoals: { max_learn_per_day: number; max_review_per_day: number; };
    dailyStreaks: DailyStreakSnapshot[];
    dailyGoalHistory: DailyGoalSnapshot[];
    serverStatus: 'connected' | 'disconnected';
    serverUrl?: string;
    activeServerMode?: 'home' | 'public' | null;
    isSwitchingServerMode?: boolean;
    onToggleServerMode?: (mode: 'home' | 'public') => Promise<boolean>;
    onAction: (action: string) => void;
    onViewWord: (word: VocabularyItem) => void;
}

const TinyProgressRing: React.FC<{ percent: number, size?: number, stroke?: number }> = ({ percent, size = 20, stroke = 2.5 }) => {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    
    let colorClass = 'text-neutral-300';
    if (percent >= 80) colorClass = 'text-green-500';
    else if (percent >= 40) colorClass = 'text-yellow-500';
    else if (percent > 0) colorClass = 'text-orange-500';
    
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="transform -rotate-90" width={size} height={size}>
                <circle
                    className="text-neutral-100 group-hover:text-neutral-800 transition-colors"
                    stroke="currentColor"
                    strokeWidth={stroke}
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className={`${colorClass} transition-all duration-500 ease-out`}
                    stroke="currentColor"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                    style={{
                        strokeDasharray: circumference,
                        strokeDashoffset: offset
                    }}
                />
            </svg>
        </div>
    );
};

const NavButton: React.FC<{ 
    label: string, 
    subLabel?: React.ReactNode,
    progress?: number,
    icon: React.ElementType, 
    color: string, 
    bg: string,    
    onClick: () => void,
    disabled?: boolean,
    largeSub?: boolean
}> = ({ label, subLabel, progress, icon: Icon, color, bg, onClick, disabled, largeSub }) => {
    return (
        <button 
            onClick={onClick} 
            disabled={disabled}
            className="flex items-start gap-3 p-3 rounded-2xl border border-neutral-100 bg-white hover:bg-neutral-900 hover:border-neutral-900 hover:shadow-lg transition-all active:scale-95 w-full text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-neutral-100 disabled:hover:shadow-none"
        >
            <div className={`p-2 rounded-xl ${bg} ${color} group-hover:scale-110 transition-transform shrink-0 mt-0.5`}>
                <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
                <div className={`text-xs font-black text-neutral-900 ${!disabled ? 'group-hover:text-white' : ''} transition-colors tracking-tight leading-tight`}>{label}</div>
                {subLabel && (
                    <div className={`font-medium text-neutral-400 ${!disabled ? 'group-hover:text-neutral-300' : ''} transition-colors mt-0.5 leading-snug ${largeSub ? 'text-[10px]' : 'text-[10px] truncate'}`}>
                        {subLabel}
                    </div>
                )}
            </div>
            {typeof progress === 'number' && (
                <div className="shrink-0 ml-1">
                    <TinyProgressRing percent={progress} />
                </div>
            )}
        </button>
    );
};

const MasteryOverviewPanel: React.FC<{ stats: StudyStats | null }> = ({ stats }) => {
    const getProg = (comp: number, tot: number) => tot > 0 ? Math.round((comp / tot) * 100) : 0;
    
    // Aggregate speaking stats
    const speakingCompleted = stats ? (stats.speaking.freeTalk.completed + stats.speaking.native.completed + stats.speaking.conversation.completed) : 0;
    const speakingTotal = stats ? (stats.speaking.freeTalk.total + stats.speaking.native.total + stats.speaking.conversation.total) : 0;
    
    const StatRow = ({
        label,
        completed,
        total,
        icon: Icon,
        colorClass,
        }: {
        label: string;
        completed: number;
        total: number;
        icon: any;
        colorClass: string;
        }) => (
        <div className="flex items-start gap-2 p-2 rounded-xl bg-neutral-50/50 hover:bg-neutral-50 transition-colors border border-transparent hover:border-neutral-100">
            
            {/* Icon */}
            <div className={`p-1.5 rounded-lg ${colorClass} bg-white shadow-sm shrink-0`}>
            <Icon size={12} />
            </div>

            {/* Text Block */}
            <div className="flex flex-col flex-1 min-w-0 leading-tight">
            <span className="text-[10px] font-bold text-neutral-700 truncate">
                {label}
            </span>

            <span className="text-[9px] font-medium text-neutral-400">
                {completed}/{total}
            </span>
            </div>

            {/* Progress Ring */}
            <div className="shrink-0">
            <TinyProgressRing percent={getProg(completed, total)} size={18} />
            </div>
        </div>
        );

    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-4 h-full justify-center">
            <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-neutral-900 text-white rounded-lg"><Percent size={14}/></div>
                <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Mastery Status</h3>
            </div>
            
            {/* 4 Columns for compactness */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatRow label="Reading" completed={stats?.reading.completed || 0} total={stats?.reading.total || 0} icon={BookOpen} colorClass="text-indigo-600" />
                <StatRow label="Writing" completed={stats?.writing.completed || 0} total={stats?.writing.total || 0} icon={PenLine} colorClass="text-pink-600" />
                <StatRow label="Speaking" completed={speakingCompleted} total={speakingTotal} icon={Mic} colorClass="text-rose-600" />
                
                <StatRow label="Grammar" completed={stats?.lessons.grammar.completed || 0} total={stats?.lessons.grammar.total || 0} icon={BookText} colorClass="text-purple-600" />
                <StatRow label="Verbs" completed={stats?.lessons.irregular.completed || 0} total={stats?.lessons.irregular.total || 0} icon={FileClock} colorClass="text-orange-600" />
                <StatRow label="Pronunciation" completed={stats?.speaking.pronunciation.completed || 0} total={stats?.speaking.pronunciation.total || 0} icon={AudioLines} colorClass="text-emerald-600" />
                <StatRow label="Lessons" completed={stats?.lessons.general.completed || 0} total={stats?.lessons.general.total || 0} icon={BookOpen} colorClass="text-blue-600" />
            </div>
        </div>
    );
};

const VocabularyCenterPanel: React.FC<{
    stats: StudyStats | null;
    totalCount: number;
    newCount: number;
    studyingCount: number;
    masteredCount: number;
    rawCount: number;
    refinedCount: number;
    forgottenCount: number;
    hardCount: number;
    easyCount: number;
    onStartNew: () => void;
    onStartDue: () => void;
    onStartStatusReview: (status: 'hard' | 'forgot') => void;
    onRefineRaw: () => void;
    onVerifyRefined: () => void;
    onFilterStatus: (filter: string) => void;
}> = ({
    stats, totalCount, newCount, studyingCount, masteredCount, rawCount, refinedCount, forgottenCount, hardCount, easyCount,
    onStartNew, onStartDue, onStartStatusReview, onRefineRaw, onVerifyRefined, onFilterStatus
}) => {
    const newPercent = totalCount > 0 ? (newCount / totalCount) * 100 : 0;
    const studyingPercent = totalCount > 0 ? (studyingCount / totalCount) * 100 : 0;
    const masteredPercent = totalCount > 0 ? (masteredCount / totalCount) * 100 : 0;

    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-4">
             <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 shadow-md">
                     <BookCopy size={18} />
                 </div>
                 <div>
                     <h3 className="text-base font-black text-neutral-900 tracking-tight">Vocabulary Center</h3>
                     <p className="text-[10px] font-medium text-neutral-400">Manage and expand your lexical resource.</p>
                 </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Chart Section - 2 Columns */}
                <div className="lg:col-span-2 flex flex-col justify-center gap-4 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-neutral-500 uppercase tracking-wider">Distribution</span>
                        <span className="text-xs font-bold text-neutral-400">{totalCount} Total Words</span>
                    </div>
                    
                    <div className="h-4 bg-white rounded-full flex overflow-hidden border border-neutral-200 shadow-inner">
                        <div className="h-full bg-purple-500" style={{ width: `${masteredPercent}%` }} />
                        <div className="h-full bg-cyan-500" style={{ width: `${studyingPercent}%` }} />
                        <div className="h-full bg-neutral-300" style={{ width: `${newPercent}%` }} />
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                            <span className="text-[10px] font-bold text-neutral-600">Mastered ({masteredCount})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-cyan-500" />
                            <span className="text-[10px] font-bold text-neutral-600">Learning ({studyingCount})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-neutral-300" />
                            <span className="text-[10px] font-bold text-neutral-600">New ({newCount})</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                        <button
                            onClick={() => onFilterStatus('easy')}
                            className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100 transition-all"
                        >
                            Easy Words ({easyCount})
                        </button>
                        <button
                            onClick={() => onFilterStatus('hard')}
                            className="px-3 py-2 rounded-xl bg-orange-50 text-orange-700 text-[10px] font-bold border border-orange-200 hover:bg-orange-100 transition-all"
                        >
                            Hard Words ({hardCount})
                        </button>
                        <button
                            onClick={() => onFilterStatus('forgot')}
                            className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-[10px] font-bold border border-red-200 hover:bg-red-100 transition-all"
                        >
                            Forgotten ({forgottenCount})
                        </button>
                    </div>
                </div>

                {/* Actions - 2 Columns (3x2 Grid) */}
                <div className="lg:col-span-2 grid grid-cols-2 gap-3">

                    {/* Row 1 */}
                    <NavButton 
                        label="Learn New" 
                        subLabel={`${stats ? stats.vocab.new : '-'} words ready`} 
                        icon={Sparkles} 
                        color="text-indigo-600" 
                        bg="bg-indigo-50" 
                        onClick={onStartNew} 
                        disabled={!stats || stats.vocab.new === 0} 
                    />

                    <NavButton 
                        label="Review Due" 
                        subLabel={`${stats ? stats.vocab.due : '-'} words due`} 
                        icon={RotateCw} 
                        color="text-amber-600" 
                        bg="bg-amber-50" 
                        onClick={onStartDue} 
                        disabled={!stats || stats.vocab.due === 0} 
                    />

                    {/* Row 2 */}
                    <NavButton 
                        label="Review Forgot" 
                        subLabel={`${forgottenCount} words`} 
                        icon={AlertCircle} 
                        color="text-red-600" 
                        bg="bg-red-50" 
                        onClick={() => onStartStatusReview('forgot')} 
                        disabled={forgottenCount === 0} 
                    />

                    <NavButton 
                        label="Review Hard" 
                        subLabel={`${hardCount} words`} 
                        icon={Flame} 
                        color="text-orange-600" 
                        bg="bg-orange-50" 
                        onClick={() => onStartStatusReview('hard')} 
                        disabled={hardCount === 0} 
                    />

                    {/* Row 3 */}
                    <NavButton 
                        label="Refine" 
                        subLabel={`${rawCount} raw words`} 
                        icon={Wand2} 
                        color="text-purple-600" 
                        bg="bg-purple-50" 
                        onClick={onRefineRaw} 
                        disabled={rawCount === 0} 
                    />

                    <NavButton 
                        label="Verify" 
                        subLabel={`${refinedCount} pending`} 
                        icon={ShieldCheck} 
                        color="text-emerald-600" 
                        bg="bg-emerald-50" 
                        onClick={onVerifyRefined} 
                        disabled={refinedCount === 0} 
                    />

                </div>
             </div>
        </div>
    );
};

const StudyNowPanel: React.FC<{
    stats: StudyStats | null;
    isLoading: boolean;
    onAction: (action: string) => void;
}> = ({ isLoading, onAction }) => {

    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-4 relative overflow-hidden">
            {isLoading && (
                <div className="absolute top-4 right-4 animate-spin text-neutral-300">
                    <RotateCw size={16} />
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                 <div className="flex items-center gap-3">
                     <div className="p-2 bg-neutral-900 rounded-xl text-white shadow-md">
                         <GraduationCap size={18} />
                     </div>
                     <div>
                         <h3 className="text-base font-black text-neutral-900 tracking-tight">Study Center</h3>
                         <p className="text-[10px] font-medium text-neutral-400">Track your mastery across all skills.</p>
                     </div>
                 </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <NavButton largeSub label="Lesson" subLabel="Explore all learning materials." icon={BookOpen} color="text-blue-600" bg="bg-blue-50" onClick={() => onAction('LESSON_ONLY')} />
                <NavButton largeSub label="Grammar" subLabel="Deep dive into essential grammar rules." icon={BookText} color="text-purple-600" bg="bg-purple-50" onClick={() => onAction('LESSON_GRAMMAR')} />
                <NavButton largeSub label="Irregular Verb" subLabel="Master tricky verb forms and usage." icon={FileClock} color="text-orange-600" bg="bg-orange-50" onClick={() => onAction('IRREGULAR_VERBS')} />
                <NavButton largeSub label="Pronunciation" subLabel="Perfect your accent and intonation." icon={AudioLines} color="text-emerald-600" bg="bg-emerald-50" onClick={() => onAction('PRONUNCIATION_ROADMAP')} />
                <NavButton largeSub label="Word Intensity" subLabel="Master nuanced words by their scale." icon={Scale} color="text-orange-600" bg="bg-orange-50" onClick={() => onAction('LESSON_SCALE')} />
                <NavButton largeSub label="Confusing Words" subLabel="Contrast and identify confusing pairs." icon={Split} color="text-indigo-600" bg="bg-indigo-50" onClick={() => onAction('LESSON_DIFF')} />
                <NavButton largeSub label="Mistake Cards" subLabel="Review common mistakes and corrections." icon={AlertTriangle} color="text-rose-600" bg="bg-rose-50" onClick={() => onAction('LESSON_MISTAKE')} />
            </div>
        </div>
    );
};

const FocusPeriodPanel: React.FC<{
    timers: FocusTimerRecord[];
    history: FocusTimerHistory[];
    form: { name: string; category: FocusTimerCategory; hours: string; minutes: string };
    error: string | null;
    onFormChange: (field: 'hours' | 'minutes' | 'name' | 'category', value: string) => void;
    onCreate: () => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onStop: (id: string) => void;
    onRemove: (id: string) => void;
    limitReached: boolean;
}> = ({ timers, history, form, error, onFormChange, onCreate, onPause, onResume, onStop, onRemove, limitReached }) => (
    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
                <h3 className="text-base font-black text-neutral-900 tracking-tight flex items-center gap-2">
                    <Timer size={18} className="text-neutral-500" /> Focus Period
                </h3>
                <p className="text-[11px] text-neutral-500">Create up to 12 timers, pause/resume at will, then stop to store the session history.</p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Insights will show in the chart below</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 space-y-3">
                <div className="space-y-2">
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
                            placeholder="Timer name"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                        <label className="flex flex-col text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                            Hours
                            <input min="0" type="number" value={form.hours} onChange={(e) => onFormChange('hours', e.target.value)} className="w-24 rounded-2xl border border-neutral-200 p-2 text-sm" />
                        </label>
                        <label className="flex flex-col text-[10px] text-neutral-500 font-black uppercase tracking-widest">
                            Minutes
                            <input min="0" max="59" type="number" value={form.minutes} onChange={(e) => onFormChange('minutes', e.target.value)} className="w-24 rounded-2xl border border-neutral-200 p-2 text-sm" />
                        </label>
                        <button onClick={onCreate} disabled={limitReached} className="ml-auto py-2 px-4 rounded-2xl bg-neutral-900 text-white text-sm font-black uppercase tracking-wider transition hover:bg-neutral-800 disabled:opacity-50">
                            <Plus size={12} /> Create Timer
                        </button>
                    </div>
                    {error && <p className="text-[10px] text-rose-600 font-bold">{error}</p>}
                    <p className="text-[10px] text-neutral-400">{limitReached ? 'Maximum 12 timers reached' : 'You can start multiple focus periods in parallel.'}</p>
                </div>
                <div className="space-y-3">
                    {timers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">No active timers yet.</div>
                    )}
                    {(() => {
                        const sortedTimers = [...timers].sort((a,b) => b.createdAt - a.createdAt);
                        return sortedTimers.map(timer => {
                            const badge = FOCUS_CATEGORY_BADGES[timer.category];
                            return (
                                <div key={timer.id} className="rounded-2xl border border-neutral-200 p-4 bg-neutral-50/70">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black ${badge.color} ${badge.bg}`}>
                                            {timer.category}
                                        </div>
                                        <p className="text-sm font-bold text-neutral-900 mt-2">{timer.name}</p>
                                        <p className="text-[10px] text-neutral-500">{timer.status === 'completed' ? 'Stopped' : timer.status === 'paused' ? 'Paused' : 'Running'}</p>
                                    </div>
                                    <div className="text-lg font-black text-neutral-900">{formatDuration(timer.remainingSeconds)}</div>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-4">
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
                                    {timer.status === 'completed' && (
                                        <button onClick={() => onRemove(timer.id)} className="px-3 py-1.5 rounded-full border border-neutral-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-neutral-500">
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                        })
                    })()}
                </div>
            </div>
            <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400">Recent Stops</h4>
                {history.length === 0 ? (
                    <p className="text-sm text-neutral-400">Stopped timers will appear here once completed.</p>
                ) : (
                    history.slice(0, 5).map(entry => (
                        <div key={entry.id} className="rounded-2xl border border-neutral-200 p-3 bg-white">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-neutral-900">{entry.name}</span>
                                <span className="text-[10px] font-semibold uppercase text-neutral-400">{entry.category}</span>
                            </div>
                            <p className="text-[10px] text-neutral-500">{entry.category} · {formatDuration(entry.durationSeconds)}</p>
                            <p className="text-[10px] text-neutral-400">{new Date(entry.stoppedAt).toLocaleString()}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
);

const FocusPeriodInsights: React.FC<{ history: FocusTimerHistory[] }> = ({ history }) => {
    const summary = useMemo(() => {
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
            totals[entry.category] = (totals[entry.category] || 0) + entry.durationSeconds;
        });
        return totals;
    }, [history]);
    const maxMinutes = Math.max(...Object.values(summary).map(sec => sec / 60), 1);
    const entries = Object.entries(summary).filter(([, seconds]) => seconds > 0) as [FocusTimerCategory, number][];
    if (entries.length === 0) {
        return (
            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-black text-neutral-900">
                    <Clock4 size={16} className="text-neutral-400" /> Focus Period Insights
                </div>
                <p className="text-[10px] text-neutral-400 mt-3">Stop a timer to see minutes logged here.</p>
            </div>
        );
    }
    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-sm font-black text-neutral-900 flex items-center gap-2">
                    <Clock4 size={16} className="text-neutral-400" /> Focus Period Insights
                </div>
                <span className="text-[10px] font-semibold text-neutral-400">Last updates</span>
            </div>
            <div className="space-y-3">
                {entries.map(([category, seconds]) => {
                    const minutes = Math.round(seconds / 60);
                    const width = Math.min(100, (minutes / maxMinutes) * 100);
                    const badge = FOCUS_CATEGORY_BADGES[category];
                    return (
                        <div key={category}>
                            <div className="flex items-center justify-between">
                                <span className={`text-[12px] font-bold ${badge.color}`}>{category}</span>
                                <span className="text-[10px] font-semibold text-neutral-500">{minutes} min</span>
                            </div>
                            <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${width}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const buildDateRange = (year: number, month: number | 'all') => {
    if (month === 'all') {
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31);
        const days: string[] = [];
        const current = new Date(start);
        while (current <= end) {
            days.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        return days;
    }
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const days: string[] = [];
    const current = new Date(start);
    while (current <= end) {
        days.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    return days;
};

const Legend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
  <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-neutral-500">
    {items.map(item => (
      <div key={item.label} className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${item.color}`} /> {item.label}
      </div>
    ))}
  </div>
);

const LineStreakChart: React.FC<{
  rows: {
    date: string;
    learned: number | undefined;
    reviewed: number | undefined;
    learnGoal: number | undefined;
    reviewGoal: number | undefined;
    metLearn: boolean;
    metReview: boolean;
  }[];
  maxValue: number;
  labelStep: number;
  selectedMonth: number | 'all';
}> = ({ rows, maxValue, labelStep, selectedMonth }) => {
  const [hoverPoint, setHoverPoint] = useState<{ index: number; type: 'learned' | 'reviewed' } | null>(null);

  if (rows.length === 0) return <div className="text-[11px] text-neutral-400">No data yet.</div>;

  const paddingX = 24;
  const paddingTop = 16;
  const paddingBottom = 32;
  const chartHeight = 160;
  const width = Math.max(320, paddingX * 2 + (rows.length - 1) * 32);
  const step = rows.length > 1 ? (width - paddingX * 2) / (rows.length - 1) : 0;

  const yFor = (value: number) =>
    paddingTop + (chartHeight - (value / (maxValue || 1)) * chartHeight);
  const xPositions = rows.map((_, i) => paddingX + i * step);

  const learnedRows = rows.filter(r => r.learned != null);
  const reviewedRows = rows.filter(r => r.reviewed != null);
  const pointsLearned = learnedRows.map(r => {
    const i = rows.indexOf(r);
    return `${paddingX + i * step},${yFor(r.learned as number)}`;
  });
  const pointsReviewed = reviewedRows.map(r => {
    const i = rows.indexOf(r);
    return `${paddingX + i * step},${yFor(r.reviewed as number)}`;
  });

  // Trend line: only use daily goals for the current day; past days without activity remain 0
  let cumLearn = 0;
  let cumReview = 0;
  const trendLearnPoints: string[] = [];
  const trendReviewPoints: string[] = [];

  const today = new Date().toISOString().slice(0, 10);
  // --- DEBUG LOGGING for today's row and trend values ---
  const todayRow = rows.find(r => r.date === today);
  console.log("[DailyStreak Debug] today =", today);
  console.log("[DailyStreak Debug] todayRow =", todayRow);
  // -----------------------------------------------------

  rows.forEach((r, i) => {
    const isToday = r.date === today;

    let learnValue: number;
    let reviewValue: number;

    if (isToday) {
      // if today has no real activity yet (0), project using goal
      learnValue = r.learned && r.learned > 0 ? r.learned : (r.learnGoal ?? 0);
      reviewValue = r.reviewed && r.reviewed > 0 ? r.reviewed : (r.reviewGoal ?? 0);
    } else {
      // past days: keep actual value (0 means no study)
      learnValue = r.learned ?? 0;
      reviewValue = r.reviewed ?? 0;
    }

    // --- DEBUG LOGGING for trend calculation values ---
    if (isToday) {
      console.log("[DailyStreak Debug] trend today values", {
        learned: r.learned,
        review: r.reviewed,
        learnGoal: r.learnGoal,
        reviewGoal: r.reviewGoal,
        learnValue,
        reviewValue
      });
    }
    // -------------------------------------------------

    cumLearn += learnValue;
    cumReview += reviewValue;

    const count = i + 1;

    trendLearnPoints.push(`${paddingX + i * step},${yFor(cumLearn / count)}`);
    trendReviewPoints.push(`${paddingX + i * step},${yFor(cumReview / count)}`);
  });

  const tooltipRow = hoverPoint ? rows[hoverPoint.index] : null;
  const tooltipX = hoverPoint ? xPositions[hoverPoint.index] : 0;
  const tooltipY = (() => {
    if (!hoverPoint || !tooltipRow) return 0;
    if (hoverPoint.type === 'learned' && tooltipRow.learned != null) {
      return yFor(tooltipRow.learned) - 8;
    }
    if (hoverPoint.type === 'reviewed' && tooltipRow.reviewed != null) {
      return yFor(tooltipRow.reviewed) - 8;
    }
    return 0;
  })();

  return (
    <div className="relative overflow-x-auto pb-4">
      <div className="min-w-full" style={{ minWidth: width }}>
        <svg
          width={width}
          height={chartHeight + paddingTop + paddingBottom}
          viewBox={`0 0 ${width} ${chartHeight + paddingTop + paddingBottom}`}
          className="overflow-visible"
        >
          {/* grid lines */}
          {[0.25, 0.5, 0.75, 1].map((p) => {
            const y = paddingTop + chartHeight * p;
            return <line key={p} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="3 4" strokeWidth={1} />;
          })}

          {/* learned path */}
          {pointsLearned.length > 0 && <polyline points={pointsLearned.join(' ')} fill="none" stroke="#10b981" strokeWidth={2.5} />} 
          {pointsReviewed.length > 0 && <polyline points={pointsReviewed.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth={2.5} />} 
          {/* trend lines */}
          {trendLearnPoints.length > 1 && <polyline points={trendLearnPoints.join(' ')} fill="none" stroke="#6ee7b7" strokeWidth={1.8} strokeDasharray="6 4" />} 
          {trendReviewPoints.length > 1 && <polyline points={trendReviewPoints.join(' ')} fill="none" stroke="#7dd3fc" strokeWidth={1.8} strokeDasharray="6 4" />} 

          {/* dots */}
          {rows.map((row, i) => {
            const x = xPositions[i];
            const learnedY = row.learned != null ? yFor(row.learned) : null;
            const reviewedY = row.reviewed != null ? yFor(row.reviewed) : null;
            const learnedColor = row.learnGoal ? (row.metLearn ? '#10b981' : '#f59e0b') : '#9ca3af';
            const reviewColor = row.reviewGoal ? (row.metReview ? '#10b981' : '#f59e0b') : '#9ca3af';
            return (
              <g key={row.date}>
                {learnedY != null && (
                  <circle
                    cx={x - 3}
                    cy={learnedY}
                    r={4}
                    fill={learnedColor}
                    stroke="white"
                    strokeWidth={1.5}
                    onMouseEnter={() => setHoverPoint({ index: i, type: 'learned' })}
                    onMouseLeave={() => setHoverPoint(null)}
                  />
                )}
                {reviewedY != null && (
                  <circle
                    cx={x + 3}
                    cy={reviewedY}
                    r={4}
                    fill={reviewColor}
                    stroke="white"
                    strokeWidth={1.5}
                    onMouseEnter={() => setHoverPoint({ index: i, type: 'reviewed' })}
                    onMouseLeave={() => setHoverPoint(null)}
                  />
                )}
              </g>
            );
          })}

          {/* x-axis labels */}
          {rows.map((row, i) => {
            const showLabel = i % labelStep === 0 || i === rows.length - 1;
            if (!showLabel) return null;
            const dateObj = new Date(row.date);
            const label = selectedMonth === 'all'
              ? (dateObj.getDate() === 1 ? MONTH_LABELS[dateObj.getMonth()] : '')
              : String(dateObj.getDate());
            if (!label) return null;
            return (
              <text key={row.date} x={xPositions[i]} y={paddingTop + chartHeight + 14} textAnchor="middle" className="text-[9px] font-semibold fill-neutral-400">
                {label}
              </text>
            );
          })}
        </svg>
      </div>

      {tooltipRow && (
        <div
          className="pointer-events-none absolute z-10 bg-white border border-neutral-200 shadow-lg rounded-lg px-3 py-2 text-[10px] font-semibold text-neutral-700"
          style={{
            left: tooltipX,
            top: tooltipY,
            transform: tooltipY < paddingTop + 40
              ? 'translate(-50%, 8px)'
              : 'translate(-50%, -100%)'
          }}
        >
          <div className="text-[9px] font-bold text-neutral-500">{tooltipRow.date}</div>
          {hoverPoint?.type === 'learned' && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Learned {tooltipRow.learned ?? '-'} / {tooltipRow.learnGoal ?? '-'}
            </div>
          )}
          {hoverPoint?.type === 'reviewed' && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              Reviewed {tooltipRow.reviewed ?? '-'} / {tooltipRow.reviewGoal ?? '-'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DailyStreakChart: React.FC<{
    streaks: DailyStreakSnapshot[];
    goals: DailyGoalSnapshot[];
}> = ({ streaks, goals }) => {
    const today = new Date();
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        streaks.forEach(s => years.add(Number(s.date.slice(0, 4))));
        if (years.size === 0) years.add(today.getFullYear());
        return Array.from(years).sort((a, b) => a - b);
    }, [streaks, today]);

    const [selectedYear, setSelectedYear] = useState<number>(() => {
        const currentYear = today.getFullYear();
        return availableYears.includes(currentYear) ? currentYear : availableYears[availableYears.length - 1];
    });
    const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(() => today.getMonth());

    useEffect(() => {
        if (!availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[availableYears.length - 1]);
        }
    }, [availableYears, selectedYear]);

    const streakMap = useMemo(() => new Map(streaks.map(s => [s.date, s])), [streaks]);
    const goalMap = useMemo(() => new Map(goals.map(g => [g.date, g])), [goals]);

    const dateRange = useMemo(() => buildDateRange(selectedYear, selectedMonth), [selectedYear, selectedMonth]);
    const dailyRows = useMemo(() => dateRange.map(date => {
        const snapshot = streakMap.get(date);
        const legacyGoal = goalMap.get(date);
        const learned = snapshot?.learned;
        const reviewed = snapshot?.reviewed;
        const learnGoal = snapshot?.learnGoal ?? legacyGoal?.learn;
        const reviewGoal = snapshot?.reviewGoal ?? legacyGoal?.review;
        const metLearn = learnGoal != null && learned != null ? learned >= learnGoal : false;
        const metReview = reviewGoal != null && reviewed != null ? reviewed >= reviewGoal : false;
        const hasData = learned != null || reviewed != null || learnGoal != null || reviewGoal != null;
        return {
            date,
            learned,
            reviewed,
            learnGoal,
            reviewGoal,
            metLearn,
            metReview,
            hasData
        };
    }), [dateRange, streakMap, goalMap]);

    const plottedRows = useMemo(() => dailyRows.filter(r => r.learned != null || r.reviewed != null), [dailyRows]);

    const maxValue = Math.max(
        1,
        ...plottedRows.map(r => r.learned ?? 0),
        ...plottedRows.map(r => r.reviewed ?? 0),
        ...plottedRows.map(r => r.learnGoal ?? 0),
        ...plottedRows.map(r => r.reviewGoal ?? 0)
    );

    const labelStep = selectedMonth === 'all' ? 15 : 3;

    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-black text-neutral-900 tracking-tight">DAILY STREAK</h3>
                    <p className="text-[10px] font-medium text-neutral-400">Learned + Reviewed per day with goal crowns.</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="px-3 py-2 text-[10px] font-bold rounded-xl border border-neutral-200 bg-white"
                    >
                        {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                    <select
                        value={selectedMonth === 'all' ? 'all' : String(selectedMonth)}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSelectedMonth(value === 'all' ? 'all' : Number(value));
                        }}
                        className="px-3 py-2 text-[10px] font-bold rounded-xl border border-neutral-200 bg-white"
                    >
                        <option value="all">All Months</option>
                        {MONTH_LABELS.map((label, idx) => (
                            <option key={label} value={idx}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <Legend
              items={[
                { label: 'Learned', color: 'bg-emerald-500' },
                { label: 'Reviewed', color: 'bg-sky-500' },
                { label: 'Trend Learned', color: 'bg-emerald-300' },
                { label: 'Trend Reviewed', color: 'bg-sky-300' }
              ]}
            />

            <LineStreakChart
              rows={plottedRows}
              maxValue={maxValue}
              labelStep={labelStep}
              selectedMonth={selectedMonth}
            />
        </div>
    );
};

const PracticeArcadePanel: React.FC<{ onAction: (action: string) => void }> = ({ onAction }) => {
    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-3">
             <div className="flex items-center gap-3">
                 <div className="p-2 bg-fuchsia-50 rounded-xl text-fuchsia-600 shadow-md">
                     <Dumbbell size={18} />
                 </div>
                 <div>
                     <h3 className="text-base font-black text-neutral-900 tracking-tight">Practice Arcade</h3>
                     <p className="text-[10px] font-medium text-neutral-400">Targeted drills to refine specific lexical skills.</p>
                 </div>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <NavButton 
                   label="Pronunciation Focus" 
                   subLabel="Targeted speech practice." 
                   largeSub icon={Mic} color="text-rose-600" bg="bg-rose-50" onClick={() => onAction('MIMIC')} 
                />
                <NavButton 
                   label="Listening & Spelling" 
                   subLabel="Dictation drills to sharpen auditory accuracy." 
                   largeSub icon={Keyboard} color="text-cyan-600" bg="bg-cyan-50" onClick={() => onAction('DICTATION')} 
                />
                 <NavButton 
                    label="Grammar & Syntax" 
                    subLabel="Unscramble sentences to master word order." 
                    largeSub icon={Shuffle} color="text-emerald-600" bg="bg-emerald-50" onClick={() => onAction('SENTENCE_SCRAMBLE')} 
                 />
                 <NavButton 
                    label="Phonetic Accuracy" 
                    subLabel="Refine pronunciation with minimal pairs and IPA." 
                    largeSub icon={AudioLines} color="text-rose-600" bg="bg-rose-50" onClick={() => onAction('IPA_SORTER')} 
                 />
                 <NavButton 
                    label="Dependent Prepositions" 
                    subLabel="Master verb, noun, and adjective preposition pairings." 
                    largeSub icon={AtSign} color="text-violet-600" bg="bg-violet-50" onClick={() => onAction('PREPOSITION_POWER')} 
                 />
                 <NavButton 
                    label="Contextual Usage" 
                    subLabel="Match synonyms and idioms to correct contexts." 
                    largeSub icon={Puzzle} color="text-sky-600" bg="bg-sky-50" onClick={() => onAction('PARAPHRASE_CONTEXT')} 
                 />
                 <NavButton 
                    label="Rapid Recall" 
                    subLabel="Speed test: Connect terms with definitions." 
                    largeSub icon={Brain} color="text-fuchsia-600" bg="bg-fuchsia-50" onClick={() => onAction('WORD_SCATTER')} 
                 />
                 <NavButton
                    label="Natural Expression"
                    subLabel="Master native phrases and idioms in context."
                    largeSub icon={MessagesSquare} color="text-amber-600" bg="bg-amber-50" onClick={() => onAction('NATURAL_EXPRESSION')}
                 />
                 <NavButton
                    label="Intensity Scale"
                    subLabel="Link nuanced words by their scale of intensity."
                    largeSub icon={Scale} color="text-orange-600" bg="bg-orange-50" onClick={() => onAction('INTENSITY_SCALE')}
                 />
                 <NavButton
                    label="Word Contrast"
                    subLabel="Contrast and identify confusing word pairs."
                    largeSub icon={Split} color="text-indigo-600" bg="bg-indigo-50" onClick={() => onAction('COMPARISON_LAB')}
                 />
                 <NavButton
                    label="Mistake Recognition"
                    subLabel="Spot mistakes, reveal fixes, then self-evaluate."
                    largeSub icon={AlertTriangle} color="text-rose-600" bg="bg-rose-50" onClick={() => onAction('MISTAKE_RECOGNITION')}
                 />
                 <NavButton
                    label="Register Pick"
                    subLabel="Classify words as Academic, Casual, or Neutral."
                    largeSub icon={Sparkles} color="text-amber-600" bg="bg-amber-50" onClick={() => onAction('REGISTER_PICK')}
                 />
             </div>
        </div>
    );
};

const GoalProgressPanel: React.FC<{
    goalStats: { totalTasks: number; completedTasks: number; };
    onAction: (action: string) => void;
}> = ({ goalStats, onAction }) => {
    const planPercent = goalStats.totalTasks > 0 ? Math.round((goalStats.completedTasks / goalStats.totalTasks) * 100) : 0;
    
    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col justify-center h-full">
            <div className="flex justify-between items-start mb-2">
                 <div className="space-y-0.5">
                    <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Active Plan</h3>
                    <p className="text-xl font-black text-neutral-900 leading-none">{goalStats.completedTasks} / {goalStats.totalTasks} <span className="text-xs text-neutral-400 font-bold">Tasks</span></p>
                 </div>
                 <button onClick={() => onAction('PLANNING')} className="p-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors -mr-2 -mt-2">
                     <ListTodo size={18} />
                 </button>
            </div>
            <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden mb-2">
                 <div className={`h-full transition-all duration-1000 ${planPercent === 100 ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${planPercent}%` }} />
            </div>
            <p className="text-[10px] font-bold text-neutral-400 text-right">{planPercent}% Completed</p>
        </div>
    );
};

const BackupStatus: React.FC<{ 
    lastBackupTime: number | null; 
    onBackup: (mode: 'server' | 'file') => void; 
    onRestore: (mode: 'server' | 'file') => void; 
    serverStatus: 'connected' | 'disconnected';
}> = ({ lastBackupTime, onBackup, onRestore, serverStatus }) => {
  const [statusText, setStatusText] = useState('');
  const [isBackupMenuOpen, setIsBackupMenuOpen] = useState(false);
  const backupMenuRef = useRef<HTMLDivElement>(null);
  const [isRestoreMenuOpen, setIsRestoreMenuOpen] = useState(false);
  const restoreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateStatus = () => {
      if (!lastBackupTime) { setStatusText("Last backup: Never"); return; }
      const diff = Date.now() - lastBackupTime;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      if (days > 0) setStatusText(`Last backup: ${days}d ago`);
      else if (hours > 0) setStatusText(`Last backup: ${hours}h ago`);
      else if (minutes > 0) setStatusText(`Last backup: ${minutes}m ago`);
      else setStatusText('Last backup: < 1m ago');
    };
    updateStatus();
    const intervalId = setInterval(updateStatus, 60 * 1000);
    return () => clearTimeout(intervalId);
  }, [lastBackupTime]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (backupMenuRef.current && !backupMenuRef.current.contains(event.target as Node)) setIsBackupMenuOpen(false);
          if (restoreMenuRef.current && !restoreMenuRef.current.contains(event.target as Node)) setIsRestoreMenuOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex shrink-0 items-center justify-between space-x-3 px-3 py-2 rounded-2xl border-2 shadow-sm bg-white border-neutral-200 text-neutral-800">
      <div className="flex items-center space-x-2">
        <History size={14} />
        <span className="font-medium text-xs whitespace-nowrap">{statusText}</span>
      </div>
      <div className="flex items-center space-x-2 pl-2">
        {serverStatus === 'connected' ? (
            <div className="relative" ref={backupMenuRef}>
                <button onClick={() => setIsBackupMenuOpen(!isBackupMenuOpen)} className={`px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-black text-[10px] flex items-center gap-2 transition-all active:scale-95 border border-indigo-100 shadow-sm uppercase tracking-widest ${isBackupMenuOpen ? 'bg-indigo-100' : 'hover:bg-indigo-100'}`}>
                    <CloudUpload size={14} />
                    <span>Backup</span>
                    <ChevronDown size={12} className={`transition-transform ${isBackupMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isBackupMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-36 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                        <button onClick={() => { onBackup('server'); setIsBackupMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"><Cloud size={14} className="text-sky-500" /> To Server</button>
                        <div className="h-px bg-neutral-100 mx-2"></div>
                        <button onClick={() => { onBackup('file'); setIsBackupMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"><HardDrive size={14} className="text-indigo-500" /> To File</button>
                    </div>
                )}
            </div>
        ) : (
            <button onClick={() => onBackup('file')} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-black text-[10px] flex items-center gap-2 hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100 shadow-sm uppercase tracking-widest">
                <CloudUpload size={14} />
                <span>Backup</span>
            </button>
        )}
        {serverStatus === 'connected' ? (
            <div className="relative" ref={restoreMenuRef}>
                <button onClick={() => setIsRestoreMenuOpen(!isRestoreMenuOpen)} className={`px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[10px] flex items-center gap-2 transition-all active:scale-95 border border-emerald-100 shadow-sm uppercase tracking-widest ${isRestoreMenuOpen ? 'bg-emerald-100' : 'hover:bg-emerald-100'}`}>
                    <Download size={14} />
                    <span>Restore</span>
                    <ChevronDown size={12} className={`transition-transform ${isRestoreMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRestoreMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-36 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                        <button onClick={() => { onRestore('server'); setIsRestoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"><Cloud size={14} className="text-sky-500" /> From Server</button>
                        <div className="h-px bg-neutral-100 mx-2"></div>
                        <button onClick={() => { onRestore('file'); setIsRestoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"><FileJson size={14} className="text-amber-500" /> From File</button>
                    </div>
                )}
            </div>
        ) : (
            <button onClick={() => onRestore('file')} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[10px] flex items-center gap-2 hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100 shadow-sm uppercase tracking-widest">
                <Download size={14} />
                <span>Restore</span>
            </button>
        )}
      </div>
    </div>
  );
};



export const DashboardUI: React.FC<DashboardUIProps> = ({
  onNavigate, totalCount, newCount, rawCount, refinedCount, reviewStats,
  lastBackupTime, onBackup, onRestore,
  serverStatus, onAction, onStartNewLearn, onStartDueReview, onStartStatusReview, dayProgress, dailyGoals, dailyStreaks, dailyGoalHistory, onNavigateToWordList, goalStats,
  studyStats, isStatsLoading,
  onViewWord,
  serverUrl,
  activeServerMode,
  isSwitchingServerMode,
  onToggleServerMode
}) => {
  const version = useMemo(() => getFormattedBuildDate(), []);
  const [activeTab, setActiveTab] = useState<'STUDY' | 'PRACTICE' | 'INSIGHT'>(() => {
    const saved = sessionStorage.getItem('dashboard_active_tab');
    if (saved === 'STUDY' || saved === 'PRACTICE' || saved === 'INSIGHT') return saved;
    return 'STUDY';
  });

  useEffect(() => {
    sessionStorage.setItem('dashboard_active_tab', activeTab);
  }, [activeTab]);

  const [focusTimers, setFocusTimers] = useState<FocusTimerRecord[]>([]);
  const [focusHistory, setFocusHistory] = useState<FocusTimerHistory[]>([]);
  const [focusForm, setFocusForm] = useState({ name: '', category: 'Vocabulary' as FocusTimerCategory, hours: '0', minutes: '25' });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedTimers = window.localStorage.getItem('focus_period_timers');
      if (storedTimers) setFocusTimers(JSON.parse(storedTimers));
      const storedHistory = window.localStorage.getItem('focus_period_history');
      if (storedHistory) setFocusHistory(JSON.parse(storedHistory));
    } catch (err) {
      console.error('[FocusPeriod] failed to restore timers', err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('focus_period_timers', JSON.stringify(focusTimers));
  }, [focusTimers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('focus_period_history', JSON.stringify(focusHistory));
  }, [focusHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(() => {
      const completed: FocusTimerHistory[] = [];
      setFocusTimers(prev => prev.map(timer => {
        if (timer.status !== 'running' || timer.remainingSeconds <= 0) return timer;
        const next = timer.remainingSeconds - 1;
        if (next <= 0) {
          completed.push({
            id: `${timer.id}-${Date.now()}`,
            name: timer.name,
            category: timer.category,
            durationSeconds: timer.totalSeconds,
            stoppedAt: Date.now()
          });
          return { ...timer, remainingSeconds: 0, status: 'completed' };
        }
        return { ...timer, remainingSeconds: next };
      }));
      if (completed.length) {
        setFocusHistory(prev => [...completed, ...prev].slice(0, 100));
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const recordFocusHistory = (entry: FocusTimerHistory) => {
    setFocusHistory(prev => [entry, ...prev].slice(0, 100));
  };

  const handleFormChange = (field: 'hours' | 'minutes' | 'name' | 'category', value: string) => {
    setFocusForm(prev => ({ ...prev, [field]: value }));
    if (formError) setFormError(null);
  };

  const handleCreateTimer = () => {
    const hours = Number(focusForm.hours) || 0;
    const minutes = Number(focusForm.minutes) || 0;
    const totalSeconds = hours * 3600 + minutes * 60;
    if (focusTimers.length >= 12) {
      setFormError('You can create up to 12 timers only.');
      return;
    }
    if (totalSeconds <= 0) {
      setFormError('Set a duration greater than zero.');
      return;
    }
    const now = Date.now();
    const name = focusForm.name.trim() || `${focusForm.category} Focus`;
    const newTimer: FocusTimerRecord = {
      id: crypto.randomUUID?.() ?? `focus-${now}-${Math.random().toString(36).slice(2)}`,
      name,
      category: focusForm.category,
      totalSeconds,
      remainingSeconds: totalSeconds,
      status: 'running',
      createdAt: now
    };
    setFocusTimers(prev => [...prev, newTimer]);
    setFocusForm({ name: '', category: focusForm.category, hours: '0', minutes: '25' });
  };

  const pauseTimer = (id: string) => {
    setFocusTimers(prev => prev.map(timer => timer.id === id && timer.status === 'running' ? { ...timer, status: 'paused' } : timer));
  };

  const resumeTimer = (id: string) => {
    setFocusTimers(prev => prev.map(timer => timer.id === id && timer.status === 'paused' && timer.remainingSeconds > 0 ? { ...timer, status: 'running' } : timer));
  };

  const stopTimer = (id: string) => {
    let entry: FocusTimerHistory | null = null;
    const now = Date.now();
    setFocusTimers(prev => prev.map(timer => {
      if (timer.id !== id) return timer;
      const duration = Math.max(0, timer.totalSeconds - timer.remainingSeconds);
      if (duration > 0) {
        entry = {
          id: `${timer.id}-${now}`,
          name: timer.name,
          category: timer.category,
          durationSeconds: duration,
          stoppedAt: now
        };
      }
      return { ...timer, remainingSeconds: 0, status: 'completed' };
    }));
    if (entry) recordFocusHistory(entry);
  };

  const removeTimer = (id: string) => {
    setFocusTimers(prev => prev.filter(timer => timer.id !== id));
  };
  
  return (
    <div className="space-y-2 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
        <div>
            <div className="flex items-baseline gap-2">
                <h2 className="text-3xl font-black text-neutral-900 tracking-tight">IELTS Vocab Pro</h2>
                <span className="text-[10px] font-bold text-neutral-400 font-mono tracking-tighter bg-neutral-100 px-1.5 py-0.5 rounded-md border border-neutral-200">{version}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
                 {serverStatus === 'connected' ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="px-3 py-1.5 rounded-full border flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-700">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-[11px] font-semibold text-neutral-500">
                                {activeServerMode === 'home' ? 'Private Server' : 'Public Server'}
                            </span>
                        </div>
                        <div className="inline-flex items-center gap-1">
                            <button
                                onClick={() =>
                                    onToggleServerMode?.(
                                        activeServerMode === 'home' ? 'public' : 'home'
                                    )
                                }
                                disabled={!!isSwitchingServerMode}
                                className="px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all duration-150 bg-blue-500 text-white hover:bg-blue-600 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                            >
                                {isSwitchingServerMode
                                    ? 'Switching...'
                                    : (activeServerMode === 'home'
                                        ? 'Switch to Public Server'
                                        : 'Switch to Private Server')}
                            </button>
                        </div>
                    </div>
                 ) : (
                    <div className="flex items-center gap-2 px-1.5 py-1.5 rounded-full border bg-red-50 border-red-200 text-red-700 shadow-sm pr-1.5">
                        <div className="flex items-center gap-2 px-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Offline Mode</span>
                            <div className="relative group/tooltip">
                                <HelpCircle size={12} className="cursor-help opacity-70 hover:opacity-100" />
                                <div className="absolute left-0 top-full mt-2 w-56 p-3 bg-neutral-900 text-white text-[10px] leading-relaxed font-medium rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-neutral-700">
                                    Disconnected from Vocab Server. Server backup and high-quality voices are unavailable.
                                    <div className="absolute -top-1 left-3 w-2 h-2 bg-neutral-900 rotate-45 border-l border-t border-neutral-700"></div>
                                </div>
                            </div>
                        </div>
                        <div className="w-px h-3 bg-red-200"></div>
                        <button onClick={() => { sessionStorage.setItem('vocab_pro_settings_tab', 'SERVER'); onNavigate('SETTINGS'); }} className="flex items-center gap-1 px-3 py-1 bg-blue-600 border border-blue-700 rounded-full shadow-sm hover:bg-blue-700 transition-all group/btn">
                            <Link size={10} className="text-white"/><span className="text-[10px] font-black uppercase tracking-widest text-white">Connect</span>
                        </button>
                    </div>
                 )}
            </div>
        </div>
        <div className="flex flex-col items-end gap-2">
             <BackupStatus lastBackupTime={lastBackupTime} onBackup={onBackup} onRestore={onRestore} serverStatus={serverStatus} />
        </div>
      </header>

      <div className="flex items-center justify-between">
        <div className="inline-flex p-1 bg-white border-2 border-neutral-100 rounded-2xl w-fit shadow-sm self-start">
             <button onClick={() => setActiveTab('STUDY')} className={`w-28 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'STUDY' ? 'bg-neutral-900 text-white shadow-lg transform scale-[1.02]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}><LayoutDashboard size={16} /> Study</button>
             <button onClick={() => setActiveTab('PRACTICE')} className={`w-28 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'PRACTICE' ? 'bg-neutral-900 text-white shadow-lg transform scale-[1.02]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}><Dumbbell size={16} /> Practice</button>
             <button onClick={() => setActiveTab('INSIGHT')} className={`w-28 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'INSIGHT' ? 'bg-neutral-900 text-white shadow-lg transform scale-[1.02]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}><BarChart3 size={16} /> Insight</button>
        </div>
      </div>

      {activeTab === 'STUDY' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <VocabularyCenterPanel 
                stats={studyStats} 
                totalCount={totalCount} 
                newCount={newCount} 
                studyingCount={reviewStats.learned} 
                masteredCount={reviewStats.mastered} 
                rawCount={rawCount}
                refinedCount={refinedCount}
                forgottenCount={reviewStats.statusForgot}
                hardCount={reviewStats.statusHard}
                easyCount={reviewStats.statusEasy}
                onStartNew={onStartNewLearn} 
                onStartDue={onStartDueReview} 
                onStartStatusReview={onStartStatusReview}
                onRefineRaw={() => onNavigateToWordList('raw')}
                onVerifyRefined={() => onNavigateToWordList('refined')}
                onFilterStatus={(filter) => onNavigateToWordList(filter)}
              />
              <StudyNowPanel stats={studyStats} isLoading={isStatsLoading} onAction={(action) => onAction(action)} />
              <FocusPeriodPanel
                  timers={focusTimers}
                  history={focusHistory}
                  form={focusForm}
                  error={formError}
                  onFormChange={handleFormChange}
                  onCreate={handleCreateTimer}
                  onPause={pauseTimer}
                  onResume={resumeTimer}
                  onStop={stopTimer}
                  onRemove={removeTimer}
                  limitReached={focusTimers.length >= 12}
              />
          </div>
      )}

      {activeTab === 'PRACTICE' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <PracticeArcadePanel onAction={onAction} />
          </div>
      )}

      {activeTab === 'INSIGHT' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Row 1: Mastery (4 cols) + Goal */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                   <div className="lg:col-span-2">
                       <MasteryOverviewPanel stats={studyStats} /> 
                   </div>
                   <div className="lg:col-span-1">
                       <GoalProgressPanel goalStats={goalStats} onAction={onAction} />
                   </div>
              </div>
              <FocusPeriodInsights history={focusHistory} />

              {/* Row 2: Day Progress */}
              {(() => {
                // Effective max calculation for INSIGHT tab
                const availableNew = studyStats?.vocab.new ?? 0;
                const availableDue = studyStats?.vocab.due ?? 0;

                const baseMaxLearn = Math.min(
                  dailyGoals.max_learn_per_day,
                  availableNew
                );

                const baseMaxReview = Math.min(
                  dailyGoals.max_review_per_day,
                  availableDue
                );

                // Ensure max is never smaller than what user already completed today
                const effectiveMaxLearn = Math.max(baseMaxLearn, dayProgress.learned);
                const effectiveMaxReview = Math.max(baseMaxReview, dayProgress.reviewed);

                return (
                  <div className="grid grid-cols-1 gap-4">
                    <DayProgress
                      learnedToday={dayProgress.learned}
                      reviewedToday={dayProgress.reviewed}
                      maxLearn={effectiveMaxLearn}
                      maxReview={effectiveMaxReview}
                      learnedWords={dayProgress.learnedWords}
                      reviewedWords={dayProgress.reviewedWords}
                      onViewWord={onViewWord}
                    />
                    <DailyStreakChart streaks={dailyStreaks} goals={dailyGoalHistory} />
                  </div>
                );
              })()}
          </div>
      )}
    </div>
  );
};
