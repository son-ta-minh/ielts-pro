
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Unit, VocabularyItem, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { Edit3, Trash2, BookOpen, Plus, Sparkles, FolderTree, Tag, Target, Download, Search } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import ReadingStudyView from './ReadingStudyView';
import ReadingEditView from './ReadingEditView';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getRefineUnitPrompt } from '../../services/promptService';
import { ResourcePage } from '../page/ResourcePage';
import { ResourceActions } from '../page/ResourceActions';
import { ViewMenu } from '../../components/common/ViewMenu';
import { TagBrowser } from '../../components/common/TagBrowser';
import { UniversalCard } from '../../components/common/UniversalCard';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { FileSelector } from '../../components/common/FileSelector';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[]) => void;
  onUpdateUser: (user: User) => Promise<void>;
}

const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
const VIEW_SETTINGS_KEY = 'vocab_pro_reading_view_settings';

export const ReadingUnitPage: React.FC<Props> = ({ user, onStartSession, onUpdateUser }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // View State
  const [viewMode, setViewMode] = useState<'LIST' | 'READ' | 'EDIT'>('LIST');
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  const [showRefineAiModal, setShowRefineAiModal] = useState(false);
  const [showFileSelector, setShowFileSelector] = useState(false);
  
  // List View Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showDesc: true, compact: false }));
  
  const { showToast } = useToast();

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userUnits, userWords] = await Promise.all([
        db.getUnitsByUserId(user.id),
        db.getAllWordsForExport(user.id)
      ]);
      setUnits(userUnits.sort((a,b) => b.createdAt - a.createdAt));
      setAllWords(userWords);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(0); }, [selectedTag, focusFilter, colorFilter, pageSize, searchQuery]);

  const hasActiveFilters = useMemo(() => {
    return focusFilter !== 'all' || colorFilter !== 'all';
  }, [focusFilter, colorFilter]);

  // --- Logic for List View ---
  const filteredUnits = useMemo(() => {
      const q = searchQuery.toLowerCase().trim();
      return units.filter(u => {
          if (q) {
              const matchName = u.name.toLowerCase().includes(q);
              const matchDesc = (u.description || '').toLowerCase().includes(q);
              if (!matchName && !matchDesc) return false;
          }

          if (focusFilter === 'focused' && !u.isFocused) return false;
          if (colorFilter !== 'all' && u.focusColor !== colorFilter) return false;
          
          if (selectedTag) {
              if (selectedTag === 'Uncategorized') {
                  const path = u.path;
                  const hasPath = path && path !== '/' && path !== '';
                  return !hasPath;
              }
              return u.path?.startsWith(selectedTag) || u.tags?.includes(selectedTag);
          }
          return true;
      });
  }, [units, selectedTag, focusFilter, colorFilter, searchQuery]);

  const pagedUnits = useMemo(() => {
      const start = page * pageSize;
      return filteredUnits.slice(start, start + pageSize);
  }, [filteredUnits, page, pageSize]);

  // --- Handlers for Unit Management (List View) ---

  const handleCreateEmptyUnit = async () => {
    const newUnit: Unit = { 
        id: generateId(), 
        userId: user.id, 
        name: "New Unit", 
        description: "", 
        wordIds: [], 
        createdAt: Date.now(), 
        updatedAt: Date.now(), 
        essay: "",
        path: '/'
    };
    await dataStore.saveUnit(newUnit);
    await loadData();
    setActiveUnit(newUnit);
    setViewMode('EDIT');
  };

  const handleImportFromServer = async (fileData: any) => {
      // fileData contains { title, essay, words, description } from server
      const newUnit: Unit = { 
          id: generateId(), 
          userId: user.id, 
          name: fileData.title || "Imported Unit", 
          description: fileData.description || "Imported from server.",
          wordIds: [], 
          customVocabString: fileData.words || '',
          essay: fileData.essay || '',
          createdAt: Date.now(), 
          updatedAt: Date.now(),
          path: '/' // Could try to use mapName as path if passed, but simpler to default
      };
      
      try {
          await dataStore.saveUnit(newUnit);
          showToast(`Imported "${newUnit.name}" successfully!`, 'success');
          await loadData();
          setActiveUnit(newUnit);
          setViewMode('EDIT');
      } catch (e) {
          showToast("Failed to save imported unit.", "error");
      }
  };

  const handleDeleteUnit = async () => {
      if (!unitToDelete) return;
      await db.deleteUnit(unitToDelete.id);
      showToast('Unit deleted.', 'success');
      setUnitToDelete(null);
      loadData();
  };

  const handleFocusChange = async (unit: Unit, color: FocusColor | null) => {
      const newData = { ...unit, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete newData.focusColor;
      setUnits(prev => prev.map(u => u.id === unit.id ? newData : u));
      await dataStore.saveUnit(newData);
  };
  
  const handleToggleFocus = async (unit: Unit) => {
      const newData = { ...unit, isFocused: !unit.isFocused, updatedAt: Date.now() };
      setUnits(prev => prev.map(u => u.id === unit.id ? newData : u));
      await dataStore.saveUnit(newData);
  };
  
  // --- Render Views ---

  if (viewMode === 'READ' && activeUnit) {
      return <ReadingStudyView user={user} unit={activeUnit} allWords={allWords} onBack={() => { 
          setViewMode('LIST'); 
          setActiveUnit(null); 
          loadData(); 
      }} onDataChange={loadData} onStartSession={onStartSession} onSwitchToEdit={() => setViewMode('EDIT')} onUpdateUser={onUpdateUser} />;
  }

  if (viewMode === 'EDIT' && activeUnit) {
      const allTags = [...new Set(units.flatMap(u => u.tags || []))].sort();
      return <ReadingEditView user={user} unit={activeUnit} allWords={allWords} allLibraryTags={allTags} onCancel={() => { 
          if (activeUnit.name === "New Unit" && !activeUnit.essay && activeUnit.wordIds.length === 0) { db.deleteUnit(activeUnit.id); } 
          setViewMode('LIST'); 
          setActiveUnit(null); 
          loadData(); 
      }} onSave={() => { loadData(); setViewMode('READ'); }} />;
  }
  
  // --- List View (Default) ---
  return (
    <>
      <ResourcePage
        title="Reading Library"
        subtitle="Curated collections for intensive reading & vocab."
        icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Open%20Book.png" className="w-8 h-8 object-contain" alt="Reading" />}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        config={{}}
        isLoading={loading}
        isEmpty={filteredUnits.length === 0}
        emptyMessage="No reading units found."
        activeFilters={{}}
        onFilterChange={() => {}}
        pagination={{ page, totalPages: Math.ceil(filteredUnits.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredUnits.length }}
        aboveGrid={
            <>
                {isGroupBrowserOpen && <TagBrowser items={units} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="groups" title="Browse Groups" icon={<FolderTree size={16}/>} />}
                {isTagBrowserOpen && <TagBrowser items={units} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
            </>
        }
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
                browseGroups={{ isOpen: isGroupBrowserOpen, onToggle: () => { setIsGroupBrowserOpen(!isGroupBrowserOpen); setIsTagBrowserOpen(false); } }}
                browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); setIsGroupBrowserOpen(false); } }}
                addActions={[
                    { label: 'AI Unit', icon: Sparkles, onClick: () => setShowRefineAiModal(true) },
                    { label: 'Add from Server', icon: Download, onClick: () => setShowFileSelector(true) },
                    { label: 'New Unit', icon: Plus, onClick: handleCreateEmptyUnit }
                ]}
            />
        }
      >
        {() => (
            <>
                {pagedUnits.map(unit => (
                    <UniversalCard
                        key={unit.id}
                        title={unit.name}
                        tags={unit.tags}
                        compact={unit.isFocused || viewSettings.compact}
                        onClick={() => { setActiveUnit(unit); setViewMode('READ'); }}
                        focusColor={unit.focusColor}
                        onFocusChange={(c) => handleFocusChange(unit, c)}
                        isFocused={unit.isFocused}
                        onToggleFocus={() => handleToggleFocus(unit)}
                        isCompleted={unit.focusColor === 'green'}
                        actions={
                            <>
                                <button onClick={(e) => { e.stopPropagation(); setActiveUnit(unit); setViewMode('READ'); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setActiveUnit(unit); setViewMode('EDIT'); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setUnitToDelete(unit); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button>
                            </>
                        }
                    >
                        {viewSettings.showDesc && unit.description && <p className="line-clamp-2">{unit.description}</p>}
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
      
      {showRefineAiModal && (
        <UniversalAiModal 
            isOpen={showRefineAiModal} 
            onClose={() => setShowRefineAiModal(false)} 
            type="GENERATE_UNIT" 
            title="AI Reading Unit" 
            description="Generate a new reading unit from a topic." 
            initialData={{ request: '' }} 
            onGeneratePrompt={(inputs) => getRefineUnitPrompt("New Unit", "", "", "", inputs.request, user)} 
            onJsonReceived={async (data) => {
                const newUnit: Unit = { 
                    id: generateId(), 
                    userId: user.id, 
                    name: data.name, 
                    description: data.description, 
                    wordIds: [],
                    customVocabString: (data.words || []).join('; '),
                    essay: data.essay,
                    comprehensionQuestions: data.comprehensionQuestions || [],
                    createdAt: Date.now(), 
                    updatedAt: Date.now(),
                    path: '/'
                };
                await dataStore.saveUnit(newUnit);
                await loadData();
                setActiveUnit(newUnit);
                setViewMode('EDIT');
            }} 
            actionLabel="Generate" 
            closeOnSuccess={true} 
        />
      )}
      
      <FileSelector 
          isOpen={showFileSelector}
          onClose={() => setShowFileSelector(false)}
          onSelect={handleImportFromServer}
          type="reading"
          title="Import Reading from Server"
      />
    </>
  );
};
