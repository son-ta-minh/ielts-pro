import React, { useState, useEffect } from 'react';
import { VocabularyItem, Unit, ReviewGrade } from '../../app/types';
import { findWordByText, saveWord, getUnitsContainingWord, getAllWords } from '../../app/dataStore';
import { ViewWordModalUI } from './ViewWordModal_UI';
import { createNewWord, updateSRS } from '../../utils/srs';
import TestModal from '../practice/TestModal';
import { calculateWordDifficultyXp } from '../../app/useAppController';
import { getConfig } from '../../app/settingsManager';

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onNavigateToWord: (word: VocabularyItem) => void;
  onEditRequest: (word: VocabularyItem) => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number, tested: number }) => Promise<number>;
  onUpdate: (word: VocabularyItem) => void;
  isViewOnly?: boolean;
}

const ViewWordModal: React.FC<Props> = ({ word, onClose, onNavigateToWord, onEditRequest, onUpdate, onGainXp, isViewOnly = false }) => {
  const [currentWord, setCurrentWord] = useState(word);
  const [linkedUnits, setLinkedUnits] = useState<Unit[]>([]);
  const [relatedWords, setRelatedWords] = useState<Record<string, VocabularyItem[]>>({});
  const [relatedByGroup, setRelatedByGroup] = useState<Record<string, VocabularyItem[]>>({});
  const [addingVariant, setAddingVariant] = useState<string | null>(null);
  const [existingVariants, setExistingVariants] = useState<Set<string>>(new Set());
  const [isChallenging, setIsChallenging] = useState(false);

  useEffect(() => {
    setCurrentWord(word);
  }, [word]);

  useEffect(() => {
    const loadDependencies = async () => {
      if (!currentWord) return;

      const membersToCheck: string[] = [];
      const family = currentWord.wordFamily;
      if (family) {
        membersToCheck.push(
          ...(family.nouns || []).map(m => m.word.toLowerCase().trim()),
          ...(family.verbs || []).map(m => m.word.toLowerCase().trim()),
          ...(family.adjs || []).map(m => m.word.toLowerCase().trim()),
          ...(family.advs || []).map(m => m.word.toLowerCase().trim())
        );
      }
      
      const paraphrases = currentWord.paraphrases;
      if (paraphrases) {
          membersToCheck.push(...paraphrases.map(p => p.word.toLowerCase().trim()));
      }

      const idioms = currentWord.idiomsList;
      if (idioms) {
        membersToCheck.push(...idioms.map(i => i.text.toLowerCase().trim()));
      }

      const uniqueMembers = [...new Set(membersToCheck.filter(Boolean))];
      
      const found = new Set<string>();
      for (const memberWord of uniqueMembers) {
        if (!memberWord) continue;
        const exists = await findWordByText(currentWord.userId, memberWord);
        if (exists) found.add(memberWord);
      }
      setExistingVariants(found);
      
      const units = await getUnitsContainingWord(currentWord.userId, currentWord.id);
      setLinkedUnits(units);

      const allWordsInStore = getAllWords();
      const relatedData: Record<string, VocabularyItem[]> = {};
      (currentWord.tags || []).forEach(tag => {
          const wordsForTag = allWordsInStore.filter(w => 
              w.userId === currentWord.userId && 
              w.id !== currentWord.id && 
              w.tags?.includes(tag)
          );
          if (wordsForTag.length > 0) {
              relatedData[tag] = wordsForTag;
          }
      });
      setRelatedWords(relatedData);
      
      const relatedGroupData: Record<string, VocabularyItem[]> = {};
      (currentWord.groups || []).forEach(group => {
          const wordsForGroup = allWordsInStore.filter(w => 
              w.userId === currentWord.userId && 
              w.id !== currentWord.id && 
              w.groups?.includes(group)
          );
          if (wordsForGroup.length > 0) {
              relatedGroupData[group] = wordsForGroup;
          }
      });
      setRelatedByGroup(relatedGroupData);
    };
    loadDependencies();
  }, [currentWord]);

  const handleAddVariantToLibrary = async (variant: { word: string, ipa: string }, sourceType: 'family' | 'paraphrase' | 'idiom' = 'family') => {
    if (!variant.word || addingVariant || existingVariants.has(variant.word.toLowerCase())) return;
    setAddingVariant(variant.word);
    try {
      const note = `From ${sourceType} of "${currentWord.word}"`;
      const tags = [...(currentWord.tags || []), `word-${sourceType}`];
      const newItem = { ...createNewWord(variant.word, variant.ipa || '', `Added from ${sourceType}`, '', note, tags), userId: currentWord.userId };
      await saveWord(newItem);
      setExistingVariants(prev => new Set(prev).add(variant.word.toLowerCase()));
    } finally { setAddingVariant(null); }
  };
  
  const handleChallengeComplete = async (grade: ReviewGrade, results?: Record<string, boolean>, stopSession?: boolean, counts?: { correct: number, tested: number }) => {
    const updated = updateSRS(currentWord, grade);
    if (results) {
        updated.lastTestResults = { ...(updated.lastTestResults || {}), ...results };
    }
    const baseWordXp = calculateWordDifficultyXp(currentWord);
    
    // onGainXp handles the atomic save of BOTH the user and the word.
    await onGainXp(baseWordXp, updated, grade, counts);
    
    setIsChallenging(false);
    // The onUpdate call below was redundant and caused a "saving too quickly" race condition.
    // onGainXp already persists the 'updated' word object.
    // onUpdate(updated); 
    
    // Update local state to reflect changes immediately in the modal if it were to stay open.
    setCurrentWord(updated); 
  };

  const handleLocalUpdate = (updatedWord: VocabularyItem) => {
      onUpdate(updatedWord);
      setCurrentWord(updatedWord);
  };

  const config = getConfig();
  const appliedAccent = config.audio.appliedAccent;

  return (
    <>
    {isChallenging && <TestModal word={currentWord} onComplete={handleChallengeComplete} onClose={() => setIsChallenging(false)} onGainXp={onGainXp} />}
    <ViewWordModalUI
      word={currentWord}
      onClose={onClose}
      onChallengeRequest={() => setIsChallenging(true)}
      onEditRequest={() => onEditRequest(currentWord)}
      onUpdate={handleLocalUpdate}
      linkedUnits={linkedUnits}
      relatedWords={relatedWords}
      relatedByGroup={relatedByGroup}
      onNavigateToWord={onNavigateToWord}
      onAddVariantToLibrary={handleAddVariantToLibrary}
      addingVariant={addingVariant}
      existingVariants={existingVariants}
      appliedAccent={appliedAccent}
      isViewOnly={isViewOnly}
    />
    </>
  );
};

export default ViewWordModal;