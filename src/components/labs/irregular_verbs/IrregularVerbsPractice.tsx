
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { IrregularVerb } from '../../../app/types';
import { IrregularVerbsPracticeUI } from './IrregularVerbsPractice_UI';
import { normalizeAnswerForGrading } from '../../../utils/challengeUtils';

interface Props {
  verbs: IrregularVerb[];
  mode: 'headword' | 'random' | 'quick';
  onComplete: (results: { verbId: string, result: 'pass' | 'fail', incorrectForms: ('v1'|'v2'|'v3')[] }[]) => void;
  onExit: () => void;
}

export const IrregularVerbsPractice: React.FC<Props> = ({ verbs, mode, onComplete, onExit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionResults, setSessionResults] = useState<{ verbId: string, result: 'pass' | 'fail', incorrectForms: ('v1'|'v2'|'v3')[] }[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  // --- Add refs and effect for saving on exit ---
  const onCompleteRef = useRef(onComplete);
  const sessionResultsRef = useRef(sessionResults);
  const isFinishedRef = useRef(isFinished);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    sessionResultsRef.current = sessionResults;
    isFinishedRef.current = isFinished;
  }, [sessionResults, isFinished]);

  useEffect(() => {
    return () => {
      // Automatically save progress if the session is exited early without finishing
      if (sessionResultsRef.current.length > 0 && !isFinishedRef.current) {
        onCompleteRef.current(sessionResultsRef.current);
      }
    };
  }, []); 

  const practiceQueue = useMemo(() => verbs.map(v => {
    let promptType: 'v1' | 'v2' | 'v3' = 'v1';
    if (mode === 'random') {
        const forms: ('v1' | 'v2' | 'v3')[] = ['v1'];
        if (v.v2) forms.push('v2');
        if (v.v3) forms.push('v3');
        promptType = forms[Math.floor(Math.random() * forms.length)];
    }
    return { verb: v, promptType };
  }).sort(() => Math.random() - 0.5), [verbs, mode]);

  const currentItem = practiceQueue[currentIndex];

  const handleAnswerChange = (field: string, value: string) => {
      setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const handleCheck = () => {
    if (!currentItem) return;
    const { verb, promptType } = currentItem;

    // Use standardized normalization from challengeUtils (Rule 3.3)
    const v1_correct = normalizeAnswerForGrading(answers.v1 || '') === normalizeAnswerForGrading(verb.v1);
    const v2_correct = normalizeAnswerForGrading(answers.v2 || '') === normalizeAnswerForGrading(verb.v2);
    const v3_correct = normalizeAnswerForGrading(answers.v3 || '') === normalizeAnswerForGrading(verb.v3);

    // If the prompt type is displayed, it counts as correct by default for scoring logic
    const isOverallCorrect = (promptType !== 'v1' ? v1_correct : true) &&
                             (promptType !== 'v2' ? v2_correct : true) &&
                             (promptType !== 'v3' ? v3_correct : true);

    const incorrectForms: ('v1'|'v2'|'v3')[] = [];
    if (promptType !== 'v1' && !v1_correct) incorrectForms.push('v1');
    if (promptType !== 'v2' && !v2_correct) incorrectForms.push('v2');
    if (promptType !== 'v3' && !v3_correct) incorrectForms.push('v3');
    
    setIsAnswered(true);
    setSessionResults(prev => [...prev, { verbId: verb.id, result: isOverallCorrect ? 'pass' : 'fail', incorrectForms }]);
  };

  const handleNext = () => {
    if (currentIndex < practiceQueue.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setAnswers({});
      setIsAnswered(false);
      setIsRevealed(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleQuickAnswer = (result: 'pass' | 'fail') => {
    if (isFinished || !currentItem) return;
    setSessionResults(prev => [...prev, { verbId: currentItem.verb.id, result, incorrectForms: result === 'fail' ? ['v1', 'v2', 'v3'] : [] }]);
    handleNext();
  };

  if (!currentItem && !isFinished) return null;

  return (
      <IrregularVerbsPracticeUI
          verbs={verbs}
          mode={mode}
          currentIndex={currentIndex}
          practiceQueue={practiceQueue}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onEnterPress={handleCheck}
          isAnswered={isAnswered}
          isFinished={isFinished}
          isRevealed={isRevealed}
          sessionResults={sessionResults}
          onCheck={handleCheck}
          onNext={handleNext}
          onQuickAnswer={handleQuickAnswer}
          onReveal={() => setIsRevealed(true)}
          onFinish={() => onComplete(sessionResults)}
          onExit={onExit}
      />
  );
};
