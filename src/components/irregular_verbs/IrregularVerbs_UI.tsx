import React, { useState, useEffect } from 'react';
import { IrregularVerb, VocabularyItem } from '../../app/types';
import { FileClock, Plus, Edit3, Trash2, Loader2, Save, X, Eye, Library, Wand2, CheckSquare, Square, Info, Play, BrainCircuit, Dices, Search, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import ConfirmationModal from '../common/ConfirmationModal';

interface AddEditVerbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (verb: { v1: string, v2: string, v3: string }) => void;
  initialData?: IrregularVerb | null;
}

const AddEditVerbModal: React.FC<AddEditVerbModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [v3, setV3] = useState('');

  useEffect(() => {
    if (isOpen) {
      setV1(initialData?.v1 || '');
      setV2(initialData?.v2 || '');
      setV3(initialData?.v3 || '');
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (v1.trim()) {
      // Enforcement of lowercase V1 as requested
      onSave({ v1: v1.trim().toLowerCase(), v2: v2.trim(), v3: v3.trim() });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Verb' : 'Add New Verb'}</h3>
            <p className="text-sm text-neutral-500">Define the principal parts of an irregular verb.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-neutral-500 mb-1">V1 (Base Form)</label>
            <input value={v1} onChange={e => setV1(e.target.value)} placeholder="e.g., go" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" required autoFocus/>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-500 mb-1">V2 (Past Simple)</label>
            <input value={v2} onChange={e => setV2(e.target.value)} placeholder="e.g., went" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-500 mb-1">V3 (Past Participle)</label>
            <input value={v3} onChange={e => setV3(e.target.value)} placeholder="e.g., gone" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" />
          </div>
        </main>
        {!initialData && (
            <div className="px-8 pb-4 -mt-2">
                <div className="flex items-start gap-3 p-3 bg-indigo-50/50 text-indigo-900 rounded-lg border border-indigo-100">
                    <Info size={16} className="shrink-0 mt-0.5 text-indigo-500" />
                    <p className="text-xs font-medium"><strong>Pro-tip:</strong> You only need to enter the V1 (base form). You can use "Refine with AI" on the main table to fill in V2 & V3 for multiple verbs at once.</p>
                </div>
            </div>
        )}
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Verb</button>
        </footer>
      </form>
    </div>
  );
};

const PracticeSetupModal: React.FC<{ isOpen: boolean, onClose: () => void, onStart: (mode: 'headword' | 'random') => void, count: number }> = ({ isOpen, onClose, onStart, count }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Start Practice</h3>
                        <p className="text-sm text-neutral-500">Choose a mode for the {count} selected verb(s).</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => onStart('headword')} className="p-6 bg-neutral-50 border-2 border-neutral-200 rounded-2xl text-left hover:border-neutral-900 hover:bg-white hover:shadow-lg transition-all group">
                        <BrainCircuit size={24} className="text-neutral-500 group-hover:text-neutral-900 mb-2"/>
                        <h4 className="font-bold">Test from V1</h4>
                        <p className="text-xs text-neutral-500">Recall V2 and V3 from the base form.</p>
                    </button>
                    <button onClick={() => onStart('random')} className="p-6 bg-neutral-50 border-2 border-neutral-200 rounded-2xl text-left hover:border-neutral-900 hover:bg-white hover:shadow-lg transition-all group">
                        <Dices size={24} className="text-neutral-500 group-hover:text-neutral-900 mb-2"/>
                        <h4 className="font-bold">Test Random Form</h4>
                        <p className="text-xs text-neutral-500">Recall the other two forms from a random V1, V2, or V3.</p>
                    </button>
                </main>
            </div>
        </div>
    );
};

