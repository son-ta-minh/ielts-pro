import React, { useMemo, useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, Tag, Edit2, Link as LinkIcon, X, Search, FolderOpen, Trash2 } from 'lucide-react';
import { User } from '../../app/types';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import ConfirmationModal from '../common/ConfirmationModal';

type GalleryItem = {
  id: string;
  title: string;
  collection: string;
  imagePath: string;
  words: string[];
  note?: string;
};

const STORAGE_KEY = 'vocab_pro_word_gallery_items';
const keyForUser = (userId: string) => `${STORAGE_KEY}_${userId}`;

const buildImageUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const config = getConfig();
  const baseUrl = getServerUrl(config);
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (!cleanPath.startsWith('api/')) return `${baseUrl}/api/audio/stream/${cleanPath}`;
  return `${baseUrl}/${cleanPath}`;
};

const loadItems = (userId: string): GalleryItem[] => getStoredJSON<GalleryItem[]>(keyForUser(userId), []);
const saveItems = (userId: string, items: GalleryItem[]) => setStoredJSON(keyForUser(userId), items);

export const WordGalleryPage: React.FC<{ user: User }> = ({ user }) => {
  const [items, setItems] = useState<GalleryItem[]>(loadItems(user.id));
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [showDetail, setShowDetail] = useState<GalleryItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState({ title: '', collection: '', imagePath: '', words: '', note: '' });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => { saveItems(user.id, items); }, [items, user.id]);

  useEffect(() => {
    if (editing) {
      setFormState({
        title: editing.title,
        collection: editing.collection,
        imagePath: editing.imagePath,
        words: editing.words.join(', '),
        note: editing.note || ''
      });
      setShowForm(true);
    } else {
      setFormState({ title: '', collection: '', imagePath: '', words: '', note: '' });
    }
  }, [editing]);

  const collections = useMemo(() => {
    const set = new Set(items.map(i => i.collection || 'Unsorted'));
    return ['all', ...Array.from(set)];
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter(item => {
      const matchCollection = filter === 'all' || item.collection === filter;
      const matchQuery = query.trim() === '' || item.title.toLowerCase().includes(query.toLowerCase()) || item.words.some(w => w.toLowerCase().includes(query.toLowerCase()));
      return matchCollection && matchQuery;
    });
  }, [items, filter, query]);

  const resetForm = () => setEditing(null);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = formState.title.trim();
    const collection = (formState.collection || 'Unsorted').trim() || 'Unsorted';
    const imagePath = formState.imagePath.trim();
    const words = formState.words ? formState.words.split(',').map(w => w.trim()).filter(Boolean) : [];
    const note = formState.note.trim();

    const payload: GalleryItem = editing ? { ...editing, title, collection, imagePath, words, note } : {
      id: `wg-${Date.now()}`,
      title: title || 'Untitled',
      collection,
      imagePath,
      words,
      note
    };

    setItems(prev => editing ? prev.map(i => i.id === payload.id ? payload : i) : [payload, ...prev]);
    resetForm();
  };

  const handleEdit = (item: GalleryItem) => {
    setEditing(item);
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (showDetail?.id === id) setShowDetail(null);
    if (editing?.id === id) resetForm();
    setConfirmId(null);
  };

  const renderCard = (item: GalleryItem) => {
    const imageUrl = buildImageUrl(item.imagePath);
    return (
      <div key={item.id} className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="cursor-pointer" onClick={() => setShowDetail(item)}>
          <img src={imageUrl} alt={item.title} className="w-full h-48 object-cover" />
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-neutral-400 uppercase">Collections</p>
          <h1 className="text-2xl font-black text-neutral-900">Word Gallery</h1>
          <p className="text-sm text-neutral-500">Select an image, assign it to a collection, and link vocabulary words that appear in the picture.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-neutral-200 text-sm font-bold">
            {collections.map(c => <option key={c} value={c}>{c === 'all' ? 'All Collections' : c}</option>)}
          </select>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-200 bg-white">
            <Search size={14} className="text-neutral-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or word" className="text-sm outline-none" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-bold flex items-center gap-2"
        >
          <Plus size={16} />
          {showForm ? 'Hide Add Image' : 'Add Image'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-dashed border-neutral-300 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-700">
            <ImageIcon size={16} /> {editing ? 'Edit Image' : 'Add Image'}
          </div>
          <div className="flex items-center justify-end gap-2">
            {editing && (
              <>
                <button type="button" onClick={() => setConfirmId(editing.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 border border-rose-200 flex items-center gap-1"><Trash2 size={12}/>Delete</button>
                <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded-lg text-xs font-bold text-neutral-500 border border-neutral-200">Cancel</button>
              </>
            )}
            <button type="submit" className="px-4 py-2 rounded-lg text-xs font-black bg-neutral-900 text-white flex items-center gap-2"><Plus size={14}/> {editing ? 'Update' : 'Add'}</button>
          </div>
          <input name="title" value={formState.title} onChange={(e) => setFormState(f => ({ ...f, title: e.target.value }))} placeholder="Title" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium" />
          <input name="collection" value={formState.collection} onChange={(e) => setFormState(f => ({ ...f, collection: e.target.value }))} placeholder="Collection" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium" />
          <input name="imagePath" value={formState.imagePath} onChange={(e) => setFormState(f => ({ ...f, imagePath: e.target.value }))} placeholder="Image path or URL (server path works like [IMG])" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono" required />
          <input name="words" value={formState.words} onChange={(e) => setFormState(f => ({ ...f, words: e.target.value }))} placeholder="Words (comma separated)" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium" />
          <textarea name="note" value={formState.note} onChange={(e) => setFormState(f => ({ ...f, note: e.target.value }))} placeholder="Notes (optional)" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium md:col-span-2" rows={2} />
        </form>
      )}

      {visibleItems.length === 0 ? (
        <div className="border border-neutral-200 rounded-2xl p-6 text-center text-neutral-500 bg-white shadow-sm">No images yet. Add one above.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map(renderCard)}
        </div>
      )}

      {showDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-4 relative" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-3 right-3 p-2 rounded-full bg-neutral-100" onClick={() => setShowDetail(null)}><X size={16}/></button>
            <div className="flex flex-col gap-3">
              <img src={buildImageUrl(showDetail.imagePath)} alt={showDetail.title} className="w-full max-h-[480px] object-contain rounded-xl border border-neutral-200" />
              <div className="flex flex-wrap gap-2">
                {showDetail.words.map(w => <span key={w} className="px-2 py-1 rounded-full bg-neutral-900 text-white text-xs font-bold">{w}</span>)}
              </div>
              {showDetail.note && <p className="text-sm text-neutral-600 leading-relaxed">{showDetail.note}</p>}
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="flex items-center gap-2"><Tag size={12}/> {showDetail.collection}</span>
                <button className="text-emerald-600 font-bold" onClick={() => { handleEdit(showDetail); setShowDetail(null); }}>Edit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!confirmId}
        title="Delete Image"
        message="This action will permanently delete the image and its linked vocabulary words."
        confirmText="Delete"
        isProcessing={false}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && handleDelete(confirmId)}
      />
    </div>
  );
};

export default WordGalleryPage;
