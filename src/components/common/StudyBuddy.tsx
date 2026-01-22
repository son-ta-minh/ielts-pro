
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, AppView } from '../../app/types';
import { X, MessageSquare, ArrowRight, Quote as QuoteIcon, Trophy, AlertTriangle, Mic, PenLine, FileClock, Sparkles, Download, RotateCw, Zap, HeartPulse, Ear, Lightbulb, Map, Power } from 'lucide-react';
import * as dataStore from '../../app/dataStore';
import { getConfig, saveConfig, SystemConfig } from '../../app/settingsManager';
import { QUOTES, LAB_ADVICE, BOSS_DIALOGUE, GENERAL_MESSAGES, FALLBACK_MESSAGES } from '../../data/speech_data';

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

// Using High-Quality 3D Emojis for Animals
const AVATAR_DEFINITIONS = {
    fox: { 
        name: 'Vix', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png',
        bg: 'bg-orange-100'
    },
    koala: { 
        name: 'Nami', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png',
        bg: 'bg-teal-100'
    },
    pet: { 
        name: 'Mochi', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png',
        bg: 'bg-pink-100'
    },
    owl: { 
        name: 'Hootie', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png',
        bg: 'bg-yellow-100'
    },
    bunny: { 
        name: 'Hops', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Rabbit%20Face.png',
        bg: 'bg-rose-100'
    },
    lion: { 
        name: 'Leo', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Lion.png',
        bg: 'bg-amber-100'
    },
    panda: { 
        name: 'Bamboo', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png',
        bg: 'bg-emerald-100'
    },
    unicorn: { 
        name: 'Spark', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png',
        bg: 'bg-purple-100'
    },
    chicken: { 
        name: 'Nugget', 
        type: 'image',
        url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Chicken.png',
        bg: 'bg-yellow-100'
    },
    robot: { 
        name: 'Zeta', 
        type: 'dicebear',
        seed: 'Buddy',
        bg: 'bg-indigo-100'
    },
};

