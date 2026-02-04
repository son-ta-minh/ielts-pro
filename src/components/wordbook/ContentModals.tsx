
import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Search, ChevronRight } from 'lucide-react';
import { Unit, VocabularyItem, WordBookItem, WordBook } from '../../app/types';
import { BookIcon } from './WordBookCard';

export const AddWordToBookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (word: string, definition: string) => void;
}> = ({ isOpen, onClose, onSave }) => {
    const [word, setWord] = useState('');
    const [definition, setDefinition] = useState('');
    useEffect(() => { if (isOpen) { setWord(''); setDefinition(''); } }, [isOpen]);
    const handleSave = () => { if (word.trim()) onSave(word.trim(), definition.trim()); };
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start">
                    <div><h3 className="text-xl font-black text-neutral-900">Add Word to Book</h3></div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 space-y-4">
                    <div className="space-y-1"><label className="font-bold text-sm">Word / Phrase</label><input value={word} onChange={e => setWord(e.target.value)} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-medium" autoFocus /></div>
                    <div className="space-y-1"><label className="font-bold text-sm">Definition (Optional)</label><textarea value={definition} onChange={e => setDefinition(e.target.value)} rows={3} className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-lg font-medium text-sm" /></div>
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]"><button onClick={handleSave} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Word</button></footer>
            </div>
        </div>
    );
};

