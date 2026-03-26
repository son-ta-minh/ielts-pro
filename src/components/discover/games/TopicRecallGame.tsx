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
  ArrowLeft,
  BookOpenCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Virtuoso } from 'react-virtuoso';
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

export interface BrainstormGroup {
  id: string;
  name: string;
  words: BrainstormItem[];
  isDefault?: boolean;
}

// Configuration
const DEFAULT_IMAGE_SERVER_PATH = 'https://images.unsplash.com/photo-';
const DEFAULT_IMAGE = '1501854140801-50d01698950b?auto=format&fit=crop&q=80&w=1000';
const COMMON_TOPICS = ['Environment', 'Technology', 'Education', 'Health', 'Travel', 'Work', 'Society', 'Culture'];
const DEFAULT_GROUP_NAME = 'Default Group';

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

const createBrainstormGroup = (name = DEFAULT_GROUP_NAME, words: string[] = [], isDefault = false): BrainstormGroup => ({
  id: `group-${Math.random().toString(36).slice(2, 10)}`,
  name,
  words: createBrainstormItems(words),
  isDefault
});

const createBrainstormGroupsFromSavedTopic = (topicState?: User['topicRecallData'] extends { topics: infer T } ? any : never): BrainstormGroup[] => {
  const savedGroups = Array.isArray(topicState?.groups) ? topicState.groups : [];

  if (savedGroups.length > 0) {
    return savedGroups.map((group: any, index: number) => ({
      id: group.id || `group-${index}-${Date.now()}`,
      name: group.name || (index === 0 ? DEFAULT_GROUP_NAME : `Group ${index + 1}`),
      words: createBrainstormItems(Array.isArray(group.words) ? group.words : []),
      isDefault: index === 0
    }));
  }

  const legacyWords = Array.isArray(topicState?.words) ? topicState.words : [];
  return [createBrainstormGroup(DEFAULT_GROUP_NAME, legacyWords, true)];
};

const areWordListsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const areGroupListsEqual = (
  left: { name: string; words: string[] }[],
  right: { name: string; words: string[] }[]
) =>
  left.length === right.length &&
  left.every((group, index) =>
    group.name === right[index]?.name && areWordListsEqual(group.words, right[index]?.words || [])
  );

// --- Components ---

