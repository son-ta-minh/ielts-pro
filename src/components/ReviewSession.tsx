

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Volume2, Check, X, HelpCircle, Trophy, Sparkles, BookOpen, Ear, Languages, Mic2, Lightbulb, RotateCw, Edit3, ChevronDown, ChevronUp, Network, Mic, Square, Loader2, Star, Target, Zap, Waves, ShieldAlert, Tag, StickyNote, BookCopy, AtSign, PenSquare, CheckCircle2, ChevronRight } from 'lucide-react';
import { VocabularyItem, ReviewGrade, ReviewMode, WordFamily, WordFamilyMember } from '../app/types';
import { updateSRS } from '../utils/srs';
import { speak, startRecording, stopRecording } from '../utils/audio';
import { evaluatePronunciation } from '../services/geminiService';
import { highlightPreposition } from '../utils/text';

interface Props {
  sessionWords: VocabularyItem[];
  sessionFocus?: ReviewMode | null;
  onUpdate: (word: VocabularyItem) => void;
  onComplete: () => void;
}

const ReviewSession: React.FC<Props> = ({ sessionWords: initialWords, sessionFocus, onUpdate, onComplete }) => {
  const sessionWords = useMemo(() => {
    return [...initialWords].sort(() => Math.random() - 0.5);
  }, [initialWords.length]); 

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentMode, setCurrentMode] = useState<ReviewMode>(ReviewMode.STANDARD);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showDetailsPane, setShowDetailsPane] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [sessionFinished, setSessionFinished] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [answerState, setAnswerState] = useState<'correct' | 'incorrect' | 'idle'>('idle');

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [pronunciationResult, setPronunciationResult] = useState<{ 
    overallScore: number, 
    accuracy: number, 
    prosody: number, 
    feedback: string,
    phoneticTips: string[]
  } | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const currentWord = sessionWords[currentIndex];
  const mainPreposition = useMemo(() => currentWord?.prepositions?.[0]?.prep, [currentWord]);

  const isNewWord = useMemo(() => {
    if (!currentWord) return false;
    return !currentWord.lastReview;
  }, [currentWord]);
  
  const isCardClickDisabled = isNewWord || (currentMode === ReviewMode.PREPOSITION && !isNewWord);

  const examples = useMemo(() => {
    if (!currentWord?.example) return [];
    return currentWord.example.split('\n').map(s => s.trim()).filter(s => s);
  }, [currentWord]);
  
  const currentExample = useMemo(() => examples[exampleIndex] || "No example available.", [examples, exampleIndex]);

  const pickMode = (word: VocabularyItem) => {
    // If a focus mode is passed for the session, always use it.
    if (sessionFocus) {
      if (sessionFocus === ReviewMode.PREPOSITION && (!word.prepositions || word.prepositions.length === 0)) {
        return ReviewMode.STANDARD; // Fallback for this specific word
      }
      return sessionFocus;
    }

    if (word.isIrregular && Math.random() < 0.3) return ReviewMode.IRREGULAR;
    if (word.prepositions && word.prepositions.length > 0 && Math.random() < 0.4) return ReviewMode.PREPOSITION;
    
    const modes = [ReviewMode.STANDARD, ReviewMode.SPELLING, ReviewMode.MEANING, ReviewMode.PHONETIC];
    const weights = [0.15, 0.35, 0.35, 0.15]; 
    const random = Math.random();
    let cumulative = 0;
    for (let i = 0; i < modes.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        if (modes[i] === ReviewMode.PHONETIC && !word.ipa) return ReviewMode.MEANING;
        return modes[i];
      }
    }
    return ReviewMode.MEANING;
  };

  useEffect(() => {
    if (sessionWords.length > 0 && !sessionFinished && currentWord) {
      setCurrentMode(pickMode(currentWord));
      setIsFlipped(false);
      setShowDetailsPane(false);
      setUserInput('');
      setPronunciationResult(null);
      setExampleIndex(0);
      setAnswerState('idle');
    }
  }, [currentIndex, sessionWords.length, sessionFinished, sessionFocus]);
  
  useEffect(() => {
    if (sessionFinished) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [sessionFinished, onComplete]);


  const handleToggleDetails = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowDetailsPane(prev => !prev);
  };

  const handleCardClick = () => {
    if (!isFlipped) {
      setIsFlipped(true);
      speak(currentWord.word, localStorage.getItem('ielts_pro_preferred_voice') || undefined);
    }
  };
  
  const handleCheckPrepositionAnswer = () => {
    if (!mainPreposition || !userInput.trim() || isFlipped) return;

    const isCorrect = userInput.trim().toLowerCase() === mainPreposition.toLowerCase();
    
    setAnswerState(isCorrect ? 'correct' : 'incorrect');
    setIsFlipped(true);
  };

  const handleProceedAfterPrepositionCheck = () => {
    if (!mainPreposition || !isFlipped) return;
    
    const isCorrect = userInput.trim().toLowerCase() === mainPreposition.toLowerCase();
    const grade = isCorrect ? ReviewGrade.EASY : ReviewGrade.FORGOT;

    handleReview(grade);
  };

  const handleNextExample = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExampleIndex(prev => (prev + 1) % examples.length);
  };

  const nextItem = () => {
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setSessionFinished(true);
    }
  };

  const handleReview = (grade: ReviewGrade) => {
    const updated = updateSRS(currentWord, grade);
    onUpdate(updated);
    nextItem();
  };
  
  const handleMisSpeak = () => {
    const flaggedWord = { ...currentWord, needsPronunciationFocus: true };
    const updated = updateSRS(flaggedWord, ReviewGrade.HARD);
    onUpdate(updated);
    nextItem();
  };

  const toggleRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecording) {
      setIsRecording(false);
      setIsEvaluating(true);
      try {
        const base64Audio = await stopRecording();
        if (base64Audio) {
          const result = await evaluatePronunciation(currentWord.word, base64Audio);
          setPronunciationResult(result);
        }
      } catch (err) {
        console.error("Pronunciation check failed:", err);
      } finally {
        setIsEvaluating(false);
      }
    } else {
      setPronunciationResult(null);
      setIsRecording(true);
      await startRecording();
    }
  };

  if (initialWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6 py-20 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center shadow-inner">
          <Check size={32} />
        </div>
        <h2 className="text-xl font-bold text-neutral-900">All clear!</h2>
        <button onClick={onComplete} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-semibold text-sm hover:bg-neutral-800 transition-colors">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (sessionFinished) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in-95 duration-500">
        <Trophy size={64} className="text-yellow-500 mb-4 animate-bounce" />
        <h2 className="text-3xl font-black text-neutral-900">Session Complete!</h2>
        <p className="text-neutral-500 mt-2 font-medium">You will be returned to the dashboard shortly.</p>
        <button onClick={onComplete} className="mt-8 px-10 py-3.5 bg-neutral-900 text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all text-sm">
          Return Now
        </button>
      </div>
    );
  }

  const Instr = (() => {
    switch(currentMode) {
      case ReviewMode.IRREGULAR: return { text: "Irregular Drill", icon: RotateCw, color: "text-orange-500" };
      case ReviewMode.PREPOSITION: return { text: "Preposition Drill", icon: AtSign, color: "text-cyan-500" };
      case ReviewMode.SPELLING: return { text: "Listen & Type", icon: Ear, color: "text-blue-500" };
      case ReviewMode.MEANING: return { text: "Recall English Word", icon: Languages, color: "text-green-500" };
      case ReviewMode.PHONETIC: return { text: "Read IPA & Recall", icon: Mic2, color: "text-rose-500" };
      default: return { text: "Standard Review", icon: BookOpen, color: "text-neutral-500" };
    }
  })();

  const renderFrontContent = () => {
    if (!currentWord) return null;
    switch(currentMode) {
      case ReviewMode.MEANING:
        return <h3 className="font-bold text-neutral-900 text-2xl md:text-3xl px-4">{currentWord.meaningVi}</h3>;
      case ReviewMode.PHONETIC:
        return <h3 className="font-mono text-neutral-400 text-2xl md:text-3xl font-medium">{currentWord.ipa || '/?/'}</h3>;
      case ReviewMode.SPELLING:
      case ReviewMode.PREPOSITION:
        const inputBaseStyle = "w-full text-center py-2 bg-white border-b-2 outline-none text-xl font-bold transition-all text-neutral-900";
        const answerColor = answerState === 'correct' ? 'border-green-400' : answerState === 'incorrect' ? 'border-red-400' : 'border-neutral-100 focus:border-neutral-900';
        const placeholderText = currentMode === ReviewMode.PREPOSITION ? "Type preposition..." : "Type to reveal...";
        const sentenceWithBlank = mainPreposition 
          ? currentExample.replace(new RegExp(`\\b${currentWord.word}\\s+${mainPreposition}\\b`, 'i'), `${currentWord.word} ...`)
          : currentExample;

        return (
          <div className="w-full max-w-lg mx-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            {currentMode === ReviewMode.PREPOSITION && (
              <p className="text-lg text-neutral-600 italic font-medium leading-relaxed">"{sentenceWithBlank}"</p>
            )}
            <input 
              ref={inputRef} type="text" value={userInput}
              onChange={(e) => { setUserInput(e.target.value); setAnswerState('idle'); }}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckPrepositionAnswer()}
              placeholder={placeholderText}
              className={`${inputBaseStyle} ${answerColor}`}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const renderFamilySection = (label: string, members: WordFamilyMember[] | undefined, color: string) => {
    if (!members || members.length === 0) return null;
    return (
      <div>
        <h5 className={`text-[9px] font-black uppercase text-${color}-500 tracking-widest`}>{label}</h5>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {members.map((m, i) => (
            <div key={i} className="flex items-baseline space-x-1.5">
              <span className="text-sm font-bold text-neutral-800">{m.word}</span>
              <span className="text-[11px] font-mono text-neutral-400">{m.ipa}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasDetails = currentWord && (currentWord.meaningVi || currentWord.wordFamily || (currentWord.tags && currentWord.tags.length > 0) || currentWord.note);

  const shouldHideWordOnFront = [ReviewMode.SPELLING, ReviewMode.MEANING, ReviewMode.PHONETIC, ReviewMode.PREPOSITION].includes(currentMode);

  return (
    <div className="max-w-xl mx-auto h-[calc(100vh-100px)] flex flex-col animate-in fade-in duration-300">
      <div className="px-6 shrink-0 pb-4">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center space-x-2">
            <Instr.icon size={14} className={Instr.color} />
            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{currentIndex + 1} / {sessionWords.length}</span>
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${Instr.color}`}>{isNewWord ? 'LEARN NEW WORD' : Instr.text}</span>
        </div>
        <div className="h-1 w-full bg-neutral-100 rounded-full overflow-hidden">
          <div className="h-full bg-neutral-900 transition-all duration-700 ease-in-out" style={{ width: `${((currentIndex + 1) / sessionWords.length) * 100}%` }} />
        </div>
      </div>

      <div 
        onClick={isCardClickDisabled ? undefined : handleCardClick}
        className={`flex-1 bg-white rounded-[2.5rem] border transition-all duration-500 flex flex-col relative overflow-hidden group select-none ${
          isFlipped ? 'border-neutral-200 shadow-sm' : 'border-neutral-100 shadow-sm hover:border-neutral-200 active:scale-[0.99]'
        } ${isCardClickDisabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 w-full overflow-y-auto no-scrollbar">
          {!isFlipped ? (
            isNewWord ? (
              <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 text-center">
                <h3 className="font-black text-neutral-900 tracking-tight text-4xl">{currentWord.word}</h3>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 text-center space-y-8">
                <div className="flex flex-col items-center space-y-4">
                  {!shouldHideWordOnFront && (
                    <h3 className="font-black text-neutral-900 tracking-tight text-4xl">{currentWord.word}</h3>
                  )}
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); speak(currentWord.word, localStorage.getItem('ielts_pro_preferred_voice') || undefined); }}
                    className={`p-4 rounded-full transition-all shadow-inner active:scale-90 ${shouldHideWordOnFront ? 'bg-neutral-900 text-white p-6' : 'bg-neutral-50 text-neutral-400'}`}
                  >
                    <Volume2 size={shouldHideWordOnFront ? 32 : 24} />
                  </button>
                </div>
                {renderFrontContent()}
                {currentMode !== ReviewMode.PREPOSITION && (
                  <div className="pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Tap to reveal answer</span>
                  </div>
                )}
              </div>
            )
          ) : showDetailsPane ? (
            <div className="w-full flex flex-col items-start text-left space-y-6 animate-in fade-in duration-300" onClick={(e) => e.stopPropagation()}>
              <div className="w-full flex items-center justify-between text-neutral-400 border-b border-neutral-100 pb-4">
                 <div className="flex items-center space-x-2">
                   <BookCopy size={16} />
                   <h3 className="text-[11px] font-black uppercase tracking-widest">Deep Dive</h3>
                 </div>
                 <button onClick={handleToggleDetails} className="p-2 -mr-2 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 rounded-full transition-colors">
                   <ChevronUp size={18} />
                 </button>
              </div>
              
              <div className="w-full space-y-1.5">
                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Meaning (VI)</h4>
                <p className="text-xl font-bold text-blue-600">{currentWord.meaningVi}</p>
              </div>
              
              {currentWord.wordFamily && (
                <div className="w-full space-y-3">
                  <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Word Family</h4>
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-3">
                    {renderFamilySection("Nouns", currentWord.wordFamily?.nouns, "blue")}
                    {renderFamilySection("Verbs", currentWord.wordFamily?.verbs, "green")}
                    {renderFamilySection("Adjectives", currentWord.wordFamily?.adjs, "orange")}
                    {renderFamilySection("Adverbs", currentWord.wordFamily?.advs, "purple")}
                  </div>
                </div>
              )}

              {currentWord.tags && currentWord.tags.length > 0 && (
                <div className="w-full">
                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2"><Tag size={12} className="inline-block mr-1"/> Tags</h4>
                    <div className="flex flex-wrap gap-2">
                        {currentWord.tags.map((tag, i) => (
                            <span key={i} className="px-2.5 py-1 bg-neutral-100 text-neutral-600 text-[10px] font-black uppercase rounded-md">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
              )}

              {currentWord.note && (
                <div className="w-full">
                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1"><StickyNote size={12} className="inline-block mr-1"/> Note</h4>
                    <p className="text-sm text-neutral-600 bg-neutral-50 p-4 rounded-xl border border-neutral-100 whitespace-pre-wrap">{currentWord.note}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center animate-in fade-in duration-300 space-y-6 text-center">
              <div className="space-y-1">
                <h3 className="font-black text-neutral-900 text-3xl tracking-tight">{currentWord.word}</h3>
                <span className="text-sm font-mono text-neutral-400">{currentWord.ipa}</span>
              </div>

              <div className="w-full p-6 bg-neutral-50 rounded-2xl border border-neutral-100 relative shadow-inner space-y-3">
                <Sparkles size={14} className="absolute -top-2 -left-2 text-yellow-500 fill-yellow-500" />
                <p className="text-base text-neutral-800 leading-relaxed italic font-medium">
                  "{highlightPreposition(currentExample, currentWord.word, mainPreposition)}"
                </p>
                {examples.length > 1 && (
                  <div className="flex items-center justify-end pt-2 border-t border-neutral-100/50" onClick={handleNextExample}>
                    <div className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors">
                      <span className="font-mono text-[10px]">({exampleIndex + 1}/{examples.length})</span>
                      <RotateCw size={12} />
                      <span className="uppercase text-[9px] tracking-wider">Next Example</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Enhanced Pronunciation Evaluator UI (ELSA Style) */}
              <div className="w-full space-y-4 pt-4 border-t border-neutral-100" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col items-center space-y-3">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">AI Pronunciation Coach</div>
                  
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={toggleRecording}
                      disabled={isEvaluating}
                      className={`p-5 rounded-full transition-all shadow-lg active:scale-95 flex items-center justify-center ${
                        isRecording 
                        ? 'bg-rose-500 text-white animate-pulse' 
                        : 'bg-neutral-900 text-white hover:bg-neutral-800'
                      }`}
                    >
                      {isEvaluating ? <Loader2 className="animate-spin" size={24} /> : isRecording ? <Square size={24} /> : <Mic size={24} />}
                    </button>
                    
                    <button 
                      onClick={() => speak(currentWord.word, localStorage.getItem('ielts_pro_preferred_voice') || undefined)}
                      className="p-4 bg-neutral-100 text-neutral-600 rounded-full hover:bg-neutral-200 transition-all"
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>
                </div>

                {pronunciationResult && (
                  <div className="animate-in slide-in-from-bottom-2 p-5 bg-white border border-neutral-200 rounded-3xl shadow-sm space-y-4 text-left">
                    <div className="flex items-center justify-between">
                       <span className="text-xs font-black text-neutral-400 uppercase tracking-widest">Overall Result</span>
                       <span className={`text-sm font-black ${pronunciationResult.overallScore >= 80 ? 'text-green-600' : pronunciationResult.overallScore >= 60 ? 'text-orange-600' : 'text-rose-600'}`}>
                         {pronunciationResult.overallScore}% Accuracy
                       </span>
                    </div>

                    <div className="space-y-3">
                      {/* Metric 1: Accuracy */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-neutral-500">
                          <span className="flex items-center"><Target size={10} className="mr-1" /> Sounds Accuracy</span>
                          <span>{pronunciationResult.accuracy}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${pronunciationResult.accuracy >= 80 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${pronunciationResult.accuracy}%` }} />
                        </div>
                      </div>
                      {/* Metric 2: Prosody */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-neutral-500">
                          <span className="flex items-center"><Zap size={10} className="mr-1" /> Stress & Rhythm</span>
                          <span>{pronunciationResult.prosody}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${pronunciationResult.prosody >= 80 ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${pronunciationResult.prosody}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-neutral-50 rounded-2xl space-y-2 border border-neutral-100">
                      <p className="text-xs text-neutral-700 font-bold leading-tight">{pronunciationResult.feedback}</p>
                      <div className="flex flex-wrap gap-1">
                        {pronunciationResult.phoneticTips.map((tip, idx) => (
                          <span key={idx} className="text-[8px] font-black bg-white text-rose-500 px-2 py-0.5 rounded-md border border-rose-100 uppercase">
                            {tip}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {hasDetails && (
                <div className="w-full pt-6 mt-6 border-t border-neutral-100" onClick={(e) => e.stopPropagation()}>
                  <button onClick={handleToggleDetails} className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors mx-auto">
                    <ChevronDown size={14} />
                    <span className="uppercase text-[9px] tracking-wider">Show More Details</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 pt-6 pb-2 mt-auto">
        {currentMode === ReviewMode.PREPOSITION && !isNewWord ? (
          <div className="max-w-md mx-auto">
            {!isFlipped ? (
              <button 
                onClick={handleCheckPrepositionAnswer}
                disabled={!userInput.trim() || isFlipped}
                className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-black text-sm flex items-center justify-center space-x-2 disabled:opacity-40 shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
              >
                <PenSquare size={18} />
                <span>CHECK ANSWER</span>
              </button>
            ) : (
              <button 
                onClick={handleProceedAfterPrepositionCheck}
                className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-black text-sm flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
              >
                <ChevronRight size={20} />
                <span>NEXT</span>
              </button>
            )}
          </div>
        ) : isNewWord ? (
          <div className="max-w-md mx-auto">
            {!isFlipped ? (
              <button 
                onClick={handleCardClick}
                className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-black text-sm flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
              >
                <Lightbulb size={18} />
                <span>LEARN</span>
              </button>
            ) : (
              <button 
                onClick={() => handleReview(ReviewGrade.EASY)} 
                className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-black text-sm flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
              >
                <CheckCircle2 size={18} />
                <span>LEARNED</span>
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-md mx-auto flex items-center gap-2">
            <button onClick={() => handleReview(ReviewGrade.FORGOT)} className="flex-1 py-4 bg-white border border-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-2xl flex flex-col items-center transition-all">
              <X size={18} />
              <span className="text-[9px] font-black uppercase mt-1">FORGOT</span>
            </button>
            <button onClick={() => handleReview(ReviewGrade.HARD)} className="flex-1 py-4 bg-white border border-neutral-100 text-neutral-500 hover:text-orange-600 hover:bg-orange-50 rounded-2xl flex flex-col items-center transition-all">
              <HelpCircle size={18} />
              <span className="text-[9px] font-black uppercase mt-1">Hard</span>
            </button>
            <button onClick={() => handleReview(ReviewGrade.EASY)} className="flex-1 py-4 bg-white border border-neutral-100 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-2xl flex flex-col items-center transition-all">
              <Check size={18} />
              <span className="text-[9px] font-black uppercase mt-1">Easy</span>
            </button>
            <button onClick={handleMisSpeak} className="flex-1 py-4 bg-white border border-neutral-100 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-2xl flex flex-col items-center transition-all">
              <ShieldAlert size={18} />
              <span className="text-[9px] font-black uppercase mt-1">MisSpeak</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewSession;