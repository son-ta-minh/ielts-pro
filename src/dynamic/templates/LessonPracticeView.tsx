
import React, { useState } from 'react';
import { Lesson, User } from '../../app/types';
import { LessonPracticeViewUI } from './LessonPracticeView_UI';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import { getConfig } from '../../app/settingsManager';
import * as dataStore from '../../app/dataStore';

interface Props {
  user: User;
  lesson: Lesson;
  onComplete: () => void;
  onEdit: () => void;
  onUpdate?: (updated: Lesson) => void; // Added onUpdate callback
}

const LessonPracticeView: React.FC<Props> = ({ user, lesson, onComplete, onEdit, onUpdate }) => {
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const { showToast } = useToast();

  const handleGeneratePrompt = (inputs: { request: string, language: string, tone: string }) => {
    const config = getConfig();
    const coachName = config.audioCoach.coaches[config.audioCoach.activeCoach].name;
    
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
    const updatedLesson = {
        ...lesson,
        listeningContent: result.content,
        updatedAt: Date.now()
    };
    await dataStore.saveLesson(updatedLesson);
    
    // CRITICAL: Update local prop-driven UI and notify parent
    if (onUpdate) {
        onUpdate(updatedLesson);
    }
    
    showToast("Audio script added successfully!", "success");
    setIsAiModalOpen(false);
  };

  return (
    <>
      <LessonPracticeViewUI
        lesson={lesson}
        onComplete={onComplete}
        onEdit={onEdit}
        onAddSound={() => setIsAiModalOpen(true)}
      />
      {isAiModalOpen && (
        <UniversalAiModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          type="GENERATE_AUDIO_SCRIPT" 
          title="Add Lesson Sound"
          description="AI will transform this lesson into a podcast script for you to listen."
          onGeneratePrompt={handleGeneratePrompt}
          onJsonReceived={handleAiResult}
          actionLabel="Apply Sound Script"
          closeOnSuccess={true}
        />
      )}
    </>
  );
};

export default LessonPracticeView;
