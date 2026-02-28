import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { parseMarkdown } from '../../utils/markdownParser';
import {
    ChevronLeft,
    ChevronRight,
    Edit,
    Menu,
    Save,
    Loader2,
    ArrowLeft,
    BookOpen,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    ArrowRight,
    X,
    AlertTriangle,
    Minus,
    Sparkles
} from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../common/ConfirmationModal';
import { speak } from '../../utils/audio';
import UniversalAiModal from '../common/UniversalAiModal';
import { getGenerateLessonTestPrompt, getLessonPrompt } from '../../services/promptService';

interface ModuleInfo {
    id: string;
    title: string;
    filename: string;
    description?: string;
}

interface SessionInfo {
    id: string;
    title: string;
    borderColor: string;
    isDefault?: boolean;
    modules: ModuleInfo[];
}

interface Section {
    title: string;
    content: string;
}

interface CourseViewerProps {
    courseId: string;
    courseTitle: string;
}

type ContentTab = 'lesson' | 'practice';

const SESSION_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

const getEditableTitleFromFilename = (filename: string): string => filename.replace(/\.md$/i, '');
const isPracticeModuleFilename = (filename: string): boolean => /__test\.md$/i.test(filename);
const getPracticeFilename = (lessonFilename: string): string => lessonFilename.replace(/\.md$/i, '__Test.md');

