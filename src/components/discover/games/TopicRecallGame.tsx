/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { 
  Plus, 
  Search, 
  Upload, 
  Download, 
  Copy, 
  Trash2, 
  Edit3, 
  Image as ImageIcon, 
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Info,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Virtuoso } from 'react-virtuoso';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  rectIntersection
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getConfig, getServerUrl } from '../../../app/settingsManager';
import { User, VocabularyItem as LibraryWord } from '../../../app/types';
import { requestStudyBuddyChatResponse } from '../../common/StudyBuddy';

interface TopicRecallGameProps {
  words: LibraryWord[];
  user: User;
  onUpdateUser: (user: User) => Promise<void>;
  onComplete?: (score: number) => void;
  onExit?: () => void;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export interface Collocation {
  x: string;
  ds: string;
  e?: string;
}

export interface VocabItem {
  id: string;
  w: string; // headword
  m: string; // meaning
  ex: string; // example sentence(s)
  col: Collocation[];
}

export interface VocabData {
  vocab: VocabItem[];
}

export interface BrainstormItem {
  id: string;
  text: string;
  isCustom?: boolean;
}

// Configuration
const DEFAULT_IMAGE_SERVER_PATH = 'https://images.unsplash.com/photo-';
const DEFAULT_IMAGE = '1501854140801-50d01698950b?auto=format&fit=crop&q=80&w=1000';
const COMMON_TOPICS = ['Environment', 'Technology', 'Education', 'Health', 'Travel', 'Work', 'Society', 'Culture'];

const normalizeLibraryWords = (words: LibraryWord[]): VocabItem[] => {
  const deduped = new Map<string, VocabItem>();

  words.forEach((word) => {
    const headword = word.word?.trim();
    if (!headword) return;

    const key = headword.toLowerCase();
    if (deduped.has(key)) return;

    deduped.set(key, {
      id: word.id,
      w: headword,
      m: word.meaningVi || word.note || '',
      ex: word.example || '',
      col: Array.isArray(word.collocationsArray)
        ? word.collocationsArray
            .filter((item) => item && !item.isIgnored)
            .map((item) => ({
              x: item.text || '',
              ds: item.d || '',
              e: word.example || ''
            }))
            .filter((item) => item.x || item.ds)
        : []
    });
  });

  return Array.from(deduped.values()).sort((a, b) => a.w.localeCompare(b.w));
};

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);

const rankLibraryCandidates = (topic: string, vocab: VocabItem[], brainstorm: BrainstormItem[]) => {
  const topicTerms = tokenize(topic);
  const brainstormTerms = tokenize(brainstorm.map((item) => item.text).join(' '));
  const uniqueTerms = Array.from(new Set([...topicTerms, ...brainstormTerms]));

  return [...vocab]
    .map((item) => {
      const haystack = `${item.w} ${item.m} ${item.ex} ${item.col.map((c) => `${c.x} ${c.ds}`).join(' ')}`.toLowerCase();
      let score = 0;

      uniqueTerms.forEach((term) => {
        if (item.w.toLowerCase().includes(term)) score += 5;
        if (item.m.toLowerCase().includes(term)) score += 3;
        if (item.ex.toLowerCase().includes(term)) score += 2;
        if (haystack.includes(term)) score += 1;
      });

      if (item.col.length > 0) score += 0.5;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || a.item.w.localeCompare(b.item.w))
    .slice(0, 40)
    .map(({ item }) => item);
};

const extractImagesFromPayload = (payload: any): { url: string }[] => {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.images)
      ? payload.images
      : Array.isArray(payload?.results)
        ? payload.results
        : [];

  return rawItems
    .map((item: any) => {
      if (typeof item === 'string') return { url: item };
      const url = item?.url || item?.src || item?.imageUrl || item?.image;
      return typeof url === 'string' ? { url } : null;
    })
    .filter((item: { url: string } | null): item is { url: string } => !!item?.url);
};

const createBrainstormItems = (words: string[]): BrainstormItem[] =>
  words
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word, index) => ({
      id: `${word.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'item'}-${index}-${Date.now()}`,
      text: word,
      isCustom: true
    }));

const areWordListsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

// --- Components ---

