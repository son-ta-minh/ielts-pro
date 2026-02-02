
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, Unit, VocabularyItem, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import { ResourcePage } from '../page/ResourcePage';
import { Layers3, Plus, Tag, Edit3, Trash2, BookOpen, CheckCircle2, Circle, FolderTree, Target } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { TagBrowser, TagTreeNode } from '../../components/common/TagBrowser';
import { ReadingStudyView } from './ReadingStudyView';
import ReadingEditView from './ReadingEditView';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { ResourceActions } from '../page/ResourceActions';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[]) => void;
  onUpdateUser: (user: User) => Promise<void>;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_reading_view';
const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

export const ReadingUnitPage: React.FC<Props> = ({ user, onStartSession, onUpdateUser }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // View & Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'learned' | 'new'>('all');
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
      showDesc: true,
      showWords: true,
      showStatus: true,
      compact: false
  }));

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  
  // Pagination State
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  // Routing
  const [viewMode, setViewMode] = useState<'LIST' | 'READ' | 'EDIT'>('LIST');
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  
  const { showToast } = useToast();

  const activeUnitRef = useRef(activeUnit);
  useEffect(() => { activeUnitRef.current = activeUnit; }, [activeUnit]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userUnits, userWords] = await Promise.all([
        db.getUnitsByUserId(user.id),
        db.getAllWordsForExport(user.id)
      ]);
      setUnits(userUnits.sort((a,b) => b.createdAt - a.createdAt));
      setAllWords(userWords);
      
      if (activeUnitRef.current) {
          const updated = userUnits.find(u => u.id === activeUnitRef.current?.id);
          if (updated) {
              setActiveUnit(updated);
          }
      }
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  
  useEffect(() => {
    setPage(0);
  }, [statusFilter, selectedTag, pageSize, focusFilter, colorFilter]);

  const allLibraryTags = useMemo(() => [...new Set(units.flatMap(u => u.tags || []))].sort(), [units]);

  const filteredUnits = useMemo(() => {
    let result = units;
    
    if (statusFilter === 'learned') result = result.filter(u => u.isLearned);
    if (statusFilter === 'new') result = result.filter(u => !u.isLearned);
    
    if (focusFilter === 'focused') result = result.filter(u => u.isFocused);
    if (colorFilter !== 'all') result = result.filter(u => u.focusColor === colorFilter);
    
    if (selectedTag) {
        if (selectedTag === 'Uncategorized') {
            result = result.filter(item => {
                const path = item.path ?? (item.tags || []).find(t => t.startsWith('/'));
                const hasPath = path && path !== '/';
                return !hasPath;
            });
        } else {
            result = result.filter(u => u.path?.startsWith(selectedTag) || u.tags?.includes(selectedTag));
        }
    }
    
    return result;
  }, [units, statusFilter, selectedTag, focusFilter, colorFilter]);
  
  const pagedUnits = useMemo(() => {
      const start = page * pageSize;
      return filteredUnits.slice(start, start + pageSize);
  }, [filteredUnits, page, pageSize]);

  const handleCreateEmptyUnit = async () => {
    const newUnit: Unit = { id: generateId(), userId: user.id, name: "New Unit", description: "", wordIds: [], createdAt: Date.now(), updatedAt: Date.now(), essay: "" };
    await db.saveUnit(newUnit);
    await loadData();
    setActiveUnit(newUnit);
    setViewMode('EDIT');
  };

  const handleDeleteUnit = async () => {
      if (!unitToDelete) return;
      await db.deleteUnit(unitToDelete.id);
      showToast('Unit deleted.', 'success');
      setUnitToDelete(null);
      loadData();
  };

  const toggleUnitStatus = async (unit: Unit) => {
      const updatedUnit = { ...unit, isLearned: !unit.isLearned, updatedAt: Date.now() };
      await db.saveUnit(updatedUnit);
      setUnits(prev => prev.map(u => u.id === unit.id ? updatedUnit : u));
      if (activeUnit && activeUnit.id === unit.id) {
          setActiveUnit(updatedUnit);
      }
      if (!unit.isLearned) {
          showToast(`"${unit.name}" marked as completed.`, 'success');
      }
  };
  
  const handleFocusChange = async (unit: Unit, color: FocusColor | null) => {
      const updatedUnit = { ...unit, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete updatedUnit.focusColor;
      // FIX: Changed 'i' to 'u' to fix 'Cannot find name i' error
      setUnits(prev => prev.map(u => u.id === unit.id ? updatedUnit : u));
      await db.saveUnit(updatedUnit);
  };
  
  const handleToggleFocus = async (unit: Unit) => {
      const updatedUnit = { ...unit, isFocused: !unit.isFocused, updatedAt: Date.now() };
      setUnits(prev => prev.map(u => u.id === unit.id ? updatedUnit : u));
      await db.saveUnit(updatedUnit);
  };
  
  if (viewMode === 'READ' && activeUnit) {
      return <ReadingStudyView user={user} unit={activeUnit} allWords={allWords} onBack={() => { setViewMode('LIST'); setActiveUnit(null); }} onDataChange={loadData} onStartSession={onStartSession} onSwitchToEdit={() => setViewMode('EDIT')} onUpdateUser={onUpdateUser} />;
  }

  if (viewMode === 'EDIT' && activeUnit) {
      return <ReadingEditView user={user} unit={activeUnit} allWords={allWords} allLibraryTags={allLibraryTags} onCancel={() => { if (activeUnit.name === "New Unit" && !activeUnit.essay && activeUnit.wordIds.length === 0) { db.deleteUnit(activeUnit.id); } setViewMode('LIST'); setActiveUnit(null); loadData(); }} onSave={() => { loadData(); setViewMode('READ'); }} />;
  }

  return (
    <>
      <ResourcePage
        title="Reading Library"
        subtitle="Curated collections for intensive reading & vocab."
        icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png" className="w-8 h-8 object-contain" alt="Reading" />}
        config={{}} 
        activeFilters={{}} 
        onFilterChange={() => {}}
        isLoading={loading}
        isEmpty={filteredUnits.length === 0}
        emptyMessage="No units found."
        pagination={{
            page,
            totalPages: Math.ceil(filteredUnits.length / pageSize),
            onPageChange: setPage,
            pageSize,
            onPageSizeChange: setPageSize,
            totalItems: filteredUnits.length
        }}
        actions={
            <ResourceActions
                viewMenu={
                    <ViewMenu 
                        isOpen={isViewMenuOpen} 
                        setIsOpen={setIsViewMenuOpen}
                        filterOptions={[
                            { label: 'All', value: 'all', isActive: statusFilter === 'all', onClick: () => setStatusFilter('all') },
                            { label: 'Active', value: 'new', isActive: statusFilter === 'new', onClick: () => setStatusFilter('new') },
                            { label: 'Done', value: 'learned', isActive: statusFilter === 'learned', onClick: () => setStatusFilter('learned') }
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
                            { label: 'Description', checked: viewSettings.showDesc, onChange: () => setViewSettings(s => ({...s, showDesc: !s.showDesc})) },
                            { label: 'Word Count', checked: viewSettings.showWords, onChange: () => setViewSettings(s => ({...s, showWords: !s.showWords})) },
                            { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(s => ({...s, compact: !s.compact})) }
                        ]}
                    />
                }
                browseGroups={{ isOpen: isGroupBrowserOpen, onToggle: () => { setIsGroupBrowserOpen(!isGroupBrowserOpen); setIsTagBrowserOpen(false); } }}
                browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); setIsGroupBrowserOpen(false); } }}
                addActions={[{ label: 'Add Unit', icon: Plus, onClick: handleCreateEmptyUnit }]}
            />
        }
        aboveGrid={
            <>
                {isGroupBrowserOpen && <TagBrowser items={units} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="groups" title="Browse Groups" icon={<FolderTree size={16}/>} />}
                {isTagBrowserOpen && <TagBrowser items={units} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
            </>
        }
      >
        {() => (
            <>
                {pagedUnits.map(unit => (
                    <UniversalCard
                        key={unit.id}
                        title={<span className="font-bold text-neutral-900 text-lg leading-tight line-clamp-2" title={unit.name}>{unit.name}</span>}
                        path={unit.path}
                        tags={unit.tags}
                        compact={viewSettings.compact}
                        onClick={() => { setActiveUnit(unit); setViewMode('READ'); }}
                        className={unit.isLearned ? "border-green-300 ring-1 ring-green-100 shadow-[0_4px_20px_-4px_rgba(34,197,94,0.15)]" : ""}
                        focusColor={unit.focusColor}
                        onFocusChange={(c) => handleFocusChange(unit, c)}
                        isFocused={unit.isFocused}
                        onToggleFocus={() => handleToggleFocus(unit)}
                        actions={
                            <>
                                <button onClick={(e) => { e.stopPropagation(); toggleUnitStatus(unit); }} className={`p-1.5 rounded-lg transition-colors ${unit.isLearned ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'}`} title={unit.isLearned ? "Mark as Incomplete" : "Mark as Completed"}>
                                    {unit.isLearned ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setActiveUnit(unit); setViewMode('READ'); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read">
                                    <BookOpen size={14}/>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setActiveUnit(unit); setViewMode('EDIT'); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit">
                                    <Edit3 size={14}/>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setUnitToDelete(unit); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                                    <Trash2 size={14}/>
                                </button>
                            </>
                        }
                    >
                         {viewSettings.showDesc && unit.description && <p className="text-sm text-neutral-500 mb-2 line-clamp-2">{unit.description}</p>}
                         {viewSettings.showWords && (
                            <div className="mt-2 text-xs font-bold text-neutral-400">
                                {unit.wordIds.length} words
                            </div>
                         )}
                    </UniversalCard>
                ))}
            </>
        )}
      </ResourcePage>
      
      <ConfirmationModal
        isOpen={!!unitToDelete}
        title="Delete Unit?"
        message={<>Are you sure you want to delete <strong>"{unitToDelete?.name}"</strong>?</>}
        confirmText="Delete"
        isProcessing={false}
        onConfirm={handleDeleteUnit}
        onClose={() => setUnitToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
      />
    </>
  );
};
