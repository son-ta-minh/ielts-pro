
import React, { useState } from 'react';
import { Volume2, ChevronRight, Check, X, HelpCircle, Trophy, Sparkles, BookOpen, AlertCircle } from 'lucide-react';
import { VocabularyItem, ReviewGrade } from '../types';
import { updateSRS } from '../utils/srs';
import EditWordModal from './EditWordModal';

interface Props {
  dueWords: VocabularyItem[];
  onUpdate: (word: VocabularyItem) => void;
  onComplete: () => void;
}

const ReviewSession: React.FC<Props> = ({ dueWords, onUpdate, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  
  const currentWord = dueWords[currentIndex];

  if (dueWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6 py-20 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center shadow-inner">
          <Check size={32} />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-neutral-900">All clear!</h2>
          <p className="text-neutral-500 text-sm max-w-xs">You've mastered all current tasks for now.</p>
        </div>
        <button onClick={onComplete} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-semibold text-sm hover:bg-neutral-800 transition-colors">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const speak = (text: string) => {
    try {
      if (!window.speechSynthesis) {
        setSpeechError(true);
        return;
      }
      // Cancel any ongoing speech to avoid interference
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      
      utterance.onerror = (e) => {
        console.error("Speech Synthesis Error:", e);
        setSpeechError(true);
      };

      window.speechSynthesis.speak(utterance);
      setSpeechError(false);
    } catch (e) {
      console.error("Speech Synthesis exception:", e);
      setSpeechError(true);
    }
  };

  const handleReview = (grade: ReviewGrade) => {
    const updated = updateSRS(currentWord, grade);
    onUpdate(updated);

    if (currentIndex < dueWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsEditModalOpen(false);
      setSpeechError(false);
    } else {
      setSessionFinished(true);
    }
  };

  if (sessionFinished) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in-95 duration-500">
        <Trophy size={64} className="text-yellow-500 mb-4 animate-bounce" />
        <h2 className="text-3xl font-black text-neutral-900">Session Complete!</h2>
        <p className="text-neutral-500 mt-1 text-sm">You strengthened {dueWords.length} memories.</p>
        <button onClick={onComplete} className="mt-8 px-10 py-3.5 bg-neutral-900 text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all text-sm">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-[calc(100vh-140px)] flex flex-col space-y-6 animate-in fade-in duration-300">
      {/* Progress Header */}
      <div className="px-2 shrink-0">
        <div className="flex justify-between text-[9px] font-black text-neutral-300 uppercase tracking-widest mb-2">
          <span>Reviewing</span>
          <span>{currentIndex + 1} / {dueWords.length}</span>
        </div>
        <div className="h-1 w-full bg-neutral-100 rounded-full overflow-hidden">
          <div className="h-full bg-neutral-900 transition-all duration-500 ease-out" style={{ width: `${((currentIndex + 1) / dueWords.length) * 100}%` }} />
        </div>
      </div>

      {/* Main Front Card */}
      <div className="flex-1 bg-white rounded-3xl border border-neutral-200 shadow-xl flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none select-none flex flex-wrap gap-6 p-6 rotate-12">
          {[...Array(8)].map((_, i) => <BookOpen key={i} size={48} />)}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center w-full">
          <h3 className="font-bold text-neutral-900 text-4xl md:text-5xl tracking-tight leading-tight mb-8">
            {currentWord.word}
          </h3>

          <div className="flex flex-col space-y-3 w-full max-w-[200px]">
            <button 
              onClick={() => speak(currentWord.word)} 
              className={`mx-auto p-4 rounded-full border transition-all active:scale-90 ${speechError ? 'bg-red-50 text-red-500 border-red-100' : 'bg-neutral-50 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 border-neutral-100'}`}
            >
              <Volume2 size={24} />
            </button>
            
            {speechError && (
              <div className="flex items-center justify-center space-x-1 text-red-500 text-[10px] font-bold uppercase tracking-tighter animate-pulse">
                <AlertCircle size={12} />
                <span>Audio Blocked</span>
              </div>
            )}
            
            <button 
              onClick={() => setIsEditModalOpen(true)}
              className="px-6 py-3.5 bg-neutral-900 text-white rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 active:scale-95 transition-all text-sm group"
            >
              <Sparkles size={16} className="text-yellow-400" />
              <span>Reveal & Edit</span>
              <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Grade Action Bar */}
      <div className="grid grid-cols-3 gap-3 shrink-0 pb-4">
        <button 
          onClick={() => handleReview(ReviewGrade.FORGOT)} 
          className="group flex flex-col items-center space-y-1.5 py-4 bg-white border border-neutral-200 rounded-2xl hover:bg-red-50 hover:border-red-100 transition-all shadow-sm active:scale-95"
        >
          <div className="p-2.5 bg-neutral-50 group-hover:bg-red-100 text-neutral-400 group-hover:text-red-600 rounded-full transition-colors"><X size={16} /></div>
          <span className="text-[9px] font-black uppercase text-neutral-400 group-hover:text-red-600 tracking-widest">Forgot</span>
        </button>

        <button 
          onClick={() => handleReview(ReviewGrade.HARD)} 
          className="group flex flex-col items-center space-y-1.5 py-4 bg-white border border-neutral-200 rounded-2xl hover:bg-orange-50 hover:border-orange-100 transition-all shadow-sm active:scale-95"
        >
          <div className="p-2.5 bg-neutral-50 group-hover:bg-orange-100 text-neutral-400 group-hover:text-orange-600 rounded-full transition-colors"><HelpCircle size={16} /></div>
          <span className="text-[9px] font-black uppercase text-neutral-400 group-hover:text-orange-600 tracking-widest">Hard</span>
        </button>

        <button 
          onClick={() => handleReview(ReviewGrade.EASY)} 
          className="group flex flex-col items-center space-y-1.5 py-4 bg-white border border-neutral-200 rounded-2xl hover:bg-green-50 hover:border-green-100 transition-all shadow-sm active:scale-95"
        >
          <div className="p-2.5 bg-neutral-50 group-hover:bg-green-100 text-neutral-400 group-hover:text-green-600 rounded-full transition-colors"><Check size={16} /></div>
          <span className="text-[9px] font-black uppercase text-neutral-400 group-hover:text-green-600 tracking-widest">Easy</span>
        </button>
      </div>

      {isEditModalOpen && (
        <EditWordModal 
          word={currentWord}
          onSave={(updated) => {
            onUpdate(updated);
          }}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </div>
  );
};

export default ReviewSession;
