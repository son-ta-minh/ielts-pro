import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sparkles, Save, Loader2, Link, Network, CheckCircle2, Info, X, AtSign, ListChecks, Layers3, PlusCircle } from 'lucide-react';
import { generateBatchWordDetails } from '../services/geminiService';
import { createNewWord } from '../utils/srs';
import { findWordByText, bulkSaveWords, getUnitsByUserId, saveUnit } from '../app/db';
import { VocabularyItem, Unit, PrepositionPattern } from '../app/types';

interface Props {
  onWordsAdded: () => void;
  userId: string;
  isArchived?: boolean;
}

const generateUnitId = () => 'unit-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

const parsePrepositionPatterns = (prepositionStr: string | null | undefined): PrepositionPattern[] | undefined => {
    if (!prepositionStr || typeof prepositionStr !== 'string' || prepositionStr.trim().toLowerCase() === 'null') {
        return undefined;
    }

    const multiWordPrepositions = [
        'out of', 'because of', 'according to', 'in front of', 'next to', 
        'due to', 'instead of', 'in spite of', 'on top of', 'as for', 
        'except for', 'apart from', 'along with', 'in addition to', 'in case of',
        'with regard to', 'as well as', 'in accordance with', 'on behalf of',
        'in relation to', 'in terms of', 'by means of', 'in charge of'
    ];

    const patterns = prepositionStr.split(',').map(p => p.trim()).filter(Boolean);
    if (patterns.length === 0) {
        return undefined;
    }

    const results: PrepositionPattern[] = patterns.map(pattern => {
        // Check for multi-word prepositions first, longest match first to handle cases like "in spite of" vs "in"
        const sortedMultiWord = [...multiWordPrepositions].sort((a, b) => b.length - a.length);
        const foundMultiWord = sortedMultiWord.find(mwp => pattern.toLowerCase().startsWith(mwp + ' '));

        if (foundMultiWord) {
            const prep = foundMultiWord;
            const usage = pattern.substring(prep.length + 1).trim();
            return { prep, usage };
        }

        // Fallback to single-word preposition logic
        const firstSpaceIndex = pattern.indexOf(' ');
        if (firstSpaceIndex > 0) {
            const prep = pattern.substring(0, firstSpaceIndex);
            const usage = pattern.substring(firstSpaceIndex + 1).trim();
            return { prep, usage };
        }
        
        // If no space, the whole thing is the preposition.
        return { prep: pattern, usage: '' };
    });
    
    return results.length > 0 ? results : undefined;
};