interface IrregularVerbsUIProps {
  loading: boolean;
  verbs: IrregularVerb[];
  totalCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  isModalOpen: boolean;
  editingVerb: IrregularVerb | null;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isProcessing: boolean;
  libraryWords: Map<string, VocabularyItem>;
  onGlobalViewWord: (word: VocabularyItem) => void;
  onNew: () => void;
  onEdit: (verb: IrregularVerb) => void;
  onDelete: (verb: IrregularVerb) => void;
  onSave: (verb: { v1: string, v2: string, v3: string }) => void;
  onCloseModal: () => void;
  onBulkDelete: () => void;
  onAddToLibrary: () => void;
  onRefine: () => void;
  onPractice: () => void;
  isPracticeSetupOpen: boolean;
  onClosePracticeSetup: () => void;
  onStartPractice: (mode: 'headword' | 'random') => void;
  isAddPanelOpen: boolean;
  addInput: string;
  onAddInputChange: (value: string) => void;
  onBulkAdd: (withAI: boolean) => void;
}

export const IrregularVerbsUI: React.FC<IrregularVerbsUIProps> = (props) => {
  const { loading, verbs, totalCount, searchQuery, onSearchChange, page, pageSize, totalPages, onPageChange, isModalOpen, editingVerb, selectedIds, setSelectedIds, isProcessing, libraryWords, onGlobalViewWord, onNew, onEdit, onDelete, onSave, onCloseModal, onBulkDelete, onAddToLibrary, onRefine, onPractice, isPracticeSetupOpen, onClosePracticeSetup, onStartPractice, isAddPanelOpen, addInput, onAddInputChange, onBulkAdd } = props;
  const [verbToDelete, setVerbToDelete] = useState<IrregularVerb | null>(null);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><FileClock size={28}/> Irregular Verbs</h2>
          <p className="text-neutral-500 mt-2 font-medium">A dedicated space for reviewing irregular verb forms.</p>
        </div>
        <button onClick={onNew} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm">
          <Plus size={16} />
          <span>New Verb</span>
        </button>
      </header>
      
      {isAddPanelOpen && (
        <div className="bg-white p-6 rounded-[2rem] border-2 border-neutral-100 shadow-xl space-y-4 animate-in slide-in-from-top-4 duration-300">
          <textarea 
            autoFocus 
            value={addInput} 
            onChange={(e) => onAddInputChange(e.target.value)} 
            placeholder="Enter base form verbs, separated by comma, semicolon, or newline..." 
            className="w-full h-24 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-y" 
          />
          <div className="flex justify-end gap-3">
              <button onClick={() => onBulkAdd(false)} disabled={isProcessing || !addInput.trim()} className="px-6 py-3 bg-neutral-100 text-neutral-600 rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-200 transition-all disabled:opacity-50">
                  {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Save size={14}/>}
                  <span>Add Verbs</span>
              </button>
              <button onClick={() => onBulkAdd(true)} disabled={isProcessing || !addInput.trim()} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-indigo-500 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                  {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                  <span>Add with AI</span>
              </button>
          </div>
        </div>
      )}

      {/* Toolbar: Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => onSearchChange(e.target.value)} 
                placeholder="Search verbs (V1, V2, V3)..." 
                className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm" 
            />
        </div>
        {totalCount > pageSize && (
            <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1.5 shadow-sm shrink-0">
                <button 
                    disabled={page === 0} 
                    onClick={() => onPageChange(page - 1)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-2">Page {page + 1} of {totalPages}</span>
                <button 
                    disabled={page >= totalPages - 1} 
                    onClick={() => onPageChange(page + 1)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
      ) : verbs.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">
          <p className="font-bold mb-2">{searchQuery ? 'No verbs match your search.' : 'No irregular verbs added yet.'}</p>
          {!searchQuery && <p>Click "New Verb" to add verbs like "go", "went", "gone".</p>}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-neutral-50/50">
                <th className="p-4 w-12"><button onClick={() => setSelectedIds(selectedIds.size === verbs.length ? new Set() : new Set(verbs.map(v => v.id)))} className="text-neutral-300 hover:text-neutral-900">{selectedIds.size === verbs.length ? <CheckSquare size={18} className="text-neutral-900" /> : <Square size={18} />}</button></th>
                <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">V1 (Base)</th>
                <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">V2 (Past Simple)</th>
                <th className="p-3 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">V3 (Past Participle)</th>
                <th className="p-3 text-right text-[10px] font-black uppercase tracking-wider text-neutral-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {verbs.map(verb => {
                const isSelected = selectedIds.has(verb.id);
                const isInLibrary = libraryWords.has(verb.v1.toLowerCase());
                const incorrectForms = new Set(verb.lastTestIncorrectForms || []);
                return (
                  <tr key={verb.id} className={`border-t border-neutral-100 transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-neutral-50/80 group'}`}>
                    <td className="p-4"><button onClick={() => setSelectedIds(prev => { const next = new Set(prev); if (next.has(verb.id)) next.delete(verb.id); else next.add(verb.id); return next; })}>{isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} className="text-neutral-200 group-hover:text-neutral-400" />}</button></td>
                    <td className={`p-3 font-bold text-sm ${incorrectForms.has('v1') ? 'bg-rose-50/50' : ''}`}>
                        <div className="flex items-center gap-2">
                           <span>{verb.v1}</span>
                           {isInLibrary && <button onClick={() => onGlobalViewWord(libraryWords.get(verb.v1.toLowerCase())!)} title="View in library"><Eye size={14} className="text-neutral-400 hover:text-neutral-800"/></button>}
                        </div>
                    </td>
                    <td className={`p-3 font-mono text-sm text-neutral-600 ${incorrectForms.has('v2') ? 'bg-rose-50/50' : ''}`}>{verb.v2 || '...'}</td>
                    <td className={`p-3 font-mono text-sm text-neutral-600 ${incorrectForms.has('v3') ? 'bg-rose-50/50' : ''}`}>{verb.v3 || '...'}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEdit(verb)} className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg"><Edit3 size={14}/></button>
                        <button onClick={() => setVerbToDelete(verb)} className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {selectedIds.size > 0 && (
            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
                <div className="text-xs font-bold text-neutral-500">{selectedIds.size} selected</div>
                <div className="flex items-center gap-2">
                    <button onClick={onPractice} disabled={isProcessing} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-blue-100 disabled:opacity-50"><Play size={14}/><span>Practice</span></button>
                    <button onClick={onRefine} disabled={isProcessing} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-indigo-100 disabled:opacity-50"><Wand2 size={14}/><span>Refine with AI</span></button>
                    <button onClick={onAddToLibrary} disabled={isProcessing} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-green-100 disabled:opacity-50"><Library size={14}/><span>Add to Library</span></button>
                    <button onClick={onBulkDelete} disabled={isProcessing} className="px-4 py-2 bg-rose-50 text-rose-700 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-rose-100 disabled:opacity-50"><Trash2 size={14}/><span>Delete</span></button>
                </div>
            </div>
          )}
        </div>
      )}

      <AddEditVerbModal 
        isOpen={isModalOpen}
        onClose={onCloseModal}
        onSave={onSave}
        initialData={editingVerb}
      />
      
      <PracticeSetupModal
        isOpen={isPracticeSetupOpen}
        onClose={onClosePracticeSetup}
        onStart={onStartPractice}
        count={selectedIds.size}
      />

      <ConfirmationModal
        isOpen={!!verbToDelete}
        title="Delete Verb?"
        message={<>Are you sure you want to delete <strong>"{verbToDelete?.v1}"</strong>? This is permanent.</>}
        confirmText="Yes, Delete"
        isProcessing={false}
        onConfirm={() => {
          if (verbToDelete) onDelete(verbToDelete);
          setVerbToDelete(null);
        }}
        onClose={() => setVerbToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
      />
    </div>
  );
};
