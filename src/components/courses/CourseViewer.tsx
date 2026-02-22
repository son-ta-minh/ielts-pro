import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { parseMarkdown } from '../../utils/markdownParser';
import { ChevronLeft, ChevronRight, Edit, Menu, Save, Loader2, ArrowLeft, BookOpen, Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';

interface ModuleInfo {
    id: string;
    title: string;
    filename: string;
}

interface Section {
    title: string;
    content: string;
}

interface CourseViewerProps {
    courseId: string;
    courseTitle: string;
}

const parseSections = (markdown: string): Section[] => {
    if (!markdown) return [];
    
    const lines = markdown.split('\n');
    const sections: Section[] = [];
    
    let currentSection: Section | null = null;
    
    const pushSection = () => {
        if (currentSection) {
            if (currentSection.content.trim() || currentSection.title !== "Introduction") {
                 sections.push(currentSection);
            }
            currentSection = null;
        }
    };

    lines.forEach(line => {
        const h1Match = line.match(/^#\s+(.+)/); // Level 1 is now Module Title (ignored for sections, or treated as Intro)
        const h2Match = line.match(/^##\s+(.+)/); // Level 2 is Section
        
        if (h1Match) {
            // If we encounter H1, it might be the start of the file. 
            // We can treat content before the first H2 as "Introduction" or similar.
            // For now, let's treat H1 as just content unless we want to use it as module title override.
            if (!currentSection) {
                 currentSection = { title: "Introduction", content: "" };
            }
            currentSection.content += line + "\n";
        } else if (h2Match) {
            pushSection();
            currentSection = { title: h2Match[1].trim(), content: line + "\n" };
        } else {
            if (!currentSection) {
                 currentSection = { title: "Introduction", content: "" };
            }
            currentSection.content += line + "\n";
        }
    });
    pushSection();
    
    return sections.length > 0 ? sections : [{ title: "General", content: markdown }];
};

export const CourseViewer: React.FC<CourseViewerProps> = ({ courseId, courseTitle }) => {
    const { showToast } = useToast();
    const [modules, setModules] = useState<ModuleInfo[]>([]);
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    const [markdown, setMarkdown] = useState<string>('');
    const [viewMode, setViewMode] = useState<'home' | 'module' | 'edit'>('home');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
    const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
    const chapterMenuRef = useRef<HTMLDivElement>(null);

    // Module management state
    const [isAddModuleModalOpen, setIsAddModuleModalOpen] = useState(false);
    const [isRenameModuleModalOpen, setIsRenameModuleModalOpen] = useState(false);
    const [moduleToRename, setModuleToRename] = useState<ModuleInfo | null>(null);
    const [newModuleTitle, setNewModuleTitle] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const activeModule = useMemo(() => modules.find(m => m.id === activeModuleId), [modules, activeModuleId]);
    const sections = useMemo(() => parseSections(markdown), [markdown]);
    const activeSection = sections[currentSectionIdx];

    const loadModules = useCallback(async () => {
        setIsLoading(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules`);
            if (res.ok) {
                const data = await res.json();
                setModules(data);
            }
        } catch (e) {
            console.error("Failed to load modules", e);
            showToast("Failed to load modules", "error");
        } finally {
            setIsLoading(false);
        }
    }, [courseId, showToast]);

    const loadModuleContent = useCallback(async (filename: string) => {
        setIsLoading(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${filename}`);
            if (res.ok) {
                const data = await res.json();
                setMarkdown(data.content || '');
                setCurrentSectionIdx(0);
            }
        } catch (e) {
            console.error("Failed to load module content", e);
            showToast("Failed to load module content", "error");
        } finally {
            setIsLoading(false);
        }
    }, [courseId, showToast]);

    useEffect(() => {
        loadModules();
    }, [loadModules]);

    const handleModuleClick = (module: ModuleInfo) => {
        setActiveModuleId(module.id);
        loadModuleContent(module.filename);
        setViewMode('module');
    };

    const saveContent = async () => {
        if (!activeModule) return;
        setIsSaving(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${activeModule.filename}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: markdown })
            });
            if (res.ok) {
                showToast("Module content saved", "success");
                setViewMode('module'); 
            } else {
                throw new Error("Save failed");
            }
        } catch (e) {
            console.error("Failed to save content", e);
            showToast("Failed to save content", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddModule = async () => {
        if (!newModuleTitle.trim()) return;
        setIsProcessing(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newModuleTitle })
            });
            if (res.ok) {
                showToast("Module created successfully", "success");
                setIsAddModuleModalOpen(false);
                setNewModuleTitle('');
                loadModules();
            } else {
                showToast("Failed to create module", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to create module", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRenameModule = async () => {
        if (!moduleToRename || !newModuleTitle.trim()) return;
        setIsProcessing(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${moduleToRename.filename}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newTitle: newModuleTitle })
            });
            if (res.ok) {
                showToast("Module renamed successfully", "success");
                setIsRenameModuleModalOpen(false);
                setModuleToRename(null);
                setNewModuleTitle('');
                loadModules();
            } else {
                const err = await res.json();
                showToast(err.error || "Failed to rename module", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to rename module", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const openRenameModal = (module: ModuleInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        setModuleToRename(module);
        setNewModuleTitle(module.title);
        setIsRenameModuleModalOpen(true);
    };

    const handleDeleteModule = async (filename: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this module?")) return;
        
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${filename}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast("Module deleted successfully", "success");
                loadModules();
            } else {
                showToast("Failed to delete module", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to delete module", "error");
        }
    };

    const handleMoveModule = async (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.stopPropagation();
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === modules.length - 1)) return;

        const newModules = [...modules];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        // Swap
        [newModules[index], newModules[targetIndex]] = [newModules[targetIndex], newModules[index]];
        
        // Optimistic update
        setModules(newModules);

        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/order`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedFilenames: newModules.map(m => m.filename) })
            });
            
            if (!res.ok) {
                showToast("Failed to reorder modules", "error");
                loadModules(); // Revert
            } else {
                 // Reload to get new filenames (since they are renamed on server)
                 loadModules();
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to reorder modules", "error");
            loadModules(); // Revert
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chapterMenuRef.current && !chapterMenuRef.current.contains(event.target as Node)) {
                setIsChapterMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const htmlContent = useMemo(() => {
        return parseMarkdown(activeSection?.content || '');
    }, [activeSection]);

    if (isLoading && viewMode === 'home' && modules.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-neutral-50/30">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-3 border-b flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    {viewMode !== 'home' && (
                        <button 
                            onClick={() => setViewMode('home')}
                            className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500"
                            title="Back to Home"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div className="flex flex-col">
                        <h2 className="text-sm font-black text-neutral-900 tracking-tight">{courseTitle}</h2>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                            {viewMode === 'home' ? 'Course Overview' : viewMode === 'edit' ? 'Editor' : activeModule?.title}
                        </span>
                    </div>
                </div>

                {/* Centered Navigation (Only in Module View) */}
                {viewMode === 'module' && sections.length > 1 && (
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentSectionIdx(Math.max(0, currentSectionIdx - 1))} 
                            disabled={currentSectionIdx === 0} 
                            className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        
                        <div className="relative" ref={chapterMenuRef}>
                            <button 
                                onClick={() => setIsChapterMenuOpen(!isChapterMenuOpen)} 
                                className="flex flex-col items-center hover:bg-neutral-100 rounded-lg px-4 py-1 transition-colors min-w-[140px]"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-neutral-900 truncate max-w-[120px]">
                                        {activeSection?.title}
                                    </span>
                                    <Menu size={10} className="text-neutral-400" />
                                </div>
                            </button>
                            
                            {isChapterMenuOpen && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-neutral-100 p-1 animate-in fade-in zoom-in-95 origin-top z-50">
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {sections.map((sec, idx) => (
                                            <button 
                                                key={idx} 
                                                onClick={() => { setCurrentSectionIdx(idx); setIsChapterMenuOpen(false); }} 
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold truncate ${idx === currentSectionIdx ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'}`}
                                            >
                                                <span className="inline-block w-4 text-neutral-300 font-mono text-[10px]">{idx + 1}</span>
                                                {sec.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => setCurrentSectionIdx(Math.min(sections.length - 1, currentSectionIdx + 1))} 
                            disabled={currentSectionIdx === sections.length - 1} 
                            className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {viewMode === 'edit' ? (
                        <button 
                            onClick={saveContent}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 active:scale-95 uppercase tracking-widest"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Save Changes
                        </button>
                    ) : viewMode === 'module' ? (
                        <button 
                            onClick={() => setViewMode('edit')} 
                            className="flex items-center gap-2 px-4 py-2 text-xs font-black border-2 border-neutral-100 bg-white text-neutral-600 rounded-xl hover:bg-neutral-50 transition-all active:scale-95 uppercase tracking-widest"
                        >
                            <Edit size={14} />
                            Edit Content
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow overflow-hidden relative">
                {viewMode === 'home' ? (
                    <div className="h-full overflow-y-auto p-8 md:p-12">
                        <div className="max-w-4xl mx-auto">
                            <div className="mb-10 text-center relative">
                                <h1 className="text-3xl font-black text-neutral-900 tracking-tight mb-2">{courseTitle}</h1>
                                <p className="text-sm font-medium text-neutral-500">Master your skills with structured lessons and interactive practice.</p>
                                <button 
                                    onClick={() => setIsAddModuleModalOpen(true)}
                                    className="absolute right-0 top-0 p-3 bg-neutral-900 text-white rounded-xl shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
                                    title="Add Module"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            
                            {isLoading ? (
                                <div className="flex justify-center p-10">
                                    <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {modules.map((mod, idx) => (
                                        <div
                                            key={mod.id}
                                            onClick={() => handleModuleClick(mod)}
                                            className="group relative flex flex-col items-start p-6 bg-white border-2 border-neutral-100 rounded-3xl hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all text-left active:scale-[0.98] cursor-pointer"
                                        >
                                            <div className="w-full flex justify-between items-start mb-4">
                                                <div className="w-10 h-10 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                    <BookOpen size={20} />
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => handleMoveModule(idx, 'up', e)}
                                                        disabled={idx === 0}
                                                        className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
                                                    >
                                                        <ArrowUp size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleMoveModule(idx, 'down', e)}
                                                        disabled={idx === modules.length - 1}
                                                        className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
                                                    >
                                                        <ArrowDown size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => openRenameModal(mod, e)}
                                                        className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDeleteModule(mod.filename, e)}
                                                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Module {idx + 1}</div>
                                            <h3 className="text-base font-black text-neutral-900 group-hover:text-indigo-600 transition-colors leading-tight">{mod.title}</h3>
                                            <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Start Learning <ChevronRight size={12} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'edit' ? (
                    <div className="h-full flex flex-col">
                        <textarea
                            value={markdown}
                            onChange={(e) => setMarkdown(e.target.value)}
                            className="flex-grow w-full p-8 text-sm resize-none focus:outline-none font-mono leading-relaxed bg-neutral-50/50"
                            placeholder="# Module Title\n\nIntro content...\n\n## Section 1\n\nContent..."
                        />
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto px-6 py-4 md:px-8 md:py-6 bg-white">
                        <div className="max-w-4xl mx-auto">
                            <div className="prose prose-neutral max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:leading-relaxed prose-strong:font-black prose-a:text-indigo-600 prose-img:rounded-3xl prose-img:shadow-xl" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                            
                            {/* Footer Navigation */}
                            <div className="mt-16 pt-8 border-t flex items-center justify-between">
                                <button 
                                    onClick={() => setCurrentSectionIdx(Math.max(0, currentSectionIdx - 1))} 
                                    disabled={currentSectionIdx === 0}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-neutral-500 hover:bg-neutral-100 disabled:opacity-0 transition-colors"
                                >
                                    <ChevronLeft size={18} /> Previous
                                </button>
                                
                                <button 
                                    onClick={() => setViewMode('home')}
                                    className="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                                >
                                    Back to Overview
                                </button>

                                <button 
                                    onClick={() => setCurrentSectionIdx(Math.min(sections.length - 1, currentSectionIdx + 1))} 
                                    disabled={currentSectionIdx === sections.length - 1}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-0 transition-colors"
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Module Modal */}
            {isAddModuleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-neutral-900">New Module</h3>
                            <button onClick={() => setIsAddModuleModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Module Title</label>
                                <input 
                                    type="text" 
                                    value={newModuleTitle}
                                    onChange={(e) => setNewModuleTitle(e.target.value)}
                                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. Introduction to Phonetics"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button 
                                    onClick={() => setIsAddModuleModalOpen(false)}
                                    className="px-6 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleAddModule}
                                    disabled={!newModuleTitle.trim() || isProcessing}
                                    className="px-6 py-3 rounded-xl font-black text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                                >
                                    {isProcessing && <Loader2 size={16} className="animate-spin" />}
                                    Create Module
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Module Modal */}
            {isRenameModuleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-neutral-900">Rename Module</h3>
                            <button onClick={() => setIsRenameModuleModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Module Title</label>
                                <input 
                                    type="text" 
                                    value={newModuleTitle}
                                    onChange={(e) => setNewModuleTitle(e.target.value)}
                                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. Introduction to Phonetics"
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button 
                                    onClick={() => setIsRenameModuleModalOpen(false)}
                                    className="px-6 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleRenameModule}
                                    disabled={!newModuleTitle.trim() || isProcessing}
                                    className="px-6 py-3 rounded-xl font-black text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                                >
                                    {isProcessing && <Loader2 size={16} className="animate-spin" />}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
