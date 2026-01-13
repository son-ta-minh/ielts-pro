import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, Quote, Layers, Combine, MessageSquare, RotateCw, Plus, CheckCircle2, Tag as TagIcon, StickyNote, Edit3, Archive, AtSign, Eye, Clock, BookOpen, Volume2, Network, Zap, AlertCircle, ShieldCheck, ShieldX, Ghost, Wand2, Info, ChevronDown, ChevronRight, Link as LinkIcon, Users2, BrainCircuit, Loader2 } from 'lucide-react';
import { VocabularyItem, WordFamilyMember, ReviewGrade, Unit, ParaphraseOption, PrepositionPattern, CollocationDetail, WordQuality, ParaphraseTone } from '../../app/types';
import { getRemainingTime, updateSRS, resetProgress } from '../../utils/srs';
import { speak } from '../../utils/audio';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { logSrsUpdate } from '../practice/ReviewSession';

// FIX: Allow 'raw' register type and handle it by not rendering a badge.
const RegisterBadge: React.FC<{ register?: 'academic' | 'casual' | 'neutral' | 'raw' }> = ({ register }) => {
    if (!register || register === 'neutral' || register === 'raw') return null;

    const styles = {
        academic: 'bg-purple-100 text-purple-800 border-purple-200',
        casual: 'bg-sky-100 text-sky-800 border-sky-200',
    };
    const text = {
        academic: 'ACADEMIC',
        casual: 'CASUAL',
    };

    return (
        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${styles[register]}`}>
            {text[register]}
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
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button onClick={() => setIsOpen(!isOpen)} className={buttonClass} disabled={disabled}>
                {label && <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</span>}
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


const renderParaphraseBadge = (tone: string) => {
    const toneMap: Record<string, string> = {
        academic: "bg-purple-100 text-purple-700 border-purple-200",
        intensified: "bg-rose-100 text-rose-700 border-rose-200",
        softened: "bg-sky-100 text-sky-700 border-sky-200",
        casual: "bg-blue-100 text-blue-700 border-blue-200",
        synonym: "bg-teal-100 text-teal-700 border-teal-200",
        default: "bg-neutral-100 text-neutral-600 border-neutral-200"
    };
    const classes = toneMap[tone] || toneMap.default;
    
    return <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${classes}`}>{tone}</span>;
};

const VisibilityToggle = ({ label, checked, onChange }: { label: React.ReactNode, checked: boolean, onChange: () => void }) => (
    <button onClick={onChange} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700 transition-colors">
        <span className="flex items-center gap-2">{label}</span>
        {checked ? <CheckCircle2 size={14} className="text-green-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-neutral-200"></div>}
    </button>
);

const CollapsibleSection: React.FC<{ title: string; count: number; children: React.ReactNode; icon: React.ReactNode }> = ({ title, count, children, icon }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (count === 0) {
        return (
            <div className="flex items-center justify-between text-left p-3 bg-neutral-50/30 border border-neutral-100 rounded-xl">
                 <div className="flex items-center gap-2">
                    {icon}
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{title}</p>
                </div>
                <span className="text-[9px] font-bold text-neutral-400 italic">None</span>
            </div>
        );
    }

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
            {isOpen && (
                <div className="p-3 pt-2 mt-2 border-t border-neutral-100 animate-in fade-in zoom-in-95">
                    {children}
                </div>
            )}
        </div>
    );
};

export interface ViewWordModalUIProps {
    word: VocabularyItem;
    onClose: () => void;
    onChallengeRequest: () => void;
    onEditRequest: () => void;
    onUpdate: (word: VocabularyItem) => void;
    linkedUnits: Unit[];
    relatedWords: Record<string, VocabularyItem[]>;
    relatedByGroup: Record<string, VocabularyItem[]>;
    onNavigateToWord: (word: VocabularyItem) => void;
    onAddVariantToLibrary: (variant: { word: string, ipa: string }, sourceType?: 'family' | 'paraphrase' | 'idiom') => void;
    addingVariant: string | null;
    existingVariants: Set<string>;
    isViewOnly?: boolean;
    appliedAccent?: 'US' | 'UK';
}

