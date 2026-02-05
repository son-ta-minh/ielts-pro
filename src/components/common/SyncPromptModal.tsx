
import React from 'react';
// Fix: Replace non-existent ArrowUpCloud and ArrowDownCloud with CloudUpload and CloudDownload from lucide-react
import { Cloud, CloudUpload, CloudDownload, X, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onPush: () => Promise<void>;
    onRestore: () => Promise<void>;
    type: 'push' | 'restore';
    localDate: string;
    serverDate: string;
    isProcessing: boolean;
}

export const SyncPromptModal: React.FC<Props> = ({ 
    isOpen, onClose, onPush, onRestore, type, localDate, serverDate, isProcessing 
}) => {
    if (!isOpen) return null;

    const isRestore = type === 'restore';

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-neutral-900/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <div className={`p-8 text-center space-y-4 ${isRestore ? 'bg-indigo-50' : 'bg-emerald-50'}`}>
                    <div className="mx-auto w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm relative">
                        {isRestore ? (
                            /* Fix: Use CloudDownload instead of non-existent ArrowDownCloud */
                            <CloudDownload size={40} className="text-indigo-500" />
                        ) : (
                            /* Fix: Use CloudUpload instead of non-existent ArrowUpCloud */
                            <CloudUpload size={40} className="text-emerald-500" />
                        )}
                        <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-1 border-2 border-white">
                            <AlertTriangle size={12} className="text-white" />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <h3 className="text-2xl font-black text-neutral-900 tracking-tight">
                            {isRestore ? 'Update Available' : 'Unsaved Progress'}
                        </h3>
                        <p className="text-sm font-medium text-neutral-500">
                            {isRestore 
                                ? 'The server has a newer version of your data.' 
                                : 'Your local data is newer than the cloud backup.'}
                        </p>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                            <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Local Device</p>
                            <p className="text-xs font-bold text-neutral-700">{localDate}</p>
                        </div>
                        <div className="space-y-1 p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                            <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Cloud Server</p>
                            <p className="text-xs font-bold text-neutral-700">{serverDate}</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <button 
                            onClick={isRestore ? onRestore : onPush}
                            disabled={isProcessing}
                            className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center space-x-2 ${
                                isRestore 
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' 
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                            }`}
                        >
                            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : (isRestore ? <CloudDownload size={18}/> : <CloudUpload size={18}/>)}
                            <span>{isRestore ? 'RESTORE FROM CLOUD' : 'PUSH TO CLOUD'}</span>
                        </button>
                        
                        <button 
                            onClick={onClose}
                            disabled={isProcessing}
                            className="w-full py-4 bg-neutral-100 text-neutral-500 rounded-2xl font-bold text-sm hover:bg-neutral-200 transition-all"
                        >
                            Ignore for now
                        </button>
                    </div>
                </div>
                
                <div className="bg-neutral-50 px-8 py-4 border-t border-neutral-100">
                    <p className="text-[9px] font-medium text-neutral-400 text-center leading-relaxed">
                        Automatic synchronization helps keep your library consistent across all your devices.
                    </p>
                </div>
            </div>
        </div>
    );
};
