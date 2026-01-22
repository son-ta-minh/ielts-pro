
import React, { Suspense, useState, useEffect } from 'react';
import { 
  Plus, LayoutDashboard, List, Settings, RefreshCw, LogOut, Sparkles, Menu, X, Layers3, BookCopy, Loader2, Map, Network, Mic, PenLine, BrainCircuit, ClipboardCheck, ChevronDown, Puzzle, FileClock, AlertTriangle, AudioLines
} from 'lucide-react';
import { AppView, SessionType, VocabularyItem, User } from './types';
import { useAppController } from './useAppController';
import { getDueWords, getNewWords } from './db';
import EditWordModal from '../components/word_lib/EditWordModal';
import ViewWordModal from '../components/word_lib/ViewWordModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import StudyBuddy from '../components/common/StudyBuddy';

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
const Comparison = React.lazy(() => import('../components/comparison/Comparison'));
const IrregularVerbs = React.lazy(() => import('../components/irregular_verbs/IrregularVerbs'));
const MimicPractice = React.lazy(() => import('../components/labs/MimicPractice').then(module => ({ default: module.MimicPractice })));

type AppController = ReturnType<typeof useAppController>;

interface AppLayoutProps {
  controller: AppController;
}

const navItems = [
  { id: 'DASHBOARD', view: 'DASHBOARD', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'DISCOVER', view: 'DISCOVER', icon: Map, label: 'Discover' },
  { id: 'BROWSE', view: 'BROWSE', icon: List, label: 'Library' },
  { 
    id: 'IELTS_PREP', 
    label: 'IELTS Prep', 
    icon: ClipboardCheck,
    children: [
      { id: 'UNIT_LIBRARY', view: 'UNIT_LIBRARY', icon: Layers3, label: 'Reading' },
      { id: 'SPEAKING', view: 'SPEAKING', icon: Mic, label: 'Speaking' },
      { id: 'WRITING', view: 'WRITING', icon: PenLine, label: 'Writing' },
    ]
  },
  {
    id: 'LABS',
    label: 'Labs',
    icon: BrainCircuit,
    children: [
      { id: 'MIMIC', view: 'MIMIC', icon: AudioLines, label: 'Mimic Practice' },
      { id: 'COMPARISON', view: 'COMPARISON', icon: Puzzle, label: 'Comparison' },
      { id: 'WORD_NET', view: 'WORD_NET', icon: Network, label: 'Word Net' },
      { id: 'PARAPHRASE', view: 'PARAPHRASE', icon: RefreshCw, label: 'Paraphrase' },
      { id: 'IRREGULAR_VERBS', view: 'IRREGULAR_VERBS', icon: FileClock, label: 'Irregular Verb' },
    ]
  },
  { id: 'SETTINGS', view: 'SETTINGS', icon: Settings, label: 'Settings' }
] as const;

