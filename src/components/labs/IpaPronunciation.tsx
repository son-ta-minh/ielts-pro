import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { parseMarkdown } from '../../utils/markdownParser';
import { ChevronLeft, ChevronRight, Edit, Eye, Menu, Save, Loader2 } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';

interface Chapter {
    title: string;
    content: string;
}

const splitContentIntoChapters = (markdown: string): Chapter[] => {
    if (!markdown) return [];
    
    const lines = markdown.split('\n');
    const chapters: Chapter[] = [];
    let currentTitle = "Introduction";
    let currentBody: string[] = [];

    const pushChapter = () => {
        if (currentBody.length > 0 || (chapters.length === 0 && currentTitle === "Introduction")) {
            const bodyText = currentBody.join('\n').trim();
            if (bodyText || chapters.length > 0) {
                 chapters.push({ 
                    title: currentTitle, 
                    content: currentBody.join('\n') 
                });
            }
        }
    };

    lines.forEach(line => {
        const headerMatch = line.trim().match(/^(#{1,3})\s+(.+)/);
        if (headerMatch) {
            pushChapter();
            currentTitle = headerMatch[2].trim();
            currentBody = [line]; 
        } else {
            currentBody.push(line);
        }
    });
    
    pushChapter();
    
    if (chapters.length > 1 && chapters[0].title === "Introduction" && !chapters[0].content.trim()) {
        chapters.shift();
    }

    return chapters.length > 0 ? chapters : [{ title: "Lesson", content: markdown }];
};

export const IpaPronunciation: React.FC = () => {
    const { showToast } = useToast();
    const [markdown, setMarkdown] = useState<string>('');
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
    const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
    const chapterMenuRef = useRef<HTMLDivElement>(null);

    const chapters = useMemo(() => splitContentIntoChapters(markdown), [markdown]);

    const loadContent = useCallback(async () => {
        setIsLoading(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/ipa/content`);
            if (res.ok) {
                const data = await res.json();
                setMarkdown(data.content || '');
            }
        } catch (e) {
            console.error("Failed to load IPA content", e);
            showToast("Failed to load content from server", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    const saveContent = async () => {
        setIsSaving(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/ipa/content`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: markdown })
            });
            if (res.ok) {
                showToast("IPA content saved to server", "success");
            } else {
                throw new Error("Save failed");
            }
        } catch (e) {
            console.error("Failed to save IPA content", e);
            showToast("Failed to save content to server", "error");
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        loadContent();
    }, [loadContent]);

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
        return parseMarkdown(chapters[currentChapterIdx]?.content || '');
    }, [chapters, currentChapterIdx]);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-2 border-b flex items-center justify-between bg-white z-10">
                <div className="w-32">
                    {isEditMode && (
                        <button 
                            onClick={saveContent}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Save
                        </button>
                    )}
                </div>

                {/* Centered Navigation */}
                {!isEditMode && chapters.length > 1 ? (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentChapterIdx(Math.max(0, currentChapterIdx - 1))} 
                            disabled={currentChapterIdx === 0} 
                            className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        
                        <div className="relative" ref={chapterMenuRef}>
                            <button 
                                onClick={() => setIsChapterMenuOpen(!isChapterMenuOpen)} 
                                className="flex flex-col items-center hover:bg-neutral-100 rounded-lg px-3 py-0.5 transition-colors"
                            >
                                <span className="text-[8px] font-black uppercase text-neutral-400 tracking-widest">Chapter</span>
                                <div className="flex items-center gap-1">
                                    <span className="font-bold text-xs text-neutral-900 max-w-[120px] truncate">{chapters[currentChapterIdx].title}</span>
                                    <Menu size={10} className="text-neutral-400" />
                                </div>
                            </button>
                            
                            {isChapterMenuOpen && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-neutral-100 p-1 animate-in fade-in zoom-in-95 origin-top z-50">
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {chapters.map((ch, idx) => (
                                            <button 
                                                key={idx} 
                                                onClick={() => { setCurrentChapterIdx(idx); setIsChapterMenuOpen(false); }} 
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold truncate ${idx === currentChapterIdx ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'}`}
                                            >
                                                {ch.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => setCurrentChapterIdx(Math.min(chapters.length - 1, currentChapterIdx + 1))} 
                            disabled={currentChapterIdx === chapters.length - 1} 
                            className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                ) : <div />}

                <div className="w-32 flex justify-end">
                    <button 
                        onClick={() => setIsEditMode(!isEditMode)} 
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold border rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                        {isEditMode ? <Eye size={14} /> : <Edit size={14} />}
                        {isEditMode ? 'View' : 'Edit'}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow overflow-hidden">
                {isEditMode ? (
                    <textarea
                        value={markdown}
                        onChange={(e) => setMarkdown(e.target.value)}
                        className="w-full h-full p-8 text-sm resize-none focus:outline-none font-mono leading-relaxed"
                        placeholder="# Chapter Title\n\nContent here...\n\n## Subchapter\n\nMore content..."
                    />
                ) : (
                    <div className="h-full p-8 overflow-y-auto prose max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                )}
            </div>
        </div>
    );
};

