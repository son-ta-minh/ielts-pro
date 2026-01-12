import React, { Suspense, useState, useEffect } from 'react';
import { 
  Plus, LayoutDashboard, List, TrendingUp, Settings, RefreshCw, LogOut, Sparkles, Menu, X, Layers3, BookCopy, Loader2, Gamepad2, Map, Network, Mic, PenLine
} from 'lucide-react';
import { AppView, SessionType, VocabularyItem } from './types';
import { useAppController } from './useAppController';
import { getDueWords, getNewWords } from './db';
import EditWordModal from '../components/word_lib/EditWordModal';
import ViewWordModal from '../components/word_lib/ViewWordModal';
import SidebarStats from '../components/common/SidebarStats';

// Lazy load major views for performance
const Dashboard = React.lazy(() => import('../components/dashboard/Dashboard'));
const ReviewSession = React.lazy(() => import('../components/practice/ReviewSession'));
const WordList = React.lazy(() => import('../components/word_lib/WordList'));
const UnitLibrary = React.lazy(() => import('../components/unit_lib/UnitLibrary'));
const ParaphrasePractice = React.lazy(() => import('../components/paraphrase/ParaphrasePractice'));
const SettingsView = React.lazy(() => import('../components/setting/SettingsView').then(module => ({ default: module.SettingsView })));
const Discover = React.lazy(() => import('../components/discover/Discover'));
const WordNet = React.lazy(() => import('../components/word_net/WordNet'));
const SpeakingPractice = React.lazy(() => import('../components/speaking/SpeakingPractice'));
const WritingPractice = React.lazy(() => import('../components/writing/WritingPractice'));

type AppController = ReturnType<typeof useAppController>;

interface AppLayoutProps {
  controller: AppController;
}

const navItems: { id: string, view: AppView, icon: React.ElementType, label: string }[] = [
  { id: 'DASHBOARD', view: 'DASHBOARD', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'DISCOVER', view: 'DISCOVER', icon: Map, label: 'Discover' },
  { id: 'BROWSE', view: 'BROWSE', icon: List, label: 'Library' },
  { id: 'UNIT_LIBRARY', view: 'UNIT_LIBRARY', icon: Layers3, label: 'Reading' },
  { id: 'SPEAKING', view: 'SPEAKING', icon: Mic, label: 'Speaking' },
  { id: 'WRITING', view: 'WRITING', icon: PenLine, label: 'Writing' },
  { id: 'WORD_NET', view: 'WORD_NET', icon: Network, label: 'Word Net' },
  { id: 'PARAPHRASE', view: 'PARAPHRASE', icon: RefreshCw, label: 'Paraphrase' },
  { id: 'SETTINGS', view: 'SETTINGS', icon: Settings, label: 'Settings' }
];

