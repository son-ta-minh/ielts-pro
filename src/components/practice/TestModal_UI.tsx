
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { VocabularyItem } from '../../app/types';
import { Challenge, ChallengeResult, PrepositionQuizChallenge, ChallengeType, ParaphraseQuizChallenge, CollocationQuizChallenge, IdiomQuizChallenge, RecapData } from './TestModalTypes';
import { TestModalHeader } from './TestModalHeader';
import { TestModalContent } from './TestModalContent';
import { TestModalFooter } from './TestModalFooter';
import { Settings, Play, CheckCircle2, AlertCircle, Loader2, Check, Type, Volume2, BookOpen, Combine, Quote, AtSign, Zap, Shuffle, Network, Grid2X2, ChevronDown, X, Sparkles, Layers, Eraser, CircleDashed, Bolt, RotateCw, Heart, HelpCircle, GraduationCap, XCircle, ArrowRight, Swords } from 'lucide-react';

// Re-export types so parent component (TestModal.tsx) doesn't break
export * from './TestModalTypes';

export interface TestModalUIProps {
  word: VocabularyItem;
  onClose: () => void;
  isModal?: boolean;
  
  // Setup Phase
  isSetupMode: boolean;
  isPreparing?: boolean;
  availableChallenges: Challenge[];
  selectedChallengeTypes: Set<ChallengeType>;
  onToggleChallenge: (type: ChallengeType) => void;
  onSetSelection: (types: Set<ChallengeType>) => void;
  onStartTest: () => void;
  // CHANGED: Use scores instead of statuses
  challengeStats: Map<ChallengeType, { score: number, total: number, attempted: number }>;
  onSelectQuick: () => void;
  onSelectPreferred: () => void; 
  onSelectZeroScore: () => void;
  onSelectPartialScore: () => void;
  onRetryFailed: () => void;
  isQuickMode?: boolean;

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
  disableHints?: boolean;
  
  // Session Position
  sessionPosition?: { current: number, total: number };
  
  // Timer
  elapsedTime?: string;
  
  // Recap
  recapData?: RecapData | null;
  onRecalculateFinish?: () => void;
  
  // Mastery
  isMastered?: boolean;
}

// Configuration for Knowledge Areas
interface KnowledgeAreaDef {
    id: string;
    label: string;
    icon: React.ElementType;
    types: ChallengeType[]; // Priority order: [Match, Multi, Fill/Standard]
}

interface KnowledgeGroup {
    id: string;
    title: string;
    description: string;
    areas: KnowledgeAreaDef[];
    color: string;
    bg: string;
    border: string;
}

const KNOWLEDGE_GROUPS: KnowledgeGroup[] = [
    {
        id: 'core',
        title: 'Core Skills',
        description: 'Essential accuracy',
        color: 'text-blue-700',
        bg: 'bg-blue-50/60',
        border: 'border-blue-100',
        areas: [
            { id: 'spelling', label: 'Spelling', icon: Type, types: ['SPELLING'] },
            { id: 'sound', label: 'Sound', icon: Volume2, types: ['PRONUNCIATION', 'IPA_QUIZ', 'HETERONYM_QUIZ'] },
            { id: 'meaning', label: 'Meaning', icon: BookOpen, types: ['MEANING_QUIZ'] },
            { id: 'preposition', label: 'Prep.', icon: AtSign, types: ['PREPOSITION_QUIZ'] },
        ]
    },
    {
        id: 'advanced',
        title: 'Advanced Usage',
        description: 'Fluency & range',
        color: 'text-purple-700',
        bg: 'bg-purple-50/60',
        border: 'border-purple-100',
        areas: [
            { id: 'family', label: 'Word Family', icon: Network, types: ['WORD_FAMILY'] },
            { id: 'collocation', label: 'Collocation', icon: Combine, types: ['COLLOCATION_CONTEXT_QUIZ', 'COLLOCATION_MULTICHOICE_QUIZ', 'COLLOCATION_QUIZ'] },
            { id: 'paraphrase', label: 'Paraphrase', icon: Zap, types: ['PARAPHRASE_CONTEXT_QUIZ', 'PARAPHRASE_QUIZ'] },
        ]
    },
    {
        id: 'bonus',
        title: 'Good to Have',
        description: 'Context & Flair',
        color: 'text-amber-700',
        bg: 'bg-amber-50/60',
        border: 'border-amber-100',
        areas: [
            { id: 'idiom', label: 'Idiom', icon: Quote, types: ['IDIOM_CONTEXT_QUIZ', 'IDIOM_QUIZ'] },
            { id: 'example', label: 'Example', icon: Shuffle, types: ['SENTENCE_SCRAMBLE'] },
        ]
    }
];

