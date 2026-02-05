
import React, { useEffect, useState } from 'react';
import { Loader2, Server, Wifi, AlertTriangle, ExternalLink, RefreshCw, X, ShieldAlert, Square, ScanSearch, Link } from 'lucide-react';
import { getServerUrl, getConfig } from '../../app/settingsManager';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onRetry: (url?: string) => Promise<boolean>;
    onStop: () => void;
    status: 'idle' | 'scanning' | 'success' | 'failed';
    serverUrl?: string;
}

export const ConnectionModal: React.FC<Props> = ({ isOpen, onClose, onRetry, onStop, status, serverUrl }) => {
    const config = getConfig();
    const [localStatus, setLocalStatus] = useState(status);
    const [manualUrl, setManualUrl] = useState(serverUrl || getServerUrl(config));

    // Update local URL when prop changes or modal opens
    useEffect(() => {
        if (isOpen) {
             setManualUrl(serverUrl || getServerUrl(config));
        }
    }, [isOpen, serverUrl]);

    useEffect(() => {
        setLocalStatus(status);
    }, [status]);

    if (!isOpen) return null;

    const handleTrust = () => {
        window.open(manualUrl, '_blank');
    };

    const handleManualConnect = async () => {
        setLocalStatus('scanning');
        // Pass the specific manual URL to the controller
        await onRetry(manualUrl);
    };

    const handleAutoScan = async () => {
        setLocalStatus('scanning');
        // Pass undefined to trigger auto-discovery
        await onRetry(undefined);
    };

    const handleStop = () => {
        onStop();
        setLocalStatus('failed'); // Return to interactive state
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-900/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                
                {/* Header Area */}
                <div className={`p-8 text-center space-y-4 ${localStatus === 'failed' ? 'bg-red-50' : 'bg-indigo-50'}`}>
                    <div className="mx-auto w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm relative">
                        {localStatus === 'scanning' && (
                            <>
                                <Loader2 size={40} className="text-indigo-500 animate-spin" />
                                <div className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin"></div>
                            </>
                        )}
                        {localStatus === 'failed' && <AlertTriangle size={40} className="text-red-500" />}
                        {localStatus === 'success' && <Wifi size={40} className="text-green-500" />}
                    </div>
                    
                    <div className="space-y-1">
                        <h3 className="text-2xl font-black text-neutral-900 tracking-tight">
                            {localStatus === 'scanning' ? 'Connecting...' : 
                             localStatus === 'failed' ? 'Connection Failed' : 'Connected!'}
                        </h3>
                        <p className="text-sm font-medium text-neutral-500">
                            {localStatus === 'scanning' && "Contacting Vocab Pro Server..."}
                            {localStatus === 'failed' && "Could not talk to the server."}
                            {localStatus === 'success' && "Server found. Syncing..."}
                        </p>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-6 space-y-6">
                    {localStatus === 'scanning' && (
                        <div className="flex flex-col gap-4">
                            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 animate-progress-indeterminate"></div>
                            </div>
                            <p className="text-xs text-center text-neutral-400 font-medium">Checking {manualUrl}...</p>
                            <button 
                                onClick={handleStop}
                                className="mx-auto px-6 py-2 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-red-50 transition-colors shadow-sm"
                            >
                                <Square size={12} fill="currentColor"/> Stop
                            </button>
                        </div>
                    )}

                    {localStatus === 'failed' && (
                        <div className="space-y-4">
                            {/* Manual Input Section */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Server Address</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={manualUrl}
                                        onChange={(e) => setManualUrl(e.target.value)}
                                        className="flex-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                                        placeholder="http://localhost:3000"
                                    />
                                    <button 
                                        onClick={handleManualConnect}
                                        className="px-4 py-3 bg-neutral-900 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-neutral-800 shadow-lg active:scale-95"
                                    >
                                        <Link size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button 
                                    onClick={handleAutoScan}
                                    className="col-span-2 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                                >
                                    <ScanSearch size={14} />
                                    <span>Auto-Scan Network</span>
                                </button>
                            </div>

                            {/* Trust Certificate Section */}
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col gap-3">
                                <div className="flex gap-3">
                                    <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-black text-amber-800 uppercase tracking-wide">HTTPS Security</h4>
                                        <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                                            If the URL is correct but connection fails, your browser blocked it.
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleTrust}
                                    className="w-full py-2 bg-amber-100 text-amber-800 rounded-lg font-bold text-xs flex items-center justify-center gap-2 hover:bg-amber-200 transition-colors"
                                >
                                    <ExternalLink size={12} />
                                    <span>Open & Trust Certificate</span>
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {localStatus === 'success' && (
                        <div className="text-center py-4">
                            <p className="text-green-600 font-bold text-lg animate-bounce">Ready to go!</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {localStatus === 'failed' && (
                    <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-center">
                        <button onClick={onClose} className="text-xs font-bold text-neutral-400 hover:text-neutral-600 flex items-center gap-1 transition-colors">
                            <X size={14} /> Continue Offline
                        </button>
                    </div>
                )}
            </div>
             <style>{`
                @keyframes progress-indeterminate {
                    0% { width: 30%; transform: translateX(-100%); }
                    50% { width: 30%; transform: translateX(150%); }
                    100% { width: 30%; transform: translateX(350%); }
                }
                .animate-progress-indeterminate {
                    animation: progress-indeterminate 1.5s infinite linear;
                }
            `}</style>
        </div>
    );
};
