import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, AppView, WordQuality } from '../../app/types';
import { X, MessageSquare, RotateCw, Square, BookOpen, Languages, Book, Volume2, Sparkles, Mic, Waves, MousePointer2, ExternalLink, BookMarked, Loader2, Plus, Binary } from 'lucide-react';
import { getConfig, saveConfig, SystemConfig, getServerUrl } from '../../app/settingsManager';
import { speak, stopSpeaking, getIsSpeaking } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { SimpleMimicModal } from './SimpleMimicModal';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';

const MAX_READ_LENGTH = 1000;
const MAX_MIMIC_LENGTH = 300;

interface Props {
    user: User;
    stats: { due: number; new: number; total: number; };
    currentView: AppView;
    lastBackupTime: number | null;
    onNavigate: (view: string) => void;
}

interface Message {
    text: string;
    action?: string;
    actionLabel?: string;
    icon?: React.ReactNode;
}

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

export const StudyBuddy: React.FC<Props> = ({ user, stats, currentView, onNavigate }) => {
    const { showToast } = useToast();
    const [config, setConfig] = useState<SystemConfig>(getConfig());
    const [isAudioPlaying, setIsAudioPlaying] = useState(getIsSpeaking());
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [hasWelcomed, setHasWelcomed] = useState(false);
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number, placement: 'top' | 'bottom' } | null>(null);
    
    const [isCambridgeChecking, setIsCambridgeChecking] = useState(false);
    const [isCambridgeValid, setIsCambridgeValid] = useState(false);
    const [isAlreadyInLibrary, setIsAlreadyInLibrary] = useState(false);
    const [isAddingToLibrary, setIsAddingToLibrary] = useState(false);
    
    const closeTimerRef = useRef<any>(null);
    const autoMessageTimerRef = useRef<any>(null);
    const commandBoxRef = useRef<HTMLDivElement>(null);
    const checkAbortControllerRef = useRef<AbortController | null>(null);
    
    const activeType = config.audioCoach.activeCoach;
    const coach = config.audioCoach.coaches[activeType];
    const avatarInfo = getAvatarProps(coach.avatar);

    function getAvatarProps(avatarStr: string) {
        if (avatarStr.startsWith('http') || avatarStr.startsWith('data:')) return { url: avatarStr, bg: 'bg-white border-2 border-neutral-100' };
        return (AVATAR_DEFINITIONS as any)[avatarStr] || AVATAR_DEFINITIONS.woman_teacher;
    }

    const checkCambridgeWord = async (word: string) => {
        if (!word) return;
        setIsCambridgeValid(false);
        setIsCambridgeChecking(true);
        if (checkAbortControllerRef.current) checkAbortControllerRef.current.abort();
        checkAbortControllerRef.current = new AbortController();
        try {
            const serverUrl = getServerUrl(config);
            const response = await fetch(`${serverUrl}/api/lookup/cambridge?word=${encodeURIComponent(word)}`, {
                signal: checkAbortControllerRef.current.signal
            });
            if (response.ok) {
                const data = await response.json();
                setIsCambridgeValid(data.exists);
            }
        } catch (e: any) { } finally { setIsCambridgeChecking(false); }
    };

    const checkLibraryExistence = async (word: string) => {
        if (!word || !user.id) return;
        const exists = await dataStore.findWordByText(user.id, word);
        setIsAlreadyInLibrary(!!exists);
    };

    useEffect(() => {
        const handleConfigUpdate = () => setConfig(getConfig());
        const handleAudioStatus = (e: any) => setIsAudioPlaying(e.detail.isSpeaking);
        const handleContextMenu = (e: MouseEvent) => {
            if (!config.interface.rightClickCommandEnabled) return;
            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();
            if (selectedText) {
                e.preventDefault();
                const range = selection!.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const placement = rect.top > 250 ? 'top' : 'bottom';
                setMenuPos({ x: rect.left + rect.width / 2, y: placement === 'top' ? rect.top : rect.bottom, placement });
                setMessage(null);
                setIsOpen(true);
                checkLibraryExistence(selectedText);
                if (selectedText.split(/\s+/).filter(Boolean).length <= 5) checkCambridgeWord(selectedText);
                else setIsCambridgeValid(false);
            } else setMenuPos(null);
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (commandBoxRef.current && !commandBoxRef.current.contains(e.target as Node)) {
                if (isOpen) { setIsOpen(false); setMenuPos(null); }
            }
        };
        window.addEventListener('config-updated', handleConfigUpdate);
        window.addEventListener('audio-status-changed', handleAudioStatus);
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('config-updated', handleConfigUpdate);
            window.removeEventListener('audio-status-changed', handleAudioStatus);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [config.interface.rightClickCommandEnabled, isOpen, config.server, user.id]);

    const handleReadSelection = (lang: 'en' | 'vi' = 'en') => {
        const selectedText = window.getSelection()?.toString().trim();
        if (selectedText) {
            if (selectedText.length > MAX_READ_LENGTH) return showToast("Đoạn văn bản quá dài!", "error");
            setIsOpen(false); setMenuPos(null);
            speak(selectedText, false, lang, lang === 'en' ? coach.enVoice : coach.viVoice, lang === 'en' ? coach.enAccent : coach.viAccent);
        }
    };

    const handleTranslateSelection = async () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) return;
        setIsThinking(true); setIsOpen(false); setMenuPos(null);
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=en|vi`);
            const data = await res.json();
            if (data?.responseData?.translatedText) {
                const translation = data.responseData.translatedText;
                setMessage({ text: `**Dịch:** ${translation}`, icon: <Languages size={18} className="text-blue-500" /> });
                setIsOpen(true); speak(translation, false, 'vi', coach.viVoice, coach.viAccent);
            }
        } catch (e) { showToast("Lỗi dịch thuật!", "error"); } finally { setIsThinking(false); }
    };

    const handleIpaConversion = async () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) return;
        
        setIsThinking(true); setIsOpen(false); setMenuPos(null);
        try {
            // 1. Check local library first for an exact match (fast)
            const cleaned = selectedText.toLowerCase();
            const existing = dataStore.getAllWords().find(w => w.word.toLowerCase() === cleaned);
            if (existing && existing.ipa) {
                setMessage({ text: `**IPA (Thư viện):** ${existing.ipa}`, icon: <Binary size={18} className="text-emerald-500" /> });
                setIsOpen(true);
                setIsThinking(false);
                return;
            }

            // 2. Fallback to Server API
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/convert/ipa?text=${encodeURIComponent(selectedText)}`);
            if (res.ok) {
                const data = await res.json();
                setMessage({ text: `**IPA:** ${data.ipa}`, icon: <Binary size={18} className="text-purple-500" /> });
                setIsOpen(true);
            }
        } catch (e) { showToast("Lỗi Server IPA!", "error"); } finally { setIsThinking(false); }
    };

    const handleAddToLibrary = async () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText || isAlreadyInLibrary) return;
        setIsAddingToLibrary(true);
        try {
            const newItem = { ...createNewWord(selectedText, '', '', '', '', ['coach-added'], false, false, false, false, selectedText.includes(' ')), userId: user.id, quality: WordQuality.RAW };
            await dataStore.saveWord(newItem);
            showToast(`"${selectedText}" đã thêm!`, 'success');
            setIsAlreadyInLibrary(true); setIsOpen(false); setMenuPos(null);
        } catch (e) { showToast("Lỗi thêm từ!", "error"); } finally { setIsAddingToLibrary(false); }
    };

    const handleCambridgeLookup = () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) return;
        const url = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(selectedText.toLowerCase().replace(/\s+/g, '-'))}`;
        window.open(url, '_blank');
        setIsOpen(false); setMenuPos(null);
    };

    const handleSpeakSelection = () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (selectedText) {
            if (selectedText.length > MAX_MIMIC_LENGTH) { showToast("Đoạn văn quá dài để luyện nói!", "error"); return; }
            setIsOpen(false);
            setMenuPos(null);
            setMimicTarget(selectedText);
        } else showToast("Bôi đen văn bản để luyện nói!", "info");
    };

    const CommandBox = () => (
        <div ref={commandBoxRef} className="bg-white/95 backdrop-blur-xl p-1.5 rounded-[1.8rem] shadow-2xl border border-neutral-200 flex flex-col gap-1 w-[160px] animate-in fade-in zoom-in-95 duration-200">
            <div className="grid grid-cols-3 gap-1">
                <button type="button" onClick={handleTranslateSelection} className="aspect-square bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition-all active:scale-90 shadow-sm" title="Dịch"><Languages size={15}/></button>
                <button type="button" onClick={handleAddToLibrary} disabled={isAlreadyInLibrary || isAddingToLibrary} className={`aspect-square rounded-2xl flex items-center justify-center transition-all shadow-sm ${isAlreadyInLibrary ? 'bg-neutral-100 text-neutral-400' : 'bg-green-50 text-green-600 hover:bg-green-100'}`} title="Thêm">{isAddingToLibrary ? <Loader2 size={14} className="animate-spin"/> : <Plus size={15}/></button>
                <button type="button" onClick={handleIpaConversion} className="aspect-square bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-100 transition-all active:scale-90 shadow-sm" title="IPA"><Binary size={15}/></button>
                
                <button type="button" onClick={handleSpeakSelection} className="aspect-square bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center hover:bg-amber-100 transition-all active:scale-90 shadow-sm" title="Mimic"><Mic size={15}/></button>
                <button type="button" onClick={handleCambridgeLookup} disabled={isCambridgeChecking || !isCambridgeValid} className={`aspect-square rounded-2xl flex items-center justify-center transition-all shadow-sm ${isCambridgeValid ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'}`} title="Cambridge">{isCambridgeChecking ? <Loader2 size={14} className="animate-spin"/> : <Book size={15}/></button>
                <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => handleReadSelection('en')} className="aspect-square bg-neutral-100 text-neutral-500 rounded-2xl flex items-center justify-center hover:bg-neutral-200 transition-all active:scale-95 shadow-sm" title="Nghe EN"><BookOpen size={15} fill="currentColor"/></button>
                </div>
                
                <button type="button" onClick={() => handleReadSelection('vi')} className="aspect-square bg-rose-50 text-rose-400 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95 shadow-sm" title="Nghe VI"><Volume2 size={15} /></button>
            </div>
        </div>
    );

    return (
        <>
            {isOpen && menuPos && (
                <div className="fixed z-[2147483647]" style={{ left: `${menuPos.x}px`, top: `${menuPos.y}px`, transform: menuPos.placement === 'top' ? 'translate(-50%, -100%) translateY(-10px)' : 'translate(-50%, 0) translateY(10px)' }}>
                    <CommandBox />
                </div>
            )}
            <div className="fixed bottom-0 left-6 z-[2147483646] flex flex-col items-start pointer-events-none">
                <div className="flex flex-col items-center pointer-events-auto group pb-0 pt-10" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setTimeout(() => setIsOpen(false), 300)}>
                    <div className="relative">
                        {isOpen && !menuPos && (
                            <div className="absolute bottom-16 left-0 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {message ? (
                                    <div className="bg-white p-5 rounded-[2.5rem] shadow-2xl border border-neutral-200 w-72 relative">
                                        <button onClick={() => setMessage(null)} className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-900"><X size={14}/></button>
                                        <div className="flex items-start gap-3">
                                            <div className="shrink-0 mt-1">{message.icon || <MessageSquare size={18} />}</div>
                                            <div className="text-xs font-medium text-neutral-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: message.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                        </div>
                                    </div>
                                ) : <CommandBox />}
                            </div>
                        )}
                        <button onClick={() => isAudioPlaying && stopSpeaking()} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 transform shadow-2xl relative z-10 ${avatarInfo.bg} ${isOpen ? 'ring-4 ring-white' : 'hover:scale-110 mb-1'}`}>
                            {isThinking ? <Loader2 size={20} className="animate-spin text-neutral-400"/> : <img src={avatarInfo.url} className={`w-10 h-10 object-contain ${isAudioPlaying ? 'scale-110' : ''}`} alt="Coach" />}
                        </button>
                    </div>
                </div>
            </div>
            {mimicTarget && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />}
        </>
    );
};