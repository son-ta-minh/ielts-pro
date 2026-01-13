/**
 * Professional Hybrid Audio Utility
 * - Manages both System (Web Speech API) and AI (Gemini TTS) voices.
 * - Prioritizes finding and using high-quality native voices like Siri.
 * - Recording using MediaRecorder.
 */

import { generateSpeech } from '../services/geminiService';
import { getConfig } from '../app/settingsManager';

let voices: SpeechSynthesisVoice[] = [];
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

// --- Native Voice Management ---

function initializeVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return resolve([]);
    }

    const getAndResolve = () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices && allVoices.length > 0) {
        voices = allVoices.filter(v => v.lang.startsWith('en'));
        resolve(voices);
      }
    };

    getAndResolve(); // Initial attempt

    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = getAndResolve;
      // Fallback timeout for browsers that might not fire the event reliably
      setTimeout(() => getAndResolve(), 1000);
    }
  });

  return voicesPromise;
}

export const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return initializeVoices();
};

export const getBestVoice = (): SpeechSynthesisVoice | null => {
  if (voices.length === 0) return null;

  const priorityKeywords = ['siri', 'daniel', 'alex', 'com.apple', 'enhanced', 'premium', 'natural', 'google', 'samantha'];
  const usVoices = voices.filter(v => v.lang.includes('en-US'));
  const gbVoices = voices.filter(v => v.lang.includes('en-GB'));
  const targetPool = usVoices.length > 0 ? usVoices : (gbVoices.length > 0 ? gbVoices : voices);

  for (const keyword of priorityKeywords) {
    const found = targetPool.find(v => v.name.toLowerCase().includes(keyword));
    if (found) return found;
  }
  
  return targetPool[0] || null;
};

export const unlockAudio = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis && !window.speechSynthesis.speaking) {
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    initializeVoices(); // Proactively load voices on first interaction
  }
};


// --- AI Voice Management ---
const aiAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
let currentAiSource: AudioBufferSourceNode | null = null;

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / 1; // Assuming mono
  const buffer = aiAudioContext.createBuffer(1, frameCount, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

async function playAiSpeech(text: string) {
  if (currentAiSource) {
    try { currentAiSource.stop(); } catch (e) {}
  }

  try {
    const base64Audio = await generateSpeech(text);
    if (!base64Audio) return;
    
    const audioBuffer = await decodeAudioData(decode(base64Audio));
    const source = aiAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(aiAudioContext.destination);
    source.start();
    currentAiSource = source;
  } catch (error) {
    console.error("Failed to play AI speech:", error);
  }
}

// --- Universal `speak` Function ---
export const speak = async (text: string, preferredVoiceNameOverride?: string, accent?: 'US' | 'GB') => {
  if (typeof window === 'undefined') return;

  const audioConfig = getConfig().audio;
  const preferredVoiceName = preferredVoiceNameOverride || audioConfig.preferredSystemVoice;

  if (audioConfig.mode === 'ai') {
    await playAiSpeech(text);
  } else {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    await getAvailableVoices(); // Ensure voices are loaded

    const utterance = new SpeechSynthesisUtterance(text);
    let selectedVoice: SpeechSynthesisVoice | null = null;

    if (accent) {
        const langCode = accent === 'US' ? 'en-US' : 'en-GB';
        const accentVoices = voices.filter(v => v.lang === langCode);
        if (accentVoices.length > 0) {
            const priorityKeywords = ['siri', 'daniel', 'alex', 'com.apple', 'enhanced', 'premium', 'natural', 'google', 'samantha'];
            for (const keyword of priorityKeywords) {
                const found = accentVoices.find(v => v.name.toLowerCase().includes(keyword));
                if (found) {
                    selectedVoice = found;
                    break;
                }
            }
            if (!selectedVoice) selectedVoice = accentVoices[0];
        }
    }

    if (!selectedVoice && preferredVoiceName) {
      selectedVoice = voices.find(v => v.name === preferredVoiceName) || null;
    }
    
    if (!selectedVoice) {
      selectedVoice = getBestVoice();
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  }
};


// --- Recording Logic (Unchanged) ---
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export const startRecording = async (): Promise<void> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  audioChunks = [];
  
  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };
  
  mediaRecorder.start();
};

export const stopRecording = (): Promise<string> => {
  return new Promise((resolve) => {
    if (!mediaRecorder) return resolve("");
    
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1] || '');
      };
      mediaRecorder?.stream.getTracks().forEach(track => track.stop());
    };
    
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  });
};