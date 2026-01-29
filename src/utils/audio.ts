
/**
 * Professional Hybrid Audio Utility
 * - Manages System (Web Speech API), Server (macOS Local), and AI (Gemini TTS) voices.
 * - Supports multi-language switching based on content.
 */

import { getConfig } from '../app/settingsManager';

const getBaseUrl = (portOverride?: number) => {
    const port = portOverride || getConfig().audioCoach.serverPort || 3000;
    return `http://localhost:${port}`;
};

let voices: SpeechSynthesisVoice[] = [];
let currentServerAudio: HTMLAudioElement | null = null;
let isSpeaking = false;

// --- Native Voice Management ---

function initializeVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const updateVoices = () => {
    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices && allVoices.length > 0) {
      voices = Array.from(allVoices);
    }
  };

  updateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

initializeVoices();

export const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const current = window.speechSynthesis.getVoices();
    if (current.length > 0) {
      voices = Array.from(current);
      resolve(voices);
    } else {
      const cb = () => {
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0) {
            voices = Array.from(v);
            resolve(voices);
            window.speechSynthesis.onvoiceschanged = null;
        }
      };
      window.speechSynthesis.onvoiceschanged = cb;
      setTimeout(() => {
          const final = window.speechSynthesis.getVoices();
          voices = Array.from(final);
          resolve(voices);
      }, 1000);
    }
  });
};

export interface VoiceDefinition {
    name: string;
    language: 'en' | 'vi';
    accent: string;
}

export type ServerVoice = VoiceDefinition;

export interface ServerVoicesResponse {
    currentVoice: string;
    count: number;
    voices: VoiceDefinition[];
}

export const fetchServerVoices = async (port?: number): Promise<ServerVoicesResponse | null> => {
    const url = `${getBaseUrl(port)}/voices`;
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(2000) 
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e: any) {
        return null;
    }
};

export const selectServerVoice = async (voiceName: string, port?: number): Promise<boolean> => {
    const url = `${getBaseUrl(port)}/select-voice`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                voice: voiceName,
                mode: 'audio'
            })
        });
        const data = await res.json();
        return data.success;
    } catch (e) {
        return false;
    }
};

export const setServerMode = async (mode: string, port?: number): Promise<boolean> => {
    const url = `${getBaseUrl(port)}/set-mode`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.success;
    } catch (e) {
        return false;
    }
};

const notifyStatus = (status: boolean) => {
    isSpeaking = status;
    window.dispatchEvent(new CustomEvent('audio-status-changed', { detail: { isSpeaking } }));
};

export const stopSpeaking = () => {
    if (currentServerAudio) {
        currentServerAudio.pause();
        currentServerAudio = null;
    }
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    notifyStatus(false);
};

export const getIsSpeaking = () => isSpeaking;

const speakViaServer = async (text: string, language: 'en' | 'vi', accent: string, port?: number) => {
    const url = `${getBaseUrl(port)}/speak`;
    const payload = { text, language, accent }; 
    
    stopSpeaking(); 
    notifyStatus(true);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000) 
        });

        if (!res.ok) throw new Error(`Server unreachable`);
        
        const contentType = res.headers.get('Content-Type');
        
        if (contentType && contentType.includes('audio')) {
            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            currentServerAudio = audio;
            
            return new Promise<boolean>((resolve, reject) => {
                audio.play()
                    .then(() => {
                        audio.onended = () => {
                            URL.revokeObjectURL(audioUrl);
                            notifyStatus(false);
                            resolve(true);
                        };
                    })
                    .catch(e => {
                        URL.revokeObjectURL(audioUrl);
                        notifyStatus(false);
                        reject(e);
                    });
            });
        } else {
            notifyStatus(false);
            return true;
        }
    } catch (e: any) {
        notifyStatus(false);
        throw e;
    }
};

const speakViaBrowser = (text: string, voiceName?: string) => {
    if (!window.speechSynthesis) return;
    
    stopSpeaking(); 
    notifyStatus(true);

    const utterance = new SpeechSynthesisUtterance(text);
    
    const availableVoices = window.speechSynthesis.getVoices();
    const selectedVoice = (voiceName && availableVoices.find(v => v.name === voiceName)) || 
                          availableVoices.find(v => v.name.includes("Samantha"));

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }
    utterance.rate = 0.95;
    
    utterance.onend = () => notifyStatus(false);
    utterance.onerror = () => notifyStatus(false);

    window.speechSynthesis.speak(utterance);
};

/**
 * Detects if the text is predominantly Vietnamese.
 */
export const detectLanguage = (text: string): 'vi' | 'en' => {
  const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viRegex.test(text) ? 'vi' : 'en';
};

/**
 * Strips formatting characters, emojis and normalize dashes for natural TTS.
 */
const cleanTextForTts = (text: string): string => {
    return text
        .replace(/\*+/g, '') // Remove Markdown bold/italic
        .replace(/[\{\}\[\]<>]/g, '') // Remove highlight/note/bracket wrappers
        .replace(/—/g, ', ') // Convert em-dash to comma for natural pause
        // Remove emojis and specific symbols
        .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
        .trim();
};

/**
 * Universal speak function.
 * @param text The text to speak
 * @param isDialogue If true, skips browser fallback if server is unreachable
 */
export const speak = async (text: string, isDialogue = false) => {
  if (typeof window === 'undefined' || !text) return;

  const cleanedText = cleanTextForTts(text);
  if (!cleanedText) return;

  const config = getConfig();
  const coachType = config.audioCoach.activeCoach;
  const coach = config.audioCoach.coaches[coachType];
  const lang = detectLanguage(cleanedText);
  
  const voiceName = lang === 'vi' ? coach.viVoice : coach.enVoice;
  const accentCode = lang === 'vi' ? coach.viAccent : coach.enAccent;

  try {
      if (voiceName) {
          await selectServerVoice(voiceName, config.audioCoach.serverPort);
      }
      await speakViaServer(cleanedText, lang, accentCode, config.audioCoach.serverPort);
      return; 
  } catch (e) {
      if (!isDialogue) {
          speakViaBrowser(cleanedText, voiceName);
      }
  }
};

// --- Recording Logic ---
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export const startRecording = async (): Promise<void> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  mediaRecorder = new MediaRecorder(stream, options ? { mimeType: options } : undefined);
  audioChunks = [];
  mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
  mediaRecorder.start();
};

export const stopRecording = (): Promise<{base64: string, mimeType: string} | null> => {
  return new Promise((resolve) => {
    if (!mediaRecorder) return resolve(null);
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64String = result.split(',')[1] || '';
        resolve({ base64: base64String, mimeType });
      };
      mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      mediaRecorder = null;
    };
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    else resolve(null);
  });
};
