
import React, { useState, useEffect } from 'react';
import { Lesson, User } from '../../app/types';
import { LessonEditViewUI } from './LessonEditView_UI';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import { getConfig } from '../../app/settingsManager';

interface Props {
  lesson: Lesson;
  user: User;
  onSave: (lesson: Lesson) => void;
  onPractice: (lesson: Lesson) => void;
  onCancel: () => void;
}

const LessonEditView: React.FC<Props> = ({ lesson, user, onSave, onPractice, onCancel }) => {
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description || '');
  const [path, setPath] = useState(lesson.path || '/');
  const [tagsInput, setTagsInput] = useState((lesson.tags || []).join(', '));
  const [content, setContent] = useState(lesson.content);
  const [listeningContent, setListeningContent] = useState(lesson.listeningContent || '');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const { showToast } = useToast();
  
  const topic1 = lesson.topic1;
  const topic2 = lesson.topic2;

  useEffect(() => {
    if (lesson.path === undefined && lesson.tags) {
      const legacyTags = lesson.tags || [];
      const pathFromTags = legacyTags.find(t => t.startsWith('/'));
      const singleTags = legacyTags.filter(t => !t.startsWith('/'));
      
      setPath(pathFromTags || '/');
      setTagsInput(singleTags.join(', '));
    } else {
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
      topic1, 
      topic2,
      path: path.trim(),
      tags: finalTags,
      content,
      listeningContent,
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

  const handleGenerateRefinePrompt = (inputs: { request: string, language: string, tone: string, format?: 'reading' | 'listening' }) => {
    const config = getConfig();
    const activeType = config.audioCoach.activeCoach;
    const coachName = config.audioCoach.coaches[activeType].name;
    
    return getLessonPrompt({
      task: inputs.format === 'listening' ? 'convert_to_listening' : 'refine_reading',
      currentLesson: { title, description, content },
      userRequest: inputs.request,
      language: (inputs.language as any) || user.lessonPreferences?.language || 'English',
      targetAudience: user.lessonPreferences?.targetAudience || 'Adult',
      tone: (inputs.tone as any) || user.lessonPreferences?.tone || 'professional_professor',
      coachName,
      format: inputs.format || 'reading'
    });
  };

  const handleAiResult = (data: any) => {
    const result = data.result || data;
    
    // Check if result returned listening content or refined reading
    if (result.content.includes('[Audio-')) {
        setListeningContent(result.content);
        showToast("Listening script updated!", "success");
    } else {
        setTitle(result.title);
        setDescription(result.description);
        setContent(result.content);
        if (!tagsInput.trim() && result.tags && result.tags.length > 0) {
            setTagsInput(result.tags.join(', '));
        }
        showToast("Lesson content refined!", "success");
    }

    setIsAiModalOpen(false);
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
        listeningContent={listeningContent}
        setListeningContent={setListeningContent}
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
          type="REFINE_UNIT"
          title="Refine Lesson"
          description="AI will format your notes or generate a Listening Podcast script."
          onGeneratePrompt={handleGenerateRefinePrompt}
          onJsonReceived={handleAiResult}
          actionLabel="Apply Changes"
        />
      )}
    </>
  );
};

export default LessonEditView;
