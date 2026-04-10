
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, Lesson, StudyItem, SessionType, AppView, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Edit3, Trash2, BookOpen, Plus, Tag, Shuffle, FileClock, Target, Sparkles, Zap, Split, FileDiff, Scale, BookText, Search, LayoutGrid, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Layers3, Save, X } from 'lucide-react';
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
import { parseMarkdown } from '../../utils/markdownParser';
import { IntensityTable } from '../../components/common/IntensityTable';
import { ComparisonTable } from '../../components/common/ComparisonTable';
import { MistakeTable } from '../../components/common/MistakeTable';

interface Props {
  user: User;
  onStartSession: (words: StudyItem[], type: SessionType) => void;
  onNavigate: (view: AppView) => void;
  onUpdateUser: (user: User) => Promise<void>;
  onExit?: () => void;
  initialLessonId?: string | null;
  onConsumeLessonId?: () => void;
  initialTag?: string | null;
  onConsumeTag?: () => void;
  initialType?: string | null;
  onConsumeType?: () => void;
}

type ResourceItem = 
  | { type: 'ESSAY'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'INTENSITY'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'COMPARISON'; data: Lesson; path?: string; tags?: string[]; date: number }
  | { type: 'MISTAKE'; data: Lesson; path?: string; tags?: string[]; date: number };

type BuiltInFilter = 'ALL' | ResourceItem['type'];
type TypeFilter = BuiltInFilter | `KNOWLEDGE:${string}`;

const getKnowledgeTypeFilterValue = (value: string): TypeFilter => `KNOWLEDGE:${value}`;
const PROSE_CLASS =
  'prose prose-sm max-w-none prose-headings:font-black prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600';

const lessonConfig: ResourceConfig = { filterSchema: [], viewSchema: [] };
const VIEW_SETTINGS_KEY = 'vocab_pro_lesson_view_settings';

interface FilterMenuGroupProps {
  id: 'system' | 'dynamic';
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  activeLabel: string;
  options: Array<{
    key: TypeFilter;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    activeClass: string;
    inactiveClass: string;
  }>;
  typeFilter: TypeFilter;
  setTypeFilter: (next: TypeFilter) => void;
  openMenuId?: 'system' | 'dynamic' | null;
  setOpenMenuId?: React.Dispatch<React.SetStateAction<'system' | 'dynamic' | null>>;
}

