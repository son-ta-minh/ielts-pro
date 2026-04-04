import React, { useState, useEffect, useRef } from 'react';
import { VocabularyItem, Unit, ReviewGrade, WordFamilyGroup, ParaphraseOption } from '../../app/types';
import { findWordByText, saveWord, getUnitsContainingWord, getAllWords } from '../../app/dataStore';
import { ViewWordModalUI } from './ViewWordModal_UI';
import { createNewWord, calculateMasteryScore } from '../../utils/srs';
import TestModal from '../practice/TestModal';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import { mergeTestResultsByGroup, normalizeTestResultKeys } from '../../utils/testResultUtils';
import { getConfig, getServerUrl, getStudyBuddyAiUrl } from '../../app/settingsManager';
import { StudyBuddyTargetSection } from '../../utils/studyBuddyChatUtils';
import { clearStaleWordFamilyGroupLink } from '../../utils/wordFamilyGroupLinking';
import * as db from '../../app/db';
import { useToast } from '../../contexts/ToastContext';

interface ScannedParaphraseItem extends ParaphraseOption {
  sourceWord?: string;
}

const normalizeParaphraseTone = (tone?: string): ParaphraseOption['tone'] => {
  if (tone === 'academic' || tone === 'casual' || tone === 'neutral') {
    return tone;
  }
  return 'neutral';
};

const getParaphraseToneFromWordRegister = (
  register?: VocabularyItem['register']
): ParaphraseOption['tone'] => {
  return normalizeParaphraseTone(register);
};

const normalizeWordParaphrases = (item: VocabularyItem): VocabularyItem => ({
  ...item,
  paraphrases: (item.paraphrases || []).map((paraphrase) => ({
    ...paraphrase,
    tone: normalizeParaphraseTone(paraphrase.tone)
  }))
});

const normalizeComparableText = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface Props {
  word: VocabularyItem;
  onClose: () => void;
  onNavigateToWord: (word: VocabularyItem) => void;
  onOpenWordFamilyGroup?: (groupId: string) => void;
  onEditRequest: (word: VocabularyItem) => void;
  onGainXp: (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number, tested: number }) => Promise<number>;
  onUpdate: (word: VocabularyItem) => void;
  isViewOnly?: boolean;
  onStartReviewSession?: (word: VocabularyItem) => void;
}

