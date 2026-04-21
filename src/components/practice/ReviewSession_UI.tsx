
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, Check, X, HelpCircle, Trophy, BookOpen, Lightbulb, RotateCw, CheckCircle2, Eye, BrainCircuit, ArrowLeft, ArrowRight, BookCopy, Loader2, MinusCircle, Flag, Zap, Mic, AtSign, Combine, MessageSquare, Keyboard, Sparkles } from 'lucide-react';
import { StudyItem, ReviewGrade, SessionType, User, StudyItemQuality, LearnedStatus } from '../../app/types';
import { speak } from '../../utils/audio';
import EditStudyItemModal from '../study_lib/EditStudyItemModal';
import ViewStudyItemModal from '../study_lib/ViewStudyItemModal';
import TestModal from './TestModal';
import { SimpleMimicModal } from '../common/SimpleMimicModal';
import { generateAvailableChallenges } from '../../utils/challengeUtils';
import { ChallengeType, Challenge, CollocationQuizChallenge, IdiomQuizChallenge, ParaphraseQuizChallenge, PrepositionQuizChallenge } from './TestModalTypes';
import { calculateMasteryScore, getAllValidTestKeys } from '../../utils/srs';
import { normalizeTestResultKeys } from '../../utils/testResultUtils';
import { getConfig, getStudyBuddyAiUrl } from '../../app/settingsManager';

const GENERATED_EXAMPLE_BUFFER_SIZE = 5;
const GENERATED_QUIZ_BUFFER_SIZE = 4;

const normalizeExampleLine = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const splitExampleLines = (value: string): string[] =>
    String(value || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(Boolean);

const ALWAYS_VISIBLE_HINT_WORDS = new Set([
    'i', 'a', 'an', 'the',
    'my', 'mine', 'your', 'yours', 'his', 'her', 'hers', 'its', 'our', 'ours', 'their', 'theirs',
    'this', 'that', 'these', 'those',
    'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'about', 'into', 'over', 'after',
    'and', 'or', 'but'
]);

const getWordRevealPrefix = (word: string, visibleChars: number): string => {
    const chars = Array.from(word);
    const visiblePrefix: string[] = [];

    for (const char of chars) {
        if (/[\p{L}\p{N}]/u.test(char)) {
            visiblePrefix.push(char);
        }
        if (visiblePrefix.length >= visibleChars) {
            break;
        }
    }

    return visiblePrefix.join('');
};

const normalizeHintToken = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
const HINT_MASK_SUFFIX = '__';
const formatHintWord = (word: string, visibleChars: number): string => {
    const prefix = getWordRevealPrefix(word, visibleChars);
    if (!prefix) return word;
    return normalizeHintToken(prefix).length >= normalizeHintToken(word).length
        ? word
        : `${prefix}${HINT_MASK_SUFFIX}`;
};

const createMaskedAnswerHint = (answer: string, hintLevel: number, headword: string): string => {
    const shouldKeepHeadwordVisible = countWords(headword) === 1;
    const normalizedHeadword = normalizeHintToken(headword);
    const masked = String(answer || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word, index) => {
            const normalizedWord = word.toLowerCase();
            const normalizedToken = normalizeHintToken(word);

            if (
                ALWAYS_VISIBLE_HINT_WORDS.has(normalizedWord) ||
                normalizedToken.length <= 1 ||
                (shouldKeepHeadwordVisible && normalizeHintToken(word) === normalizedHeadword)
            ) {
                return word;
            }

            if (hintLevel <= 1) {
                return formatHintWord(word, 1);
            }

            if (hintLevel === 2) {
                return formatHintWord(word, 3);
            }

            const fullyRevealedWordCount = hintLevel - 2;
            if (index < fullyRevealedWordCount) {
                return word;
            }

            return formatHintWord(word, 3);
        })
        .join(' ');

    return masked || 'No hint right now.';
};

const getAudienceInstruction = (user: User): string => {
    const targetAudience = user.lessonPreferences?.targetAudience || 'Adult';
    if (targetAudience === 'Kid') {
        return 'Write kid-friendly, simple, natural examples suitable for a child learner. Avoid IELTS exam prompts, adult work contexts, and abstract academic situations.';
    }
    return 'Write natural examples suitable for an adult learner. Keep them useful for everyday communication or study.';
};

const getLearnerProfileInstruction = (user: User): string => {
    const targetAudience = user.lessonPreferences?.targetAudience || 'Adult';
    const role = String(user.role || '').trim();
    const level = String(user.currentLevel || '').trim();
    const target = String(user.target || '').trim();

    const profileParts = [
        targetAudience === 'Kid' ? 'child learner' : 'adult learner',
        role,
        level,
        target
    ].filter(Boolean);

    if (profileParts.length === 0) {
        return 'Match a general English learner profile.';
    }

    return `Match this learner profile: ${profileParts.join(' | ')}.`;
};

type StudyBuddyQuizItem = {
    question: string;
    answer: string;
};

type StudyBuddyQuizValidationResult = {
    isValid: boolean;
    retryMessage?: string;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const maskAnswerInSentence = (sentence: string, answer: string, headword: string): string => {
    const cleanSentence = String(sentence || '').trim();
    const cleanAnswer = String(answer || '').trim();

    if (!cleanSentence) return '';
    if (!cleanAnswer) return cleanSentence;

    const pattern = new RegExp(`\\b${escapeRegExp(cleanAnswer)}\\b`, 'iu');
    if (pattern.test(cleanSentence)) {
        if (countWords(headword) === 1) {
            const normalizedHeadword = normalizeHintToken(headword);
            const partialMask = cleanAnswer
                .split(/\s+/)
                .filter(Boolean)
                .map((word) => normalizeHintToken(word) === normalizedHeadword ? word : '___')
                .join(' ');

            return cleanSentence.replace(pattern, partialMask || '___');
        }

        return cleanSentence.replace(pattern, '___');
    }

    return cleanSentence;
};

const countWords = (value: string): number => String(value || '').trim().split(/\s+/).filter(Boolean).length;

const isShortNaturalCollocation = (answer: string, headword: string): boolean => {
    const cleanAnswer = String(answer || '').trim();
    if (!cleanAnswer) return false;

    const headwordWordCount = Math.max(1, countWords(headword));
    const answerWordCount = countWords(cleanAnswer);

    return answerWordCount >= headwordWordCount && answerWordCount <= headwordWordCount + 2;
};

const getHintVisibleCharCount = (value: string): number => normalizeHintToken(String(value || '').replace(/_/g, '')).length;
const stripHintMaskMarkers = (value: string): string => String(value || '').replace(/_/g, '');

const mergeHintWithUserInput = (answer: string, nextHint: string, currentInput: string): string => {
    const answerWords = String(answer || '').trim().split(/\s+/).filter(Boolean);
    const nextHintWords = String(nextHint || '').trim().split(/\s+/).filter(Boolean);
    const currentInputWords = String(currentInput || '').trim().split(/\s+/).filter(Boolean);
    const mergedWords: string[] = [];
    const maxLength = Math.max(answerWords.length, nextHintWords.length, currentInputWords.length);

    for (let index = 0; index < maxLength; index += 1) {
        const answerWord = answerWords[index] || '';
        const nextHintWord = nextHintWords[index] || '';
        const currentInputWord = currentInputWords[index] || '';

        if (!nextHintWord) {
            if (currentInputWord) mergedWords.push(currentInputWord);
            continue;
        }

        if (!currentInputWord) {
            mergedWords.push(nextHintWord);
            continue;
        }

        if (!answerWord) {
            mergedWords.push(nextHintWord);
            continue;
        }

        const normalizedAnswerWord = normalizeHintToken(answerWord);
        const normalizedCurrentWord = normalizeHintToken(currentInputWord);
        const currentVisibleChars = getHintVisibleCharCount(currentInputWord);
        const nextVisibleChars = getHintVisibleCharCount(nextHintWord);

        const isCurrentCompatible =
            !!normalizedCurrentWord &&
            normalizedAnswerWord.startsWith(normalizedCurrentWord);

        const isCurrentExactMatch = normalizedCurrentWord === normalizedAnswerWord;

        if (isCurrentExactMatch) {
            mergedWords.push(answerWord);
            continue;
        }

        if (isCurrentCompatible && currentVisibleChars > nextVisibleChars) {
            mergedWords.push(currentInputWord);
            continue;
        }

        mergedWords.push(nextHintWord);
    }

    return mergedWords.join(' ').trim();
};

const getNextDistinctHintState = (answer: string, currentLevel: number, currentInput: string, headword: string) => {
    const maxHintLevel = countWords(answer) + 3;

    for (let level = currentLevel + 1; level <= maxHintLevel; level += 1) {
        const hint = createMaskedAnswerHint(answer, level, headword);
        const mergedHint = mergeHintWithUserInput(answer, hint, currentInput);
        if (mergedHint !== currentInput) {
            return { level, hint: mergedHint };
        }
    }

    const fallbackLevel = Math.max(currentLevel + 1, maxHintLevel);
    const fallbackHint = createMaskedAnswerHint(answer, fallbackLevel, headword);
    return {
        level: fallbackLevel,
        hint: mergeHintWithUserInput(answer, fallbackHint, currentInput)
    };
};

const remaskQuizAnswerInput = (plainInput: string, answer: string, hintLevel: number, headword: string): string => {
    if (!answer) return plainInput;
    const baseHint = createMaskedAnswerHint(answer, hintLevel, headword);
    return mergeHintWithUserInput(answer, baseHint, plainInput);
};

const validateStudyBuddyQuizItem = (item: StudyBuddyQuizItem | null | undefined, headword: string): StudyBuddyQuizValidationResult => {
    if (!item) {
        return {
            isValid: false,
            retryMessage: 'I cannot find both question and answer. Retry with the exact "question ||| answer" format or generate a new question.'
        };
    }

    const question = String(item.question || '').trim();
    const answer = String(item.answer || '').trim();
    const normalizedQuestion = normalizeExampleLine(question);
    const normalizedAnswer = normalizeExampleLine(answer);

    if (!normalizedQuestion || !normalizedAnswer) {
        return {
            isValid: false,
            retryMessage: 'I cannot find both question and answer. Retry with the exact "question ||| answer" format or generate a new question.'
        };
    }

    if (!isShortNaturalCollocation(answer, headword)) {
        return {
            isValid: false,
            retryMessage: `The answer is not a short natural collocation with "${headword}". Retry with a shorter natural answer or generate a new question.`
        };
    }

    if (maskAnswerInSentence(question, answer, headword) === question) {
        return {
            isValid: false,
            retryMessage: 'I cannot find the answer collocation in the question. Retry with a new answer or generate a new question.'
        };
    }

    return { isValid: true };
};

const isValidStudyBuddyQuizItem = (item: StudyBuddyQuizItem | null | undefined, headword: string): item is StudyBuddyQuizItem =>
    validateStudyBuddyQuizItem(item, headword).isValid;

export interface ReviewSessionUIProps {
  user: User;
  initialWords: StudyItem[];
  sessionWords: StudyItem[];
  sessionType: SessionType;
  newWordIds: Set<string>;
  progress: { current: number; max: number };
  setProgress: React.Dispatch<React.SetStateAction<{ current: number; max: number }>>;
  sessionOutcomes: Record<string, string>;
  sessionFinished: boolean;
  wordInModal: StudyItem | null;
  setWordInModal: (word: StudyItem | null) => void;
  onOpenWordDetails: (word: StudyItem) => void | Promise<void>;
  editingWordInModal: StudyItem | null;
  setEditingWordInModal: (word: StudyItem | null) => void;
  isTesting: boolean;
  setIsTesting: (isTesting: boolean) => void;
  currentWord?: StudyItem;
  isNewWord: boolean;
  onUpdate: (word: StudyItem) => void;
  onComplete: () => void;
  nextItem: () => void;
  handleReview: (grade: ReviewGrade) => void;
  handleTestComplete: (grade: ReviewGrade, testResults?: Record<string, boolean>, stopSession?: boolean, counts?: { correct: number, tested: number }) => void;
  handleRetry: () => void;
  handleEndSession: () => void;
  handleQuickReview?: () => void;
  handleManualPractice: () => void;
  isQuickReviewMode?: boolean;
  autoCloseOnFinish?: boolean;
}

const EMPTY_STUDY_ITEM: StudyItem = {
    id: '',
    userId: '',
    word: '',
    quality: StudyItemQuality.RAW,
    meaningVi: '',
    example: '',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    nextReview: 0,
    interval: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    learnedStatus: LearnedStatus.NEW,
    forgotCount: 0
};

const renderStatusBadge = (outcome: string | undefined, wasNew: boolean, isQuickFire: boolean) => {
    if (isQuickFire) {
        if (!outcome) return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-neutral-100 text-neutral-400"><MinusCircle size={10} /> No Answer</span>;
        if (outcome === 'GAVE_UP') return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-700"><Flag size={10} /> Gave Up</span>;
        if (outcome === 'PASS' || outcome === ReviewGrade.EASY) return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-green-100 text-green-700"><CheckCircle2 size={10} /> Pass</span>;
        return <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-600"><X size={10} /> Fail</span>;
    }
    if (!outcome) return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-neutral-100 text-neutral-400">Skipped</span>;
    if (wasNew && (outcome === ReviewGrade.EASY || outcome === ReviewGrade.LEARNED)) return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-100 text-cyan-700">Learned</span>;
    switch (outcome) {
        case ReviewGrade.FORGOT: return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-600">Forgot</span>;
        case ReviewGrade.HARD: return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-orange-100 text-orange-600">Hard</span>;
        case ReviewGrade.EASY: return <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-green-100 text-green-600">Easy</span>;
        default: return null;
    }
};

const MasteryScoreGauge: React.FC<{ score: number }> = ({ score }) => {
    const size = 36;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const color = score >= 80 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : score > 0 ? 'text-orange-500' : 'text-neutral-400';

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="absolute" width={size} height={size}>
                <circle
                    className="text-neutral-100"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className={color}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.5s ease-out' }}
                />
            </svg>
            <span className={`text-[10px] font-black ${color}`}>{score}</span>
        </div>
    );
};

