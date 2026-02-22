import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, Loader2, Plus, Trash2, Edit2, X, Video, Mic, PenTool, GraduationCap, Globe, Layout, Code, Music, Calculator, FlaskConical, Briefcase, ArrowUp, ArrowDown } from 'lucide-react';
import { User } from '../../app/types';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { CourseViewer } from './CourseViewer';

interface Course {
    id: string;
    title: string;
    icon?: string;
    isSystem?: boolean;
    allowReadingUnitCreation?: boolean;
}

const AVAILABLE_ICONS = [
    { name: 'BookOpen', icon: BookOpen },
    { name: 'Video', icon: Video },
    { name: 'Mic', icon: Mic },
    { name: 'PenTool', icon: PenTool },
    { name: 'GraduationCap', icon: GraduationCap },
    { name: 'Globe', icon: Globe },
    { name: 'Layout', icon: Layout },
    { name: 'Code', icon: Code },
    { name: 'Music', icon: Music },
    { name: 'Calculator', icon: Calculator },
    { name: 'FlaskConical', icon: FlaskConical },
    { name: 'Briefcase', icon: Briefcase },
];

const COURSE_COLORS = [
    { bg: 'bg-rose-50', text: 'text-rose-600', border: 'hover:border-rose-200', iconBg: 'group-hover:bg-rose-100', hoverText: 'group-hover:text-rose-700' },
    { bg: 'bg-orange-50', text: 'text-orange-600', border: 'hover:border-orange-200', iconBg: 'group-hover:bg-orange-100', hoverText: 'group-hover:text-orange-700' },
    { bg: 'bg-amber-50', text: 'text-amber-600', border: 'hover:border-amber-200', iconBg: 'group-hover:bg-amber-100', hoverText: 'group-hover:text-amber-700' },
    { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'hover:border-emerald-200', iconBg: 'group-hover:bg-emerald-100', hoverText: 'group-hover:text-emerald-700' },
    { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'hover:border-cyan-200', iconBg: 'group-hover:bg-cyan-100', hoverText: 'group-hover:text-cyan-700' },
    { bg: 'bg-blue-50', text: 'text-blue-600', border: 'hover:border-blue-200', iconBg: 'group-hover:bg-blue-100', hoverText: 'group-hover:text-blue-700' },
    { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'hover:border-indigo-200', iconBg: 'group-hover:bg-indigo-100', hoverText: 'group-hover:text-indigo-700' },
    { bg: 'bg-violet-50', text: 'text-violet-600', border: 'hover:border-violet-200', iconBg: 'group-hover:bg-violet-100', hoverText: 'group-hover:text-violet-700' },
    { bg: 'bg-fuchsia-50', text: 'text-fuchsia-600', border: 'hover:border-fuchsia-200', iconBg: 'group-hover:bg-fuchsia-100', hoverText: 'group-hover:text-fuchsia-700' },
    { bg: 'bg-pink-50', text: 'text-pink-600', border: 'hover:border-pink-200', iconBg: 'group-hover:bg-pink-100', hoverText: 'group-hover:text-pink-700' },
];

interface CourseListProps {
    initialCourseId?: string | null;
    onConsumeInitialCourseId?: () => void;
    currentUser?: User;
}