const ViewWordModal: React.FC<Props> = ({ word, onClose, onNavigateToWord, onOpenWordFamilyGroup, onEditRequest, onUpdate, isViewOnly = false, onStartReviewSession }) => {
  const { showToast } = useToast();
  const [currentWord, setCurrentWord] = useState<VocabularyItem>({
    ...normalizeWordParaphrases(word),
    lastTestResults: normalizeTestResultKeys(word.lastTestResults)
  });
  const [currentWordFamilyGroup, setCurrentWordFamilyGroup] = useState<WordFamilyGroup | null>(null);
  const [isChallenging, setIsChallenging] = useState(false);
  const [isMimicOpen, setIsMimicOpen] = useState(false);
  const [scannedParaphrases, setScannedParaphrases] = useState<ScannedParaphraseItem[]>([]);
  const [isScanningParaphrases, setIsScanningParaphrases] = useState(false);
  const [isSettingDisplay, setIsSettingDisplay] = useState(false);
  const [scanParaphraseResultCount, setScanParaphraseResultCount] = useState<number | null>(null);
  const scanParaphraseResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const normalizedResults = normalizeTestResultKeys(word.lastTestResults);
    setCurrentWord({ ...normalizeWordParaphrases(word), lastTestResults: normalizedResults });
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
      console.log('[InlineReview][ViewWordModal] clearStaleWordFamilyGroupLink:start', {
        word: word.word,
        id: word.id,
        wordFamilyGroupId: word.wordFamilyGroupId || null
      });
      const cleaned = await clearStaleWordFamilyGroupLink({
        ...normalizeWordParaphrases(word),
        lastTestResults: normalizeTestResultKeys(word.lastTestResults)
      });
      if (!isActive) return;
      console.log('[InlineReview][ViewWordModal] clearStaleWordFamilyGroupLink:done', {
        word: word.word,
        id: word.id,
        before: word.wordFamilyGroupId || null,
        after: cleaned.wordFamilyGroupId || null
      });
      setCurrentWord(cleaned);
      if ((word.wordFamilyGroupId || null) !== (cleaned.wordFamilyGroupId || null)) {
        console.log('[InlineReview][ViewWordModal] saving cleaned word after stale link removal', {
          word: cleaned.word,
          id: cleaned.id,
          before: word.wordFamilyGroupId || null,
          after: cleaned.wordFamilyGroupId || null
        });
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
        ...normalizeWordParaphrases(updatedWord),
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
          tone: getParaphraseToneFromWordRegister(sourceWord.register),
          context: sourceWord.example || sourceWord.meaningVi || '',
          isIgnored: false,
          sourceWord: sourceWord.word
        });

        (sourceWord.paraphrases || [])
          .filter((item) => !item.isIgnored && item.word.trim())
          .forEach((item) => {
            const linkedWord = libraryMap.get(item.word.trim().toLowerCase());

            addCandidate({
              word: item.word,
              tone: linkedWord?.register === 'academic' || linkedWord?.register === 'casual' || linkedWord?.register === 'neutral'
                ? linkedWord.register
                : normalizeParaphraseTone(item.tone),
              context: item.context || sourceWord.example || sourceWord.meaningVi || '',
              isIgnored: false,
              sourceWord: sourceWord.word
            });

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
          tone: normalizeParaphraseTone(item.tone),
          context: item.context,
          isIgnored: false
        }
      ],
      updatedAt: Date.now()
    };

    handleLocalUpdate(updatedWord);
    setScannedParaphrases((prev) => prev.filter((entry) => entry.word.trim().toLowerCase() !== normalizedWord));
  };

  const cleanDisplayText = (value: string): string => String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*[-*•]+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stripIpaDelimiters = (value?: string | null): string => String(value || '').replace(/^\/+|\/+$/g, '').trim();
  const formatPhraseIpa = (parts: Array<string | null | undefined>): string | undefined => {
    const cleaned = parts
      .map((part) => stripIpaDelimiters(part))
      .filter(Boolean);
    if (cleaned.length === 0) return undefined;
    return `/${cleaned.join(' ')}/`;
  };
  const tokenizeDisplayForIpa = (value: string): string[] =>
    String(value || '')
      .split(/\s+/)
      .map((token) => token.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
      .filter(Boolean);
  const fetchCambridgeTokenIpa = async (token: string): Promise<{ ipaUs?: string; ipaUk?: string } | null> => {
    const response = await fetch(`${getServerUrl(config)}/api/lookup/cambridge/simple?word=${encodeURIComponent(token)}`, {
      cache: 'no-store'
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    if (!payload?.exists || !Array.isArray(payload.pronunciations)) return null;

    const pronunciation = payload.pronunciations.find((item: any) => item?.ipaUs || item?.ipaUk);
    if (!pronunciation) return null;

    const ipaUs = stripIpaDelimiters(pronunciation.ipaUs || '');
    const ipaUk = stripIpaDelimiters(pronunciation.ipaUk || '');

    return {
      ipaUs: ipaUs ? `/${ipaUs}/` : undefined,
      ipaUk: ipaUk ? `/${ipaUk}/` : undefined
    };
  };

  const resolveDisplayMetadata = async (baseWord: VocabularyItem, displayText: string): Promise<Pick<VocabularyItem, 'displayMeaning' | 'displayIPA'>> => {
    if (!displayText || normalizeComparableText(displayText) === normalizeComparableText(baseWord.word)) {
      return { displayMeaning: '', displayIPA: '' };
    }

    const matchedCollocation = (baseWord.collocationsArray || []).find((entry) =>
      normalizeComparableText(entry.text || '') === normalizeComparableText(displayText)
    );

    let displayMeaning = String(matchedCollocation?.d || '').trim();
    let displayIPA = '';
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;

    if (online) {
      const tokens = tokenizeDisplayForIpa(displayText);
      if (tokens.length > 0) {
        try {
          const tokenResults = await Promise.all(tokens.map((token) => fetchCambridgeTokenIpa(token)));
          displayIPA = formatPhraseIpa(tokenResults.map((entry) => entry?.ipaUs))
            || formatPhraseIpa(tokenResults.map((entry) => entry?.ipaUk || entry?.ipaUs))
            || '';
        } catch {}
      }

      if (!displayMeaning) {
        try {
          const translationRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(displayText)}&langpair=en|vi`);
          const translationData = await translationRes.json().catch(() => null);
          displayMeaning = String(translationData?.responseData?.translatedText || '').trim();
        } catch {}
      }
    }

    return {
      displayMeaning,
      displayIPA
    };
  };

  const requestDisplaySuggestion = async (): Promise<string> => {
    const config = getConfig();
    const activeCollocations = (currentWord.collocationsArray || [])
      .filter((item) => !item.isIgnored && item.text.trim())
      .map((item) => item.text.trim());
    const response = await fetch(getStudyBuddyAiUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are StudyBuddy. Return exactly one display phrase only. No bullet, no explanation, no quotes, no markdown.'
          },
          {
            role: 'user',
            content: [
              `Headword: ${currentWord.word}`,
              activeCollocations.length > 0 ? `Collocations: ${activeCollocations.join('; ')}` : '',
              '',
              'Suggest the single best display phrase for this vocabulary item from the provided collocations if applicable.',
              'Prioritize: naturalness, broad coverage, frequent real usage, strong learning value, and high IELTS band usefulness.',
              'Prefer a short phrase that best represents how this word should be shown to the learner.',
              'Do not return the headword itself as the display if there are better alternatives in the collocations or new collocation that you suggest',
              'Return only the final display phrase.'
            ].filter(Boolean).join('\n')
          }
        ],
        searchEnabled: false,
        temperature: 0.2,
        top_p: 0.85,
        repetition_penalty: 1.15,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`StudyBuddy request failed (${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    const rawText = payload?.choices?.[0]?.message?.content;
    const cleaned = cleanDisplayText(rawText || '');
    if (!cleaned) {
      throw new Error('StudyBuddy returned empty display text.');
    }
    return cleaned;
  };

  const handleResetMastery = async () => {
    const updatedWord: VocabularyItem = {
      ...currentWord,
      lastTestResults: {},
      masteryScore: calculateMasteryScore({
        ...currentWord,
        lastTestResults: {}
      }),
      updatedAt: Date.now()
    };

    await onUpdate(updatedWord);
    setCurrentWord(updatedWord);
  };

  const handleSetDisplay = async (selectedText?: string) => {
    const normalizedSelectedText = cleanDisplayText(selectedText || '');
    if (!normalizedSelectedText && !(currentWord.collocationsArray || []).some((item) => !item.isIgnored && item.text.trim())) {
      showToast('No selected text or collocations available for display.', 'info');
      return;
    }

    setIsSettingDisplay(true);
    try {
      const nextDisplay = normalizedSelectedText || await requestDisplaySuggestion();
      let updatedWord: VocabularyItem = {
        ...currentWord,
        display: nextDisplay,
        displayMeaning: '',
        displayIPA: '',
        updatedAt: Date.now()
      };

      try {
        const resolved = await resolveDisplayMetadata(updatedWord, nextDisplay);
        updatedWord = {
          ...updatedWord,
          ...resolved,
          updatedAt: Date.now()
        };
      } catch (error) {
        console.error('Failed to resolve display metadata before save', error);
      }

      await onUpdate(updatedWord);
      setCurrentWord(updatedWord);
      showToast('Display text updated.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to set display text.', 'error');
    } finally {
      setIsSettingDisplay(false);
    }
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

  const handleVerifyWord = () => {
    dispatchAskAiTarget('verifyData', 'WordViewModal top Verify Word');
  };

  const handleAskAiSection = (section: 'wordFamily' | 'collocation' | 'paraphrase' | 'idiom' | 'example' | 'preposition') => {
    dispatchAskAiTarget(section, `WordViewModal ${section}`);
  };

  return (
    <>
    {isChallenging && <TestModal word={currentWord} onComplete={handleChallengeComplete} onClose={() => setIsChallenging(false)} />}
    {isMimicOpen && (
        <SimpleMimicModal target={(currentWord.display || '').trim() || currentWord.word} onClose={() => setIsMimicOpen(false)} />
    )}
    <ViewWordModalUI
      word={currentWord}
      wordFamilyGroup={currentWordFamilyGroup}
      onOpenWordFamilyGroupRequest={onOpenWordFamilyGroup}
      onClose={onClose}
      onChallengeRequest={() => {
        if (onStartReviewSession) {
          onStartReviewSession(currentWord);
          return;
        }
        setIsChallenging(true);
      }}
      onMimicRequest={() => setIsMimicOpen(true)}
      onEditRequest={() => onEditRequest(currentWord)}
      onResetMasteryRequest={handleResetMastery}
      onSetDisplayRequest={handleSetDisplay}
      isSettingDisplay={isSettingDisplay}
      onUpdate={handleLocalUpdate}
      onNavigateToWord={onNavigateToWord}
      libraryWordSet={libraryWordSet}
      libraryWords={libraryWords}
      scannedParaphrases={scannedParaphrases}
      isScanningParaphrases={isScanningParaphrases}
      scanParaphraseResultCount={scanParaphraseResultCount}
      onScanParaphrases={handleScanParaphrases}
      onAddScannedParaphrase={handleAddScannedParaphrase}
      appliedAccent={appliedAccent}
      isViewOnly={isViewOnly}
      onAskAiRequest={handleAskAi}
      onVerifyWordRequest={handleVerifyWord}
      onAskAiSectionRequest={handleAskAiSection}
    />
    </>
  );
};

export default ViewWordModal;
