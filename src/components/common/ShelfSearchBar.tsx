import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronRight, BookOpen, NotebookText } from 'lucide-react';

interface Props {
    shelves: string[];
    books: any[];
    items?: any[]; // Optional array of items (like Lessons) to include in suggestions
    onNavigateShelf: (name: string) => void;
    onNavigateBook: (book: any) => void;
    onNavigateItem?: (item: any) => void;
    placeholder?: string;
    // Added value and onChange to support controlled state from parent components
    value?: string;
    onChange?: (val: string) => void;
}

export const ShelfSearchBar: React.FC<Props> = ({ 
    shelves, books, items = [], onNavigateShelf, onNavigateBook, onNavigateItem, placeholder = "Search shelf or book...",
    value, onChange 
}) => {
    // Fix: Support both controlled and uncontrolled state
    const [internalQuery, setInternalQuery] = useState('');
    const searchQuery = value !== undefined ? value : internalQuery;
    
    const handleQueryChange = (val: string) => {
        if (onChange) onChange(val);
        setInternalQuery(val);
    };

    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const suggestions = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        
        const shelfMatches = shelves
            .filter(s => s.toLowerCase().includes(q))
            .map(s => ({ type: 'shelf' as const, id: s, label: s }));
            
        const bookMatches = books
            .filter(b => {
                const bookTitle = b.title || b.topic || '';
                const parts = bookTitle.split(':');
                const title = parts.length > 1 ? parts.slice(1).join(':').trim() : bookTitle;
                return title.toLowerCase().includes(q);
            })
            .map(b => {
                const bookTitle = b.title || b.topic || '';
                const parts = bookTitle.split(':');
                const title = parts.length > 1 ? parts.slice(1).join(':').trim() : bookTitle;
                return { 
                    type: 'book' as const, 
                    id: b.id, 
                    label: title, 
                    shelf: parts[0].trim() || 'General', 
                    data: b 
                };
            });
            
        const itemMatches = items
            .filter(i => {
                const title = (i.title || '').toLowerCase();
                const desc = (i.description || '').toLowerCase();
                const keywords = (i.searchKeywords || []).map((kw: string) => (kw || '').toLowerCase());
                
                if (title.includes(q)) return true;
                if (desc.includes(q)) return true;
                if (keywords.some((kw: string) => kw.includes(q))) return true;
                
                return false;
            })
            .map(i => ({
                type: 'item' as const,
                id: i.id,
                label: i.title,
                subLabel: i.description,
                data: i
            }));
            
        return [...shelfMatches, ...bookMatches, ...itemMatches].slice(0, 15);
    }, [searchQuery, shelves, books, items]);

    const handleSelect = (s: any) => {
        if (s.type === 'shelf') {
            onNavigateShelf(s.id);
        } else if (s.type === 'book') {
            onNavigateBook(s.data);
        } else if (s.type === 'item' && onNavigateItem) {
            onNavigateItem(s.data);
        }
        handleQueryChange('');
        setShowSuggestions(false);
    };

    return (
        <div className="flex-1 max-w-md relative mx-4" ref={searchRef}>
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => { handleQueryChange(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all shadow-sm"
                />
            </div>
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-neutral-100 rounded-2xl shadow-xl z-[100] overflow-hidden animate-in fade-in zoom-in-95">
                    {suggestions.map((s, i) => (
                        <button 
                            key={i}
                            onClick={() => handleSelect(s)}
                            className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-center justify-between border-b border-neutral-50 last:border-0"
                        >
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    {s.type === 'item' && <NotebookText size={12} className="text-indigo-400 shrink-0" />}
                                    <span className="text-xs font-black text-neutral-900 truncate">{s.label}</span>
                                </div>
                                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest truncate">
                                    {s.type === 'shelf' ? 'Shelf' : s.type === 'book' ? `Book • ${s.shelf}` : (s.subLabel || 'Lesson Item')}
                                </span>
                            </div>
                            <ChevronRight size={14} className="text-neutral-300 ml-2" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};