
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, AppView } from '../../app/types';
import { X, MessageSquare, ArrowRight, Quote as QuoteIcon, Trophy, AlertTriangle, Mic, PenLine, FileClock, Sparkles, Download, RotateCw, Zap, HeartPulse, Ear, Lightbulb, Map, Power, Square } from 'lucide-react';
import * as dataStore from '../../app/dataStore';
import { getConfig, saveConfig, SystemConfig } from '../../app/settingsManager';
import { QUOTES, LAB_ADVICE, BOSS_DIALOGUE, GENERAL_MESSAGES, FALLBACK_MESSAGES } from '../../data/speech_data';
import { speak, stopSpeaking, getIsSpeaking } from '../../utils/audio';

interface Props {
    user: User;
    stats: {
        due: number;
        new: number;
        total: number;
    };
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

const LoaderIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;

const AVATAR_DEFINITIONS = {
    fox: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png', bg: 'bg-orange-100' },
    koala: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png', bg: 'bg-teal-100' },
    pet: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png', bg: 'bg-pink-100' },
    owl: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png', bg: 'bg-yellow-100' },
    panda: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png', bg: 'bg-emerald-100' },
    unicorn: { url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png', bg: 'bg-purple-100' },
};

export const StudyBuddy: React.FC<Props> = ({ user, stats, currentView, lastBackupTime, onNavigate }) => {
    const [config, setConfig] = useState<SystemConfig>(getConfig());
    const [isAudioPlaying, setIsAudioPlaying] = useState(getIsSpeaking());
    
    useEffect(() => {
        const handleConfigUpdate = () => setConfig(getConfig());
        const handleAudioStatus = (e: any) => setIsAudioPlaying(e.detail.isSpeaking);
        
        window.addEventListener('config-updated', handleConfigUpdate);
        window.addEventListener('audio-status-changed', handleAudioStatus);
        
        return () => {
            window.removeEventListener('config-updated', handleConfigUpdate);
            window.removeEventListener('audio-status-changed', handleAudioStatus);
        };
    }, []);
    
    const [isOpen, setIsOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [hasWelcomed, setHasWelcomed] = useState(false);
    
    const autoCloseTimerRef = useRef<any | null>(null);
    const messageDurationRef = useRef<number>(10000); 

    const activeType = config.audioCoach.activeCoach;
    const coach = config.audioCoach.coaches[activeType];
    const avatarInfo = (AVATAR_DEFINITIONS as any)[coach.avatar] || AVATAR_DEFINITIONS.fox;

    const startMessageTimer = useCallback(() => {
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = setTimeout(() => setIsOpen(false), messageDurationRef.current);
    }, []);

    const stopMessageTimer = useCallback(() => {
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    }, []);

    useEffect(() => {
        if (isOpen && message) startMessageTimer();
        return () => stopMessageTimer();
    }, [isOpen, message, startMessageTimer, stopMessageTimer]);

    const getFreePool = useCallback((): Message[] => {
        const lang = config.interface.studyBuddyLanguage || 'vi';
        return FALLBACK_MESSAGES[lang].map(txt => ({ text: txt, icon: <HeartPulse size={18} className="text-rose-500" /> }));
    }, [config.interface.studyBuddyLanguage]);

    const showNewMessage = useCallback((poolGenerator: () => Message[], prioritized = false, duration = 10000) => {
        setIsThinking(true);
        stopMessageTimer();
        
        setTimeout(() => {
            let pool = poolGenerator();
            if (pool.length === 0) {
                setIsThinking(false);
                setIsOpen(false);
                return;
            }
            let nextMessage = pool[Math.floor(Math.random() * pool.length)];
            setMessage(nextMessage);
            messageDurationRef.current = duration;
            setIsThinking(false);
            setIsOpen(true);
            
            // Speak dialogue only (isDialogue = true to avoid browser fallback)
            if (!getIsSpeaking()) {
                speak(nextMessage.text, true);
            }
        }, 600);
    }, [stopMessageTimer]);

    useEffect(() => {
        if (!hasWelcomed) {
            const lang = config.interface.studyBuddyLanguage || 'vi';
            const coachName = coach.name; 
            const welcomeText = lang === 'vi' 
                ? `Chào ${user.name}! Mình là **${coachName}**. Sẵn sàng luyện tập cùng bạn!` 
                : `Hi ${user.name}! I'm **${coachName}**. Ready to coach you!`;
            
            setMessage({ text: welcomeText, icon: <Sparkles size={18} className="text-yellow-500" /> });
            messageDurationRef.current = 3500;
            setIsOpen(true);
            setHasWelcomed(true);
            
            speak(welcomeText, true);
        }
    }, [hasWelcomed, user.name, config.interface.studyBuddyLanguage, coach]);

    const getAdvicePool = useCallback((): Message[] => {
        const lang = config.interface.studyBuddyLanguage || 'vi';
        const globalStats = dataStore.getStats();
        const { learned } = globalStats.dayProgress;
        const pool: Message[] = [];
        
        const goals = config.dailyGoals;
        if (learned < goals.max_learn_per_day) {
            const msg = GENERAL_MESSAGES.daily_goal[lang](goals.max_learn_per_day - learned);
            pool.push({ text: msg, icon: <Zap size={18} className="text-yellow-500" />, action: 'BROWSE', actionLabel: 'Learn' });
        }
        if (stats.due > 0) {
            const msg = GENERAL_MESSAGES.srs_due[lang](stats.due);
            pool.push({ text: msg, icon: <RotateCw size={18} className="text-blue-500" />, action: 'REVIEW', actionLabel: 'Review Now' });
        }
        const viewAdvice = LAB_ADVICE[currentView];
        if (viewAdvice) viewAdvice[lang].forEach(t => pool.push({ text: t, icon: <Lightbulb size={18} className="text-amber-500" /> }));

        return pool.length > 0 ? pool : getFreePool();
    }, [config.interface.studyBuddyLanguage, config.dailyGoals, currentView, stats.due, getFreePool]);

    const getQuotePool = useCallback((): Message[] => {
        return QUOTES.map(q => ({ text: `*"${q.text}"* — **${q.author}**`, icon: <QuoteIcon size={18} className="text-indigo-400" /> }));
    }, []);

    const handleIconClick = () => {
        if (isAudioPlaying) {
            stopSpeaking();
            return;
        }

        if (isOpen && message) {
            speak(message.text, true);
            startMessageTimer();
        } else {
            showNewMessage(getAdvicePool, false, 8000);
        }
    };

    const handleMenuAction = (type: 'ADVICE' | 'QUOTE') => {
        setIsMenuOpen(false);
        if (type === 'ADVICE') showNewMessage(getAdvicePool, false, 8000);
        else showNewMessage(getQuotePool, false, 12000);
    };

    return (
        <div className="fixed bottom-6 left-6 z-[100] flex flex-col items-start gap-3 pointer-events-none">
            {isOpen && message && (
                <div className="bg-white p-5 rounded-[2.5rem] shadow-2xl border border-neutral-200 w-72 pointer-events-auto animate-in fade-in duration-300 relative">
                    <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 p-1 text-neutral-300 hover:text-neutral-900 rounded-full transition-colors"><X size={14}/></button>
                    <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-1">{message.icon || <MessageSquare size={18} className="text-neutral-400"/>}</div>
                        <div className="flex-1 space-y-3">
                            <div className="text-xs font-medium text-neutral-700 leading-relaxed [&_strong]:font-black [&_strong]:text-neutral-900" dangerouslySetInnerHTML={{ __html: message.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                            {message.action && (
                                <button onClick={() => { onNavigate(message.action!); setIsOpen(false); }} className="w-full py-2 bg-neutral-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all active:scale-95">
                                    {message.actionLabel || 'Go'} <ArrowRight size={12}/>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="relative pointer-events-auto">
                {isMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-3 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <button onClick={() => handleMenuAction('ADVICE')} className="px-4 py-2.5 bg-white border border-neutral-200 rounded-2xl shadow-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:text-indigo-600 hover:border-indigo-200 transition-all active:scale-95"><Zap size={14} fill="currentColor"/> <span>Advice</span></button>
                        <button onClick={() => handleMenuAction('QUOTE')} className="px-4 py-2.5 bg-white border border-neutral-200 rounded-2xl shadow-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:text-indigo-600 hover:border-indigo-200 transition-all active:scale-95"><QuoteIcon size={14} fill="currentColor"/> <span>Quote</span></button>
                    </div>
                )}
                <button 
                    onClick={handleIconClick}
                    onContextMenu={(e) => { e.preventDefault(); setIsMenuOpen(!isMenuOpen); }}
                    className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-300 transform active:scale-90 shadow-2xl group relative ${avatarInfo.bg} ${isOpen ? 'ring-4 ring-white shadow-indigo-500/20' : 'hover:scale-110'}`}
                >
                    {isThinking ? (
                        <div className="text-neutral-400 animate-spin"><LoaderIcon /></div>
                    ) : (
                        <div className="relative w-12 h-12 flex items-center justify-center">
                             <img src={avatarInfo.url} className={`w-full h-full object-contain ${isAudioPlaying ? 'scale-110' : ''}`} />
                             
                             {/* Playing Overlay */}
                             {isAudioPlaying && (
                                <div className="absolute inset-0 bg-neutral-900/60 rounded-[1.2rem] flex items-center justify-center animate-in fade-in duration-200">
                                    <div className="relative flex items-center justify-center">
                                        <div className="absolute w-8 h-8 bg-white/20 rounded-full animate-ping"></div>
                                        <Square size={20} fill="white" className="text-white" />
                                    </div>
                                </div>
                             )}
                        </div>
                    )}
                    {stats.due > 0 && !isOpen && !isAudioPlaying && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
                            {stats.due}
                        </div>
                    )}
                </button>
            </div>
        </div>
    );
};