export const TopicRecallGame: React.FC<TopicRecallGameProps> = ({ words, user, onUpdateUser, onComplete, onExit }) => {
  // --- State ---
  // Tab state for mobile/iPad view
  const [activeTab, setActiveTab] = useState<'library' | 'canvas'>('library');
  const [vocab, setVocab] = useState<VocabItem[]>(() => normalizeLibraryWords(words || []));
  const [currentTopic, setCurrentTopic] = useState<string>(user.topicRecallData?.lastTopic || 'Environment');
  const [topicImages, setTopicImages] = useState<any[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [brainstormGroups, setBrainstormGroups] = useState<BrainstormGroup[]>(() => {
    const initialTopic = user.topicRecallData?.lastTopic || 'Environment';
    const savedTopic = user.topicRecallData?.topics?.find((item) => item.topic === initialTopic);
    return createBrainstormGroupsFromSavedTopic(savedTopic);
  });
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    const initialTopic = user.topicRecallData?.lastTopic || 'Environment';
    const savedTopic = user.topicRecallData?.topics?.find((item) => item.topic === initialTopic);
    return createBrainstormGroupsFromSavedTopic(savedTopic)[0]?.id || createBrainstormGroup().id;
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
  const [newGroupName, setNewGroupName] = useState('');
  const [canvasMode, setCanvasMode] = useState<'view' | 'edit'>('view');
  const [showUnusedOnly, setShowUnusedOnly] = useState(false);

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
    if (!brainstormGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(brainstormGroups[0]?.id || '');
    }
  }, [brainstormGroups, selectedGroupId]);

  const brainstormWords = useMemo(
    () => brainstormGroups.flatMap((group) => group.words),
    [brainstormGroups]
  );

  const wordTopicUsageMap = useMemo(() => {
    const usage = new Map<string, string[]>();

    savedTopicEntries.forEach((topicEntry) => {
      const sourceWords = Array.isArray(topicEntry.groups) && topicEntry.groups.length > 0
        ? topicEntry.groups.flatMap((group) => group.words || [])
        : topicEntry.words || [];

      Array.from(new Set(sourceWords.map((word) => word.trim()).filter(Boolean))).forEach((word) => {
        const key = word.toLowerCase();
        const existing = usage.get(key) || [];
        if (!existing.includes(topicEntry.topic)) {
          usage.set(key, [...existing, topicEntry.topic]);
        }
      });
    });

    return usage;
  }, [savedTopicEntries]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedTopic = currentTopic.trim();
      if (!normalizedTopic) return;

      const previousTopics = user.topicRecallData?.topics || [];
      const existingTopic = previousTopics.find((item) => item.topic === normalizedTopic);
      const lastTopic = user.topicRecallData?.lastTopic;
      const serializedGroups = brainstormGroups.map((group) => ({
        id: group.id,
        name: group.name.trim() || DEFAULT_GROUP_NAME,
        words: group.words.map((item) => item.text.trim()).filter(Boolean)
      }));
      const serializedWords = serializedGroups.flatMap((group) => group.words);
      const existingGroups = (existingTopic?.groups || []).map((group) => ({
        name: group.name,
        words: group.words || []
      }));

      if (
        lastTopic === normalizedTopic &&
        existingTopic &&
        areWordListsEqual(existingTopic.words || [], serializedWords) &&
        areGroupListsEqual(existingGroups, serializedGroups.map(({ name, words }) => ({ name, words })))
      ) {
        return;
      }

      const filteredTopics = previousTopics.filter((item) => item.topic !== normalizedTopic);
      const nextTopics = [
        {
          topic: normalizedTopic,
          words: serializedWords,
          groups: serializedGroups,
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
  }, [brainstormGroups, currentTopic, onUpdateUser, user]);

  // --- Helpers ---
  const filteredVocab = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return vocab.filter(v => {
      const matchesSearch = !searchQuery || (
        (v.w && v.w.toLowerCase().includes(q)) || 
        (v.m && v.m.toLowerCase().includes(q)) || 
        (v.col && Array.isArray(v.col) && v.col.some(c => (c.x && c.x.toLowerCase().includes(q)) || (c.ds && c.ds.toLowerCase().includes(q))))
      );

      if (!matchesSearch) return false;
      if (!showUnusedOnly) return true;

      return (wordTopicUsageMap.get(v.w.toLowerCase()) || []).length === 0;
    });
  }, [searchQuery, showUnusedOnly, vocab, wordTopicUsageMap]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const wordExistsInTopic = (text: string) =>
    brainstormWords.some((item) => item.text.toLowerCase() === text.trim().toLowerCase());

  const updateWordInGroups = (wordId: string, updater: (word: BrainstormItem) => BrainstormItem | null) => {
    setBrainstormGroups((prev) =>
      prev.map((group) => ({
        ...group,
        words: group.words
          .map((word) => (word.id === wordId ? updater(word) : word))
          .filter((word): word is BrainstormItem => !!word)
      }))
    );
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
    if (wordExistsInTopic(word)) {
      showToast("Word already in brainstorm!", "error");
      return;
    }
    const newItem: BrainstormItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: word,
      isCustom: false
    };
    setBrainstormGroups((prev) => {
      const targetGroupId = selectedGroupId || prev[0]?.id;
      return prev.map((group) =>
        group.id === targetGroupId
          ? { ...group, words: [...group.words, newItem] }
          : group
      );
    });
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4f46e5', '#818cf8', '#c7d2fe']
    });
  };

  const addCustomWord = (text: string) => {
    if (!text.trim()) return;
    if (wordExistsInTopic(text)) {
      showToast("Word already in brainstorm!", "error");
      return;
    }
    const newItem: BrainstormItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.trim(),
      isCustom: true
    };
    setBrainstormGroups((prev) => {
      const targetGroupId = selectedGroupId || prev[0]?.id;
      return prev.map((group) =>
        group.id === targetGroupId
          ? { ...group, words: [...group.words, newItem] }
          : group
      );
    });
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

  const addGroup = () => {
    const name = newGroupName.trim() || `Group ${brainstormGroups.length + 1}`;
    const nextGroup: BrainstormGroup = createBrainstormGroup(name);

    setBrainstormGroups((prev) => {
      const insertIndex = prev.findIndex((group) => group.id === selectedGroupId);
      if (insertIndex === -1) return [...prev, nextGroup];
      const next = [...prev];
      next.splice(insertIndex + 1, 0, nextGroup);
      return next;
    });
    setSelectedGroupId(nextGroup.id);
    setNewGroupName('');
  };

  const renameGroup = (groupId: string, nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;
    setBrainstormGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, name: normalizedName } : group))
    );
  };

  const deleteGroup = (groupId: string) => {
    if (brainstormGroups.length === 1) {
      showToast("At least one group is required.", "error");
      return;
    }

    setBrainstormGroups((prev) => {
      const groupToDelete = prev.find((group) => group.id === groupId);
      const fallbackGroup = prev.find((group) => group.id !== groupId) || prev[0];
      return prev
        .filter((group) => group.id !== groupId)
        .map((group) =>
          group.id === fallbackGroup?.id
            ? { ...group, words: [...group.words, ...(groupToDelete?.words || [])] }
            : group
        );
    });

    if (selectedGroupId === groupId) {
      const fallbackGroupId = brainstormGroups.find((group) => group.id !== groupId)?.id || '';
      setSelectedGroupId(fallbackGroupId);
    }
  };

  const removeWordFromTopic = (wordId: string) => {
    updateWordInGroups(wordId, () => null);
  };

  const editWordInTopic = (wordId: string, text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      removeWordFromTopic(wordId);
      return;
    }

    const duplicate = brainstormWords.some(
      (word) => word.id !== wordId && word.text.toLowerCase() === normalizedText.toLowerCase()
    );
    if (duplicate) {
      showToast("Word already exists in this topic.", "error");
      return;
    }

    updateWordInGroups(wordId, (word) => ({ ...word, text: normalizedText }));
  };

  const moveWordToGroup = (wordId: string, targetGroupId: string) => {
    if (!targetGroupId) return;

    let movedWord: BrainstormItem | null = null;

    setBrainstormGroups((prev) => {
      const removed = prev.map((group) => ({
        ...group,
        words: group.words.filter((word) => {
          if (word.id === wordId) {
            movedWord = word;
            return false;
          }
          return true;
        })
      }));

      if (!movedWord) return prev;

      return removed.map((group) =>
        group.id === targetGroupId
          ? { ...group, words: [...group.words, movedWord as BrainstormItem] }
          : group
      );
    });
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
      const savedTopic = user.topicRecallData?.topics?.find((item) => item.topic === name.trim());
      const restoredGroups = createBrainstormGroupsFromSavedTopic(savedTopic);
      setTopicImages(results);
      if (results.length > 0) {
        const randomIndex = Math.floor(Math.random() * results.length);
        setCurrentImageIndex(randomIndex);
      } else {
        setCurrentImageIndex(0);
      }
      setCurrentTopic(name.trim());
      setBrainstormGroups(restoredGroups);
      setSelectedGroupId(restoredGroups[0]?.id || '');
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
      const fallbackSavedTopic = remainingTopics.find((item) => item.topic === fallbackTopic);
      const fallbackGroups = createBrainstormGroupsFromSavedTopic(fallbackSavedTopic);
      setCurrentTopic(fallbackTopic);
      setBrainstormGroups(fallbackGroups);
      setSelectedGroupId(fallbackGroups[0]?.id || '');
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
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 pt-0 pb-4">
        <div className="max-w-9xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: Active Topic Box */}
          <div className="flex-1">
            <div className="relative min-h-[80px] rounded-3xl overflow-visible shadow-sm bg-white border border-slate-200 flex flex-wrap items-center px-6 py-4 min-w-[320px]">
              <div className="flex-1 flex flex-wrap items-center justify-between gap-2">
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
                        className="flex items-center gap-1 p-1.5 text-slate-300 hover:text-indigo-500 transition-colors"
                        title="Suggest Random Topic"
                      >
                        <RefreshCw size={16} />
                        <span className="text-sm font-semibold hidden sm:inline">Suggest</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={() => {
                      setNewTopicName(''); // Clear textbox when modal opens
                      setIsTopicModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 font-bold text-sm"
                  >
                    <Plus size={18} />
                    <span className="hidden sm:inline">Change Topic</span>
                  </button>
                  {/* Inline Buttons: Evaluate and Quit */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      onClick={evaluateUserResponse}
                      className="flex items-center gap-1 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 shadow-md transition-all text-sm font-semibold"
                    >
                      <Copy size={16} />
                      <span className="hidden sm:inline">Evaluate</span>
                    </button>
                    <button 
                      onClick={onExit}
                      className="flex items-center gap-1 px-4 py-2 bg-rose-100 text-rose-800 rounded-lg hover:bg-rose-200 shadow-md transition-all text-sm font-semibold"
                    >
                      <ArrowLeft size={18}/>
                      <span className="hidden sm:inline">Quit</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-9xl mx-auto h-full">
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
              "w-full flex flex-col gap-6 h-full",
              activeTab === 'library' ? "block" : "hidden",
              "lg:col-span-4 lg:block"
            )}
          >
            {/* Word Library Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Word Library</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowUnusedOnly((prev) => !prev)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg transition-colors",
                        showUnusedOnly ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                      )}
                      title={showUnusedOnly ? "Showing unused words only" : "Show words unused in all topics"}
                    >
                      <BookOpenCheck size={14} />
                    </button>
                    <button 
                      onClick={() => setShowMeaning(!showMeaning)} 
                      className={cn("flex items-center gap-1 px-2 py-1 rounded-lg transition-colors", showMeaning ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400")}
                      title={showMeaning ? "Hide Meanings" : "Show Meanings"}
                    >
                      {showMeaning ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button 
                      onClick={() => setShowCollocation(!showCollocation)} 
                      className={cn("flex items-center gap-1 px-2 py-1 rounded-lg transition-colors", showCollocation ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400")}
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
                                className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-indigo-600 rounded transition-colors"
                                title="View Details"
                              >
                                <Eye size={16} />
                                <span className="text-xs font-medium hidden sm:inline">Details</span>
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToBrainstorm(item.w);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-indigo-600 rounded transition-colors"
                                title="Add to Brainstorm"
                              >
                                <Plus size={16} />
                                <span className="text-xs font-medium hidden sm:inline">Add</span>
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
              "w-full flex flex-col gap-6 h-full",
              activeTab === 'canvas' ? "block" : "hidden",
              "lg:col-span-8 lg:block"
            )}
          >
            {/* Brainstorm Canvas Section */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm p-8 flex flex-col h-full relative overflow-auto">
              {/* Artistic Background Pattern */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none">
                <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              </div>

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="hidden sm:block text-xl font-bold text-slate-900">Brainstorm Canvas</h3>
                      <p className="hidden sm:block text-sm text-slate-500">
                        {canvasMode === 'view'
                          ? 'Browse your grouped ideas without edit controls.'
                          : 'Organize your topic words into groups you can expand, rename, and prune.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <div className="inline-flex rounded-xl bg-slate-100 p-1">
                        <button
                          onClick={() => setCanvasMode('view')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                            canvasMode === 'view' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                          )}
                        >
                          View
                        </button>
                        <button
                          onClick={() => setCanvasMode('edit')}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                            canvasMode === 'edit' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                          )}
                        >
                          Edit
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="New group name..."
                        className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addGroup();
                        }}
                      />
                      <button
                        onClick={addGroup}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors text-sm font-semibold"
                      >
                        <Plus size={16} />
                        <span>Add Group</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 relative">
                    <div className="relative flex-1 min-w-[220px]">
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
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {brainstormGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button 
                      onClick={() => addCustomWord(customWordInput)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-semibold"
                    >
                      <Plus size={18} />
                      <span>Add Word</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 relative">
                  {brainstormWords.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-50 rounded-3xl">
                      <Edit3 size={48} className="mb-4 opacity-20" />
                      <p className="font-bold text-lg">Start adding words!</p>
                      <p className="text-sm">Select from library or type above, then organize them into groups</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {brainstormGroups.map((group) => (
                        <div key={group.id} className="rounded-2xl border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
                          <div className="flex flex-wrap items-center gap-2 justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                            <div className="flex items-center gap-2">
                              {canvasMode === 'edit' ? (
                                <input
                                  type="text"
                                  value={group.name}
                                  onChange={(e) => renameGroup(group.id, e.target.value)}
                                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                              ) : (
                                <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-900">
                                  {group.name}
                                </div>
                              )}
                            </div>
                            {canvasMode === 'edit' && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setSelectedGroupId(group.id)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                                    selectedGroupId === group.id
                                      ? "bg-indigo-600 text-white"
                                      : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:text-indigo-600"
                                  )}
                                >
                                  Add Here
                                </button>
                                <button
                                  onClick={() => deleteGroup(group.id)}
                                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                  title="Delete group"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="p-4">
                            {group.words.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-400">
                                No words yet in this group.
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                {group.words.map((item) => (
                                  <div
                                    key={item.id}
                                    className={cn(
                                      "group inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-2 shadow-sm",
                                      item.isCustom ? "border-amber-300 bg-amber-50/80" : "border-indigo-200 bg-indigo-50/70"
                                    )}
                                  >
                                    {canvasMode === 'edit' ? (
                                      <>
                                        <input
                                          value={item.text}
                                          onChange={(e) => editWordInTopic(item.id, e.target.value)}
                                          className="min-w-[80px] max-w-[220px] bg-transparent font-bold text-slate-900 focus:outline-none"
                                          size={Math.max(item.text.length, 6)}
                                        />
                                        <select
                                          value={group.id}
                                          onChange={(e) => moveWordToGroup(item.id, e.target.value)}
                                          className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        >
                                          {brainstormGroups.map((targetGroup) => (
                                            <option key={targetGroup.id} value={targetGroup.id}>
                                              {targetGroup.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          onClick={() => removeWordFromTopic(item.id)}
                                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                          title="Delete word from topic"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </>
                                    ) : (
                                      <div className="font-bold text-slate-900 whitespace-nowrap">
                                        {item.text}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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

                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Used In Topics</h3>
                  {(wordTopicUsageMap.get(selectedWord.w.toLowerCase()) || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(wordTopicUsageMap.get(selectedWord.w.toLowerCase()) || []).map((topic) => (
                        <span key={topic} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">This word is not used in any saved topic yet.</p>
                  )}
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
