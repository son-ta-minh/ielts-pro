
import React, { useEffect, useRef, useState } from 'react';
import { Save, ChevronDown, CheckCircle2, AlertCircle, RefreshCw, Info, GraduationCap, School, User as UserIcon, Bot, Play, Volume2, Mic, Link, Edit3, Star, Brain, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { SystemConfig, CoachConfig, getServerUrl, saveConfig } from '../../app/settingsManager';
import { fetchServerVoices, ServerVoicesResponse, speak, VoiceDefinition, resetAudioProtocolCache } from '../../utils/audio';
import { AvatarSelectionModal } from '../common/AvatarSelectionModal';
import { StudyBuddyImageSettings, StudyBuddyMemoryChunk, User } from '../../app/types';
import { useToast } from '../../contexts/ToastContext';
import {
    STUDY_BUDDY_IMAGE_ASPECT_OPTIONS,
    STUDY_BUDDY_IMAGE_BASE_NEGATIVE,
    STUDY_BUDDY_IMAGE_PRESETS,
    normalizeStudyBuddyImageSettings
} from '../../utils/studyBuddyImageUtils';

interface AudioCoachSettingsProps {
    config: SystemConfig;
    user: User;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onSaveSettings: () => void;
    onUpdateUser: (user: User) => Promise<void>;
}

const VoiceSelector: React.FC<{
    label: string;
    langCode: 'en' | 'vi';
    currentVoice: string;
    serverData: ServerVoicesResponse | null;
    onChange: (voiceName: string, accentCode: string) => void;
    onPreview: (voice: string, accent: string) => void;
    filterHighQuality: boolean;
}> = ({ label, langCode, currentVoice, serverData, onChange, onPreview, filterHighQuality }) => {
    if (!serverData) {
        return (
            <div className="space-y-1 opacity-50">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">{label}</label>
                <div className="w-full bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-bold text-neutral-400">
                    Server Offline
                </div>
            </div>
        );
    }
    
    const filteredVoices = serverData.voices.filter(v => {
        const langMatch = v.language === langCode || v.language.toLowerCase().startsWith(langCode);
        if (!langMatch) return false;
        
        if (filterHighQuality) {
            return v.name.includes('Enhanced') || v.name.includes('Premium');
        }
        return true;
    });
    
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

        if (voiceName === 'Random') {
            const defaultAccent = langCode === 'en' ? 'en_US' : 'vi_VN';
            // Keep the same value as the <option> so the combobox remains selected
            onChange('Random', defaultAccent);
            return;
        }

        // Search in the original full list to ensure we find it even if filtered out visually (edge case)
        const foundVoice = serverData.voices.find(v => v.name === voiceName);
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
                    className="w-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-3 pr-10 text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                >
                    <option value="">Default System Voice</option>
                    <option value="Random">Random High Quality Voice</option>

                    {(Object.entries(accentsMap) as [string, VoiceDefinition[]][]).map(([accentCode, voices]) => (
                        <optgroup key={accentCode} label={accentCode.replace(/[_]/g, ' ').toUpperCase()}>
                            {voices.map(v => (
                                <option key={v.name} value={v.name}>
                                    {v.name}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                    {filteredVoices.length === 0 && (
                        <option disabled>No {filterHighQuality ? 'high quality ' : ''}voices found</option>
                    )}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>
        </div>
    );
};

export const AudioCoachSettings: React.FC<AudioCoachSettingsProps> = ({ config, user, onConfigChange, onSaveSettings, onUpdateUser }) => {
    const [serverData, setServerData] = useState<ServerVoicesResponse | null>(null);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [onlyHighQuality, setOnlyHighQuality] = useState(false);
    const [memoryDrafts, setMemoryDrafts] = useState<StudyBuddyMemoryChunk[]>(user.studyBuddyMemory || []);
    const [imageSettingsDraft, setImageSettingsDraft] = useState<StudyBuddyImageSettings>(normalizeStudyBuddyImageSettings(user.studyBuddyImageSettings));
    const { showToast } = useToast();
    const imageSectionRef = useRef<HTMLDivElement | null>(null);
    const memorySectionRef = useRef<HTMLDivElement | null>(null);
    
    const fullUrl = getServerUrl(config);
    const activeType = config.audioCoach.activeCoach; 
    // We treat the currently active coach as the "single" coach in this UI.
    const coachConfig = config.audioCoach.coaches[activeType];

    const checkServers = async () => {
        resetAudioProtocolCache(); 
        const data = await fetchServerVoices(fullUrl);
        setServerData(data || null);
    };

    useEffect(() => {
        checkServers();
    }, [fullUrl]);

    useEffect(() => {
        setMemoryDrafts(user.studyBuddyMemory || []);
    }, [user.studyBuddyMemory]);

    useEffect(() => {
        setImageSettingsDraft(normalizeStudyBuddyImageSettings(user.studyBuddyImageSettings));
    }, [user.studyBuddyImageSettings]);

    useEffect(() => {
        const section = sessionStorage.getItem('vocab_pro_audio_coach_section');
        if (!section) return;
        sessionStorage.removeItem('vocab_pro_audio_coach_section');
        window.setTimeout(() => {
            if (section === 'image') {
                imageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (section === 'memory') {
                memorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 120);
    }, []);

    // Enhanced handler with Auto-Save capability
    const handleUpdateCoach = (updates: Partial<CoachConfig>, shouldPersist = false) => {
        // 1. Update Parent UI State (Immediate Feedback)
        const currentCoaches = { ...config.audioCoach.coaches };
        currentCoaches[activeType] = { ...currentCoaches[activeType], ...updates };
        onConfigChange('audioCoach', 'coaches', currentCoaches);

        // 2. Persist to Storage (Syncs with StudyBuddy)
        if (shouldPersist) {
            const newConfig = { 
                ...config, 
                audioCoach: { 
                    ...config.audioCoach, 
                    coaches: currentCoaches 
                } 
            };
            saveConfig(newConfig);
            showToast('Settings saved automatically.', 'success', 1000);
        }
    };

    const handleBuddyVoiceToggle = (enabled: boolean) => {
        onConfigChange('interface', 'buddyVoiceEnabled', enabled);
        // Auto-save this toggle
        const newConfig = { ...config, interface: { ...config.interface, buddyVoiceEnabled: enabled } };
        saveConfig(newConfig);
    };

    const handleVoicePreview = (lang: 'en' | 'vi', voice?: string, accent?: string) => {
        const text = lang === 'en' 
            ? "Hello! I am your study companion. Ready to learn?" 
            : "Xin chào! Mình là bạn đồng hành của bạn. Sẵn sàng chưa?";
        speak(text, true, lang, voice, accent);
    };

    // Dummy user object to unlock all avatars in the modal for the coach
    const dummyUserForModal = {
        id: 'coach-setup',
        name: coachConfig.name,
        avatar: coachConfig.avatar,
        level: 999, // Unlock all levels
        peakLevel: 999,
        experience: 0,
        lastLogin: 0,
        adventure: {}
    } as User;

    const persistMemoryDrafts = async (nextDrafts: StudyBuddyMemoryChunk[]) => {
        setMemoryDrafts(nextDrafts);
        await onUpdateUser({
            ...user,
            studyBuddyMemory: nextDrafts
        });
    };

    const persistImageSettingsDraft = async (nextDrafts: StudyBuddyImageSettings) => {
        setImageSettingsDraft(nextDrafts);
        await onUpdateUser({
            ...user,
            studyBuddyImageSettings: nextDrafts
        });
    };

    const updateImageSettings = async (patch: Partial<StudyBuddyImageSettings>) => {
        const nextDrafts = normalizeStudyBuddyImageSettings({
            ...imageSettingsDraft,
            ...patch
        });
        await persistImageSettingsDraft(nextDrafts);
    };

    const handleAddMemory = async () => {
        const nextDrafts = [
            {
                id: `sbmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: '',
                createdAt: Date.now(),
                source: 'manual' as const,
            },
            ...memoryDrafts
        ];
        await persistMemoryDrafts(nextDrafts);
    };

    const handleChangeMemoryText = async (memoryId: string, text: string) => {
        const nextDrafts = memoryDrafts.map((chunk) =>
            chunk.id === memoryId ? { ...chunk, text } : chunk
        );
        setMemoryDrafts(nextDrafts);
    };

    const handleBlurMemory = async () => {
        const cleaned = memoryDrafts
            .map((chunk) => ({ ...chunk, text: chunk.text.trim() }))
            .filter((chunk) => chunk.text);
        await persistMemoryDrafts(cleaned);
    };

    const handleDeleteMemory = async (memoryId: string) => {
        const nextDrafts = memoryDrafts.filter((chunk) => chunk.id !== memoryId);
        await persistMemoryDrafts(nextDrafts);
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Bot size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Audio Coach</h3>
                        <p className="text-xs text-neutral-400">Customize your AI study companion.</p>
                    </div>
                </div>
                <button onClick={onSaveSettings} className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md"><Save size={14} /><span>Save</span></button>
            </div>

            {/* Enable Dialogue Toggle */}
            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">
                        <Volume2 size={12}/> Interaction
                    </div>
                    <label onClick={() => handleBuddyVoiceToggle(!config.interface.buddyVoiceEnabled)} className="flex items-center justify-between px-4 py-4 bg-white border border-neutral-200 rounded-2xl cursor-pointer hover:bg-neutral-50 transition-all shadow-sm group">
                        <div className="flex flex-col">
                            <span className="text-sm font-black text-neutral-900">Enable Dialogue</span>
                            <span className="text-xs text-neutral-500 font-medium mt-0.5">Read advice, tips, and greetings aloud</span>
                        </div>
                        <div className={`w-11 h-6 rounded-full transition-all flex items-center p-1 ${config.interface.buddyVoiceEnabled ? 'bg-indigo-600' : 'bg-neutral-200'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300 ${config.interface.buddyVoiceEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </label>
                </div>
            </div>

            {/* Coach Identity Section */}
            <div className="space-y-6 pt-4 border-t border-neutral-100">
                <div className="flex items-center justify-between px-1">
                     <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><UserIcon size={12}/> Coach Identity</label>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                    {/* Avatar Preview */}
                    <div className="shrink-0 flex justify-center md:justify-start">
                        <div className="relative group w-24 h-24">
                            <div className="w-full h-full rounded-[2rem] bg-neutral-100 border-2 border-neutral-200 p-2 overflow-hidden shadow-sm relative">
                                <img src={coachConfig.avatar} className="w-full h-full object-contain" alt="Coach Avatar" />
                                
                                {/* Overlay Edit Button */}
                                <div 
                                    onClick={() => setIsAvatarModalOpen(true)}
                                    className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                                >
                                    <div className="bg-white p-2 rounded-xl shadow-sm">
                                        <Edit3 size={16} className="text-neutral-900" />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Persistent corner indicator */}
                            <button 
                                onClick={() => setIsAvatarModalOpen(true)}
                                className="absolute bottom-0 right-0 translate-x-1 translate-y-1 p-1.5 bg-neutral-900 text-white rounded-lg shadow-md hover:scale-110 transition-transform group-hover:opacity-0"
                                title="Change Avatar"
                            >
                                <Edit3 size={10} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1">Name</label>
                            <input 
                                type="text" 
                                value={coachConfig.name} 
                                onChange={(e) => handleUpdateCoach({ name: e.target.value })}
                                onBlur={() => handleUpdateCoach({}, true)} // Auto-save on blur
                                placeholder="Coach Name"
                                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1">Persona Style</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    type="button"
                                    onClick={() => handleUpdateCoach({ persona: 'friendly_elementary' }, true)}
                                    className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${coachConfig.persona === 'friendly_elementary' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'}`}
                                >
                                    <School size={18}/> 
                                    <span className="text-[10px] font-black uppercase">Teacher</span>
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => handleUpdateCoach({ persona: 'professional_professor' }, true)}
                                    className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${coachConfig.persona === 'professional_professor' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'}`}
                                >
                                    <GraduationCap size={18}/> 
                                    <span className="text-[10px] font-black uppercase">Professor</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Voices Section */}
            <div className="space-y-6 pt-4 border-t border-neutral-100">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                        <Mic size={12}/> Voice Settings
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer group select-none">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${onlyHighQuality ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-neutral-300 group-hover:border-indigo-400'}`}>
                            {onlyHighQuality && <Star size={10} className="text-white" fill="currentColor" />}
                        </div>
                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={onlyHighQuality}
                            onChange={(e) => setOnlyHighQuality(e.target.checked)}
                        />
                        <span className={`text-[10px] font-bold transition-colors ${onlyHighQuality ? 'text-indigo-700' : 'text-neutral-500'}`}>Only High Quality</span>
                    </label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <VoiceSelector 
                        label="English Voice" 
                        langCode="en" 
                        currentVoice={coachConfig.enVoice} 
                        serverData={serverData} 
                        onChange={(v, a) => handleUpdateCoach({ enVoice: v, enAccent: a }, true)} 
                        onPreview={(v, a) => handleVoicePreview('en', v, a)}
                        filterHighQuality={onlyHighQuality}
                    />

                    <VoiceSelector 
                        label="Vietnamese Voice" 
                        langCode="vi" 
                        currentVoice={coachConfig.viVoice} 
                        serverData={serverData} 
                        onChange={(v, a) => handleUpdateCoach({ viVoice: v, viAccent: a }, true)} 
                        onPreview={(v, a) => handleVoicePreview('vi', v, a)}
                        filterHighQuality={onlyHighQuality}
                    />
                </div>
            </div>

            <div className="space-y-6 pt-4 border-t border-neutral-100">
                <div ref={imageSectionRef} className="space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                            <ImageIcon size={12}/> Image Settings
                        </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4 md:col-span-2">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">Reject Unsafe Mode</p>
                                    <p className="text-[10px] text-neutral-500">Block unsafe generations before image output.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void updateImageSettings({ safeMode: !imageSettingsDraft.safeMode })}
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                                        imageSettingsDraft.safeMode
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                                    }`}
                                >
                                    <span>{imageSettingsDraft.safeMode ? 'On' : 'Off'}</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">Preset</p>
                                    <p className="text-[10px] text-neutral-500">Quick quality profile.</p>
                                </div>
                                <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1">
                                    <button
                                        type="button"
                                        onClick={() => void updateImageSettings({ presetMode: 'auto' })}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${imageSettingsDraft.presetMode === 'auto' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                                    >
                                        Auto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void updateImageSettings({ presetMode: 'manual' })}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${imageSettingsDraft.presetMode === 'manual' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                                    >
                                        Manual
                                    </button>
                                </div>
                            </div>
                            {imageSettingsDraft.presetMode === 'manual' ? (
                                <select
                                    value={imageSettingsDraft.preset}
                                    onChange={(e) => void updateImageSettings({ preset: e.target.value as StudyBuddyImageSettings['preset'] })}
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                                >
                                    {Object.entries(STUDY_BUDDY_IMAGE_PRESETS).map(([key, value]) => (
                                        <option key={key} value={key}>
                                            {value.label} ({value.steps} steps / cfg {value.cfg})
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                        </div>

                        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">Aspect Ratio</p>
                                    <p className="text-[10px] text-neutral-500">Resolution template used for generated images.</p>
                                </div>
                                <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1">
                                    <button
                                        type="button"
                                        onClick={() => void updateImageSettings({ aspectRatioMode: 'auto' })}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${imageSettingsDraft.aspectRatioMode === 'auto' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                                    >
                                        Auto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void updateImageSettings({ aspectRatioMode: 'manual' })}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${imageSettingsDraft.aspectRatioMode === 'manual' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
                                    >
                                        Manual
                                    </button>
                                </div>
                            </div>
                            {imageSettingsDraft.aspectRatioMode === 'manual' ? (
                                <select
                                    value={imageSettingsDraft.aspectRatio}
                                    onChange={(e) => void updateImageSettings({ aspectRatio: e.target.value as StudyBuddyImageSettings['aspectRatio'] })}
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                                >
                                    {STUDY_BUDDY_IMAGE_ASPECT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label} ({option.width}x{option.height})
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                        </div>

                        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">Steps</p>
                                    <p className="text-[10px] text-neutral-500">15 fast, 20 balanced, 25 high quality, 30 ultra.</p>
                                </div>
                            </div>
                            <input
                                type="range"
                                min={15}
                                max={30}
                                step={1}
                                value={imageSettingsDraft.steps}
                                onChange={(e) => void updateImageSettings({ steps: Number(e.target.value), stepsMode: 'manual' })}
                                className="w-full"
                            />
                            <div className="flex items-center justify-between text-[11px] text-neutral-500">
                                <span>Fast</span>
                                <span className="font-black text-neutral-800">{imageSettingsDraft.steps}</span>
                                <span>Ultra</span>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">CFG</p>
                                    <p className="text-[10px] text-neutral-500">5 creative, 7 balanced, 9 strict.</p>
                                </div>
                            </div>
                            <input
                                type="range"
                                min={5}
                                max={9}
                                step={0.5}
                                value={imageSettingsDraft.cfg}
                                onChange={(e) => void updateImageSettings({ cfg: Number(e.target.value), cfgMode: 'manual' })}
                                className="w-full"
                            />
                            <div className="flex items-center justify-between text-[11px] text-neutral-500">
                                <span>Creative</span>
                                <span className="font-black text-neutral-800">{imageSettingsDraft.cfg}</span>
                                <span>Strict</span>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4 md:col-span-2">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-700">Negative Prompt</p>
                                <p className="text-[10px] text-neutral-500">Extra bans appended after the default safety baseline.</p>
                            </div>
                            <textarea
                                value={imageSettingsDraft.negativePrompt}
                                onChange={(e) => void updateImageSettings({ negativePrompt: e.target.value })}
                                rows={4}
                                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900"
                                placeholder={STUDY_BUDDY_IMAGE_BASE_NEGATIVE}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div ref={memorySectionRef} className="space-y-6 pt-4 border-t border-neutral-100">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                        <Brain size={12}/> AI Memory
                    </div>
                    <button
                        type="button"
                        onClick={handleAddMemory}
                        className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                        <Plus size={12} />
                        Add Memory
                    </button>
                </div>
                <div className="space-y-3">
                    {memoryDrafts.length ? memoryDrafts.map((chunk) => (
                        <div key={chunk.id} className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-3">
                            <textarea
                                value={chunk.text}
                                onChange={(e) => void handleChangeMemoryText(chunk.id, e.target.value)}
                                onBlur={() => void handleBlurMemory()}
                                rows={2}
                                placeholder="Memory chunk..."
                                className="min-h-[4.5rem] flex-1 resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition-colors focus:border-neutral-900"
                            />
                            <button
                                type="button"
                                onClick={() => void handleDeleteMemory(chunk.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                                title="Delete memory"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 px-4 py-4 text-sm text-neutral-500">
                            No AI memory yet. Add memory chunks here to help StudyBuddy remember long-term facts and preferences.
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-start gap-3">
                <Info size={16} className="text-neutral-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-neutral-500 leading-relaxed font-medium">
                    Pronunciation practice uses your browser's built-in recognition engine for maximum compatibility and privacy. The selected voices above are used for reading text aloud.
                </p>
            </div>

            <AvatarSelectionModal 
                isOpen={isAvatarModalOpen} 
                onClose={() => setIsAvatarModalOpen(false)} 
                onSelectAvatar={(url) => handleUpdateCoach({ avatar: url }, true)} 
                currentUser={dummyUserForModal} 
            />
        </section>
    );
};
