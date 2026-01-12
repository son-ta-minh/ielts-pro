import React, { useState, useMemo } from 'react';
import { Play, Edit3, ArrowLeft, CheckCircle2, Circle, BrainCircuit, BookOpen } from 'lucide-react';
import { VocabularyItem, Unit, User, ReviewGrade } from '../../app/types';
// @Correctness - FIX: Add RegisterFilter to import to resolve type error
import { FilterType, RefinedFilter, StatusFilter, RegisterFilter } from '../word_lib/WordTable_UI';
import EditWordModal from '../word_lib/EditWordModal';
import ViewWordModal from '../word_lib/ViewWordModal';
import WordTable from '../word_lib/WordTable';
import { UnitEssayView } from './UnitEssayView';

interface TooltipState { word: VocabularyItem; rect: DOMRect; }

export interface UnitStudyViewUIProps {
    user: User;
    unit: Unit;
    allWords: VocabularyItem[];
    unitWords: VocabularyItem[];
    wordsById: Map<string, VocabularyItem>;
    pagedUnitWords: VocabularyItem[];
    filteredUnitWords: VocabularyItem[];
    viewingWord: VocabularyItem | null;
    setViewingWord: (word: VocabularyItem | null) => void;
    editingWord: VocabularyItem | null;
    setEditingWord: (word: VocabularyItem | null) => void;
    isPracticeMode: boolean;
    setIsPracticeMode: (isPractice: boolean) => void;
    unitTablePage: number;
    setUnitTablePage: (page: number) => void;
    unitTablePageSize: number;
    setUnitTablePageSize: (size: number) => void;
    unitTableQuery: string;
    setUnitTableQuery: (query: string) => void;
    unitTableFilters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter };
    setUnitTableFilters: (filters: { types: Set<FilterType>, refined: RefinedFilter, status: StatusFilter, register: RegisterFilter }) => void;
    onBack: () => void;
    onDataChange: () => void;
    onStartSession: (words: VocabularyItem[]) => void;
    onSwitchToEdit: () => void;
    handleRemoveWordFromUnit: (wordId: string) => Promise<void>;
    onBulkDelete: (ids: Set<string>) => Promise<void>;
    onHardDelete: (word: VocabularyItem) => Promise<void>;
    handleSaveWordUpdate: (word: VocabularyItem) => Promise<void>;
    handleToggleLearnedStatus: () => Promise<void>;
    onWordAction: (text: string, action: 'add' | 'remove') => void;
    onUpdateUser: (user: User) => Promise<void>;
    onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => Promise<number>;
}

