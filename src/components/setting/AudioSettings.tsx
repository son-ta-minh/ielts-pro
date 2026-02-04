
import React, { useState, useEffect } from 'react';
import { HardDrive, Save, ChevronDown, Power, Loader2, CheckCircle2, AlertCircle, Hash, RefreshCw, Info, Link } from 'lucide-react';
import { SystemConfig, getServerUrl } from '../../app/settingsManager';
import { fetchServerVoices, ServerVoice, selectServerVoice, speak, resetAudioProtocolCache, getLastConnectedUrl } from '../../utils/audio';

interface AudioSettingsProps {
    config: SystemConfig;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onSaveSettings: () => void;
}

export const AudioSettings: React.FC<AudioSettingsProps> = ({
    config,
    onConfigChange,
    onSaveSettings
}) => {
    const [serverVoices, setServerVoices] = useState<ServerVoice[]>([]);
    const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
    const [connectedUrl, setConnectedUrl] = useState<string | null>(null);

    const fullUrl = getServerUrl(config);

    const checkServer = async () => {
        setServerStatus('checking');
        resetAudioProtocolCache(); 
        const data = await fetchServerVoices(fullUrl);
        
        if (data && Array.isArray(data.voices)) {
            setServerVoices(data.voices);
            setServerStatus('connected');
            setConnectedUrl(getLastConnectedUrl());
        } else if (data) {
            setServerStatus('connected'); 
            setServerVoices([]);
            setConnectedUrl(getLastConnectedUrl());
        } else {
            setServerStatus('disconnected');
            setServerVoices([]);
            setConnectedUrl(null);
        }
    };

    useEffect(() => {
        checkServer();
    }, [fullUrl]);

    const handleServerVoiceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const voiceName = e.target.value;
        if (!voiceName) return;

        const success = await selectServerVoice(voiceName, fullUrl);
        if (success) {
            onConfigChange('audio', 'preferredSystemVoice', voiceName);
            setTimeout(() => {
                speak("Hello! Testing the server voice.");
            }, 150);
        }
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newServer = { ...config.server, useCustomUrl: true, customUrl: e.target.value };
        onConfigChange('server', null, newServer);
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><HardDrive size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Audio Settings</h3>
                        <p className="text-xs text-neutral-400">Configure your TTS Server.</p>
                    </div>
                </div>
                <button onClick={onSaveSettings} className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-800 transition-all"><Save size={14} /><span>Save</span></button>
            </div>

            <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-6">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Connection Engine</span>
                    </div>
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black uppercase">TTS Server</span>
                </div>

                {serverStatus === 'disconnected' && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
                        <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-amber-900">Server Unreachable</p>
                            <p className="text-[10px] text-amber-700 leading-relaxed">
                                Ensure your TTS server is running at <b>{fullUrl}</b>. 
                                <br/>If using HTTPS, ensure the certificate is trusted or allow insecure content.
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Link size={10}/> Server URL</label>
                            <button onClick={checkServer} className="text-[10px] font-black text-indigo-600 flex items-center gap-1 hover:underline"><RefreshCw size={10}/> Refresh</button>
                        </div>
                        <input 
                            type="text" 
                            value={fullUrl} 
                            onChange={handleUrlChange}
                            className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                            placeholder="http://localhost:3000"
                        />
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Status</label>
                        <div className="flex items-center h-[42px] px-4 bg-white border border-neutral-200 rounded-xl transition-all">
                            {serverStatus === 'connected' ? (
                                <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600"><CheckCircle2 size={14}/> Connected to {connectedUrl?.replace(/^https?:\/\//, '')}</span>
                            ) : serverStatus === 'disconnected' ? (
                                <span className="flex items-center gap-1.5 text-xs font-black text-red-600"><AlertCircle size={14}/> Offline</span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-neutral-400" />
                                    <span className="text-[10px] font-bold text-neutral-400">Checking...</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Voice Selection</label>
                    <div className="relative">
                        <select 
                            value={config.audio.preferredSystemVoice} 
                            onChange={handleServerVoiceChange} 
                            disabled={serverStatus !== 'connected'}
                            className="w-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-3 pr-10 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-neutral-50 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                        >
                            <option value="">{serverStatus === 'connected' ? 'Choose a voice...' : 'Waiting for connection...'}</option>
                            {serverVoices.map(voice => (
                                <option key={voice.name} value={voice.name}>{voice.name} ({voice.accent})</option>
                            ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
                <Info size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
                    The app is optimized to prioritize your local voices for high-quality, lag-free pronunciation. 
                    If the server is unavailable, it will automatically fallback to the best available system voice.
                </p>
            </div>
        </section>
    );
};
