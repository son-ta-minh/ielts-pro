
import React, { Suspense, useState, useEffect } from 'react';
import { 
  Plus, LayoutDashboard, List, Settings, LogOut, Sparkles, Menu, X, Layers3, BookCopy, Loader2, Map, Mic, PenLine, AlertTriangle, BookText, Ear, Zap, Calendar, Gamepad2, BookMarked, Waves
} from 'lucide-react';
import { AppView, SessionType, VocabularyItem } from './types';
import { useAppController } from './useAppController';
import EditWordModal from '../components/word_lib/EditWordModal';
import ViewWordModal from '../components/word_lib/ViewWordModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
// Fixed: StudyBuddy is a named export, not a default export
import { StudyBuddy } from '../components/common/StudyBuddy';

// Lazy load major views for performance
const Dashboard = React.lazy(() => import('../components/dashboard/Dashboard'));
const ReviewSession = React.lazy(() => import('../components/practice/ReviewSession'));
const WordList = React.lazy(() => import('../components/word_lib/WordList'));
// Reading Unit Page
const ReadingUnitPage = React.lazy(() => import('../dynamic/templates/ReadingUnitPage').then(module => ({ default: module.ReadingUnitPage })));
const SettingsView = React.lazy(() => import('../components/setting/SettingsView').then(module => ({ default: module.SettingsView })));
const Discover = React.lazy(() => import('../components/discover/Discover'));
// Writing
const WritingStudioPage = React.lazy(() => import('../dynamic/templates/WritingStudioPage').then(module => ({ default: module.WritingStudioPage })));
const IrregularVerbs = React.lazy(() => import('../components/labs/irregular_verbs/IrregularVerbs'));
const MimicPractice = React.lazy(() => import('../components/labs/MimicPractice').then(module => ({ default: module.MimicPractice })));
// Listening
const ListeningCardPage = React.lazy(() => import('../dynamic/templates/ListeningCardPage').then(module => ({ default: module.ListeningCardPage })));
// Lessons
const KnowledgeLibrary = React.lazy(() => import('../dynamic/templates/LessonLibraryV2').then(module => ({ default: module.LessonLibraryV2 })));

// Native Expressions (formerly NativeSpeak)
const ExpressionPage = React.lazy(() => import('../dynamic/templates/SpeakingCardPage').then(module => ({ default: module.SpeakingCardPage })));
const CalendarPage = React.lazy(() => import('../dynamic/templates/CalendarPage').then(module => ({ default: module.CalendarPage })));
const WordBookPage = React.lazy(() => import('../dynamic/templates/WordBookPage').then(module => ({ default: module.WordBookPage })));


type AppController = ReturnType<typeof useAppController>;

interface AppLayoutProps {
  controller: AppController;
}

