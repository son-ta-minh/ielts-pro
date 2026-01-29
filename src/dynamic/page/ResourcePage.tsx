import React, { useState, ReactNode, useEffect } from 'react';
import { ResourceHeader } from './ResourceHeader';
import { FilterBar } from './FilterBar';
import { ViewOptions } from './ViewOptions';
import { ResourceGrid } from './ResourceGrid';
import { ResourceConfig } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ResourcePageProps {
  // Header
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  minorSkills?: ReactNode;
  actions?: ReactNode;

  // Logic
  config: ResourceConfig;
  
  // Data State Handlers (Provided by parent)
  query?: string;
  onQueryChange?: (q: string) => void;
  activeFilters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;

  // Grid
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage?: string;
  
  // Slots
  aboveGrid?: ReactNode;
  
  // Pagination
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    pageSize?: number;
    onPageSizeChange?: (size: number) => void;
    totalItems?: number;
  };
  
  // Render Prop
  children: (viewSettings: Record<string, any>) => ReactNode;
}

export const ResourcePage: React.FC<ResourcePageProps> = (props) => {
  const { 
    title, subtitle, icon, minorSkills, actions,
    config,
    query, onQueryChange, activeFilters, onFilterChange,
    isLoading, isEmpty, emptyMessage,
    aboveGrid,
    pagination,
    children
  } = props;

  // Manage View Settings locally since they are UI-only
  const [viewSettings, setViewSettings] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    config.viewSchema?.forEach(opt => defaults[opt.key] = opt.default);
    return defaults;
  });

  const handleChangeView = (key: string, value: any) => {
    setViewSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      {/* 1. Header */}
      <ResourceHeader 
        title={title} 
        subtitle={subtitle} 
        icon={icon} 
        minorSkills={minorSkills} 
        actions={actions} 
      />

      {/* 2. Controls Area */}
      <FilterBar 
        query={query} 
        onQueryChange={onQueryChange}
        schema={config.filterSchema}
        activeFilters={activeFilters}
        onFilterChange={onFilterChange}
        extraControls={
          config.viewSchema && config.viewSchema.length > 0 ? (
            <ViewOptions 
              schema={config.viewSchema} 
              currentSettings={viewSettings} 
              onChange={handleChangeView} 
            />
          ) : null
        }
      />

      {/* 3. Pre-Grid Content (e.g. Tag Browser) */}
      {aboveGrid && (
          <div className="animate-in fade-in slide-in-from-top-2">
              {aboveGrid}
          </div>
      )}

      {/* 4. Content Grid */}
      <ResourceGrid isLoading={isLoading} isEmpty={isEmpty} emptyMessage={emptyMessage}>
        {children(viewSettings)}
      </ResourceGrid>

      {/* 5. Pagination */}
      {!isLoading && !isEmpty && pagination && (
        <div className="flex flex-col sm:flex-row justify-between items-center pt-8 border-t border-neutral-100 gap-4">
           {/* Page Size Selector */}
           <div className="flex items-center gap-2 order-2 sm:order-1">
              {pagination.pageSize && pagination.onPageSizeChange && (
                  <>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Size:</span>
                    <select 
                        value={pagination.pageSize} 
                        onChange={(e) => pagination.onPageSizeChange?.(Number(e.target.value))}
                        className="bg-neutral-50 text-xs font-bold rounded-lg px-2 py-1.5 border-transparent focus:border-neutral-300 focus:ring-0 text-neutral-600 cursor-pointer hover:bg-neutral-100 transition-colors"
                    >
                        {[12, 24, 48, 96].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>
              )}
           </div>

           {/* Pager */}
           <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-2 py-1.5 shadow-sm order-1 sm:order-2">
                <button 
                    disabled={pagination.page === 0} 
                    onClick={() => pagination.onPageChange(pagination.page - 1)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                    <ChevronLeft size={18} />
                </button>
                <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest px-2 min-w-[80px] text-center">
                    Page {pagination.page + 1} of {pagination.totalPages || 1}
                </span>
                <button 
                    disabled={pagination.page >= pagination.totalPages - 1} 
                    onClick={() => pagination.onPageChange(pagination.page + 1)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                    <ChevronRight size={18} />
                </button>
           </div>
           
           {/* Total Items Count */}
           <div className="flex items-center justify-end min-w-[100px] order-3">
               {pagination.totalItems !== undefined && (
                    <span className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">
                        Total: {pagination.totalItems}
                    </span>
               )}
           </div>
        </div>
      )}
    </div>
  );
};