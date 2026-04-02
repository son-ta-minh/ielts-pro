import React, { useState, useEffect, useRef } from 'react';
import { VocabularyItem, Unit, ReviewGrade, WordFamilyGroup, ParaphraseOption } from '../../app/types';
import { findWordByText, saveWord, getUnitsContainingWord, getAllWords } from '../../app/dataStore';
import { ViewWordModalUI } from './ViewWordModal_UI';
import { createNewWord, calculateMasteryScore } from '../../utils/srs';
import TestModal from '../practice/TestModal';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import { mergeTestResultsByGroup, normalizeTestResultKeys } from '../../utils/testResultUtils';
import { getConfig } from '../../app/settingsManager';
import { StudyBuddyTargetSection } from '../../utils/studyBuddyChatUtils';
import { clearStaleWordFamilyGroupLink } from '../../utils/wordFamilyGroupLinking';
import * as db from '../../app/db';

interface ScannedParaphraseItem extends ParaphraseOption {
  sourceWord?: string;
}

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onNavigateToWord: (word: VocabularyItem) => void;
  onOpenWordFamilyGroup?: (groupId: string) => void;
  onEditRequest: (word: VocabularyItem) => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number, tested: number }) => Promise<number>;
  onUpdate: (word: VocabularyItem) => void;
  isViewOnly?: boolean;
}

