import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Music, FileText, Folder, ChevronRight, CornerLeftUp, X, Loader2, Server, Tag, Search, ListTodo } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { getConfig, getServerUrl } from '../../app/settingsManager';

interface FileSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (fileData: any) => void; 
    type: 'audio' | 'reading' | 'planning';
    title: string;
}

export const FileSelector: React.FC<FileSelectorProps> = ({ isOpen, onClose, onSelect, type, title }) => {
    const config = getConfig();
    const serverUrl = getServerUrl(config);
    const { showToast } = useToast();

    // Mode: 'folders' (Map folders) or 'master' (Master JSON Aggregation)
    const [mode, setMode] = useState<'folders' | 'master'>('folders');

    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [currentMap, setCurrentMap] = useState<string | null>(null);
    const [currentPath, setCurrentPath] = useState('');
    // Updated type definition to include displayName and tags
    const [fileList, setFileList] = useState<{name: string, type: 'file' | 'directory' | 'unit' | 'plan', displayName?: string, transcript?: string, transcriptTitle?: string, data?: any, tags?: string[]}[]>([]);
    const [loading, setLoading] = useState(false);

    // Tag Search State
    const [tagQuery, setTagQuery] = useState('');
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const tagInputRef = useRef<HTMLInputElement>(null);
    const tagContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setCurrentMap(null);
            setCurrentPath('');
            setFileList([]);
            setTagQuery('');
            setShowTagSuggestions(false);

            // Reading and Planning default to Master Library
            if (type === 'reading' || type === 'planning') {
                setMode('master');
                fetchMasterLibrary();
            } else {
                setMode('folders');
                fetchMappings();
            }
        }
    }, [isOpen, type]);

    // Handle click outside for tag suggestions
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tagContainerRef.current && !tagContainerRef.current.contains(event.target as Node)) {
                setShowTagSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchMappings = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${serverUrl}/api/audio/mappings`); // Mappings are shared
            if (res.ok) {
                setMappings(await res.json());
            } else {
                showToast("Failed to connect to server", "error");
            }
        } catch (_e) {
            showToast("Server unreachable", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchFiles = async (mapName: string, path: string = '') => {
        setLoading(true);
        try {
            const encodedPath = encodeURIComponent(path);
            const endpoint = type === 'audio' ? 'audio' : 'reading'; // 'planning' uses master mode only for now, so no folder browser
            const res = await fetch(`${serverUrl}/api/${endpoint}/files/${mapName}?path=${encodedPath}`);
            if (res.ok) {
                const data = await res.json();
                let items = [];
                if (Array.isArray(data.items)) items = data.items;
                setFileList(items);
                setCurrentPath(data.currentPath || '');
            } else {
                showToast("Failed to load files", "error");
            }
        } catch (_e) {
            showToast("Connection error", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchMasterLibrary = async () => {
        setLoading(true);
        try {
            const endpoint = type === 'planning' ? 'planning' : 'reading';
            const res = await fetch(`${serverUrl}/api/${endpoint}/master`);
            if (res.ok) {
                const data = await res.json();
                let items = [];
                if (Array.isArray(data.items)) {
                    if (type === 'planning') {
                        items = data.items.map((g: any) => ({
                            name: g.id,
                            type: 'plan',
                            displayName: g.displayName,
                            data: {
                                title: g.name,
                                description: g.description,
                                todos: g.todos
                            }
                        }));
                    } else {
                        items = data.items.map((u: any) => ({
                            name: u.id,
                            type: 'unit',
                            displayName: u.name,
                            tags: Array.isArray(u.tags) ? u.tags : [],
                            data: {
                                title: u.name,
                                description: u.description,
                                essay: u.essay,
                                words: u.words,
                                tags: u.tags
                            }
                        }));
                    }
                }
                setFileList(items);
            } else {
                showToast("Failed to load Master Library", "error");
            }
        } catch (_e) {
            showToast("Connection error", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectMap = (mapName: string) => {
        setCurrentMap(mapName);
        fetchFiles(mapName, '');
    };

    const handleModeChange = (newMode: 'folders' | 'master') => {
        setMode(newMode);
        setCurrentMap(null);
        setCurrentPath('');
        setFileList([]);
        setTagQuery('');
        
        if (newMode === 'master') {
            fetchMasterLibrary();
        } else {
            fetchMappings();
        }
    };

    const handleNavigate = (folderName: string) => {
        if (!currentMap) return;
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        fetchFiles(currentMap, newPath);
    };

    const handleUp = () => {
        if (!currentMap) return;
        if (!currentPath) {
            setCurrentMap(null);
            setFileList([]);
        } else {
            const parts = currentPath.split('/');
            parts.pop();
            const newPath = parts.join('/');
            fetchFiles(currentMap, newPath);
        }
    };

    const handleFileClick = async (item: any) => {
        if (mode === 'master') {
            if (item.data) {
                onSelect(item.data);
                onClose();
            }
            return;
        }

        if (!currentMap) return;

        if (type === 'audio') {
             const pathPart = currentPath ? `${currentPath}/${item.name}` : item.name;
             const url = `${serverUrl}/api/audio/stream/${currentMap}/${pathPart}`;
             onSelect({ url, filename: item.name, transcript: item.transcript, transcriptTitle: item.transcriptTitle, map: currentMap, path: currentPath });
             onClose();
        } else {
            // Reading files from folder browser
            setLoading(true);
            try {
                const pathPart = currentPath ? `${currentPath}/${item.name}` : item.name;
                const res = await fetch(`${serverUrl}/api/reading/content/${currentMap}/${pathPart}`); 
                
                if (res.ok) {
                    const contentData = await res.json();
                    onSelect(contentData);
                    onClose();
                } else {
                    showToast("Failed to load file content", "error");
                }
            } catch (_e) {
                showToast("Error reading file", "error");
            } finally {
                setLoading(false);
            }
        }
    };

    // --- Filtering Logic ---
    const filteredFiles = useMemo(() => {
        if (mode !== 'master' || !tagQuery) return fileList;
        
        const lowerQuery = tagQuery.toLowerCase();
        return fileList.filter(item => {
            // Search in Title
            if (item.displayName && item.displayName.toLowerCase().includes(lowerQuery)) return true;
            // Search in Tags (Actual Tags) - Only relevant for Reading Units
            if (item.tags && item.tags.some(t => t.toLowerCase().includes(lowerQuery))) return true;
            
            return false;
        });
    }, [fileList, tagQuery, mode]);

    // Derive unique tags for suggestion dropdown
    const availableTags = useMemo(() => {
        if (mode !== 'master') return [];
        const tagsSet = new Set<string>();
        fileList.forEach(item => {
            if (item.tags && Array.isArray(item.tags)) {
                item.tags.forEach(t => tagsSet.add(t));
            }
        });
        return Array.from(tagsSet).sort();
    }, [fileList, mode]);

    const filteredSuggestions = useMemo(() => {
        if (!tagQuery) return [];
        return availableTags.filter(t => t.toLowerCase().includes(tagQuery.toLowerCase())).slice(0, 8);
    }, [availableTags, tagQuery]);

    if (!isOpen) return null;
    
    const getIcon = () => {
        if (type === 'audio') return <Music size={20}/>;
        if (type === 'planning') return <ListTodo size={20}/>;
        return <FileText size={20}/>;
    };

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[80vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2">
                            {getIcon()}
                            {title}
                        </h3>
                        <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                    </div>

                    {type === 'reading' || type === 'planning' ? (
                        <div className="relative" ref={tagContainerRef}>
                             <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                                <input 
                                    ref={tagInputRef}
                                    type="text" 
                                    value={tagQuery}
                                    onChange={(e) => { setTagQuery(e.target.value); setShowTagSuggestions(true); }}
                                    onFocus={() => setShowTagSuggestions(true)}
                                    placeholder={type === 'planning' ? "Filter by title..." : "Filter by tag or title..."}
                                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
                                />
                                {tagQuery && (
                                    <button onClick={() => setTagQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                                        <X size={12} />
                                    </button>
                                )}
                             </div>
                             
                             {showTagSuggestions && filteredSuggestions.length > 0 && type === 'reading' && (
                                 <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-100 rounded-xl shadow-xl z-20 overflow-hidden max-h-48 overflow-y-auto">
                                     {filteredSuggestions.map(tag => (
                                         <button 
                                            key={tag}
                                            onClick={() => { setTagQuery(tag); setShowTagSuggestions(false); }}
                                            className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-neutral-50 flex items-center gap-2 text-neutral-700"
                                         >
                                             <Tag size={12} className="text-neutral-400" />
                                             {tag}
                                         </button>
                                     ))}
                                 </div>
                             )}
                        </div>
                    ) : (
                        <div className="flex bg-neutral-100 p-1 rounded-xl">
                            <button 
                                onClick={() => handleModeChange('folders')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'folders' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
                            >
                                <Folder size={14} /> Server Folders
                            </button>
                        </div>
                    )}
                </header>
                
                {/* Only show breadcrumbs for Folder mode (Audio) */}
                {mode === 'folders' && (
                    <div className="p-4 bg-neutral-50 border-b border-neutral-100 flex items-center gap-2 overflow-hidden">
                         {currentMap && (
                            <button onClick={handleUp} className="p-1.5 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors">
                                <CornerLeftUp size={14} />
                            </button>
                         )}
                         <div className="flex-1 truncate text-xs font-mono font-medium text-neutral-600">
                            {currentMap ? `/${currentMap}/${currentPath}` : 'Root'}
                         </div>
                    </div>
                )}

                <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-neutral-300"/></div>
                    ) : mode === 'folders' && !currentMap ? (
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-2 mb-2">Mapped Folders</p>
                            {Object.keys(mappings).map(mapName => (
                                <button key={mapName} onClick={() => handleSelectMap(mapName)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors text-left group">
                                    <Folder size={18} className="text-indigo-400 group-hover:text-indigo-600" />
                                    <span className="text-sm font-bold text-neutral-700">{mapName}</span>
                                    <ChevronRight size={14} className="ml-auto text-neutral-300" />
                                </button>
                            ))}
                            {Object.keys(mappings).length === 0 && <p className="text-center text-xs text-neutral-400 py-4">No mappings found. Configure in Settings.</p>}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredFiles.map((item, idx) => {
                                return (
                                    <button 
                                        key={`${item.name}-${idx}`} 
                                        onClick={() => item.type === 'directory' ? handleNavigate(item.name) : handleFileClick(item)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left group hover:bg-neutral-50`}
                                    >
                                        {item.type === 'directory' ? (
                                            <Folder size={18} className="text-indigo-400" />
                                        ) : item.type === 'unit' ? (
                                            <Server size={18} className="text-emerald-500" />
                                        ) : item.type === 'plan' ? (
                                            <ListTodo size={18} className="text-purple-500" />
                                        ) : type === 'audio' ? (
                                            <Music size={18} className="text-emerald-500" />
                                        ) : (
                                            <FileText size={18} className="text-blue-500" />
                                        )}
                                        
                                        <div className="flex-1 overflow-hidden">
                                            {item.displayName ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-sm font-bold text-neutral-800 truncate">{item.displayName}</span>
                                                    
                                                    {/* TAGS DISPLAY */}
                                                    {item.tags && item.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.tags.slice(0, 3).map((t: string, i: number) => (
                                                                <span key={i} className="px-1.5 py-0.5 bg-neutral-100 rounded text-[9px] font-medium text-neutral-500 border border-neutral-200">
                                                                    {t.trim()}
                                                                </span>
                                                            ))}
                                                            {item.tags.length > 3 && (
                                                                <span className="text-[9px] text-neutral-400 font-medium">+{item.tags.length - 3}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-medium text-neutral-700 truncate">{item.name}</span>
                                                    {type === 'audio' && item.transcript && (
                                                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100 shrink-0 animate-in fade-in">
                                                            <FileText size={10} />
                                                            <span className="text-[8px] font-black uppercase tracking-tighter">Transcript</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {item.type === 'directory' && <ChevronRight size={14} className="text-neutral-300" />}
                                    </button>
                                );
                            })}
                            {filteredFiles.length === 0 && <p className="text-center text-xs text-neutral-400 py-4">No matching items.</p>}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};