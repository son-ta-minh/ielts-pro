import React from 'react';
import { Volume2, Check, X, HelpCircle, Trophy, BookOpen, Lightbulb, RotateCw, ShieldAlert, CheckCircle2, Eye, BrainCircuit, ArrowLeft, ArrowRight, BookCopy, Loader2, MinusCircle, Flag, Zap } from 'lucide-react';
import { VocabularyItem, ReviewGrade, SessionType } from '../../app/types';
import { speak } from '../../utils/audio';
import EditWordModal from '../word_lib/EditWordModal';
import ViewWordModal from '../word_lib/ViewWordModal';
import TestModal from './TestModal';

export interface ReviewSessionUIProps {
  initialWords: VocabularyItem[];
  sessionWords: VocabularyItem[];
  sessionType: SessionType;
  newWordIds: Set<string>;
  progress: { current: number; max: number };
  setProgress: React.Dispatch<React.SetStateAction<{ current: number; max: number }>>;
  sessionOutcomes: Record<string, string>;
  sessionFinished: boolean;
  wordInModal: VocabularyItem | null;
  setWordInModal: (word: VocabularyItem | null) => void;
  editingWordInModal: VocabularyItem | null;
  setEditingWordInModal: (word: VocabularyItem | null) => void;
  isTesting: boolean;
  setIsTesting: (isTesting: boolean) => void;
  currentWord: VocabularyItem;
  isNewWord: boolean;
  onUpdate: (word: VocabularyItem) => void;
  onComplete: () => void;
  nextItem: () => void;
  handleReview: (grade: ReviewGrade) => void;
  handleMisSpeak: () => void;
  handleTestComplete: (grade: ReviewGrade, results?: Record<string, boolean>, stopSession?: boolean) => void;
  handleRetry: () => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => Promise<number>;
}

const renderStatusBadge = (outcome: string | undefined, wasNew: boolean, isQuickFire: boolean) => {
    if (isQuickFire) {
        if (!outcome) return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-neutral-100 text-neutral-400"><MinusCircle size={10} /> No Answer</span>;
        if (outcome === 'GAVE_UP') return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-700"><Flag size={10} /> Gave Up</span>;
        if (outcome === 'PASS' || outcome === ReviewGrade.EASY) return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-green-100 text-green-700"><CheckCircle2 size={10} /> Pass</span>;
        return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-600"><X size={10} /> Fail</span>;
    }
    if (!outcome) return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-neutral-100 text-neutral-400">Skipped</span>;
    if (wasNew && (outcome === ReviewGrade.EASY || outcome === ReviewGrade.LEARNED)) return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-100 text-cyan-700">Learned</span>;
    switch (outcome) {
        case ReviewGrade.FORGOT: return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-600">Forgot</span>;
        case ReviewGrade.HARD: return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-orange-100 text-orange-600">Hard</span>;
        case ReviewGrade.EASY: return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-green-100 text-green-600">Easy</span>;
        default: return null;
    }
};

