import React from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, User, BrainCircuit, Database, Settings2, AlertTriangle, LayoutTemplate, Target } from 'lucide-react';
import { ProfileSettings } from './ProfileSettings';
import { AiAudioSettings } from './AiAudioSettings';
import { DataSettings } from './DataSettings';
import { SrsSettings } from './SrsSettings';
import { DangerZone } from './DangerZone';
import { SystemConfig } from '../../app/settingsManager';
import { User as UserType } from '../../app/types';

export type SettingView = 'PROFILE' | 'INTERFACE' | 'AI_AUDIO' | 'DATA' | 'SRS' | 'GOALS' | 'DANGER';

interface SettingsViewUIProps {
    // State
    currentView: SettingView;
    isDropdownOpen: boolean;
    notification: string | null;
    importStatus: { type: 'success' | 'error' | 'info', message: string, detail?: string } | null;
    profileData: { name: string; role: string; currentLevel: string; target: string; nativeLanguage: string; };
    config: SystemConfig;
    isVoiceLoading: boolean;
    availableVoices: SpeechSynthesisVoice[];
    apiKeyInput: string;
    apiUsage: { count: number; date: string };
    jsonInputRef: React.RefObject<HTMLInputElement>;
    includeProgress: boolean;
    includeEssays: boolean;
    mobileNavRef: React.RefObject<HTMLDivElement>;
    isNormalizing: boolean;
    isApplyingAccent: boolean;
    isAdmin: boolean;
    
    // Handlers
    setCurrentView: (view: SettingView) => void;
    setIsDropdownOpen: (isOpen: boolean) => void;
    onProfileChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSaveProfile: () => void;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onAiConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAudioModeChange: (mode: 'system' | 'ai') => void;
    onVoiceChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onApiKeyInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSaveApiKeys: () => void;
    onResetUsage: () => void;
    onSaveSettings: () => void;
    setIncludeProgress: (value: boolean) => void;
    setIncludeEssays: (value: boolean) => void;
    onJSONImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onJSONExport: () => void;
    onSrsConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetSrsConfig: () => void;
    onOpenClearProgressModal: () => void;
    onOpenNukeModal: () => void;
    onOpenNormalizeModal: () => void;
    onApplyAccent: () => void;
    onToggleAdmin: () => void;
    
    // Children render prop for InterfaceSettings
    children?: React.ReactNode;
}

const navItems = [
    { id: 'PROFILE', label: 'Profile', icon: User },
    { id: 'INTERFACE', label: 'Interface Defaults', icon: LayoutTemplate },
    { id: 'AI_AUDIO', label: 'AI & Audio', icon: BrainCircuit },
    { id: 'DATA', label: 'Data Management', icon: Database },
    { id: 'SRS', label: 'Learning Algorithm', icon: Settings2 },
    { id: 'GOALS', label: 'Daily Goals', icon: Target },
    { id: 'DANGER', label: 'Danger Zone', icon: AlertTriangle, color: 'text-red-500' }
];

export const SettingsViewUI: React.FC<SettingsViewUIProps> = (props) => {
    const {
        currentView, isDropdownOpen, notification, importStatus,
        setCurrentView, setIsDropdownOpen, mobileNavRef, children
    } = props;
    
    const currentNavItem = navItems.find(item => item.id === currentView);
    
    const renderCurrentView = () => {
        switch (currentView) {
            case 'PROFILE': return <ProfileSettings profileData={props.profileData} onProfileChange={props.onProfileChange} onSaveProfile={props.onSaveProfile} />;
            case 'AI_AUDIO': return <AiAudioSettings config={props.config} isVoiceLoading={props.isVoiceLoading} availableVoices={props.availableVoices} apiKeyInput={props.apiKeyInput} apiUsage={props.apiUsage} onConfigChange={props.onConfigChange} onAiConfigChange={props.onAiConfigChange} onAudioModeChange={props.onAudioModeChange} onVoiceChange={props.onVoiceChange} onApiKeyInputChange={props.onApiKeyInputChange} onSaveApiKeys={props.onSaveApiKeys} onResetUsage={props.onResetUsage} onSaveSettings={props.onSaveSettings} isApplyingAccent={props.isApplyingAccent} onApplyAccent={props.onApplyAccent} />;
            case 'DATA': return <DataSettings jsonInputRef={props.jsonInputRef} includeProgress={props.includeProgress} setIncludeProgress={props.setIncludeProgress} includeEssays={props.includeEssays} setIncludeEssays={props.setIncludeEssays} onJSONImport={props.onJSONImport} onJSONExport={props.onJSONExport} isNormalizing={props.isNormalizing} onOpenNormalizeModal={props.onOpenNormalizeModal} />;
            case 'SRS': return <SrsSettings srsConfig={props.config.srs} onSrsConfigChange={props.onSrsConfigChange} onResetSrsConfig={props.onResetSrsConfig} onSaveSettings={props.onSaveSettings} />;
            case 'DANGER': return <DangerZone onOpenClearProgressModal={props.onOpenClearProgressModal} onOpenNukeModal={props.onOpenNukeModal} isAdmin={props.isAdmin} onToggleAdmin={props.onToggleAdmin} />;
            case 'INTERFACE':
            case 'GOALS':
                return null; // Rendered via children
            default: return null;
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20">
            <header><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Settings</h2><p className="text-neutral-500 mt-2 font-medium">Manage your data and personalize your learning experience.</p></header>
            {notification && (<div className="fixed top-10 left-1/2 -translate-x-1/2 z-[300] bg-neutral-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-neutral-800 animate-in slide-in-from-top-4 flex items-center space-x-2"><CheckCircle2 size={18} className="text-green-400" /><span className="text-sm font-bold">{notification}</span></div>)}
            {importStatus && (<div className={`p-6 rounded-[2rem] border-2 animate-in slide-in-from-top-4 ${ importStatus.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700' }`}><div className="flex items-start space-x-4">{importStatus.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}<div><div className="font-black text-lg">{importStatus.message}</div>{importStatus.detail && <div className="text-sm opacity-80 mt-1 font-medium">{importStatus.detail}</div>}</div></div></div>)}
            
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