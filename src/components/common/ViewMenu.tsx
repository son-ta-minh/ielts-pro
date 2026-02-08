import React, { useRef, useEffect } from 'react';
import { Eye, Filter, CheckCircle2, Circle } from 'lucide-react';

export interface ViewOption {
    label: string;
    checked: boolean;
    onChange: () => void;
}

export interface FilterOption {
    label: string;
    value: string;
    isActive: boolean;
    onClick: () => void;
}

interface Props {
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    viewOptions: ViewOption[];
    filterOptions?: FilterOption[];
    customSection?: React.ReactNode;
    hasActiveFilters?: boolean;
}

export const ViewMenu: React.FC<Props> = ({ isOpen, setIsOpen, viewOptions, filterOptions, customSection, hasActiveFilters }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsOpen]);

    return (
        <div className="relative" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`p-3 rounded-xl border transition-all shadow-sm relative ${isOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`} 
                title="View & Filter"
            >
                <Eye size={16} />
                {hasActiveFilters && (
                    <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full -mt-0.5 -mr-0.5 shadow-sm animate-in zoom-in duration-300"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                    {filterOptions && filterOptions.length > 0 && (
                        <>
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                                <Filter size={10}/> Content Type
                            </div>
                            <div className="p-1 grid grid-cols-3 gap-1 bg-neutral-100 rounded-xl mb-2">
                                {filterOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={opt.onClick}
                                        className={`py-1.5 text-[9px] font-black rounded-lg transition-all ${opt.isActive ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    
                    {customSection}

                    <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                         <Eye size={10}/> Visibility
                    </div>
                    {viewOptions.map((opt, idx) => (
                        <button key={idx} onClick={opt.onChange} className="flex items-center justify-between w-full px-3 py-2 text-xs font-bold rounded-lg hover:bg-neutral-50 transition-colors">
                            <span>{opt.label}</span>
                            {opt.checked ? <CheckCircle2 size={14} className="text-green-500" /> : <Circle size={14} className="text-neutral-300" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};