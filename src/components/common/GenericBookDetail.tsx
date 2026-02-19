
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Palette, Type, Image as ImageIcon, Trash2, Edit3, X, CheckSquare, Square, Search, Pen, BookOpen } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { COLORS, TITLE_COLORS, BookIcon } from '../wordbook/WordBookCard';
import { UniversalCard } from './UniversalCard';
import { UniversalBook } from './UniversalBook';

// --- Interfaces ---

export interface GenericBookItem {
    id: string;
    title: string;
    subtitle?: string;
    data: any; // The original object (Unit, Lesson, etc.)
    
    // Status props for the card
    isCompleted?: boolean;
    focusColor?: 'green' | 'yellow' | 'red' | null;
    isFocused?: boolean;
}

export interface GenericBookData {
    id: string;
    title: string;
    icon?: string;
    color?: string;
    // Style props
    titleColor?: string;
    titleSize?: number;
    titleTop?: number;
    titleLeft?: number;
    iconTop?: number;
    iconLeft?: number;
    
    [key: string]: any; // Allow other props
}

interface Props {
    book: GenericBookData;
    items: GenericBookItem[]; // Items currently IN the book
    availableItems: GenericBookItem[]; // Items available to add
    
    onBack: () => void;
    onUpdateBook: (updates: Partial<GenericBookData>) => void;
    
    onAddItem: (ids: string[]) => void;
    onRemoveItem: (id: string) => void;
    
    onOpenItem: (item: GenericBookItem) => void;
    onEditItem: (item: GenericBookItem) => void;
    onFocusChange: (item: GenericBookItem, color: any) => void;
    onToggleFocus: (item: GenericBookItem) => void;
    
    itemIcon?: React.ReactNode; // Optional icon for the add modal list
}

