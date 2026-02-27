
import React, { Suspense, useState, useEffect } from 'react';
import { 
  Menu, X, BookCopy, Loader2, AlertTriangle, Users
} from 'lucide-react';
import { AppView, VocabularyItem } from './types';
import { useAppController } from './useAppController';
import EditWordModal from '../components/word_lib/EditWordModal';
import ViewWordModal from '../components/word_lib/ViewWordModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { StudyBuddy } from '../components/common/StudyBuddy';
import { ServerRestoreModal } from '../components/common/ServerRestoreModal';
import { SyncPromptModal } from '../components/common/SyncPromptModal';

const Dashboard = React.lazy(() => import('../components/dashboard/Dashboard'));
const ReviewSession = React.lazy(() => import('../components/practice/ReviewSession'));
const WordList = React.lazy(() => import('../components/word_lib/WordList'));
const ReadingUnitPage = React.lazy(() => import('../dynamic/templates/ReadingUnitPage').then(module => ({ default: module.ReadingUnitPage })));
const SettingsView = React.lazy(() => import('../components/setting/SettingsView').then(module => ({ default: module.SettingsView })));
const Discover = React.lazy(() => import('../components/discover/Discover'));
const WritingStudioPage = React.lazy(() => import('../dynamic/templates/WritingStudioPage').then(module => ({ default: module.WritingStudioPage })));
const IrregularVerbs = React.lazy(() => import('../components/labs/irregular_verbs/IrregularVerbs'));
const MimicPractice = React.lazy(() => import('../components/labs/MimicPractice').then(module => ({ default: module.MimicPractice })));
// const ListeningCardPage = React.lazy(() => import('../dynamic/templates/ListeningCardPage').then(module => ({ default: module.ListeningCardPage })));
const KnowledgeLibrary = React.lazy(() => import('../dynamic/templates/LessonLibraryV2').then(module => ({ default: module.LessonLibraryV2 })));
const PlanningPage = React.lazy(() => import('../dynamic/templates/PlanningPage').then(module => ({ default: module.PlanningPage })));
const ExpressionPage = React.lazy(() => import('../dynamic/templates/SpeakingCardPage').then(module => ({ default: module.SpeakingCardPage })));
const WordBookPage = React.lazy(() => import('../dynamic/templates/WordBookPage').then(module => ({ default: module.WordBookPage })));
const CourseList = React.lazy(() => import('../components/courses/CourseList').then(module => ({ default: module.CourseList })));

type AppController = ReturnType<typeof useAppController>;

interface AppLayoutProps {
  controller: AppController;
}

