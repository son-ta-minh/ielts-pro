
import React, { useState, useEffect, useMemo } from 'react';
import { 
  RotateCw, 
  Upload, Download, History, Lightbulb, BookCopy, Sparkles, ChevronRight, Wand2, ShieldCheck, Eye, PenLine, Shuffle, CheckCircle2
} from 'lucide-react';
import { AppView, VocabularyItem } from '../../app/types';
import { DailyGoalConfig } from '../../app/settingsManager';
import { DayProgress } from './DayProgress';

// New component for Word of the Day
const WordOfTheDay: React.FC<{ 
    word: VocabularyItem | null; 
    onView: () => void;
    isComposed?: boolean;
    onCompose?: (word: VocabularyItem) => void;
    onRandomize?: () => void;
}> = ({ word, onView, isComposed, onCompose, onRandomize }) => {
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
    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm group transition-all hover:border-neutral-300 hover:shadow-md flex flex-col gap-2">
      <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
              <div className="p-1 bg-amber-50 rounded-full"><Sparkles size={10} className="text-amber-500 fill-amber-500" /></div>
              <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Word of the Day</h3>
          </div>
          
          <div className="flex items-center gap-1">
              {onCompose && (
                  <button 
                      onClick={(e) => { e.stopPropagation(); onCompose(word); }}
                      className={`p-1.5 rounded-lg transition-colors ${isComposed ? 'text-green-500 bg-green-50' : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'}`}
                      title={isComposed ? "Already composed" : "Compose"}
                  >
                      {isComposed ? <CheckCircle2 size={14}/> : <PenLine size={14}/>}
                  </button>
              )}
              <button 
                  onClick={onView} 
                  className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  title="Details"
              >
                  <Eye size={14}/>
              </button>
              {onRandomize && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onRandomize(); }}
                    className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                    title="Randomize"
                  >
                      <Shuffle size={14} />
                  </button>
              )}
          </div>
      </div>
      
      <h4 className="text-3xl font-black text-neutral-900 tracking-tight">{word.word}</h4>
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
  const countLength = totalCount.toString().length;
  const countTextSize = countLength > 4 ? 'text-2xl' : 'text-4xl';

  return (
    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-start">
        <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Library Health</h3>
        <button onClick={onViewLibrary} className="group text-neutral-300 hover:text-neutral-900 transition-colors p-2 -mr-2">
            <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6 my-6 flex-grow">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className={`${countTextSize} font-black text-neutral-900`}>{totalCount}</div>
            <div className="text-xs font-bold text-neutral-400">Total Words</div>
          </div>
        </div>
        <div className="flex flex-col justify-center space-y-3">
          {(['New', 'Learning', 'Mastered'] as const).map(label => {
            const count = label === 'New' ? newCount : label === 'Learning' ? reviewStats.learned : reviewStats.mastered;
            const color = label === 'New' ? 'bg-blue-500' : label === 'Learning' ? 'bg-cyan-500' : 'bg-purple-500';

            if (label === 'Learning') {
                return (
                    <div key={label} className="relative group">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 font-bold text-neutral-600">
                                <div className={`w-2 h-2 rounded-full ${color}`}></div>
                                {label}
                                <Eye size={12} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                            </div>
                            <div className="font-black text-neutral-900">{count}</div>
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-neutral-900 text-white rounded-lg p-2 text-xs shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="space-y-1">
                                <div className="flex justify-between items-center"><span className="font-bold text-rose-400">Forgot</span><span className="font-black">{reviewStats.statusForgot}</span></div>
                                <div className="flex justify-between items-center"><span className="font-bold text-orange-400">Hard</span><span className="font-black">{reviewStats.statusHard}</span></div>
                                <div className="flex justify-between items-center"><span className="font-bold text-cyan-400">Just Learned</span><span className="font-black">{reviewStats.statusLearned}</span></div>
                                <div className="flex justify-between items-center"><span className="font-bold text-green-400">Easy</span><span className="font-black">{reviewStats.statusEasy}</span></div>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 rotate-45"></div>
                        </div>
                    </div>
                )
            }

            return (
              <div key={label}>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-bold text-neutral-600"><div className={`w-2 h-2 rounded-full ${color}`}></div>{label}</div>
                  <div className="font-black text-neutral-900">{count}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="mt-auto flex flex-col sm:flex-row gap-2">
        <button onClick={onRefineRaw} disabled={rawCount === 0} className="flex-1 justify-between px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-black text-xs flex items-center hover:bg-indigo-100 transition-all active:scale-95 disabled:opacity-50 disabled:hover:bg-indigo-50 border border-indigo-100 shadow-sm"><div className="flex items-center space-x-2"><Wand2 size={12} /><span>REFINE RAW</span></div><span className="px-2 py-0.5 bg-indigo-200/50 rounded-md font-black">{rawCount}</span></button>
        <button onClick={onVerifyRefined} disabled={refinedCount === 0} className="flex-1 justify-between px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-black text-xs flex items-center hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-50 disabled:hover:bg-emerald-50 border border-emerald-100 shadow-sm"><div className="flex items-center space-x-2"><ShieldCheck size={12} /><span>VERIFY REFINED</span></div><span className="px-2 py-0.5 bg-emerald-200/50 rounded-md font-black">{refinedCount}</span></button>
      </div>
    </div>
  );
};


// Define props for the UI component
export interface DashboardUIProps {
  totalCount: number;
  dueCount: number;
  newCount: number;
  rawCount: number;
  refinedCount: number;
  reviewStats: { learned: number; mastered: number; statusForgot: number; statusHard: number; statusEasy: number; statusLearned: number; };
  wotd: VocabularyItem | null;
  onViewWotd: (word: VocabularyItem) => void;
  setView: (view: AppView) => void;
  onNavigateToWordList: (filter: string) => void;
  onStartDueReview: () => void;
  onStartNewLearn: () => void;
  lastBackupTime: number | null;
  onBackup: () => void;
  onRestore: () => void;
  dayProgress: { learned: number; reviewed: number; learnedWords: VocabularyItem[]; reviewedWords: VocabularyItem[]; };
  dailyGoals: DailyGoalConfig;
  isWotdComposed?: boolean;
  onComposeWotd?: (word: VocabularyItem) => void;
  onRandomizeWotd?: () => void;
}

// The pure UI component
export const DashboardUI: React.FC<DashboardUIProps> = ({
  totalCount,
  dueCount,
  newCount,
  rawCount,
  refinedCount,
  reviewStats,
  wotd,
  onViewWotd,
  setView,
  onNavigateToWordList,
  onStartDueReview,
  onStartNewLearn,
  lastBackupTime,
  onBackup,
  onRestore,
  dayProgress,
  dailyGoals,
  isWotdComposed,
  onComposeWotd,
  onRandomizeWotd
}) => {
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-6">
        <div>
            <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Vocab Pro</h2>
            <p className="text-neutral-500 mt-2 font-medium">Don't memorize random lists. Curate the words you actually use.</p>
        </div>
        <BackupStatus lastBackupTime={lastBackupTime} onBackup={onBackup} onRestore={onRestore} />
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
          <WordOfTheDay 
              word={wotd} 
              onView={() => wotd && onViewWotd(wotd)} 
              isComposed={isWotdComposed}
              onCompose={onComposeWotd}
              onRandomize={onRandomizeWotd}
          />
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
    </div>
  );
};