// --- Add Items Modal ---
const AddItemsModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    items: GenericBookItem[]; 
    currentIds: Set<string>; 
    onAdd: (ids: string[]) => void; 
    itemIcon?: React.ReactNode;
}> = ({ isOpen, onClose, items, currentIds, onAdd, itemIcon }) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        return items.filter(item => !currentIds.has(item.id) && item.title.toLowerCase().includes(q));
    }, [items, query, currentIds]);

    const handleToggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[80vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center">
                    <h3 className="text-xl font-black text-neutral-900">Add Content</h3>
                    <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <div className="p-4 border-b border-neutral-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" size={14}/>
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search library..." className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
                    </div>
                </div>
                <main className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {filtered.map(item => (
                        <div key={item.id} onClick={() => handleToggle(item.id)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${selected.has(item.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-neutral-100 hover:border-neutral-300'}`}>
                            <div className="flex items-center gap-3">
                                {itemIcon && <div className="text-neutral-400">{itemIcon}</div>}
                                <div>
                                    <div className="font-bold text-sm text-neutral-900">{item.title}</div>
                                    {item.subtitle && <div className="text-xs text-neutral-500">{item.subtitle}</div>}
                                </div>
                            </div>
                            {selected.has(item.id) ? <CheckSquare size={20} className="text-indigo-600"/> : <Square size={20} className="text-neutral-300"/>}
                        </div>
                    ))}
                    {filtered.length === 0 && <p className="text-center text-xs text-neutral-400 py-10">No matching items found.</p>}
                </main>
                <footer className="px-8 py-4 border-t border-neutral-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900">Cancel</button>
                    <button onClick={() => { onAdd(Array.from(selected)); onClose(); }} disabled={selected.size === 0} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 disabled:opacity-50">
                        <Plus size={14}/> Add ({selected.size})
                    </button>
                </footer>
            </div>
        </div>
    );
};

// --- Generic Book Detail ---

export const GenericBookDetail: React.FC<Props> = ({ 
    book, items, availableItems, onBack, onUpdateBook, 
    onAddItem, onRemoveItem, onOpenItem, onEditItem, onFocusChange, onToggleFocus,
    itemIcon 
}) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editableTitle, setEditableTitle] = useState('');
    const [isEditingIcon, setIsEditingIcon] = useState(false);
    const [editableIcon, setEditableIcon] = useState('');
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [customColorUrl, setCustomColorUrl] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();

    // Derived display title
    const displayTitle = useMemo(() => {
        const parts = book.title.split(':');
        return parts.length > 1 ? parts.slice(1).join(':').trim() : book.title;
    }, [book.title]);

    useEffect(() => {
        setEditableTitle(displayTitle);
        setEditableIcon(book.icon || '');
        setCustomColorUrl((book.color?.startsWith('http') || book.color?.startsWith('data:')) ? book.color : '');
    }, [book, displayTitle]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) setIsColorPickerOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSaveTitle = () => {
        const shelf = book.title.split(':')[0].trim();
        const newFullTitle = `${shelf}: ${editableTitle.trim()}`;
        if (newFullTitle !== book.title) onUpdateBook({ title: newFullTitle });
        setIsEditingTitle(false);
    };

    const handleSaveIcon = () => {
        if (editableIcon !== book.icon) onUpdateBook({ icon: editableIcon.trim() });
        setIsEditingIcon(false);
    };

    const handleAddSelected = (ids: string[]) => {
        onAddItem(ids);
        showToast(`Added ${ids.length} items.`, "success");
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 gap-4 shrink-0 bg-white border-b border-neutral-100 z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors"> <ArrowLeft size={16}/> Back </button>
                    
                    <div className="flex items-center gap-4">
                        {isEditingIcon ? (
                            <input value={editableIcon} onChange={(e) => setEditableIcon(e.target.value)} onBlur={handleSaveIcon} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} autoFocus placeholder="Emoji" className="text-2xl w-24 text-center bg-neutral-100 border border-neutral-300 rounded-lg py-1 outline-none ring-2 ring-indigo-300" />
                        ) : (
                            <div onClick={() => setIsEditingIcon(true)} className="p-1 rounded-lg hover:bg-neutral-100 cursor-pointer min-w-10 flex items-center justify-center">
                                {book.icon ? (
                                    <BookIcon icon={book.icon} className="text-2xl w-10 h-10 flex items-center justify-center mx-auto" />
                                ) : (
                                    <div className="w-10 h-10 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center text-neutral-300"><ImageIcon size={18} /></div>
                                )}
                            </div>
                        )}
                        
                        {isEditingTitle ? (
                            <input value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} onBlur={handleSaveTitle} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} autoFocus className="text-xl font-black text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-lg px-2 py-1 outline-none ring-2 ring-indigo-300" />
                        ) : (
                            <div onClick={() => setIsEditingTitle(true)} className="group/title relative p-1 rounded-lg hover:bg-neutral-100 cursor-pointer flex items-center gap-2">
                                <h2 className="text-xl font-black text-neutral-900 tracking-tight" style={{ color: book.titleColor || '#171717', fontSize: book.titleSize ? `${book.titleSize}px` : 'inherit' }}>{editableTitle}</h2>
                                <Pen size={14} className="text-neutral-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="relative" ref={colorPickerRef}>
                        <button onClick={() => setIsColorPickerOpen(!isColorPickerOpen)} className={`p-2.5 rounded-xl transition-all border shadow-sm flex items-center justify-center gap-2 ${isColorPickerOpen ? 'bg-neutral-900 text-white border-neutral-900 shadow-md' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'}`} title="Change Cover Design">
                            <Palette size={18} />
                            {isColorPickerOpen && <span className="text-[10px] font-black uppercase tracking-widest mr-1">Design</span>}
                        </button>
                        {isColorPickerOpen && (
                            <div className="absolute top-full right-0 mt-3 p-5 bg-white rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-neutral-100 z-[100] animate-in fade-in zoom-in-95 origin-top-right w-80 space-y-5">
                                {/* Preview */}
                                <div className="flex justify-center border-b border-neutral-100 pb-4">
                                    <div className="w-32 h-44 shadow-lg rounded-lg overflow-hidden transform rotate-2">
                                        <UniversalBook 
                                            id={book.id}
                                            title={editableTitle}
                                            icon={<BookIcon icon={editableIcon || book.icon || ''} className="text-3xl" />}
                                            color={book.color}
                                            titleColor={book.titleColor}
                                            titleSize={book.titleSize}
                                            titleTop={book.titleTop}
                                            titleLeft={book.titleLeft}
                                            iconTop={book.iconTop}
                                            iconLeft={book.iconLeft}
                                            onClick={() => {}}
                                        />
                                    </div>
                                </div>
                                {/* Controls */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1 border-b border-neutral-50 pb-2"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cover Color</span></div>
                                    <div className="grid grid-cols-5 gap-3 justify-items-center">
                                        {COLORS.map(c => (<button key={c} onClick={() => onUpdateBook({ color: c })} className={`w-8 h-8 rounded-full transition-all hover:scale-125 active:scale-90 ${book.color === c ? 'ring-2 ring-neutral-900 ring-offset-2 scale-110 shadow-md' : 'opacity-90 hover:opacity-100 shadow-sm border border-black/5'}`} style={{ backgroundColor: c }} />))}
                                    </div>
                                </div>
                                <div className="space-y-3 pt-2 border-t border-neutral-50">
                                    <div className="flex items-center gap-2 px-1"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Title Style</span></div>
                                    <div className="space-y-3 px-1">
                                        <div className="grid grid-cols-5 gap-3 justify-items-center">
                                            {TITLE_COLORS.map(c => (<button key={c} onClick={() => onUpdateBook({ titleColor: c })} className={`w-6 h-6 rounded-md border transition-all ${book.titleColor === c ? 'ring-2 ring-indigo-500' : 'border-neutral-200'}`} style={{ backgroundColor: c }} />))}
                                        </div>
                                        <div className="flex items-center gap-3 bg-neutral-50 p-2 rounded-xl">
                                            <Type size={14} className="text-neutral-400" />
                                            <input type="range" min="12" max="48" value={book.titleSize || 24} onChange={(e) => onUpdateBook({ titleSize: parseInt(e.target.value) })} className="flex-1 accent-neutral-900 h-1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 pt-2 border-t border-neutral-50">
                                    <div className="flex items-center justify-between px-1"><span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Layout</span><button onClick={() => onUpdateBook({ titleTop: undefined, titleLeft: undefined, iconTop: undefined, iconLeft: undefined })} className="text-[8px] font-black text-indigo-600 hover:underline uppercase">Center All</button></div>
                                    <div className="grid grid-cols-2 gap-4 px-1">
                                        <div className="space-y-1.5"><label className="text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1">Title Pos</label><div className="flex gap-1"><input type="number" value={book.titleTop ?? 50} onChange={e => onUpdateBook({ titleTop: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /><input type="number" value={book.titleLeft ?? 50} onChange={e => onUpdateBook({ titleLeft: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /></div></div>
                                        <div className="space-y-1.5"><label className="text-[8px] font-bold text-neutral-400 uppercase flex items-center gap-1">Icon Pos</label><div className="flex gap-1"><input type="number" value={book.iconTop ?? 40} onChange={e => onUpdateBook({ iconTop: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /><input type="number" value={book.iconLeft ?? 50} onChange={e => onUpdateBook({ iconLeft: parseInt(e.target.value) })} className="w-full px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-md text-[10px] font-bold" /></div></div>
                                    </div>
                                </div>
                                <div className="space-y-2 pt-2 border-t border-neutral-50">
                                    <label className="text-[9px] font-black text-neutral-400 uppercase tracking-widest px-1">Image URL</label>
                                    <div className="flex gap-2">
                                        <input value={customColorUrl} onChange={(e) => setCustomColorUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { onUpdateBook({ color: customColorUrl.trim() }); setIsColorPickerOpen(false); } }} placeholder="https://..." className="flex-1 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[10px] font-medium focus:ring-1 focus:ring-neutral-900 outline-none" />
                                        <button onClick={() => onUpdateBook({ color: customColorUrl.trim() })} className="p-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800" ><Plus size={14}/></button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-neutral-50 transition-all shadow-sm">
                        <Plus size={14}/> Add Content
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-neutral-50/50 relative">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
                    {items.map((item, i) => (
                        <UniversalCard
                            key={`${item.id}-${i}`}
                            title={item.title}
                            compact={false}
                            onClick={() => onOpenItem(item)}
                            isCompleted={item.isCompleted}
                            focusColor={item.focusColor}
                            onFocusChange={(c) => onFocusChange(item, c)}
                            isFocused={item.isFocused}
                            onToggleFocus={() => onToggleFocus(item)}
                            actions={
                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); onOpenItem(item); }} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Read"><BookOpen size={14}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); onEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button>
                                    <button onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove from Book"><Trash2 size={14}/></button>
                                </div>
                            }
                        >
                            {item.subtitle && <p className="line-clamp-2 text-xs">{item.subtitle}</p>}
                        </UniversalCard>
                    ))}
                    {items.length === 0 && (
                        <div className="col-span-full py-20 text-center text-neutral-400 border-2 border-dashed border-neutral-200 rounded-3xl">
                            <p className="font-bold">This book is empty.</p>
                            <p className="text-sm mt-1">Click &quot;Add Content&quot; to fill it up.</p>
                        </div>
                    )}
                </div>
            </main>

            <AddItemsModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                items={availableItems} 
                currentIds={new Set(items.map(i => i.id))} 
                onAdd={handleAddSelected}
                itemIcon={itemIcon}
            />
        </div>
    );
};
