import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, Plus, List, RotateCw, Loader2,
  Quote, Layers, Combine, MessageSquare, Mic, AtSign, Layers3, Upload, Download, History, Lightbulb, BookCopy, Sparkles, ChevronRight
} from 'lucide-react';
import { AppView, VocabularyItem } from '../../app/types';
import { DailyGoalConfig } from '../../app/settingsManager';
import { DayProgress } from './DayProgress';

// New component for Word of the Day
const WordOfTheDay: React.FC<{ word: VocabularyItem | null; onView: () => void; }> = ({ word, onView }) => {
  if (!word) {
    return (
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col items-center justify-center text-center">
            <Sparkles size={32} className="text-neutral-300 mb-4"/>
            <h4 className="font-bold text-neutral-400">Word of the Day</h4>
            <p className="text-xs text-neutral-300">Add words to your library to see one here.</p>
        </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm group transition-all hover:border-neutral-300 hover:shadow-md flex flex-col">
      <div className="flex items-start justify-between">
          <div className="space-y-1">
              <div className="flex items-center gap-2">
                  <div className="p-1 bg-amber-50 rounded-full"><Sparkles size={10} className="text-amber-500 fill-amber-500" /></div>
                  <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Word of the Day</h3>
              </div>
              <h4 className="text-2xl font-black text-neutral-900">{word.word}</h4>
              <p className="font-mono text-neutral-400 text-sm">{word.ipa}</p>
          </div>
          <button 
              onClick={onView} 
              className="px-4 py-2 bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs hover:bg-neutral-200 transition-all flex items-center space-x-2"
          >
              <span>Details</span>
              <ChevronRight size={14}/>
          </button>
      </div>
    </div>
  );
};

const BackupStatus: React.FC<{ lastBackupTime: number | null; onBackup: () => void; onRestore: () => void; }> = ({ lastBackupTime, onBackup, onRestore }) => {
  const [statusText, setStatusText] = useState('');

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

  const isUrgent = useMemo(() => {
    if (!lastBackupTime) return true;
    return (Date.now() - lastBackupTime) > 3 * 24 * 60 * 60 * 1000;
  }, [lastBackupTime]);

  return (
    <div className={`flex shrink-0 items-center justify-between space-x-3 px-3 py-2 rounded-2xl border-2 shadow-sm ${
      isUrgent ? 'bg-white border-amber-200 text-amber-900' : 'bg-white border-neutral-200 text-neutral-800'
    }`}>
      <div className="flex items-center space-x-2">
        <History size={14} />
        <span className="font-medium text-xs whitespace-nowrap">{statusText}</span>
      </div>
      <div className="flex items-center space-x-2 pl-2">
        <button onClick={onBackup} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center space-x-1.5 ${isUrgent ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}><Download size={12} /><span>Backup</span></button>
        <button onClick={onRestore} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center space-x-1.5 ${isUrgent ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}><Upload size={12} /><span>Restore</span></button>
      </div>
    </div>
  );
};

// Define props for the UI component
export interface DashboardUIProps {
  totalCount: number;
  dueCount: number;
  newCount: number;
  refinedCount: number;
  wotd: VocabularyItem | null;
  onViewWotd: (word: VocabularyItem) => void;
  setView: (view: AppView) => void;
  onNavigateToWordList: (filter: string) => void;
  onStartDueReview: () => void;
  onStartNewLearn: () => void;
  lastBackupTime: number | null;
  onBackup: () => void;
  onRestore: () => void;
  labStats: any[];
  loadingLabs: boolean;
  dayProgress: { learned: number; reviewed: number; learnedWords: VocabularyItem[]; reviewedWords: VocabularyItem[]; };
  dailyGoals: DailyGoalConfig;
}

// The pure UI component
export const DashboardUI: React.FC<DashboardUIProps> = ({
  totalCount,
  dueCount,
  newCount,
  refinedCount,
  wotd,
  onViewWotd,
  setView,
  onNavigateToWordList,
  onStartDueReview,
  onStartNewLearn,
  lastBackupTime,
  onBackup,
  onRestore,
  labStats,
  loadingLabs,
  dayProgress,
  dailyGoals,
}) => {
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-6">
        <div>
            <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Dashboard</h2>
            <p className="text-neutral-500 mt-2 font-medium">Don't memorize random lists. Curate the words you actually use.</p>
        </div>
        <BackupStatus lastBackupTime={lastBackupTime} onBackup={onBackup} onRestore={onRestore} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-1 bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Library</div>
                <div className="flex items-end gap-6 mt-4">
                  <div>
                      <div className="text-3xl font-black text-neutral-900">{totalCount}</div>
                      <div className="text-sm text-neutral-500 font-medium mt-1">Total Items</div>
                  </div>
                  <div className="w-px h-10 bg-neutral-200"></div>
                  <div>
                      <div className="text-2xl font-black text-emerald-600">{refinedCount}</div>
                      <div className="text-xs font-bold text-emerald-500">Verified</div>
                  </div>
                </div>
              </div>
              <button onClick={() => setView('BROWSE')} className="group text-neutral-300 hover:text-neutral-900 transition-colors p-2 -mr-2">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={onStartNewLearn} disabled={newCount === 0} className="flex-1 justify-between px-4 py-3 bg-blue-500 text-white rounded-xl font-black text-xs flex items-center hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-500/10"><div className="flex items-center space-x-2"><Lightbulb size={12} /><span>LEARN NEW</span></div><span className="px-2 py-0.5 bg-white/20 rounded-md text-white font-black">{newCount}</span></button>
            <button onClick={onStartDueReview} disabled={dueCount === 0} className="flex-1 justify-between px-4 py-3 bg-orange-500 text-white rounded-xl font-black text-xs flex items-center hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-orange-500/10"><div className="flex items-center space-x-2"><RotateCw size={12} /><span>REVIEW DUE</span></div><span className="px-2 py-0.5 bg-white/20 rounded-md text-white font-black">{dueCount}</span></button>
          </div>
        </div>
        <div className="md:col-span-1">
          <WordOfTheDay word={wotd} onView={() => wotd && onViewWotd(wotd)} />
        </div>
      </div>

      <DayProgress
        learnedToday={dayProgress.learned}
        reviewedToday={dayProgress.reviewed}
        maxLearn={dailyGoals.max_learn_per_day}
        maxReview={dailyGoals.max_review_per_day}
        learnedWords={dayProgress.learnedWords}
        reviewedWords={dayProgress.reviewedWords}
        onViewWord={onViewWotd}
      />
      
      <section className="space-y-4">
        <h3 className="text-lg font-black text-neutral-900 tracking-tight">Specialized Labs</h3>
        {loadingLabs ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-neutral-300" /></div> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {labStats.map(lab => {
              const progress = lab.total > 0 ? (lab.learned / lab.total) * 100 : 0;
              const Icon = lab.icon;
              return (
                <button key={lab.name} onClick={() => lab.filterId ? onNavigateToWordList(lab.filterId) : setView(lab.view as AppView)} className="p-4 bg-white border border-neutral-200 rounded-2xl flex flex-col text-left hover:border-neutral-900 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between"><div className={`p-2 bg-${lab.color}-50 text-${lab.color}-600 rounded-xl`}><Icon size={16} /></div><div className="text-xs font-bold text-neutral-400 group-hover:text-neutral-900">{lab.name === 'Essay' ? `${lab.learned}/${lab.total}` : `${lab.learned} / ${lab.total}`}</div></div>
                  <div className="mt-auto pt-2 space-y-1.5"><h4 className="font-bold text-neutral-900 text-sm leading-tight">{lab.name}</h4><div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden"><div className={`h-full bg-${lab.color}-500 transition-all duration-500`} style={{ width: `${progress}%` }} /></div></div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  );
};