export const CourseList: React.FC<CourseListProps> = ({ initialCourseId, onConsumeInitialCourseId, currentUser }) => {
    const { showToast } = useToast();
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [courseTitle, setCourseTitle] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('BookOpen');
    const [isSystemCourse, setIsSystemCourse] = useState(false);
    const [allowReadingUnitCreation, setAllowReadingUnitCreation] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const loadCourses = async () => {
        setIsLoading(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses`);
            if (res.ok) {
                const data = await res.json();
                setCourses(data);
            }
        } catch (e) {
            console.error("Failed to load courses", e);
            showToast("Failed to load courses", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCourses();
    }, [showToast]);

    useEffect(() => {
        if (initialCourseId && courses.length > 0) {
            const target = courses.find(c => c.id === initialCourseId);
            if (target) {
                setSelectedCourse(target);
                if (onConsumeInitialCourseId) onConsumeInitialCourseId();
            }
        }
    }, [initialCourseId, courses, onConsumeInitialCourseId]);

    const handleCreateCourse = async () => {
        if (!courseTitle.trim()) return;
        setIsProcessing(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: courseTitle, icon: selectedIcon, isSystem: isSystemCourse, allowReadingUnitCreation: allowReadingUnitCreation })
            });
            if (res.ok) {
                showToast("Course created successfully", "success");
                setIsModalOpen(false);
                setCourseTitle('');
                setSelectedIcon('BookOpen');
                setIsSystemCourse(false);
                loadCourses();
            } else {
                const err = await res.json();
                showToast(err.error || "Failed to create course", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to create course", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdateCourse = async () => {
        if (!editingCourse || !courseTitle.trim()) return;
        setIsProcessing(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${editingCourse.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: courseTitle, icon: selectedIcon, isSystem: isSystemCourse, allowReadingUnitCreation: allowReadingUnitCreation })
            });
            if (res.ok) {
                showToast("Course updated successfully", "success");
                setIsModalOpen(false);
                setEditingCourse(null);
                setCourseTitle('');
                setSelectedIcon('BookOpen');
                setIsSystemCourse(false);
                loadCourses();
            } else {
                showToast("Failed to update course", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to update course", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteCourse = async (courseId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!window.confirm("Are you sure you want to delete this course? This action cannot be undone.")) return;
        
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses/${courseId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast("Course deleted successfully", "success");
                loadCourses();
            } else {
                const errorData = await res.json();
                showToast(errorData.error || "Failed to delete course", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to delete course", "error");
        }
    };

    const handleMoveCourse = async (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        
        const newCourses = [...courses];
        if (direction === 'up' && index > 0) {
            [newCourses[index], newCourses[index - 1]] = [newCourses[index - 1], newCourses[index]];
        } else if (direction === 'down' && index < newCourses.length - 1) {
            [newCourses[index], newCourses[index + 1]] = [newCourses[index + 1], newCourses[index]];
        } else {
            return;
        }

        setCourses(newCourses); // Optimistic update

        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const orderedIds = newCourses.map(c => c.id);
            await fetch(`${serverUrl}/api/courses/order`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds })
            });
        } catch (e) {
            console.error("Failed to reorder courses", e);
            showToast("Failed to save order", "error");
            loadCourses(); // Revert on error
        }
    };

    const openCreateModal = () => {
        setEditingCourse(null);
        setCourseTitle('');
        setSelectedIcon('BookOpen');
        setIsSystemCourse(false);
        setAllowReadingUnitCreation(false);
        setIsModalOpen(true);
    };

    const openEditModal = (course: Course, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setEditingCourse(course);
        setCourseTitle(course.title);
        setSelectedIcon(course.icon || 'BookOpen');
        setIsSystemCourse(!!course.isSystem);
        setAllowReadingUnitCreation(!!course.allowReadingUnitCreation);
        setIsModalOpen(true);
    };

    const getIconComponent = (iconName?: string) => {
        const found = AVAILABLE_ICONS.find(i => i.name === iconName);
        return found ? found.icon : BookOpen;
    };

    if (selectedCourse) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex-shrink-0 px-6 py-3 border-b flex items-center gap-3 bg-white/80 backdrop-blur-md sticky top-0 z-20">
                    <button 
                        onClick={() => setSelectedCourse(null)}
                        className="text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                        Courses
                    </button>
                    <ChevronRight size={14} className="text-neutral-300" />
                    <span className="text-sm font-black text-neutral-900">{selectedCourse.title}</span>
                </div>
                <div className="flex-grow overflow-hidden">
                    <CourseViewer courseId={selectedCourse.id} courseTitle={selectedCourse.title} currentUser={currentUser} isSystem={selectedCourse.isSystem} allowReadingUnitCreation={selectedCourse.allowReadingUnitCreation} />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto bg-neutral-50/30">
            <div className="max-w-5xl mx-auto p-4 md:p-8">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-neutral-900 tracking-tight">Course Library</h1>
                        <p className="text-neutral-500 mt-2 font-medium">Select a course to start learning.</p>
                    </div>
                    <button 
                        onClick={openCreateModal}
                        className="p-2.5 bg-neutral-900 text-white rounded-xl shadow-lg hover:bg-neutral-800 transition-all active:scale-95 flex items-center gap-2"
                        title="Create New Course"
                    >
                        <Plus size={18} />
                        <span className="text-xs font-bold hidden sm:inline">New Course</span>
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-10">
                        <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {courses.map((course, index) => {
                            const IconComp = getIconComponent(course.icon);
                            const theme = COURSE_COLORS[index % COURSE_COLORS.length];
                            
                            return (
                                <div
                                    key={course.id}
                                    onClick={() => setSelectedCourse(course)}
                                    className={`group relative flex items-center p-4 bg-white border border-neutral-200 rounded-2xl ${theme.border} hover:shadow-md transition-all text-left active:scale-[0.99] cursor-pointer h-24`}
                                >
                                    <div className={`w-10 h-10 rounded-xl ${theme.bg} flex items-center justify-center ${theme.text} ${theme.iconBg} transition-colors mr-3 shrink-0`}>
                                        <IconComp size={20} />
                                    </div>
                                    <div className="flex-grow min-w-0 pr-16">
                                        <h3 className={`text-sm font-black text-neutral-900 ${theme.hoverText} transition-colors leading-tight line-clamp-2`}>{course.title}</h3>
                                        {course.isSystem && <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-1 block">System</span>}
                                    </div>
                                    
                                    {/* Action Buttons - Absolute positioned to not mess with layout */}
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={(e) => handleMoveCourse(index, 'up', e)}
                                                disabled={index === 0}
                                                className="p-1.5 text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-30"
                                                title="Move Up"
                                            >
                                                <ArrowUp size={14} />
                                            </button>
                                            <button 
                                                onClick={(e) => handleMoveCourse(index, 'down', e)}
                                                disabled={index === courses.length - 1}
                                                className="p-1.5 text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-30"
                                                title="Move Down"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={(e) => openEditModal(course, e)}
                                                className="p-1.5 text-neutral-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            {!course.isSystem && (
                                                <button 
                                                    onClick={(e) => handleDeleteCourse(course.id, e)}
                                                    className="p-1.5 text-neutral-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-neutral-900">{editingCourse ? 'Edit Course' : 'New Course'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full text-neutral-400"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Course Title</label>
                                <input 
                                    type="text" 
                                    value={courseTitle}
                                    onChange={(e) => setCourseTitle(e.target.value)}
                                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="e.g. Advanced Grammar"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Icon</label>
                                <div className="grid grid-cols-6 gap-2">
                                    {AVAILABLE_ICONS.map(({ name, icon: Icon }) => (
                                        <button
                                            key={name}
                                            onClick={() => setSelectedIcon(name)}
                                            className={`p-3 rounded-xl flex items-center justify-center transition-all ${selectedIcon === name ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-110' : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600'}`}
                                        >
                                            <Icon size={20} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={isSystemCourse}
                                        onChange={(e) => setIsSystemCourse(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                    />
                                    <span className="text-sm font-bold text-neutral-700">Mark as System Course</span>
                                </label>
                                <p className="text-xs text-neutral-400 mt-1 ml-6">System courses cannot be deleted and have special behaviors.</p>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={allowReadingUnitCreation}
                                        onChange={(e) => setAllowReadingUnitCreation(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                    />
                                    <span className="text-sm font-bold text-neutral-700">Allow Reading Unit Creation</span>
                                </label>
                                <p className="text-xs text-neutral-400 mt-1 ml-6">If enabled, users can create Reading Units from level 2/3 sessions in this course.</p>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button 
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={editingCourse ? handleUpdateCourse : handleCreateCourse}
                                    disabled={!courseTitle.trim() || isProcessing}
                                    className="px-6 py-3 rounded-xl font-black text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                                >
                                    {isProcessing && <Loader2 size={16} className="animate-spin" />}
                                    {editingCourse ? 'Save Changes' : 'Create Course'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