interface SortableWordCardProps {
  key?: string | number;
  item: BrainstormItem;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

const SortableWordCard = ({ item, onDelete, onEdit }: SortableWordCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const handleSave = () => {
    onEdit(item.id, editText);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white/90 backdrop-blur-sm border-2 border-primary/20 rounded-xl p-3 shadow-lg hover:shadow-xl transition-all duration-200 cursor-default",
        isDragging && "opacity-50 scale-105 border-primary ring-2 ring-primary/50",
        item.isCustom ? "border-amber-400/50 bg-amber-50/90" : "border-indigo-400/50 bg-indigo-50/90"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-black/5 rounded">
          <div className="w-4 h-4 flex flex-col gap-0.5">
            <div className="w-full h-0.5 bg-gray-400 rounded-full" />
            <div className="w-full h-0.5 bg-gray-400 rounded-full" />
            <div className="w-full h-0.5 bg-gray-400 rounded-full" />
          </div>
        </div>

        {isEditing ? (
          <input
            autoFocus
            className="flex-1 bg-transparent border-b border-primary focus:outline-none font-bold text-indigo-900"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        ) : (
          <span className="flex-1 font-bold text-indigo-900 select-none" onDoubleClick={() => setIsEditing(true)}>
            {item.text}
          </span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setIsEditing(!isEditing)} className="p-1 hover:text-indigo-600">
            <Edit3 size={14} />
          </button>
          <button onClick={() => onDelete(item.id)} className="p-1 hover:text-rose-600">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const TopicRecallGame: React.FC<TopicRecallGameProps> = ({ words, user, onUpdateUser, onComplete, onExit }) => {
  // --- State ---
  // Tab state for mobile/iPad view
  const [activeTab, setActiveTab] = useState<'library' | 'canvas'>('library');
  const [vocab, setVocab] = useState<VocabItem[]>(() => normalizeLibraryWords(words || []));
  const [currentTopic, setCurrentTopic] = useState<string>(user.topicRecallData?.lastTopic || 'Environment');
  const [topicImages, setTopicImages] = useState<any[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [brainstormWords, setBrainstormWords] = useState<BrainstormItem[]>(() => {
    const initialTopic = user.topicRecallData?.lastTopic || 'Environment';
    const savedWords = user.topicRecallData?.topics?.find((item) => item.topic === initialTopic)?.words || [];
    return createBrainstormItems(savedWords);
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState<VocabItem | null>(null);
  const [showMeaning, setShowMeaning] = useState(true);
  const [showCollocation, setShowCollocation] = useState(true);
  const [newTopicName, setNewTopicName] = useState(user.topicRecallData?.lastTopic || 'Environment');
  const [customWordInput, setCustomWordInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // --- Sensors for DND ---
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- Effects ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative.flex-1')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setVocab(normalizeLibraryWords(words || []));
  }, [words]);

  const savedTopicEntries = user.topicRecallData?.topics || [];
  const availableTopics = useMemo(() => {
    const combined = [
      currentTopic,
      ...savedTopicEntries.map((item) => item.topic),
      ...COMMON_TOPICS
    ];

    return Array.from(new Set(combined.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [currentTopic, savedTopicEntries]);
  const isSavedTopicSelection = useMemo(
    () => savedTopicEntries.some((item) => item.topic === newTopicName.trim()),
    [newTopicName, savedTopicEntries]
  );

  const searchImages = async (query: string) => {
    const serverUrl = getServerUrl(getConfig());
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const endpoints = [
      `${serverUrl}/image/search?q=${encodeURIComponent(normalizedQuery)}`,
      `${serverUrl}/api/images/search?q=${encodeURIComponent(normalizedQuery)}`
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) continue;
        const payload = await res.json().catch(() => null);
        const images = extractImagesFromPayload(payload);
        if (images.length > 0) {
          return images;
        }
      } catch (_error) {
        // Try the next compatible endpoint.
      }
    }

    return [];
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitialTopicImage = async () => {
      const results = await searchImages(currentTopic);
      if (cancelled) return;
      setTopicImages(results);
      if (results.length > 0) {
        const randomIndex = Math.floor(Math.random() * results.length);
        setCurrentImageIndex(randomIndex);
      } else {
        setCurrentImageIndex(0);
      }
    };

    void loadInitialTopicImage();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setNewTopicName(currentTopic);
  }, [currentTopic]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedTopic = currentTopic.trim();
      if (!normalizedTopic) return;

      const nextWords = brainstormWords.map((item) => item.text.trim()).filter(Boolean);
      const previousTopics = user.topicRecallData?.topics || [];
      const existingTopic = previousTopics.find((item) => item.topic === normalizedTopic);
      const lastTopic = user.topicRecallData?.lastTopic;

      if (lastTopic === normalizedTopic && existingTopic && areWordListsEqual(existingTopic.words, nextWords)) {
        return;
      }

      const filteredTopics = previousTopics.filter((item) => item.topic !== normalizedTopic);
      const nextTopics = [
        {
          topic: normalizedTopic,
          words: nextWords,
          updatedAt: Date.now()
        },
        ...filteredTopics
      ].slice(0, 30);

      void onUpdateUser({
        ...user,
        topicRecallData: {
          lastTopic: normalizedTopic,
          topics: nextTopics
        }
      });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [brainstormWords, currentTopic, onUpdateUser, user]);

  // --- Helpers ---
  const filteredVocab = useMemo(() => {
    if (!searchQuery) return vocab;
    const q = searchQuery.toLowerCase();
    return vocab.filter(v => 
      (v.w && v.w.toLowerCase().includes(q)) || 
      (v.m && v.m.toLowerCase().includes(q)) || 
      (v.col && Array.isArray(v.col) && v.col.some(c => (c.x && c.x.toLowerCase().includes(q)) || (c.ds && c.ds.toLowerCase().includes(q))))
    );
  }, [vocab, searchQuery]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Handlers ---
  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as VocabData;
        if (data.vocab && Array.isArray(data.vocab)) {
          const sanitizedVocab = data.vocab.map(item => ({
            ...item,
            col: Array.isArray(item.col) ? item.col : []
          }));
          setVocab(sanitizedVocab);
          showToast(`Successfully loaded ${sanitizedVocab.length} words!`);
        } else {
          showToast("Invalid JSON format. Missing 'vocab' array.", "error");
        }
      } catch (err) {
        showToast("Failed to parse JSON file.", "error");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  const addToBrainstorm = (word: string) => {
    if (brainstormWords.some(w => w.text.toLowerCase() === word.toLowerCase())) {
      showToast("Word already in brainstorm!", "error");
      return;
    }
    const newItem: BrainstormItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: word,
      isCustom: false
    };
    setBrainstormWords(prev => [...prev, newItem]);
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4f46e5', '#818cf8', '#c7d2fe']
    });
  };

  const addCustomWord = (text: string) => {
    if (!text.trim()) return;
    if (brainstormWords.some(w => w.text.toLowerCase() === text.trim().toLowerCase())) {
      showToast("Word already in brainstorm!", "error");
      return;
    }
    const newItem: BrainstormItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      isCustom: true
    };
    setBrainstormWords(prev => [...prev, newItem]);
    setCustomWordInput('');
    setShowSuggestions(false);
  };

  const suggestions = useMemo(() => {
    if (!customWordInput.trim()) return [];
    const q = customWordInput.toLowerCase();
    return vocab
      .filter(v => v.w.toLowerCase().startsWith(q))
      .slice(0, 5);
  }, [vocab, customWordInput]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBrainstormWords((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return items;
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const evaluateUserResponse = () => {
    if (!currentTopic.trim()) {
      showToast("Please choose a topic first.", "error");
      return;
    }

    if (brainstormWords.length === 0) {
      showToast("Add a few words first before evaluating.", "error");
      return;
    }

    const brainstormList = brainstormWords.map((item, index) => `${index + 1}. ${item.text}`).join('\n');
    const candidateWords = rankLibraryCandidates(currentTopic, vocab, brainstormWords);
    const candidateBlock = candidateWords.length > 0
      ? candidateWords
          .slice(0, 20)
          .map((item, index) => `${index + 1}. ${item.w} - ${item.m || 'No meaning saved'}`)
          .join('\n')
      : 'No matching library words available.';

    const prompt = [
      `Ban la StudyBuddy dang ho tro mot nguoi hoc IELTS trong mini game Topic Recall.`,
      `Topic: "${currentTopic}".`,
      `Danh sach user da brainstorm:`,
      brainstormList,
      ``,
      `Hay danh gia tung tu xem co relevant voi topic hay khong, giai thich rat ngan gon bang tieng Viet.`,
      `Sau do de xuat khoang 10 tu chi duoc lay tu danh sach Word Library candidate ben duoi ma nguoi hoc co the dung cho topic nay.`,
      `Neu mot tu khong phu hop, hay noi ngan gon vi sao.`,
      `Trinh bay ngan gon, de doc, uu tien bullet list.`,
      ``,
      `Word Library candidate list:`,
      candidateBlock
    ].join('\n');

    requestStudyBuddyChatResponse(prompt);
    showToast("Sent to StudyBuddy chat!");
  };

  const downloadWordList = () => {
    if (vocab.length === 0) {
      showToast("No words in library to download.", "error");
      return;
    }
    const content = vocab.map(v => v.w).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ielts_word_list.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast("Word list downloaded!");
  };

  const suggestTopic = () => {
    const randomIndex = Math.floor(Math.random() * COMMON_TOPICS.length);
    const topic = COMMON_TOPICS[randomIndex];
    setNewTopicName(topic);
    void addTopic(topic);
  };

  const addTopic = async (topicName?: string) => {
    const name = topicName || newTopicName;
    if (!name.trim()) return;
    
    try {
      const results = await searchImages(name);
      const savedWords = user.topicRecallData?.topics?.find((item) => item.topic === name.trim())?.words || [];
      setTopicImages(results);
      if (results.length > 0) {
        const randomIndex = Math.floor(Math.random() * results.length);
        setCurrentImageIndex(randomIndex);
      } else {
        setCurrentImageIndex(0);
      }
      setCurrentTopic(name.trim());
      setBrainstormWords(createBrainstormItems(savedWords));
      setNewTopicName(name.trim());
      setIsTopicModalOpen(false);
      showToast(`Topic updated to: ${name.trim()}`);
    } catch (error) {
      showToast("Failed to fetch image for topic.", "error");
    }
  };

  const refreshTopicImage = () => {
    if (topicImages.length > 0) {
      const randomIndex = Math.floor(Math.random() * topicImages.length);
      setCurrentImageIndex(randomIndex);
    }
  };

  const deleteTopic = async () => {
    const targetTopic = newTopicName.trim();
    if (!targetTopic) {
      showToast("Choose a topic to delete.", "error");
      return;
    }

    const remainingTopics = savedTopicEntries.filter((item) => item.topic !== targetTopic);
    const fallbackTopic = remainingTopics[0]?.topic || COMMON_TOPICS[0] || 'Environment';

    await onUpdateUser({
      ...user,
      topicRecallData: {
        lastTopic: currentTopic === targetTopic ? fallbackTopic : (user.topicRecallData?.lastTopic === targetTopic ? fallbackTopic : user.topicRecallData?.lastTopic),
        topics: remainingTopics
      }
    });

    if (currentTopic === targetTopic) {
      const fallbackWords = remainingTopics.find((item) => item.topic === fallbackTopic)?.words || [];
      setCurrentTopic(fallbackTopic);
      setBrainstormWords(createBrainstormItems(fallbackWords));
      try {
        const results = await searchImages(fallbackTopic);
        setTopicImages(results);
        if (results.length > 0) {
          const randomIndex = Math.floor(Math.random() * results.length);
          setCurrentImageIndex(randomIndex);
        } else {
          setCurrentImageIndex(0);
        }
      } catch (_error) {
        setTopicImages([]);
        setCurrentImageIndex(0);
      }
    }

    setNewTopicName(fallbackTopic);
    showToast(`Deleted topic: ${targetTopic}`);
  };

  const currentImageUrl = topicImages[currentImageIndex]?.url || `${DEFAULT_IMAGE_SERVER_PATH}${DEFAULT_IMAGE}`;

  return (
    <div className="min-h-screen h-full bg-[#f8fafc] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* --- Header --- */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Active Topic Box */}
          <div className="flex-1">
            <div className="relative h-20 rounded-3xl overflow-visible shadow-sm bg-white border border-slate-200 flex items-center px-6 min-w-[320px]">
              <div className="flex-1 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Active Topic</span>
                    <div className="flex items-center gap-2 group/topic">
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                        {currentTopic || 'Select a Topic'}
                      </h2>
                      
                      {/* Image Hover Icon */}
                      <div className="relative">
                        <div className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-help">
                          <ImageIcon size={18} />
                        </div>
                        
                        {/* Hover Preview */}
                        <div className="absolute left-0 top-full mt-2 z-50 opacity-0 invisible group-hover/topic:opacity-100 group-hover/topic:visible transition-all duration-300 pointer-events-none group-hover/topic:pointer-events-auto">
                          <div className="bg-white p-2 rounded-2xl shadow-2xl border border-slate-200 w-64 overflow-hidden">
                            <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                              <img 
                                src={currentImageUrl} 
                                alt="Topic Preview" 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  refreshTopicImage();
                                }}
                                className="absolute bottom-2 right-2 p-2 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-lg text-white transition-all shadow-lg"
                                title="Load next image"
                              >
                                <RefreshCw size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={suggestTopic}
                        className="p-1.5 text-slate-300 hover:text-indigo-500 transition-colors"
                        title="Suggest Random Topic"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setNewTopicName(''); // Clear textbox when modal opens
                      setIsTopicModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 font-bold text-sm"
                  >
                    <Plus size={18} />
                    <span>Change Topic</span>
                  </button>
                  {/* Inline Buttons: Evaluate and Quit */}
                  <div className="flex items-center gap-2 ml-2">
                    <button 
                      onClick={evaluateUserResponse}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 shadow-md transition-all text-sm font-semibold"
                    >
                      <Copy size={16} />
                      <span>Evaluate</span>
                    </button>
                    <button 
                      onClick={onExit}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-100 text-rose-800 rounded-lg hover:bg-rose-200 shadow-md transition-all text-sm font-semibold"
                    >
                      <ArrowLeft size={18}/> Quit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 h-full">
        <div className="lg:grid lg:grid-cols-12 gap-8 h-full">
          {/* Mobile Tabs */}
          <div className="lg:hidden flex mb-4 gap-2">
            <button
              onClick={() => setActiveTab('library')}
              className={cn("flex-1 py-2 font-bold rounded-xl", activeTab === 'library' ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-600")}
            >
              Library
            </button>
            <button
              onClick={() => setActiveTab('canvas')}
              className={cn("flex-1 py-2 font-bold rounded-xl", activeTab === 'canvas' ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-600")}
            >
              Canvas
            </button>
          </div>

          {/* Panels */}
          <div
            className={cn(
              "lg:col-span-4 flex flex-col gap-6 h-full",
              activeTab === 'library' ? "block" : "hidden",
              "lg:block"
            )}
          >
            {/* Word Library Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Word Library</h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowMeaning(!showMeaning)} 
                      className={cn("p-1.5 rounded-lg transition-colors", showMeaning ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400")}
                      title={showMeaning ? "Hide Meanings" : "Show Meanings"}
                    >
                      {showMeaning ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button 
                      onClick={() => setShowCollocation(!showCollocation)} 
                      className={cn("p-1.5 rounded-lg transition-colors", showCollocation ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400")}
                      title={showCollocation ? "Hide Collocations" : "Show Collocations"}
                    >
                      {showCollocation ? <Info size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search words, meanings..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className={cn("flex-1 h-full", filteredVocab.length > 0 ? "overflow-auto" : "")}>
                {filteredVocab.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-400">No words found in library.</p>
                  </div>
                ) : (
                  <Virtuoso
                    style={{ height: '100%' }}
                    data={filteredVocab}
                    itemContent={(index, item) => (
                      <div className="px-4 py-2">
                        <motion.div 
                          layout
                          onClick={() => addToBrainstorm(item.w)}
                          className="group p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{item.w}</h3>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedWord(item);
                                }}
                                className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"
                                title="View Details"
                              >
                                <Eye size={16} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToBrainstorm(item.w);
                                }}
                                className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"
                                title="Add to Brainstorm"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                          {showMeaning && (
                            <p className="text-xs text-slate-500 line-clamp-2 mb-2">{item.m}</p>
                          )}
                          {showCollocation && item.col && Array.isArray(item.col) && item.col.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {item.col.slice(0, 2).map((c, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase tracking-tighter">
                                  {c.x}
                                </span>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      </div>
                    )}
                  />
                )}
              </div>
            </div>
          </div>

          <div
            className={cn(
              "lg:col-span-8 flex flex-col gap-6 h-full",
              activeTab === 'canvas' ? "block" : "hidden",
              "lg:block"
            )}
          >
            {/* Brainstorm Canvas Section */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm p-8 flex flex-col h-full relative overflow-auto">
              {/* Artistic Background Pattern */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none">
                <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              </div>

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Brainstorm Canvas</h3>
                    <p className="text-sm text-slate-500">Drag to reorder, double click to edit</p>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        placeholder="Type custom word..." 
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                        value={customWordInput}
                        onChange={(e) => {
                          setCustomWordInput(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addCustomWord(customWordInput);
                          }
                        }}
                      />
                      
                      {/* Autosuggestions Dropdown */}
                      <AnimatePresence>
                        {showSuggestions && suggestions.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
                          >
                            {suggestions.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  addToBrainstorm(s.w);
                                  setCustomWordInput('');
                                  setShowSuggestions(false);
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-between group"
                              >
                                <span className="font-medium">{s.w}</span>
                                <span className="text-[10px] text-slate-400 group-hover:text-indigo-400 uppercase font-bold">From Library</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <button 
                      onClick={() => addCustomWord(customWordInput)}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 relative">
                  {brainstormWords.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-50 rounded-3xl">
                      <Edit3 size={48} className="mb-4 opacity-20" />
                      <p className="font-bold text-lg">Start adding words!</p>
                      <p className="text-sm">Select from library or type above</p>
                    </div>
                  ) : (
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={rectIntersection}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={brainstormWords.map(w => w.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                          {brainstormWords.map((item) => (
                            <SortableWordCard 
                              key={item.id} 
                              item={item} 
                              onDelete={(id) => setBrainstormWords(prev => prev.filter(w => w.id !== id))}
                              onEdit={(id, text) => setBrainstormWords(prev => prev.map(w => w.id === id ? { ...w, text } : w))}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* --- Modals & Toasts --- */}
      <AnimatePresence>
        {isTopicModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTopicModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Add New Topic</h2>
                <button onClick={() => setIsTopicModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Select Topic</label>
                  <input
                    type="text"
                    placeholder="e.g. Global Warming"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onFocus={(e) => e.currentTarget.setAttribute('list', 'topic-recall-topic-options')}
                    list="topic-recall-topic-options"
                    onKeyDown={(e) => e.key === 'Enter' && void addTopic()}
                  />
                  <datalist id="topic-recall-topic-options">
                    {availableTopics.map((topic) => (
                      <option key={topic} value={topic} />
                    ))}
                  </datalist>
                </div>
                <div className="flex gap-3 mt-4">
                  {isSavedTopicSelection && (
                    <button
                      onClick={() => void deleteTopic()}
                      className="px-4 py-4 bg-rose-50 text-rose-700 rounded-xl font-bold hover:bg-rose-100 transition-all border border-rose-200"
                    >
                      Delete Topic
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      void addTopic();
                      setNewTopicName('');
                    }}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Set Topic
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {selectedWord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWord(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-black text-slate-900">{selectedWord.w}</h2>
                <button onClick={() => setSelectedWord(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Meaning</h3>
                  <p className="text-lg text-slate-700 leading-relaxed">{selectedWord.m}</p>
                </div>

                {selectedWord.col && selectedWord.col.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Collocations & Examples</h3>
                    <div className="space-y-4">
                      {selectedWord.col.map((c, i) => (
                        <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded uppercase tracking-tighter">
                              {c.x}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mb-2 italic">"{c.ds}"</p>
                          {c.e && (
                            <div className="pl-4 border-l-2 border-indigo-200">
                              <p className="text-sm text-slate-500">{c.e}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {toast && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className={cn(
              "flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-md",
              toast.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
            )}>
              {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="font-bold text-sm">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TopicRecallGame;
