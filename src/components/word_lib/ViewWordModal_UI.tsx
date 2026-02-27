import React, { useState, useRef, useEffect, useMemo } from 'react';
// Added missing RefreshCw import
import { X, Mic, Quote, Combine, MessageSquare, Plus, CheckCircle2, Edit3, AtSign, Eye, Clock, BookOpen, Volume2, Network, Zap, AlertCircle, ShieldCheck, ShieldX, Ghost, Wand2, ChevronDown, ChevronRight, BrainCircuit, Loader2, BookText, ClipboardList, Sparkles, RefreshCw } from 'lucide-react';
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
    if (!register || register === 'neutral' || register === 'raw') return null;
    const styles = { academic: 'bg-purple-100 text-purple-800 border-purple-200', casual: 'bg-sky-100 text-sky-800 border-sky-200' };
    const text = { academic: 'ACADEMIC', casual: 'CASUAL' };
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
}

export const ViewWordModalUI: React.FC<ViewWordModalUIProps> = ({ 
    word, onClose, onChallengeRequest, onMimicRequest, onEditRequest, onUpdate, linkedUnits, relatedWords, relatedByGroup, 
    onNavigateToWord, onAddVariantToLibrary, addingVariant, existingVariants, isViewOnly = false, appliedAccent, initialTab = 'OVERVIEW',
    onGenerateLesson
}) => {
    const [viewSettings, setViewSettings] = useState(() => getStoredJSON('ielts_pro_word_view_settings', { showHidden: false, highlightFailed: true, isLearnView: true }));
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USAGE' | 'TEST'>(initialTab as any);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const viewMenuRef = useRef<HTMLDivElement>(null);

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
        (window as any).handleLessonSpeak = (text: string) => speak(text);
        return () => { delete (window as any).handleLessonSpeak; };
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
        return (
          <div className="space-y-1"><span className={`text-[8px] font-black uppercase text-${color}-600 tracking-widest ml-1`}>{label}</span><div className="flex flex-col gap-1">{visibleMembers.map((member, idx) => { const isExisting = existingVariants.has(member.word.toLowerCase()); const specificKey = `WORD_FAMILY:${typeKey}:${member.word.toLowerCase().trim()}`; const hasSpecificResult = word.lastTestResults && specificKey in word.lastTestResults; const specificResult = hasSpecificResult ? word.lastTestResults![specificKey] : undefined; let isMemberFailed = false; if (hasSpecificResult) isMemberFailed = specificResult === false; else { const categoryKey = `WORD_FAMILY_${typeKey.toUpperCase()}`; const categoryResult = word.lastTestResults?.[categoryKey]; if (categoryResult === false) isMemberFailed = true; else if (categoryResult === undefined && word.lastTestResults?.['WORD_FAMILY'] === false) isMemberFailed = true; } const isFailed = viewSettings.highlightFailed && isMemberFailed && !member.isIgnored; const isIgnored = member.isIgnored; let containerClass = "bg-white border-neutral-100 hover:border-neutral-300"; if (isFailed) containerClass = "bg-red-50 border-red-200 hover:border-red-300"; else if (isIgnored) containerClass = "bg-neutral-50/50 border-neutral-100 opacity-60"; return ( <div key={idx} className={`flex items-center justify-between px-2 py-1.5 rounded-lg border group transition-colors ${containerClass}`}> <div className="flex flex-col overflow-hidden"> <div className="flex items-center gap-1.5"> <span className={`text-[10px] font-bold truncate ${isFailed ? 'text-red-700' : 'text-neutral-900'} ${isIgnored ? 'line-through decoration-neutral-400' : ''}`}>{member.word}</span> <button onClick={(e) => { e.stopPropagation(); speak(member.word); }} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button> {isFailed && <AlertCircle size={10} className="text-red-500 fill-red-100 shrink-0" />} </div> </div> <button type="button" disabled={addingVariant === member.word || isExisting} onClick={() => onAddVariantToLibrary({ word: member.word, ipa: '' }, 'family')} className={`p-1 rounded-md transition-all ${ isExisting ? 'text-green-500 cursor-default' : 'text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100' }`} >{addingVariant === member.word ? <Loader2 size={10} className="animate-spin" /> : isExisting ? <CheckCircle2 size={10} /> : <Plus size={10} />}</button> </div> ); })}</div></div>
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
    const isSpellingFailed = viewSettings.highlightFailed && word.lastTestResults?.['SPELLING'] === false;
    const isIpaFailed = viewSettings.highlightFailed && (word.lastTestResults?.['IPA_QUIZ'] === false || word.lastTestResults?.['PRONUNCIATION'] === false);

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

    return (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white w-full max-w-6xl rounded-2xl sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
                <header className="px-4 sm:px-8 py-4 border-b border-neutral-100 bg-neutral-50/30 flex flex-col gap-2 shrink-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start w-full gap-4">
                        <div className="flex-1 w-full">
                            <div className="flex items-center gap-2">
                                <h2 className={`text-2xl font-black tracking-tight leading-none ${isSpellingFailed ? 'text-red-600' : 'text-neutral-900'}`}>{word.word}</h2>
                                {isSpellingFailed && <AlertCircle size={16} className="text-red-500 fill-red-100" />}
                                {!word.isPassive && (
                                    <>
                                        <button onClick={(e) => { e.stopPropagation(); handlePronounceWithCoachLookup(word.word); }} className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors" title="Pronounce"><Volume2 size={18} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); onMimicRequest(); }} className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors" title="Mimic"><Mic size={18} /></button>
                                    </>
                                )}
                                <div className="relative group">
                                    <button className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors"><BookOpen size={18} /></button>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-xs px-3 py-2 bg-neutral-800 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">{word.meaningVi}<div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div></div>
                                </div>
                                <MasteryScoreCalculator word={word} />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto">
                            <StatusDropdown options={learnStatusOptions} selectedId={currentLearnStatus} onSelect={handleLearnStatusSelect} buttonClass="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-neutral-100 transition-colors shadow-sm border border-neutral-200" disabled={isViewOnly}/>
                            <div className="relative" ref={viewMenuRef}>
                                <button onClick={() => setIsViewMenuOpen(!isViewMenuOpen)} className={`p-2 rounded-lg transition-colors ${isViewMenuOpen ? 'bg-neutral-900 text-white shadow-sm' : 'bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-900'}`} title="View Options"><Eye size={16} /></button>
                                {isViewMenuOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                                        <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50">View Options</div>
                                        <button onClick={() => handleSettingChange('isLearnView', !viewSettings.isLearnView)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700 transition-colors"><span>Learn View</span>{viewSettings.isLearnView ? <CheckCircle2 size={14} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-neutral-200"></div>}</button>
                                        <button onClick={() => handleSettingChange('showHidden', !viewSettings.showHidden)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700 transition-colors"><span>Show Ignored Items</span>{viewSettings.showHidden ? <CheckCircle2 size={14} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-neutral-200"></div>}</button>
                                        <button onClick={() => handleSettingChange('highlightFailed', !viewSettings.highlightFailed)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700 transition-colors"><span>Highlight Failed</span>{viewSettings.highlightFailed ? <CheckCircle2 size={14} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-neutral-200"></div>}</button>
                                    </div>
                                )}
                            </div>
                            {!isViewOnly && (
                                <>
                                    <button onClick={onChallengeRequest} className="p-2 bg-amber-100 text-amber-600 hover:text-amber-900 rounded-lg hover:bg-amber-200 transition-colors" title="Practice"><BrainCircuit size={16} /></button>
                                    <button onClick={onEditRequest} className="p-2 bg-neutral-100 text-neutral-600 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors"><Edit3 size={16} /></button>
                                </>
                            )}
                            <button onClick={onClose} className="p-2 bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-900 rounded-lg transition-colors"><X size={16} /></button>
                        </div>
                    </div>
                </header>

                <nav className="px-4 sm:px-8 border-b border-neutral-100 bg-white flex items-center gap-4 sm:gap-6 shrink-0 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('OVERVIEW')} className={`py-3 px-1 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'OVERVIEW' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}>Overview</button>
                    <button onClick={() => setActiveTab('USAGE')} className={`py-3 px-1 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'USAGE' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}><BookText size={14}/> Usage</button>
                    <button onClick={() => setActiveTab('TEST')} className={`py-3 px-1 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'TEST' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}><ClipboardList size={14}/> Practice Test</button>
                </nav>

                <div className="flex-1 overflow-auto no-scrollbar px-4 sm:px-6 pt-4 pb-8 bg-neutral-50/20">
                    {activeTab === 'OVERVIEW' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* DETAILS ROW */}
                            <div className="px-2 py-3 bg-white border border-neutral-100 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
                                <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex flex-col">
                                        <p className={`px-2 py-1 bg-neutral-50 rounded-lg text-sm font-mono font-medium border border-neutral-200 text-neutral-500`}>{word.ipaUs || '/?/'}</p>
                                    </div>
                                    <div className="flex flex-col">
                                        <RegisterBadge register={word.register} />
                                        {(!word.register || word.register === 'raw') && <span className="px-2 py-1 bg-neutral-100 text-neutral-400 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-neutral-200">Neutral</span>}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <StatusDropdown
                                        label="Quality"
                                        options={qualityStatusOptions}
                                        selectedId={word.quality}
                                        onSelect={(id) => onUpdate({ ...word, quality: id as WordQuality })}
                                        buttonClass="flex items-center gap-2 p-1.5 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 rounded-xl transition-all"
                                        disabled={isViewOnly}
                                    />
                                    {!word.isPassive && (
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-500" title={`Next Review: ${reviewStatus.label}`}>
                                                <Clock size={12} />
                                                <span className={`text-[11px] font-black uppercase ${reviewStatus.urgency === 'due' ? 'text-rose-500' : 'text-green-600'}`}>
                                                    {reviewStatus.label}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {word.note && <div className="md:col-span-4"><p className="text-sm text-neutral-700 bg-yellow-50/50 p-4 rounded-xl border border-yellow-100 italic leading-relaxed whitespace-pre-wrap">{word.note}</p></div>}
                                <Section title="Examples" icon={Quote} className="md:col-span-4">{word.example ? <div className="flex flex-col gap-2">{word.example.split('\n').filter(line => line.trim() !== '').map((sentence, index) => (<div key={index} className="flex items-start gap-2 px-3 py-2 bg-neutral-50 border border-neutral-100 rounded-xl group hover:border-neutral-200 transition-all"><span className="text-sm font-medium text-neutral-700 leading-relaxed flex-1 select-text cursor-text">{sentence}</span><button onClick={() => speak(sentence)} className="p-1.5 text-neutral-400 hover:text-indigo-500 hover:bg-white rounded-lg transition-all shrink-0"><Volume2 size={14} /></button></div>))}</div> : <div className="text-[10px] text-neutral-300 italic px-1">No examples added.</div>}</Section>
                                <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><AtSign size={10}/> Prepositions</label>{displayedPreps.length > 0 ? (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white border border-neutral-100 p-3 rounded-xl shadow-sm">{displayedPreps.map((p, i) => { const specificKey = `PREPOSITION_QUIZ:${p.prep}`; const specificResult = word.lastTestResults?.[specificKey]; const isFailed = viewSettings.highlightFailed && (specificResult === false || (specificResult === undefined && word.lastTestResults?.['PREPOSITION_QUIZ'] === false)) && !p.isIgnored; return (<div key={i} className={`flex items-center justify-between gap-3 p-2 rounded-lg border transition-colors ${isFailed ? 'bg-red-50 border-red-200' : 'bg-neutral-50/30 border-neutral-100'} ${p.isIgnored ? 'opacity-50' : ''}`}><div className="flex items-center gap-2 min-w-0">{isFailed && <AlertCircle size={10} className="text-red-500 shrink-0" />}<span className={`font-bold text-xs shrink-0 ${isFailed ? 'text-red-700' : 'text-neutral-900'} ${p.isIgnored ? 'line-through' : ''}`}>{p.prep}</span><span className={`font-medium text-[10px] truncate ${isFailed ? 'text-red-400' : 'text-neutral-500'}`}>{p.usage}</span></div>{p.usage && (<button onClick={() => speak(p.usage)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-1 shrink-0"><Volume2 size={12}/></button>)}</div>); })}</div>) : (<div className="text-[10px] text-neutral-300 italic px-1">No prepositions.</div>)}</div>
                                <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Network size={10}/> Word Family</label><div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">{!hasAnyFamilyData ? (<span className="text-[10px] text-neutral-300 italic">No family data available.</span>) : (<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{renderFamilyCardGroup("Nouns", word.wordFamily?.nouns, "blue", "nouns")}{renderFamilyCardGroup("Verbs", word.wordFamily?.verbs, "green", "verbs")}{renderFamilyCardGroup("Adjectives", word.wordFamily?.adjs, "orange", "adjs")}{renderFamilyCardGroup("Adverbs", word.wordFamily?.advs, "purple", "advs")}</div>)}</div></div>
                                <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Combine size={10}/> Collocations</label>{displayedCollocs.length > 0 ? (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white border border-neutral-200 p-3 rounded-xl">{displayedCollocs.map((c, i) => { const isExisting = existingVariants.has(c.text.toLowerCase()); const specificKey = `COLLOCATION_QUIZ:${c.text}`; const specificResult = word.lastTestResults?.[specificKey]; let isFailed = false; if (viewSettings.highlightFailed && !c.isIgnored) { if (specificResult === false) isFailed = true; else if (specificResult === undefined && word.lastTestResults?.['COLLOCATION_QUIZ'] === false) isFailed = true; } let containerClass = "bg-indigo-50/50 border-indigo-100 text-indigo-900"; if (isFailed) containerClass = "bg-red-50 border-red-200 text-red-700"; else if (c.isIgnored) containerClass = "bg-neutral-50 border-neutral-100 text-neutral-400"; return (<div key={i} className={`flex items-start justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${containerClass}`}><div className="flex-1 overflow-hidden">{isFailed && <AlertCircle size={12} className="text-red-500 shrink-0" />}<span className={`truncate ${c.isIgnored ? 'line-through' : ''}`} title={c.text}>{c.text}</span>{c.d && !c.isIgnored && (<div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">{c.d}</div>)}</div><button onClick={() => speak(c.text)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button><button type="button" disabled={addingVariant === c.text || isExisting || c.isIgnored} onClick={() => onAddVariantToLibrary({ word: c.text, ipa: '' }, 'collocation')} className={`p-1 rounded-md transition-all shrink-0 ${ isExisting ? 'text-green-500 cursor-default' : c.isIgnored ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-900 hover:bg-white/50' }`} title={isExisting ? 'Already in library' : 'Add to library'}>{addingVariant === c.text ? <Loader2 size={12} className="animate-spin" /> : isExisting ? <CheckCircle2 size={12} /> : <Plus size={12} />}</button></div>); })}</div>) : (<div className="text-[10px] text-neutral-300 italic px-1">No collocations.</div>)}</div>
                                <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Zap size={10} className="text-amber-500"/> Variations</label>{displayedParas.length > 0 ? (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{displayedParas.map((para, idx) => { const isExisting = existingVariants.has(para.word.toLowerCase()); const specificKey = `PARAPHRASE_QUIZ:${para.word}`; const specificResult = word.lastTestResults?.[specificKey]; const isFailed = viewSettings.highlightFailed && (specificResult === false || (specificResult === undefined && word.lastTestResults?.['PARAPHRASE_QUIZ'] === false)) && !para.isIgnored; const isIgnored = para.isIgnored; return (<div key={idx} className={`flex items-start justify-between gap-2 border px-3 py-2 rounded-xl shadow-sm ${isFailed ? 'bg-red-50 border-red-200' : isIgnored ? 'bg-neutral-50 border-neutral-100 opacity-60' : 'bg-white border-neutral-200'}`}><div className="flex-1 overflow-hidden"><div className="flex justify-between items-center mb-1">{renderParaphraseBadge(para.tone)}{isFailed && <AlertCircle size={12} className="text-red-500 fill-red-100"/>}</div><div className="flex items-center gap-1"><div className={`text-xs font-bold ${isFailed ? 'text-red-800' : 'text-neutral-800'} ${isIgnored ? 'line-through' : ''}`}>{para.word}</div><button onClick={() => speak(para.word)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button></div><div className={`text-[10px] italic truncate ${isFailed ? 'text-red-400' : 'text-neutral-400'}`} title={para.context}>{para.context}</div></div><button type="button" disabled={addingVariant === para.word || isExisting} onClick={() => onAddVariantToLibrary({ word: para.word, ipa: '' }, 'paraphrase')} className={`p-1 rounded-md transition-all mt-1 shrink-0 ${ isExisting ? 'text-green-500 cursor-default' : 'text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100' }`} >{addingVariant === para.word ? <Loader2 size={10} className="animate-spin" /> : isExisting ? <CheckCircle2 size={10} /> : <Plus size={10} />}</button></div>); })}</div>) : (<div className="text-[10px] text-neutral-300 italic">No variations available.</div>)}</div>
                                <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><MessageSquare size={10}/> Related Idioms</label>{displayedIdioms.length > 0 ? (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 bg-white border border-neutral-200 p-3 rounded-xl">{displayedIdioms.map((idiom, i) => { const isExisting = existingVariants.has(idiom.text.toLowerCase()); const specificKey = `IDIOM_QUIZ:${idiom.text}`; const specificResult = word.lastTestResults?.[specificKey]; let isFailed = false; if (viewSettings.highlightFailed && !idiom.isIgnored) { if (specificResult === false) isFailed = true; else if (specificResult === undefined && word.lastTestResults?.['IDIOM_QUIZ'] === false) isFailed = true; } let containerClass = "bg-amber-50/50 border-amber-100 text-amber-900"; if (isFailed) containerClass = "bg-red-50 border-red-200 text-red-700"; else if (idiom.isIgnored) containerClass = "bg-neutral-50 border-neutral-100 text-neutral-400"; return (<div key={i} className={`flex items-start justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${containerClass}`}><div className="flex-1 overflow-hidden"><div className="flex items-center gap-2">{isFailed && <AlertCircle size={12} className="text-red-500 shrink-0" />}<span className={`truncate ${idiom.isIgnored ? 'line-through' : ''}`} title={idiom.text}>{idiom.text}</span><button onClick={() => speak(idiom.text)} className="text-neutral-300 hover:text-indigo-500 transition-colors p-0.5"><Volume2 size={10}/></button></div>{idiom.d && !idiom.isIgnored && (<div className="text-[10px] italic text-neutral-400 mt-0.5 normal-case font-medium">{idiom.d}</div>)}</div><button type="button" disabled={addingVariant === idiom.text || isExisting || idiom.isIgnored} onClick={() => onAddVariantToLibrary({ word: idiom.text, ipa: '' }, 'idiom')} className={`p-1 rounded-md transition-all shrink-0 ${ isExisting ? 'text-green-500 cursor-default' : idiom.isIgnored ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-900 hover:bg-white/50' }`} title={isExisting ? 'Already in library' : 'Add to library'}>{addingVariant === idiom.text ? <Loader2 size={12} className="animate-spin" /> : isExisting ? <CheckCircle2 size={12} /> : <Plus size={12} />}</button></div>); })}</div>) : (<div className="text-[10px] text-neutral-300 italic px-1">No related idioms found.</div>)}</div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'USAGE' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col h-full space-y-8">
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
                        </div>
                    )}
                    {activeTab === 'TEST' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col h-full space-y-8">
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
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
};
