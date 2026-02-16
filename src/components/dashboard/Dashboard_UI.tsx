
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RotateCw, 
  Upload, Download, History, Lightbulb, BookCopy, Sparkles, ChevronRight, Wand2, ShieldCheck, Eye, PenLine, Shuffle, CheckCircle2, Link, HelpCircle, Cloud, FileJson, ChevronDown, HardDrive, ListTodo, FileClock, Mic, BookText, GraduationCap, AudioLines, Music, MessageSquare, BookOpen, MessageCircle, Play,
  Zap, Target, Headphones, Split
} from 'lucide-react';
import { AppView, VocabularyItem, User } from '../../app/types';
import { DailyGoalConfig } from '../../app/settingsManager';
import { DayProgress } from './DayProgress';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

// Placeholder for build date
const getFormattedBuildDate = () => {
    // Vite injects this at build time. It will be undefined in dev mode.
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
    } catch (e) {
        return 'v_error';
    }
};

// --- START NEW STUDY STATS COMPONENT ---
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
    listening: { completed: number, total: number };
    writing: { completed: number, total: number };
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
    color: string, // text color class
    bg: string,    // bg color class
    onClick: () => void,
    disabled?: boolean
}> = ({ label, subLabel, progress, icon: Icon, color, bg, onClick, disabled }) => {
    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 bg-white hover:bg-neutral-900 hover:border-neutral-900 hover:shadow-lg transition-all active:scale-95 w-full text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-neutral-100 disabled:hover:shadow-none"
        >
            <div className={`p-2.5 rounded-xl ${bg} ${color} group-hover:scale-110 transition-transform shrink-0`}>
                <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-neutral-700 group-hover:text-white transition-colors">{label}</div>
                {subLabel && <div className="text-[10px] font-bold text-neutral-400 transition-colors truncate">{subLabel}</div>}
            </div>
            {typeof progress === 'number' && (
                <div className="shrink-0 ml-1">
                    <TinyProgressRing percent={progress} />
                </div>
            )}
        </button>
    );
};

