
import React, { useState, useEffect, useMemo } from 'react';
import { StudyItem, Unit, User } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { createNewWord } from '../../utils/srs';
import { getRefineUnitPrompt } from '../../services/promptService';
import { ReadingEditViewUI } from './ReadingEditView_UI';
import { stringToWordArray } from '../../utils/text';

interface Props {
  user: User;
  unit: Unit;
  allWords: StudyItem[];
  allLibraryTags: string[];
  onCancel: () => void;
  onSave: () => void;
}

const ReadingEditView: React.FC<Props> = ({ user, unit, allWords, allLibraryTags, onCancel, onSave }) => {
  const [editName, setEditName] = useState(unit.name);
  const [editDesc, setEditDesc] = useState(unit.description);
  const [editPath, setEditPath] = useState(unit.path || '/');
  const [editTags, setEditTags] = useState((unit.tags || []).join(', '));
  const [editWords, setEditWords] = useState('');
  const [editEssay, setEditEssay] = useState(unit.essay || '');
  const [editEssayFileLink, setEditEssayFileLink] = useState<Unit['essayFileLink']>(unit.essayFileLink);
  const [editAnswerFileLink, setEditAnswerFileLink] = useState<Unit['answerFileLink']>(unit.answerFileLink);
  const [editAudioLinks, setEditAudioLinks] = useState<string[]>(unit.audioLinks || []);
  const [editComprehensionQuestions, setEditComprehensionQuestions] = useState<{ question: string; answer: string; }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  const wordsByText = useMemo(() => new Map(allWords.map(w => [w.word.toLowerCase().trim(), w])), [allWords]);

  useEffect(() => {
    setEditName(unit.name);
    setEditDesc(unit.description);
    
    // Migration-on-edit logic for path/tags
    if (unit.path === undefined) {
        const legacyTags = unit.tags || [];
        const pathFromTags = legacyTags.find(t => t.startsWith('/'));
        const singleTags = legacyTags.filter(t => !t.startsWith('/'));
        setEditPath(pathFromTags || '/');
        setEditTags(singleTags.join(', '));
    } else {
        setEditPath(unit.path || '/');
        setEditTags((unit.tags || []).join(', '));
    }
    
    setEditEssay(unit.essay || '');
    setEditEssayFileLink(unit.essayFileLink);
    setEditAnswerFileLink(unit.answerFileLink);
    setEditAudioLinks(unit.audioLinks || []);
    setEditComprehensionQuestions(unit.comprehensionQuestions || []);
    if (unit.customVocabString) {
        setEditWords(unit.customVocabString);
    } else {
        const wordsById = new Map<string, StudyItem>(allWords.map(w => [w.id, w]));
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
        const newWordsToCreate: StudyItem[] = [];
        
        for (const token of uniqueBaseWords) {
            const existingWord = wordsByText.get(token);
            if (existingWord) { 
                finalWordIds.push(existingWord.id);
            } else { 
                const isPhrase = token.includes(' ');
                const newWord = await createNewWord(token, '', '', '', '', [], false, false, false, isPhrase, false);
                newWord.userId = user.id;
                newWordsToCreate.push(newWord); 
                finalWordIds.push(newWord.id); 
            }
        }
        
        if (newWordsToCreate.length > 0) await dataStore.bulkSaveWords(newWordsToCreate);
        
        const finalTags = editTags.split(',').map(t => t.trim()).filter(Boolean);
        const finalQuestions = editComprehensionQuestions.filter(q => q.question.trim() && q.answer.trim());
        const hasLinkedReading = !!editEssayFileLink;
        
        const updatedUnit: Unit = { 
            ...unit, 
            name: editName, 
            description: editDesc, 
            essay: editEssay, 
            wordIds: finalWordIds, 
            customVocabString: editWords, 
            path: editPath,
            tags: finalTags, 
            comprehensionQuestions: finalQuestions, 
            readingSourceType: hasLinkedReading ? 'server_file_pair' : 'inline',
            essayFileLink: hasLinkedReading ? editEssayFileLink : undefined,
            answerFileLink: hasLinkedReading ? editAnswerFileLink : undefined,
            audioLinks: editAudioLinks,
            // Preserve existing learned status or default to false, as UI control is removed
            isLearned: unit.isLearned || false, 
            updatedAt: Date.now() 
        };
        await dataStore.saveUnit(updatedUnit);
        onSave();
    } finally { setIsSaving(false); }
  };

  const handleGenerateUnitRefinePrompt = (inputs: { request: string }) => getRefineUnitPrompt(editName, editDesc, editWords, editEssay, inputs.request, user);
  const handleApplyRefinement = async (refined: { name: string; description: string; words: string | string[]; essay: string; comprehensionQuestions?: { question: string; answer: string }[] }) => { 
      setEditName(refined.name); 
      setEditDesc(refined.description); 
      setEditWords(Array.isArray(refined.words) ? refined.words.join('; ') : refined.words); 
      setEditEssay(refined.essay); 
      setEditComprehensionQuestions(refined.comprehensionQuestions || []);
  };

  return (
    <ReadingEditViewUI
      user={user}
      unit={unit}
      allWords={allWords}
      allLibraryTags={allLibraryTags}
      onCancel={onCancel}
      editName={editName}
      setEditName={setEditName}
      editDesc={editDesc}
      setEditDesc={setEditDesc}
      editPath={editPath}
      setEditPath={setEditPath}
      editTags={editTags}
      setEditTags={setEditTags}
      editWords={editWords}
      setEditWords={setEditWords}
      editEssay={editEssay}
      setEditEssay={setEditEssay}
      editEssayFileLink={editEssayFileLink}
      setEditEssayFileLink={setEditEssayFileLink}
      editAnswerFileLink={editAnswerFileLink}
      setEditAnswerFileLink={setEditAnswerFileLink}
      editAudioLinks={editAudioLinks}
      setEditAudioLinks={setEditAudioLinks}
      editComprehensionQuestions={editComprehensionQuestions}
      setEditComprehensionQuestions={setEditComprehensionQuestions}
      isSaving={isSaving}
      handleSaveUnitChanges={handleSaveUnitChanges}
      handleGenerateUnitRefinePrompt={handleGenerateUnitRefinePrompt}
      handleApplyRefinement={handleApplyRefinement}
    />
  );
}

export default ReadingEditView;
