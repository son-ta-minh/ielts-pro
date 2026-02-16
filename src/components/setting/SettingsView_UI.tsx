
import React from 'react';
import { CheckCircle2, ChevronDown, User, Bot, Settings2, AlertTriangle, LayoutTemplate, GraduationCap, Server } from 'lucide-react';
import { ProfileSettings } from './ProfileSettings';
import { AudioCoachSettings } from './AudioCoachSettings';
import { SrsSettings } from './SrsSettings';
import { GoalSettings } from './GoalSettings';
import { DangerZone } from './DangerZone';
import { ServerSettings } from './ServerSettings';
import { SystemConfig, DailyGoalConfig } from '../../app/settingsManager';

export type SettingView = 'PROFILE' | 'INTERFACE' | 'SERVER' | 'AUDIO_COACH' | 'LEARNING' | 'DANGER';

interface SettingsViewUIProps {
    // State
    currentView: SettingView;
    isDropdownOpen: boolean;
    notification: string | null;
    profileData: { name: string; avatar: string; role: string; currentLevel: string; target: string; nativeLanguage: string; };
    config: SystemConfig;
    isVoiceLoading: boolean;
    availableVoices: SpeechSynthesisVoice[];
    apiKeyInput: string;
    apiUsage: { count: number; date: string };
    mobileNavRef: React.RefObject<HTMLDivElement>;
    isApplyingAccent: boolean;
    isAdmin: boolean;
    
    // Handlers
    setCurrentView: (view: SettingView) => void;
    setIsDropdownOpen: (isOpen: boolean) => void;
    onProfileChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onAvatarChange: (url: string) => void;
    onSaveProfile: () => void;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onAiConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onApiKeyInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSaveApiKeys: () => void;
    onResetUsage: () => void;
    onSaveSettings: () => void;
    onSrsConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetSrsConfig: () => void;
    onOpenClearProgressModal: () => void;
    onOpenNukeModal: () => void;
    onApplyAccent: () => void;
    onToggleAdmin: () => void;
    
    // Goal Props
    goalConfig: DailyGoalConfig;
    onGoalConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

    // Children render prop for InterfaceSettings
    children?: React.ReactNode;
}

const navItems = [
    { id: 'PROFILE', label: 'Profile', icon: User },
    { id: 'INTERFACE', label: 'Interface Defaults', icon: LayoutTemplate },
    { id: 'SERVER', label: 'Server & Connection', icon: Server },
    { id: 'AUDIO_COACH', label: 'Audio Coach', icon: Bot },
    { id: 'LEARNING', label: 'Learning', icon: GraduationCap },
    { id: 'DANGER', label: 'Danger Zone', icon: AlertTriangle, color: 'text-red-500' }
];

export const SettingsViewUI: React.FC<SettingsViewUIProps> = (props) => {
    const {
        currentView, isDropdownOpen, notification,
        setCurrentView, setIsDropdownOpen, mobileNavRef, children
    } = props;
    
    const currentNavItem = navItems.find(item => item.id === currentView);
    
    const renderCurrentView = () => {
        switch (currentView) {
            case 'PROFILE': return <ProfileSettings profileData={props.profileData} onProfileChange={props.onProfileChange} onAvatarChange={props.onAvatarChange} onSaveProfile={props.onSaveProfile} />;
            case 'SERVER': return <ServerSettings config={props.config} onConfigChange={props.onConfigChange} onSaveSettings={props.onSaveSettings} />;
            case 'AUDIO_COACH': return <AudioCoachSettings config={props.config} onConfigChange={props.onConfigChange} onSaveSettings={props.onSaveSettings} />;
            case 'LEARNING': return (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <GoalSettings goalConfig={props.goalConfig} onGoalConfigChange={props.onGoalConfigChange} onSaveSettings={props.onSaveSettings} />
                    <SrsSettings srsConfig={props.config.srs} onSrsConfigChange={props.onSrsConfigChange} onResetSrsConfig={props.onResetSrsConfig} onSaveSettings={props.onSaveSettings} />
                </div>
            );
            case 'DANGER': return <DangerZone onOpenClearProgressModal={props.onOpenClearProgressModal} onOpenNukeModal={props.onOpenNukeModal} isAdmin={props.isAdmin} onToggleAdmin={props.onToggleAdmin} />;
            case 'INTERFACE':
                return null; // Rendered via children
            default: return null;
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20">
            <header><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Settings</h2><p className="text-neutral-500 mt-1 font-medium">Manage your data and personalize your learning experience.</p></header>
            {notification && (<div className="fixed top-10 left-1/2 -translate-x-1/2 z-[300] bg-neutral-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-neutral-800 animate-in slide-in-from-top-4 flex items-center space-x-2"><CheckCircle2 size={18} className="text-green-400" /><span className="text-sm font-bold">{notification}</span></div>)}
            
            <div className="relative lg:hidden mb-6" ref={mobileNavRef}>
                <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex items-center justify-between text-left px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-neutral-900 hover:bg-neutral-50 transition-colors shadow-sm">
                    {currentNavItem && (<span className="flex items-center space-x-3"><currentNavItem.icon size={18} className={currentNavItem.color} /><span>{currentNavItem.label}</span></span>)}
                    <ChevronDown size={18} className={`text-neutral-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isDropdownOpen && (<div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-lg border border-neutral-100 z-20 p-2 animate-in fade-in duration-150">{navItems.map(item => (<button key={item.id} onClick={() => { setCurrentView(item.id as SettingView); setIsDropdownOpen(false); }} className={`w-full text-left flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${ currentView === item.id ? 'bg-neutral-900 text-white' : `${item.color || 'text-neutral-700'} hover:bg-neutral-50` }`}><item.icon size={16} /><span>{item.label}</span></button>))}</div>)}
            </div>

            <div className="flex flex-col lg:flex-row gap-12">
                <aside className="hidden lg:block lg:w-1/4">
                    <nav className="space-y-1.5">{navItems.map(item => (<button key={item.id} onClick={() => setCurrentView(item.id as SettingView)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${ currentView === item.id ? 'bg-neutral-100 text-neutral-900' : `${item.color || 'text-neutral-500'} hover:bg-neutral-50 hover:text-neutral-900` }`}><item.icon size={18} /><span>{item.label}</span></button>))}
                    </nav>
                </aside>
                <main className="flex-1 lg:w-3/4">
                    <div key={currentView} className="animate-in fade-in duration-300">
                        {renderCurrentView()}
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
