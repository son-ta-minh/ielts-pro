
import React, { useState } from 'react';
import { Lesson, User } from '../../app/types';
import { LessonPracticeViewUI } from './LessonPracticeView_UI';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt, getGenerateLessonTestPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import { getConfig } from '../../app/settingsManager';
import * as dataStore from '../../app/dataStore';

interface Props {
  user: User;
  lesson: Lesson;
  onComplete: () => void;
  onEdit: () => void;
  onUpdate?: (updated: Lesson) => void; 
}

const LessonPracticeView: React.FC<Props> = ({ user, lesson, onComplete, onEdit, onUpdate }) => {
  const [aiModalMode, setAiModalMode] = useState<'listening' | 'test' | null>(null);
  const { showToast } = useToast();

  const handleGeneratePrompt = (inputs: any) => {
    const config = getConfig();
    const coachName = config.audioCoach.coaches[config.audioCoach.activeCoach].name;
    
    if (inputs.format === 'test' || aiModalMode === 'test') {
        return getGenerateLessonTestPrompt(lesson.title, lesson.content, inputs.request, lesson.tags);
    }

    return getLessonPrompt({
      task: 'convert_to_listening',
      currentLesson: { title: lesson.title, description: lesson.description, content: lesson.content },
      userRequest: inputs.request,
      language: (inputs.language as any) || user.lessonPreferences?.language || 'English',
      targetAudience: user.lessonPreferences?.targetAudience || 'Adult',
      tone: (inputs.tone as any) || user.lessonPreferences?.tone || 'professional_professor',
      coachName
    });
  };

  const handleAiResult = async (data: any) => {
    const result = data.result || data;
    const format = data.format || aiModalMode;
    
    const updatedLesson = {
        ...lesson,
        updatedAt: Date.now()
    };

    if (format === 'listening') {
        updatedLesson.listeningContent = result.content;
        showToast("Audio script added successfully!", "success");
    } else {
        updatedLesson.testContent = result.content;
        showToast("Practice test added successfully!", "success");
    }

    await dataStore.saveLesson(updatedLesson);
    
    if (onUpdate) {
        onUpdate(updatedLesson);
    }
    
    setAiModalMode(null);
  };

  return (
    <>
      <LessonPracticeViewUI
        lesson={lesson}
        onComplete={onComplete}
        onEdit={onEdit}
        onAddSound={() => setAiModalMode('listening')}
        onAddTest={() => setAiModalMode('test')}
      />
      {aiModalMode && (
        <UniversalAiModal
          isOpen={!!aiModalMode}
          onClose={() => setAiModalMode(null)}
          type="GENERATE_AUDIO_SCRIPT" 
          title={aiModalMode === 'listening' ? "Add Lesson Sound" : "Add Practice Test"}
          description={aiModalMode === 'listening' ? "AI will transform this lesson into a podcast script." : "AI will design a separate test based on lesson content."}
          initialData={{ ...user.lessonPreferences, format: aiModalMode }}
          onGeneratePrompt={handleGeneratePrompt}
          onJsonReceived={handleAiResult}
          actionLabel="Apply Changes"
          closeOnSuccess={true}
        />
      )}
    </>
  );
};

export default LessonPracticeView;
