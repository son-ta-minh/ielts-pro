import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, Lesson, VocabularyItem, SessionType, ComparisonGroup, AppView, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { BookText, Edit3, Trash2, BookOpen, Plus, Tag, Shuffle, Puzzle, FileClock, Eye, Filter, CheckCircle2, Circle, CopyPlus, Sparkles, FolderTree } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { TagBrowser, TagTreeNode } from '../../components/common/TagBrowser';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import LessonEditView from './LessonEditView';
import LessonPracticeView from './LessonPracticeView';
import { ComparisonReadView } from './ComparisonReadView';
import { ComparisonEditView } from './ComparisonEditView';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getGenerateLessonPrompt } from '../../services/promptService';
import { ResourceActions, AddAction } from '../page/ResourceActions';
import { ViewMenu } from '../../components/common/ViewMenu';
import { ResourceConfig } from '../types';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[], type: SessionType) => void;
  onExit: () => void;
  onNavigate: (view: AppView) => void;
  onUpdateUser: (user: User) => Promise<void>;
}

type ResourceItem = 
  | { type: 'ESSAY'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'COMPARISON'; data: ComparisonGroup; path?: string; tags?: string[]; date: number };

// Fix: Imported ResourceConfig to fix type error
const lessonConfig: ResourceConfig = { filterSchema: [], viewSchema: [] };
const VIEW_SETTINGS_KEY = 'vocab_pro_lesson_view_settings';

