
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, NativeSpeakItem, FocusColor, ConversationItem, FreeTalkItem, AppView, QAItem, SpeakingYoutubeItem, ListeningSubtitleSegment } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Plus, Edit3, Trash2, AudioLines, MessageSquare, Play, Target, Pen, Tag, Shuffle, Search, LayoutGrid, X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { TagBrowser } from '../../components/common/TagBrowser';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getGenerateConversationPrompt } from '../../services/promptService';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { ResourceActions } from '../page/ResourceActions';
import { getConfig, getServerUrl } from '../../app/settingsManager';

// Import extracted components
import { AddEditNativeSpeakModal } from '../../components/speaking/AddEditNativeSpeakModal';
import { AddEditConversationModal } from '../../components/speaking/AddEditConversationModal';
import { AddEditFreeTalkModal } from '../../components/speaking/AddEditFreeTalkModal';
import { AddEditQAModal } from '../../components/speaking/AddEditQAModal';

import { SpeakingPracticeModal } from '../../components/speaking/SpeakingPracticeModal';
import { ConversationPracticeModal } from '../../components/speaking/ConversationPracticeModal';
import { FreeTalkPracticeModal } from '../../components/speaking/FreeTalkPracticeModal';
import { QAPracticeModal } from '../../components/speaking/QAPracticeModal';

const VIEW_SETTINGS_KEY = 'vocab_pro_speaking_card_view';

interface Props {
  user: User;
  onNavigate?: (view: AppView) => void;
}

type SpeakingItem =
  | { type: 'card'; data: NativeSpeakItem }
  | { type: 'qa'; data: QAItem }
  | { type: 'conversation'; data: ConversationItem }
  | { type: 'free_talk'; data: FreeTalkItem }
  | { type: 'youtube'; data: SpeakingYoutubeItem };

declare global {
    interface Window {
        YT?: any;
        onYouTubeIframeAPIReady?: () => void;
    }
}

let youtubeIframeApiPromise: Promise<any> | null = null;

const loadYouTubeIframeApi = () => {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

    youtubeIframeApiPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
        if (!existing) {
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.async = true;
            script.onerror = () => reject(new Error('Failed to load YouTube iframe API.'));
            document.body.appendChild(script);
        }

        window.onYouTubeIframeAPIReady = () => resolve(window.YT);

        window.setTimeout(() => {
            if (!window.YT?.Player) reject(new Error('YouTube iframe API timeout.'));
        }, 10000);

        if (window.YT?.Player) resolve(window.YT);
    });

    return youtubeIframeApiPromise;
};

const formatMediaTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const findActiveSubtitleIndex = (segments: ListeningSubtitleSegment[], currentTimeMs: number) => {
    return segments.findIndex((segment, index) => {
        const end = segment.startMs + Math.max(segment.durationMs, 600);
        const nextStart = segments[index + 1]?.startMs ?? Number.POSITIVE_INFINITY;
        return currentTimeMs >= segment.startMs && currentTimeMs < Math.max(end, nextStart);
    });
};

