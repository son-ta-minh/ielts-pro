
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RotateCw, 
  Upload, Download, History, Lightbulb, BookCopy, Sparkles, ChevronRight, Wand2, ShieldCheck, Eye, PenLine, Shuffle, CheckCircle2, Link, HelpCircle, Cloud, FileJson, ChevronDown, HardDrive, ListTodo, FileClock, Mic, BookText
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

const QuickToolsPanel: React.FC<{ onAction?: (action: string) => void }> = ({ onAction }) => (
    <div className="grid grid-cols-3 gap-4">
        <button 
            onClick={() => onAction?.('IRREGULAR_VERBS')} 
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-neutral-200 rounded-3xl shadow-sm hover:shadow-md hover:border-orange-200 hover:bg-orange-50/50 transition-all group active:scale-95"
        >
            <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform">
                <FileClock size={20} />
            </div>
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest group-hover:text-orange-700">Irregular Verbs</span>
        </button>

        <button 
            onClick={() => onAction?.('MIMIC')} 
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-neutral-200 rounded-3xl shadow-sm hover:shadow-md hover:border-purple-200 hover:bg-purple-50/50 transition-all group active:scale-95"
        >
            <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl group-hover:scale-110 transition-transform">
                <Mic size={20} />
            </div>
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest group-hover:text-purple-700">Pronunciation</span>
        </button>

        <button 
            onClick={() => onAction?.('LESSON_GRAMMAR')} 
            className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-neutral-200 rounded-3xl shadow-sm hover:shadow-md hover:border-blue-200 hover:bg-blue-50/50 transition-all group active:scale-95"
        >
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                <BookText size={20} />
            </div>
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest group-hover:text-blue-700">Grammar</span>
        </button>
    </div>
);

// New component for Goal Completion
const GoalCompletionPanel: React.FC<{ 
    totalTasks: number; 
    completedTasks: number;
    onNavigate: () => void;
    onAction?: (action: string) => void;
}> = ({ totalTasks, completedTasks, onNavigate, onAction }) => {
  const hasGoals = totalTasks > 0;
  const progressPercent = hasGoals ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm group transition-all hover:border-neutral-300 hover:shadow-md flex flex-col gap-4">
      <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600"><ListTodo size={14} /></div>
              <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Study Plan Progress</h3>
          </div>
          
          <button 
              onClick={onNavigate} 
              className="p-1.5 text-neutral-300 hover:text-neutral-900 transition-colors"
              title="View Plan Board"
          >
              <ChevronRight size={18}/>
          </button>
      </div>
      
      {!hasGoals ? (
        <div className="space-y-4">
            <div className="space-y-1">
                <h4 className="text-lg font-black text-neutral-900 leading-tight">No goals set yet</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={() => onAction?.('PLAN_AI')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-50 transition-all active:scale-95"
                >
                    <Sparkles size={14} className="text-amber-500" />
                    <span>AI Planner</span>
                </button>
                <button 
                    onClick={() => onAction?.('PLAN_IMPORT')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-50 transition-all active:scale-95"
                >
                    <Download size={14} className="text-indigo-500" />
                    <span>Import</span>
                </button>
            </div>
        </div>
      ) : (
        <div className="space-y-4">
            <div className="flex justify-between items-end">
                <div>
                    <span className="text-3xl font-black text-neutral-900 tracking-tighter">{completedTasks}</span>
                    <span className="text-lg font-bold text-neutral-300 ml-1">/ {totalTasks}</span>
                </div>
                <div className={`px-2 py-0.5 rounded-md text-[10px] font-black ${progressPercent === 100 ? 'bg-green-100 text-green-700' : 'bg-indigo-50 text-indigo-700'}`}>
                    {progressPercent}% Complete
                </div>
            </div>
            
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-1000 ease-out ${progressPercent === 100 ? 'bg-green-500' : 'bg-indigo-500'}`} 
                    style={{ width: `${progressPercent}%` }}
                />
            </div>
        </div>
      )}
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
}

// The pure UI component
export const DashboardUI: React.FC<DashboardUIProps> = ({
  user, onNavigate, totalCount, newCount, dueCount, learnedCount, rawCount, refinedCount, reviewStats,
  wotd, isWotdComposed, onRandomizeWotd, onComposeWotd, lastBackupTime, onBackup, onRestore,
  serverStatus, onAction, onStartNewLearn, onStartDueReview, dayProgress, dailyGoals, onNavigateToWordList, goalStats
}) => {
  const version = useMemo(() => getFormattedBuildDate(), []);
  
  // Mock data for missing props from helper functions
  const setView = onNavigate;
  
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
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
        <div className="md:col-span-1 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center gap-2">
                  <div className="p-1 bg-green-50 rounded-full"><BookCopy size={10} className="text-green-600" /></div>
                  <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Study Now</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={onStartNewLearn} disabled={newCount === 0} className="flex-1 justify-between px-4 py-3 bg-blue-500 text-white rounded-xl font-black text-xs flex items-center hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-500/10"><div className="flex items-center space-x-2"><Lightbulb size={12} /><span>LEARN NEW</span></div><span className="px-2 py-0.5 bg-white/20 rounded-md text-white font-black">{newCount}</span></button>
                  <button onClick={onStartDueReview} disabled={dueCount === 0} className="flex-1 justify-between px-4 py-3 bg-orange-500 text-white rounded-xl font-black text-xs flex items-center hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-orange-500/10"><div className="flex items-center space-x-2"><RotateCw size={12} /><span>REVIEW DUE</span></div><span className="px-2 py-0.5 bg-white/20 rounded-md text-white font-black">{dueCount}</span></button>
              </div>
          </div>
          <GoalCompletionPanel 
              totalTasks={goalStats.totalTasks}
              completedTasks={goalStats.completedTasks}
              onNavigate={() => setView('PLANNING')}
              onAction={onAction}
          />
        </div>
      </div>

      <QuickToolsPanel onAction={onAction} />

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
  );
};
