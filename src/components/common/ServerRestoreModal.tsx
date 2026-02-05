
import React from 'react';
import { Cloud, X, User, Loader2, Plus, FileJson } from 'lucide-react';
import { ServerBackupItem } from '../../services/backupService';

export interface RestoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    backups: ServerBackupItem[];
    onRestore: (identifier: string) => void;
    onNewUser: () => void;
    onLocalRestore: () => void;
    isRestoring: boolean;
    title?: string;
    description?: string;
}

export const ServerRestoreModal: React.FC<RestoreModalProps> = ({ 
    isOpen, 
    onClose, 
    backups, 
    onRestore, 
    onNewUser,
    onLocalRestore,
    isRestoring,
    title = "Server Backups",
    description = "Select a user profile to restore."
}) => {
    if (!isOpen) return null;

    const formatSize = (bytes: number) => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[85vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><Cloud size={20}/> {title}</h3>
                        <p className="text-sm text-neutral-500 mt-1">{description}</p>
                    </div>
                    <button onClick={onClose} disabled={isRestoring} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                
                <main className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                    {backups.length === 0 ? (
                        <div className="text-center py-10 text-neutral-400 font-medium italic">No backups found on server.</div>
                    ) : (
                        backups.map(backup => (
                            <div key={backup.id} className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50 border border-neutral-100 hover:border-neutral-300 transition-all group">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2.5 bg-white rounded-xl text-neutral-500 shadow-sm"><User size={18}/></div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-sm text-neutral-900 truncate">{backup.name}</h4>
                                        <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-medium">
                                            <span>{new Date(backup.date).toLocaleDateString()}</span>
                                            <span className="w-1 h-1 rounded-full bg-neutral-300"></span>
                                            <span>{formatSize(backup.size)}</span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onRestore(backup.id)}
                                    disabled={isRestoring}
                                    className="px-4 py-2 bg-white border border-neutral-200 text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                >
                                    {isRestoring ? <Loader2 size={14} className="animate-spin"/> : 'Restore'}
                                </button>
                            </div>
                        ))
                    )}
                </main>

                <footer className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/30 shrink-0 flex flex-col gap-3 rounded-b-[2.5rem]">
                    <button 
                        onClick={onNewUser}
                        disabled={isRestoring}
                        className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
                    >
                        <Plus size={16} />
                        <span>I am a New User (Create Profile)</span>
                    </button>
                    
                    <div className="flex justify-center">
                        <button 
                            onClick={onLocalRestore}
                            disabled={isRestoring}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors py-1 px-2 rounded-lg hover:bg-neutral-100"
                        >
                            <FileJson size={12} />
                            <span>Or restore from local file</span>
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
