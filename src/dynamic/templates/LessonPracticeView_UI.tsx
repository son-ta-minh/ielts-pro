
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Lesson } from '../../app/types';
import { ArrowLeft, Edit3, Play, Pause, Square, Headphones, Sparkles, Volume2, RefreshCw, Loader2 } from 'lucide-react';
import { parseMarkdown } from '../../utils/markdownParser';
import { speak, stopSpeaking, prefetchSpeech } from '../../utils/audio';

interface Props {
  lesson: Lesson;
  onComplete: () => void;
  onEdit: () => void;
  onUpdate?: (updated: Lesson) => void;
  onAddSound?: () => void;
}

export const LessonPracticeViewUI: React.FC<Props> = ({ lesson, onComplete, onEdit, onAddSound }) => {
    const [playbackState, setPlaybackState] = useState<'IDLE' | 'PLAYING' | 'PAUSED'>('IDLE');
    const [currentSoundIdx, setCurrentSoundIdx] = useState(-1);
    const [isBufferingNext, setIsBufferingNext] = useState(false);
    const [downloadedCount, setDownloadedCount] = useState(0); 
    
    const stopAudioRef = useRef(false);
    const audioBuffer = useRef<Map<number, Blob>>(new Map());
    const downloadPromises = useRef<Map<number, Promise<Blob | null>>>(new Map());

    const contentHtml = useMemo(() => {
        return parseMarkdown(lesson.content);
    }, [lesson.content]);

    // Extract speech blocks
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

    // Function to get or start a download for a specific index
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

    // Prefetch all in sequence to not overload the network
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
            // Start downloading all in the background
            startSequentialPrefetch(0);
        }
        
        const startFrom = currentSoundIdx === -1 ? 0 : currentSoundIdx;

        for (let i = startFrom; i < speechBlocks.length; i++) {
            if (stopAudioRef.current) break;
            
            setCurrentSoundIdx(i);
            const block = speechBlocks[i];
            
            // Wait for the current segment to be ready in the buffer
            let blob = audioBuffer.current.get(i);
            if (!blob) {
                setIsBufferingNext(true);
                blob = await getSegmentBlob(i);
                setIsBufferingNext(false);
            }
            
            if (stopAudioRef.current) break;

            try {
                // Play the segment
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
        (window as any).handleLessonSpeak = (text: string) => {
            speak(text);
        };
        return () => {
            handleStop();
            delete (window as any).handleLessonSpeak;
        };
    }, []);

    const hasListening = speechBlocks.length > 0;
    const isFullyBuffered = downloadedCount >= speechBlocks.length;

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-40 animate-in fade-in duration-300">
            {/* Header */}
            <header className="flex items-start justify-between">
                <div className="flex flex-col gap-4">
                    <button onClick={onComplete} className="w-fit flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider">
                        <ArrowLeft size={14} /><span>Back to Library</span>
                    </button>
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">{lesson.title}</h2>
                        {lesson.description && <p className="text-neutral-500 font-medium">{lesson.description}</p>}
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    {hasListening ? (
                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-1.5 rounded-2xl shadow-sm">
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

                            {playbackState === 'IDLE' && onAddSound && (
                                <button 
                                    onClick={onAddSound} 
                                    className="p-3 bg-white text-amber-500 rounded-xl hover:bg-amber-50 transition-all border border-amber-100 shadow-sm"
                                    title="Regenerate Sound Script"
                                >
                                    <RefreshCw size={20} />
                                </button>
                            )}

                            <div className="px-4 pr-6">
                                <div className="text-[10px] font-black uppercase text-indigo-400 tracking-widest leading-none mb-1">
                                    {playbackState === 'IDLE' ? 'Play' : playbackState === 'PAUSED' ? 'Paused' : 'Playing'}
                                </div>
                                <div className="text-xs font-bold text-indigo-900 leading-none">
                                    {playbackState === 'IDLE' ? `${speechBlocks.length} Segments` : `${currentSoundIdx + 1} / ${speechBlocks.length}`}
                                </div>
                            </div>
                        </div>
                    ) : onAddSound && (
                        <button 
                            onClick={onAddSound} 
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                        >
                            <Sparkles size={16}/>
                            <span>Add Lesson Sound</span>
                        </button>
                    )}

                    <button onClick={onEdit} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-2xl hover:bg-neutral-50 hover:text-neutral-900 transition-all shadow-sm active:scale-95" title="Edit Lesson">
                        <Edit3 size={20} />
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm min-h-[400px]">
                 <div 
                    className="prose prose-sm max-w-none prose-headings:font-black prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
            </div>

            {/* Float Overlay Controller */}
            {playbackState !== 'IDLE' && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md text-white px-8 py-6 rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center gap-8 animate-in slide-in-from-bottom-8 z-50 border border-neutral-800 ring-4 ring-black/10 w-[95%] max-w-4xl">
                    <div className="flex-1 min-w-0 w-full">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Narrating {currentSoundIdx + 1} / {speechBlocks.length}</span>
                                
                                {isBufferingNext ? (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/20 rounded-full">
                                        <Loader2 size={10} className="animate-spin text-amber-400" />
                                        <span className="text-[8px] font-black uppercase text-amber-400 tracking-wider">Buffering...</span>
                                    </div>
                                ) : !isFullyBuffered && (
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/10 rounded-full">
                                        <div className="w-1 h-1 rounded-full bg-emerald-400"></div>
                                        <span className="text-[8px] font-black uppercase text-emerald-400 tracking-wider">
                                            Downloaded {downloadedCount}/{speechBlocks.length}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${speechBlocks[currentSoundIdx]?.lang === 'vi' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                                {speechBlocks[currentSoundIdx]?.lang === 'vi' ? 'VN' : 'EN'}
                            </span>
                        </div>
                        <div className="max-h-56 overflow-y-auto custom-scrollbar pr-4 transition-all">
                            <p className="text-lg font-bold text-neutral-100 leading-relaxed italic">
                                "{speechBlocks[currentSoundIdx]?.text || '...'}"
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5 shrink-0 border-l border-white/10 pl-6 h-full self-stretch md:self-center">
                        <button onClick={handleStop} className="p-4 text-neutral-400 hover:text-white transition-colors bg-white/5 rounded-full hover:bg-white/10" title="Stop">
                            <Square size={24} fill="currentColor"/>
                        </button>
                        {playbackState === 'PLAYING' ? (
                            <button onClick={() => { setPlaybackState('PAUSED'); stopSpeaking(); stopAudioRef.current = true; }} className="w-16 h-16 bg-white text-neutral-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform" title="Pause">
                                <Pause size={32} fill="currentColor"/>
                            </button>
                        ) : (
                            <button onClick={handlePlayAll} className="w-16 h-16 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform" title="Play">
                                <Play size={32} fill="currentColor"/>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
