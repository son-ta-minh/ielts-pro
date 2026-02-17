
import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Upload, Loader2, Folder, Trash2, Copy, RefreshCw, Plus, ChevronRight, CornerLeftUp } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { copyToClipboard } from '../../utils/text';

interface FileItem {
    name: string;
    type: 'file' | 'directory';
}

export const ImageManager: React.FC = () => {
    const config = getConfig();
    const serverUrl = getServerUrl(config);
    const { showToast } = useToast();

    // Mappings
    const [mappings, setMappings] = useState<Record<string, string>>({});
    
    // Browser State
    const [browserMap, setBrowserMap] = useState<string | null>(null);
    const [currentPath, setCurrentPath] = useState('');
    const [fileList, setFileList] = useState<FileItem[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    
    // Upload State
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchMappings = async () => {
        try {
            // Mappings are shared (stored in same file on server), so we can use audio/mappings endpoint
            const res = await fetch(`${serverUrl}/api/audio/mappings`);
            if (res.ok) {
                const maps = await res.json();
                setMappings(maps);
                // Default selection priority: "Image", "Images", "Icon", "Icons", or first available
                const keys = Object.keys(maps);
                const defaultKey = keys.find(k => k.toLowerCase() === 'image' || k.toLowerCase() === 'images' || k.toLowerCase() === 'icon') || keys[0];
                if (defaultKey && !browserMap) {
                    setBrowserMap(defaultKey);
                    fetchFiles(defaultKey, '');
                }
            }
        } catch (e) {
            console.error("Failed to fetch mappings", e);
        }
    };

    useEffect(() => {
        fetchMappings();
    }, [serverUrl]);

    const fetchFiles = async (mapName: string, path: string = '') => {
        setIsLoadingFiles(true);
        setFileList([]);
        try {
            const encodedPath = encodeURIComponent(path);
            const res = await fetch(`${serverUrl}/api/images/files/${mapName}?path=${encodedPath}`);
            if (res.ok) {
                const data = await res.json();
                setFileList(data.items);
                setCurrentPath(data.currentPath);
            } else {
                showToast("Failed to load images", "error");
            }
        } catch (e) {
            showToast("Connection error", "error");
        } finally {
            setIsLoadingFiles(false);
        }
    };

    const handleBrowseMap = (name: string) => {
        setBrowserMap(name);
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

    const handleDeleteFile = async (e: React.MouseEvent, filename: string) => {
        e.stopPropagation();
        if (!browserMap) return;
        
        const pathPart = currentPath ? `${currentPath}/${filename}` : filename;
        
        try {
            const res = await fetch(`${serverUrl}/api/images/file?mapName=${encodeURIComponent(browserMap)}&filename=${encodeURIComponent(pathPart)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                showToast("File deleted", "success");
                fetchFiles(browserMap, currentPath);
            } else {
                showToast(data.error || "Delete failed", "error");
            }
        } catch(e) {
            showToast("Server error", "error");
        }
    };

    const constructUrl = (filename: string) => {
        if (!browserMap) return '';
        const pathPart = currentPath ? `${currentPath}/${filename}` : filename;
        // Images use the same stream pattern logic but handled by image route if needed, 
        // however generic stream works if mapping exists. We use /api/images/stream just to be clean.
        return `${serverUrl}/api/images/stream/${browserMap}/${pathPart}`;
    };

    const handleCopyUrl = (e: React.MouseEvent, filename: string) => {
        e.stopPropagation();
        const url = constructUrl(filename);
        if (!url) return;
        copyToClipboard(url);
        showToast("Image URL copied!", "success");
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !browserMap) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('mapName', browserMap);
        
        // Prefix with current path if inside subfolder
        const finalFilename = currentPath ? `${currentPath}/${file.name}` : file.name;
        
        formData.append('filename', file.name);
        formData.append('image', file);

        try {
            const res = await fetch(`${serverUrl}/api/images/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                showToast("Image uploaded!", "success");
                fetchFiles(browserMap, ''); // Refresh root since that's where it goes
            } else {
                showToast(data.error || "Upload failed", "error");
            }
        } catch (e) {
            showToast("Upload error", "error");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex-1 flex flex-col min-h-0 bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden">
                {/* TOOLBAR */}
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

                    <div className="flex justify-between items-center">
                        {currentPath ? (
                            <button 
                                onClick={handleNavigateUp} 
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-[10px] font-bold hover:bg-neutral-200 transition-colors w-fit"
                            >
                                <CornerLeftUp size={12} /> Up One Level
                            </button>
                        ) : <div></div>}
                        
                        {browserMap && (
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                            >
                                {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                <span>Upload Image</span>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                            </button>
                        )}
                    </div>
                </div>

                {/* GRID VIEW */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {isLoadingFiles ? (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2">
                            <Loader2 size={24} className="animate-spin" />
                            <p className="text-[10px] font-bold uppercase tracking-wider">Loading...</p>
                        </div>
                    ) : fileList.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center text-neutral-400 space-y-2">
                            <ImageIcon size={32} className="opacity-20" />
                            <p className="text-xs font-medium">Empty folder.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {/* Directories First */}
                            {fileList.filter(i => i.type === 'directory').map((item, idx) => (
                                <div 
                                    key={`dir-${idx}`} 
                                    onClick={() => handleNavigateFolder(item.name)}
                                    className="aspect-square rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors gap-2"
                                >
                                    <Folder size={32} className="text-blue-400" />
                                    <span className="text-xs font-bold text-blue-800 truncate px-2 max-w-full">{item.name}</span>
                                </div>
                            ))}
                            
                            {/* Files */}
                            {fileList.filter(i => i.type === 'file').map((item, idx) => {
                                const url = constructUrl(item.name);
                                return (
                                    <div key={`file-${idx}`} className="group relative aspect-square rounded-xl bg-white border border-neutral-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                        <div className="absolute inset-0 bg-neutral-100 flex items-center justify-center">
                                            <img src={url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                                        </div>
                                        
                                        {/* Overlay Actions */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                            <p className="text-[10px] text-white font-medium truncate w-full text-center mb-1">{item.name}</p>
                                            <div className="flex items-center gap-2">
                                                <button onClick={(e) => handleCopyUrl(e, item.name)} className="p-2 bg-white text-indigo-600 rounded-full hover:bg-indigo-50 transition-colors" title="Copy URL"><Copy size={14}/></button>
                                                <button onClick={(e) => handleDeleteFile(e, item.name)} className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
