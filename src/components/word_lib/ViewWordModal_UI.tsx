import React, { useState, useRef, useEffect, useMemo } from 'react';
// Added missing RefreshCw import
import { Ear, Check, X, Mic, Quote, Combine, MessageSquare, Plus, CheckCircle2, Edit3, AtSign, Eye, Clock, BookOpen, Volume2, Network, Zap, AlertCircle, ShieldCheck, ShieldX, Ghost, Wand2, ChevronDown, ChevronRight, BrainCircuit, Loader2, BookText, ClipboardList, Sparkles, RefreshCw, Image, LayoutDashboard } from 'lucide-react';
import { VocabularyItem, WordFamilyMember, ReviewGrade, Unit, ParaphraseOption, PrepositionPattern, CollocationDetail, WordQuality, ParaphraseTone, WordFamily } from '../../app/types';
import { getRemainingTime, updateSRS, resetProgress } from '../../utils/srs';
import { speak } from '../../utils/audio';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { parseMarkdown } from '../../utils/markdownParser';
import { getConfig, getServerUrl } from '../../app/settingsManager';

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

const MasteryScoreCalculator: React.FC<{ word: VocabularyItem }> = ({ word }) => {
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

const renderParaphraseBadge = (tone: ParaphraseTone) => {
    const styles: Record<ParaphraseTone, string> = {
        intensified: 'bg-orange-100 text-orange-700 border-orange-200',
        softened: 'bg-blue-100 text-blue-700 border-blue-200',
        synonym: 'bg-neutral-100 text-neutral-600 border-neutral-200',
        academic: 'bg-purple-100 text-purple-700 border-purple-200',
        casual: 'bg-sky-100 text-sky-700 border-sky-200'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${styles[tone] || styles.synonym}`}>
            {tone}
        </span>
    );
};

const StatusDropdown: React.FC<{
    label?: string;
    options: { id: string; label: string; icon: React.ReactNode; }[];
    selectedId: string;
    onSelect: (id: string) => void;
    buttonClass?: string;
    disabled?: boolean;
}> = ({ label, options, selectedId, onSelect, buttonClass, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(o => o.id === selectedId) || options[0];
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    return (
        <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setIsOpen(!isOpen)} className={buttonClass} disabled={disabled}>
                {label && <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mr-2">{label}</span>}
                {selectedOption.icon}
                <span className="text-xs font-black uppercase tracking-wider">{selectedOption.label}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !disabled && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                    {options.map(option => (
                        <button key={option.id} type="button" onClick={() => { onSelect(option.id); setIsOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${selectedId === option.id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'}`}>
                            {option.icon}
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
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

export interface ViewWordModalUIProps {
    word: VocabularyItem;
    onClose: () => void;
    onChallengeRequest: () => void;
    onMimicRequest: () => void;
    onEditRequest: () => void;
    onUpdate: (word: VocabularyItem) => void;
    linkedUnits: Unit[];
    relatedWords: Record<string, VocabularyItem[]>;
    relatedByGroup: Record<string, VocabularyItem[]>;
    onNavigateToWord: (word: VocabularyItem) => void;
    onAddVariantToLibrary: (variant: { word: string, ipa: string }, sourceType?: 'family' | 'paraphrase' | 'idiom' | 'collocation') => void;
    addingVariant: string | null;
    existingVariants: Set<string>;
    isViewOnly?: boolean;
    appliedAccent?: 'US' | 'UK';
    initialTab?: 'OVERVIEW' | 'USAGE' | 'TEST';
    onGenerateLesson?: (mode: 'ESSAY' | 'TEST') => void;
    displayUsage?: (text: string, matchThreshold?: number) => void;
}

export const ViewWordModalUI: React.FC<ViewWordModalUIProps> = ({ 
    word, onClose, onChallengeRequest, onMimicRequest, onEditRequest, onUpdate, linkedUnits, relatedWords, relatedByGroup, 
    onNavigateToWord, onAddVariantToLibrary, addingVariant, existingVariants, isViewOnly = false, appliedAccent, initialTab = 'OVERVIEW',
    onGenerateLesson, displayUsage
}) => {
    const [viewSettings, setViewSettings] = useState(() => getStoredJSON('ielts_pro_word_view_settings', { showHidden: false, highlightFailed: true, isLearnView: true }));

    const serverUrl = getServerUrl(getConfig());
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USAGE' | 'TEST'>(initialTab as any);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const viewMenuRef = useRef<HTMLDivElement>(null);
    const [badgeReady, setBadgeReady] = useState(false);

    useEffect(() => {
    //   console.log('=== ViewWordModalUI LOAD ===');
    //   console.log('word.id:', word?.id);
    //   console.log('lastTestResults:', word?.lastTestResults);
    }, [word]);

    const handlePronounceWithCoachLookup = (targetWord: string) => {
        speak(targetWord);
    };

    useEffect(() => { setStoredJSON('ielts_pro_word_view_settings', viewSettings); }, [viewSettings]);
    const handleSettingChange = <K extends keyof typeof viewSettings>(key: K, value: (typeof viewSettings)[K]) => setViewSettings(prev => ({...prev, [key]: value}));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) setIsViewMenuOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        (window as any).handleLessonSpeak = (text: string, lang?: 'en' | 'vi') => {
            speak(text, false, lang);
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

            return undefined;
        };

        setBadgeReady(true);

        return () => {
            delete (window as any).renderMarkdownBadge;
        };
    }, []);

    const toggleGroupExpansion = (group: string) => { setExpandedGroups(prev => { const next = new Set(prev); if (next.has(group)) next.delete(group); else next.add(group); return next; }); };

    const learnStatusOptions = [
        { id: 'NEW', label: 'New', icon: <div className="w-3 h-3 rounded-full bg-blue-500"/> },
        { id: ReviewGrade.LEARNED, label: 'Learned', icon: <div className="w-3 h-3 rounded-full bg-cyan-500"/> },
        { id: ReviewGrade.FORGOT, label: 'Forgot', icon: <div className="w-3 h-3 rounded-full bg-rose-500"/> },
        { id: ReviewGrade.HARD, label: 'Hard', icon: <div className="w-3 h-3 rounded-full bg-orange-500"/> },
        { id: ReviewGrade.EASY, label: 'Easy', icon: <div className="w-3 h-3 rounded-full bg-green-500"/> },
    ];
    
    const currentLearnStatus = word.lastReview ? (word.lastGrade || 'NEW') : 'NEW';

    const handleLearnStatusSelect = (statusId: string) => {
        if (isViewOnly) return;
        if (statusId === 'NEW') {
            const finalWord = resetProgress(word);
            onUpdate(finalWord);
        } else {
            const finalWord = updateSRS(word, statusId as ReviewGrade);
            onUpdate(finalWord);
        }
    };

    const qualityStatusOptions = [
        { id: WordQuality.RAW, label: 'Raw', icon: <Ghost size={14} className="text-neutral-400" /> },
        { id: WordQuality.REFINED, label: 'Needs Review', icon: <Wand2 size={14} className="text-indigo-500" /> },
        { id: WordQuality.VERIFIED, label: 'Verified', icon: <ShieldCheck size={14} className="text-emerald-500" /> },
        { id: WordQuality.FAILED, label: 'Incorrect', icon: <ShieldX size={14} className="text-rose-500" /> },
    ];
    
    const renderFamilyCardGroup = (label: string, members: WordFamilyMember[] | undefined, color: string, typeKey: string) => {
        const visibleMembers = Array.isArray(members) ? members.filter(m => viewSettings.showHidden || !m.isIgnored) : [];
        if (visibleMembers.length === 0) return null;

        const typeAliasMap: Record<string, string> = { nouns: 'n', verbs: 'v', adjs: 'j', advs: 'd' };
        const shortTypeKey = typeAliasMap[typeKey] || typeKey;

        return (
            <div className="space-y-1">
                <span className={`text-[8px] font-black uppercase text-${color}-600 tracking-widest ml-1`}>{label}</span>
                <div className="flex flex-col gap-1">
                    {visibleMembers.map((member, idx) => {
                        const isExisting = existingVariants.has(member.word.toLowerCase());
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
                            <div key={idx} className={`flex items-center justify-between px-2 py-1.5 rounded-lg border group transition-colors ${containerClass}`}>
                                <div className="flex flex-col overflow-hidden">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] font-bold truncate ${isFailed ? 'text-red-700' : 'text-neutral-900'} ${isIgnored ? 'line-through decoration-neutral-400' : ''}`}>{member.word}</span>
                                        <button onClick={(e) => { e.stopPropagation(); speak(member.word); }} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button>
                                        {isFailed && <AlertCircle size={10} className="text-red-500 fill-red-100 shrink-0" />}
                                    </div>
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
    const hasAnyFamilyData = !!(word.wordFamily && (word.wordFamily.nouns?.length || word.wordFamily.verbs?.length || word.wordFamily.adjs?.length || word.wordFamily.advs?.length));
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
        if (!word.wordFamily) return [];
        const result: { word: string; type: string; ipa?: string }[] = [];
        const types: (keyof WordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
        const typeLabels: Record<string, string> = { nouns: 'Noun', verbs: 'Verb', adjs: 'Adjective', advs: 'Adverb' };
        
        types.forEach(t => {
            (word.wordFamily![t] || []).forEach(m => {
                if (viewSettings.showHidden || !m.isIgnored) {
                    result.push({ word: m.word, type: typeLabels[t], ipa: m.ipaUs });
                }
            });
        });
        return result;
    }, [word.wordFamily, viewSettings.showHidden]);

    const lessonUsageHtml = useMemo(() => word.lesson?.essay ? parseMarkdown(word.lesson.essay) : null, [word.lesson?.essay]);
    const lessonTestHtml = useMemo(() => word.lesson?.test ? parseMarkdown(word.lesson.test) : null, [word.lesson?.test]);
    const noteHtml = useMemo(
        () => word.note ? parseMarkdown(word.note) : null,
        [word.note, badgeReady]
    );
    const hasUsage = Boolean(lessonUsageHtml?.trim());
    const hasTest = Boolean(lessonTestHtml?.trim());

    useEffect(() => {
      console.log('Usage debug:', {
        lessonUsageHtml,
        hasUsage
      });
    }, [lessonUsageHtml]);
    return (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white w-full max-w-6xl rounded-2xl sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
                <header className="px-4 sm:px-8 pt-4 pb-0 border-b border-neutral-100 bg-neutral-50/30 flex flex-col gap-1 shrink-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        
                        {/* ROW 1 - LEFT: WORD + ACTION ICONS */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className={`text-2xl font-black tracking-tight leading-none ${isSpellingFailed ? 'text-red-600' : 'text-neutral-900'}`}>
                                    {word.word}
                                </h2>
                                {isSpellingFailed && <AlertCircle size={16} className="text-red-500 fill-red-100" />}

                                {!word.isPassive && (
                                    <>
                                        <button
                                            onClick={() => handlePronounceWithCoachLookup(word.word)}
                                            className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                        >
                                            <Volume2 size={18} />
                                        </button>
                                        {/* BEGIN: VI MEANING AUDIO BUTTON */}
                                        <div className="relative group">
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
                                        {/* END: VI MEANING AUDIO BUTTON */}
                                        <button
                                            onClick={onMimicRequest}
                                            className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                        >
                                            <Mic size={18} />
                                        </button>
                                    </>
                                )}

                                {word.img && word.img.length > 0 && (
                                    <div className="relative inline-block group">
                                        <button
                                            className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"
                                        >
                                            <Image size={18} />
                                        </button>
                                        <div className="absolute top-full left-0 -translate-x-10 mt-2 w-max max-w-[28rem] overflow-x-hidden overflow-y-hidden p-4 bg-white border border-neutral-200 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20">
                                            <div className="flex flex-wrap gap-3">
                                                {word.img.map((raw, idx) => {
                                                    let caption: string | null = null;
                                                    let imageUrl = raw;

                                                    // Support format: "text:url"
                                                    const firstColonIndex = raw.indexOf(':');
                                                    if (firstColonIndex > -1 && raw.startsWith('http') === false) {
                                                        caption = raw.slice(0, firstColonIndex).trim();
                                                        imageUrl = raw.slice(firstColonIndex + 1).trim();
                                                    }

                                                    return (
                                                        <div key={idx} className="basis-1/2 sm:flex-none sm:w-48 flex flex-col gap-1">
                                                            <img
                                                                src={imageUrl.startsWith('http')
                                                                    ? imageUrl
                                                                    : `${serverUrl}${imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}`}
                                                                alt={`word-img-${idx}`}
                                                                className="w-full h-36 object-cover rounded-lg border border-neutral-100"
                                                            />
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
                                <MasteryScoreCalculator word={word} />
                            </div>

                            
                        </div>

                        {/* ROW 1 - RIGHT: STATUS + ACTIONS */}
                        <div className="flex items-start justify-start md:justify-end gap-2 flex-wrap">
                            <StatusDropdown
                                options={learnStatusOptions}
                                selectedId={currentLearnStatus}
                                onSelect={handleLearnStatusSelect}
                                buttonClass="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-neutral-100 transition-colors shadow-sm border border-neutral-200"
                                disabled={isViewOnly}
                            />
                            <StatusDropdown
                                label="Quality"
                                options={qualityStatusOptions}
                                selectedId={word.quality}
                                onSelect={(id) => onUpdate({ ...word, quality: id as WordQuality })}
                                buttonClass="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-neutral-100 transition-colors shadow-sm border border-neutral-200"
                                disabled={isViewOnly}
                            />
                            {!word.isPassive && (
                                <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-neutral-500 shadow-sm">
                                    <Clock size={14} />
                                    <span className={`text-[11px] font-black uppercase ${reviewStatus.urgency === 'due' ? 'text-rose-500' : 'text-green-600'}`}>
                                        {reviewStatus.label}
                                    </span>
                                </div>
                            )}
                            {!isViewOnly && (
                                <>
                                    <button onClick={onChallengeRequest} className="p-2 bg-amber-100 text-amber-600 hover:text-amber-900 rounded-lg hover:bg-amber-200 transition-colors">
                                        <BrainCircuit size={16} />
                                    </button>
                                    <button onClick={onEditRequest} className="p-2 bg-neutral-100 text-neutral-600 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors">
                                        <Edit3 size={16} />
                                    </button>
                                </>
                            )}
                            <button onClick={onClose} className="p-2 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* ROW 2 - LEFT: REGISTER + PRON */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {word.register && <RegisterBadge register={word.register} />}

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
                        </div>

                        {/* ROW 2 - RIGHT: TABS (bottom-right of header) */}
                        <div className="flex items-center justify-start md:justify-end gap-1 py-1">
                            <button
                                onClick={() => setActiveTab('OVERVIEW')}
                                className={`w-28 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${
                                    activeTab === 'OVERVIEW'
                                        ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                }`}
                            >
                                <LayoutDashboard size={16} />
                                Overview
                            </button>

                            <button
                                onClick={() => setActiveTab('USAGE')}
                                className={`relative w-28 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${
                                    activeTab === 'USAGE'
                                        ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                }`}
                            >
                                <BookText size={16} />
                                {hasUsage && (
                                    <CheckCircle2 size={12} className="absolute top-2 right-1 text-emerald-500 fill-emerald-100" />
                                )}
                                Usage
                            </button>

                            <button
                                onClick={() => setActiveTab('TEST')}
                                className={`relative w-28 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${
                                    activeTab === 'TEST'
                                        ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]'
                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                }`}
                            >
                                <ClipboardList size={16} />
                                {hasTest && (
                                    <CheckCircle2 size={12} className="absolute top-2 right-1 text-emerald-500 fill-emerald-100" />
                                )}
                                Practice
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-auto no-scrollbar px-4 sm:px-6 pt-4 pb-8 bg-neutral-50/20">
                    {activeTab === 'OVERVIEW' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {!word || word.quality === 'RAW' ? (
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
                                {word.example && (
                                    <Section title="Examples" icon={Quote} className="md:col-span-4">
                                        <div className="flex flex-col gap-2">
                                            {word.example
                                                .split('\n')
                                                .filter(line => line.trim() !== '')
                                                .map((sentence, index) => (
                                                    <div key={index} className="flex items-start gap-2 px-3 py-2 bg-neutral-50 border border-neutral-100 rounded-xl group hover:border-neutral-200 transition-all">
                                                        <span className="text-sm font-medium text-neutral-700 leading-relaxed flex-1 select-text cursor-text">
                                                            {sentence}
                                                        </span>
                                                        <button
                                                            onClick={() => speak(sentence)}
                                                            className="p-1.5 text-neutral-400 hover:text-indigo-500 hover:bg-white rounded-lg transition-all shrink-0"
                                                        >
                                                            <Volume2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                        </div>
                                    </Section>
                                )}
                                {displayedPreps.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                            <AtSign size={10}/> Prepositions
                                        </label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white border border-neutral-100 p-3 rounded-xl shadow-sm">
                                            {displayedPreps.map((p, i) => {
                                                const specificKey = `PREPOSITION_QUIZ:${p.prep}`;
                                                const specificResult = word.lastTestResults?.[specificKey];
                                                const isFailed = viewSettings.highlightFailed && (specificResult === false || (specificResult === undefined && word.lastTestResults?.['PREPOSITION_QUIZ'] === false)) && !p.isIgnored;
                                                return (
                                                    <div key={i} className={`flex items-center justify-between gap-3 p-2 rounded-lg border transition-colors ${isFailed ? 'bg-red-50 border-red-200' : 'bg-neutral-50/30 border-neutral-100'} ${p.isIgnored ? 'opacity-50' : ''}`}>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {isFailed && <AlertCircle size={10} className="text-red-500 shrink-0" />}
                                                            <span className={`font-bold text-xs shrink-0 ${isFailed ? 'text-red-700' : 'text-neutral-900'} ${p.isIgnored ? 'line-through' : ''}`}>{p.prep}</span>
                                                            <span className={`font-medium text-[10px] truncate ${isFailed ? 'text-red-400' : 'text-neutral-500'}`}>{p.usage}</span>
                                                        </div>
                                                        {p.usage && (
                                                            <button onClick={() => speak(p.usage)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-1 shrink-0">
                                                                <Volume2 size={12}/>
                                                                </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {hasAnyFamilyData && (
                                    <div className="space-y-1 md:col-span-4">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                            <Network size={10}/> Word Family
                                        </label>
                                        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                {renderFamilyCardGroup("Nouns", word.wordFamily?.nouns, "blue", "nouns")}
                                                {renderFamilyCardGroup("Verbs", word.wordFamily?.verbs, "green", "verbs")}
                                                {renderFamilyCardGroup("Adjectives", word.wordFamily?.adjs, "orange", "adjs")}
                                                {renderFamilyCardGroup("Adverbs", word.wordFamily?.advs, "purple", "advs")}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {displayedCollocs.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                            <Combine size={10}/> Collocations
                                        </label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white p-3 rounded-xl">
                                            {displayedCollocs.map((c, i) => {
                                                const isExisting = existingVariants.has(c.text.toLowerCase());
                                                let isFailed = false;
                                                if (viewSettings.highlightFailed && !c.isIgnored) {
                                                    const types = ['COLLOCATION_QUIZ', 'COLLOCATION_CONTEXT_QUIZ', 'COLLOCATION_MULTICHOICE_QUIZ'];
                                                    if (hasSpecificFailure(types, c.text)) isFailed = true;
                                                    else if (!types.some(type => getResult(`${type}:${c.text}`) !== undefined) && hasGroupFailure(types)) isFailed = true;
                                                }
                                                let containerClass = "bg-indigo-50/50 border-indigo-100 text-indigo-900";
                                                if (isFailed) containerClass = "bg-red-50 border-red-200 text-red-700";
                                                else if (c.isIgnored) containerClass = "bg-neutral-50 border-neutral-100 text-neutral-400";
                                                return (
                                                    <div key={i} className={`flex items-start justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${containerClass}`}>
                                                                <div className="flex-1 overflow-hidden">
                                                            {isFailed && <AlertCircle size={12} className="text-red-500 shrink-0" />}
                                                            <span className={`truncate ${c.isIgnored ? 'line-through' : ''}`} title={c.text}>{c.text}</span>
                                                                    {c.d && !c.isIgnored && (
                                                                        <div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">{c.d}</div>
                                                                    )}
                                                                </div>
                                                        <button onClick={() => speak(c.text)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {displayedParas.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                            <Zap size={10} className="text-amber-500"/> Variations
                                        </label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                            {displayedParas.map((para, idx) => {
                                                const isExisting = existingVariants.has(para.word.toLowerCase());
                                                const types = ['PARAPHRASE_QUIZ', 'PARAPHRASE_CONTEXT_QUIZ'];
                                                const hasSpecific = types.some(type => getResult(`${type}:${para.word}`) !== undefined);
                                                const isFailed = viewSettings.highlightFailed && !para.isIgnored && (hasSpecificFailure(types, para.word) || (!hasSpecific && hasGroupFailure(types)));
                                                const isIgnored = para.isIgnored;
                                                return (
                                                    <div key={idx} className={`flex items-start justify-between gap-2 border px-3 py-2 rounded-xl shadow-sm ${isFailed ? 'bg-red-50 border-red-200' : isIgnored ? 'bg-neutral-50 border-neutral-100 opacity-60' : 'bg-white border-neutral-200'}`}>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="flex justify-between items-center mb-1">
                                                                {renderParaphraseBadge(para.tone)}
                                                                {isFailed && <AlertCircle size={12} className="text-red-500 fill-red-100"/>}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className={`text-xs font-bold ${isFailed ? 'text-red-800' : 'text-neutral-800'} ${isIgnored ? 'line-through' : ''}`}>{para.word}</div>
                                                                <button onClick={() => speak(para.word)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button>
                                                            </div>
                                                            <div className={`text-[10px] italic truncate ${isFailed ? 'text-red-400' : 'text-neutral-400'}`} title={para.context}>{para.context}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {displayedIdioms.length > 0 && (
                                    <div className="space-y-1 md:col-span-4">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                            <MessageSquare size={10}/> Related Idioms
                                        </label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white p-3 rounded-xl">
                                            {displayedIdioms.map((idiom, i) => {
                                                const isExisting = existingVariants.has(idiom.text.toLowerCase());
                                                let isFailed = false;
                                                if (viewSettings.highlightFailed && !idiom.isIgnored) {
                                                    const types = ['IDIOM_QUIZ', 'IDIOM_CONTEXT_QUIZ'];
                                                    if (hasSpecificFailure(types, idiom.text)) isFailed = true;
                                                    else if (!types.some(type => getResult(`${type}:${idiom.text}`) !== undefined) && hasGroupFailure(types)) isFailed = true;
                                                }
                                                let containerClass = "bg-amber-50/50 border-amber-100 text-amber-900";
                                                if (isFailed) containerClass = "bg-red-50 border-red-200 text-red-700";
                                                else if (idiom.isIgnored) containerClass = "bg-neutral-50 border-neutral-100 text-neutral-400";
                                                return (
                                                    <div key={i} className={`flex items-start justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${containerClass}`}>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="flex items-center gap-2">
                                                                {isFailed && <AlertCircle size={12} className="text-red-500 shrink-0" />}
                                                                <span className={`truncate ${idiom.isIgnored ? 'line-through' : ''}`} title={idiom.text}>{idiom.text}</span>
                                                                <button onClick={() => speak(idiom.text)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button>
                                                            </div>
                                                            {idiom.d && !idiom.isIgnored && (
                                                                <div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">{idiom.d}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'USAGE' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col h-full space-y-8">
                            {!word || Object.keys(word).length === 0 ? (
                                <div className="py-10 text-center text-sm font-semibold text-neutral-400">
                                    Please refine word.
                                </div>
                            ) : (
                            <>
                            {lessonUsageHtml ? (
                                <div className="prose prose-sm max-w-none prose-headings:font-black prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-x-auto" dangerouslySetInnerHTML={{ __html: lessonUsageHtml }} />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-neutral-200 rounded-[2.5rem] space-y-4">
                                    <div className="p-4 bg-indigo-50 rounded-full text-indigo-600"><BookText size={32} /></div>
                                    <div className="text-center">
                                        <p className="font-black text-neutral-900">No Usage Guide</p>
                                        <p className="text-xs text-neutral-400 font-medium">Generate a structural guide with tables and examples.</p>
                                    </div>
                                    {!isViewOnly && (
                                        <button onClick={() => onGenerateLesson?.('ESSAY')} className="px-6 py-3 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-neutral-800 transition-all active:scale-95 shadow-lg"><Sparkles size={16}/> Generate Usage Guide</button>
                                    )}
                                </div>
                            )}
                            
                            {lessonUsageHtml && !isViewOnly && (
                                <div className="flex justify-center border-t border-neutral-100 pt-6">
                                     <button onClick={() => onGenerateLesson?.('ESSAY')} className="flex items-center gap-2 px-4 py-2 bg-neutral-50 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 border border-neutral-200 hover:border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                        <RefreshCw size={12}/> <span>Refresh Usage Guide</span>
                                    </button>
                                </div>
                            )}
                            </>
                            )}
                        </div>
                    )}
                    {activeTab === 'TEST' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col h-full space-y-8">
                            {!word || Object.keys(word).length === 0 ? (
                                <div className="py-10 text-center text-sm font-semibold text-neutral-400">
                                    Please refine word.
                                </div>
                            ) : (
                            <>
                            {lessonTestHtml ? (
                                <div className="prose prose-sm max-w-none prose-headings:font-black prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600" dangerouslySetInnerHTML={{ __html: lessonTestHtml }} />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-neutral-200 rounded-[2.5rem] space-y-4">
                                    <div className="p-4 bg-emerald-50 rounded-full text-emerald-600"><ClipboardList size={32} /></div>
                                    <div className="text-center">
                                        <p className="font-black text-neutral-900">No Practice Test</p>
                                        <p className="text-xs text-neutral-400 font-medium">Create an interactive test based on this word&apos;s usage.</p>
                                    </div>
                                    {!isViewOnly && (
                                        <button onClick={() => onGenerateLesson?.('TEST')} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-neutral-800 transition-all active:scale-95 shadow-lg"><Sparkles size={16}/> Generate Test</button>
                                    )}
                                </div>
                            )}

                            {lessonTestHtml && !isViewOnly && (
                                <div className="flex justify-center border-t border-neutral-100 pt-6">
                                     <button onClick={() => onGenerateLesson?.('TEST')} className="flex items-center gap-2 px-4 py-2 bg-neutral-50 text-neutral-500 hover:text-emerald-600 hover:bg-emerald-50 border border-neutral-200 hover:border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                        <RefreshCw size={12}/> <span>Regenerate Test</span>
                                    </button>
                                </div>
                            )}
                            </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
};