
import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Table, List, Eye, MessageSquare, Bot } from 'lucide-react';
import { DEFAULT_VISIBILITY } from '../word_lib/WordTable_UI';
import { getConfig, saveConfig, SystemConfig } from '../../app/settingsManager';

interface InterfaceSettingsProps {
}

const ToggleSwitch = ({ checked, onChange, label, subLabel }: { checked: boolean; onChange: (c: boolean) => void; label: string; subLabel?: string }) => (
    <label onClick={(e) => { e.preventDefault(); onChange(!checked); }} className="flex items-center justify-between px-4 py-3 cursor-pointer group hover:bg-neutral-50 rounded-xl transition-all border border-transparent hover:border-neutral-100">
        <div className="flex flex-col">
            <span className="text-xs font-bold text-neutral-700 group-hover:text-neutral-900">{label}</span>
            {subLabel && <span className="text-[10px] text-neutral-400 font-medium">{subLabel}</span>}
        </div>
        <div className={`w-9 h-5 rounded-full transition-all flex items-center p-1 ${checked ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
            <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
    </label>
);

const AvatarOption = ({ id, label, selected, onClick, url, bgColor }: { id: string, label: string, selected: boolean, onClick: () => void, url: string, bgColor: string }) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${selected ? 'border-indigo-500 bg-indigo-50/50' : 'border-neutral-100 hover:border-neutral-200 bg-white'}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden ${bgColor}`}>
            <img src={url} alt={label} className="w-full h-full object-cover" />
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide ${selected ? 'text-indigo-700' : 'text-neutral-500'}`}>{label}</span>
    </button>
);

export const InterfaceSettings: React.FC<InterfaceSettingsProps> = () => {
    const [config, setConfig] = useState<SystemConfig>(getConfig());

    useEffect(() => {
        const handleConfigUpdate = () => setConfig(getConfig());
        window.addEventListener('config-updated', handleConfigUpdate);
        return () => window.removeEventListener('config-updated', handleConfigUpdate);
    }, []);

    // Library Table Defaults
    const [libVis, setLibVis] = useState(() => {
        try {
            const stored = localStorage.getItem('ielts_pro_library_view_settings');
            return stored ? { ...DEFAULT_VISIBILITY, ...JSON.parse(stored) } : DEFAULT_VISIBILITY;
        } catch { return DEFAULT_VISIBILITY; }
    });

    // Unit List Defaults
    const [unitVis, setUnitVis] = useState(() => {
        try {
            const stored = localStorage.getItem('ielts_pro_unit_visibility');
            return stored ? JSON.parse(stored) : { showDesc: false, showWords: true, showStatus: true };
        } catch { return { showDesc: false, showWords: true, showStatus: true }; }
    });

    // Word Detail View Defaults
    const [wordViewVis, setWordViewVis] = useState(() => {
        const defaultSettings = { showHidden: false, highlightFailed: true, isLearnView: true };
        try {
            const stored = localStorage.getItem('ielts_pro_word_view_settings');
            return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
        } catch { return defaultSettings; }
    });

    // Handlers
    const handleLibVisChange = (key: string, val: boolean) => {
        const newVal = { ...libVis, [key]: val };
        setLibVis(newVal);
        localStorage.setItem('ielts_pro_library_view_settings', JSON.stringify(newVal));
    };

    const handleUnitVisChange = (key: string, val: boolean) => {
        const newVal = { ...unitVis, [key]: val };
        setUnitVis(newVal);
        localStorage.setItem('ielts_pro_unit_visibility', JSON.stringify(newVal));
    };

    const handleWordViewVisChange = (key: string, val: boolean) => {
        const newVal = { ...wordViewVis, [key]: val };
        setWordViewVis(newVal);
        localStorage.setItem('ielts_pro_word_view_settings', JSON.stringify(newVal));
    };

    const handleLanguageChange = (lang: 'vi' | 'en') => {
        const newConfig: SystemConfig = {
            ...config,
            interface: { ...config.interface, studyBuddyLanguage: lang }
        };
        saveConfig(newConfig);
    };

    const handleBuddyToggle = (enabled: boolean) => {
        const newConfig: SystemConfig = {
            ...config,
            interface: { ...config.interface, studyBuddyEnabled: enabled }
        };
        saveConfig(newConfig);
    };

    const handleAvatarChange = (avatar: any) => {
        const newConfig: SystemConfig = {
            ...config,
            interface: { ...config.interface, studyBuddyAvatar: avatar }
        };
        saveConfig(newConfig);
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8 animate-in fade-in duration-300">
            
            {/* Header */}
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl"><LayoutTemplate size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Interface Defaults</h3>
                    <p className="text-xs text-neutral-400">Customize what you see across the app.</p>
                </div>
            </div>

            {/* Study Buddy Configuration */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><Bot size={12}/> Study Buddy Configuration</div>
                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 space-y-4">
                    <ToggleSwitch 
                        checked={config.interface.studyBuddyEnabled} 
                        onChange={handleBuddyToggle} 
                        label="Enable Study Buddy" 
                        subLabel="Shows helpful tips and motivation"
                    />
                    
                    {config.interface.studyBuddyEnabled && (
                        <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                             <label className="block text-xs font-bold text-neutral-500 mb-2 px-1">Avatar Style</label>
                             <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                <AvatarOption 
                                    id="fox" 
                                    label="Vix" 
                                    selected={config.interface.studyBuddyAvatar === 'fox'} 
                                    onClick={() => handleAvatarChange('fox')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Fox.png`}
                                    bgColor="bg-orange-100"
                                />
                                <AvatarOption 
                                    id="koala" 
                                    label="Nami" 
                                    selected={config.interface.studyBuddyAvatar === 'koala'} 
                                    onClick={() => handleAvatarChange('koala')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Koala.png`}
                                    bgColor="bg-teal-100"
                                />
                                <AvatarOption 
                                    id="bunny" 
                                    label="Hops" 
                                    selected={config.interface.studyBuddyAvatar === 'bunny'} 
                                    onClick={() => handleAvatarChange('bunny')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Rabbit%20Face.png`}
                                    bgColor="bg-rose-100"
                                />
                                <AvatarOption 
                                    id="lion" 
                                    label="Leo" 
                                    selected={config.interface.studyBuddyAvatar === 'lion'} 
                                    onClick={() => handleAvatarChange('lion')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Lion.png`}
                                    bgColor="bg-amber-100"
                                />
                                <AvatarOption 
                                    id="panda" 
                                    label="Bamboo" 
                                    selected={config.interface.studyBuddyAvatar === 'panda'} 
                                    onClick={() => handleAvatarChange('panda')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Panda.png`}
                                    bgColor="bg-emerald-100"
                                />
                                <AvatarOption 
                                    id="unicorn" 
                                    label="Spark" 
                                    selected={config.interface.studyBuddyAvatar === 'unicorn'} 
                                    onClick={() => handleAvatarChange('unicorn')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Unicorn.png`}
                                    bgColor="bg-purple-100"
                                />
                                <AvatarOption 
                                    id="chicken" 
                                    label="Nugget" 
                                    selected={config.interface.studyBuddyAvatar === 'chicken'} 
                                    onClick={() => handleAvatarChange('chicken')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Chicken.png`}
                                    bgColor="bg-yellow-100"
                                />
                                <AvatarOption 
                                    id="pet" 
                                    label="Mochi" 
                                    selected={config.interface.studyBuddyAvatar === 'pet'} 
                                    onClick={() => handleAvatarChange('pet')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Cat%20Face.png`}
                                    bgColor="bg-pink-100"
                                />
                                <AvatarOption 
                                    id="owl" 
                                    label="Hootie" 
                                    selected={config.interface.studyBuddyAvatar === 'owl'} 
                                    onClick={() => handleAvatarChange('owl')}
                                    url={`https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Owl.png`}
                                    bgColor="bg-yellow-100"
                                />
                                <AvatarOption 
                                    id="robot" 
                                    label="Zeta" 
                                    selected={config.interface.studyBuddyAvatar === 'robot'} 
                                    onClick={() => handleAvatarChange('robot')}
                                    url={`https://api.dicebear.com/7.x/bottts/svg?seed=Buddy`}
                                    bgColor="bg-indigo-100"
                                />
                             </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <label className="block text-xs font-bold text-neutral-500 mb-2 px-1">Language</label>
                        <div className="bg-white p-1 rounded-xl flex w-full md:w-64 border border-neutral-200">
                            <button 
                                onClick={() => handleLanguageChange('vi')}
                                className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${config.interface.studyBuddyLanguage === 'vi' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                            >
                                Tiếng Việt
                            </button>
                            <button 
                                onClick={() => handleLanguageChange('en')}
                                className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${config.interface.studyBuddyLanguage === 'en' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                            >
                                English
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Library Table Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><Table size={12}/> Word Library Columns</div>
                <div className="bg-white border border-neutral-200 rounded-2xl p-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <ToggleSwitch checked={libVis.showMeaning} onChange={(v) => handleLibVisChange('showMeaning', v)} label="Definition / Meaning" />
                    <ToggleSwitch checked={libVis.blurMeaning} onChange={(v) => handleLibVisChange('blurMeaning', v)} label="Blur Definition (Spoiler)" subLabel="Hide meaning until hovered" />
                    <ToggleSwitch checked={libVis.showIPA} onChange={(v) => handleLibVisChange('showIPA', v)} label="IPA Phonetic" />
                    <ToggleSwitch checked={libVis.showProgress} onChange={(v) => handleLibVisChange('showProgress', v)} label="Progress Badge" />
                    <ToggleSwitch checked={libVis.showDue} onChange={(v) => handleLibVisChange('showDue', v)} label="Due Date" />
                    <ToggleSwitch checked={libVis.showAiIcon} onChange={(v) => handleLibVisChange('showAiIcon', v)} label="AI Refined Indicator" />
                    <ToggleSwitch checked={libVis.showComplexity} onChange={(v) => handleLibVisChange('showComplexity', v)} label="Complexity Column" />
                </div>
            </div>

            {/* Unit List Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><List size={12}/> Essay / Unit List Columns</div>
                <div className="bg-white border border-neutral-200 rounded-2xl p-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <ToggleSwitch checked={unitVis.showDesc} onChange={(v) => handleUnitVisChange('showDesc', v)} label="Description" />
                    <ToggleSwitch checked={unitVis.showWords} onChange={(v) => handleUnitVisChange('showWords', v)} label="Word Count" />
                    <ToggleSwitch checked={unitVis.showStatus} onChange={(v) => handleUnitVisChange('showStatus', v)} label="Completion Status" />
                </div>
            </div>

            {/* Word Detail View Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><Eye size={12}/> Word Detail View</div>
                <div className="bg-white border border-neutral-200 rounded-2xl p-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <ToggleSwitch checked={wordViewVis.isLearnView} onChange={(v) => handleWordViewVisChange('isLearnView', v)} label="Learn View by Default" subLabel="Hides extra info like examples, tags" />
                    <ToggleSwitch checked={wordViewVis.highlightFailed} onChange={(v) => handleWordViewVisChange('highlightFailed', v)} label="Highlight Failed Tests" subLabel="Red highlight for failed drill items" />
                    <ToggleSwitch checked={wordViewVis.showHidden} onChange={(v) => handleWordViewVisChange('showHidden', v)} label="Show Ignored Items" subLabel="Show ignored collocations/family members" />
                </div>
            </div>

        </section>
    );
};
