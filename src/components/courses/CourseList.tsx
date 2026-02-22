import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, Loader2, Plus, Trash2, Edit2, X } from 'lucide-react';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { useToast } from '../../contexts/ToastContext';
import { CourseViewer } from './CourseViewer';

interface Course {
    id: string;
    title: string;
    isSystem?: boolean;
}

export const CourseList: React.FC = () => {
    const { showToast } = useToast();
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [courseTitle, setCourseTitle] = useState('');
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

    const handleCreateCourse = async () => {
        if (!courseTitle.trim()) return;
        setIsProcessing(true);
        try {
            const config = getConfig();
            const serverUrl = getServerUrl(config);
            const res = await fetch(`${serverUrl}/api/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: courseTitle })
            });
            if (res.ok) {
                showToast("Course created successfully", "success");
                setIsModalOpen(false);
                setCourseTitle('');
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
                body: JSON.stringify({ title: courseTitle })
            });
            if (res.ok) {
                showToast("Course updated successfully", "success");
                setIsModalOpen(false);
                setEditingCourse(null);
                setCourseTitle('');
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
                showToast("Failed to delete course", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to delete course", "error");
        }
    };

    const openCreateModal = () => {
        setEditingCourse(null);
        setCourseTitle('');
        setIsModalOpen(true);
    };

    const openEditModal = (course: Course, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCourse(course);
        setCourseTitle(course.title);
        setIsModalOpen(true);
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
                    <CourseViewer courseId={selectedCourse.id} courseTitle={selectedCourse.title} />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-8 md:p-12 bg-neutral-50/30">
            <div className="max-w-4xl mx-auto">
                <div className="mb-10 text-center relative">
                    <h1 className="text-3xl font-black text-neutral-900 tracking-tight mb-2">Course Library</h1>
                    <p className="text-sm font-medium text-neutral-500">Select a course to start learning.</p>
                    <button 
                        onClick={openCreateModal}
                        className="absolute right-0 top-0 p-3 bg-neutral-900 text-white rounded-xl shadow-lg hover:bg-neutral-800 transition-all active:scale-95"
                        title="Create New Course"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-10">
                        <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {courses.map((course) => (
                            <div
                                key={course.id}
                                onClick={() => setSelectedCourse(course)}
                                className="group relative flex items-center p-6 bg-white border-2 border-neutral-100 rounded-3xl hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all text-left active:scale-[0.98] cursor-pointer"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors mr-4 shrink-0">
                                    <BookOpen size={24} />
                                </div>
                                <div className="flex-grow min-w-0">
                                    <h3 className="text-lg font-black text-neutral-900 group-hover:text-indigo-600 transition-colors leading-tight truncate">{course.title}</h3>
                                    <p className="text-xs font-bold text-neutral-400 mt-1 uppercase tracking-widest">View Modules</p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                    <button 
                                        onClick={(e) => openEditModal(course, e)}
                                        className="p-2 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    {!course.isSystem && (
                                        <button 
                                            onClick={(e) => handleDeleteCourse(course.id, e)}
                                            className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                                <div className="text-neutral-300 group-hover:text-indigo-500 transition-colors ml-2">
                                    <ChevronRight size={20} />
                                </div>
                            </div>
                        ))}
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