const StudyNowPanel: React.FC<{
    stats: StudyStats | null;
    goalStats: { totalTasks: number; completedTasks: number; };
    isLoading: boolean;
    onRefresh: () => void;
    onStartNew: () => void;
    onStartDue: () => void;
    onAction: (action: string) => void;
}> = ({ stats, goalStats, isLoading, onRefresh, onStartNew, onStartDue, onAction }) => {

    const planPercent = goalStats.totalTasks > 0 ? Math.round((goalStats.completedTasks / goalStats.totalTasks) * 100) : 0;

    // Aggregations
    const speakingCompleted = stats ? (stats.speaking.freeTalk.completed + stats.speaking.native.completed + stats.speaking.conversation.completed) : 0;
    const speakingTotal = stats ? (stats.speaking.freeTalk.total + stats.speaking.native.total + stats.speaking.conversation.total) : 0;

    const lessonsCompleted = stats ? stats.lessons.general.completed : 0;
    const lessonsTotal = stats ? stats.lessons.general.total : 0;

    const getProg = (comp: number, tot: number) => tot > 0 ? Math.round((comp / tot) * 100) : 0;

    return (
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-6 relative overflow-hidden">
            {isLoading && (
                <div className="absolute top-4 right-4 animate-spin text-neutral-300">
                    <RotateCw size={16} />
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                 <div className="flex items-center gap-3">
                     <div className="p-2 bg-neutral-900 rounded-xl text-white shadow-md">
                         <GraduationCap size={20} />
                     </div>
                     <div>
                         <h3 className="text-lg font-black text-neutral-900 tracking-tight">Study Center</h3>
                         <p className="text-xs font-medium text-neutral-400">Track your mastery across all skills.</p>
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-3 self-end sm:self-auto">
                    {goalStats.totalTasks > 0 ? (
                        <button onClick={() => onAction('PLANNING')} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-lg border border-neutral-100 hover:bg-neutral-100 transition-colors group">
                            <ListTodo size={14} className="text-neutral-400 group-hover:text-neutral-600"/>
                            <div className="text-[10px] font-bold text-neutral-500">
                                Plan: <span className="text-neutral-900">{goalStats.completedTasks}/{goalStats.totalTasks}</span> 
                                <span className={`ml-1.5 ${planPercent === 100 ? 'text-green-600' : 'text-indigo-600'}`}>({planPercent}%)</span>
                            </div>
                        </button>
                    ) : (
                        <button onClick={() => onAction('PLANNING')} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-lg border border-neutral-100 hover:bg-neutral-100 transition-colors group">
                            <ListTodo size={14} className="text-neutral-400 group-hover:text-neutral-600"/>
                            <span className="text-[10px] font-bold text-neutral-500">No plan. Click to create</span>
                        </button>
                    )}
                     <button onClick={onRefresh} className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-xl transition-all" title="Refresh Stats">
                         <RotateCw size={16} />
                     </button>
                 </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-8">
                {/* COLUMN 1: VOCABULARY - Spans 2 cols on tablet, 1 col on desktop */}
                <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-1">
                        <div className="flex items-center gap-2 text-neutral-400 px-1">
                        <BookCopy size={12} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Vocabulary</span>
                    </div>
                    
                    {/* Buttons: Stacked on mobile/desktop, side-by-side on tablet */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2">
                        <NavButton 
                            label="Learn New" 
                            subLabel={`${stats ? stats.vocab.new : '-'} words`}
                            icon={Sparkles} 
                            color="text-indigo-600" 
                            bg="bg-indigo-50" 
                            onClick={onStartNew} 
                            disabled={!stats || stats.vocab.new === 0}
                        />
                        <NavButton 
                            label="Review" 
                            subLabel={`${stats ? stats.vocab.due : '-'} words`}
                            icon={RotateCw} 
                            color="text-amber-600" 
                            bg="bg-amber-50" 
                            onClick={onStartDue} 
                            disabled={!stats || stats.vocab.due === 0}
                        />
                    </div>
                </div>

                {/* COLUMN 2: SKILLS - 2 Columns Grid */}
                <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-2">
                        <div className="flex items-center gap-2 text-neutral-400 px-1">
                        <Target size={12} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Skills</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NavButton 
                            label="Reading" 
                            subLabel={stats ? `${stats.reading.completed}/${stats.reading.total}` : '-'}
                            progress={stats ? getProg(stats.reading.completed, stats.reading.total) : 0}
                            icon={BookOpen} 
                            color="text-indigo-600" 
                            bg="bg-indigo-50" 
                            onClick={() => onAction('UNIT_LIBRARY')} 
                        />
                        <NavButton 
                            label="Listening" 
                            subLabel={stats ? `${stats.listening.completed}/${stats.listening.total}` : '-'}
                            progress={stats ? getProg(stats.listening.completed, stats.listening.total) : 0}
                            icon={Headphones} 
                            color="text-sky-600" 
                            bg="bg-sky-50" 
                            onClick={() => onAction('LISTENING')} 
                        />
                        <NavButton 
                            label="Writing" 
                            subLabel={stats ? `${stats.writing.completed}/${stats.writing.total}` : '-'}
                            progress={stats ? getProg(stats.writing.completed, stats.writing.total) : 0}
                            icon={PenLine} 
                            color="text-pink-600" 
                            bg="bg-pink-50" 
                            onClick={() => onAction('WRITING')} 
                        />
                        <NavButton 
                            label="Speaking" 
                            subLabel={stats ? `${speakingCompleted}/${speakingTotal}` : '-'}
                            progress={stats ? getProg(speakingCompleted, speakingTotal) : 0}
                            icon={Mic} 
                            color="text-rose-600" 
                            bg="bg-rose-50" 
                            onClick={() => onAction('SPEAKING')} 
                        />
                    </div>
                </div>

                {/* COLUMN 3: DOMAINS - 2 Columns Grid */}
                <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-2">
                        <div className="flex items-center gap-2 text-neutral-400 px-1">
                        <BookText size={12} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Domains</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NavButton 
                            label="Grammar" 
                            subLabel={stats ? `${stats.lessons.grammar.completed}/${stats.lessons.grammar.total}` : '-'}
                            progress={stats ? getProg(stats.lessons.grammar.completed, stats.lessons.grammar.total) : 0}
                            icon={BookText} 
                            color="text-purple-600" 
                            bg="bg-purple-50" 
                            onClick={() => onAction('LESSON_GRAMMAR')} 
                        />
                        <NavButton 
                            label="Irregular" 
                            subLabel={stats ? `${stats.lessons.irregular.completed}/${stats.lessons.irregular.total}` : '-'}
                            progress={stats ? getProg(stats.lessons.irregular.completed, stats.lessons.irregular.total) : 0}
                            icon={FileClock} 
                            color="text-orange-600" 
                            bg="bg-orange-50" 
                            onClick={() => onAction('IRREGULAR_VERBS')} 
                        />
                        <NavButton 
                            label="Pronunciation" 
                            subLabel={stats ? `${stats.speaking.pronunciation.completed}/${stats.speaking.pronunciation.total}` : '-'}
                            progress={stats ? getProg(stats.speaking.pronunciation.completed, stats.speaking.pronunciation.total) : 0}
                            icon={AudioLines} 
                            color="text-emerald-600" 
                            bg="bg-emerald-50" 
                            onClick={() => onAction('MIMIC')} 
                        />
                        <NavButton 
                            label="Lessons" 
                            subLabel={stats ? `${lessonsCompleted}/${lessonsTotal}` : '-'}
                            progress={stats ? getProg(lessonsCompleted, lessonsTotal) : 0}
                            icon={BookOpen} 
                            color="text-blue-600" 
                            bg="bg-blue-50" 
                            onClick={() => onAction('LESSON')} 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- END NEW COMPONENT ---

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
      if (!lastBackupTime) {
        setStatusText("Last backup: Never");
        return;
      }
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
    return () => clearInterval(intervalId);
  }, [lastBackupTime]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (backupMenuRef.current && !backupMenuRef.current.contains(event.target as Node)) {
              setIsBackupMenuOpen(false);
          }
          if (restoreMenuRef.current && !restoreMenuRef.current.contains(event.target as Node)) {
              setIsRestoreMenuOpen(false);
          }
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
        {/* BACKUP BUTTON */}
        {serverStatus === 'connected' ? (
            <div className="relative" ref={backupMenuRef}>
                <button 
                    onClick={() => setIsBackupMenuOpen(!isBackupMenuOpen)} 
                    className={`px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-black text-[10px] flex items-center gap-2 transition-all active:scale-95 border border-indigo-100 shadow-sm uppercase tracking-widest ${isBackupMenuOpen ? 'bg-indigo-100' : 'hover:bg-indigo-100'}`}
                >
                    <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Symbols/Up%20Arrow.png" alt="Sync" className="w-3 h-3 object-contain" />
                    <span>Backup</span>
                    <ChevronDown size={12} className={`transition-transform ${isBackupMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isBackupMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-36 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                        <button 
                            onClick={() => { onBackup('server'); setIsBackupMenuOpen(false); }}
                            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                        >
                            <Cloud size={14} className="text-sky-500" />
                            To Server
                        </button>
                        <div className="h-px bg-neutral-100 mx-2"></div>
                        <button 
                            onClick={() => { onBackup('file'); setIsBackupMenuOpen(false); }}
                            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                        >
                            <HardDrive size={14} className="text-indigo-500" />
                            To File
                        </button>
                    </div>
                )}
            </div>
        ) : (
            <button 
                onClick={() => onBackup('file')} 
                className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-black text-[10px] flex items-center gap-2 hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100 shadow-sm uppercase tracking-widest"
            >
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Symbols/Up%20Arrow.png" alt="Sync" className="w-3 h-3 object-contain" />
                <span>Backup</span>
            </button>
        )}

        {/* RESTORE BUTTON */}
        {serverStatus === 'connected' ? (
            <div className="relative" ref={restoreMenuRef}>
                <button 
                    onClick={() => setIsRestoreMenuOpen(!isRestoreMenuOpen)} 
                    className={`px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[10px] flex items-center gap-2 transition-all active:scale-95 border border-emerald-100 shadow-sm uppercase tracking-widest ${isRestoreMenuOpen ? 'bg-emerald-100' : 'hover:bg-emerald-100'}`}
                >
                    <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Symbols/Down%20Arrow.png" alt="Restore" className="w-3 h-3 object-contain" />
                    <span>Restore</span>
                    <ChevronDown size={12} className={`transition-transform ${isRestoreMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRestoreMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-36 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                        <button 
                            onClick={() => { onRestore('server'); setIsRestoreMenuOpen(false); }}
                            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                        >
                            <Cloud size={14} className="text-sky-500" />
                            From Server
                        </button>
                        <div className="h-px bg-neutral-100 mx-2"></div>
                        <button 
                            onClick={() => { onRestore('file'); setIsRestoreMenuOpen(false); }}
                            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
                        >
                            <FileJson size={14} className="text-amber-500" />
                            From File
                        </button>
                    </div>
                )}
            </div>
        ) : (
            <button 
                onClick={() => onRestore('file')} 
                className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[10px] flex items-center gap-2 hover:bg-emerald-100 transition-all active:scale-95 border border-emerald-100 shadow-sm uppercase tracking-widest"
            >
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Symbols/Down%20Arrow.png" alt="Restore" className="w-3 h-3 object-contain" />
                <span>Restore</span>
            </button>
        )}
      </div>
    </div>
  );
};

const LibraryHealthPanel: React.FC<{
  totalCount: number;
  newCount: number;
  rawCount: number;
  refinedCount: number;
  reviewStats: { learned: number; mastered: number; statusForgot: number; statusHard: number; statusEasy: number; statusLearned: number; };
  onRefineRaw: () => void;
  onVerifyRefined: () => void;
  onViewLibrary: () => void;
}> = ({ totalCount, newCount, rawCount, refinedCount, reviewStats, onRefineRaw, onVerifyRefined, onViewLibrary }) => {
  
  const chartData = [
    { name: 'New', value: newCount, color: '#3b82f6' }, // blue-500
    { name: 'Learning', value: reviewStats.learned, color: '#06b6d4' }, // cyan-500
    { name: 'Mastered', value: reviewStats.mastered, color: '#a855f7' }, // purple-500
  ];

  // If total is 0, provide placeholder data for empty chart
  const activeData = totalCount > 0 ? chartData : [{ name: 'Empty', value: 1, color: '#f3f4f6' }];

  return (
    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Library Health</h3>
        <button onClick={onViewLibrary} className="group text-neutral-300 hover:text-neutral-900 transition-colors p-1.5 -mr-1.5 -mt-1.5">
            <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex-grow flex items-start justify-center gap-6 pt-1 pb-4">
        {/* Chart Section */}
        <div className="h-40 w-40 relative select-none shrink-0 flex items-center justify-center">
             <PieChart width={160} height={160}>
                <Pie
                    data={activeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={totalCount > 0 ? 5 : 0}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={4}
                >
                    {activeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip 
                     content={({ active, payload }) => {
                         if (active && payload && payload.length) {
                             return (
                                 <div className="bg-neutral-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xl">
                                     {payload[0].name}: {payload[0].value}
                                 </div>
                             );
                         }
                         return null;
                     }}
                />
            </PieChart>
             
             {/* Centered Total Label - Robust implementation using absolute positioning and flexbox */}
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                 <span className="text-2xl font-black text-neutral-900 leading-none">{totalCount}</span>
                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mt-1">Total</span>
             </div>
        </div>

        {/* Legend Section */}
        <div className="flex-1 flex flex-col justify-center gap-3 self-center">
             {chartData.map(item => (
                 <div key={item.name} className="flex items-center justify-between group">
                     <div className="flex items-center gap-2">
                         <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                         <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wide">{item.name}</span>
                     </div>
                     <span className="font-black text-neutral-900 text-xs">{item.value}</span>
                 </div>
             ))}
        </div>
      </div>
      
      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <button onClick={onRefineRaw} disabled={rawCount === 0} className="flex-1 justify-between px-3 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl font-black text-[10px] flex items-center hover:bg-indigo-100 transition-all active:scale-95 disabled:opacity-50 border border-indigo-100 shadow-sm"><div className="flex items-center space-x-1.5"><Wand2 size={12} /><span>REFINE RAW</span></div><span className="px-1.5 py-0.5 bg-indigo-200/50 rounded-md font-black">{rawCount}</span></button>
        <button onClick={onVerifyRefined} disabled={refinedCount === 0} className="flex-1 justify-between px-3 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[10px] flex items-center hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-50 border border-emerald-100 shadow-sm"><div className="flex items-center space-x-1.5"><ShieldCheck size={12} /><span>VERIFY REFINED</span></div><span className="px-1.5 py-0.5 bg-emerald-200/50 rounded-md font-black">{refinedCount}</span></button>
      </div>
    </div>
  );
};


// Define props for the UI component
export interface DashboardUIProps {
  user: User;
  onNavigate: (view: string) => void;
  totalCount: number;
  newCount: number;
  dueCount: number;
  learnedCount: number;
  rawCount: number;
  refinedCount: number;
  reviewStats: any;
  wotd: VocabularyItem | null;
  isWotdComposed: boolean;
  onRandomizeWotd: () => void;
  onComposeWotd: () => void;
  lastBackupTime: number | null;
  onBackup: (mode: 'server' | 'file') => void;
  onRestore: (mode: 'server' | 'file') => void;
  serverStatus: 'connected' | 'disconnected';
  onAction: (action: string, params?: any) => void;
  onStartNewLearn: () => void;
  onStartDueReview: () => void;
  dayProgress: any;
  dailyGoals: DailyGoalConfig;
  onNavigateToWordList: (filter: string) => void;
  goalStats: { totalTasks: number; completedTasks: number; };
  
  // New Stats Props
  studyStats: StudyStats | null;
  isStatsLoading: boolean;
  onRefreshStats: () => void;
}

// The pure UI component
export const DashboardUI: React.FC<DashboardUIProps> = ({
  user, onNavigate, totalCount, newCount, dueCount, learnedCount, rawCount, refinedCount, reviewStats,
  wotd, isWotdComposed, onRandomizeWotd, onComposeWotd, lastBackupTime, onBackup, onRestore,
  serverStatus, onAction, onStartNewLearn, onStartDueReview, dayProgress, dailyGoals, onNavigateToWordList, goalStats,
  studyStats, isStatsLoading, onRefreshStats
}) => {
  const version = useMemo(() => getFormattedBuildDate(), []);
  
  // Mock data for missing props from helper functions
  const setView = onNavigate;
  
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between sm:items-start gap-6">
        <div>
            <div className="flex items-baseline gap-2">
                <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Vocab Pro</h2>
                <span className="text-[10px] font-bold text-neutral-400 font-mono tracking-tighter bg-neutral-100 px-1.5 py-0.5 rounded-md border border-neutral-200">{version}</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
                 {serverStatus === 'connected' ? (
                    <div className="px-3 py-1.5 rounded-full border flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-700">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Server Mode</span>
                    </div>
                 ) : (
                    <div className="flex items-center gap-2 px-1.5 py-1.5 rounded-full border bg-red-50 border-red-200 text-red-700 shadow-sm pr-1.5">
                        <div className="flex items-center gap-2 px-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Standalone</span>
                            
                            <div className="relative group/tooltip">
                                <HelpCircle size={12} className="cursor-help opacity-70 hover:opacity-100" />
                                <div className="absolute left-0 top-full mt-2 w-56 p-3 bg-neutral-900 text-white text-[10px] leading-relaxed font-medium rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-neutral-700">
                                    Disconnected from Vocab Server. Server backup and high-quality voices are unavailable.
                                    <div className="absolute -top-1 left-3 w-2 h-2 bg-neutral-900 rotate-45 border-l border-t border-neutral-700"></div>
                                </div>
                            </div>
                        </div>

                        <div className="w-px h-3 bg-red-200"></div>

                        <button 
                            onClick={() => {
                                sessionStorage.setItem('vocab_pro_settings_tab', 'SERVER');
                                setView('SETTINGS');
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 border border-blue-700 rounded-full shadow-sm hover:bg-blue-700 transition-all group/btn"
                        >
                            <Link size={10} className="text-white"/>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">Connect</span>
                        </button>
                    </div>
                 )}
            </div>
        </div>
        <div className="flex flex-col items-end gap-2">
             <BackupStatus lastBackupTime={lastBackupTime} onBackup={onBackup} onRestore={onRestore} serverStatus={serverStatus} />
        </div>
      </header>

      {/* NEW BIG STUDY NOW PANEL */}
      <StudyNowPanel 
          stats={studyStats} 
          goalStats={goalStats}
          isLoading={isStatsLoading} 
          onRefresh={onRefreshStats} 
          onStartNew={onStartNewLearn} 
          onStartDue={onStartDueReview}
          onAction={(action) => {
              if (['IRREGULAR_VERBS', 'MIMIC', 'LESSON_GRAMMAR'].includes(action)) {
                  onAction(action);
              } else {
                  onNavigate(action);
              }
          }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LibraryHealthPanel 
          totalCount={totalCount}
          newCount={newCount}
          rawCount={rawCount}
          refinedCount={refinedCount}
          reviewStats={reviewStats}
          onRefineRaw={() => onNavigateToWordList('raw')}
          onVerifyRefined={() => onNavigateToWordList('refined')}
          onViewLibrary={() => setView('BROWSE')}
        />
        <DayProgress
            learnedToday={dayProgress.learned}
            reviewedToday={dayProgress.reviewed}
            maxLearn={dailyGoals.max_learn_per_day}
            maxReview={dailyGoals.max_review_per_day}
            learnedWords={dayProgress.learnedWords}
            reviewedWords={dayProgress.reviewedWords}
            onViewWord={() => {}} // Not used as Wotd is removed
        />
      </div>
    </div>
  );
};
