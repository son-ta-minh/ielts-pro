import React, { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { FilterOption } from '../types';

interface FilterBarProps {
  // Search
  query?: string;
  onQueryChange?: (q: string) => void;
  searchPlaceholder?: string;

  // Filters
  schema?: FilterOption[];
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;

  // Extra Slots
  extraControls?: ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  query = "",
  onQueryChange,
  searchPlaceholder = "Search...",
  schema = [],
  activeFilters,
  onFilterChange,
  extraControls
}) => {
  // If no search handler, no filters, and no extra controls, render nothing to avoid layout gaps.
  if (!onQueryChange && schema.length === 0 && !extraControls) {
    return null;
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      {/* 1. Search Input (Optional) */}
      {onQueryChange && (
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input 
            type="text" 
            value={query} 
            onChange={(e) => onQueryChange(e.target.value)} 
            placeholder={searchPlaceholder} 
            className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm"
          />
        </div>
      )}

      {/* 2. Dynamic Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar flex-wrap">
        {schema.map((filter) => {
          const currentValue = activeFilters[filter.id] || (filter.choices ? filter.choices[0].value : '');

          if (filter.type === 'select') {
            return (
              <div key={filter.id} className="relative shrink-0">
                <select
                  value={currentValue}
                  onChange={(e) => onFilterChange(filter.id, e.target.value)}
                  className="pl-3 pr-8 py-3 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900 shadow-sm appearance-none cursor-pointer hover:bg-neutral-50 transition-colors"
                >
                  {filter.choices?.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-neutral-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            );
          }

          if (filter.type === 'pill') {
            return (
              <div key={filter.id} className="flex bg-neutral-100 p-1 rounded-xl shrink-0">
                {filter.choices?.map(c => {
                  const isActive = currentValue === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={() => onFilterChange(filter.id, c.value)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        isActive 
                        ? 'bg-white shadow-sm text-neutral-900' 
                        : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            );
          }

          return null; 
        })}
        
        {/* 3. Extra Controls Slot (e.g. View Options toggle from parent) */}
        {extraControls}
      </div>
    </div>
  );
};