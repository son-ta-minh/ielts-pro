import React, { useState, useMemo, useEffect } from 'react';
import { Composition, User, VocabularyItem } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { useToast } from '../../contexts/ToastContext';
import { getCompositionEvaluationPrompt } from '../../services/promptService';
import { CompositionEditorUI } from './CompositionEditor_UI';

interface Props {
    controller: any;
    user: User;
    initialComposition: Composition | null;
    onSave: () => void;
    onCancel: () => void;
}

export const CompositionEditor: React.FC<Props> = ({ controller, user, initialComposition, onSave, onCancel }) => {
    const [title, setTitle] = useState('');
    const [path, setPath] = useState('');
    const [tagsInput, setTagsInput] = useState('');
    const [content, setContent] = useState('');
    const [note, setNote] = useState('');
    const [linkedWordIds, setLinkedWordIds] = useState<Set<string>>(new Set());
    const [aiFeedback, setAiFeedback] = useState<string | undefined>(undefined);
    const [isDirty, setIsDirty] = useState(false);
    
    const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    
    // Modal States
    const [isWordSelectorOpen, setIsWordSelectorOpen] = useState(false);
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);

    const { showToast } = useToast();

    useEffect(() => {
        const loadWords = async () => {
             const words = dataStore.getAllWords().filter(w => w.userId === user.id);
             setAllWords(words);
        };
        loadWords();

        if (initialComposition) {
            setTitle(initialComposition.title || '');
            
            // Migration-on-edit logic for tags and path
            if (initialComposition.path === undefined) {
                const legacyTagsOrLabel = initialComposition.tags && initialComposition.tags.length > 0 
                    ? initialComposition.tags 
                    : (initialComposition.label ? [initialComposition.label] : []);

                const pathFromTags = legacyTagsOrLabel.find(t => t.startsWith('/'));
                const singleTags = legacyTagsOrLabel.filter(t => !t.startsWith('/'));
                
                setPath(pathFromTags || '/');
                setTagsInput(singleTags.join(', '));
            } else {
                setPath(initialComposition.path || '/');
                setTagsInput((initialComposition.tags || []).join(', '));
            }

            setContent(initialComposition.content);
            setNote(initialComposition.note || '');
            setLinkedWordIds(new Set(initialComposition.linkedWordIds));
            setAiFeedback(initialComposition.aiFeedback);
            if (initialComposition.aiFeedback) {
                setIsFeedbackOpen(true);
            }
        } else {
            setTitle('');
            setPath('/');
            setTagsInput('');
            setContent('');
            setNote('');
            setLinkedWordIds(new Set());
            setAiFeedback(undefined);
            setIsFeedbackOpen(false);
        }
    }, [initialComposition, user.id]);

    useEffect(() => {
        if (!initialComposition) {
            setIsDirty(
                !!title || !!content || !!note || !!tagsInput
            );
        } else {
            setIsDirty(
                title !== (initialComposition.title || '') ||
                content !== initialComposition.content ||
                note !== (initialComposition.note || '') ||
                tagsInput !== (initialComposition.tags || []).join(', ') ||
                path !== (initialComposition.path || '/')
            );
        }
    }, [title, content, note, tagsInput, path, initialComposition]);

    useEffect(() => {
        if (controller?.setHasWritingUnsavedChanges) {
            controller.setHasWritingUnsavedChanges(isDirty);
        }
    }, [isDirty, controller]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!isDirty) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const linkedWords = useMemo(() => {
        const linkedMap = new Map<string, VocabularyItem>();
        allWords.forEach(w => {
            if (linkedWordIds.has(w.id)) linkedMap.set(w.id, w);
        });
        return Array.from(linkedMap.values());
    }, [allWords, linkedWordIds]);

    const handleAutoLink = () => {
        if (!content.trim()) return;
        const lowerContent = content.toLowerCase();
        let newCount = 0;
        const newIds = new Set(linkedWordIds);

        allWords.forEach(word => {
            if (!newIds.has(word.id)) {
                const variants = [word.word];
                if (word.wordFamily) {
                    if (word.wordFamily.nouns) variants.push(...word.wordFamily.nouns.map(x => x.word));
                    if (word.wordFamily.verbs) variants.push(...word.wordFamily.verbs.map(x => x.word));
                    if (word.wordFamily.adjs) variants.push(...word.wordFamily.adjs.map(x => x.word));
                    if (word.wordFamily.advs) variants.push(...word.wordFamily.advs.map(x => x.word));
                }
                const isFound = variants.some(v => lowerContent.includes(v.toLowerCase()));
                if (isFound) {
                    newIds.add(word.id);
                    newCount++;
                }
            }
        });

        if (newCount > 0) {
            setLinkedWordIds(newIds);
            showToast(`Auto-linked ${newCount} new words!`, 'success');
        } else {
            showToast('No new words found from library.', 'info');
        }
    };
    
    const handleManualLink = (selectedWords: string[]) => {
        const newIds = new Set(linkedWordIds);
        let addedCount = 0;
        const wordMap = new Map<string, VocabularyItem>();
        allWords.forEach(w => wordMap.set(w.word, w));

        selectedWords.forEach(wText => {
            const w = wordMap.get(wText);
            if (w && !newIds.has(w.id)) {
                newIds.add(w.id);
                addedCount++;
            }
        });
        
        setLinkedWordIds(newIds);
        setIsWordSelectorOpen(false);
        if (addedCount > 0) showToast(`Linked ${addedCount} words manually.`, 'success');
    };

    const handleRemoveLink = (id: string) => {
        const newIds = new Set(linkedWordIds);
        newIds.delete(id);
        setLinkedWordIds(newIds);
    };

    const handleSave = async () => {
        if (!content.trim()) {
            showToast("Content cannot be empty.", "error");
            return;
        }
        setIsSaving(true);
        try {
            const now = Date.now();
            const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
            
            const composition: Composition = {
                id: initialComposition?.id || `comp-${now}-${Math.random()}`,
                userId: user.id,
                title: title.trim(),
                label: 'Free Write', // Legacy label, tags are primary
                path: path.trim(),
                tags: finalTags,
                content,
                note,
                linkedWordIds: Array.from(linkedWordIds),
                aiFeedback,
                createdAt: initialComposition?.createdAt || now,
                updatedAt: now
            };
            await dataStore.saveComposition(composition);
            showToast("Composition saved.", "success");
            setIsDirty(false);
            if (controller?.setHasWritingUnsavedChanges) {
                controller.setHasWritingUnsavedChanges(false);
            }
            onSave();
        } catch (e) {
            console.error(e);
            showToast("Failed to save.", "error");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleGenerateEvalPrompt = () => {
        return getCompositionEvaluationPrompt(content, tagsInput || 'Free Write');
    };

    const handleAiResult = (data: { feedback: string }) => {
        setAiFeedback(data.feedback);
        setIsAiModalOpen(false);
        setIsFeedbackOpen(true);
        showToast("Feedback received!", "success");
    };

    const wordCount = content.split(/\s+/).filter(Boolean).length;

    return (
        <CompositionEditorUI
            title={title}
            setTitle={setTitle}
            path={path}
            setPath={setPath}
            tagsInput={tagsInput}
            setTagsInput={setTagsInput}
            content={content}
            setContent={setContent}
            note={note}
            setNote={setNote}
            linkedWords={linkedWords}
            wordCount={wordCount}
            aiFeedback={aiFeedback}
            isFeedbackOpen={isFeedbackOpen}
            setIsFeedbackOpen={setIsFeedbackOpen}
            isSaving={isSaving}
            onCancel={() => {
                if (isDirty) {
                    const confirmed = window.confirm('You have unsaved changes. Leave without saving?');
                    if (!confirmed) return;
                }
                onCancel();
            }}
            onSave={handleSave}
            onAutoLink={handleAutoLink}
            onRemoveLink={handleRemoveLink}
            isWordSelectorOpen={isWordSelectorOpen}
            setIsWordSelectorOpen={setIsWordSelectorOpen}
            allWords={allWords}
            handleManualLink={handleManualLink}
            isAiModalOpen={isAiModalOpen}
            setIsAiModalOpen={setIsAiModalOpen}
            handleGenerateEvalPrompt={handleGenerateEvalPrompt}
            handleAiResult={handleAiResult}
        />
    );
};