const parseSections = (markdown: string): Section[] => {
    if (!markdown) return [];

    const lines = markdown.split('\n');
    const sections: Section[] = [];
    let currentSection: Section | null = null;

    const pushSection = () => {
        if (currentSection) {
            if (currentSection.content.trim() || currentSection.title !== 'Introduction') sections.push(currentSection);
            currentSection = null;
        }
    };

    lines.forEach(line => {
        const h1Match = line.match(/^#\s+(.+)/);
        const h2Match = line.match(/^##\s+(.+)/);

        if (h1Match) {
            if (!currentSection) currentSection = { title: 'Introduction', content: '' };
            currentSection.content += `${line}\n`;
        } else if (h2Match) {
            pushSection();
            currentSection = { title: h2Match[1].trim(), content: `${line}\n` };
        } else {
            if (!currentSection) currentSection = { title: 'Introduction', content: '' };
            currentSection.content += `${line}\n`;
        }
    });

    pushSection();
    return sections.length > 0 ? sections : [{ title: 'General', content: markdown }];
};

export const CourseViewer: React.FC<CourseViewerProps> = ({ courseId, courseTitle }) => {
    const { showToast } = useToast();

    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ContentTab>('lesson');
    const [markdown, setMarkdown] = useState<string>('');
    const [viewMode, setViewMode] = useState<'home' | 'module' | 'edit'>('home');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
    const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
    const chapterMenuRef = useRef<HTMLDivElement>(null);

    const [isAddModuleModalOpen, setIsAddModuleModalOpen] = useState(false);
    const [isRenameModuleModalOpen, setIsRenameModuleModalOpen] = useState(false);
    const [moduleToRename, setModuleToRename] = useState<ModuleInfo | null>(null);
    const [newModuleTitle, setNewModuleTitle] = useState('');
    const newModuleDescriptionMax = 140;
    const [newModuleDescription, setNewModuleDescription] = useState('');
    const [newModuleSessionId, setNewModuleSessionId] = useState('');

    const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
    const [sessionToEdit, setSessionToEdit] = useState<SessionInfo | null>(null);
    const [sessionTitleInput, setSessionTitleInput] = useState('');
    const [sessionColorInput, setSessionColorInput] = useState(SESSION_COLORS[0]);

    const [isProcessing, setIsProcessing] = useState(false);
    const [moduleToDelete, setModuleToDelete] = useState<ModuleInfo | null>(null);
    const [isDeletingModule, setIsDeletingModule] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null);
    const [isDeletingSession, setIsDeletingSession] = useState(false);
    const [isModuleManageMode, setIsModuleManageMode] = useState(false);
    const [aiModalMode, setAiModalMode] = useState<'lesson' | 'test' | null>(null);
    const [lessonSourceMarkdown, setLessonSourceMarkdown] = useState('');

    const allModules = useMemo(() => sessions.flatMap(s => s.modules.filter(m => !isPracticeModuleFilename(m.filename))), [sessions]);
    const defaultSessionId = useMemo(() => sessions.find(s => s.isDefault)?.id || sessions[0]?.id || '', [sessions]);
    const activeModule = useMemo(() => allModules.find(m => m.id === activeModuleId), [allModules, activeModuleId]);
    const sections = useMemo(() => parseSections(markdown), [markdown]);
    const activeSection = sections[currentSectionIdx];
    const sectionHeadingIndex = useMemo(() => {
        const map = new Map<string, number>();
        sections.forEach((section, idx) => {
            section.content.split('\n').forEach(line => {
                const match = line.trim().match(/^#{1,4}\s+(.+)/);
                if (!match) return;
                const heading = match[1].trim().toLowerCase();
                if (heading && !map.has(heading)) map.set(heading, idx);
            });
        });
        return map;
    }, [sections]);

    const loadSessions = useCallback(async () => {
        setIsLoading(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/sessions`);
            if (res.ok) {
                const data = await res.json();
                setSessions(Array.isArray(data) ? data : []);
            } else {
                showToast('Failed to load course sessions', 'error');
            }
        } catch (e) {
            console.error('Failed to load sessions', e);
            showToast('Failed to load course sessions', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [courseId, showToast]);

    const loadModuleContent = useCallback(
        async (filename: string) => {
            setIsLoading(true);
            try {
                const config = getConfig();
                const serverUrl = getServerUrl(config);
                const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${filename}`);
                if (res.ok) {
                    const data = await res.json();
                    setMarkdown(data.content || '');
                    setCurrentSectionIdx(0);
                } else if (res.status === 404) {
                    setMarkdown('');
                    setCurrentSectionIdx(0);
                } else {
                    throw new Error(`Failed to load module content: ${res.status}`);
                }
            } catch (e) {
                console.error('Failed to load module content', e);
                showToast('Failed to load module content', 'error');
            } finally {
                setIsLoading(false);
            }
        },
        [courseId, showToast]
    );

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    useEffect(() => {
        (window as any).handleLessonSpeak = (text: string, lang?: 'en' | 'vi') => {
            speak(text, false, lang);
        };
        return () => {
            delete (window as any).handleLessonSpeak;
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chapterMenuRef.current && !chapterMenuRef.current.contains(event.target as Node)) {
                setIsChapterMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        (window as any).resolveMarkdownNav = (query: string) => {
            if (viewMode !== 'module') return false;
            const sectionIdx = sectionHeadingIndex.get(query);
            if (sectionIdx === undefined) return false;

            const navigateAndScroll = () => {
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')) as HTMLElement[];
                const exact = headings.find(h => (h.textContent || '').trim().toLowerCase() === query);
                const fuzzy = headings.find(h => (h.textContent || '').trim().toLowerCase().includes(query));
                const target = exact || fuzzy;
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            };

            if (sectionIdx !== currentSectionIdx) {
                setCurrentSectionIdx(sectionIdx);
                requestAnimationFrame(() => requestAnimationFrame(navigateAndScroll));
            } else {
                navigateAndScroll();
            }
            return true;
        };

        return () => {
            delete (window as any).resolveMarkdownNav;
        };
    }, [viewMode, sectionHeadingIndex, currentSectionIdx]);

    const handleModuleClick = (module: ModuleInfo) => {
        setActiveModuleId(module.id);
        setActiveTab('lesson');
        setAiModalMode(null);
        setLessonSourceMarkdown('');
        loadModuleContent(module.filename);
        setViewMode('module');
    };

    const handleTabChange = (tab: ContentTab) => {
        if (!activeModule || tab === activeTab) return;
        const targetFilename = tab === 'lesson' ? activeModule.filename : getPracticeFilename(activeModule.filename);
        setActiveTab(tab);
        setViewMode('module');
        loadModuleContent(targetFilename);
    };

    useEffect(() => {
        if (activeTab === 'lesson') {
            setLessonSourceMarkdown(markdown);
        }
    }, [activeTab, markdown]);

    const handleOpenAiRefine = () => {
        if (!activeModule) return;
        setAiModalMode(activeTab === 'practice' ? 'test' : 'lesson');
    };

    const handleGenerateAiPrompt = (inputs: {
        request?: string;
        language?: 'English' | 'Vietnamese';
        targetAudience?: 'Kid' | 'Adult';
        tone?: 'friendly_elementary' | 'professional_professor';
    }) => {
        if (!activeModule) return '';
        const config = getConfig();
        const activeType = config.audioCoach.activeCoach;
        const coachName = config.audioCoach.coaches[activeType].name;
        const lessonTitle = activeModule.title || getEditableTitleFromFilename(activeModule.filename);

        if (aiModalMode === 'test') {
            const lessonContent = lessonSourceMarkdown || '';
            return getGenerateLessonTestPrompt(lessonTitle, lessonContent, inputs.request || '', []);
        }

        return getLessonPrompt({
            task: markdown?.trim() ? 'refine_reading' : 'create_reading',
            currentLesson: {
                title: lessonTitle,
                description: activeModule.description || '',
                content: markdown
            },
            topic: inputs.request || lessonTitle,
            userRequest: inputs.request || '',
            language: inputs.language || 'English',
            targetAudience: inputs.targetAudience || 'Adult',
            tone: inputs.tone || 'professional_professor',
            coachName,
            format: 'reading'
        });
    };

    const handleAiResult = async (data: any) => {
        const result = data?.result || data;
        const nextContent = typeof result?.content === 'string' ? result.content : '';

        if (!nextContent) {
            showToast('AI response missing content', 'error');
            return;
        }

        setMarkdown(nextContent);
        if (aiModalMode === 'lesson') {
            setLessonSourceMarkdown(nextContent);
            showToast('Lesson content refined!', 'success');
        } else {
            showToast('Practice test generated!', 'success');
        }
        setAiModalMode(null);
    };

    const saveContent = async () => {
        if (!activeModule) return;
        const filenameToSave = activeTab === 'lesson' ? activeModule.filename : getPracticeFilename(activeModule.filename);
        setIsSaving(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${filenameToSave}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: markdown })
            });
            if (res.ok) {
                showToast('Module content saved', 'success');
                setViewMode('module');
            } else {
                throw new Error('Save failed');
            }
        } catch (e) {
            console.error('Failed to save content', e);
            showToast('Failed to save content', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const openCreateModuleModal = (sessionId?: string) => {
        setNewModuleTitle('');
        setNewModuleDescription('');
        setNewModuleSessionId(sessionId || defaultSessionId);
        setIsAddModuleModalOpen(true);
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
                body: JSON.stringify({
                    title: newModuleTitle,
                    description: newModuleDescription,
                    sessionId: newModuleSessionId || defaultSessionId
                })
            });
            if (res.ok) {
                showToast('Module created successfully', 'success');
                setIsAddModuleModalOpen(false);
                setNewModuleTitle('');
                setNewModuleDescription('');
                loadSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to create module', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to create module', 'error');
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
                body: JSON.stringify({ newTitle: newModuleTitle, description: newModuleDescription })
            });
            if (res.ok) {
                showToast('Module renamed successfully', 'success');
                setIsRenameModuleModalOpen(false);
                setModuleToRename(null);
                setNewModuleTitle('');
                setNewModuleDescription('');
                loadSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to rename module', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to rename module', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const openRenameModal = (module: ModuleInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        setModuleToRename(module);
        setNewModuleTitle(getEditableTitleFromFilename(module.filename));
        setNewModuleDescription(module.description || '');
        setIsRenameModuleModalOpen(true);
    };

    const openDeleteModuleModal = (module: ModuleInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        setModuleToDelete(module);
    };

    const handleDeleteModule = async () => {
        if (!moduleToDelete) return;
        setIsDeletingModule(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${moduleToDelete.filename}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast('Module deleted successfully', 'success');
                setModuleToDelete(null);
                loadSessions();
            } else {
                showToast('Failed to delete module', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to delete module', 'error');
        } finally {
            setIsDeletingModule(false);
        }
    };

    const handleMoveModule = async (sessionId: string, index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.stopPropagation();
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        const visibleIndices = session.modules
            .map((module, originalIndex) => ({ module, originalIndex }))
            .filter(({ module }) => !isPracticeModuleFilename(module.filename))
            .map(({ originalIndex }) => originalIndex);

        const currentVisiblePos = visibleIndices.indexOf(index);
        if (currentVisiblePos === -1) return;

        const targetVisiblePos = direction === 'up' ? currentVisiblePos - 1 : currentVisiblePos + 1;
        if (targetVisiblePos < 0 || targetVisiblePos >= visibleIndices.length) return;

        const targetIndex = visibleIndices[targetVisiblePos];

        const newModules = [...session.modules];
        [newModules[index], newModules[targetIndex]] = [newModules[targetIndex], newModules[index]];

        setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, modules: newModules } : s)));

        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/sessions/${sessionId}/modules/order`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedFilenames: newModules.map(m => m.filename) })
            });
            if (!res.ok) {
                showToast('Failed to reorder modules', 'error');
                loadSessions();
            } else {
                loadSessions();
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to reorder modules', 'error');
            loadSessions();
        }
    };

    const handleRemoveModuleFromSession = async (sessionId: string, module: ModuleInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!defaultSessionId || sessionId === defaultSessionId) return;
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${module.filename}/session`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetSessionId: defaultSessionId })
            });
            if (res.ok) {
                showToast('Module removed from session', 'success');
                loadSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to remove module from session', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to remove module from session', 'error');
        }
    };

    const handleMoveModuleToNextSession = async (sessionId: string, module: ModuleInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        if (sessions.length < 2) return;
        const currentIndex = sessions.findIndex(s => s.id === sessionId);
        if (currentIndex === -1) return;
        const nextSession = sessions[(currentIndex + 1) % sessions.length];
        if (!nextSession || nextSession.id === sessionId) return;

        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/modules/${module.filename}/session`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetSessionId: nextSession.id })
            });
            if (res.ok) {
                showToast(`Moved to ${nextSession.title || 'Default Session'}`, 'success');
                loadSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to move module', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to move module', 'error');
        }
    };

    const openCreateSessionModal = () => {
        setSessionToEdit(null);
        setSessionTitleInput('');
        setSessionColorInput(SESSION_COLORS[0]);
        setIsSessionModalOpen(true);
    };

    const openEditSessionModal = (session: SessionInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        setSessionToEdit(session);
        setSessionTitleInput(session.title || '');
        setSessionColorInput(session.borderColor || SESSION_COLORS[0]);
        setIsSessionModalOpen(true);
    };

    const handleSaveSession = async () => {
        setIsProcessing(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const url = sessionToEdit
                ? `${serverUrl}/api/courses/${courseId}/sessions/${sessionToEdit.id}`
                : `${serverUrl}/api/courses/${courseId}/sessions`;
            const method = sessionToEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: sessionTitleInput, borderColor: sessionColorInput })
            });
            if (res.ok) {
                showToast(sessionToEdit ? 'Session updated' : 'Session created', 'success');
                setIsSessionModalOpen(false);
                setSessionToEdit(null);
                loadSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to save session', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to save session', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleMoveSession = async (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.stopPropagation();
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === sessions.length - 1)) return;

        const next = [...sessions];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        setSessions(next);

        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/sessions/order`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedSessionIds: next.map(s => s.id) })
            });
            if (!res.ok) {
                showToast('Failed to reorder sessions', 'error');
                loadSessions();
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to reorder sessions', 'error');
            loadSessions();
        }
    };

    const openDeleteSessionModal = (session: SessionInfo, e: React.MouseEvent) => {
        e.stopPropagation();
        const hasVisibleModules = session.modules.some(module => !isPracticeModuleFilename(module.filename));
        if (session.isDefault || hasVisibleModules) return;
        setSessionToDelete(session);
    };

    const handleDeleteSession = async () => {
        if (!sessionToDelete) return;
        setIsDeletingSession(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}/sessions/${sessionToDelete.id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast('Session deleted', 'success');
                setSessionToDelete(null);
                loadSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to delete session', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to delete session', 'error');
        } finally {
            setIsDeletingSession(false);
        }
    };

    const htmlContent = useMemo(() => parseMarkdown(activeSection?.content || ''), [activeSection]);

    if (isLoading && viewMode === 'home' && allModules.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-neutral-50/30">
            {viewMode !== 'home' && (
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-3 min-h-8">
                    {viewMode !== 'home' && (
                        <button
                            onClick={() => setViewMode('home')}
                            className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500"
                            title="Back to Courses"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    {(viewMode === 'module' || viewMode === 'edit') && activeModule && (
                        <>
                            <button
                                onClick={() => handleTabChange('lesson')}
                                className={`px-3 py-2 text-xs font-black rounded-xl border-2 uppercase tracking-widest transition-all ${
                                    activeTab === 'lesson'
                                        ? 'bg-neutral-900 text-white border-neutral-900'
                                        : 'bg-white text-neutral-600 border-neutral-100 hover:bg-neutral-50'
                                }`}
                            >
                                Lesson
                            </button>
                            <button
                                onClick={() => handleTabChange('practice')}
                                className={`px-3 py-2 text-xs font-black rounded-xl border-2 uppercase tracking-widest transition-all ${
                                    activeTab === 'practice'
                                        ? 'bg-neutral-900 text-white border-neutral-900'
                                        : 'bg-white text-neutral-600 border-neutral-100 hover:bg-neutral-50'
                                }`}
                            >
                                Practice
                            </button>
                        </>
                    )}
                </div>

                {viewMode === 'module' && sections.length > 1 && (
                    <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center gap-2">
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
                                    <span className="font-bold text-xs text-neutral-900 truncate max-w-[120px]">{activeSection?.title}</span>
                                    <Menu size={10} className="text-neutral-400" />
                                </div>
                            </button>

                            {isChapterMenuOpen && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-neutral-100 p-1 animate-in fade-in zoom-in-95 origin-top z-50">
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {sections.map((sec, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setCurrentSectionIdx(idx);
                                                    setIsChapterMenuOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold truncate ${
                                                    idx === currentSectionIdx ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'
                                                }`}
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
                    {(viewMode === 'module' || viewMode === 'edit') && activeModule && (
                        <button
                            onClick={handleOpenAiRefine}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-black border-2 border-amber-100 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-all active:scale-95 uppercase tracking-widest"
                        >
                            <Sparkles size={14} />
                            AI Refine
                        </button>
                    )}
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
                {viewMode === 'module' && sections.length > 1 && (
                    <div className="flex sm:hidden items-center justify-between gap-2 w-full">
                        <button
                            onClick={() => setCurrentSectionIdx(Math.max(0, currentSectionIdx - 1))}
                            disabled={currentSectionIdx === 0}
                            className="flex-1 flex items-center justify-center gap-1 p-2 bg-neutral-100 rounded-lg text-neutral-600 disabled:opacity-30"
                        >
                            <ChevronLeft size={16} />
                            Prev
                        </button>

                        <div className="text-[11px] font-bold text-neutral-500 truncate text-center flex-1">
                            {activeSection?.title}
                        </div>

                        <button
                            onClick={() => setCurrentSectionIdx(Math.min(sections.length - 1, currentSectionIdx + 1))}
                            disabled={currentSectionIdx === sections.length - 1}
                            className="flex-1 flex items-center justify-center gap-1 p-2 bg-neutral-100 rounded-lg text-neutral-600 disabled:opacity-30"
                        >
                            Next
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
            )}

            <div className="flex-grow overflow-hidden relative">
                {viewMode === 'home' ? (
                    <div className="h-full overflow-y-auto p-6 md:p-8">
                        <div className="max-w-5xl mx-auto">
                            <div className="mb-6 text-center relative">
                                <h1 className="text-3xl font-black text-neutral-900 tracking-tight mb-2">{courseTitle}</h1>
                                <p className="text-sm font-medium text-neutral-500">Master your skills with structured sessions and modules.</p>
                                <div className="absolute right-0 top-0 flex items-center gap-2">
                                    <button
                                        onClick={() => setIsModuleManageMode(v => !v)}
                                        className={`px-4 py-2.5 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${
                                            isModuleManageMode
                                                ? 'bg-neutral-900 text-white border-neutral-900'
                                                : 'bg-white text-neutral-600 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'
                                        }`}
                                        title={isModuleManageMode ? 'Done Editing' : 'Edit Sessions'}
                                    >
                                        <Edit size={14} />
                                        <span>{isModuleManageMode ? 'Done' : 'Edit'}</span>
                                    </button>
                                    <button
                                        onClick={openCreateSessionModal}
                                        className="p-3 bg-white border border-neutral-200 text-neutral-700 rounded-xl shadow-sm hover:bg-neutral-50 transition-all active:scale-95"
                                        title="New Session"
                                    >
                                        <Plus size={18} />
                                    </button>
                                    <button
                                        onClick={() => openCreateModuleModal(defaultSessionId)}
                                        className="p-3 bg-neutral-900 text-white rounded-xl shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
                                        title="Add Module"
                                    >
                                        <BookOpen size={18} />
                                    </button>
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="flex justify-center p-10">
                                    <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {sessions.map((session, sessionIndex) => {
                                        const visibleModules = session.modules
                                            .map((mod, originalIndex) => ({ mod, originalIndex }))
                                            .filter(({ mod }) => !isPracticeModuleFilename(mod.filename));

                                        return (
                                        <div
                                            key={session.id}
                                            className="rounded-2xl bg-white border p-3"
                                            style={{ borderColor: session.borderColor || '#22c55e' }}
                                        >
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <div className="min-h-5 text-sm font-black text-neutral-900 truncate">
                                                    {session.title || ''}
                                                </div>
                                                {isModuleManageMode && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={(e) => openCreateModuleModal(session.id)}
                                                            className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
                                                            title="Add Module To Session"
                                                        >
                                                            <Plus size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleMoveSession(sessionIndex, 'up', e)}
                                                            disabled={sessionIndex === 0}
                                                            className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-30"
                                                            title="Move Session Up"
                                                        >
                                                            <ArrowUp size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleMoveSession(sessionIndex, 'down', e)}
                                                            disabled={sessionIndex === sessions.length - 1}
                                                            className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-30"
                                                            title="Move Session Down"
                                                        >
                                                            <ArrowDown size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => openEditSessionModal(session, e)}
                                                            className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                                            title="Edit Session"
                                                        >
                                                            <Edit size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => openDeleteSessionModal(session, e)}
                                                            disabled={session.isDefault || visibleModules.length > 0}
                                                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30"
                                                            title={session.isDefault ? 'Default session cannot be deleted' : visibleModules.length > 0 ? 'Only empty session can be deleted' : 'Delete Session'}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {visibleModules.length === 0 ? (
                                                <div className="text-xs font-bold text-neutral-400 px-2 py-4 border border-dashed border-neutral-200 rounded-xl">
                                                    Empty session
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {visibleModules.map(({ mod, originalIndex }, idx) => (
                                                        <div
                                                            key={mod.id}
                                                            onClick={() => handleModuleClick(mod)}
                                                            className="group relative flex items-start gap-3 p-3 rounded-2xl border border-neutral-100 bg-white hover:bg-neutral-900 hover:border-neutral-900 hover:shadow-lg transition-all active:scale-95 text-left cursor-pointer"
                                                        >
                                                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform shrink-0 mt-0.5">
                                                                <BookOpen size={16} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs font-black text-neutral-900 group-hover:text-white transition-colors tracking-tight leading-tight line-clamp-2">
                                                                    {mod.title}
                                                                </div>
                                                                <div className="mt-1 text-[10px] font-medium text-neutral-400 group-hover:text-neutral-300 transition-colors leading-snug line-clamp-2">
                                                                    {mod.description?.trim() || 'No description yet.'}
                                                                </div>
                                                            </div>
                                                            <div className="w-auto">
                                                                {isModuleManageMode && (
                                                                    <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                                                                        <button
                                                                            onClick={(e) => handleMoveModule(session.id, originalIndex, 'up', e)}
                                                                            disabled={idx === 0}
                                                                            className="p-1 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-30"
                                                                            title="Move Up"
                                                                        >
                                                                            <ArrowUp size={13} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => handleMoveModule(session.id, originalIndex, 'down', e)}
                                                                            disabled={idx === visibleModules.length - 1}
                                                                            className="p-1 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-30"
                                                                            title="Move Down"
                                                                        >
                                                                            <ArrowDown size={13} />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => openRenameModal(mod, e)}
                                                                            className="p-1 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                                                            title="Rename"
                                                                        >
                                                                            <Edit size={13} />
                                                                        </button>
                                                                        {sessions.length > 1 && (
                                                                            <button
                                                                                onClick={(e) => handleMoveModuleToNextSession(session.id, mod, e)}
                                                                                className="p-1 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                                                title="Move To Next Session"
                                                                            >
                                                                                <ArrowRight size={13} />
                                                                            </button>
                                                                        )}
                                                                        {!session.isDefault && (
                                                                            <button
                                                                                onClick={(e) => handleRemoveModuleFromSession(session.id, mod, e)}
                                                                                className="p-1 text-neutral-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                                                                                title="Remove From Session"
                                                                            >
                                                                                <Minus size={13} />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            onClick={(e) => openDeleteModuleModal(mod, e)}
                                                                            className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                                            title="Delete Module"
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}
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
                            <div
                                className="prose prose-neutral max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:leading-relaxed prose-strong:font-black prose-a:text-indigo-600 prose-img:rounded-3xl prose-img:shadow-xl"
                                dangerouslySetInnerHTML={{ __html: htmlContent }}
                            />

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

            {isAddModuleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-neutral-900">New Module</h3>
                            <button onClick={() => setIsAddModuleModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Module Title</label>
                                <input
                                    type="text"
                                    value={newModuleTitle}
                                    onChange={(e) => setNewModuleTitle(e.target.value)}
                                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. Writing Task 1"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Short Description</label>
                                <textarea
                                    value={newModuleDescription}
                                    onChange={(e) => setNewModuleDescription(e.target.value.slice(0, newModuleDescriptionMax))}
                                    rows={3}
                                    className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    placeholder="A short summary shown on the module card..."
                                />
                                <div className="text-[10px] font-bold text-neutral-400 mt-1 text-right">
                                    {newModuleDescription.length}/{newModuleDescriptionMax}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Session</label>
                                <select
                                    value={newModuleSessionId || defaultSessionId}
                                    onChange={(e) => setNewModuleSessionId(e.target.value)}
                                    className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {sessions.map(session => (
                                        <option key={session.id} value={session.id}>
                                            {session.title || '(Default Session)'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button onClick={() => setIsAddModuleModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors">
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

            {isRenameModuleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-neutral-900">Rename Module</h3>
                            <button onClick={() => setIsRenameModuleModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Module Title</label>
                                <input
                                    type="text"
                                    value={newModuleTitle}
                                    onChange={(e) => setNewModuleTitle(e.target.value)}
                                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. Writing Task 1"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Short Description</label>
                                <textarea
                                    value={newModuleDescription}
                                    onChange={(e) => setNewModuleDescription(e.target.value.slice(0, newModuleDescriptionMax))}
                                    rows={3}
                                    className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    placeholder="A short summary shown on the module card..."
                                />
                                <div className="text-[10px] font-bold text-neutral-400 mt-1 text-right">
                                    {newModuleDescription.length}/{newModuleDescriptionMax}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button onClick={() => setIsRenameModuleModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors">
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

            {isSessionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-neutral-900">{sessionToEdit ? 'Edit Session' : 'New Session'}</h3>
                            <button onClick={() => setIsSessionModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Session Title</label>
                                <input
                                    type="text"
                                    value={sessionTitleInput}
                                    onChange={(e) => setSessionTitleInput(e.target.value)}
                                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Leave blank for no title"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Border Color</label>
                                <div className="flex items-center gap-2">
                                    {SESSION_COLORS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setSessionColorInput(color)}
                                            className={`w-8 h-8 rounded-full border-2 transition-all ${sessionColorInput === color ? 'ring-2 ring-neutral-900 ring-offset-2' : 'border-white'}`}
                                            style={{ backgroundColor: color }}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button onClick={() => setIsSessionModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveSession}
                                    disabled={isProcessing}
                                    className="px-6 py-3 rounded-xl font-black text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                                >
                                    {isProcessing && <Loader2 size={16} className="animate-spin" />}
                                    {sessionToEdit ? 'Save Session' : 'Create Session'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {aiModalMode && activeModule && (
                <UniversalAiModal
                    isOpen={!!aiModalMode}
                    onClose={() => setAiModalMode(null)}
                    type={aiModalMode === 'test' ? 'GENERATE_AUDIO_SCRIPT' : 'REFINE_UNIT'}
                    title={aiModalMode === 'test' ? 'Add Practice Test' : markdown?.trim() ? 'Refine Lesson' : 'Generate Lesson'}
                    description={
                        aiModalMode === 'test'
                            ? 'AI will design a separate test based on lesson content.'
                            : 'Enter instructions for the AI.'
                    }
                    initialData={{ format: aiModalMode === 'test' ? 'test' : 'reading' }}
                    onGeneratePrompt={handleGenerateAiPrompt}
                    onJsonReceived={handleAiResult}
                    actionLabel="Apply Changes"
                    closeOnSuccess={true}
                />
            )}

            <ConfirmationModal
                isOpen={!!moduleToDelete}
                title="Delete Module?"
                message={
                    <span>
                        Are you sure you want to delete <span className="font-bold text-neutral-900">&quot;{moduleToDelete?.title}&quot;</span>? This action cannot be undone.
                    </span>
                }
                confirmText="Delete Module"
                isProcessing={isDeletingModule}
                onConfirm={handleDeleteModule}
                onClose={() => setModuleToDelete(null)}
                icon={<AlertTriangle size={40} className="text-red-500" />}
                confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
            />

            <ConfirmationModal
                isOpen={!!sessionToDelete}
                title="Delete Session?"
                message={
                    <span>
                        Delete session <span className="font-bold text-neutral-900">&quot;{sessionToDelete?.title || '(Untitled)'}&quot;</span>? Session must be empty before delete.
                    </span>
                }
                confirmText="Delete Session"
                isProcessing={isDeletingSession}
                onConfirm={handleDeleteSession}
                onClose={() => setSessionToDelete(null)}
                icon={<AlertTriangle size={40} className="text-red-500" />}
                confirmButtonClass="bg-red-600 text-white hover:bg-red-700 shadow-red-200"
            />
        </div>
    );
};
