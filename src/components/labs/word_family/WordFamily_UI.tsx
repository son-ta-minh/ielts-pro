import React, { useEffect, useState } from 'react';
import { WordFamilyGroup } from '../../../app/types';
import { Search, Plus, Pencil, Trash2, Sparkles, Save, X, Loader2, ChevronLeft, ChevronRight, LibraryBig, CheckSquare, Square } from 'lucide-react';
import ConfirmationModal from '../../common/ConfirmationModal';

interface WordFamilyFormModalProps {
  isOpen: boolean;
  initialData: WordFamilyGroup | null;
  onClose: () => void;
  onSave: (value: { verbs: string[]; nouns: string[]; adjectives: string[]; adverbs: string[] }) => void;
}

const toEditorValue = (items: string[]) => items.join(', ');

const WordFamilyFormModal: React.FC<WordFamilyFormModalProps> = ({ isOpen, initialData, onClose, onSave }) => {
  const [verbs, setVerbs] = useState('');
  const [nouns, setNouns] = useState('');
  const [adjectives, setAdjectives] = useState('');
  const [adverbs, setAdverbs] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setVerbs(toEditorValue(initialData?.verbs || []));
    setNouns(toEditorValue(initialData?.nouns || []));
    setAdjectives(toEditorValue(initialData?.adjectives || []));
    setAdverbs(toEditorValue(initialData?.adverbs || []));
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            verbs: verbs.split(/[,\n;\t\r]+/).map(item => item.trim()).filter(Boolean),
            nouns: nouns.split(/[,\n;\t\r]+/).map(item => item.trim()).filter(Boolean),
            adjectives: adjectives.split(/[,\n;\t\r]+/).map(item => item.trim()).filter(Boolean),
            adverbs: adverbs.split(/[,\n;\t\r]+/).map(item => item.trim()).filter(Boolean)
          });
        }}
        className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col"
      >
        <header className="px-8 py-6 border-b border-neutral-100 flex items-start justify-between">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Word Family' : 'Add Word Family'}</h3>
            <p className="text-sm text-neutral-500">Each field can contain multiple words separated by comma, semicolon, or new line.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full">
            <X size={20} />
          </button>
        </header>
        <main className="p-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Verb</span>
            <textarea value={verbs} onChange={(e) => setVerbs(e.target.value)} rows={5} placeholder="act, react" className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium resize-y focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Noun</span>
            <textarea value={nouns} onChange={(e) => setNouns(e.target.value)} rows={5} placeholder="action, reaction" className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium resize-y focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Adjective</span>
            <textarea value={adjectives} onChange={(e) => setAdjectives(e.target.value)} rows={5} placeholder="active, reactive" className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium resize-y focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Adverb</span>
            <textarea value={adverbs} onChange={(e) => setAdverbs(e.target.value)} rows={5} placeholder="actively, reactively" className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium resize-y focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          </label>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 bg-neutral-50/70 rounded-b-[2.5rem] flex justify-end">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest">
            <Save size={14} />
            <span>Save Group</span>
          </button>
        </footer>
      </form>
    </div>
  );
};

const WordPills: React.FC<{ items: string[] }> = ({ items }) => {
  if (items.length === 0) {
    return <span className="text-sm text-neutral-300">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <span key={item} className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 text-xs font-bold">
          {item}
        </span>
      ))}
    </div>
  );
};

