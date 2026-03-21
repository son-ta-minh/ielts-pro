import React, { useState, useEffect } from 'react';
import { VocabularyItem, Unit, ReviewGrade } from '../../app/types';
import { findWordByText, saveWord, getUnitsContainingWord, getAllWords } from '../../app/dataStore';
import { ViewWordModalUI } from './ViewWordModal_UI';
import { createNewWord, calculateMasteryScore } from '../../utils/srs';
import TestModal from '../practice/TestModal';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import { mergeTestResultsByGroup, normalizeTestResultKeys } from '../../utils/testResultUtils';
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

const ViewWordModal: React.FC<Props> = ({ word, onClose, onNavigateToWord, onEditRequest, onUpdate, isViewOnly = false }) => {
  const [currentWord, setCurrentWord] = useState<VocabularyItem>({
    ...word,
    lastTestResults: normalizeTestResultKeys(word.lastTestResults)
  });
  const [isChallenging, setIsChallenging] = useState(false);
  const [isMimicOpen, setIsMimicOpen] = useState(false);

  useEffect(() => {
    const normalizedResults = normalizeTestResultKeys(word.lastTestResults);
    setCurrentWord({ ...word, lastTestResults: normalizedResults });
  }, [word]);
  
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

  const config = getConfig();
  const appliedAccent = config.audio.appliedAccent;

  const handleAskAi = () => {
    const parts = [
      `Word: ${currentWord.word}`,
      currentWord.meaningVi ? `Meaning (Vietnamese): ${currentWord.meaningVi}` : '',
      currentWord.register ? `Register: ${currentWord.register}` : '',
      currentWord.example ? `Examples:\n${currentWord.example}` : '',
      currentWord.collocationsArray?.length
        ? `Collocations:\n${currentWord.collocationsArray
            .filter((item) => !item.isIgnored)
            .map((item) => `- ${item.text}${item.d ? `: ${item.d}` : ''}`)
            .join('\n')}`
        : '',
      currentWord.idiomsList?.length
        ? `Idioms:\n${currentWord.idiomsList
            .filter((item) => !item.isIgnored)
            .map((item) => `- ${item.text}${item.d ? `: ${item.d}` : ''}`)
            .join('\n')}`
        : '',
      currentWord.paraphrases?.length
        ? `Paraphrases:\n${currentWord.paraphrases
            .filter((item) => !item.isIgnored)
            .map((item) => `- ${item.word}${item.context ? `: ${item.context}` : ''}`)
            .join('\n')}`
        : '',
      currentWord.prepositions?.length
        ? `Prepositions:\n${currentWord.prepositions
            .filter((item) => !item.isIgnored)
            .map((item) => `- ${item.prep}${item.usage ? `: ${item.usage}` : ''}`)
            .join('\n')}`
        : '',
      currentWord.wordFamily
        ? `Word family:\n${[
            ...(currentWord.wordFamily.nouns || []).filter((item) => !item.isIgnored).map((item) => `- noun: ${item.word}`),
            ...(currentWord.wordFamily.verbs || []).filter((item) => !item.isIgnored).map((item) => `- verb: ${item.word}`),
            ...(currentWord.wordFamily.adjs || []).filter((item) => !item.isIgnored).map((item) => `- adjective: ${item.word}`),
            ...(currentWord.wordFamily.advs || []).filter((item) => !item.isIgnored).map((item) => `- adverb: ${item.word}`),
          ].join('\n')}`
        : '',
      currentWord.note ? `Private note:\n${currentWord.note}` : '',
    ].filter(Boolean);

    window.dispatchEvent(
      new CustomEvent('studybuddy-chat-request', {
        detail: {
          prompt: `Using only the vocabulary record below, explain this word/item for the learner in a practical English-learning way. Focus on meaning, nuance, usage, register, collocations/patterns, and how to remember or use it well.

Important:
- If any collocation, paraphrase, idiom, or phrase in the record sounds unnatural in English, too narrow in meaning, awkwardly translated, or easy to misunderstand, say that clearly and briefly.
- If a phrase is usable but limited, explain the limitation.
- Prefer warning the learner early instead of pretending every saved phrase is fully natural.
- If the record is incomplete, say what is missing briefly.
- Prefer Vietnamese if helpful for this learner.

Vocabulary record:
${parts.join('\n\n')}`
        }
      })
    );
  };

  const handleAskAiSection = (section: 'wordFamily' | 'collocation' | 'paraphrase' | 'idiom' | 'example') => {
    let sectionData = '';

    if (section === 'wordFamily' && currentWord.wordFamily) {
      const familyLines = [
        ...(currentWord.wordFamily.nouns || []).filter((item) => !item.isIgnored).map((item) => `- noun: ${item.word}`),
        ...(currentWord.wordFamily.verbs || []).filter((item) => !item.isIgnored).map((item) => `- verb: ${item.word}`),
        ...(currentWord.wordFamily.adjs || []).filter((item) => !item.isIgnored).map((item) => `- adjective: ${item.word}`),
        ...(currentWord.wordFamily.advs || []).filter((item) => !item.isIgnored).map((item) => `- adverb: ${item.word}`),
      ];
      sectionData = familyLines.join('\n');
    }

    if (section === 'collocation' && currentWord.collocationsArray?.length) {
      sectionData = currentWord.collocationsArray
        .filter((item) => !item.isIgnored)
        .map((item) => `- ${item.text}${item.d ? `: ${item.d}` : ''}`)
        .join('\n');
    }

    if (section === 'paraphrase' && currentWord.paraphrases?.length) {
      sectionData = currentWord.paraphrases
        .filter((item) => !item.isIgnored)
        .map((item) => `- ${item.word}${item.context ? `: ${item.context}` : ''}`)
        .join('\n');
    }

    if (section === 'idiom' && currentWord.idiomsList?.length) {
      sectionData = currentWord.idiomsList
        .filter((item) => !item.isIgnored)
        .map((item) => `- ${item.text}${item.d ? `: ${item.d}` : ''}`)
        .join('\n');
    }

    if (section === 'example' && currentWord.example) {
      sectionData = currentWord.example;
    }

    if (!sectionData.trim()) return;

    const sectionLabelMap = {
      wordFamily: 'word family',
      collocation: 'collocations',
      paraphrase: 'paraphrases',
      idiom: 'idioms',
      example: 'examples'
    } as const;

    window.dispatchEvent(
      new CustomEvent('studybuddy-chat-request', {
        detail: {
          prompt: `Explain this ${sectionLabelMap[section]} section in clear practical English for an English learner.

Rules:
- Your response must be 100% in English.
- Use only the section data below.
- If any phrase/collocation/paraphrase/idiom sounds unnatural, too narrow, awkwardly translated, or easy to misunderstand, say that clearly.
- If something is correct but limited in use, explain the limitation.
- Be concise but useful.

Section data:
Headword: ${currentWord.word}

${sectionLabelMap[section]}:
${sectionData}`
        }
      })
    );
  };

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
      onNavigateToWord={onNavigateToWord}
      appliedAccent={appliedAccent}
      isViewOnly={isViewOnly}
      onAskAiRequest={handleAskAi}
      onAskAiSectionRequest={handleAskAiSection}
    />
    </>
  );
};

export default ViewWordModal;
