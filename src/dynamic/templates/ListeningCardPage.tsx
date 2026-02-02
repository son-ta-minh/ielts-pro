
import React, { useState, useEffect, useMemo } from 'react';
import { User, ListeningItem, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import { ResourcePage } from '../page/ResourcePage';
import { Ear, Plus, Edit3, Trash2, Volume2, Save, X, Info, Tag, Shuffle, FolderTree, Target } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { speak } from '../../utils/audio';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { TagBrowser } from '../../components/common/TagBrowser';
import { ResourceActions } from '../page/ResourceActions';

interface Props {
  user: User;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_listening_view';

// --- Highlighted Text Renderer ---
const HighlightedText: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/({.*?})/g);
    return (
        <span>
            {parts.map((part, i) => {
                if (part.startsWith('{') && part.endsWith('}')) {
                    return <span key={i} className="bg-red-100 text-red-700 px-1 rounded-md font-bold mx-0.5 border border-red-200">{part.slice(1, -1)}</span>;
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
};

// --- Add/Edit Modal ---
interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string, note?: string, path?: string, tags?: string[]) => void;
  initialData?: ListeningItem | null;
}

const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [path, setPath] = useState('/');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setText(initialData?.text || '');
      setNote(initialData?.note || '');
      if (initialData?.path === undefined) {
        const legacyTags = initialData?.tags || [];
        const pathFromTags = legacyTags.find(t => t.startsWith('/'));
        const singleTags = legacyTags.filter(t => !t.startsWith('/'));
        setPath(pathFromTags || '/');
        setTagsInput(singleTags.join(', '));
      } else {
        setPath(initialData?.path || '/');
        setTagsInput(initialData?.tags?.join(', ') || '');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      onSave(text.trim(), note.trim(), path.trim(), finalTags);
    }
  };

  const handleWrapSelection = () => {
    const textarea = document.getElementById('listening-text-input') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    if (selectedText) {
        const newText = text.substring(0, start) + `{${selectedText}}` + text.substring(end);
        setText(newText);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Phrase' : 'New Phrase'}</h3>
            <p className="text-sm text-neutral-500">Add text you find hard to hear.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-500">
                Text content 
                <span className="font-normal text-[10px] ml-2 text-neutral-400">(Select text & click Highlight)</span>
            </label>
            <div className="relative">
                <textarea 
                    id="listening-text-input"
                    value={text} 
                    onChange={e => setText(e.target.value)} 
                    placeholder="e.g. I {wanna} go to the store." 
                    rows={4} 
                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-sm leading-relaxed" 
                    required 
                    autoFocus
                />
                <button 
                    type="button" 
                    onClick={handleWrapSelection}
                    className="absolute bottom-3 right-3 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-red-200 transition-colors"
                >
                    Highlight Selection
                </button>
            </div>
            <p className="text-[10px] text-neutral-400 italic">Tip: Use <strong>{`{curly braces}`}</strong> to mark the difficult parts.</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Note (Optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Fast speech, linking sounds..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="block text-xs font-bold text-neutral-500">Path</label>
                 <input value={path} onChange={e => setPath(e.target.value)} placeholder="/Connected Speech" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
              </div>
              <div className="space-y-1">
                 <label className="block text-xs font-bold text-neutral-500">Tags (Keywords)</label>
                 <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="linking, elision..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
              </div>
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Item</button>
        </footer>
      </form>
    </div>
  );
};

export const ListeningCardPage: React.FC<Props> = ({ user }) => {
  const [items, setItems] = useState<ListeningItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // View State
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
      showNote: true,
      compact: false,
      showType: true
  }));

  // Filtering
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ListeningItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ListeningItem | null>(null);
  
  const { showToast } = useToast();

  const loadData = async () => {
    setLoading(true);
    const userItems = await db.getListeningItemsByUserId(user.id);
    setItems(userItems.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user.id]);
  
  // Reset pagination on filter change
  useEffect(() => {
    setPage(0);
  }, [selectedTag, pageSize, focusFilter, colorFilter]);

  // Derived Logic
  const filteredItems = useMemo(() => {
    let result = items;
    if (focusFilter === 'focused') result = result.filter(i => i.isFocused);
    if (colorFilter !== 'all') result = result.filter(i => i.focusColor === colorFilter);
    
    if (selectedTag) {
        if (selectedTag === 'Uncategorized') {
            result = result.filter(item => {
                const path = item.path ?? (item.tags || []).find(t => t.startsWith('/'));
                const hasPath = path && path !== '/';
                return !hasPath;
            });
        } else {
            result = result.filter(i => i.path?.startsWith(selectedTag) || i.tags?.includes(selectedTag));
        }
    }
    return result;
  }, [items, selectedTag, focusFilter, colorFilter]);
  
  const pagedItems = useMemo(() => {
      const start = page * pageSize;
      return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const handleNew = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ListeningItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    await db.deleteListeningItem(itemToDelete.id);
    setItemToDelete(null);
    showToast("Deleted item.", "success");
    loadData();
  };

  const handleSave = async (text: string, note?: string, path?: string, tags?: string[]) => {
    try {
      const now = Date.now();
      if (editingItem) {
        const updated = { ...editingItem, text, note, path, tags, updatedAt: now };
        await db.saveListeningItem(updated);
        showToast("Item updated!", "success");
      } else {
        const newItem: ListeningItem = {
          id: `lst-${now}-${Math.random()}`,
          userId: user.id,
          text,
          note,
          path,
          tags,
          createdAt: now,
          updatedAt: now
        };
        await db.saveListeningItem(newItem);
        showToast("Item added!", "success");
      }
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast("Failed to save item.", "error");
    }
  };

  const handlePlay = (text: string) => {
      const cleanText = text.replace(/[{}]/g, '');
      speak(cleanText);
  };

  const handleRandomize = () => {
    setItems(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Shuffled!", "success");
  };
  
  const handleFocusChange = async (item: ListeningItem, color: FocusColor | null) => {
      const updated = { ...item, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete updated.focusColor;
      
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      await db.saveListeningItem(updated);
  };
  
  const handleToggleFocus = async (item: ListeningItem) => {
      const updated = { ...item, isFocused: !item.isFocused, updatedAt: Date.now() };
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      await db.saveListeningItem(updated);
  };

  return (
    <>
    <ResourcePage
      title="Listening Library"
      subtitle="Practice listening reflexes and capture difficult phrases."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Headphone.png" className="w-8 h-8 object-contain" alt="Listening" />}
      config={{}}
      isLoading={loading}
      isEmpty={filteredItems.length === 0}
      emptyMessage="No difficult phrases saved."
      activeFilters={{}}
      onFilterChange={() => {}}
      pagination={{
          page,
          totalPages: Math.ceil(filteredItems.length / pageSize),
          onPageChange: setPage,
          pageSize,
          onPageSizeChange: setPageSize,
          totalItems: filteredItems.length
      }}
      aboveGrid={
        <>
            {isGroupBrowserOpen && <TagBrowser items={items} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="groups" title="Browse Groups" icon={<FolderTree size={16}/>} />}
            {isTagBrowserOpen && <TagBrowser items={items} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        </>
      }
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen}
                    setIsOpen={setIsViewMenuOpen}
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
                        { label: 'Show Notes', checked: viewSettings.showNote, onChange: () => setViewSettings(v => ({...v, showNote: !v.showNote})) },
                        { label: 'Show Card Type', checked: viewSettings.showType, onChange: () => setViewSettings(v => ({...v, showType: !v.showType})) },
                        { label: 'Compact Mode', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                    ]}
                />
            }
            browseGroups={{ isOpen: isGroupBrowserOpen, onToggle: () => { setIsGroupBrowserOpen(!isGroupBrowserOpen); setIsTagBrowserOpen(false); } }}
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); setIsGroupBrowserOpen(false); } }}
            addActions={[{ label: 'Add Phrase', icon: Plus, onClick: handleNew }]}
            extraActions={
                 <button onClick={handleRandomize} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize">
                    <Shuffle size={16} />
                </button>
            }
        />
      }
    >
      {() => (
        <>
          {pagedItems.map(item => (
            <UniversalCard
                key={item.id}
                title={<HighlightedText text={item.text} />}
                badge={viewSettings.showType ? { label: 'Listening', colorClass: 'bg-red-50 text-red-600 border-red-100', icon: Ear } : undefined}
                path={item.path}
                tags={item.tags}
                compact={viewSettings.compact}
                onClick={() => handlePlay(item.text)}
                focusColor={item.focusColor}
                onFocusChange={(c) => handleFocusChange(item, c)}
                isFocused={item.isFocused}
                onToggleFocus={() => handleToggleFocus(item)}
                actions={
                    <>
                        <button onClick={(e) => { e.stopPropagation(); handlePlay(item.text); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Play">
                            <Volume2 size={14}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit">
                            <Edit3 size={14}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={14}/>
                        </button>
                    </>
                }
            >
                {viewSettings.showNote && item.note && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium bg-neutral-50 px-2 py-1 rounded-lg w-fit">
                        <Info size={12}/> {item.note}
                    </div>
                )}
            </UniversalCard>
          ))}
        </>
      )}
    </ResourcePage>
    
    <AddEditModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingItem} 
    />
    
    <ConfirmationModal 
        isOpen={!!itemToDelete}
        title="Delete Phrase?"
        message="Are you sure you want to remove this phrase?"
        confirmText="Delete"
        isProcessing={false}
        onConfirm={handleDelete}
        onClose={() => setItemToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
    />
    </>
  );
};
