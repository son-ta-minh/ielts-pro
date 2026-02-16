
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Lesson, VocabularyItem, SessionType, AppView, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Edit3, Trash2, BookOpen, Plus, Tag, Shuffle, FileClock, Target, Sparkles, Zap, Split, FileDiff, Scale, BookText, Search, LayoutGrid } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { TagBrowser } from '../../components/common/TagBrowser';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { getConfig } from '../../app/settingsManager';
import { UniversalCard } from '../../components/common/UniversalCard';
import LessonEditView from './LessonEditView';
import LessonPracticeView from './LessonPracticeView';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt } from '../../services/promptService';
import { ResourceActions, AddAction } from '../page/ResourceActions';
import { ViewMenu } from '../../components/common/ViewMenu';
import { ResourceConfig } from '../types';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[], type: SessionType) => void;
  onNavigate: (view: AppView) => void;
  onUpdateUser: (user: User) => Promise<void>;
  onExit?: () => void;
  initialLessonId?: string | null;
  onConsumeLessonId?: () => void;
  initialTag?: string | null;
  onConsumeTag?: () => void;
}

type ResourceItem = 
  | { type: 'ESSAY'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'INTENSITY'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'COMPARISON'; data: Lesson; path?: string; tags?: string[]; date: number };

const lessonConfig: ResourceConfig = { filterSchema: [], viewSchema: [] };
const VIEW_SETTINGS_KEY = 'vocab_pro_lesson_view_settings';

