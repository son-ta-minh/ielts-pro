
import React, { useState, useEffect } from 'react';
import { BrainCircuit, Save, Bot, MonitorSmartphone, ChevronDown, BarChart3, Power, Loader2, HardDrive, CheckCircle2, AlertCircle, Hash, RefreshCw, ExternalLink } from 'lucide-react';
import { SystemConfig } from '../../app/settingsManager';
import { fetchServerVoices, ServerVoice, selectServerVoice, setServerMode, speak } from '../../utils/audio';

interface AiAudioSettingsProps {
    config: SystemConfig;
    isVoiceLoading: boolean;
    availableVoices: SpeechSynthesisVoice[];
    apiKeyInput: string;
    apiUsage: { count: number; date: string };
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onAiConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAudioModeChange: (mode: 'system' | 'ai' | 'server') => void;
    onVoiceChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onApiKeyInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSaveApiKeys: () => void;
    onResetUsage: () => void;
    onSaveSettings: () => void;
    isApplyingAccent: boolean;
    onApplyAccent: () => void;
}

export const AiAudioSettings: React.FC<AiAudioSettingsProps> = ({
    config, isVoiceLoading, availableVoices, apiKeyInput, apiUsage,
    onConfigChange,
    onAiConfigChange, onAudioModeChange, onVoiceChange, onApiKeyInputChange,
    onSaveApiKeys, onResetUsage, onSaveSettings, isApplyingAccent, onApplyAccent
}) => {
    const [serverVoices, setServerVoices] = useState<ServerVoice[]>([]);
    const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

    const checkServer = async () => {
        setServerStatus('checking');
        const data = await fetchServerVoices(config.audio.serverPort);
        if (data) {
            setServerVoices(data.voices);
            setServerStatus('connected');
            await setServerMode('speak', config.audio.serverPort);
        } else {
            setServerStatus('disconnected');
            setServerVoices([]);
        }
    };

    // Sync with local server
    useEffect(() => {
        if (config.audio.mode === 'server') {
            checkServer();
        }
    }, [config.audio.mode, config.audio.serverPort]);

    const handleServerVoiceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const voiceName = e.target.value;
        if (!voiceName) return;

        const success = await selectServerVoice(voiceName, config.audio.serverPort);
        if (success) {
            // This triggers the updated handleConfigChange in SettingsView
            // which auto-saves to localStorage
            onConfigChange('audio', 'preferredSystemVoice', voiceName);
            
            // Give a tiny moment for state to settle, then test
            setTimeout(() => {
                speak("Hello! This is a test of the selected voice.");
            }, 150);
        }
    };

    const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const port = parseInt(e.target.value, 10);
        if (!isNaN(port)) {
            onConfigChange('audio', 'serverPort', port);
        }
    };

    const usagePercentage = Math.min((apiUsage.count / 500) * 100, 100);
    let usageColor = 'bg-green-500';
    if (usagePercentage > 75) usageColor = 'bg-red-500';
    else if (usagePercentage > 40) usageColor = 'bg-yellow-500';

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><BrainCircuit size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">AI & Audio</h3>
                        <p className="text-xs text-neutral-400">Configure models, API, and voice.</p>
                    </div>
                </div>
                <button onClick={onSaveSettings} className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-800 transition-all"><Save size={14} /><span>Save</span></button>
            </div>

            {/* Master AI Switch */}
            <div className={`p-4 rounded-2xl border transition-colors flex items-center justify-between ${config.ai.enableGeminiApi ? 'bg-indigo-50 border-indigo-100' : 'bg-neutral-50 border-neutral-200'}`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${config.ai.enableGeminiApi ? 'bg-indigo-500 text-white' : 'bg-neutral-200 text-neutral-400'}`}>
                        <Power size={18} />
                    </div>
                    <div>
                        <div className={`font-black text-sm ${config.ai.enableGeminiApi ? 'text-indigo-900' : 'text-neutral-500'}`}>Enable Gemini AI Features</div>
                        <div className="text-[10px] text-neutral-400">Controls visibility of automated AI buttons</div>
                    </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" name="enableGeminiApi" checked={config.ai.enableGeminiApi} onChange={onAiConfigChange} className="sr-only peer" />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Audio Experience</label>
                <div className="grid grid-cols-3 gap-2 bg-neutral-100 p-1 rounded-2xl">
                    <button onClick={() => onAudioModeChange('system')} className={`py-3 text-[10px] font-black rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${config.audio.mode === 'system' ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-400'}`}>
                        <MonitorSmartphone size={14} /> 
                        <span>Browser</span>
                    </button>
                    <button onClick={() => onAudioModeChange('server')} className={`py-3 text-[10px] font-black rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${config.audio.mode === 'server' ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-400'}`}>
                        <HardDrive size={14} /> 
                        <span>macOS Server</span>
                    </button>
                    <button onClick={() => onAudioModeChange('ai')} disabled={!config.ai.enableGeminiApi} className={`py-3 text-[10px] font-black rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${config.audio.mode === 'ai' ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200' : 'text-neutral-400'} ${!config.ai.enableGeminiApi ? 'opacity-50' : ''}`}>
                        <Bot size={14} /> 
                        <span>Gemini AI</span>
                    </button>
                </div>
                
                {config.audio.mode === 'system' && (
                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-2 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">System Voice (Fixed)</label>
                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-200 text-neutral-600 rounded text-[9px] font-black uppercase">Safari Recommended</span>
                        </div>
                        <div className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-neutral-400 flex items-center justify-between">
                            <span>Apple Samantha (en-US)</span>
                            <CheckCircle2 size={16} className="text-emerald-500" />
                        </div>
                        <p className="text-[10px] text-neutral-400 px-1 font-medium italic">System mode is locked to Samantha for maximum stability across Apple devices.</p>
                    </div>
                )}

                {config.audio.mode === 'server' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        {serverStatus === 'disconnected' && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                                <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-amber-900">Browser Security Check Required</p>
                                    <p className="text-[10px] text-amber-700 leading-relaxed">
                                        If the server is running but status is "Offline", the browser may be blocking the connection to localhost. 
                                        Click the <b>Lock Icon</b> next to the URL → <b>Site settings</b> → <b>Insecure content</b> → set to <b>Allow</b>.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Hash size={10}/> Server Port</label>
                                        <button onClick={checkServer} className="text-[10px] font-black text-indigo-600 flex items-center gap-1 hover:underline"><RefreshCw size={10}/> Reconnect</button>
                                    </div>
                                    <input 
                                        type="number" 
                                        value={config.audio.serverPort} 
                                        onChange={handlePortChange}
                                        className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                                        placeholder="3000"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1">Connection Status</label>
                                    <div className="flex items-center h-[42px] px-4 bg-white border border-neutral-200 rounded-xl transition-all">
                                        {serverStatus === 'connected' ? (
                                            <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600"><CheckCircle2 size={14}/> Online (Port {config.audio.serverPort})</span>
                                        ) : serverStatus === 'disconnected' ? (
                                            <span className="flex items-center gap-1.5 text-xs font-black text-red-600"><AlertCircle size={14}/> Offline</span>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Loader2 size={14} className="animate-spin text-neutral-400" />
                                                <span className="text-[10px] font-bold text-neutral-400">Connecting...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Voice Selector</label>
                                <div className="relative">
                                    <select 
                                        value={config.audio.preferredSystemVoice} 
                                        onChange={handleServerVoiceChange} 
                                        disabled={serverStatus !== 'connected'}
                                        className="w-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-3 pr-10 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-neutral-50 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                                    >
                                        <option value="">{serverStatus === 'connected' ? 'Select Voice...' : 'Waiting for connection...'}</option>
                                        {serverVoices.map(voice => (
                                            <option key={voice.name} value={voice.name}>{voice.name} ({voice.language})</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {config.audio.mode === 'ai' && (
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center animate-in fade-in duration-300">
                        <p className="text-xs font-bold text-blue-800">Gemini AI Voice provides consistent high-quality audio.</p>
                        <p className="text-[10px] text-blue-600 mt-1">Consumes your API quota.</p>
                    </div>
                )}
            </div>

            <div className={`space-y-4 pt-4 border-t border-neutral-100 transition-opacity ${config.ai.enableGeminiApi ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">AI Model Configuration</label>
                <div className="space-y-3">
                    <div><label className="block text-xs font-bold text-neutral-500 mb-1">Complex Tasks</label><input name="modelForComplexTasks" value={config.ai.modelForComplexTasks} onChange={onAiConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs" /></div>
                    <div><label className="block text-xs font-bold text-neutral-500 mb-1">Basic Tasks</label><input name="modelForBasicTasks" value={config.ai.modelForBasicTasks} onChange={onAiConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs" /></div>
                    <div><label className="block text-xs font-bold text-neutral-500 mb-1">Text-to-Speech (TTS)</label><input name="modelForTts" value={config.ai.modelForTts} onChange={onAiConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs" /></div>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="flex justify-between items-center"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Local API Key Storage</label><button onClick={onSaveApiKeys} className="text-[10px] font-bold text-neutral-400 hover:text-neutral-800 transition-colors uppercase tracking-widest">Save Keys</button></div>
                <textarea rows={2} value={apiKeyInput} onChange={onApiKeyInputChange} placeholder="Enter your API key. Separate multiple keys with commas for auto-rotation." className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-y" />
                <p className="text-[10px] text-neutral-400 px-1 font-medium italic">Your keys are stored securely in your browser and never leave your device.</p>
            </div>

            <div className={`space-y-3 pt-4 border-t border-neutral-100 ${config.ai.enableGeminiApi ? '' : 'hidden'}`}>
                <div className="flex justify-between items-center"><div className="flex items-center space-x-2"><BarChart3 size={14} className="text-neutral-400"/><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Today's API Usage</label></div><button onClick={onResetUsage} className="text-[10px] font-bold text-neutral-400 hover:text-neutral-800 transition-colors uppercase tracking-widest">Reset</button></div>
                <div className="flex items-center space-x-4"><div className="text-2xl font-black text-neutral-900">{apiUsage.count}</div><div className="flex-1"><div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${usageColor}`} style={{ width: `${Math.min((apiUsage.count / 500) * 100, 100)}%` }} /></div></div></div>
                <p className="text-[10px] text-neutral-400 px-1 font-medium italic">This counter tracks requests made by this app and resets daily.</p>
            </div>
        </section>
    );
};