const navItems = [
  { id: 'DASHBOARD', view: 'DASHBOARD', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Mobile%20Phone.png", label: 'Dashboard' },
  { id: 'BROWSE', view: 'BROWSE', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Books.png", label: 'Word Library' },
  { id: 'LESSON', view: 'LESSON', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Notebook.png", label: 'Knowledge Library' },
  { id: 'COURSE', view: 'COURSE', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Graduation%20Cap.png", label: 'Course' },
  { id: 'UNIT_LIBRARY', view: 'UNIT_LIBRARY', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png", label: 'Reading' },
  { id: 'SPEAKING', view: 'SPEAKING', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png", label: 'Speaking - Listening' },
  { id: 'WRITING', view: 'WRITING', icon: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Memo.png", label: 'Writing' }
] as const;

const Sidebar: React.FC<AppLayoutProps & { 
    onNavigate: (view: AppView, action?: () => void) => void;

    onSwitchUser: () => void;
}> = ({ controller, onNavigate, onSwitchUser }) => {
  const { 
    currentUser, view, setView, sessionType, isSidebarOpen, setIsSidebarOpen, 
    forceExpandAdd, serverStatus, handleBackup, hasUnsavedChanges, nextAutoBackupTime,
    triggerServerBackup
  } = controller;

  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!nextAutoBackupTime) { setTimeLeft(0); return; }
    
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = nextAutoBackupTime - now;
      const remaining = Math.ceil(diff / 1000);
      setTimeLeft(Math.max(0, remaining));
      
      // When countdown reaches 0, we simply stop the timer.
      // The DataStore's internal timeout (which set this targetTime) will execute the actual backup.
      // We do NOT call triggerServerBackup() here to avoid double execution.
      if (remaining <= 0) {
          clearInterval(interval);
      }
    }, 1000);

    const initialDiff = nextAutoBackupTime - Date.now();
    setTimeLeft(Math.max(0, Math.ceil(initialDiff / 1000)));
    
    return () => clearInterval(interval);
  }, [nextAutoBackupTime, serverStatus, triggerServerBackup, hasUnsavedChanges]);

  const syncTooltip = nextAutoBackupTime 
    ? `Auto-sync in ${timeLeft}s...` 
    : (hasUnsavedChanges ? "Unsaved Changes - Sync Now" : "Sync to Server");

  if (!currentUser) return null;

  return (
    <>
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col p-6`}>
        <div className="mb-6">
           <div className="flex items-center justify-between gap-2">
             <div className="flex items-center space-x-3 overflow-hidden flex-1">
               <img src={currentUser.avatar} className="w-10 h-10 rounded-2xl bg-neutral-100 shrink-0" />
               <div className="flex-1 overflow-hidden">
                 <div className="text-sm font-bold text-neutral-900 truncate">{currentUser.name}</div>
                 <div className="text-[10px] text-neutral-400 font-bold truncate">{currentUser.role}</div>
               </div>
             </div>
             <div className="flex items-center gap-1">
                 <button onClick={onSwitchUser} className="p-2 rounded-full border-2 border-indigo-100 bg-white text-indigo-500 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm" title="Switch User"><Users size={16} /></button>
                 <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-neutral-400"><X size={24} /></button>
             </div>
           </div>
           <div className="mt-4 flex items-center space-x-2">
             <button onClick={() => onNavigate('SETTINGS')} className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all active:scale-90 border border-neutral-100" title="Settings"><img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Gear.png" alt="Settings" className="w-6 h-6 object-contain" /></button>
             <button onClick={() => onNavigate('PLANNING')} className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all active:scale-90 border border-neutral-100" title="Study Plan"><img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Spiral%20Calendar.png" alt="Planning" className="w-6 h-6 object-contain" /></button>
             <button onClick={() => onNavigate('DISCOVER')} className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all active:scale-90 border border-neutral-100" title="Games & Discover"><img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Video%20Game.png" alt="Games" className="w-6 h-6 object-contain" /></button>
             {serverStatus === 'connected' && (
                 <button 
                    onClick={() => handleBackup()} 
                    className={`p-2 rounded-xl transition-all active:scale-90 border animate-in fade-in relative ${hasUnsavedChanges ? 'bg-orange-50 border-orange-200 shadow-[0_0_10px_rgba(249,115,22,0.4)]' : 'bg-neutral-50 border-neutral-100 hover:bg-neutral-100'}`} 
                    title={syncTooltip}
                >
                    <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Symbols/Up%20Arrow.png" alt="Sync" className="w-6 h-6 object-contain" />
                    {hasUnsavedChanges && (
                         <span className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white -mt-1 -mr-1 ${nextAutoBackupTime ? 'bg-green-400' : 'bg-orange-500 animate-pulse'}`}></span>
                    )}
                 </button>
             )}
           </div>
        </div>
        <nav className="flex-1 overflow-y-auto space-y-1">
          {sessionType && view !== 'REVIEW' && (
            <div className="relative group animate-in fade-in duration-300 mb-1">
              <button onClick={() => onNavigate('REVIEW')} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm bg-green-500 text-white shadow-lg shadow-green-500/20">
                <div className="flex items-center space-x-3"><BookCopy size={20} /><span>Study Now</span></div>
                <div className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></div>
              </button>
            </div>
          )}
          {navItems.map((item: any) => {
            const isActive = view === item.view && (item.id !== 'BROWSE' || !forceExpandAdd);
            const isSpeakingActive = item.id === 'SPEAKING' && view === 'SPEAKING';
            return (
              <div key={item.id} className="relative group">
                <button onClick={() => onNavigate(item.view as AppView)} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-colors ${isActive || isSpeakingActive ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                  <div className="flex items-center space-x-3">
                    {typeof item.icon === 'string' ? <img src={item.icon} className={`w-5 h-5 object-contain transition-all ${isActive || isSpeakingActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`} alt={item.label} /> : <item.icon size={20} />}
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
  const { view, currentUser, stats, xpToNextLevel, wotd, setGlobalViewWord, setView, lastBackupTime, handleBackup, restoreFromServerAction, triggerLocalRestore, triggerLocalBackup, triggerServerBackup, handleNavigateToList, sessionWords, sessionType, sessionFocus, updateWord, bulkUpdateWords, handleSessionComplete, gainExperienceAndLevelUp, recalculateXpAndLevelUp, handleRetrySession, deleteWord, bulkDeleteWords, startSession, initialListFilter, setInitialListFilter, forceExpandAdd, setForceExpandAdd, handleUpdateUser, refreshGlobalStats, handleLibraryReset, apiUsage, xpGained, lastMasteryScoreUpdateTimestamp, isWotdComposed, randomizeWotd, handleComposeWithWord, writingContextWord, consumeWritingContext, serverStatus, serverUrl, planningAction, consumePlanningAction, targetGameMode, consumeTargetGameMode, targetCourseId, consumeTargetCourseId } = controller;
  if (!currentUser) return null;
  switch (view) {
    case 'DASHBOARD': return <Dashboard userId={currentUser.id} user={currentUser} totalCount={stats.total} dueCount={stats.due} newCount={stats.new} xpToNextLevel={xpToNextLevel} wotd={wotd} onViewWord={setGlobalViewWord} setView={setView} lastBackupTime={lastBackupTime} onBackup={handleBackup} onRestore={() => {}} restoreFromServerAction={async () => await restoreFromServerAction()} triggerLocalRestore={triggerLocalRestore} onLocalBackup={triggerLocalBackup} onServerBackup={triggerServerBackup} onNavigateToWordList={handleNavigateToList} isWotdComposed={isWotdComposed} onComposeWotd={handleComposeWithWord} onRandomizeWotd={randomizeWotd} serverStatus={serverStatus} serverUrl={serverUrl} onAction={(action) => { controller.handleSpecialAction(action); }} onStartDueReview={controller.startDueReviewSession} onStartNewLearn={controller.startNewLearnSession} />;
    case 'WORDBOOK': return <WordBookPage user={currentUser} />;
    case 'PLANNING': return <PlanningPage user={currentUser} initialAction={planningAction} onActionConsumed={consumePlanningAction} />;
    case 'REVIEW': return sessionWords && sessionType ? <ReviewSession user={currentUser} sessionWords={sessionWords} sessionType={sessionType} sessionFocus={sessionFocus} onUpdate={updateWord} onBulkUpdate={bulkUpdateWords} onComplete={handleSessionComplete} onRetry={handleRetrySession} /> : null;
    case 'BROWSE': return <WordList user={currentUser} onDelete={async (id) => await deleteWord(id)} onBulkDelete={async (ids) => await bulkDeleteWords(ids)} onUpdate={updateWord} onStartSession={(words) => startSession(words, 'custom')} initialFilter={initialListFilter} onInitialFilterApplied={() => setInitialListFilter(null)} forceExpandAdd={forceExpandAdd} onExpandAddConsumed={() => setForceExpandAdd(false)} onNavigate={setView} />;
    case 'LESSON': return <KnowledgeLibrary user={currentUser} onStartSession={(words) => startSession(words, 'custom')} onExit={() => setView('DASHBOARD')} onNavigate={setView} onUpdateUser={handleUpdateUser} initialLessonId={controller.targetLessonId} onConsumeLessonId={controller.consumeTargetLessonId} initialTag={controller.targetLessonTag} onConsumeTag={controller.consumeTargetLessonTag} initialType={controller.targetLessonType} onConsumeType={controller.consumeTargetLessonType} />;
    case 'COURSE': return <CourseList initialCourseId={targetCourseId} onConsumeInitialCourseId={consumeTargetCourseId} />;
    case 'UNIT_LIBRARY': return <ReadingUnitPage user={currentUser} onStartSession={(words) => startSession(words, 'new_study')} onUpdateUser={handleUpdateUser} />;
    case 'SETTINGS': return <SettingsView user={currentUser} onUpdateUser={handleUpdateUser} onRefresh={refreshGlobalStats} onNuke={handleLibraryReset} apiUsage={apiUsage} />;
    case 'DISCOVER': return <Discover user={currentUser} xpToNextLevel={xpToNextLevel} totalWords={stats.total} onExit={() => setView('DASHBOARD')} onGainXp={gainExperienceAndLevelUp} onRecalculateXp={recalculateXpAndLevelUp} xpGained={xpGained} onStartSession={startSession} onUpdateUser={handleUpdateUser} lastMasteryScoreUpdateTimestamp={lastMasteryScoreUpdateTimestamp} onBulkUpdate={bulkUpdateWords} initialGameMode={targetGameMode} onConsumeGameMode={consumeTargetGameMode} />;
    case 'SPEAKING': return <ExpressionPage user={currentUser} onNavigate={setView} />;
    case 'WRITING': return <WritingStudioPage controller={controller} user={currentUser} initialContextWord={writingContextWord} onConsumeContext={consumeWritingContext} />;
    case 'IRREGULAR_VERBS': return <IrregularVerbs user={currentUser} onGlobalViewWord={setGlobalViewWord} />;
    case 'MIMIC': return <MimicPractice />;
    default: return <div>Unknown view: {view}</div>;
  }
};

export const AppLayout: React.FC<AppLayoutProps> = ({ controller }) => {
  const { view, isSidebarOpen, setIsSidebarOpen, globalViewWord, setGlobalViewWord, updateWord, gainExperienceAndLevelUp, sessionType, clearSessionState, setView, setForceExpandAdd, currentUser, stats, lastBackupTime, isAutoRestoreOpen, setIsAutoRestoreOpen, autoRestoreCandidates, restoreFromServerAction, handleNewUserSetup, handleLocalRestoreSetup, handleSwitchUser, syncPrompt, setSyncPrompt, isSyncing, handleSyncPush, handleSyncRestore, sslIssueUrl, setSslIssueUrl, checkServerConnection } = controller;
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [endSessionModal, setEndSessionModal] = useState<{isOpen: boolean, targetView: AppView | null, andThen?: () => void}>({isOpen: false, targetView: null, andThen: undefined});
  const [writingConfirmModal, setWritingConfirmModal] = useState<{ isOpen: boolean; targetView: AppView | null; action?: () => void }>({
    isOpen: false,
    targetView: null,
    action: undefined
  });
  const handleNavigation = (targetView: AppView, action?: () => void) => {
    // Check unsaved writing changes first
    if (controller.hasWritingUnsavedChanges) {
      setWritingConfirmModal({ isOpen: true, targetView, action });
      return;
    }

    // Existing session guard logic
    if (sessionType && targetView !== 'REVIEW') {
      setEndSessionModal({ isOpen: true, targetView, andThen: action });
    } else {
      if (action) setForceExpandAdd(true);
      else setForceExpandAdd(false);

      setView(targetView);
      setIsSidebarOpen(false);
    }
  };
  const confirmEndSession = () => {
    if (endSessionModal.targetView) { clearSessionState(); setView(endSessionModal.targetView); if (endSessionModal.andThen) endSessionModal.andThen(); else setForceExpandAdd(false); setIsSidebarOpen(false); } 
    else if (endSessionModal.andThen) { clearSessionState(); endSessionModal.andThen(); }
    setEndSessionModal({isOpen: false, targetView: null, andThen: undefined});
  };
  const cancelEndSession = () => setEndSessionModal({isOpen: false, targetView: null, andThen: undefined});
  const handleEditRequest = (word: VocabularyItem) => { setGlobalViewWord(null); setEditingWord(word); };
  const handleSaveEdit = (updated: VocabularyItem) => { updateWord(updated); setEditingWord(null); };
  const [isRestoring, setIsRestoring] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-50 md:flex">
      <Sidebar controller={controller} onNavigate={handleNavigation} onSwitchUser={handleSwitchUser} />
      <div className={`fixed inset-0 bg-black/30 z-40 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />
      <main className={`flex-1 overflow-y-auto relative ${view === 'MIMIC' ? 'p-0' : 'p-6 md:p-10'}`}>
        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden fixed top-4 left-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md z-30"><Menu size={24} /></button>
        <Suspense fallback={<div className="flex justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>}><MainContent controller={controller} /></Suspense>
      </main>
      {currentUser && <StudyBuddy user={currentUser} stats={stats} currentView={view} lastBackupTime={lastBackupTime} onNavigate={controller.handleSpecialAction} onViewWord={setGlobalViewWord} isAnyModalOpen={!!globalViewWord || !!editingWord} />}
      {globalViewWord && <ViewWordModal word={globalViewWord} onClose={() => setGlobalViewWord(null)} onNavigateToWord={setGlobalViewWord} onEditRequest={handleEditRequest} onUpdate={updateWord} onGainXp={gainExperienceAndLevelUp} />}
      {editingWord && <EditWordModal user={controller.currentUser!} word={editingWord} onSave={handleSaveEdit} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setGlobalViewWord(word); }}/>}
      <ConfirmationModal isOpen={endSessionModal.isOpen} title="End Current Session?" message="Navigating away will end your current study session. Are you sure you want to continue?" confirmText="End Session" isProcessing={false} onConfirm={confirmEndSession} onClose={cancelEndSession} icon={<AlertTriangle size={40} className="text-orange-50" />} confirmButtonClass="bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200" />
      <ConfirmationModal
        isOpen={writingConfirmModal.isOpen}
        title="Unsaved Writing Changes"
        message="You have unsaved writing changes. Leave without saving?"
        confirmText="Leave"
        isProcessing={false}
        confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
        onConfirm={() => {
          if (writingConfirmModal.targetView) {
            controller.setHasWritingUnsavedChanges(false);
            if (writingConfirmModal.action) {
              writingConfirmModal.action();
            } else {
              setForceExpandAdd(false);
            }
            setView(writingConfirmModal.targetView);
            setIsSidebarOpen(false);
          }
          setWritingConfirmModal({ isOpen: false, targetView: null, action: undefined });
        }}
        onClose={() => setWritingConfirmModal({ isOpen: false, targetView: null, action: undefined })}
      />
      <ServerRestoreModal isOpen={isAutoRestoreOpen} onClose={() => setIsAutoRestoreOpen(false)} backups={autoRestoreCandidates} onRestore={(id) => { setIsRestoring(true); restoreFromServerAction(id).finally(() => setIsRestoring(false)); }} isRestoring={isRestoring} title="User Selection" description="We found existing profiles on the server. Select yours to restore." onNewUser={handleNewUserSetup} onLocalRestore={handleLocalRestoreSetup} />
      {syncPrompt && <SyncPromptModal isOpen={syncPrompt.isOpen} onClose={() => setSyncPrompt(null)} onPush={handleSyncPush} onRestore={handleSyncRestore} type={syncPrompt.type} localDate={syncPrompt.localDate} serverDate={syncPrompt.serverDate} isProcessing={isSyncing} />}
      {sslIssueUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl p-6 w-[440px] shadow-2xl border border-red-100">
            <h2 className="text-lg font-bold text-red-600 mb-2">
              SSL Certificate Required
            </h2>

            <p className="text-sm text-neutral-600 mb-4">
              Cannot securely connect to:
            </p>

            <div className="text-xs font-mono bg-neutral-100 p-2 rounded mb-4 break-all">
              {sslIssueUrl}
            </div>

            <p className="text-sm text-neutral-600 mb-6">
              Your browser blocked this connection because the SSL certificate
              is not trusted yet.
              <br /><br />
              Please open the link, trust the certificate, then come back and press Retry.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSslIssueUrl(null)}
                className="px-3 py-2 rounded-lg bg-neutral-200 hover:bg-neutral-300 text-sm"
              >
                Cancel
              </button>

              <button
                onClick={() => window.open(sslIssueUrl, '_blank')}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
              >
                Open & Trust
              </button>

              <button
                onClick={async () => {
                  setSslIssueUrl(null);
                  await checkServerConnection(true);
                }}
                className="px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
