import React, { useState, useEffect } from 'react';
import { Lesson, User, IntensityRow, ComparisonRow } from '../../app/types';
import { LessonEditViewUI } from './LessonEditView_UI';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getLessonPrompt, getGenerateLessonTestPrompt, getIntensityRefinePrompt, getComparisonRefinePrompt } from '../../services/promptService';
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
  const [intensityRows, setIntensityRows] = useState<IntensityRow[]>(lesson.intensityRows || []);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>(lesson.comparisonRows || []);
  // Added state for searchKeywords to ensure they are preserved during edit
  const [searchKeywords, setSearchKeywords] = useState<string[]>(lesson.searchKeywords || []);
  
  const [isSaving, setIsSaving] = useState(false);
  const [aiModalMode, setAiModalMode] = useState<{ format: 'reading' | 'listening' | 'test' | 'intensity' | 'comparison' } | null>(null);
  
  const { showToast } = useToast();
  
  // Auto-open AI Modal for new Comparison cards
  useEffect(() => {
      if (lesson.type === 'comparison' && !lesson.content && lesson.id.startsWith('lesson-')) {
          setAiModalMode({ format: 'reading' });
      }
  }, []);

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
    
    let type: Lesson['type'] = lesson.type || 'essay';
    // If it has intensity rows, it's intensity. 
    // If it's a comparison card, we keep the type 'comparison' even without rows (since we use Reading table).
    if (intensityRows.length > 0) type = 'intensity';
    else if (lesson.type === 'comparison') type = 'comparison';

    return {
      ...lesson,
      title,
      description,
      type,
      path: path.trim(),
      tags: finalTags,
      content,
      listeningContent,
      testContent,
      intensityRows: intensityRows.length > 0 ? intensityRows : undefined,
      comparisonRows: undefined, // Explicitly remove comparisonRows as we use Reading table for this type now
      searchKeywords, // Persist searchKeywords
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
    const format = aiModalMode?.format || inputs.format;

    if (format === 'intensity') {
        return getIntensityRefinePrompt(intensityRows);
    }
    
    if (format === 'comparison') {
        return getComparisonRefinePrompt(comparisonRows);
    }

    if (format === 'test') {
        const currentTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        return getGenerateLessonTestPrompt(title, content, inputs.request, currentTags);
    }

    // Determine if we are creating from scratch or refining
    const isCreateTask = !content && (lesson.type === 'comparison' || lesson.type === 'intensity' || !lesson.id.includes('ai'));

    return getLessonPrompt({
      task: isCreateTask ? 'create_reading' : (format === 'listening' ? 'convert_to_listening' : 'refine_reading'),
      currentLesson: { 
          title, 
          description, 
          content,
          type: lesson.type,
          intensityRows: intensityRows,
          comparisonRows: comparisonRows
      },
      topic: inputs.request || inputs.topic || title, // Prioritize request from textarea for topic on creation
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

    if (format === 'intensity') {
        if (Array.isArray(cleanResult)) {
            setIntensityRows(cleanResult);
            showToast("Intensity scale refined!", "success");
        }
    } else if (format === 'comparison') {
        if (Array.isArray(cleanResult)) {
            setComparisonRows(cleanResult);
            showToast("Comparison lab updated!", "success");
        }
    } else if (format === 'listening') {
        if (cleanResult.content) { setListeningContent(cleanResult.content); showToast("Listening script updated!", "success"); }
    } else if (format === 'test') {
        if (cleanResult.content) { setTestContent(cleanResult.content); showToast("Practice test generated!", "success"); }
    } else {
        if (cleanResult.title) setTitle(cleanResult.title);
        if (cleanResult.description) setDescription(cleanResult.description);
        if (cleanResult.content) setContent(cleanResult.content);
        if (cleanResult.searchKeywords && Array.isArray(cleanResult.searchKeywords)) setSearchKeywords(cleanResult.searchKeywords);
        if (!tagsInput.trim() && cleanResult.tags && cleanResult.tags.length > 0) setTagsInput(cleanResult.tags.join(', '));
        showToast("Lesson content refined!", "success");
    }
    setAiModalMode(null);
  };

  return (
    <>
      <LessonEditViewUI
        type={lesson.type || 'essay'}
        title={title} setTitle={setTitle}
        description={description} setDescription={setDescription}
        path={path} setPath={setPath}
        tagsInput={tagsInput} setTagsInput={setTagsInput}
        content={content} setContent={setContent}
        listeningContent={listeningContent} setListeningContent={setListeningContent}
        testContent={testContent} setTestContent={setTestContent}
        intensityRows={intensityRows} setIntensityRows={setIntensityRows}
        comparisonRows={[]} // Comparison card uses Reading table directly now
        setComparisonRows={() => {}}
        isSaving={isSaving} onSave={handleSave}
        onPractice={handlePractice} onCancel={onCancel}
        onOpenAiRefine={(format) => setAiModalMode({ format: format || 'reading' })}
      />
      {aiModalMode && (
        <UniversalAiModal
          isOpen={!!aiModalMode}
          onClose={() => setAiModalMode(null)}
          type="REFINE_UNIT" // Always use REFINE_UNIT to get the textarea input
          title={aiModalMode.format === 'intensity' ? "Refine Intensity Scale" : lesson.type === 'comparison' ? (content ? "Refine Comparison Analysis" : "Generate Comparison Analysis") : (content ? "Refine Lesson" : "Generate Lesson")}
          description={aiModalMode.format === 'intensity' ? "AI will complete the intensity word scale and suggest new relevant categories." : lesson.type === 'comparison' ? "Enter words like 'Hurt, Pain' to generate a structured comparison table." : `Enter topic or instructions for the AI.`}
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