const LABELS: Record<string, string> = {
    'MEANING_QUIZ': 'Select',
    'COLLOCATION_CONTEXT_QUIZ': 'Match',
    'COLLOCATION_MULTICHOICE_QUIZ': 'Multi',
    'COLLOCATION_QUIZ': 'Fill',
    'PARAPHRASE_CONTEXT_QUIZ': 'Match',
    'PARAPHRASE_QUIZ': 'Fill',
    'PREPOSITION_QUIZ': 'Fill',
    'IDIOM_QUIZ': 'Fill',
    'IDIOM_CONTEXT_QUIZ': 'Match',
    'PRONUNCIATION': 'Speak',
    'IPA_QUIZ': 'IPA',
    'HETERONYM_QUIZ': 'Match',
    'SPELLING': 'Dictation',
    'SENTENCE_SCRAMBLE': 'Build',
    'WORD_FAMILY': 'Fill'
};

const TEST_GUIDE = [
    { label: 'Dictation', desc: 'Listen to the word and type the exact spelling.' },
    { label: 'Speak', desc: 'Pronounce the word clearly into your microphone.' },
    { label: 'IPA', desc: 'Identify the correct phonetic transcription.' },
    { label: 'Select', desc: 'Choose the correct meaning from options.' },
    { label: 'Fill', desc: 'Type missing parts (Prepositions, Idioms, Families).' },
    { label: 'Match', desc: 'Connect related items (Collocations, Idioms, Contexts).' },
    { label: 'Build', desc: 'Reorder scrambled words to form a valid sentence.' },
    { label: 'Multi', desc: 'Multiple choice for collocations.' }
];

const getScoreBadge = (score: number, total: number, attempted: number, attemptedTotal: number) => {
    if (total === 0) return { label: 'N/A', color: 'bg-neutral-50 text-neutral-400 border-neutral-100' };
    if (attempted === 0) return { label: `${score}/${total}`, color: 'bg-neutral-50 text-neutral-600 border-neutral-200' };
    const effectiveTotal = attemptedTotal > 0 ? attemptedTotal : total;
    let color = 'bg-red-50 text-red-600 border-red-100';
    if (score === effectiveTotal) color = 'bg-green-50 text-green-700 border-green-100';
    else if (score > 0) color = 'bg-yellow-50 text-yellow-700 border-yellow-100';
    
    return { label: `${score}/${effectiveTotal}`, color };
};

const ChallengeResultIcon: React.FC<{ passed: boolean }> = ({ passed }) => (
    passed 
    ? <div className="p-1 bg-green-100 rounded-full text-green-600"><Check size={12} /></div>
    : <div className="p-1 bg-red-100 rounded-full text-red-600"><X size={12} /></div>
);

const getStatusColor = (status: string) => {
    switch(status) {
        case 'NEW': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'LEARNED': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
        case 'EASY': return 'bg-green-100 text-green-700 border-green-200';
        case 'HARD': return 'bg-orange-100 text-orange-700 border-orange-200';
        case 'FORGOT': return 'bg-red-100 text-red-700 border-red-200';
        default: return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    }
};