const ViewWordModal: React.FC<Props> = ({ word, onClose, onNavigateToWord, onOpenWordFamilyGroup, onEditRequest, onUpdate, isViewOnly = false }) => {
  const [currentWord, setCurrentWord] = useState<VocabularyItem>({
    ...word,
    lastTestResults: normalizeTestResultKeys(word.lastTestResults)
  });
  const [currentWordFamilyGroup, setCurrentWordFamilyGroup] = useState<WordFamilyGroup | null>(null);
  const [isChallenging, setIsChallenging] = useState(false);
  const [isMimicOpen, setIsMimicOpen] = useState(false);
  const [scannedParaphrases, setScannedParaphrases] = useState<ScannedParaphraseItem[]>([]);
  const [isScanningParaphrases, setIsScanningParaphrases] = useState(false);
  const [scanParaphraseResultCount, setScanParaphraseResultCount] = useState<number | null>(null);
  const scanParaphraseResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const normalizedResults = normalizeTestResultKeys(word.lastTestResults);
    setCurrentWord({ ...word, lastTestResults: normalizedResults });
    setScannedParaphrases([]);
    setScanParaphraseResultCount(null);
  }, [word]);

  useEffect(() => {
    return () => {
      if (scanParaphraseResetTimerRef.current) {
        window.clearTimeout(scanParaphraseResetTimerRef.current);
        scanParaphraseResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const run = async () => {
      const cleaned = await clearStaleWordFamilyGroupLink({
        ...word,
        lastTestResults: normalizeTestResultKeys(word.lastTestResults)
      });
      if (!isActive) return;
      setCurrentWord(cleaned);
      if ((word.wordFamilyGroupId || null) !== (cleaned.wordFamilyGroupId || null)) {
        await saveWord(cleaned);
      }
    };
    void run();
    return () => {
      isActive = false;
    };
  }, [word]);

  useEffect(() => {
    let isActive = true;
    const run = async () => {
      const groupId = currentWord.wordFamilyGroupId || null;
      if (!groupId) {
        if (isActive) setCurrentWordFamilyGroup(null);
        return;
      }

      const groups = await db.getWordFamilyGroupsByUserId(currentWord.userId);
      const matchedGroup = groups.find((group) => group.id === groupId) || null;
      if (isActive) {
        setCurrentWordFamilyGroup(matchedGroup);
      }
    };
    void run();
    return () => {
      isActive = false;
    };
  }, [currentWord.userId, currentWord.wordFamilyGroupId]);
  
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
  const libraryWords = getAllWords().filter((item) => item.userId === currentWord.userId);
  const libraryWordSet = new Set(
    libraryWords.map((item) => item.word.trim().toLowerCase())
  );

  const handleScanParaphrases = () => {
    setIsScanningParaphrases(true);
    setScanParaphraseResultCount(null);
    if (scanParaphraseResetTimerRef.current) {
      window.clearTimeout(scanParaphraseResetTimerRef.current);
      scanParaphraseResetTimerRef.current = null;
    }

    try {
      const normalizedHeadword = currentWord.word.trim().toLowerCase();
      const existingWords = new Set(
        [
          normalizedHeadword,
          ...(currentWord.paraphrases || []).map((item) => item.word.trim().toLowerCase())
        ].filter(Boolean)
      );
      const libraryMap = new Map<string, VocabularyItem>();
      libraryWords.forEach((item) => {
        const normalizedWord = item.word.trim().toLowerCase();
        if (normalizedWord) libraryMap.set(normalizedWord, item);
      });

      const visited = new Set<string>();
      const resultMap = new Map<string, ScannedParaphraseItem>();

      const addCandidate = (candidate: ScannedParaphraseItem) => {
        const normalizedWord = candidate.word.trim().toLowerCase();
        if (!normalizedWord || existingWords.has(normalizedWord)) return;
        if (!resultMap.has(normalizedWord)) {
          resultMap.set(normalizedWord, candidate);
        }
      };

      const recursiveScan = (sourceWord: VocabularyItem) => {
        const normalizedSource = sourceWord.word.trim().toLowerCase();
        if (!normalizedSource || visited.has(normalizedSource)) return;
        visited.add(normalizedSource);

        addCandidate({
          word: sourceWord.word,
          tone: 'synonym',
          context: sourceWord.example || sourceWord.meaningVi || '',
          isIgnored: false,
          sourceWord: sourceWord.word
        });

        (sourceWord.paraphrases || [])
          .filter((item) => !item.isIgnored && item.word.trim())
          .forEach((item) => {
            addCandidate({
              word: item.word,
              tone: item.tone || 'synonym',
              context: item.context || sourceWord.example || sourceWord.meaningVi || '',
              isIgnored: false,
              sourceWord: sourceWord.word
            });

            const linkedWord = libraryMap.get(item.word.trim().toLowerCase());
            if (linkedWord) {
              recursiveScan(linkedWord);
            }
          });
      };

      libraryWords.forEach((libraryWord) => {
        const hasCurrentAsParaphrase = (libraryWord.paraphrases || []).some(
          (item) => !item.isIgnored && item.word.trim().toLowerCase() === normalizedHeadword
        );
        if (hasCurrentAsParaphrase) {
          recursiveScan(libraryWord);
        }
      });

      const results = Array.from(resultMap.values());
      setScannedParaphrases(results);
      setScanParaphraseResultCount(results.length);
      scanParaphraseResetTimerRef.current = window.setTimeout(() => {
        setScanParaphraseResultCount(null);
        scanParaphraseResetTimerRef.current = null;
      }, 5000);
    } finally {
      setIsScanningParaphrases(false);
    }
  };

  const handleAddScannedParaphrase = (item: ScannedParaphraseItem) => {
    const normalizedWord = item.word.trim().toLowerCase();
    if (!normalizedWord) return;

    const currentParaphrases = currentWord.paraphrases || [];
    if (currentParaphrases.some((entry) => entry.word.trim().toLowerCase() === normalizedWord)) {
      setScannedParaphrases((prev) => prev.filter((entry) => entry.word.trim().toLowerCase() !== normalizedWord));
      return;
    }

    const updatedWord: VocabularyItem = {
      ...currentWord,
      paraphrases: [
        ...currentParaphrases,
        {
          word: item.word,
          tone: item.tone,
          context: item.context,
          isIgnored: false
        }
      ],
      updatedAt: Date.now()
    };

    handleLocalUpdate(updatedWord);
    setScannedParaphrases((prev) => prev.filter((entry) => entry.word.trim().toLowerCase() !== normalizedWord));
  };

  const dispatchAskAiTarget = (section: StudyBuddyTargetSection, source: string) => {
    window.dispatchEvent(
      new CustomEvent('studybuddy-chat-request', {
        detail: {
          targetWord: currentWord.word,
          targetData: currentWord,
          targetSection: section,
          targetSource: source
        }
      })
    );
  };

  const handleAskAi = () => {
    dispatchAskAiTarget('coreUsage', 'WordViewModal top Ask AI');
  };

  const handleAskAiSection = (section: 'wordFamily' | 'collocation' | 'paraphrase' | 'idiom' | 'example' | 'preposition') => {
    dispatchAskAiTarget(section, `WordViewModal ${section}`);
  };

  return (
    <>
    {isChallenging && <TestModal word={currentWord} onComplete={handleChallengeComplete} onClose={() => setIsChallenging(false)} />}
    {isMimicOpen && (
        <SimpleMimicModal target={currentWord.word} onClose={() => setIsMimicOpen(false)} />
    )}
    <ViewWordModalUI
      word={currentWord}
      wordFamilyGroup={currentWordFamilyGroup}
      onOpenWordFamilyGroupRequest={onOpenWordFamilyGroup}
      onClose={onClose}
      onChallengeRequest={() => setIsChallenging(true)}
      onMimicRequest={() => setIsMimicOpen(true)}
      onEditRequest={() => onEditRequest(currentWord)}
      onUpdate={handleLocalUpdate}
      onNavigateToWord={onNavigateToWord}
      libraryWordSet={libraryWordSet}
      scannedParaphrases={scannedParaphrases}
      isScanningParaphrases={isScanningParaphrases}
      scanParaphraseResultCount={scanParaphraseResultCount}
      onScanParaphrases={handleScanParaphrases}
      onAddScannedParaphrase={handleAddScannedParaphrase}
      appliedAccent={appliedAccent}
      isViewOnly={isViewOnly}
      onAskAiRequest={handleAskAi}
      onAskAiSectionRequest={handleAskAiSection}
    />
    </>
  );
};

export default ViewWordModal;