export const LessonLibraryV2: React.FC<Props> = ({ user, onStartSession, onNavigate, onUpdateUser }) => {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter & View
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ESSAY' | 'COMPARISON'>('ALL');
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showDesc: true, compact: false }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  
  const [viewMode, setViewMode] = useState<'list' | 'edit_lesson' | 'read_lesson' | 'read_comparison' | 'edit_comparison'>('list');
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeComparison, setActiveComparison] = useState<ComparisonGroup | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [comparisonToDelete, setComparisonToDelete] = useState<ComparisonGroup | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userLessons, userGroups] = await Promise.all([ db.getLessonsByUserId(user.id), db.getComparisonGroupsByUserId(user.id) ]);
      const combined: ResourceItem[] = [
          ...userLessons.map(l => ({ type: 'ESSAY' as const, data: l, path: l.path, tags: l.tags, date: l.createdAt })),
          ...userGroups.map(g => ({ type: 'COMPARISON' as const, data: g, path: g.path, tags: g.tags, date: g.createdAt }))
      ];
      setResources(combined.sort((a, b) => b.date - a.date));
    } finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  
  useEffect(() => { setPage(0); }, [selectedTag, typeFilter, pageSize]);

  const filteredResources = useMemo(() => {
    return resources.filter(res => {
      if (typeFilter !== 'ALL' && res.type !== typeFilter) return false;
      if (selectedTag) {
        if (selectedTag === 'Uncategorized') {
            const path = res.path ?? (res.tags || []).find(t => t.startsWith('/'));
            const hasPath = path && path !== '/';
            if (hasPath) return false;
        } else {
             if (!res.path?.startsWith(selectedTag) && !res.tags?.includes(selectedTag)) return false;
        }
      }
      return true;
    });
  }, [resources, selectedTag, typeFilter]);
  
  const pagedResources = useMemo(() => {
      const start = page * pageSize;
      return filteredResources.slice(start, start + pageSize);
  }, [filteredResources, page, pageSize]);

  const handleRandomize = () => { setResources(prev => [...prev].sort(() => Math.random() - 0.5)); showToast("List shuffled!", "success"); };
  const handleDeleteLesson = async () => { if (!lessonToDelete) return; await db.deleteLesson(lessonToDelete.id); showToast('Lesson deleted.', 'success'); setLessonToDelete(null); loadData(); };
  const handleDeleteComparison = async () => { if (!comparisonToDelete) return; await db.deleteComparisonGroup(comparisonToDelete.id); showToast('Comparison deleted.', 'success'); setComparisonToDelete(null); loadData(); };
  const handleSaveLesson = async (lesson: Lesson) => { await db.saveLesson(lesson); showToast('Lesson saved!', 'success'); setViewMode('list'); setActiveLesson(null); loadData(); };
  const handleSaveComparison = async (group: ComparisonGroup) => { await db.saveComparisonGroup(group); showToast('Comparison saved!', 'success'); setViewMode('read_comparison'); setActiveComparison(group); loadData(); };
  
  if (viewMode === 'read_lesson' && activeLesson) return <LessonPracticeView lesson={activeLesson} onComplete={() => setViewMode('list')} onEdit={() => setViewMode('edit_lesson')} />;
  if (viewMode === 'edit_lesson' && activeLesson) return <LessonEditView lesson={activeLesson} onSave={handleSaveLesson} onPractice={(l) => { setActiveLesson(l); setViewMode('read_lesson'); }} onCancel={() => setViewMode('list')} />;
  if (viewMode === 'read_comparison' && activeComparison) return <ComparisonReadView group={activeComparison} onBack={() => setViewMode('list')} onEdit={() => setViewMode('edit_comparison')} />;
  if (viewMode === 'edit_comparison' && activeComparison) return <ComparisonEditView group={activeComparison} onSave={handleSaveComparison} onCancel={() => setViewMode(activeComparison.words.length > 0 ? 'read_comparison' : 'list')} user={user} />;
  
  const handleNewLesson = () => {
    const newLesson: Lesson = { id: `lesson-${Date.now()}`, userId: user.id, topic1: '', topic2: '', title: 'New Lesson', description: '', content: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() };
    setActiveLesson(newLesson);
    setViewMode('edit_lesson');
  };

  const handleNewComparison = () => {
    const newGroup: ComparisonGroup = { id: `cmp-${Date.now()}`, userId: user.id, name: 'New Comparison', words: [], tags: [], comparisonData: [], createdAt: Date.now(), updatedAt: Date.now() };
    setActiveComparison(newGroup);
    setViewMode('edit_comparison');
  };

  const handleGenerateLesson = async (data: any) => {
    const { result, preferences } = data;
    if (JSON.stringify(user.lessonPreferences) !== JSON.stringify(preferences)) { await onUpdateUser({ ...user, lessonPreferences: preferences }); }
    const newLesson: Lesson = {
        id: `lesson-ai-${Date.now()}`, userId: user.id, title: result.title, description: result.description, content: result.content,
        tags: ['AI Generated', preferences.tone === 'friendly_elementary' ? 'Elementary' : 'Advanced'],
        createdAt: Date.now(), updatedAt: Date.now(), topic1: '', topic2: ''
    };
    await db.saveLesson(newLesson);
    showToast("Lesson created with AI!", "success");
    setIsAiModalOpen(false);
    setActiveLesson(newLesson);
    setViewMode('read_lesson');
    loadData();
  };
  
  const handleFocusChange = async (item: ResourceItem, color: FocusColor | null) => {
      if (item.type === 'ESSAY') {
        const newData = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
        if (!color) delete newData.focusColor;
        setResources(prev => prev.map(r => (r.type === 'ESSAY' && r.data.id === item.data.id) ? { ...r, data: newData } : r));
        await db.saveLesson(newData as Lesson);
      } else { // COMPARISON
        const newData = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
        if (!color) delete newData.focusColor;
        setResources(prev => prev.map(r => (r.type === 'COMPARISON' && r.data.id === item.data.id) ? { ...r, data: newData } : r));
        await db.saveComparisonGroup(newData as ComparisonGroup);
      }
  };

  const addActions: AddAction[] = [
      { label: 'AI Lesson', icon: Sparkles, onClick: () => setIsAiModalOpen(true) },
      { label: 'New Comparison', icon: CopyPlus, onClick: handleNewComparison },
      { label: 'New Lesson', icon: Plus, onClick: handleNewLesson },
  ];

  return (
    <>
    <ResourcePage
      title="Knowledge Library"
      subtitle="Your collection of lessons and comparisons."
      icon={<BookText size={28} className="text-cyan-600" />}
      minorSkills={ <button onClick={() => onNavigate('IRREGULAR_VERBS')} className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors"><FileClock size={16} /><span className="hidden sm:inline">Irregular Verbs</span></button> }
      pagination={{ page, totalPages: Math.ceil(filteredResources.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredResources.length }}
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen}
                    setIsOpen={setIsViewMenuOpen}
                    filterOptions={[
                        { label: 'All', value: 'ALL', isActive: typeFilter === 'ALL', onClick: () => setTypeFilter('ALL') },
                        { label: 'Lesson', value: 'ESSAY', isActive: typeFilter === 'ESSAY', onClick: () => setTypeFilter('ESSAY') },
                        { label: 'Comp.', value: 'COMPARISON', isActive: typeFilter === 'COMPARISON', onClick: () => setTypeFilter('COMPARISON') },
                    ]}
                    viewOptions={[
                        { label: 'Show Description', checked: viewSettings.showDesc, onChange: () => setViewSettings(v => ({...v, showDesc: !v.showDesc})) },
                        { label: 'Compact Mode', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                    ]}
                />
            }
            browseGroups={{ isOpen: isGroupBrowserOpen, onToggle: () => { setIsGroupBrowserOpen(!isGroupBrowserOpen); setIsTagBrowserOpen(false); } }}
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); setIsGroupBrowserOpen(false); } }}
            addActions={addActions}
            extraActions={
                <button onClick={handleRandomize} disabled={resources.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button>
            }
        />
      }
      aboveGrid={
        <>
            {isGroupBrowserOpen && <TagBrowser items={resources} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="groups" title="Browse Groups" icon={<FolderTree size={16}/>} />}
            {isTagBrowserOpen && <TagBrowser items={resources} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        </>
      }
      config={lessonConfig}
      activeFilters={{}}
      onFilterChange={() => {}}
      isLoading={loading}
      isEmpty={filteredResources.length === 0}
      emptyMessage="No items found matching your criteria."
    >
      {() => (
        <>
          {pagedResources.map((item) => {
            const isLesson = item.type === 'ESSAY';
            const titleContent = isLesson ? (item.data as Lesson).title : (item.data as ComparisonGroup).name;
            const onRead = isLesson ? () => { setActiveLesson(item.data as Lesson); setViewMode('read_lesson'); } : () => { setActiveComparison(item.data as ComparisonGroup); setViewMode('read_comparison'); };
            const onEdit = isLesson ? () => { setActiveLesson(item.data as Lesson); setViewMode('edit_lesson'); } : () => { setActiveComparison(item.data as ComparisonGroup); setViewMode('edit_comparison'); };
            const onDelete = isLesson ? () => setLessonToDelete(item.data as Lesson) : () => setComparisonToDelete(item.data as ComparisonGroup);

            return (
                <UniversalCard
                    key={`${item.type}-${item.data.id}`}
                    title={titleContent} path={item.path} tags={item.tags} compact={viewSettings.compact}
                    onClick={onRead}
                    focusColor={item.data.focusColor}
                    onFocusChange={(c) => handleFocusChange(item, c)}
                    actions={
                        <>
                            <button onClick={(e) => { e.stopPropagation(); onRead(); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                        </>
                    }
                >
                    {viewSettings.showDesc && (isLesson ? ((item.data as Lesson).description && <p className="line-clamp-2">{(item.data as Lesson).description}</p>) : (<div className="flex flex-wrap gap-1.5">{(item.data as ComparisonGroup).words.slice(0, 4).map(w => <span key={w} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-bold">{w}</span>)}{(item.data as ComparisonGroup).words.length > 4 && <span className="text-[10px] text-neutral-400 font-bold">+{ (item.data as ComparisonGroup).words.length - 4}</span>}</div>))}
                </UniversalCard>
            );
          })}
        </>
      )}
    </ResourcePage>
    <ConfirmationModal isOpen={!!lessonToDelete} title="Delete Lesson?" message="Confirm delete?" confirmText="Yes, Delete" isProcessing={false} onConfirm={handleDeleteLesson} onClose={() => setLessonToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    <ConfirmationModal isOpen={!!comparisonToDelete} title="Delete Comparison?" message="Confirm delete?" confirmText="Yes, Delete" isProcessing={false} onConfirm={handleDeleteComparison} onClose={() => setComparisonToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="GENERATE_LESSON" title="AI Lesson Creator" description="Design a custom lesson instantly." initialData={user.lessonPreferences} onGeneratePrompt={getGenerateLessonPrompt} onJsonReceived={handleGenerateLesson} actionLabel="Create Lesson" closeOnSuccess={true} />
    </>
  );
};