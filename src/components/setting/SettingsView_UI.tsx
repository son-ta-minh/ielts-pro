
import React from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, User, Bot, Database, Settings2, AlertTriangle, LayoutTemplate, Target, BookText, GraduationCap, Activity, Server, Radio } from 'lucide-react';
import { ProfileSettings } from './ProfileSettings';
import { AudioCoachSettings } from './AudioCoachSettings';
import { AudioServerSettings } from './AudioServerSettings';
import { DataSettings } from './DataSettings';
import { SrsSettings } from './SrsSettings';
import { GoalSettings } from './GoalSettings';
import { DangerZone } from './DangerZone';
import { ServerSettings } from './ServerSettings';
import { SystemConfig, DailyGoalConfig } from '../../app/settingsManager';
import { DataScope } from '../../app/types';

export type SettingView = 'PROFILE' | 'INTERFACE' | 'SERVER' | 'AUDIO_COACH' | 'AUDIO_SERVER' | 'DATA' | 'LEARNING' | 'DANGER';

interface SettingsViewUIProps {
    // State
    currentView: SettingView;
    isDropdownOpen: boolean;
    notification: string | null;
    importStatus: { type: 'success' | 'error' | 'info', message: string, detail?: string } | null;
    profileData: { name: string; avatar: string; role: string; currentLevel: string; target: string; nativeLanguage: string; };
    config: SystemConfig;
    isVoiceLoading: boolean;
    availableVoices: SpeechSynthesisVoice[];
    apiKeyInput: string;
    apiUsage: { count: number; date: string };
    jsonInputRef: React.RefObject<HTMLInputElement>;
    dataScope: DataScope;
    mobileNavRef: React.RefObject<HTMLDivElement>;
    isNormalizing: boolean;
    isApplyingAccent: boolean;
    isAdmin: boolean;
    junkTags: string[];
    normalizeOptions: { removeJunkTags: boolean; removeMultiWordData: boolean; cleanHeadwords: boolean };
    
    // Diagnostic
    dbStats: Record<string, number> | null;
    lsHealth: { hasBackup: boolean, backupSize: number, backupTimestamp: string } | null;
    onRunDiagnostics: () => void;
    
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
    onDataScopeChange: (scope: DataScope) => void;
    onJSONImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onJSONExport: () => void;
    onSrsConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetSrsConfig: () => void;
    onOpenClearProgressModal: () => void;
    onOpenNukeModal: () => void;
    onOpenNormalizeModal: () => void;
    onApplyAccent: () => void;
    onToggleAdmin: () => void;
    onJunkTagsChange: (tags: string[]) => void;
    onNormalizeOptionsChange: (options: { removeJunkTags: boolean; removeMultiWordData: boolean; cleanHeadwords: boolean }) => void;
    
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
    { id: 'AUDIO_SERVER', label: 'Audio Server', icon: Radio },
    { id: 'LEARNING', label: 'Learning', icon: GraduationCap },
    { id: 'DATA', label: 'Data Management', icon: Database },
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
            case 'PROFILE': return <ProfileSettings profileData={props.profileData} onProfileChange={props.onProfileChange} onAvatarChange={props.onAvatarChange} onSaveProfile={props.onSaveProfile} />;
            case 'SERVER': return <ServerSettings config={props.config} onConfigChange={props.onConfigChange} onSaveSettings={props.onSaveSettings} />;
            case 'AUDIO_COACH': return <AudioCoachSettings config={props.config} onConfigChange={props.onConfigChange} onSaveSettings={props.onSaveSettings} />;
            case 'AUDIO_SERVER': return <AudioServerSettings />;
            case 'DATA': return (
                <div className="space-y-6">
                    <DataSettings jsonInputRef={props.jsonInputRef} dataScope={props.dataScope} onDataScopeChange={props.onDataScopeChange} onJSONImport={props.onJSONImport} onJSONExport={props.onJSONExport} isNormalizing={props.isNormalizing} onOpenNormalizeModal={props.onOpenNormalizeModal} junkTags={props.junkTags} onJunkTagsChange={props.onJunkTagsChange} normalizeOptions={props.normalizeOptions} onNormalizeOptionsChange={props.onNormalizeOptionsChange} />
                    
                    {/* Diagnostic Panel */}
                    <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm animate-in fade-in">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Activity size={20}/></div>
                                <h3 className="font-black text-lg text-neutral-900">System Diagnostics</h3>
                            </div>
                            <button onClick={props.onRunDiagnostics} className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-neutral-800 transition-all active:scale-95">
                                Run Check
                            </button>
                        </div>
                        
                        {props.dbStats ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-1">Database Stores</h4>
                                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 text-xs font-mono space-y-1">
                                        {Object.entries(props.dbStats).map(([key, count]) => (
                                            <div key={key} className="flex justify-between">
                                                <span>{key}:</span>
                                                <span className={count === -1 ? "text-red-500 font-bold" : "text-neutral-900 font-bold"}>
                                                    {count === -1 ? "ERROR" : count}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-1">Safety Lock Status</h4>
                                    <div className={`p-4 rounded-xl border ${props.lsHealth?.hasBackup ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            {props.lsHealth?.hasBackup ? <CheckCircle2 size={16} className="text-green-600"/> : <AlertTriangle size={16} className="text-red-600"/>}
                                            <span className={`font-bold text-sm ${props.lsHealth?.hasBackup ? 'text-green-900' : 'text-red-900'}`}>
                                                {props.lsHealth?.hasBackup ? 'Emergency Backup Active' : 'No Emergency Backup Found'}
                                            </span>
                                        </div>
                                        {props.lsHealth?.hasBackup && (
                                            <div className="text-xs text-green-700 space-y-1">
                                                <p>Size: {(props.lsHealth.backupSize / 1024).toFixed(1)} KB</p>
                                                <p>Last Sync: {props.lsHealth.backupTimestamp}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-center text-neutral-400 text-xs italic py-4">Click "Run Check" to inspect internal database state.</p>
                        )}
                    </div>
                </div>
            );
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
