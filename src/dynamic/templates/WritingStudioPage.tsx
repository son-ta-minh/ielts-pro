
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Composition, VocabularyItem, WritingTopic, WritingLog, CompositionLabel, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { PenLine, Plus, Edit3, Trash2, BookOpen, Swords, Play, Sparkles, Loader2, Save, ArrowLeft, Tag, Layers, FolderTree, Target, Library, FolderPlus, Pen, Move, Book, LayoutGrid } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { CompositionEditor } from './CompositionEditor';
import { WritingSession } from './WritingSession';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getRefineWritingTopicPrompt, getFullWritingTestPrompt } from '../../services/promptService';
import { TagBrowser, TagTreeNode } from '../../components/common/TagBrowser';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { ResourceActions } from '../page/ResourceActions';
import { UniversalBook } from '../../components/common/UniversalBook';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { FileSelector } from '../../components/common/FileSelector';

interface Props {
  user: User;
  initialContextWord?: VocabularyItem | null;
  onConsumeContext?: () => void;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_writing_view_settings';

// --- Helper: Topic Editor Inline ---
const TopicEditor: React.FC<{ user: User, topic: WritingTopic, onSave: () => void, onCancel: () => void }> = ({ user, topic, onSave, onCancel }) => {
    const [name, setName] = useState(topic.name);
    const [description, setDescription] = useState(topic.description);
    const [task1, setTask1] = useState(topic.task1);
    const [task2, setTask2] = useState(topic.task2);
    const [path, setPath] = useState('/');
    const [tagsInput, setTagsInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        if (topic.path === undefined) {
            const legacyTags = topic.tags || [];
            const pathFromTags = legacyTags.find(t => t.startsWith('/'));
            const singleTags = legacyTags.filter(t => !t.startsWith('/'));
            setPath(pathFromTags || '/');
            setTagsInput(singleTags.join(', '));
        } else {
            setPath(topic.path || '/');
            setTagsInput((topic.tags || []).join(', '));
        }
    }, [topic]);
  
    const handleSave = async () => {
      setIsSaving(true);
      const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
  
      const updatedTopic: WritingTopic = {
        ...topic,
        name: name.trim() || 'Untitled Topic',
        description: description.trim(),
        task1: task1.trim(),
        task2: task2.trim(),
        path: path.trim(),
        tags: finalTags,
        updatedAt: Date.now()
      };
      await dataStore.saveWritingTopic(updatedTopic);
      showToast('Topic saved!', 'success');
      setIsSaving(false);
      onSave();
    };
    
    const handleGeneratePrompt = (inputs: { request: string }) => {
      const currentTopicState = { ...topic, name, description, task1, task2, tags: tagsInput.split(',').map(t=>t.trim()) };
      return getRefineWritingTopicPrompt(currentTopicState, inputs.request, user);
    }
  
    const handleAiResult = (data: { name: string; description: string; task1: string; task2: string }) => {
      setName(data.name);
      setDescription(data.description);
      setTask1(data.task1);
      setTask2(data.task2);
      showToast('AI refinement applied!', 'success');
      setIsAiModalOpen(false);
    }
  
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <button onClick={onCancel} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors mb-1">
              <ArrowLeft size={16} /><span>Back to Library</span>
            </button>
            <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><PenLine size={28}/> Edit Topic</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsAiModalOpen(true)} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all">
              <Sparkles size={14} className="text-amber-500"/><span>AI Refine</span>
            </button>
            <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </header>
        
        <div className="space-y-6 bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Topic Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"/>
            </div>
          </div>

          <div className="space-y-1">
             <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-2"><Tag size={12}/> Tags (Keywords)</label>
             <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. Environment, Technology" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"/>
          </div>
  
          <div className="space-y-1">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Task 1 Prompt</label>
            <textarea value={task1} onChange={(e) => setTask1(e.target.value)} rows={6} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 outline-none font-medium"/>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Task 2 Prompt</label>
            <textarea value={task2} onChange={(e) => setTask2(e.target.value)} rows={6} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 outline-none font-medium"/>
          </div>
        </div>

        {isAiModalOpen && (
            <UniversalAiModal 
                isOpen={isAiModalOpen}
                onClose={() => setIsAiModalOpen(false)}
                type="REFINE_UNIT" 
                title="Refine Writing Topic"
                description="Let AI improve or generate tasks for your topic."
                onGeneratePrompt={handleGeneratePrompt}
                onJsonReceived={handleAiResult}
            />
        )}
      </div>
    );
};


