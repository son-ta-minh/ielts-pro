
import React, { useState, useEffect } from 'react';
import { Lesson, User } from '../../app/types';
import { LessonEditViewUI } from './LessonEditView_UI';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt, getGenerateLessonTestPrompt } from '../../services/promptService';
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
  const [testContent, setTestContent] = useState(lesson.testContent || '');
  
  const [isSaving, setIsSaving] = useState(false);
  const [aiModalMode, setAiModalMode] = useState<{ format: 'reading' | 'listening' | 'test' } | null>(null);
  
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
      testContent,
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

  const handleGenerateRefinePrompt = (inputs: any) => {
    const config = getConfig();
    const activeType = config.audioCoach.activeCoach;
    const coachName = config.audioCoach.coaches[activeType].name;
    
    // Determine format from state or input
    const format = aiModalMode?.format || inputs.format;
    
    if (format === 'test') {
        const currentTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        return getGenerateLessonTestPrompt(title, content, inputs.request, currentTags);
    }

    return getLessonPrompt({
      task: format === 'listening' ? 'convert_to_listening' : 'refine_reading',
      currentLesson: { title, description, content },
      userRequest: inputs.request,
      language: (inputs.language as any) || user.lessonPreferences?.language || 'English',
      targetAudience: user.lessonPreferences?.targetAudience || 'Adult',
      tone: (inputs.tone as any) || user.lessonPreferences?.tone || 'professional_professor',
      coachName,
      format: format || 'reading'
    });
  };

  const handleAiResult = (data: any) => {
    const { result } = data;
    const cleanResult = result || data;
    const format = aiModalMode?.format;
    
    if (format === 'listening') {
        if (cleanResult.content) {
            setListeningContent(cleanResult.content);
            showToast("Listening script updated!", "success");
        } else {
            showToast("Failed to generate listening content.", "error");
        }
    } else if (format === 'test') {
        if (cleanResult.content) {
            setTestContent(cleanResult.content);
            showToast("Practice test generated!", "success");
        } else {
            showToast("Failed to generate test.", "error");
        }
    } else {
        // Reading Refinement (Default)
        if (cleanResult.title) setTitle(cleanResult.title);
        if (cleanResult.description) setDescription(cleanResult.description);
        if (cleanResult.content) setContent(cleanResult.content);
        
        if (!tagsInput.trim() && cleanResult.tags && cleanResult.tags.length > 0) {
            setTagsInput(cleanResult.tags.join(', '));
        }
        showToast("Lesson content refined!", "success");
    }

    setAiModalMode(null);
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
        testContent={testContent}
        setTestContent={setTestContent}
        isSaving={isSaving}
        onSave={handleSave}
        onPractice={handlePractice}
        onCancel={onCancel}
        onOpenAiRefine={(format) => setAiModalMode({ format: format || 'reading' })}
      />
      {aiModalMode && (
        <UniversalAiModal
          isOpen={!!aiModalMode}
          onClose={() => setAiModalMode(null)}
          type="REFINE_UNIT"
          title={`Generate ${aiModalMode.format}`}
          description={`AI will create the ${aiModalMode.format} component for this lesson.`}
          initialData={{ ...user.lessonPreferences, format: aiModalMode.format }}
          onGeneratePrompt={handleGenerateRefinePrompt}
          onJsonReceived={handleAiResult}
          actionLabel="Apply Changes"
        />
      )}
    </>
  );
};

export default LessonEditView;
