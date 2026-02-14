
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Folder, Plus, Trash2, Volume2, Upload, Scissors, Play, Save, CheckCircle2, AlertCircle, Loader2, FolderOpen, Copy, FileAudio, Pause, RefreshCw, ChevronRight, CornerLeftUp } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { AudioTrimmer } from '../common/AudioTrimmer';
import { startRecording, stopRecording } from '../../utils/audio';
import { copyToClipboard } from '../../utils/text';

interface Props {}

interface FileItem {
    name: string;
    type: 'file' | 'directory';
}

export const AudioServerSettings: React.FC<Props> = () => {
    const config = getConfig();
    const serverUrl = getServerUrl(config);
    const { showToast } = useToast();

    // Mappings State
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [newMapName, setNewMapName] = useState('');
    const [newMapPath, setNewMapPath] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

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
    const [currentPath, setCurrentPath] = useState(''); // New: Track subfolder path
    const [fileList, setFileList] = useState<FileItem[]>([]); // Updated type
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchMappings = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch(`${serverUrl}/api/audio/mappings`);
            if (res.ok) {
                setMappings(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch mappings", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchMappings();
    }, [serverUrl]);

    // Cleanup audio on unmount
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
            // Encode path components
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
        // Also set upload target for convenience
        setSelectedMap(name);
        // Reset path when switching maps
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

    const handleAddMapping = async () => {
        if (!newMapName || !newMapPath) return;
        try {
            const res = await fetch(`${serverUrl}/api/audio/mappings`, {
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
            const res = await fetch(`${serverUrl}/api/audio/mappings/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setMappings(data.mappings);
                if (browserMap === name) {
                    setBrowserMap(null);
                    setFileList([]);
                    setCurrentPath('');
                }
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
                // Refresh list if looking at same map
                if (browserMap === selectedMap) {
                    fetchFiles(selectedMap, currentPath); // Maintain current folder context
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
        // Only append slash if currentPath exists
        const pathPart = currentPath ? `${currentPath}/${filename}` : filename;
        // Need to encode the path part to handle spaces/special chars in folder names
        return `${serverUrl}/api/audio/stream/${browserMap}/${pathPart}`;
    };

    const handleCopyUrl = (filename: string) => {
        const url = constructUrl(filename);
        if (!url) return;
        copyToClipboard(url);
        showToast("Audio URL copied to clipboard!", "success");
    };

    const handlePreviewAudio = (filename: string) => {
        const url = constructUrl(filename);
        if (!url) return;
        
        // Check exact match (ignoring query params if any added later)
        if (previewUrl === url && isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
        }

        const audio = new Audio(url);
        audioRef.current = audio;
        setPreviewUrl(url);
        
        audio.play().then(() => setIsPlaying(true)).catch(() => {
            showToast("Failed to play audio", "error");
            setIsPlaying(false);
        });
        
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
            setIsPlaying(false);
            setPreviewUrl(null);
        };
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-neutral-100 text-neutral-600 rounded-2xl"><Volume2 size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Audio Server</h3>
                    <p className="text-xs text-neutral-400">Map local folders and manage audio assets.</p>
                </div>
            </div>

            {/* MAPPINGS SECTION */}
            <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-1">Directory Mappings</h4>
                <div className="bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden">
                    {Object.entries(mappings).length === 0 ? (
                        <div className="p-6 text-center text-xs text-neutral-400">No mappings configured.</div>
                    ) : (
                        <div className="divide-y divide-neutral-200">
                            {Object.entries(mappings).map(([name, path]) => (
                                <div key={name} className="p-4 flex items-center justify-between hover:bg-white transition-colors group">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <Folder size={14} className="text-indigo-500" />
                                            <span className="font-bold text-sm text-neutral-800">{name}</span>
                                        </div>
                                        <div className="text-[10px] text-neutral-500 font-mono mt-1 ml-6">{path}</div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleBrowseMap(name)} 
                                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                                        >
                                            <FolderOpen size={12} /> Browse
                                        </button>
                                        <button onClick={() => handleDeleteMapping(name)} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="p-4 bg-white border-t border-neutral-200 flex flex-col md:flex-row gap-3">
                        <input value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="Logical Name (e.g. 'Cam15')" className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                        <input value={newMapPath} onChange={e => setNewMapPath(e.target.value)} placeholder="Physical Path (e.g. ~/Music/Cam15)" className="flex-[2] px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500" />
                        <button onClick={handleAddMapping} disabled={!newMapName || !newMapPath} className="px-4 py-2 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-neutral-800 disabled:opacity-50"><Plus size={14}/> Add</button>
                    </div>
                </div>
            </div>
            
            {/* FILE BROWSER SECTION */}
            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="flex justify-between items-center px-1">
                    <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">File Browser</h4>
                    {browserMap && (
                        <button 
                            onClick={() => fetchFiles(browserMap, currentPath)} 
                            className="text-neutral-400 hover:text-neutral-900 transition-colors p-1" 
                            title="Refresh List"
                        >
                            <RefreshCw size={12} className={isLoadingFiles ? 'animate-spin' : ''} />
                        </button>
                    )}
                </div>

                <div className="bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden flex flex-col min-h-[300px]">
                    {/* Browser Toolbar */}
                    <div className="p-3 border-b border-neutral-200 bg-white space-y-2">
                        <div className="flex items-center gap-2">
                             <select 
                                value={browserMap || ''} 
                                onChange={(e) => handleBrowseMap(e.target.value)}
                                className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 outline-none focus:ring-2 focus:ring-neutral-900"
                            >
                                <option value="" disabled>Select Mapping...</option>
                                {Object.keys(mappings).map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                            
                            {/* Breadcrumbs or Path Display */}
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
                        </div>

                        {currentPath && (
                            <button 
                                onClick={handleNavigateUp} 
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-[10px] font-bold hover:bg-neutral-200 transition-colors w-fit"
                            >
                                <CornerLeftUp size={12} /> Up One Level
                            </button>
                        )}
                    </div>

                    {/* File List */}
                    <div className="flex-1 overflow-y-auto max-h-[400px] p-2 custom-scrollbar">
                        {!browserMap ? (
                            <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2 py-10">
                                <FolderOpen size={32} className="opacity-20" />
                                <p className="text-xs font-medium">Select a map to view audio files.</p>
                            </div>
                        ) : isLoadingFiles ? (
                             <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2 py-10">
                                <Loader2 size={24} className="animate-spin" />
                                <p className="text-[10px] font-bold uppercase tracking-wider">Loading...</p>
                            </div>
                        ) : fileList.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2 py-10">
                                <FileAudio size={32} className="opacity-20" />
                                <p className="text-xs font-medium">Empty folder.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-1">
                                {fileList.map((item, idx) => {
                                    if (item.type === 'directory') {
                                        return (
                                            <div key={`${item.name}-${idx}`} 
                                                 onClick={() => handleNavigateFolder(item.name)}
                                                 className="flex items-center justify-between p-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-neutral-100 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="p-2 rounded-full bg-blue-50 text-blue-500">
                                                        <Folder size={14} fill="currentColor" />
                                                    </div>
                                                    <span className="text-xs font-bold text-neutral-700 truncate">{item.name}</span>
                                                </div>
                                                <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-500" />
                                            </div>
                                        );
                                    } else {
                                        const isPreviewing = previewUrl?.endsWith(`/${encodeURIComponent(item.name)}`);
                                        return (
                                            <div key={`${item.name}-${idx}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-neutral-100 transition-all group">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <button 
                                                        onClick={() => handlePreviewAudio(item.name)}
                                                        className={`p-2 rounded-full transition-colors ${isPreviewing && isPlaying ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'}`}
                                                    >
                                                        {isPreviewing && isPlaying ? <Pause size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>}
                                                    </button>
                                                    <span className={`text-xs font-medium truncate ${isPreviewing ? 'text-indigo-700 font-bold' : 'text-neutral-700'}`}>{item.name}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleCopyUrl(item.name)}
                                                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Copy Stream URL"
                                                >
                                                    <Copy size={12} /> <span className="hidden sm:inline">Link</span>
                                                </button>
                                            </div>
                                        );
                                    }
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RECORDER / UPLOADER */}
            <div className="space-y-4 pt-4 border-t border-neutral-100">
                <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-1">Audio Tool</h4>
                
                {!rawBlob ? (
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={isRecording ? handleStopRecord : handleStartRecord}
                            className={`p-8 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all ${isRecording ? 'bg-red-50 border-red-400 text-red-600 animate-pulse' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-white hover:border-indigo-400 hover:text-indigo-600'}`}
                        >
                            <Mic size={32} />
                            <span className="font-bold text-sm">{isRecording ? 'Stop Recording' : 'Record Voice'}</span>
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-8 rounded-3xl border-2 border-dashed bg-neutral-50 border-neutral-200 text-neutral-500 flex flex-col items-center justify-center gap-3 transition-all hover:bg-white hover:border-indigo-400 hover:text-indigo-600"
                        >
                            <Upload size={32} />
                            <span className="font-bold text-sm">Upload File</span>
                            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <AudioTrimmer 
                            audioBlob={rawBlob} 
                            onTrim={(blob) => { setTrimmedBlob(blob); showToast("Trimmed!", "success"); }} 
                            onCancel={() => { setRawBlob(null); setTrimmedBlob(null); }} 
                        />
                        
                        <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-200 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-neutral-400 px-1">Target Folder</label>
                                    <select 
                                        value={selectedMap} 
                                        onChange={e => setSelectedMap(e.target.value)} 
                                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-xs font-bold bg-white focus:ring-2 focus:ring-neutral-900 outline-none"
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
                                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-xs font-bold bg-white focus:ring-2 focus:ring-neutral-900 outline-none"
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={handleUploadToServer} 
                                disabled={isUploading || !selectedMap || !uploadFilename}
                                className="w-full py-4 bg-neutral-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                            >
                                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                <span>Upload to Server</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};