const FilterMenuGroup: React.FC<FilterMenuGroupProps> = ({ id, title, icon: Icon, activeLabel, options, typeFilter, setTypeFilter, openMenuId, setOpenMenuId }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const safeSetOpenMenuId = useCallback((value: React.SetStateAction<'system' | 'dynamic' | null>) => {
    if (typeof setOpenMenuId === 'function') {
      setOpenMenuId(value);
    }
  }, [setOpenMenuId]);
  const isOpen = openMenuId === id;

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      safeSetOpenMenuId((current) => (current === id ? null : current));
      closeTimeoutRef.current = null;
    }, 120);
  }, [clearCloseTimeout, id, safeSetOpenMenuId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        clearCloseTimeout();
        safeSetOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearCloseTimeout();
    };
  }, [clearCloseTimeout, safeSetOpenMenuId]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => safeSetOpenMenuId((prev) => (prev === id ? null : id))}
        onMouseEnter={clearCloseTimeout}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-all shadow-sm"
      >
        <Icon size={12} />
        <span>{title}</span>
        <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-500 normal-case tracking-normal text-[10px] font-bold">
          {activeLabel}
        </span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full pt-2 min-w-[14rem] z-[120] animate-in fade-in zoom-in-95"
          onMouseEnter={() => {
            clearCloseTimeout();
            safeSetOpenMenuId(id);
          }}
        >
          <div className="relative bg-white rounded-2xl shadow-2xl border border-neutral-100 p-2 pointer-events-auto">
            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50">
              {title} Filters
            </div>
            <div className="pt-2 flex flex-col gap-1">
              {options.map((option) => {
                const OptionIcon = option.icon;
                const isActive = typeFilter === option.key;
                return (
                <button
                  key={option.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setTypeFilter(option.key);
                    safeSetOpenMenuId(null);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-[11px] font-bold transition-all ${isActive ? option.activeClass : option.inactiveClass}`}
                >
                    <OptionIcon size={13} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const LessonLibraryV2: React.FC<Props> = ({ user, onStartSession, onNavigate, onUpdateUser, initialLessonId, onConsumeLessonId, initialTag, onConsumeTag, initialType, onConsumeType }) => {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [allWords, setAllWords] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter & View State
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [openFilterMenuId, setOpenFilterMenuId] = useState<'system' | 'dynamic' | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showDesc: true, compact: false, sideBySide: true, sideBySideCollapsed: false }));
  const [isDesktop, setIsDesktop] = useState(false);
  const [sideBySideLessonId, setSideBySideLessonId] = useState<string | null>(null);
  const [hoveredSidePreview, setHoveredSidePreview] = useState<{ lesson: Lesson; top: number; left: number } | null>(null);
  const [isEditingSideContent, setIsEditingSideContent] = useState(false);
  const [sideContentDraft, setSideContentDraft] = useState('');
  const [isSavingSideContent, setIsSavingSideContent] = useState(false);
  const [sideBySideEditingLesson, setSideBySideEditingLesson] = useState<Lesson | null>(null);
  const [lastAutoSideBySideFilter, setLastAutoSideBySideFilter] = useState<TypeFilter | null>(null);
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  
  const [viewMode, setViewMode] = useState<'list' | 'edit_lesson' | 'read_lesson'>('list');
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const { showToast } = useToast();
  const config = getConfig();
  const dynamicKnowledgeTypes = useMemo(
    () => (config.lesson.knowledgeTypes || []).map((item) => item.trim()).filter(Boolean),
    [config.lesson.knowledgeTypes]
  );

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const updateDesktop = () => setIsDesktop(media.matches);
    updateDesktop();
    media.addEventListener('change', updateDesktop);
    return () => media.removeEventListener('change', updateDesktop);
  }, []);

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
              if (l.type === 'mistake') type = 'MISTAKE';
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

  useEffect(() => {
      if (initialType) {
          setTypeFilter(initialType as TypeFilter);
          onConsumeType?.();
      }
  }, [initialType, onConsumeType]);
  
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
      }

      // 2. Standard Filters
      if (typeFilter !== 'ALL') {
        if (typeFilter.startsWith('KNOWLEDGE:')) {
          const selectedKnowledgeType = typeFilter.slice('KNOWLEDGE:'.length).toLowerCase();
          if ((res.data.knowledgeType || '').trim().toLowerCase() !== selectedKnowledgeType) return false;
        } else {
          if (res.type !== typeFilter) return false;
          if (typeFilter === 'ESSAY' && (res.data.knowledgeType || '').trim()) return false;
        }
      }
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

  const canUseSideBySide = isDesktop && (typeFilter === 'ESSAY' || typeFilter.startsWith('KNOWLEDGE:'));
  const isSideBySideMode = canUseSideBySide && !!viewSettings.sideBySide;
  const isSideBySideCollapsed = isSideBySideMode && !!viewSettings.sideBySideCollapsed;

  useEffect(() => {
    if (!isSideBySideMode) {
      setHoveredSidePreview(null);
    }
  }, [isSideBySideMode]);

  useEffect(() => {
    if (!canUseSideBySide) {
      setLastAutoSideBySideFilter(null);
      return;
    }
    if (lastAutoSideBySideFilter === typeFilter) return;

    setViewSettings((prev: any) => ({ ...prev, sideBySide: true }));
    setLastAutoSideBySideFilter(typeFilter);
  }, [canUseSideBySide, lastAutoSideBySideFilter, typeFilter]);

  useEffect(() => {
    if (!canUseSideBySide && viewSettings.sideBySide) {
      setViewSettings((prev: any) => ({ ...prev, sideBySide: false, sideBySideCollapsed: false }));
    }
  }, [canUseSideBySide, viewSettings.sideBySide]);

  useEffect(() => {
    if (!isSideBySideMode) return;
    if (pagedResources.length === 0) {
      setSideBySideLessonId(null);
      return;
    }

    const stillExists = pagedResources.some((item) => item.data.id === sideBySideLessonId);
    if (!stillExists) {
      setSideBySideLessonId(pagedResources[0].data.id);
    }
  }, [isSideBySideMode, pagedResources, sideBySideLessonId]);

  const sideBySideLesson = useMemo(
    () => pagedResources.find((item) => item.data.id === sideBySideLessonId) || pagedResources[0] || null,
    [pagedResources, sideBySideLessonId]
  );

  useEffect(() => {
    setIsEditingSideContent(false);
    setIsSavingSideContent(false);
    setSideContentDraft(sideBySideLesson?.data.content || '');
  }, [sideBySideLesson?.data.id]);

  const handleDeleteLesson = async () => { if (!lessonToDelete) return; await dataStore.deleteLesson(lessonToDelete.id); showToast('Lesson deleted.', 'success'); setLessonToDelete(null); loadData(); };
  
  const handleSaveLesson = async (lesson: Lesson) => { 
      await dataStore.saveLesson(lesson); 
      showToast('Lesson saved!', 'success'); 
      setViewMode('list'); 
      setActiveLesson(null); 
      loadData(); 
  };

  const handleSaveSideBySideLesson = async (lesson: Lesson) => {
    await dataStore.saveLesson(lesson);
    setResources((prev) => prev.map((item) => (
      item.data.id === lesson.id
        ? { ...item, data: lesson }
        : item
    )));
    setSideBySideLessonId(lesson.id);
    setSideBySideEditingLesson(null);
    showToast('Lesson saved!', 'success');
    loadData();
  };

  const handleSaveSideContent = async () => {
    if (!sideBySideLesson) return;
    const lesson = sideBySideLesson.data as Lesson;
    setIsSavingSideContent(true);
    try {
      const updatedLesson: Lesson = {
        ...lesson,
        content: sideContentDraft,
        updatedAt: Date.now()
      };
      await dataStore.saveLesson(updatedLesson);
      setResources((prev) => prev.map((item) => (
        item.data.id === updatedLesson.id
          ? { ...item, data: updatedLesson }
          : item
      )));
      if (activeLesson?.id === updatedLesson.id) {
        setActiveLesson(updatedLesson);
      }
      setIsEditingSideContent(false);
      showToast('Content updated.', 'success');
    } finally {
      setIsSavingSideContent(false);
    }
  };
  
  const handleNewLesson = (type: Lesson['type'] = 'essay', knowledgeType?: string) => {
    const newLesson: Lesson = { 
        id: `lesson-${Date.now()}`, 
        userId: user.id, 
        topic1: 'General', 
        topic2: 'General', 
        type,
        knowledgeType: type === 'essay' ? knowledgeType : undefined,
        title: type === 'intensity' ? 'New Intensity Scale' : type === 'comparison' ? 'New Comparison Lab' : type === 'mistake' ? 'New Mistake Card' : `New Lesson`, 
        description: '', 
        content: '', 
        tags: [], 
        intensityRows: type === 'intensity' ? [{ softened: [], neutral: [], intensified: [] }] : undefined,
        comparisonRows: type === 'comparison' ? [{ word: '', nuance: '', example: '' }] : undefined,
        mistakeRows: type === 'mistake' ? [{
            mistake: 'educating staffs',
            explanation: '“Staff” is uncountable; “educating” is incorrect collocation.',
            correction: 'teaching staff / teachers'
        }] : undefined,
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

  const quickFilterOptions = useMemo(() => {
    const dynamicOptions = dynamicKnowledgeTypes.map((item) => ({
      key: getKnowledgeTypeFilterValue(item),
      label: item,
      icon: BookText,
      activeClass: 'bg-sky-600 text-white shadow-md',
      inactiveClass: 'bg-white border border-neutral-200 text-neutral-500 hover:text-sky-600'
    }));

    return [
      { key: 'ALL' as TypeFilter, label: 'All', icon: LayoutGrid, activeClass: 'bg-neutral-900 text-white shadow-md', inactiveClass: 'bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900' },
      { key: 'ESSAY' as TypeFilter, label: 'Lesson', icon: BookText, activeClass: 'bg-emerald-600 text-white shadow-md', inactiveClass: 'bg-white border border-neutral-200 text-neutral-500 hover:text-emerald-600' },
      { key: 'INTENSITY' as TypeFilter, label: 'Scale', icon: Scale, activeClass: 'bg-orange-500 text-white shadow-md', inactiveClass: 'bg-white border border-neutral-200 text-neutral-500 hover:text-orange-500' },
      { key: 'COMPARISON' as TypeFilter, label: 'Diff', icon: FileDiff, activeClass: 'bg-indigo-600 text-white shadow-md', inactiveClass: 'bg-white border border-neutral-200 text-neutral-500 hover:text-indigo-600' },
      { key: 'MISTAKE' as TypeFilter, label: 'Mistake', icon: AlertTriangle, activeClass: 'bg-rose-600 text-white shadow-md', inactiveClass: 'bg-white border border-neutral-200 text-neutral-500 hover:text-rose-600' },
      ...dynamicOptions
    ];
  }, [dynamicKnowledgeTypes]);

  const systemFilterOptions = useMemo(
    () => quickFilterOptions.filter((option) => !option.key.startsWith('KNOWLEDGE:')),
    [quickFilterOptions]
  );

  const dynamicFilterOptions = useMemo(
    () => quickFilterOptions.filter((option) => option.key.startsWith('KNOWLEDGE:')),
    [quickFilterOptions]
  );

  const activeSystemOption = useMemo(
    () => systemFilterOptions.find((option) => option.key === typeFilter) || systemFilterOptions[0],
    [systemFilterOptions, typeFilter]
  );

  const activeDynamicOption = useMemo(
    () => dynamicFilterOptions.find((option) => option.key === typeFilter) || null,
    [dynamicFilterOptions, typeFilter]
  );

  const handleRandomize = () => {
    setResources(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Deck shuffled!", "success");
  };

  const addActions: AddAction[] = [
      { label: 'Topic Lesson (AI)', icon: Sparkles, onClick: () => setIsAiModalOpen(true) },
      { label: 'Intensity Scale', icon: Zap, onClick: () => handleNewLesson('intensity') },
      { label: 'Comparison Lab', icon: Split, onClick: () => handleNewLesson('comparison') },
      { label: 'Mistake Card', icon: AlertTriangle, onClick: () => handleNewLesson('mistake') },
      { label: 'New Lesson (Manual)', icon: Plus, onClick: () => handleNewLesson('essay') },
      ...dynamicKnowledgeTypes.map((item) => ({
        label: `New ${item} Card`,
        icon: BookText,
        onClick: () => handleNewLesson('essay', item)
      }))
  ];

  const handleGeneratePromptWithCoach = (inputs: any) => {
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
             <div className="flex flex-wrap items-center gap-2 overflow-visible w-full sm:w-auto pb-2 sm:pb-0">
                 <FilterMenuGroup
                    id="system"
                    title="System"
                    icon={Layers3}
                    activeLabel={activeSystemOption?.label || 'All'}
                    options={systemFilterOptions}
                    typeFilter={typeFilter}
                    setTypeFilter={setTypeFilter}
                    openMenuId={openFilterMenuId}
                    setOpenMenuId={setOpenFilterMenuId}
                 />
                 {dynamicFilterOptions.length > 0 && (
                    <FilterMenuGroup
                      id="dynamic"
                      title="Dynamic"
                      icon={BookText}
                      activeLabel={activeDynamicOption?.label || 'Select'}
                      options={dynamicFilterOptions}
                      typeFilter={typeFilter}
                      setTypeFilter={setTypeFilter}
                      openMenuId={openFilterMenuId}
                      setOpenMenuId={setOpenFilterMenuId}
                    />
                 )}
             </div>
        </div>
      </div>
  );

  const renderSideBySidePreview = (item: ResourceItem) => {
    const lesson = item.data as Lesson;

    if (item.type === 'INTENSITY') {
      return <IntensityTable rows={lesson.intensityRows || []} />;
    }
    if (item.type === 'COMPARISON') {
      return <ComparisonTable rows={lesson.comparisonRows || []} />;
    }
    if (item.type === 'MISTAKE') {
      return <MistakeTable rows={lesson.mistakeRows || []} />;
    }

    const html = parseMarkdown(lesson.content || '');
    return (
      <div
        className={PROSE_CLASS}
        dangerouslySetInnerHTML={{ __html: html || '<p class="text-neutral-400">No content yet.</p>' }}
      />
    );
  };

  return (
    <>
    <ResourcePage
      title="Knowledge Library"
      subtitle="Your collection of lessons and comparisons."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Notebook.png" className="w-8 h-8 object-contain" alt="Lessons" />}
      // Removed default search bar and replaced with custom QuickFilterBar in aboveGrid
      pagination={{ page, totalPages: Math.ceil(filteredResources.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredResources.length }}
      aboveGrid={<QuickFilterBar />}
      config={lessonConfig}
      activeFilters={{}}
      onFilterChange={() => {}}
      isLoading={loading}
      isEmpty={filteredResources.length === 0}
      emptyMessage="No items found matching your criteria."
      disableGrid={isSideBySideMode}
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
                        { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                        ...(canUseSideBySide ? [{ label: 'Side by Side', checked: !!viewSettings.sideBySide, onChange: () => setViewSettings((v: any) => ({ ...v, sideBySide: !v.sideBySide })) }] : [])
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
        isSideBySideMode ? (
          <div className={`hidden lg:grid gap-6 items-start transition-all ${isSideBySideCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
            {!isSideBySideCollapsed && (
            <div className="sticky top-6 self-start bg-white border border-neutral-200 rounded-[2rem] shadow-sm overflow-visible">
              <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Lesson Titles</h3>
              </div>
              <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden p-2 space-y-1">
                {pagedResources.map((item) => {
                  const lesson = item.data as Lesson;
                  const isActive = sideBySideLesson?.data.id === item.data.id;
                  return (
                    <div
                      key={`side-${item.data.id}`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredSidePreview({
                          lesson,
                          top: rect.top + rect.height / 2,
                          left: rect.right + 12
                        });
                      }}
                      onMouseLeave={() => setHoveredSidePreview((current) => (current?.lesson.id === lesson.id ? null : current))}
                      className={`group relative rounded-2xl transition-all ${isActive ? 'bg-neutral-900 text-white shadow-lg' : 'bg-white text-neutral-700 hover:bg-neutral-50 border border-transparent hover:border-neutral-200'}`}
                    >
                      <button
                        onClick={() => setSideBySideLessonId(item.data.id)}
                        className="w-full text-left px-4 py-3 pr-20"
                      >
                        <div className="truncate text-sm font-black leading-tight">{lesson.title || 'Untitled lesson'}</div>
                      </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSideBySideEditingLesson(lesson);
                          }}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                            isActive
                              ? 'bg-white/15 text-white hover:bg-white/25'
                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
                          }`}
                          title="Edit lesson"
                        >
                          Edit
                        </button>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            <div className="min-w-0 bg-white border border-neutral-200 rounded-[2.5rem] shadow-sm p-8 min-h-[70vh]">
              {sideBySideLesson ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-5">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Preview</p>
                      <h3 className="text-3xl font-black tracking-tight text-neutral-900">{sideBySideLesson.data.title}</h3>
                      {sideBySideLesson.data.description && (
                        <p className="max-w-3xl text-sm font-medium leading-relaxed text-neutral-500">{sideBySideLesson.data.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setViewSettings((prev: any) => ({ ...prev, sideBySideCollapsed: !prev.sideBySideCollapsed }))}
                        className="px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-50 hover:text-neutral-900 transition-all shadow-sm flex items-center gap-2"
                      >
                        {isSideBySideCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                        <span>{isSideBySideCollapsed ? 'Show Titles' : 'Collapse'}</span>
                      </button>
                      {isEditingSideContent ? (
                        <>
                          <button
                            onClick={() => {
                              setSideContentDraft(sideBySideLesson.data.content || '');
                              setIsEditingSideContent(false);
                            }}
                            disabled={isSavingSideContent}
                            className="p-3 bg-white border border-neutral-200 text-neutral-500 rounded-2xl hover:bg-neutral-50 hover:text-neutral-900 transition-all shadow-sm"
                            title="Cancel"
                          >
                            <X size={18} />
                          </button>
                          <button
                            onClick={handleSaveSideContent}
                            disabled={isSavingSideContent}
                            className="px-4 py-3 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-sm disabled:opacity-60 flex items-center gap-2"
                          >
                            <Save size={14} />
                            <span>{isSavingSideContent ? 'Saving' : 'Save'}</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setIsEditingSideContent(true)}
                          className="px-4 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-50 hover:text-neutral-900 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Edit3 size={14} />
                          <span>Edit Content</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {isEditingSideContent ? (
                    <textarea
                      value={sideContentDraft}
                      onChange={(e) => setSideContentDraft(e.target.value)}
                      className="min-h-[52vh] w-full resize-none rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 font-mono text-sm leading-relaxed text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                      placeholder="Write lesson content here..."
                      spellCheck={false}
                    />
                  ) : (
                    renderSideBySidePreview(sideBySideLesson)
                  )}
                </div>
              ) : (
                <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-neutral-400">
                  Select a lesson to preview.
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {pagedResources.map((item) => {
              const onRead = () => { setActiveLesson(item.data as Lesson); setViewMode('read_lesson'); };
              const onEdit = () => { setActiveLesson(item.data as Lesson); setViewMode('edit_lesson'); };
              const onDelete = () => setLessonToDelete(item.data as Lesson);

              const isIntensity = item.type === 'INTENSITY';
              const isComparison = item.type === 'COMPARISON';
              const isMistake = item.type === 'MISTAKE';
              const knowledgeType = (item.data.knowledgeType || '').trim();

              let badge;
              if (isIntensity) {
                  badge = { label: 'Scale', colorClass: 'bg-orange-50 text-orange-700 border-orange-100', icon: Scale };
              } else if (isComparison) {
                  badge = { label: 'Diff', colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: FileDiff };
              } else if (isMistake) {
                  badge = { label: 'Mistake', colorClass: 'bg-rose-50 text-rose-700 border-rose-100', icon: AlertTriangle };
              } else if (knowledgeType) {
                  badge = { label: knowledgeType, colorClass: 'bg-sky-50 text-sky-700 border-sky-100', icon: BookText };
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
        )
      )}
    </ResourcePage>
    {isSideBySideMode && hoveredSidePreview && (
      <div
        className="pointer-events-none fixed z-[160] w-72 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl"
        style={{ top: hoveredSidePreview.top, left: hoveredSidePreview.left }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 border border-emerald-100">
            Lesson
          </span>
        </div>
        <p className="text-sm font-black text-neutral-900 leading-snug">{hoveredSidePreview.lesson.title || 'Untitled lesson'}</p>
        {hoveredSidePreview.lesson.description ? (
          <p className="mt-2 text-xs font-medium leading-relaxed text-neutral-600">{hoveredSidePreview.lesson.description}</p>
        ) : (
          <p className="mt-2 text-xs italic text-neutral-400">No description</p>
        )}
      </div>
    )}
    {sideBySideEditingLesson && (
      <div className="fixed inset-0 z-[220] flex items-start justify-center bg-neutral-950/45 px-4 py-6 backdrop-blur-sm">
        <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-2xl">
          <button
            onClick={() => setSideBySideEditingLesson(null)}
            className="sticky top-0 z-10 ml-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-500 shadow-sm transition-all hover:bg-neutral-50 hover:text-neutral-900"
            title="Close edit modal"
          >
            <X size={18} />
          </button>
          <LessonEditView
            lesson={sideBySideEditingLesson}
            user={user}
            onSave={handleSaveSideBySideLesson}
            onPractice={(lesson) => {
              setSideBySideEditingLesson(null);
              setActiveLesson(lesson);
              setViewMode('read_lesson');
            }}
            onCancel={() => setSideBySideEditingLesson(null)}
          />
        </div>
      </div>
    )}
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