export const TestModalUI: React.FC<TestModalUIProps> = ({
  isModal = true,
  word, onClose,
  isSetupMode, isPreparing, availableChallenges, selectedChallengeTypes, onSetSelection, onStartTest, 
  challengeStats,
  challenges, currentChallenge, currentChallengeIndex,
  userAnswers, handleAnswerChange, results, isFinishing,
  currentPrepositionGroup, isLastChallenge, handleNextClick, handleBackClick,
  handleIgnore, handleFinishEarly, showHint, onToggleHint, disableHints,
  sessionPosition, elapsedTime, onSelectQuick, onSelectPreferred, onSelectZeroScore, onSelectPartialScore, onRetryFailed,
  recapData, onRecalculateFinish, isMastered
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Collapsed state control
  const [hoverMessage, setHoverMessage] = useState<string | null>(null);

  useEffect(() => {
      if (contentRef.current) {
          contentRef.current.scrollTop = 0;
      }
  }, [currentChallengeIndex, word]);
  
  // --- SETUP MODE LOGIC ---
  const availableTypesSet = useMemo(() => new Set(availableChallenges.map(c => c.type)), [availableChallenges]);

  const handleAreaChange = (areaTypes: ChallengeType[], newType: string) => {
      const nextSelection = new Set(selectedChallengeTypes);
      areaTypes.forEach(t => nextSelection.delete(t));
      if (newType !== 'none') {
          nextSelection.add(newType as ChallengeType);
      }
      onSetSelection(nextSelection);
  };

  const getAllAreas = () => KNOWLEDGE_GROUPS.flatMap(g => g.areas);

  const handleSelectAllSmart = () => {
      const nextSelection = new Set<ChallengeType>();
      getAllAreas().forEach(area => {
          const bestType = area.types.find(t => availableTypesSet.has(t));
          if (bestType) nextSelection.add(bestType);
      });
      onSetSelection(nextSelection);
  };

  let content;

  if (recapData) {
      // --- RECAP VIEW ---
      const masteryGain = Math.max(0, recapData.newMastery - recapData.oldMastery);

      // Grouping Results by Type
      const groupedResults: { type: string, label: string, passed: number, total: number }[] = Object.values(recapData.results.reduce((acc, res) => {
        if (!acc[res.type]) {
            // Determine friendly label
            let label = LABELS[res.type] || res.type;
            const area = getAllAreas().find(a => a.types.includes(res.type));
            if (area) label = `${area.label} ${LABELS[res.type] || ''}`; // e.g. "Collocation Fill"
            
            acc[res.type] = { type: res.type, label: label.trim(), passed: 0, total: 0 };
        }
        acc[res.type].total++;
        if (res.passed) acc[res.type].passed++;
        return acc;
      }, {} as Record<string, { type: string, label: string, passed: number, total: number }>));
      
      content = (
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500">
              <div className="flex-1 overflow-y-auto p-8 text-center space-y-6 custom-scrollbar">
                  <div className="inline-flex p-4 bg-green-50 rounded-full text-green-600 mb-2 shadow-inner">
                      <CheckCircle2 size={48} />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Session Complete!</h2>
                    <p className="text-sm text-neutral-500 font-medium">Here's how you improved.</p>
                  </div>

                  <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-100 space-y-6">
                      {/* Mastery Progress */}
                      <div className="space-y-2">
                          <div className="flex justify-between items-end px-1">
                              <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Mastery Score</span>
                              <span className="text-sm font-black text-neutral-900 flex items-center gap-1">
                                  {recapData.oldMastery}% 
                                  <ArrowRight size={14} className="text-neutral-300"/> 
                                  <span className="text-green-600">{recapData.newMastery}%</span>
                                  {masteryGain > 0 && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-full ml-1">+{masteryGain}</span>}
                              </span>
                          </div>
                          <div className="h-3 w-full bg-neutral-200 rounded-full overflow-hidden relative">
                              <div className="absolute top-0 left-0 h-full bg-neutral-400" style={{ width: `${recapData.oldMastery}%` }}></div>
                              <div className="absolute top-0 h-full bg-green-500 animate-pulse" style={{ left: `${recapData.oldMastery}%`, width: `${masteryGain}%` }}></div>
                          </div>
                      </div>

                      {/* Status Transition */}
                      <div className="flex items-center justify-center gap-3">
                          <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase border ${getStatusColor(recapData.oldStatus)}`}>{recapData.oldStatus}</span>
                          <ArrowRight size={16} className="text-neutral-300" />
                          <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase border ${getStatusColor(recapData.newStatus)}`}>{recapData.newStatus}</span>
                      </div>
                  </div>

                  {/* Detailed Results - Grouped */}
                  <div className="space-y-2 text-left">
                      <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest px-2">Challenge Summary</h4>
                      <div className="flex flex-col gap-2">
                          {groupedResults.map((group, idx) => {
                              const isPerfect = group.passed === group.total;
                              const isFailed = group.passed === 0;
                              
                              let bgClass = 'bg-white border-neutral-100';
                              let textClass = 'text-neutral-700';
                              let icon = null;

                              if (isPerfect) {
                                  bgClass = 'bg-green-50 border-green-100';
                                  textClass = 'text-green-800';
                                  icon = <Check size={14} className="text-green-600"/>;
                              } else if (isFailed) {
                                  bgClass = 'bg-red-50 border-red-100';
                                  textClass = 'text-red-800';
                                  icon = <X size={14} className="text-red-600"/>;
                              } else {
                                  bgClass = 'bg-orange-50 border-orange-100';
                                  textClass = 'text-orange-800';
                                  icon = <div className="text-[10px] font-black text-orange-600">{Math.round((group.passed/group.total)*100)}%</div>
                              }

                              return (
                                  <div key={idx} className={`flex items-center justify-between p-3 border rounded-xl shadow-sm ${bgClass}`}>
                                      <span className={`text-xs font-bold ${textClass}`}>{group.label}</span>
                                      <div className="flex items-center gap-3">
                                          <span className={`text-[10px] font-black uppercase tracking-wider ${textClass}`}>
                                              {group.passed} / {group.total}
                                          </span>
                                          <div className={`p-1 rounded-full bg-white/50`}>
                                              {icon}
                                          </div>
                                      </div>
                                  </div>
                              )
                          })}
                      </div>
                  </div>
              </div>
              
              <div className="p-6 bg-white border-t border-neutral-100 shrink-0">
                  <div className="flex flex-col gap-3">
                      <button
                          onClick={onRecalculateFinish}
                          className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-neutral-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                          <span>Continue</span>
                          <ArrowRight size={18} />
                      </button>
                  </div>
              </div>
          </div>
      );
  } else if (isSetupMode) {
      const isSelectionEmpty = selectedChallengeTypes.size === 0;
      const hasFailedArea = Array.from(challengeStats.values())
        .some(stat => stat.total > 0 && stat.attempted > 0 && stat.score < stat.total);
      
      // Calculate Total Mastery for Header
      let totalCurrent = 0;
      let totalMax = 0;
      challengeStats.forEach((stat) => {
          totalCurrent += stat.score;
          totalMax += stat.total;
      });
      
      // Calculate Progress Circle Props
      const masteryPercentage = totalMax > 0 ? (totalCurrent / totalMax) * 100 : 0;
      const radius = 60;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (masteryPercentage / 100) * circumference;

      content = (
        <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-100 bg-white/80 backdrop-blur-sm flex justify-between items-center shrink-0 z-20 relative">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-neutral-900 text-white rounded-xl flex items-center justify-center shadow-lg shadow-neutral-900/20">
                        <Grid2X2 size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-neutral-900 leading-none tracking-tight">Test Setup</h3>
                        <p className="text-xs font-bold text-neutral-500 mt-1">Target: <span className="text-neutral-900">{word.word}</span></p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                     <div className="flex flex-col items-end mr-2">
                        <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Mastery</span>
                        <div className="flex items-baseline gap-1">
                             <span className={`text-xl font-black leading-none ${totalCurrent === totalMax && totalMax > 0 ? 'text-green-600' : 'text-neutral-900'}`}>{totalCurrent}</span>
                             <span className="text-sm font-bold text-neutral-400">/{totalMax}</span>
                        </div>
                     </div>
                     <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={`p-2.5 rounded-xl transition-all ${isSettingsOpen ? 'bg-neutral-900 text-white shadow-md' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`} title="Configure Test">
                        <Settings size={20} />
                     </button>
                    <button onClick={onClose} className="p-2.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>
            </div>
            
            {/* Main Body Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                {isSettingsOpen ? (
                    // --- EXPANDED SETTINGS VIEW ---
                    <div className="flex flex-col h-full animate-in slide-in-from-top-4 duration-300">
                         {/* Selection Toolbar */}
                        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 flex flex-wrap gap-2 shrink-0 z-10 justify-center">
                            <button onClick={handleSelectAllSmart} className="px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 font-bold text-[10px] uppercase tracking-wider hover:bg-neutral-50 transition-colors flex items-center gap-1.5 shadow-sm">
                                <Layers size={12}/> All
                            </button>
                            <button onClick={() => onSetSelection(new Set())} className="px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-400 font-bold text-[10px] uppercase tracking-wider hover:bg-neutral-50 hover:text-neutral-600 transition-colors flex items-center gap-1.5 shadow-sm">
                                <Eraser size={12}/> Clear
                            </button>
                            <button onClick={() => setShowHelp(!showHelp)} className="px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-500 font-bold text-[10px] uppercase tracking-wider hover:bg-neutral-50 hover:text-indigo-500 transition-colors flex items-center gap-1.5 shadow-sm ml-auto">
                                <HelpCircle size={12}/> Guide
                            </button>
                        </div>
                        
                        {/* Help Guide (Collapsible) */}
                         {showHelp && (
                            <div className="bg-neutral-50 border-b border-neutral-100 p-4 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2">
                                {TEST_GUIDE.map(g => (
                                    <div key={g.label} className="text-[10px] text-neutral-500 leading-tight">
                                        <span className="font-black text-indigo-600 uppercase mr-1">{g.label}:</span>{g.desc}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="p-4 space-y-3">
                             {KNOWLEDGE_GROUPS.map(group => {
                                const validAreas = group.areas.filter(area => area.types.some(t => availableTypesSet.has(t)));
                                if (validAreas.length === 0) return null;

                                let groupCurrent = 0; let groupMax = 0;
                                validAreas.forEach(area => { area.types.forEach(t => { const stat = challengeStats.get(t); if(stat) { groupCurrent += stat.score; groupMax += stat.total; } }); });

                                return (
                                    <div key={group.id} className={`rounded-2xl border ${group.border} ${group.bg} p-4`}>
                                        <div className="flex items-baseline justify-between mb-3 border-b border-black/5 pb-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className={`text-xs font-black uppercase tracking-widest ${group.color}`}>{group.title}</h4>
                                                <span className="text-[10px] font-bold text-neutral-500 opacity-60 bg-white/50 px-1.5 py-0.5 rounded-md">({groupCurrent}/{groupMax})</span>
                                            </div>
                                            <span className="text-[10px] font-bold text-neutral-500 opacity-60">{group.description}</span>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            {validAreas.map(area => {
                                                const availableInArea = area.types.filter(t => availableTypesSet.has(t));
                                                if (availableInArea.length === 0) return null;
                                                const selectedInArea = area.types.find(t => selectedChallengeTypes.has(t));
                                                let areaCurrent = 0; let areaMax = 0; let areaAttempted = 0; let areaAttemptedTotal = 0;
                                                area.types.forEach(t => {
                                                    const stat = challengeStats.get(t);
                                                    if (stat) {
                                                        areaCurrent += stat.score;
                                                        areaMax += stat.total;
                                                        areaAttempted += stat.attempted;
                                                        if (stat.attempted > 0) areaAttemptedTotal += stat.total;
                                                    }
                                                });
                                                const badge = getScoreBadge(areaCurrent, areaMax, areaAttempted, areaAttemptedTotal);
                                                const hasFail = areaAttempted > 0 && areaCurrent === 0;
                                                const effectiveAreaMax = areaAttempted > 0 ? areaAttemptedTotal : areaMax;
                                                const hasFullPass = effectiveAreaMax > 0 && areaCurrent === effectiveAreaMax;
                                                const hasPartialPass = areaCurrent > 0 && areaCurrent < effectiveAreaMax;
                                                const isUnattempted = areaAttempted === 0;

                                                return (
                                                    <div key={area.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-xl bg-white/40 hover:bg-white/70 transition-colors border border-transparent hover:border-black/5">
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className="p-1.5 bg-white rounded-lg shadow-sm text-neutral-600"><area.icon size={14} /></div>
                                                            <span className={`text-xs font-bold ${
                                                                hasFail ? 'text-red-600' :
                                                                hasFullPass ? 'text-green-700' :
                                                                hasPartialPass ? 'text-yellow-700' :
                                                                isUnattempted ? 'text-neutral-900' :
                                                                selectedInArea ? 'text-neutral-900' : 'text-neutral-600'
                                                            }`}>
                                                               {area.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5 justify-end">
                                                            {availableInArea.map(type => {
                                                                const isSelected = selectedInArea === type;
                                                                return (
                                                                    <button key={type} onClick={() => handleAreaChange(area.types, isSelected ? 'none' : type)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${isSelected ? 'bg-neutral-900 border-neutral-900 text-white shadow-md transform scale-105' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'}`}>
                                                                        {LABELS[type] || 'Quiz'}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    // --- COLLAPSED HERO VIEW ---
                    <div className="flex flex-col items-center justify-center h-full p-8 space-y-8 animate-in zoom-in-95 duration-500">
                         {/* Mastery Gauge */}
                         <div className="relative w-48 h-48 flex items-center justify-center">
                            <svg className="absolute w-full h-full transform -rotate-90">
                                <circle cx="50%" cy="50%" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" className="text-neutral-100" />
                                <circle
                                  cx="50%"
                                  cy="50%"
                                  r={radius}
                                  stroke="currentColor"
                                  strokeWidth="12"
                                  fill="transparent"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={offset}
                                  strokeLinecap="round"
                                  className={`transition-all duration-1000 ease-out ${
                                    masteryPercentage === 100
                                      ? 'text-green-500'
                                      : masteryPercentage >= 50
                                      ? 'text-yellow-500'
                                      : 'text-red-500'
                                  }`}
                                />
                            </svg>
                            <div className="flex flex-col items-center">
                                <span className="text-4xl font-black text-neutral-900 tracking-tighter">{masteryPercentage.toFixed(0)}%</span>
                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest mt-1">Mastery</span>
                            </div>
                         </div>
                         
                         <p className="text-center text-sm font-medium text-neutral-500 max-w-xs leading-relaxed transition-all duration-200 min-h-[48px] flex items-center justify-center">
                            {hoverMessage
                                ? hoverMessage
                                : totalCurrent === totalMax
                                ? "Incredible! You have mastered all challenges for this word. Keep practicing to maintain it."
                                : "Ready to improve? Choose a quick mix or focus on what you haven't mastered yet."}
                         </p>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-5 bg-white border-t border-neutral-100 flex items-center justify-center shrink-0 z-20 gap-4">
                {isSettingsOpen ? (
                     <button 
                        onClick={onStartTest} 
                        disabled={isSelectionEmpty || isPreparing} 
                        className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 hover:shadow-2xl shadow-neutral-900/20"
                    >
                        {isPreparing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                        <span>{isPreparing ? 'Preparing...' : 'Start Custom Test'}</span>
                    </button>
                ) : (
                    <>
                      {hasFailedArea && (
                          <button
                              onMouseEnter={() => setHoverMessage("Retry only the tests you failed.")}
                              onMouseLeave={() => setHoverMessage(null)}
                              onClick={onRetryFailed}
                              className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-200"
                          >
                              <RotateCw size={18} />
                              <span>Retry Failed</span>
                          </button>
                      )}

                      {isMastered ? (
                          <button
                              onMouseEnter={() => setHoverMessage("Hard mode: focus on advanced usage and tougher variations.")}
                              onMouseLeave={() => setHoverMessage(null)}
                              onClick={onSelectPartialScore}
                              className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-700 transition-all active:scale-95 shadow-lg shadow-rose-200"
                          >
                              <Swords size={18} />
                              <span>Challenge</span>
                          </button>
                      ) : (
                          <button
                              onMouseEnter={() => setHoverMessage("Complete all unpassed tests including failed and untouched ones.")}
                              onMouseLeave={() => setHoverMessage(null)}
                              onClick={onSelectZeroScore}
                              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200"
                          >
                              <GraduationCap size={18} />
                              <span>Master It</span>
                          </button>
                      )}

                      <button
                          onMouseEnter={() => setHoverMessage("Core usage only. Fast mixed review.")}
                          onMouseLeave={() => setHoverMessage(null)}
                          onClick={onSelectQuick}
                          className="flex-1 py-4 bg-cyan-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-cyan-600 transition-all active:scale-95 shadow-lg shadow-cyan-200"
                      >
                          <Bolt size={18} />
                          <span>Quick Test</span>
                      </button>
                    </>
                )}
            </div>
        </div>
      );
  } else {
    // --- TESTING MODE UI (Unchanged) ---
    let nextLabelText = undefined;
    if (sessionPosition) {
        if (sessionPosition.current < sessionPosition.total) nextLabelText = "Next Item";
        else nextLabelText = "Finalize";
    }

    content = (
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] h-full">
        <TestModalHeader title={currentChallenge.title} type={currentChallenge.type} currentStep={sessionPosition ? sessionPosition.current : currentChallengeIndex + 1} totalSteps={sessionPosition ? sessionPosition.total : challenges.length} onClose={onClose} onFinish={handleFinishEarly} label={sessionPosition ? "Item" : "Challenge"} isQuickFire={!!sessionPosition} elapsedTime={elapsedTime} />
        <div ref={contentRef} className="flex-1 p-8 overflow-y-auto no-scrollbar">
            <TestModalContent 
              word={word} 
              currentChallenge={currentChallenge} 
              currentChallengeIndex={currentChallengeIndex} 
              userAnswers={userAnswers} 
              handleAnswerChange={handleAnswerChange} 
              results={results} 
              isFinishing={isFinishing} 
              currentPrepositionGroup={currentPrepositionGroup} 
              showHint={showHint}
              onEnterPress={handleNextClick}
            />
        </div>
        <TestModalFooter onBack={handleBackClick} onNext={handleNextClick} onIgnore={handleIgnore} onHint={onToggleHint} showHint={showHint} isBackDisabled={!sessionPosition ? currentChallengeIndex === 0 : (sessionPosition.current === 1 && currentChallengeIndex === 0)} isNextDisabled={isFinishing} isLastChallenge={isLastChallenge} nextLabel={nextLabelText} disableHints={disableHints}/>
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
