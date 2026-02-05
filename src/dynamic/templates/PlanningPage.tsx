
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, PlanningGoal, PlanningTodo, PlanningStatus } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { ResourceActions } from '../page/ResourceActions';
import { UniversalCard } from '../../components/common/UniversalCard';
import { Plus, Edit3, Trash2, Save, X, Circle, CheckCircle2, CircleDashed, GripVertical, ListTodo, Sparkles } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getGeneratePlanningGoalPrompt } from '../../services/promptService';
import { generatePlanningGoal } from '../../services/geminiService';

interface Props {
  user: User;
}

const statusConfig = {
    'NEW': { icon: Circle, color: 'text-neutral-300', bg: 'bg-neutral-100', label: 'New' },
    'IN_PROGRESS': { icon: CircleDashed, color: 'text-blue-500', bg: 'bg-blue-50', label: 'In Progress' },
    'CLOSED': { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', label: 'Closed' }
};

interface TodoItemProps {
    todo: PlanningTodo;
    readOnly?: boolean;
    onStatusChange?: (status: PlanningStatus) => void;
    onTextChange?: (text: string) => void;
    onDelete?: () => void;
}

const TodoItem: React.FC<TodoItemProps> = ({ todo, readOnly, onStatusChange, onTextChange, onDelete }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const config = statusConfig[todo.status];
    const Icon = config.icon;

    // --- READ ONLY VIEW (Grid) ---
    if (readOnly) {
        return (
            <div className={`flex items-start gap-2.5 py-1.5 ${todo.status === 'CLOSED' ? 'opacity-50' : ''}`}>
                 <Icon size={14} className={`mt-0.5 shrink-0 ${config.color}`} />
                 <span className={`text-xs font-medium leading-snug ${todo.status === 'CLOSED' ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>{todo.text}</span>
            </div>
        );
    }

    // --- EDITABLE VIEW (Modal) ---
    return (
        <div className="group flex items-start gap-2 p-2 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 transition-all focus-within:ring-2 focus-within:ring-neutral-900/5 focus-within:border-neutral-400">
             {/* Status Trigger */}
             <div className="relative shrink-0 mt-1">
                 <button 
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={`p-1 rounded-md hover:bg-neutral-100 transition-colors ${config.color}`}
                    title="Change Status"
                 >
                     <Icon size={18} />
                 </button>
                 
                 {isMenuOpen && (
                     <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-xl shadow-xl border border-neutral-100 z-50 p-1 flex flex-col gap-1 animate-in fade-in zoom-in-95">
                         {(Object.keys(statusConfig) as PlanningStatus[]).map(status => {
                             const sConf = statusConfig[status];
                             const SIcon = sConf.icon;
                             return (
                                 <button 
                                    key={status}
                                    type="button"
                                    onClick={() => { onStatusChange?.(status); setIsMenuOpen(false); }}
                                    className={`flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-bold transition-colors w-full text-left ${todo.status === status ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
                                 >
                                     <SIcon size={14} className={sConf.color} />
                                     <span className="text-neutral-600">{sConf.label}</span>
                                 </button>
                             )
                         })}
                     </div>
                 )}
             </div>
             
             {/* Editable Text */}
             <input 
                type="text"
                value={todo.text}
                onChange={(e) => onTextChange?.(e.target.value)}
                className={`flex-1 bg-transparent border-none outline-none text-sm font-medium py-1 ${todo.status === 'CLOSED' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}
                placeholder="Task description..."
             />

             {/* Actions */}
             <button 
                type="button"
                onClick={onDelete}
                className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all self-start mt-0.5"
                title="Remove Task"
             >
                <Trash2 size={14} />
             </button>
        </div>
    );
};


const GoalEditModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (goal: Partial<PlanningGoal>) => void;
    initialData?: PlanningGoal | null;
    user: User;
}> = ({ isOpen, onClose, onSave, initialData }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [todos, setTodos] = useState<PlanningTodo[]>([]);
    const [newTodoText, setNewTodoText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTitle(initialData?.title || '');
            setDescription(initialData?.description || '');
            setTodos(initialData?.todos || []);
            setNewTodoText('');
        }
    }, [isOpen, initialData]);

    const handleAddTodo = () => {
        if (!newTodoText.trim()) return;
        const newTodo: PlanningTodo = {
            id: `todo-${Date.now()}-${Math.random()}`,
            text: newTodoText.trim(),
            status: 'NEW'
        };
        setTodos([...todos, newTodo]);
        setNewTodoText('');
    };

    const handleUpdateTodo = (id: string, updates: Partial<PlanningTodo>) => {
        setTodos(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleRemoveTodo = (id: string) => {
        setTodos(prev => prev.filter(t => t.id !== id));
    };

    const handleSave = () => {
        if (!title.trim()) return;
        onSave({ title, description, todos });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Goal' : 'New Goal'}</h3>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                
                <main className="p-8 overflow-y-auto space-y-6 flex-1">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider px-1">Goal Title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-neutral-900 outline-none" placeholder="e.g. Master Phrasal Verbs" autoFocus />
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider px-1">Description (Optional)</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm focus:ring-1 focus:ring-neutral-900 outline-none resize-none" placeholder="Add context..." />
                    </div>

                    <div className="space-y-3 pt-2">
                         <div className="flex justify-between items-end px-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2"><ListTodo size={14}/> Task List</label>
                            <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">{todos.length}</span>
                         </div>
                         
                         <div className="space-y-2">
                             {todos.map((todo) => (
                                 <TodoItem 
                                    key={todo.id}
                                    todo={todo}
                                    readOnly={false}
                                    onStatusChange={(status) => handleUpdateTodo(todo.id, { status })}
                                    onTextChange={(text) => handleUpdateTodo(todo.id, { text })}
                                    onDelete={() => handleRemoveTodo(todo.id)}
                                 />
                             ))}
                         </div>

                         <div className="flex gap-2 mt-2">
                             <input 
                                value={newTodoText} 
                                onChange={e => setNewTodoText(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
                                className="flex-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none transition-all focus:bg-white"
                                placeholder="Add a new task..."
                             />
                             <button onClick={handleAddTodo} disabled={!newTodoText.trim()} className="px-4 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-sm"><Plus size={20}/></button>
                         </div>
                    </div>
                </main>

                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end bg-neutral-50/50 rounded-b-[2.5rem] shrink-0">
                    <button onClick={handleSave} disabled={!title.trim()} className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest disabled:opacity-50 hover:scale-105 transition-transform">
                        <Save size={14} /> <span>Save Changes</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};


export const PlanningPage: React.FC<Props> = ({ user }) => {
    const [goals, setGoals] = useState<PlanningGoal[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<PlanningGoal | null>(null);
    const [goalToDelete, setGoalToDelete] = useState<PlanningGoal | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    
    // AI Modal State
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);

    const { showToast } = useToast();

    const loadData = useCallback(async () => {
        setLoading(true);
        const data = await db.getPlanningGoalsByUserId(user.id);
        // Sort by order ascending, fallback to createdAt descending for new items
        setGoals(data.sort((a,b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            // If one has order and other doesn't, ordered comes first (optional logic, or push to end)
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return b.createdAt - a.createdAt;
        }));
        setLoading(false);
    }, [user.id]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSaveGoal = async (data: Partial<PlanningGoal>) => {
        const now = Date.now();
        if (editingGoal) {
            const updated = { ...editingGoal, ...data, updatedAt: now } as PlanningGoal;
            await dataStore.savePlanningGoal(updated);
            showToast("Goal updated.", "success");
        } else {
            const newGoal: PlanningGoal = {
                id: `goal-${now}-${Math.random()}`,
                userId: user.id,
                title: data.title!,
                description: data.description || '',
                todos: data.todos || [],
                createdAt: now,
                updatedAt: now,
                order: goals.length // Append to end
            };
            await dataStore.savePlanningGoal(newGoal);
            showToast("Goal created.", "success");
        }
        setIsModalOpen(false);
        loadData();
    };

    const handleDeleteGoal = async () => {
        if (!goalToDelete) return;
        await dataStore.deletePlanningGoal(goalToDelete.id);
        showToast("Goal deleted.", "success");
        setGoalToDelete(null);
        loadData();
    };
    
    const handleGenerateGoal = async (data: any) => {
        if (data.title && Array.isArray(data.todos)) {
            const now = Date.now();
            const newGoal: PlanningGoal = {
                id: `goal-ai-${now}-${Math.random()}`,
                userId: user.id,
                title: data.title,
                description: data.description || '',
                todos: data.todos.map((t: any) => ({
                    id: `todo-${now}-${Math.random()}`,
                    text: t.text,
                    status: 'NEW' as PlanningStatus
                })),
                createdAt: now,
                updatedAt: now,
                order: 0 // Insert at top for visibility
            };
            await dataStore.savePlanningGoal(newGoal);
            showToast("Goal generated by AI!", "success");
            setIsAiModalOpen(false);
            loadData();
        } else {
            showToast("Invalid AI response.", "error");
        }
    };

    const handleGeneratePrompt = (inputs: { request: string }) => {
        return getGeneratePlanningGoalPrompt(inputs.request);
    };

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        // Required for Firefox
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const oldIndex = goals.findIndex(g => g.id === draggedId);
        const newIndex = goals.findIndex(g => g.id === targetId);

        if (oldIndex === -1 || newIndex === -1) return;

        const newGoals = [...goals];
        const [movedItem] = newGoals.splice(oldIndex, 1);
        newGoals.splice(newIndex, 0, movedItem);

        // Update orders for all affected items
        const updatedGoals = newGoals.map((g, idx) => ({ ...g, order: idx }));
        
        // Optimistic UI update
        setGoals(updatedGoals);
        setDraggedId(null);

        // Persist change
        await dataStore.bulkSavePlanningGoals(updatedGoals);
    };

    return (
        <>
            <ResourcePage
                title="Planning Board"
                subtitle="Track your learning goals and tasks."
                icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Spiral%20Calendar.png" className="w-8 h-8 object-contain" alt="Planning" />}
                config={{}}
                isLoading={loading}
                isEmpty={goals.length === 0}
                emptyMessage="No goals set. Start planning!"
                activeFilters={{}}
                onFilterChange={() => {}}
                actions={
                    <ResourceActions
                        addActions={[
                            { label: 'New (AI)', icon: Sparkles, onClick: () => setIsAiModalOpen(true) },
                            { label: 'New (Manual)', icon: Plus, onClick: () => { setEditingGoal(null); setIsModalOpen(true); } }
                        ]}
                    />
                }
            >
                {() => (
                    <>
                        {goals.map(goal => {
                            const totalTodos = goal.todos.length;
                            const closedTodos = goal.todos.filter(t => t.status === 'CLOSED').length;
                            const progress = totalTodos > 0 ? Math.round((closedTodos / totalTodos) * 100) : 0;
                            const isCompleted = totalTodos > 0 && closedTodos === totalTodos;
                            const isDragging = draggedId === goal.id;

                            return (
                                <div 
                                    key={goal.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, goal.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, goal.id)}
                                    className={`transition-all duration-200 h-full ${isDragging ? 'opacity-40 scale-95' : 'opacity-100 hover:scale-[1.01]'}`}
                                >
                                    <UniversalCard
                                        title={<h4 className="text-sm font-black text-neutral-900 leading-snug mb-0.5 select-none">{goal.title}</h4>}
                                        compact={true}
                                        onClick={() => { setEditingGoal(goal); setIsModalOpen(true); }}
                                        isCompleted={isCompleted}
                                        className="h-full"
                                        actions={
                                            <>
                                                {/* Drag Handle Indicator */}
                                                <div className="p-1.5 text-neutral-300 cursor-grab active:cursor-grabbing hover:text-neutral-500 rounded-lg transition-colors mr-1">
                                                    <GripVertical size={14} />
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); setEditingGoal(goal); setIsModalOpen(true); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); setGoalToDelete(goal); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                                            </>
                                        }
                                    >
                                        <div className="flex flex-col gap-3 select-none">
                                            {goal.description && <p className="text-[10px] text-neutral-400 line-clamp-2 leading-relaxed">{goal.description}</p>}
                                            
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 bg-neutral-50 px-2 py-1.5 rounded-lg w-fit self-start">
                                                 <ListTodo size={12} />
                                                 <span>{totalTodos} Tasks</span>
                                                 {closedTodos > 0 && <span className="text-green-600">({closedTodos} done)</span>}
                                            </div>

                                            <div className="space-y-1 pt-1">
                                                <div className="flex justify-between text-[9px] font-black text-neutral-400 uppercase tracking-widest">
                                                    <span>Progress</span>
                                                    <span>{progress}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    </UniversalCard>
                                </div>
                            );
                        })}
                    </>
                )}
            </ResourcePage>

            <GoalEditModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveGoal}
                initialData={editingGoal}
                user={user}
            />

            <ConfirmationModal
                isOpen={!!goalToDelete}
                title="Delete Goal?"
                message="This will remove the goal and all its tasks."
                confirmText="Delete"
                isProcessing={false}
                onConfirm={handleDeleteGoal}
                onClose={() => setGoalToDelete(null)}
                icon={<Trash2 size={40} className="text-red-500"/>}
            />
            
            {isAiModalOpen && (
                <UniversalAiModal 
                    isOpen={isAiModalOpen} 
                    onClose={() => setIsAiModalOpen(false)} 
                    type="GENERATE_PLAN" 
                    title="AI Goal Planner" 
                    description="Describe your goal (e.g. 'Complete Collins Reading book') and let AI generate the task list." 
                    initialData={{ request: '' }} 
                    onGeneratePrompt={handleGeneratePrompt} 
                    onJsonReceived={handleGenerateGoal} 
                    actionLabel="Create Plan" 
                    closeOnSuccess={true} 
                />
            )}
        </>
    );
};
