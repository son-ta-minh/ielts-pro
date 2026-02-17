
import React, { useState, useEffect, useRef } from 'react';
import { Server, Save, CheckCircle2, AlertCircle, Loader2, Link, Info, ChevronDown, Trash2, Plus, Network, Folder, RefreshCw } from 'lucide-react';
import { SystemConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';

const HOST_OPTIONS = ['localhost', 'macm2.local', 'macm4.local'];

interface ServerSettingsProps {
    config: SystemConfig;
    onConfigChange: (section: keyof SystemConfig, key: any, value: any) => void;
    onSaveSettings: () => void;
}

export const ServerSettings: React.FC<ServerSettingsProps> = ({ config, onConfigChange, onSaveSettings }) => {
    const [status, setStatus] = useState<'connected' | 'error' | 'checking'>('checking');
    const [isEditingConnection, setIsEditingConnection] = useState(false);
    
    // Mappings State (Still managed here as configuration)
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [newMapName, setNewMapName] = useState('');
    const [newMapPath, setNewMapPath] = useState('');

    const { showToast } = useToast();
    const fullUrl = getServerUrl(config);

    const fetchMappings = async () => {
        try {
            const res = await fetch(`${fullUrl}/api/audio/mappings`);
            if (res.ok) {
                setMappings(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch mappings", e);
        }
    };

    const checkConnection = async () => {
        setStatus('checking');
        try {
            const res = await fetch(`${fullUrl}/api/health`);
            if (res.ok) {
                setStatus('connected');
                setIsEditingConnection(false); 
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

    // --- Mappings Handlers ---

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

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Server size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Server & Connection</h3>
                        <p className="text-xs text-neutral-400">Manage connection and directory mappings.</p>
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
                        
                        {/* Directory Mappings */}
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
                                    <input value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="Logical Name (e.g. 'Images')" className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                                    <input value={newMapPath} onChange={e => setNewMapPath(e.target.value)} placeholder="Physical Path" className="flex-[2] px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500" />
                                    <button onClick={handleAddMapping} disabled={!newMapName || !newMapPath} className="px-4 py-2 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-neutral-800 disabled:opacity-50"><Plus size={14}/> Add</button>
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
            
        </section>
    );
};
