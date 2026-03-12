import React, { useEffect, useState } from 'react';
import { X, Mic, Square, Play, Eye, EyeOff, Shuffle, ChevronRight } from 'lucide-react';
import { speak } from '../../utils/audio';

export interface QAItem {
  id: string;
  q: string;
  a: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: QAItem[];
}

export const QAPracticeModal: React.FC<Props> = ({ isOpen, onClose, data }) => {
  const [qaList, setQaList] = useState<QAItem[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [pairIndex, setPairIndex] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  useEffect(() => {
    if (isOpen) {
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      setQaList(shuffled);
      setIndex(0);
      setShowAnswer(false);
      setShowQuestion(false);
      setPairIndex(0);
      setAudioURL(null);
      setIsRecording(false);
    }
  }, [isOpen, data]);

  const current = qaList[index];
  const qaPairs = React.useMemo(() => {
    const raw = current?.a || current?.q || '';
    if (!raw) return [];

    const pairMatches = [...raw.matchAll(/\[Q\]([\s\S]*?)\[\/Q\]\s*\[A\]([\s\S]*?)\[\/A\]/g)];

    return pairMatches.map(m => ({
      q: m[1].trim(),
      a: m[2].trim()
    }));
  }, [current]);

  const speakQuestion = () => {
    const text = qaPairs.length > 0 ? qaPairs[pairIndex]?.q : current?.q;
    if (!text) return;
    speak(text);
  };

  const reshuffle = () => {
    const shuffled = [...qaList].sort(() => Math.random() - 0.5);
    setQaList(shuffled);
    setIndex(0);
    setShowAnswer(false);
    setShowQuestion(false);
    setPairIndex(0);
    setAudioURL(null);
  };

  const next = () => {
    if (isRecording) {
      stopRecording();
    }

    // if there are multiple Q/A pairs inside the same item, iterate them first
    if (qaPairs.length > 0 && pairIndex < qaPairs.length - 1) {
      setPairIndex((p) => p + 1);
      setShowAnswer(false);
      setShowQuestion(false);
      setAudioURL(null);
      return;
    }

    // otherwise go to next card
    setIndex((prev) => (prev + 1) % qaList.length);
    setPairIndex(0);
    setShowAnswer(false);
    setShowQuestion(false);
    setAudioURL(null);
  };

  const startRecording = async () => {
    if (isRecording) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const mime = recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      setAudioURL(url);

      // stop microphone tracks to release the mic
      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }

    setIsRecording(false);
  };

  if (!isOpen || qaList.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">

      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh]">

        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">Speaking Practice</h3>
            <p className="text-sm text-neutral-500">Answer the question out loud.</p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"
          >
            <X size={20} />
          </button>
        </header>

        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 bg-neutral-50/30">

          {/* Question Card */}
          <div className="p-6 bg-white border border-neutral-200 rounded-3xl shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
              Question {qaPairs.length > 0 ? pairIndex + 1 : index + 1} / {qaPairs.length > 0 ? qaPairs.length : qaList.length}
            </div>

            {showQuestion ? (
              <p className="text-lg font-semibold text-neutral-900 leading-relaxed">
                {qaPairs.length > 0 ? qaPairs[pairIndex]?.q : current.q}
              </p>
            ) : (
              <p className="text-sm text-neutral-400 italic">Question hidden</p>
            )}

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={speakQuestion}
                className="px-3 py-1.5 text-xs font-bold border border-neutral-200 rounded-lg flex items-center gap-1 hover:bg-neutral-100"
              >
                <Play size={12} /> Speak
              </button>
              <button
                onClick={() => setShowQuestion((s) => !s)}
                className="px-3 py-1.5 text-xs font-bold border border-neutral-200 rounded-lg hover:bg-neutral-100"
              >
                {showQuestion ? "Hide Question" : "Reveal Question"}
              </button>
            </div>
          </div>

          {/* Answer */}
          {showAnswer && (
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">
                Sample Answer
              </div>

              <div className="space-y-3 text-sm text-emerald-900">
                {qaPairs.length > 0 ? (
                  <div className="space-y-1">
                    <p>{qaPairs[pairIndex]?.a}</p>
                  </div>
                ) : (
                  <p>No answer provided.</p>
                )}
              </div>
            </div>
          )}

          {/* Recorder */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-3 shadow-sm">

            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Your Answer
            </div>

            <div className="flex items-center gap-3">

              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="px-4 py-2 bg-red-500 text-white rounded-xl flex items-center gap-2 hover:bg-red-600 transition-all"
                >
                  <Mic size={16} /> Record
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-neutral-900 text-white rounded-xl flex items-center gap-2 hover:bg-neutral-800 transition-all"
                >
                  <Square size={16} /> Stop
                </button>
              )}

              {audioURL && (
                <div className="flex items-center gap-3">
                  <audio controls src={audioURL} />

                  <a
                    href={audioURL}
                    download={`speaking-answer-${Date.now()}.webm`}
                    className="px-3 py-1.5 text-xs font-bold border border-neutral-200 rounded-lg hover:bg-neutral-100"
                  >
                    Save
                  </a>
                </div>
              )}

            </div>

          </div>

        </main>

        <footer className="px-8 py-6 border-t border-neutral-100 flex items-center gap-3 shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">

          <button
            onClick={() => setShowAnswer((s) => !s)}
            className="px-4 py-2 border border-neutral-200 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-neutral-100 transition-all"
          >
            {showAnswer ? <EyeOff size={14} /> : <Eye size={14} />}
            {showAnswer ? 'Hide Answer' : 'Show Answer'}
          </button>

          <button
            onClick={reshuffle}
            className="px-4 py-2 border border-neutral-200 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-neutral-100 transition-all"
          >
            <Shuffle size={14} /> Shuffle
          </button>

          <button
            onClick={next}
            className="ml-auto px-5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-neutral-800 transition-all"
          >
            Next <ChevronRight size={14} />
          </button>

        </footer>

      </div>

    </div>
  );
};