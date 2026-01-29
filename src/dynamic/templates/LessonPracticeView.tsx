
import React from 'react';
import { Lesson } from '../../app/types';
import { LessonPracticeViewUI } from './LessonPracticeView_UI';

interface Props {
  lesson: Lesson;
  onComplete: () => void;
  onEdit: () => void;
}

const LessonPracticeView: React.FC<Props> = ({ lesson, onComplete, onEdit }) => {
  return (
    <LessonPracticeViewUI
      lesson={lesson}
      onComplete={onComplete}
      onEdit={onEdit}
    />
  );
};

export default LessonPracticeView;
    