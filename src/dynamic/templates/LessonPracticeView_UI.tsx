import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Lesson } from '../../app/types';
import { ArrowLeft, Edit3, Play, Pause, Square, Headphones, Sparkles, Volume2, RefreshCw, Loader2, BookText, ClipboardList, GalleryHorizontalEnd, ScrollText, ChevronLeft, ChevronRight, Menu, Zap, Split } from 'lucide-react';
import { parseMarkdown } from '../../utils/markdownParser';
import { speak, stopSpeaking, prefetchSpeech } from '../../utils/audio';
import { IntensityTable } from '../../components/common/IntensityTable';
import { ComparisonTable } from '../../components/common/ComparisonTable';

interface Props {
  lesson: Lesson;
  onComplete: () => void;
  onEdit: () => void;
  onUpdate?: (updated: Lesson) => void;
  onAddSound?: () => void;
  onAddTest?: () => void;
}

interface Chapter {
    title: string;
    content: string;
}

const splitContentIntoChapters = (markdown: string): Chapter[] => {
    if (!markdown) return [];
    
    const lines = markdown.split('\n');
    const chapters: Chapter[] = [];
    let currentTitle = "Introduction";
    let currentBody: string[] = [];

    const pushChapter = () => {
        if (currentBody.length > 0 || (chapters.length === 0 && currentTitle === "Introduction")) {
            const bodyText = currentBody.join('\n').trim();
            if (bodyText || chapters.length > 0) {
                 chapters.push({ 
                    title: currentTitle, 
                    content: currentBody.join('\n') 
                });
            }
        }
    };

    lines.forEach(line => {
        const headerMatch = line.trim().match(/^(#{1,3})\s+(.+)/);
        if (headerMatch) {
            pushChapter();
            currentTitle = headerMatch[2].trim();
            currentBody = [line]; 
        } else {
            currentBody.push(line);
        }
    });
    
    pushChapter();
    
    if (chapters.length > 1 && chapters[0].title === "Introduction" && !chapters[0].content.trim()) {
        chapters.shift();
    }

    return chapters.length > 0 ? chapters : [{ title: "Lesson", content: markdown }];
};

export const LessonPracticeViewUI: React.FC<Props> = ({ lesson, onComplete, onEdit, onAddSound, onAddTest }) => {
    const [activeTab, setActiveTab] = useState<'READING' | 'LISTENING' | 'TEST' | 'INTENSITY' | 'COMPARISON'>('READING');
    const [viewMode, setViewMode] = useState<'SCROLL' | 'PAGED'>('SCROLL');
    const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

    const [playbackState, setPlaybackState] = useState<'IDLE' | 'PLAYING' | 'PAUSED'>('IDLE');
    const [currentSoundIdx, setCurrentSoundIdx] = useState(-1);
    const [isBufferingNext, setIsBufferingNext] = useState(false);
    const [downloadedCount, setDownloadedCount] = useState(0); 
    
    const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
    const chapterMenuRef = useRef<HTMLDivElement>(null);
    
    const stopAudioRef = useRef(false);
    const audioBuffer = useRef<Map<number, Blob>>(new Map());
    const downloadPromises = useRef<Map<number, Promise<Blob | null>>>(new Map());

    // Auto-switch tabs if specialized data exists
    useEffect(() => {
        if (lesson.type === 'intensity' && lesson.intensityRows && lesson.intensityRows.length > 0) {
            setActiveTab('INTENSITY');
        } else if (lesson.type === 'comparison' && lesson.comparisonRows && lesson.comparisonRows.length > 0) {
            setActiveTab('COMPARISON');
        }
    }, [lesson]);

    const rawContent = useMemo(() => {
        if (activeTab === 'READING') return lesson.content || "";
        if (activeTab === 'LISTENING') return lesson.listeningContent || "";
        return lesson.testContent || "";
    }, [lesson, activeTab]);

    const chapters = useMemo(() => splitContentIntoChapters(rawContent), [rawContent]);
    const chapterHeadingIndex = useMemo(() => {
        const map = new Map<string, number>();
        chapters.forEach((chapter, idx) => {
            chapter.content.split('\n').forEach(line => {
                const headerMatch = line.trim().match(/^#{1,4}\s+(.+)/);
                if (!headerMatch) return;
                const heading = headerMatch[1].trim().toLowerCase();
                if (heading && !map.has(heading)) map.set(heading, idx);
            });
        });
        return map;
    }, [chapters]);

    useEffect(() => {
        setCurrentChapterIdx(0);
    }, [activeTab]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chapterMenuRef.current && !chapterMenuRef.current.contains(event.target as Node)) {
                setIsChapterMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const contentHtml = useMemo(() => {
        if (viewMode === 'SCROLL') {
            return parseMarkdown(rawContent);
        } else {
            const chapter = chapters[currentChapterIdx] || chapters[0];
            return parseMarkdown(chapter?.content || "");
        }
    }, [rawContent, viewMode, chapters, currentChapterIdx]);

    const speechBlocks = useMemo(() => {
        if (!lesson.listeningContent) return [];
        const regex = /\[Audio-(VN|EN)\]([\s\S]*?)\[\/\]/gi;
        const blocks = [];
        let match;
        while ((match = regex.exec(lesson.listeningContent)) !== null) {
            blocks.push({
                lang: (match[1].toUpperCase() === 'VN' ? 'vi' : 'en') as 'vi' | 'en',
                text: match[2].replace(/\[.*?\]/g, '').trim() 
            });
        }
        return blocks;
    }, [lesson.listeningContent]);

    const getSegmentBlob = (index: number): Promise<Blob | null> => {
        if (audioBuffer.current.has(index)) return Promise.resolve(audioBuffer.current.get(index)!);
        if (downloadPromises.current.has(index)) return downloadPromises.current.get(index)!;

        const block = speechBlocks[index];
        const promise = prefetchSpeech(block.text, block.lang).then(blob => {
            if (blob) {
                audioBuffer.current.set(index, blob);
                setDownloadedCount(prev => prev + 1);
            }
            return blob;
        });
        downloadPromises.current.set(index, promise);
        return promise;
    };

    const startSequentialPrefetch = async (startIndex: number) => {
        for (let i = startIndex; i < speechBlocks.length; i++) {
            if (stopAudioRef.current) break;
            await getSegmentBlob(i);
        }
    };

    const handlePlayAll = async () => {
        if (playbackState === 'PAUSED') {
            setPlaybackState('PLAYING');
            stopAudioRef.current = false;
        } else {
            stopAudioRef.current = false;
            setPlaybackState('PLAYING');
            startSequentialPrefetch(0);
        }
        
        const startFrom = currentSoundIdx === -1 ? 0 : currentSoundIdx;

        for (let i = startFrom; i < speechBlocks.length; i++) {
            if (stopAudioRef.current) break;
            
            setCurrentSoundIdx(i);
            const block = speechBlocks[i];
            
            let blob = audioBuffer.current.get(i);
            if (!blob) {
                setIsBufferingNext(true);
                blob = await getSegmentBlob(i);
                setIsBufferingNext(false);
            }
            
            if (stopAudioRef.current) break;

            try {
                await speak(block.text, true, block.lang, undefined, undefined, blob || undefined);
            } catch (e) {
                console.error("Speech playback error at index", i, e);
            }
        }
        
        if (!stopAudioRef.current) {
            setPlaybackState('IDLE');
            setCurrentSoundIdx(-1);
            setDownloadedCount(0);
            audioBuffer.current.clear();
            downloadPromises.current.clear();
        }
    };

    const handleStop = () => {
        stopAudioRef.current = true;
        stopSpeaking();
        setPlaybackState('IDLE');
        setCurrentSoundIdx(-1);
        setDownloadedCount(0);
        audioBuffer.current.clear();
        downloadPromises.current.clear();
        setIsBufferingNext(false);
    };

    useEffect(() => {
        (window as any).handleLessonSpeak = (text: string, lang?: 'en' | 'vi') => {
            speak(text, false, lang);
        };
        return () => {
            handleStop();
            delete (window as any).handleLessonSpeak;
        };
    }, []);

    useEffect(() => {
        (window as any).resolveMarkdownNav = (query: string) => {
            if (viewMode !== 'PAGED') return false;
            if (activeTab === 'INTENSITY' || activeTab === 'COMPARISON') return false;

            const chapterIdx = chapterHeadingIndex.get(query);
            if (chapterIdx === undefined) return false;

            const navigateAndScroll = () => {
                const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')) as HTMLElement[];
                const exact = headings.find(h => (h.textContent || '').trim().toLowerCase() === query);
                const fuzzy = headings.find(h => (h.textContent || '').trim().toLowerCase().includes(query));
                const target = exact || fuzzy;
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            };

            if (chapterIdx !== currentChapterIdx) {
                setCurrentChapterIdx(chapterIdx);
                requestAnimationFrame(() => requestAnimationFrame(navigateAndScroll));
            } else {
                navigateAndScroll();
            }
            return true;
        };

        return () => {
            delete (window as any).resolveMarkdownNav;
        };
    }, [viewMode, activeTab, chapterHeadingIndex, currentChapterIdx]);

    // Tab Availability Logic
    const hasListening = !!lesson.listeningContent;
    const hasTest = !!lesson.testContent;
    const hasIntensity = !!(lesson.intensityRows && lesson.intensityRows.length > 0);
    const hasComparison = !!(lesson.comparisonRows && lesson.comparisonRows.length > 0);
    
    // Always have Reading available
    const availableTabCount = (hasIntensity ? 1 : 0) + (hasComparison ? 1 : 0) + 1 + (hasListening ? 1 : 0) + (hasTest ? 1 : 0);

    useEffect(() => {
        if (viewMode === 'PAGED') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentChapterIdx, viewMode]);

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-40 animate-in fade-in duration-300 relative min-h-screen">
            <header className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                     <button onClick={onComplete} className="w-fit flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider">
                        <ArrowLeft size={14} /><span>Back to Library</span>
                    </button>
                    
                    {chapters.length > 1 && activeTab !== 'INTENSITY' && activeTab !== 'COMPARISON' && (
                        <div className="flex bg-neutral-100 p-1 rounded-xl">
                            <button 
                                onClick={() => setViewMode('SCROLL')}
                                className={`p-2 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase ${viewMode === 'SCROLL' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Scroll View"
                            >
                                <ScrollText size={14} /> <span className="hidden sm:inline">Scroll</span>
                            </button>
                            <button 
                                onClick={() => setViewMode('PAGED')}
                                className={`p-2 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase ${viewMode === 'PAGED' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                                title="Chapter View"
                            >
                                <GalleryHorizontalEnd size={14} /> <span className="hidden sm:inline">Paged</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">{lesson.title}</h2>
                        
                        {/* Only show tab bar if more than 1 tab is available */}
                        {availableTabCount > 1 && (
                            <div className="flex bg-neutral-100 p-1 rounded-xl gap-1 w-fit mt-2">
                                {hasIntensity && (
                                    <button 
                                        onClick={() => setActiveTab('INTENSITY')}
                                        className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'INTENSITY' ? 'bg-white text-orange-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                                    >
                                        <Zap size={12} className="inline mr-1"/> Scale
                                    </button>
                                )}
                                {hasComparison && (
                                    <button 
                                        onClick={() => setActiveTab('COMPARISON')}
                                        className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'COMPARISON' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                                    >
                                        <Split size={12} className="inline mr-1"/> Contrast
                                    </button>
                                )}
                                <button 
                                    onClick={() => setActiveTab('READING')}
                                    className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'READING' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                                >
                                    <BookText size={12} className="inline mr-1"/> Read
                                </button>
                                {hasListening && (
                                    <button 
                                        onClick={() => setActiveTab('LISTENING')}
                                        className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'LISTENING' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                                    >
                                        <Headphones size={12} className="inline mr-1"/> Listen
                                    </button>
                                )}
                                {hasTest && (
                                    <button 
                                        onClick={() => setActiveTab('TEST')}
                                        className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'TEST' ? 'bg-white text-emerald-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                                    >
                                        <ClipboardList size={12} className="inline mr-1"/> Test
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {activeTab === 'LISTENING' && hasListening && (
                            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-1.5 rounded-2xl shadow-sm animate-in zoom-in-95">
                                {playbackState === 'PLAYING' ? (
                                    <button onClick={() => { setPlaybackState('PAUSED'); stopSpeaking(); stopAudioRef.current = true; }} className="p-3 bg-white text-indigo-600 rounded-xl shadow-sm hover:bg-neutral-50 transition-all">
                                        <Pause size={20} fill="currentColor"/>
                                    </button>
                                ) : (
                                    <button onClick={handlePlayAll} className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95">
                                        <Play size={20} fill="currentColor"/>
                                    </button>
                                )}
                                {playbackState !== 'IDLE' && (
                                    <button onClick={handleStop} className="p-3 bg-white text-rose-500 rounded-xl hover:bg-rose-50 transition-all">
                                        <Square size={20} fill="currentColor"/>
                                    </button>
                                )}
                            </div>
                        )}
                        <button onClick={onEdit} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl hover:bg-neutral-50 hover:text-neutral-900 transition-all shadow-sm active:scale-95" title="Edit Lesson">
                            <Edit3 size={20} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm min-h-[400px] relative">
                 {activeTab === 'INTENSITY' ? (
                     <div className="space-y-6 animate-in fade-in duration-500">
                         <div className="space-y-1 text-center mb-8">
                            <h3 className="text-xl font-black text-neutral-900">Intensity Scale</h3>
                            <p className="text-sm text-neutral-500 font-medium">Analyze how word choices change based on emphasis and context.</p>
                         </div>
                         <IntensityTable rows={lesson.intensityRows || []} />
                     </div>
                 ) : activeTab === 'COMPARISON' ? (
                      <div className="space-y-6 animate-in fade-in duration-500">
                         <div className="space-y-1 text-center mb-8">
                            <h3 className="text-xl font-black text-neutral-900">Word Contrast</h3>
                            <p className="text-sm text-neutral-500 font-medium">Deep dive into the nuances of confusing or similar vocabulary.</p>
                         </div>
                         <ComparisonTable rows={lesson.comparisonRows || []} />
                     </div>
                 ) : activeTab === 'TEST' && !lesson.testContent ? (
                     <div className="h-full flex flex-col items-center justify-center py-20 text-neutral-300">
                         <ClipboardList size={48} className="mb-4 opacity-20" />
                         <p className="font-bold text-neutral-400">No practice test available.</p>
                     </div>
                 ) : activeTab === 'LISTENING' && !lesson.listeningContent ? (
                     <div className="h-full flex flex-col items-center justify-center py-20 text-neutral-300">
                         <Headphones size={48} className="mb-4 opacity-20" />
                         <p className="font-bold text-neutral-400">No listening script available.</p>
                     </div>
                 ) : (
                    <div 
                        className="prose prose-sm max-w-none prose-headings:font-black prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                 )}
            </div>

            {/* Paged Navigation Footer */}
            {viewMode === 'PAGED' && activeTab !== 'INTENSITY' && activeTab !== 'COMPARISON' && chapters.length > 1 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-xl border border-neutral-200 flex items-center gap-2 animate-in slide-in-from-bottom-4">
                    <button 
                        onClick={() => setCurrentChapterIdx(Math.max(0, currentChapterIdx - 1))}
                        disabled={currentChapterIdx === 0}
                        className="p-3 bg-neutral-100 rounded-xl text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-neutral-100 transition-colors"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <div className="relative px-2" ref={chapterMenuRef}>
                        <button onClick={() => setIsChapterMenuOpen(!isChapterMenuOpen)} className="flex flex-col items-center hover:bg-neutral-100 rounded-lg px-2 py-1 transition-colors">
                            <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Chapter</span>
                            <div className="flex items-center gap-1">
                                <span className="font-bold text-sm text-neutral-900 max-w-[120px] truncate">{chapters[currentChapterIdx].title}</span>
                                <Menu size={12} className="text-neutral-400" />
                            </div>
                        </button>
                        {isChapterMenuOpen && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 bg-white rounded-xl shadow-2xl border border-neutral-100 p-1 animate-in fade-in zoom-in-95 origin-bottom">
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    {chapters.map((ch, idx) => (
                                        <button key={idx} onClick={() => { setCurrentChapterIdx(idx); setIsChapterMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold truncate ${idx === currentChapterIdx ? 'bg-indigo-50 text-indigo-700' : 'text-neutral-600 hover:bg-neutral-50'}`}>{ch.title}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={() => setCurrentChapterIdx(Math.min(chapters.length - 1, currentChapterIdx + 1))}
                        disabled={currentChapterIdx === chapters.length - 1}
                        className="p-3 bg-neutral-100 rounded-xl text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-neutral-100 transition-colors"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};
