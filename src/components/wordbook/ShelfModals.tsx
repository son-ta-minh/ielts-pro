
import React, { useState, useEffect } from 'react';
import { X, Save, ChevronRight } from 'lucide-react';

export const AddShelfModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (name: string) => void; }> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    useEffect(() => { if (isOpen) setName(''); }, [isOpen]);
    if (!isOpen) return null;
    const handleSave = () => { if (name.trim()) onSave(name.trim()); };
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start"><div><h3 className="text-xl font-black text-neutral-900">Add New Shelf</h3></div><button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button></header>
                <main className="p-8 space-y-2"><label htmlFor="shelf-name-input" className="font-bold text-sm">Shelf Name</label><input id="shelf-name-input" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-medium" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}/></main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end items-center gap-3 bg-neutral-50/50 rounded-b-[2.5rem]"><button onClick={onClose} className="px-5 py-2.5 bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs hover:bg-neutral-200">Cancel</button><button onClick={handleSave} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button></footer>
            </div>
        </div>
    );
};

export const RenameShelfModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (newName: string) => void; initialName: string; }> = ({ isOpen, onClose, onSave, initialName }) => {
    const [name, setName] = useState('');
    useEffect(() => { if (isOpen) setName(initialName); }, [isOpen, initialName]);
    if (!isOpen) return null;
    const handleSave = () => { if (name.trim()) onSave(name.trim()); };
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start"><div><h3 className="text-xl font-black text-neutral-900">Rename Shelf</h3></div><button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button></header>
                <main className="p-8 space-y-2"><label htmlFor="shelf-rename-input" className="font-bold text-sm">New Shelf Name</label><input id="shelf-rename-input" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-medium" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}/></main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end items-center gap-3 bg-neutral-50/50 rounded-b-[2.5rem]"><button onClick={onClose} className="px-5 py-2.5 bg-neutral-100 text-neutral-600 rounded-xl font-bold text-xs hover:bg-neutral-200">Cancel</button><button onClick={handleSave} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button></footer>
            </div>
        </div>
    );
};

export const MoveBookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (targetShelf: string) => void;
    shelves: string[];
    currentShelf: string;
    bookTitle: string;
}> = ({ isOpen, onClose, onConfirm, shelves, currentShelf, bookTitle }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Move Book</h3>
                        <p className="text-xs text-neutral-500 font-bold mt-1 truncate">"{bookTitle}"</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-6 overflow-y-auto max-h-[50vh] space-y-2">
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-2 mb-2">Select Destination Shelf</p>
                    {shelves.filter(s => s !== currentShelf).map(shelf => (
                        <button 
                            key={shelf} 
                            onClick={() => onConfirm(shelf)}
                            className="w-full text-left px-4 py-3 rounded-xl border border-neutral-100 hover:border-neutral-300 hover:bg-neutral-50 transition-all font-bold text-sm text-neutral-700 flex items-center justify-between group"
                        >
                            <span>{shelf}</span>
                            <ChevronRight size={16} className="text-neutral-300 group-hover:text-neutral-900 transition-colors" />
                        </button>
                    ))}
                    {shelves.length <= 1 && (
                        <p className="text-center py-4 text-xs font-medium text-neutral-400 italic">No other shelves available.</p>
                    )}
                </main>
                <footer className="px-8 py-4 border-t border-neutral-100 bg-neutral-50/50 rounded-b-[2.5rem] flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900">Cancel</button>
                </footer>
            </div>
        </div>
    );
};