const AddWord: React.FC<Props> = ({ onWordsAdded, userId, isArchived = false }) => {
  const [inputWords, setInputWords] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingWordsInfo, setExistingWordsInfo] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [lastAddedItems, setLastAddedItems] = useState<{ word: string, status: 'new' | 'linked' }[]>([]);
  
  // Unit Combobox State
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitInput, setUnitInput] = useState('');
  const [suggestedUnits, setSuggestedUnits] = useState<Unit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedUnitForUpdate, setSelectedUnitForUpdate] = useState<Unit | null>(null);
  const unitComboboxRef = useRef<HTMLDivElement>(null);

  const isCreatingNewUnit = useMemo(() => {
    return unitInput.trim() && !selectedUnitForUpdate && !units.some(u => u.name.toLowerCase() === unitInput.trim().toLowerCase());
  }, [unitInput, selectedUnitForUpdate, units]);
  
  const fetchUnits = useCallback(async () => {
    const userUnits = await getUnitsByUserId(userId);
    setUnits(userUnits.sort((a,b) => a.name.localeCompare(b.name)));
  }, [userId]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (unitComboboxRef.current && !unitComboboxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!unitInput) {
      setSuggestedUnits([]);
      return;
    }
    const lowerInput = unitInput.toLowerCase();
    const filtered = units.filter(u => u.name.toLowerCase().includes(lowerInput));
    setSuggestedUnits(filtered);
  }, [unitInput, units]);

  const wordsToProcess = useMemo(() => {
    return inputWords.split(';').map(w => w.trim()).filter(Boolean);
  }, [inputWords]);

  useEffect(() => {
    const checkExistingWords = async () => {
      if (wordsToProcess.length === 0) {
        setExistingWordsInfo([]); return;
      }
      const existing: string[] = [];
      for (const word of wordsToProcess) {
        const found = await findWordByText(userId, word);
        if (found) existing.push(word);
      }
      setExistingWordsInfo(existing);
    };
    const timer = setTimeout(checkExistingWords, 400);
    return () => clearTimeout(timer);
  }, [wordsToProcess, userId]);

  const handleUnitInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUnitInput(value);
    setSelectedUnitForUpdate(null); // Clear selection when user types
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (unit: Unit) => {
    setUnitInput(unit.name);
    setSelectedUnitForUpdate(unit);
    setShowSuggestions(false);
  };
  
  const handleAdd = async (withAI: boolean) => {
    if (wordsToProcess.length === 0 || isLoading || isSaving) return;

    withAI ? setIsLoading(true) : setIsSaving(true);
    setError(null);
    setLastAddedItems([]);

    try {
      const wordsToCreate: string[] = [];
      const idsToAddToUnit: string[] = [];
      const existingWordsInBatch: {word: string, id: string}[] = [];

      for (const word of wordsToProcess) {
        const existingItem = await findWordByText(userId, word);
        if (existingItem) {
          idsToAddToUnit.push(existingItem.id);
          existingWordsInBatch.push({word: existingItem.word, id: existingItem.id});
        } else {
          wordsToCreate.push(word);
        }
      }

      const newlyCreatedItems: VocabularyItem[] = [];

      if (wordsToCreate.length > 0) {
        let aiMap: Map<string, any> = new Map();
        if (withAI) {
          // AI Quota Optimization: Process in chunks for larger requests
          const CHUNK_SIZE = 10;
          const chunks: string[][] = [];
          for (let i = 0; i < wordsToCreate.length; i += CHUNK_SIZE) {
            chunks.push(wordsToCreate.slice(i, i + CHUNK_SIZE));
          }
          
          // Process chunks concurrently
          const chunkPromises = chunks.map(chunk => generateBatchWordDetails(chunk));
          const allChunkResults = await Promise.all(chunkPromises);
          const results = allChunkResults.flat();
          
          results.forEach(r => r.word && aiMap.set(r.word.toLowerCase(), r));
        }

        const itemsToSave: VocabularyItem[] = wordsToCreate.map(word => {
          const aiDetails = aiMap.get(word.toLowerCase());
          const prepositions = (aiDetails?.isPhrasalVerb ? undefined : parsePrepositionPatterns(aiDetails?.preposition));
        
          return {
            ...createNewWord(word, aiDetails?.ipa || '', aiDetails?.meaningVi || '', aiDetails?.example || '', '', aiDetails?.tags || [], !!aiDetails?.isIdiom, !!aiDetails?.needsPronunciationFocus, !!aiDetails?.isPhrasalVerb, !!aiDetails?.isCollocation, !!aiDetails?.isStandardPhrase, isArchived), 
            prepositions,
            isIrregular: !!aiDetails?.isIrregular, 
            v2: aiDetails?.isIrregular ? aiDetails.v2 : undefined, 
            v3: aiDetails?.isIrregular ? aiDetails.v3 : undefined, 
            wordFamily: aiDetails?.wordFamily, 
            userId: userId 
          };
        });

        if (itemsToSave.length > 0) {
          await bulkSaveWords(itemsToSave);
          newlyCreatedItems.push(...itemsToSave);
          idsToAddToUnit.push(...itemsToSave.map(item => item.id));
        }
      }

      let unitAssigned = false, assignedUnitName = '';
      if (idsToAddToUnit.length > 0 && unitInput.trim()) {
          if (selectedUnitForUpdate) { // Update existing unit
              const updatedUnit = {...selectedUnitForUpdate, wordIds: Array.from(new Set([...selectedUnitForUpdate.wordIds, ...idsToAddToUnit])), updatedAt: Date.now()};
              await saveUnit(updatedUnit);
              unitAssigned = true; assignedUnitName = updatedUnit.name;
          } else if (isCreatingNewUnit) { // Create new unit
              const newUnit: Unit = { id: generateUnitId(), userId, name: unitInput.trim(), description: '', wordIds: idsToAddToUnit, createdAt: Date.now(), updatedAt: Date.now() };
              await saveUnit(newUnit);
              unitAssigned = true; assignedUnitName = newUnit.name;
              await fetchUnits();
          }
      }
      
      if (newlyCreatedItems.length > 0 || unitAssigned) onWordsAdded();

      const lastItemsSummary = [...newlyCreatedItems.map(item => ({ word: item.word, status: 'new' as const })), ...existingWordsInBatch.map(item => ({ word: item.word, status: 'linked' as const }))];
      setLastAddedItems(lastItemsSummary);

      let successMessage = '';
      if (newlyCreatedItems.length > 0) successMessage += `Added ${newlyCreatedItems.length} new item(s).`;
      
      const linkedCount = idsToAddToUnit.length - newlyCreatedItems.length;
      if (unitAssigned && linkedCount > 0) {
        successMessage += `${successMessage ? ' ' : ''}Linked ${linkedCount} existing item(s) to unit "${assignedUnitName}".`;
      } else if (unitAssigned) {
        successMessage += `${successMessage ? ' ' : ''}All new items assigned to unit "${assignedUnitName}".`;
      }

      if (!successMessage) successMessage = existingWordsInBatch.length > 0 ? "No new words created. Select a unit to link existing words." : 'Action complete. No changes were made.';
      setNotification(successMessage);

      setInputWords('');
      setUnitInput('');
      setSelectedUnitForUpdate(null);

    } catch (e: any) {
      setError(e.message || "An error occurred during processing.");
    } finally {
      setIsLoading(false);
      setIsSaving(false);
    }
  };
  
  const infoText = existingWordsInfo.length > 0 
    ? `NOTE: ${existingWordsInfo.join(', ')} already exist. ${unitInput ? 'They will only be linked to the selected unit.' : 'Select a unit to link them.'}` 
    : null;

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
              <div className="px-1 mt-2 text-xs font-bold text-neutral-400">{wordsToProcess.length} items entered</div>
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
              <button type="button" onClick={() => handleAdd(false)} disabled={wordsToProcess.length === 0 || isLoading || isSaving} className="px-6 py-4 bg-neutral-100 text-neutral-600 rounded-2xl hover:bg-neutral-200 flex items-center justify-center space-x-2 disabled:opacity-30 active:scale-95 transition-all">{isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}<span className="font-black text-xs uppercase tracking-widest">{isSaving ? 'SAVING...' : 'JUST ADD'}</span></button>
              <button type="button" onClick={() => handleAdd(true)} disabled={wordsToProcess.length === 0 || isLoading || isSaving} className="px-8 py-4 bg-neutral-900 text-white rounded-2xl hover:bg-neutral-800 flex items-center justify-center space-x-2 disabled:opacity-30 shadow-lg active:scale-95 transition-all">{isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} className="text-yellow-400" />}<span className="font-black text-xs uppercase tracking-widest">{isLoading ? 'ADDING...' : 'ADD WITH AI'}</span></button>
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
      
      <div className="min-h-16">{notification && ( <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-between animate-in fade-in duration-300"><div className="flex items-center space-x-3 text-green-800 font-bold text-sm"><CheckCircle2 size={20} /><span>{notification}</span></div><button type="button" onClick={() => setNotification(null)} className="p-1 text-green-400 hover:text-green-800 transition-colors"><X size={16} /></button></div>)}</div>
    </div>
  );
};

export default AddWord;