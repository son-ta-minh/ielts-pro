import React, { useEffect, useMemo, useState } from 'react';
import { Search, FileText, Hash, Archive } from 'lucide-react';
import { User, VocabularyItem } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { getFuzzyPhraseScore, isFuzzyPhraseMatch } from '../../utils/fuzzyPhraseMatch';

interface Props {
  user: User;
  onViewWord: (word: VocabularyItem) => void;
  isModal?: boolean;
  onClose?: () => void;
  initialQuery?: string;
}

interface SearchHit {
  path: string;
  value: string;
}

type SearchMode = 'fast' | 'deep';

const MAX_RESULTS = 200;
const MAX_HITS_PER_WORD = 6;
const DEEP_MATCH_THRESHOLD = 0.7;
const SEARCH_PREFERENCES_KEY = 'ielts_pro_search_preferences_v1';

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

  return 'Text';
};

export const SearchPage: React.FC<Props> = ({ user, onViewWord, isModal = false, onClose, initialQuery = '' }) => {
  const persistedPreferences = useMemo(
    () => getStoredJSON(SEARCH_PREFERENCES_KEY, { includeArchive: false, searchMode: 'fast' as SearchMode, exampleOnly: false }),
    []
  );
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery.trim());
  const [includeArchive, setIncludeArchive] = useState(Boolean(persistedPreferences.includeArchive));
  const [searchMode, setSearchMode] = useState<SearchMode>(persistedPreferences.searchMode === 'deep' ? 'deep' : 'fast');
  const [exampleOnly, setExampleOnly] = useState(Boolean(persistedPreferences.exampleOnly));

  useEffect(() => {
    const refresh = () => {
      const words = dataStore.getAllWords().filter(w => w.userId === user.id);
      setAllWords(words);
    };

    refresh();
    window.addEventListener('datastore-updated', refresh);
    return () => window.removeEventListener('datastore-updated', refresh);
  }, [user.id]);

  useEffect(() => {
    setQuery(initialQuery);
    setSubmittedQuery(initialQuery.trim());
  }, [initialQuery]);

  useEffect(() => {
    setStoredJSON(SEARCH_PREFERENCES_KEY, { includeArchive, searchMode, exampleOnly });
  }, [includeArchive, searchMode, exampleOnly]);

  const normalizedQuery = submittedQuery.trim().toLowerCase();

  const handleSearchSubmit = () => {
    setSubmittedQuery(query.trim());
  };

  const results = useMemo(() => {
    if (!normalizedQuery) return [] as Array<{ word: VocabularyItem; hits: SearchHit[]; score: number }>;

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
        const deepWordScore = searchMode === 'deep' ? getFuzzyPhraseScore(normalizedQuery, word.word) * 10 : 0;
        const score = exactWordStarts + exactWordContains + deepWordScore + hits.reduce((sum, hit) => sum + hit.matchScore, 0);
        return { word, hits: hits.slice(0, MAX_HITS_PER_WORD), score };
      })
      .filter((item): item is { word: VocabularyItem; hits: SearchHit[]; score: number } => item !== null)
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
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              {results.length} result{results.length === 1 ? '' : 's'} for "{normalizedQuery}" · {searchMode === 'fast' ? 'Fast Search' : 'Deep Search'}{exampleOnly ? ' · Example Only' : ''}
            </p>

            {results.length === 0 && (
              <div className="text-center py-10 text-sm font-semibold text-neutral-400">No match found.</div>
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