export const AddFromUnitModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (words: VocabularyItem[]) => void;
    units: Unit[];
    libraryWords: VocabularyItem[];
    wordsInBook: WordBookItem[];
}> = ({ isOpen, onClose, onSave, units, libraryWords, wordsInBook }) => {
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [staged, setStaged] = useState<VocabularyItem[]>([]);
    
    const wordsInBookSet = useMemo(() => new Set(wordsInBook.map(w => w.word.toLowerCase())), [wordsInBook]);
    const wordsById = useMemo(() => new Map(libraryWords.map(w => [w.id, w])), [libraryWords]);

    useEffect(() => {
        if (isOpen) {
            setSelectedUnitId(null);
            setStaged([]);
        }
    }, [isOpen]);

    const handleSelectUnit = (unitId: string) => {
        setSelectedUnitId(unitId);
        const unit = units.find(u => u.id === unitId);
        if (unit) {
            const unitWords = unit.wordIds
                .map(id => wordsById.get(id))
                .filter((w): w is VocabularyItem => !!w && !wordsInBookSet.has(w.word.toLowerCase()));
            setStaged(unitWords);
        }
    };

    const handleRemove = (id: string) => setStaged(prev => prev.filter(w => w.id !== id));
    const handleConfirm = () => onSave(staged);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[85vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-black text-neutral-900">Add from Reading Unit</h3>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden flex-1">
                    <div className="flex flex-col gap-4 overflow-hidden">
                        <h4 className="text-sm font-bold text-neutral-500 px-1">1. Select a Unit</h4>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                            {units.map(unit => (
                                <button 
                                    key={unit.id} 
                                    onClick={() => handleSelectUnit(unit.id)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${selectedUnitId === unit.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-neutral-100 hover:bg-neutral-50'}`}
                                >
                                    <p className={`font-bold text-sm ${selectedUnitId === unit.id ? 'text-indigo-900' : 'text-neutral-700'}`}>{unit.name}</p>
                                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">{unit.wordIds.length} words</p>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-4 bg-neutral-50/50 p-4 rounded-2xl border border-neutral-200 overflow-hidden">
                        <h4 className="text-sm font-bold text-neutral-500 px-1">2. Candidate List ({staged.length})</h4>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            {staged.map(word => (
                                <div key={word.id} className="flex items-center justify-between p-2 pl-3 rounded-lg bg-white border border-neutral-200 shadow-sm animate-in fade-in">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm truncate">{word.word}</p>
                                        <p className="text-[10px] text-neutral-500 truncate">{word.meaningVi}</p>
                                    </div>
                                    <button onClick={() => handleRemove(word.id)} className="p-1.5 text-neutral-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><X size={14}/></button>
                                </div>
                            ))}
                            {selectedUnitId && staged.length === 0 && (
                                <div className="text-center py-10 text-neutral-400 italic text-xs font-medium">All words from this unit are already in the book.</div>
                            )}
                            {!selectedUnitId && (
                                <div className="text-center py-10 text-neutral-300 italic text-xs font-medium">Select a unit to see candidates.</div>
                            )}
                        </div>
                    </div>
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end items-center gap-3 bg-neutral-50/50 rounded-b-[2.5rem] shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs hover:bg-neutral-200">Cancel</button>
                    <button onClick={handleConfirm} disabled={staged.length === 0} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest disabled:opacity-50">
                        <Plus size={14}/> Add Selected ({staged.length})
                    </button>
                </footer>
            </div>
        </div>
    );
};

export const MoveWordToBookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (targetBookId: string) => void;
    books: WordBook[];
    currentBookId: string;
    wordText: string;
}> = ({ isOpen, onClose, onConfirm, books, currentBookId, wordText }) => {
    const [query, setQuery] = useState('');
    
    const shelves = useMemo(() => {
        const otherBooks = books.filter(b => b.id !== currentBookId);
        const map = new Map<string, WordBook[]>();
        otherBooks.forEach(b => {
            const shelfName = b.topic.split(':')[0].trim() || 'General';
            if (!map.has(shelfName)) map.set(shelfName, []);
            map.get(shelfName)!.push(b);
        });
        return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    }, [books, currentBookId]);

    const filteredShelves = useMemo(() => {
        if (!query.trim()) return shelves;
        const q = query.toLowerCase();
        return shelves.map(([name, bks]) => {
            const filteredBks = bks.filter(b => b.topic.toLowerCase().includes(q));
            return [name, filteredBks] as [string, WordBook[]];
        }).filter(([_, bks]) => bks.length > 0);
    }, [shelves, query]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[80vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Move Word</h3>
                        <p className="text-xs text-neutral-500 font-bold mt-1 truncate">Moving "{wordText}" to another book...</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <div className="p-4 border-b border-neutral-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" size={14} />
                        <input 
                            value={query} 
                            onChange={e => setQuery(e.target.value)} 
                            placeholder="Search destination book..." 
                            className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none"
                            autoFocus
                        />
                    </div>
                </div>
                <main className="p-4 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                    {filteredShelves.map(([shelfName, bks]) => (
                        <div key={shelfName} className="space-y-2">
                            <h4 className="px-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">{shelfName}</h4>
                            <div className="space-y-1">
                                {bks.map(b => {
                                    const displayTopic = b.topic.split(':').slice(1).join(':').trim() || b.topic;
                                    return (
                                        <button 
                                            key={b.id} 
                                            onClick={() => onConfirm(b.id)}
                                            className="w-full text-left px-4 py-3 rounded-xl border border-neutral-100 hover:border-neutral-300 hover:bg-neutral-50 transition-all font-bold text-sm text-neutral-700 flex items-center gap-3 group"
                                        >
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-neutral-100 group-hover:bg-white border border-transparent group-hover:border-neutral-200 shrink-0">
                                                <BookIcon icon={b.icon} className="text-base" />
                                            </div>
                                            <span className="flex-1 truncate">{displayTopic}</span>
                                            <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-900" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {filteredShelves.length === 0 && (
                        <div className="text-center py-10 text-neutral-400 italic text-xs font-medium">No other books found.</div>
                    )}
                </main>
                <footer className="px-8 py-4 border-t border-neutral-100 bg-neutral-50/50 rounded-b-[2.5rem] flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900">Cancel</button>
                </footer>
            </div>
        </div>
    );
};

export const AddFromLibraryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (words: VocabularyItem[]) => void;
    libraryWords: VocabularyItem[];
    wordsInBook: WordBookItem[];
}> = ({ isOpen, onClose, onSave, libraryWords, wordsInBook }) => {
    const [query, setQuery] = useState('');
    const [staged, setStaged] = useState<VocabularyItem[]>([]);
    useEffect(() => { if (isOpen) { setQuery(''); setStaged([]); } }, [isOpen]);
    const wordsInBookSet = useMemo(() => new Set(wordsInBook.map(w => w.word.toLowerCase())), [wordsInBook]);
    const stagedIdsSet = useMemo(() => new Set(staged.map(w => w.id)), [staged]);
    const searchResults = useMemo(() => {
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        return libraryWords.filter(w => w.word.toLowerCase().includes(lowerQuery) && !wordsInBookSet.has(w.word.toLowerCase()) && !stagedIdsSet.has(w.id)).slice(0, 10);
    }, [query, libraryWords, wordsInBookSet, stagedIdsSet]);
    const handleStage = (word: VocabularyItem) => setStaged(prev => [...prev, word]);
    const handleUnstage = (wordId: string) => setStaged(prev => prev.filter(w => w.id !== wordId));
    const handleConfirm = () => onSave(staged);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[80vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0"><h3 className="text-xl font-black text-neutral-900">Add from Library</h3><button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button></header>
                <main className="p-6 grid grid-cols-2 gap-6 overflow-y-auto flex-1"><div className="flex flex-col gap-4"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your library..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium" autoFocus /><div className="flex-1 overflow-y-auto pr-2 space-y-2">{searchResults.map(word => (<div key={word.id} className="flex items-center justify-between p-3 rounded-lg bg-white hover:bg-neutral-50 border border-neutral-100"><div className="flex-1 overflow-hidden"><p className="font-bold text-sm truncate">{word.word}</p><p className="text-xs text-neutral-500 truncate">{word.meaningVi}</p></div><button onClick={() => handleStage(word)} className="p-2 text-neutral-400 hover:text-green-600 hover:bg-green-50 rounded-full"><Plus size={16}/></button></div>))}</div></div><div className="flex flex-col gap-4 bg-neutral-50/50 p-4 rounded-2xl border border-neutral-200"><h4 className="text-sm font-bold text-neutral-500 px-1">Selected Words ({staged.length})</h4><div className="flex-1 overflow-y-auto pr-2 space-y-2">{staged.map(word => (<div key={word.id} className="flex items-center justify-between p-2 pl-3 rounded-lg bg-white border border-neutral-200 shadow-sm"><p className="font-bold text-sm truncate">{word.word}</p><button onClick={() => handleUnstage(word.id)} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-full"><X size={14}/></button></div>))}</div></div></main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end items-center gap-3 bg-neutral-50/50 rounded-b-[2.5rem] shrink-0"><button onClick={onClose} className="px-5 py-2.5 bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs hover:bg-neutral-200">Cancel</button><button onClick={handleConfirm} disabled={staged.length === 0} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest disabled:opacity-50"><Plus size={14}/> Add ({staged.length})</button></footer>
            </div>
        </div>
    );
};
