
import React, { useState, useEffect } from 'react';
import { Server, Save, CheckCircle2, AlertCircle, Loader2, FolderOpen, Network, Cloud, Clock, RefreshCw, Unlink, Settings2, Link, Info, ChevronDown, Edit2, X } from 'lucide-react';
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
    const [folderStatus, setFolderStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle');
    const [isEditingConnection, setIsEditingConnection] = useState(false);
    
    // Path Management
    const [serverReportedPath, setServerReportedPath] = useState<string>('');
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [pathInput, setPathInput] = useState('');

    const { showToast } = useToast();
    const fullUrl = getServerUrl(config);

    const checkConnection = async () => {
        setStatus('checking');
        try {
            const res = await fetch(`${fullUrl}/api/health`);
            if (res.ok) {
                const data = await res.json();
                setStatus('connected');
                setIsEditingConnection(false); 
                
                // Update reported path from server
                if (data.backupDir) {
                    setServerReportedPath(data.backupDir);
                    // Sync local config if different? Optional, but good for consistency.
                    // We won't auto-update config here to avoid infinite loops or overwrites, 
                    // but we will use this for display.
                }
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

    // Initialize path input when editing starts
    useEffect(() => {
        if (isEditingPath) {
            setPathInput(serverReportedPath || config.server.backupPath);
        }
    }, [isEditingPath, serverReportedPath, config.server.backupPath]);

    const updateServerConfig = (updates: Partial<typeof config.server>) => {
        onConfigChange('server', null, { ...config.server, ...updates });
    };

    const handleToggleCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateServerConfig({ useCustomUrl: e.target.checked });
    };

    const handleSetIcloudPath = () => {
        const icloudPath = "~/Library/Mobile Documents/com~apple~CloudDocs/VocabPro";
        setPathInput(icloudPath);
    };

    const saveServerFolder = async () => {
        if (!pathInput.trim()) return;
        setFolderStatus('updating');
        try {
            const res = await fetch(`${fullUrl}/api/config/backup-path`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: pathInput })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setFolderStatus('success');
                // Update local config to match successful server update
                updateServerConfig({ backupPath: pathInput });
                setServerReportedPath(data.path || pathInput); // Update display
                setIsEditingPath(false);
                setTimeout(() => setFolderStatus('idle'), 3000);
            } else {
                throw new Error(data.error || "Server rejected path");
            }
        } catch (e: any) {
            setFolderStatus('error');
            showToast(e.message, 'error');
            setTimeout(() => setFolderStatus('idle'), 3000);
        }
    };

    const formatPathDisplay = (path: string) => {
        if (!path) return 'Not Configured';
        
        // Handle standard iCloud path structure
        if (path.includes('/Library/Mobile Documents/com~apple~CloudDocs')) {
             return path.replace(/\/Users\/[^\/]+\/Library\/Mobile Documents\/com~apple~CloudDocs/g, '{iCloud}');
        }
        
        // Handle generic Home path
        if (path.startsWith('/Users/')) {
            return path.replace(/\/Users\/[^\/]+/, '{Home}');
        }
        
        // Handle Linux/Windows home if applicable (simple check)
        if (path.startsWith('/home/')) {
            return path.replace(/\/home\/[^\/]+/, '{Home}');
        }

        return path;
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6 animate-in fade-in duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Server size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Server & Connection</h3>
                        <p className="text-xs text-neutral-400">Manage connection state.</p>
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

                {/* Backup Settings (Only when Connected) */}
                {status === 'connected' && (
                    <div className="space-y-5 pt-4 border-t border-neutral-200/50 animate-in fade-in">
                        
                        {/* Path Config */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><FolderOpen size={10}/> Storage Path</label>
                            
                            {isEditingPath ? (
                                <div className="flex gap-2 animate-in fade-in zoom-in-95">
                                    <div className="flex-1 relative">
                                        <input 
                                            type="text" 
                                            value={pathInput}
                                            onChange={(e) => setPathInput(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2.5 bg-white border-2 border-indigo-500 rounded-xl text-xs font-bold text-neutral-900 focus:outline-none shadow-sm"
                                            placeholder="Enter absolute server path..."
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveServerFolder();
                                                if (e.key === 'Escape') setIsEditingPath(false);
                                            }}
                                        />
                                        <button onClick={() => setIsEditingPath(false)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700">
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={saveServerFolder}
                                        disabled={folderStatus === 'updating'}
                                        className={`px-4 rounded-xl font-black text-[10px] uppercase transition-all shadow-md active:scale-95 flex items-center gap-1.5 ${folderStatus === 'success' ? 'bg-green-500 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
                                    >
                                        {folderStatus === 'updating' ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                                        <span>Save</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between p-3 bg-white border border-neutral-200 rounded-xl group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-2 bg-neutral-100 rounded-lg text-neutral-500">
                                            <FolderOpen size={16} />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">Active Directory</span>
                                            <span className="text-xs font-bold text-neutral-800 truncate" title={serverReportedPath || config.server.backupPath}>
                                                {formatPathDisplay(serverReportedPath || config.server.backupPath)}
                                            </span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setIsEditingPath(true)} 
                                        className="p-2 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="Change Path"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                </div>
                            )}

                            {isEditingPath && (
                                <div className="flex justify-end">
                                    <button onClick={handleSetIcloudPath} className="text-[10px] font-bold text-sky-600 hover:underline hover:text-sky-700 transition-colors">
                                        Use iCloud Documents Path
                                    </button>
                                </div>
                            )}
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
                    </div>
                )}
            </div>
        </section>
    );
};