interface WordFamilyUIProps {
  loading: boolean;
  groups: WordFamilyGroup[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  searchQuery: string;
  isSaving: boolean;
  isModalOpen: boolean;
  editingGroup: WordFamilyGroup | null;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSearchChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  onNew: () => void;
  onEdit: (group: WordFamilyGroup) => void;
  onDelete: (group: WordFamilyGroup) => void;
  onRefine: (group: WordFamilyGroup) => void;
  onRefineSelected: () => void;
  onSave: (value: { verbs: string[]; nouns: string[]; adjectives: string[]; adverbs: string[] }) => void;
  onCloseModal: () => void;
}

export const WordFamilyUI: React.FC<WordFamilyUIProps> = ({
  loading,
  groups,
  totalCount,
  totalPages,
  page,
  pageSize,
  searchQuery,
  isSaving,
  isModalOpen,
  editingGroup,
  selectedIds,
  setSelectedIds,
  onSearchChange,
  onPageChange,
  onPageSizeChange,
  onNew,
  onEdit,
  onDelete,
  onRefine,
  onRefineSelected,
  onSave,
  onCloseModal
}) => {
  const [groupToDelete, setGroupToDelete] = useState<WordFamilyGroup | null>(null);
  const allVisibleSelected = groups.length > 0 && groups.every(group => selectedIds.has(group.id));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3">
            <LibraryBig size={28} />
            <span>Word Family</span>
          </h2>
          <p className="text-neutral-500 mt-2 font-medium">Group related verbs, nouns, adjectives, and adverbs in one clean reference table.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefineSelected}
            disabled={isSaving || selectedIds.size === 0}
            className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>Auto Refine Selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</span>
          </button>
          <button onClick={onNew} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest shadow-sm hover:bg-neutral-800">
            <Plus size={16} />
            <span>New Group</span>
          </button>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search any word in verb, noun, adjective, adverb..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 0 && (
            <div className="px-3 py-2 rounded-xl bg-white border border-neutral-200 shadow-sm text-[11px] font-black uppercase tracking-widest text-neutral-500">
              {totalCount} Groups
            </div>
          )}
          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-3 py-2 shadow-sm">
            <label htmlFor="wordFamilyPageSize" className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Items</label>
            <input
              id="wordFamilyPageSize"
              type="number"
              min={5}
              max={200}
              step={5}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value) || 10)}
              className="w-16 bg-transparent text-xs font-bold text-neutral-800 focus:outline-none"
            />
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1.5 shadow-sm">
              <button disabled={page === 0} onClick={() => onPageChange(page - 1)} className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronLeft size={16} />
              </button>
              <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-2">Page {page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin text-neutral-300" size={32} />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">
          <p className="font-bold mb-2">{searchQuery ? 'No word family groups match your search.' : 'No word family groups yet.'}</p>
          <p>{searchQuery ? 'Try a different keyword.' : 'Create a new group or restore from a JSON backup.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-neutral-50/70">
                  <th className="p-4 w-12">
                    <button
                      onClick={() => setSelectedIds(allVisibleSelected ? new Set() : new Set(groups.map(group => group.id)))}
                      className="text-neutral-300 hover:text-neutral-900"
                    >
                      {allVisibleSelected ? <CheckSquare size={18} className="text-neutral-900" /> : <Square size={18} />}
                    </button>
                  </th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">Verb</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">Noun</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">Adjective</th>
                  <th className="p-4 text-left text-[10px] font-black uppercase tracking-wider text-neutral-400">Adverb</th>
                  <th className="p-4 text-right text-[10px] font-black uppercase tracking-wider text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <tr key={group.id} className={`border-t border-neutral-100 align-top hover:bg-neutral-50/80 ${selectedIds.has(group.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="p-4">
                      <button
                        onClick={() => setSelectedIds((current) => {
                          const next = new Set(current);
                          if (next.has(group.id)) next.delete(group.id);
                          else next.add(group.id);
                          return next;
                        })}
                        className="text-neutral-300 hover:text-neutral-900"
                      >
                        {selectedIds.has(group.id) ? <CheckSquare size={18} className="text-neutral-900" /> : <Square size={18} />}
                      </button>
                    </td>
                    <td className="p-4"><WordPills items={group.verbs} /></td>
                    <td className="p-4"><WordPills items={group.nouns} /></td>
                    <td className="p-4"><WordPills items={group.adjectives} /></td>
                    <td className="p-4"><WordPills items={group.adverbs} /></td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => onEdit(group)} className="p-2 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setGroupToDelete(group)} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WordFamilyFormModal isOpen={isModalOpen} initialData={editingGroup} onClose={onCloseModal} onSave={onSave} />

      <ConfirmationModal
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onConfirm={() => {
          if (groupToDelete) {
            onDelete(groupToDelete);
            setGroupToDelete(null);
          }
        }}
        title="Delete Word Family"
        message={`Delete this word family group${groupToDelete?.verbs[0] ? ` for "${groupToDelete.verbs[0]}"` : ''}?`}
        confirmText="Delete"
        isProcessing={false}
        confirmButtonClass="bg-rose-600 hover:bg-rose-500"
      />
    </div>
  );
};
