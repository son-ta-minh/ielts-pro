import React, { useEffect, useMemo, useState } from 'react';
import { Search, FileText, Hash, Archive, Image as ImageIcon, BookText } from 'lucide-react';
import { User, StudyItem, Lesson } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import * as db from '../../app/db';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { getFuzzyPhraseScore, isFuzzyPhraseMatch } from '../../utils/fuzzyPhraseMatch';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { normalizeKeywordText } from '../../utils/vocabularyKeywordUtils';

interface Props {
  user: User;
  onViewWord: (word: StudyItem) => void;
  onOpenLesson?: (lessonId: string) => void;
  isModal?: boolean;
  onClose?: () => void;
  initialQuery?: string;
}

interface SearchHit {
  path: string;
  value: string;
}

interface GallerySearchItem {
  id: string;
  title?: string;
  collection: string;
  imagePath: string;
  words: string[];
  note?: string;
  text?: string;
}

type SearchMode = 'fast' | 'deep';
type SearchResultTab = 'text' | 'gallery';
type TextSearchResult<T> = { item: T; hits: SearchHit[]; score: number };

const MAX_RESULTS = 200;
const MAX_HITS_PER_WORD = 6;
const MAX_HITS_PER_LESSON = 6;
const DEEP_MATCH_THRESHOLD = 0.7;
const SEARCH_PREFERENCES_KEY = 'ielts_pro_search_preferences_v1';

const buildGalleryImageUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;

  const config = getConfig();
  const baseUrl = getServerUrl(config);

  if (!path.includes('/')) {
    const hasExt = /\.[a-zA-Z0-9]+$/.test(path);
    const fileName = hasExt ? path : `${path}.png`;
    return `${baseUrl}/api/images/stream/Gallery/${fileName}`;
  }

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (!cleanPath.startsWith('api/')) {
    return `${baseUrl}/api/audio/stream/${cleanPath}`;
  }

  return `${baseUrl}/${cleanPath}`;
};

const collectTextNodes = (value: unknown, path: string, output: SearchHit[]) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) output.push({ path, value: trimmed });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectTextNodes(item, `${path}[${index}]`, output);
    });
    return;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // skip ignored items (used in collocations, word family, paraphrases, etc.)
    if ('isIgnored' in obj && obj.isIgnored === true) {
      return;
    }

    Object.entries(obj).forEach(([key, child]) => {
      const nextPath = path ? `${path}.${key}` : key;
      collectTextNodes(child, nextPath, output);
    });
  }
};

