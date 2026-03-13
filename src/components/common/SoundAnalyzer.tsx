import React, { useEffect, useRef, useState } from "react";

type AnalysisResult = {
  fluency: number;
  pitchVariation: number;
  energy: number;
  rhythm: number;
  transcript?: string;
  suggestions: string[];
};

type Props = {
  audioUrl: string | null;
  audioRef?: React.RefObject<HTMLAudioElement>;
  wpm?: number;
};

export default function SoundAnalyzer({ audioUrl, audioRef: externalAudioRef, wpm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRef = externalAudioRef ?? internalAudioRef;
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [transcript, setTranscript] = useState<string>("");

  useEffect(() => {
    if (!audioUrl) {
      setWaveform([]);
      setResult(null);
      return;
    }

    analyze(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    if (!result) return;

    setResult((prev) =>
      prev ? { ...prev, transcript } : prev
    );
  }, [transcript, wpm]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const animate = () => {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    const start = () => {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);
    audio.addEventListener("seeked", () => {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
    });

    return () => {
      stop();
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
    };
  }, [audioRef]);

  const analyze = async (url: string) => {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();

    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const raw = audioBuffer.getChannelData(0);

    const samples = 160;
    const blockSize = Math.floor(raw.length / samples);

    const peaks: number[] = [];

    for (let i = 0; i < samples; i++) {
      let peak = 0;
      const start = i * blockSize;

      for (let j = 0; j < blockSize; j++) {
        const value = Math.abs(raw[start + j] || 0);
        if (value > peak) peak = value;
      }

      peaks.push(peak);
    }

    const max = Math.max(...peaks) || 1;
    const normalized = peaks.map((p) => p / max);

    setWaveform(normalized);

    const analysis = analyzeMetrics(normalized, raw, audioBuffer.sampleRate);
    setResult({ ...analysis });
  };

  const analyzeMetrics = (
    waveform: number[],
    raw: Float32Array,
    sampleRate: number
  ): AnalysisResult => {
    const silenceThreshold = 0.02;

    let speechFrames = 0;
    let pauses = 0;
    let pauseLength = 0;
    let totalPause = 0;

    waveform.forEach((v) => {
      if (v > silenceThreshold) {
        speechFrames++;
        if (pauseLength > 0) {
          pauses++;
          totalPause += pauseLength;
          pauseLength = 0;
        }
      } else {
        pauseLength++;
      }
    });

    const speechRatio = speechFrames / waveform.length;
    const avgPause = pauses ? totalPause / pauses : 0;

    let fluency = 5;

    if (speechRatio > 0.8) fluency = 8;
    else if (speechRatio > 0.7) fluency = 7;
    else if (speechRatio > 0.6) fluency = 6;

    if (avgPause > 10) fluency -= 1;

    // Improved energy calculation using RMS and dynamic range
    let sumSq = 0;
    let max = 0;
    let min = 1;

    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > max) max = abs;
      if (abs < min) min = abs;
    }

    const rms = Math.sqrt(sumSq / raw.length);
    const dynamicRange = max - min;

    let energy = 6;

    if (rms > 0.1 && dynamicRange > 0.3) energy = 8;
    else if (rms > 0.06) energy = 7;
    else if (rms < 0.03) energy = 5;

    // (word count moved to parent via Speech-to-Text)

    const pitchValues = estimatePitch(raw, sampleRate);

    let pitchStd = std(pitchValues);
    let pitchVariation = 6;

    if (pitchStd > 40) pitchVariation = 8;
    else if (pitchStd > 25) pitchVariation = 7;
    else if (pitchStd < 10) pitchVariation = 5;

    let rhythm = 6;

    if (pauses <= 2) rhythm = 8;
    else if (pauses <= 4) rhythm = 7;
    else if (pauses > 8) rhythm = 5;

    const suggestions: string[] = [];

    // WPM suggestions (provided by parent component)
    if (typeof wpm === "number") {
      if (wpm < 100) {
        suggestions.push("You are speaking quite slowly. Try increasing your speaking pace.");
      } else if (wpm > 180) {
        suggestions.push("You are speaking very fast. Try slowing down slightly for clarity.");
      }
    }

    if (fluency < 6) {
      suggestions.push("Try reducing long pauses between ideas.");
    }

    if (pitchVariation < 6) {
      suggestions.push("Your voice sounds monotone. Try varying your pitch.");
    }

    if (energy < 6) {
      suggestions.push("Your voice energy is low. Try projecting your voice.");
    }

    if (rhythm < 6) {
      suggestions.push("Your rhythm has many pauses. Try speaking in longer phrases.");
    }

    return {
      fluency,
      pitchVariation,
      energy,
      rhythm,
      suggestions,
    };
  };
  // Experimental browser STT using Web Speech API
  useEffect(() => {
    if (!audioUrl) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onresult = (e: any) => {
      if (e.results?.[0]?.[0]?.transcript) {
        setTranscript(e.results[0][0].transcript);
      }
    };

    try {
      recognition.start();
      setTimeout(() => recognition.stop(), 4000);
    } catch {}
  }, [audioUrl]);

  const estimatePitch = (data: Float32Array, sampleRate: number) => {
    const size = 2048;
    const values: number[] = [];

    for (let i = 0; i < data.length - size; i += size) {
      const slice = data.slice(i, i + size);
      const pitch = autoCorrelate(slice, sampleRate);
      if (pitch > 0) values.push(pitch);
    }

    return values;
  };

  const autoCorrelate = (buffer: Float32Array, sampleRate: number) => {
    let SIZE = buffer.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      let val = buffer[i];
      rms += val * val;
    }

    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0,
      r2 = SIZE - 1,
      thresh = 0.2;

    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thresh) {
        r1 = i;
        break;
      }
    }

    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thresh) {
        r2 = SIZE - i;
        break;
      }
    }

    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length;

    const c = new Array(SIZE).fill(0);

    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] = c[i] + buffer[j] * buffer[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;

    let maxval = -1,
      maxpos = -1;

    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;

    if (T0 === 0) return -1;

    return sampleRate / T0;
  };

  const std = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance =
      arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length;
    return Math.sqrt(variance);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (waveform.length === 0) return;

    const barWidth = canvas.width / (waveform.length * dpr);
    const height = canvas.height / dpr;

    waveform.forEach((v, i) => {
      const h = v * height * 0.9;

      ctx.fillStyle = "#9ca3af";

      // draw waveform from bottom so it fills the canvas
      ctx.fillRect(
        i * barWidth,
        height - h,
        barWidth * 0.9,
        h
      );
    });

    const x = progress * canvas.width / dpr;

    ctx.beginPath();
    ctx.shadowColor = "#3b82f6";
    ctx.shadowBlur = 2;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.moveTo(x, height);
    ctx.lineTo(x, 0);
    ctx.stroke();
  }, [waveform, progress]);

  if (!audioUrl) return null;

  return (
    <div style={{ width: "100%" }}>
      {transcript && (
        <div
          style={{
            marginBottom: 10,
            background: "#f3f4f6",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
            SPEECH TO TEXT
          </div>
          <div>{transcript}</div>
        </div>
      )}
      {!externalAudioRef && (
        <audio ref={audioRef} src={audioUrl ?? undefined} style={{ display: "none" }} />
      )}
      {waveform.length > 0 && (
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "96px",
            background: "#111",
            borderRadius: 8,
          }}
        />
      )}

      {result && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "6px 4px" }}>Metric</th>
                <th style={{ padding: "6px 4px" }}>Score</th>
                <th style={{ padding: "6px 4px" }}>How to improve</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "6px 4px" }}>Fluency</td>
                <td style={{ padding: "6px 4px", fontWeight: 600, color: result.fluency >= 7 ? "#16a34a" : result.fluency >= 6 ? "#d97706" : "#dc2626" }}>
                  {result.fluency.toFixed(1)} {result.fluency >= 7 ? "Good" : result.fluency >= 6 ? "Okay" : "Needs work"}
                </td>
                <td style={{ padding: "6px 4px", color: "#6b7280" }}>
                  Reduce long pauses and speak in full sentences.
                </td>
              </tr>

              <tr>
                <td style={{ padding: "6px 4px" }}>Pitch variation</td>
                <td style={{ padding: "6px 4px", fontWeight: 600, color: result.pitchVariation >= 7 ? "#16a34a" : result.pitchVariation >= 6 ? "#d97706" : "#dc2626" }}>
                  {result.pitchVariation.toFixed(1)} {result.pitchVariation >= 7 ? "Expressive" : result.pitchVariation >= 6 ? "Moderate" : "Monotone"}
                </td>
                <td style={{ padding: "6px 4px", color: "#6b7280" }}>
                  Emphasize key words and vary your tone while speaking.
                </td>
              </tr>

              <tr>
                <td style={{ padding: "6px 4px" }}>Energy</td>
                <td style={{ padding: "6px 4px", fontWeight: 600, color: result.energy >= 7 ? "#16a34a" : result.energy >= 6 ? "#d97706" : "#dc2626" }}>
                  {result.energy.toFixed(1)} {result.energy >= 7 ? "Strong" : result.energy >= 6 ? "Okay" : "Low"}
                </td>
                <td style={{ padding: "6px 4px", color: "#6b7280" }}>
                  Speak slightly louder and project your voice.
                </td>
              </tr>

              <tr>
                <td style={{ padding: "6px 4px" }}>Rhythm</td>
                <td style={{ padding: "6px 4px", fontWeight: 600, color: result.rhythm >= 7 ? "#16a34a" : result.rhythm >= 6 ? "#d97706" : "#dc2626" }}>
                  {result.rhythm.toFixed(1)} {result.rhythm >= 7 ? "Natural" : result.rhythm >= 6 ? "Some pauses" : "Too many pauses"}
                </td>
                <td style={{ padding: "6px 4px", color: "#6b7280" }}>
                  Speak in phrases instead of word‑by‑word.
                </td>
              </tr>

              {typeof wpm === "number" && (() => {
                let label = "Natural";
                if (wpm < 100) label = "Too slow";
                else if (wpm < 130) label = "Slightly slow";
                else if (wpm <= 160) label = "Ideal pace";
                else if (wpm <= 180) label = "Fast";
                else label = "Too fast";

                return (
                  <tr>
                    <td style={{ padding: "6px 4px" }}>Speech speed</td>
                    <td style={{ padding: "6px 4px", fontWeight: 600, color: wpm >= 130 && wpm <= 160 ? "#16a34a" : "#d97706" }}>
                      {wpm} WPM ({label})
                    </td>
                    <td style={{ padding: "6px 4px", color: "#6b7280" }}>
                      Ideal speaking speed for IELTS is about 130‑160 WPM.
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}