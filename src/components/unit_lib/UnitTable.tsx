
import React from 'react';
import { Unit } from '../../app/types';
import { Layers3, Eye, Edit3, Trash2, CheckCircle2, Sparkles } from 'lucide-react';

interface Props {
  pagedUnits: Unit[];
  unitStats: Map<string, { isCompleted: boolean }>;
  unitVisibility: { showDesc: boolean; showWords: boolean; showStatus: boolean };
  handleUnitClick: (unit: Unit) => void;
  startEditing: (unit: Unit) => void;
  setUnitToDelete: (unit: Unit) => void;
  handleCreateEmptyUnit: () => void;
}

const UnitTable: React.FC<Props> = ({ pagedUnits, unitStats, unitVisibility, handleUnitClick, startEditing, setUnitToDelete, handleCreateEmptyUnit }) => {
  return (
    <div className="bg-white rounded-t-[2rem] border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr className="bg-neutral-50/50 border-b border-neutral-100">
              <th className="px-4 py-3 w-1/4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Unit Name</th>
              {unitVisibility.showDesc && <th className="px-4 py-3 w-1/3 text-[10px] font-black text-neutral-400 uppercase tracking-widest hidden md:table-cell">Description</th>}
              {unitVisibility.showWords && <th className="px-4 py-3 w-24 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vocab</th>}
              {unitVisibility.showStatus && <th className="px-4 py-3 w-32 text-center text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>}
              <th className="px-4 py-3 w-24 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {pagedUnits.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-20 text-center">
                  <div className="flex flex-col items-center justify-center text-neutral-400 space-y-4">
                    <Layers3 size={48} strokeWidth={1.5} className="opacity-10"/>
                    <p className="font-bold text-neutral-900 uppercase tracking-widest text-[10px]">Unit Lab Empty</p>
                    <button onClick={handleCreateEmptyUnit} className="text-indigo-600 font-bold text-sm hover:underline">Create your first unit</button>
                  </div>
                </td>
              </tr>
            ) : (
              pagedUnits.map(unit => {
                const { isCompleted } = unitStats.get(unit.id) || { isCompleted: false };
                return (
                  <tr key={unit.id} className="hover:bg-neutral-50/80 cursor-pointer transition-colors group" onClick={() => handleUnitClick(unit)}>
                    <td className="px-4 py-3 align-middle">
                      <div className="font-bold text-neutral-900 text-sm truncate" title={unit.name}>{unit.name}</div>
                      {unitVisibility.showDesc && <div className="text-[10px] text-neutral-400 truncate md:hidden">{unit.description}</div>}
                    </td>
                    {unitVisibility.showDesc && (
                      <td className="px-4 py-3 align-middle hidden md:table-cell">
                        <div className="text-xs text-neutral-500 truncate max-w-md" title={unit.description}>{unit.description || '-'}</div>
                      </td>
                    )}
                    {unitVisibility.showWords && <td className="px-4 py-3 align-middle"><div className="text-xs font-bold text-neutral-700">{unit.wordIds.length} items</div></td>}
                    {unitVisibility.showStatus && (
                      <td className="px-4 py-3 align-middle text-center">
                        <div className="flex flex-col items-center gap-1">
                          {unit.isLearned && <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-green-50 text-green-700 border border-green-100"><CheckCircle2 size={10} /><span>Learned</span></div>}
                          {isCompleted && <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100"><Sparkles size={10} /><span>Mastered</span></div>}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 align-middle text-right">
                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); handleUnitClick(unit); }} className="p-2.5 text-neutral-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all" title="View/Study Unit"><Eye size={18}/></button>
                            <button onClick={(e) => { e.stopPropagation(); startEditing(unit); }} className="p-2.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-all" title="Edit Unit"><Edit3 size={18} /></button>
                            <button onClick={(e) => { e.stopPropagation(); setUnitToDelete(unit); }} className="p-2.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title="Delete Unit"><Trash2 size={18} /></button>
                        </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UnitTable;
