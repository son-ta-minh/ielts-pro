
import React, { useState, useEffect, useRef } from 'react';
import { User, AppView, WordQuality, VocabularyItem } from '../../app/types';
import { X, MessageSquare, Languages, Volume2, Mic, Binary, Loader2, Plus, Eye, Search, Wrench, Pause, Play, Square } from 'lucide-react';
import { getConfig, SystemConfig, getServerUrl } from '../../app/settingsManager';
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking, getIsSpeaking, getIsAudioPaused, getIsSingleWordPlayback, getPlaybackRate, setPlaybackRate, getAudioProgress, seekAudio, getMarkPoints, detectLanguage } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { SimpleMimicModal } from './SimpleMimicModal';
import * as dataStore from '../../app/dataStore';
import { createNewWord, calculateComplexity, calculateMasteryScore } from '../../utils/srs';
import { lookupWordsInGlobalLibrary } from '../../services/backupService';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { ToolsModal } from '../tools/ToolsModal';

const MAX_READ_LENGTH = 1000;
const MAX_MIMIC_LENGTH = 300;

interface Props {
    user: User;
    stats: { due: number; new: number; total: number; };
    currentView: AppView;
    lastBackupTime: number | null;
    onNavigate: (view: string, params?: any) => void;
    onViewWord?: (word: VocabularyItem, tab?: string) => void;
    isAnyModalOpen?: boolean;
}

interface Message {
    text?: string;
    action?: string;
    actionLabel?: string;
    actionUrl?: string;
    cambridge?: {
        word?: string;
        pronunciations?: CambridgePronunciation[];
    };
    icon?: React.ReactNode;
}

interface CambridgePronunciation {
    partOfSpeech?: string | null;
    ipaUs?: string | null;
    ipaUk?: string | null;
    audioUs?: string | null;
    audioUk?: string | null;
}

interface CambridgeSimpleResult {
    exists: boolean;
    url?: string;
    word?: string;
    pronunciations?: CambridgePronunciation[];
}

const normalizeCambridgePronunciations = (items?: CambridgePronunciation[]): CambridgePronunciation[] => {
    if (!Array.isArray(items) || items.length === 0) return [];
    const byPos = new Map<string, CambridgePronunciation>();
    const order: string[] = [];

    const canonicalPos = (value?: string | null): string => {
        const lower = String(value || '').toLowerCase();
        if (/\bnoun\b/.test(lower)) return 'NOUN';
        if (/\bverb\b/.test(lower)) return 'VERB';
        if (/\badjective\b/.test(lower)) return 'ADJECTIVE';
        if (/\badverb\b/.test(lower)) return 'ADVERB';
        if (/\bpronoun\b/.test(lower)) return 'PRONOUN';
        if (/\bpreposition\b/.test(lower)) return 'PREPOSITION';
        if (/\bconjunction\b/.test(lower)) return 'CONJUNCTION';
        if (/\binterjection\b/.test(lower)) return 'INTERJECTION';
        const compact = String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
        return compact || 'N/A';
    };

    for (const item of items) {
        const pos = canonicalPos(item.partOfSpeech);
        if (!byPos.has(pos)) {
            byPos.set(pos, {
                headword: (item as any).headword || null,
                partOfSpeech: pos,
                ipaUs: null,
                ipaUk: null,
                audioUs: null,
                audioUk: null
            } as any);
            order.push(pos);
        }
        const merged: any = byPos.get(pos)!;
        if (!merged.headword && (item as any).headword) merged.headword = (item as any).headword;
        if (!merged.ipaUs && item.ipaUs) merged.ipaUs = item.ipaUs;
        if (!merged.ipaUk && item.ipaUk) merged.ipaUk = item.ipaUk;
        if (!merged.audioUs && item.audioUs) merged.audioUs = item.audioUs;
        if (!merged.audioUk && item.audioUk) merged.audioUk = item.audioUk;
    }

    return order
        .map((pos) => byPos.get(pos)!)
        .filter((p) => p.ipaUs || p.ipaUk || p.audioUs || p.audioUk);
};

const AVATAR_DEFINITIONS = {
    woman_teacher: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Woman%20Teacher.png', bg: 'bg-indigo-50' },
    man_teacher: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Man%20Teacher.png', bg: 'bg-blue-50' },
    fox: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png', bg: 'bg-orange-100' },
    koala: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png', bg: 'bg-teal-100' },
    pet: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png', bg: 'bg-pink-100' },
    owl: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png', bg: 'bg-yellow-100' },
    panda: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png', bg: 'bg-emerald-100' },
    unicorn: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png', bg: 'bg-purple-100' },
};

