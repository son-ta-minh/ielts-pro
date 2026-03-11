import React, { useMemo, useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, Tag, Edit2, Link as LinkIcon, X, Search, FolderOpen, Trash2 } from 'lucide-react';
import { User, ReviewGrade } from '../../app/types';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import ConfirmationModal from '../common/ConfirmationModal';
import * as dataStore from '../../app/dataStore';

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

  // Absolute URL
  if (path.startsWith('http')) return path;

  const config = getConfig();
  const baseUrl = getServerUrl(config);

  // If user only provided a filename (no slash), assume Gallery image
  if (!path.includes('/')) {
    const hasExt = /\.[a-zA-Z0-9]+$/.test(path);
    const fileName = hasExt ? path : `${path}.png`;
    return `${baseUrl}/api/images/stream/Gallery/${fileName}`;
  }

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // Legacy audio-style paths
  if (!cleanPath.startsWith('api/')) {
    return `${baseUrl}/api/audio/stream/${cleanPath}`;
  }

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
  const wordMap = useMemo(() => {
    const map = new Map<string, any>();
    dataStore.getAllWords().filter(w => w.userId === user.id).forEach(w => map.set(w.word.toLowerCase(), w));
    return map;
  }, [user.id, items]);

  type WordStatus = 'learned' | 'new' | 'forgot' | 'hard' | 'easy' | 'missing';

  const getWordStatus = (word: string): WordStatus => {
    const entry = wordMap.get(word.toLowerCase());
    if (!entry) return 'missing';
    if (!entry.lastReview) return 'new';
    switch (entry.lastGrade) {
      case ReviewGrade.LEARNED: return 'learned';
      case ReviewGrade.FORGOT: return 'forgot';
      case ReviewGrade.HARD: return 'hard';
      case ReviewGrade.EASY: return 'easy';
      default: return 'new';
    }
  };

  const getWordStyles = (status: WordStatus) => {
    switch (status) {
      case 'learned': return { badge: 'bg-cyan-100 text-cyan-800 border border-cyan-200', dot: 'bg-cyan-500' };
      case 'new': return { badge: 'bg-blue-100 text-blue-800 border border-blue-200', dot: 'bg-blue-500' };
      case 'forgot': return { badge: 'bg-rose-100 text-rose-800 border border-rose-200', dot: 'bg-rose-500' };
      case 'hard': return { badge: 'bg-orange-100 text-orange-800 border border-orange-200', dot: 'bg-orange-500' };
      case 'easy': return { badge: 'bg-green-100 text-green-800 border border-green-200', dot: 'bg-green-500' };
      case 'missing':
      default:
        return { badge: 'bg-neutral-100 text-neutral-700 border border-neutral-200', dot: 'bg-neutral-400' };
    }
  };

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

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = formState.title.trim();
    const collection = (formState.collection || 'Unsorted').trim() || 'Unsorted';
    const imagePath = formState.imagePath.trim();
    const words = formState.words
      ? formState.words
          .split(',')
          .map(w => w.trim().toLowerCase())
          .filter(Boolean)
      : [];
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
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-48 object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.endsWith('.png')) {
                img.src = img.src.replace('.png', '.jpg');
              }
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="pt-3 px-6 pb-6 space-y-6">
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
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-bold flex items-center gap-2"
          >
            <Plus size={16} />
            {showForm ? 'Hide Add Image' : 'Add Image'}
          </button>
        </div>
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
              <img
                src={buildImageUrl(showDetail.imagePath)}
                alt={showDetail.title}
                className="w-full max-h-[480px] object-contain rounded-xl border border-neutral-200"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.endsWith('.png')) {
                    img.src = img.src.replace('.png', '.jpg');
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {showDetail.words.map(w => {
                  const status = getWordStatus(w);
                  const style = getWordStyles(status);
                  return (
                    <span key={w} className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${style.badge}`}>
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      {w}
                    </span>
                  );
                })}
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
