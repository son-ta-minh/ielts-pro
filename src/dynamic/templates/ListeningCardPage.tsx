
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ListeningItem, FocusColor } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Music, Ear, Plus, Edit3, Trash2, Volume2, Save, X, Info, Tag, Shuffle, Target, FileAudio, Play, Pause, Square, SkipBack, SkipForward, Eye, EyeOff, Highlighter, Eraser, FileText, ScanLine, Settings2, Clock, MoreHorizontal } from 'lucide-react';
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

// --- Helper Components ---

const AudioMarkModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: { filename?: string; start?: string; duration?: string }) => void;
    audioFiles: string[];
    initialData?: { filename?: string; start?: string; duration?: string } | null;
}> = ({ isOpen, onClose, onConfirm, audioFiles, initialData }) => {
    const [selectedFile, setSelectedFile] = useState('');
    const [start, setStart] = useState('');
    const [duration, setDuration] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // Edit Mode: Pre-fill data
                // Check if initial filename matches one of our files (or if it was empty/TTS)
                const fileToSet = initialData.filename && audioFiles.includes(initialData.filename) 
                    ? initialData.filename 
                    : (initialData.filename || (audioFiles.length > 0 ? audioFiles[0] : ''));

                setSelectedFile(fileToSet);
                setStart(initialData.start || '');
                setDuration(initialData.duration || '');
            } else {
                // New Mode
                setSelectedFile(audioFiles.length > 0 ? audioFiles[0] : '');
                setStart('');
                setDuration('');
            }
        }
    }, [isOpen, audioFiles, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm({ 
            filename: selectedFile, 
            start: start.trim(), 
            duration: duration.trim() 
        });
    };

    const getFilename = (url: string) => decodeURIComponent(url.split('/').pop() || '');

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-neutral-200 p-6">
                <h3 className="text-lg font-black text-neutral-900 mb-4 flex items-center gap-2">
                    {initialData ? <Settings2 size={20} className="text-indigo-600"/> : <Volume2 size={20} className="text-indigo-600"/>} 
                    {initialData ? 'Edit Audio Settings' : 'Mark Audio Segment'}
                </h3>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Source Audio (Optional)</label>
                        <select 
                            value={selectedFile} 
                            onChange={e => setSelectedFile(e.target.value)}
                            className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                        >
                            <option value="">None (Use Text-to-Speech)</option>
                            {audioFiles.map((url, i) => (
                                <option key={i} value={url}>{getFilename(url)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Start (Sec)</label>
                            <input 
                                type="number" step="0.1" min="0"
                                value={start} 
                                onChange={e => setStart(e.target.value)}
                                placeholder="e.g. 5.5" 
                                className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Duration (Sec)</label>
                            <input 
                                type="number" step="0.1" min="0"
                                value={duration} 
                                onChange={e => setDuration(e.target.value)}
                                placeholder="e.g. 10" 
                                className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-neutral-500 font-bold text-xs hover:bg-neutral-100 rounded-lg transition-colors">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-neutral-900 text-white font-bold text-xs rounded-lg hover:bg-neutral-800 transition-colors">Apply</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Highlighted Text Renderer (Recursive) ---
const HighlightedText: React.FC<{ text: string; showDash?: boolean }> = ({ text, showDash = true }) => {
    // Regex matches either {content} OR [content](meta) OR [content]
    // Priority: Check for link syntax first to avoid partial match
    const parts = text.split(/({.*?}|\[.*?\]\(.*?\)|\[.*?\])/g);

    return (
        <span className="leading-relaxed">
            {parts.map((part, i) => {
                // Case 1: Highlight { ... }
                if (part.startsWith('{') && part.endsWith('}')) {
                    return (
                        <span key={i} className="text-red-600 font-bold mx-0.5">
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                // Case 2: Audio Mark with Metadata [ ... ](...)
                if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
                    const contentMatch = part.match(/^\[(.*?)\]/);
                    const content = contentMatch ? contentMatch[1] : '???';
                    
                    return (
                        <span key={i} className={`${showDash ? 'border-b-2 border-dashed border-indigo-400' : ''} text-indigo-900 font-medium mx-0.5 pb-0.5 transition-colors hover:bg-indigo-50/50`}>
                            <HighlightedText text={content} showDash={showDash} />
                        </span>
                    );
                }
                // Case 3: Simple Audio Mark [ ... ]
                if (part.startsWith('[') && part.endsWith(']')) {
                    return (
                        <span key={i} className={`${showDash ? 'border-b-2 border-dashed border-indigo-400' : ''} text-indigo-900 font-medium mx-0.5 pb-0.5 transition-colors hover:bg-indigo-50/50`}>
                            <HighlightedText text={part.slice(1, -1)} showDash={showDash} />
                        </span>
                    );
                }
                // Case 4: Normal Text
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
    showDash?: boolean;
    audioLinks?: string[]; // Needed for the modal selector
    onPlaySegment: (filename: string | undefined, start: number | undefined, duration: number | undefined, textFallback: string) => void;
}

type SegmentType = 'text' | 'highlight' | 'audio';

interface TranscriptSegment {
    text: string;
    type: SegmentType;
    start: number;
    end: number;
    // Metadata for audio segments
    displayContent?: string;
    meta?: string;
}

const InteractiveTranscript: React.FC<InteractiveTranscriptProps> = ({ rawText, onUpdate, readOnly = false, showDash = true, audioLinks = [], onPlaySegment }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectionState, setSelectionState] = useState<{ start: number, end: number, currentType: SegmentType } | null>(null);
    const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
    const [audioModalInitialData, setAudioModalInitialData] = useState<{ filename?: string; start?: string; duration?: string } | null>(null);

    // Hover State for Floating Menu
    const [hoveredSeg, setHoveredSeg] = useState<{ idx: number; rect: DOMRect; type: SegmentType } | null>(null);
    const hoverTimeoutRef = useRef<any>(null);

    // 1. Parse raw text into segments 
    // Updated Regex to handle [text](meta)
    const segments = useMemo(() => {
        const segs: TranscriptSegment[] = [];
        // Match {text} OR [text](meta) OR [text]
        const regex = /({.*?}|\[.*?\]\(.*?\)|\[.*?\])/g;
        let match;
        let lastIndex = 0;

        while ((match = regex.exec(rawText)) !== null) {
            // Push text before match
            if (match.index > lastIndex) {
                segs.push({
                    text: rawText.slice(lastIndex, match.index),
                    type: 'text',
                    start: lastIndex,
                    end: match.index
                });
            }
            
            let type: SegmentType = 'text';
            let displayContent = match[0];

            if (match[0].startsWith('{')) {
                type = 'highlight';
                displayContent = match[0].slice(1, -1);
            }
            else if (match[0].startsWith('[')) {
                type = 'audio';
                if (match[0].includes('](')) {
                     // Linked format [text](meta)
                     const subMatch = match[0].match(/^\[(.*?)\]/);
                     displayContent = subMatch ? subMatch[1] : 'error';
                } else {
                     // Simple format [text]
                     displayContent = match[0].slice(1, -1);
                }
            }

            segs.push({
                text: match[0],
                type,
                start: match.index,
                end: regex.lastIndex,
                displayContent
            });
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < rawText.length) {
            segs.push({
                text: rawText.slice(lastIndex),
                type: 'text',
                start: lastIndex,
                end: rawText.length
            });
        }
        return segs;
    }, [rawText]);

    const handleSelectionCheck = () => {
        if (readOnly) return;
        const selection = window.getSelection();
        
        const getSegmentIndex = (node: Node | null): number | null => {
            if (!node) return null;
            let el = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement;
            while (el && el !== containerRef.current && !el.hasAttribute('data-index')) {
                el = el.parentElement as HTMLElement;
            }
            if (el && el.hasAttribute('data-index')) {
                return parseInt(el.getAttribute('data-index')!, 10);
            }
            return null;
        };

        if (!selection || !selection.anchorNode || !selection.focusNode || selection.isCollapsed) {
            // Clear selection state if clicked outside or just a cursor
            setSelectionState(null);
            return;
        }
        
        const anchorIdx = getSegmentIndex(selection.anchorNode);
        const focusIdx = getSegmentIndex(selection.focusNode);

        if (anchorIdx === null || focusIdx === null) {
            setSelectionState(null);
            return;
        }

        if (anchorIdx === focusIdx && segments[anchorIdx].type === 'text') {
             // Precise text selection
             let sOffset = selection.anchorOffset;
             let eOffset = selection.focusOffset;
             if (sOffset > eOffset) [sOffset, eOffset] = [eOffset, sOffset];
             setSelectionState({ 
                 start: segments[anchorIdx].start + sOffset, 
                 end: segments[anchorIdx].start + eOffset, 
                 currentType: 'text' 
             });
        } else {
            // Span selection
            const idx1 = Math.min(anchorIdx, focusIdx);
            const idx2 = Math.max(anchorIdx, focusIdx);
            
            // Allow wrapping text segments AND highlights, but NOT existing audio tags
            // We want to support selecting "Text {Highlight} Text" and making it Audio.
            // But we avoid nesting Audio inside Audio (too complex).
            let containsAudio = false;
            for(let i=idx1; i<=idx2; i++) {
                if (segments[i].type === 'audio') containsAudio = true;
            }
            
            if (!containsAudio) {
                 // Snap to segment boundaries for simplicity in multi-segment mode
                 setSelectionState({ 
                    start: segments[idx1].start, 
                    end: segments[idx2].end, 
                    currentType: 'text' // Treat as text to allow wrapping
                });
            } else {
                 setSelectionState(null);
            }
        }
    };

    const handleApplyAction = (action: 'highlight' | 'audio' | 'clear') => {
        if (!selectionState) return;
        const { start, end } = selectionState;

        if (action === 'audio') {
            setAudioModalInitialData(null); // Clear previous edit data
            setIsAudioModalOpen(true);
            return;
        }

        if (action === 'clear') {
            const before = rawText.slice(0, start);
            const segmentStr = rawText.slice(start, end);
            let content = segmentStr;
            
            if (segmentStr.startsWith('{')) content = segmentStr.slice(1, -1);
            else if (segmentStr.startsWith('[')) {
                if (segmentStr.includes('](')) content = segmentStr.match(/^\[(.*?)\]/)?.[1] || '';
                else content = segmentStr.slice(1, -1);
            }
            
            const after = rawText.slice(end);
            onUpdate(before + content + after);
        } else {
            // Highlight
            const before = rawText.slice(0, start);
            const content = rawText.slice(start, end);
            const after = rawText.slice(end);
            onUpdate(`${before}{${content}}${after}`);
        }
        
        setSelectionState(null);
        window.getSelection()?.removeAllRanges();
    };

    // New handler for editing existing audio marks
    const handleEditAudio = () => {
        if (!selectionState || selectionState.currentType !== 'audio') return;
        
        const segmentStr = rawText.slice(selectionState.start, selectionState.end);
        // Parse metadata: [text](file|start|duration) or [text]
        const metaMatch = segmentStr.match(/\((.*?)\)$/);
        
        if (metaMatch) {
            const parts = metaMatch[1].split('|');
            setAudioModalInitialData({
                filename: parts[0] || '',
                start: parts[1] || '',
                duration: parts[2] || ''
            });
        } else {
            // No metadata implies TTS or default settings
            setAudioModalInitialData(null);
        }
        
        setIsAudioModalOpen(true);
    };

    const confirmAudioMark = (config: { filename?: string; start?: string; duration?: string }) => {
        if (!selectionState) return;
        const { start, end, currentType } = selectionState;
        
        const before = rawText.slice(0, start);
        
        // Extract inner content if we are editing an existing tag
        let content = rawText.slice(start, end);
        if (currentType === 'audio') {
            // Strip outer [ ] and (...) if present
            const match = content.match(/^\[(.*?)\]/);
            if (match) {
                content = match[1];
            } else {
                content = content.replace(/^\[/, '').replace(/\](\(.*?\))?$/, '');
            }
        }
        
        const after = rawText.slice(end);
        
        let tag = `[${content}]`;
        
        const fname = config.filename; 
        const s = config.start;
        const d = config.duration;
        
        if (fname || s || d) {
             const metaParts = [];
             if (fname) metaParts.push(fname); else metaParts.push('');
             if (s) metaParts.push(s); else if (d) metaParts.push(''); 
             if (d) metaParts.push(d);
             
             while(metaParts.length > 0 && !metaParts[metaParts.length-1]) metaParts.pop();
             
             if (metaParts.length > 0) {
                 tag += `(${metaParts.join('|')})`;
             }
        }

        onUpdate(`${before}${tag}${after}`);
        setIsAudioModalOpen(false);
        setAudioModalInitialData(null);
        setSelectionState(null);
        window.getSelection()?.removeAllRanges();
    };
    
    // Helper to get filename from url for concise storage if needed
    const getFilename = (url: string) => decodeURIComponent(url.split('/').pop() || '');

    const handlePlaySegment = (e: React.MouseEvent, seg: TranscriptSegment) => {
        e.stopPropagation();
        
        if (seg.text.includes('](')) {
            // [Text](meta)
            const metaMatch = seg.text.match(/\((.*?)\)$/);
            if (metaMatch) {
                const parts = metaMatch[1].split('|');
                const file = parts[0] ? parts[0] : undefined;
                const start = parts[1] ? parseFloat(parts[1]) : undefined;
                const dur = parts[2] ? parseFloat(parts[2]) : undefined;
                
                // Fallback text if audio fails or is missing
                const cleanText = seg.displayContent?.replace(/[{}]/g, '') || '';
                onPlaySegment(file, start, dur, cleanText);
                return;
            }
        }
        
        // Simple [Text] -> TTS
        const cleanText = (seg.displayContent || seg.text.slice(1, -1)).replace(/[{}]/g, '');
        speak(cleanText);
    };

    // --- Hover Logic ---
    const handleSegmentEnter = (e: React.MouseEvent, idx: number, type: SegmentType) => {
        if (readOnly || type === 'text') return;
        // Clear any pending close timer
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        // Only update if index changed or not set, to avoid jitter if re-entering same node
        setHoveredSeg(prev => (prev?.idx === idx ? prev : { idx, rect, type }));
    };

    const handleSegmentLeave = () => {
        if (readOnly) return;
        // Start close timer with longer delay
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredSeg(null);
        }, 600); 
    };

    const handleHoverMenuEnter = () => {
        // We are inside the menu, cancel close timer
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
    };
    
    const handleHoverMenuLeave = () => {
        // Leaving menu, start close timer (allows going back to text)
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredSeg(null);
        }, 600); 
    };

    const handleHoverAction = (action: 'edit' | 'unmark') => {
        if (!hoveredSeg) return;
        const seg = segments[hoveredSeg.idx];
        
        // Emulate selection state to reuse logic
        const fakeSelection = { 
            start: seg.start, 
            end: seg.end, 
            currentType: seg.type 
        };
        
        setSelectionState(fakeSelection);
        setHoveredSeg(null); // Close menu

        if (action === 'unmark') {
            // We need to bypass handleApplyAction because it relies on stale state closure if called directly?
            // Actually, we can just call it by updating state first then triggering effect? 
            // No, easier to just run logic here for Unmark since we have the range.
            
            const before = rawText.slice(0, seg.start);
            let content = seg.text;
             if (content.startsWith('{')) content = content.slice(1, -1);
            else if (content.startsWith('[')) {
                if (content.includes('](')) content = content.match(/^\[(.*?)\]/)?.[1] || '';
                else content = content.slice(1, -1);
            }
            const after = rawText.slice(seg.end);
            onUpdate(before + content + after);
            setSelectionState(null); // Clear the fake selection
        } else if (action === 'edit') {
            // For Edit, we set selection state and open modal. 
            // We also need to populate initial data.
            const metaMatch = seg.text.match(/\((.*?)\)$/);
            if (metaMatch) {
                const parts = metaMatch[1].split('|');
                setAudioModalInitialData({
                    filename: parts[0] || '',
                    start: parts[1] || '',
                    duration: parts[2] || ''
                });
            } else {
                setAudioModalInitialData(null);
            }
            setIsAudioModalOpen(true);
        }
    };

    return (
        <div className="relative h-full flex flex-col">
            <AudioMarkModal 
                isOpen={isAudioModalOpen}
                onClose={() => { setIsAudioModalOpen(false); setAudioModalInitialData(null); setSelectionState(null); }}
                onConfirm={confirmAudioMark}
                audioFiles={audioLinks}
                initialData={audioModalInitialData}
            />

            {/* Sticky Action Button (Only for Adding) */}
            <div className="sticky top-4 z-50 h-0 flex justify-center pointer-events-none overflow-visible gap-2">
                 {selectionState?.currentType === 'text' && (
                     <>
                        <button 
                            onClick={(e) => { e.preventDefault(); handleApplyAction('highlight'); }}
                            className="pointer-events-auto flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black shadow-xl transition-all transform duration-200 border-2 border-white ring-1 ring-black/5 bg-neutral-900 text-white shadow-neutral-200 hover:scale-105 active:scale-95"
                        >
                            <Highlighter size={14}/>
                            <span>Highlight</span>
                        </button>
                        <button 
                            onClick={(e) => { e.preventDefault(); handleApplyAction('audio'); }}
                            className="pointer-events-auto flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black shadow-xl transition-all transform duration-200 border-2 border-white ring-1 ring-black/5 bg-indigo-600 text-white shadow-indigo-200 hover:scale-105 active:scale-95"
                        >
                            <Volume2 size={14}/>
                            <span>Mark Audio</span>
                        </button>
                     </>
                 )}
                 {selectionState?.currentType !== 'text' && (
                     <>
                         <button 
                            onClick={(e) => { e.preventDefault(); handleApplyAction('clear'); }}
                            className={`pointer-events-auto flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black shadow-xl transition-all transform duration-200 border-2 border-white ring-1 ring-black/5 bg-white text-rose-600 shadow-rose-100 hover:bg-rose-50 ${selectionState ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}`}
                         >
                            <Eraser size={14}/>
                            <span>{selectionState?.currentType === 'highlight' ? 'Unhighlight' : 'Unmark Audio'}</span>
                         </button>
                         
                         {selectionState?.currentType === 'audio' && (
                            <button 
                                onClick={(e) => { e.preventDefault(); handleEditAudio(); }}
                                className={`pointer-events-auto flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-black shadow-xl transition-all transform duration-200 border-2 border-white ring-1 ring-black/5 bg-white text-indigo-600 shadow-indigo-100 hover:bg-indigo-50 ${selectionState ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}`}
                            >
                                <Settings2 size={14}/>
                                <span>Edit Audio</span>
                            </button>
                         )}
                     </>
                 )}
            </div>
            
            {/* Floating Menu for Editing/Removal */}
            {hoveredSeg && (
                <div 
                    className="fixed z-[60] flex items-center gap-1 p-1 bg-neutral-900 rounded-lg shadow-xl animate-in fade-in zoom-in-95"
                    style={{ 
                        top: hoveredSeg.rect.top - 40, 
                        left: hoveredSeg.rect.left + (hoveredSeg.rect.width / 2) - (hoveredSeg.type === 'audio' ? 60 : 35),
                    }}
                    onMouseEnter={handleHoverMenuEnter}
                    onMouseLeave={handleHoverMenuLeave}
                >
                    {hoveredSeg.type === 'audio' && (
                        <button onClick={() => handleHoverAction('edit')} className="p-2 text-white hover:bg-white/20 rounded-md transition-colors" title="Edit">
                            <Settings2 size={14} />
                        </button>
                    )}
                    <button onClick={() => handleHoverAction('unmark')} className="p-2 text-rose-400 hover:bg-white/20 rounded-md transition-colors" title="Unmark">
                        <Eraser size={14} />
                    </button>
                    {/* Tiny arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-neutral-900"></div>
                </div>
            )}
            
            <div 
                ref={containerRef}
                className="text-lg font-medium text-neutral-800 leading-relaxed whitespace-pre-wrap px-6 pb-20 pt-6 select-text cursor-text font-mono"
                onMouseUp={handleSelectionCheck}
                onKeyUp={handleSelectionCheck}
            >
                {segments.map((seg, i) => {
                    if (seg.type === 'highlight') {
                        return (
                            <span 
                                key={`${i}-${seg.start}`} 
                                data-index={i}
                                onMouseEnter={(e) => handleSegmentEnter(e, i, 'highlight')}
                                onMouseLeave={handleSegmentLeave}
                                className="text-red-600 font-bold cursor-pointer hover:bg-red-50 transition-colors rounded mx-0.5 border border-transparent hover:border-red-100"
                            >
                                {seg.displayContent}
                            </span>
                        );
                    }
                    if (seg.type === 'audio') {
                        return (
                            <span 
                                key={`${i}-${seg.start}`} 
                                data-index={i}
                                onClick={(e) => handlePlaySegment(e, seg)}
                                onMouseEnter={(e) => handleSegmentEnter(e, i, 'audio')}
                                onMouseLeave={handleSegmentLeave}
                                className={`${showDash ? 'border-b-2 border-dashed border-indigo-400' : ''} text-indigo-900 cursor-pointer hover:bg-indigo-50 transition-colors mx-0.5 relative group/audio py-0.5 rounded border border-transparent hover:border-indigo-100`}
                                title="Click to listen"
                            >
                                <HighlightedText text={seg.displayContent || 'error'} showDash={showDash} />
                                {seg.text.includes('](') && (
                                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                                )}
                            </span>
                        );
                    }
                    return (
                        <span key={`${i}-${seg.start}`} data-index={i}>
                            {seg.text}
                        </span>
                    );
                })}
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
    showDash: boolean;
    onToggleDash: () => void;
}

const ListeningPracticeModal: React.FC<ListeningPracticeProps> = ({ isOpen, onClose, item, onUpdate, showDash, onToggleDash }) => {
    const audioLinks = item.audioLinks || [];
    const [currentIdx, setCurrentIdx] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [editableText, setEditableText] = useState(item.text);
    const [isEditMode, setIsEditMode] = useState(false); 
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const saveTimeoutRef = useRef<any>(null);
    const stopAtTimeRef = useRef<number | null>(null);

    // Audio Cleanup on Unmount
    useEffect(() => {
        return () => {
            stopAudio();
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            stopAudio();
            setCurrentIdx(0);
        } else {
            setEditableText(item.text); 
            loadTrack(0, false); 
        }
    }, [isOpen, item.id]);

    const handleTextUpdate = (newText: string) => {
        setEditableText(newText);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            onUpdate({ ...item, text: newText });
        }, 1500);
    };

    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        stopSpeaking(); // Stop TTS if any
        setIsPlaying(false);
        stopAtTimeRef.current = null;
    };

    const loadTrack = (index: number, autoPlay: boolean) => {
        // Don't stop if we are just switching tracks logically, but yes stop playback
        stopAudio();
        setCurrentIdx(index);
        
        if (audioLinks.length > 0 && audioLinks[index]) {
            const url = audioLinks[index];
            // Reuse audio element if possible or create new one?
            // To ensure clean state, let's create new or reset src
            let audio = audioRef.current;
            if (!audio) {
                audio = new Audio();
                audioRef.current = audio;
            }
            
            // Remove old listeners to avoid duplicates
            // Actually better to just recreate or manage listeners carefully. 
            // Simple way: new Audio each time track changes.
            audio = new Audio(url);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
                setDuration(audio.duration);
            });
            
            audio.addEventListener('timeupdate', () => {
                if (!audio) return;
                setCurrentTime(audio.currentTime);
                
                // Check for segment stop
                if (stopAtTimeRef.current !== null && audio.currentTime >= stopAtTimeRef.current) {
                    audio.pause();
                    setIsPlaying(false);
                    stopAtTimeRef.current = null;
                }
            });
            
            audio.addEventListener('ended', () => {
                setIsPlaying(false);
                stopAtTimeRef.current = null;
                // Auto next track logic only for global play, not segment play
                if (stopAtTimeRef.current === null) {
                     // For now, let's just stop at end of track unless we implement global playlist mode
                     // If we want global auto-next:
                     // if (index < audioLinks.length - 1) loadTrack(index + 1, true);
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
                    stopAtTimeRef.current = null; // Clear segment stop if user manually plays
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
                const cleanText = item.text.replace(/[{}]/g, '').replace(/\[|\]/g, '').replace(/\(.*?\|.*?\)/g, ''); 
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
    
    const handlePlaySegment = (filename: string | undefined, start: number | undefined, duration: number | undefined, textFallback: string) => {
        // If no filename, use TTS
        if (!filename) {
            speak(textFallback);
            return;
        }

        // Find file index
        // Try exact match first
        let idx = audioLinks.findIndex(l => l === filename || decodeURIComponent(l).endsWith(filename) || l.includes(filename));
        
        if (idx === -1) {
            console.warn("Audio file not found for segment:", filename);
            speak(textFallback);
            return;
        }
        
        // Load and seek
        // If track is already loaded, just seek
        if (idx === currentIdx && audioRef.current) {
            if (start !== undefined) audioRef.current.currentTime = start;
            if (duration !== undefined) stopAtTimeRef.current = (start || 0) + duration;
            else stopAtTimeRef.current = null;
            
            audioRef.current.play().catch(console.error);
            setIsPlaying(true);
        } else {
            // Switch track
            stopAudio();
            setCurrentIdx(idx);
            
            const url = audioLinks[idx];
            const audio = new Audio(url);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
                setDuration(audio.duration);
                if (start !== undefined) audio.currentTime = start;
                if (duration !== undefined) stopAtTimeRef.current = (start || 0) + duration;
                
                audio.play().catch(console.error);
                setIsPlaying(true);
            });
            
            audio.addEventListener('timeupdate', () => {
                setCurrentTime(audio.currentTime);
                if (stopAtTimeRef.current !== null && audio.currentTime >= stopAtTimeRef.current) {
                    audio.pause();
                    setIsPlaying(false);
                    stopAtTimeRef.current = null;
                }
            });
            
            audio.addEventListener('ended', () => setIsPlaying(false));
        }
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
                            <button onClick={onToggleDash} className={`p-2 rounded-lg transition-all ${showDash ? 'bg-white shadow-sm text-indigo-600' : 'text-neutral-400 hover:text-neutral-600'}`} title="Toggle Audio Marks">
                                <ScanLine size={16} />
                            </button>
                            <div className="w-px h-4 bg-neutral-200 mx-1"></div>
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
                                <InteractiveTranscript 
                                    rawText={editableText} 
                                    onUpdate={handleTextUpdate} 
                                    showDash={showDash}
                                    audioLinks={audioLinks}
                                    onPlaySegment={handlePlaySegment}
                                />
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
      showType: true,
      showDash: false // CHANGED DEFAULT TO FALSE
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
  
  const handleToggleDash = () => {
      setViewSettings(v => ({...v, showDash: !v.showDash}));
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
              <HighlightedText text={truncated} showDash={viewSettings.showDash} />
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
                        { label: 'Show Dash Lines', checked: viewSettings.showDash, onChange: handleToggleDash },
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
                <div className="flex flex-col gap-2 h-full justify-between">
                     {viewSettings.showNote && item.note && (
                        <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium bg-neutral-50 px-2 py-1 rounded-lg w-fit">
                            <Info size={12}/> {item.note}
                        </div>
                    )}
                     <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full w-fit uppercase tracking-wider border border-emerald-100 self-start">
                         <Music size={10} /> {item.audioLinks ? item.audioLinks.length : 0} Tracks
                     </div>
                </div>
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
            showDash={viewSettings.showDash}
            onToggleDash={handleToggleDash}
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
