
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, AppView } from '../../app/types';
import { X, MessageSquare, RotateCw, Square, BookOpen, Languages, Book, Volume2, Sparkles, Mic, Waves, MousePointer2 } from 'lucide-react';
import { getConfig, saveConfig, SystemConfig } from '../../app/settingsManager';
import { speak, stopSpeaking, getIsSpeaking } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { SimpleMimicModal } from './SimpleMimicModal';

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
    
    // Refs
    const closeTimerRef = useRef<any>(null);
    const autoMessageTimerRef = useRef<any>(null);
    const commandBoxRef = useRef<HTMLDivElement>(null);
    
    const activeType = config.audioCoach.activeCoach;
    const coach = config.audioCoach.coaches[activeType];
    
    // Helper to determine avatar properties whether it's a key or a raw URL
    const getAvatarProps = (avatarStr: string) => {
        // If it looks like a URL (http, https, data:), assume it's a custom avatar
        if (avatarStr.startsWith('http') || avatarStr.startsWith('data:')) {
            return { url: avatarStr, bg: 'bg-white border-2 border-neutral-100' };
        }
        // Otherwise try to find it in definitions, or fallback
        const def = (AVATAR_DEFINITIONS as any)[avatarStr];
        return def || AVATAR_DEFINITIONS.woman_teacher;
    };
    
    const avatarInfo = getAvatarProps(coach.avatar);

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
                
                // Determine placement based on available space above
                // Estimate menu height around 120px
                const MENU_HEIGHT = 120;
                const placement = rect.top > MENU_HEIGHT ? 'top' : 'bottom';

                setMenuPos({ 
                    x: rect.left + rect.width / 2, 
                    y: placement === 'top' ? rect.top : rect.bottom,
                    placement
                });
                setMessage(null);
                setIsOpen(true);
            } else {
                setMenuPos(null);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            // Quan trọng: Chỉ đóng menu nếu click thực sự nằm ngoài CommandBox
            if (commandBoxRef.current && !commandBoxRef.current.contains(e.target as Node)) {
                if (isOpen) {
                    setIsOpen(false);
                    setMenuPos(null);
                }
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
    }, [config.interface.rightClickCommandEnabled, isOpen]);

    useEffect(() => {
        if (isOpen && message && !isAudioPlaying) {
            autoMessageTimerRef.current = setTimeout(() => {
                if (!closeTimerRef.current) {
                    setIsOpen(false);
                    // Sau khi đóng hộp thoại nói, xóa tin nhắn để lần sau hiện Menu
                    setTimeout(() => setMessage(null), 300);
                }
            }, 4000);
        }
        return () => { if (autoMessageTimerRef.current) clearTimeout(autoMessageTimerRef.current); };
    }, [isOpen, message, isAudioPlaying]);

    useEffect(() => {
        if (!hasWelcomed && user.id) {
            const welcomeText = `Chào ${user.name}! Sẵn sàng luyện tập cùng mình chưa?`;
            setMessage({ text: welcomeText, icon: <Sparkles size={18} className="text-yellow-500" /> });
            setIsOpen(true);
            setHasWelcomed(true);
            if (config.interface.buddyVoiceEnabled) {
                speak(welcomeText, true, 'vi', coach.viVoice, coach.viAccent);
            }
        }
    }, [hasWelcomed, user.id, user.name, config.interface.buddyVoiceEnabled, coach]);

    const handleReadSelection = (lang: 'en' | 'vi' = 'en') => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();
        if (selectedText) {
            if (selectedText.length > MAX_READ_LENGTH) {
                showToast("Đoạn văn bản quá dài!", "error");
                return;
            }
            // Clear menu before speaking
            setIsOpen(false);
            setMenuPos(null);
            speak(selectedText, false, lang, lang === 'en' ? coach.enVoice : coach.viVoice, lang === 'en' ? coach.enAccent : coach.viAccent);
        } else {
            showToast("Bôi đen văn bản để nghe!", "info");
        }
    };

    const handleTranslateSelection = async () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) { showToast("Bôi đen để dịch!", "info"); return; }
        
        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null); // Quay lại Coach Mode để hiện loader
        
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedText)}&langpair=en|vi`);
            const data = await res.json();
            if (data?.responseData?.translatedText) {
                const translation = data.responseData.translatedText;
                setMessage({ text: `**Dịch:** ${translation}`, icon: <Languages size={18} className="text-blue-500" /> });
                setIsOpen(true);
                // LUÔN đọc bản dịch vì đây là hành động chủ động của người dùng
                speak(translation, false, 'vi', coach.viVoice, coach.viAccent);
            }
        } catch (e) { 
            showToast("Lỗi dịch thuật!", "error"); 
        } finally { 
            setIsThinking(false); 
        }
    };

    const handleDefineSelection = async () => {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) { showToast("Bôi đen để xem định nghĩa!", "info"); return; }
        
        setIsThinking(true);
        setIsOpen(false);
        setMenuPos(null); // Quay lại Coach Mode
        
        try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(selectedText)}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const meaning = data[0].meanings[0].definitions[0].definition;
            setMessage({ text: `**${data[0].word}**\n\n"${meaning}"`, icon: <Book size={18} className="text-emerald-500" /> });
            setIsOpen(true);
            // LUÔN đọc định nghĩa vì đây là hành động chủ động
            speak(meaning, false, 'en', coach.enVoice, coach.enAccent);
        } catch (e) { 
            showToast("Không tìm thấy định nghĩa!", "error"); 
        } finally { 
            setIsThinking(false); 
        }
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

    const onMouseEnter = () => {
        if (menuPos) return; // Nếu đang mở bằng chuột phải, bỏ qua hover
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (!isThinking) {
            if (!message) {
                setIsOpen(true);
            } else {
                setIsOpen(true);
            }
        }
    };

    const onMouseLeave = () => {
        if (menuPos) return; // Nếu đang mở bằng chuột phải, bỏ qua hover out
        closeTimerRef.current = setTimeout(() => {
            if (!message) setIsOpen(false);
        }, 300);
    };

    const toggleRightClickFeature = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextConfig = { ...config, interface: { ...config.interface, rightClickCommandEnabled: !config.interface.rightClickCommandEnabled } };
        saveConfig(nextConfig);
        showToast(nextConfig.interface.rightClickCommandEnabled ? "Right-click commands enabled" : "Right-click commands disabled", "info");
    };

    const CommandBox = () => (
        <div ref={commandBoxRef} className="bg-white/90 backdrop-blur-xl p-1.5 rounded-[1.8rem] shadow-2xl border border-neutral-200 flex flex-col gap-1 w-[130px] animate-in fade-in zoom-in-95 duration-200">
            <div className="grid grid-cols-6 gap-1">
                <button type="button" onClick={handleTranslateSelection} className="col-span-2 aspect-square bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center transition-all hover:bg-indigo-100 active:scale-90 border border-indigo-100/50 shadow-sm" title="Dịch Tiếng Việt">
                    <Languages size={15}/>
                </button>
                <button type="button" onClick={handleDefineSelection} className="col-span-2 aspect-square bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center transition-all hover:bg-emerald-100 active:scale-90 border border-emerald-100/50 shadow-sm" title="Định nghĩa">
                    <Book size={15}/>
                </button>
                <button type="button" onClick={handleSpeakSelection} className="col-span-2 aspect-square bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center transition-all hover:bg-amber-100 active:scale-90 border border-amber-100/50 shadow-sm" title="Luyện nói (Mimic)">
                    <Mic size={15} />
                </button>
                <button type="button" onClick={() => handleReadSelection('en')} className="col-span-3 aspect-[3/2] bg-neutral-100 text-neutral-500 rounded-2xl flex items-center justify-center transition-all hover:bg-neutral-200 active:scale-95 border border-neutral-200/50" title="Nghe Tiếng Anh">
                    <BookOpen size={15} fill="currentColor"/>
                </button>
                <button type="button" onClick={() => handleReadSelection('vi')} className="col-span-3 aspect-[3/2] bg-rose-50 text-rose-400 rounded-2xl flex items-center justify-center transition-all hover:bg-rose-100 active:scale-95 border border-rose-100/50" title="Nghe Tiếng Việt">
                    <Volume2 size={15} />
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* FLOATING MENU (Chuột phải) */}
            {isOpen && menuPos && (
                <div 
                    className="fixed z-[2147483647] pointer-events-auto"
                    style={{ 
                        left: `${menuPos.x}px`, 
                        top: `${menuPos.y}px`, 
                        transform: menuPos.placement === 'top' 
                            ? 'translate(-50%, -100%) translateY(-10px)' 
                            : 'translate(-50%, 0) translateY(10px)' 
                    }}
                >
                    <CommandBox />
                    {/* Tooltip Arrow */}
                    <div className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 ${
                        menuPos.placement === 'top'
                            ? '-bottom-1 border-r border-b border-neutral-200'
                            : '-top-1 border-l border-t border-neutral-200'
                    }`} />
                </div>
            )}

            <div className="fixed bottom-0 left-6 z-[2147483646] flex flex-col items-start pointer-events-none">
                <div 
                    className="flex flex-col items-center pointer-events-auto group pb-0 pt-10" 
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <div className="relative">
                        {isOpen && !menuPos && (
                            <div className="absolute bottom-16 left-0 z-50 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 pb-2">
                                {message ? (
                                    <div className="bg-white p-5 rounded-[2.5rem] shadow-2xl border border-neutral-200 w-72 relative">
                                        <button onClick={() => { setIsOpen(false); setMessage(null); }} className="absolute top-4 right-4 p-1 text-neutral-300 hover:text-neutral-900 rounded-full transition-colors"><X size={14}/></button>
                                        <div className="flex items-start gap-3">
                                            <div className="shrink-0 mt-1">{message.icon || <MessageSquare size={18} className="text-neutral-400"/>}</div>
                                            <div className="text-xs font-medium text-neutral-700 leading-relaxed [&_strong]:font-black [&_strong]:text-neutral-900 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: message.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                        </div>
                                    </div>
                                ) : (
                                    <CommandBox />
                                )}
                            </div>
                        )}

                        <button 
                            type="button" 
                            onClick={() => isAudioPlaying && stopSpeaking()} 
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 transform active:scale-90 shadow-2xl relative z-10 ${avatarInfo.bg} ${isOpen ? 'ring-4 ring-white shadow-indigo-500/20' : 'hover:scale-110 mb-1'}`}
                        >
                            {isThinking ? (
                                <div className="text-neutral-400 animate-spin"><RotateCw size={20} /></div>
                            ) : (
                                <div className="relative w-10 h-10 flex items-center justify-center pointer-events-none">
                                    <img src={avatarInfo.url} className={`w-full h-full object-contain ${isAudioPlaying ? 'scale-110' : ''}`} alt="Coach" />
                                    {isAudioPlaying && (
                                        <div className="absolute inset-0 bg-neutral-900/60 rounded-xl flex items-center justify-center animate-in fade-in duration-200">
                                            <Square size={16} fill="white" className="text-white" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </button>
                    </div>

                    {/* RIGHT CLICK TOGGLE (Bên dưới coach - Bé xíu) */}
                    <button 
                        onClick={toggleRightClickFeature}
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300 transform shadow-sm hover:scale-110 active:scale-90 opacity-0 group-hover:opacity-100 ${config.interface.rightClickCommandEnabled ? 'bg-indigo-600 text-white shadow-indigo-500/30' : 'bg-white text-neutral-400 border border-neutral-100'}`}
                        title={config.interface.rightClickCommandEnabled ? "Disable Right-Click Commands" : "Enable Right-Click Commands"}
                    >
                        <MousePointer2 size={10} fill={config.interface.rightClickCommandEnabled ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>

            {mimicTarget && (
                <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />
            )}
        </>
    );
};
