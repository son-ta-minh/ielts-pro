
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Type, Underline, Minus, Plus, BookText, Link, Unlink, HelpCircle, ChevronDown, CheckCircle2, X } from 'lucide-react';
import { VocabularyItem } from '../../app/types';
import { parseVocabMapping, getEssayHighlightRegex } from '../../utils/text';

export type HighlightColor = 'none' | 'amber' | 'emerald' | 'sky' | 'rose';

const highlightStyles: Record<Exclude<HighlightColor, 'none'>, string> = { 
    amber: "bg-amber-200/60 text-neutral-900 border-amber-300", 
    emerald: "bg-emerald-200/60 text-neutral-900 border-emerald-300", 
    sky: "bg-sky-200/60 text-neutral-900 border-sky-300", 
    rose: "bg-rose-200/60 text-neutral-900 border-rose-300" 
};

const MAX_PRACTICE_BLANKS = 10;
const MAX_DROPDOWN_CANDIDATES = 4;

interface ControlProps {
    isUnderlined: boolean;
    toggleUnderline: () => void;
    highlightColor: HighlightColor;
    setHighlightColor: (c: HighlightColor) => void;
    fontSize: number;
    setFontSize: (s: number) => void;
    isSerif: boolean;
    toggleFontFamily: () => void;
    isPracticeMode?: boolean;
    onResetPractice?: () => void;
    currentSelection?: { text: string; isLinked: boolean } | null;
    onWordAction?: (text: string, action: 'add' | 'remove') => void;
    onClearSelection?: () => void;
}

