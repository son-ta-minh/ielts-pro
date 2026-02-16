
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ListeningItem, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Music, Ear, Plus, Edit3, Trash2, Volume2, Save, X, Info, Tag, Shuffle, Target, FileAudio, Play, Pause, Square, SkipBack, SkipForward, Eye, EyeOff, Highlighter, Eraser, FileText } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import { speak, stopSpeaking } from '../../utils/audio';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { TagBrowser } from '../../components/common/TagBrowser';
import { ResourceActions } from '../page/ResourceActions';
import { FileSelector } from '../../components/common/FileSelector';

interface Props {
  user: User;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_listening_view';

// --- Highlighted Text Renderer (Static) ---
const HighlightedText: React.FC<{ text: string }> = ({ text }) => {
    // Splits by curly braces, capturing the content inside
    const parts = text.split(/({.*?})/g);
    return (
        <span className="leading-relaxed">
            {parts.map((part, i) => {
                if (part.startsWith('{') && part.endsWith('}')) {
                    return (
                        <span key={i} className="inline-block bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-bold mx-0.5 border border-red-200 text-[0.9em] align-baseline">
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
};

// --- Interactive Transcript Engine ---
interface InteractiveTranscriptProps {
    rawText: string;
    onUpdate: (newRawText: string) => void;
    readOnly?: boolean;
}

const InteractiveTranscript: React.FC<InteractiveTranscriptProps> = ({ rawText, onUpdate, readOnly = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pendingAction, setPendingAction] = useState<{ type: 'add' | 'remove', start: number, end: number } | null>(null);

    // 1. Parse raw text into segments (Normal | Highlight)
    const segments = useMemo(() => {
        const segs: { text: string; isHighlight: boolean; start: number; end: number }[] = [];
        const regex = /({.*?})/g;
        let match;
        let lastIndex = 0;

        while ((match = regex.exec(rawText)) !== null) {
            if (match.index > lastIndex) {
                segs.push({
                    text: rawText.slice(lastIndex, match.index),
                    isHighlight: false,
                    start: lastIndex,
                    end: match.index
                });
            }
            segs.push({
                text: match[0],
                isHighlight: true,
                start: match.index,
                end: regex.lastIndex
            });
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < rawText.length) {
            segs.push({
                text: rawText.slice(lastIndex),
                isHighlight: false,
                start: lastIndex,
                end: rawText.length
            });
        }
        return segs;
    }, [rawText]);

    const handleSelectionCheck = () => {
        if (readOnly) return;
        const selection = window.getSelection();
        
        // Helper to find which segment index a node belongs to
        const getSegmentIndex = (node: Node | null): number | null => {
            if (!node) return null;
            // Traverse up to find the span with data-index
            let el = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement;
            while (el && el !== containerRef.current && !el.hasAttribute('data-index')) {
                el = el.parentElement as HTMLElement;
            }
            if (el && el.hasAttribute('data-index')) {
                return parseInt(el.getAttribute('data-index')!, 10);
            }
            return null;
        };

        if (!selection || !selection.anchorNode || !selection.focusNode) {
            setPendingAction(null);
            return;
        }
        
        // Case A: Unhighlight (Cursor inside highlighted segment)
        // Even if collapsed (just clicked), we show the option to unhighlight
        const anchorIdx = getSegmentIndex(selection.anchorNode);
        if (anchorIdx !== null) {
            const segment = segments[anchorIdx];
            if (segment.isHighlight) {
                setPendingAction({ type: 'remove', start: segment.start, end: segment.end });
                return;
            }
        }
        
        // Case B: Highlight (Selection inside plain text segment)
        if (!selection.isCollapsed) {
            const focusIdx = getSegmentIndex(selection.focusNode);
            // Only allow single-segment highlighting for simplicity
            if (anchorIdx !== null && anchorIdx === focusIdx) {
                const segment = segments[anchorIdx];
                if (!segment.isHighlight) {
                    // Range offsets are relative to the text node.
                    // Assuming segment renders as a single span, usually containing one text node.
                    const textNode = selection.anchorNode;
                    if (textNode && textNode.nodeType === 3) { // Text node
                        const start = Math.min(selection.anchorOffset, selection.focusOffset);
                        const end = Math.max(selection.anchorOffset, selection.focusOffset);
                        
                        // Absolute positions relative to raw text start
                        const absStart = segment.start + start;
                        const absEnd = segment.start + end;
                        
                        const selectedText = selection.toString();
                        if (selectedText) {
                            setPendingAction({ type: 'add', start: absStart, end: absEnd });
                            return;
                        }
                    }
                }
            }
        }

        setPendingAction(null);
    };

    const handleApplyAction = () => {
        if (!pendingAction) return;
        
        if (pendingAction.type === 'remove') {
            // Remove braces: {content} -> content
            const before = rawText.slice(0, pendingAction.start);
            const content = rawText.slice(pendingAction.start + 1, pendingAction.end - 1);
            const after = rawText.slice(pendingAction.end);
            onUpdate(before + content + after);
        } else {
            // Add braces: content -> {content}
            const before = rawText.slice(0, pendingAction.start);
            const content = rawText.slice(pendingAction.start, pendingAction.end);
            const after = rawText.slice(pendingAction.end);
            onUpdate(`${before}{${content}}${after}`);
        }
        
        setPendingAction(null);
        window.getSelection()?.removeAllRanges();
    };

    return (
        <div className="relative h-full flex flex-col">
            {/* Sticky Action Button - Floats over text */}
            <div className="sticky top-4 z-50 h-0 flex justify-center pointer-events-none overflow-visible">
                 <button 
                    onClick={(e) => { e.preventDefault(); handleApplyAction(); }}
                    disabled={!pendingAction}
                    className={`pointer-events-auto flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black shadow-xl transition-all transform duration-200 border-2 border-white ring-1 ring-black/5 ${
                        pendingAction 
                            ? 'translate-y-0 opacity-100 scale-100' 
                            : '-translate-y-4 opacity-0 scale-95 pointer-events-none'
                    } ${
                        pendingAction?.type === 'remove' 
                            ? 'bg-white text-rose-600 shadow-rose-100' 
                            : 'bg-neutral-900 text-white shadow-neutral-200'
                    }`}
                 >
                    {pendingAction?.type === 'remove' ? <Eraser size={14}/> : <Highlighter size={14}/>}
                    <span>{pendingAction?.type === 'remove' ? 'Unhighlight' : 'Highlight'}</span>
                 </button>
            </div>
            
            <div 
                ref={containerRef}
                className="text-lg font-medium text-neutral-800 leading-relaxed whitespace-pre-wrap px-6 pb-20 pt-6 select-text cursor-text font-mono"
                onMouseUp={handleSelectionCheck}
                onKeyUp={handleSelectionCheck}
            >
                {segments.map((seg, i) => (
                    <span 
                        key={`${i}-${seg.start}`} 
                        data-index={i}
                        className={seg.isHighlight 
                            ? "bg-red-100 text-red-700 px-1 rounded-md font-bold mx-0.5 border border-red-200 cursor-pointer hover:bg-red-200 hover:border-red-300 transition-colors" 
                            : ""
                        }
                    >
                        {seg.isHighlight ? seg.text.slice(1, -1) : seg.text}
                    </span>
                ))}
            </div>
        </div>
    );
};

// --- Listening Practice Modal ---
interface ListeningPracticeProps {
    isOpen: boolean;
    onClose: () => void;
    item: ListeningItem;
    onUpdate: (updatedItem: ListeningItem) => void;
}

const ListeningPracticeModal: React.FC<ListeningPracticeProps> = ({ isOpen, onClose, item, onUpdate }) => {
    const audioLinks = item.audioLinks || [];
    const [currentIdx, setCurrentIdx] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [editableText, setEditableText] = useState(item.text);
    const [isEditMode, setIsEditMode] = useState(false); // Can toggle to raw textarea for bulk edits
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Audio Cleanup on Unmount
    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            stopAudio();
            setCurrentIdx(0);
        } else {
            setEditableText(item.text); // Sync with current item state on open
            loadTrack(0, false); 
        }
    }, [isOpen, item]);

    const handleTextUpdate = (newText: string) => {
        setEditableText(newText);
        // Persist to parent immediately
        onUpdate({ ...item, text: newText });
    };

    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        stopSpeaking(); // Stop TTS if any
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    };

    const loadTrack = (index: number, autoPlay: boolean) => {
        stopAudio();
        setCurrentIdx(index);
        
        if (audioLinks.length > 0 && audioLinks[index]) {
            const url = audioLinks[index];
            const audio = new Audio(url);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
                setDuration(audio.duration);
            });
            
            audio.addEventListener('timeupdate', () => {
                setCurrentTime(audio.currentTime);
            });
            
            audio.addEventListener('ended', () => {
                setIsPlaying(false);
                if (index < audioLinks.length - 1) {
                    loadTrack(index + 1, true);
                } else {
                     setCurrentTime(0);
                }
            });

            audio.addEventListener('error', () => {
                setIsPlaying(false);
            });

            if (autoPlay) {
                audio.play().catch(console.error);
                setIsPlaying(true);
            }
        }
    };

    const togglePlay = () => {
        if (audioLinks.length > 0) {
            if (audioRef.current) {
                if (isPlaying) {
                    audioRef.current.pause();
                    setIsPlaying(false);
                } else {
                    audioRef.current.play().catch(console.error);
                    setIsPlaying(true);
                }
            } else {
                loadTrack(currentIdx, true);
            }
        } else {
            // TTS Fallback
            if (isPlaying) {
                stopSpeaking();
                setIsPlaying(false);
            } else {
                const cleanText = item.text.replace(/[{}]/g, '');
                speak(cleanText);
                setIsPlaying(true);
                const estimatedTime = (cleanText.length / 10) * 1000;
                setTimeout(() => setIsPlaying(false), estimatedTime);
            }
        }
    };
    
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setCurrentTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    const handlePrev = () => {
        if (currentIdx > 0) loadTrack(currentIdx - 1, true);
    };

    const handleNext = () => {
        if (currentIdx < audioLinks.length - 1) loadTrack(currentIdx + 1, true);
    };
    
    const handleClose = () => {
        stopAudio();
        onClose();
    };

    if (!isOpen) return null;

    const currentFilename = audioLinks.length > 0 
        ? decodeURIComponent(audioLinks[currentIdx].split('/').pop() || `Track ${currentIdx + 1}`) 
        : 'System Voice (TTS)';

    const formatTime = (t: number) => {
        const min = Math.floor(t / 60);
        const sec = Math.floor(t % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
             <div className="bg-white w-full max-w-7xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[90vh] overflow-hidden">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-white z-10 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><Ear size={20}/> Listening Practice</h3>
                        <p className="text-xs text-neutral-500 font-bold mt-1 max-w-[250px] truncate">{item.title || item.note || 'Practice Session'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                         <div className="bg-neutral-100 p-1 rounded-xl flex items-center">
                            <button onClick={() => setIsEditMode(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!isEditMode ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>Read</button>
                            <button onClick={() => setIsEditMode(true)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isEditMode ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>Edit Raw</button>
                         </div>
                        <button onClick={handleClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                    </div>
                </header>

                <div className="flex-1 flex flex-col overflow-hidden relative bg-neutral-50/50">
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
                        {isEditMode ? (
                            <textarea 
                                value={editableText} 
                                onChange={e => handleTextUpdate(e.target.value)} 
                                className="w-full h-full p-6 bg-white border border-neutral-200 rounded-2xl resize-none outline-none text-lg font-medium leading-relaxed font-mono text-neutral-700 shadow-sm"
                                placeholder="Paste transcript here..."
                            />
                        ) : (
                            <div className="h-full flex flex-col bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 overflow-y-auto">
                                <InteractiveTranscript rawText={editableText} onUpdate={handleTextUpdate} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Compact Audio Controls Footer */}
                <div className="px-6 py-3 bg-white border-t border-neutral-100 shrink-0 flex items-center gap-4">
                    {/* Track Info */}
                    <div className="w-48 shrink-0">
                        <h4 className="text-xs font-bold text-neutral-900 truncate">{currentFilename}</h4>
                        {audioLinks.length > 1 && (
                            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Track {currentIdx + 1}/{audioLinks.length}</p>
                        )}
                    </div>

                    {/* Controls & Progress */}
                    <div className="flex-1 flex items-center gap-3">
                         <button 
                            onClick={handlePrev} 
                            disabled={currentIdx === 0} 
                            className="p-2 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
                        >
                            <SkipBack size={18} fill="currentColor" />
                        </button>
                        
                         <button 
                            onClick={togglePlay} 
                            className="w-10 h-10 bg-neutral-900 text-white rounded-full flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all"
                         >
                             {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                         </button>

                         <button 
                            onClick={handleNext} 
                            disabled={currentIdx === audioLinks.length - 1} 
                            className="p-2 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
                        >
                            <SkipForward size={18} fill="currentColor" />
                        </button>

                        <div className="flex-1 flex items-center gap-3 ml-2">
                            <span className="text-[10px] font-mono font-bold text-neutral-400 w-8 text-right">{formatTime(currentTime)}</span>
                            <div className="flex-1 h-1.5 bg-neutral-100 rounded-full relative group cursor-pointer">
                                {audioLinks.length > 0 && (
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max={duration || 100} 
                                        value={currentTime}
                                        onChange={handleSeek}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                )}
                                <div className="absolute top-0 left-0 h-full bg-neutral-900 rounded-full transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}></div>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-neutral-400 w-8 text-left">{formatTime(duration)}</span>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

// --- Add/Edit Modal ---
interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, text: string, note?: string, path?: string, tags?: string[], audioLinks?: string[]) => void;
  initialData?: ListeningItem | null;
}

const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [path, setPath] = useState('/');
  const [tagsInput, setTagsInput] = useState('');
  const [audioLinks, setAudioLinks] = useState<string[]>([]);
  
  const [isAudioSelectorOpen, setIsAudioSelectorOpen] = useState(false);
  const [transcriptToApply, setTranscriptToApply] = useState<string | null>(null);
  const [isTranscriptConfirmOpen, setIsTranscriptConfirmOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setText(initialData?.text || '');
      setNote(initialData?.note || '');
      setAudioLinks(initialData?.audioLinks || []);
      
      if (initialData?.path === undefined) {
        const legacyTags = initialData?.tags || [];
        const pathFromTags = legacyTags.find(t => t.startsWith('/'));
        const singleTags = legacyTags.filter(t => !t.startsWith('/'));
        setPath(pathFromTags || '/');
        setTagsInput(singleTags.join(', '));
      } else {
        setPath(initialData?.path || '/');
        setTagsInput(initialData?.tags?.join(', ') || '');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      onSave(title.trim(), text.trim(), note.trim(), path.trim(), finalTags, audioLinks);
    }
  };
  
  // Updated handler to accept object from FileSelector
  const handleAddAudio = (fileData: any) => {
      const { url, transcript } = fileData;
      setAudioLinks(prev => [...prev, url]);
      
      if (transcript) {
          if (!text.trim()) {
              setText(transcript);
          } else {
              setTranscriptToApply(transcript);
              setIsTranscriptConfirmOpen(true);
          }
      }
  };

  const handleConfirmTranscript = () => {
      if (transcriptToApply) {
          setText(transcriptToApply);
      }
      setTranscriptToApply(null);
      setIsTranscriptConfirmOpen(false);
  };

  const handleRemoveAudio = (index: number) => {
      setAudioLinks(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Listening Card' : 'New Listening Card'}</h3>
            <p className="text-sm text-neutral-500">Add text script and attach audio.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
             <label className="block text-xs font-bold text-neutral-500">Title</label>
             <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Unit 1 Podcast" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-neutral-900 outline-none" />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-500">
                Script / Transcript 
            </label>
            <div className="relative">
                <textarea 
                    value={text} 
                    onChange={e => setText(e.target.value)} 
                    placeholder="Paste full transcript here..." 
                    rows={6} 
                    className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-medium resize-none focus:ring-2 focus:ring-neutral-900 outline-none text-sm leading-relaxed" 
                    required 
                />
            </div>
            <p className="text-[10px] text-neutral-400 italic">You can highlight key phrases in Practice mode.</p>
          </div>
          
          <div className="space-y-2">
               <div className="flex justify-between items-center">
                   <label className="block text-xs font-bold text-neutral-500">Attached Audio</label>
                   <button type="button" onClick={() => setIsAudioSelectorOpen(true)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"><Plus size={12}/> From Server</button>
               </div>
               
               <div className="space-y-2">
                   {audioLinks.length === 0 && <p className="text-[10px] text-neutral-400 italic px-2">No audio files attached.</p>}
                   {audioLinks.map((link, idx) => (
                       <div key={idx} className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-200">
                           <div className="flex items-center gap-2 overflow-hidden">
                               <FileAudio size={14} className="text-emerald-500 shrink-0" />
                               <span className="text-xs font-mono text-neutral-600 truncate">{decodeURIComponent(link.split('/').pop() || 'file')}</span>
                           </div>
                           <button type="button" onClick={() => handleRemoveAudio(idx)} className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full"><X size={14}/></button>
                       </div>
                   ))}
               </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Note (Optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Fast speech, linking sounds..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500">Tags</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="linking, elision..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Item</button>
        </footer>
      </form>
    </div>
    
    <FileSelector 
        isOpen={isAudioSelectorOpen} 
        onClose={() => setIsAudioSelectorOpen(false)} 
        onSelect={handleAddAudio}
        type="audio"
        title="Select Audio" 
    />
    
    <ConfirmationModal 
        isOpen={isTranscriptConfirmOpen}
        title="Replace Script?"
        message="This audio file comes with a linked transcript. Do you want to replace your current text content with it?"
        confirmText="Replace"
        isProcessing={false}
        onConfirm={handleConfirmTranscript}
        onClose={() => setIsTranscriptConfirmOpen(false)}
        icon={<FileText size={40} className="text-indigo-500"/>}
        confirmButtonClass="bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200"
    />
    </>
  );
};

export const ListeningCardPage: React.FC<Props> = ({ user }) => {
  const [items, setItems] = useState<ListeningItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
      showNote: true,
      compact: false,
      showType: true
  }));

  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  
  // Practice State
  const [practiceItem, setPracticeItem] = useState<ListeningItem | null>(null);

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ListeningItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<ListeningItem | null>(null);
  
  // Scripted Audio Creator
  const [isScriptedSelectorOpen, setIsScriptedSelectorOpen] = useState(false);

  const { showToast } = useToast();

  const loadData = async () => {
    setLoading(true);
    const userItems = await db.getListeningItemsByUserId(user.id);
    setItems(userItems.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user.id]);
  
  // Reset pagination on filter change
  useEffect(() => {
    setPage(0);
  }, [selectedTag, pageSize, focusFilter, colorFilter, searchQuery]);

  const hasActiveFilters = useMemo(() => {
    return focusFilter !== 'all' || colorFilter !== 'all';
  }, [focusFilter, colorFilter]);

  // Derived Logic for List View
  const filteredItems = useMemo(() => {
    let result = items;
    const q = searchQuery.toLowerCase().trim();
    
    if (q) {
        result = result.filter(i => 
            (i.title || '').toLowerCase().includes(q) || 
            (i.text || '').toLowerCase().includes(q)
        );
    }

    if (focusFilter === 'focused') result = result.filter(i => i.isFocused);
    if (colorFilter !== 'all') result = result.filter(i => i.focusColor === colorFilter);
    
    if (selectedTag) {
        if (selectedTag === 'Uncategorized') {
            result = result.filter(item => {
                const path = item.path ?? (item.tags || []).find(t => t.startsWith('/'));
                const hasPath = path && path !== '/' && path !== '';
                return !hasPath;
            });
        } else {
            result = result.filter(i => i.path?.startsWith(selectedTag) || i.tags?.includes(selectedTag));
        }
    }
    return result;
  }, [items, selectedTag, focusFilter, colorFilter, searchQuery]);
  
  const pagedItems = useMemo(() => {
      const start = page * pageSize;
      return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  // Handlers
  const handleNew = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ListeningItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    await dataStore.deleteListeningItem(itemToDelete.id);
    setItemToDelete(null);
    showToast("Deleted item.", "success");
    loadData();
  };

  const handleSave = async (title: string, text: string, note?: string, path?: string, tags?: string[], audioLinks?: string[]) => {
    try {
      const now = Date.now();
      if (editingItem) {
        const updated = { ...editingItem, title, text, note, path, tags, audioLinks, updatedAt: now };
        await dataStore.saveListeningItem(updated);
        showToast("Item updated!", "success");
      } else {
        const newItem: ListeningItem = {
          id: `lst-${now}-${Math.random()}`,
          userId: user.id,
          title,
          text,
          note,
          path,
          tags,
          audioLinks,
          createdAt: now,
          updatedAt: now
        };
        await dataStore.saveListeningItem(newItem);
        showToast("Item added!", "success");
      }
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      showToast("Failed to save item.", "error");
    }
  };
  
  // Fixed signature to accept object
  const handleCreateFromScriptedAudio = async (data: { url: string, filename: string, transcript?: string, transcriptTitle?: string, map?: string, path?: string }) => {
      const { url, filename, transcript, transcriptTitle, map, path } = data;
      
      if (!transcript) {
          showToast("No transcript found for selected file.", "error");
          return;
      }
      
      const mapName = map || 'Unknown';
      const folderPath = path ? `/${path}` : '';
      const displayTitle = transcriptTitle ? `${mapName}${folderPath} - ${transcriptTitle}` : filename;
      
      const now = Date.now();
      const newItem: ListeningItem = {
          id: `lst-scripted-${now}-${Math.random()}`,
          userId: user.id,
          title: displayTitle,
          text: transcript,
          note: `Imported from ${mapName}${folderPath}`,
          path: folderPath || '/',
          tags: ['scripted-audio'],
          audioLinks: [url],
          createdAt: now,
          updatedAt: now
      };
      
      try {
          await dataStore.saveListeningItem(newItem);
          showToast("Scripted Audio Card Created!", "success");
          loadData();
      } catch (e) {
          showToast("Failed to create card.", "error");
      }
  };

  const handleUpdatePracticeItem = async (updatedItem: ListeningItem) => {
    await dataStore.saveListeningItem(updatedItem);
    setPracticeItem(updatedItem); // Keep modal in sync
    loadData(); // Refresh list background
  };

  const handlePlay = (item: ListeningItem) => {
      setPracticeItem(item);
  };

  const handleRandomize = () => {
    setItems(prev => [...prev].sort(() => Math.random() - 0.5));
    showToast("Shuffled!", "success");
  };
  
  const handleFocusChange = async (item: ListeningItem, color: FocusColor | null) => {
      const updated = { ...item, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete updated.focusColor;
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      await dataStore.saveListeningItem(updated);
  };
  
  const handleToggleFocus = async (item: ListeningItem) => {
      const updated = { ...item, isFocused: !item.isFocused, updatedAt: Date.now() };
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
      await dataStore.saveListeningItem(updated);
  };

  // --- Render Card Title Logic ---
  const renderCardTitle = (item: ListeningItem) => {
      if (item.title) {
          return <div className="font-black text-lg text-neutral-900 leading-tight">{item.title}</div>;
      }
      
      const words = item.text.split(/\s+/);
      const truncated = words.length > 15 ? words.slice(0, 15).join(' ') + '...' : item.text;
      
      return (
          <div className="font-medium text-lg text-neutral-700 leading-tight">
              <HighlightedText text={truncated} />
          </div>
      );
  };

  // --- List View (Default) ---
  return (
    <>
    <ResourcePage
      title="Listening Library"
      subtitle="Practice listening reflexes and capture difficult phrases."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Headphone.png" className="w-8 h-8 object-contain" alt="Listening" />}
      query={searchQuery}
      onQueryChange={setSearchQuery}
      searchPlaceholder="Search title or text..."
      config={{}}
      isLoading={loading}
      isEmpty={filteredItems.length === 0}
      emptyMessage="No difficult phrases saved."
      activeFilters={{}}
      onFilterChange={() => {}}
      pagination={{
          page,
          totalPages: Math.ceil(filteredItems.length / pageSize),
          onPageChange: setPage,
          pageSize,
          onPageSizeChange: setPageSize,
          totalItems: filteredItems.length
      }}
      aboveGrid={
        <>
            {isTagBrowserOpen && <TagBrowser items={items} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        </>
      }
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen}
                    setIsOpen={setIsViewMenuOpen}
                    hasActiveFilters={hasActiveFilters}
                    customSection={
                        <>
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                                <Target size={10}/> Focus & Status
                            </div>
                            <div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2">
                                <button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                    {focusFilter === 'focused' ? 'Focused Only' : 'All Items'}
                                </button>
                                <div className="flex gap-1">
                                    <button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} />
                                </div>
                            </div>
                        </>
                    }
                    viewOptions={[
                        { label: 'Show Notes', checked: viewSettings.showNote, onChange: () => setViewSettings(v => ({...v, showNote: !v.showNote})) },
                        { label: 'Show Card Type', checked: viewSettings.showType, onChange: () => setViewSettings(v => ({...v, showType: !v.showType})) },
                        { label: 'Compact Mode', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) },
                    ]}
                />
            }
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }}
            addActions={[
                { label: 'Add Scripted Audio', icon: FileAudio, onClick: () => setIsScriptedSelectorOpen(true) },
                { label: 'Add Phrase', icon: Plus, onClick: handleNew }
            ]}
            extraActions={
                 <>
                    <button onClick={handleRandomize} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button>
                 </>
            }
        />
      }
    >
      {() => (
        <>
          {pagedItems.map(item => (
            <UniversalCard
                key={item.id}
                title={renderCardTitle(item)}
                badge={viewSettings.showType ? { label: 'Listening', colorClass: 'bg-red-50 text-red-600 border-red-100', icon: Ear } : undefined}
                tags={item.tags}
                compact={viewSettings.compact}
                onClick={() => handlePlay(item)}
                focusColor={item.focusColor}
                onFocusChange={(c) => handleFocusChange(item, c)}
                isFocused={item.isFocused}
                onToggleFocus={() => handleToggleFocus(item)}
                isCompleted={item.focusColor === 'green'}
                footer={
                     <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center gap-2">
                             {item.audioLinks && item.audioLinks.length > 0 && (
                                 <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full w-fit uppercase tracking-wider border border-emerald-100">
                                     <Music size={10} /> {item.audioLinks.length} Tracks
                                 </div>
                             )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handlePlay(item); }} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-95" title="Practice">
                            <Play size={12} fill="currentColor"/> <span>Practice</span>
                        </button>
                     </div>
                }
                actions={
                    <>
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit">
                            <Edit3 size={14}/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={14}/>
                        </button>
                    </>
                }
            >
                {viewSettings.showNote && item.note && (
                    <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium bg-neutral-50 px-2 py-1 rounded-lg w-fit mb-2">
                        <Info size={12}/> {item.note}
                    </div>
                )}
            </UniversalCard>
          ))}
        </>
      )}
    </ResourcePage>
    
    <AddEditModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={editingItem} 
    />
    
    {practiceItem && (
        <ListeningPracticeModal 
            isOpen={!!practiceItem} 
            onClose={() => setPracticeItem(null)} 
            item={practiceItem} 
            onUpdate={handleUpdatePracticeItem}
        />
    )}
    
    <FileSelector 
        isOpen={isScriptedSelectorOpen}
        onClose={() => setIsScriptedSelectorOpen(false)}
        onSelect={handleCreateFromScriptedAudio}
        type="audio"
        title="Select Audio" 
    />
    
    <ConfirmationModal 
        isOpen={!!itemToDelete}
        title="Delete Phrase?"
        message="Are you sure you want to remove this phrase?"
        confirmText="Delete"
        isProcessing={false}
        onConfirm={handleDelete}
        onClose={() => setItemToDelete(null)}
        icon={<Trash2 size={40} className="text-red-500"/>}
    />
    </>
  );
};

export default ListeningCardPage;
