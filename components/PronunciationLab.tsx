
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Mic, Volume2, Play, Search, Trash2, Edit3, Loader2, Sparkles, AlertCircle, Calendar, Square, Activity, CheckCircle2 } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getPronunciationFocusWords } from '../services/db';
import { isDue } from '../utils/srs';
import EditWordModal from './EditWordModal';

interface Props {
  userId: string;
  onUpdate: (word: VocabularyItem) => void;
  onDelete: (id: string) => void;
  onStartSession: (words: VocabularyItem[]) => void;
}

const PronunciationLab: React.FC<Props> = ({ userId, onUpdate, onDelete, onStartSession }) => {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordedUrls, setRecordedUrls] = useState<Record<string, string>>({});

  const loadData = async () => {
    setLoading(true);
    // getPronunciationFocusWords now uses a strict filter in the service layer
    const data = await getPronunciationFocusWords(userId);
    const sorted = [...data].sort((a, b) => a.nextReview - b.nextReview);
    setWords(sorted);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Cleanup recorded URLs
    return () => {
      Object.values(recordedUrls).forEach(url => URL.revokeObjectURL(url as string));
    };
  }, [userId]);

  const { dueItems } = useMemo(() => {
    return {
      dueItems: words.filter(w => isDue(w))
    };
  }, [words]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async (wordId: string) => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedUrls(prev => {
          if (prev[wordId]) URL.revokeObjectURL(prev[wordId]);
          return { ...prev, [wordId]: audioUrl };
        });
        setIsRecording(false);
        setRecordingId(null);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingId(wordId);
    } catch (err: any) {
      console.error("Mic Access Error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError("Microphone access denied. Please enable it in your browser settings.");
      } else {
        setMicError("Could not access microphone. Ensure it is connected.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const playRecorded = (wordId: string) => {
    const url = recordedUrls[wordId];
    if (url) {
      const audio = new Audio(url);
      audio.play();
    }
  };

  const handleStartSRSStudy = () => {
    // Session words are strictly from the filtered pronunciation set
    const sessionWords = dueItems.length > 0 ? dueItems : words;
    onStartSession(sessionWords);
  };

  const handleMarkAsFixed = async (item: VocabularyItem) => {
    const updated = {...item, needsPronunciationFocus: false};
    await onUpdate(updated);
    // Refresh to remove it from the list immediately
    loadData();
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
            <Mic size={12} className="mr-1.5" /> Intelligibility Focus
          </div>
          <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Pronunciation Lab</h2>
          <p className="text-neutral-500 mt-2 font-medium">Only words explicitly marked as "Pronunciation" are reviewed here. Record yourself and compare.</p>
        </div>
        
        {words.length > 0 && (
          <div className="flex flex-col items-end space-y-2">
            <button 
              onClick={handleStartSRSStudy}
              className={`px-8 py-4 rounded-[1.5rem] font-black shadow-xl flex items-center space-x-3 transition-all active:scale-95 ${
                dueItems.length > 0 
                ? 'bg-rose-500 text-white shadow-rose-200/50 hover:bg-rose-600' 
                : 'bg-neutral-900 text-white shadow-neutral-200/50 hover:bg-neutral-800'
              }`}
            >
              <Activity size={20} />
              <span>{dueItems.length > 0 ? `Practice ${dueItems.length} Due Words` : 'Practice All Pronunciation'}</span>
            </button>
            {dueItems.length === 0 && <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Memories are fresh!</span>}
          </div>
        )}
      </header>

      {micError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center space-x-3 text-red-700 text-sm font-bold animate-in slide-in-from-top-2">
          <AlertCircle size={20} />
          <span>{micError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-rose-200" size={40} />
            <p className="text-xs font-black text-neutral-300 uppercase tracking-widest">Scanning Lab...</p>
          </div>
        ) : words.length === 0 ? (
          <div className="py-20 bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-[3rem] text-center flex flex-col items-center justify-center text-neutral-400 space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">
              <Mic size={32} strokeWidth={1.5} className="opacity-20 text-rose-500" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-neutral-900">Lab is currently empty.</p>
              <p className="text-sm font-medium max-w-xs mx-auto text-neutral-400">Mark difficult words with the "Pronun." toggle to see them here for specialized training.</p>
            </div>
          </div>
        ) : (
          words.map(item => {
            const due = isDue(item);
            const isThisRecording = recordingId === item.id;
            const hasRecording = !!recordedUrls[item.id];

            return (
              <div key={item.id} className={`bg-white p-6 rounded-[2rem] border transition-all ${due ? 'border-rose-500 shadow-md ring-2 ring-rose-50' : 'border-neutral-100 shadow-sm'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center space-x-6">
                    <button 
                      onClick={() => speak(item.word)}
                      className={`p-4 rounded-2xl transition-all active:scale-90 ${due ? 'bg-rose-500 text-white shadow-lg' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}
                      title="Native Pronunciation"
                    >
                      <Volume2 size={24} />
                    </button>
                    <div>
                      <div className="flex items-center space-x-3">
                        <h4 className="text-xl font-black text-neutral-900">{item.word}</h4>
                        {due && <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black uppercase rounded shadow-sm">Review Due</span>}
                      </div>
                      <div className="flex items-center space-x-3 mt-1">
                        <span className="font-mono text-rose-500 font-bold bg-rose-50/50 px-2 py-0.5 rounded text-sm">{item.ipa}</span>
                        <span className="text-xs text-neutral-400 font-medium">{item.meaningVi}</span>
                        <span className="text-[10px] text-neutral-300 hidden md:block">•</span>
                        <span className="text-[10px] text-neutral-400 font-bold uppercase hidden md:flex items-center">
                          <Calendar size={10} className="mr-1" />
                          Next: {new Date(item.nextReview).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center bg-neutral-50 p-1.5 rounded-2xl border border-neutral-100">
                      {isThisRecording ? (
                        <button 
                          onClick={stopRecording}
                          className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-xs flex items-center space-x-2 animate-pulse"
                        >
                          <Square size={14} fill="white" />
                          <span>STOP</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => startRecording(item.id)}
                          disabled={isRecording}
                          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all ${isRecording ? 'opacity-30' : 'bg-white text-rose-600 hover:bg-rose-50 shadow-sm'}`}
                        >
                          <Mic size={14} />
                          <span>RECORD</span>
                        </button>
                      )}

                      {hasRecording && !isThisRecording && (
                        <button 
                          onClick={() => playRecorded(item.id)}
                          className="ml-1 px-4 py-2 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all shadow-md active:scale-95"
                        >
                          <Play size={14} fill="white" />
                          <span>MY VOICE</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center border-l border-neutral-100 ml-2 pl-2">
                      <button 
                        onClick={() => setEditingWord(item)}
                        className="p-2.5 text-neutral-300 hover:text-neutral-900 hover:bg-neutral-50 rounded-xl transition-colors"
                        title="Edit Details"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button 
                        onClick={() => handleMarkAsFixed(item)}
                        className="p-2.5 text-neutral-300 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors group"
                        title="Mastered Pronunciation"
                      >
                        <CheckCircle2 size={18} className="group-hover:fill-green-100" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingWord && (
        <EditWordModal 
          word={editingWord}
          onSave={(updated) => { onUpdate(updated); loadData(); }}
          onClose={() => setEditingWord(null)}
        />
      )}
    </div>
  );
};

export default PronunciationLab;
