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
import { mergeTestResultsByGroup, normalizeTestResultKeys } from '../../utils/testResultUtils';

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
  const [currentWord, setCurrentWord] = useState<VocabularyItem>({
    ...word,
    lastTestResults: normalizeTestResultKeys(word.lastTestResults)
  });
  const [linkedUnits, setLinkedUnits] = useState<Unit[]>([]);
  const [relatedWords, setRelatedWords] = useState<Record<string, VocabularyItem[]>>({});
  const [relatedByGroup, setRelatedByGroup] = useState<Record<string, VocabularyItem[]>>({});
  const [addingVariant, setAddingVariant] = useState<string | null>(null);
  const [existingVariants, setExistingVariants] = useState<Set<string>>(new Set());
  const [isChallenging, setIsChallenging] = useState(false);
  const [isMimicOpen, setIsMimicOpen] = useState(false);
  const [usageQuery, setUsageQuery] = useState<string | null>(null);

  useEffect(() => {
    const normalizedResults = normalizeTestResultKeys(word.lastTestResults);
    setCurrentWord({ ...word, lastTestResults: normalizedResults });
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
        const incomingResults = normalizeTestResultKeys(results);
        const mergedResults = mergeTestResultsByGroup(updated.lastTestResults, incomingResults);

        // --- Auto-mark missing collocation context items as false if quiz was attempted ---
        if (incomingResults['COLLOCATION_CONTEXT_QUIZ'] === false && currentWord.collocationsArray) {
            currentWord.collocationsArray.forEach(c => {
                const key = `COLLOCATION_CONTEXT_QUIZ:${c.text}`;
                if (!(key in mergedResults)) {
                    mergedResults[key] = false;
                }
            });
        }
        // --- Auto-mark missing paraphrase context items as false if quiz was attempted ---
        if (incomingResults['PARAPHRASE_CONTEXT_QUIZ'] === false && currentWord.paraphrases) {
            currentWord.paraphrases.forEach(p => {
                const key = `PARAPHRASE_CONTEXT_QUIZ:${p.word}`;
                if (!(key in mergedResults)) {
                    mergedResults[key] = false;
                }
            });
        }

        updated.lastTestResults = mergedResults;
    }
    updated.masteryScore = calculateMasteryScore(updated);
    await onUpdate(updated);
    setIsChallenging(false);
    setCurrentWord(updated);
  };

  const handleLocalUpdate = (updatedWord: VocabularyItem) => {
      onUpdate(updatedWord);
      setCurrentWord({
        ...updatedWord,
        lastTestResults: normalizeTestResultKeys(updatedWord.lastTestResults)
      });
  };

  const handleDisplayUsage = (text: string, matchThreshold: number = 1) => {
    // Collect possible text sources (example field + usage essay)
    const sources: string[] = [];
    if ((currentWord as any).example) sources.push((currentWord as any).example);
    if (currentWord.lesson?.essay) sources.push(currentWord.lesson.essay);

    const keyword = text.toLowerCase();

    // Break the query into tokens for fuzzy matching (e.g., "in hindsight, I should have")
    const queryTokens = keyword
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    const foundSentences: string[] = [];

    for (const src of sources) {
      // Handle markdown tables (Usage tab content)
      if (src.includes("|")) {
        const lines = src.split("\n");
        lines.forEach(line => {
          if (!line.includes("|")) return;

          const cells = line.split("|").map(c => c.trim()).filter(Boolean);
          if (cells.length < 2) return;

          const exampleCell = cells[cells.length - 1];

          const exampleLower = exampleCell.toLowerCase();
          const exampleTokens = exampleLower
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(Boolean);

          const overlap = queryTokens.filter(t => exampleTokens.includes(t)).length;
          const ratio = queryTokens.length ? overlap / queryTokens.length : 0;

          // Accept if most words match (e.g., 4/5 tokens)
          if (ratio >= matchThreshold || exampleLower.includes(keyword)) {
            const cleaned = exampleCell.trim();
            if (cleaned && !foundSentences.includes(cleaned)) {
              foundSentences.push(cleaned);
            }
          }
        });
      } else {
        // Normal text essay
        const sentences = src.split(/(?<=[.!?])\s+/);
        sentences.forEach(s => {
          const sentenceLower = s.toLowerCase();
          const sentenceTokens = sentenceLower
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(Boolean);

          const overlap = queryTokens.filter(t => sentenceTokens.includes(t)).length;
          const ratio = queryTokens.length ? overlap / queryTokens.length : 0;

          if (ratio >= matchThreshold || sentenceLower.includes(keyword)) {
            const cleaned = s.trim();
            if (cleaned && !foundSentences.includes(cleaned)) {
              foundSentences.push(cleaned);
            }
          }
        });
      }
    }

    const messages = foundSentences.length > 0 ? foundSentences : [text];

    // Ask StudyBuddy to show the example sentence list
    window.dispatchEvent(
      new CustomEvent('studybuddy-show-message', {
        detail: { text: messages, iconType: 'example' }
      })
    );
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
      displayUsage={handleDisplayUsage}
      usageQuery={usageQuery}
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
