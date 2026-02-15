
import React, { useState, useEffect, useRef } from 'react';
import { Server, Save, CheckCircle2, AlertCircle, Loader2, Network, Clock, RefreshCw, Link, Info, ChevronDown, Trash2, Plus, Mic, Upload, Folder } from 'lucide-react';
import { SystemConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { fetchServerBackups, ServerBackupItem } from '../../services/backupService';
// import { ServerRestoreModal } from '../common/ServerRestoreModal'; // Unused if removing Server Data section
import { AudioTrimmer } from '../common/AudioTrimmer';
import { startRecording, stopRecording } from '../../utils/audio';

const HOST_OPTIONS = ['localhost', 'macm2.local', 'macm4.local'];

interface ServerSettingsProps {
    config: SystemConfig;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onSaveSettings: () => void;
}

export const ServerSettings: React.FC<ServerSettingsProps> = ({ config, onConfigChange, onSaveSettings }) => {
    const [status, setStatus] = useState<'connected' | 'error' | 'checking'>('checking');
    const [isEditingConnection, setIsEditingConnection] = useState(false);
    
    // Audio Server - Mappings State
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [newMapName, setNewMapName] = useState('');
    const [newMapPath, setNewMapPath] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Audio Server - Recorder State
    const [isRecording, setIsRecording] = useState(false);
    const [rawBlob, setRawBlob] = useState<Blob | null>(null);
    const [trimmedBlob, setTrimmedBlob] = useState<Blob | null>(null);
    
    // Audio Server - Upload State
    const [selectedMap, setSelectedMap] = useState('');
    const [uploadFilename, setUploadFilename] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { showToast } = useToast();
    const fullUrl = getServerUrl(config);

    const fetchMappings = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch(`${fullUrl}/api/audio/mappings`);
            if (res.ok) {
                setMappings(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch mappings", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    const checkConnection = async () => {
        setStatus('checking');
        try {
            const res = await fetch(`${fullUrl}/api/health`);
            if (res.ok) {
                setStatus('connected');
                setIsEditingConnection(false); 
                
                // --- Fetch Mappings ---
                fetchMappings();

            } else {
                setStatus('error');
                setIsEditingConnection(true); 
            }
        } catch (e: any) {
            setStatus('error');
            setIsEditingConnection(true);
        }
    };

    useEffect(() => {
        checkConnection();
    }, [fullUrl]);
    
    // Auto-enable backup if connected
    useEffect(() => {
        if (status === 'connected' && !config.sync.autoBackupEnabled) {
             onConfigChange('sync', 'autoBackupEnabled', true);
        }
    }, [status]);

    const updateServerConfig = (updates: Partial<typeof config.server>) => {
        onConfigChange('server', null, { ...config.server, ...updates });
    };

    const handleToggleCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateServerConfig({ useCustomUrl: e.target.checked });
    };

    // --- Audio Server Handlers ---

    const handleAddMapping = async () => {
        if (!newMapName || !newMapPath) return;
        try {
            const res = await fetch(`${fullUrl}/api/audio/mappings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newMapName, path: newMapPath })
            });
            const data = await res.json();
            if (data.success) {
                setMappings(data.mappings);
                setNewMapName('');
                setNewMapPath('');
                showToast("Mapping added!", "success");
            } else {
                showToast(data.error || "Failed to add mapping", "error");
            }
        } catch (e) {
            showToast("Connection error", "error");
        }
    };

    const handleDeleteMapping = async (name: string) => {
        try {
            const res = await fetch(`${fullUrl}/api/audio/mappings/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setMappings(data.mappings);
            }
        } catch (e) {
            showToast("Failed to delete", "error");
        }
    };

    const handleStartRecord = async () => {
        await startRecording();
        setIsRecording(true);
        setRawBlob(null);
        setTrimmedBlob(null);
    };

    const handleStopRecord = async () => {
        const result = await stopRecording();
        setIsRecording(false);
        if (result) {
            // Convert base64 back to blob for trimming
            const byteCharacters = atob(result.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.mimeType });
            setRawBlob(blob);
            setTrimmedBlob(blob); // Default trim is full
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setRawBlob(file);
            setTrimmedBlob(file);
            setUploadFilename(file.name);
        }
    };

    const handleUploadToServer = async () => {
        if (!trimmedBlob || !selectedMap || !uploadFilename) {
            showToast("Please select audio, target folder, and filename.", "error");
            return;
        }
        
        setIsUploading(true);
        const formData = new FormData();
        // IMPORTANT: Append text fields BEFORE the file so Multer can access req.body properties 
        // inside the storage engine's destination function.
        formData.append('mapName', selectedMap);
        formData.append('filename', uploadFilename);
        formData.append('audio', trimmedBlob, uploadFilename);

        try {
            const res = await fetch(`${fullUrl}/api/audio/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showToast("Audio uploaded successfully!", "success");
                setRawBlob(null);
                setTrimmedBlob(null);
                setUploadFilename('');
            } else {
                showToast(data.error || "Upload failed", "error");
            }
        } catch (e) {
            showToast("Upload error", "error");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Server size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Server & Connection</h3>
                        <p className="text-xs text-neutral-400">Manage connection and audio mappings.</p>
                    </div>
                </div>
                <button onClick={onSaveSettings} className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-800 transition-all"><Save size={14} /><span>Save</span></button>
            </div>

            <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-6">
                
                {/* Connection Status & Toggle */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${status === 'connected' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
                    <div className="flex items-center gap-3">
                         {status === 'checking' && <Loader2 size={18} className="animate-spin text-neutral-400" />}
                         {status === 'connected' && <CheckCircle2 size={18} className="text-emerald-500" />}
                         {status === 'error' && <AlertCircle size={18} className="text-red-500" />}
                         
                         <div className="flex flex-col">
                             <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Status</span>
                             <span className={`text-sm font-bold ${status === 'connected' ? 'text-emerald-700' : status === 'error' ? 'text-red-600' : 'text-neutral-600'}`}>
                                 {status === 'checking' ? 'Checking...' : status === 'connected' ? 'Active' : 'Disconnected'}
                             </span>
                         </div>
                    </div>
                    {status === 'connected' ? (
                         <button onClick={() => setIsEditingConnection(!isEditingConnection)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-[10px] font-black uppercase text-neutral-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
                             {isEditingConnection ? 'Hide Config' : 'Configure'}
                         </button>
                    ) : (
                         <button onClick={checkConnection} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-[10px] font-black uppercase hover:bg-neutral-700 transition-colors">
                            <RefreshCw size={12}/> Try Connect
                         </button>
                    )}
                </div>

                {/* Connection Inputs (Shown if Disconnected OR Editing) */}
                {(status !== 'connected' || isEditingConnection) && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 pt-2 border-t border-neutral-200/50">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Link size={10}/> Host Details</label>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] font-bold text-neutral-500 cursor-pointer flex items-center gap-2">
                                    <input type="checkbox" checked={config.server.useCustomUrl} onChange={handleToggleCustom} className="accent-indigo-600 w-3 h-3" />
                                    Custom URL
                                </label>
                            </div>
                        </div>

                        {!config.server.useCustomUrl ? (
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2 relative">
                                    <select 
                                        value={config.server.host} 
                                        onChange={(e) => updateServerConfig({ host: e.target.value })}
                                        className="w-full h-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none pr-10"
                                    >
                                        {HOST_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                                        <ChevronDown size={16} />
                                    </div>
                                </div>
                                <input 
                                    type="number" 
                                    value={config.server.port} 
                                    onChange={(e) => updateServerConfig({ port: parseInt(e.target.value) || 3000 })}
                                    className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                                />
                            </div>
                        ) : (
                            <input 
                                type="text" 
                                value={config.server.customUrl} 
                                onChange={(e) => updateServerConfig({ customUrl: e.target.value })}
                                placeholder="https://myserver.local:3000"
                                className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        )}
                        
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-2">
                             <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                             <p className="text-[10px] text-blue-700 font-medium leading-tight">
                                 Server must run on HTTPS. If stuck, try opening <a href={`${fullUrl}/api/health`} target="_blank" rel="noreferrer" className="underline font-bold">Health Check</a> to verify certificate.
                             </p>
                        </div>
                    </div>
                )}
                
                {/* Connected Settings */}
                {status === 'connected' && (
                    <div className="space-y-5 pt-4 border-t border-neutral-200/50 animate-in fade-in">
                        
                        {/* Directory Mappings (Moved from AudioServerSettings) */}
                        <div className="space-y-4">
                             <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-1 flex items-center gap-1"><Network size={10}/> Directory Mappings</h4>
                             <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                                {Object.entries(mappings).length === 0 ? (
                                    <div className="p-6 text-center text-xs text-neutral-400">No mappings configured.</div>
                                ) : (
                                    <div className="divide-y divide-neutral-200">
                                        {Object.entries(mappings).map(([name, path]) => (
                                            <div key={name} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors group">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Folder size={14} className="text-indigo-500" />
                                                        <span className="font-bold text-sm text-neutral-800">{name}</span>
                                                    </div>
                                                    <div className="text-[10px] text-neutral-500 font-mono mt-1 ml-6">{path}</div>
                                                </div>
                                                <button onClick={() => handleDeleteMapping(name)} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-col md:flex-row gap-3">
                                    <input value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="Logical Name (e.g. 'Cam15')" className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                                    <input value={newMapPath} onChange={e => setNewMapPath(e.target.value)} placeholder="Physical Path (e.g. ~/Music/Cam15)" className="flex-[2] px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500" />
                                    <button onClick={handleAddMapping} disabled={!newMapName || !newMapPath} className="px-4 py-2 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-neutral-800 disabled:opacity-50"><Plus size={14}/> Add</button>
                                </div>
                            </div>
                        </div>

                         {/* Auto Backup Config */}
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><Clock size={10}/> Backup Debounce Time</label>
                            <div className="flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-xl">
                                <input 
                                    type="range" 
                                    min="5" 
                                    max="300" 
                                    step="5"
                                    value={config.sync.autoBackupInterval} 
                                    onChange={(e) => onConfigChange('sync', 'autoBackupInterval', parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                                />
                                <div className="w-16 text-center font-black text-sm text-neutral-900">{config.sync.autoBackupInterval}s</div>
                            </div>
                        </div>

                        {/* Audio Tool */}
                         <div className="space-y-4 pt-4 border-t border-neutral-200/50">
                            <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-1 flex items-center gap-1"><Mic size={10}/> Audio Tool</h4>
                            
                            {!rawBlob ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <button 
                                        onClick={isRecording ? handleStopRecord : handleStartRecord}
                                        className={`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${isRecording ? 'bg-red-50 border-red-400 text-red-600 animate-pulse' : 'bg-white border-neutral-200 text-neutral-500 hover:border-indigo-400 hover:text-indigo-600'}`}
                                    >
                                        <Mic size={24} />
                                        <span className="font-bold text-xs">{isRecording ? 'Stop Recording' : 'Record Voice'}</span>
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-6 rounded-2xl border-2 border-dashed bg-white border-neutral-200 text-neutral-500 flex flex-col items-center justify-center gap-2 transition-all hover:border-indigo-400 hover:text-indigo-600"
                                    >
                                        <Upload size={24} />
                                        <span className="font-bold text-xs">Upload File</span>
                                        <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <AudioTrimmer 
                                        audioBlob={rawBlob} 
                                        onTrim={(blob) => { setTrimmedBlob(blob); showToast("Trimmed!", "success"); }} 
                                        onCancel={() => { setRawBlob(null); setTrimmedBlob(null); }} 
                                    />
                                    
                                    <div className="p-4 bg-white rounded-2xl border border-neutral-200 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase text-neutral-400 px-1">Target Folder</label>
                                                <select 
                                                    value={selectedMap} 
                                                    onChange={e => setSelectedMap(e.target.value)} 
                                                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs font-bold bg-white focus:ring-2 focus:ring-neutral-900 outline-none"
                                                >
                                                    <option value="">Select Mapping...</option>
                                                    {Object.keys(mappings).map(k => <option key={k} value={k}>{k}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black uppercase text-neutral-400 px-1">Filename</label>
                                                <input 
                                                    value={uploadFilename} 
                                                    onChange={e => setUploadFilename(e.target.value)} 
                                                    placeholder="track_01.wav"
                                                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs font-bold bg-white focus:ring-2 focus:ring-neutral-900 outline-none"
                                                />
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleUploadToServer} 
                                            disabled={isUploading || !selectedMap || !uploadFilename}
                                            className="w-full py-3 bg-neutral-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                        >
                                            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                            <span>Upload to Server</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
        </section>
    );
};