const SyncedSubtitleView: React.FC<{
    segments: ListeningSubtitleSegment[];
    currentTimeMs: number;
    onSeek: (timeMs: number) => void;
}> = ({ segments, currentTimeMs, onSeek }) => {
    const activeIndex = useMemo(() => findActiveSubtitleIndex(segments, currentTimeMs), [segments, currentTimeMs]);
    const activeRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [activeIndex]);

    return (
        <div className="h-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">Live Subtitle</p>
                <p className="text-xs font-bold text-neutral-500">{formatMediaTime(currentTimeMs)}</p>
            </div>
            <div className="select-text whitespace-pre-wrap text-lg leading-relaxed text-neutral-700">
                {segments.map((segment, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <span
                            key={`${segment.startMs}-${index}`}
                            ref={isActive ? activeRef : null}
                            onDoubleClick={() => onSeek(segment.startMs)}
                            className={`rounded-md px-1 py-0.5 transition-all ${isActive ? 'bg-amber-200 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'}`}
                            title="Double-click to jump"
                        >
                            {segment.text}{' '}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const YouTubePlayerPanel: React.FC<{
    videoId: string;
    onTimeChange: (timeMs: number) => void;
    seekToMsRef: React.MutableRefObject<((timeMs: number) => void) | null>;
}> = ({ videoId, onTimeChange, seekToMsRef }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);

    useEffect(() => {
        let pollingId: number | null = null;
        let mounted = true;

        loadYouTubeIframeApi()
            .then((YT) => {
                if (!mounted || !containerRef.current) return;

                playerRef.current = new YT.Player(containerRef.current, {
                    videoId,
                    playerVars: { rel: 0, modestbranding: 1 }
                });

                seekToMsRef.current = (timeMs: number) => {
                    playerRef.current?.seekTo?.(Math.max(0, timeMs / 1000), true);
                };

                pollingId = window.setInterval(() => {
                    const currentSeconds = Number(playerRef.current?.getCurrentTime?.() || 0);
                    onTimeChange(currentSeconds * 1000);
                }, 200);
            })
            .catch(() => onTimeChange(0));

        return () => {
            mounted = false;
            seekToMsRef.current = null;
            if (pollingId !== null) window.clearInterval(pollingId);
            playerRef.current?.destroy?.();
            playerRef.current = null;
        };
    }, [videoId, onTimeChange, seekToMsRef]);

    return <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 shadow-sm" />;
};

const YoutubeImportModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onImport: (url: string) => Promise<void>;
}> = ({ isOpen, onClose, onImport }) => {
    const [url, setUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setUrl('');
            setIsSubmitting(false);
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;
        setIsSubmitting(true);
        setError('');
        try {
            await onImport(url.trim());
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Import failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-[2rem] border border-neutral-200 bg-white shadow-2xl">
                <header className="flex items-start justify-between border-b border-neutral-100 px-8 py-6">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">New Youtube Card</h3>
                        <p className="mt-1 text-sm text-neutral-500">Paste a YouTube URL to create a speaking card with synced subtitle text.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100"><X size={20} /></button>
                </header>
                <main className="space-y-3 px-8 py-6">
                    <label className="block text-xs font-bold text-neutral-500">YouTube URL</label>
                    <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-neutral-900"
                        autoFocus
                    />
                    <p className="text-[11px] text-neutral-400">The card will use subtitle text as selectable transcript and sync highlight to the video.</p>
                    {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
                </main>
                <footer className="flex justify-end gap-3 border-t border-neutral-100 bg-neutral-50/50 px-8 py-5">
                    <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-100">Cancel</button>
                    <button type="submit" disabled={isSubmitting || !url.trim()} className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-black text-white disabled:opacity-50">
                        {isSubmitting ? 'Importing...' : 'Import'}
                    </button>
                </footer>
            </form>
        </div>
    );
};

const SpeakingYoutubePracticeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    item: SpeakingYoutubeItem | null;
}> = ({ isOpen, onClose, item }) => {
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const seekToMsRef = useRef<((timeMs: number) => void) | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setCurrentTimeMs(0);
        }
    }, [isOpen, item?.id]);

    if (!isOpen || !item) return null;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2.5rem] border border-neutral-200 bg-white shadow-2xl">
                <header className="flex items-center justify-between border-b border-neutral-100 px-8 py-6">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Youtube Speaking Practice</h3>
                        <p className="mt-1 max-w-[320px] truncate text-xs font-bold text-neutral-500">{item.title}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100"><X size={20} /></button>
                </header>
                <div className="grid flex-1 gap-6 overflow-hidden bg-neutral-50/50 p-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
                    <div className="flex min-h-0 flex-col gap-4">
                        <YouTubePlayerPanel videoId={item.youtubeVideoId} onTimeChange={setCurrentTimeMs} seekToMsRef={seekToMsRef} />
                        <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
                            Subtitle text is selectable. Double-click a subtitle chunk to jump the video.
                        </div>
                    </div>
                    <SyncedSubtitleView
                        segments={item.subtitleSegments || []}
                        currentTimeMs={currentTimeMs}
                        onSeek={(timeMs) => seekToMsRef.current?.(timeMs)}
                    />
                </div>
            </div>
        </div>
    );
};

const ScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
    if (score === undefined) return null;
    return (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${score >= 80 ? 'bg-green-50 text-green-700 border-green-200' : score >= 50 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {score}%
        </span>
    );
};

export const SpeakingCardPage: React.FC<Props> = ({ user, onNavigate }) => {
  const [items, setItems] = useState<SpeakingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const serverUrl = useMemo(() => getServerUrl(getConfig()), []);
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showTags: true, compact: false, resourceType: 'ALL' }));
  const handleSettingChange = (key: string, value: any) => setViewSettings(prev => ({ ...prev, [key]: value }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  
  // Edit Modals State
  const [isModalOpen, setIsModalOpen] = useState(false); // Native Speak
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const [isFreeTalkModalOpen, setIsFreeTalkModalOpen] = useState(false);
  const [isQAModalOpen, setIsQAModalOpen] = useState(false);
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<NativeSpeakItem | null>(null);
  const [editingConversation, setEditingConversation] = useState<ConversationItem | null>(null);
  const [editingFreeTalk, setEditingFreeTalk] = useState<FreeTalkItem | null>(null);
  const [editingQA, setEditingQA] = useState<QAItem | null>(null);

  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'card' | 'qa' | 'conversation' | 'free_talk' | 'youtube' } | null>(null);
  
  // AI Modals
  const [isConversationAiModalOpen, setIsConversationAiModalOpen] = useState(false);
  
  // Practice Modals State
  const [practiceModalItem, setPracticeModalItem] = useState<NativeSpeakItem | null>(null);
  const [practiceConversation, setPracticeConversation] = useState<ConversationItem | null>(null);
  const [practiceFreeTalk, setPracticeFreeTalk] = useState<FreeTalkItem | null>(null);
  const [qaPracticeData, setQaPracticeData] = useState<QAItem[] | null>(null);
  const [practiceYoutubeItem, setPracticeYoutubeItem] = useState<SpeakingYoutubeItem | null>(null);

  const { showToast } = useToast();
  
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    const [cards, qas, conversations, freeTalks, youtubeCards] = await Promise.all([
        db.getNativeSpeakItemsByUserId(user.id),
        db.getQAItemsByUserId(user.id),
        db.getConversationItemsByUserId(user.id),
        db.getFreeTalkItemsByUserId(user.id),
        db.getSpeakingYoutubeItemsByUserId(user.id)
    ]);
    const combined: SpeakingItem[] = [
        ...cards.map(c => ({ type: 'card' as const, data: c })),
        ...qas.map(q => ({ type: 'qa' as const, data: q })),
        ...conversations.map(c => ({ type: 'conversation' as const, data: c })),
        ...freeTalks.map(c => ({ type: 'free_talk' as const, data: c })),
        ...youtubeCards.map(c => ({ type: 'youtube' as const, data: c }))
    ];
    setItems(combined.sort((a, b) => b.data.createdAt - a.data.createdAt));
    if (!silent) setLoading(false);
  };

  useEffect(() => { loadData(); }, [user.id]);
  useEffect(() => { setPage(0); }, [selectedTag, pageSize, focusFilter, colorFilter, viewSettings.resourceType, searchQuery]);
  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const hasActiveFilters = useMemo(() => {
    return viewSettings.resourceType !== 'ALL' || focusFilter !== 'all' || colorFilter !== 'all';
  }, [viewSettings.resourceType, focusFilter, colorFilter]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter(item => {
      // Search
      if (q) {
          if (item.type === 'card') {
              if (!item.data.standard.toLowerCase().includes(q)) return false;
          } else if (item.type === 'conversation') {
               if (!item.data.title.toLowerCase().includes(q) && !(item.data.description || '').toLowerCase().includes(q)) return false;
          } else if (item.type === 'youtube') {
               if (!item.data.title.toLowerCase().includes(q) && !(item.data.transcript || '').toLowerCase().includes(q)) return false;
          } else {
               if (!item.data.title.toLowerCase().includes(q) && !item.data.content.toLowerCase().includes(q)) return false;
          }
      }

      if (viewSettings.resourceType !== 'ALL' && item.type.toUpperCase() !== viewSettings.resourceType) return false;
      if (focusFilter === 'focused' && !item.data.isFocused) return false;
      if (colorFilter !== 'all' && item.data.focusColor !== colorFilter) return false;
      if (selectedTag) {
          if (selectedTag === 'Uncategorized') { if (item.data.path && item.data.path !== '/') return false; } 
          else { if (!item.data.path?.startsWith(selectedTag) && !item.data.tags?.includes(selectedTag)) return false; }
      }
      return true;
    });
  }, [items, selectedTag, focusFilter, colorFilter, viewSettings.resourceType, searchQuery]);
  
  const pagedItems = useMemo(() => {
      const start = page * pageSize;
      return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  // --- Handlers ---

  const handleSaveItem = async (data: any) => {
    const now = Date.now();
    if (editingItem && editingItem.id) { 
        await dataStore.saveNativeSpeakItem({ ...editingItem, ...data, updatedAt: now }); 
    } else { 
        await dataStore.saveNativeSpeakItem({ id: `ns-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data }); 
    }
    setIsModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveConversation = async (formData: Partial<ConversationItem>) => {
    const now = Date.now();
    if (editingConversation && editingConversation.id) { 
        await dataStore.saveConversationItem({ ...editingConversation, ...formData, updatedAt: now } as ConversationItem); 
    } else { 
        await dataStore.saveConversationItem({ id: `conv-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, title: formData.title || '', description: formData.description || '', speakers: formData.speakers || [], sentences: formData.sentences || [], tags: formData.tags || [] } as ConversationItem); 
    }
    setIsConversationModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveFreeTalk = async (data: { title: string, content: string, tags: string[] }) => {
    const now = Date.now();
    if (editingFreeTalk && editingFreeTalk.id) {
        await dataStore.saveFreeTalkItem({ ...editingFreeTalk, ...data, updatedAt: now });
    } else {
        await dataStore.saveFreeTalkItem({ id: `ft-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data });
    }
    setIsFreeTalkModalOpen(false); loadData(); showToast("Essay Saved!", "success");
  };

  const handleEditItem = (item: SpeakingItem) => {
    if (item.type === 'card') { setEditingItem(item.data as NativeSpeakItem); setIsModalOpen(true); } 
    else if (item.type === 'conversation') { setEditingConversation(item.data as ConversationItem); setIsConversationModalOpen(true); }
    else if (item.type === 'free_talk') { setEditingFreeTalk(item.data as FreeTalkItem); setIsFreeTalkModalOpen(true); }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'card') await dataStore.deleteNativeSpeakItem(itemToDelete.id);
    else if (itemToDelete.type === 'qa') await dataStore.deleteQAItem(itemToDelete.id);
    else if (itemToDelete.type === 'conversation') await dataStore.deleteConversationItem(itemToDelete.id);
    else if (itemToDelete.type === 'free_talk') await dataStore.deleteFreeTalkItem(itemToDelete.id);
    else if (itemToDelete.type === 'youtube') await dataStore.deleteSpeakingYoutubeItem(itemToDelete.id);

    setItemToDelete(null); loadData(); showToast("Deleted!", "success");
  };

  const handleFocusChange = async (item: SpeakingItem, color: FocusColor | null) => {
      const updated = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete (updated as any).focusColor;
      
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else if (item.type === 'qa') await dataStore.saveQAItem(updated as QAItem);
      else if (item.type === 'conversation') await dataStore.saveConversationItem(updated as ConversationItem);
      else if (item.type === 'free_talk') await dataStore.saveFreeTalkItem(updated as FreeTalkItem);
      else if (item.type === 'youtube') await dataStore.saveSpeakingYoutubeItem(updated as SpeakingYoutubeItem);
      
      loadData();
  };
  
  const handleToggleFocus = async (item: SpeakingItem) => {
      const updated = { ...item.data, isFocused: !item.data.isFocused, updatedAt: Date.now() };
      
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else if (item.type === 'qa') await dataStore.saveQAItem(updated as QAItem);
      else if (item.type === 'conversation') await dataStore.saveConversationItem(updated as ConversationItem);
      else if (item.type === 'free_talk') await dataStore.saveFreeTalkItem(updated as FreeTalkItem);
      else if (item.type === 'youtube') await dataStore.saveSpeakingYoutubeItem(updated as SpeakingYoutubeItem);
      
      loadData();
  };

  const handleConversationAiResult = (data: any) => {
      setEditingConversation(prev => ({ ...prev || {}, title: data.title, description: data.description, speakers: data.speakers, sentences: data.sentences, tags: data.tags } as ConversationItem));
      setIsConversationAiModalOpen(false); showToast("Conversation generated!", "success");
  };

  const handleRandomize = () => {
    setItems(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Deck shuffled!", "success");
  };

  const handleCreateYoutubeCard = async (url: string) => {
      const response = await fetch(`${serverUrl}/api/youtube/transcript?url=${encodeURIComponent(url)}`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
          throw new Error(payload?.error || 'Failed to import YouTube subtitles.');
      }

      const now = Date.now();
      const newItem: SpeakingYoutubeItem = {
          id: `spk-yt-${now}-${Math.random()}`,
          userId: user.id,
          title: payload.title || 'Youtube Card',
          youtubeUrl: payload.youtubeUrl || url,
          youtubeVideoId: payload.videoId,
          transcript: payload.transcript || '',
          subtitleSegments: Array.isArray(payload.subtitleSegments) ? payload.subtitleSegments : [],
          tags: ['youtube-media'],
          note: 'Imported from YouTube',
          createdAt: now,
          updatedAt: now
      };

      await dataStore.saveSpeakingYoutubeItem(newItem);
      showToast('Youtube card created!', 'success');
      await loadData();
  };

  const QuickFilterBar = () => (
    <div className="flex flex-col gap-4 mb-6">
      {isTagBrowserOpen && (
        <TagBrowser
          items={items.map(i => i.data)}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          forcedView="tags"
          title="Browse Tags"
          icon={<Tag size={16} />}
        />
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-full sm:w-auto sm:flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search phrases, conversations..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 no-scrollbar">
          <button
            onClick={() => handleSettingChange('resourceType', 'ALL')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewSettings.resourceType === 'ALL' ? 'bg-neutral-900 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-900'}`}
          >
            <LayoutGrid size={12} /> All
          </button>
          <button
            onClick={() => handleSettingChange('resourceType', 'CARD')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewSettings.resourceType === 'CARD' ? 'bg-teal-600 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-teal-600'}`}
          >
            <AudioLines size={12} /> Expression
          </button>
          <button
            onClick={() => handleSettingChange('resourceType', 'CONVERSATION')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewSettings.resourceType === 'CONVERSATION' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-indigo-600'}`}
          >
            <MessageSquare size={12} /> Conversation
          </button>
          <button
            onClick={() => handleSettingChange('resourceType', 'FREE_TALK')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewSettings.resourceType === 'FREE_TALK' ? 'bg-cyan-600 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-cyan-600'}`}
          >
            <Pen size={12} /> Essay
          </button>
          <button
            onClick={() => handleSettingChange('resourceType', 'YOUTUBE')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewSettings.resourceType === 'YOUTUBE' ? 'bg-red-600 text-white shadow-md' : 'bg-white border border-neutral-200 text-neutral-500 hover:text-red-600'}`}
          >
            <Play size={12} /> Youtube
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
    <ResourcePage title="Listen & Speak" subtitle="Master listening comprehension and speaking skills." icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png" className="w-8 h-8 object-contain" alt="Speaking" />} 
    config={{}} isLoading={loading} isEmpty={filteredItems.length === 0} emptyMessage="No items found." activeFilters={{}} onFilterChange={() => {}} pagination={{ page, totalPages: Math.ceil(filteredItems.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredItems.length }} aboveGrid={<QuickFilterBar />} actions={<ResourceActions viewMenu={<ViewMenu isOpen={isViewMenuOpen} setIsOpen={setIsViewMenuOpen} hasActiveFilters={hasActiveFilters} filterOptions={[{ label: 'All', value: 'ALL', isActive: viewSettings.resourceType === 'ALL', onClick: () => handleSettingChange('resourceType', 'ALL') }, { label: 'Card', value: 'CARD', isActive: viewSettings.resourceType === 'CARD', onClick: () => handleSettingChange('resourceType', 'CARD') }, { label: 'Conv.', value: 'CONVERSATION', isActive: viewSettings.resourceType === 'CONVERSATION', onClick: () => handleSettingChange('resourceType', 'CONVERSATION') }, { label: 'Essay', value: 'FREE_TALK', isActive: viewSettings.resourceType === 'FREE_TALK', onClick: () => handleSettingChange('resourceType', 'FREE_TALK') }, { label: 'Youtube', value: 'YOUTUBE', isActive: viewSettings.resourceType === 'YOUTUBE', onClick: () => handleSettingChange('resourceType', 'YOUTUBE') }]} customSection={<><div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2"><Target size={10}/> Focus & Status</div><div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2"><button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>{focusFilter === 'focused' ? 'Focused Only' : 'All Items'}</button><div className="flex gap-1"><button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} /></div></div></>} viewOptions={[{ label: 'Show Tags', checked: viewSettings.showTags, onChange: () => setViewSettings(v => ({...v, showTags: !v.showTags})) }, { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }]} />} browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }} addActions={[
      { label: 'Test Simulation', icon: Play, onClick: () => { window.open('https://chatgpt.com/g/g-69064123ce508191a55e2aa3cf07e152-english-language-coach-for-ielts-speaking-test', '_blank'); } },
      { label: 'Youtube Card', icon: Play, onClick: () => { setIsYoutubeModalOpen(true); } },
      { label: 'New Question & Answer', icon: MessageSquare, onClick: () => { setIsQAModalOpen(true); } },
      { label: 'New Card', icon: Plus, onClick: () => { setEditingItem(null); setIsModalOpen(true); } },
      { label: 'New Conversation', icon: MessageSquare, onClick: () => { setEditingConversation(null); setIsConversationModalOpen(true); } },
      { label: 'New Essay', icon: Pen, onClick: () => { setEditingFreeTalk(null); setIsFreeTalkModalOpen(true); } }
    ]} extraActions={<><button onClick={handleRandomize} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button></>} />}>
      {() => (
        <>
          {(pagedItems as SpeakingItem[]).map((item) => {
              if (item.type === 'card') {
                 return (
                    <UniversalCard
                        key={item.data.id}
                        title={<div className="flex items-center gap-2 font-black text-neutral-900">{(item.data as NativeSpeakItem).standard}</div>}
                        badge={{ label: 'Native Expression', colorClass: 'bg-teal-50 text-teal-700 border-teal-100', icon: AudioLines }}
                        tags={viewSettings.showTags ? item.data.tags : undefined}
                        compact={viewSettings.compact}
                        onClick={() => setPracticeModalItem(item.data as NativeSpeakItem)}
                        focusColor={item.data.focusColor}
                        onFocusChange={(c) => handleFocusChange(item, c)}
                        isFocused={item.data.isFocused}
                        onToggleFocus={handleToggleFocus.bind(null, item)}
                        isCompleted={item.data.focusColor === 'green'}
                        actions={
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const card = item.data as NativeSpeakItem;
                                        const qa: QAItem[] = card.answers.map((ans: any, i: number) => ({
                                            id: `${card.id}-${i}`,
                                            q: card.standard,
                                            a: ans.sentence || ans
                                        }));
                                        setQaPracticeData(qa);
                                    }}
                                    className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Practice Q&A"
                                >
                                    <Play size={14}/>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingItem(item.data as NativeSpeakItem);
                                    setIsModalOpen(true);
                                  }}
                                  className="p-1.5 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Add Q&A"
                                >
                                  <Plus size={14}/>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"><Edit3 size={14}/></button>
                                <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'card' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14}/></button>
                            </div>
                        }
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as NativeSpeakItem).answers.length} variations</span>
                                <ScoreBadge score={(item.data as NativeSpeakItem).bestScore} />
                            </div>
                        </div>
                    </UniversalCard>
                 );
              }
              else if (item.type === 'qa') {
                  const qa = item.data as QAItem;
                  return (
                    <UniversalCard
                        key={qa.id}
                        title={<div className="flex items-center gap-2 font-black text-neutral-900">{qa.q}</div>}
                        badge={{ label: 'Q&A', colorClass: 'bg-purple-50 text-purple-700 border-purple-100', icon: MessageSquare }}
                        tags={viewSettings.showTags ? (qa as any).tags : undefined}
                        compact={viewSettings.compact}
                        onClick={() => setQaPracticeData([qa])}
                        focusColor={(qa as any).focusColor}
                        onFocusChange={(c) => handleFocusChange(item, c)}
                        isFocused={(qa as any).isFocused}
                        onToggleFocus={handleToggleFocus.bind(null, item)}
                        actions={
                            <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingQA(qa);
                                    setIsQAModalOpen(true);
                                  }}
                                  className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit3 size={14}/>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setItemToDelete({ id: qa.id, type: 'qa' });
                                  }}
                                  className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={14}/>
                                </button>
                            </div>
                        }
                    >
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Q&amp;A</span>
                        </div>
                    </UniversalCard>
                  );
              }
              else if (item.type === 'conversation') {
                  return (
                    <UniversalCard 
                        key={item.data.id} 
                        title={(item.data as ConversationItem).title} 
                        badge={{ label: 'Conversation', colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: MessageSquare }} 
                        tags={viewSettings.showTags ? item.data.tags : undefined} 
                        compact={viewSettings.compact} 
                        onClick={() => setPracticeConversation(item.data as ConversationItem)} 
                        focusColor={item.data.focusColor} 
                        onFocusChange={(c) => handleFocusChange(item, c)} 
                        isFocused={item.data.isFocused} 
                        onToggleFocus={handleToggleFocus.bind(null, item)} 
                        actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'conversation' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as ConversationItem).sentences.length} lines</span>
                                <ScoreBadge score={(item.data as ConversationItem).bestScore} />
                            </div>
                        </div>
                    </UniversalCard>
                  );
              } else if (item.type === 'youtube') {
                  const youtubeItem = item.data as SpeakingYoutubeItem;
                  return (
                    <UniversalCard
                        key={youtubeItem.id}
                        title={youtubeItem.title}
                        badge={{ label: 'Youtube Card', colorClass: 'bg-red-50 text-red-700 border-red-100', icon: Play }}
                        tags={viewSettings.showTags ? youtubeItem.tags : undefined}
                        compact={viewSettings.compact}
                        onClick={() => setPracticeYoutubeItem(youtubeItem)}
                        focusColor={youtubeItem.focusColor}
                        onFocusChange={(c) => handleFocusChange(item, c)}
                        isFocused={youtubeItem.isFocused}
                        onToggleFocus={handleToggleFocus.bind(null, item)}
                        actions={<><button onClick={(e) => { e.stopPropagation(); setPracticeYoutubeItem(youtubeItem); }} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Practice"><Play size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: youtubeItem.id, type: 'youtube' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>}
                    >
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{youtubeItem.subtitleSegments.length} subtitle chunks</span>
                        </div>
                    </UniversalCard>
                  );
              } else {
                  // Calculate metadata for display
                  const sentenceCount = (item.data as FreeTalkItem).content.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.length || 0;
                  const bestScore = (item.data as FreeTalkItem).bestScore;
                  
                  return (
                    <UniversalCard 
                        key={item.data.id} 
                        title={(item.data as FreeTalkItem).title} 
                        badge={{ label: 'Essay', colorClass: 'bg-cyan-50 text-cyan-700 border-cyan-100', icon: Pen }} 
                        tags={viewSettings.showTags ? item.data.tags : undefined} 
                        compact={viewSettings.compact} 
                        onClick={() => setPracticeFreeTalk(item.data as FreeTalkItem)} 
                        focusColor={item.data.focusColor} 
                        onFocusChange={(c) => handleFocusChange(item, c)} 
                        isFocused={item.data.isFocused} 
                        onToggleFocus={handleToggleFocus.bind(null, item)} 
                        actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'free_talk' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
                    >
                        <div className="flex justify-between items-center mt-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{sentenceCount} Sentences</span>
                                <ScoreBadge score={bestScore} />
                            </div>
                        </div>
                    </UniversalCard>
                  );
              }
          })}
        </>
      )}
    </ResourcePage>
    
    <AddEditNativeSpeakModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveItem} initialData={editingItem} />
    <AddEditConversationModal isOpen={isConversationModalOpen} onClose={() => setIsConversationModalOpen(false)} onSave={handleSaveConversation} initialData={editingConversation} onOpenAiGen={() => setIsConversationAiModalOpen(true)} />
    <AddEditFreeTalkModal isOpen={isFreeTalkModalOpen} onClose={() => setIsFreeTalkModalOpen(false)} onSave={handleSaveFreeTalk} initialData={editingFreeTalk} />
    <AddEditQAModal
      isOpen={isQAModalOpen}
      initialData={editingQA || undefined}
      onClose={() => { setIsQAModalOpen(false); setEditingQA(null); }}
      onSave={async (data) => {
        const now = Date.now();
        const qa: QAItem = editingQA
          ? { ...editingQA, q: data.title, a: data.content, tags: data.tags, updatedAt: now }
          : {
              id: `qa-${now}-${Math.random()}`,
              userId: user.id,
              q: data.title,
              a: data.content,
              tags: data.tags,
              createdAt: now,
              updatedAt: now
            } as any;

        await dataStore.saveQAItem(qa);

        setIsQAModalOpen(false);
        setEditingQA(null);
        loadData();
        showToast('Q&A Saved!', 'success');
      }}
    />

    <ConfirmationModal isOpen={!!itemToDelete} title="Delete Item?" message="This action cannot be undone." confirmText="Delete" isProcessing={false} onConfirm={handleConfirmDelete} onClose={() => setItemToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />

    <YoutubeImportModal
      isOpen={isYoutubeModalOpen}
      onClose={() => setIsYoutubeModalOpen(false)}
      onImport={handleCreateYoutubeCard}
    />
    
    {isConversationAiModalOpen && <UniversalAiModal isOpen={isConversationAiModalOpen} onClose={() => setIsConversationAiModalOpen(false)} type="GENERATE_UNIT" title="AI Conversation Creator" description="Enter a topic to generate a dialogue." initialData={{}} onGeneratePrompt={(i) => getGenerateConversationPrompt(i.request)} onJsonReceived={handleConversationAiResult} actionLabel="Generate" closeOnSuccess={true} />}
    
    <SpeakingPracticeModal isOpen={!!practiceModalItem} onClose={() => { setPracticeModalItem(null); loadData(true); }} item={practiceModalItem} />
    <ConversationPracticeModal isOpen={!!practiceConversation} onClose={() => { setPracticeConversation(null); loadData(true); }} item={practiceConversation} />
    <FreeTalkPracticeModal isOpen={!!practiceFreeTalk} onClose={() => { setPracticeFreeTalk(null); loadData(true); }} item={practiceFreeTalk} />
    <SpeakingYoutubePracticeModal isOpen={!!practiceYoutubeItem} onClose={() => { setPracticeYoutubeItem(null); loadData(true); }} item={practiceYoutubeItem} />
    <QAPracticeModal
      isOpen={!!qaPracticeData}
      onClose={() => setQaPracticeData(null)}
      data={qaPracticeData || []}
    />
    </>
  );
};

export default SpeakingCardPage;
