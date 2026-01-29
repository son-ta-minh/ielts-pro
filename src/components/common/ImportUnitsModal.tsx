
import React, { useState, useEffect } from 'react';
import { Unit } from '../../app/types';
import { X, CheckSquare, Square, FileJson } from 'lucide-react';

export interface ImportSelection {
    unit: Unit;
    selected: boolean;
    importWords: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selection: ImportSelection[]) => void;
    initialSelection: ImportSelection[];
}

const ImportUnitsModal: React.FC<Props> = ({ isOpen, onClose, onConfirm, initialSelection }) => {
    const [selection, setSelection] = useState<ImportSelection[]>(initialSelection);
    const [clearAllWords, setClearAllWords] = useState(false);
    
    useEffect(() => {
        setSelection(initialSelection);
        setClearAllWords(false);
    }, [initialSelection]);

    if (!isOpen) return null;

    const handleToggleAll = () => {
        const allSelected = selection.every(item => item.selected);
        setSelection(selection.map(item => ({ ...item, selected: !allSelected })));
    };

    const handleToggleClearAll = () => {
        const nextClearState = !clearAllWords;
        setClearAllWords(nextClearState);
        setSelection(prevSelection => 
            prevSelection.map(item => ({ ...item, importWords: !nextClearState }))
        );
    };

    const handleToggleSelect = (unitId: string) => {
        setSelection(selection.map(item => item.unit.id === unitId ? { ...item, selected: !item.selected } : item));
    };

    const handleToggleImportWords = (unitId: string) => {
        let oneToggledOn = false;
        const newSelection = selection.map(item => {
            if (item.unit.id === unitId) {
                const updated = { ...item, importWords: !item.importWords };
                if (updated.importWords) oneToggledOn = true;
                return updated;
            }
            return item;
        });
        setSelection(newSelection);
        if (oneToggledOn) setClearAllWords(false);
        else if (newSelection.every(item => !item.importWords)) setClearAllWords(true);
    };
    
    const selectedCount = selection.filter(item => item.selected).length;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><FileJson size={20}/> Import Units</h3>
                        <p className="text-sm text-neutral-500 mt-1">Select which units to import from the file.</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-6 overflow-y-auto space-y-4">
                    <div className="flex items-center justify-between px-2 flex-wrap gap-2">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Found {selection.length} units</label>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer" onClick={handleToggleClearAll}>
                                {clearAllWords ? <CheckSquare size={16} className="text-indigo-500" /> : <Square size={16} className="text-neutral-300" />}
                                <span className="text-xs font-bold text-neutral-600">Clear all linked words</span>
                            </label>
                            <div className="w-px h-4 bg-neutral-200" />
                            <button onClick={handleToggleAll} className="text-xs font-bold text-neutral-500 hover:text-neutral-900">
                                {selection.every(i => i.selected) ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                        {selection.map(item => {
                            const isSelected = item.selected;
                            return (
                                <div key={item.unit.id} className={`p-3 rounded-xl transition-colors ${isSelected ? 'bg-indigo-50/70' : 'bg-neutral-50/50'}`}>
                                    <div className="flex items-start gap-3">
                                        <button onClick={() => handleToggleSelect(item.unit.id)} className="mt-1">
                                            {isSelected ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} className="text-neutral-300" />}
                                        </button>
                                        <div className="flex-1">
                                            <p className={`font-bold text-sm ${isSelected ? 'text-indigo-900' : 'text-neutral-700'}`}>{item.unit.name}</p>
                                            <p className="text-xs text-neutral-500 line-clamp-1">{item.unit.description || 'No description'}</p>
                                        </div>
                                    </div>
                                     {isSelected && (
                                        <div className="pl-8 pt-2 mt-2 border-t border-indigo-100 animate-in fade-in duration-300">
                                            <label className="flex items-center gap-2 cursor-pointer" onClick={() => handleToggleImportWords(item.unit.id)}>
                                                {item.importWords ? <CheckSquare size={16} className="text-indigo-500" /> : <Square size={16} className="text-neutral-300" />}
                                                <span className="text-xs font-bold text-neutral-600">Import linked vocabulary</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    <div className="flex gap-3">
                         <button onClick={onClose} className="px-6 py-3 bg-neutral-100 text-neutral-500 rounded-xl font-bold text-xs hover:bg-neutral-200 transition-all">Cancel</button>
                         <button onClick={() => onConfirm(selection)} disabled={selectedCount === 0} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest disabled:opacity-50">
                            Import Selected ({selectedCount})
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default ImportUnitsModal;