const Sidebar: React.FC<AppLayoutProps> = ({ controller }) => {
  const { 
    currentUser, view, setView, sessionType, isSidebarOpen, setIsSidebarOpen, 
    handleLogout, openAddWordLibrary, forceExpandAdd, setForceExpandAdd, clearSessionState,
    stats, apiUsage
  } = controller;

  if (!currentUser) return null;

  return (
    <>
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2"><Sparkles size={24} className="text-neutral-900" /><span className="font-black text-lg">Vocab Pro</span></div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2"><X size={24} /></button>
        </div>
        
        <nav className="mt-8 flex-1 overflow-y-auto space-y-2">
          {sessionType && view !== 'REVIEW' && (
            <div className="relative group animate-in fade-in duration-300">
              <button onClick={() => { setView('REVIEW'); setIsSidebarOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm bg-green-500 text-white shadow-lg shadow-green-500/20">
                <div className="flex items-center space-x-3"><BookCopy size={20} /><span>Study Now</span></div>
                <div className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></div>
              </button>
            </div>
          )}
          {navItems.map(item => {
            const isActive = view === item.view && (item.id !== 'BROWSE' || !forceExpandAdd);
            return (
              <div key={item.id} className="relative group">
                <button 
                  onClick={() => { 
                    if (sessionType) clearSessionState();
                    setView(item.view); 
                    setForceExpandAdd(false); 
                    setIsSidebarOpen(false); 
                  }} 
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${isActive ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-100'}`}
                >
                  <div className="flex items-center space-x-3"><item.icon size={20} /><span>{item.label}</span></div>
                </button>
                {item.id === 'BROWSE' && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); openAddWordLibrary(); setIsSidebarOpen(false); }}
                    title="Add Word"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all ${view === 'BROWSE' && forceExpandAdd ? 'bg-white text-neutral-900 shadow-sm' : isActive ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900'}`}
                  ><Plus size={16} /></button>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto">
           <div className="flex items-center space-x-2">
             <div className="w-full flex items-center space-x-3 p-2 rounded-2xl hover:bg-neutral-100 transition-colors flex-1">
               <img src={currentUser.avatar} className="w-10 h-10 rounded-2xl bg-neutral-100" alt="User Avatar" />
               <div className="text-left flex-1 overflow-hidden"><p className="font-bold text-sm truncate">{currentUser.name}</p><p className="text-xs text-neutral-400 truncate">{currentUser.role || 'Learner'}</p></div>
             </div>
             <button onClick={handleLogout} className="p-3 text-neutral-400 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors"><LogOut size={18} /></button>
           </div>
        </div>
      </aside>
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/20 md:hidden" />}
    </>
  );
};

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center h-full space-y-4">
    <Loader2 className="animate-spin text-neutral-200" size={40} />
    <p className="text-xs font-black text-neutral-300 uppercase tracking-widest">Loading Module...</p>
  </div>
);

const MainContent: React.FC<AppLayoutProps> = ({ controller }) => {
  const {
    view, currentUser, stats, setView, openAddWordLibrary, lastBackupTime, handleBackup, handleRestore,
    handleNavigateToList, sessionWords, sessionFocus, updateWord, handleSessionComplete, sessionType,
    handleStartNewStudy, handleStartRandomTest, startSession, deleteWord, bulkDeleteWords, initialListFilter, setInitialListFilter,
    forceExpandAdd, setForceExpandAdd,
    globalViewWord, setGlobalViewWord,
    apiUsage,
    handleLibraryReset,
    handleRetrySession,
    gainExperienceAndLevelUp,
    xpGained,
    wotd,
    xpToNextLevel,
    handleUpdateUser,
    refreshGlobalStats
  } = controller;

  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);

  if (!currentUser) return null;

  const handleEditRequest = (word: VocabularyItem) => {
    setGlobalViewWord(null);
    setEditingWord(word);
  };
  
  const renderContent = () => {
    switch(view) {
      case 'DASHBOARD':
        return <Dashboard
          userId={currentUser.id}
          user={currentUser}
          totalCount={stats.total}
          dueCount={stats.due}
          newCount={stats.new}
          wotd={wotd}
          onViewWotd={setGlobalViewWord}
          setView={setView}
          onAddWord={openAddWordLibrary}
          lastBackupTime={lastBackupTime}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onNavigateToWordList={handleNavigateToList}
          onStartDueReview={async () => startSession(await getDueWords(currentUser.id, 30), 'due')}
          onStartNewLearn={async () => startSession(await getNewWords(currentUser.id, 20), 'new')}
          onStartRandomTest={handleStartRandomTest}
          xpToNextLevel={xpToNextLevel}
        />;
      case 'REVIEW':
        if (!sessionWords || sessionType === null) {
          useEffect(() => {
            setView('DASHBOARD');
          }, [setView]);
          return <LoadingFallback />;
        }
        return <ReviewSession
          sessionWords={sessionWords}
          sessionFocus={sessionFocus}
          sessionType={sessionType}
          onUpdate={updateWord}
          onComplete={handleSessionComplete}
          onGainXp={gainExperienceAndLevelUp}
          onRetry={handleRetrySession}
        />;
      case 'BROWSE':
        return <WordList
          userId={currentUser.id}
          onDelete={deleteWord}
          onBulkDelete={bulkDeleteWords}
          onUpdate={updateWord}
          onGainXp={gainExperienceAndLevelUp}
          onStartSession={(words) => startSession(words, 'custom')}
          initialFilter={initialListFilter}
          onInitialFilterApplied={() => setInitialListFilter(null)}
          forceExpandAdd={forceExpandAdd}
          onExpandAddConsumed={() => setForceExpandAdd(false)}
        />;
      case 'UNIT_LIBRARY':
        return <UnitLibrary user={currentUser} onStartSession={(words) => startSession(words, 'custom')} onUpdateUser={handleUpdateUser} onGainXp={gainExperienceAndLevelUp} />;
      case 'WORD_NET':
        return <WordNet userId={currentUser.id} />;
      case 'PARAPHRASE':
        return <ParaphrasePractice user={currentUser} />;
      case 'SPEAKING':
        return <SpeakingPractice user={currentUser} />;
      case 'WRITING':
        return <WritingPractice user={currentUser} />;
      case 'SETTINGS':
        return <SettingsView user={currentUser} onUpdateUser={handleUpdateUser} onRefresh={refreshGlobalStats} onNuke={handleLibraryReset} apiUsage={apiUsage}/>;
      case 'DISCOVER':
        return <Discover user={currentUser} onExit={() => setView('DASHBOARD')} onGainXp={gainExperienceAndLevelUp} xpGained={xpGained} xpToNextLevel={xpToNextLevel} totalWords={stats.total} onStartSession={(words, type) => startSession(words, type)} onUpdateUser={handleUpdateUser}/>;
      default:
        return <div>Not implemented: {view}</div>;
    }
  };

  return (
    <>
      {renderContent()}
      
      {globalViewWord && (
        <ViewWordModal
          word={globalViewWord}
          onClose={() => setGlobalViewWord(null)}
          onNavigateToWord={setGlobalViewWord}
          onEditRequest={handleEditRequest}
          onUpdate={updateWord}
          onGainXp={gainExperienceAndLevelUp}
          isViewOnly={false}
        />
      )}
      {editingWord && (
        <EditWordModal 
          word={editingWord}
          onSave={(word) => { updateWord(word); setEditingWord(word); }}
          onClose={() => setEditingWord(null)}
          onSwitchToView={(word) => { setEditingWord(null); setGlobalViewWord(word); }}
        />
      )}
    </>
  );
};

export const AppLayout: React.FC<AppLayoutProps> = ({ controller }) => {
  const { setIsSidebarOpen } = controller;

  return (
    <div className="flex h-screen bg-neutral-50">
      <Sidebar controller={controller} />
      <main className="flex-1 overflow-y-auto relative">
        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden absolute top-6 left-6 p-2 bg-white rounded-full shadow-md z-20 text-neutral-900">
            <Menu size={20} />
        </button>
        <div className="p-6 md:p-10">
            <Suspense fallback={<LoadingFallback />}>
              <MainContent controller={controller} />
            </Suspense>
        </div>
      </main>
    </div>
  );
};