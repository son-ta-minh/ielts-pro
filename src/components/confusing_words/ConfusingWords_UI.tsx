import React, { useState, useEffect } from 'react';
// FIX: Changed WordComparisonGroup to ComparisonGroup to match exported type.
import { ComparisonGroup } from '../../app/types';
import { Puzzle, Plus, Edit3, Trash2, Sparkles, ChevronDown, Loader2, Save, X, Info } from 'lucide-react';

// --- Add/Edit Modal Component ---
interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, words: string[]) => void;
  initialData?: ComparisonGroup | null;
}

const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [words, setWords] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setWords(initialData?.words.join(', ') || '');
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const wordArray = words.split(',').map(w => w.trim()).filter(Boolean);
    if (name.trim() && wordArray.length > 0) {
      onSave(name.trim(), wordArray);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Group' : 'Create New Group'}</h3>
            <p className="text-sm text-neutral-500">Define a set of words to compare.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-500 mb-1">Group Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Words for 'Pain'" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" required autoFocus/>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-500 mb-1">Confusing Words (comma-separated)</label>
            <textarea value={words} onChange={e => setWords(e.target.value)} placeholder="e.g., ache, pain, hurt, sore..." rows={4} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium resize-y" required/>
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Group</button>
        </footer>
      </form>
    </div>
  );
};

// --- Main UI Component ---
interface ConfusingWordsUIProps {
  loading: boolean;
  groups: ComparisonGroup[];
  activeGroupId: string | null;
  setActiveGroupId: (id: string | null) => void;
  isModalOpen: boolean;
  editingGroup: ComparisonGroup | null;
  refiningGroupId: string | null;
  onNewGroup: () => void;
  onEditGroup: (group: ComparisonGroup) => void;
  onDeleteGroup: (group: ComparisonGroup) => void;
  onSaveGroup: (name: string, words: string[]) => void;
  onRefine: (group: ComparisonGroup) => void;
  onCloseModal: () => void;
}

export const ConfusingWordsUI: React.FC<ConfusingWordsUIProps> = (props) => {
  const { loading, groups, activeGroupId, setActiveGroupId, isModalOpen, editingGroup, refiningGroupId, onNewGroup, onEditGroup, onDeleteGroup, onSaveGroup, onRefine, onCloseModal } = props;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><Puzzle size={28}/> Confusing Words</h2>
          <p className="text-neutral-500 mt-2 font-medium">Create groups of similar words to analyze their nuanced differences.</p>
        </div>
        <button onClick={onNewGroup} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm">
          <Plus size={16} />
          <span>New Group</span>
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">
            <p className="font-bold mb-2">No groups created yet.</p>
            <p>Click "New Group" to start comparing words like "ache" vs "pain".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const isActive = activeGroupId === group.id;
            return (
              <div key={group.id} className={`bg-white rounded-2xl border transition-all ${isActive ? 'shadow-lg border-indigo-200' : 'shadow-sm border-neutral-200'}`}>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div 
                    className="flex-1 cursor-pointer" 
                    onClick={() => setActiveGroupId(isActive ? null : group.id)}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown size={16} className={`text-neutral-400 transition-transform ${isActive ? 'rotate-180' : ''}`} />
                      <h3 className="font-bold text-neutral-900">{group.name}</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-7 mt-2">
                      {group.words.map(word => <span key={word} className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-bold">{word}</span>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button onClick={() => onEditGroup(group)} className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg"><Edit3 size={14}/></button>
                    <button onClick={() => onDeleteGroup(group)} className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14}/></button>
                    <button onClick={() => onRefine(group)} disabled={refiningGroupId === group.id} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-indigo-100 transition-colors disabled:opacity-50">
                      {refiningGroupId === group.id ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                      <span>{refiningGroupId === group.id ? 'Refining...' : 'Refine with AI'}</span>
                    </button>
                  </div>
                </div>
                {isActive && (
                  <div className="p-6 border-t border-neutral-100 animate-in fade-in duration-300">
                    {refiningGroupId === group.id ? (
                        <div className="flex items-center justify-center p-10"><Loader2 className="animate-spin text-indigo-500"/></div>
                    ) : group.comparisonData ? (
                      <div 
                        className="prose prose-sm max-w-none prose-h4:font-black prose-h4:mb-2 prose-h6:font-bold prose-h6:text-neutral-500 prose-p:my-1 prose-ul:my-2 prose-li:my-1" 
                        dangerouslySetInnerHTML={{ __html: group.comparisonData as any }} 
                      />
                    ) : (
                        <div className="text-center p-8 bg-neutral-50/50 rounded-xl border border-dashed border-neutral-200 text-neutral-500">
                            <Info size={24} className="mx-auto mb-2"/>
                            <p className="font-bold">This group hasn't been analyzed yet.</p>
                            <p className="text-sm">Click "Refine with AI" to generate a detailed comparison.</p>
                        </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddEditModal 
        isOpen={isModalOpen}
        onClose={onCloseModal}
        onSave={onSaveGroup}
        initialData={editingGroup}
      />
    </div>
  );
};