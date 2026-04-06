
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Unit, StudyItem, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { Edit3, Trash2, BookOpen, Plus, Sparkles, FolderTree, Tag, Target, Download, ExternalLink, X } from 'lucide-react';
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
import { getConfig, getServerUrl } from '../../app/settingsManager';

interface Props {
  user: User;
  onStartSession: (words: StudyItem[]) => void;
  onUpdateUser: (user: User) => Promise<void>;
}

const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
const VIEW_SETTINGS_KEY = 'vocab_pro_reading_view_settings';

export const ReadingUnitPage: React.FC<Props> = ({ user, onStartSession, onUpdateUser }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [allWords, setAllWords] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // View State
  const [viewMode, setViewMode] = useState<'LIST' | 'READ' | 'EDIT'>('LIST');
  const [activeUnit, setActiveUnit] = useState<Unit | null>(null);
  
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  const [showRefineAiModal, setShowRefineAiModal] = useState(false);
  const [showServerUnitSelector, setShowServerUnitSelector] = useState(false);
  const [showServerFileSelector, setShowServerFileSelector] = useState(false);
  const [showUrlImporter, setShowUrlImporter] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importUrlError, setImportUrlError] = useState<string | null>(null);
  const [pendingImportData, setPendingImportData] = useState<{ title: string; essay: string; description: string } | null>(null);
  const [needsReaderConfirm, setNeedsReaderConfirm] = useState(false);
  
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
  const serverUrl = getServerUrl(getConfig());

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userUnits, userWords] = await Promise.all([
        db.getUnitsByUserId(user.id),
        db.getAllWordsForExport(user.id)
      ]);
      const sorted = userUnits.sort((a,b) => b.createdAt - a.createdAt);
      setUnits(sorted);
      setAllWords(userWords);
      return sorted;
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  const refreshActiveUnit = useCallback(async () => {
    const sorted = await loadData();
    if (activeUnit) {
      const updated = sorted.find(u => u.id === activeUnit.id);
      if (updated) {
        setActiveUnit(updated);
      }
    }
    return sorted;
  }, [activeUnit, loadData]);

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

  const resetUrlImportState = () => {
    setImportUrl('');
    setImportUrlError(null);
    setPendingImportData(null);
    setNeedsReaderConfirm(false);
    setIsImportingUrl(false);
  };

  const openUrlImporter = () => {
    resetUrlImportState();
    setShowUrlImporter(true);
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
      } catch {
          showToast("Failed to save imported unit.", "error");
      }
  };

  const handleImportLinkedFileFromServer = async (essayFile: any) => {
      if (!essayFile) {
          showToast("Please choose a main reading file.", "error");
          return;
      }

      const essayTitle = String(essayFile.fileName || 'Imported Essay').replace(/\.[^/.]+$/, '');

      const newUnit: Unit = {
          id: generateId(),
          userId: user.id,
          name: essayTitle,
          description: "Imported from server files.",
          wordIds: [],
          customVocabString: '',
          essay: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          path: '/',
          readingSourceType: 'server_file_pair',
          essayFileLink: {
              mapName: essayFile.mapName,
              relativePath: essayFile.relativePath,
              fileName: essayFile.fileName,
              extension: essayFile.extension
          }
      };

      try {
          await dataStore.saveUnit(newUnit);
          showToast(`Imported "${newUnit.name}" successfully!`, 'success');
          await loadData();
          setActiveUnit(newUnit);
          setViewMode('READ');
      } catch {
          showToast("Failed to save imported file.", "error");
      }
  };

  const handleImportFromUrl = async () => {
      if (!importUrl.trim()) {
          setImportUrlError('Please enter a URL to import.');
          return;
      }
      setImportUrlError(null);
      setIsImportingUrl(true);

      try {
          const encoded = encodeURIComponent(importUrl.trim());
          const response = await fetch(`${serverUrl}/api/reading/from-url?url=${encoded}`);
          if (!response.ok) {
              const errMsg = await response.text();
              throw new Error(errMsg || 'Failed to fetch article');
          }
          const data = await response.json();

          const payload = {
              title: data.title || 'Imported Article',
              essay: data.essay || data.content || '',
              description: `Imported from ${importUrl.trim()}`
          };

          if (data.readerAvailable === false) {
              setPendingImportData(payload);
              setNeedsReaderConfirm(true);
              setImportUrlError('Reader-mode content was not detected. Confirm to proceed.');
              setIsImportingUrl(false);
              return;
          }

          await finalizeUrlImport(payload);
      } catch (e) {
          console.error(e);
          showToast('Failed to import article from URL.', 'error');
          if (typeof e === 'object' && e && 'message' in e) {
              setImportUrlError((e as any).message);
          }
      } finally {
          setIsImportingUrl(false);
      }
  };

  const finalizeUrlImport = async (payload: { title: string; essay: string; description: string }) => {
      const newUnit: Unit = {
          id: generateId(),
          userId: user.id,
          name: payload.title,
          description: payload.description,
          wordIds: [],
          customVocabString: '',
          essay: payload.essay,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          path: '/'
      };

      await dataStore.saveUnit(newUnit);
      showToast(`Imported "${newUnit.name}" successfully!`, 'success');
      await loadData();
      setActiveUnit(newUnit);
      setViewMode('EDIT');
      resetUrlImportState();
      setShowUrlImporter(false);
  };

  const handleConfirmReaderImport = async () => {
      if (!pendingImportData) return;
      await finalizeUrlImport(pendingImportData);
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

  const handlePostEditSave = async () => {
      const refreshedUnits = await loadData();
      if (activeUnit) {
          const updatedUnit = refreshedUnits?.find(u => u.id === activeUnit.id);
          setActiveUnit(updatedUnit || activeUnit);
      }
      setViewMode('READ');
  };
  
  // --- Render Views ---

  if (viewMode === 'READ' && activeUnit) {
      return <ReadingStudyView user={user} unit={activeUnit} allWords={allWords} onBack={() => { 
          setViewMode('LIST'); 
          setActiveUnit(null); 
          loadData(); 
      }} onDataChange={refreshActiveUnit} onStartSession={onStartSession} onSwitchToEdit={() => setViewMode('EDIT')} onUpdateUser={onUpdateUser} />;
  }

  if (viewMode === 'EDIT' && activeUnit) {
      const allTags = [...new Set(units.flatMap(u => u.tags || []))].sort();
      return <ReadingEditView user={user} unit={activeUnit} allWords={allWords} allLibraryTags={allTags} onCancel={() => { 
          if (activeUnit.name === "New Unit" && !activeUnit.essay && activeUnit.wordIds.length === 0) { db.deleteUnit(activeUnit.id); } 
          setViewMode('LIST'); 
          setActiveUnit(null); 
          loadData(); 
      }} onSave={handlePostEditSave} />;
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
                    { label: 'Add File from Server', icon: Download, onClick: () => setShowServerFileSelector(true) },
                    { label: 'Import Unit from Server', icon: Download, onClick: () => setShowServerUnitSelector(true) },
                    { label: 'Add from URL', icon: ExternalLink, onClick: openUrlImporter },
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
        message={<>Are you sure you want to delete <strong>&quot;{unitToDelete?.name}&quot;</strong>?</>}
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
          isOpen={showServerUnitSelector}
          onClose={() => setShowServerUnitSelector(false)}
          onSelect={handleImportFromServer}
          type="reading"
          title="Import Reading from Server"
      />
      <FileSelector 
          isOpen={showServerFileSelector}
          onClose={() => setShowServerFileSelector(false)}
          onSelect={handleImportLinkedFileFromServer}
          type="reading_file"
          title="Add File from Server"
      />
      {showUrlImporter && (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-2xl p-6 w-full max-w-lg space-y-4">
                  <div className="flex items-center justify-between">
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">URL Import</p>
                          <h3 className="text-lg font-bold text-neutral-900">Add Reading from URL</h3>
                      </div>
                      <button className="p-2 text-neutral-400 hover:text-neutral-900" onClick={() => { setShowUrlImporter(false); resetUrlImportState(); }}>
                          <X size={18} />
                      </button>
                  </div>
                  <p className="text-sm text-neutral-500">Paste the public article URL and we&apos;ll extract the reading content for a new unit.</p>
                  <input
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://example.com/long-read"
                      className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
                  />
                  {importUrlError && <p className="text-xs text-rose-600">{importUrlError}</p>}
                  {needsReaderConfirm && (
                      <p className="text-xs text-amber-600">Reader-mode content was not detected. The fetched text may be messy—confirm to import anyway.</p>
                  )}
                  <div className="flex justify-end gap-3">
                      <button
                          onClick={() => { setShowUrlImporter(false); resetUrlImportState(); }}
                          className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-600 text-xs font-black uppercase tracking-widest hover:bg-neutral-50"
                      >
                          Cancel
                      </button>
                      {needsReaderConfirm ? (
                          <button
                              onClick={handleConfirmReaderImport}
                              className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-black uppercase tracking-widest transition-all hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                          >
                              Import Anyway
                          </button>
                      ) : (
                          <button
                              onClick={handleImportFromUrl}
                              disabled={isImportingUrl}
                              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest transition-all hover:bg-indigo-500 disabled:opacity-50"
                          >
                              {isImportingUrl ? 'Importing...' : 'Import Reading'}
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}
    </>
  );
};
