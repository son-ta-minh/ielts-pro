
import React, { useState, useEffect } from 'react';
import { Sparkles, Send, RefreshCcw, Loader2, ArrowRightLeft, BookOpen, MessageCircle, AlertCircle, CheckCircle2, WifiOff } from 'lucide-react';
import { ParaphraseMode } from '../types';
import { generateParaphraseTask, evaluateParaphrase } from '../services/geminiService';

const ParaphrasePractice: React.FC = () => {
  const [mode, setMode] = useState<ParaphraseMode>(ParaphraseMode.SPEAK_TO_WRITE);
  const [task, setTask] = useState<{ sentence: string; meaningVi: string } | null>(null);
  const [userDraft, setUserDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<{ score: number; feedback: string; modelAnswer: string } | null>(null);

  const loadNewTask = async (currentMode: ParaphraseMode) => {
    setIsGenerating(true);
    setError(null);
    setEvaluation(null);
    setUserDraft('');
    try {
      const newTask = await generateParaphraseTask(currentMode);
      if (!newTask || !newTask.sentence) {
        throw new Error("Could not fetch a valid sentence.");
      }
      setTask(newTask);
    } catch (e) {
      console.error(e);
      setError("Không thể tải câu hỏi. Vui lòng kiểm tra kết nối mạng hoặc thử lại.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    loadNewTask(mode);
  }, []);

  const handleModeChange = (newMode: ParaphraseMode) => {
    setMode(newMode);
    loadNewTask(newMode);
  };

  const handleEvaluate = async () => {
    if (!userDraft.trim() || !task) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const result = await evaluateParaphrase(task.sentence, userDraft, mode);
      setEvaluation(result);
    } catch (e) {
      console.error(e);
      setError("Lỗi khi chấm điểm. Vui lòng thử lại sau giây lát.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const getModeInfo = () => {
    switch(mode) {
      case ParaphraseMode.SPEAK_TO_WRITE: return { title: "Speaking → Writing", desc: "Make casual speech academic." };
      case ParaphraseMode.WRITE_TO_SPEAK: return { title: "Writing → Speaking", desc: "Make formal text sound natural." };
      case ParaphraseMode.VARIETY: return { title: "Structural Variety", desc: "Avoid repetition using new structures." };
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-neutral-900">Paraphrase Lab</h2>
          <p className="text-neutral-500 mt-2">Master the art of rewording for higher IELTS scores.</p>
        </div>
        <div className="flex bg-white border border-neutral-200 p-1 rounded-xl shadow-sm self-stretch sm:self-auto overflow-x-auto">
          <button 
            onClick={() => handleModeChange(ParaphraseMode.SPEAK_TO_WRITE)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === ParaphraseMode.SPEAK_TO_WRITE ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-900'}`}
          >
            S→W
          </button>
          <button 
            onClick={() => handleModeChange(ParaphraseMode.WRITE_TO_SPEAK)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === ParaphraseMode.WRITE_TO_SPEAK ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-900'}`}
          >
            W→S
          </button>
          <button 
            onClick={() => handleModeChange(ParaphraseMode.VARIETY)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === ParaphraseMode.VARIETY ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-900'}`}
          >
            Variety
          </button>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-3 text-red-700 text-sm font-medium">
            <WifiOff size={18} />
            <span>{error}</span>
          </div>
          <button onClick={() => loadNewTask(mode)} className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors">
            Thử lại
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Side */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
                <BookOpen size={14} className="mr-2" /> Original Sentence
              </span>
              <button 
                onClick={() => loadNewTask(mode)}
                disabled={isGenerating}
                className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors disabled:opacity-50"
              >
                <RefreshCcw size={16} className={isGenerating ? 'animate-spin' : ''} />
              </button>
            </div>
            
            {isGenerating ? (
              <div className="h-24 flex flex-col items-center justify-center space-y-2">
                <Loader2 className="animate-spin text-neutral-300" size={32} />
                <span className="text-xs text-neutral-400 font-medium">Đang lấy câu hỏi từ AI...</span>
              </div>
            ) : task ? (
              <div className="space-y-4">
                <p className="text-xl font-medium text-neutral-900 leading-relaxed italic">"{task.sentence}"</p>
                <p className="text-sm text-neutral-400 font-medium">{task.meaningVi}</p>
                <div className="inline-flex items-center px-3 py-1 bg-neutral-100 text-neutral-500 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                  Target: {getModeInfo().title}
                </div>
              </div>
            ) : (
              <div className="h-24 flex flex-col items-center justify-center text-neutral-300 space-y-2">
                <RefreshCcw size={24} />
                <span className="text-xs">Bấm Refresh để tải câu hỏi</span>
              </div>
            )}
          </div>

          <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
            <span className="flex items-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
              <MessageCircle size={14} className="mr-2" /> Your Paraphrase
            </span>
            <textarea 
              value={userDraft}
              onChange={(e) => setUserDraft(e.target.value)}
              disabled={isEvaluating || isGenerating || !task}
              placeholder="Rewrite the sentence here..."
              className="w-full h-32 p-4 bg-white border border-neutral-200 rounded-2xl text-neutral-900 placeholder:text-neutral-300 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none disabled:bg-neutral-50"
            />
            <button 
              onClick={handleEvaluate}
              disabled={!userDraft.trim() || isEvaluating || isGenerating || !task}
              className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold flex items-center justify-center space-x-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
            >
              {isEvaluating ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              <span>Submit for Evaluation</span>
            </button>
          </div>
        </div>

        {/* Feedback Side */}
        <div className="space-y-6">
          {evaluation ? (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              {/* Score Meter */}
              <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Naturalness Score</span>
                  <div className={`text-3xl font-black ${evaluation.score >= 80 ? 'text-green-600' : evaluation.score >= 60 ? 'text-orange-600' : 'text-red-600'}`}>
                    {evaluation.score}/100
                  </div>
                </div>
                <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${evaluation.score >= 80 ? 'bg-green-500' : evaluation.score >= 60 ? 'bg-orange-500' : 'bg-red-500'}`}
                    style={{ width: `${evaluation.score}%` }}
                  />
                </div>
              </div>

              {/* Feedback Content */}
              <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm space-y-6">
                <div className="space-y-2">
                  <span className="flex items-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    <AlertCircle size={14} className="mr-2" /> AI Feedback
                  </span>
                  <p className="text-neutral-700 text-sm leading-relaxed whitespace-pre-wrap">{evaluation.feedback}</p>
                </div>

                <div className="pt-6 border-t border-neutral-100 space-y-2">
                  <span className="flex items-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
                    <CheckCircle2 size={14} className="mr-2 text-green-500" /> Model Version
                  </span>
                  <p className="text-lg font-bold text-neutral-900 italic">"{evaluation.modelAnswer}"</p>
                </div>
              </div>

              <button 
                onClick={() => loadNewTask(mode)}
                className="w-full py-4 border-2 border-neutral-200 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-50 transition-colors flex items-center justify-center space-x-2"
              >
                <RefreshCcw size={18} />
                <span>Next Exercise</span>
              </button>
            </div>
          ) : (
            <div className="bg-white/50 border-2 border-dashed border-neutral-200 rounded-[2.5rem] h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 text-neutral-400">
              <ArrowRightLeft size={48} strokeWidth={1.5} className="mb-4 opacity-20" />
              <p className="font-medium">Paraphrase the original sentence and submit to see your naturalness score and AI analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParaphrasePractice;
