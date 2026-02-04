
import React, { useState, useEffect } from 'react';
import { ComparisonGroup, User } from '../../app/types';
import * as db from '../../app/db';
import { useToast } from '../../contexts/ToastContext';
import { getComparisonPrompt } from '../../services/promptService';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { ComparisonEditViewUI } from './ComparisonEditView_UI';

interface Props {
    group: ComparisonGroup;
    onSave: (group: ComparisonGroup) => void;
    onCancel: () => void;
    user: User;
}

export const ComparisonEditView: React.FC<Props> = ({ group, onSave, onCancel, user }) => {
    const [name, setName] = useState(group.name);
    const [wordsInput, setWordsInput] = useState(group.words.join('\n'));
    const [path, setPath] = useState(group.path || '/');
    const [tagsInput, setTagsInput] = useState((group.tags || []).join(', '));
    // Store comparisonData in state so we can delete rows
    const [comparisonData, setComparisonData] = useState(group.comparisonData || []);
    
    const [isSaving, setIsSaving] = useState(false);
    
    // AI State
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
      // Migration-on-edit: Split legacy tags if new fields aren't used yet.
      if (group.path === undefined && group.tags) {
        const legacyTags = group.tags || [];
        const pathFromTags = legacyTags.find(t => t.startsWith('/'));
        const singleTags = legacyTags.filter(t => !t.startsWith('/'));
        
        setPath(pathFromTags || '/');
        setTagsInput(singleTags.join(', '));
      } else {
        // New data structure exists, use it directly.
        setPath(group.path || '/');
        setTagsInput((group.tags || []).join(', '));
      }
      setComparisonData(group.comparisonData || []);
    }, [group]);

    const handleSave = async () => {
        setIsSaving(true);
        const finalWords = wordsInput.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean);
        const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        
        // Auto-add 'Comparison' tag if missing
        if (!finalTags.some(t => t.toLowerCase() === 'comparison')) {
            finalTags.push('Comparison');
        }
        
        // Sync comparisonData with finalWords: keep only data for words present in input, or allow disjoint?
        // Better to trust the explicit deletion. If user deleted row but kept word in input, we keep word in input.
        // If user removed word from input, we remove row.
        // But for this "Save", we should prioritize the explicit state.
        
        const updatedGroup: ComparisonGroup = {
            ...group,
            name,
            words: finalWords,
            path: path.trim(),
            tags: finalTags,
            comparisonData: comparisonData, // Use the state which allows row deletion
            updatedAt: Date.now()
        };
        
        await db.saveComparisonGroup(updatedGroup);
        onSave(updatedGroup);
        setIsSaving(false);
    };

    const handleDeleteRow = (index: number) => {
        const itemToDelete = comparisonData[index];
        const newData = comparisonData.filter((_, i) => i !== index);
        setComparisonData(newData);
        
        // Also remove from the input text to keep in sync
        const currentWords = wordsInput.split(/[\n,;]+/).map(w => w.trim());
        const newWords = currentWords.filter(w => w.toLowerCase() !== itemToDelete.word.toLowerCase());
        setWordsInput(newWords.join('\n'));
    };

    const handleGeneratePrompt = () => {
        const words = wordsInput.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean);
        return getComparisonPrompt(name, words);
    };

    const handleAiResult = (data: { title?: string, updatedWords: string[], comparisonData: any[] }) => {
        if (data.updatedWords && data.comparisonData) {
            setWordsInput(data.updatedWords.join('\n'));
            
            if (data.title) {
                setName(data.title);
            }
            
            const currentTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
            // Auto-add 'Comparison' tag if missing
            if (!currentTags.some(t => t.toLowerCase() === 'comparison')) {
                currentTags.push('Comparison');
                setTagsInput(currentTags.join(', '));
            }
            
            // Update local state immediately
            setComparisonData(data.comparisonData);
            
            const updatedGroup: ComparisonGroup = {
                ...group,
                name: data.title || name,
                words: data.updatedWords,
                comparisonData: data.comparisonData,
                tags: currentTags,
                path: path,
                updatedAt: Date.now()
            };
            
            // Background save
            db.saveComparisonGroup(updatedGroup).then(() => {
                showToast("Group refined! Please verify and Save.", "success");
            });
            setIsAiModalOpen(false);
        }
    };

    return (
        <>
            <ComparisonEditViewUI
                name={name}
                setName={setName}
                wordsInput={wordsInput}
                setWordsInput={setWordsInput}
                path={path}
                setPath={setPath}
                tagsInput={tagsInput}
                setTagsInput={setTagsInput}
                comparisonData={comparisonData}
                onDeleteRow={handleDeleteRow}
                isSaving={isSaving}
                onSave={handleSave}
                onCancel={onCancel}
                onOpenAiRefine={() => setIsAiModalOpen(true)}
            />
            {isAiModalOpen && (
                <UniversalAiModal 
                    isOpen={isAiModalOpen}
                    onClose={() => setIsAiModalOpen(false)}
                    type="REFINE_WORDS" 
                    title="Refine Comparison"
                    description="AI will generate nuanced explanations and examples."
                    initialData={{}} 
                    hidePrimaryInput={true}
                    onGeneratePrompt={handleGeneratePrompt}
                    onJsonReceived={handleAiResult}
                    actionLabel="Apply Refinement"
                />
            )}
        </>
    );
};
