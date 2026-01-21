import React, { useState, useEffect, useMemo } from 'react';
import { VocabularyItem, Unit, User } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import { getRefineUnitPrompt } from '../../services/promptService';
import { UnitEditViewUI } from './UnitEditView_UI';
import { stringToWordArray } from '../../utils/text';

interface Props {
  user: User;
  unit: Unit;
  allWords: VocabularyItem[];
  onCancel: () => void;
  onSave: () => void;
}

const UnitEditView: React.FC<Props> = ({ user, unit, allWords, onCancel, onSave }) => {
  const [editName, setEditName] = useState(unit.name);
  const [editDesc, setEditDesc] = useState(unit.description);
  const [editWords, setEditWords] = useState('');
  const [editEssay, setEditEssay] = useState(unit.essay || '');
  const [isSaving, setIsSaving] = useState(false);
  
  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);

  useEffect(() => {
    setEditName(unit.name);
    setEditDesc(unit.description);
    setEditEssay(unit.essay || '');
    if (unit.customVocabString) {
        setEditWords(unit.customVocabString);
    } else {
        const wordsById = new Map<string, VocabularyItem>(allWords.map(w => [w.id, w]));
        const currentWordsText = unit.wordIds.map(id => wordsById.get(id)?.word).filter(Boolean).join('; ');
        setEditWords(currentWordsText);
    }
  }, [unit, allWords]);

  const handleSaveUnitChanges = async () => {
    setIsSaving(true);
    try {
        const entries = stringToWordArray(editWords);
        const uniqueBaseWords = new Set<string>();
        for(const entry of entries) { const [essaySide, baseSide] = entry.split(':'); const base = (baseSide || essaySide).trim(); if (base) uniqueBaseWords.add(base.toLowerCase()); }
        
        const finalWordIds: string[] = []; 
        const newWordsToCreate: VocabularyItem[] = [];
        
        for (const token of uniqueBaseWords) {
            const existingWord = wordsByText.get(token);
            if (existingWord) { finalWordIds.push(existingWord.id); } 
            else { 
                const newWord = { ...createNewWord(token, '', '', '', '', ['ielts', 'unit-generated']), userId: user.id }; 
                newWordsToCreate.push(newWord); 
                finalWordIds.push(newWord.id); 
            }
        }
        
        if (newWordsToCreate.length > 0) await dataStore.bulkSaveWords(newWordsToCreate);
        
        const updatedUnit: Unit = { ...unit, name: editName, description: editDesc, essay: editEssay, wordIds: finalWordIds, customVocabString: editWords, updatedAt: Date.now() };
        await dataStore.saveUnit(updatedUnit);
        onSave();
    } finally { setIsSaving(false); }
  };

  const handleGenerateUnitRefinePrompt = (inputs: { request: string }) => getRefineUnitPrompt(editName, editDesc, editWords, editEssay, inputs.request, user);
  const handleApplyRefinement = async (refined: { name: string; description: string; words: string | string[]; essay: string }) => { 
      setEditName(refined.name); 
      setEditDesc(refined.description); 
      setEditWords(Array.isArray(refined.words) ? refined.words.join('; ') : refined.words); 
      setEditEssay(refined.essay); 
  };

  return (
    <UnitEditViewUI
      user={user}
      unit={unit}
      allWords={allWords}
      onCancel={onCancel}
      editName={editName}
      setEditName={setEditName}
      editDesc={editDesc}
      setEditDesc={setEditDesc}
      editWords={editWords}
      setEditWords={setEditWords}
      editEssay={editEssay}
      setEditEssay={setEditEssay}
      isSaving={isSaving}
      handleSaveUnitChanges={handleSaveUnitChanges}
      handleGenerateUnitRefinePrompt={handleGenerateUnitRefinePrompt}
      handleApplyRefinement={handleApplyRefinement}
    />
  );
}

export default UnitEditView;