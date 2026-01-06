import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  LayoutDashboard, 
  List, 
  TrendingUp, 
  Settings, 
  RefreshCw,
  Loader2,
  LogOut,
  Sparkles,
  Menu,
  X,
  Layers3
} from 'lucide-react';
import { AppView, VocabularyItem, User, ReviewMode } from './types';
import Dashboard from '../components/Dashboard';
import ReviewSession from '../components/ReviewSession';
import WordList from '../components/WordList';
import Insights from '../components/Insights';
import { SettingsView } from '../components/SettingsView';
import ParaphrasePractice from '../components/ParaphrasePractice';
import AuthView from '../components/AuthView';
import UnitsLab from '../components/UnitsLab';
import SidebarStats from '../components/SidebarStats';
import { getDueWords, saveWord, deleteWordFromDB, getWordCount, saveUser, getNewWords, getAllUsers, seedDatabaseIfEmpty, clearVocabularyOnly, getAllWordsForExport, getUnitsByUserId, bulkSaveWords, bulkSaveUnits } from './db';
import { unlockAudio } from '../utils/audio';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('AUTH');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [dueWords, setDueWords] = useState<VocabularyItem[]>([]);
  const [newWords, setNewWords] = useState<VocabularyItem[]>([]);
  const [customSessionWords, setCustomSessionWords] = useState<VocabularyItem[] | null>(null);
  const [sessionFocus, setSessionFocus] = useState<ReviewMode | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState('');
  const [lastBackupTime, setLastBackupTime] = useState<number | null>(
    Number(localStorage.getItem('ielts_pro_last_backup_timestamp')) || null
  );
  
  const [initialListFilter, setInitialListFilter] = useState<string | null>(null);
  const [forceExpandAdd, setForceExpandAdd] = useState(false);
  const [apiUsage, setApiUsage] = useState({ count: 0, date: '' });

  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudio();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
  }, []);

  const loadApiUsage = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const stored = localStorage.getItem('ielts_pro_api_usage');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) {
          setApiUsage(parsed);
        } else {
          setApiUsage({ count: 0, date: today });
        }
      } else {
        setApiUsage({ count: 0, date: today });
      }
    } catch (e) {
      setApiUsage({ count: 0, date: today });
    }
  }, []);
  
  useEffect(() => {
    loadApiUsage();
    window.addEventListener('apiUsageUpdated', loadApiUsage);
    return () => {
      window.removeEventListener('apiUsageUpdated', loadApiUsage);
    };
  }, [loadApiUsage]);

  const initApp = useCallback(async () => {
    setIsLoaded(false);
    const seededUser = await seedDatabaseIfEmpty();
    const savedUserId = localStorage.getItem('ielts_pro_current_user_id');
    const allUsers = await getAllUsers();
    
    if (savedUserId) {
      const found = allUsers.find(u => u.id === savedUserId);
      if (found) {
        setCurrentUser(found);
        setView('DASHBOARD');
      } else {
        localStorage.removeItem('ielts_pro_current_user_id');
        setView('AUTH');
      }
    } else if (seededUser) {
      setCurrentUser(seededUser);
      localStorage.setItem('ielts_pro_current_user_id', seededUser.id);
      setView('DASHBOARD');
    } else {
      setView('AUTH');
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    initApp();
  }, [initApp]);

  const refreshGlobalStats = useCallback(async () => {
    if (!currentUser) return;
    const count = await getWordCount(currentUser.id);
    const due = await getDueWords(currentUser.id, 25);
    const fresh = await getNewWords(currentUser.id, 10);
    
    setTotalCount(count);
    setDueWords(due);
    setNewWords(fresh);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      refreshGlobalStats();
    }
  }, [currentUser, refreshGlobalStats]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('ielts_pro_current_user_id', user.id);
    setView('DASHBOARD');
    const updated = { ...user, lastLogin: Date.now() };
    saveUser(updated);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ielts_pro_current_user_id');
    setView('AUTH');
    setIsSidebarOpen(false);
  };

  const handleUpdateUser = async (updatedUser: User) => {
    await saveUser(updatedUser);
    setCurrentUser(updatedUser);
  };

  const handleBackup = async () => {
    if (!currentUser) return;
    const [wordsData, unitsData] = await Promise.all([
      getAllWordsForExport(currentUser.id),
      getUnitsByUserId(currentUser.id)
    ]);
    const exportObject = {
      version: 3,
      createdAt: new Date().toISOString(),
      vocabulary: wordsData,
      units: unitsData,
    };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts-pro-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const now = Date.now();
    localStorage.setItem('ielts_pro_last_backup_timestamp', String(now));
    setLastBackupTime(now);
  };

  const handleRestore = () => {
    if (!currentUser) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          if (!currentUser) throw new Error("No user logged in.");
          const rawJson = JSON.parse(ev.target?.result as string);
          const incomingItems: Partial<VocabularyItem>[] = Array.isArray(rawJson) ? rawJson : (rawJson.vocabulary || []);
          const incomingUnits: any[] | undefined = rawJson.units;
          if (!Array.isArray(incomingItems)) throw new Error("Invalid format.");
          const localItems = await getAllWordsForExport(currentUser.id);
          const localItemsByWord = new Map(localItems.map(item => [item.word.toLowerCase().trim(), item]));
          const itemsToSave: VocabularyItem[] = [];
          for (const incoming of incomingItems) {
            if (!incoming.word) continue;
            const { userId: oldUserId, ...restOfIncoming } = incoming;
            const local = localItemsByWord.get(incoming.word.toLowerCase().trim());
            if (local) {
              if ((restOfIncoming.updatedAt || 0) > (local.updatedAt || 0)) {
                itemsToSave.push(Object.assign({}, local, restOfIncoming, { id: local.id, userId: currentUser.id, updatedAt: Date.now() }));
              }
            } else {
              const newItem = { ...restOfIncoming, id: restOfIncoming.id || 'id-'+Date.now()+'-'+Math.random().toString(36).substr(2,9), userId: currentUser.id, updatedAt: Date.now() } as VocabularyItem;
              itemsToSave.push(newItem);
            }
          }
          if (itemsToSave.length > 0) await bulkSaveWords(itemsToSave);
          if (incomingUnits && Array.isArray(incomingUnits)) {
            const unitsWithUser = incomingUnits.map(u => ({ ...u, userId: currentUser.id }));
            await bulkSaveUnits(unitsWithUser);
          }
          alert('Restore successful!');
          await initApp();
        } catch(err: any) {
          alert(`Restore failed: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleLibraryReset = async () => {
    setIsResetting(true);
    setResetStep('Cleaning library...');
    try {
      await clearVocabularyOnly();
      sessionStorage.removeItem('ielts_pro_skip_seed');
      await seedDatabaseIfEmpty(true);
      await refreshGlobalStats();
      setView('DASHBOARD');
    } catch (err) {
      window.location.reload();
    } finally {
      setIsResetting(false);
    }
  };

  const updateWord = async (updatedWord: VocabularyItem) => {
    await saveWord(updatedWord);
    setDueWords(prev => prev.map(w => w.id === updatedWord.id ? updatedWord : w));
    if (customSessionWords) setCustomSessionWords(prev => (prev || []).map(w => w.id === updatedWord.id ? updatedWord : w));
    refreshGlobalStats();
  };

  const deleteWord = async (id: string) => {
    await deleteWordFromDB(id);
    refreshGlobalStats();
  };

  const startCustomSession = (words: VocabularyItem[], focus: ReviewMode | null = null) => {
    if (words.length > 0) {
      setCustomSessionWords(words);
      setSessionFocus(focus);
      setView('REVIEW');
    }
  };
  
  const startListSession = (words: VocabularyItem[]) => {
      setCustomSessionWords(words);
      setSessionFocus(null);
      setView('REVIEW');
  };

  const handleNavigateToList = (filter: string) => {
    setInitialListFilter(filter);
    setView('BROWSE');
  };

  const openAddWordLibrary = () => {
    setView('BROWSE');
    setForceExpandAdd(true);
  };

  if (!isLoaded) return <div className="h-screen w-screen flex flex-col items-center justify-center bg-white space-y-4"><Sparkles size={40} className="text-neutral-900" /><p className="text-sm font-bold text-neutral-500">IELTS Pro</p></div>;
  if (isResetting) return <div className="h-screen w-screen flex flex-col items-center justify-center bg-white space-y-4"><Loader2 size={40} className="text-neutral-900 animate-spin" /><p className="text-sm font-bold text-neutral-500">{resetStep}</p></div>;
  if (view === 'AUTH' || !currentUser) return <AuthView onLogin={handleLogin} />;

  const navItems: { id: string, view: AppView, icon: React.ElementType, label: string }[] = [
    { id: 'DASHBOARD', view: 'DASHBOARD', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'BROWSE', view: 'BROWSE', icon: List, label: 'Library' },
    { id: 'UNITS_LAB', view: 'UNITS_LAB', icon: Layers3, label: 'Unit Lab' },
    { id: 'PARAPHRASE', view: 'PARAPHRASE', icon: RefreshCw, label: 'Paraphrase' },
    { id: 'INSIGHTS', view: 'INSIGHTS', icon: TrendingUp, label: 'Insights' },
    { id: 'SETTINGS', view: 'SETTINGS', icon: Settings, label: 'Settings' }
  ];

  return (
    <div className="flex bg-neutral-50 min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md p-4 flex md:hidden items-center justify-between border-b border-neutral-200">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2"><Menu size={24} /></button>
        <span className="font-bold text-lg">IELTS Pro</span>
        <img src={currentUser.avatar} className="w-8 h-8 rounded-full" alt="User Avatar" />
      </header>
      
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2"><Sparkles size={24} className="text-neutral-900" /><span className="font-black text-lg">IELTS Pro</span></div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2"><X size={24} /></button>
        </div>
        
        <nav className="mt-10 space-y-2">
          {navItems.map(item => {
            const isActive = view === item.view && (item.id !== 'BROWSE' || !forceExpandAdd);
            return (
              <div key={item.id} className="relative group">
                <button 
                  onClick={() => { setView(item.view); setForceExpandAdd(false); setIsSidebarOpen(false); }} 
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${isActive ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-100'}`}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </div>
                </button>
                {/* Nested Add Button for Library */}
                {item.id === 'BROWSE' && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); openAddWordLibrary(); setIsSidebarOpen(false); }}
                    title="Add Word"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all ${view === 'BROWSE' && forceExpandAdd ? 'bg-white text-neutral-900 shadow-sm' : isActive ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900'}`}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        <SidebarStats activeWords={totalCount} dueReview={dueWords.length} apiRequestCount={apiUsage.count} />
        
        <div className="mt-auto">
           <div className="flex items-center space-x-2">
             <div className="w-full flex items-center space-x-3 p-2 rounded-2xl hover:bg-neutral-100 transition-colors flex-1">
               <img src={currentUser.avatar} className="w-10 h-10 rounded-xl bg-neutral-100" alt="User Avatar" />
               <div className="text-left flex-1 overflow-hidden"><p className="font-bold text-sm truncate">{currentUser.name}</p><p className="text-xs text-neutral-400 truncate">{currentUser.role || 'IELTS Learner'}</p></div>
             </div>
             <button onClick={handleLogout} className="p-3 text-neutral-400 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors"><LogOut size={18} /></button>
           </div>
        </div>
      </aside>

      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/20 md:hidden" />}

      <main className="flex-1 p-6 md:py-6 md:px-10 lg:px-12 mt-16 md:mt-0 overflow-y-auto h-screen stable-scrollbar">
        {view === 'DASHBOARD' && <Dashboard userId={currentUser.id} totalCount={totalCount} dueCount={dueWords.length} newCount={newWords.length} setView={setView} onAddWord={openAddWordLibrary} lastBackupTime={lastBackupTime} onBackup={handleBackup} onRestore={handleRestore} onNavigateToWordList={handleNavigateToList}/>}
        {view === 'REVIEW_DUE' && <ReviewSession sessionWords={dueWords} onUpdate={updateWord} onComplete={() => setView('DASHBOARD')} />}
        {view === 'LEARN_NEW' && <ReviewSession sessionWords={newWords} onUpdate={updateWord} onComplete={() => setView('DASHBOARD')} />}
        {view === 'REVIEW' && <ReviewSession sessionWords={customSessionWords || []} sessionFocus={sessionFocus} onUpdate={updateWord} onComplete={() => { setCustomSessionWords(null); setView('DASHBOARD'); }} />}
        {view === 'BROWSE' && <WordList userId={currentUser.id} onDelete={deleteWord} onUpdate={updateWord} onStartSession={startListSession} initialFilter={initialListFilter} onInitialFilterApplied={() => setInitialListFilter(null)} forceExpandAdd={forceExpandAdd} onExpandAddConsumed={() => setForceExpandAdd(false)} />}
        {view === 'INSIGHTS' && <Insights userId={currentUser.id} onStartSession={startCustomSession} />}
        {view === 'UNITS_LAB' && <UnitsLab user={currentUser} onStartSession={startCustomSession} />}
        {view === 'PARAPHRASE' && <ParaphrasePractice user={currentUser} />}
        {view === 'SETTINGS' && <SettingsView user={currentUser} onUpdateUser={handleUpdateUser} onRefresh={refreshGlobalStats} onNuke={handleLibraryReset} apiUsage={apiUsage} />}
      </main>
    </div>
  );
};

export default App;