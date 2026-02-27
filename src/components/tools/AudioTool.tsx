
import React, { useState, useRef, useEffect } from 'react';
import ConfirmationModal from '../common/ConfirmationModal';
import { Mic, Upload, Loader2, FolderOpen, Play, Pause, Save, Folder, ChevronRight, Copy, RefreshCw, CornerLeftUp, Trash2, FileAudio } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { AudioTrimmer } from '../common/AudioTrimmer';
import { startRecording, stopRecording } from '../../utils/audio';
import { copyToClipboard } from '../../utils/text';
// Note: SpeechRecognitionManager is not strictly needed for the pure tool but good to have if we expand
import { SpeechRecognitionManager } from '../../utils/speechRecognition';

interface FileItem {
    name: string;
    type: 'file' | 'directory';
}

export const AudioTool: React.FC = () => {
    const config = getConfig();
    const serverUrl = getServerUrl(config);
    const { showToast } = useToast();

    // Mappings State
    const [mappings, setMappings] = useState<Record<string, string>>({});
    
    // Recorder State
    const [isRecording, setIsRecording] = useState(false);
    const [rawBlob, setRawBlob] = useState<Blob | null>(null);
    const [trimmedBlob, setTrimmedBlob] = useState<Blob | null>(null);
    
    // Upload State
    const [selectedMap, setSelectedMap] = useState('');
    const [uploadFilename, setUploadFilename] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    
    // Browser State
    const [browserMap, setBrowserMap] = useState<string | null>(null);
    const [currentPath, setCurrentPath] = useState(''); 
    const [fileList, setFileList] = useState<FileItem[]>([]); 
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchMappings = async () => {
        try {
            const res = await fetch(`${serverUrl}/api/audio/mappings`);
            if (res.ok) {
                const maps = await res.json();
                setMappings(maps);
                // Default selection
                const keys = Object.keys(maps);
                if (keys.length > 0 && !selectedMap) setSelectedMap(keys[0]);
                if (keys.length > 0 && !browserMap) {
                     setBrowserMap(keys[0]);
                     fetchFiles(keys[0], '');
                }
            }
        } catch (e) {
            console.error("Failed to fetch mappings", e);
        }
    };

    useEffect(() => {
        fetchMappings();
    }, [serverUrl]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const fetchFiles = async (mapName: string, path: string = '') => {
        setIsLoadingFiles(true);
        setFileList([]);
        try {
            const encodedPath = encodeURIComponent(path);
            const res = await fetch(`${serverUrl}/api/audio/files/${mapName}?path=${encodedPath}`);
            if (res.ok) {
                const data = await res.json();
                setFileList(data.items);
                setCurrentPath(data.currentPath);
            } else {
                showToast("Failed to load files", "error");
            }
        } catch (e) {
            showToast("Connection error", "error");
        } finally {
            setIsLoadingFiles(false);
        }
    };

    const handleBrowseMap = (name: string) => {
        setBrowserMap(name);
        setSelectedMap(name);
        setCurrentPath('');
        fetchFiles(name, '');
    };

    const handleNavigateFolder = (folderName: string) => {
        if (!browserMap) return;
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        fetchFiles(browserMap, newPath);
    };

    const handleNavigateUp = () => {
        if (!browserMap || !currentPath) return;
        const parts = currentPath.split('/');
        parts.pop();
        const newPath = parts.join('/');
        fetchFiles(browserMap, newPath);
    };

    const handleDeleteFile = (e: React.MouseEvent, filename: string) => {
        e.stopPropagation();
        if (!browserMap) return;
        setDeleteTarget(filename);
    };

    const confirmDeleteFile = async () => {
        if (!browserMap || !deleteTarget) return;

        setIsDeleting(true);
        const pathPart = currentPath ? `${currentPath}/${deleteTarget}` : deleteTarget;

        try {
            const res = await fetch(`${serverUrl}/api/audio/file?mapName=${encodeURIComponent(browserMap)}&filename=${encodeURIComponent(pathPart)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast("File deleted", "success");
                fetchFiles(browserMap, currentPath);
            } else {
                showToast(data.error || "Delete failed", "error");
            }
        } catch (e) {
            showToast("Server error", "error");
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
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
            const byteCharacters = atob(result.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.mimeType });
            setRawBlob(blob);
            setTrimmedBlob(blob); 
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
        formData.append('mapName', selectedMap);
        formData.append('filename', uploadFilename);
        formData.append('audio', trimmedBlob, uploadFilename);

        try {
            const res = await fetch(`${serverUrl}/api/audio/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showToast("Audio uploaded successfully!", "success");
                setRawBlob(null);
                setTrimmedBlob(null);
                setUploadFilename('');
                if (browserMap === selectedMap) {
                    fetchFiles(selectedMap, currentPath); 
                }
            } else {
                showToast(data.error || "Upload failed", "error");
            }
        } catch (e) {
            showToast("Upload error", "error");
        } finally {
            setIsUploading(false);
        }
    };
    
    const constructUrl = (filename: string) => {
        if (!browserMap) return '';
        const pathPart = currentPath ? `${currentPath}/${filename}` : filename;
        return `${serverUrl}/api/audio/stream/${browserMap}/${pathPart}`;
    };

    const handleCopyUrl = (e: React.MouseEvent, filename: string) => {
        e.stopPropagation();
        const url = constructUrl(filename);
        if (!url) return;
        copyToClipboard(url);
        showToast("Audio URL copied!", "success");
    };

    const handlePreviewAudio = (filename: string) => {
        const url = constructUrl(filename);
        if (!url) return;
        
        if (previewUrl === url && isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }

        if (audioRef.current) audioRef.current.pause();

        const audio = new Audio(url);
        audioRef.current = audio;
        setPreviewUrl(url);
        
        audio.play().then(() => setIsPlaying(true)).catch(() => {
            showToast("Failed to play audio", "error");
            setIsPlaying(false);
        });
        
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => { setIsPlaying(false); setPreviewUrl(null); };
    };

    return (
        <div className="flex flex-col h-full gap-4">
            
            {/* 1. RECORDER / UPLOADER (MOVED TO TOP) */}
            <div className="shrink-0 bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm">
                {!rawBlob ? (
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={isRecording ? handleStopRecord : handleStartRecord}
                            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${isRecording ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-white hover:border-indigo-300 hover:text-indigo-600'}`}
                        >
                            <Mic size={20} />
                            <span className="font-bold text-xs">{isRecording ? 'Stop Recording' : 'Record Voice'}</span>
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 p-3 rounded-xl border bg-neutral-50 border-neutral-200 text-neutral-600 transition-all hover:bg-white hover:border-indigo-300 hover:text-indigo-600"
                        >
                            <Upload size={20} />
                            <span className="font-bold text-xs">Upload File</span>
                            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        <AudioTrimmer audioBlob={rawBlob} onTrim={(blob) => { setTrimmedBlob(blob); showToast("Trimmed!", "success"); }} onCancel={() => { setRawBlob(null); setTrimmedBlob(null); }} />
                        <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                            <div className="flex flex-col gap-3">
                                <select value={selectedMap} onChange={e => setSelectedMap(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs font-bold bg-white focus:ring-2 focus:ring-neutral-900 outline-none">
                                    <option value="">Target Folder...</option>
                                    {Object.keys(mappings).map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                                <input value={uploadFilename} onChange={e => setUploadFilename(e.target.value)} placeholder="filename.wav" className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs font-bold bg-white focus:ring-2 focus:ring-neutral-900 outline-none" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setRawBlob(null); setTrimmedBlob(null); }} className="flex-1 py-2.5 bg-white border border-neutral-200 text-neutral-500 rounded-xl font-bold text-xs hover:bg-neutral-50 transition-all">Cancel</button>
                                <button 
                                    onClick={handleUploadToServer} 
                                    disabled={isUploading || !selectedMap || !uploadFilename}
                                    className="flex-[2] py-2.5 bg-neutral-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                >
                                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    <span>Save</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. FILE BROWSER */}
            <div className="flex-1 flex flex-col min-h-0 bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="p-3 border-b border-neutral-200 bg-white space-y-2 shrink-0">
                    <div className="flex items-center gap-2">
                         <select 
                            value={browserMap || ''} 
                            onChange={(e) => handleBrowseMap(e.target.value)}
                            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-neutral-900"
                        >
                            <option value="" disabled>Select Folder...</option>
                            {Object.keys(mappings).map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                        
                        <div className="flex-1 flex items-center gap-1 overflow-hidden">
                            {currentPath && (
                                <>
                                    <ChevronRight size={14} className="text-neutral-300 shrink-0"/>
                                    <span className="text-xs font-mono text-neutral-500 truncate" title={currentPath}>
                                        {currentPath}
                                    </span>
                                </>
                            )}
                        </div>
                        {browserMap && (
                             <button onClick={() => fetchFiles(browserMap, currentPath)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors"><RefreshCw size={14} className={isLoadingFiles ? 'animate-spin' : ''}/></button>
                        )}
                    </div>

                    {currentPath && (
                        <button onClick={handleNavigateUp} className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-[10px] font-bold hover:bg-neutral-200 transition-colors w-fit">
                            <CornerLeftUp size={12} /> Up One Level
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {isLoadingFiles ? (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2">
                            <Loader2 size={24} className="animate-spin" />
                            <p className="text-[10px] font-bold uppercase tracking-wider">Loading...</p>
                        </div>
                    ) : fileList.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2">
                            <FileAudio size={32} className="opacity-20" />
                            <p className="text-xs font-medium">Empty folder.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-1">
                            {fileList.map((item, idx) => {
                                if (item.type === 'directory') {
                                    return (
                                        <div key={`${item.name}-${idx}`} onClick={() => handleNavigateFolder(item.name)} className="flex items-center justify-between p-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-neutral-100 transition-all cursor-pointer group">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="p-2 rounded-full bg-blue-50 text-blue-500"><Folder size={14} fill="currentColor" /></div>
                                                <span className="text-xs font-bold text-neutral-700 truncate">{item.name}</span>
                                            </div>
                                            <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-500" />
                                        </div>
                                    );
                                } else {
                                    const isPreviewing = previewUrl?.endsWith(`/${encodeURIComponent(item.name)}`);
                                    return (
                                        <div key={`${item.name}-${idx}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-neutral-100 transition-all group">
                                            <div className="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onClick={() => handlePreviewAudio(item.name)}>
                                                <button className={`p-2 rounded-full transition-colors ${isPreviewing && isPlaying ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'}`}>
                                                    {isPreviewing && isPlaying ? <Pause size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>}
                                                </button>
                                                <span className={`text-xs font-medium truncate ${isPreviewing ? 'text-indigo-700 font-bold' : 'text-neutral-700'}`}>{item.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => handleCopyUrl(e, item.name)} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Copy URL"><Copy size={12} /></button>
                                                {browserMap === 'Upload_Audio' && (
                                                    <button
                                                        onClick={(e) => handleDeleteFile(e, item.name)}
                                                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }
                            })}
                        </div>
                    )}
                </div>
            </div>
        <ConfirmationModal
            isOpen={!!deleteTarget}
            title="Delete Audio File"
            message={`Are you sure you want to delete "${deleteTarget}"? This action cannot be undone.`}
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={confirmDeleteFile}
            onClose={() => setDeleteTarget(null)}
            isLoading={isDeleting}
        />
    </div>
    );
};
