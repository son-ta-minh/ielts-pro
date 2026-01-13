
import React, { useState, useRef, useEffect } from 'react';
import { ParaphraseMode, User, ParaphraseLog } from '../../app/types';
import { generateParaphraseTaskWithHints, evaluateParaphrase } from '../../services/geminiService';
import { getParaphraseTaskPrompt, getParaphraseEvaluationPrompt } from '../../services/promptService';
import { saveParaphraseLog } from '../../app/db';
import { AiActionType } from '../common/UniversalAiModal';
import { ParaphrasePracticeUI } from './ParaphrasePractice_UI';
import { getConfig } from '../../app/settingsManager';

interface Props { user: User; }

type Step = 'SETUP' | 'PRACTICE' | 'RESULT';

const AI_TIMEOUT_MS = 40000;

const ParaphrasePractice: React.FC<Props> = ({ user }) => {
  const [step, setStep] = useState<Step>('SETUP');
  const [evaluationMode, setEvaluationMode] = useState<ParaphraseMode>(ParaphraseMode.VARIETY);
  
  const [originalSentence, setOriginalSentence] = useState('');
  const [userDraft, setUserDraft] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<{message: string, isNetwork?: boolean} | null>(null);
  
  const [evaluation, setEvaluation] = useState<{ score: number; meaningScore: number; lexicalScore: number; grammarScore: number; feedback: string; modelAnswer: string } | null>(null);
  
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  const [showHints, setShowHints] = useState(false);

  const timerRef = useRef<number | null>(null);
  
  const [aiModalState, setAiModalState] = useState<{isOpen: boolean, type: AiActionType, initialData?: any}>({ isOpen: false, type: 'GENERATE_PARAPHRASE' });
  const aiEnabled = getConfig().ai.enableGeminiApi;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setIsModeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        stopTimer();
    };
  }, []);

  const startTimer = () => {
      stopTimer();
      setElapsedSeconds(0);
      setGenerationStatus('Initializing API connection...');
      timerRef.current = window.setInterval(() => {
          setElapsedSeconds(prev => {
              const next = prev + 1;
              if (next === 3) setGenerationStatus('Waiting for Gemini response...');
              if (next === 12) setGenerationStatus('Analyzing sentence structure...');
              if (next === 22) setGenerationStatus('Request is taking longer than expected...');
              return next;
          });
      }, 1000);
  };

  const stopTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
  };

  const handleNewTask = () => {
    setStep('SETUP');
    setOriginalSentence('');
    setUserDraft('');
    setHints([]);
    setCurrentHintIndex(0);
    setEvaluation(null);
    setError(null);
    setShowHints(false);
    stopTimer();
  };
  
  const handleEvaluationModeChange = (newMode: ParaphraseMode) => {
    setEvaluationMode(newMode);
    setIsModeDropdownOpen(false);
  };

  const cleanSentenceField = (text: string): string => {
    if (!text) return '';
    return text.replace(/^(Sentence:|Task:|English:)\s*/i, '')
               .replace(/\s*(Hint|Hints|Gợi ý):.*$/is, '')
               .trim();
  };

  const handleGetTask = async () => {
    if (!navigator.onLine) {
        setError({ message: "You are currently offline. Please connect to the internet.", isNetwork: true });
        return;
    }

    setIsGenerating(true);
    setError(null);
    
    startTimer();

    try {
      const randomTone = Math.random() > 0.5 ? 'ACADEMIC' : 'CASUAL';
      const result = await generateParaphraseTaskWithHints(randomTone, evaluationMode, user, '');
      
      if (!result || !result.sentence) throw new Error("AI returned an empty response.");
      
      setOriginalSentence(cleanSentenceField(result.sentence));
      setHints(result.hints || []);
      setCurrentHintIndex(0);
    } catch (e: any) {
      console.error(e);
      setError({ message: "Connection to AI failed. Check your network or API Key settings." });
    } finally {
      setIsGenerating(false);
      stopTimer();
    }
  };

  const handleOriginalSentenceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setOriginalSentence(e.target.value);
    setHints([]);
    setCurrentHintIndex(0);
    setShowHints(false);
    setEvaluation(null);
    setUserDraft('');
  };

  const saveEvaluationResult = async (result: any) => {
      const logEntry: ParaphraseLog = {
          id: 'log-' + Date.now(),
          userId: user.id,
          timestamp: Date.now(),
          originalSentence,
          userDraft,
          mode: evaluationMode,
          overallScore: result.score,
          meaningScore: result.meaningScore || result.score,
          lexicalScore: result.lexicalScore || result.score,
          grammarScore: result.grammarScore || result.score,
          feedbackHtml: result.feedback,
          modelAnswer: result.modelAnswer
      };
      await saveParaphraseLog(logEntry);
  };

  const handleManualJsonReceived = async (data: any) => {
      if (aiModalState.type === 'GENERATE_PARAPHRASE') {
          if (data.sentence && typeof data.sentence === 'string') {
            setOriginalSentence(cleanSentenceField(data.sentence));
            setHints(Array.isArray(data.hints) ? data.hints : []);
            setCurrentHintIndex(0);
          }
      } else if (aiModalState.type === 'EVALUATE_PARAPHRASE') {
          if (typeof data.score === 'number' && data.feedback) {
            setEvaluation(data);
            await saveEvaluationResult(data);
            setStep('RESULT');
          }
      }
  };

  const handleEvaluate = async () => {
    if (!userDraft.trim() || !originalSentence) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const result = await evaluateParaphrase(originalSentence, userDraft, evaluationMode);
      setEvaluation(result);
      await saveEvaluationResult(result);
      setStep('RESULT');
    } catch (e: any) {
      setError({ message: "An error occurred during evaluation." });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleRetry = () => {
    setEvaluation(null);
    setStep('PRACTICE');
  };

  const handleGeneratePrompt = (inputs: any) => {
      if (aiModalState.type === 'GENERATE_PARAPHRASE') {
          return getParaphraseTaskPrompt(inputs.tone || 'ACADEMIC', evaluationMode, user, inputs.context || '');
      } else if (aiModalState.type === 'EVALUATE_PARAPHRASE') {
          return getParaphraseEvaluationPrompt(inputs.original, inputs.draft, inputs.mode);
      }
      return '';
  };
  
  return (
    <ParaphrasePracticeUI
      step={step}
      setStep={setStep}
      user={user}
      error={error}
      setError={setError}
      isGenerating={isGenerating}
      generationStatus={generationStatus}
      elapsedSeconds={elapsedSeconds}
      originalSentence={originalSentence}
      handleOriginalSentenceChange={handleOriginalSentenceChange}
      handleGetTask={handleGetTask}
      setAiModalState={setAiModalState}
      showHints={showHints}
      setShowHints={setShowHints}
      hints={hints}
      currentHintIndex={currentHintIndex}
      setCurrentHintIndex={setCurrentHintIndex}
      userDraft={userDraft}
      setUserDraft={setUserDraft}
      isEvaluating={isEvaluating}
      evaluationMode={evaluationMode}
      isModeDropdownOpen={isModeDropdownOpen}
      setIsModeDropdownOpen={setIsModeDropdownOpen}
      modeDropdownRef={modeDropdownRef}
      handleEvaluationModeChange={handleEvaluationModeChange}
      handleEvaluate={handleEvaluate}
      evaluation={evaluation}
      handleRetry={handleRetry}
      handleNewTask={handleNewTask}
      aiModalState={aiModalState}
      handleGeneratePrompt={handleGeneratePrompt}
      handleManualJsonReceived={handleManualJsonReceived}
      aiEnabled={aiEnabled}
    />
  );
};

export default ParaphrasePractice;