export const ReviewSessionUI: React.FC<ReviewSessionUIProps> = (props) => {
    const {
        initialWords, sessionWords, sessionType, newWordIds, progress, setProgress,
        sessionOutcomes, sessionFinished, wordInModal, setWordInModal, editingWordInModal, setEditingWordInModal,
        isTesting, setIsTesting, currentWord, isNewWord, onUpdate, onComplete,
        nextItem, handleReview, handleMisSpeak, handleTestComplete, onGainXp, handleRetry
    } = props;

    const { current: currentIndex, max: maxIndexVisited } = progress;
    const isQuickFire = sessionType === 'random_test';

    const handleEditRequest = (word: VocabularyItem) => {
      setWordInModal(null);
      setEditingWordInModal(word);
    };
  
    const handleSaveEdit = (word: VocabularyItem) => {
      onUpdate(word);
      setEditingWordInModal(null);
    };

    if (initialWords.length === 0) {
        return <div className="flex flex-col items-center justify-center space-y-6 py-20 text-center animate-in fade-in duration-500"><div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center shadow-inner"><Check size={32} /></div><h2 className="text-xl font-bold text-neutral-900">All clear!</h2><button onClick={onComplete} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-semibold text-sm hover:bg-neutral-800 transition-colors">Back to Dashboard</button></div>;
    }
    
    if (sessionFinished) {
        if (sessionType === 'new_study' || sessionType === 'custom' || isQuickFire || initialWords.length <= 5) {
          const passCount = Object.values(sessionOutcomes).filter(v => v === 'PASS' || v === ReviewGrade.EASY || v === ReviewGrade.LEARNED).length;
          return (
            <div className="max-w-2xl mx-auto py-10 text-center animate-in zoom-in-95 duration-500">
              <div className="mb-6"><div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isQuickFire ? 'bg-amber-100 text-amber-600' : 'bg-neutral-100 text-neutral-900'}`}>{isQuickFire ? <Zap size={40} fill="currentColor" /> : <BookCopy size={40} />}</div><h2 className="text-3xl font-black text-neutral-900">{isQuickFire ? 'Test Result' : 'Session Recap'}</h2>{isQuickFire && <p className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mt-2">Score: {passCount} / {sessionWords.length}</p>}<p className="text-neutral-500 mt-2 font-medium">You've completed this focused session.</p></div>
              <div className="bg-white p-4 rounded-[2rem] border border-neutral-200 shadow-sm mb-8 overflow-hidden"><div className="max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-2">{sessionWords.map(word => (<div key={word.id} className="flex justify-between items-center bg-neutral-50/70 p-2.5 rounded-xl border border-neutral-100"><span className="font-bold text-neutral-800 text-xs truncate pr-2">{word.word}</span>{renderStatusBadge(sessionOutcomes[word.id], newWordIds.has(word.id), isQuickFire)}</div>))}</div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><button onClick={onComplete} className="px-6 py-4 bg-white border border-neutral-200 text-neutral-500 rounded-2xl font-bold text-xs hover:bg-neutral-50 hover:border-neutral-900 transition-all active:scale-95 uppercase tracking-widest">Finish Session</button><button onClick={handleRetry} className="px-6 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest"><RotateCw size={14} /><span>Retry This Session</span></button></div>
            </div>
          );
        }
        return <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in-95 duration-500"><Trophy size={64} className="text-yellow-500 mb-4 animate-bounce" /><h2 className="text-3xl font-black text-neutral-900">Session Complete!</h2><p className="text-neutral-500 mt-2 font-medium">You have finished this review session.</p><button onClick={onComplete} className="mt-8 px-10 py-3.5 bg-neutral-900 text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all text-sm">Return to Dashboard</button></div>;
    }

    if (!currentWord) return null;
    const HeaderIcon = isNewWord ? Lightbulb : BookOpen;
    const headerColor = isNewWord ? 'text-blue-500' : 'text-neutral-500';
    const displayText = currentWord.ipa || currentWord.word;
    const isIpa = !!currentWord.ipa;

    return (
        <>
            <div className="max-w-xl mx-auto h-[calc(100vh-100px)] flex flex-col animate-in fade-in duration-300">
                <div className="px-6 shrink-0 pb-4"><div className="flex justify-between items-center mb-1"><button onClick={() => setProgress(p => ({ ...p, current: Math.max(0, p.current - 1) }))} disabled={currentIndex === 0} className="p-2 text-neutral-300 hover:text-neutral-900 disabled:opacity-30"><ArrowLeft size={16}/></button><div className="flex items-center space-x-2"><HeaderIcon size={14} className={headerColor} /><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{currentIndex + 1} / {sessionWords.length}</span></div><button onClick={() => setProgress(p => ({ ...p, current: p.current + 1 }))} disabled={currentIndex >= maxIndexVisited} className="p-2 text-neutral-300 hover:text-neutral-900 disabled:opacity-30"><ArrowRight size={16}/></button></div><div className="h-1 w-full bg-neutral-100 rounded-full overflow-hidden"><div className="h-full bg-neutral-900 transition-all duration-300 ease-in-out" style={{ width: `${((currentIndex + 1) / sessionWords.length) * 100}%` }} /></div></div>
                <div className="flex-1 bg-white rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col relative overflow-hidden group select-none">{isQuickFire ? <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 w-full text-center space-y-4"><Loader2 className="animate-spin text-neutral-200" size={32} /><p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Loading Next Test...</p></div> : <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 w-full text-center space-y-8"><div className="flex items-center gap-4"><h2 className={`font-black text-neutral-900 tracking-tight text-4xl ${isIpa ? 'font-serif' : ''}`}>{displayText}</h2><button onClick={(e) => { e.stopPropagation(); speak(currentWord.word); }} className="p-3 text-neutral-400 bg-neutral-50 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors" title="Pronounce"><Volume2 size={22} /></button></div><button onClick={() => setWordInModal(currentWord)} className="flex items-center gap-2 px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] hover:bg-neutral-50 transition-all active:scale-95 uppercase tracking-widest shadow-sm"><Eye size={14}/><span>View Details</span></button></div>}</div>
                <div className="shrink-0 pt-6 pb-2 mt-auto">
                    {isNewWord ? (
                        <div className="max-w-lg mx-auto flex items-stretch gap-3">
                            <button onClick={() => nextItem()} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all">
                                <X size={20} />
                                <span className="text-[9px] font-black uppercase">SKIP</span>
                            </button>
                            <button onClick={handleMisSpeak} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all">
                                <ShieldAlert size={20} />
                                <span className="text-[9px] font-black uppercase">MisSpeak</span>
                            </button>
                            <button onClick={() => setIsTesting(true)} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-amber-600 hover:bg-amber-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all">
                                <BrainCircuit size={20} />
                                <span className="text-[9px] font-black uppercase">Test It!</span>
                            </button>
                            <button onClick={() => handleReview(ReviewGrade.LEARNED)} className="flex-1 py-5 bg-green-500 text-white rounded-2xl flex flex-col items-center justify-center space-y-1.5 shadow-lg shadow-green-500/20 hover:bg-green-600 transition-all active:scale-95">
                                <CheckCircle2 size={20} />
                                <span className="text-[9px] font-black uppercase">LEARNED</span>
                            </button>
                        </div>
                    ) : !isQuickFire && (
                        <div className="max-w-lg mx-auto flex items-stretch gap-4">
                            <div className="flex-1 flex items-center gap-3">
                                <button onClick={() => handleReview(ReviewGrade.FORGOT)} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><X size={20} /><span className="text-[9px] font-black uppercase">FORGOT</span></button>
                                <button onClick={() => handleReview(ReviewGrade.HARD)} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-orange-600 hover:bg-orange-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><HelpCircle size={20} /><span className="text-[9px] font-black uppercase">Hard</span></button>
                                <button onClick={() => handleReview(ReviewGrade.EASY)} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><Check size={20} /><span className="text-[9px] font-black uppercase">Easy</span></button>
                                <button onClick={handleMisSpeak} className="flex-1 py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><ShieldAlert size={20} /><span className="text-[9px] font-black uppercase">MisSpeak</span></button>
                            </div>
                            <div className="flex items-center"><span className="text-sm font-bold text-neutral-300">Or,</span></div>
                            <button onClick={() => setIsTesting(true)} className="px-8 py-5 bg-amber-500 text-white rounded-2xl flex flex-col items-center justify-center space-y-1.5 shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all active:scale-95"><BrainCircuit size={20} /><span className="text-[9px] font-black uppercase">Test It!</span></button>
                        </div>
                    )}
                </div>
            </div>
            {wordInModal && <ViewWordModal word={wordInModal} onUpdate={onUpdate} onClose={() => setWordInModal(null)} onNavigateToWord={setWordInModal} onEditRequest={handleEditRequest} onGainXp={onGainXp} isViewOnly={true} />}
            {editingWordInModal && <EditWordModal word={editingWordInModal} onSave={handleSaveEdit} onClose={() => setEditingWordInModal(null)} onSwitchToView={() => { setEditingWordInModal(null); setWordInModal(editingWordInModal); }} />}
            {isTesting && currentWord && <TestModal word={currentWord} isQuickFire={isQuickFire} sessionPosition={isQuickFire ? { current: currentIndex + 1, total: sessionWords.length } : undefined} onPrevWord={() => setProgress(p => ({ ...p, current: Math.max(0, p.current - 1) }))} onClose={() => { if (isQuickFire) onComplete(); else setIsTesting(false); }} onComplete={handleTestComplete} onGainXp={onGainXp} />}
        </>
    );
};