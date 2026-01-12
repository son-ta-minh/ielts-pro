import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Unit, VocabularyItem, User, ReviewGrade } from '../../app/types';
import { getUnitsByUserId, saveUnit, deleteUnit, getAllWordsForExport } from '../../app/db';
import UnitStudyView from './UnitStudyView';
import UnitEditView from './UnitEditView';
import { UnitLibraryUI } from './UnitLibrary_UI';
import { Loader2 } from 'lucide-react';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';

interface Props {
  user: User;
  onStartSession: (words: VocabularyItem[]) => void;
  onUpdateUser: (user: User) => Promise<void>;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => Promise<number>;
}

const generateId = () => 'u-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

const UnitLibrary: React.FC<Props> = ({ user, onStartSession, onUpdateUser, onGainXp }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);

  const [unitVisibility, setUnitVisibility] = useState(() => 
    getStoredJSON('ielts_pro_unit_visibility', { showDesc: false, showWords: true, showStatus: true })
  );
  const [unitFilter, setUnitFilter] = useState<'all' | 'learned' | 'new'>('all');
  
  const wordsById = useMemo(() => new Map(allWords.map(w => [w.id, w])), [allWords]);

  useEffect(() => { setStoredJSON('ielts_pro_unit_visibility', unitVisibility); }, [unitVisibility]);
  
  const loadData = useCallback(async () => {
    // setLoading(true); // Don't block UI on background refresh if possible, or handle gracefully
    try {
      const [userUnits, userWords] = await Promise.all([
        getUnitsByUserId(user.id),
        getAllWordsForExport(user.id)
      ]);
      setUnits(userUnits.sort((a,b) => b.createdAt - a.createdAt));
      setAllWords(userWords);

      // CRITICAL FIX: Sync selectedUnit with the newly fetched data
      // This ensures that when a unit is updated (e.g. marked learned), the View component receives the new prop.
      setSelectedUnit(current => {
          if (!current) return null;
          const found = userUnits.find(u => u.id === current.id);
          return found || current;
      });

    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateEmptyUnit = async () => {
    const newUnit: Unit = { id: generateId(), userId: user.id, name: "New Unit", description: "", wordIds: [], createdAt: Date.now(), updatedAt: Date.now(), essay: "" };
    await saveUnit(newUnit);
    setUnits(prev => [newUnit, ...prev]);
    setSelectedUnit(newUnit);
    setIsEditingUnit(true);
  };
  
  const handleDeleteUnit = async () => {
    if (!unitToDelete) return;
    await deleteUnit(unitToDelete.id);
    await loadData();
    setUnitToDelete(null);
    if(selectedUnit?.id === unitToDelete.id) { setSelectedUnit(null); }
  };
  
  const handleUnitClick = (unit: Unit) => {
    setSelectedUnit(unit);
    const isEmpty = (!unit.essay || unit.essay.trim() === '') && (!unit.wordIds || unit.wordIds.length === 0);
    setIsEditingUnit(isEmpty);
  };
  
  const startEditing = (unit: Unit) => {
    setSelectedUnit(unit);
    setIsEditingUnit(true);
  };

  const unitStats = useMemo(() => {
    const learnedWordIds = new Set(allWords.filter(w => w.lastReview && !w.isPassive).map(w => w.id));
    const statsMap = new Map<string, { isCompleted: boolean }>();
    units.forEach(unit => {
        const wordObjectsInUnit = unit.wordIds.map(id => wordsById.get(id)).filter(Boolean) as VocabularyItem[];
        const activeWordIdsInUnit = wordObjectsInUnit.filter(w => !w.isPassive).map(w => w.id);
        const isCompleted = activeWordIdsInUnit.length > 0 && activeWordIdsInUnit.every(id => learnedWordIds.has(id));
        statsMap.set(unit.id, { isCompleted });
    });
    return statsMap;
  }, [units, allWords, wordsById]);

  const filteredUnits = useMemo(() => {
      let result = units;
      if (unitFilter === 'learned') result = result.filter(u => u.isLearned);
      if (unitFilter === 'new') result = result.filter(u => !u.isLearned);
      if (!query) return result;
      const lowerQuery = query.toLowerCase();
      return result.filter(u => u.name.toLowerCase().includes(lowerQuery) || u.description.toLowerCase().includes(lowerQuery));
  }, [units, query, unitFilter]);

  const pagedUnits = useMemo(() => { const start = page * pageSize; return filteredUnits.slice(start, start + pageSize); }, [filteredUnits, page, pageSize]);
  const totalListPages = Math.ceil(filteredUnits.length / pageSize);

  if (loading && units.length === 0) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-neutral-300" size={32} /></div>;

  if (selectedUnit) {
      return isEditingUnit ? (
          <UnitEditView 
              user={user}
              unit={selectedUnit}
              allWords={allWords}
              onCancel={() => {
                  const wasNew = selectedUnit.name === "New Unit" && selectedUnit.wordIds.length === 0 && !selectedUnit.essay;
                  if (wasNew) { setSelectedUnit(null); } 
                  else { setIsEditingUnit(false); }
              }}
              onSave={async () => {
                  await loadData();
                  setIsEditingUnit(false);
              }}
          />
      ) : (
          <UnitStudyView 
              user={user}
              unit={selectedUnit}
              allWords={allWords}
              onBack={() => setSelectedUnit(null)}
              onDataChange={loadData}
              onStartSession={onStartSession}
              onSwitchToEdit={() => setIsEditingUnit(true)}
              onUpdateUser={onUpdateUser}
              onGainXp={onGainXp}
          />
      );
  }
  
  return (
    <UnitLibraryUI
      loading={loading}
      query={query}
      setQuery={setQuery}
      unitFilter={unitFilter}
      setUnitFilter={setUnitFilter}
      unitVisibility={unitVisibility}
      setUnitVisibility={setUnitVisibility}
      pagedUnits={pagedUnits}
      unitStats={unitStats}
      page={page}
      setPage={setPage}
      totalListPages={totalListPages}
      unitToDelete={unitToDelete}
      setUnitToDelete={setUnitToDelete}
      handleCreateEmptyUnit={handleCreateEmptyUnit}
      handleDeleteUnit={handleDeleteUnit}
      handleUnitClick={handleUnitClick}
      startEditing={startEditing}
    />
  );
};

export default UnitLibrary;
