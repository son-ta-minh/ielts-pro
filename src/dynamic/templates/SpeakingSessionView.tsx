
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { User, SpeakingTopic, SpeakingLog } from '../../app/types';
import * as db from '../../app/db';
import { getSpeakingEvaluationFromTextPrompt } from '../../services/promptService';
import { startRecording, stopRecording } from '../../utils/audio';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';
import { useToast } from '../../contexts/ToastContext';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { SpeakingSessionViewUI, SessionQuestion } from './SpeakingSessionView_UI';

interface Props {
  user: User;
  topic: SpeakingTopic;
  onComplete: () => void;
}

type SessionStep = 'PRACTICING' | 'REVIEW' | 'ANALYZING' | 'RESULT';

export const SpeakingSessionView: React.FC<Props> = ({ user, topic, onComplete }) => {
  const [step, setStep] = useState<SessionStep>('PRACTICING');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  
  const [recordedAudio, setRecordedAudio] = useState<Record<number, { base64: string, mimeType: string }>>({});
  const [sessionTranscripts, setSessionTranscripts] = useState<Record<number, string>>({});
  const [liveTranscript, setLiveTranscript] = useState('');

  const [isPreparingPart2, setIsPreparingPart2] = useState(false);
  const [prepTimeLeft, setPrepTimeLeft] = useState(60);

  const [finalResult, setFinalResult] = useState<SpeakingLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [transcriptsForEval, setTranscriptsForEval] = useState<{ question: string; transcript: string }[] | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  
  const audioPlayers = useRef<Record<number, HTMLAudioElement>>({});
  const recognitionManager = useRef(new SpeechRecognitionManager());
  const prepTimerRef = useRef<number | null>(null);
  const { showToast } = useToast();

  const isFullTest = useMemo(() => !!topic.part2, [topic]);
  const allQuestions = useMemo<SessionQuestion[]>(() => {
    if (!topic) return [];
    const p1 = (topic.questions || []).map(q => ({ question: q, part: 1 as const }));
    const p2 = topic.part2 ? [{ question: 'Part 2 Cue Card', part: 2 as const, cueCard: topic.part2 }] : [];
    const p3 = (topic.part3 || []).map(q => ({ question: q, part: 3 as const }));
    return [...p1, ...p2, ...p3];
  }, [topic]);

  const currentQuestionData = allQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;

  const handleStartRecording = useCallback(async () => {
    try {
      await startRecording();
      setIsRecording(true);
      setError(null);
      setLiveTranscript('');
      
      recognitionManager.current.start(
        (final, interim) => setLiveTranscript(final + interim),
        (finalTranscript) => setSessionTranscripts(prev => ({ ...prev, [currentQuestionIndex]: finalTranscript }))
      );
    } catch (err) {
      console.error(err);
      setError('Could not start recording. Please ensure microphone permissions are granted.');
    }
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (currentQuestionData?.part === 2 && !isRecording && step === 'PRACTICING' && !isPreparingPart2) {
        setIsPreparingPart2(true);
        setPrepTimeLeft(60);
        
        prepTimerRef.current = window.setInterval(() => {
            setPrepTimeLeft(prev => {
                if (prev <= 1) {
                    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
                    setIsPreparingPart2(false);
                    handleStartRecording();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current); };
    }
  }, [currentQuestionIndex, currentQuestionData, isRecording, step, handleStartRecording]);

  useEffect(() => {
    return () => {
      Object.values(audioPlayers.current).forEach(player => {
        (player as HTMLAudioElement).pause();
        (player as HTMLAudioElement).src = '';
      });
      recognitionManager.current.stop();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, []);
  
  const handleStopRecording = async () => {
    try {
      const result = await stopRecording();
      recognitionManager.current.stop();
      if (!result) throw new Error("Recording was empty.");

      setRecordedAudio(prev => ({ ...prev, [currentQuestionIndex]: result }));
      setIsRecording(false);
      
      if (isLastQuestion) {
        setStep('REVIEW');
      } else {
        setCurrentQuestionIndex(prev => prev + 1);
      }
    } catch (e) {
      setError('Failed to save recording.');
      setIsRecording(false);
    }
  };

  const handleDownloadAudio = (index: number) => {
    const audioData = recordedAudio[index];
    if (audioData) {
        const link = document.createElement('a');
        link.href = `data:${audioData.mimeType};base64,${audioData.base64}`;
        link.download = `q${index+1}_${topic.name.replace(/\s+/g, '_')}.webm`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };
  
  const playRecording = (index: number) => {
    const audioData = recordedAudio[index];
    if (audioData) {
        if (!audioPlayers.current[index]) {
            audioPlayers.current[index] = new Audio(`data:${audioData.mimeType};base64,${audioData.base64}`);
        }
        audioPlayers.current[index].play();
    }
  };

  const handleGetEvaluation = () => {
    const transcripts = allQuestions
        .map((q, i) => ({ question: q.cueCard ? q.cueCard.cueCard : q.question, transcript: sessionTranscripts[i] || '' }))
        .filter(item => item.transcript);

    if (transcripts.length === 0) {
        showToast("No answers were transcribed to evaluate.", "error");
        return;
    }
    setTranscriptsForEval(transcripts);
    setIsAiModalOpen(true);
  };

  const handleGenerateEvalPrompt = () => {
    if (!transcriptsForEval) return '';
    return getSpeakingEvaluationFromTextPrompt(topic.name, transcriptsForEval);
  };

  const handleAiEvaluationResult = async (result: { band: number; feedback: string }) => {
    try {
        if (!result || typeof result.band !== 'number' || !result.feedback || !transcriptsForEval) {
            throw new Error("Invalid JSON structure from AI or missing transcripts.");
        }

        setStep('ANALYZING');
      
        const newLog: SpeakingLog = {
            id: `spk-${Date.now()}`,
            userId: user.id,
            timestamp: Date.now(),
            part: isFullTest ? 'Full Test' : 'Custom',
            topicName: topic.name,
            sessionRecords: transcriptsForEval.map(t => ({ question: t.question, userTranscript: t.transcript })),
            estimatedBand: result.band,
            feedbackHtml: result.feedback,
        };

        await db.saveSpeakingLog(newLog);
        setFinalResult(newLog);
        setStep('RESULT');
        setIsAiModalOpen(false);
        setTranscriptsForEval(null);

    } catch (e: any) {
      console.error(e);
      throw new Error(e.message || 'Failed to process AI response.');
    }
  };

  return (
    <>
      <SpeakingSessionViewUI
        step={step}
        topicName={topic.name}
        currentQuestionIndex={currentQuestionIndex}
        totalQuestions={allQuestions.length}
        currentQuestionData={currentQuestionData}
        isRecording={isRecording}
        isPreparingPart2={isPreparingPart2}
        prepTimeLeft={prepTimeLeft}
        liveTranscript={liveTranscript}
        error={error}
        recordedAudio={recordedAudio}
        sessionTranscripts={sessionTranscripts}
        finalResult={finalResult}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onNextQuestion={() => setCurrentQuestionIndex(prev => prev + 1)}
        onSkipQuestion={() => setCurrentQuestionIndex(prev => prev + 1)}
        onGoToReview={() => setStep('REVIEW')}
        onBackToPractice={() => setStep('PRACTICING')}
        onDownloadAudio={handleDownloadAudio}
        onPlayAudio={playRecording}
        onTranscriptChange={(idx, val) => setSessionTranscripts(prev => ({ ...prev, [idx]: val }))}
        onGetEvaluation={handleGetEvaluation}
        onComplete={onComplete}
      />
      <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="EVALUATE_PARAPHRASE" title="Manual AI Evaluation" description="Your answers are transcribed in the prompt below. Copy it, get JSON from your AI, then paste the result." onGeneratePrompt={handleGenerateEvalPrompt} onJsonReceived={handleAiEvaluationResult}/>
    </>
  );
};

export default SpeakingSessionView;