const navItems = [
  { id: 'DASHBOARD', view: 'DASHBOARD', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Mobile%20Phone.png", label: 'Dashboard' },
  { id: 'BROWSE', view: 'BROWSE', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Books.png", label: 'Library' },
  { id: 'LESSON', view: 'LESSON', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Notebook.png", label: 'Lesson' },
  { id: 'UNIT_LIBRARY', view: 'UNIT_LIBRARY', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png", label: 'Reading' },
  { id: 'LISTENING', view: 'LISTENING', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Headphone.png", label: 'Listening' },
  { id: 'SPEAKING', view: 'SPEAKING', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png", label: 'Speaking' },
  { id: 'WRITING', view: 'WRITING', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Memo.png", label: 'Writing' }
] as const;

const Sidebar: React.FC<AppLayoutProps & { 
    onNavigate: (view: AppView, action?: () => void) => void;
    onLogoutRequest: () => void;
}> = ({ controller, onNavigate, onLogoutRequest }) => {
  const { 
    currentUser, view, setView, sessionType, isSidebarOpen, setIsSidebarOpen, 
    forceExpandAdd, openAddWordLibrary
  } = controller;

  if (!currentUser) return null;

  return (
    <>
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col p-6`}>
        <div className="mb-6">
           <div className="flex items-center justify-between">
             <div className="flex items-center space-x-3 overflow-hidden">
               <img src={currentUser.avatar} className="w-10 h-10 rounded-2xl bg-neutral-100 shrink-0" />
               <div className="flex-1 overflow-hidden">
                 <div className="text-sm font-bold text-neutral-900 truncate">{currentUser.name}</div>
                 <div className="text-[10px] text-neutral-400 font-bold truncate">{currentUser.role}</div>
               </div>
             </div>
             <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-neutral-400"><X size={24} /></button>
           </div>
           
           <div className="mt-4 flex items-center space-x-2">
             <button onClick={() => onNavigate('SETTINGS')} className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all active:scale-90 border border-neutral-100" title="Settings">
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Gear.png" alt="Settings" className="w-6 h-6 object-contain" />
             </button>
             <button onClick={() => onNavigate('CALENDAR')} className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all active:scale-90 border border-neutral-100" title="Study Calendar">
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Calendar.png" alt="Calendar" className="w-6 h-6 object-contain" />
             </button>
             <button onClick={() => onNavigate('DISCOVER')} className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all active:scale-90 border border-neutral-100" title="Games & Discover">
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Video%20Game.png" alt="Games" className="w-6 h-6 object-contain" />
             </button>
           </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto space-y-1">
          {sessionType && view !== 'REVIEW' && (
            <div className="relative group animate-in fade-in duration-300 mb-1">
              <button onClick={() => { setView('REVIEW'); setIsSidebarOpen(false); }} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm bg-green-500 text-white shadow-lg shadow-green-500/20">
                <div className="flex items-center space-x-3"><BookCopy size={20} /><span>Study Now</span></div>
                <div className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></div>
              </button>
            </div>
          )}
          {/* Fix: Explicitly type 'item' as 'any' to avoid type narrowing errors ('Property icon does not exist on type never') caused by 'as const' tuple mapping. */}
          {navItems.map((item: any) => {
            const isActive = view === item.view && (item.id !== 'BROWSE' || !forceExpandAdd);
            // Handle Speaking active state also for mock test sub-view
            const isSpeakingActive = item.id === 'SPEAKING' && view === 'SPEAKING';
            
            return (
              <div key={item.id} className="relative group">
                <button 
                  onClick={() => onNavigate(item.view as AppView)} 
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${isActive || isSpeakingActive ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-100'}`}
                >
                  <div className="flex items-center space-x-3">
                    {typeof item.icon === 'string' ? (
                        <img 
                          src={item.icon} 
                          className={`w-5 h-5 object-contain transition-all ${isActive || isSpeakingActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`} 
                          alt={item.label} 
                        />
                    ) : (
                        <item.icon size={20} />
                    )}
                    <span>{item.label}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </nav>
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
    lastMasteryScoreUpdateTimestamp,
    // Composition Props
    isWotdComposed,
    randomizeWotd,
    handleComposeWithWord,
    writingContextWord,
    consumeWritingContext
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
          isWotdComposed={isWotdComposed}
          onComposeWotd={handleComposeWithWord}
          onRandomizeWotd={randomizeWotd}
        />
      );
    case 'CALENDAR':
      return <CalendarPage user={currentUser} />;
    case 'WORDBOOK':
      return <WordBookPage user={currentUser} />;
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
          onNavigate={setView}
        />
      );
    case 'LESSON':
        return <KnowledgeLibrary 
            user={currentUser} 
            onStartSession={(words) => startSession(words, 'custom')} 
            onExit={() => setView('DASHBOARD')} 
            onNavigate={setView}
            onUpdateUser={handleUpdateUser} 
        />;
    case 'UNIT_LIBRARY':
        return <ReadingUnitPage user={currentUser} onStartSession={(words) => startSession(words, 'new_study')} onUpdateUser={handleUpdateUser} />;
    case 'SETTINGS':
        return <SettingsView user={currentUser} onUpdateUser={handleUpdateUser} onRefresh={refreshGlobalStats} onNuke={handleLibraryReset} apiUsage={apiUsage} />;
    case 'DISCOVER':
        return <Discover user={currentUser} xpToNextLevel={xpToNextLevel} totalWords={stats.total} onExit={() => setView('DASHBOARD')} onGainXp={gainExperienceAndLevelUp} onRecalculateXp={recalculateXpAndLevelUp} xpGained={xpGained} onStartSession={startSession} onUpdateUser={handleUpdateUser} lastMasteryScoreUpdateTimestamp={lastMasteryScoreUpdateTimestamp} onBulkUpdate={bulkUpdateWords} />;
    case 'SPEAKING':
        return <ExpressionPage user={currentUser} onNavigate={setView} />;
    // Deprecated NATIVE_SPEAK view key handling for safety
    case 'NATIVE_SPEAK':
        return <ExpressionPage user={currentUser} onNavigate={setView} />;
    case 'WRITING':
        return <WritingStudioPage user={currentUser} initialContextWord={writingContextWord} onConsumeContext={consumeWritingContext} />;
    case 'IRREGULAR_VERBS':
        return <IrregularVerbs user={currentUser} onGlobalViewWord={setGlobalViewWord} />;
    case 'MIMIC':
        return <MimicPractice />;
    case 'LISTENING':
        return <ListeningCardPage user={currentUser} />;
    case 'EXPERIMENT':
        // Fallback
        return <ExpressionPage user={currentUser} onNavigate={setView} />;
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
