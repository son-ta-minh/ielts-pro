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
    }, [group]);

    const handleSave = async () => {
        setIsSaving(true);
        const finalWords = wordsInput.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean);
        const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        
        // Auto-add 'Comparison' tag if missing
        if (!finalTags.some(t => t.toLowerCase() === 'comparison')) {
            finalTags.push('Comparison');
        }
        
        const updatedData = (group.comparisonData || []).filter(d => finalWords.includes(d.word));

        const updatedGroup: ComparisonGroup = {
            ...group,
            name,
            words: finalWords,
            path: path.trim(),
            tags: finalTags,
            comparisonData: updatedData,
            updatedAt: Date.now()
        };
        
        await db.saveComparisonGroup(updatedGroup);
        onSave(updatedGroup);
        setIsSaving(false);
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

            const updatedGroup: ComparisonGroup = {
                ...group,
                name: data.title || name,
                words: data.updatedWords,
                comparisonData: data.comparisonData,
                tags: currentTags,
                path: path, // Keep current path
                updatedAt: Date.now()
            };
            db.saveComparisonGroup(updatedGroup).then(() => {
                onSave(updatedGroup); 
                showToast("Group refined and saved!", "success");
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
                    actionLabel="Apply & Save"
                />
            )}
        </>
    );
};
