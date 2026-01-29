
import React, { useState, useEffect } from 'react';
import { Save, ChevronDown, CheckCircle2, AlertCircle, Hash, RefreshCw, Info, GraduationCap, School, User as UserIcon, Bot, Play, Globe } from 'lucide-react';
import { SystemConfig, CoachConfig, saveConfig } from '../../app/settingsManager';
import { fetchServerVoices, ServerVoicesResponse, speak, VoiceDefinition } from '../../utils/audio';

interface AudioCoachSettingsProps {
    config: SystemConfig;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onSaveSettings: () => void;
}

const AVATAR_OPTIONS = [
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
    onPreview: () => void;
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

    const filteredVoices = serverData.voices.filter(v => v.language === langCode);
    if (filteredVoices.length === 0) return null;

    // Group by accent for UI categorization
    const accentsMap = filteredVoices.reduce((acc, voice) => {
        if (!acc[voice.accent]) acc[voice.accent] = [];
        acc[voice.accent].push(voice);
        return acc;
    }, {} as Record<string, VoiceDefinition[]>);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const voiceName = e.target.value;
        if (!voiceName) {
            onChange('', langCode === 'en' ? 'en_US' : 'vi_VN');
            return;
        }

        const foundVoice = filteredVoices.find(v => v.name === voiceName);
        if (foundVoice) {
            onChange(foundVoice.name, foundVoice.accent);
            // Automatically trigger preview on change
            setTimeout(onPreview, 100);
        }
    };

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{label}</label>
                {currentVoice && (
                    <button onClick={onPreview} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:underline">
                        <Play size={10} fill="currentColor"/> Test
                    </button>
                )}
            </div>
            <div className="relative">
                <select 
                    value={currentVoice} 
                    onChange={handleChange} 
                    className="w-full appearance-none bg-white border border-neutral-100 rounded-xl px-4 py-2 pr-10 text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                >
                    <option value="">Default OS</option>
                    {(Object.entries(accentsMap) as [string, VoiceDefinition[]][]).map(([accentCode, voices]) => (
                        <optgroup key={accentCode} label={accentCode.replace('_', ' ').toUpperCase()}>
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
    
    const handleVoicePreview = (lang: 'en' | 'vi') => {
        const text = lang === 'en' ? "This is a sample of my new voice." : "Đây là mẫu giọng nói mới của mình.";
        speak(text);
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
                {/* Name Input */}
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

                {/* Avatar Selection */}
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

                {/* Persona Selection */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Persona</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => onUpdate({ persona: 'friendly_elementary' })}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${config.persona === 'friendly_elementary' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
                        >
                            <School size={14}/> <span>Teacher</span>
                        </button>
                        <button 
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
                    onPreview={() => handleVoicePreview('en')}
                />
            </div>
        </div>
    );
};

export const AudioCoachSettings: React.FC<AudioCoachSettingsProps> = ({ config, onConfigChange, onSaveSettings }) => {
    const [serverData, setServerData] = useState<ServerVoicesResponse | null>(null);
    const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

    const checkServer = async () => {
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
        checkServer();
    }, [config.audioCoach.serverPort]);

    const handleActiveCoachToggle = (type: 'male' | 'female') => {
        onConfigChange('audioCoach', 'activeCoach', type);
        const coachName = config.audioCoach.coaches[type].name;
        setTimeout(() => speak(`I am now your active coach. Call me ${coachName}.`), 100);
    };

    const handleUpdateCoach = (type: 'male' | 'female', updates: Partial<CoachConfig>) => {
        const currentCoaches = { ...config.audioCoach.coaches };
        currentCoaches[type] = { ...currentCoaches[type], ...updates };
        onConfigChange('audioCoach', 'coaches', currentCoaches);
    };

    const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const port = parseInt(e.target.value, 10);
        if (!isNaN(port)) onConfigChange('audioCoach', 'serverPort', port);
    };

    const handleLanguageChange = (lang: 'vi' | 'en') => {
        onConfigChange('interface', 'studyBuddyLanguage', lang);
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
                <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                        {serverStatus === 'connected' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertCircle size={16} className="text-red-500" />}
                        <span className="text-xs font-black uppercase tracking-wider text-neutral-600">Local TTS Engine</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-relaxed font-medium">Connects to macOS high-quality voices.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" size={14} />
                        <input type="number" value={config.audioCoach.serverPort} onChange={handlePortChange} className="w-24 pl-8 pr-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none" placeholder="3000" />
                    </div>
                    <button onClick={checkServer} className="p-2.5 bg-white border border-neutral-200 text-neutral-500 rounded-xl hover:bg-neutral-50 transition-all"><RefreshCw size={16} /></button>
                </div>
            </div>

            {/* Coach Language Toggle */}
            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
                    <Globe size={12}/> Coach Primary Language
                </div>
                <div className="flex bg-neutral-100 p-1 rounded-xl w-full max-w-xs border border-neutral-200">
                    <button 
                        onClick={() => handleLanguageChange('vi')}
                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${config.interface.studyBuddyLanguage === 'vi' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        Tiếng Việt
                    </button>
                    <button 
                        onClick={() => handleLanguageChange('en')}
                        className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${config.interface.studyBuddyLanguage === 'en' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                        English
                    </button>
                </div>
                <p className="text-[10px] text-neutral-400 px-1 font-medium italic">
                    Determines the language your coach uses for advice and feedback.
                </p>
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
                    Coaches automatically switch between your configured <b>English</b> and <b>Vietnamese</b> (System Default) voices based on the content they speak.
                </p>
            </div>
        </section>
    );
};
