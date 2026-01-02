
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Search, Loader2, Play, CheckCircle2, XCircle, Tag, BrainCircuit, CheckSquare, Square, RotateCcw, Zap } from 'lucide-react';
import { VocabularyItem } from '../types';
import { getAllWordsForExport } from '../services/db';
import { generateSmartKeywords } from '../services/geminiService';

interface Props {
  userId: string;
  onStartSession: (selectedWords: VocabularyItem[]) => void;
}

const SmartSelection: React.FC<Props> = ({ userId, onStartSession }) => {
  const [topic, setTopic] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [matchedWords, setMatchedWords] = useState<VocabularyItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      const words = await getAllWordsForExport(userId);
      setAllWords(words);
    };
    fetchAll();
  }, [userId]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topic.trim()) return;

    setIsAnalyzing(true);
    setHasSearched(true);
    
    try {
      const keywords = await generateSmartKeywords(topic);
      setSuggestedKeywords(keywords);

      const matches = allWords.filter(item => {
        const itemContent = `
          ${item.word.toLowerCase()} 
          ${item.meaningVi.toLowerCase()} 
          ${item.tags.join(' ').toLowerCase()} 
          ${item.example.toLowerCase()}
        `;
        return keywords.some(kw => itemContent.includes(kw.toLowerCase())) || 
               itemContent.includes(topic.toLowerCase());
      });

      setMatchedWords(matches);
      // Select all by default
      setSelectedIds(new Set(matches.map(m => m.id)));
    } catch (err) {
      console.error("Smart selection error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleWord = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(matchedWords.map(m => m.id)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const smartPick = (count: number = 20) => {
    const now = Date.now();
    
    // Categorize for priority
    const due = matchedWords.filter(w => w.nextReview <= now);
    const fresh = matchedWords.filter(w => w.consecutiveCorrect === 0 && w.nextReview > now);
    const others = matchedWords.filter(w => w.consecutiveCorrect > 0 && w.nextReview > now);

    // Shuffle each category
    const shuffle = (arr: any[]) => [...arr].sort(() => Math.random() - 0.5);

    const pool = [...shuffle(due), ...shuffle(fresh), ...shuffle(others)];
    const selection = pool.slice(0, count);
    
    setSelectedIds(new Set(selection.map(s => s.id)));
  };

  const currentSelection = useMemo(() => {
    return matchedWords.filter(w => selectedIds.has(w.id));
  }, [matchedWords, selectedIds]);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <header className="max-w-2xl">
        <div className="inline-flex items-center px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
          <BrainCircuit size={12} className="mr-1.5" /> Intelligence Powered
        </div>
        <h2 className="text-4xl font-black text-neutral-900 tracking-tight">Smart Focus</h2>
        <p className="text-neutral-500 mt-2 text-lg">Focus your energy. Type a theme, and we'll prioritize words that need review or are brand new.</p>
      </header>

      <div className="max-w-3xl">
        <form onSubmit={handleSearch} className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            {isAnalyzing ? (
              <Loader2 className="animate-spin text-purple-500" size={24} />
            ) : (
              <Sparkles className="text-neutral-400 group-focus-within:text-purple-500 transition-colors" size={24} />
            )}
          </div>
          <input 
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Search topic (e.g. Technology, Health...)"
            className="w-full pl-14 pr-32 py-6 bg-white border-2 border-neutral-100 rounded-[2rem] text-xl font-medium focus:outline-none focus:border-purple-200 focus:ring-4 focus:ring-purple-50 transition-all shadow-xl shadow-neutral-100/50"
          />
          <button 
            type="submit"
            disabled={isAnalyzing || !topic.trim()}
            className="absolute right-3 top-3 bottom-3 px-8 bg-neutral-900 text-white rounded-[1.5rem] font-bold hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-50"
          >
            Analyze
          </button>
        </form>
      </div>

      {hasSearched && !isAnalyzing && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Controls */}
            <div className="lg:w-72 shrink-0 space-y-4">
              <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm space-y-4">
                <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-2">Quick Selection</div>
                <div className="space-y-2">
                  <button onClick={selectAll} className="w-full flex items-center space-x-2 p-3 text-xs font-bold text-neutral-600 hover:bg-neutral-50 rounded-xl transition-colors">
                    <CheckSquare size={16} /> <span>Select All</span>
                  </button>
                  <button onClick={selectNone} className="w-full flex items-center space-x-2 p-3 text-xs font-bold text-neutral-600 hover:bg-neutral-50 rounded-xl transition-colors">
                    <Square size={16} /> <span>Clear All</span>
                  </button>
                  <button onClick={() => smartPick(20)} className="w-full flex items-center space-x-2 p-3 text-xs font-black text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors border border-purple-100 shadow-sm">
                    <Zap size={16} fill="currentColor" /> <span>Pick 20 Smartly</span>
                  </button>
                </div>
                <div className="pt-4 border-t border-neutral-50">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Session Size</div>
                  <div className="text-2xl font-black text-neutral-900">{currentSelection.length} <span className="text-sm font-medium text-neutral-400">/ {matchedWords.length}</span></div>
                </div>
              </div>

              {currentSelection.length > 0 && (
                <button 
                  onClick={() => onStartSession(currentSelection)}
                  className="w-full py-5 bg-neutral-900 text-white rounded-[2rem] font-black flex items-center justify-center space-x-3 hover:bg-neutral-800 shadow-xl active:scale-95 transition-all"
                >
                  <Play size={20} fill="currentColor" />
                  <span>Start Focus Study</span>
                </button>
              )}
            </div>

            {/* Results Grid */}
            <div className="flex-1 bg-white p-8 rounded-[2.5rem] border border-neutral-100 shadow-sm">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-neutral-900">Matches for "{topic}"</h3>
                <p className="text-sm text-neutral-400 mt-1">
                  AI detected relevance to: {suggestedKeywords.slice(0, 4).join(', ')}...
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matchedWords.map(word => {
                  const isSelected = selectedIds.has(word.id);
                  const isDue = word.nextReview <= Date.now();
                  const isNew = word.consecutiveCorrect === 0;

                  return (
                    <div 
                      key={word.id}
                      onClick={() => toggleWord(word.id)}
                      className={`p-4 border-2 rounded-2xl flex items-center justify-between cursor-pointer transition-all group ${
                        isSelected 
                          ? 'bg-white border-neutral-900 shadow-md translate-y-[-2px]' 
                          : 'bg-neutral-50 border-transparent opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`p-1 rounded-md ${isSelected ? 'text-neutral-900' : 'text-neutral-300'}`}>
                          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-900 flex items-center">
                            {word.word}
                            {isDue && <span className="ml-2 w-2 h-2 bg-orange-500 rounded-full animate-pulse" title="Due Now" />}
                            {isNew && isSelected && <span className="ml-2 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase rounded">New</span>}
                          </div>
                          <div className="text-[10px] text-neutral-400 flex items-center mt-0.5">
                            <Tag size={8} className="mr-1" /> {word.tags[0] || 'IELTS'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {matchedWords.length === 0 && (
                <div className="py-20 text-center flex flex-col items-center space-y-4">
                  <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center text-neutral-300">
                    <Search size={32} />
                  </div>
                  <div className="max-w-xs text-neutral-400 text-sm font-medium">
                    No vocabulary found for "{topic}". Try adding more words or a different theme.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {!hasSearched && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { t: 'Climate Change', sub: 'Environment & Nature' },
            { t: 'Crime & Law', sub: 'Social Issues' },
            { t: 'Global Economy', sub: 'Work & Finance' }
          ].map(item => (
            <button 
              key={item.t}
              onClick={() => { setTopic(item.t); handleSearch(); }}
              className="p-8 bg-white border border-neutral-100 rounded-[2.5rem] text-left hover:border-purple-200 hover:shadow-lg transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Sparkles size={48} />
              </div>
              <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">{item.sub}</div>
              <div className="text-xl font-black text-neutral-900">{item.t}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartSelection;
