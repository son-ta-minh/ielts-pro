import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
// Added missing RefreshCw import
import { Search, LibraryBig, Ear, X, Mic, Combine, MessageSquare, Plus, Edit3, AtSign, Clock, BookOpen, Volume2, Network, Zap, AlertCircle, ShieldCheck, ShieldX, Ghost, Wand2, ChevronDown, ChevronRight, BookOpenText, Image, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { StudyItem, WordFamilyMember, LearnedStatus, Unit, StudyItemQuality, ParaphraseTone, WordFamily, WordFamilyGroup } from '../../app/types';
import { getRemainingTime } from '../../utils/srs';
import { speak, getPreferredSpeakLanguage, resolveCoachVoiceForLanguage } from '../../utils/audio';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { parseMarkdown } from '../../utils/markdownParser';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { isFuzzyPhraseMatch } from '../../utils/fuzzyPhraseMatch';
import { expandHighlightTerms, getHeadwordHighlightTerms } from '../../utils/headwordHighlightMap';
import { findWordByStudyBuddyLookup } from '../../utils/vocabularyKeywordUtils';

// --- Visual Components ---

const MasteryScoreGauge: React.FC<{ score: number }> = ({ score }) => {
    const size = 36;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    let color = 'text-neutral-400';
    if (score >= 80) color = 'text-green-500';
    else if (score >= 50) color = 'text-yellow-500';
    else if (score > 0) color = 'text-orange-500';

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="absolute" width={size} height={size}>
                <circle className="text-neutral-100" stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" r={radius} cx={size / 2} cy={size / 2} />
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
                Mastery Score
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
            </div>
        </div>
    );
};

const RegisterBadge: React.FC<{ register?: 'academic' | 'casual' | 'neutral' | 'raw' }> = ({ register }) => {
    if (!register || register === 'raw') return null;
    const styles = { academic: 'bg-purple-100 text-purple-800 border-purple-200', casual: 'bg-sky-100 text-sky-800 border-sky-200', neutral: 'bg-neutral-100 text-neutral-800 border-neutral-200' };
    const text = { academic: 'ACADEMIC', casual: 'CASUAL', neutral: 'NEUTRAL' };
    return <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${styles[register]}`}>{text[register]}</span>;
};

const IdiomBadge: React.FC = () => (
    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase border bg-pink-100 text-pink-800 border-pink-200">
        IDIOM
    </span>
);

const renderParaphraseBadge = (tone: ParaphraseTone) => {
    const styles: Record<ParaphraseTone, string> = {
        academic: 'bg-purple-100 text-purple-700 border-purple-200',
        casual: 'bg-sky-100 text-sky-700 border-sky-200',
        neutral: 'bg-neutral-100 text-neutral-600 border-neutral-200'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${styles[tone]}`}>
            {tone}
        </span>
    );
};

