
import React, { useState, useMemo } from 'react';
import { VocabularyItem } from '../../../../app/types';
import { X, Search, CheckSquare, Square, Loader2, Plus } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (selectedWords: string[]) => void;
    allWords: VocabularyItem[];
    wordsToExclude: Set<string>;
    loading: boolean;
}

const WordSelectorModal: React.FC<Props> = ({ isOpen, onClose, onSelect, allWords, wordsToExclude, loading }) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const filteredWords = useMemo(() => {
        if (!query) return allWords;
        const lowerQuery = query.toLowerCase();
        return allWords.filter(w => w.word.toLowerCase().includes(lowerQuery));
    }, [allWords, query]);

    const handleToggle = (word: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(word)) next.delete(word);
            else next.add(word);
            return next;
        });
    };
    
    const handleConfirm = () => {
        onSelect(Array.from(selected));
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-neutral-50 w-full max-w-lg rounded-[2rem] shadow-2xl border border-neutral-200 flex flex-col h-[70vh]">
                <header className="p-4 border-b border-neutral-200 flex justify-between items-center shrink-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                        <input 
                            type="text" 
                            value={query} 
                            onChange={e => setQuery(e.target.value)} 
                            placeholder="Search your library..." 
                            className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" 
                            autoFocus
                        />
                    </div>
                    <button onClick={onClose} className="p-2 ml-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={16}/></button>
                </header>

                <main className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-neutral-300"/></div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {filteredWords.map(word => {
                                const isSelected = selected.has(word.word);
                                const isExcluded = wordsToExclude.has(word.word);
                                return (
                                    <button 
                                        key={word.id} 
                                        onClick={() => !isExcluded && handleToggle(word.word)}
                                        disabled={isExcluded}
                                        className={`flex items-center justify-between p-3 rounded-lg text-left transition-colors ${isExcluded ? 'bg-neutral-100 opacity-50 cursor-not-allowed' : isSelected ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-neutral-100'}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">{word.word}</span>
                                            <span className="text-xs text-neutral-500">{word.meaningVi}</span>
                                        </div>
                                        {isExcluded ? 
                                            <CheckSquare size={18} className="text-neutral-400" /> : 
                                            isSelected ? 
                                            <CheckSquare size={18} className="text-indigo-600"/> :
                                            <Square size={18} className="text-neutral-300" />
                                        }
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </main>

                <footer className="p-4 border-t border-neutral-200 flex justify-end gap-3 shrink-0 bg-white/50 backdrop-blur-sm">
                    <button onClick={onClose} className="px-5 py-2.5 bg-neutral-100 text-neutral-600 rounded-lg font-bold text-xs hover:bg-neutral-200 transition-all">Cancel</button>
                    <button onClick={handleConfirm} disabled={selected.size === 0} className="px-5 py-2.5 bg-neutral-900 text-white rounded-lg font-black text-xs flex items-center space-x-2 hover:bg-neutral-800 transition-all disabled:opacity-50">
                        <Plus size={14}/><span>Add ({selected.size})</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default WordSelectorModal;
