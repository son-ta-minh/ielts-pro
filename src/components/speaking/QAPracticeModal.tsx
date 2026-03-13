import React, { useEffect, useState, useRef } from 'react';
import { X, Mic, Square, Play, Eye, EyeOff, Shuffle, ChevronRight } from 'lucide-react';
import { speak } from '../../utils/audio';
import SoundAnalyzer from '../../components/common/SoundAnalyzer';

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
  const [inputLevel, setInputLevel] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [transcript, setTranscript] = useState<string>("");
  const [wpm, setWpm] = useState<number | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / waveform.length;
      const mid = canvas.height / 2;

      ctx.fillStyle = "#9ca3af";

      waveform.forEach((v, i) => {
        const h = v * canvas.height * 0.9;
        ctx.fillRect(
          i * barWidth,
          mid - h / 2,
          barWidth * 0.9,
          h
        );
      });

      if (audioRef.current) {
        const audio = audioRef.current;
        const progress =
          audio.currentTime / (audio.duration || 1);

        const x = progress * canvas.width;

        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current)
        cancelAnimationFrame(animationRef.current);
    };
  }, [waveform]);

  useEffect(() => {
    if (isOpen) {
      // keep original order when opening
      setQaList([...data]);
      setIndex(0);
      setShowAnswer(false);
      setShowQuestion(false);
      setPairIndex(0);
      setAudioURL(null);
      setIsRecording(false);
      setWaveform([]);
      setTranscript("");
      setWpm(null);
      setAudioDuration(null);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isOpen, data]);

  useEffect(() => {
    if (isRecording) return;
    if (!audioDuration || !transcript) return;

    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    const minutes = audioDuration / 60;

    if (minutes > 0) {
      const calculatedWpm = Math.round(words / minutes);
      setWpm(calculatedWpm);
    }
  }, [audioDuration, transcript, isRecording]);

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
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setQaList(shuffled);
    setIndex(0);
    setShowAnswer(false);
    setShowQuestion(false);
    setPairIndex(0);
    setAudioURL(null);
    setWaveform([]);
    setTranscript("");
    setWpm(null);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
      setWaveform([]);
      setTranscript("");
      setWpm(null);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      return;
    }

    // otherwise go to next card
    setIndex((prev) => (prev + 1) % qaList.length);
    setPairIndex(0);
    setShowAnswer(false);
    setShowQuestion(false);
    setAudioURL(null);
    setWaveform([]);
    setTranscript("");
    setWpm(null);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const startRecording = async () => {
    if (isRecording) return;
    setAudioURL(null);
    setWaveform([]);
    setTranscript("");
    setWpm(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (event: any) => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript + " ";
        }
        setTranscript(text.trim());
      };

      recognition.start();
      recognitionRef.current = recognition;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    // create audio context for waveform / level detection
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const drawWaveform = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationRef.current = requestAnimationFrame(drawWaveform);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationRef.current = requestAnimationFrame(drawWaveform);
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#10b981";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(drawWaveform);
    };

    drawWaveform();

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

      generateWaveform(blob);

      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      setInputLevel(0);
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    // small delay so user has time before speaking
    setTimeout(() => {
      recorder.start();
      setIsRecording(true);
    }, 300);
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;

    setIsRecording(false);

    // stop speech recognition immediately (Chrome keeps mic if only abort is used)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}

      try {
        recognitionRef.current.abort();
      } catch (e) {}

      recognitionRef.current = null;
    }

    // stop waveform animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // stop audio context used for mic visualization
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    // force stop microphone tracks
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();

      tracks.forEach((track, i) => {
        try {
          track.enabled = false;
          track.stop();
        } catch (e) {
        }
      });

      streamRef.current = null;
    }

    // then stop recorder (finalize blob)
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {}
    }
  };

  const generateWaveform = async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const raw = audioBuffer.getChannelData(0);
    const samples = 120; // number of bars
    const blockSize = Math.floor(raw.length / samples);
    const peaks: number[] = [];

    for (let i = 0; i < samples; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(raw[start + j] || 0);
      }
      peaks.push(sum / blockSize);
    }

    // normalize peaks so waveform uses full vertical space
    const max = Math.max(...peaks) || 1;
    const normalized = peaks.map(p => p / max);

    setWaveform(normalized);
  };

  if (!isOpen || qaList.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">

      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh]">
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
                  <audio
                    ref={audioRef}
                    controls
                    src={audioURL}
                    onLoadedMetadata={() => {
                      if (!audioRef.current) return;

                      const audio = audioRef.current;

                      const tryReadDuration = () => {
                        const d = audio.duration;
                        if (!Number.isNaN(d) && d > 0 && d !== Infinity) {
                          setAudioDuration(d);
                        }
                      };

                      // sometimes duration is NaN on first read (common with webm)
                      tryReadDuration();

                      // try again shortly after metadata load
                      setTimeout(tryReadDuration, 100);
                      setTimeout(tryReadDuration, 300);
                    }}
                  />

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

            {transcript && (
              <div className="text-xs text-neutral-600 bg-neutral-100 rounded-lg p-3">
                <div className="font-bold mb-1 text-neutral-500 uppercase tracking-wider text-[10px]">
                  Speech to text
                </div>
                <div>{transcript}</div>
              </div>
            )}
            {!audioURL && (
              <div className="w-full h-24 bg-neutral-900/90 rounded-xl overflow-hidden flex items-center">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={90}
                  className="w-full h-full"
                />
              </div>
            )}

            {audioURL && (
              <div className="pt-2">
                <SoundAnalyzer
                  audioUrl={audioURL}
                  audioRef={audioRef}
                  wpm={wpm ?? undefined}
                />
              </div>
            )}

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