const HighlightControls: React.FC<ControlProps> = ({ 
    isUnderlined, toggleUnderline, highlightColor, setHighlightColor, 
    fontSize, setFontSize, isSerif, toggleFontFamily, 
    isPracticeMode, onResetPractice,
    currentSelection, onWordAction, onClearSelection 
}) => (
    <div className="highlight-controls-container flex items-center gap-2 bg-white p-1 rounded-xl border border-neutral-200 shadow-sm h-[42px]">
        <div className="flex items-center gap-1 px-1">
            <button onClick={toggleFontFamily} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors" title={isSerif ? "Switch to Sans-Serif" : "Switch to Serif"}><Type size={14} /></button>
            <div className="w-px h-3 bg-neutral-200 mx-1"></div>
            <button onClick={() => setFontSize(Math.max(12, fontSize - 1))} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors"><Minus size={12} /></button>
            <span className="text-[10px] font-black min-w-[16px] text-center select-none text-neutral-400">{fontSize}</span>
            <button onClick={() => setFontSize(Math.min(24, fontSize + 1))} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors"><Plus size={12} /></button>
        </div>
        <div className="w-px h-4 bg-neutral-200 mx-1"></div>
        <button onClick={toggleUnderline} className={`p-1.5 rounded-lg transition-all duration-200 ${isUnderlined ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-400 hover:text-neutral-600'}`} title="Toggle Underline"><Underline size={14} /></button>
        <div className="flex items-center gap-1.5 pl-1">
            <button
                onClick={() => setHighlightColor('none')}
                className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 border ${highlightColor === 'none' ? 'ring-2 ring-offset-2 ring-neutral-300 scale-110 bg-red-500 text-white' : 'bg-red-500 text-white opacity-60 hover:opacity-100'}`}
                title="No Highlight"
            >
                <X size={10} />
            </button>
            {(['amber', 'emerald', 'sky', 'rose'] as Exclude<HighlightColor, 'none'>[]).map(color => (
                <button
                    key={color}
                    onClick={() => setHighlightColor(color)}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${highlightColor === color ? `ring-2 ring-offset-2 ring-neutral-300 scale-110 bg-${color}-400` : `opacity-40 hover:opacity-100 bg-${color}-400`}`}
                    title={`Highlight ${color}`}
                />
            ))}
        </div>
        
        {isPracticeMode && (
            <>
                <div className="w-px h-4 bg-neutral-200 mx-1"></div>
                <button onClick={onResetPractice} className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all">New Random Blanks</button>
            </>
        )}

        {currentSelection && onWordAction && onClearSelection && !isPracticeMode && (
             <>
                <div className="w-px h-4 bg-neutral-200 mx-1"></div>
                <div className="flex items-center gap-2 pr-1 animate-in fade-in slide-in-from-left-2 duration-200">
                    <span className="text-[10px] font-bold text-neutral-400 max-w-[100px] truncate hidden sm:inline-block pointer-events-none select-none">
                        "{currentSelection.text}"
                    </span>
                    <button 
                        onMouseDown={(e) => {
                             e.preventDefault();
                             onWordAction(currentSelection.text, currentSelection.isLinked ? 'remove' : 'add');
                             onClearSelection();
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 ${
                            currentSelection.isLinked 
                                ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100' 
                                : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                        }`}
                    >
                        {currentSelection.isLinked ? <Unlink size={12} /> : <Link size={12} />}
                        <span>{currentSelection.isLinked ? 'Unlink' : 'Link'}</span>
                    </button>
                    <button 
                        onMouseDown={(e) => { e.preventDefault(); onClearSelection(); }}
                        className="p-1.5 text-neutral-300 hover:text-neutral-500 rounded-lg hover:bg-neutral-100 transition-colors"
                        title="Clear Selection"
                    >
                        <X size={14} />
                    </button>
                </div>
             </>
        )}
    </div>
);

const PracticeInput: React.FC<{ 
    answer: string; 
    wordObj?: VocabularyItem; 
    candidates: string[];
    onCorrect: () => void;
}> = ({ answer, wordObj, candidates, onCorrect }) => {
    const [value, setValue] = useState('');
    const [showHint, setShowHint] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);
    
    const isCorrect = value.trim().toLowerCase() === answer.toLowerCase();
    const isWrong = value.trim().length > 0 && !answer.toLowerCase().startsWith(value.trim().toLowerCase());

    useEffect(() => {
        if (isCorrect) {
            onCorrect();
            setShowDropdown(false);
        }
    }, [isCorrect, onCorrect]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (choice: string) => {
        setValue(choice);
        setShowDropdown(false);
    };

    return (
        <span ref={containerRef} className="relative inline-block align-baseline group/input">
            <div className="flex items-center">
                <input
                    type="text"
                    value={value}
                    onFocus={() => !isCorrect && setShowDropdown(true)}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={isCorrect}
                    className={`
                        h-[1.4em] px-2 py-0 ml-1 rounded-md border-b-2 font-bold transition-all outline-none text-center
                        ${isCorrect 
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 min-w-[2ch]' 
                            : isWrong 
                                ? 'bg-rose-50 border-rose-400 text-rose-700' 
                                : 'bg-neutral-50 border-neutral-300 focus:bg-white focus:border-neutral-900 focus:shadow-sm'
                        }
                    `}
                    style={{ width: `${Math.max(answer.length, 3)}ch` }}
                    placeholder="..."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                />
                
                {!isCorrect && (
                    <button 
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="p-1 text-neutral-300 hover:text-neutral-600 transition-colors"
                    >
                        <ChevronDown size={10} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                    </button>
                )}
            </div>
            
            {showDropdown && candidates.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-[60] bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden min-w-[120px] animate-in fade-in zoom-in-95">
                    <div className="p-1 flex flex-col">
                        {candidates.map((choice, i) => (
                            <button 
                                key={i}
                                onClick={() => handleSelect(choice)}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors truncate"
                            >
                                {choice}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {!isCorrect && wordObj && (
                <button onMouseDown={(e) => { e.preventDefault(); setShowHint(!showHint); }} className="absolute -top-3 -right-2 p-0.5 text-neutral-300 hover:text-amber-500 opacity-0 group-hover/input:opacity-100 transition-opacity" title="Hint"><HelpCircle size={10} /></button>
            )}

            {showHint && wordObj && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="bg-neutral-900 text-white rounded-xl shadow-xl px-4 py-2 flex flex-col items-center gap-1 min-w-[120px]">
                        <span className="text-[10px] font-black uppercase text-amber-400 tracking-widest">{wordObj.ipaUs || '/?/'}</span>
                        <span className="text-xs font-bold leading-tight text-center">{wordObj.meaningVi}</span>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 rotate-45"></div>
                    </div>
                </div>
            )}
        </span>
    );
};

const HighlightedEssay: React.FC<{ 
    text: string; 
    vocabString?: string; 
    wordsByText: Map<string, VocabularyItem>; 
    highlightColor: HighlightColor; 
    isUnderlined: boolean; 
    onHoverWord?: (word: VocabularyItem | null, rect: DOMRect | null) => void;
    isPracticeMode?: boolean;
    practiceSessionKey: number;
}> = ({ text, vocabString, wordsByText, highlightColor, isUnderlined, onHoverWord, isPracticeMode, practiceSessionKey }) => {
    const mapping = useMemo(() => parseVocabMapping(vocabString), [vocabString]);
    const regex = useMemo(() => getEssayHighlightRegex(mapping), [mapping]);
    const [correctAnswers, setCorrectAnswers] = useState<Set<number>>(new Set());
    
    const candidatePool = useMemo(() => {
        const pool = Array.from(mapping.keys()).filter((k: string) => k.length > 2);
        return pool;
    }, [mapping]);

    const practiceData = useMemo(() => {
        if (!isPracticeMode || !text || !regex) return { blanks: new Set<number>(), choices: new Map<number, string[]>() };
        
        const tempParts = text.split(regex);
        const matchIndices: number[] = [];
        tempParts.forEach((_, idx) => {
            if (idx % 2 === 1) matchIndices.push(idx);
        });

        const shuffledIndices = [...matchIndices].sort(() => Math.random() - 0.5);
        const selectedBlanks = new Set(shuffledIndices.slice(0, MAX_PRACTICE_BLANKS));
        
        const choicesMap = new Map<number, string[]>();
        selectedBlanks.forEach(idx => {
            const correct = tempParts[idx];
            const others = (candidatePool as string[])
                .filter(c => c.toLowerCase() !== correct.toLowerCase())
                .sort(() => Math.random() - 0.5)
                .slice(0, MAX_DROPDOWN_CANDIDATES - 1);
            
            choicesMap.set(idx, [correct, ...others].sort(() => Math.random() - 0.5));
        });

        return { blanks: selectedBlanks, choices: choicesMap };
    }, [isPracticeMode, practiceSessionKey, text, regex, candidatePool]);

    useEffect(() => {
        setCorrectAnswers(new Set());
    }, [practiceSessionKey]);
    
    if (!text) return null;
    if (!regex) return <span>{text}</span>;
    
    const parts = text.split(regex);
    const totalBlanks = practiceData.blanks.size;
    const allCorrect = totalBlanks > 0 && correctAnswers.size === totalBlanks;

    return (
        <div>
            {isPracticeMode && totalBlanks > 0 && (
                <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm p-3 rounded-b-xl mb-4 border-b border-x border-neutral-200 shadow-sm flex items-center justify-between">
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Practice Progress</h4>
                        <p className="text-sm font-bold text-neutral-800">{correctAnswers.size} / {totalBlanks} correct</p>
                    </div>
                    {allCorrect && (
                        <div className="flex items-center gap-2 text-green-600 font-bold text-sm animate-in fade-in zoom-in-95">
                            <CheckCircle2 size={18}/>
                            <span>Complete!</span>
                        </div>
                    )}
                </div>
            )}
            <span key={practiceSessionKey}>{parts.map((part, index) => { 
                const isMatch = (index % 2) === 1; 
                if (isMatch) { 
                    const textLower = part.toLowerCase(); 
                    const baseWord = mapping.get(textLower); 
                    const wordObj = baseWord ? wordsByText.get(baseWord) : undefined; 
                    
                    if (isPracticeMode && practiceData.blanks.has(index)) {
                        return (
                            <PracticeInput 
                                key={`${practiceSessionKey}-${index}`}
                                answer={part} 
                                wordObj={wordObj} 
                                candidates={practiceData.choices.get(index) || []}
                                onCorrect={() => setCorrectAnswers(prev => new Set(prev).add(index))}
                            />
                        );
                    }

                    if (wordObj) { 
                        return (
                            <span 
                                key={index} 
                                className={`transition-all ${
                                    isPracticeMode
                                        ? 'text-neutral-900 border-b border-neutral-200'
                                        : highlightColor === 'none'
                                            ? 'text-neutral-800'
                                            : `font-semibold ${highlightStyles[highlightColor as Exclude<HighlightColor, 'none'>]} ${isUnderlined ? 'border-b-2' : ''} px-0.5 rounded-t-sm cursor-help`
                                }`}
                                onMouseEnter={(e) => {
                                    if (!isPracticeMode && highlightColor !== 'none') {
                                        onHoverWord?.(wordObj, e.currentTarget.getBoundingClientRect());
                                    }
                                }}
                                onMouseLeave={() => {
                                    if (!isPracticeMode && highlightColor !== 'none') {
                                        onHoverWord?.(null, null);
                                    }
                                }}
                            >
                                {part}
                            </span>
                        ); 
                    } 
                    return <span key={index}>{part}</span>; 
                } 
                return <React.Fragment key={index}>{part}</React.Fragment>; 
            })}</span>
        </div>
    );
};

export interface EssayReaderUIProps {
    text: string;
    vocabString?: string;
    wordsByText: Map<string, VocabularyItem>;
    highlightColor: HighlightColor;
    setHighlightColor: (c: HighlightColor) => void;
    isUnderlined: boolean;
    setIsUnderlined: (b: boolean) => void;
    fontSize: number;
    setFontSize: (s: number) => void;
    isSerif: boolean;
    setIsSerif: (b: boolean) => void;
    onHoverWord?: (word: VocabularyItem | null, rect: DOMRect | null) => void;
    onWordAction?: (text: string, action: 'add' | 'remove') => void;
    isPracticeMode?: boolean;
    className?: string;
}

export const EssayReaderUI: React.FC<EssayReaderUIProps> = ({
    text, vocabString, wordsByText,
    highlightColor, setHighlightColor, isUnderlined, setIsUnderlined,
    fontSize, setFontSize, isSerif, setIsSerif, onHoverWord, onWordAction,
    isPracticeMode, className
}) => {
    const [currentSelection, setCurrentSelection] = useState<{ text: string; isLinked: boolean } | null>(null);
    const [practiceSessionKey, setPracticeSessionKey] = useState(Date.now());

    useEffect(() => { setCurrentSelection(null); }, [text, vocabString]);

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!onWordAction || isPracticeMode) return;
        
        // Ignore if clicking inside header controls to prevent clearing selection
        if ((e.target as HTMLElement).closest('.highlight-controls-container')) return;

        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) { 
                setCurrentSelection(null); 
                return; 
            }
            const selectedText = selection.toString().trim();
            if (!selectedText || selectedText.includes('\n') || selectedText.length > 50) { 
                setCurrentSelection(null); 
                return; 
            }
            const mapping = parseVocabMapping(vocabString);
            const isLinked = mapping.has(selectedText.toLowerCase());
            setCurrentSelection({ text: selectedText, isLinked });
        }, 10);
    };

    const handleClearSelection = () => {
        setCurrentSelection(null);
        window.getSelection()?.removeAllRanges();
    };

    return (
        <div className={`flex flex-col h-full bg-white relative overflow-hidden ${className || ''}`} onMouseUp={handleMouseUp}>
            <div className="px-4 py-1.5 border-b border-neutral-100 bg-neutral-50/30 flex justify-between items-center min-h-[46px] sticky top-0 z-10">
                <HighlightControls 
                    isUnderlined={isUnderlined} toggleUnderline={() => setIsUnderlined(!isUnderlined)} 
                    highlightColor={highlightColor} setHighlightColor={setHighlightColor} 
                    fontSize={fontSize} setFontSize={setFontSize} 
                    isSerif={isSerif} toggleFontFamily={() => setIsSerif(!isSerif)} 
                    isPracticeMode={isPracticeMode}
                    onResetPractice={() => setPracticeSessionKey(Date.now())}
                    currentSelection={currentSelection}
                    onWordAction={onWordAction}
                    onClearSelection={handleClearSelection}
                />
            </div>
            <div className={`px-5 pb-5 pt-3 md:px-8 md:pb-8 md:pt-4 flex-1 overflow-y-auto stable-scrollbar relative ${isPracticeMode ? 'bg-neutral-50/20' : ''}`}>
                <div 
                    className="text-neutral-800 font-normal whitespace-pre-wrap leading-relaxed transition-all duration-200" 
                    style={{ fontSize: `${fontSize}px`, fontFamily: isSerif ? 'Georgia, serif' : 'Inter, sans-serif' }}
                >
                    <HighlightedEssay 
                        text={text} 
                        vocabString={vocabString} 
                        wordsByText={wordsByText} 
                        highlightColor={highlightColor} 
                        isUnderlined={isUnderlined} 
                        onHoverWord={onHoverWord} 
                        isPracticeMode={isPracticeMode}
                        practiceSessionKey={practiceSessionKey}
                    />
                </div>
                {!text && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-300 pointer-events-none">
                        <BookText size={48} className="mb-4 opacity-10" />
                        <p className="font-bold text-neutral-400 uppercase tracking-widest text-[10px]">No essay content.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
