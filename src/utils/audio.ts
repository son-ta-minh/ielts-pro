
/**
 * Professional Hybrid Audio Utility
 * - Manages System (Web Speech API), Server (macOS Local), and AI (Gemini TTS) voices.
 * - Supports multi-language switching based on content.
 */

import { getConfig, getServerUrl } from '../app/settingsManager';

const MAX_SPEECH_LENGTH = 1500; 

let voices: SpeechSynthesisVoice[] = [];
let currentServerAudio: HTMLAudioElement | null = null;
let isSpeaking = false;
let isAudioPaused = false;
let currentMarkPoints: number[] = [];
let pendingCoachLookupWord: string | null = null;
let isSingleWordPlayback = false;
let playbackSerial = 0;
let speakRequestSerial = 0;
let currentPlaybackRate = 1;

// Cache the successfully connected base URL
let cachedBaseUrl: string | null = null;

// --- Helper: WAV Encoder for combining audio ---
export function bufferToWav(abuffer: AudioBuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0; // scale
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }
}

/**
 * Resets the cached server URL. 
 */
export const resetAudioProtocolCache = () => {
    cachedBaseUrl = null;
};

export const getLastConnectedUrl = () => cachedBaseUrl;

const getBaseUrl = async (urlOverride?: string): Promise<string> => {
    if (urlOverride) {
        cachedBaseUrl = urlOverride.replace(/\/$/, ""); 
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
        return null;
    }
};

const notifyStatus = (status: boolean) => {
    isSpeaking = status;
    window.dispatchEvent(new CustomEvent('audio-status-changed', { detail: { isSpeaking, isAudioPaused, isSingleWordPlayback } }));
};

