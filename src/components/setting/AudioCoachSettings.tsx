
import React, { useState, useEffect } from 'react';
import { Save, ChevronDown, CheckCircle2, AlertCircle, Hash, RefreshCw, Info, GraduationCap, School, User as UserIcon, Bot, Play, Globe, Volume2, Mic } from 'lucide-react';
import { SystemConfig, CoachConfig, saveConfig } from '../../app/settingsManager';
import { fetchServerVoices, ServerVoicesResponse, speak, VoiceDefinition } from '../../utils/audio';

interface AudioCoachSettingsProps {
    config: SystemConfig;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onSaveSettings: () => void;
}

const AVATAR_OPTIONS = [
    { id: 'woman_teacher', label: 'Ms. Learn', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Woman%20Teacher.png', bg: 'bg-indigo-50' },
    { id: 'man_teacher', label: 'Mr. Teach', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Man%20Teacher.png', bg: 'bg-blue-50' },
    { id: 'fox', label: 'Vix (Fox)', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png', bg: 'bg-orange-100' },
    { id: 'koala', label: 'Nami (Koala)', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png', bg: 'bg-teal-100' },
    { id: 'pet', label: 'Mochi (Cat)', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png', bg: 'bg-pink-100' },
    { id: 'owl', label: 'Hootie (Owl)', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png', bg: 'bg-yellow-100' },
    { id: 'panda', label: 'Bamboo (Panda)', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png', bg: 'bg-emerald-100' },
    { id: 'unicorn', label: 'Spark (Unicorn)', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png', bg: 'bg-purple-100' }
];

const VoiceSelector: React.FC<{
    label: string;
    langCode: 'en' | 'vi';
    currentVoice: string;
    serverData: ServerVoicesResponse | null;
    onChange: (voiceName: string, accentCode: string) => void;
    onPreview: (voice: string, accent: string) => void;
}> = ({ label, langCode, currentVoice, serverData, onChange, onPreview }) => {
    if (!serverData) {
        return (
            <div className="space-y-1 opacity-50">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">{label}</label>
                <div className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-bold text-neutral-400">
                    Offline
                </div>
            </div>
        );
    }
    
    const filteredVoices = serverData.voices.filter(v => 
        v.language === langCode || v.language.toLowerCase().startsWith(langCode)
    );
    
    const accentsMap = filteredVoices.reduce((acc, voice) => {
        const accentKey = voice.accent || 'Standard';
        if (!acc[accentKey]) acc[accentKey] = [];
        acc[accentKey].push(voice);
        return acc;
    }, {} as Record<string, VoiceDefinition[]>);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const voiceName = e.target.value;
        if (!voiceName) {
            const defaultAccent = langCode === 'en' ? 'en_US' : 'vi_VN';
            onChange('', defaultAccent);
            onPreview('', defaultAccent); 
            return;
        }

        const foundVoice = filteredVoices.find(v => v.name === voiceName);
        if (foundVoice) {
            onChange(foundVoice.name, foundVoice.accent);
            setTimeout(() => onPreview(foundVoice.name, foundVoice.accent), 100);
        }
    };

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{label}</label>
                <button 
                    type="button"
                    onClick={() => onPreview(currentVoice, langCode === 'en' ? 'en_US' : 'vi_VN')} 
                    className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:underline"
                >
                    <Play size={10} fill="currentColor"/> Test
                </button>
            </div>
            <div className="relative">
                <select 
                    value={currentVoice} 
                    onChange={handleChange} 
                    className="w-full appearance-none bg-white border border-neutral-100 rounded-xl px-4 py-2 pr-10 text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                >
                    <option value="">Default OS</option>
                    {(Object.entries(accentsMap) as [string, VoiceDefinition[]][]).map(([accentCode, voices]) => (
                        <optgroup key={accentCode} label={accentCode.replace(/[_]/g, ' ').toUpperCase()}>
                            {voices.map(v => (
                                <option key={v.name} value={v.name}>
                                    {v.name}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 pointer-events-none" />
            </div>
        </div>
    );
};

const CoachCard: React.FC<{
    type: 'male' | 'female';
    config: CoachConfig;
    serverData: ServerVoicesResponse | null;
    onUpdate: (updates: Partial<CoachConfig>) => void;
    isActive: boolean;
}> = ({ type, config, serverData, onUpdate, isActive }) => {
    
    const handleVoicePreview = (lang: 'en' | 'vi', voice?: string, accent?: string) => {
        const text = lang === 'en' ? "This is a sample of my voice." : "Đây là mẫu giọng nói của mình.";
        speak(text, true, lang, voice, accent);
    };

    return (
        <div className={`p-6 rounded-[2rem] border-2 transition-all space-y-5 ${isActive ? 'bg-white border-neutral-900 shadow-md scale-[1.02]' : 'bg-neutral-50/50 border-neutral-100 opacity-60'}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${isActive ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-400'}`}>
                        <UserIcon size={18} />
                    </div>
                    <span className="text-sm font-black uppercase tracking-widest">{type} Coach</span>
                </div>
                {isActive && <span className="px-2 py-0.5 bg-green-50 text-white rounded text-[8px] font-black uppercase tracking-widest">Active</span>}
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Display Name</label>
                    <input 
                        type="text" 
                        value={config.name} 
                        onChange={(e) => onUpdate({ name: e.target.value })}
                        placeholder="e.g. Victor"
                        className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Avatar Identity</label>
                    <div className="flex flex-wrap gap-2">
                        {AVATAR_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => onUpdate({ avatar: opt.id })}
                                className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all p-1 ${config.avatar === opt.id ? 'border-neutral-900 bg-white' : 'border-transparent bg-neutral-100 opacity-50'}`}
                            >
                                <img src={opt.url} className="w-full h-full object-contain" alt={opt.label} />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Persona</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            type="button"
                            onClick={() => onUpdate({ persona: 'friendly_elementary' })}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${config.persona === 'friendly_elementary' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
                        >
                            <School size={14}/> <span>Teacher</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => onUpdate({ persona: 'professional_professor' })}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${config.persona === 'professional_professor' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
                        >
                            <GraduationCap size={14}/> <span>Professor</span>
                        </button>
                    </div>
                </div>

                <VoiceSelector 
                    label="English Voice" 
                    langCode="en" 
                    currentVoice={config.enVoice} 
                    serverData={serverData} 
                    onChange={(v, a) => onUpdate({ enVoice: v, enAccent: a })} 
                    onPreview={(v, a) => handleVoicePreview('en', v, a)}
                />

                <VoiceSelector 
                    label="Vietnamese Voice" 
                    langCode="vi" 
                    currentVoice={config.viVoice} 
                    serverData={serverData} 
                    onChange={(v, a) => onUpdate({ viVoice: v, viAccent: a })} 
                    onPreview={(v, a) => handleVoicePreview('vi', v, a)}
                />
            </div>
        </div>
    );
};

export const AudioCoachSettings: React.FC<AudioCoachSettingsProps> = ({ config, onConfigChange, onSaveSettings }) => {
    const [serverData, setServerData] = useState<ServerVoicesResponse | null>(null);
    const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

    const checkServers = async () => {
        // Check TTS Server
        setServerStatus('checking');
        const data = await fetchServerVoices(config.audioCoach.serverPort);
        if (data) {
            setServerData(data);
            setServerStatus('connected');
        } else {
            setServerStatus('disconnected');
            setServerData(null);
        }
    };

    useEffect(() => {
        checkServers();
    }, [config.audioCoach.serverPort]);

    const handleActiveCoachToggle = (type: 'male' | 'female') => {
        onConfigChange('audioCoach', 'activeCoach', type);
        const activeCoach = config.audioCoach.coaches[type];
        setTimeout(() => {
            speak(`I am now your active coach. Call me ${activeCoach.name}.`, true, 'en', activeCoach.enVoice, activeCoach.enAccent);
        }, 100);
    };

    const handleUpdateCoach = (type: 'male' | 'female', updates: Partial<CoachConfig>) => {
        const currentCoaches = { ...config.audioCoach.coaches };
        currentCoaches[type] = { ...currentCoaches[type], ...updates };
        onConfigChange('audioCoach', 'coaches', currentCoaches);
    };

    const handlePortChange = (field: 'serverPort', e: React.ChangeEvent<HTMLInputElement>) => {
        const port = parseInt(e.target.value, 10);
        if (!isNaN(port)) onConfigChange('audioCoach', field, port);
    };

    const handleLanguageChange = (lang: 'vi' | 'en') => {
        onConfigChange('interface', 'studyBuddyLanguage', lang);
    };

    const handleBuddyVoiceToggle = (enabled: boolean) => {
        onConfigChange('interface', 'buddyVoiceEnabled', enabled);
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Bot size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Audio Coach</h3>
                        <p className="text-xs text-neutral-400">Personalize your study companions.</p>
                    </div>
                </div>
                <button onClick={onSaveSettings} className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md"><Save size={14} /><span>Save</span></button>
            </div>

            <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-100 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                        {serverStatus === 'connected' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertCircle size={16} className="text-red-500" />}
                        <span className="text-xs font-black uppercase tracking-wider text-neutral-600">Local TTS Server</span>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" size={14} />
                            <input type="number" value={config.audioCoach.serverPort} onChange={(e) => handlePortChange('serverPort', e)} className="w-20 pl-8 pr-2 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none" placeholder="3000" />
                        </div>
                    </div>
                </div>
                <button onClick={checkServers} className="p-2.5 bg-white border border-neutral-200 text-neutral-500 rounded-xl hover:bg-neutral-50 transition-all shadow-sm"><RefreshCw size={16} /></button>
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
                            <Volume2 size={12}/> Dialogue Voice
                        </div>
                        <label onClick={() => handleBuddyVoiceToggle(!config.interface.buddyVoiceEnabled)} className="flex items-center justify-between px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-200 transition-all">
                            <div className="flex flex-col">
                                <span className="text-xs font-black text-neutral-700">Enable Dialogue</span>
                                <span className="text-[10px] text-neutral-500 font-medium">Read advice bubbles aloud</span>
                            </div>
                            <div className={`w-9 h-5 rounded-full transition-all flex items-center p-1 ${config.interface.buddyVoiceEnabled ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
                                <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${config.interface.buddyVoiceEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                        </label>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
                            <Mic size={12}/> STT Engine
                        </div>
                        <div className="px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-xl flex items-center justify-between">
                            <span className="text-xs font-black text-neutral-700 uppercase tracking-widest">
                                Browser (Native)
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border bg-emerald-50 text-emerald-700 border-emerald-200`}>
                                Connected
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="flex justify-between items-center px-1">
                     <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Active Companion</label>
                     <div className="flex bg-neutral-100 p-1 rounded-xl">
                        <button onClick={() => handleActiveCoachToggle('male')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${config.audioCoach.activeCoach === 'male' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}>Male</button>
                        <button onClick={() => handleActiveCoachToggle('female')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${config.audioCoach.activeCoach === 'female' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}>Female</button>
                     </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <CoachCard 
                        type="male" 
                        config={config.audioCoach.coaches.male} 
                        serverData={serverData} 
                        isActive={config.audioCoach.activeCoach === 'male'}
                        onUpdate={(u) => handleUpdateCoach('male', u)}
                    />
                    <CoachCard 
                        type="female" 
                        config={config.audioCoach.coaches.female} 
                        serverData={serverData} 
                        isActive={config.audioCoach.activeCoach === 'female'}
                        onUpdate={(u) => handleUpdateCoach('female', u)}
                    />
                </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
                <Info size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
                    Pronunciation practice uses your browser's built-in recognition engine for maximum compatibility and privacy.
                </p>
            </div>
        </section>
    );
};