const getSnippet = (text: string, query: string, around = 110): string => {
  if (!query) return text.length > around ? `${text.slice(0, around)}...` : text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return text.length > around ? `${text.slice(0, around)}...` : text;

  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + lowerQuery.length + 60);
  const slice = text.slice(start, end);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${slice}${suffix}`;
};

const renderWithHighlight = (text: string, query: string) => {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index < 0) return text;

  const before = text.slice(0, index);
  const hit = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <mark className="bg-amber-200 text-neutral-900 rounded px-0.5">{hit}</mark>
      {after}
    </>
  );
};

const getFriendlyPathLabel = (path: string) => {
  const lower = path.toLowerCase();

  if (!path) return 'General';

  if (lower.startsWith('collocationsarray')) {
    if (lower.endsWith('.text')) {
      return 'Collocation Text';
    }
    if (lower.endsWith('.d')) {
      return 'Collocation Context';
    }
    return 'Collocation';
  }

  if (lower.startsWith('wordfamily')) {
    const parts = lower.split('.');
    if (parts.length > 1) {
      const posRaw = parts[1].split('[')[0];
      const posMap: Record<string, string> = {
        noun: 'Word Family (Noun)',
        verb: 'Word Family (Verb)',
        adjective: 'Word Family (Adjective)',
        adj: 'Word Family (Adjective)',
        adverb: 'Word Family (Adverb)',
        adv: 'Word Family (Adverb)'
      };
      return posMap[posRaw] || 'Word Family';
    }
    return 'Word Family';
  }

  if (lower.startsWith('meaning')) {
    return 'Meaning';
  }

  if (lower.startsWith('keywords')) {
    return 'Keyword';
  }

  if (lower.startsWith('example')) {
    return 'Example';
  }

  if (lower.startsWith('paraphrase')) {
    return 'Paraphrase';
  }

  if (lower.startsWith('context')) {
    return 'Context';
  }

  if (lower.startsWith('lesson')) {
    return 'Lesson Content';
  }

  if (lower === 'title') {
    return 'Title';
  }

  if (lower === 'description') {
    return 'Description';
  }

  if (lower === 'content') {
    return 'Content';
  }

  if (lower === 'listeningcontent') {
    return 'Listening';
  }

  if (lower === 'testcontent') {
    return 'Test';
  }

  if (lower === 'searchkeywords' || lower.startsWith('searchkeywords[')) {
    return 'Search Keyword';
  }

  if (lower === 'tags' || lower.startsWith('tags[')) {
    return 'Tag';
  }

  if (lower === 'knowledgetype') {
    return 'Knowledge Type';
  }

  if (lower.startsWith('intensityrows')) {
    return 'Intensity';
  }

  if (lower.startsWith('comparisonrows')) {
    return 'Comparison';
  }

  if (lower.startsWith('mistakerows')) {
    return 'Mistake';
  }

  return 'Text';
};

export const SearchPage: React.FC<Props> = ({ user, onViewWord, isModal = false, onClose, initialQuery = '' }) => {
  const persistedPreferences = useMemo(
    () => getStoredJSON(SEARCH_PREFERENCES_KEY, { includeArchive: false, includeKnowledge: false, searchMode: 'fast' as SearchMode, exampleOnly: false }),
    []
  );
  const [allWords, setAllWords] = useState<StudyItem[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [galleryItems, setGalleryItems] = useState<GallerySearchItem[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery.trim());
  const [includeArchive, setIncludeArchive] = useState(Boolean(persistedPreferences.includeArchive));
  const [includeKnowledge, setIncludeKnowledge] = useState(Boolean(persistedPreferences.includeKnowledge));
  const [searchMode, setSearchMode] = useState<SearchMode>(persistedPreferences.searchMode === 'deep' ? 'deep' : 'fast');
  const [exampleOnly, setExampleOnly] = useState(Boolean(persistedPreferences.exampleOnly));
  const [activeTab, setActiveTab] = useState<SearchResultTab>('text');

  useEffect(() => {
    const refresh = async () => {
      const words = dataStore.getAllWords().filter(w => w.userId === user.id);
      setAllWords(words);

      const allLessons = await db.getLessonsByUserId();
      setLessons(allLessons.filter((lesson) => lesson.userId === user.id));
    };

    refresh();
    window.addEventListener('datastore-updated', refresh);
    return () => window.removeEventListener('datastore-updated', refresh);
  }, [user.id]);

  useEffect(() => {
    let isMounted = true;

    const loadGallery = async () => {
      try {
        const baseUrl = getServerUrl(getConfig());
        const res = await fetch(`${baseUrl}/api/gallery`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && Array.isArray(data)) {
          setGalleryItems(data);
        }
      } catch {
        // Ignore gallery fetch failures in search modal.
      }
    };

    loadGallery();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
    setSubmittedQuery(initialQuery.trim());
  }, [initialQuery]);

  useEffect(() => {
    setStoredJSON(SEARCH_PREFERENCES_KEY, { includeArchive, includeKnowledge, searchMode, exampleOnly });
  }, [includeArchive, includeKnowledge, searchMode, exampleOnly]);

  const normalizedQuery = submittedQuery.trim().toLowerCase();

  const handleSearchSubmit = () => {
    setSubmittedQuery(query.trim());
  };

  const results = useMemo(() => {
    if (!normalizedQuery) return [] as Array<{ word: StudyItem; hits: SearchHit[]; score: number }>;

    const computedResults = allWords
      .filter(word => includeArchive || !word.isPassive)
      .map(word => {
        const entries: SearchHit[] = [];
        collectTextNodes(word, '', entries);
        const hits = entries
          .map(entry => {
          const pathLower = entry.path.toLowerCase();

          // skip headword itself (already shown as the title)
          if (pathLower === 'word') {
            return null;
          }

          // ignore raw collocations
          if (pathLower === 'collocations' || pathLower.startsWith('collocations.')) {
            return null;
          }

          // ignore lesson content
          if (pathLower.startsWith('lesson')) {
            return null;
          }

          if (exampleOnly && !pathLower.startsWith('example')) {
            return null;
          }

          if (searchMode === 'fast') {
            return entry.value.toLowerCase().includes(normalizedQuery)
              ? { ...entry, matchScore: 1 }
              : null;
          }

          const matchScore = getFuzzyPhraseScore(normalizedQuery, entry.value);
          return isFuzzyPhraseMatch(normalizedQuery, entry.value, DEEP_MATCH_THRESHOLD)
            ? { ...entry, matchScore }
            : null;
        })
          .filter((entry): entry is SearchHit & { matchScore: number } => entry !== null)
          .sort((a, b) => b.matchScore - a.matchScore);

        if (hits.length === 0) return null;

        const exactWordStarts = word.word.toLowerCase().startsWith(normalizedQuery) ? 10 : 0;
        const exactWordContains = word.word.toLowerCase().includes(normalizedQuery) ? 5 : 0;
        const normalizedKeywords = (word.keywords || []).map((keyword) => normalizeKeywordText(keyword));
        const exactKeywordMatch = normalizedKeywords.some((keyword) => keyword === normalizedQuery) ? 9 : 0;
        const exactKeywordStarts = normalizedKeywords.some((keyword) => keyword.startsWith(normalizedQuery)) ? 6 : 0;
        const exactKeywordContains = normalizedKeywords.some((keyword) => keyword.includes(normalizedQuery)) ? 3 : 0;
        const deepKeywordScore = searchMode === 'deep'
          ? Math.max(0, ...normalizedKeywords.map((keyword) => getFuzzyPhraseScore(normalizedQuery, keyword))) * 8
          : 0;
        const deepWordScore = searchMode === 'deep' ? getFuzzyPhraseScore(normalizedQuery, word.word) * 10 : 0;
        const score = exactWordStarts + exactWordContains + exactKeywordMatch + exactKeywordStarts + exactKeywordContains + deepWordScore + deepKeywordScore + hits.reduce((sum, hit) => sum + hit.matchScore, 0);
        return { word, hits: hits.slice(0, MAX_HITS_PER_WORD), score };
      })
      .filter((item): item is { word: StudyItem; hits: SearchHit[]; score: number } => item !== null)
      .sort((a, b) => b.score - a.score || b.word.updatedAt - a.word.updatedAt)
      .slice(0, MAX_RESULTS);

    if (searchMode === 'deep') {
      console.groupCollapsed(`[Deep Search] "${normalizedQuery}" -> ${computedResults.length} results`);
      computedResults.forEach((result) => {
        console.log('Word:', result.word.word, 'score:', result.score);
        result.hits.forEach((hit) => {
          const matchScore = getFuzzyPhraseScore(normalizedQuery, hit.value);
          console.log('  hit:', {
            path: hit.path,
            label: getFriendlyPathLabel(hit.path),
            matchScore,
            value: hit.value
          });
        });
      });
      console.groupEnd();
    }

    return computedResults;
  }, [allWords, includeArchive, normalizedQuery, searchMode, exampleOnly]);

  const lessonResults = useMemo(() => {
    if (!normalizedQuery || !includeKnowledge) return [] as TextSearchResult<Lesson>[];

    return lessons
      .map((lesson) => {
        const entries: SearchHit[] = [];
        collectTextNodes({
          title: lesson.title,
          description: lesson.description,
          content: lesson.content,
          listeningContent: lesson.listeningContent,
          testContent: lesson.testContent,
          knowledgeType: lesson.knowledgeType,
          tags: lesson.tags || [],
          searchKeywords: lesson.searchKeywords || [],
          intensityRows: lesson.intensityRows || [],
          comparisonRows: lesson.comparisonRows || [],
          mistakeRows: lesson.mistakeRows || []
        }, '', entries);

        const hits = entries
          .map((entry) => {
            const pathLower = entry.path.toLowerCase();

            if (searchMode === 'fast') {
              return entry.value.toLowerCase().includes(normalizedQuery)
                ? { ...entry, matchScore: 1 }
                : null;
            }

            const matchScore = getFuzzyPhraseScore(normalizedQuery, entry.value);
            return isFuzzyPhraseMatch(normalizedQuery, entry.value, DEEP_MATCH_THRESHOLD)
              ? { ...entry, matchScore }
              : null;
          })
          .filter((entry): entry is SearchHit & { matchScore: number } => entry !== null)
          .sort((a, b) => b.matchScore - a.matchScore);

        if (hits.length === 0) return null;

        const normalizedLessonKeywords = (lesson.searchKeywords || []).map((keyword) => normalizeKeywordText(keyword));
        const normalizedLessonTags = (lesson.tags || []).map((tag) => normalizeKeywordText(tag));
        const titleValue = normalizeKeywordText(lesson.title || '');
        const descriptionValue = normalizeKeywordText(lesson.description || '');
        const knowledgeTypeValue = normalizeKeywordText(lesson.knowledgeType || '');

        const titleStarts = titleValue.startsWith(normalizedQuery) ? 12 : 0;
        const titleContains = titleValue.includes(normalizedQuery) ? 7 : 0;
        const descriptionContains = descriptionValue.includes(normalizedQuery) ? 2 : 0;
        const knowledgeTypeMatch = knowledgeTypeValue === normalizedQuery ? 6 : 0;
        const tagMatch = normalizedLessonTags.some((tag) => tag === normalizedQuery) ? 7 : 0;
        const tagStarts = normalizedLessonTags.some((tag) => tag.startsWith(normalizedQuery)) ? 4 : 0;
        const keywordMatch = normalizedLessonKeywords.some((keyword) => keyword === normalizedQuery) ? 8 : 0;
        const keywordStarts = normalizedLessonKeywords.some((keyword) => keyword.startsWith(normalizedQuery)) ? 5 : 0;
        const deepTitleScore = searchMode === 'deep' ? getFuzzyPhraseScore(normalizedQuery, lesson.title || '') * 10 : 0;
        const deepDescriptionScore = searchMode === 'deep' ? getFuzzyPhraseScore(normalizedQuery, lesson.description || '') * 4 : 0;
        const score = titleStarts + titleContains + descriptionContains + knowledgeTypeMatch + tagMatch + tagStarts + keywordMatch + keywordStarts + deepTitleScore + deepDescriptionScore + hits.reduce((sum, hit) => sum + hit.matchScore, 0);

        return { item: lesson, hits: hits.slice(0, MAX_HITS_PER_LESSON), score };
      })
      .filter((item): item is TextSearchResult<Lesson> => item !== null)
      .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)
      .slice(0, MAX_RESULTS);
  }, [includeKnowledge, lessons, normalizedQuery, searchMode]);

  const galleryResults = useMemo(() => {
    if (!normalizedQuery) return [] as GallerySearchItem[];

    return galleryItems
      .filter((item) => item.words.some((word) => word.toLowerCase().includes(normalizedQuery)))
      .sort((a, b) => {
        const aStarts = a.words.some((word) => word.toLowerCase().startsWith(normalizedQuery)) ? 1 : 0;
        const bStarts = b.words.some((word) => word.toLowerCase().startsWith(normalizedQuery)) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        return a.imagePath.localeCompare(b.imagePath);
      });
  }, [galleryItems, normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery || galleryResults.length === 0) {
      setActiveTab('text');
    }
  }, [normalizedQuery, galleryResults.length]);

  const shouldShowGalleryTab = isModal && normalizedQuery && galleryResults.length > 0;
  const hasAnyTextResult = results.length > 0 || lessonResults.length > 0;

  const content = (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white shadow-sm pt-6 pb-2 px-6 md:pt-4 md:pb-3 md:px-8">
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
            <button
              type="button"
              onClick={() => setSearchMode('fast')}
              className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${searchMode === 'fast' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              Fast Search
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('deep')}
              className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${searchMode === 'deep' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              Deep Search
            </button>
          </div>

          {isModal && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-red-300 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
            >
              X
            </button>
          ) : null}
        </div>


        <div className="mt-3 mb-0 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder="Type keyword to search full-text..."
              className="w-full pl-12 pr-4 py-2 rounded-xl border border-neutral-200 bg-neutral-50 text-xs font-black text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={handleSearchSubmit}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-neutral-800"
          >
            Search
          </button>
        </div>
        <div className="mt-3 flex gap-4">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600">
            <input
              type="checkbox"
              checked={includeArchive}
              onChange={(e) => setIncludeArchive(e.target.checked)}
              className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-700"
            />
            Include archive
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600">
            <input
              type="checkbox"
              checked={includeKnowledge}
              onChange={(e) => setIncludeKnowledge(e.target.checked)}
              className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-700"
            />
            Knowledge Library
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-600">
            <input
              type="checkbox"
              checked={exampleOnly}
              onChange={(e) => setExampleOnly(e.target.checked)}
              className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-700"
            />
            Example Only
          </label>
        </div>
      </div>

      <div className="bg-white pt-1 pb-6 px-6 md:pt-2 md:pb-8 md:px-8 shadow-sm">
        {!normalizedQuery && (
          <div className="text-center py-12 text-neutral-500">
            <FileText size={24} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-semibold text-sm">Type a keyword to start searching across your entire vocabulary database.</p>
          </div>
        )}

        {normalizedQuery && (
          <div className="space-y-4">
            {shouldShowGalleryTab && (
              <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${activeTab === 'text' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('gallery')}
                  className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${activeTab === 'gallery' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                >
                  Gallery
                </button>
              </div>
            )}

            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              {activeTab === 'gallery' && shouldShowGalleryTab
                ? `${galleryResults.length} image result${galleryResults.length === 1 ? '' : 's'} for "${normalizedQuery}" · Gallery`
                : `${results.length} vocab result${results.length === 1 ? '' : 's'}${includeKnowledge ? ` · ${lessonResults.length} knowledge result${lessonResults.length === 1 ? '' : 's'}` : ''} for "${normalizedQuery}" · ${searchMode === 'fast' ? 'Fast Search' : 'Deep Search'}${exampleOnly ? ' · Example Only' : ''}`}
            </p>

            {activeTab === 'gallery' && shouldShowGalleryTab ? (
              <>
                {galleryResults.length === 0 && (
                  <div className="text-center py-10 text-sm font-semibold text-neutral-400">No image match found.</div>
                )}

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {galleryResults.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                        <img
                          src={buildGalleryImageUrl(item.imagePath)}
                          alt={item.title || ''}
                          className="h-48 w-full object-contain"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src.endsWith('.png')) {
                              img.src = img.src.replace('.png', '.jpg');
                            }
                          }}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-neutral-400">
                        <ImageIcon size={12} />
                        Gallery
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.words.map((word) => (
                          <span
                            key={`${item.id}-${word}`}
                            className={`rounded-full px-2 py-1 text-xs font-bold ${
                              word.toLowerCase().includes(normalizedQuery)
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {renderWithHighlight(word, normalizedQuery)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {!hasAnyTextResult && (
                  <div className="text-center py-10 text-sm font-semibold text-neutral-400">No match found.</div>
                )}

                {results.length > 0 && (
                  <div className="space-y-3">
                    {includeKnowledge && (
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                        <FileText size={12} />
                        Vocabulary
                      </div>
                    )}
                    {results.map(result => (
                      <button
                        key={result.word.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onViewWord(result.word);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-full text-left p-4 rounded-2xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all"
                      >
                        {!exampleOnly && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-black text-neutral-900">{renderWithHighlight(result.word.word, normalizedQuery)}</h3>
                            {result.word.isPassive && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-neutral-100 text-neutral-500">
                                <Archive size={12} />
                                ARCHIVE
                              </span>
                            )}
                          </div>
                        )}

                        <div className={`${exampleOnly ? 'mt-1 space-y-1' : 'mt-3 space-y-2'}`}>
                          {result.hits.map((hit, index) => {
                            const snippet = exampleOnly ? hit.value : getSnippet(hit.value, normalizedQuery);
                            return (
                              <div
                                key={`${result.word.id}-${hit.path}-${index}`}
                                className={`text-sm text-neutral-600 leading-relaxed ${exampleOnly ? 'py-1' : ''}`}
                              >
                                {!exampleOnly && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wide mr-2">
                                    <Hash size={11} />
                                    {getFriendlyPathLabel(hit.path)}
                                  </span>
                                )}
                                <span>{renderWithHighlight(snippet, normalizedQuery)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {includeKnowledge && lessonResults.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                      <BookText size={12} />
                      Knowledge Library
                    </div>
                    {lessonResults.map((result) => (
                      <button
                        key={result.item.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenLesson?.(result.item.id);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-full text-left rounded-2xl border border-neutral-200 p-4 transition-all hover:border-neutral-300 hover:bg-neutral-50"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-neutral-900">{renderWithHighlight(result.item.title || 'Untitled lesson', normalizedQuery)}</h3>
                          {result.item.knowledgeType ? (
                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-sky-700">
                              {result.item.knowledgeType}
                            </span>
                          ) : null}
                          {result.item.type && result.item.type !== 'essay' ? (
                            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-neutral-500">
                              {result.item.type}
                            </span>
                          ) : null}
                        </div>
                        {result.item.description ? (
                          <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500">
                            {renderWithHighlight(getSnippet(result.item.description, normalizedQuery, 140), normalizedQuery)}
                          </p>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          {result.hits.map((hit, index) => {
                            const snippet = getSnippet(hit.value, normalizedQuery);
                            return (
                              <div key={`${result.item.id}-${hit.path}-${index}`} className="text-sm leading-relaxed text-neutral-600">
                                <span className="mr-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                                  <Hash size={11} />
                                  {getFriendlyPathLabel(hit.path)}
                                </span>
                                <span>{renderWithHighlight(snippet, normalizedQuery)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!isModal) return content;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[2rem]" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
};