export const ViewWordModalUI: React.FC<ViewWordModalUIProps> = ({ word, onClose, onChallengeRequest, onEditRequest, onUpdate, linkedUnits, relatedWords, relatedByGroup, onNavigateToWord, onAddVariantToLibrary, addingVariant, existingVariants, isViewOnly = false, appliedAccent }) => {
    const [viewSettings, setViewSettings] = useState(() => getStoredJSON('ielts_pro_word_view_settings', { showHidden: false, highlightFailed: true, isLearnView: true }));
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const viewMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setStoredJSON('ielts_pro_word_view_settings', viewSettings); }, [viewSettings]);
    const handleSettingChange = <K extends keyof typeof viewSettings>(key: K, value: (typeof viewSettings)[K]) => setViewSettings(prev => ({...prev, [key]: value}));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) setIsViewMenuOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const toggleTagExpansion = (tag: string) => {
        setExpandedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    };
    
    const toggleGroupExpansion = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

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
            logSrsUpdate('RESET' as any, word, finalWord);
            onUpdate(finalWord);
        } else {
            const finalWord = updateSRS(word, statusId as ReviewGrade);
            logSrsUpdate(statusId as ReviewGrade, word, finalWord);
            onUpdate(finalWord);
        }
    };

    const qualityStatusOptions = [
        { id: WordQuality.RAW, label: 'Raw', icon: <Ghost size={14} className="text-neutral-400" /> },
        { id: WordQuality.REFINED, label: 'Needs Review', icon: <Wand2 size={14} className="text-indigo-500" /> },
        { id: WordQuality.VERIFIED, label: 'Verified', icon: <ShieldCheck size={14} className="text-emerald-500" /> },
        { id: WordQuality.FAILED, label: 'Incorrect', icon: <ShieldX size={14} className="text-rose-500" /> },
    ];
    const handleQualitySelect = (q: WordQuality) => {
        onUpdate({ ...word, quality: q });
    };

    const renderFamilyCardGroup = (label: string, members: WordFamilyMember[] | undefined, color: string, typeKey: string) => {
        const visibleMembers = Array.isArray(members) ? members.filter(m => viewSettings.showHidden || !m.isIgnored) : [];
        if (visibleMembers.length === 0) return null;
        
        return (
          <div className="space-y-1">
            <span className={`text-[8px] font-black uppercase text-${color}-600 tracking-widest ml-1`}>{label}</span>
            <div className="flex flex-col gap-1">
              {visibleMembers.map((member, idx) => {
                const isExisting = existingVariants.has(member.word.toLowerCase());
                const specificKey = `WORD_FAMILY:${typeKey}:${member.word.toLowerCase().trim()}`;
                const hasSpecificResult = word.lastTestResults && specificKey in word.lastTestResults;
                const specificResult = hasSpecificResult ? word.lastTestResults![specificKey] : undefined;
                let isMemberFailed = false;
                if (hasSpecificResult) isMemberFailed = specificResult === false;
                else {
                    const categoryKey = `WORD_FAMILY_${typeKey.toUpperCase()}`;
                    const categoryResult = word.lastTestResults?.[categoryKey];
                    if (categoryResult === false) isMemberFailed = true;
                    else if (categoryResult === undefined && word.lastTestResults?.['WORD_FAMILY'] === false) isMemberFailed = true;
                }
                const isFailed = viewSettings.highlightFailed && isMemberFailed && !member.isIgnored;
                const isIgnored = member.isIgnored;
                let containerClass = "bg-white border-neutral-100 hover:border-neutral-300";
                if (isFailed) containerClass = "bg-red-50 border-red-200 hover:border-red-300";
                else if (isIgnored) containerClass = "bg-neutral-50/50 border-neutral-100 opacity-60";
                return (
                  <div key={idx} className={`flex items-center justify-between px-2 py-1.5 rounded-lg border group transition-colors ${containerClass}`}>
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center gap-1.5"><span className={`text-[10px] font-bold truncate ${isFailed ? 'text-red-700' : 'text-neutral-900'} ${isIgnored ? 'line-through decoration-neutral-400' : ''}`}>{member.word}</span>{isFailed && <AlertCircle size={10} className="text-red-500 fill-red-100 shrink-0" />}</div>
                      <span className={`text-[8px] font-mono ${isFailed ? 'text-red-400' : 'text-neutral-400'}`}>{member.ipa}</span>
                    </div>
                    <button type="button" disabled={addingVariant === member.word || isExisting} onClick={() => onAddVariantToLibrary(member, 'family')} className={`p-1 rounded-md transition-all ${ isExisting ? 'text-green-500 cursor-default' : 'text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100' }`} >{addingVariant === member.word ? <Loader2 size={10} className="animate-spin" /> : isExisting ? <CheckCircle2 size={10} /> : <Plus size={10} />}</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
    };

    const reviewStatus = getRemainingTime(word.nextReview);
    const hasAnyFamilyData = !!(word.wordFamily && (word.wordFamily.nouns?.length || word.wordFamily.verbs?.length || word.wordFamily.adjs?.length || word.wordFamily.advs?.length));
    const displayedPreps = (word.prepositions || []).filter(p => viewSettings.showHidden || !p.isIgnored);
    const displayedCollocs = (word.collocationsArray || []).filter(c => viewSettings.showHidden || !c.isIgnored);
    const displayedIdioms = (word.idiomsList || []).filter(c => viewSettings.showHidden || !c.isIgnored);
    const displayedParas = (word.paraphrases || []).filter(p => viewSettings.showHidden || !p.isIgnored);
    const isSpellingFailed = viewSettings.highlightFailed && word.lastTestResults?.['SPELLING'] === false;
    const isIpaFailed = viewSettings.highlightFailed && word.lastTestResults?.['IPA_QUIZ'] === false;
    
    const flagCount = [word.isIdiom, word.isCollocation, word.isPhrasalVerb, word.isIrregular].filter(Boolean).length;
    const tagCount = (word.tags?.length || 0) + flagCount;
    const groupCount = (word.groups?.length || 0);

    const displayAccent = appliedAccent || 'US';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <header className="px-8 py-4 border-b border-neutral-100 bg-neutral-50/30 flex flex-col gap-1 shrink-0">
                    {/* --- ROW 1: Word & Actions --- */}
                    <div className="flex justify-between items-start w-full gap-4">
                        {/* Top Left: Word, Sound, Meaning Icon */}
                        <div className="flex-1">
                            <div className="flex items-center gap-1">
                                <h2 className={`text-2xl font-black tracking-tight leading-none ${isSpellingFailed ? 'text-red-600' : 'text-neutral-900'}`}>{word.word}</h2>
                                {isSpellingFailed && <AlertCircle size={16} className="text-red-500 fill-red-100" />}
                                {!word.isPassive && (
                                    <button onClick={(e) => { e.stopPropagation(); speak(word.word); }} className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors" title="Pronounce"><Volume2 size={18} /></button>
                                )}
                                <div className="relative group">
                                    <button className="p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 rounded-full transition-colors" title="Show meaning">
                                        <BookOpen size={18} />
                                    </button>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-xs px-3 py-2 bg-neutral-800 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                        {word.meaningVi}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 text-neutral-400 pl-2">
                                    {word.isIdiom && (
                                        <div className="relative group flex items-center">
                                            <Quote size={18} className="cursor-help"/>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-3 py-1.5 bg-neutral-800 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 uppercase tracking-wider">
                                                Idiom
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
                                            </div>
                                        </div>
                                    )}
                                    {word.isPhrasalVerb && (
                                        <div className="relative group flex items-center">
                                            <Layers size={18} className="cursor-help"/>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-3 py-1.5 bg-neutral-800 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 uppercase tracking-wider">
                                                Phrasal Verb
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
                                            </div>
                                        </div>
                                    )}
                                    {word.isCollocation && (
                                        <div className="relative group flex items-center">
                                            <Combine size={18} className="cursor-help"/>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-3 py-1.5 bg-neutral-800 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 uppercase tracking-wider">
                                                Collocation
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
                                            </div>
                                        </div>
                                    )}
                                    {word.isStandardPhrase && (
                                        <div className="relative group flex items-center">
                                            <MessageSquare size={18} className="cursor-help"/>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max px-3 py-1.5 bg-neutral-800 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 uppercase tracking-wider">
                                                Phrase
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-800 rotate-45"></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Top Right: Action Buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <StatusDropdown 
                                options={learnStatusOptions}
                                selectedId={currentLearnStatus}
                                onSelect={handleLearnStatusSelect}
                                buttonClass="flex items-center gap-2 px-3 py-2 bg-white rounded-lg hover:bg-neutral-100 transition-colors shadow-sm border border-neutral-200"
                                disabled={isViewOnly}
                            />
                            <div className="relative" ref={viewMenuRef}>
                                <button onClick={() => setIsViewMenuOpen(!isViewMenuOpen)} className={`p-2 rounded-lg transition-colors ${isViewMenuOpen ? 'bg-neutral-900 text-white shadow-sm' : 'bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-900'}`} title="View Options">
                                    <Eye size={16} />
                                </button>
                                {isViewMenuOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
                                        <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50">View Options</div>
                                        <VisibilityToggle label="Learn View" checked={viewSettings.isLearnView} onChange={() => handleSettingChange('isLearnView', !viewSettings.isLearnView)} />
                                        <VisibilityToggle label="Show Ignored Items" checked={viewSettings.showHidden} onChange={() => handleSettingChange('showHidden', !viewSettings.showHidden)} />
                                        <VisibilityToggle label="Highlight Failed" checked={viewSettings.highlightFailed} onChange={() => handleSettingChange('highlightFailed', !viewSettings.highlightFailed)} />
                                    </div>
                                )}
                            </div>
                            {!isViewOnly && (
                                <>
                                    <button onClick={onChallengeRequest} className="p-2 bg-amber-100 text-amber-600 hover:text-amber-900 rounded-lg hover:bg-amber-200 transition-colors"><BrainCircuit size={16} /></button>
                                    <button onClick={onEditRequest} className="p-2 bg-neutral-100 text-neutral-600 hover:text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors"><Edit3 size={16} /></button>
                                </>
                            )}
                            <button onClick={onClose} className="p-2 bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-900 rounded-lg transition-colors"><X size={16} /></button>
                        </div>
                    </div>

                    {/* --- ROW 2: Details --- */}
                    <div className="flex justify-between items-end w-full gap-4">
                        {/* Bottom Left: IPA, Register */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <p className={`text-sm font-mono font-medium ${isIpaFailed ? 'text-red-500' : 'text-neutral-500'}`}>{word.ipa || '/?/'}</p>
                            
                            {word.pronSim && word.pronSim !== 'same' && (
                                <>
                                    {displayAccent === 'US' && word.ipaUk && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono text-neutral-400">(UK: {word.ipaUk})</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${word.pronSim === 'near' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                {word.pronSim === 'near' ? 'Near Sound' : 'Different Sound'}
                                            </span>
                                        </div>
                                    )}
                                    {displayAccent === 'UK' && word.ipaUs && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono text-neutral-400">(US: {word.ipaUs})</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${word.pronSim === 'near' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                {word.pronSim === 'near' ? 'Near Sound' : 'Different Sound'}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            <RegisterBadge register={word.register} />
                        </div>

                        {/* Bottom Right: Quality, Due */}
                        <div className="flex items-center gap-4">
                            <StatusDropdown
                                options={qualityStatusOptions}
                                selectedId={word.quality}
                                onSelect={(id) => handleQualitySelect(id as WordQuality)}
                                buttonClass="flex items-center gap-2 p-1 hover:bg-neutral-100 rounded-lg transition-colors"
                                disabled={isViewOnly}
                            />
                            {!word.isPassive && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-500" title={`Next Review: ${reviewStatus.label}`}>
                                    <Clock size={14} />
                                    <span className={`text-[11px] font-black uppercase ${reviewStatus.urgency === 'due' ? 'text-rose-500' : 'text-green-600'}`}>
                                        {reviewStatus.label}
                                    </span>
                                </div>
                            )}
                            {word.isPassive && <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-neutral-100 text-neutral-500 tracking-wider">Archived</span>}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-4 pb-8">
                    {word.quality !== WordQuality.VERIFIED && (
                        <div className="mb-6 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-indigo-700 text-xs font-medium flex items-start gap-3">
                            <Info size={16} className="shrink-0 mt-0.5" />
                            <p>This word is currently hidden from study sessions and games. Set status to "Verified" to begin practice.</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {word.note && (
                            <div className="md:col-span-4">
                                <p className="text-sm text-neutral-700 bg-yellow-50/50 p-4 rounded-xl border border-yellow-100 italic leading-relaxed whitespace-pre-wrap">{word.note}</p>
                            </div>
                        )}

                        <div className="space-y-1 md:col-span-1"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><AtSign size={10}/> Prepositions</label>{displayedPreps.length > 0 ? (<div className="bg-white border border-neutral-100 p-3 rounded-xl grid grid-cols-1 gap-y-1">{displayedPreps.map((p: PrepositionPattern, i: number) => { const specificKey = `PREPOSITION_QUIZ:${p.prep}`; const specificResult = word.lastTestResults?.[specificKey]; const isFailed = viewSettings.highlightFailed && (specificResult === false || (specificResult === undefined && word.lastTestResults?.['PREPOSITION_QUIZ'] === false)) && !p.isIgnored; return (<div key={i} className={`text-xs flex items-center gap-2 ${p.isIgnored ? 'opacity-50' : ''}`}>{isFailed && <AlertCircle size={10} className="text-red-500" />}<span className={`font-bold ${isFailed ? 'text-red-700' : 'text-neutral-900'} ${p.isIgnored ? 'line-through' : ''}`}>{p.prep}</span><span className={`font-medium ${isFailed ? 'text-red-400' : 'text-neutral-500'}`}>{p.usage}</span></div>); })}</div>) : (<div className="text-[10px] text-neutral-300 italic px-1">No prepositions.</div>)}</div>
                        
                        <div className="space-y-1 md:col-span-3"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Network size={10}/> Word Family</label><div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">{!hasAnyFamilyData ? (<span className="text-[10px] text-neutral-300 italic">No family data available.</span>) : (<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{renderFamilyCardGroup("Nouns", word.wordFamily?.nouns, "blue", "nouns")}{renderFamilyCardGroup("Verbs", word.wordFamily?.verbs, "green", "verbs")}{renderFamilyCardGroup("Adjectives", word.wordFamily?.adjs, "orange", "adjs")}{renderFamilyCardGroup("Adverbs", word.wordFamily?.advs, "purple", "advs")}</div>)}</div></div>

                        <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Combine size={10}/> Collocations</label>{displayedCollocs.length > 0 ? (<div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white border border-neutral-100 p-3 rounded-xl">{displayedCollocs.map((c: CollocationDetail, i: number) => { const specificKey = `COLLOCATION_QUIZ:${c.text}`; const specificResult = word.lastTestResults?.[specificKey]; let isFailed = false; if (viewSettings.highlightFailed && !c.isIgnored) { if (specificResult === false) { isFailed = true; } else if (specificResult === undefined && word.lastTestResults?.['COLLOCATION_QUIZ'] === false) { isFailed = true; } } let containerClass = "bg-indigo-50/50 border-indigo-100 text-indigo-900"; if (isFailed) { containerClass = "bg-red-50 border-red-200 text-red-700"; } else if (c.isIgnored) { containerClass = "bg-neutral-50 border-neutral-100 text-neutral-400 line-through"; } return (<div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold ${containerClass}`}>{isFailed && <AlertCircle size={12} className="text-red-500 shrink-0" />}<span className="truncate">{c.text}</span></div>);})}</div>) : (<div className="text-[10px] text-neutral-300 italic px-1">No collocations.</div>)}</div>
                        
                        <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Zap size={10} className="text-amber-500"/> Word Power & Variations</label>{displayedParas.length > 0 ? (<div className="grid grid-cols-2 md:grid-cols-4 gap-3">{displayedParas.map((para: ParaphraseOption, idx: number) => { const isExisting = existingVariants.has(para.word.toLowerCase()); const specificKey = `PARAPHRASE_QUIZ:${para.word}`; const specificResult = word.lastTestResults?.[specificKey]; const isFailed = viewSettings.highlightFailed && (specificResult === false || (specificResult === undefined && word.lastTestResults?.['PARAPHRASE_QUIZ'] === false)) && !para.isIgnored; const isIgnored = para.isIgnored; return (<div key={idx} className={`flex items-start justify-between gap-2 border px-3 py-2 rounded-xl shadow-sm ${isFailed ? 'bg-red-50 border-red-200' : isIgnored ? 'bg-neutral-50 border-neutral-100 opacity-60' : 'bg-white border-neutral-100'}`}><div className="flex-1 overflow-hidden"><div className="flex justify-between items-center mb-1">{renderParaphraseBadge(para.tone)}{isFailed && <AlertCircle size={12} className="text-red-500 fill-red-100"/>}</div><div className={`text-xs font-bold ${isFailed ? 'text-red-800' : 'text-neutral-800'} ${isIgnored ? 'line-through' : ''}`}>{para.word}</div><div className={`text-[10px] italic truncate ${isFailed ? 'text-red-400' : 'text-neutral-400'}`} title={para.context}>{para.context}</div></div><button type="button" disabled={addingVariant === para.word || isExisting} onClick={() => onAddVariantToLibrary({ word: para.word, ipa: '' }, 'paraphrase')} className={`p-1 rounded-md transition-all mt-1 shrink-0 ${ isExisting ? 'text-green-500 cursor-default' : 'text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100' }`} >{addingVariant === para.word ? <Loader2 size={10} className="animate-spin" /> : isExisting ? <CheckCircle2 size={10} /> : <Plus size={10} />}</button></div>); })}</div>) : (<div className="text-[10px] text-neutral-300 italic">No variations available.</div>)}</div>
                        
                        <div className="space-y-1 md:col-span-4">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><MessageSquare size={10}/> Related Idioms</label>
                            {displayedIdioms.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-white border border-neutral-100 p-3 rounded-xl">
                                    {displayedIdioms.map((idiom: CollocationDetail, i: number) => {
                                        const isExisting = existingVariants.has(idiom.text.toLowerCase());
                                        return (
                                            <div key={i} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${idiom.isIgnored ? 'bg-neutral-50 border-neutral-100 text-neutral-400 line-through' : 'bg-amber-50/50 border-amber-100 text-amber-900'}`}>
                                                <span className="truncate flex-1" title={idiom.text}>{idiom.text}</span>
                                                <button
                                                    type="button"
                                                    disabled={addingVariant === idiom.text || isExisting || idiom.isIgnored}
                                                    onClick={() => onAddVariantToLibrary({ word: idiom.text, ipa: '' }, 'idiom')}
                                                    className={`p-1 rounded-md transition-all shrink-0 ${ isExisting ? 'text-green-500 cursor-default' : idiom.isIgnored ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-400 hover:text-neutral-900 hover:bg-white/50' }`}
                                                    title={isExisting ? 'Already in library' : 'Add to library'}
                                                >
                                                    {addingVariant === idiom.text ? <Loader2 size={12} className="animate-spin" /> : isExisting ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (<div className="text-[10px] text-neutral-300 italic px-1">No related idioms found.</div>)}
                        </div>

                        {!viewSettings.isLearnView && (
                            <>
                                <div className="space-y-1 md:col-span-4"><label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1"><Quote size={10}/> Examples</label>{word.example ? (<div className="p-4 bg-white rounded-xl border border-neutral-100 space-y-3">{word.example.split('\n').filter(line => line.trim() !== '').map((sentence, index) => ( <div key={index} className="flex items-start gap-3"><div className="w-1.5 h-1.5 bg-neutral-300 rounded-full mt-2 shrink-0"></div><p className="text-sm font-medium text-neutral-700 leading-relaxed">{sentence}</p></div>))}</div>) : (<div className="text-[10px] text-neutral-300 italic px-1">No examples added.</div>)}</div>
                        
                                <div className="pt-8 space-y-4 md:col-span-4">
                                    <CollapsibleSection title="Tags & Flags" count={tagCount} icon={<TagIcon size={12} className="text-neutral-400"/>}>
                                        <div className="flex flex-wrap gap-1.5">{word.isIdiom && <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[9px] font-black border border-amber-100">Idiom</span>}{word.isCollocation && <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[9px] font-black border border-indigo-100">Colloc.</span>}{word.isPhrasalVerb && <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[9px] font-black border border-blue-100">Phrasal</span>}{word.isIrregular && <span className="px-2 py-1 rounded-md bg-orange-50 text-orange-700 text-[9px] font-black border border-orange-100">Irreg.</span>}{word.tags && word.tags.length > 0 && (word.tags.map(t => <span key={t} className="px-2 py-1 rounded-md bg-neutral-100 text-neutral-600 text-[9px] font-bold border border-neutral-200">#{t}</span>))}</div>
                                    </CollapsibleSection>

                                    <CollapsibleSection title="User Groups" count={groupCount} icon={<Users2 size={12} className="text-neutral-400"/>}>
                                        <div className="flex flex-wrap gap-1.5">{word.groups && word.groups.length > 0 && (word.groups.map(g => <span key={g} className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[9px] font-bold border border-blue-200">{g}</span>))}</div>
                                    </CollapsibleSection>

                                    <CollapsibleSection title="Linked Units" count={linkedUnits.length} icon={<LinkIcon size={12} className="text-neutral-400"/>}>
                                        <div className="flex flex-wrap gap-1.5">{linkedUnits.map(unit => (<span key={unit.id} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-[9px] font-bold text-neutral-600 shadow-sm max-w-full truncate">{unit.name}</span>))}</div>
                                    </CollapsibleSection>
                                    
                                    <div className="space-y-2 pt-2 border-t border-neutral-100">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">Related by Tag</label>
                                        {Object.keys(relatedWords).length > 0 ? (
                                            <div className="space-y-2">
                                                {Object.keys(relatedWords).map((tag) => {
                                                    const words = relatedWords[tag];
                                                    const isExpanded = expandedTags.has(tag);
                                                    return (
                                                        <div key={tag} className="bg-neutral-50 border border-neutral-100 rounded-xl p-2 transition-all">
                                                            <button onClick={() => toggleTagExpansion(tag)} className="w-full flex items-center justify-between text-left">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[9px] font-bold text-neutral-500 uppercase">#{tag}</p>
                                                                    <span className="text-[9px] font-bold text-neutral-400">({words.length})</span>
                                                                </div>
                                                                {isExpanded ? <ChevronDown size={14} className="text-neutral-400"/> : <ChevronRight size={14} className="text-neutral-400"/>}
                                                            </button>
                                                            {isExpanded && (
                                                                <div className="pt-2 mt-2 border-t border-neutral-200 animate-in fade-in zoom-in-95">
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {words.map(w => (<button key={w.id} onClick={() => onNavigateToWord(w)} className="px-2 py-1 bg-white border border-neutral-200 rounded-md text-xs font-bold text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300 transition-colors">{w.word}</button>))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : <span className="text-[10px] text-neutral-300 italic px-1">No related words found.</span>}
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1">Related by Group</label>
                                        {Object.keys(relatedByGroup).length > 0 ? (
                                            <div className="space-y-2">
                                                {Object.keys(relatedByGroup).map((group) => {
                                                    const words = relatedByGroup[group];
                                                    const isExpanded = expandedGroups.has(group);
                                                    return (
                                                        <div key={group} className="bg-neutral-50 border border-neutral-100 rounded-xl p-2 transition-all">
                                                            <button onClick={() => toggleGroupExpansion(group)} className="w-full flex items-center justify-between text-left">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[9px] font-bold text-blue-500">{group}</p>
                                                                    <span className="text-[9px] font-bold text-neutral-400">({words.length})</span>
                                                                </div>
                                                                {isExpanded ? <ChevronDown size={14} className="text-neutral-400"/> : <ChevronRight size={14} className="text-neutral-400"/>}
                                                            </button>
                                                            {isExpanded && (
                                                                <div className="pt-2 mt-2 border-t border-neutral-200 animate-in fade-in zoom-in-95">
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {words.map(w => (<button key={w.id} onClick={() => onNavigateToWord(w)} className="px-2 py-1 bg-white border border-neutral-200 rounded-md text-xs font-bold text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300 transition-colors">{w.word}</button>))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : <span className="text-[10px] text-neutral-300 italic px-1">No related words found.</span>}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
      );
};