export const LessonLibraryV2: React.FC<Props> = ({ user, onStartSession, onNavigate, onUpdateUser, initialLessonId, onConsumeLessonId, initialTag, onConsumeTag }) => {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter & View State
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'ESSAY' | 'INTENSITY' | 'COMPARISON'>('ALL');
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showDesc: true, compact: false }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  
  const [viewMode, setViewMode] = useState<'list' | 'edit_lesson' | 'read_lesson'>('list');
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userLessons, allWordsData] = await Promise.all([ 
          db.getLessonsByUserId(user.id), 
          dataStore.getAllWords()
      ]);
      const combined: ResourceItem[] = [
          ...userLessons.map(l => {
              let type: ResourceItem['type'] = 'ESSAY';
              if (l.type === 'intensity') type = 'INTENSITY';
              if (l.type === 'comparison') type = 'COMPARISON';
              return { type, data: l, path: l.path, tags: l.tags, date: l.createdAt };
          }),
      ];
      setResources(combined.sort((a, b) => b.date - a.date));
      setAllWords(allWordsData);
    } finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  
  useEffect(() => {
      if (initialLessonId && resources.length > 0) {
          const target = resources.find(r => r.data.id === initialLessonId);
          if (target) {
              setActiveLesson(target.data as Lesson);
              setViewMode('read_lesson');
              onConsumeLessonId?.();
          }
      }
  }, [initialLessonId, resources, onConsumeLessonId]);

  // Handle Deep Linking to Tag
  useEffect(() => {
      if (initialTag) {
          setSelectedTag(initialTag);
          onConsumeTag?.();
      }
  }, [initialTag, onConsumeTag]);
  
  useEffect(() => { setPage(0); }, [selectedTag, searchQuery, typeFilter, focusFilter, colorFilter, pageSize]);

  const resetFilters = useCallback(() => {
    setSelectedTag(null);
    setTypeFilter('ALL');
    setFocusFilter('all');
    setColorFilter('all');
  }, []);

  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (val.trim()) {
        resetFilters();
    }
  };

  const hasActiveFilters = useMemo(() => {
    return typeFilter !== 'ALL' || focusFilter !== 'all' || colorFilter !== 'all';
  }, [typeFilter, focusFilter, colorFilter]);

  const filteredResources = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return resources.filter(res => {
      // 1. Text Search Logic (searches Title, Description, Keywords, and Tags)
      if (q) {
        const titleMatch = (res.data.title || '').toLowerCase().includes(q);
        const descMatch = (res.data.description || '').toLowerCase().includes(q);
        const keywordMatch = (res.data.searchKeywords || []).some(kw => (kw || '').toLowerCase().includes(q));
        const tagMatch = (res.data.tags || []).some(t => (t || '').toLowerCase().includes(q));
        
        if (!titleMatch && !descMatch && !keywordMatch && !tagMatch) return false;
        return true;
      }

      // 2. Standard Filters (only if no search query)
      if (typeFilter !== 'ALL' && res.type !== typeFilter) return false;
      if (focusFilter === 'focused' && !res.data.isFocused) return false;
      if (colorFilter !== 'all' && res.data.focusColor !== colorFilter) return false;
      
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
  }, [resources, selectedTag, searchQuery, typeFilter, focusFilter, colorFilter]);
  
  const pagedResources: ResourceItem[] = useMemo(() => {
      const start = page * pageSize;
      return filteredResources.slice(start, start + pageSize);
  }, [filteredResources, page, pageSize]);

  const handleDeleteLesson = async () => { if (!lessonToDelete) return; await dataStore.deleteLesson(lessonToDelete.id); showToast('Lesson deleted.', 'success'); setLessonToDelete(null); loadData(); };
  
  const handleSaveLesson = async (lesson: Lesson) => { 
      await dataStore.saveLesson(lesson); 
      showToast('Lesson saved!', 'success'); 
      setViewMode('list'); 
      setActiveLesson(null); 
      loadData(); 
  };
  
  const handleNewLesson = (type: Lesson['type'] = 'essay') => {
    const newLesson: Lesson = { 
        id: `lesson-${Date.now()}`, 
        userId: user.id, 
        topic1: 'General', 
        topic2: 'General', 
        type,
        title: type === 'intensity' ? 'New Intensity Scale' : type === 'comparison' ? 'New Comparison Lab' : `New Lesson`, 
        description: '', 
        content: '', 
        tags: [], 
        intensityRows: type === 'intensity' ? [{ softened: [], neutral: [], intensified: [] }] : undefined,
        comparisonRows: type === 'comparison' ? [{ word: '', nuance: '', example: '' }] : undefined,
        createdAt: Date.now(), 
        updatedAt: Date.now() 
    };
    setActiveLesson(newLesson);
    setViewMode('edit_lesson');
  };

  const handleGenerateLesson = async (data: any) => {
    const { result, preferences } = data;
    if (JSON.stringify(user.lessonPreferences) !== JSON.stringify(preferences)) { await onUpdateUser({ ...user, lessonPreferences: preferences }); }
    
    const newLesson: Lesson = {
        id: `lesson-ai-${Date.now()}`, userId: user.id, title: result.title, description: result.description, content: result.content,
        tags: result.tags || [],
        searchKeywords: result.searchKeywords || [],
        createdAt: Date.now(), updatedAt: Date.now(), topic1: 'General', topic2: 'General'
    };
    await dataStore.saveLesson(newLesson);
    showToast("Lesson created with AI!", "success");
    setIsAiModalOpen(false);
    setActiveLesson(newLesson);
    setViewMode('read_lesson');
    loadData();
  };
  
  const handleFocusChange = async (item: ResourceItem, color: FocusColor | null) => {
      const newDataBase = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete newDataBase.focusColor;
      
      await dataStore.saveLesson(newDataBase as Lesson);
      
      setResources(prev => prev.map(r => {
        if (r.data.id === item.data.id) {
             return { ...r, data: { ...(r.data as Lesson), focusColor: color || undefined, updatedAt: Date.now() } };
        }
        return r;
      }));
  };
  
  const handleToggleFocus = async (item: ResourceItem) => {
      const newDataBase = { ...item.data, isFocused: !item.data.isFocused, updatedAt: Date.now() };
      
      await dataStore.saveLesson(newDataBase as Lesson);
      
      setResources(prev => prev.map(r => {
        if (r.data.id === item.data.id) {
             return { ...r, data: { ...(r.data as Lesson), isFocused: !r.data.isFocused, updatedAt: Date.now() } };
        }
        return r;
      }));
  };

  const handleRandomize = () => {
    setResources(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Deck shuffled!", "success");
  };

  const addActions: AddAction[] = [
      { label: 'Topic Lesson (AI)', icon: Sparkles, onClick: () => setIsAiModalOpen(true) },
      { label: 'Intensity Scale', icon: Zap, onClick: () => handleNewLesson('intensity') },
      { label: 'Comparison Lab', icon: Split, onClick: () => handleNewLesson('comparison') },
      { label: 'New Lesson (Manual)', icon: Plus, onClick: () => handleNewLesson('essay') },
  ];

  const handleGeneratePromptWithCoach = (inputs: any) => {
      const config = getConfig();
      const activeType = config.audioCoach.activeCoach;
      const coachName = config.audioCoach.coaches[activeType].name;
      return getLessonPrompt({
          topic: inputs.topic,
          language: inputs.language,
          targetAudience: inputs.targetAudience,
          tone: inputs.tone,
          format: inputs.format,
          coachName,
          task: 'create_reading'
      });
  };

  if (viewMode === 'read_lesson' && activeLesson) {
      return <LessonPracticeView user={user} lesson={activeLesson} onComplete={() => setViewMode('list')} onEdit={() => setViewMode('edit_lesson')} onUpdate={(updated) => setActiveLesson(updated)} />;
  }
  if (viewMode === 'edit_lesson' && activeLesson) {
      return <LessonEditView lesson={activeLesson} user={user} onSave={handleSaveLesson} onPractice={(l) => { setActiveLesson(l); setViewMode('read_lesson'); }} onCancel={() => setViewMode('list')} />;
  }
  
  // --- Quick Filter Bar Component ---
  const QuickFilterBar = () => (
      <div className="flex flex-col gap-4 mb-6">
        {isTagBrowserOpen && <TagBrowser items={resources.map(r => r.data)} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
             {/* Small Search Box */}
             <div className="relative w-full sm:w-auto sm:flex-1 max-w-sm">
                 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                 <input 
                     type="text" 
                     value={searchQuery} 
                     onChange={(e) => handleQueryChange(e.target.value)} 
                     placeholder="Search..." 
                     className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
                 />
             </div>
             
             {/* Quick Filters */}
             <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 no-scrollbar">
                 <button 
                    onClick={() => setTypeFilter('ALL')} 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === 'ALL' ? 'bg-neutral-900 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900'}`}
                 >
                    <LayoutGrid size={12} /> All
                 </button>
                 <button 
                    onClick={() => setTypeFilter('ESSAY')} 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === 'ESSAY' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-emerald-600'}`}
                 >
                    <BookText size={12} /> Lesson
                 </button>
                 <button 
                    onClick={() => setTypeFilter('INTENSITY')} 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === 'INTENSITY' ? 'bg-orange-500 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-orange-500'}`}
                 >
                    <Scale size={12} /> Scale
                 </button>
                 <button 
                    onClick={() => setTypeFilter('COMPARISON')} 
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${typeFilter === 'COMPARISON' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-indigo-600'}`}
                 >
                    <FileDiff size={12} /> Diff
                 </button>
             </div>
        </div>
      </div>
  );

  return (
    <>
    <ResourcePage
      title="Knowledge Library"
      subtitle="Your collection of lessons and comparisons."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Notebook.png" className="w-8 h-8 object-contain" alt="Lessons" />}
      // Removed default search bar and replaced with custom QuickFilterBar in aboveGrid
      minorSkills={ <button onClick={() => onNavigate('IRREGULAR_VERBS')} className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors"><FileClock size={16} /><span className="hidden sm:inline">Irregular Verbs</span></button> }
      pagination={{ page, totalPages: Math.ceil(filteredResources.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredResources.length }}
      aboveGrid={<QuickFilterBar />}
      config={lessonConfig}
      activeFilters={{}}
      onFilterChange={() => {}}
      isLoading={loading}
      isEmpty={filteredResources.length === 0}
      emptyMessage="No items found matching your criteria."
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen}
                    setIsOpen={setIsViewMenuOpen}
                    hasActiveFilters={hasActiveFilters}
                    customSection={
                        <>
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                                <Target size={10}/> Focus & Status
                            </div>
                            <div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2">
                                <button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                    {focusFilter === 'focused' ? 'Focused Only' : 'All Items'}
                                </button>
                                <div className="flex gap-1">
                                    <button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} />
                                </div>
                            </div>
                        </>
                    }
                    viewOptions={[
                        { label: 'Show Description', checked: viewSettings.showDesc, onChange: () => setViewSettings(v => ({...v, showDesc: !v.showDesc})) },
                        { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }
                    ]}
                />
            }
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }}
            addActions={addActions}
            extraActions={
                <>
                    <button onClick={handleRandomize} disabled={filteredResources.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Shuffle Deck"><Shuffle size={16} /></button>
                </>
            }
        />
      }
    >
      {() => (
        <>
          {pagedResources.map((item) => {
            const onRead = () => { setActiveLesson(item.data as Lesson); setViewMode('read_lesson'); };
            const onEdit = () => { setActiveLesson(item.data as Lesson); setViewMode('edit_lesson'); };
            const onDelete = () => setLessonToDelete(item.data as Lesson);

            const isIntensity = item.type === 'INTENSITY';
            const isComparison = item.type === 'COMPARISON';

            let badge;
            if (isIntensity) {
                badge = { label: 'Scale', colorClass: 'bg-orange-50 text-orange-700 border-orange-100', icon: Scale };
            } else if (isComparison) {
                badge = { label: 'Diff', colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: FileDiff };
            } else {
                badge = { label: 'Lesson', colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: BookText };
            }

            return (
                <UniversalCard
                    key={`${item.type}-${item.data.id}`}
                    title={<div className="font-black text-lg text-neutral-900 tracking-tight leading-tight truncate">{(item.data as Lesson).title}</div>} 
                    tags={item.data.tags} 
                    badge={badge}
                    compact={viewSettings.compact}
                    onClick={onRead}
                    focusColor={item.data.focusColor}
                    onFocusChange={(c) => handleFocusChange(item, c)}
                    isFocused={item.data.isFocused}
                    onToggleFocus={() => handleToggleFocus(item)}
                    isCompleted={item.data.focusColor === 'green'}
                    actions={
                        <>
                            <button onClick={(e) => { e.stopPropagation(); onRead(); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                        </>
                    }
                >
                    {viewSettings.showDesc && (item.data as Lesson).description && (
                        <p className="line-clamp-3 mt-1">{(item.data as Lesson).description}</p>
                    )}
                </UniversalCard>
            );
          })}
        </>
      )}
    </ResourcePage>
    <ConfirmationModal isOpen={!!lessonToDelete} title="Delete Lesson?" message="Confirm delete?" confirmText="Yes, Delete" isProcessing={false} onConfirm={handleDeleteLesson} onClose={() => setLessonToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    
    <UniversalAiModal 
        isOpen={isAiModalOpen} 
        onClose={() => setIsAiModalOpen(false)} 
        type="GENERATE_LESSON" 
        title="AI Lesson Creator" 
        description="Design a custom lesson instantly." 
        initialData={user.lessonPreferences} 
        onGeneratePrompt={handleGeneratePromptWithCoach} 
        onJsonReceived={handleGenerateLesson} 
        actionLabel="Create Lesson" 
        closeOnSuccess={true} 
    />
    </>
  );
};

export default LessonLibraryV2;