const MasteryScoreCalculator: React.FC<{ word: StudyItem }> = ({ word }) => {
    const score = word.masteryScore ?? 0;

    return (
        <div className="relative group/score">
            <MasteryScoreGauge score={score} />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-3 py-1.5 bg-neutral-800 text-white text-[10px] font-black rounded-lg opacity-0 group-hover/score:opacity-100 transition-opacity pointer-events-none z-10 uppercase tracking-wider">
                Mastery
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
            </div>
        </div>
    );
};

const ComplexityIndicator: React.FC<{ complexity: number }> = ({ complexity }) => {
    return (
        <div className="relative group/complexity">
            <div className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 transition-all hover:bg-amber-100 shadow-sm">
                <span className="text-[9px] font-black opacity-50">CX</span>
                <span className="text-xs font-black">{complexity}</span>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-3 py-1.5 bg-neutral-800 text-white text-[10px] font-black rounded-lg opacity-0 group-hover/complexity:opacity-100 transition-opacity pointer-events-none z-10 uppercase tracking-wider">
                Complexity Level
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
            </div>
        </div>
    );
};

export const ReviewSessionUI: React.FC<ReviewSessionUIProps> = (props) => {
    const {
        user, initialWords, sessionWords, sessionType, newWordIds, progress, setProgress,
        sessionOutcomes, sessionFinished, wordInModal, setWordInModal, onOpenWordDetails, editingWordInModal, setEditingWordInModal,
        isTesting, setIsTesting, currentWord: currentWordProp, isNewWord, onUpdate, onComplete,
        nextItem, handleReview, handleTestComplete, handleRetry, handleEndSession,
        handleQuickReview, handleManualPractice, isQuickReviewMode, autoCloseOnFinish = false
    } = props;
    const currentWord = currentWordProp ?? EMPTY_STUDY_ITEM;

    const { current: currentIndex, max: maxIndexVisited } = progress;
    const isQuickFire = sessionType === 'random_test';
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    const [showSpellBox, setShowSpellBox] = useState(false);
    const [spellInput, setSpellInput] = useState('');
    const [spellResult, setSpellResult] = useState<'correct' | 'wrong' | null>(null);
    const [isStudyBuddyExampleVisible, setIsStudyBuddyExampleVisible] = useState(false);
    const [isExampleTextRevealed, setIsExampleTextRevealed] = useState(true);
    const [hoveredActionMenu, setHoveredActionMenu] = useState<'view' | 'practice' | null>(null);
    const [activeFastReviewPanel, setActiveFastReviewPanel] = useState<'meaning' | 'collocation' | 'paraphrase' | 'preposition' | 'idiom' | null>(null);
    const [studyBuddyExample, setStudyBuddyExample] = useState<string | null>(null);
    const [studyBuddyExampleBuffer, setStudyBuddyExampleBuffer] = useState<string[]>([]);
    const [isStudyBuddyExampleLoading, setIsStudyBuddyExampleLoading] = useState(false);
    const [studyBuddyExampleError, setStudyBuddyExampleError] = useState<string | null>(null);
    const [activeBotPanel, setActiveBotPanel] = useState<'example' | 'quiz' | null>(null);
    const [studyBuddyQuizItem, setStudyBuddyQuizItem] = useState<StudyBuddyQuizItem | null>(null);
    const [studyBuddyQuizBuffer, setStudyBuddyQuizBuffer] = useState<StudyBuddyQuizItem[]>([]);
    const [isStudyBuddyQuizLoading, setIsStudyBuddyQuizLoading] = useState(false);
    const [studyBuddyQuizError, setStudyBuddyQuizError] = useState<string | null>(null);
    const [studyBuddyQuizStreamText, setStudyBuddyQuizStreamText] = useState<string>('');
    const [studyBuddyQuizAnswer, setStudyBuddyQuizAnswer] = useState('');
    const [studyBuddyQuizFeedback, setStudyBuddyQuizFeedback] = useState<string | null>(null);
    const [studyBuddyQuizHint, setStudyBuddyQuizHint] = useState<string | null>(null);
    const [studyBuddyQuizHintLevel, setStudyBuddyQuizHintLevel] = useState(0);
    const [isStudyBuddyQuizChecking, setIsStudyBuddyQuizChecking] = useState(false);
    const [isStudyBuddyQuizHintLoading, setIsStudyBuddyQuizHintLoading] = useState(false);
    const [isStudyBuddyQuizInputFocused, setIsStudyBuddyQuizInputFocused] = useState(false);
    const studyBuddyQuizInputRef = useRef<HTMLInputElement | null>(null);
    const touchStartX = useRef<number | null>(null);
    const studyBuddyExampleAbortRef = useRef<AbortController | null>(null);
    const studyBuddyExampleRequestRef = useRef<Promise<string[]> | null>(null);
    const studyBuddyExampleRequestWordIdRef = useRef<string | null>(null);
    const studyBuddyExampleSeenRef = useRef<Set<string>>(new Set());
    const studyBuddyExampleRevealRef = useRef(false);
    const studyBuddyQuizAbortRef = useRef<AbortController | null>(null);
    const studyBuddyQuizRequestRef = useRef<Promise<StudyBuddyQuizItem[]> | null>(null);
    const studyBuddyQuizRequestWordIdRef = useRef<string | null>(null);
    const studyBuddyQuizSeenRef = useRef<Set<string>>(new Set());
    const studyBuddyQuizAnswerSeenRef = useRef<Set<string>>(new Set());
    const studyBuddyQuizRevealRef = useRef(false);
    const studyBuddyQuizRetryMessageRef = useRef<string | null>(null);
    const studyBuddyAiUrl = getStudyBuddyAiUrl(getConfig());
    const normalizeComparableText = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const hasRetryableFailedTests = React.useMemo(() => {
        const history = normalizeTestResultKeys(currentWord.lastTestResults || {});
        const validKeys = getAllValidTestKeys(currentWord);
        const validBaseTypes = new Set(Array.from(validKeys).map(key => key.split(':')[0]));
        return Object.entries(history).some(([key, value]) => {
            if (value !== false) return false;
            if (validKeys.has(key)) return true;
            const baseType = key.split(':')[0];
            return validBaseTypes.has(baseType);
        });
    }, [currentWord]);

    const handleEditRequest = (word: StudyItem) => {
      setWordInModal(null);
      setEditingWordInModal(word);
    };
  
    const handleSaveEdit = (word: StudyItem) => {
      onUpdate(word);
      setEditingWordInModal(null);
      setWordInModal(word);
    };

    // (all hooks and helpers above)

    const HeaderIcon = isNewWord ? Lightbulb : BookOpen;
    const headerColor = isNewWord ? 'text-blue-500' : 'text-neutral-500';
    const reviewHeadword = (currentWord.display || '').trim() || currentWord.word;
    const visiblePrepositions = (currentWord.prepositions || []).filter(p => !p.isIgnored);
    const visibleCollocations = (currentWord.collocationsArray || []).filter(c => !c.isIgnored);
    const visibleParaphrases = (currentWord.paraphrases || []).filter(p => !p.isIgnored);
    const visibleIdioms = (currentWord.idiomsList || []).filter(i => !i.isIgnored);
    const isDisplayDifferentFromHeadword = normalizeComparableText(reviewHeadword) !== normalizeComparableText(currentWord.word);
    const matchedDisplayCollocation = visibleCollocations.find((item) => normalizeComparableText(item.text || '') === normalizeComparableText(reviewHeadword));
    const fallbackMeaning = currentWord.meaningVi?.trim() || 'No Vietnamese meaning available';
    const cachedDisplayMeaning = String(currentWord.displayMeaning || '').trim();
    const cachedDisplayIpa = String(currentWord.displayIPA || '').trim();
    let displayText = reviewHeadword;
    if (currentWord.libraryType === 'vocab') {
        displayText = isNewWord
        ? reviewHeadword
        : cachedDisplayIpa || (isDisplayDifferentFromHeadword ? reviewHeadword : (currentWord.ipaUs || reviewHeadword));
    }
    const vietnameseMeaning = cachedDisplayMeaning || matchedDisplayCollocation?.d?.trim() || fallbackMeaning;
    const existingExampleSet = useMemo(() => {
        const set = new Set<string>();
        splitExampleLines(currentWord.example || '').forEach((line) => {
            const normalized = normalizeExampleLine(line);
            if (normalized) set.add(normalized);
        });
        return set;
    }, [currentWord.example]);

    const isIpa = !isNewWord && !!(cachedDisplayIpa || (!isDisplayDifferentFromHeadword && currentWord.ipaUs));
    const collocationTargets = useMemo(
        () => (currentWord.collocationsArray || []).filter((item) => !item.isIgnored && String(item.text || '').trim()),
        [currentWord.collocationsArray]
    );
    const actionButtonBaseClass = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] shadow-none transition-all active:scale-95 sm:px-3.5 sm:text-[10px]';
    const speakButtonClass = `${actionButtonBaseClass} border-cyan-600 text-cyan-600 hover:bg-cyan-50 hover:text-cyan-700`;
    const viewButtonClass = `${actionButtonBaseClass} border-sky-600 text-sky-600 hover:bg-sky-50 hover:text-sky-700 ${activeFastReviewPanel ? 'ring-2 ring-sky-200 ring-offset-2 ring-offset-white' : ''}`;
    const practiceButtonClass = `${actionButtonBaseClass} ${hasRetryableFailedTests ? 'border-red-600 text-red-600 hover:bg-red-50 hover:text-red-700' : 'border-amber-600 text-amber-600 hover:bg-amber-50 hover:text-amber-700'} ${(showSpellBox || activeBotPanel === 'quiz') ? 'ring-2 ring-amber-200 ring-offset-2 ring-offset-white' : ''}`;
    const floatingMenuClass = 'absolute left-1/2 top-full z-20 w-max -translate-x-1/2 pt-2 transition-all duration-150';

    const extractFreshExamples = useCallback((rawText: string): string[] => {
        const seen = studyBuddyExampleSeenRef.current;
        const result = splitExampleLines(rawText).filter((line) => {
            const normalized = normalizeExampleLine(line);
            if (!normalized) return false;
            if (existingExampleSet.has(normalized)) return false;
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
        return result;
    }, [existingExampleSet]);

    const extractFreshQuizQuestions = useCallback((rawText: string): { items: StudyBuddyQuizItem[]; retryMessage: string | null } => {
        const seenQuestions = studyBuddyQuizSeenRef.current;
        const seenAnswers = studyBuddyQuizAnswerSeenRef.current;
        const lines = splitExampleLines(rawText);
        const result: StudyBuddyQuizItem[] = [];
        let retryMessage: string | null = null;

        lines.forEach((line) => {
            const [questionPart, answerPart] = line.split('|||').map((item) => item.trim());
            const validation = validateStudyBuddyQuizItem({ question: questionPart, answer: answerPart }, currentWord.word);
            if (!validation.isValid) {
                if (!retryMessage) {
                    retryMessage = validation.retryMessage || 'The quiz item is invalid. Retry with a new answer or generate a new question.';
                }
                return;
            }
            const normalizedQuestion = normalizeExampleLine(questionPart || '');
            const normalizedAnswer = normalizeExampleLine(answerPart || '');
            if (seenQuestions.has(normalizedQuestion) || seenAnswers.has(normalizedAnswer)) return;
            seenQuestions.add(normalizedQuestion);
            seenAnswers.add(normalizedAnswer);
            result.push({
                question: questionPart,
                answer: answerPart
            });
        });

        return { items: result, retryMessage };
    }, [currentWord.word]);

    const mergeBufferedExamples = useCallback((incomingExamples: string[], options?: { replace?: boolean }) => {
        console.log('[StudyBuddy][Buffer] MERGE INCOMING', {
            incomingExamples,
            replace: options?.replace
        });
        if (incomingExamples.length === 0) return;
        setStudyBuddyExampleBuffer((prev) => {
            const merged = options?.replace ? incomingExamples : [...prev, ...incomingExamples];
            const unique: string[] = [];
            const localSeen = new Set<string>();
            merged.forEach((item) => {
                const normalized = normalizeExampleLine(item);
                if (!normalized || localSeen.has(normalized)) return;
                localSeen.add(normalized);
                unique.push(item);
            });
            console.log('[StudyBuddy][Buffer] AFTER MERGE', {
                previous: prev,
                merged,
                unique
            });
            return unique;
        });
    }, []);

    const mergeBufferedQuizQuestions = useCallback((incomingQuestions: StudyBuddyQuizItem[], options?: { replace?: boolean }) => {
        if (incomingQuestions.length === 0) return;
        setStudyBuddyQuizBuffer((prev) => {
            const merged = options?.replace ? incomingQuestions : [...prev, ...incomingQuestions];
            const unique: StudyBuddyQuizItem[] = [];
            const localQuestionSeen = new Set<string>();
            const localAnswerSeen = new Set<string>();
            merged.forEach((item) => {
                const normalizedQuestion = normalizeExampleLine(item.question);
                const normalizedAnswer = normalizeExampleLine(item.answer);
                if (!normalizedQuestion || !normalizedAnswer) return;
                if (localQuestionSeen.has(normalizedQuestion) || localAnswerSeen.has(normalizedAnswer)) return;
                localQuestionSeen.add(normalizedQuestion);
                localAnswerSeen.add(normalizedAnswer);
                unique.push(item);
            });
            return unique;
        });
    }, []);

    const requestStudyBuddyExamples = useCallback(async (word: StudyItem, signal?: AbortSignal, replaceBuffer = false): Promise<string[]> => {
        const bannedExamples = [
            ...splitExampleLines(word.example || ''),
            ...Array.from(studyBuddyExampleSeenRef.current)
        ];
        const audienceInstruction = getAudienceInstruction(user);
        const levelInstruction = user.currentLevel ? `Learner level: ${user.currentLevel}.` : '';
        const targetInstruction = user.target ? `Learner goal: ${user.target}.` : '';
        const response = await fetch(studyBuddyAiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert IELTS coach and native English teacher. Reply with only English example sentences. No bullets, no numbering, no markdown, no commentary.'
                    },
                    {
                        role: 'user',
                        content: `Write exactly ${GENERATED_EXAMPLE_BUFFER_SIZE} distinct example sentences for the word "${word.word}".

Rules:
- ${audienceInstruction}
- ${levelInstruction}
- ${targetInstruction}
- Match the learner profile above.
- Use the target word naturally in context.
- One sentence per line.
- Keep each sentence concise.
- Do not repeat the same pattern.
- Do not explain anything.
${bannedExamples.length > 0 ? `- Do not repeat or closely copy ANY of these examples (strictly avoid duplicates or similar structures):\n${bannedExamples.map((item) => `  • ${item}`).join('\n')}` : ''}`
                    }
                ],
                searchEnabled: false,
                temperature: 0.7,
                top_p: 0.9,
                repetition_penalty: 1.08,
                stream: true
            }),
            signal
        });

        if (!response.ok || !response.body) {
            throw new Error(`StudyBuddy example request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = '';
        let buffered = '';
        let finalExamples: string[] = [];

        const flushAssistantText = (isFinal: boolean) => {
            const normalizedText = assistantText.replace(/\r/g, '');
            const segments = normalizedText.split('\n');
            const completeSegments = isFinal ? segments : segments.slice(0, -1);
            const freshExamples = extractFreshExamples(completeSegments.join('\n'));
            if (freshExamples.length > 0) {
                mergeBufferedExamples(freshExamples, { replace: replaceBuffer && finalExamples.length === 0 });
                finalExamples = [...finalExamples, ...freshExamples];
            }
            if (studyBuddyExampleRevealRef.current) {
                const firstSegment = segments[0]?.trim();
                if (firstSegment) {
                    setStudyBuddyExample(firstSegment);
                }
            }
        };

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffered += decoder.decode(value, { stream: true });
            const parts = buffered.split('\n\n');
            buffered = parts.pop() || '';

            for (const part of parts) {
                const lines = part.split('\n').map((line) => line.trim()).filter(Boolean);
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const raw = line.slice(5).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        const json = JSON.parse(raw);
                        const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content;
                        if (typeof delta === 'string') {
                            assistantText += delta;
                            flushAssistantText(false);
                        } else if (Array.isArray(delta)) {
                            for (const partItem of delta) {
                                if (partItem?.type === 'text' && typeof partItem.text === 'string') {
                                    assistantText += partItem.text;
                                }
                            }
                            flushAssistantText(false);
                        }
                    } catch {
                        // ignore malformed stream chunk
                    }
                }
            }
        }

        if (buffered.trim()) {
            const lines = buffered.split('\n').map((line) => line.trim()).filter(Boolean);
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const raw = line.slice(5).trim();
                if (!raw || raw === '[DONE]') continue;
                try {
                    const json = JSON.parse(raw);
                    const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content;
                    if (typeof delta === 'string') assistantText += delta;
                } catch {
                    // ignore
                }
            }
        }

        flushAssistantText(true);
        return finalExamples;
    }, [extractFreshExamples, mergeBufferedExamples, studyBuddyAiUrl, user]);

    const requestStudyBuddyQuizQuestions = useCallback(async (
        word: StudyItem,
        signal?: AbortSignal,
        replaceBuffer = false,
        onFirstItem?: (item: StudyBuddyQuizItem) => void
    ): Promise<StudyBuddyQuizItem[]> => {
        const bannedQuestions = Array.from(studyBuddyQuizSeenRef.current);
        const bannedAnswers = Array.from(studyBuddyQuizAnswerSeenRef.current);
        const audienceInstruction = getAudienceInstruction(user);
        const profileInstruction = getLearnerProfileInstruction(user);
        const headwordWordCount = Math.max(1, countWords(word.word));
        const collocationList = (word.collocationsArray || [])
            .filter((item) => !item.isIgnored && String(item.text || '').trim())
            .map((item) => item.text.trim());
        const collectedItems: StudyBuddyQuizItem[] = [];
        const maxAttempts = 3;
        let didStreamFirstItem = false;
        let didMergeAnything = false;
        let lastRetryMessage: string | null = null;
        let messages = [
            {
                role: 'system',
                content: 'You are an expert IELTS coach. Write only natural English example sentences and answers. No bullets, no numbering, no markdown, no explanations.'
            },
            {
                role: 'user',
                content: `Write exactly ${GENERATED_QUIZ_BUFFER_SIZE} distinct collocation quiz items for this learner and the current review word "${word.word}".

Rules:
- This test is for practicing collocations with the word "${word.word}". A collocation is a popular and natural combination of words that native speakers commonly use together (e.g., "make a decision", "conduct research", "raise awareness"). Bad collocation is "keep fit regularly" because we don't say "keep fit" with an adverb in between. Good collocation is "keep fit" or "do exercise regularly".
- ${audienceInstruction}
- ${profileInstruction}
- Each line must use this exact format: question ||| answer
- "question" = one natural example sentence that already contains the answer collocation in the sentence. Do not use blanks.
- answer = the exact collocation phrase taken from that sentence.
- The answer must include a form of "${word.word}" (e.g., singular/plural, past/future, or other grammatically correct variations).
- Use the existing known collocations for "${word.word}" first. Only invent new ones after you have already used all suitable known collocations.
- For any invented collocation, the full answer can have at most ${headwordWordCount + 2} words.
- Do not include extra modifiers, determiners, pronouns, or long descriptive noun phrases in the answer.
- Bad answer examples: "perform these advanced statistical analyses", "make a very careful decision today".
- Good answer examples: "conduct research", "raise awareness", "make a decision", "meet deadlines".
- Prefer everyday, school, or work situations that fit the learner profile.
- The answer phrase must appear exactly and contiguously inside the sentence.
- Make all 4 questions target different collocation patterns. Avoid overlap in answers, even with different wording.
- Known collocations for "${word.word}": ${collocationList.length > 0 ? collocationList.join(' | ') : 'none provided'}.
${bannedQuestions.length > 0 ? `- Do not repeat any of these previous quiz questions:\n${bannedQuestions.map((item) => `  • ${item}`).join('\n')}` : ''}
${bannedAnswers.length > 0 ? `- Do not reuse any of these previous answer collocations:\n${bannedAnswers.map((item) => `  • ${item}`).join('\n')}` : ''}`
            }
        ];

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (signal?.aborted) return [];

            const remainingTarget = Math.max(1, GENERATED_QUIZ_BUFFER_SIZE - collectedItems.length);
            const response = await fetch(studyBuddyAiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages,
                    searchEnabled: false,
                    temperature: 0.75,
                    top_p: 0.9,
                    repetition_penalty: 1.08,
                    stream: true
                }),
                signal
            });

            if (!response.ok || !response.body) {
                throw new Error(`StudyBuddy quiz request failed (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantText = '';
            let buffered = '';
            let attemptItems: StudyBuddyQuizItem[] = [];

            const flushAssistantText = (isFinal: boolean) => {
                const normalizedText = assistantText.replace(/\r/g, '');
                const segments = normalizedText.split('\n');
                const previewLine = (segments[0]?.split('|||')[0] || '').trim();
                if (studyBuddyQuizRevealRef.current && !didStreamFirstItem) {
                    setStudyBuddyQuizStreamText(previewLine);
                }
                const completeSegments = isFinal ? segments : segments.slice(0, -1);
                const parsedQuizItems = extractFreshQuizQuestions(completeSegments.join('\n'));
                if (parsedQuizItems.retryMessage) {
                    lastRetryMessage = parsedQuizItems.retryMessage;
                    studyBuddyQuizRetryMessageRef.current = parsedQuizItems.retryMessage;
                }
                const freshQuizItems = parsedQuizItems.items;
                if (freshQuizItems.length === 0) return;

                mergeBufferedQuizQuestions(freshQuizItems, { replace: replaceBuffer && !didMergeAnything });
                didMergeAnything = true;
                attemptItems = [...attemptItems, ...freshQuizItems];
                collectedItems.push(...freshQuizItems);

                if (!didStreamFirstItem) {
                    didStreamFirstItem = true;
                    setStudyBuddyQuizStreamText('');
                    onFirstItem?.(freshQuizItems[0]);
                }
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffered += decoder.decode(value, { stream: true });
                const parts = buffered.split('\n\n');
                buffered = parts.pop() || '';

                for (const part of parts) {
                    const lines = part.split('\n').map((line) => line.trim()).filter(Boolean);
                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        const raw = line.slice(5).trim();
                        if (!raw || raw === '[DONE]') continue;
                        try {
                            const json = JSON.parse(raw);
                            const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content;
                            if (typeof delta === 'string') {
                                assistantText += delta;
                                flushAssistantText(false);
                            } else if (Array.isArray(delta)) {
                                for (const partItem of delta) {
                                    if (partItem?.type === 'text' && typeof partItem.text === 'string') {
                                        assistantText += partItem.text;
                                    }
                                }
                                flushAssistantText(false);
                            }
                        } catch {
                            // ignore malformed stream chunk
                        }
                    }
                }
            }

            if (buffered.trim()) {
                const lines = buffered.split('\n').map((line) => line.trim()).filter(Boolean);
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    const raw = line.slice(5).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        const json = JSON.parse(raw);
                        const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content;
                        if (typeof delta === 'string') assistantText += delta;
                    } catch {
                        // ignore
                    }
                }
            }

            flushAssistantText(true);

            if (collectedItems.length >= GENERATED_QUIZ_BUFFER_SIZE) {
                break;
            }

            const nextRemainingTarget = Math.max(1, GENERATED_QUIZ_BUFFER_SIZE - collectedItems.length);
            messages = [
                ...messages,
                { role: 'assistant', content: assistantText.trim() || '(empty response)' },
                {
                    role: 'user',
                    content: `${lastRetryMessage || 'The previous output was invalid.'} Retry with exactly ${nextRemainingTarget} new lines in the same "question ||| answer" format. Do not repeat previous invalid lines.`
                }
            ];
        }

        return collectedItems;
    }, [extractFreshQuizQuestions, mergeBufferedQuizQuestions, studyBuddyAiUrl, user]);

    const requestStudyBuddyQuizMicroReply = useCallback(async (prompt: string): Promise<string> => {
        const response = await fetch(studyBuddyAiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert IELTS collocation coach. Reply with exactly one very short sentence or phrase in English. No bullets, no markdown, no preface.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                searchEnabled: false,
                temperature: 0.35,
                top_p: 0.85,
                repetition_penalty: 1.05,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`StudyBuddy micro reply failed (${response.status})`);
        }

        const payload = await response.json().catch(() => null);
        return String(payload?.choices?.[0]?.message?.content || '')
            .replace(/\r?\n+/g, ' ')
            .trim();
    }, [studyBuddyAiUrl]);

    const prefetchStudyBuddyExamples = useCallback((word: StudyItem, options?: { replace?: boolean }) => {
        console.log('[StudyBuddy][Prefetch] CALLED', {
            wordId: word.id,
            replace: options?.replace,
            existingRequestWordId: studyBuddyExampleRequestWordIdRef.current,
            hasOngoingRequest: !!studyBuddyExampleRequestRef.current
        });
        if (studyBuddyExampleRequestRef.current && studyBuddyExampleRequestWordIdRef.current === word.id) {
            console.log('[StudyBuddy][Prefetch] REUSE EXISTING REQUEST');
            return studyBuddyExampleRequestRef.current;
        }

        const controller = new AbortController();
        studyBuddyExampleAbortRef.current?.abort();
        studyBuddyExampleAbortRef.current = controller;
        studyBuddyExampleRequestWordIdRef.current = word.id;
        console.log('[StudyBuddy][Prefetch] NEW REQUEST START', {
            wordId: word.id,
            replace: options?.replace
        });
        if (studyBuddyExampleRevealRef.current) {
            setIsStudyBuddyExampleLoading(true);
        }
        setStudyBuddyExampleError(null);
        if (options?.replace) {
            setStudyBuddyExampleBuffer([]);
        }

        const requestPromise = requestStudyBuddyExamples(word, controller.signal, !!options?.replace)
            .then((incomingExamples) => {
                if (controller.signal.aborted) return [];
                if (incomingExamples.length === 0) {
                    setStudyBuddyExampleError('No fresh example right now.');
                }

                // ✅ Auto-consume immediately using incomingExamples (NOT relying on async buffer state)
                if (studyBuddyExampleRevealRef.current) {
                    const first = incomingExamples?.[0];

                    if (first) {
                        setStudyBuddyExample(first);
                        setStudyBuddyExampleError(null);
                        setIsStudyBuddyExampleLoading(false); // ✅ stop loading immediately

                        // remove it from buffer AFTER merge (avoid double showing)
                        setStudyBuddyExampleBuffer((prev) =>
                            prev.filter((item) => normalizeExampleLine(item) !== normalizeExampleLine(first))
                        );
                    }
                }

                return incomingExamples;
            })
            .catch((error) => {
                if (controller.signal.aborted) return [];
                console.error(error);
                setStudyBuddyExampleError('Failed to load example.');
                return [];
            })
            .finally(() => {
                if (studyBuddyExampleAbortRef.current === controller) {
                    studyBuddyExampleAbortRef.current = null;
                }
                if (studyBuddyExampleRequestRef.current === requestPromise) {
                    studyBuddyExampleRequestRef.current = null;
                    studyBuddyExampleRequestWordIdRef.current = null;
                }
                // only turn off loading if not already turned off by auto-consume
                if (studyBuddyExampleRevealRef.current) {
                    setIsStudyBuddyExampleLoading(false);
                }
            });

        studyBuddyExampleRequestRef.current = requestPromise;
        return requestPromise;
    }, [requestStudyBuddyExamples]);

    const prefetchStudyBuddyQuizQuestions = useCallback((word: StudyItem, options?: { replace?: boolean }) => {
        if (studyBuddyQuizRequestRef.current && studyBuddyQuizRequestWordIdRef.current === word.id) {
            return studyBuddyQuizRequestRef.current;
        }

        const controller = new AbortController();
        studyBuddyQuizAbortRef.current?.abort();
        studyBuddyQuizAbortRef.current = controller;
        studyBuddyQuizRequestWordIdRef.current = word.id;
        if (studyBuddyQuizRevealRef.current) {
            setIsStudyBuddyQuizLoading(true);
        }
        setStudyBuddyQuizStreamText('');
        setStudyBuddyQuizError(null);
        if (options?.replace) {
            setStudyBuddyQuizBuffer([]);
        }
        studyBuddyQuizRetryMessageRef.current = null;

        const applyQuizItemToUi = (item: StudyBuddyQuizItem) => {
            if (!isValidStudyBuddyQuizItem(item, word.word)) {
                setStudyBuddyQuizItem(null);
                return false;
            }

            const firstHint = createMaskedAnswerHint(item.answer, 1, word.word);
            setStudyBuddyQuizItem(item);
            setStudyBuddyQuizStreamText('');
            setStudyBuddyQuizHint(firstHint);
            setStudyBuddyQuizHintLevel(1);
            setStudyBuddyQuizAnswer(firstHint);
            setIsStudyBuddyQuizInputFocused(false);
            setStudyBuddyQuizFeedback(null);
            setStudyBuddyQuizError(null);
            setIsStudyBuddyQuizLoading(false);
            setStudyBuddyQuizBuffer((prev) =>
                prev.filter((bufferedItem) => normalizeExampleLine(bufferedItem.question) !== normalizeExampleLine(item.question))
            );
            return true;
        };

        let hasAutoConsumedStreamedItem = false;

        const requestPromise = requestStudyBuddyQuizQuestions(
            word,
            controller.signal,
            !!options?.replace,
            (item) => {
                if (!studyBuddyQuizRevealRef.current || hasAutoConsumedStreamedItem) return;
                const didApply = applyQuizItemToUi(item);
                if (didApply) {
                    hasAutoConsumedStreamedItem = true;
                }
            }
        )
            .then((incomingQuestions) => {
                if (controller.signal.aborted) return [];
                if (incomingQuestions.length === 0) {
                    setStudyBuddyQuizError(
                        studyBuddyQuizRetryMessageRef.current || 'No quiz prompt right now.'
                    );
                }

                if (studyBuddyQuizRevealRef.current && !hasAutoConsumedStreamedItem) {
                    const first = incomingQuestions?.[0];
                    if (first) {
                        hasAutoConsumedStreamedItem = applyQuizItemToUi(first);
                    }
                }

                return incomingQuestions;
            })
            .catch((error) => {
                if (controller.signal.aborted) return [];
                console.error(error);
                setStudyBuddyQuizError('Failed to load quiz.');
                return [];
            })
            .finally(() => {
                if (studyBuddyQuizAbortRef.current === controller) {
                    studyBuddyQuizAbortRef.current = null;
                }
                if (studyBuddyQuizRequestRef.current === requestPromise) {
                    studyBuddyQuizRequestRef.current = null;
                    studyBuddyQuizRequestWordIdRef.current = null;
                }
                if (studyBuddyQuizRevealRef.current) {
                    setIsStudyBuddyQuizLoading(false);
                }
            });

        studyBuddyQuizRequestRef.current = requestPromise;
        return requestPromise;
    }, [requestStudyBuddyQuizQuestions]);

    const showNextStudyBuddyExample = useCallback(async () => {
        setActiveFastReviewPanel(null);
        setActiveBotPanel('example');
        setHoveredActionMenu(null);
        setShowSpellBox(false);
        setIsStudyBuddyExampleVisible(true);
        studyBuddyExampleRevealRef.current = false;

        const bufferSnapshot = studyBuddyExampleBuffer;

        console.log('[StudyBuddy][NextExample] BUFFER SNAPSHOT', {
            buffer: bufferSnapshot,
            bufferLength: bufferSnapshot.length,
            currentWordId: currentWord.id,
            activeRequestWordId: studyBuddyExampleRequestWordIdRef.current
        });

        // Read from snapshot (sync), not via setState
        if (bufferSnapshot.length > 0) {
            const [first, ...rest] = bufferSnapshot;

            console.log('[StudyBuddy][NextExample] BUFFER HIT', {
                nextExample: first,
                remainingCount: rest.length
            });

            // update buffer
            setStudyBuddyExampleBuffer(rest);

            setStudyBuddyExample(first);
            setStudyBuddyExampleError(null);
            return;
        }

        // Prevent duplicate fetch if a request is already ongoing for this word
        if (studyBuddyExampleRequestRef.current && studyBuddyExampleRequestWordIdRef.current === currentWord.id) {
            console.log('[StudyBuddy][NextExample] WAITING FOR EXISTING REQUEST');
            studyBuddyExampleRevealRef.current = true;

            // Do NOT require extra click; result will auto-consume when ready
            return;
        }

        console.log('[StudyBuddy][NextExample] BUFFER MISS - requesting new examples', {
            shouldReplace: studyBuddyExampleRequestWordIdRef.current !== currentWord.id,
            currentWordId: currentWord.id,
            activeRequestWordId: studyBuddyExampleRequestWordIdRef.current
        });

        setStudyBuddyExampleError(null);
        studyBuddyExampleRevealRef.current = true;

        try {
            const shouldReplace = studyBuddyExampleRequestWordIdRef.current !== currentWord.id;
            await prefetchStudyBuddyExamples(currentWord, { replace: shouldReplace });

            // Do nothing here — auto-consume is handled inside prefetch
        } finally {
            studyBuddyExampleRevealRef.current = false;
        }
    }, [currentWord, prefetchStudyBuddyExamples, studyBuddyExampleBuffer]);

    const showNextStudyBuddyQuiz = useCallback(async () => {
        setActiveFastReviewPanel(null);
        setActiveBotPanel('quiz');
        setHoveredActionMenu(null);
        setShowSpellBox(false);
        const bufferSnapshot = studyBuddyQuizBuffer;
        setStudyBuddyQuizStreamText('');
        setStudyBuddyQuizFeedback(null);
        setStudyBuddyQuizHint(null);
        setStudyBuddyQuizHintLevel(0);
        setStudyBuddyQuizAnswer('');

        if (bufferSnapshot.length > 0) {
            const firstValidIndex = bufferSnapshot.findIndex((item) => isValidStudyBuddyQuizItem(item, currentWord.word));
            const nextValidItem = firstValidIndex >= 0 ? bufferSnapshot[firstValidIndex] : null;
            const remainingItems = firstValidIndex >= 0 ? bufferSnapshot.slice(firstValidIndex + 1) : [];

            setStudyBuddyQuizBuffer(
                firstValidIndex >= 0
                    ? remainingItems
                    : []
            );

            if (nextValidItem) {
                const firstHint = createMaskedAnswerHint(nextValidItem.answer, 1, currentWord.word);
                setStudyBuddyQuizItem(nextValidItem);
                setStudyBuddyQuizHint(firstHint);
                setStudyBuddyQuizHintLevel(1);
                setStudyBuddyQuizAnswer(firstHint);
                setIsStudyBuddyQuizInputFocused(false);
                setStudyBuddyQuizError(null);
                if (remainingItems.length < 2 && !studyBuddyQuizRequestRef.current) {
                    void prefetchStudyBuddyQuizQuestions(currentWord);
                }
                return;
            }
        }

        if (studyBuddyQuizRequestRef.current && studyBuddyQuizRequestWordIdRef.current === currentWord.id) {
            studyBuddyQuizRevealRef.current = true;
            return;
        }

        setStudyBuddyQuizError(null);
        studyBuddyQuizRevealRef.current = true;
        try {
            const shouldReplace = studyBuddyQuizRequestWordIdRef.current !== currentWord.id;
            await prefetchStudyBuddyQuizQuestions(currentWord, { replace: shouldReplace });
        } finally {
            studyBuddyQuizRevealRef.current = false;
        }
    }, [currentWord, prefetchStudyBuddyQuizQuestions, studyBuddyQuizBuffer]);

    const handleStudyBuddyQuizCheck = useCallback(async () => {
        const answer = studyBuddyQuizAnswer.trim();
        const question = studyBuddyQuizItem?.question.trim() || '';
        const expectedAnswer = studyBuddyQuizItem?.answer.trim() || '';
        const maskedQuestion = maskAnswerInSentence(question, expectedAnswer, currentWord.word);
        if (!answer || !question) return;

        setIsStudyBuddyQuizChecking(true);
        setStudyBuddyQuizHint(null);
        setStudyBuddyQuizHintLevel(0);
        try {
            const normalizedAnswer = normalizeComparableText(answer);
            const normalizedExpectedAnswer = normalizeComparableText(expectedAnswer);

            if (normalizedAnswer && normalizedAnswer === normalizedExpectedAnswer) {
                setStudyBuddyQuizAnswer(expectedAnswer);
                setStudyBuddyQuizFeedback('Match');
                return;
            }

            const collocationList = collocationTargets.map((item) => item.text.trim()).filter(Boolean);
            const reply = await requestStudyBuddyQuizMicroReply(
                `Explain briefly why this learner answer does not match the expected collocation quiz answer.

Learner profile: ${getLearnerProfileInstruction(user)}
Current review word: "${currentWord.word}" (the answer must use this word)
Known collocations of current review word: ${collocationList.length > 0 ? collocationList.join(' | ') : 'none provided'}
Quiz sentence with blank: "${maskedQuestion}"
Full example sentence: "${question}"
Expected target collocation: "${expectedAnswer || 'not provided'}"
Learner answer: "${answer}"

Rules:
- The learner answer is already considered not an exact match to the expected answer
- Briefly say what is wrong or missing
- If helpful, mention the expected collocation at the end
- Keep it very short and easy to understand

Reply with exactly one very short sentence or phrase in English.`
            );
            setStudyBuddyQuizFeedback(reply || 'Try again.');
        } catch (error) {
            console.error(error);
            setStudyBuddyQuizFeedback('Could not check now.');
        } finally {
            setIsStudyBuddyQuizChecking(false);
        }
    }, [collocationTargets, currentWord.word, normalizeComparableText, requestStudyBuddyQuizMicroReply, studyBuddyQuizAnswer, studyBuddyQuizItem, user]);

    const handleStudyBuddyQuizHint = useCallback(async () => {
        const expectedAnswer = studyBuddyQuizItem?.answer.trim() || '';
        if (!expectedAnswer) return;

        setIsStudyBuddyQuizHintLoading(true);
        try {
            setStudyBuddyQuizHintLevel((previousLevel) => {
                const nextState = getNextDistinctHintState(
                    expectedAnswer,
                    previousLevel,
                    studyBuddyQuizAnswer,
                    currentWord.word
                );
                setStudyBuddyQuizHint(nextState.hint);
                setStudyBuddyQuizAnswer(
                    isStudyBuddyQuizInputFocused
                        ? stripHintMaskMarkers(nextState.hint)
                        : nextState.hint
                );
                return nextState.level;
            });
        } catch (error) {
            console.error(error);
            setStudyBuddyQuizHint('No hint right now.');
        } finally {
            setIsStudyBuddyQuizHintLoading(false);
        }
    }, [currentWord.word, isStudyBuddyQuizInputFocused, studyBuddyQuizAnswer, studyBuddyQuizItem]);

    const handleStudyBuddyQuizInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void handleStudyBuddyQuizCheck();
        }
    }, [handleStudyBuddyQuizCheck]);

    const handleStudyBuddyQuizInputFocus = useCallback(() => {
        setIsStudyBuddyQuizInputFocused(true);
        setStudyBuddyQuizAnswer((previous) => stripHintMaskMarkers(previous));
    }, []);

    const handleStudyBuddyQuizInputBlur = useCallback(() => {
        setIsStudyBuddyQuizInputFocused(false);
        const expectedAnswer = studyBuddyQuizItem?.answer.trim() || '';
        if (!expectedAnswer) return;

        setStudyBuddyQuizAnswer((previous) =>
            remaskQuizAnswerInput(previous, expectedAnswer, studyBuddyQuizHintLevel, currentWord.word)
        );
    }, [currentWord.word, studyBuddyQuizHintLevel, studyBuddyQuizItem]);

    const handleFastReviewAction = useCallback((panel: 'meaning' | 'collocation' | 'paraphrase' | 'preposition' | 'idiom') => {
        setActiveBotPanel(null);
        setActiveFastReviewPanel(panel);
        setHoveredActionMenu(null);
        setShowSpellBox(false);

        if (panel === 'meaning') {
            speak(vietnameseMeaning, false, 'vi');
            return;
        }

        if (panel === 'collocation') {
            const text = visibleCollocations.map(item => `- ${item.text}`).filter(Boolean).join('. ');
            if (text) speak(text);
            return;
        }

        if (panel === 'paraphrase') {
            const text = visibleParaphrases
                .map((item) => `- ${item.word}`)
                .filter(Boolean)
                .join('. ');
            if (text) speak(text);
            return;
        }

        if (panel === 'preposition') {
            const text = visiblePrepositions.map((item) => `- ${item.usage}`).filter(Boolean).join('. ');
            if (text) speak(text);
            return;
        }

        const text = visibleIdioms.map((item) => `- ${item.text}`).filter(Boolean).join('. ');
        if (text) speak(text);
    }, [vietnameseMeaning, visibleCollocations, visibleIdioms, visibleParaphrases, visiblePrepositions]);

    useEffect(() => {
        studyBuddyExampleAbortRef.current?.abort();
        studyBuddyExampleRequestRef.current = null;
        studyBuddyExampleRequestWordIdRef.current = null;
        studyBuddyExampleSeenRef.current = new Set();
        // Clear displayed + buffered examples when switching headword
        setStudyBuddyExample(null);
        setStudyBuddyExampleBuffer([]);
        studyBuddyExampleRevealRef.current = false;
        setIsStudyBuddyExampleVisible(false);
        setStudyBuddyExampleError(null);
        setIsExampleTextRevealed(false);
        studyBuddyExampleRevealRef.current = false;
        studyBuddyQuizAbortRef.current?.abort();
        studyBuddyQuizRequestRef.current = null;
        studyBuddyQuizRequestWordIdRef.current = null;
        studyBuddyQuizAnswerSeenRef.current = new Set();
        studyBuddyQuizRetryMessageRef.current = null;
        setActiveFastReviewPanel(null);
        setActiveBotPanel(null);
        setHoveredActionMenu(null);
        setShowSpellBox(false);
        setSpellInput('');
        setSpellResult(null);
        setStudyBuddyQuizItem(null);
        setStudyBuddyQuizBuffer([]);
        setStudyBuddyQuizError(null);
        setStudyBuddyQuizAnswer('');
        setStudyBuddyQuizFeedback(null);
        setStudyBuddyQuizHint(null);
        setStudyBuddyQuizHintLevel(0);
        studyBuddyQuizRevealRef.current = false;

        return () => {
            studyBuddyExampleAbortRef.current?.abort();
            studyBuddyQuizAbortRef.current?.abort();
        };
    }, [currentWord.id]);

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        if (touchStartX.current === null) return;

        const deltaX = e.changedTouches[0].clientX - touchStartX.current;

        const swipeThreshold = 50; // px

        if (deltaX > swipeThreshold) {
            // Swipe right → Previous
            setProgress(p => ({ ...p, current: (p.current - 1 + sessionWords.length) % sessionWords.length }));
        } else if (deltaX < -swipeThreshold) {
            // Swipe left → Next
            setProgress(p => ({ ...p, current: (p.current + 1) % sessionWords.length }));
        }

        touchStartX.current = null;
    };

    useEffect(() => {
        if (activeBotPanel !== 'quiz' || !studyBuddyQuizItem) return;
        if (isValidStudyBuddyQuizItem(studyBuddyQuizItem, currentWord.word)) return;

        setStudyBuddyQuizItem(null);
        setStudyBuddyQuizHint(null);
        setStudyBuddyQuizHintLevel(0);
        setStudyBuddyQuizAnswer('');
        setStudyBuddyQuizFeedback(null);
        setStudyBuddyQuizError(null);
        studyBuddyQuizRevealRef.current = true;
        void prefetchStudyBuddyQuizQuestions(currentWord);
    }, [activeBotPanel, currentWord, prefetchStudyBuddyQuizQuestions, studyBuddyQuizItem]);

    // Conditional returns moved below hooks
    if (initialWords.length === 0) {
        return <div className="flex flex-col items-center justify-center space-y-6 py-20 text-center animate-in fade-in duration-500"><div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center shadow-inner"><Check size={32} /></div><h2 className="text-xl font-bold text-neutral-900">All clear!</h2><button onClick={onComplete} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-semibold text-sm hover:bg-neutral-800 transition-colors">Back to Dashboard</button></div>;
    }

    if (!currentWordProp) {
        return <div className="flex flex-col items-center justify-center space-y-3 py-20 text-center animate-in fade-in duration-300"><div className="h-10 w-10 rounded-full border-4 border-neutral-200 border-t-neutral-900 animate-spin" /><p className="text-sm font-semibold text-neutral-500">Preparing your review session...</p></div>;
    }
    
    if (sessionFinished && autoCloseOnFinish) {
        console.log('[InlineReview][ReviewSessionUI] return null because sessionFinished && autoCloseOnFinish');
        return null;
    }

    if (sessionFinished) {
        if (sessionType === 'new' || sessionType === 'due' || sessionType === 'new_study' || sessionType === 'custom' || isQuickFire) {
          const passCount = Object.values(sessionOutcomes).filter(v => v === 'PASS' || v === ReviewGrade.EASY || v === ReviewGrade.LEARNED).length;
          return (
            <div className="max-w-2xl mx-auto py-10 text-center animate-in zoom-in-95 duration-500">
              <div className="mb-6"><div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isQuickFire ? 'bg-amber-100 text-amber-600' : 'bg-neutral-100 text-neutral-900'}`}>{isQuickFire ? <Zap size={40} fill="currentColor" /> : <BookCopy size={40} />}</div><h2 className="text-3xl font-black text-neutral-900">{isQuickFire ? 'Test Result' : 'Session Recap'}</h2>{isQuickFire && <p className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mt-2">Score: {passCount} / {sessionWords.length}</p>}<p className="text-neutral-500 mt-2 font-medium">You&apos;ve completed this focused session.</p></div>
              <div className="bg-white p-4 rounded-[2rem] border border-neutral-200 shadow-sm mb-8 overflow-hidden"><div className="max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-2">{sessionWords.map(word => (<div key={word.id} className="flex justify-between items-center bg-neutral-50/70 p-2.5 rounded-xl border border-neutral-100"><span className="font-bold text-neutral-800 text-xs truncate pr-2">{(word.display || '').trim() || word.word}</span>{renderStatusBadge(sessionOutcomes[word.id], newWordIds.has(word.id), isQuickFire)}</div>))}</div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><button onClick={onComplete} className="px-6 py-4 bg-white border border-neutral-200 text-neutral-500 rounded-2xl font-bold text-xs hover:bg-neutral-50 hover:border-neutral-900 transition-all active:scale-95 uppercase tracking-widest">Finish Session</button><button onClick={handleRetry} className="px-6 py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 uppercase tracking-widest"><RotateCw size={14} /><span>Retry This Session</span></button></div>
            </div>
          );
        }
        return <div className="flex flex-col items-center justify-center py-20 text-center animate-in zoom-in-95 duration-500"><Trophy size={64} className="text-yellow-500 mb-4 animate-bounce" /><h2 className="text-3xl font-black text-neutral-900">Session Complete!</h2><p className="text-neutral-500 mt-2 font-medium">You have finished this review session.</p><button onClick={onComplete} className="mt-8 px-10 py-3.5 bg-neutral-900 text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all text-sm">Return to Dashboard</button></div>;
    }

    return (
        <>
            <div className="max-w-3xl mx-auto h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] flex flex-col animate-in fade-in duration-300 px-3 sm:px-0">
                <div className="px-6 shrink-0 pb-4">
                    <div className="flex justify-between items-center mb-1">
                        <div className="w-24"></div> {/* Left spacer */}
                        <div className="flex items-center space-x-2">
                            <HeaderIcon size={14} className={headerColor} />
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{currentIndex + 1} / {sessionWords.length}</span>
                        </div>
                        <div className="w-24 text-right">
                            <button onClick={handleEndSession} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:bg-neutral-100 transition-colors">
                                End Session
                            </button>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-neutral-900 transition-all duration-300 ease-in-out" style={{ width: `${((currentIndex + 1) / sessionWords.length) * 100}%` }} />
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center relative gap-2 sm:gap-4">
                    <button 
                        onClick={() => setProgress(p => ({ ...p, current: (p.current - 1 + sessionWords.length) % sessionWords.length }))} 
                        className="hidden sm:block p-4 rounded-full text-neutral-300 hover:text-neutral-900 transition-all relative z-20"
                        aria-label="Previous word"
                    >
                        <ArrowLeft size={28} />
                    </button>

                    <div
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        className="w-full max-w-xl h-full bg-white rounded-3xl sm:rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col relative group touch-pan-y"
                    >
                        {isQuickFire ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 w-full text-center space-y-4">
                                <Loader2 className="animate-spin text-neutral-200" size={32} />
                                <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Loading Next Test...</p>
                            </div>
                        ) : (<>
                            <div className="flex-1 flex flex-col items-center justify-start pt-40 w-full text-center space-y-3 sm:space-y-3">
                                <div className="flex items-center gap-4 flex-wrap justify-center">
                                    <h2 className={`font-black text-neutral-900 tracking-tight text-3xl sm:text-4xl break-words ${isIpa ? 'font-serif' : ''}`}>
                                        {displayText}
                                    </h2>

                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); speak(reviewHeadword); }}
                                        className="p-1.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                        title="Speak"
                                    >
                                        <Volume2 size={14} />
                                    </button>

                                    {isNewWord ? (
                                        <ComplexityIndicator complexity={currentWord.complexity ?? 0} />
                                    ) : (
                                        <MasteryScoreCalculator word={currentWord} />
                                    )}
                                </div>
                                <div className="relative z-10 flex w-full max-w-full items-center justify-center gap-1.5 overflow-visible px-2 sm:gap-2">
                                    <div
                                        className="relative"
                                        onMouseEnter={() => setHoveredActionMenu('view')}
                                        onMouseLeave={() => setHoveredActionMenu((current) => current === 'view' ? null : current)}
                                    >
                                        <button
                                            type="button"
                                            onFocus={() => setHoveredActionMenu('view')}
                                            onClick={() => setHoveredActionMenu((current) => current === 'view' ? null : 'view')}
                                            className={viewButtonClass}
                                        >
                                            <Eye size={14}/>
                                        </button>
                                        <div className={`${floatingMenuClass} ${hoveredActionMenu === 'view' ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}>
                                            <div className="flex min-w-[220px] flex-col items-stretch gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl">
                                                <button type="button" onClick={() => { setShowSpellBox(false); setHoveredActionMenu(null); void onOpenWordDetails(currentWord); }} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-sky-700 transition-colors hover:bg-sky-100"><Eye size={11} /><span>Detail</span></button>
                                                <button type="button" onClick={() => { setHoveredActionMenu('view'); void showNextStudyBuddyExample(); }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeBotPanel === 'example' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}><BookCopy size={11} /><span>AI Example</span></button>
                                                <button type="button" onClick={() => handleFastReviewAction('meaning')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeFastReviewPanel === 'meaning' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}><BookOpen size={11} /><span>Meaning</span></button>
                                                {visibleCollocations.length > 0 && <button type="button" onClick={() => handleFastReviewAction('collocation')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeFastReviewPanel === 'collocation' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}><Combine size={11} /><span>Collocation</span></button>}
                                                {visibleParaphrases.length > 0 && <button type="button" onClick={() => handleFastReviewAction('paraphrase')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeFastReviewPanel === 'paraphrase' ? 'bg-cyan-600 text-white' : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'}`}><Zap size={11} /><span>Paraphrase</span></button>}
                                                {visiblePrepositions.length > 0 && <button type="button" onClick={() => handleFastReviewAction('preposition')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeFastReviewPanel === 'preposition' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}><AtSign size={11} /><span>Preposition</span></button>}
                                                {visibleIdioms.length > 0 && <button type="button" onClick={() => handleFastReviewAction('idiom')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeFastReviewPanel === 'idiom' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}><MessageSquare size={11} /><span>Idiom</span></button>}
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className="relative"
                                        onMouseEnter={() => setHoveredActionMenu('practice')}
                                        onMouseLeave={() => setHoveredActionMenu((current) => current === 'practice' ? null : current)}
                                    >
                                        <button
                                            type="button"
                                            className={practiceButtonClass}
                                            onFocus={() => setHoveredActionMenu('practice')}
                                            onClick={() => setHoveredActionMenu((current) => current === 'practice' ? null : 'practice')}
                                        >
                                            <BrainCircuit size={14}/>
                                        </button>
                                        <div className={`${floatingMenuClass} ${hoveredActionMenu === 'practice' ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}>
                                            <div className="flex min-w-[180px] flex-col items-stretch gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl">
                                                <button type="button" onClick={() => { setActiveFastReviewPanel(null); setActiveBotPanel(null); setHoveredActionMenu(null); setShowSpellBox(false); setMimicTarget(reviewHeadword); }} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-violet-700 transition-colors hover:bg-violet-100"><Mic size={11} /><span>Mimic</span></button>
                                                <button type="button" onClick={() => { setActiveFastReviewPanel(null); setActiveBotPanel(null); setHoveredActionMenu('practice'); setShowSpellBox((prev) => { const next = !prev; if (next) { setSpellInput(''); setSpellResult(null); } return next; }); }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${showSpellBox ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}><Keyboard size={11} /><span>SPELLING</span></button>
                                                <button type="button" onClick={() => { setHoveredActionMenu(null); handleManualPractice(); }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${hasRetryableFailedTests ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}><BrainCircuit size={11} /><span>Test It</span></button>
                                                <button type="button" onClick={() => { setHoveredActionMenu('practice'); void showNextStudyBuddyQuiz(); }} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${activeBotPanel === 'quiz' ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100'}`}><Sparkles size={11} /><span>AI Quiz</span></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full max-w-lg min-h-[216px]">
                                {showSpellBox && (
                                    <div className="w-full rounded-[1.75rem] border border-neutral-200 bg-neutral-50/80 px-5 py-4 text-left shadow-sm">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-700">
                                                <Keyboard size={12} />
                                                <span>Typing Check</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSpellBox(false);
                                                    setSpellInput('');
                                                    setSpellResult(null);
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-neutral-600 transition-colors hover:bg-neutral-100"
                                            >
                                                <X size={11} />
                                                <span>Close</span>
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            <input
                                                value={spellInput}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setSpellInput(value);

                                                    const correct = value.trim().toLowerCase() === currentWord.word.toLowerCase();
                                                    if (correct) {
                                                        setSpellResult('correct');
                                                        setTimeout(() => {
                                                            setShowSpellBox(false);
                                                            setSpellInput('');
                                                            setSpellResult(null);
                                                        }, 1000);
                                                    } else {
                                                        setSpellResult(value.length > 0 ? 'wrong' : null);
                                                    }
                                                }}
                                                placeholder="Type spelling..."
                                                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-500"
                                            />
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-xs font-semibold text-neutral-500">
                                                    Type the headword exactly as you hear it.
                                                </p>
                                                {spellResult === 'correct' && (
                                                    <p className="text-[10px] font-black uppercase tracking-wide text-green-600">
                                                        Correct
                                                    </p>
                                                )}
                                                {spellResult === 'wrong' && (
                                                    <p className="text-[10px] font-black uppercase tracking-wide text-rose-600">
                                                        Incorrect
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeFastReviewPanel === 'meaning' && (
                                    <div className="w-full rounded-[1.75rem] border border-amber-200 bg-amber-50/70 px-5 py-4 text-left shadow-sm">
                                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-700">
                                            <BookOpen size={12} />
                                            <span>Meaning</span>
                                        </div>
                                        <p className="text-sm font-semibold leading-relaxed text-neutral-800">{vietnameseMeaning}</p>
                                    </div>
                                )}
                                {activeFastReviewPanel === 'collocation' && visibleCollocations.length > 0 && (
                                    <div className="w-full rounded-[1.75rem] border border-indigo-200 bg-indigo-50/70 px-5 py-4 text-left shadow-sm">
                                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                                            <Combine size={12} />
                                            <span>Collocations</span>
                                        </div>
                                        <div className="space-y-1 text-sm font-semibold leading-relaxed text-neutral-800">
                                            {visibleCollocations.map((item, idx) => <p key={`${item.text}-${idx}`}>{item.text}</p>)}
                                        </div>
                                    </div>
                                )}
                                {activeFastReviewPanel === 'paraphrase' && visibleParaphrases.length > 0 && (
                                    <div className="w-full rounded-[1.75rem] border border-cyan-200 bg-cyan-50/70 px-5 py-4 text-left shadow-sm">
                                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-700">
                                            <Zap size={12} />
                                            <span>Paraphrases</span>
                                        </div>
                                        <div className="space-y-1 text-sm font-semibold leading-relaxed text-neutral-800">
                                            {visibleParaphrases.map((item, idx) => <p key={`${item.word}-${idx}`}>{item.word}</p>)}
                                        </div>
                                    </div>
                                )}
                                {activeFastReviewPanel === 'preposition' && visiblePrepositions.length > 0 && (
                                    <div className="w-full rounded-[1.75rem] border border-orange-200 bg-orange-50/70 px-5 py-4 text-left shadow-sm">
                                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-700">
                                            <AtSign size={12} />
                                            <span>Prepositions</span>
                                        </div>
                                        <div className="space-y-1 text-sm font-semibold leading-relaxed text-neutral-800">
                                            {visiblePrepositions.map((item, idx) => <p key={`${item.prep}-${idx}`}>{item.usage || item.prep}</p>)}
                                        </div>
                                    </div>
                                )}
                                {activeFastReviewPanel === 'idiom' && visibleIdioms.length > 0 && (
                                    <div className="w-full rounded-[1.75rem] border border-emerald-200 bg-emerald-50/70 px-5 py-4 text-left shadow-sm">
                                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                            <MessageSquare size={12} />
                                            <span>Idioms</span>
                                        </div>
                                        <div className="space-y-1 text-sm font-semibold leading-relaxed text-neutral-800">
                                            {visibleIdioms.map((item, idx) => <p key={`${item.text}-${idx}`}>{item.text}</p>)}
                                        </div>
                                    </div>
                                )}
                                {activeBotPanel === 'example' && (isStudyBuddyExampleVisible || isStudyBuddyExampleLoading || studyBuddyExampleError) && (
                                    <div className="w-full relative z-0">
                                        <div
                                            className="w-full rounded-[1.75rem] border border-blue-200 bg-blue-50/70 px-5 py-4 text-left shadow-sm transition-colors hover:bg-blue-50 relative z-10"
                                        >
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-blue-700">
                                                    <div className="flex items-center gap-2">
                                                        <BookCopy size={12} />
                                                        <span>Example</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (studyBuddyExample) speak(studyBuddyExample);
                                                            }}
                                                            className="p-1.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                                            title="Speak example"
                                                        >
                                                            <Volume2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void showNextStudyBuddyExample();
                                                    }}
                                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-all ${
                                                        isStudyBuddyExampleLoading
                                                            ? 'bg-blue-200 text-blue-800 cursor-not-allowed'
                                                            : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 active:scale-95'
                                                    }`}
                                                    disabled={isStudyBuddyExampleLoading}
                                                >
                                                    {isStudyBuddyExampleLoading ? null : <ArrowRight size={11} />}
                                                    <span>{isStudyBuddyExampleLoading ? 'Loading' : 'Next'}</span>
                                                </button>
                                            </div>
                                            {studyBuddyExample ? (
                                                <p
                                                    className="text-sm font-semibold leading-relaxed transition-all select-text text-neutral-800"
                                                >
                                                    {studyBuddyExample}
                                                </p>
                                            ) : isStudyBuddyExampleLoading ? (
                                                <div className="space-y-2">
                                                    <div className="h-3 w-full rounded-full bg-blue-100 animate-pulse" />
                                                    <div className="h-3 w-5/6 rounded-full bg-blue-100 animate-pulse" />
                                                    <div className="h-3 w-2/3 rounded-full bg-blue-100 animate-pulse" />
                                                </div>
                                            ) : studyBuddyExampleError ? (
                                                <p className="text-sm font-semibold leading-relaxed text-rose-600">
                                                    {studyBuddyExampleError}
                                                </p>
                                            ) : (
                                                <p className="text-sm font-semibold leading-relaxed text-neutral-500">
                                                    Tap to show an example sentence.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {activeBotPanel === 'quiz' && (
                                    <div className="w-full relative z-0">
                                        <div className="w-full rounded-[1.75rem] border border-fuchsia-200 bg-fuchsia-50/70 px-5 py-4 text-left shadow-sm transition-colors hover:bg-fuchsia-50 relative z-10">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-fuchsia-700">
                                                    <Sparkles size={12} />
                                                    <span>Quiz</span>
                                                </div>
                                                <button
                                                    onClick={() => void showNextStudyBuddyQuiz()}
                                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-all ${
                                                        isStudyBuddyQuizLoading
                                                            ? 'bg-fuchsia-200 text-fuchsia-800 cursor-not-allowed'
                                                            : 'bg-white text-fuchsia-700 border border-fuchsia-200 hover:bg-fuchsia-100 hover:border-fuchsia-300 active:scale-95'
                                                    }`}
                                                    disabled={isStudyBuddyQuizLoading}
                                                >
                                                    {isStudyBuddyQuizLoading ? null : <ArrowRight size={11} />}
                                                    <span>{isStudyBuddyQuizLoading ? 'Loading' : 'Next'}</span>
                                                </button>
                                            </div>
                                            {studyBuddyQuizItem ? (
                                                <div className="space-y-3">
                                                    {studyBuddyQuizFeedback === 'Match' ? (
                                                        <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2">
                                                            <p className="flex items-center gap-1.5 text-xs font-black text-green-700">
                                                                <CheckCircle2 size={14} />
                                                                <span>Match</span>
                                                            </p>
                                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-green-800">
                                                                {studyBuddyQuizItem.question}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm font-semibold leading-relaxed text-neutral-800">
                                                            {maskAnswerInSentence(studyBuddyQuizItem.question, studyBuddyQuizItem.answer, currentWord.word)}
                                                        </p>
                                                    )}
                                                    <div className="space-y-2">
                                                        <input
                                                            ref={studyBuddyQuizInputRef}
                                                            value={studyBuddyQuizAnswer}
                                                            onChange={(e) => {
                                                                setStudyBuddyQuizAnswer(e.target.value);
                                                                setStudyBuddyQuizFeedback(null);
                                                            }}
                                                            onFocus={handleStudyBuddyQuizInputFocus}
                                                            onBlur={handleStudyBuddyQuizInputBlur}
                                                            onKeyDown={handleStudyBuddyQuizInputKeyDown}
                                                            placeholder="Type your answer..."
                                                            className={`w-full rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-fuchsia-500 ${
                                                                !isStudyBuddyQuizInputFocused && studyBuddyQuizAnswer === studyBuddyQuizHint ? 'text-neutral-500' : 'text-neutral-900'
                                                            }`}
                                                        />
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <button
                                                                onClick={() => void handleStudyBuddyQuizCheck()}
                                                                disabled={!studyBuddyQuizAnswer.trim() || isStudyBuddyQuizChecking}
                                                                className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-700 transition-all hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {isStudyBuddyQuizChecking ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                                                <span>Check</span>
                                                            </button>
                                                            <button
                                                                onClick={() => void handleStudyBuddyQuizHint()}
                                                                disabled={isStudyBuddyQuizHintLoading}
                                                                className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-700 transition-all hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {isStudyBuddyQuizHintLoading ? <Loader2 size={11} className="animate-spin" /> : <HelpCircle size={11} />}
                                                                <span>Hint</span>
                                                            </button>
                                                        </div>
                                                        {studyBuddyQuizFeedback && studyBuddyQuizFeedback !== 'Match' && (
                                                            <div className="space-y-1">
                                                                <p className="text-xs font-bold text-fuchsia-800">
                                                                    {studyBuddyQuizFeedback}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : isStudyBuddyQuizLoading ? (
                                                studyBuddyQuizStreamText ? (
                                                    <p className="text-sm font-semibold leading-relaxed text-neutral-500 animate-pulse">
                                                        {studyBuddyQuizStreamText}
                                                    </p>
                                                ) : (
                                                <div className="space-y-2">
                                                    <div className="h-3 w-full rounded-full bg-fuchsia-100 animate-pulse" />
                                                    <div className="h-3 w-5/6 rounded-full bg-fuchsia-100 animate-pulse" />
                                                    <div className="h-3 w-2/3 rounded-full bg-fuchsia-100 animate-pulse" />
                                                </div>
                                                )
                                            ) : studyBuddyQuizError ? (
                                                <p className="text-sm font-semibold leading-relaxed text-rose-600">
                                                    {studyBuddyQuizError}
                                                </p>
                                            ) : (
                                                <p className="text-sm font-semibold leading-relaxed text-neutral-500">
                                                    Tap Quiz to get a collocation question.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                </div>
                            </div>
                        </>)}
                    </div>
                    
                    <button 
                        onClick={() => setProgress(p => ({ ...p, current: (p.current + 1) % sessionWords.length }))} 
                        className="hidden sm:block p-4 rounded-full text-neutral-300 hover:text-neutral-900 transition-all relative z-20"
                        aria-label="Next word"
                    >
                        <ArrowRight size={28} />
                    </button>
                </div>

                <div className="shrink-0 pt-6 pb-2 mt-auto">
                    {isNewWord ? (
                        <div className="max-w-lg mx-auto grid grid-cols-3 items-stretch gap-4">
                            <div /> {/* Empty cell for spacing */}
                            <button onClick={() => handleReview(ReviewGrade.LEARNED)} className="py-5 bg-green-500 text-white rounded-2xl flex flex-col items-center justify-center space-y-1.5 shadow-lg shadow-green-500/20 hover:bg-green-600 transition-all active:scale-95">
                                <CheckCircle2 size={20} />
                                <span className="text-[9px] font-black uppercase">LEARNED</span>
                            </button>
                            <div /> {/* Empty cell for spacing */}
                        </div>
                    ) : !isQuickFire && (
                        <div className="max-w-xl mx-auto grid grid-cols-4 items-stretch gap-3">
                            <button onClick={() => handleReview(ReviewGrade.FORGOT)} className="py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><X size={20} /><span className="text-[9px] font-black uppercase">FORGOT</span></button>
                            <button onClick={() => handleReview(ReviewGrade.HARD)} className="py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-orange-600 hover:bg-orange-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><HelpCircle size={20} /><span className="text-[9px] font-black uppercase">Hard</span></button>
                            <button onClick={() => handleReview(ReviewGrade.EASY)} className="py-5 bg-white border border-neutral-100 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all"><Check size={20} /><span className="text-[9px] font-black uppercase">Easy</span></button>
                            <button onClick={handleQuickReview} className="py-5 bg-indigo-600 text-white rounded-2xl flex flex-col items-center justify-center space-y-1.5 transition-all hover:bg-indigo-700 shadow-md shadow-indigo-200"><Zap size={20} fill="currentColor" /><span className="text-[9px] font-black uppercase">Quick Review</span></button>
                        </div>
                    )}
                </div>
            </div>
            {wordInModal && <ViewStudyItemModal word={wordInModal} onUpdate={onUpdate} onClose={() => setWordInModal(null)} onNavigateToWord={setWordInModal} onEditRequest={handleEditRequest} onGainXp={async () => 0} isViewOnly={false} />}
            {editingWordInModal && <EditStudyItemModal user={user} word={editingWordInModal} onSave={handleSaveEdit} onClose={() => setEditingWordInModal(null)} onSwitchToView={(word) => { setEditingWordInModal(null); setWordInModal(word); }} />}
            {isTesting && currentWord && <TestModal word={currentWord} isQuickFire={isQuickFire} sessionPosition={isQuickFire ? { current: currentIndex + 1, total: sessionWords.length } : undefined} onPrevWord={() => setProgress(p => ({ ...p, current: Math.max(0, p.current - 1) }))} onClose={() => {
                console.log('[InlineReview][ReviewSessionUI] TestModal onClose', { isQuickFire, currentWord: currentWord.word });
                if (isQuickFire) onComplete(); else setIsTesting(false);
            }} onComplete={handleTestComplete} skipSetup={isQuickReviewMode} skipRecap={autoCloseOnFinish} />}
            {mimicTarget !== null && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />}
        </>
    );
};
