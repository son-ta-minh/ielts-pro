
import React, { useState, useRef, useEffect } from 'react';
import { User, WritingTopic, WritingLog } from '../../app/types';
import * as db from '../../app/db';
import { getWritingEvaluationPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { WritingSessionUI } from './WritingSession_UI';

interface Props {
  user: User;
  topic: WritingTopic;
  onComplete: () => void;
}

type SessionStep = 'PRACTICING' | 'ANALYZING' | 'RESULT';

export const WritingSession: React.FC<Props> = ({ user, topic, onComplete }) => {
  const [step, setStep] = useState<SessionStep>('PRACTICING');
  const [task1Response, setTask1Response] = useState('');
  const [task2Response, setTask2Response] = useState('');
  const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes
  const [finalResult, setFinalResult] = useState<WritingLog | null>(null);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const { showToast } = useToast();
  const timerRef = useRef<number | null>(null);

  const wordCount1 = task1Response.split(/\s+/).filter(Boolean).length;
  const wordCount2 = task2Response.split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleGetEvaluation();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGetEvaluation = () => {
    if (!task1Response.trim() && !task2Response.trim()) {
      showToast("Both tasks are empty. Nothing to evaluate.", "error");
      return;
    }
    if(timerRef.current) clearInterval(timerRef.current);
    setIsAiModalOpen(true);
  };

  const handleGenerateEvalPrompt = () => {
    return getWritingEvaluationPrompt(task1Response, task2Response, topic);
  };

  const handleAiEvaluationResult = async (result: { band: number; feedback: string }) => {
    try {
      if (!result || typeof result.band !== 'number' || !result.feedback) {
        throw new Error("Invalid JSON structure from AI.");
      }

      setStep('ANALYZING');
      
      const newLog: WritingLog = {
        id: `wrt-log-${Date.now()}`,
        userId: user.id,
        timestamp: Date.now(),
        topicName: topic.name,
        task1Response,
        task2Response,
        estimatedBand: result.band,
        feedbackHtml: result.feedback,
      };

      await db.saveWritingLog(newLog);
      setFinalResult(newLog);
      setStep('RESULT');
      setIsAiModalOpen(false);

    } catch (e: any) {
      showToast(e.message, 'error');
      setStep('PRACTICING'); // Go back to allow retry
      throw e;
    }
  };

  return (
    <>
      <WritingSessionUI
        topic={topic}
        step={step}
        task1Response={task1Response}
        setTask1Response={setTask1Response}
        task2Response={task2Response}
        setTask2Response={setTask2Response}
        formattedTime={formatTime(timeLeft)}
        timeLeft={timeLeft}
        wordCount1={wordCount1}
        wordCount2={wordCount2}
        finalResult={finalResult}
        onComplete={onComplete}
        onGetEvaluation={handleGetEvaluation}
      />
      <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="EVALUATE_PARAPHRASE" title="Manual AI Evaluation" description="Your essays have been added to the prompt. Copy it, get JSON from your AI, then paste the result." onGeneratePrompt={handleGenerateEvalPrompt} onJsonReceived={handleAiEvaluationResult} />
    </>
  );
};
