import React from 'react';
import { VocabularyItem } from '../../app/types';
import { Challenge, ChallengeResult, PrepositionQuizChallenge, ChallengeType } from './TestModalTypes';
import { TestModalHeader } from './TestModalHeader';
import { TestModalContent } from './TestModalContent';
import { TestModalFooter } from './TestModalFooter';
import { Settings, Play, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

// Re-export types so parent component (TestModal.tsx) doesn't break
export * from './TestModalTypes';

export interface TestModalUIProps {
  word: VocabularyItem;
  onClose: () => void;
  isModal?: boolean; // New prop
  
  // Setup Phase
  isSetupMode: boolean;
  isPreparing?: boolean;
  availableChallenges: Challenge[];
  selectedChallengeTypes: Set<ChallengeType>;
  onToggleChallenge: (type: ChallengeType) => void;
  onSetSelection: (types: Set<ChallengeType>) => void;
  onStartTest: () => void;

  // Test Phase
  challenges: Challenge[];
  currentChallenge: Challenge;
  currentChallengeIndex: number;
  userAnswers: any[];
  handleAnswerChange: (index: number, value: any) => void;
  results: (ChallengeResult | null)[] | null;
  isFinishing: boolean;
  currentPrepositionGroup: { startIndex: number; group: { challenge: PrepositionQuizChallenge; index: number }[] } | null;
  isLastChallenge: boolean;
  handleNextClick: () => void;
  handleBackClick: () => void;
  handleIgnore: () => void;
  handleFinishEarly: (stopSession?: boolean) => void;
  
  // Hint
  showHint: boolean;
  onToggleHint: () => void;
  
  // Session Position
  sessionPosition?: { current: number, total: number };
}

export const TestModalUI: React.FC<TestModalUIProps> = ({
  isModal = true, // Default to modal behavior
  word, onClose,
  isSetupMode, isPreparing, availableChallenges, selectedChallengeTypes, onToggleChallenge, onSetSelection, onStartTest,
  challenges, currentChallenge, currentChallengeIndex,
  userAnswers, handleAnswerChange, results, isFinishing,
  currentPrepositionGroup, isLastChallenge, handleNextClick, handleBackClick,
  handleIgnore, handleFinishEarly, showHint, onToggleHint,
  sessionPosition
}) => {
  
  let content;

  if (isSetupMode) {
      const handleSelectAll = () => onSetSelection(new Set(availableChallenges.map(c => c.type)));
      const handleSelectFailed = () => onSetSelection(new Set(availableChallenges.filter(c => word.lastTestResults?.[c.type] === false).map(c => c.type)));
      const handleSelectNew = () => onSetSelection(new Set(availableChallenges.filter(c => word.lastTestResults?.[c.type] === undefined).map(c => c.type)));
      const handleClearAll = () => onSetSelection(new Set());

      content = (
        <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-6 border-b border-neutral-100 bg-neutral-50/50 text-center">
                <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3 text-neutral-500"><Settings size={24} /></div>
                <h3 className="text-lg font-black text-neutral-900 leading-tight">Configure Test</h3>
                <p className="text-xs text-neutral-500 font-medium mt-1">Select challenges for <span className="font-bold text-neutral-800">"{word.word}"</span></p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                    <button onClick={handleClearAll} className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:bg-neutral-50 transition-colors">Clear</button>
                    <button onClick={handleSelectNew} className="px-3 py-1.5 rounded-lg bg-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-600 hover:bg-neutral-200 transition-colors">Not Tested</button>
                    <button onClick={handleSelectFailed} className="px-3 py-1.5 rounded-lg bg-red-50 text-[10px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-100 transition-colors">Failed</button>
                    <button onClick={handleSelectAll} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors">All</button>
                </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-3">
                <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Available Modules</div>
                {Array.from(new Set(availableChallenges.map(c => c.type))).map((type: ChallengeType) => {
                    const isSelected = selectedChallengeTypes.has(type);
                    const lastResult = word.lastTestResults?.[type as string];
                    const isFail = lastResult === false;
                    const isPass = lastResult === true;
                    const labelMap: Record<string, string> = { 'SPELLING': 'Spelling', 'IPA_QUIZ': 'Pronunciation', 'PREPOSITION_QUIZ': 'Prepositions', 'WORD_FAMILY': 'Word Family', 'MEANING_QUIZ': 'Meaning', 'PARAPHRASE_QUIZ': 'Word Power Recall', 'SENTENCE_SCRAMBLE': 'Sentence Builder', 'HETERONYM_QUIZ': 'Heteronym Challenge' };
                    return (
                        <div key={type} onClick={() => onToggleChallenge(type)} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group bg-white ${isSelected ? 'border-neutral-900 shadow-sm' : 'border-neutral-100 hover:border-neutral-200'}`}>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${isFail ? 'text-red-600' : isPass ? 'text-green-600' : 'text-neutral-900'}`}>{labelMap[type as string] || type}</span>{isFail && <span className="text-[9px] font-bold text-red-500 flex items-center gap-1 mt-0.5"><AlertCircle size={10} /> Last: Failed</span>}{isPass && <span className="text-[9px] font-bold text-green-600 flex items-center gap-1 mt-0.5"><CheckCircle2 size={10} /> Last: Passed</span>}{lastResult === undefined && <span className="text-[9px] font-bold text-neutral-400 mt-0.5">Not tested yet</span>}</div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200'}`}>{isSelected && <CheckCircle2 size={14} />}</div>
                        </div>
                    );
                })}
            </div>
            <div className="p-4 bg-white border-t border-neutral-100 flex gap-3">
                <button onClick={onClose} disabled={isPreparing} className="px-6 py-4 rounded-2xl bg-neutral-100 text-neutral-500 font-bold text-xs hover:bg-neutral-200 transition-colors disabled:opacity-50">Cancel</button>
                <button onClick={onStartTest} disabled={selectedChallengeTypes.size === 0 || isPreparing} className="flex-1 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100">{isPreparing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}<span>{isPreparing ? 'Preparing...' : 'Start Test'}</span></button>
            </div>
        </div>
      );
  } else {
    // Determine labels for Footer
    let nextLabelText = undefined;
    if (sessionPosition) {
        if (sessionPosition.current < sessionPosition.total) nextLabelText = "Next Item";
        else nextLabelText = "Finalize";
    }

    content = (
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] h-full">
        <TestModalHeader title={currentChallenge.title} type={currentChallenge.type} currentStep={sessionPosition ? sessionPosition.current : currentChallengeIndex + 1} totalSteps={sessionPosition ? sessionPosition.total : challenges.length} onClose={onClose} onFinish={handleFinishEarly} label={sessionPosition ? "Item" : "Challenge"} isQuickFire={!!sessionPosition}/>
        <div className="flex-1 p-8 overflow-y-auto no-scrollbar">
            <TestModalContent word={word} currentChallenge={currentChallenge} currentChallengeIndex={currentChallengeIndex} userAnswers={userAnswers} handleAnswerChange={handleAnswerChange} results={results} isFinishing={isFinishing} currentPrepositionGroup={currentPrepositionGroup} showHint={showHint}/>
        </div>
        <TestModalFooter onBack={handleBackClick} onNext={handleNextClick} onIgnore={handleIgnore} onHint={onToggleHint} showHint={showHint} isBackDisabled={!sessionPosition ? currentChallengeIndex === 0 : (sessionPosition.current === 1 && currentChallengeIndex === 0)} isNextDisabled={isFinishing} isLastChallenge={isLastChallenge} nextLabel={nextLabelText}/>
      </div>
    );
  }

  if (!isModal) {
    return content;
  }
  
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {content}
    </div>
  );
};