const CollapsibleSection: React.FC<{ title: string; count: number; children: React.ReactNode; icon: React.ReactNode }> = ({ title, count, children, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (count === 0) return (
        <div className="flex items-center justify-between text-left p-3 bg-neutral-50/30 border border-neutral-100 rounded-xl">
             <div className="flex items-center gap-2">{icon}<p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{title}</p></div>
            <span className="text-[9px] font-bold text-neutral-400 italic">None</span>
        </div>
    );
    return (
        <div className="bg-white border border-neutral-100 rounded-xl transition-all shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between text-left p-3 hover:bg-neutral-50 rounded-xl">
                <div className="flex items-center gap-2">
                    {icon}
                    <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">{title}</p>
                    <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-full border border-neutral-200">{count}</span>
                </div>
                {isOpen ? <ChevronDown size={14} className="text-neutral-400"/> : <ChevronRight size={14} className="text-neutral-400"/>}
            </button>
            {isOpen && <div className="p-3 pt-2 mt-2 border-t border-neutral-100 animate-in fade-in zoom-in-95">{children}</div>}
        </div>
    );
};

const UsageTable: React.FC<{
    title: string;
    icon: React.ReactNode;
    items: any[];
    columns: string[];
    renderRow: (item: any, idx: number) => React.ReactNode;
}> = ({ title, icon, items, columns, renderRow }) => {
    if (!items || items.length === 0) return null;
    return (
        <div className="space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 px-1">
                {icon}
                <h4 className="text-xs font-black uppercase tracking-widest text-neutral-500">{title}</h4>
                <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
            </div>
            <div className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="bg-neutral-50 border-b border-neutral-100">
                            <tr>
                                {columns.map((col, idx) => (
                                    <th key={idx} className={`px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-wider ${idx === 0 ? 'w-1/4' : idx === 1 ? 'w-1/4' : 'w-1/2'}`}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 bg-white">
                            {items.map((item, idx) => renderRow(item, idx))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Main UI Component ---

export interface ViewStudyItemModalUIProps {
    word: StudyItem;
    libraryWordSet?: Set<string>;
    libraryWords?: StudyItem[];
    scannedParaphrases?: Array<ParaphraseOption & { sourceWord?: string }>;
    isScanningParaphrases?: boolean;
    scanParaphraseResultCount?: number | null;
    wordFamilyGroup?: WordFamilyGroup | null;
    onOpenWordFamilyGroupRequest?: (groupId: string) => void;
    onClose: () => void;
    onChallengeRequest: () => void;
    onMimicRequest: () => void;
    onEditRequest: () => void;
    onResetMasteryRequest?: () => void;
    onSetDisplayRequest?: (selectedText?: string) => void | Promise<void>;
    isSettingDisplay?: boolean;
    onUpdate: (word: StudyItem) => void;
    linkedUnits: Unit[];
    relatedWords: Record<string, StudyItem[]>;
    relatedByGroup: Record<string, StudyItem[]>;
    onNavigateToWord: (word: StudyItem) => void;
    isViewOnly?: boolean;
    appliedAccent?: 'US' | 'UK';
    onAddAIExample?: () => void;
    onAskAiRequest?: () => void;
    onVerifyWordRequest?: () => void;
    onAskAiSectionRequest?: (section: 'wordFamily' | 'collocation' | 'paraphrase' | 'idiom' | 'example' | 'preposition') => void;
    onScanParaphrases?: () => void;
    onAddScannedParaphrase?: (item: ParaphraseOption & { sourceWord?: string }) => void;
}

export const ViewStudyItemModalUI: React.FC<ViewStudyItemModalUIProps> = ({ 
    word, libraryWordSet, libraryWords = [], scannedParaphrases = [], isScanningParaphrases = false, scanParaphraseResultCount = null, wordFamilyGroup, onOpenWordFamilyGroupRequest, onClose, onChallengeRequest, onMimicRequest, onEditRequest, onUpdate, linkedUnits, relatedWords, relatedByGroup, 
    onResetMasteryRequest,
    onSetDisplayRequest,
    isSettingDisplay = false,
    onNavigateToWord, isViewOnly = false,
    onAddAIExample,
    onAskAiRequest,
    onVerifyWordRequest,
    onAskAiSectionRequest,
    onScanParaphrases,
    onAddScannedParaphrase
}) => {
    const displayHeadword = (word.display || '').trim() || word.word;
    const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [selectedDisplayText, setSelectedDisplayText] = useState('');
    const selectedDisplayTextRef = useRef('');
    const aiMenuRef = useRef<HTMLDivElement>(null);
    const actionMenuRef = useRef<HTMLDivElement>(null);
    const activeCollocations = useMemo(
        () => (word.collocationsArray || []).filter((item) => !item.isIgnored && item.text.trim()),
        [word.collocationsArray]
    );
    const canAutoSetDisplay = activeCollocations.length > 0;
    const readSelectionText = useCallback(() => {
        const selection = window.getSelection?.()?.toString().trim() || '';
        const normalized = selection.replace(/\s+/g, ' ').trim();
        selectedDisplayTextRef.current = normalized;
        return normalized;
    }, []);
    const syncSelectedDisplayText = useCallback(() => {
        const normalized = readSelectionText();
        setSelectedDisplayText(prev => (prev === normalized ? prev : normalized));
    }, [readSelectionText]);
    const isLibraryWord = (value: string) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return false;
        if (libraryWordSet?.has(normalized)) return true;
        return !!findWordByStudyBuddyLookup(libraryWords, word.userId, value);
    };
    // Helper to render examples with badge replacements
    const renderExample = (text: string) => {
        if (!text) return { __html: "" };

        const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const OPTIONAL_GAP_TOKENS = [
            'a', 'an', 'the',
            'my', 'your', 'his', 'her', 'its', 'our', 'their',
            'some', 'any', 'this', 'that', 'these', 'those'
        ];
        const amberHighlightHtml = (value: string) =>
            `<span class="rounded-md bg-amber-100 px-1 py-0.5 font-bold text-amber-900">${value}</span>`;
        const highlightTerms = (html: string, terms: string[]) => {
            if (terms.length === 0) return html;
            const sortedTerms = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)))
                .sort((left, right) => {
                    const tokenDiff = right.split(/\s+/).length - left.split(/\s+/).length;
                    if (tokenDiff !== 0) return tokenDiff;
                    return right.length - left.length;
                });
            const isWordChar = (char?: string) => !!char && /[A-Za-z0-9_]/.test(char);
            const hasWordBoundary = (source: string, start: number, end: number) =>
                !isWordChar(source[start - 1]) && !isWordChar(source[end]);
            const optionalGapPattern = OPTIONAL_GAP_TOKENS.map(escapeRegex).join('|');
            const buildTermPattern = (term: string) => {
                const tokens = term
                    .trim()
                    .split(/\s+/)
                    .map((token) => token.trim())
                    .filter(Boolean);

                if (tokens.length === 0) return null;
                if (tokens.length === 1) return new RegExp(escapeRegex(tokens[0]), 'gi');

                const tokenPattern = tokens
                    .map((token, index) => {
                        if (index === 0) return escapeRegex(token);
                        return `(?:\\s+(?:(?:${optionalGapPattern})\\s+){0,2})${escapeRegex(token)}`;
                    })
                    .join('');

                return new RegExp(tokenPattern, 'gi');
            };

            const highlightSegment = (segment: string) => {
                const matches: Array<{ start: number; end: number; text: string }> = [];
                const occupied: boolean[] = new Array(segment.length).fill(false);

                sortedTerms.forEach((term) => {
                    const pattern = buildTermPattern(term);
                    if (!pattern) return;
                    let match: RegExpExecArray | null;

                    while ((match = pattern.exec(segment)) !== null) {
                        const matchedText = match[0];
                        const start = match.index;
                        const end = start + matchedText.length;

                        if (!hasWordBoundary(segment, start, end)) continue;

                        let overlaps = false;
                        for (let index = start; index < end; index += 1) {
                            if (occupied[index]) {
                                overlaps = true;
                                break;
                            }
                        }
                        if (overlaps) continue;

                        matches.push({ start, end, text: matchedText });
                        for (let index = start; index < end; index += 1) {
                            occupied[index] = true;
                        }
                    }
                });

                if (matches.length === 0) return segment;

                matches.sort((left, right) => left.start - right.start);
                let cursor = 0;
                let result = '';

                matches.forEach((match) => {
                    result += segment.slice(cursor, match.start);
                    result += amberHighlightHtml(match.text);
                    cursor = match.end;
                });

                result += segment.slice(cursor);
                return result;
            };

            return html
                .split(/(<[^>]+>)/g)
                .map((segment) => {
                    if (!segment || segment.startsWith('<')) return segment;
                    return highlightSegment(segment);
                })
                .join('');
        };
        const highlightCurlyBraceText = (html: string) =>
            html
                .split(/(<[^>]+>)/g)
                .map((segment) => {
                    if (!segment || segment.startsWith('<')) return segment;
                    return segment.replace(/\{([^{}]+)\}/g, (_match, value) => amberHighlightHtml(value.trim()));
                })
                .join('');

        let html = parseMarkdown(text);

        // Replace [Tag] with custom badge renderer if available
        html = html.replace(/\[([^\]]+)\]/g, (_match, tag) => {
            const renderer = (window as any).renderMarkdownBadge;
            if (renderer) {
                const rendered = renderer(tag.trim());
                if (rendered) return rendered;
            }

            // fallback styles for example-specific tags
            const badgeMap: Record<string, string> = {
                Collocation: "bg-indigo-50 text-indigo-700 border-indigo-200",
                Prep: "bg-blue-50 text-blue-700 border-blue-200",
                Paraphrase: "bg-purple-50 text-purple-700 border-purple-200",
                "Word Family": "bg-green-50 text-green-700 border-green-200",
                Idiom: "bg-orange-50 text-orange-700 border-orange-200",
            };

            const style = badgeMap[tag];
            if (!style) return tag;

            return `<span class="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md border ${style} mr-1">${tag}</span>`;
        });

        html = highlightCurlyBraceText(html);
        html = highlightTerms(html, [
            ...getHeadwordHighlightTerms(word.word || ''),
            ...(word.keywords || [])
                .flatMap((keyword) => expandHighlightTerms(keyword.trim()))
                .filter(Boolean),
            ...(word.collocationsArray || [])
                .flatMap((item) => expandHighlightTerms(item.text.trim()))
                .filter(Boolean),
        ]);

        return { __html: html };
    };
    const [viewSettings, setViewSettings] = useState(() => getStoredJSON('ielts_pro_word_view_settings', { showHidden: false, highlightFailed: true, isLearnView: true }));

    const serverUrl = getServerUrl(getConfig());
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [isWordFamilyExpanded, setIsWordFamilyExpanded] = useState(false);
    const activeTab: 'OVERVIEW' = 'OVERVIEW';
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const viewMenuRef = useRef<HTMLDivElement>(null);
    const [badgeReady, setBadgeReady] = useState(false);
    const examplesRef = useRef<HTMLDivElement>(null);
    const [activeExampleHighlight, setActiveExampleHighlight] = useState<string | null>(null);

    useEffect(() => {
    //   console.log('=== ViewStudyItemModalUI LOAD ===');
    //   console.log('word.id:', word?.id);
    //   console.log('lastTestResults:', word?.lastTestResults);
    }, [word]);

    useEffect(() => {
        setActiveExampleHighlight(null);
    }, [word.id]);

    useEffect(() => {
        setIsWordFamilyExpanded(false);
    }, [word.id]);

    const speakWithPreferredLanguage = (text: string) => {
        const config = getConfig();
        const preferredLang = getPreferredSpeakLanguage();
        const coach = config.audioCoach.coaches[config.audioCoach.activeCoach];
        const preferredVoice = resolveCoachVoiceForLanguage(preferredLang, coach);
        speak(text, false, preferredLang, preferredVoice.voiceName, preferredVoice.accentCode);
    };

    const handlePronounceWithCoachLookup = (targetWord: string) => {
        speakWithPreferredLanguage(targetWord);
    };

    useEffect(() => { setStoredJSON('ielts_pro_word_view_settings', viewSettings); }, [viewSettings]);
    const handleSettingChange = <K extends keyof typeof viewSettings>(key: K, value: (typeof viewSettings)[K]) => setViewSettings(prev => ({...prev, [key]: value}));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) setIsViewMenuOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (aiMenuRef.current && !aiMenuRef.current.contains(event.target as Node)) {
                setIsAiMenuOpen(false);
            }
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
                setIsActionMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        readSelectionText();
        document.addEventListener('selectionchange', readSelectionText);
        window.addEventListener('mouseup', syncSelectedDisplayText);
        window.addEventListener('keyup', syncSelectedDisplayText);
        return () => {
            document.removeEventListener('selectionchange', readSelectionText);
            window.removeEventListener('mouseup', syncSelectedDisplayText);
            window.removeEventListener('keyup', syncSelectedDisplayText);
        };
    }, [readSelectionText, syncSelectedDisplayText]);

    useEffect(() => {
        (window as any).handleLessonSpeak = (text: string, lang?: 'en' | 'vi') => {
            if (lang === 'vi') {
                speak(text, false, 'vi');
                return;
            }
            speakWithPreferredLanguage(text);
        };
        return () => { delete (window as any).handleLessonSpeak; };
    }, []);

    useEffect(() => {
        (window as any).renderMarkdownBadge = (tag: string) => {
            const base =
                "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium mr-1 border";

            if (tag === 'Definition') {
                return `<span class="${base} bg-blue-50 text-blue-600 border-blue-100">Definition</span>`;
            }
            if (tag === 'Caution') {
                return `<span class="${base} bg-rose-50 text-rose-600 border-rose-100">Caution</span>`;
            }
            if (tag === 'Tip') {
                return `<span class="${base} bg-emerald-50 text-emerald-600 border-emerald-100">Tip</span>`;
            }
            if (tag === 'Important') {
                return `<span class="${base} bg-amber-50 text-amber-700 border-amber-100">Important</span>`;
            }
            if (tag === 'Compare') {
                return `<span class="${base} bg-indigo-50 text-indigo-600 border-indigo-100">Compare</span>`;
            }
            if (tag === 'Collocation') {
                return `<span class="${base} bg-indigo-50 text-indigo-600 border-indigo-100">Collocation</span>`;
            }

            if (tag === 'Prep' || tag === 'Preposition') {
                return `<span class="${base} bg-sky-50 text-sky-600 border-sky-100">Prep</span>`;
            }

            if (tag === 'Paraphrase') {
             return `<span class="${base} bg-purple-50 text-purple-600 border-purple-100">Paraphrase</span>`;
            }

            if (tag === 'Word Family') {
                return `<span class="${base} bg-teal-50 text-teal-600 border-teal-100">Word Family</span>`;
            }

            if (tag === 'Idiom') {
                return `<span class="${base} bg-pink-50 text-pink-600 border-pink-100">Idiom</span>`;
            }

            return undefined;
        };

        setBadgeReady(true);

        return () => {
            delete (window as any).renderMarkdownBadge;
        };
    }, []);

    const toggleGroupExpansion = (group: string) => { setExpandedGroups(prev => { const next = new Set(prev); if (next.has(group)) next.delete(group); else next.add(group); return next; }); };

    const doesExampleContain = (target?: string, sourceText?: string) => {
        if (!target?.trim()) return false;
        const searchableSource = sourceText || word.example;
        if (!searchableSource?.trim()) return false;
        return isFuzzyPhraseMatch(target, searchableSource, 0.7);
    };

    const handleExampleHighlightToggle = (target: string) => {
        if (!target.trim()) return;
        setActiveExampleHighlight((prev) => (prev === target ? null : target));
        requestAnimationFrame(() => {
            examplesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    };

    const splitExampleIntoSentences = (text: string) => {
        const blocks = text
            .replace(/\r\n/g, '\n')
            .split(/\n{2,}/)
            .map(block => block.trim())
            .filter(Boolean);

        return blocks.flatMap(block => {
            const matches = block.match(/[^.!?\n]+(?:[.!?]+["')\]]*)?|[^.!?\n]+$/g);
            return (matches || [block]).map(sentence => sentence.trim()).filter(Boolean);
        });
    };

    const learnStatusOptions = [
        { id: LearnedStatus.NEW, label: 'New', icon: <div className="w-3 h-3 rounded-full bg-blue-500"/> },
        { id: LearnedStatus.IGNORED, label: 'Ignored', icon: <div className="w-3 h-3 rounded-full bg-neutral-500"/> },
        { id: LearnedStatus.LEARNED, label: 'Learned', icon: <div className="w-3 h-3 rounded-full bg-cyan-500"/> },
        { id: LearnedStatus.FORGOT, label: 'Forgot', icon: <div className="w-3 h-3 rounded-full bg-rose-500"/> },
        { id: LearnedStatus.HARD, label: 'Hard', icon: <div className="w-3 h-3 rounded-full bg-orange-500"/> },
        { id: LearnedStatus.EASY, label: 'Easy', icon: <div className="w-3 h-3 rounded-full bg-green-500"/> },
    ];
    
    const currentLearnStatus = word.learnedStatus || LearnedStatus.NEW;

    const qualityStatusOptions = [
        { id: StudyItemQuality.RAW, label: 'Raw', icon: <Ghost size={14} className="text-neutral-400" /> },
        { id: StudyItemQuality.REFINED, label: 'To Review', icon: <Wand2 size={14} className="text-indigo-500" /> },
        { id: StudyItemQuality.VERIFIED, label: 'Verified', icon: <ShieldCheck size={14} className="text-emerald-500" /> },
        { id: StudyItemQuality.FAILED, label: 'Incorrect', icon: <ShieldX size={14} className="text-rose-500" /> },
    ];
    const selectedLearnStatus = learnStatusOptions.find((option) => option.id === currentLearnStatus) || learnStatusOptions[0];
    const selectedQualityStatus = qualityStatusOptions.find((option) => option.id === word.quality) || qualityStatusOptions[0];
    
    const renderFamilyCardGroup = (label: string, members: WordFamilyMember[] | undefined, color: string, typeKey: string) => {
        const visibleMembers = Array.isArray(members) ? members.filter(m => viewSettings.showHidden || !m.isIgnored) : [];
        if (visibleMembers.length === 0) return null;

        const typeAliasMap: Record<string, string> = { nouns: 'n', verbs: 'v', adjs: 'j', advs: 'd' };
        const shortTypeKey = typeAliasMap[typeKey] || typeKey;

        return (
            <div className="space-y-1">
                <span className={`text-[8px] text-indigo-900 font-black uppercase text-${color}-600 tracking-widest ml-1`}>{label}</span>
                <div className="flex flex-col gap-1">
                    {visibleMembers.map((member, idx) => {
                        const normalizedWord = member.word.toLowerCase().trim();
                        const specificKeys = [
                            `WORD_FAMILY:${typeKey}:${normalizedWord}`,
                            `WORD_FAMILY:${shortTypeKey}:${normalizedWord}`
                        ];

                        const specificResult = specificKeys
                            .map(k => word.lastTestResults?.[k])
                            .find(v => v !== undefined);

                        let isMemberFailed = false;
                        if (specificResult !== undefined) {
                            isMemberFailed = specificResult === false;
                        } else {
                            const categoryKey = `WORD_FAMILY_${typeKey.toUpperCase()}`;
                            const categoryResult = word.lastTestResults?.[categoryKey];
                            if (categoryResult === false) isMemberFailed = true;
                            else if (categoryResult === undefined && word.lastTestResults?.['WORD_FAMILY'] === false) isMemberFailed = true;
                        }

                        const isFailed = viewSettings.highlightFailed && isMemberFailed && !member.isIgnored;
                        const isIgnored = member.isIgnored;
                        let containerClass = 'bg-white border-neutral-100 hover:border-neutral-300';
                        if (isFailed) containerClass = 'bg-red-50 border-red-200 hover:border-red-300';
                        else if (isIgnored) containerClass = 'bg-neutral-50/50 border-neutral-100 opacity-60';

                        return (
                            <div key={idx} className={`relative flex items-start px-2 py-1.5 rounded-lg border group transition-colors ${containerClass}`}>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] font-bold truncate ${isFailed ? 'text-red-700' : 'text-indigo-900'} ${isIgnored ? 'line-through decoration-neutral-400' : ''}`}>
                                            {member.word}
                                        </span>
                                    </div>
                                </div>
                                <div className="absolute top-1 right-1 flex items-center gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); speakWithPreferredLanguage(member.word); }}
                                        className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"
                                    >
                                        <Volume2 size={10}/>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    /**
     * Section component for grouping related information in the UI.
     * Fixed: children prop marked as optional to resolve potential TS resolution issues.
     */
    const Section = ({ title, icon: Icon, children, className }: { title: string; icon: React.ElementType; children?: React.ReactNode; className?: string }) => (
        <div className={`space-y-2 ${className || ''}`}><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100 pb-1 mb-2"><Icon size={12} /><span>{title}</span></div>{children}</div>
    );

    const reviewStatus = getRemainingTime(word.nextReview);
    const effectiveWordFamily = useMemo<WordFamily | undefined>(() => {
        if (wordFamilyGroup) {
            return {
                nouns: (wordFamilyGroup.nouns || []).map((item) => ({ word: item, isIgnored: false })),
                verbs: (wordFamilyGroup.verbs || []).map((item) => ({ word: item, isIgnored: false })),
                adjs: (wordFamilyGroup.adjectives || []).map((item) => ({ word: item, isIgnored: false })),
                advs: (wordFamilyGroup.adverbs || []).map((item) => ({ word: item, isIgnored: false }))
            };
        }
        return word.wordFamily;
    }, [word.wordFamily, wordFamilyGroup]);

    const hasAnyFamilyData = !!(effectiveWordFamily && (effectiveWordFamily.nouns?.length || effectiveWordFamily.verbs?.length || effectiveWordFamily.adjs?.length || effectiveWordFamily.advs?.length));
    const wordFamilyCount = (
        (effectiveWordFamily?.nouns?.length || 0) +
        (effectiveWordFamily?.verbs?.length || 0) +
        (effectiveWordFamily?.adjs?.length || 0) +
        (effectiveWordFamily?.advs?.length || 0)
    );
    const displayedPreps = (word.prepositions || []).filter(p => viewSettings.showHidden || !p.isIgnored);
    const displayedCollocs = (word.collocationsArray || []).filter(c => viewSettings.showHidden || !c.isIgnored);
    const displayedIdioms = (word.idiomsList || []).filter(c => viewSettings.showHidden || !c.isIgnored);
    const displayedParas = (word.paraphrases || []).filter(p => viewSettings.showHidden || !p.isIgnored);
    const getResult = (key: string) => word.lastTestResults?.[key];
    const hasSpecificFailure = (types: string[], token: string) => types.some(type => getResult(`${type}:${token}`) === false);
    const hasGroupFailure = (types: string[]) => types.some(type => getResult(type) === false);
    const isSpellingFailed = viewSettings.highlightFailed && word.lastTestResults?.['SPELLING'] === false;
    const isIpaFailed =
      viewSettings.highlightFailed &&
      (
        word.lastTestResults?.['IPA_MATCH'] === false ||
        word.lastTestResults?.['IPA_QUIZ'] === false ||
        word.lastTestResults?.['PRONUNCIATION'] === false
      );

    const wordFamilyItems = useMemo(() => {
        if (!effectiveWordFamily) return [];
        const result: { word: string; type: string; ipa?: string }[] = [];
        const types: (keyof WordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
        const typeLabels: Record<string, string> = { nouns: 'Noun', verbs: 'Verb', adjs: 'Adjective', advs: 'Adverb' };
        
        types.forEach(t => {
            (effectiveWordFamily[t] || []).forEach(m => {
                if (viewSettings.showHidden || !m.isIgnored) {
                    result.push({ word: m.word, type: typeLabels[t], ipa: m.ipaUs });
                }
            });
        });
        return result;
    }, [effectiveWordFamily, viewSettings.showHidden]);

    const lessonUsageHtml = useMemo(() => word.lesson?.essay ? parseMarkdown(word.lesson.essay) : null, [word.lesson?.essay]);
    const lessonTestHtml = useMemo(() => word.lesson?.test ? parseMarkdown(word.lesson.test) : null, [word.lesson?.test]);
    const noteHtml = useMemo(
        () => word.note ? parseMarkdown(word.note) : null,
        [word.note, badgeReady]
    );
    const hasUsage = Boolean(lessonUsageHtml?.trim());
    const hasTest = Boolean(lessonTestHtml?.trim());
    const exampleSentences = useMemo(() => splitExampleIntoSentences(word.example || ''), [word.example]);
    const hasAiActions = Boolean(onAskAiRequest || onVerifyWordRequest || onAskAiSectionRequest || onAddAIExample);
    const trimmedSelectionText = selectedDisplayText.trim();
    const displayActionLabel = trimmedSelectionText
        ? `Set Display As "${trimmedSelectionText.length > 24 ? `${trimmedSelectionText.slice(0, 24)}...` : trimmedSelectionText}"`
        : 'Set Display Auto';
    const hasSetDisplayAction = Boolean(onSetDisplayRequest) && (Boolean(trimmedSelectionText) || canAutoSetDisplay);
    const hasActionMenu = !isViewOnly && Boolean(onChallengeRequest || onEditRequest || onScanParaphrases || onResetMasteryRequest || hasSetDisplayAction);
    const wordGroups = (word.groups || []).map((group) => group.trim()).filter(Boolean);
    const handleAiMenuAction = (action: () => void) => {
        setIsAiMenuOpen(false);
        action();
    };
    const handleActionMenuAction = (action: () => void) => {
        setIsActionMenuOpen(false);
        action();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white w-full max-w-6xl rounded-2xl sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
                <header className="px-4 sm:px-8 pt-4 pb-0 border-b border-neutral-100 bg-neutral-50/30 flex flex-col gap-1 shrink-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        
                        {/* ROW 1 - LEFT: WORD + ACTION ICONS */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex flex-1 flex-wrap items-center gap-3">
                                    <h2 className={`min-w-0 break-words text-2xl font-black tracking-tight leading-none ${isSpellingFailed ? 'text-red-600' : 'text-neutral-900'}`}>
                                        {displayHeadword}
                                    </h2>
                                    {isSpellingFailed && <AlertCircle size={16} className="text-red-500 fill-red-100 shrink-0" />}
                                </div>
                            </div>

                            
                        </div>

                        {/* ROW 1 - RIGHT: STATUS + ACTIONS */}
                        <div className="flex items-start justify-start md:justify-end gap-2 flex-wrap">
                            <div className="relative shrink-0 group/status">
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-700 shadow-sm transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                >
                                    {selectedLearnStatus.icon}
                                    <span>Status</span>
                                </button>
                                <div className="pointer-events-none invisible absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-neutral-100 bg-white p-3 opacity-0 shadow-xl transition-all duration-150 group-hover/status:pointer-events-auto group-hover/status:visible group-hover/status:opacity-100">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3 rounded-xl">
                                            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">Mastery</span>
                                            <div className="flex items-center gap-2">
                                                <MasteryScoreGauge score={word.masteryScore ?? 0} />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 rounded-xl">
                                            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">Learned</span>
                                            <div className="flex items-center gap-2 text-xs uppercase text-neutral-500">
                                                {selectedLearnStatus.icon}
                                                <span>{selectedLearnStatus.label}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 rounded-xl">
                                            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">Quality</span>
                                            <div className="flex items-center gap-2 text-xs uppercase text-neutral-500">
                                                {selectedQualityStatus.icon}
                                                <span>{selectedQualityStatus.label}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 rounded-xl">
                                            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">Due</span>
                                            <div className="flex items-center gap-2 text-[10px] uppercase">
                                                <Clock size={12} className={reviewStatus.urgency === 'due' ? 'text-rose-500' : 'text-green-600'} />
                                                <span className={reviewStatus.urgency === 'due' ? 'text-rose-500' : 'text-green-600'}>
                                                    {reviewStatus.label}
                                                </span>
                                            </div>
                                        </div>
                                        {wordGroups.length > 0 ? (
                                            <div className="space-y-1 rounded-xl">
                                                <span className="text-[10px] font-black uppercase tracking-wide text-neutral-500">Groups</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {wordGroups.map((group) => (
                                                        <span
                                                            key={group}
                                                            className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-cyan-700"
                                                        >
                                                            {group}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                            {hasActionMenu ? (
                                <div
                                    className="relative shrink-0"
                                    ref={actionMenuRef}
                                    onMouseEnter={() => {
                                        syncSelectedDisplayText();
                                        setIsActionMenuOpen(true);
                                    }}
                                    onMouseLeave={() => setIsActionMenuOpen(false)}
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleActionMenuAction(onEditRequest)}       
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 shadow-sm"
                                    >
                                        <Edit3 size={12} />
                                        <span>Action</span>
                                        <ChevronDown size={12} className={`transition-transform duration-200 ${isActionMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isActionMenuOpen ? (
                                        <div className="absolute right-0 top-full z-50 w-52 pt-2">
                                            <div className="flex flex-col gap-1 overflow-hidden rounded-2xl border border-neutral-100 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95">
                                                <button
                                                    type="button"
                                                    onClick={() => handleActionMenuAction(onEditRequest)}
                                                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-100"
                                                >
                                                    <Edit3 size={12} />
                                                    <span>Edit</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleActionMenuAction(onChallengeRequest)}
                                                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-amber-50"
                                                >
                                                    <BookOpenText size={12} />
                                                    <span>Review</span>
                                                </button>
                                                {hasSetDisplayAction ? (
                                                    <button
                                                        type="button"
                                                        disabled={isSettingDisplay}
                                                        title='Show display text instead of headword in the app. For example, if the word is "run" but you want to be reminded of "running", you can select "running" in the text and choose "Set Display As".'
                                                        onClick={() => handleActionMenuAction(() => {
                                                            const latestSelectedText = readSelectionText() || trimmedSelectionText;
                                                            void onSetDisplayRequest?.(latestSelectedText || undefined);
                                                        })}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-cyan-50 disabled:opacity-50"
                                                    >
                                                        {isSettingDisplay ? <Loader2 size={12} className="animate-spin" /> : <BookOpenText size={12} />}
                                                        <span>{isSettingDisplay ? 'Setting Display...' : displayActionLabel}</span>
                                                    </button>
                                                ) : null}
                                                {onResetMasteryRequest ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleActionMenuAction(onResetMasteryRequest)}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-rose-50"
                                                    >
                                                        <RefreshCw size={12} />
                                                        <span>Reset Mastery</span>
                                                    </button>
                                                ) : null}
                                                {onScanParaphrases ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleActionMenuAction(onScanParaphrases)}
                                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-amber-50"
                                                    >
                                                        {isScanningParaphrases ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                                                        <span>{isScanningParaphrases ? 'Scanning...' : 'Scan Paraphrases'}</span>
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                            {hasAiActions ? (
                                <div
                                    className="relative shrink-0"
                                    ref={aiMenuRef}
                                    onMouseEnter={() => setIsAiMenuOpen(true)}
                                    onMouseLeave={() => setIsAiMenuOpen(false)}
                                >
                                    <button
                                        type="button"
                                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 shadow-sm"
                                        title="Open StudyBuddy actions for this word"
                                    >
                                        <MessageSquare size={12} />
                                        <span>Ask AI</span>
                                        <ChevronDown size={12} className={`transition-transform duration-200 ${isAiMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isAiMenuOpen ? (
                                        <div className="absolute right-0 top-full z-50 w-56 max-w-[calc(100vw-2rem)] pt-2">
                                            <div className="flex flex-col gap-1 overflow-hidden rounded-2xl border border-neutral-100 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95">
                                                {onVerifyWordRequest ? (
                                                    <button type="button" onClick={() => handleAiMenuAction(onVerifyWordRequest)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-50">
                                                        <Search size={12} />
                                                        <span>Verify Word</span>
                                                    </button>
                                                ) : null}
                                                {onAskAiRequest ? (
                                                    <button type="button" onClick={() => handleAiMenuAction(onAskAiRequest)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-100">
                                                        <MessageSquare size={12} />
                                                        <span>Explain Word</span>
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                            <button onClick={onClose} className="p-2 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* ROW 2 - LEFT: REGISTER + PRON */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {word.register && <RegisterBadge register={word.register} />}
                            {word.isIdiom && <IdiomBadge />}

                            {word.pronSim && (
                                <div
                                    className={`flex items-center gap-1 px-2 py-0.5 border rounded-md ${
                                        isIpaFailed ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-100'
                                    }`}
                                >
                                    <Ear size={12} className={isIpaFailed ? 'text-red-600' : 'text-indigo-600'} />
                                    <span
                                        className={`text-[9px] font-black uppercase tracking-wider ${
                                            isIpaFailed ? 'text-red-600' : 'text-indigo-600'
                                        }`}
                                    >
                                        {word.pronSim === 'different' ? 'US ≠ UK' : 'US = UK'}
                                    </span>
                                </div>
                            )}

                            {!word.isPassive && (
                                <>
                                    <button
                                        onClick={() => handlePronounceWithCoachLookup(displayHeadword)}
                                        className="shrink-0 p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                    >
                                        <Volume2 size={18} />
                                    </button>
                                    <div className="relative group shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); speak(word.meaningVi, false, 'vi'); }}
                                            className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                        >
                                            <BookOpen size={18} />
                                        </button>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-xs px-3 py-2 bg-neutral-800 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                            {word.meaningVi}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onMimicRequest}
                                        className="shrink-0 p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                    >
                                        <Mic size={18} />
                                    </button>
                                </>
                            )}

                            {Array.isArray(word.img) && word.img.some(i => i && i.trim() !== "") && (
                                <div className="relative inline-block group shrink-0">
                                    <button
                                        className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                    >
                                        <Image size={18} />
                                    </button>
                                    <div className="absolute top-full left-0 -translate-x-10 mt-2 w-max max-w-[28rem] overflow-x-hidden overflow-y-hidden p-4 bg-white border border-neutral-200 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
                                        <div className="flex flex-wrap gap-3">
                                            {word.img.filter(i => i && i.trim() !== "").map((raw, idx) => {
                                                let caption: string | null = null;
                                                let imageUrl = raw;

                                                const firstColonIndex = raw.indexOf(':');
                                                if (firstColonIndex > -1 && raw.startsWith('http') === false) {
                                                    caption = raw.slice(0, firstColonIndex).trim();
                                                    imageUrl = raw.slice(firstColonIndex + 1).trim();
                                                }

                                                return (
                                                    <div key={idx} className="basis-1/2 sm:flex-none sm:w-48 flex flex-col gap-1">
                                                        {imageUrl && (
                                                            <img
                                                                src={imageUrl.startsWith('http')
                                                                    ? imageUrl
                                                                    : `${serverUrl}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}`}
                                                                alt={`word-img-${idx}: [${imageUrl}]`}
                                                                className="w-full h-36 object-cover rounded-lg border border-neutral-100"
                                                            />
                                                        )}
                                                        {caption && (
                                                            <div className="text-[10px] font-semibold text-neutral-600 text-center truncate">
                                                                {caption}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-start justify-start md:justify-end gap-2 flex-wrap" />

                    </div>
                </header>

                <div className="flex-1 overflow-auto no-scrollbar px-4 sm:px-6 pt-4 pb-8 bg-neutral-50/20">
                    {(
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {!word ? (
                                <div className="py-10 text-center text-sm font-semibold text-neutral-400">
                                    There is no data to display. Please refine word.
                                </div>
                            ) : (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {noteHtml && (
                                    <div className="md:col-span-4">
                                        <div
                                            className="text-sm font-medium text-neutral-700 leading-relaxed bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2"
                                            dangerouslySetInnerHTML={{ __html: noteHtml }}
                                        />
                                    </div>
                                )}
                                {displayedPreps.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <div className="mb-1 flex items-center justify-between">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                                <AtSign size={10}/> Prepositions
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white border border-neutral-100 p-3 rounded-xl shadow-sm">
                                            {displayedPreps.map((p, i) => {
                                                const specificKey = `PREPOSITION_QUIZ:${p.prep}`;
                                                const specificResult = word.lastTestResults?.[specificKey];
                                                const isFailed = viewSettings.highlightFailed && (specificResult === false || (specificResult === undefined && word.lastTestResults?.['PREPOSITION_QUIZ'] === false)) && !p.isIgnored;
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`relative flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                                                            isFailed ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-white border border-neutral-100 text-indigo-900'
                                                        } ${p.isIgnored ? 'opacity-50' : ''}`}
                                                    >
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`truncate ${p.isIgnored ? 'line-through' : ''}`} title={p.prep}>
                                                                    {p.prep}
                                                                </span>
                                                            </div>

                                                            {p.usage && !p.isIgnored && (
                                                                <div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">
                                                                    {p.usage}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {p.usage && (
                                                            <div className="absolute top-1 right-1 flex items-center gap-1">
                                                                {doesExampleContain(p.usage) && (
                                                                    <button
                                                                        onClick={() => handleExampleHighlightToggle(p.usage)}
                                                                        className={`transition-colors p-0.5 ${activeExampleHighlight === p.usage ? 'text-sky-600' : 'text-neutral-300 hover:text-sky-500'}`}
                                                                        title="Highlight matching examples"
                                                                    >
                                                                        <AtSign size={10}/>
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => speakWithPreferredLanguage(p.usage)}
                                                                    className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"
                                                                >
                                                                    <Volume2 size={10}/>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {hasAnyFamilyData && (
                                    <div className="space-y-1 md:col-span-4">
                                        <div className="mb-1 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                                    <Network size={10}/> Word Family
                                                </label>
                                                <span className="rounded-full border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-neutral-500">
                                                    {wordFamilyCount}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {wordFamilyGroup?.id && onOpenWordFamilyGroupRequest ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenWordFamilyGroupRequest(wordFamilyGroup.id)}
                                                        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                                    >
                                                        <LibraryBig size={10} />
                                                        <span>Edit</span>
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => setIsWordFamilyExpanded((prev) => !prev)}
                                                    className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                                >
                                                    {isWordFamilyExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                                    <span>{isWordFamilyExpanded ? 'Hide' : 'Show'}</span>
                                                </button>
                                            </div>
                                        </div>
                                        {isWordFamilyExpanded && (
                                            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 animate-in fade-in zoom-in-95">
                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                    {renderFamilyCardGroup("Nouns", effectiveWordFamily?.nouns, "blue", "nouns")}
                                                    {renderFamilyCardGroup("Verbs", effectiveWordFamily?.verbs, "green", "verbs")}
                                                    {renderFamilyCardGroup("Adjectives", effectiveWordFamily?.adjs, "orange", "adjs")}
                                                    {renderFamilyCardGroup("Adverbs", effectiveWordFamily?.advs, "purple", "advs")}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {displayedCollocs.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <div className="mb-1 flex items-center justify-between">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                                <Combine size={10}/> Collocations
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                            {displayedCollocs.map((c, i) => {
                                                let isFailed = false;
                                                if (viewSettings.highlightFailed && !c.isIgnored) {
                                                    const types = ['COLLOCATION_QUIZ', 'COLLOCATION_CONTEXT_QUIZ', 'COLLOCATION_MULTICHOICE_QUIZ'];
                                                    if (hasSpecificFailure(types, c.text)) isFailed = true;
                                                    else if (!types.some(type => getResult(`${type}:${c.text}`) !== undefined) && hasGroupFailure(types)) isFailed = true;
                                                }
                                                const isInLibrary = isLibraryWord(c.text);
                                                let containerClass = "bg-white border border-neutral-100 text-indigo-900";
                                                if (isFailed) containerClass = "bg-red-50 border border-red-200 text-red-700";
                                                else if (c.isIgnored) containerClass = "bg-neutral-50 border border-neutral-100 text-neutral-400";
                                                return (
                                                    <div key={i} className={`relative flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${containerClass}`}>
                                                        <div className="flex-1 overflow-hidden">
                                                            <span className={`${c.isIgnored ? 'line-through' : isInLibrary ? 'text-green-900' : ''}`} title={c.text}>{c.text}</span>
                                                            {c.d && !c.isIgnored && (
                                                                <div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">{c.d}</div>
                                                            )}
                                                        </div>
                                                        <div className="absolute top-1 right-1 flex items-center gap-1">
                                                            {doesExampleContain(c.text) && (
                                                                <button
                                                                    onClick={() => handleExampleHighlightToggle(c.text)}
                                                                    className={`transition-colors p-0.5 ${activeExampleHighlight === c.text ? 'text-sky-600' : 'text-neutral-300 hover:text-sky-500'}`}
                                                                    title="Highlight matching examples"
                                                                >
                                                                    <AtSign size={10}/>
                                                                </button>
                                                            )}
                                                            <button onClick={() => speakWithPreferredLanguage(c.text)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5">
                                                                <Volume2 size={10}/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {displayedParas.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <div className="mb-1 flex items-center justify-between">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                                <Zap size={10} className="text-amber-500"/> Variations
                                            </label>
                                            {scanParaphraseResultCount !== null ? (
                                                <div className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-green-700">
                                                    <CheckCircle2 size={10} />
                                                    <span>Found {scanParaphraseResultCount}</span>
                                                </div>
                                            ) : <div />}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                            {displayedParas.map((para, idx) => {
                                                const types = ['PARAPHRASE_QUIZ', 'PARAPHRASE_CONTEXT_QUIZ'];
                                                const hasSpecific = types.some(type => getResult(`${type}:${para.word}`) !== undefined);
                                                const isFailed = viewSettings.highlightFailed && !para.isIgnored && (hasSpecificFailure(types, para.word) || (!hasSpecific && hasGroupFailure(types)));
                                                const isIgnored = para.isIgnored;
                                                const isInLibrary = isLibraryWord(para.word);
                                                return (
                                                    <div key={idx} className={`relative flex items-start gap-2 border px-3 py-2 rounded-xl shadow-sm ${isFailed ? 'bg-red-50 border-red-200' : isIgnored ? 'bg-neutral-50 border-neutral-100 opacity-60' : 'bg-white border-neutral-200'}`}>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="flex justify-between items-center mb-1">
                                                                {renderParaphraseBadge(para.tone)}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className={`text-xs font-bold ${isFailed ? 'text-red-800' : isInLibrary ? 'text-green-900' : 'text-indigo-800'} ${isIgnored ? 'line-through' : ''}`}>{para.word}</div>
                                                            </div>
                                                            <div className={`text-[10px] italic truncate text-neutral-400`} title={para.context}>{para.context}</div>
                                                        </div>
                                                        <div className="absolute top-1 right-1 flex items-center gap-1">
                                                            {doesExampleContain(para.word) && (
                                                                <button
                                                                    onClick={() => handleExampleHighlightToggle(para.word)}
                                                                    className={`transition-colors p-0.5 ${activeExampleHighlight === para.word ? 'text-sky-600' : 'text-neutral-300 hover:text-sky-500'}`}
                                                                    title="Highlight matching examples"
                                                                >
                                                                    <AtSign size={10}/>
                                                                </button>
                                                            )}
                                                            <button onClick={() => speakWithPreferredLanguage(para.word)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {scannedParaphrases.length > 0 && (
                                            <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                                                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-700">
                                                    <Search size={10} />
                                                    <span>Scanned Paraphrases</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                                                    {scannedParaphrases.map((para, idx) => {
                                                        const isInLibrary = isLibraryWord(para.word);
                                                        return (
                                                            <div
                                                                key={`${para.word}-${idx}`}
                                                                className="relative rounded-xl border border-dashed border-amber-300 bg-white px-3 py-2 shadow-sm"
                                                            >
                                                                {onAddScannedParaphrase && !isViewOnly ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onAddScannedParaphrase(para)}
                                                                        title="Add to Word Data"
                                                                        className="absolute right-1 top-1 rounded-md p-1 text-neutral-400 transition-colors hover:bg-amber-100 hover:text-amber-700"
                                                                    >
                                                                        <Plus size={12} />
                                                                    </button>
                                                                ) : null}
                                                                <div className="pr-6">
                                                                    <div className={`text-xs font-bold ${isInLibrary ? 'text-green-900' : 'text-amber-900'}`}>
                                                                        {para.word}
                                                                    </div>
                                                                    <div className="mt-1">
                                                                        {renderParaphraseBadge(para.tone)}
                                                                    </div>
                                                                    <div className="mt-1 truncate text-[10px] italic text-neutral-500" title={para.context}>
                                                                        {para.context}
                                                                    </div>
                                                                    {para.sourceWord ? (
                                                                        <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                                                                            from {para.sourceWord}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {displayedIdioms.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <div className="mb-1 flex items-center justify-between">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                                <MessageSquare size={10}/> Related Idioms
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                            {displayedIdioms.map((idiom, i) => {
                                                let isFailed = false;
                                                if (viewSettings.highlightFailed && !idiom.isIgnored) {
                                                    const types = ['IDIOM_QUIZ', 'IDIOM_CONTEXT_QUIZ'];
                                                    if (hasSpecificFailure(types, idiom.text)) isFailed = true;
                                                    else if (!types.some(type => getResult(`${type}:${idiom.text}`) !== undefined) && hasGroupFailure(types)) isFailed = true;
                                                }
                                                let containerClass = "bg-amber-50/50 border border-amber-100 text-amber-900";
                                                if (isFailed) containerClass = "bg-red-50 border border-red-200 text-red-700";
                                                else if (idiom.isIgnored) containerClass = "bg-neutral-50 border border-neutral-100 text-neutral-400";
                                                return (
                                                    <div key={i} className={`relative flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${containerClass}`}>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`truncate ${idiom.isIgnored ? 'line-through' : ''}`} title={idiom.text}>{idiom.text}</span>
                                                            </div>
                                                            {idiom.d && !idiom.isIgnored && (
                                                                <div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">{idiom.d}</div>
                                                            )}
                                                        </div>
                                                        <div className="absolute top-1 right-1 flex items-center gap-1">
                                                            <button onClick={() => speakWithPreferredLanguage(idiom.text)} className="text-neutral-300 hover:text-amber-500 transition-colors p-0.5">
                                                                <Volume2 size={10}/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {word.example && (                                        
                                    <div className="md:col-span-4" ref={examplesRef}>
                                        <div className="mb-2 flex items-center justify-between">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                                <AtSign size={10}/> Examples
                                            </label>
                                            <div />
                                        </div>
                                        <div className="w-full select-text text-sm leading-snug text-neutral-700">
                                        {exampleSentences.map((sentence, index) => {
                                            const isHighlighted = activeExampleHighlight ? doesExampleContain(activeExampleHighlight, sentence) : false;
                                            return (
                                                <div
                                                    key={`${sentence}-${index}`}
              className={`w-full px-3 py-0.25 box-border border rounded-xl ${isHighlighted ? 'border-sky-200 bg-sky-50' : 'border-transparent bg-transparent'}`}
                                                    dangerouslySetInnerHTML={renderExample(sentence)}
                                                />
                                            );
                                        })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
};