export const WritingStudioPage: React.FC<Props> = ({ user, initialContextWord, onConsumeContext }) => {
    const [compositions, setCompositions] = useState<Composition[]>([]);
    const [topics, setTopics] = useState<WritingTopic[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    // Filters & View State
    const [resourceType, setResourceType] = useState<'COMPOSITIONS' | 'TOPICS'>('COMPOSITIONS');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
        showDetails: true,
        compact: false
    }));

    const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

    // Pagination
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(12);
    
    // View Routing
    const [viewMode, setViewMode] = useState<'LIST' | 'EDIT_COMP' | 'EDIT_TOPIC' | 'SESSION'>('LIST');
    const [activeComposition, setActiveComposition] = useState<Composition | null>(null);
    const [activeTopic, setActiveTopic] = useState<WritingTopic | null>(null);

    const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'COMP' | 'TOPIC' } | null>(null);
    
    // AI Generators
    const [isTestGenModalOpen, setIsTestGenModalOpen] = useState(false);
    
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [userComps, userTopics] = await Promise.all([
                db.getCompositionsByUserId(user.id),
                db.getWritingTopicsByUserId(user.id)
            ]);
            setCompositions(userComps.sort((a, b) => b.createdAt - a.createdAt));
            setTopics(userTopics.sort((a, b) => b.createdAt - a.createdAt));
        } finally {
            setLoading(false);
        }
    }, [user.id]);

    useEffect(() => { loadData(); }, [loadData]);
    
    useEffect(() => {
        setPage(0);
    }, [resourceType, selectedTag, pageSize, focusFilter, colorFilter, searchQuery]);

    useEffect(() => {
        if (initialContextWord) {
            setActiveComposition({
                id: '', userId: user.id, title: '', label: 'Free Write', content: initialContextWord.word + ' ',
                linkedWordIds: [initialContextWord.id], createdAt: Date.now(), updatedAt: Date.now()
            });
            setViewMode('EDIT_COMP');
            if (onConsumeContext) onConsumeContext();
        }
    }, [initialContextWord, onConsumeContext, user.id]);

    const hasActiveFilters = useMemo(() => {
        return resourceType !== 'COMPOSITIONS' || focusFilter !== 'all' || colorFilter !== 'all';
    }, [resourceType, focusFilter, colorFilter]);

    const allItemsForTagging = useMemo(() => {
        return resourceType === 'COMPOSITIONS' ? compositions : topics;
    }, [compositions, topics, resourceType]);

    const filteredItems = useMemo(() => {
        let items = (resourceType === 'COMPOSITIONS' ? compositions : topics) as (Composition | WritingTopic)[];
        const q = searchQuery.toLowerCase().trim();

        // Apply Focus & Color Filters
        items = items.filter((item) => {
             // Text Search
             if (q) {
                 if ('content' in item) { // Composition
                     if (!(item.title || '').toLowerCase().includes(q) && !item.content.toLowerCase().includes(q)) return false;
                 } else { // Topic
                     if (!item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false;
                 }
             }

             if (focusFilter === 'focused' && !item.isFocused) return false;
             if (colorFilter !== 'all' && item.focusColor !== colorFilter) return false;
             return true;
        });

        if (selectedTag) {
            if (selectedTag === 'Uncategorized') {
                return items.filter((item) => {
                    const path = item.path ?? (item.tags || []).find((t) => t.startsWith('/'));
                    const hasPath = path && path !== '/';
                    return !hasPath;
                });
            }
            return items.filter((item) => item.path?.startsWith(selectedTag) || item.tags?.includes(selectedTag));
        }
        return items;
    }, [compositions, topics, resourceType, selectedTag, focusFilter, colorFilter, searchQuery]);
    
    const pagedItems = useMemo(() => {
        const start = page * pageSize;
        return filteredItems.slice(start, start + pageSize);
    }, [filteredItems, page, pageSize]);

    const handleNew = () => {
        if (resourceType === 'COMPOSITIONS') {
            setActiveComposition(null);
            setViewMode('EDIT_COMP');
        } else {
             const newTopic: WritingTopic = { id: `wrt-${Date.now()}`, userId: user.id, name: 'New Topic', description: '', task1: '', task2: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() };
             setActiveTopic(newTopic);
             setViewMode('EDIT_TOPIC');
        }
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        if (itemToDelete.type === 'COMP') {
            await dataStore.deleteComposition(itemToDelete.id, user.id);
        } else {
            await dataStore.deleteWritingTopic(itemToDelete.id);
        }
        showToast("Item deleted.", "success");
        setItemToDelete(null);
        loadData();
    };

    const handleGenerateTest = async (data: any) => {
        setIsTestGenModalOpen(false);
        try {
            if (data && data.topic && data.task1 && data.task2) {
                const newTopic: WritingTopic = {
                    id: `wrt-gen-${Date.now()}`, userId: user.id, name: `Mock: ${data.topic}`, description: `Full test generated on ${data.topic}.`,
                    task1: data.task1, task2: data.task2, tags: ['Mock Test', 'Generated'],
                    createdAt: Date.now(), updatedAt: Date.now()
                };
                await dataStore.saveWritingTopic(newTopic);
                await loadData();
                showToast("Test generated successfully!", "success");
                setActiveTopic(newTopic);
                setViewMode('SESSION');
            } else {
                 throw new Error("Invalid response");
            }
        } catch (e) {
            showToast("Failed to generate test.", "error");
        }
    };
    
    const handleFocusChange = async (item: Composition | WritingTopic, color: FocusColor | null) => {
         const updated = { ...item, focusColor: color || undefined, updatedAt: Date.now() };
         if (!color) delete updated.focusColor;
         
         if ('content' in item) { // Composition
             setCompositions(prev => prev.map(c => c.id === item.id ? updated as Composition : c));
             await dataStore.saveComposition(updated as Composition);
         } else { // Topic
             setTopics(prev => prev.map(t => t.id === item.id ? updated as WritingTopic : t));
             await dataStore.saveWritingTopic(updated as WritingTopic);
         }
    };

    const handleToggleFocus = async (item: Composition | WritingTopic) => {
         const updated = { ...item, isFocused: !item.isFocused, updatedAt: Date.now() };
         
         if ('content' in item) { // Composition
             setCompositions(prev => prev.map(c => c.id === item.id ? updated as Composition : c));
             await dataStore.saveComposition(updated as Composition);
         } else { // Topic
             setTopics(prev => prev.map(t => t.id === item.id ? updated as WritingTopic : t));
             await dataStore.saveWritingTopic(updated as WritingTopic);
         }
    };

    // --- Render Views ---

    if (viewMode === 'EDIT_COMP') {
        return <CompositionEditor user={user} initialComposition={activeComposition} onSave={() => { setViewMode('LIST'); loadData(); }} onCancel={() => setViewMode('LIST')} />;
    }
    if (viewMode === 'EDIT_TOPIC' && activeTopic) {
        return <TopicEditor user={user} topic={activeTopic} onSave={() => { setViewMode('LIST'); loadData(); }} onCancel={() => setViewMode('LIST')} />;
    }
    if (viewMode === 'SESSION' && activeTopic) {
        return <WritingSession user={user} topic={activeTopic} onComplete={() => { setViewMode('LIST'); loadData(); }} />;
    }

    return (
        <>
        <ResourcePage
            title="Writing Library"
            subtitle="Practice writing and track vocabulary usage."
            icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Memo.png" className="w-8 h-8 object-contain" alt="Writing" />}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            searchPlaceholder="Search writings or topics..."
            config={{}}
            activeFilters={{}}
            onFilterChange={() => {}}
            isLoading={loading}
            isEmpty={filteredItems.length === 0}
            emptyMessage="No items found."
            pagination={{ page, totalPages: Math.ceil(filteredItems.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredItems.length }}
            aboveGrid={
                <>
                    {isTagBrowserOpen && <TagBrowser items={allItemsForTagging} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
                </>
            }
            minorSkills={
                resourceType === 'TOPICS' && (
                    <button onClick={() => setIsTestGenModalOpen(true)} className="px-5 py-3 bg-white border border-neutral-200 text-indigo-600 rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-50 active:scale-95 uppercase tracking-widest shadow-sm">
                        <Swords size={16} /><span>Generate Test</span>
                    </button>
                )
            }
            actions={
                <ResourceActions
                    viewMenu={
                        <ViewMenu 
                            isOpen={isViewMenuOpen}
                            setIsOpen={setIsViewMenuOpen}
                            hasActiveFilters={hasActiveFilters}
                            filterOptions={[
                                { label: 'Writings', value: 'COMPOSITIONS', isActive: resourceType === 'COMPOSITIONS', onClick: () => { setResourceType('COMPOSITIONS'); setSelectedTag(null); } },
                                { label: 'Topics', value: 'TOPICS', isActive: resourceType === 'TOPICS', onClick: () => { setResourceType('TOPICS'); setSelectedTag(null); } },
                            ]}
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
                                { label: 'Show Details', checked: viewSettings.showDetails, onChange: () => setViewSettings(v => ({...v, showDetails: !v.showDetails})) },
                                { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                            ]}
                        />
                    }
                    browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }}
                    addActions={[{ label: 'Add', icon: Plus, onClick: handleNew }]}
                />
            }
        >
            {() => (
                <>
                    {resourceType === 'COMPOSITIONS' ? (
                        (pagedItems as any[]).map(comp => {
                             const effectiveTags = comp.tags || (comp.label ? [comp.label] : []);
                             return (
                                <UniversalCard
                                    key={comp.id}
                                    title={comp.title || 'Untitled Composition'}
                                    tags={effectiveTags}
                                    compact={viewSettings.compact}
                                    onClick={() => { setActiveComposition(comp); setViewMode('EDIT_COMP'); }}
                                    focusColor={comp.focusColor}
                                    onFocusChange={(c) => handleFocusChange(comp, c)}
                                    isFocused={comp.isFocused}
                                    onToggleFocus={() => handleToggleFocus(comp)}
                                    isCompleted={comp.focusColor === 'green'}
                                    actions={
                                        <>
                                            <button onClick={(e) => { e.stopPropagation(); setActiveComposition(comp); setViewMode('EDIT_COMP'); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                            <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: comp.id, type: 'COMP' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                                        </>
                                    }
                                    footer={comp.linkedWordIds.length > 0 && (<div className="text-[10px] font-bold text-neutral-400">{comp.linkedWordIds.length} words linked</div>)}
                                >
                                    {viewSettings.showDetails && <p className="line-clamp-4">{comp.content}</p>}
                                </UniversalCard>
                             );
                        })
                    ) : (
                        (pagedItems as any[]).map(topic => (
                            <UniversalCard
                                key={topic.id}
                                title={topic.name} tags={topic.tags}
                                compact={viewSettings.compact}
                                onClick={() => { setActiveTopic(topic); setViewMode('SESSION'); }}
                                focusColor={topic.focusColor}
                                onFocusChange={(c) => handleFocusChange(topic, c)}
                                isFocused={topic.isFocused}
                                onToggleFocus={() => handleToggleFocus(topic)}
                                isCompleted={topic.focusColor === 'green'}
                                actions={
                                    <>
                                        <button onClick={(e) => { e.stopPropagation(); setActiveTopic(topic); setViewMode('SESSION'); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Practice"><Play size={14}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); setActiveTopic(topic); setViewMode('EDIT_TOPIC'); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: topic.id, type: 'TOPIC' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                                    </>
                                }
                            >
                                {viewSettings.showDetails && <p className="line-clamp-2">{topic.description || 'No description.'}</p>}
                            </UniversalCard>
                        ))
                    )}
                </>
            )}
        </ResourcePage>
        
        <ConfirmationModal
            isOpen={!!itemToDelete} title="Delete Item?" message="This action cannot be undone." confirmText="Delete" isProcessing={false}
            onConfirm={handleDelete} onClose={() => setItemToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>}
        />
        
        {isTestGenModalOpen && (
            <UniversalAiModal 
                isOpen={isTestGenModalOpen} onClose={() => setIsTestGenModalOpen(false)} type="REFINE_UNIT" title="Generate Full Test"
                description="Enter a theme (e.g. 'Environment', 'Technology') to generate a full Task 1 & 2 test."
                initialData={{ request: '' }} onGeneratePrompt={(inputs) => getFullWritingTestPrompt(inputs.request || 'Random')} onJsonReceived={handleGenerateTest} actionLabel="Generate"
            />
        )}
        </>
    );
};

export default WritingStudioPage;
