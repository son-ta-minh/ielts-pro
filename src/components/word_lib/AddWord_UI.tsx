
import React from 'react';
import { Sparkles, Save, Loader2, Link, CheckCircle2, Info, ListChecks, Layers3, PlusCircle } from 'lucide-react';
import { Unit } from '../../app/types';

export interface AddWordUIProps {
  isArchived: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  inputWords: string;
  setInputWords: (words: string) => void;
  infoText: string | null;
  wordsToProcessCount: number;
  unitComboboxRef: React.RefObject<HTMLDivElement>;
  unitInput: string;
  handleUnitInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowSuggestions: (show: boolean) => void;
  isCreatingNewUnit: boolean;
  showSuggestions: boolean;
  suggestedUnits: Unit[];
  handleSuggestionClick: (unit: Unit) => void;
  handleAdd: (withAI: boolean) => void;
  isLoading: boolean;
  isSaving: boolean;
  lastAddedItems: { word: string, status: 'new' | 'linked' }[];
  aiEnabled: boolean;
}

export const AddWordUI: React.FC<AddWordUIProps> = ({
  isArchived, error, setError, inputWords, setInputWords, infoText, wordsToProcessCount,
  unitComboboxRef, unitInput, handleUnitInputChange, setShowSuggestions, isCreatingNewUnit,
  showSuggestions, suggestedUnits, handleSuggestionClick, handleAdd, isLoading, isSaving,
  lastAddedItems, aiEnabled
}) => {
  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <header><h2 className="text-4xl font-black text-neutral-900 tracking-tight">{isArchived ? 'Add to Archive' : 'Add New'}</h2><p className="text-neutral-500 mt-2 font-medium">{isArchived ? 'Add passive, literary, or archaic words for reference.' : 'Enter words/phrases, separated by semicolons (;).'}</p></header>
      {error && ( <div className="p-6 bg-red-50 border-2 border-red-100 rounded-[2rem] flex items-center justify-between"><div className="flex items-center space-x-3 text-red-700 font-bold"><Info size={20} /><span className="text-sm">{error}</span></div><button type="button" onClick={() => setError(null)} className="px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Dismiss</button></div>)}

      <div className="space-y-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none text-neutral-900"><Sparkles size={80} /></div>
          <div className="space-y-6 relative z-10">
            <div>
              <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-3 px-1">Words / Phrases</label>
              <textarea rows={6} autoFocus value={inputWords} onChange={(e) => setInputWords(e.target.value)} placeholder="e.g. ubiquitous; break the ice; get over..." className={`w-full px-6 py-4 rounded-2xl border-2 focus:ring-4 outline-none text-base font-normal transition-all resize-none ${infoText ? 'border-orange-500 bg-orange-50 text-neutral-900 focus:ring-orange-100' : 'border-neutral-100 bg-white text-neutral-900 focus:border-neutral-900 focus:ring-neutral-50'}`} />
              <div className="px-1 mt-2 text-xs font-bold text-neutral-400">{wordsToProcessCount} items entered</div>
              {infoText && <p className="mt-2 text-[10px] font-bold text-orange-600 px-1 uppercase tracking-wider">{infoText}</p>}
            </div>

            <div className="space-y-3" ref={unitComboboxRef}>
              <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] px-1 flex items-center space-x-2"><Layers3 size={12}/><span>Unit Assignment (Optional)</span></label>
              <div className="relative">
                <input type="text" value={unitInput} onChange={handleUnitInputChange} onFocus={() => setShowSuggestions(true)} placeholder="Search or create a new unit..." className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none shadow-sm" />
                {isCreatingNewUnit && (<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1 text-xs font-bold text-green-600 pointer-events-none"><PlusCircle size={14}/><span>Create new</span></div>)}
                {showSuggestions && suggestedUnits.length > 0 && (
                  <ul className="absolute top-full mt-2 w-full bg-white border border-neutral-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-48 overflow-y-auto">
                    {suggestedUnits.map(unit => (<li key={unit.id} onMouseDown={() => handleSuggestionClick(unit)} className="px-4 py-2 text-sm font-medium cursor-pointer hover:bg-neutral-100">{unit.name}</li>))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => handleAdd(false)} disabled={wordsToProcessCount === 0 || isLoading || isSaving} className="px-6 py-4 bg-neutral-100 text-neutral-600 rounded-2xl hover:bg-neutral-200 flex items-center justify-center space-x-2 disabled:opacity-30 active:scale-95 transition-all flex-1"><span className="font-black text-xs uppercase tracking-widest">{isSaving ? 'SAVING...' : 'JUST ADD'}</span></button>
              {aiEnabled && (
                <button type="button" onClick={() => handleAdd(true)} disabled={wordsToProcessCount === 0 || isLoading || isSaving} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl hover:bg-neutral-800 flex items-center justify-center space-x-2 disabled:opacity-30 shadow-lg active:scale-95 transition-all flex-1">{isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} className="text-yellow-400" />}<span className="font-black text-xs uppercase tracking-widest">{isLoading ? 'ADDING...' : 'ADD WITH AI'}</span></button>
              )}
            </div>
          </div>
        </div>

        {lastAddedItems.length > 0 && (
          <div className="animate-in slide-in-from-top-4 duration-500 space-y-4">
            <div className="bg-white rounded-[2.5rem] p-8 border border-neutral-200 shadow-xl space-y-4 relative overflow-hidden">
               <div className="flex items-center space-x-3 text-sm font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-3"><ListChecks size={18} className="text-neutral-900" /><span>Process Summary</span></div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 max-h-48 overflow-y-auto">
                  {lastAddedItems.map((item, index) => (<div key={index} className="flex items-center space-x-2">{item.status === 'new' ? <CheckCircle2 size={14} className="text-green-500" /> : <Link size={14} className="text-blue-500" />}<span className="text-sm font-bold text-neutral-800 truncate">{item.word}</span><span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">({item.status})</span></div>))}
               </div>
               <div className="flex items-center space-x-2 text-[10px] text-neutral-400 font-bold bg-neutral-50 p-4 rounded-2xl border border-neutral-100 mt-4"><Info size={14} className="text-neutral-300" /><span>These items have been processed. You can edit them in the Library.</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