export const StudyBuddy: React.FC<Props> = ({ user, stats, currentView, lastBackupTime, onNavigate }) => {
    // 1. Always call hooks at the top level
    const [config, setConfig] = useState<SystemConfig>(getConfig());
    
    useEffect(() => {
        const handleConfigUpdate = () => {
            setConfig(getConfig());
        };
        window.addEventListener('config-updated', handleConfigUpdate);
        return () => {
            window.removeEventListener('config-updated', handleConfigUpdate);
        };
    }, []);
    
    const [isOpen, setIsOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [message, setMessage] = useState<Message | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [hasWelcomed, setHasWelcomed] = useState(false);
    
    const autoCloseTimerRef = useRef<any | null>(null);
    const messageDurationRef = useRef<number>(10000); // Default 10s
    const menuHoverTimer = useRef<number | null>(null);
    const menuAutoCloseTimer = useRef<number | null>(null);
    const prevUserRef = useRef<User>(user);

    const isEnabled = config.interface.studyBuddyEnabled;
    const avatarType = config.interface.studyBuddyAvatar || 'fox';
    // @ts-ignore
    const avatarInfo = AVATAR_DEFINITIONS[avatarType] || AVATAR_DEFINITIONS['fox'];

    const justRestored = sessionStorage.getItem('vocab_pro_just_restored') === 'true';
    const isBackupUrgentForAdvice = !justRestored && lastBackupTime && (Date.now() - lastBackupTime > 3600 * 1000); // 1 hour for specific advice
    const isBackupOverdueForGeneral = !justRestored && lastBackupTime && (Date.now() - lastBackupTime > 86400000); // 1 day for general reminders

    const startMessageTimer = useCallback(() => {
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = setTimeout(() => {
            setIsOpen(false);
        }, messageDurationRef.current);
    }, []);

    const stopMessageTimer = useCallback(() => {
        if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    }, []);

    // Auto-close message bubble logic
    useEffect(() => {
        if (isOpen && message) {
            startMessageTimer();
        }
        return () => stopMessageTimer();
    }, [isOpen, message, startMessageTimer, stopMessageTimer]);

    // Auto-close menu after 5s
    useEffect(() => {
        if (isMenuOpen) {
            if (menuAutoCloseTimer.current) clearTimeout(menuAutoCloseTimer.current);
            menuAutoCloseTimer.current = window.setTimeout(() => {
                setIsMenuOpen(false);
            }, 5000);
        }
        return () => {
            if (menuAutoCloseTimer.current) clearTimeout(menuAutoCloseTimer.current);
        };
    }, [isMenuOpen]);

    const getFreePool = useCallback((): Message[] => {
        const lang = config.interface.studyBuddyLanguage || 'vi';
        return FALLBACK_MESSAGES[lang].map(txt => ({ text: txt, icon: <HeartPulse size={18} className="text-rose-500" /> }));
    }, [config.interface.studyBuddyLanguage]);

    const showNewMessage = useCallback((poolGenerator: () => Message[], prioritized = false, duration = 10000) => {
        setIsThinking(true);
        // Reset timer when thinking starts
        stopMessageTimer();
        
        setTimeout(() => {
            let pool = poolGenerator();
            if (pool.length === 0) {
                setIsThinking(false);
                setIsOpen(false);
                return;
            }
    
            let nextMessage: Message | null = null;
            if (prioritized) {
                nextMessage = pool[0];
            } else {
                if (pool.length > 1 && message) {
                    const differentMessages = pool.filter(m => m.text !== message.text);
                    if (differentMessages.length > 0) {
                        nextMessage = differentMessages[Math.floor(Math.random() * differentMessages.length)];
                    }
                }
                
                if (!nextMessage) {
                     nextMessage = pool[Math.floor(Math.random() * pool.length)];
                }
            }
            
            setMessage(nextMessage);
            messageDurationRef.current = duration; // Set dynamic duration
            setIsThinking(false);
            setIsOpen(true);
        }, 600);
    }, [message, stopMessageTimer]);

    // Welcome Message Logic (Runs on mount/enable)
    useEffect(() => {
        if (isEnabled && !hasWelcomed) {
            const lang = config.interface.studyBuddyLanguage || 'vi';
            const welcomeText = lang === 'vi' 
                ? `Chào ${user.name}! Mình là **${avatarInfo.name}**. Mình sẽ giúp bạn học tập nhé!` 
                : `Hi ${user.name}! I'm **${avatarInfo.name}**. I'm here to help you study!`;
            
            // Show welcome message for 3 seconds
            setMessage({ text: welcomeText, icon: <Sparkles size={18} className="text-yellow-500" /> });
            messageDurationRef.current = 3500;
            setIsOpen(true);
            setHasWelcomed(true);
        }
    }, [isEnabled, hasWelcomed, user.name, config.interface.studyBuddyLanguage, avatarInfo.name]);


    const getAdvicePool = useCallback((): Message[] => {
        const lang = config.interface.studyBuddyLanguage || 'vi';
        const globalStats = dataStore.getStats();
        const { learned, reviewed } = globalStats.dayProgress;
        const { max_learn_per_day: learnGoal, max_review_per_day: reviewGoal } = config.dailyGoals;

        const pool: Message[] = [];

        if (isBackupUrgentForAdvice && stats.total > 0) pool.push({ text: GENERAL_MESSAGES.backup_urgent[lang](), action: 'SETTINGS', actionLabel: lang === 'vi' ? "Sao lưu ngay" : "Backup Now", icon: <Download size={18} className="text-amber-500" /> });
        if (stats.total === 0) pool.push({ text: GENERAL_MESSAGES.empty_library[lang](), action: 'BROWSE', actionLabel: lang === 'vi' ? "Thêm từ mới" : "Add Words", icon: <Sparkles size={18} className="text-indigo-500" /> });
        if (stats.due > 0) pool.push({ text: GENERAL_MESSAGES.srs_due[lang](stats.due), action: 'REVIEW', actionLabel: lang === 'vi' ? "Ôn tập" : "Review", icon: <RotateCw size={18} className="text-orange-500" /> });
        
        const nextLearnEnergy = 3 - (learned % 3);
        const nextReviewEnergy = 10 - (reviewed % 10);
        if (learned < learnGoal) {
             pool.push({ text: `Learn **${nextLearnEnergy}** more words to get **+1 Energy** ⚡!`, action: 'REVIEW', actionLabel: lang === 'vi' ? "Học ngay" : "Learn Now", icon: <Zap size={18} className="text-yellow-500" /> });
        } else if (reviewed < reviewGoal) {
             pool.push({ text: `Review **${nextReviewEnergy}** more words to get **+1 Energy** ⚡!`, action: 'REVIEW', actionLabel: lang === 'vi' ? "Ôn tập" : "Review Now", icon: <Zap size={18} className="text-yellow-500" /> });
        }

        if (stats.new > 0) pool.push({ text: `You have **${stats.new}** new words ready to be learned.`, action: 'REVIEW', actionLabel: lang === 'vi' ? "Học từ mới" : "Learn New", icon: <Lightbulb size={18} className="text-blue-500" /> });
        
        const features = [{ text: lang === 'vi' ? 'Đã thử **Phòng Lab Speaking** chưa? Luyện tập và nhận điểm band ngay lập tức!' : "Have you tried the **Speaking Studio**? Practice and get an instant band score!", action: 'SPEAKING', icon: <Mic size={18} className="text-rose-500" /> },{ text: lang === 'vi' ? 'Nâng cấp bài viết của bạn trong **Phòng Lab Writing**.' : "Level up your essays in the **Writing Studio**.", action: 'WRITING', icon: <PenLine size={18} className="text-blue-500" /> }];
        pool.push(features[Math.floor(Math.random() * features.length)]);
        
        return pool.sort(() => Math.random() - 0.5);
    }, [stats, user, isBackupUrgentForAdvice, config]);

    const getQuotePool = useCallback((): Message[] => {
        return QUOTES.map(q => ({ text: `*"${q.text}"* — **${q.author}**`, icon: <QuoteIcon size={18} className="text-indigo-400" /> }));
    }, []);

    const generateGeneralPool = useCallback((): Message[] => {
        const lang = config.interface.studyBuddyLanguage || 'vi';
        let pool: Message[] = [];

        if (currentView === 'DASHBOARD') {
            if (isBackupOverdueForGeneral && stats.total > 0) pool.push({ text: GENERAL_MESSAGES.backup_urgent[lang](), action: 'SETTINGS', actionLabel: lang === 'vi' ? "Sao lưu ngay" : "Backup Now", icon: <Download size={18} className="text-amber-500" /> });
            if (stats.due > 0) pool.push({ text: GENERAL_MESSAGES.srs_due[lang](stats.due), action: 'REVIEW', actionLabel: lang === 'vi' ? "Ôn tập" : "Review", icon: <RotateCw size={18} className="text-orange-500" /> });
            pool.push(...getQuotePool());
            pool.push(...getFreePool());
        } else if (currentView === 'DISCOVER') {
            const { currentNodeIndex } = user.adventure;
            const currentNode = user.adventure.map?.[currentNodeIndex];
            
            if (currentNode?.type === 'boss' && !currentNode.isDefeated) {
                 const bossName = currentNode.boss_details?.name || 'a fearsome boss';
                 pool.push({ text: BOSS_DIALOGUE.warning[lang](bossName), icon: <AlertTriangle size={18} className="text-red-500" /> });
            } else {
                const adviceList = LAB_ADVICE['DISCOVER'][lang];
                const icon = <Map size={18} className="text-emerald-500" />;
                adviceList.forEach(txt => pool.push({ text: txt, icon }));
            }

        } else if (LAB_ADVICE[currentView]) {
            const adviceList = LAB_ADVICE[currentView][lang];
            let icon = <Sparkles size={18} className="text-indigo-500" />;
            if (currentView === 'SPEAKING') icon = <Mic size={18} className="text-rose-500" />;
            if (currentView === 'WRITING') icon = <PenLine size={18} className="text-blue-500" />;
            if (currentView === 'IRREGULAR_VERBS') icon = <FileClock size={18} className="text-orange-500" />;
            if (currentView === 'MIMIC') icon = <Ear size={18} className="text-emerald-500" />;
            
            adviceList.forEach(txt => pool.push({ text: txt, icon }));
        }
        
        return pool.sort(() => Math.random() - 0.5);
    }, [currentView, stats, user, isBackupOverdueForGeneral, getQuotePool, getFreePool, config]);

    // Effect for general messages on view change (10s)
    useEffect(() => {
        if (!isEnabled || !hasWelcomed) return; // Don't override welcome immediately
        showNewMessage(generateGeneralPool, false, 10000);
        prevUserRef.current = user;
    }, [currentView, isEnabled, hasWelcomed]);
    
    // Effect for periodic messages (10s)
    useEffect(() => {
        if (!isEnabled) return;
        const interval = setInterval(() => {
            if (!isOpen && !isMenuOpen && document.visibilityState === 'visible') {
                showNewMessage(generateGeneralPool, false, 10000);
            }
            prevUserRef.current = user;
        }, 60000); // 1 minute
        return () => clearInterval(interval);
    }, [isOpen, isMenuOpen, generateGeneralPool, showNewMessage, user, isEnabled]);
    
    const handleMouseEnter = () => {
        if (currentView === 'DASHBOARD') {
            if (menuHoverTimer.current) clearTimeout(menuHoverTimer.current);
            setIsMenuOpen(true);
            setIsOpen(false); // Hide any open message bubble
        }
    };

    const handleMouseLeave = () => {
        if (currentView === 'DASHBOARD') {
            menuHoverTimer.current = window.setTimeout(() => {
                setIsMenuOpen(false);
            }, 300);
        }
    };

    const handleAvatarClick = () => {
        if (currentView === 'DASHBOARD') {
            showNewMessage(getAdvicePool, true, 10000);
        } else {
            showNewMessage(generateGeneralPool, false, 10000);
        }
    };

    const handleMenuClick = (type: 'advice' | 'quote' | 'free') => {
        setIsMenuOpen(false);
        if (type === 'advice') showNewMessage(getAdvicePool, true, 10000);
        else if (type === 'quote') showNewMessage(getQuotePool, false, 10000);
        else showNewMessage(getFreePool, false, 10000);
    };

    const handleDismissBuddy = () => {
        setIsMenuOpen(false);
        const lang = config.interface.studyBuddyLanguage || 'vi';
        const msg = lang === 'vi' 
            ? "Tạm biệt! Bạn có thể bật lại tôi trong phần **Cài đặt** nhé." 
            : "Goodbye! You can turn me back on in **Settings**.";
        
        setMessage({ text: msg, icon: <Power size={18} className="text-neutral-500" /> });
        messageDurationRef.current = 3500; // 3.5s for goodbye
        setIsOpen(true);

        // Actually disable after allowing time to read the message
        setTimeout(() => {
            const newConfig = { ...config };
            newConfig.interface.studyBuddyEnabled = false;
            saveConfig(newConfig);
        }, 4000);
    };

    const handleAction = () => {
        if (message?.action) {
            onNavigate(message.action);
            if (window.innerWidth < 768) setIsOpen(false);
        }
    };

    const getAvatarUrl = () => {
        if (avatarInfo.type === 'dicebear') {
             return `https://api.dicebear.com/7.x/bottts/svg?seed=${(avatarInfo as any).seed}${user.name}&backgroundColor=transparent`;
        }
        // Return static image URL for animals
        return (avatarInfo as any).url;
    };

    // 2. Early return check at the very end to respect Rules of Hooks
    if (!isEnabled) {
        return null;
    }

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3 pointer-events-none">
            {isOpen && message && (
                <div 
                    className={`pointer-events-auto bg-white p-4 rounded-2xl rounded-tr-sm shadow-xl border-2 border-indigo-100 max-w-[280px] animate-in slide-in-from-bottom-5 fade-in duration-300 origin-bottom-right mb-2 relative ${isThinking ? 'opacity-80' : ''}`}
                    onMouseEnter={stopMessageTimer}
                    onMouseLeave={startMessageTimer}
                >
                    <button onClick={() => setIsOpen(false)} className="absolute top-2 right-2 text-neutral-300 hover:text-neutral-500 transition-colors"><X size={14} /></button>
                    <div className="flex gap-3">
                        <div className="mt-1 shrink-0 text-indigo-500">{isThinking ? <LoaderIcon /> : (message.icon || <MessageSquare size={18} />)}</div>
                        <div className="space-y-2">
                            {isThinking ? ( <p className="text-xs font-medium text-neutral-400 italic">{config.interface.studyBuddyLanguage === 'en' ? 'Thinking...' : 'Đang suy nghĩ...'}</p> ) : (
                                <>
                                    <div className="text-xs font-medium text-neutral-700 leading-relaxed [&_strong]:font-black [&_strong]:text-indigo-600" dangerouslySetInnerHTML={{ __html: message.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') }} />
                                    {message.action && ( <button onClick={handleAction} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 transition-all"><span>{message.actionLabel || (config.interface.studyBuddyLanguage === 'en' ? "Take me there" : "Đi thôi")}</span><ArrowRight size={12} /></button>)}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div 
                className="flex items-center gap-2"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {isMenuOpen && currentView === 'DASHBOARD' && (
                    <div className="pointer-events-auto bg-white p-1 rounded-full shadow-xl border-2 border-indigo-100 flex flex-row gap-1 animate-in slide-in-from-right-5 fade-in duration-300 origin-right">
                        <button onClick={() => handleMenuClick('advice')} className="group relative p-3 rounded-full text-neutral-700 hover:bg-neutral-100 transition-colors">
                            <Lightbulb size={16}/>
                            <span className="absolute bottom-full mb-2 -translate-x-1/2 left-1/2 bg-neutral-800 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Advice</span>
                        </button>
                        <button onClick={() => handleMenuClick('quote')} className="group relative p-3 rounded-full text-neutral-700 hover:bg-neutral-100 transition-colors">
                            <QuoteIcon size={16}/>
                            <span className="absolute bottom-full mb-2 -translate-x-1/2 left-1/2 bg-neutral-800 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Quote</span>
                        </button>
                        <button onClick={() => handleMenuClick('free')} className="group relative p-3 rounded-full text-neutral-700 hover:bg-neutral-100 transition-colors">
                            <MessageSquare size={16}/>
                            <span className="absolute bottom-full mb-2 -translate-x-1/2 left-1/2 bg-neutral-800 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Free Talk</span>
                        </button>
                         <button onClick={handleDismissBuddy} className="group relative p-3 rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-500 transition-colors">
                            <Power size={16}/>
                            <span className="absolute bottom-full mb-2 -translate-x-1/2 left-1/2 bg-neutral-800 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Turn Off</span>
                        </button>
                    </div>
                )}

                <button 
                    onClick={handleAvatarClick} 
                    className={`pointer-events-auto group relative w-16 h-16 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] transition-all active:scale-95 flex items-center justify-center border-4 border-white overflow-hidden ${avatarInfo.bg || 'bg-white'}`}
                >
                    {/* Using key to force re-mount when avatar style changes, ensuring instant update */}
                    <img 
                        key={config.interface.studyBuddyAvatar} 
                        src={getAvatarUrl()} 
                        alt="Study Buddy" 
                        className={`w-full h-full object-cover transition-transform duration-500 ${isThinking ? 'animate-pulse' : 'group-hover:scale-110 group-hover:rotate-6'}`} 
                    />
                    {(!isOpen && !isMenuOpen) && (stats.due > 0 || (currentView === 'DASHBOARD' && isBackupOverdueForGeneral && stats.total > 0)) && ( <span className="absolute top-0 right-0 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span> )}
                </button>
            </div>
        </div>
    );
};

export default StudyBuddy;
