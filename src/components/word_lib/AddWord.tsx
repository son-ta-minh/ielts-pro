import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { generateWordDetails } from '../../services/geminiService';
import { createNewWord } from '../../utils/srs';
import { findWordByText, bulkSaveWords, getUnitsByUserId, saveUnit } from '../../app/db';
import { VocabularyItem, Unit, WordFamilyMember, PrepositionPattern, WordQuality } from '../../app/types';
import { parsePrepositionPatterns, normalizeAiResponse } from '../../utils/vocabUtils';
import { AddWordUI } from './AddWord_UI';
import { useToast } from '../../contexts/ToastContext';
import { getConfig } from '../../app/settingsManager';
import { stringToWordArray } from '../../utils/text';

interface Props {
  onWordsAdded: () => void;
  userId: string;
  isArchived?: boolean;
  nativeLanguage?: string;
}

const generateUnitId = () => 'unit-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

export type WordTypeOption = 'vocab' | 'idiom' | 'phrasal' | 'collocation' | 'phrase';

const AddWord: React.FC<Props> = ({ onWordsAdded, userId, isArchived = false, nativeLanguage = 'Vietnamese' }) => {
  const [inputWords, setInputWords] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingWordsInfo, setExistingWordsInfo] = useState<string[]>([]);
  const [lastAddedItems, setLastAddedItems] = useState<{ word: string, status: 'new' | 'linked' }[]>([]);
  
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitInput, setUnitInput] = useState('');
  const [suggestedUnits, setSuggestedUnits] = useState<Unit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedUnitForUpdate, setSelectedUnitForUpdate] = useState<Unit | null>(null);
  const unitComboboxRef = useRef<HTMLDivElement>(null);

  // New state for Word Type
  const [wordType, setWordType] = useState<WordTypeOption>('vocab');

  const { showToast } = useToast();
  const aiEnabled = getConfig().ai.enableGeminiApi;

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
    return stringToWordArray(inputWords);
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
    setSelectedUnitForUpdate(null);
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
        const wordsForAi: string[] = [];
        const skippedWordsForSummary: { word: string, status: 'linked' }[] = [];
        const idsToLinkToUnit: string[] = [];

        // Pre-flight check for duplicates
        for (const word of wordsToProcess) {
            const existingItem = await findWordByText(userId, word);
            if (existingItem) {
                skippedWordsForSummary.push({ word: word, status: 'linked' });
                idsToLinkToUnit.push(existingItem.id);
            } else {
                wordsForAi.push(word);
            }
        }

        let aiMap = new Map<string, any>();
        if (withAI && wordsForAi.length > 0) {
            const rawResults = await generateWordDetails(wordsForAi, nativeLanguage);
            rawResults.forEach(r => {
                const normalized = normalizeAiResponse(r);
                const key = (normalized.original || normalized.word || '').toLowerCase();
                if (key && !aiMap.has(key)) aiMap.set(key, normalized);
            });
        }
        
        const newItemsToCreate: VocabularyItem[] = [];
        const processedHeadwords = new Set<string>();

        // Process only the new words
        for (const originalWord of wordsForAi) {
            const aiDetails = aiMap.get(originalWord.toLowerCase());
            const headword = (aiDetails?.headword || originalWord).trim();
            
            if (!headword || processedHeadwords.has(headword.toLowerCase())) continue;

            const existingItem = await findWordByText(userId, headword);

            if (existingItem) {
                // This case handles when AI suggests a headword that already exists.
                idsToLinkToUnit.push(existingItem.id);
                skippedWordsForSummary.push({ word: originalWord, status: 'linked' });
            } else {
                if (aiDetails?.wordFamily?.advs) {
                    aiDetails.wordFamily.advs = aiDetails.wordFamily.advs.map((adv: WordFamilyMember) => ({ ...adv, isIgnored: true }));
                }
                
                let prepositions: PrepositionPattern[] | undefined = undefined;
                if (aiDetails?.prepositionsArray && Array.isArray(aiDetails.prepositionsArray) && aiDetails.prepositionsArray.length > 0) {
                    prepositions = aiDetails.prepositionsArray;
                } else if (aiDetails?.prepositionString) {
                    prepositions = parsePrepositionPatterns(aiDetails.prepositionString);
                }

                // Determine final flags based on User Selection OR AI detection
                // If user selected 'vocab' (auto/default), trust AI. 
                // If user selected a specific type, override AI/default.
                const isIdiom = wordType === 'idiom' || (wordType === 'vocab' && !!aiDetails?.isIdiom);
                const isPhrasalVerb = wordType === 'phrasal' || (wordType === 'vocab' && !!aiDetails?.isPhrasalVerb);
                const isCollocation = wordType === 'collocation' || (wordType === 'vocab' && !!aiDetails?.isCollocation);
                const isStandardPhrase = wordType === 'phrase' || (wordType === 'vocab' && !!aiDetails?.isStandardPhrase);
                
                // If the input was spaced and no specific type was found/selected, treat as phrase if it looks like one? 
                // Keeping it simple: rely on AI or explicit user selection.

                const newItem = {
                    ...createNewWord(
                        headword, 
                        aiDetails?.ipa || '', 
                        aiDetails?.meaningVi || '', 
                        aiDetails?.example || '', 
                        '', 
                        aiDetails?.tags || [], 
                        isIdiom, 
                        !!aiDetails?.needsPronunciationFocus, 
                        isPhrasalVerb, 
                        isCollocation, 
                        isStandardPhrase, 
                        isArchived
                    ), 
                    prepositions, 
                    isIrregular: !!aiDetails?.isIrregular, 
                    v2: aiDetails?.v2, 
                    v3: aiDetails?.v3, 
                    wordFamily: aiDetails?.wordFamily, 
                    ipaMistakes: aiDetails?.ipaMistakes,
                    collocationsArray: aiDetails?.collocationsArray,
                    collocations: aiDetails?.collocations || undefined,
                    idioms: aiDetails?.idioms || undefined,
                    idiomsList: aiDetails?.idiomsList,
                    paraphrases: aiDetails?.paraphrases,
                    userId,
                    quality: withAI ? WordQuality.REFINED : WordQuality.RAW // Override quality from createNewWord
                };
                
                if (!newItem.collocationsArray && newItem.collocations) {
                    newItem.collocationsArray = newItem.collocations.split('\n').map(t => ({ text: t.trim(), isIgnored: false })).filter(c => c.text);
                }
                if (!newItem.idiomsList && newItem.idioms) {
                    newItem.idiomsList = newItem.idioms.split('\n').map(t => ({ text: t.trim(), isIgnored: false })).filter(c => c.text);
                }

                newItemsToCreate.push(newItem);
            }
            processedHeadwords.add(headword.toLowerCase());
        }

        if (newItemsToCreate.length > 0) {
            await bulkSaveWords(newItemsToCreate);
            idsToLinkToUnit.push(...newItemsToCreate.map(item => item.id));
        }

        let unitAssigned = false, assignedUnitName = '';
        if (idsToLinkToUnit.length > 0 && unitInput.trim()) {
          if (selectedUnitForUpdate) {
              const updatedUnit = {...selectedUnitForUpdate, wordIds: Array.from(new Set([...selectedUnitForUpdate.wordIds, ...idsToLinkToUnit])), updatedAt: Date.now()};
              await saveUnit(updatedUnit);
              unitAssigned = true; assignedUnitName = updatedUnit.name;
          } else if (isCreatingNewUnit) {
              const newUnit: Unit = { id: generateUnitId(), userId, name: unitInput.trim(), description: '', wordIds: idsToLinkToUnit, createdAt: Date.now(), updatedAt: Date.now() };
              await saveUnit(newUnit);
              unitAssigned = true; assignedUnitName = newUnit.name;
              await fetchUnits();
          }
        }
        
        if (newItemsToCreate.length > 0 || unitAssigned) onWordsAdded();

        const newItemsForSummary = newItemsToCreate.map(item => ({ word: item.word, status: 'new' as const }));
        setLastAddedItems([...newItemsForSummary, ...skippedWordsForSummary]);

        let successMessage = '';
        if (newItemsToCreate.length > 0) successMessage += `Added ${newItemsToCreate.length} new item(s).`;
        if (skippedWordsForSummary.length > 0) {
            successMessage += `${successMessage ? ' ' : ''}Skipped ${skippedWordsForSummary.length} duplicate(s).`;
        }
        if (unitAssigned) {
            successMessage += ` All items linked to unit "${assignedUnitName}".`;
        }

        if (!successMessage) successMessage = 'No new words to add. Duplicates were linked to unit if selected.';
        showToast(successMessage, 'success', 5000);

        setInputWords('');
        setUnitInput('');
        setSelectedUnitForUpdate(null);
        setWordType('vocab'); // Reset type to default

    } catch (e: any) {
        console.error(e);
        setError(e.message || "An error occurred during processing.");
    } finally {
        setIsLoading(false);
        setIsSaving(false);
    }
  };
  
  const infoText = existingWordsInfo.length > 0 
    ? `NOTE: ${existingWordsInfo.join(', ')} already exist. ${unitInput ? 'They will only be linked to the selected unit.' : 'Select a unit to link them.'}` 
    : null;

  return <AddWordUI
    isArchived={isArchived}
    error={error}
    setError={setError}
    inputWords={inputWords}
    setInputWords={setInputWords}
    infoText={infoText}
    wordsToProcessCount={wordsToProcess.length}
    unitComboboxRef={unitComboboxRef}
    unitInput={unitInput}
    handleUnitInputChange={handleUnitInputChange}
    setShowSuggestions={setShowSuggestions}
    isCreatingNewUnit={isCreatingNewUnit}
    showSuggestions={showSuggestions}
    suggestedUnits={suggestedUnits}
    handleSuggestionClick={handleSuggestionClick}
    handleAdd={handleAdd}
    isLoading={isLoading}
    isSaving={isSaving}
    lastAddedItems={lastAddedItems}
    aiEnabled={aiEnabled}
  />;
};

export default AddWord;
