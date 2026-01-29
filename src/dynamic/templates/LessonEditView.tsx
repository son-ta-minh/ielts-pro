import React, { useState, useEffect } from 'react';
import { Lesson } from '../../app/types';
import { LessonEditViewUI } from './LessonEditView_UI';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getRefineLessonPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  lesson: Lesson;
  onSave: (lesson: Lesson) => void;
  onPractice: (lesson: Lesson) => void;
  onCancel: () => void;
}

const LessonEditView: React.FC<Props> = ({ lesson, onSave, onPractice, onCancel }) => {
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description || '');
  const [path, setPath] = useState(lesson.path || '/');
  const [tagsInput, setTagsInput] = useState((lesson.tags || []).join(', '));
  const [content, setContent] = useState(lesson.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const { showToast } = useToast();
  
  // NOTE: Legacy topic1/topic2 are maintained in DB but hidden from UI as per V2 requirements.
  const topic1 = lesson.topic1;
  const topic2 = lesson.topic2;

  useEffect(() => {
    // Migration-on-edit: Split legacy tags if new fields aren't used yet.
    if (lesson.path === undefined && lesson.tags) {
      const legacyTags = lesson.tags || [];
      const pathFromTags = legacyTags.find(t => t.startsWith('/'));
      const singleTags = legacyTags.filter(t => !t.startsWith('/'));
      
      setPath(pathFromTags || '/');
      setTagsInput(singleTags.join(', '));
    } else {
      // New data structure exists, use it directly.
      setPath(lesson.path || '/');
      setTagsInput((lesson.tags || []).join(', '));
    }
  }, [lesson]);

  const prepareLessonData = (): Lesson => {
    const finalTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    
    return {
      ...lesson,
      title,
      description,
      // topic1 and topic2 are deprecated in V2 UI but kept for compatibility
      topic1, 
      topic2,
      path: path.trim(),
      tags: finalTags,
      content,
      updatedAt: Date.now(),
    };
  };

  const handleSave = () => {
    setIsSaving(true);
    const updatedLesson = prepareLessonData();
    onSave(updatedLesson);
  };
  
  const handlePractice = () => {
    setIsSaving(true);
    const updatedLesson = prepareLessonData();
    onPractice(updatedLesson);
  };

  const handleGenerateRefinePrompt = (inputs: { request: string }) => {
    return getRefineLessonPrompt({ title, description, content }, inputs.request);
  };

  const handleAiResult = (data: { title: string; description: string; content: string; tags?: string[] }) => {
    setTitle(data.title);
    setDescription(data.description);
    setContent(data.content);
    
    // Auto-fill tags if empty
    if (!tagsInput.trim() && data.tags && data.tags.length > 0) {
        setTagsInput(data.tags.join(', '));
    }

    setIsAiModalOpen(false);
    showToast("Lesson content refined!", "success");
  };

  return (
    <>
      <LessonEditViewUI
        title={title}
        setTitle={setTitle}
        description={description}
        setDescription={setDescription}
        path={path}
        setPath={setPath}
        tagsInput={tagsInput}
        setTagsInput={setTagsInput}
        content={content}
        setContent={setContent}
        isSaving={isSaving}
        onSave={handleSave}
        onPractice={handlePractice}
        onCancel={onCancel}
        onOpenAiRefine={() => setIsAiModalOpen(true)}
      />
      {isAiModalOpen && (
        <UniversalAiModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          type="REFINE_UNIT" // Re-using type for generic request UI
          title="Refine Lesson Content"
          description="AI will format your notes into Markdown, fix errors, and add structure."
          onGeneratePrompt={handleGenerateRefinePrompt}
          onJsonReceived={handleAiResult}
          actionLabel="Apply Changes"
        />
      )}
    </>
  );
};

export default LessonEditView;
