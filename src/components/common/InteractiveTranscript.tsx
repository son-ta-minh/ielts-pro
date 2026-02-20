import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Highlighter, Volume2, Eraser, Settings2, Baseline } from 'lucide-react';
import { speak } from '../../utils/audio';
import { AudioMarkModal } from './AudioMarkModal';

// --- Highlighted Text Renderer (Simplified) ---
const HighlightedText: React.FC<{ text: string }> = ({ text }) => {
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

export const InteractiveTranscript: React.FC<InteractiveTranscriptProps> = ({ rawText, onUpdate, readOnly = false, showDash: initialShowDash = true, audioLinks = [], onPlaySegment }) => {
    const [isDashlineVisible, setIsDashlineVisible] = useState(initialShowDash);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(rawText);

    useEffect(() => {
        setEditText(rawText);
    }, [rawText]);

    const handleSave = () => {
        onUpdate(editText);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditText(rawText);
        setIsEditing(false);
    };
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
        const regex = /({[\s\S]*?}|\[[\s\S]*?\]\([\s\S]*?\)|\[[\s\S]*?\])/g;
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

        const handleEnterEditMode = () => {
        setSelectionState(null);
        window.getSelection()?.removeAllRanges();
        setIsEditing(true);
    };

    const handleSelectionCheck = () => {
        if (readOnly || isEditing) return;
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
            {/* --- CONTROLS --- */}
            {!readOnly && (
                <div className="absolute top-4 right-6 z-10 flex items-center gap-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleSave} className="px-4 py-2 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">Save</button>
                            <button onClick={handleCancel} className="px-4 py-2 text-xs font-bold text-neutral-700 bg-neutral-200 rounded-lg hover:bg-neutral-300 transition-colors">Cancel</button>
                        </>
                    ) : (
                                                <>
                            <button onClick={() => setIsDashlineVisible(!isDashlineVisible)} className={`p-2 text-xs font-bold rounded-lg transition-colors border ${isDashlineVisible ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-neutral-500 bg-neutral-100 border-neutral-200 hover:bg-neutral-200'}`} title="Toggle Dashed Line">
                               <Baseline size={16}/>
                            </button>
                            <button onClick={handleEnterEditMode} className="px-4 py-2 text-xs font-bold text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors border border-neutral-200">Edit</button>
                        </>
                    )}
                </div>
            )}
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
            
            {isEditing ? (
                <textarea 
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="flex-1 w-full p-6 text-lg font-mono bg-neutral-50 border-0 focus:ring-0 resize-none"
                />
            ) : (
                <div 
                    ref={containerRef}
                    className="text-lg font-medium text-neutral-800 leading-relaxed whitespace-pre-wrap px-6 pb-8 pt-8 select-text cursor-text font-mono"
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
                                    className={`${isDashlineVisible ? 'bg-indigo-100/50' : ''} text-indigo-900 cursor-pointer hover:bg-indigo-100 transition-colors mx-0.5 relative group/audio py-0.5 rounded`}
                                    title="Click to listen"
                                >
                                    <HighlightedText text={seg.displayContent || 'error'} />
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
            )}
        </div>
    );
};