const Sidebar: React.FC<AppLayoutProps & { 
    onNavigate: (view: AppView, action?: () => void) => void;
    onLogoutRequest: () => void;
}> = ({ controller, onNavigate, onLogoutRequest }) => {
  const { 
    currentUser, view, setView, sessionType, isSidebarOpen, setIsSidebarOpen, 
    openAddWordLibrary, forceExpandAdd
  } = controller;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['IELTS_PREP', 'LABS']));

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (!currentUser) return null;

  return (
    <>
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2"><Sparkles size={24} className="text-neutral-900" /><span className="font-black text-lg">Vocab Pro</span></div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2"><X size={24} /></button>
        </div>
        
        <nav className="mt-8 flex-1 overflow-y-auto space-y-1">
          {sessionType && view !== 'REVIEW' && (
            <div className="relative group animate-in fade-in duration-300 mb-1">
              <button onClick={() => { setView('REVIEW'); setIsSidebarOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm bg-green-500 text-white shadow-lg shadow-green-500/20">
                <div className="flex items-center space-x-3"><BookCopy size={20} /><span>Study Now</span></div>
                <div className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></div>
              </button>
            </div>
          )}
          {navItems.map(item => {
            if ('children' in item && item.children) { // It's a group
              const isExpanded = expandedGroups.has(item.id);
              const isGroupActive = item.children.some(child => child.view === view);

              return (
                <div key={item.id} className="space-y-1">
                  <button 
                    onClick={() => handleToggleGroup(item.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${isGroupActive ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <item.icon size={20} />
                      <span>{item.label}</span>
                    </div>
                    <ChevronDown size={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="pl-6 space-y-1 animate-in fade-in duration-300">
                      {item.children.map(child => {
                        const isActive = view === child.view;
                        return (
                          <button
                            key={child.id}
                            onClick={() => onNavigate(child.view)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-bold text-sm transition-colors ${isActive ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
                          >
                            <div className="flex items-center space-x-3"><child.icon size={18} /><span>{child.label}</span></div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            
            const singleItem = item as { readonly view: AppView; readonly id: string; readonly icon: any; readonly label: string };
            const isActive = view === singleItem.view && (singleItem.id !== 'BROWSE' || !forceExpandAdd);
            return (
              <div key={singleItem.id} className="relative group">
                <button 
                  onClick={() => onNavigate(singleItem.view)} 
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${isActive ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-100'}`}
                >
                  <div className="flex items-center space-x-3"><singleItem.icon size={20} /><span>{singleItem.label}</span></div>
                </button>
                {singleItem.id === 'BROWSE' && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onNavigate('BROWSE', openAddWordLibrary); }}
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
               <img src={currentUser.avatar} className="w-10 h-10 rounded-2xl bg-neutral-100" />
               <div className="flex-1 overflow-hidden">
                 <div className="text-sm font-bold text-neutral-900 truncate">{currentUser.name}</div>
                 <div className="text-[10px] text-neutral-400 font-bold truncate">{currentUser.role}</div>
               </div>
             </div>
             <button onClick={onLogoutRequest} className="p-3 text-neutral-400 hover:bg-neutral-100 hover:text-red-500 rounded-xl transition-colors shrink-0" title="Log Out">
               <LogOut size={20} />
             </button>
           </div>
        </div>
      </aside>
    </>
  );
};

const MainContent: React.FC<AppLayoutProps> = ({ controller }) => {
  const {
    view,
    currentUser,
    stats,
    xpToNextLevel,
    wotd,
    setGlobalViewWord,
    setView,
    lastBackupTime,
    handleBackup,
    handleRestore,
    handleNavigateToList,
    startDueReviewSession,
    startNewLearnSession,
    sessionWords,
    sessionType,
    sessionFocus,
    updateWord,
    bulkUpdateWords,
    handleSessionComplete,
    gainExperienceAndLevelUp,
    recalculateXpAndLevelUp,
    handleRetrySession,
    deleteWord,
    bulkDeleteWords,
    startSession,
    initialListFilter,
    setInitialListFilter,
    forceExpandAdd,
    setForceExpandAdd,
    handleUpdateUser,
    refreshGlobalStats,
    handleLibraryReset,
    apiUsage,
    xpGained,
    lastMasteryScoreUpdateTimestamp
  } = controller;

  if (!currentUser) return null;

  switch (view) {
    case 'DASHBOARD':
      return (
        <Dashboard
          userId={currentUser.id}
          user={currentUser}
          totalCount={stats.total}
          dueCount={stats.due}
          newCount={stats.new}
          xpToNextLevel={xpToNextLevel}
          wotd={wotd}
          onViewWotd={setGlobalViewWord}
          setView={setView}
          lastBackupTime={lastBackupTime}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onNavigateToWordList={handleNavigateToList}
          onStartDueReview={startDueReviewSession}
          onStartNewLearn={startNewLearnSession}
        />
      );
    case 'REVIEW':
      return sessionWords && sessionType ? (
        <ReviewSession
          user={currentUser}
          sessionWords={sessionWords}
          sessionType={sessionType}
          sessionFocus={sessionFocus}
          onUpdate={updateWord}
          onBulkUpdate={bulkUpdateWords}
          onComplete={handleSessionComplete}
          onRetry={handleRetrySession}
        />
      ) : null;
    case 'BROWSE':
      return (
        <WordList
          user={currentUser}
          onDelete={async (id) => await deleteWord(id)}
          onBulkDelete={async (ids) => await bulkDeleteWords(ids)}
          onUpdate={updateWord}
          onStartSession={(words) => startSession(words, 'custom')}
          initialFilter={initialListFilter}
          onInitialFilterApplied={() => setInitialListFilter(null)}
          forceExpandAdd={forceExpandAdd}
          onExpandAddConsumed={() => setForceExpandAdd(false)}
        />
      );
    case 'UNIT_LIBRARY':
        return <UnitLibrary user={currentUser} onStartSession={(words) => startSession(words, 'new_study')} onUpdateUser={handleUpdateUser} />;
    case 'PARAPHRASE':
        return <ParaphrasePractice user={currentUser} />;
    case 'SETTINGS':
        return <SettingsView user={currentUser} onUpdateUser={handleUpdateUser} onRefresh={refreshGlobalStats} onNuke={handleLibraryReset} apiUsage={apiUsage} />;
    case 'DISCOVER':
        return <Discover user={currentUser} xpToNextLevel={xpToNextLevel} totalWords={stats.total} onExit={() => setView('DASHBOARD')} onGainXp={gainExperienceAndLevelUp} onRecalculateXp={recalculateXpAndLevelUp} xpGained={xpGained} onStartSession={startSession} onUpdateUser={handleUpdateUser} lastMasteryScoreUpdateTimestamp={lastMasteryScoreUpdateTimestamp} onBulkUpdate={bulkUpdateWords} />;
    case 'WORD_NET':
        return <WordNet userId={currentUser.id} />;
    case 'SPEAKING':
        return <SpeakingPractice user={currentUser} />;
    case 'WRITING':
        return <WritingPractice user={currentUser} />;
    case 'COMPARISON':
        return <Comparison user={currentUser} />;
    case 'IRREGULAR_VERBS':
        return <IrregularVerbs user={currentUser} onGlobalViewWord={setGlobalViewWord} />;
    case 'MIMIC':
        return <MimicPractice />;
    default:
      return <div>Unknown view: {view}</div>;
  }
};

export const AppLayout: React.FC<AppLayoutProps> = ({ controller }) => {
  const { view, isSidebarOpen, setIsSidebarOpen, globalViewWord, setGlobalViewWord, updateWord, gainExperienceAndLevelUp, sessionType, clearSessionState, setView, handleLogout, setForceExpandAdd, openAddWordLibrary, currentUser, stats, startDueReviewSession, startNewLearnSession, lastBackupTime } = controller;
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);

  const [endSessionModal, setEndSessionModal] = useState<{isOpen: boolean, targetView: AppView | null, andThen?: () => void}>({isOpen: false, targetView: null, andThen: undefined});

  const handleNavigation = (targetView: AppView, action?: () => void) => {
    if (sessionType && targetView !== 'REVIEW') {
      setEndSessionModal({isOpen: true, targetView, andThen: action});
    } else {
      if(action) { setForceExpandAdd(true); } else { setForceExpandAdd(false); }
      setView(targetView);
      setIsSidebarOpen(false);
    }
  };

  const handleSpecialAction = (action: string) => {
      switch(action) {
          case 'REVIEW':
              startDueReviewSession();
              break;
          case 'BROWSE': // Map to new learn or just browse
              startNewLearnSession();
              break;
          default:
             handleNavigation(action as AppView);
      }
  };
  
  const handleLogoutRequest = () => {
    if (sessionType) {
        setEndSessionModal({ isOpen: true, targetView: null, andThen: handleLogout });
    } else {
        handleLogout();
    }
  };

  const confirmEndSession = () => {
    if (endSessionModal.targetView) {
        clearSessionState();
        setView(endSessionModal.targetView);
        if (endSessionModal.andThen) {
            endSessionModal.andThen();
        } else {
            setForceExpandAdd(false);
        }
        setIsSidebarOpen(false);
    } else if (endSessionModal.andThen) { // For logout
        clearSessionState();
        endSessionModal.andThen();
    }
    setEndSessionModal({isOpen: false, targetView: null, andThen: undefined});
  };

  const cancelEndSession = () => {
    setEndSessionModal({isOpen: false, targetView: null, andThen: undefined});
  };

  const handleEditRequest = (word: VocabularyItem) => {
    setGlobalViewWord(null);
    setEditingWord(word);
  };

  const handleSaveEdit = (updated: VocabularyItem) => {
    updateWord(updated);
    setEditingWord(null);
  }

  return (
    <div className="min-h-screen bg-neutral-50 md:flex">
      <Sidebar controller={controller} onNavigate={handleNavigation} onLogoutRequest={handleLogoutRequest}/>
      <div className={`fixed inset-0 bg-black/30 z-40 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />

      <main className="flex-1 p-6 md:p-10 overflow-y-auto relative">
        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden fixed top-4 left-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md z-30">
          <Menu size={24} />
        </button>
        <Suspense fallback={<div className="flex justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>}>
          <MainContent controller={controller} />
        </Suspense>
      </main>
      
      {currentUser && !sessionType && (
          <StudyBuddy user={currentUser} stats={stats} currentView={view} lastBackupTime={lastBackupTime} onNavigate={handleSpecialAction} />
      )}

      {globalViewWord && <ViewWordModal word={globalViewWord} onClose={() => setGlobalViewWord(null)} onNavigateToWord={setGlobalViewWord} onEditRequest={handleEditRequest} onUpdate={updateWord} onGainXp={gainExperienceAndLevelUp} />}
      {editingWord && <EditWordModal user={controller.currentUser!} word={editingWord} onSave={handleSaveEdit} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setGlobalViewWord(word); }}/>}
      
      <ConfirmationModal
        isOpen={endSessionModal.isOpen}
        title="End Current Session?"
        message="Navigating away will end your current study session. Are you sure you want to continue?"
        confirmText="End Session"
        isProcessing={false}
        onConfirm={confirmEndSession}
        onClose={cancelEndSession}
        icon={<AlertTriangle size={40} className="text-orange-500" />}
        confirmButtonClass="bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200"
      />
    </div>
  );
};