export const UnitStudyViewUI: React.FC<UnitStudyViewUIProps> = (props) => {
  const { unit, allWords, unitWords, pagedUnitWords, filteredUnitWords, viewingWord, setViewingWord, editingWord, setEditingWord, isPracticeMode, setIsPracticeMode, unitTablePage, setUnitTablePage, unitTablePageSize, setUnitTablePageSize, unitTableQuery, setUnitTableQuery, unitTableFilters, setUnitTableFilters, onBack, onDataChange, onStartSession, onSwitchToEdit, handleRemoveWordFromUnit, onBulkDelete, onHardDelete, handleSaveWordUpdate, handleToggleLearnedStatus, onWordAction, onGainXp } = props;
  
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null);
  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);

  const handleHoverWord = (word: VocabularyItem | null, rect: DOMRect | null) => { 
    if (isPracticeMode) return;
    if (!word || !rect) setActiveTooltip(null); 
    else setActiveTooltip({ word, rect }); 
  };
  
  const handleSaveAndCloseEdit = async (word: VocabularyItem) => {
    await handleSaveWordUpdate(word);
    setEditingWord(null);
  };

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6 pb-24 relative animate-in fade-in duration-300">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <button onClick={onBack} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors"><ArrowLeft size={16} /><span>Back to Essay Library</span></button>
            <div className="flex items-center gap-3">
                <button onClick={() => setIsPracticeMode(!isPracticeMode)} className={`px-6 py-2 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest border transition-all ${isPracticeMode ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-inner' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                    <BrainCircuit size={16} /><span>Context Recall</span>
                </button>
                <div className="w-px h-6 bg-neutral-200 mx-1 hidden sm:block"></div>
                <button onClick={onSwitchToEdit} className="px-6 py-2 bg-neutral-100 text-neutral-600 rounded-xl font-black text-[10px] hover:bg-neutral-200 transition-all flex items-center space-x-2 active:scale-95 uppercase tracking-widest border border-neutral-200"><Edit3 size={16} /><span>Edit</span></button>
                <button onClick={() => onStartSession(unitWords)} disabled={unitWords.length === 0} className="px-8 py-2 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm"><Play size={16} fill="white" /><span>Practice</span></button>
            </div>
        </header>
        <div className="px-2 space-y-2">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-neutral-900 tracking-tight">{unit.name}</h3>
              <button onClick={handleToggleLearnedStatus} className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors">
                  {unit.isLearned ? <CheckCircle2 size={16} className="text-green-500"/> : <Circle size={16} className="text-neutral-300"/>}
                  <span className="whitespace-nowrap">{unit.isLearned ? 'Completed' : 'Mark as Completed'}</span>
              </button>
            </div>
            <p className="text-xs text-neutral-500 font-medium">{unit.description || 'Description is empty'}</p>
        </div>
        <div className="rounded-[2rem] border border-neutral-200 shadow-sm min-h-[30vh] max-h-[60vh] flex flex-col relative">
            {isPracticeMode && <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200 animate-in fade-in slide-in-from-top-2"><BrainCircuit size={12} /><span className="text-[10px] font-black uppercase tracking-tighter">Active Context Recall Active</span></div>}
            <UnitEssayView className="rounded-[2rem]" text={unit.essay || ''} vocabString={unit.customVocabString} wordsByText={wordsByText} onHoverWord={handleHoverWord} onWordAction={onWordAction} isPracticeMode={isPracticeMode} />
        </div>
        <WordTable 
            words={pagedUnitWords} 
            total={filteredUnitWords.length} 
            loading={false} 
            page={unitTablePage} 
            pageSize={unitTablePageSize} 
            onPageChange={setUnitTablePage} 
            onPageSizeChange={setUnitTablePageSize} 
            onSearch={setUnitTableQuery} 
            onFilterChange={setUnitTableFilters} 
            onAddWords={async () => {}} 
            onViewWord={setViewingWord}
            onEditWord={setEditingWord}
            onDelete={async (w) => { await handleRemoveWordFromUnit(w.id); }} 
            onHardDelete={onHardDelete}
            onBulkDelete={onBulkDelete}
            onRefine={() => onDataChange()} 
            onPractice={(ids) => onStartSession(allWords.filter(w => ids.has(w.id)))} 
            settingsKey="ielts_pro_unit_table_settings" 
            context="unit" 
        />
      </div>
      {activeTooltip && (<div className="fixed z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95" style={{ top: `${activeTooltip.rect.top - 10}px`, left: `${activeTooltip.rect.left}px`, transform: 'translateY(-100%)' }}><div className="bg-white px-4 py-3 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-cyan-100 flex flex-col items-start text-left space-y-1 min-w-[140px] relative"><div className="text-sky-600 font-sans text-xs font-bold tracking-wide">{activeTooltip.word.ipa || '/?/'}</div><div className="text-sm font-black text-slate-800 leading-none">{activeTooltip.word.meaningVi}</div><div className="absolute top-full left-4 -mt-1 w-3 h-3 bg-white border-r border-b border-cyan-100 rotate-45 transform" /></div></div>)}
      {viewingWord && <ViewWordModal word={viewingWord} onClose={() => setViewingWord(null)} onNavigateToWord={setViewingWord} onUpdate={handleSaveWordUpdate} onEditRequest={(word) => { setViewingWord(null); setEditingWord(word); }} onGainXp={onGainXp} isViewOnly={true} />}
      {editingWord && <EditWordModal word={editingWord} onSave={handleSaveAndCloseEdit} onClose={() => setEditingWord(null)} onSwitchToView={(word) => { setEditingWord(null); setViewingWord(word); }}/>}
    </>
  );
}
