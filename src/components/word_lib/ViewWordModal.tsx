import React, { useState, useEffect } from 'react';
import { VocabularyItem, Unit, ReviewGrade } from '../../app/types';
import { findWordByText, saveWord, getUnitsContainingWord, getAllWords } from '../../app/dataStore';
import { ViewWordModalUI } from './ViewWordModal_UI';
import { createNewWord, calculateMasteryScore } from '../../utils/srs';
import TestModal from '../practice/TestModal';
/* Fix: Import UniversalAiModal which was missing */
import UniversalAiModal from '../common/UniversalAiModal';
import { getConfig } from '../../app/settingsManager';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import { getGenerateWordLessonEssayPrompt, getGenerateWordLessonTestPrompt } from '../../services/promptService';

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onNavigateToWord: (word: VocabularyItem) => void;
  onEditRequest: (word: VocabularyItem) => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number, tested: number }) => Promise<number>;
  onUpdate: (word: VocabularyItem) => void;
  isViewOnly?: boolean;
  /* Fix: Type corrected from 'ESSAY' to 'USAGE' */
  initialTab?: 'OVERVIEW' | 'USAGE' | 'TEST';
}

const ViewWordModal: React.FC<Props> = ({ word, onClose, onNavigateToWord, onEditRequest, onUpdate, onGainXp, isViewOnly = false, initialTab = 'OVERVIEW' }) => {
  const [currentWord, setCurrentWord] = useState(word);
  const [linkedUnits, setLinkedUnits] = useState<Unit[]>([]);
  const [relatedWords, setRelatedWords] = useState<Record<string, VocabularyItem[]>>({});
  const [relatedByGroup, setRelatedByGroup] = useState<Record<string, VocabularyItem[]>>({});
  const [addingVariant, setAddingVariant] = useState<string | null>(null);
  const [existingVariants, setExistingVariants] = useState<Set<string>>(new Set());
  const [isChallenging, setIsChallenging] = useState(false);
  const [isMimicOpen, setIsMimicOpen] = useState(false);

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

      const collocations = currentWord.collocationsArray;
      if (collocations) {
          membersToCheck.push(...collocations.map(c => c.text.toLowerCase().trim()));
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
      const groupsToProcess = (currentWord.groups || []).filter(g => g.toLowerCase() !== 'ielts');
      groupsToProcess.forEach(group => {
          const wordsForGroup = allWordsInStore.filter(w => 
              w.userId === currentWord.userId && 
              w.id !== currentWord.id && 
              w.groups?.includes(group)
          );
          if (wordsForGroup.length > 0) {
              relatedData[group] = wordsForGroup;
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

  const handleAddVariantToLibrary = async (variant: { word: string, ipa: string }, sourceType: 'family' | 'paraphrase' | 'idiom' | 'collocation' = 'family') => {
    if (!variant.word || addingVariant || existingVariants.has(variant.word.toLowerCase())) return;
    setAddingVariant(variant.word);
    try {
      const note = `From ${sourceType} of "${currentWord.word}"`;
      const groups = [...(currentWord.groups || []), `word-${sourceType}`];
      const newItem = { ...createNewWord(variant.word, variant.ipa || '', `Added from ${sourceType}`, '', note, groups), userId: currentWord.userId };
      await saveWord(newItem);
      setExistingVariants(prev => new Set(prev).add(variant.word.toLowerCase()));
    } finally { setAddingVariant(null); }
  };
  
  const handleChallengeComplete = async (grade: ReviewGrade, results?: Record<string, boolean>, stopSession?: boolean, counts?: { correct: number, tested: number }) => {
    const updated = { ...currentWord }; 
    if (results) {
        updated.lastTestResults = { ...(updated.lastTestResults || {}), ...results };
    }
    updated.masteryScore = calculateMasteryScore(updated);
    await onUpdate(updated);
    setIsChallenging(false);
    setCurrentWord(updated); 
  };

  const handleLocalUpdate = (updatedWord: VocabularyItem) => {
      onUpdate(updatedWord);
      setCurrentWord(updatedWord);
  };

  // --- AI Lesson Creation Logic ---
  const [aiModalMode, setAiModalMode] = useState<'ESSAY' | 'TEST' | null>(null);

  const handleOpenAiModal = (mode: 'ESSAY' | 'TEST') => {
      setAiModalMode(mode);
  };

  const handleGeneratePrompt = (inputs: any) => {
      /* Retrieve coach name for prompts */
      const config = getConfig();
      const activeType = config.audioCoach.activeCoach;
      const coachName = config.audioCoach.coaches[activeType].name;
      
      if (aiModalMode === 'ESSAY') {
          return getGenerateWordLessonEssayPrompt(currentWord, inputs, coachName);
      } else {
          return getGenerateWordLessonTestPrompt(currentWord, inputs, coachName);
      }
  };

  const handleJsonReceived = (data: any) => {
      const { result } = data;
      const cleanResult = result || data;
      const updated = { ...currentWord, lesson: { ...(currentWord.lesson || {}) } };

      if (aiModalMode === 'ESSAY') {
          updated.lesson!.essay = cleanResult.content;
      } else {
          updated.lesson!.test = cleanResult.content;
      }
      
      handleLocalUpdate(updated);
      setAiModalMode(null);
  };

  const config = getConfig();
  const appliedAccent = config.audio.appliedAccent;

  return (
    <>
    {isChallenging && <TestModal word={currentWord} onComplete={handleChallengeComplete} onClose={() => setIsChallenging(false)} />}
    {isMimicOpen && (
        <SimpleMimicModal target={currentWord.word} onClose={() => setIsMimicOpen(false)} />
    )}
    <ViewWordModalUI
      word={currentWord}
      onClose={onClose}
      onChallengeRequest={() => setIsChallenging(true)}
      onMimicRequest={() => setIsMimicOpen(true)}
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
      initialTab={initialTab}
      onGenerateLesson={handleOpenAiModal}
    />

    {aiModalMode && (
        <div className="z-[2000]">
             {/* Fix: Removed spacer hack that used invalid zIndex prop */}
             <div className="relative z-[500]">
                <UniversalAiModal 
                    isOpen={!!aiModalMode} 
                    onClose={() => setAiModalMode(null)} 
                    type="GENERATE_WORD_LESSON"
                    title={aiModalMode === 'ESSAY' ? `Generate Usage Guide: ${currentWord.word}` : `Generate Practice Test: ${currentWord.word}`}
                    description={aiModalMode === 'ESSAY' ? "AI will create a structured usage guide with tables and examples." : "AI will design an interactive test for this word."}
                    initialData={{}}
                    onGeneratePrompt={handleGeneratePrompt}
                    onJsonReceived={handleJsonReceived}
                    closeOnSuccess={true}
                />
             </div>
        </div>
    )}
    </>
  );
};

export default ViewWordModal;
