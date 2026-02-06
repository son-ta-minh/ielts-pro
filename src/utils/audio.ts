
/**
 * Professional Hybrid Audio Utility
 * - Manages System (Web Speech API), Server (macOS Local), and AI (Gemini TTS) voices.
 * - Supports multi-language switching based on content.
 */

import { getConfig, getServerUrl } from '../app/settingsManager';

const MAX_SPEECH_LENGTH = 1500; // Giới hạn an toàn để tránh treo trình duyệt

let voices: SpeechSynthesisVoice[] = [];
let currentServerAudio: HTMLAudioElement | null = null;
let isSpeaking = false;

// Cache the successfully connected base URL
let cachedBaseUrl: string | null = null;

/**
 * Resets the cached server URL. 
 * Call this when the user manually requests a reconnection/refresh.
 */
export const resetAudioProtocolCache = () => {
    cachedBaseUrl = null;
    console.log("[Audio] Connection cache cleared.");
};

export const getLastConnectedUrl = () => cachedBaseUrl;

/**
 * Determines the base URL for the local server.
 * Uses the new unified server config.
 */
const getBaseUrl = async (urlOverride?: string): Promise<string> => {
    if (urlOverride) {
        cachedBaseUrl = urlOverride.replace(/\/$/, ""); // Strip trailing slash
        return cachedBaseUrl;
    }

    if (cachedBaseUrl) return cachedBaseUrl;

    const config = getConfig();
    const serverUrl = getServerUrl(config);
    
    cachedBaseUrl = serverUrl;
    return cachedBaseUrl;
};

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

export const fetchServerVoices = async (urlOverride?: string): Promise<ServerVoicesResponse | null> => {
    try {
        const baseUrl = await getBaseUrl(urlOverride);
        const url = `${baseUrl}/voices`;
        
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(2000) 
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data;
    } catch (e: any) {
        console.warn(`[Audio] Failed to fetch voices from ${urlOverride || 'config'}:`, e.message);
        return null;
    }
};

export const selectServerVoice = async (voiceName: string, urlOverride?: string): Promise<boolean> => {
    try {
        const baseUrl = await getBaseUrl(urlOverride);
        const url = `${baseUrl}/select-voice`;
        
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

export const setServerMode = async (mode: string, urlOverride?: string): Promise<boolean> => {
    // This function was originally intended for mode switching on a specific custom server
    // For the unified server, this might be less relevant, but kept for compatibility.
    return true; 
};

const notifyStatus = (status: boolean) => {
    isSpeaking = status;
    window.dispatchEvent(new CustomEvent('audio-status-changed', { detail: { isSpeaking } }));
};

export const stopSpeaking = () => {
    if (currentServerAudio) {
        currentServerAudio.pause();
        currentServerAudio.src = "";
        currentServerAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    notifyStatus(false);
};

export const getIsSpeaking = () => isSpeaking;

const speakViaServer = async (text: string, language: 'en' | 'vi', accent: string, voice: string, urlOverride?: string) => {
    stopSpeaking(); 
    notifyStatus(true);

    try {
        const baseUrl = await getBaseUrl(urlOverride);
        const url = `${baseUrl}/speak`;
        const payload = { text, language, accent, voice }; 

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

const speakViaBrowser = (text: string, voiceName?: string, langCode: 'en' | 'vi' = 'en') => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    
    stopSpeaking(); 
    notifyStatus(true);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode === 'vi' ? 'vi-VN' : 'en-US';
    
    const availableVoices = window.speechSynthesis.getVoices();
    const selectedVoice = (voiceName && availableVoices.find(v => v.name === voiceName)) || 
                          availableVoices.find(v => v.lang.startsWith(langCode)) ||
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
  const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỗùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viRegex.test(text) ? 'vi' : 'en';
};

/**
 * Strips formatting characters, emojis and all symbols EXCEPT letters, numbers, and basic punctuation.
 */
const cleanTextForTts = (text: string): string => {
    if (!text) return '';
    return text
        .substring(0, MAX_SPEECH_LENGTH)
        .normalize("NFC") // Quan trọng: Đưa các ký tự về dạng chuẩn (composed) trước khi regex
        .replace(/\*+/g, '') // Xóa Markdown bold/italic
        .replace(/—/g, ', ') // Thay gạch ngang dài thành dấu phẩy để ngắt quãng tự nhiên
        // Hỗ trợ dải ký tự Latin mở rộng bao gồm tiếng Việt và các ký tự phổ biến
        .replace(/[^a-zA-Z0-9.,!?%'\-\s\u00C0-\u1EF9]/g, '')
        .trim();
};

/**
 * Universal speak function.
 */
export const speak = async (text: string, isDialogue = false, forcedLang?: 'en' | 'vi', voiceOverride?: string, accentOverride?: string) => {
  if (typeof window === 'undefined' || !text) return;

  const cleanedText = cleanTextForTts(text);
  if (!cleanedText) return;

  const config = getConfig();
  const coachType = config.audioCoach.activeCoach;
  const coach = config.audioCoach.coaches[coachType];
  const serverUrl = getServerUrl(config);
  
  const lang = forcedLang ? forcedLang : detectLanguage(cleanedText);
  const voiceName = voiceOverride !== undefined ? voiceOverride : (lang === 'vi' ? coach.viVoice : coach.enVoice);
  const accentCode = accentOverride !== undefined ? accentOverride : (lang === 'vi' ? coach.viAccent : coach.enAccent);

  try {
      await speakViaServer(cleanedText, lang, accentCode, voiceName, serverUrl);
      return; 
  } catch (e) {
      // LUÔN LUÔN fallback trình duyệt nếu server lỗi để đảm bảo tính năng hoạt động
      speakViaBrowser(cleanedText, voiceName, lang);
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