const normalizeLookupWord = (word: string): string => {
    return String(word || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9'-]/g, '');
};

const extractQualityLookupWordFromUrl = (url: string): string | null => {
    if (!url) return null;
    const decoded = decodeURIComponent(url);
    if (!/quality_sound/i.test(decoded)) return null;

    const clean = decoded.split('?')[0].split('#')[0];
    const fileName = clean.split('/').pop() || '';
    const withoutExt = fileName.replace(/\.[a-z0-9]+$/i, '');
    if (!withoutExt) return null;

    const withoutVariant = withoutExt
        .replace(/_(N|V|ADJ|ADV|PRO|PREP|CONJ|INTJ|X)_(US|UK)$/i, '')
        .replace(/_(US|UK)$/i, '');
    const normalized = normalizeLookupWord(withoutVariant);
    return normalized || null;
};

const isSingleWordText = (text: string): boolean => {
    const cleaned = normalizeLookupWord(text);
    if (!cleaned) return false;
    return !/\s/.test(String(text || '').trim()) && cleaned.length > 0;
};

const triggerCoachLookup = async (word: string): Promise<boolean> => {
    const cleanWord = normalizeLookupWord(word);
    if (!cleanWord) return false;
    const config = getConfig();
    const baseUrl = getServerUrl(config);

    try {
        const cacheRes = await fetch(`${baseUrl}/api/lookup/cambridge/cache?word=${encodeURIComponent(cleanWord)}`, {
            signal: AbortSignal.timeout(6000),
            cache: 'no-store'
        });
        if (cacheRes.ok) {
            const raw = await cacheRes.text();
            const cacheData = raw ? JSON.parse(raw) : null;
            if (cacheData?.exists) {
                window.dispatchEvent(new CustomEvent('coach-cambridge-lookup-request', { detail: { word: cleanWord, data: cacheData } }));
                return true;
            }
        }
    } catch {
        // Continue to simple fallback.
    }

    try {
        // Fallback to Cambridge scrape endpoint to ensure first-time words can still show lookup immediately.
        const simpleRes = await fetch(`${baseUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(cleanWord)}`, {
            signal: AbortSignal.timeout(12000),
            cache: 'no-store'
        });
        if (!simpleRes.ok) return false;
        const raw = await simpleRes.text();
        const simpleData = raw ? JSON.parse(raw) : null;
        if (!simpleData?.exists) {
            // Final fallback: still show IPA even when Cambridge lookup is unavailable.
            try {
                const ipaRes = await fetch(`${baseUrl}/api/convert/ipa?text=${encodeURIComponent(cleanWord)}&mode=2`, {
                    signal: AbortSignal.timeout(6000),
                    cache: 'no-store'
                });
                if (!ipaRes.ok) return false;
                const ipaData = await ipaRes.json().catch(() => null);
                if (!ipaData?.ipa) return false;
                window.dispatchEvent(new CustomEvent('coach-ipa-fallback-request', { detail: { word: cleanWord, ipa: ipaData.ipa } }));
                return true;
            } catch {
                return false;
            }
        }
        window.dispatchEvent(new CustomEvent('coach-cambridge-lookup-request', { detail: { word: cleanWord, data: simpleData } }));
        return true;
    } catch {
        // Silent fail: pronunciation playback should not be interrupted by lookup issues.
        return false;
    }
};

const stopSpeakingInternal = (silentRestart: boolean) => {
    playbackSerial += 1;
    speakRequestSerial += 1;
    if (currentServerAudio) {
        currentServerAudio.pause();
        currentServerAudio.src = "";
        currentServerAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    pendingCoachLookupWord = null;
    isSingleWordPlayback = false;
    isAudioPaused = false;
    currentMarkPoints = [];
    if (!silentRestart) notifyStatus(false);
};

export const stopSpeaking = () => {
    stopSpeakingInternal(false);
};

export const getIsSpeaking = () => isSpeaking;
export const getIsAudioPaused = () => isAudioPaused;
export const getIsSingleWordPlayback = () => isSingleWordPlayback;
export const getMarkPoints = () => currentMarkPoints;
export const getPlaybackRate = () => currentPlaybackRate;

export const setPlaybackRate = (rate: number) => {
    const normalized = Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
    currentPlaybackRate = Math.round(normalized * 100) / 100;
    if (currentServerAudio) {
        currentServerAudio.playbackRate = currentPlaybackRate;
    }
    window.dispatchEvent(new CustomEvent('audio-status-changed', {
        detail: { isSpeaking, isAudioPaused, isSingleWordPlayback, playbackRate: currentPlaybackRate }
    }));
};

export const pauseSpeaking = () => {
    if (!currentServerAudio || currentServerAudio.paused) return;
    currentServerAudio.pause();
    isAudioPaused = true;
    notifyStatus(true);
};

export const resumeSpeaking = async () => {
    if (!currentServerAudio || !currentServerAudio.paused) return;
    try {
        await currentServerAudio.play();
        isAudioPaused = false;
        notifyStatus(true);
    } catch (e) {
        notifyStatus(false);
        throw e;
    }
};

/**
 * Fetches audio blob from the server without playing it.
 * Used for pre-buffering.
 */
export const prefetchSpeech = async (text: string, forcedLang?: 'en' | 'vi'): Promise<Blob | null> => {
    const config = getConfig();
    const serverUrl = getServerUrl(config);
    const lang = forcedLang ? forcedLang : detectLanguage(text);
    const coachType = config.audioCoach.activeCoach;
    const coach = config.audioCoach.coaches[coachType];
    const voiceName = lang === 'vi' ? coach.viVoice : coach.enVoice;
    const accentCode = lang === 'vi' ? coach.viAccent : coach.enAccent;

    try {
        const url = `${serverUrl}/speak`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, language: lang, accent: accentCode, voice: voiceName }),
            signal: AbortSignal.timeout(20000) 
        });
        if (res.ok) {
            return await res.blob();
        }
    } catch (e) {
        console.error("Prefetch failed", e);
    }
    return null;
};

