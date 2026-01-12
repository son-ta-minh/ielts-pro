
import React, { useRef, useState, useEffect } from 'react';
import { Unit } from '../../app/types';
import { Layers3, Search, Plus, Trash2, Eye, Filter, ChevronRight, CheckCircle2, ChevronLeft } from 'lucide-react';
import ConfirmationModal from '../common/ConfirmationModal';
import UnitTable from './UnitTable';

const VisibilityToggle = ({ label, checked, onChange }: { label: React.ReactNode, checked: boolean, onChange: () => void }) => (
    <button onClick={onChange} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700">
        <span className="flex items-center gap-2">{label}</span>
        {checked ? <CheckCircle2 size={14} className="text-green-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-neutral-200"></div>}
    </button>
);

export interface UnitLibraryUIProps {
    loading: boolean;
    query: string;
    setQuery: (q: string) => void;
    unitFilter: 'all' | 'learned' | 'new';
    setUnitFilter: (f: 'all' | 'learned' | 'new') => void;
    unitVisibility: { showDesc: boolean; showWords: boolean; showStatus: boolean };
    setUnitVisibility: (v: any) => void;
    pagedUnits: Unit[];
    unitStats: Map<string, { isCompleted: boolean }>;
    page: number;
    setPage: (p: number | ((p: number) => number)) => void;
    totalListPages: number;
    unitToDelete: Unit | null;
    setUnitToDelete: (u: Unit | null) => void;
    handleCreateEmptyUnit: () => void;
    handleDeleteUnit: () => void;
    handleUnitClick: (u: Unit) => void;
    startEditing: (u: Unit) => void;
}

export const UnitLibraryUI: React.FC<UnitLibraryUIProps> = ({
    query, setQuery, unitFilter, setUnitFilter, unitVisibility, setUnitVisibility,
    pagedUnits, unitStats, page, setPage, totalListPages, unitToDelete, setUnitToDelete,
    handleCreateEmptyUnit, handleDeleteUnit, handleUnitClick, startEditing
}) => {
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
            setIsViewMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Essay Library</h2><p className="text-neutral-500 mt-1 font-medium">Curated collections for intensive prep.</p></div>
        <button onClick={handleCreateEmptyUnit} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm"><Plus size={16} /><span>New Unit</span></button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative w-full md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter your units..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 transition-all shadow-sm" />
        </div>
        
        <div className="flex gap-2">
            <div className="relative" ref={viewMenuRef}>
                <button onClick={() => setIsViewMenuOpen(!isViewMenuOpen)} className={`px-4 py-2.5 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs h-full ${isViewMenuOpen ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'}`} title="View Options">
                    <Eye size={16} /> <span className="hidden sm:inline">View</span>
                </button>
                {isViewMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                        <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50">Columns</div>
                        <VisibilityToggle label="Description" checked={unitVisibility.showDesc} onChange={() => setUnitVisibility((v: any) => ({...v, showDesc: !v.showDesc}))} />
                        <VisibilityToggle label="Word Count" checked={unitVisibility.showWords} onChange={() => setUnitVisibility((v: any) => ({...v, showWords: !v.showWords}))} />
                        <VisibilityToggle label="Status" checked={unitVisibility.showStatus} onChange={() => setUnitVisibility((v: any) => ({...v, showStatus: !v.showStatus}))} />
                    </div>
                )}
            </div>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400"><Filter size={14} /></div>
                <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value as 'all' | 'learned' | 'new')} className="pl-9 pr-8 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900 shadow-sm appearance-none cursor-pointer h-full">
                    <option value="all">All Units</option>
                    <option value="learned">Learned</option>
                    <option value="new">New / Active</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-neutral-400"><ChevronRight size={14} className="rotate-90"/></div>
            </div>
        </div>
      </div>
      
      <UnitTable 
        pagedUnits={pagedUnits}
        unitStats={unitStats}
        unitVisibility={unitVisibility}
        handleUnitClick={handleUnitClick}
        startEditing={startEditing}
        setUnitToDelete={setUnitToDelete}
        handleCreateEmptyUnit={handleCreateEmptyUnit}
      />

      <div className="p-6 bg-neutral-50/30 flex items-center justify-between border-t border-neutral-100 rounded-b-[2rem]">
        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Page {page + 1} of {totalListPages || 1}</span>
        <div className="flex space-x-2"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronLeft size={14} /></button><button disabled={(page + 1) >= totalListPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:border-neutral-900 transition-all flex items-center shadow-sm"><ChevronRight size={14} /></button></div>
      </div>

      {unitToDelete && <ConfirmationModal isOpen={!!unitToDelete} title="Delete Unit?" message={<>Are you sure you want to delete <strong className="capitalize">"{unitToDelete.name}"</strong>? Your library vocabulary will not be affected.</>} confirmText="Confirm Delete" isProcessing={false} onConfirm={handleDeleteUnit} onClose={() => setUnitToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>}/>}
    </div>
  );
};
