import React, { useState } from 'react';
import { ArchiveRestore, HardDriveUpload, Loader2, RefreshCcw, Trash2, X } from 'lucide-react';
import { ServerArchiveItem } from '../../services/backupService';
import ConfirmationModal from './ConfirmationModal';

interface ServerArchiveModalProps {
    isOpen: boolean;
    userName: string;
    archives: ServerArchiveItem[];
    isLoading: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onCreateArchive: () => void;
    onRestore: (archiveId: string) => void;
    onDelete: (archiveId: string) => void;
}

function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ServerArchiveModal: React.FC<ServerArchiveModalProps> = ({
    isOpen,
    userName,
    archives,
    isLoading,
    isSubmitting,
    onClose,
    onRefresh,
    onCreateArchive,
    onRestore,
    onDelete,
}) => {
    const [pendingDelete, setPendingDelete] = useState<ServerArchiveItem | null>(null);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2.5rem] border border-neutral-200 bg-white shadow-2xl">
                <header className="flex items-center justify-between border-b border-neutral-100 px-8 py-6">
                    <div>
                        <h3 className="flex items-center gap-2 text-xl font-black text-neutral-900">
                            <ArchiveRestore size={20} />
                            Restore From Archive
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                            Server archives for <span className="font-black text-neutral-700">{userName}</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100"
                    >
                        <X size={20} />
                    </button>
                </header>

                <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50/50 px-6 py-4">
                    <button
                        type="button"
                        onClick={onCreateArchive}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <HardDriveUpload size={14} />}
                        Archive Current
                    </button>
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-50"
                    >
                        <RefreshCcw size={14} />
                        Refresh
                    </button>
                </div>

                <main className="flex-1 space-y-3 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 text-neutral-400">
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    ) : archives.length === 0 ? (
                        <div className="py-12 text-center text-sm font-medium italic text-neutral-400">
                            No archive files found for this user.
                        </div>
                    ) : (
                        archives.map((archive) => (
                            <div
                                key={archive.id}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-neutral-900">{archive.name}</p>
                                    <p className="mt-1 text-[11px] font-medium text-neutral-500">
                                        {new Date(archive.date).toLocaleString()} • {formatSize(archive.size)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onRestore(archive.id)}
                                    disabled={isSubmitting}
                                    className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Restore'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPendingDelete(archive)}
                                    disabled={isSubmitting}
                                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </main>
            </div>
            <ConfirmationModal
                isOpen={!!pendingDelete}
                title="Delete Archive?"
                message={pendingDelete ? `Delete archive "${pendingDelete.name}"? This cannot be undone.` : ''}
                confirmText="Delete"
                isProcessing={isSubmitting}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    onDelete(pendingDelete.id);
                    setPendingDelete(null);
                }}
                onClose={() => setPendingDelete(null)}
            />
        </div>
    );
};
