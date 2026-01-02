
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  LayoutDashboard, 
  BookOpen, 
  List, 
  TrendingUp, 
  Settings, 
  RefreshCw,
  Loader2,
  LogOut,
  Sparkles,
  Mic,
  Quote,
  Layers,
  Combine
} from 'lucide-react';
import { AppView, VocabularyItem, User } from './types';
import Dashboard from './components/Dashboard';
import AddWord from './components/AddWord';
import ReviewSession from './components/ReviewSession';
import WordList from './components/WordList';
import Insights from './components/Insights';
import SettingsView from './components/SettingsView';
import ParaphrasePractice from './components/ParaphrasePractice';
import AuthView from './components/AuthView';
import SmartSelection from './components/SmartSelection';
import IdiomLab from './components/IdiomLab';
import PronunciationLab from './components/PronunciationLab';
import PhrasalVerbLab from './components/PhrasalVerbLab';
import CollocationLab from './components/CollocationLab';
import { getDueWords, saveWord, deleteWordFromDB, getWordCount, saveUser, getNewWords, getAllUsers, seedDatabaseIfEmpty } from './services/db';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('AUTH');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [dueWords, setDueWords] = useState<VocabularyItem[]>([]);
  const [customSessionWords, setCustomSessionWords] = useState<VocabularyItem[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const initApp = async () => {
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
        }
      } else if (seededUser) {
        setCurrentUser(seededUser);
        localStorage.setItem('ielts_pro_current_user_id', seededUser.id);
        setView('DASHBOARD');
      } else if (allUsers.length > 0) {
        setView('AUTH');
      }

      setIsLoaded(true);
    };

    initApp();
  }, []);

  const refreshGlobalStats = useCallback(async () => {
    if (!currentUser) return;
    const count = await getWordCount(currentUser.id);
    let due = await getDueWords(currentUser.id, 25);
    
    if (due.length === 0) {
      due = await getNewWords(currentUser.id, 10);
    }

    setTotalCount(count);
    setDueWords(due);
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
  };

  const addWord = async (newWord: VocabularyItem) => {
    if (!currentUser) return;
    const wordWithUser = { ...newWord, userId: currentUser.id };
    await saveWord(wordWithUser);
    await refreshGlobalStats();
    setView('DASHBOARD');
  };

  const updateWord = async (updatedWord: VocabularyItem) => {
    await saveWord(updatedWord);
    setDueWords(prev => prev.map(w => w.id === updatedWord.id ? updatedWord : w));
    if (customSessionWords) {
      setCustomSessionWords(prev => prev ? prev.map(w => w.id === updatedWord.id ? updatedWord : w) : null);
    }
    const count = await getWordCount(currentUser?.id || '');
    setTotalCount(count);
  };

  const deleteWord = async (id: string) => {
    await deleteWordFromDB(id);
    await refreshGlobalStats();
  };

  const startSmartSession = (words: VocabularyItem[]) => {
    setCustomSessionWords(words);
    setView('REVIEW');
  };

  const NavItem = ({ icon: Icon, label, target, active, color }: { icon: any, label: string, target: AppView, active: boolean, color?: string }) => (
    <button 
      onClick={() => { setView(target); if (target !== 'REVIEW') setCustomSessionWords(null); }}
      className={`flex items-center space-x-3 px-4 py-3 w-full rounded-lg transition-all ${
        active 
          ? 'bg-neutral-900 text-white shadow-md' 
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      <Icon size={18} className={active ? 'text-white' : (color || 'text-neutral-500')} />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );

  if (!isLoaded) return <div className="h-screen w-screen flex items-center justify-center bg-neutral-50"><Loader2 className="animate-spin text-neutral-400" size={32} /></div>;
  if (!currentUser || view === 'AUTH') return <AuthView onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden">
      <aside className="w-72 border-r border-neutral-200 bg-white flex flex-col p-6 space-y-8 overflow-y-auto shadow-[20px_0_30px_-20px_rgba(0,0,0,0.05)] z-10">
        <div className="flex items-center space-x-3 p-2 bg-neutral-50 rounded-2xl border border-neutral-100">
           <img src={currentUser.avatar} className="w-10 h-10 rounded-xl bg-white p-0.5 border border-neutral-200" alt={currentUser.name} />
           <div className="flex-1 min-w-0">
             <div className="font-bold text-sm truncate text-neutral-900">{currentUser.name}</div>
             <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-tight">Active Learner</div>
           </div>
           <button onClick={handleLogout} className="p-2 text-neutral-300 hover:text-red-500 transition-colors" title="Log out">
             <LogOut size={16} />
           </button>
        </div>

        <div className="flex-1 space-y-6">
          <nav className="space-y-1">
            <div className="px-4 text-[10px] font-black text-neutral-300 uppercase tracking-widest mb-2">Main</div>
            <NavItem icon={LayoutDashboard} label="Dashboard" target="DASHBOARD" active={view === 'DASHBOARD'} />
            <NavItem icon={Sparkles} label="Smart Focus" target="SMART_SELECT" active={view === 'SMART_SELECT'} />
            <NavItem icon={BookOpen} label="Study Now" target="REVIEW" active={view === 'REVIEW'} />
            <NavItem icon={Plus} label="New Vocabulary" target="ADD_WORD" active={view === 'ADD_WORD'} />
          </nav>

          <nav className="space-y-1">
            <div className="px-4 text-[10px] font-black text-neutral-300 uppercase tracking-widest mb-2">Specialized</div>
            <NavItem icon={Quote} label="Idiom Lab" target="IDIOM_LAB" active={view === 'IDIOM_LAB'} color="text-amber-500" />
            <NavItem icon={Combine} label="Collocations" target="COLLOCATION_LAB" active={view === 'COLLOCATION_LAB'} color="text-indigo-500" />
            <NavItem icon={Layers} label="Phrasal Verbs" target="PHRASAL_VERB_LAB" active={view === 'PHRASAL_VERB_LAB'} color="text-blue-500" />
            <NavItem icon={Mic} label="Pronunciation" target="PRONUNCIATION_LAB" active={view === 'PRONUNCIATION_LAB'} color="text-rose-500" />
            <NavItem icon={RefreshCw} label="Paraphrase Lab" target="PARAPHRASE" active={view === 'PARAPHRASE'} color="text-indigo-500" />
          </nav>

          <nav className="space-y-1">
            <div className="px-4 text-[10px] font-black text-neutral-300 uppercase tracking-widest mb-2">Library</div>
            <NavItem icon={List} label="Word Library" target="BROWSE" active={view === 'BROWSE'} />
            <NavItem icon={TrendingUp} label="Insights" target="INSIGHTS" active={view === 'INSIGHTS'} />
          </nav>
        </div>

        <div className="pt-6 border-t border-neutral-100">
          <NavItem icon={Settings} label="Settings" target="SETTINGS" active={view === 'SETTINGS'} />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#fdfdfd]">
        <div className="max-w-4xl mx-auto p-10">
          {view === 'DASHBOARD' && <Dashboard totalCount={totalCount} dueCount={dueWords.length} setView={setView} />}
          {view === 'SMART_SELECT' && <SmartSelection userId={currentUser.id} onStartSession={startSmartSession} />}
          {view === 'ADD_WORD' && <AddWord onAdd={addWord} />}
          {view === 'REVIEW' && (
            <ReviewSession 
              dueWords={customSessionWords || dueWords} 
              onUpdate={updateWord} 
              onComplete={() => { 
                refreshGlobalStats(); 
                setCustomSessionWords(null);
                setView('DASHBOARD'); 
              }} 
            />
          )}
          {view === 'IDIOM_LAB' && <IdiomLab userId={currentUser.id} onUpdate={updateWord} onDelete={deleteWord} onStartSession={startSmartSession} />}
          {view === 'PHRASAL_VERB_LAB' && <PhrasalVerbLab userId={currentUser.id} onUpdate={updateWord} onDelete={deleteWord} onStartSession={startSmartSession} />}
          {view === 'COLLOCATION_LAB' && <CollocationLab userId={currentUser.id} onUpdate={updateWord} onDelete={deleteWord} onStartSession={startSmartSession} />}
          {view === 'PRONUNCIATION_LAB' && <PronunciationLab userId={currentUser.id} onUpdate={updateWord} onDelete={deleteWord} onStartSession={startSmartSession} />}
          {view === 'PARAPHRASE' && <ParaphrasePractice />}
          {view === 'BROWSE' && <WordList userId={currentUser.id} onDelete={deleteWord} onUpdate={updateWord} />}
          {view === 'INSIGHTS' && <Insights userId={currentUser.id} />}
          {view === 'SETTINGS' && <SettingsView userId={currentUser.id} onRefresh={refreshGlobalStats} />}
        </div>
      </main>
    </div>
  );
};

export default App;
