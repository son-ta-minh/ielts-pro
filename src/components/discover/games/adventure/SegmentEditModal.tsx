
import React, { useState, useMemo } from 'react';
import { AdventureSegment } from '../../../../data/adventure_content';
import { VocabularyItem } from '../../../../app/types';
import { X, Plus, Sparkles, Save, Loader2 } from 'lucide-react';
import WordSelectorModal from './WordSelectorModal';

interface Props {
    segment: AdventureSegment;
    chapterId: string;
    allWords: VocabularyItem[];
    wordsLoading: boolean;
    onSave: (chapterId: string, updatedSegment: AdventureSegment) => Promise<void>;
    onClose: () => void;
    onRefine: (segment: AdventureSegment) => void;
}

const WordListEditor: React.FC<{
    title: string;
    words: string[];
    onWordsChange: (newWords: string[]) => void;
    onAddClick: () => void;
    wordStatusMap: Map<string, VocabularyItem>;
}> = ({ title, words, onWordsChange, onAddClick, wordStatusMap }) => {
    const handleRemove = (wordToRemove: string) => {
        onWordsChange(words.filter(w => w !== wordToRemove));
    };

    return (
        <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{title}</h4>
                <button onClick={onAddClick} className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-neutral-900 bg-white px-2 py-1 rounded-md border border-neutral-200 shadow-sm"><Plus size={12}/> Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
                {words.length === 0 && <span className="text-xs text-neutral-400 italic p-2">No words assigned.</span>}
                {words.map(word => {
                    const item = wordStatusMap.get(word.toLowerCase());
                    let statusClass = 'bg-white border-neutral-200 text-neutral-800'; // Default: In library, to learn
                    if (!item) {
                        statusClass = 'bg-red-50 border-red-200 text-red-700'; // Not in library
                    } else if (item.lastGrade === 'HARD') {
                        statusClass = 'bg-amber-50 border-amber-200 text-amber-700'; // Hard
                    } else if (item.consecutiveCorrect > 0) {
                        statusClass = 'bg-green-50 border-green-200 text-green-700'; // Learned
                    }

                    return (
                        <div key={word} className={`flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-bold transition-colors ${statusClass}`}>
                            <span>{word}</span>
                            <button onClick={() => handleRemove(word)} className="p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 rounded-full"><X size={12}/></button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


const SegmentEditModal: React.FC<Props> = ({ segment, chapterId, allWords, wordsLoading, onSave, onClose, onRefine }) => {
    const [basicWords, setBasicWords] = useState(segment.basicWords);
    const [intermediateWords, setIntermediateWords] = useState(segment.intermediateWords);
    const [advancedWords, setAdvancedWords] = useState(segment.advancedWords);

    const [isSaving, setIsSaving] = useState(false);
    const [isWordSelectorOpen, setIsWordSelectorOpen] = useState(false);
    const [wordSelectorTarget, setWordSelectorTarget] = useState<'basic' | 'intermediate' | 'advanced' | null>(null);

    const allSegmentWords = useMemo(() => new Set([...basicWords, ...intermediateWords, ...advancedWords]), [basicWords, intermediateWords, advancedWords]);
    
    const wordStatusMap = useMemo(() => {
        const map = new Map<string, VocabularyItem>();
        for (const word of allWords) {
            map.set(word.word.toLowerCase(), word);
        }
        return map;
    }, [allWords]);

    const handleOpenWordSelector = (target: 'basic' | 'intermediate' | 'advanced') => {
        setWordSelectorTarget(target);
        setIsWordSelectorOpen(true);
    };

    const handleWordsSelected = (selected: string[]) => {
        if (!wordSelectorTarget) return;
        const currentList = wordSelectorTarget === 'basic' ? basicWords : wordSelectorTarget === 'intermediate' ? intermediateWords : advancedWords;
        const newList = Array.from(new Set([...currentList, ...selected]));
        
        if (wordSelectorTarget === 'basic') setBasicWords(newList);
        else if (wordSelectorTarget === 'intermediate') setIntermediateWords(newList);
        else setAdvancedWords(newList);

        setIsWordSelectorOpen(false);
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        const updatedSegment = { ...segment, basicWords, intermediateWords, advancedWords };
        await onSave(chapterId, updatedSegment);
        // The parent component handles closing the modal.
    };

    return (
        <>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                    <header className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center shrink-0">
                        <div className="space-y-0.5">
                            <h3 className="text-lg font-black text-neutral-900 leading-tight">Edit Sub-topic</h3>
                            <p className="text-xs text-neutral-500 font-medium">{segment.title}</p>
                        </div>
                        <div className="flex items-center gap-2">
                             <button onClick={() => onRefine(segment)} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-black text-[10px] flex items-center space-x-1.5 hover:bg-neutral-50 active:scale-95 transition-all shadow-sm"><Sparkles size={12} className="text-amber-500" /><span>Refine Words</span></button>
                             <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={16}/></button>
                        </div>
                    </header>
                    <main className="p-6 overflow-y-auto space-y-4">
                        <WordListEditor title="Basic Words" words={basicWords} onWordsChange={setBasicWords} onAddClick={() => handleOpenWordSelector('basic')} wordStatusMap={wordStatusMap} />
                        <WordListEditor title="Intermediate Words" words={intermediateWords} onWordsChange={setIntermediateWords} onAddClick={() => handleOpenWordSelector('intermediate')} wordStatusMap={wordStatusMap} />
                        <WordListEditor title="Advanced Words" words={advancedWords} onWordsChange={setAdvancedWords} onAddClick={() => handleOpenWordSelector('advanced')} wordStatusMap={wordStatusMap} />
                    </main>
                    <footer className="px-6 py-4 border-t border-neutral-100 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3 text-[9px] font-bold text-neutral-500">
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-200 border border-green-300"></div>Learned</span>
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-200 border border-amber-300"></div>Hard</span>
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-200 border border-red-300"></div>Not in Library</span>
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-neutral-200 border border-neutral-300"></div>To Learn</span>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={onClose} disabled={isSaving} className="px-6 py-3 bg-neutral-100 text-neutral-500 rounded-xl font-bold text-xs hover:bg-neutral-200 transition-all disabled:opacity-50">Cancel</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all disabled:opacity-50">
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14}/>}
                                <span>{isSaving ? 'SAVING...' : 'Save Changes'}</span>
                            </button>
                        </div>
                    </footer>
                </div>
            </div>
            {isWordSelectorOpen && (
                <WordSelectorModal 
                    isOpen={isWordSelectorOpen}
                    onClose={() => setIsWordSelectorOpen(false)}
                    onSelect={handleWordsSelected}
                    allWords={allWords}
                    wordsToExclude={allSegmentWords}
                    loading={wordsLoading}
                />
            )}
        </>
    );
};

export default SegmentEditModal;