export const StudyBuddy: React.FC<Props> = ({ user, onViewWord, isAnyModalOpen }) => {
    const { showToast } = useToast();
    const [config, setConfig] = useState<SystemConfig>(getConfig());
    const [isAudioPlaying, setIsAudioPlaying] = useState(getIsSpeaking());
    const [isAudioPaused, setIsAudioPaused] = useState(getIsAudioPaused());
    const [isSingleWordAudio, setIsSingleWordAudio] = useState(getIsSingleWordPlayback());
    const [showPlaybackControls, setShowPlaybackControls] = useState(false);
    const [playbackRate, setPlaybackRateState] = useState(getPlaybackRate());
    const [audioProgress, setAudioProgress] = useState({ currentTime: 0, duration: 0 });
    const [markPoints, setMarkPoints] = useState<number[]>([]);
    const [markedTime, setMarkedTime] = useState<number>(0);
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number, placement: 'top' | 'bottom' } | null>(null);
    
    const [isAlreadyInLibrary, setIsAlreadyInLibrary] = useState(false);
    const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);
    
    // Tools Modal State
    const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

    const commandBoxRef = useRef<HTMLDivElement>(null);
    const messageBoxRef = useRef<HTMLDivElement>(null);
    const closeMenuTimeoutRef = useRef<number | null>(null);
    const audioStatusSettleTimeoutRef = useRef<number | null>(null);
    const playbackControlsHideTimeoutRef = useRef<number | null>(null);
    const isCoachHoveredRef = useRef(false);
    const selectedTextRef = useRef<string>('');
    const selectedRangeRef = useRef<Range | null>(null);
    const cambridgeAudioRef = useRef<HTMLAudioElement | null>(null);
    const isOpenRef = useRef(false);
    const messageRef = useRef<Message | null>(null);
    const lastCoachLookupRef = useRef<{ word: string; at: number }>({ word: '', at: 0 });
    
    const activeType = config.audioCoach.activeCoach;
    const coach = config.audioCoach.coaches[activeType];
    const avatarInfo = getAvatarProps(coach.avatar);

    function getAvatarProps(avatarStr: string) {
        if (avatarStr.startsWith('http') || avatarStr.startsWith('data:')) {
            return { url: avatarStr, bg: 'bg-white border-2 border-neutral-100' };
        }
        return (AVATAR_DEFINITIONS as any)[avatarStr] || AVATAR_DEFINITIONS.woman_teacher;
    }


    const checkLibraryExistence = async (word: string) => {
        if (!word || !user.id) return;
        const exists = await dataStore.findWordByText(user.id, word);
        setIsAlreadyInLibrary(!!exists);
    };

    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        const shouldShow = isAudioPlaying && !isSingleWordAudio;
        if (shouldShow) {
            if (playbackControlsHideTimeoutRef.current) {
                window.clearTimeout(playbackControlsHideTimeoutRef.current);
                playbackControlsHideTimeoutRef.current = null;
            }
            setShowPlaybackControls(true);
            return;
        }

        if (playbackControlsHideTimeoutRef.current) {
            window.clearTimeout(playbackControlsHideTimeoutRef.current);
        }
        playbackControlsHideTimeoutRef.current = window.setTimeout(() => {
            setShowPlaybackControls(false);
            playbackControlsHideTimeoutRef.current = null;
        }, 260);
    }, [isAudioPlaying, isSingleWordAudio]);

    useEffect(() => {
        messageRef.current = message;
    }, [message]);

    useEffect(() => {
        const handleConfigUpdate = () => setConfig(getConfig());
        const handleAudioStatus = (event: Event) => {
            const detail = (event as CustomEvent<{ isSpeaking?: boolean; isAudioPaused?: boolean; isSingleWordPlayback?: boolean; playbackRate?: number }>).detail;
            const nextSpeaking = typeof detail?.isSpeaking === 'boolean' ? detail.isSpeaking : getIsSpeaking();
            const nextPaused = typeof detail?.isAudioPaused === 'boolean' ? detail.isAudioPaused : getIsAudioPaused();
            const nextSingle = typeof detail?.isSingleWordPlayback === 'boolean' ? detail.isSingleWordPlayback : getIsSingleWordPlayback();
            const nextRate = typeof detail?.playbackRate === 'number' ? detail.playbackRate : getPlaybackRate();
            setPlaybackRateState(nextRate);

            if (nextSpeaking) {
                if (audioStatusSettleTimeoutRef.current) {
                    window.clearTimeout(audioStatusSettleTimeoutRef.current);
                    audioStatusSettleTimeoutRef.current = null;
                }
                setIsAudioPlaying(true);
                setIsAudioPaused(nextPaused);
                setIsSingleWordAudio(nextSingle);
                return;
            }

            // Avoid UI flicker when clips switch rapidly: wait briefly before confirming "stopped".
            if (audioStatusSettleTimeoutRef.current) {
                window.clearTimeout(audioStatusSettleTimeoutRef.current);
            }
            audioStatusSettleTimeoutRef.current = window.setTimeout(() => {
                setIsAudioPlaying(getIsSpeaking());
                setIsAudioPaused(getIsAudioPaused());
                setIsSingleWordAudio(getIsSingleWordPlayback());
                audioStatusSettleTimeoutRef.current = null;
            }, 180);
        };
        const handleCoachLookupRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ word?: string; data?: CambridgeSimpleResult }>;
            const requestedWord = customEvent.detail?.word?.trim();
            const payload = customEvent.detail?.data;
            if (!requestedWord || !payload?.exists) return;
            const normalizedWord = requestedWord.toLowerCase();

            const currentMessageWord = messageRef.current?.cambridge?.word?.trim().toLowerCase();
            if (isOpenRef.current && currentMessageWord === normalizedWord) {
                if (closeMenuTimeoutRef.current) {
                    window.clearTimeout(closeMenuTimeoutRef.current);
                    closeMenuTimeoutRef.current = null;
                }
                const now = Date.now();
                lastCoachLookupRef.current = { word: normalizedWord, at: now };
                return;
            }

            const now = Date.now();
            const recent = lastCoachLookupRef.current;
            if (recent.word === normalizedWord && now - recent.at < 500) return;

            selectedTextRef.current = normalizedWord;
            // setCambridgePreview({ query: normalizedWord, data: payload });
            // setIsCambridgeValid(true);
            setIsThinking(false);
            setMenuPos(null);
            setMessage({
                actionLabel: "Go to Cambridge",
                actionUrl: payload.url,
                cambridge: {
                    word: payload.word || normalizedWord,
                    pronunciations: normalizeCambridgePronunciations(payload.pronunciations)
                },
                icon: <Search size={18} className="text-blue-500" />
            });
            lastCoachLookupRef.current = { word: normalizedWord, at: now };
            setIsOpen(true);
        };
        const handleCoachIpaFallbackRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ word?: string; ipa?: string }>;
            const requestedWord = customEvent.detail?.word?.trim();
            const ipa = customEvent.detail?.ipa;
            if (!requestedWord || !ipa) return;
            const normalizedWord = requestedWord.toLowerCase();

            const currentMessageWord = messageRef.current?.cambridge?.word?.trim().toLowerCase();
            if (isOpenRef.current && currentMessageWord === normalizedWord) return;

            selectedTextRef.current = normalizedWord;
            // setIsCambridgeValid(false);
            setIsThinking(false);
            setMenuPos(null);
            setMessage({
                text: `**IPA:** ${ipa}`,
                icon: <Binary size={18} className="text-purple-500" />
            });
            lastCoachLookupRef.current = { word: normalizedWord, at: Date.now() };
            setIsOpen(true);
        };
        window.addEventListener('config-updated', handleConfigUpdate);
        window.addEventListener('audio-status-changed', handleAudioStatus);
        window.addEventListener('coach-cambridge-lookup-request', handleCoachLookupRequest as EventListener);
        window.addEventListener('coach-ipa-fallback-request', handleCoachIpaFallbackRequest as EventListener);
        
        // Initial check
        setIsAudioPlaying(getIsSpeaking());
        setIsAudioPaused(getIsAudioPaused());
        setIsSingleWordAudio(getIsSingleWordPlayback());
        setPlaybackRateState(getPlaybackRate());

        return () => {
            if (audioStatusSettleTimeoutRef.current) {
                window.clearTimeout(audioStatusSettleTimeoutRef.current);
                audioStatusSettleTimeoutRef.current = null;
            }
            if (playbackControlsHideTimeoutRef.current) {
                window.clearTimeout(playbackControlsHideTimeoutRef.current);
                playbackControlsHideTimeoutRef.current = null;
            }
            window.removeEventListener('config-updated', handleConfigUpdate);
            window.removeEventListener('audio-status-changed', handleAudioStatus);
            window.removeEventListener('coach-cambridge-lookup-request', handleCoachLookupRequest as EventListener);
            window.removeEventListener('coach-ipa-fallback-request', handleCoachIpaFallbackRequest as EventListener);
            if (cambridgeAudioRef.current) {
                cambridgeAudioRef.current.pause();
                cambridgeAudioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!config.interface.rightClickCommandEnabled) return;

        const openCoachMenu = (selection: Selection) => {
            if (!selection || selection.rangeCount === 0) return;

            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            const range = selection.getRangeAt(0).cloneRange(); // clone để tránh iOS mất range
            const rect = range.getBoundingClientRect();
            const placement = rect.top > 250 ? 'top' : 'bottom';

            selectedTextRef.current = selectedText;
            selectedRangeRef.current = range; // ⚠ cần ref này ở component

            setMenuPos({
                x: rect.left + rect.width / 2,
                y: placement === 'top' ? rect.top : rect.bottom,
                placement
            });

            setMessage(null);
            setIsOpen(true);

            checkLibraryExistence(selectedText);
        };

        const handleContextMenu = (e: MouseEvent) => {
            const selection = window.getSelection();
            if (!selection || !selection.toString().trim()) return;

            e.preventDefault();
            openCoachMenu(selection);
        };

        const handleSelectionClick = (e: MouseEvent) => {
            if (isOpen) return;

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const selectedText = selection.toString().trim();
            if (!selectedText) return;

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            const x = e.clientX;
            const y = e.clientY;

            const clickedInsideSelection =
                x >= rect.left &&
                x <= rect.right &&
                y >= rect.top &&
                y <= rect.bottom;

            if (!clickedInsideSelection) return;

            openCoachMenu(selection);
        };

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;

            const clickedOutsideCommand =
                !commandBoxRef.current ||
                !commandBoxRef.current.contains(target);

            const clickedOutsideMessage =
                !messageBoxRef.current ||
                !messageBoxRef.current.contains(target);

            if (clickedOutsideCommand && clickedOutsideMessage) {
                setIsOpen(false);
                setMenuPos(null);
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', handleSelectionClick);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('click', handleSelectionClick);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [
        config.interface.rightClickCommandEnabled,
        config.server,
        user.id,
        isOpen
    ]);

    const handleTranslateSelection = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;

        // If already Vietnamese, do not call translation API
        const detectedLang = detectLanguage(selectedText);

        if (detectedLang === 'vi') {
            setMessage({
                text: selectedText,
                icon: <Languages size={18} className="text-blue-500" />
            });
            setIsOpen(true);
            speak(selectedText, false, 'vi', coach.viVoice, coach.viAccent);
            return;
        }

        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null);

        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=en|vi`);
            const data = await res.json();
            if (data?.responseData?.translatedText) {
                const translation = data.responseData.translatedText;
                setMessage({
                    text: translation,
                    icon: <Languages size={18} className="text-blue-500" />
                });
                setIsOpen(true);
                speak(translation, false, 'vi', coach.viVoice, coach.viAccent);
            }
        } catch {
            showToast("Translation error!", "error");
        } finally {
            setIsThinking(false);
        }
    };

    const handleReadAndIpa = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;
        if (selectedText.length > MAX_READ_LENGTH) {
            showToast("Text is too long to read!", "error");
        } else {
            speak(selectedText, false, 'en', coach.enVoice, coach.enAccent);
        }
        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null);
        try {
            const cleaned = selectedText.toLowerCase();
            const isSingleWord = cleaned.split(/\s+/).filter(Boolean).length === 1;

            // Priority 1: Cambridge (if exact single-word entry exists)
            if (isSingleWord) {
                const serverUrl = getServerUrl(config);
                const cambridgeRes = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(cleaned)}`, {
                    cache: 'no-store'
                });
                if (cambridgeRes.ok) {
                    const raw = await cambridgeRes.text();
                    const data: CambridgeSimpleResult | null = raw ? JSON.parse(raw) : null;
                    if (data?.exists) {
                        setMessage({
                            actionLabel: "Go to Cambridge",
                            actionUrl: data.url,
                            cambridge: {
                                word: data.word || cleaned,
                                pronunciations: normalizeCambridgePronunciations(data.pronunciations)
                            },
                            icon: <Search size={18} className="text-blue-500" />
                        });
                        setIsOpen(true);
                        setIsThinking(false);
                        return;
                    }
                }
            }

            // Priority 2: Word Library IPA
            const existing = dataStore.getAllWords().find(w => w.word.toLowerCase() === cleaned);
            if (existing && existing.ipaUs) {
                setMessage({ text: `**IPA:** ${existing.ipaUs}`, icon: <Binary size={18} className="text-emerald-500" /> });
                setIsOpen(true);
                setIsThinking(false);
                return;
            }

            // Priority 3: Server IPA conversion fallback
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(selectedText)}&mode=2`);
            if (res.ok) {
                const data = await res.json();
                setMessage({ text: `**IPA:** ${data.ipa}`, icon: <Binary size={18} className="text-purple-500" /> });
                setIsOpen(true);
            }
        } catch {
            // Silent fail is acceptable here
        } finally {
            setIsThinking(false);
        }
    };

    const handleAddToLibrary = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;        if (!selectedText || isAlreadyInLibrary) return;
        setIsAddingToLibrary(true);
        try {
            let newItem: VocabularyItem;
            let serverItem: VocabularyItem | null = null;
            try {
                const results = await lookupWordsInGlobalLibrary([selectedText]);
                if (results.length > 0) serverItem = results[0];
            } catch {
                // Silent fail is acceptable here
            }

            if (serverItem) {
                newItem = {
                     ...serverItem,
                     id: crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                     userId: user.id,
                     createdAt: Date.now(),
                     updatedAt: Date.now(),
                     quality: WordQuality.REFINED,
                     source: 'refine',
                     nextReview: Date.now(),
                     interval: 0,
                     easeFactor: 2.5,
                     consecutiveCorrect: 0,
                     forgotCount: 0,
                     lastReview: undefined,
                     lastGrade: undefined,
                     lastTestResults: {},
                     groups: [...(serverItem.groups || []), 'coach-added']
                };
                newItem.isPassive = false;
                newItem.complexity = calculateComplexity(newItem);
                newItem.masteryScore = calculateMasteryScore(newItem);
                newItem.gameEligibility = calculateGameEligibility(newItem);
            } else {
                newItem = { 
                    ...createNewWord(selectedText, '', '', '', '', ['coach-added'], false, false, false, false, selectedText.includes(' ')), 
                    userId: user.id, 
                    quality: WordQuality.RAW 
                };
                newItem.isPassive = false;
            }
            await dataStore.saveWord(newItem);
            showToast(`"${selectedText}" added!`, 'success');
            setIsAlreadyInLibrary(true);
            setIsOpen(false);
            setMenuPos(null);
        } catch {
            showToast("Add error!", "error");
        } finally {
            setIsAddingToLibrary(false);
        }
    };

    const handleViewWord = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText || !user.id || !onViewWord || isAnyModalOpen) return;
        const wordObj = await dataStore.findWordByText(user.id, selectedText);
        if (wordObj) {
            setIsOpen(false);
            setMenuPos(null);
            onViewWord(wordObj);
        }
    };

    const handleCambridgeLookup = async () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;
        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null);
        try {
            let data: CambridgeSimpleResult | null = null;
            {
                const serverUrl = getServerUrl(config);
                const res = await fetch(`${serverUrl}/api/lookup/cambridge/simple?word=${encodeURIComponent(selectedText)}`);
                data = await res.json();
                // setCambridgePreview({ query: selectedText, data }); // removed
            }

            if (!data?.exists) {
                showToast("No exact Cambridge entry found.", "info");
                return;
            }
            setMessage({
                actionLabel: "Go to Cambridge",
                actionUrl: data.url,
                cambridge: {
                    word: data.word || selectedText,
                    pronunciations: normalizeCambridgePronunciations(data.pronunciations)
                },
                icon: <Search size={18} className="text-blue-500" />
            });
            setIsOpen(true);
        } catch {
            showToast("Cambridge lookup failed.", "error");
        } finally {
            setIsThinking(false);
        }
    };

    const handleSpeakSelection = () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        setIsOpen(false);
        setMenuPos(null);
        if (selectedText && selectedText.length > MAX_MIMIC_LENGTH) {
            showToast("Selection too long for mimic!", "error");
            setMimicTarget(null); // Still open modal but with no pre-filled text
        } else {
            setMimicTarget(selectedText || ''); // Pass selected text or empty string for manual input
        }
    };
    
    const handleOpenTools = () => {
        setIsOpen(false);
        setMenuPos(null);
        setIsToolsModalOpen(true);
    };

    const handleGoogleExampleSearch = () => {
        const selectedText = selectedTextRef.current || window.getSelection()?.toString().trim();
        if (!selectedText) return;
        const queryText = `Example in English sentence for "${selectedText}"`;
        const query = encodeURIComponent(queryText);
        window.open(`https://www.google.com/search?q=${query}`, '_blank');
        setIsOpen(false);
        setMenuPos(null);
    };

    const playCambridgeAudio = (url?: string) => {
        if (!url) {
            showToast("Audio not available.", "info");
            return;
        }
        try {
            const resolvedUrl = url.startsWith('http')
                ? url
                : `${getServerUrl(config)}${url.startsWith('/') ? '' : '/'}${url}`;
            if (cambridgeAudioRef.current) {
                cambridgeAudioRef.current.pause();
                cambridgeAudioRef.current = null;
            }
            const audio = new Audio(resolvedUrl);
            cambridgeAudioRef.current = audio;
            audio.onerror = () => showToast("Failed to play Cambridge audio.", "error");
            audio.onended = () => {
                if (cambridgeAudioRef.current === audio) cambridgeAudioRef.current = null;
            };
            audio.play().catch(() => showToast("Failed to play Cambridge audio.", "error"));
        } catch {
            showToast("Failed to play Cambridge audio.", "error");
        }
    };

    const openCoachMenu = () => {
        isCoachHoveredRef.current = true;
        if (closeMenuTimeoutRef.current) {
            window.clearTimeout(closeMenuTimeoutRef.current);
            closeMenuTimeoutRef.current = null;
        }
        setIsOpen(true);
    };

    const scheduleCloseCoachMenu = () => {
        isCoachHoveredRef.current = false;
        if (closeMenuTimeoutRef.current) {
            window.clearTimeout(closeMenuTimeoutRef.current);
        }
        closeMenuTimeoutRef.current = window.setTimeout(() => {
            setIsOpen(false);
            closeMenuTimeoutRef.current = null;
        }, messageRef.current?.cambridge ? 3000 : 300);
    };

    useEffect(() => {
        if (!isOpen || !message?.cambridge) return;
        if (isCoachHoveredRef.current) return;
        if (closeMenuTimeoutRef.current) {
            window.clearTimeout(closeMenuTimeoutRef.current);
        }
        closeMenuTimeoutRef.current = window.setTimeout(() => {
            if (isCoachHoveredRef.current) return;
            setIsOpen(false);
            closeMenuTimeoutRef.current = null;
        }, 3000);
        return () => {
            if (closeMenuTimeoutRef.current) {
                window.clearTimeout(closeMenuTimeoutRef.current);
                closeMenuTimeoutRef.current = null;
            }
        };
    }, [isOpen, message]);

    const CommandBox = () => (
        <div ref={commandBoxRef} className="bg-white/95 backdrop-blur-xl p-1.5 rounded-[1.8rem] shadow-2xl border border-neutral-200 flex flex-col gap-1 w-[160px] animate-in fade-in zoom-in-95 duration-200">
            {/* Using a 6-column grid allows us to have col-span-2 buttons that are perfectly equal in width */}
            <div className="grid grid-cols-6 gap-1">
                {/* TOP ROW (3 buttons, 2 columns each) */}
                <button type="button" onClick={handleTranslateSelection} className="col-span-2 aspect-square bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition-all active:scale-90 shadow-sm font-black text-xs" title="Tiếng Việt">VI</button>
                {!isAlreadyInLibrary ? (
                    <button type="button" onClick={handleAddToLibrary} disabled={isAddingToLibrary} className="col-span-2 aspect-square bg-green-50 text-green-600 rounded-2xl flex items-center justify-center hover:bg-green-100 transition-all active:scale-90 shadow-sm" title="Add to Library">{isAddingToLibrary ? <Loader2 size={14} className="animate-spin"/> : <Plus size={15}/>}</button>
                ) : (
                    <button type="button" onClick={handleViewWord} disabled={isAnyModalOpen} className="col-span-2 aspect-square bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center hover:bg-sky-100 transition-all active:scale-90 shadow-sm" title="View Word Details"><Eye size={15}/></button>
                )}
                <button type="button" onClick={handleReadAndIpa} className="col-span-2 aspect-square bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-100 transition-all active:scale-90 shadow-sm" title="Read & Phonetics (EN)"><Volume2 size={15}/></button>

                {/* BOTTOM ROW (3 buttons, 2 columns each) */}
                <button type="button" onClick={handleSpeakSelection} className="col-span-2 aspect-square bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center hover:bg-amber-100 transition-all active:scale-95 shadow-sm" title="Mimic Practice"><Mic size={15}/></button>
                <button type="button" onClick={handleOpenTools} className="col-span-2 aspect-square bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Coach Tools"><Wrench size={15}/></button>
                <button type="button" onClick={handleGoogleExampleSearch} className="col-span-2 aspect-square bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center hover:bg-blue-100 transition-all active:scale-95 shadow-sm" title="Search Google Examples"><Search size={15}/></button>
            </div>
        </div>
    );

    const formatBoldText = (text: string) => {
        const boldRegex = new RegExp('\\*\\*(.*?)\\*\\*', 'g');
        return text
            .replace(boldRegex, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>');
    };

    useEffect(() => {
        let interval: any;
        if (isAudioPlaying) {
            setMarkPoints(getMarkPoints());
            interval = setInterval(() => {
                const prog = getAudioProgress();
                if (prog) {
                    setAudioProgress(prog);
                }
            }, 100);
        } else {
            setAudioProgress({ currentTime: 0, duration: 0 });
            setMarkPoints([]);
            setIsAudioPaused(false);
            setIsSingleWordAudio(false);
        }
        return () => clearInterval(interval);
    }, [isAudioPlaying]);

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        seekAudio(time);
        setAudioProgress(prev => ({ ...prev, currentTime: time }));
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const cyclePlaybackRate = () => {
        const speeds = [0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5];
        const idx = speeds.findIndex((v) => Math.abs(v - playbackRate) < 0.001);
        const next = speeds[(idx + 1) % speeds.length];
        setPlaybackRate(next);
        setPlaybackRateState(next);
    };

    return (
        <>
            {isOpen && menuPos && (
                <div className="fixed z-[2147483647]" style={{ left: `${menuPos.x}px`, top: `${menuPos.y}px`, transform: menuPos.placement === 'top' ? 'translate(-50%, -100%) translateY(-10px)' : 'translate(-50%, 0) translateY(10px)' }}><CommandBox /></div>
            )}
            <div className="fixed bottom-0 left-6 z-[2147483646] flex flex-col items-start pointer-events-none">
                <div className="flex flex-col items-center pointer-events-auto group pb-0 pt-10" onMouseEnter={openCoachMenu} onMouseLeave={scheduleCloseCoachMenu}>
                    <div className="relative">
                        {isOpen && !menuPos && (
                            <div className="absolute bottom-16 left-0 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {message ? (
                                    <div ref={messageBoxRef} className="bg-white p-5 rounded-[2.5rem] shadow-2xl border border-neutral-200 w-[26rem] relative">
                                        <button onClick={() => { setMessage(null); setIsOpen(false); setMenuPos(null); }} className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-900"><X size={14}/></button>
                                        <div className="flex items-start gap-3">
                                            <div className="shrink-0 mt-1">{message.icon || <MessageSquare size={18} />}</div>
                                            <div className="text-xs font-medium text-neutral-700 leading-relaxed space-y-2">
                                                {message.cambridge ? (
                                                  <div className="space-y-4">
                                                    {Array.isArray((message.cambridge as any).wordFamily) &&
                                                    (message.cambridge as any).wordFamily.length > 0 ? (
                                                      (message.cambridge as any).wordFamily.map((entry: any, idx: number) => (
                                                        <div key={idx} className="space-y-2">
                                                          {/* Removed master headword display */}
                                                          <div className="grid grid-cols-2 gap-2">
                                                            {(entry.pronunciations || []).map((p: any, i: number) => (
                                                              <div
                                                                key={i}
                                                                className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1.5"
                                                              >
                                                                {p.headword && (
                                                                  <p className="text-[11px] font-extrabold text-indigo-700 break-words">
                                                                    {p.headword}
                                                                  </p>
                                                                )}
                                                                <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
                                                                  {p.partOfSpeech || 'N/A'}
                                                                </p>

                                                                <div className="flex items-center gap-2">
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => playCambridgeAudio(p.audioUs || undefined)}
                                                                    disabled={!p.audioUs}
                                                                    className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                      p.audioUs
                                                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                                                        : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                    }`}
                                                                  >
                                                                    US
                                                                  </button>
                                                                  <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                    {p.ipaUs ? `/${p.ipaUs}/` : 'N/A'}
                                                                  </p>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => playCambridgeAudio(p.audioUk || undefined)}
                                                                    disabled={!p.audioUk}
                                                                    className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                      p.audioUk
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                                                        : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                    }`}
                                                                  >
                                                                    UK
                                                                  </button>
                                                                  <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                    {p.ipaUk ? `/${p.ipaUk}/` : 'N/A'}
                                                                  </p>
                                                                </div>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      ))
                                                    ) : (
                                                      <div className="space-y-2">
                                                        {/* Removed master headword display */}
                                                        <div className="grid grid-cols-2 gap-2">
                                                          {(message.cambridge.pronunciations || []).map((p, idx) => (
                                                            <div
                                                              key={idx}
                                                              className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 space-y-1.5"
                                                            >
                                                              {(p as any).headword && (
                                                                <p className="text-[11px] font-extrabold text-indigo-700 break-words">
                                                                  {(p as any).headword}
                                                                </p>
                                                              )}
                                                              <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
                                                                {p.partOfSpeech || 'N/A'}
                                                              </p>

                                                              <div className="flex items-center gap-2">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => playCambridgeAudio(p.audioUs || undefined)}
                                                                  disabled={!p.audioUs}
                                                                  className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                    p.audioUs
                                                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                                                      : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                  }`}
                                                                >
                                                                  US
                                                                </button>
                                                                <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                  {p.ipaUs ? `/${p.ipaUs}/` : 'N/A'}
                                                                </p>
                                                              </div>

                                                              <div className="flex items-center gap-2">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => playCambridgeAudio(p.audioUk || undefined)}
                                                                  disabled={!p.audioUk}
                                                                  className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border transition-colors ${
                                                                    p.audioUk
                                                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                                                      : 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                                                  }`}
                                                                >
                                                                  UK
                                                                </button>
                                                                <p className="text-[11px] text-neutral-700 leading-relaxed flex-1 break-words">
                                                                  {p.ipaUk ? `/${p.ipaUk}/` : 'N/A'}
                                                                </p>
                                                              </div>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : (
                                                    (() => {
                                                        const rawText = message.text || '';
                                                        const isIPA = rawText.startsWith('IPA:');
                                                        const ipaContent = isIPA ? rawText.replace(/^IPA:\s*/, '') : rawText;
                                                        return (
                                                            <>
                                                                {isIPA && (
                                                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                                                        IPA:
                                                                    </div>
                                                                )}
                                                                <div
                                                                    style={{ lineHeight: '1.6' }}
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: formatBoldText(
                                                                            ipaContent.replace(/\s+\//g, '<br/>/')
                                                                        )
                                                                    }}
                                                                />
                                                            </>
                                                        );
                                                    })()
                                                )}
                                                {message.actionUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => window.open(message.actionUrl, '_blank')}
                                                        className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
                                                    >
                                                        {message.actionLabel || 'Open'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : <CommandBox />}
                            </div>
                        )}
                        <button onClick={(e) => { if (showPlaybackControls) { e.stopPropagation(); stopSpeaking(); } }} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 transform shadow-2xl relative z-10 ${avatarInfo.bg} ${isOpen ? 'ring-4 ring-white' : 'hover:scale-110 mb-1'}`}>
                            {isThinking ? <Loader2 size={20} className="animate-spin text-neutral-400"/> : (
                                <>
                                    <img src={avatarInfo.url} className={`w-10 h-10 object-contain ${showPlaybackControls ? 'opacity-30 scale-90 blur-[1px]' : ''}`} alt="Coach" />
                                    {showPlaybackControls && (
                                        <div className="absolute inset-0 flex items-center justify-center text-indigo-600 animate-in fade-in zoom-in duration-200">
                                            <Square size={24} fill="currentColor" />
                                        </div>
                                    )}
                                </>
                            )}
                        </button>

                        {/* Progress Bar */}
                        {showPlaybackControls && (
                            <div
                                className="absolute left-16 bottom-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-white/90 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl shadow-xl border border-neutral-200 animate-in fade-in slide-in-from-left-4 duration-300 pointer-events-auto w-[calc(100vw-6rem)] sm:w-auto max-w-[95vw] sm:max-w-none"
                                onMouseEnter={openCoachMenu}
                                onMouseLeave={scheduleCloseCoachMenu}
                            >
                                <span className="text-[10px] font-mono text-neutral-500 tabular-nums w-8">
                                    {audioProgress.duration > 0 ? formatTime(audioProgress.currentTime) : '--:--'}
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max={audioProgress.duration > 0 ? audioProgress.duration : 1}
                                    step="0.1"
                                    value={audioProgress.duration > 0 ? audioProgress.currentTime : 0}
                                    onChange={handleSeek}
                                    disabled={audioProgress.duration <= 0}
                                    className="flex-1 h-1.5 bg-neutral-100 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-700 transition-all"
                                />
                                <span className="text-[10px] font-mono text-neutral-400 tabular-nums w-8">
                                    {audioProgress.duration > 0 ? formatTime(audioProgress.duration) : '--:--'}
                                </span>
                                {/* Media Controls Row */}
                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full">
                                    <button
                                        onClick={() => {
                                            const newTime = Math.max(0, audioProgress.currentTime - 5);
                                            seekAudio(newTime);
                                            setAudioProgress(prev => ({ ...prev, currentTime: newTime }));
                                        }}
                                        className="w-6 h-6 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center border border-neutral-200"
                                        title="Rewind 5 seconds"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 8L13 12V4L7 8ZM3 8L9 12V4L3 8Z" fill="currentColor"/></svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            const newTime = Math.min(audioProgress.duration, audioProgress.currentTime + 5);
                                            seekAudio(newTime);
                                            setAudioProgress(prev => ({ ...prev, currentTime: newTime }));
                                        }}
                                        className="w-6 h-6 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center border border-neutral-200"
                                        title="Forward 5 seconds"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 8L3 4V12L9 8ZM13 8L7 4V12L13 8Z" fill="currentColor"/></svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (isAudioPaused) {
                                                resumeSpeaking().catch(() => showToast("Cannot resume audio.", "error"));
                                            } else {
                                                pauseSpeaking();
                                            }
                                        }}
                                        className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center justify-center border border-indigo-100"
                                        title={isAudioPaused ? "Resume audio" : "Pause audio"}
                                    >
                                        {isAudioPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
                                    </button>
                                    <button
                                        onClick={cyclePlaybackRate}
                                        className="h-6 px-2 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center border border-neutral-200 text-[10px] font-black tabular-nums"
                                        title="Playback speed"
                                    >
                                        {playbackRate.toFixed(playbackRate % 1 === 0 ? 1 : 2)}x
                                    </button>
                                    {markPoints.length > 0 && audioProgress.duration > 0 && (
                                        <div className="flex items-center gap-1 ml-1 border-l border-neutral-200 pl-2">
                                            {markPoints.map((pt, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => { seekAudio(pt); setAudioProgress(prev => ({ ...prev, currentTime: pt })); }}
                                                    className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition-colors border border-indigo-100"
                                                    title={`Jump to ${formatTime(pt)}`}
                                                >
                                                    {idx + 1}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 border-l border-neutral-200 pl-1 pr-0 ml-0">
                                        <button
                                            onClick={() => setMarkedTime(audioProgress.currentTime)}
                                            className="w-6 h-6 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors flex items-center justify-center border border-yellow-200"
                                            title="Mark current time"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>
                                        </button>
                                        <button
                                            onClick={() => {
                                                seekAudio(markedTime);
                                                setAudioProgress(prev => ({ ...prev, currentTime: markedTime }));
                                            }}
                                            className="w-10 h-6 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center border border-indigo-200 text-[11px] font-bold"
                                            title={`Play at marked time (${markedTime.toFixed(1)}s)`}
                                        >
                                            {markedTime.toFixed(1)}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {mimicTarget !== null && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />}
            <ToolsModal user={user}isOpen={isToolsModalOpen} onClose={() => setIsToolsModalOpen(false)} />
        </>
    );
};