const playBlob = (blob: Blob, meta?: { source?: string; word?: string; isSingleWord?: boolean }): Promise<boolean> => {
    stopSpeakingInternal(true);
    const sessionId = ++playbackSerial;
    isAudioPaused = false;
    pendingCoachLookupWord = ((meta?.source === 'quality' || meta?.source === 'cambridge' || meta?.isSingleWord) && meta?.word) ? meta.word : null;
    isSingleWordPlayback = !!meta?.isSingleWord;
    notifyStatus(true);
    const lookupWord = pendingCoachLookupWord;
    const lookupTask = lookupWord ? triggerCoachLookup(lookupWord) : Promise.resolve(false);
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.playbackRate = currentPlaybackRate;
    currentServerAudio = audio;
    
    return new Promise<boolean>((resolve, reject) => {
        audio.play()
            .then(() => {
                audio.onended = () => {
                    if (sessionId !== playbackSerial || currentServerAudio !== audio) {
                        URL.revokeObjectURL(audioUrl);
                        resolve(true);
                        return;
                    }
                    URL.revokeObjectURL(audioUrl);
                    pendingCoachLookupWord = null;
                    isAudioPaused = false;
                    notifyStatus(false);
                    if (lookupWord) {
                        void lookupTask.then((shown) => {
                            if (!shown) void triggerCoachLookup(lookupWord);
                        });
                    }
                    resolve(true);
                };
            })
            .catch(e => {
                if (sessionId !== playbackSerial || currentServerAudio !== audio) {
                    URL.revokeObjectURL(audioUrl);
                    resolve(false);
                    return;
                }
                URL.revokeObjectURL(audioUrl);
                pendingCoachLookupWord = null;
                isSingleWordPlayback = false;
                isAudioPaused = false;
                notifyStatus(false);
                reject(e);
            });
    });
};

const speakViaServer = async (text: string, language: 'en' | 'vi', accent: string, voice: string, urlOverride?: string) => {
    stopSpeakingInternal(true); 
    const requestId = ++speakRequestSerial;
    const singleWord = isSingleWordText(text);
    isSingleWordPlayback = singleWord;
    isAudioPaused = false;
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
        if (requestId !== speakRequestSerial) return true;

        if (!res.ok) throw new Error(`Server unreachable`);
        const contentType = res.headers.get('Content-Type');
        
        if (contentType && contentType.includes('audio')) {
            const blob = await res.blob();
            if (requestId !== speakRequestSerial) return true;
            const source = res.headers.get('X-TTS-Source') || undefined;
            const word = res.headers.get('X-TTS-Word') || undefined;
            const fallbackWord = singleWord ? normalizeLookupWord(text) : undefined;
            return await playBlob(blob, { source, word: word || fallbackWord, isSingleWord: singleWord });
        } else {
            if (requestId !== speakRequestSerial) return true;
            isSingleWordPlayback = false;
            isAudioPaused = false;
            notifyStatus(false);
            return true;
        }
    } catch (e: any) {
        if (requestId !== speakRequestSerial) return true;
        isAudioPaused = false;
        notifyStatus(false);
        throw e;
    }
};

const speakViaBrowser = (text: string, voiceName?: string, langCode: 'en' | 'vi' = 'en'): Promise<boolean> => {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) return resolve(false);
        
        stopSpeakingInternal(true); 
        const sessionId = ++playbackSerial;
        isAudioPaused = false;
        notifyStatus(true);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode === 'vi' ? 'vi-VN' : 'en-US';
        
        const availableVoices = window.speechSynthesis.getVoices();
        const selectedVoice = (voiceName && availableVoices.find(v => v.name === voiceName)) || 
                              availableVoices.find(v => v.lang.startsWith(langCode));

        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.rate = Math.min(2, Math.max(0.5, 0.95 * currentPlaybackRate));
        
        utterance.onend = () => {
            if (sessionId !== playbackSerial) return resolve(true);
            isAudioPaused = false;
            notifyStatus(false);
            resolve(true);
        };
        utterance.onerror = () => {
            if (sessionId !== playbackSerial) return resolve(false);
            isAudioPaused = false;
            notifyStatus(false);
            resolve(false);
        };
        window.speechSynthesis.speak(utterance);
    });
};

export const detectLanguage = (text: string): 'vi' | 'en' => {
  const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỗùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viRegex.test(text) ? 'vi' : 'en';
};

