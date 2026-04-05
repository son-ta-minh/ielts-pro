import React, { useMemo, useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, Tag, X, Search, Trash2 } from 'lucide-react';
import { User, LearnedStatus } from '../../app/types';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import ConfirmationModal from '../common/ConfirmationModal';
import * as dataStore from '../../app/dataStore';

type GalleryItem = {
  id: string;
  title?: string;
  collection: string;
  imagePath: string;
  words: string[];
  note?: string;
  text?: string;
};

type GalleryFormState = {
  title: string;
  collection: string;
  imagePath: string;
  words: string;
  text: string;
};

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

const normalizeGalleryImagePath = (rawPath: string) => {
  const value = rawPath.trim();
  if (!value) return '';

  if (!value.startsWith('http')) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname || '';
    const galleryPrefix = '/Gallery/';
    const galleryIndex = pathname.indexOf(galleryPrefix);
    if (galleryIndex >= 0) {
      return pathname.slice(galleryIndex);
    }
    return pathname || value;
  } catch {
    return value;
  }
};

export const WordGalleryPage: React.FC<{ user: User }> = ({ user }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [showDetail, setShowDetail] = useState<GalleryItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<GalleryFormState>({ title: '', collection: '', imagePath: '', words: '', text: '' });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'vocabulary' | 'text'>('vocabulary');
  const wordMap = useMemo(() => {
    const map = new Map<string, any>();
    dataStore.getAllWords().filter(w => w.userId === user.id).forEach(w => map.set(w.word.toLowerCase(), w));
    return map;
  }, [user.id, items]);

  const baseUrl = useMemo(() => getServerUrl(getConfig()), []);

  const fileNameFromPath = (p: string) => {
    if (!p) return '';
    const parts = p.split(/[/\\]/);
    return parts[parts.length - 1] || '';
  };

  const loadFromServer = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/gallery`);
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load gallery');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadFromServer(); }, []);

  type WordStatus = 'learned' | 'new' | 'forgot' | 'hard' | 'easy' | 'missing';

  const getWordStatus = (word: string): WordStatus => {
    const entry = wordMap.get(word.toLowerCase());
    if (!entry) return 'missing';
    if (!entry.lastReview) return 'new';
    switch (entry.learnedStatus) {
      case LearnedStatus.LEARNED: return 'learned';
      case LearnedStatus.FORGOT: return 'forgot';
      case LearnedStatus.HARD: return 'hard';
      case LearnedStatus.EASY: return 'easy';
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

  useEffect(() => {
    if (editing) {
      setFormState({
        title: editing.title || '',
        collection: editing.collection,
        imagePath: editing.imagePath,
        words: editing.words.join(', '),
        text: editing.text || ''
      });
      setShowForm(true);
    } else {
      setFormState({ title: '', collection: '', imagePath: '', words: '', text: '' });
    }
  }, [editing]);

  const collections = useMemo(() => {
    const set = new Set(items.map(i => i.collection || 'Unsorted'));
    return ['all', ...Array.from(set)];
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter(item => {
      const matchCollection = filter === 'all' || item.collection === filter;
      const effectiveTitle = (item.title || '').toLowerCase();
      const loweredQuery = query.toLowerCase();
      const matchQuery = query.trim() === '' || effectiveTitle.includes(loweredQuery) || item.words.some(w => w.toLowerCase().includes(loweredQuery));
      return matchCollection && matchQuery;
    });
  }, [items, filter, query]);

  const groupedVisibleItems = useMemo(() => {
    const groups = new Map<string, GalleryItem[]>();
    visibleItems.forEach(item => {
      const collectionName = item.collection || 'Unsorted';
      const existing = groups.get(collectionName) || [];
      existing.push(item);
      groups.set(collectionName, existing);
    });
    return Array.from(groups.entries());
  }, [visibleItems]);

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
  };

  const renderHighlightedText = (value?: string) => {
    if (!value?.trim()) {
      return <p className="text-sm leading-7 text-neutral-400">No text saved for this image yet.</p>;
    }

    const segments = value.split(/(\{[^}]+\})/g).filter(Boolean);

    return (
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-neutral-700">
        {segments.map((segment, index) => {
          const match = segment.match(/^\{([^}]+)\}$/);
          if (!match) {
            return <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>;
          }

          return (
            <span
              key={`${match[1]}-${index}`}
              className="rounded-md bg-sky-100 px-1.5 py-0.5 text-sky-800"
            >
              {match[1]}
            </span>
          );
        })}
      </div>
    );
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const title = formState.title.trim();
    const collection = (formState.collection || 'Unsorted').trim() || 'Unsorted';
    const imagePath = normalizeGalleryImagePath(formState.imagePath);
    const words = formState.words
      ? formState.words
          .split(',')
          .map(w => w.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const note = '';
    const text = formState.text.trim();

    if (!imagePath) return;

    setIsSaving(true);
    setError(null);
    try {
      const body = { collection, imagePath, words, note, text, title: title || undefined };
      if (editing) {
        const res = await fetch(`${baseUrl}/api/gallery/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Update failed (${res.status})`);
        const updated = await res.json();
        setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      } else {
        const res = await fetch(`${baseUrl}/api/gallery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Create failed (${res.status})`);
        const created = await res.json();
        setItems(prev => [created, ...prev]);
      }
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item: GalleryItem) => {
    setEditing(item);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/gallery/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setItems(prev => prev.filter(i => i.id !== id));
      if (showDetail?.id === id) setShowDetail(null);
      if (editing?.id === id) resetForm();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setIsSaving(false);
      setConfirmId(null);
    }
  };

  const renderCard = (item: GalleryItem) => {
    const imageUrl = buildImageUrl(item.imagePath);
    const isEditingItem = editing?.id === item.id;
    return (
        <div key={item.id} className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="cursor-pointer" onClick={() => { setShowDetail(item); setDetailTab('vocabulary'); }}>
          <img
            src={imageUrl}
            alt={item.title || ''}
            className={`w-full ${isEditingItem ? 'h-72 p-3 bg-neutral-50 object-contain' : 'h-48 p-2 bg-neutral-50 object-contain'}`}
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

      {error && <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">{error}</div>}


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
          <input name="title" value={formState.title} onChange={(e) => setFormState(f => ({ ...f, title: e.target.value }))} placeholder="Title (optional)" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium" />
          <input name="collection" value={formState.collection} onChange={(e) => setFormState(f => ({ ...f, collection: e.target.value }))} placeholder="Collection" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium" />
          <input name="imagePath" value={formState.imagePath} onChange={(e) => setFormState(f => ({ ...f, imagePath: e.target.value }))} placeholder="Image path or URL (server path works like [IMG])" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono" required />
          <input name="words" value={formState.words} onChange={(e) => setFormState(f => ({ ...f, words: e.target.value }))} placeholder="Words (comma separated)" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium md:col-span-2" />
          <textarea
            name="text"
            value={formState.text}
            onChange={(e) => setFormState(f => ({ ...f, text: e.target.value }))}
            placeholder="Text for this image. Use {curly braces} to mark phrases that should be highlighted."
            className="min-h-[160px] px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium md:col-span-2"
          />
          {editing && formState.imagePath && (
            <div className="md:col-span-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-400">Editing Preview</p>
              <img
                src={buildImageUrl(formState.imagePath)}
                alt={formState.title.trim() || editing.title || ''}
                className="h-72 w-full rounded-xl object-contain bg-white"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.endsWith('.png')) {
                    img.src = img.src.replace('.png', '.jpg');
                  }
                }}
              />
            </div>
          )}
        </form>
      )}

      {isLoading ? (
        <div className="border border-neutral-200 rounded-2xl p-6 text-center text-neutral-500 bg-white shadow-sm">Loading gallery...</div>
      ) : visibleItems.length === 0 ? (
        <div className="border border-neutral-200 rounded-2xl p-6 text-center text-neutral-500 bg-white shadow-sm">No images yet. Add one above.</div>
      ) : editing ? null : (
        filter === 'all' ? (
          <div className="space-y-8">
            {groupedVisibleItems.map(([collectionName, collectionItems]) => (
              <section key={collectionName} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-neutral-200" />
                  <h2 className="shrink-0 text-xs font-black uppercase tracking-[0.25em] text-neutral-500">
                    {collectionName}
                  </h2>
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {collectionItems.map(renderCard)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map(renderCard)}
          </div>
        )
      )}

      {showDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-4 relative" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-3 right-3 p-2 rounded-full bg-neutral-100" onClick={() => setShowDetail(null)}><X size={16}/></button>
            <div className="flex flex-col gap-3">
              <img
                src={buildImageUrl(showDetail.imagePath)}
                alt={showDetail.title || ''}
                className="w-full max-h-[480px] object-contain rounded-xl border border-neutral-200"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.endsWith('.png')) {
                    img.src = img.src.replace('.png', '.jpg');
                  }
                }}
              />
              {(showDetail.title?.trim() || showDetail.collection?.trim()) && (
                <div className="space-y-1">
                  {showDetail.title?.trim() && showDetail.title.trim() !== 'Untitled' && (
                    <h2 className="text-lg font-black text-neutral-900">{showDetail.title}</h2>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDetailTab('vocabulary')}
                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors ${detailTab === 'vocabulary' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
                >
                  Vocabulary
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('text')}
                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors ${detailTab === 'text' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
                >
                  Text
                </button>
              </div>
              {detailTab === 'vocabulary' ? (
                <div className="flex flex-wrap gap-2">
                  {showDetail.words.length > 0 ? showDetail.words.map(w => {
                    const status = getWordStatus(w);
                    const style = getWordStyles(status);
                    return (
                      <span key={w} className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${style.badge}`}>
                        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                        {w}
                      </span>
                    );
                  }) : (
                    <p className="text-sm text-neutral-400">No linked vocabulary for this image.</p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                  {renderHighlightedText(showDetail.text)}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="flex items-center gap-2">{showDetail.collection?.trim() ? <><Tag size={12}/> {showDetail.collection}</> : null}</span>
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
