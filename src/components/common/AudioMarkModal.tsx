import React, { useState, useEffect } from 'react';
import { Volume2, Settings2 } from 'lucide-react';

interface AudioMarkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: { filename?: string; start?: string; duration?: string }) => void;
    audioFiles: string[];
    initialData?: { filename?: string; start?: string; duration?: string } | null;
}

export const AudioMarkModal: React.FC<AudioMarkModalProps> = ({ isOpen, onClose, onConfirm, audioFiles, initialData }) => {
    const [selectedFile, setSelectedFile] = useState('');
    const [start, setStart] = useState('');
    const [duration, setDuration] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // Edit Mode: Pre-fill data
                // Check if initial filename matches one of our files (or if it was empty/TTS)
                const fileToSet = initialData.filename && audioFiles.includes(initialData.filename) 
                    ? initialData.filename 
                    : (initialData.filename || (audioFiles.length > 0 ? audioFiles[0] : ''));

                setSelectedFile(fileToSet);
                setStart(initialData.start || '');
                setDuration(initialData.duration || '');
            } else {
                // New Mode
                setSelectedFile(audioFiles.length > 0 ? audioFiles[0] : '');
                setStart('');
                setDuration('');
            }
        }
    }, [isOpen, audioFiles, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm({ 
            filename: selectedFile, 
            start: start.trim(), 
            duration: duration.trim() 
        });
    };

    const getFilename = (url: string) => decodeURIComponent(url.split('/').pop() || '');

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-neutral-200 p-6">
                <h3 className="text-lg font-black text-neutral-900 mb-4 flex items-center gap-2">
                    {initialData ? <Settings2 size={20} className="text-indigo-600"/> : <Volume2 size={20} className="text-indigo-600"/>} 
                    {initialData ? 'Edit Audio Settings' : 'Mark Audio Segment'}
                </h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Source Audio (Optional)</label>
                        <select 
                            value={selectedFile} 
                            onChange={e => setSelectedFile(e.target.value)}
                            className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                        >
                            <option value="">None (Use Text-to-Speech)</option>
                            {audioFiles.map((url, i) => (
                                <option key={i} value={url}>{getFilename(url)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Start (Sec)</label>
                            <input 
                                type="number" step="0.1" min="0"
                                value={start} 
                                onChange={e => setStart(e.target.value)}
                                placeholder="e.g. 5.5" 
                                className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Duration (Sec)</label>
                            <input 
                                type="number" step="0.1" min="0"
                                value={duration} 
                                onChange={e => setDuration(e.target.value)}
                                placeholder="e.g. 10" 
                                className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-neutral-500 font-bold text-xs hover:bg-neutral-100 rounded-lg transition-colors">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-neutral-900 text-white font-bold text-xs rounded-lg hover:bg-neutral-800 transition-colors">Apply</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
