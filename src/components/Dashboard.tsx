import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, Plus, List, RotateCw, Loader2,
  Quote, Layers, Combine, MessageSquare, Mic, AtSign, Layers3, Upload, Download, History, Lightbulb
} from 'lucide-react';
import { AppView, VocabularyItem } from '../app/types';
import { 
  getRegularVocabulary, 
  getIdioms, 
  getPhrasalVerbs, 
  getCollocations, 
  getStandardPhrases, 
  getPronunciationFocusWords, 
  getPrepositionWords,
  getUnitsByUserId,
  getAllWordsForExport
} from '../app/db';

interface Props {
  userId: string;
  totalCount: number;
  dueCount: number;
  newCount: number;
  setView: (view: AppView) => void;
  onAddWord: () => void;
  lastBackupTime: number | null;
  onBackup: () => void;
  onRestore: () => void;
  onNavigateToWordList: (filter: string) => void;
}

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

const Dashboard: React.FC<Props> = ({ userId, totalCount, dueCount, newCount, setView, onAddWord, lastBackupTime, onBackup, onRestore, onNavigateToWordList }) => {
  const [labStats, setLabStats] = useState<any[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setLoadingLabs(true);
      const [regularWords, idioms, phrasalVerbs, collocations, phrases, prepositions, pronunciationWords, units, allWords] = await Promise.all([
        getRegularVocabulary(userId), getIdioms(userId), getPhrasalVerbs(userId), getCollocations(userId), getStandardPhrases(userId), getPrepositionWords(userId), getPronunciationFocusWords(userId), getUnitsByUserId(userId), getAllWordsForExport(userId)
      ]);
      const wordLabData = [
        { name: 'Vocabulary', words: regularWords, filterId: 'vocab', icon: BookOpen, color: 'emerald' },
        { name: 'Idiom', words: idioms, filterId: 'idiom', icon: Quote, color: 'amber' },
        { name: 'Phrasal Verb', words: phrasalVerbs, filterId: 'phrasal', icon: Layers, color: 'blue' },
        { name: 'Collocation', words: collocations, filterId: 'colloc', icon: Combine, color: 'indigo' },
        { name: 'Phrase', words: phrases, filterId: 'phrase', icon: MessageSquare, color: 'teal' },
        { name: 'Preposition', words: prepositions, filterId: 'preposition', icon: AtSign, color: 'violet' },
        { name: 'Pronunciation', words: pronunciationWords, filterId: 'pronun', icon: Mic, color: 'rose' },
      ].map(lab => ({ name: lab.name, filterId: lab.filterId, icon: lab.icon, color: lab.color, total: lab.words.length, learned: lab.words.filter(w => !!w.lastReview).length }));
      const learnedIds = new Set(allWords.filter(w => !w.isPassive && w.lastReview).map(w => w.id));
      let completedUnits = 0;
      units.forEach(unit => {
        const unitWordObjects = unit.wordIds.map(id => allWords.find(w => w.id === id)).filter(w => w && !w.isPassive);
        if (unitWordObjects.length > 0 && unitWordObjects.every(w => learnedIds.has(w!.id))) completedUnits++;
      });
      const finalStats = [...wordLabData, { name: 'Unit', total: units.length, learned: completedUnits, view: 'UNITS_LAB', icon: Layers3, color: 'purple' }];
      const order = ['Vocabulary', 'Unit', 'Idiom', 'Collocation', 'Phrasal Verb', 'Preposition', 'Phrase', 'Pronunciation'];
      finalStats.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
      setLabStats(finalStats);
      setLoadingLabs(false);
    };
    if (userId) fetchDashboardStats();
  }, [userId, totalCount]);
  
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-6">
        <div><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Dashboard</h2><p className="text-neutral-500 mt-2 font-medium">Ready for your next IELTS target.</p></div>
        <BackupStatus lastBackupTime={lastBackupTime} onBackup={onBackup} onRestore={onRestore} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm grid grid-cols-[1fr,auto] items-start gap-4">
          <div><div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Study Now</div><div className="text-3xl font-black text-neutral-900">{dueCount + newCount}</div><div className="text-sm text-neutral-500 mt-1">Ready to study</div></div>
          <div className="flex flex-col space-y-2">
            <button onClick={() => setView('LEARN_NEW')} disabled={newCount === 0} className="w-full justify-between px-4 py-2 bg-blue-500 text-white rounded-xl font-black text-xs flex items-center space-x-4 hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-blue-500/10"><div className="flex items-center space-x-2"><Lightbulb size={12} /><span>LEARN NEW</span></div><span className="px-2 py-0.5 bg-white/20 rounded-md text-white font-black">{newCount}</span></button>
            <button onClick={() => setView('REVIEW_DUE')} disabled={dueCount === 0} className="w-full justify-between px-4 py-2 bg-orange-500 text-white rounded-xl font-black text-xs flex items-center space-x-4 hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-orange-500/10"><div className="flex items-center space-x-2"><RotateCw size={12} /><span>REVIEW DUE</span></div><span className="px-2 py-0.5 bg-white/20 rounded-md text-white font-black">{dueCount}</span></button>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm grid grid-cols-[1fr,auto] items-start gap-4">
          <div><div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Library</div><div className="text-3xl font-black text-neutral-900">{totalCount}</div><div className="text-sm text-neutral-500 mt-1">Active items</div></div>
          <div className="flex flex-col space-y-2">
            <button onClick={onAddWord} className="w-full justify-center px-4 py-3 bg-neutral-100 text-neutral-700 rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-200 transition-all active:scale-95"><Plus size={12} /><span>ADD WORD</span></button>
            <button onClick={() => setView('BROWSE')} className="w-full justify-center px-4 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all active:scale-95"><List size={12} /><span>BROWSE LIBRARY</span></button>
          </div>
        </div>
      </div>
      
      <section className="space-y-4">
        <h3 className="text-lg font-black text-neutral-900 tracking-tight">Specialized Labs</h3>
        {loadingLabs ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-neutral-300" /></div> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {labStats.map(lab => {
              const progress = lab.total > 0 ? (lab.learned / lab.total) * 100 : 0;
              const Icon = lab.icon;
              return (
                <button key={lab.name} onClick={() => lab.filterId ? onNavigateToWordList(lab.filterId) : setView(lab.view as AppView)} className="p-4 bg-white border border-neutral-200 rounded-2xl flex flex-col text-left hover:border-neutral-900 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between"><div className={`p-2 bg-${lab.color}-50 text-${lab.color}-600 rounded-xl`}><Icon size={16} /></div><div className="text-xs font-bold text-neutral-400 group-hover:text-neutral-900">{lab.name === 'Unit' ? `${lab.learned}/${lab.total}` : `${lab.learned} / ${lab.total}`}</div></div>
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

export default Dashboard;