const cleanTextForTts = (text: string): string => {
    if (!text) return '';
    return text
        .substring(0, MAX_SPEECH_LENGTH)
        .normalize("NFD")
        .replace(/\*+/g, '') 
        .replace(/—/g, ', ') 
        .replace(/[^a-zA-Z0-9.,!?%'\-\s\u00C0-\u1EF9]/g, '')
        .trim();
};

export const speak = async (text: string, isDialogue = false, forcedLang?: 'en' | 'vi', voiceOverride?: string, accentOverride?: string, preloadedBlob?: Blob) => {
  if (typeof window === 'undefined' || !text) return;
  const cleanedText = cleanTextForTts(text);
  if (!cleanedText) return;

  if (preloadedBlob) {
      try {
          await playBlob(preloadedBlob);
          return;
      } catch (e) {
          console.warn("Play preloaded failed, falling back to standard");
      }
  }

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
      await speakViaBrowser(cleanedText, voiceName, lang);
  }
};

export const playSound = async (url: string, startTime?: number, duration?: number, markPoints?: number[]) => {
    stopSpeakingInternal(true);
    const sessionId = ++playbackSerial;
    currentMarkPoints = markPoints || [];
    const qualityLookupWord = extractQualityLookupWordFromUrl(url);
    isSingleWordPlayback = !!qualityLookupWord;
    const lookupTask = qualityLookupWord ? triggerCoachLookup(qualityLookupWord) : Promise.resolve(false);
    
    const baseUrl = await getBaseUrl();
    let fullUrl = url;

    if (!url.startsWith('http')) {
        const cleanPath = url.startsWith('/') ? url.slice(1) : url;
        if (!cleanPath.startsWith('api/')) {
            fullUrl = `${baseUrl}/api/audio/stream/${cleanPath}`;
        } else {
            fullUrl = `${baseUrl}/${cleanPath}`;
        }
    }

    const audio = new Audio(fullUrl);
    audio.playbackRate = currentPlaybackRate;
    currentServerAudio = audio;

    return new Promise<boolean>((resolve, reject) => {
        const startPlay = () => {
            if (startTime !== undefined) {
                audio.currentTime = startTime;
            }
            
            if (duration !== undefined) {
                const stopTime = (startTime || 0) + duration;
                const checkTime = () => {
                    if (audio.currentTime >= stopTime) {
                        if (sessionId !== playbackSerial || currentServerAudio !== audio) {
                            resolve(true);
                            return;
                        }
                        audio.pause();
                        notifyStatus(false);
                        audio.removeEventListener('timeupdate', checkTime);
                        if (qualityLookupWord) {
                            void lookupTask.then((shown) => {
                                if (!shown) void triggerCoachLookup(qualityLookupWord);
                            });
                        }
                        isSingleWordPlayback = false;
                        resolve(true);
                    }
                };
                audio.addEventListener('timeupdate', checkTime);
            }

            notifyStatus(true);
            isAudioPaused = false;
            audio.play()
                .then(() => {
                    audio.onended = () => {
                        if (sessionId !== playbackSerial || currentServerAudio !== audio) {
                            resolve(true);
                            return;
                        }
                        isSingleWordPlayback = false;
                        isAudioPaused = false;
                        notifyStatus(false);
                        if (qualityLookupWord) {
                            void lookupTask.then((shown) => {
                                if (!shown) void triggerCoachLookup(qualityLookupWord);
                            });
                        }
                        resolve(true);
                    };
                })
                .catch(e => {
                    if (sessionId !== playbackSerial || currentServerAudio !== audio) {
                        resolve(false);
                        return;
                    }
                    isSingleWordPlayback = false;
                    isAudioPaused = false;
                    notifyStatus(false);
                    reject(e);
                });
        };

        if (audio.readyState >= 1) {
            startPlay();
        } else {
            audio.onloadedmetadata = startPlay;
        }

        audio.onerror = (e) => {
            if (sessionId !== playbackSerial || currentServerAudio !== audio) {
                resolve(false);
                return;
            }
            isSingleWordPlayback = false;
            isAudioPaused = false;
            notifyStatus(false);
            reject(e);
        };
    });
};

export const startRecording = async (): Promise<void> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  mediaRecorder = new MediaRecorder(stream, options ? { mimeType: options } : undefined);
  audioChunks = [];
  mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
  mediaRecorder.start();
};

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

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

export const seekAudio = (time: number) => {
    if (currentServerAudio) {
        currentServerAudio.currentTime = time;
    }
};

export const getAudioProgress = () => {
    if (currentServerAudio) {
        return {
            currentTime: currentServerAudio.currentTime,
            duration: currentServerAudio.duration || 0
        };
    }
    return null;
};
