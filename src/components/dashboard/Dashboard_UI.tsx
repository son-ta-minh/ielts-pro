import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RotateCw, 
  Download, History, BookCopy, Sparkles, ChevronRight, Wand2, ShieldCheck, PenLine, Shuffle, Link, HelpCircle, Cloud, FileJson, ChevronDown, HardDrive, ListTodo, FileClock, Mic, BookText, GraduationCap, AudioLines, BookOpen,
  Target, Headphones, Split, LayoutDashboard, BarChart3, Keyboard, AtSign, Gamepad2, Puzzle, Brain,
  CloudUpload, Percent, MessagesSquare, Scale
} from 'lucide-react';
import { User } from '../../app/types';
import { DailyGoalConfig } from '../../app/settingsManager';
import { DayProgress } from './DayProgress';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

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
    } catch (_e) {
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
                <div className="text-xs font-black text-neutral-900 group-hover:text-white transition-colors tracking-tight leading-tight">{label}</div>
                {subLabel && (
                    <div className={`font-medium text-neutral-400 group-hover:text-neutral-300 transition-colors mt-0.5 leading-snug ${largeSub ? 'text-[10px]' : 'text-[10px] truncate'}`}>
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
    
    const StatRow = ({ label, completed, total, icon: Icon, colorClass }: { label: string, completed: number, total: number, icon: any, colorClass: string }) => (
        <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50/50 hover:bg-neutral-50 transition-colors border border-transparent hover:border-neutral-100">
            <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${colorClass} bg-white shadow-sm`}><Icon size={12} /></div>
                <span className="text-[10px] font-bold text-neutral-700">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-medium text-neutral-400">{completed}/{total}</span>
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
                <StatRow label="Listening" completed={stats?.listening.completed || 0} total={stats?.listening.total || 0} icon={Headphones} colorClass="text-sky-600" />
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

const StudyNowPanel: React.FC<{
    stats: StudyStats | null;
    isLoading: boolean;
    onStartNew: () => void;
    onStartDue: () => void;
    onAction: (action: string) => void;
}> = ({ stats, isLoading, onStartNew, onStartDue, onAction }) => {

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
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="flex flex-col gap-2 md:col-span-2 lg:col-span-1">
                        <div className="flex items-center gap-2 text-neutral-400 px-1">
                        <BookCopy size={12} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Vocabulary</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2">
                        <NavButton label="Learn New" subLabel={`${stats ? stats.vocab.new : '-'} words`} icon={Sparkles} color="text-indigo-600" bg="bg-indigo-50" onClick={onStartNew} disabled={!stats || stats.vocab.new === 0} />
                        <NavButton label="Review" subLabel={`${stats ? stats.vocab.due : '-'} words`} icon={RotateCw} color="text-amber-600" bg="bg-amber-50" onClick={onStartDue} disabled={!stats || stats.vocab.due === 0} />
                    </div>
                </div>

                <div className="flex flex-col gap-2 md:col-span-2 lg:col-span-2">
                        <div className="flex items-center gap-2 text-neutral-400 px-1">
                        <Target size={12} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Skills</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NavButton label="Reading" subLabel="Passages & Vocab" icon={BookOpen} color="text-indigo-600" bg="bg-indigo-50" onClick={() => onAction('UNIT_LIBRARY')} />
                        <NavButton label="Listening" subLabel="Transcripts" icon={Headphones} color="text-sky-600" bg="bg-sky-50" onClick={() => onAction('LISTENING')} />
                        <NavButton label="Writing" subLabel="Task 1 & 2" icon={PenLine} color="text-pink-600" bg="bg-pink-50" onClick={() => onAction('WRITING')} />
                        <NavButton label="Speaking" subLabel="Simulator" icon={Mic} color="text-rose-600" bg="bg-rose-50" onClick={() => onAction('SPEAKING')} />
                    </div>
                </div>

                <div className="flex flex-col gap-2 md:col-span-2 lg:col-span-2">
                        <div className="flex items-center gap-2 text-neutral-400 px-1">
                        <BookText size={12} />
                        <span className="font-black uppercase tracking-widest text-[10px]">Domains</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NavButton label="Grammar" subLabel="Structure" icon={BookText} color="text-purple-600" bg="bg-purple-50" onClick={() => onAction('LESSON_GRAMMAR')} />
                        <NavButton label="Irregular Verb" subLabel="V1, V2, V3" icon={FileClock} color="text-orange-600" bg="bg-orange-50" onClick={() => onAction('IRREGULAR_VERBS')} />
                        <NavButton label="Pronunciation" subLabel="Intonation" icon={AudioLines} color="text-emerald-600" bg="bg-emerald-50" onClick={() => onAction('MIMIC')} />
                        <NavButton label="Lesson" subLabel="General" icon={BookOpen} color="text-blue-600" bg="bg-blue-50" onClick={() => onAction('LESSON')} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const PracticeArcadePanel: React.FC<{ onAction: (action: string) => void }> = ({ onAction }) => {
    return (
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-3">
             <div className="flex items-center gap-3">
                 <div className="p-2 bg-fuchsia-50 rounded-xl text-fuchsia-600 shadow-md">
                     <Gamepad2 size={18} />
                 </div>
                 <div>
                     <h3 className="text-base font-black text-neutral-900 tracking-tight">Practice Arcade</h3>
                     <p className="text-[10px] font-medium text-neutral-400">Targeted drills to refine specific lexical skills.</p>
                 </div>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
    { name: 'New', value: newCount, color: '#3b82f6' },
    { name: 'Learning', value: reviewStats.learned, color: '#06b6d4' },
    { name: 'Mastered', value: reviewStats.mastered, color: '#a855f7' },
  ];
  const activeData = totalCount > 0 ? chartData : [{ name: 'Empty', value: 1, color: '#f3f4f6' }];

  return (
    <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Library Health</h3>
        <button onClick={onViewLibrary} className="group text-neutral-300 hover:text-neutral-900 transition-colors p-1.5 -mr-1.5 -mt-1.5"><ChevronRight size={18} /></button>
      </div>

      <div className="flex-grow flex items-start justify-center gap-6 pt-1 pb-4">
        <div className="h-40 w-40 relative select-none shrink-0 flex items-center justify-center">
             <PieChart width={160} height={160}>
                <Pie data={activeData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={totalCount > 0 ? 5 : 0} dataKey="value" stroke="none" cornerRadius={4}>
                    {activeData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                         if (active && payload && payload.length) return (<div className="bg-neutral-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xl">{payload[0].name}: {payload[0].value}</div>);
                         return null;
                }} />
            </PieChart>
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                 <span className="text-2xl font-black text-neutral-900 leading-none">{totalCount}</span>
                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mt-1">Total</span>
             </div>
        </div>
        <div className="flex-1 flex flex-col justify-center gap-3 self-center">
             {chartData.map(item => (
                 <div key={item.name} className="flex items-center justify-between group">
                     <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wide">{item.name}</span></div>
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

const WordStatsBar: React.FC<{
    newCount: number;
    studyingCount: number;
    masteredCount: number;
    totalCount: number;
}> = ({ newCount, studyingCount, masteredCount, totalCount }) => {
    if (totalCount === 0) {
        return (
            <div className="w-56 h-10 flex items-center justify-center bg-neutral-100 rounded-2xl">
                <span className="text-[10px] font-bold text-neutral-400">Library Empty</span>
            </div>
        );
    }

    const newPercent = (newCount / totalCount) * 100;
    const studyingPercent = (studyingCount / totalCount) * 100;
    const masteredPercent = (masteredCount / totalCount) * 100;

    const BarSegment = ({ percent, color, label, value }: { percent: number, color: string, label: string, value: number }) => (
        <div className="h-full group relative" style={{ width: `${percent}%`, backgroundColor: color }}>
            <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-neutral-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap left-1/2 -translate-x-1/2">
                {label}: {value} ({Math.round(percent)}%)
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
            </div>
        </div>
    );

    return (
        <div className="flex items-center gap-3">
            <div className="w-56 h-2.5 bg-neutral-200 rounded-full flex overflow-hidden border border-neutral-200">
                <BarSegment percent={newPercent} color="#3b82f6" label="New" value={newCount} />
                <BarSegment percent={studyingPercent} color="#06b6d4" label="Studying" value={studyingCount} />
                <BarSegment percent={masteredPercent} color="#a855f7" label="Mastered" value={masteredCount} />
            </div>
            <div className="text-xs font-black text-neutral-800 flex items-center gap-1.5">
                <BookCopy size={12} className="text-neutral-400"/>
                {totalCount}
            </div>
        </div>
    );
};

export interface DashboardUIProps {
  onNavigate: (view: string) => void;
  totalCount: number;
  newCount: number;
  rawCount: number;
  refinedCount: number;
  reviewStats: any;
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
  studyStats: StudyStats | null;
  isStatsLoading: boolean;
}

export const DashboardUI: React.FC<DashboardUIProps> = ({
  onNavigate, totalCount, newCount, rawCount, refinedCount, reviewStats,
  lastBackupTime, onBackup, onRestore,
  serverStatus, onAction, onStartNewLearn, onStartDueReview, dayProgress, dailyGoals, onNavigateToWordList, goalStats,
  studyStats, isStatsLoading
}) => {
  const version = useMemo(() => getFormattedBuildDate(), []);
  const [activeTab, setActiveTab] = useState<'STUDY' | 'INSIGHT'>('STUDY');
  
  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-4">
        <div>
            <div className="flex items-baseline gap-2">
                <h2 className="text-3xl font-black text-neutral-900 tracking-tight">IELTS Vocab Pro</h2>
                <span className="text-[10px] font-bold text-neutral-400 font-mono tracking-tighter bg-neutral-100 px-1.5 py-0.5 rounded-md border border-neutral-200">{version}</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
                 {serverStatus === 'connected' ? (
                    <div className="px-3 py-1.5 rounded-full border flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-700">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cloud Connected</span>
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
             <button onClick={() => setActiveTab('STUDY')} className={`w-32 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'STUDY' ? 'bg-neutral-900 text-white shadow-lg transform scale-[1.02]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}><LayoutDashboard size={16} /> Study</button>
             <button onClick={() => setActiveTab('INSIGHT')} className={`w-32 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'INSIGHT' ? 'bg-neutral-900 text-white shadow-lg transform scale-[1.02]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}><BarChart3 size={16} /> Insight</button>
        </div>
        <WordStatsBar 
            newCount={newCount}
            studyingCount={reviewStats.learned}
            masteredCount={reviewStats.mastered}
            totalCount={totalCount}
        />
      </div>

      {activeTab === 'STUDY' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <StudyNowPanel stats={studyStats} isLoading={isStatsLoading} onStartNew={onStartNewLearn} onStartDue={onStartDueReview} onAction={(action) => onNavigate(action)} />
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

              {/* Row 2: Library + Day */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <LibraryHealthPanel totalCount={totalCount} newCount={newCount} rawCount={rawCount} refinedCount={refinedCount} reviewStats={reviewStats} onRefineRaw={() => onNavigateToWordList('raw')} onVerifyRefined={() => onNavigateToWordList('refined')} onViewLibrary={() => onNavigate('BROWSE')} />
                   <DayProgress learnedToday={dayProgress.learned} reviewedToday={dayProgress.reviewed} maxLearn={dailyGoals.max_learn_per_day} maxReview={dailyGoals.max_review_per_day} learnedWords={dayProgress.learnedWords} reviewedWords={dayProgress.reviewedWords} onViewWord={() => {}} />
              </div>
          </div>
      )}
    </div>
  );
};