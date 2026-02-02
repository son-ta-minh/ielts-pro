
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, NativeSpeakItem, VocabularyItem, WordQuality, FocusColor, SpeakingTopic, NativeSpeakAnswer, AppView } from '../../app/types';
import * as db from '../../app/db';
import { ResourcePage } from '../page/ResourcePage';
import { Mic, Volume2, Eye, EyeOff, Tag, Coffee, GraduationCap, School, ChevronRight, Shuffle, Plus, Edit3, Trash2, Swords, AudioLines, Sparkles, Save, X, Braces, StickyNote, FolderTree, Lightbulb, Info, ChevronLeft, Loader2, Square, Combine, CheckSquare, Waves, Target } from 'lucide-react';
import { speak, startRecording, stopRecording } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { TagBrowser, TagTreeNode } from '../../components/common/TagBrowser';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
import { getRefineNativeSpeakPrompt, getMergeNativeSpeakPrompt } from '../../services/promptService';
import { generateFullSpeakingTest } from '../../services/geminiService';
import { MimicPractice } from '../../components/labs/MimicPractice';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import FullTestSetupModal from './FullTestSetupModal';
import SpeakingSessionView from './SpeakingSessionView';
import { ResourceActions } from '../page/ResourceActions';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';

interface Props {
  user: User;
  onNavigate?: (view: AppView) => void;
}

const VIEW_SETTINGS_KEY = 'vocab_pro_speaking_card_view';

const PatternRenderer: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/({.*?}|\[.*?\]|<.*?>)/g);
    
    // Case 1: The entire string is a standalone tip, e.g., "[This is a tip.]"
    if (parts.length === 3 && parts[0] === '' && parts[2] === '' && parts[1].startsWith('[') && parts[1].endsWith(']')) {
        const tipContent = parts[1].slice(1, -1);
        return (
            <div className="flex items-start gap-3 my-2 p-3 bg-sky-50 border-l-4 border-sky-400 rounded-r-lg shadow-sm">
                <Lightbulb size={18} className="shrink-0 mt-0.5 text-sky-500"/>
                <div className="text-xs text-sky-900 font-medium leading-relaxed">
                    {tipContent}
                </div>
            </div>
        );
    }

    // Case 2: Inline text with highlights and/or tips
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('{') && part.endsWith('}')) {
                    // This is the existing highlight style (or rephrasing explanation)
                    return (
                        <span key={i} className="mx-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold font-mono text-[0.9em] border border-amber-200 inline-block shadow-sm">
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                if (part.startsWith('[') && part.endsWith(']')) {
                    // This is the new inline tip style
                    const tipContent = part.slice(1, -1);
                    return (
                         <span key={i} className="mx-1 inline-flex items-center gap-1.5 text-[10px] text-sky-700 bg-sky-100 border border-sky-200 px-2 py-1 rounded-full font-medium">
                            <Lightbulb size={12} />
                            {tipContent}
                        </span>
                    );
                }
                if (part.startsWith('<') && part.endsWith('>')) {
                    // This is the new preposition note style
                    const noteContent = part.slice(1, -1);
                    return (
                         <span key={i} className="mx-1 inline-flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-full font-medium italic">
                            <Info size={12} />
                            {noteContent}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};

// --- Add/Edit Modal (with JSON Paste & Feedback) ---
interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { standard: string, tags: string[], note: string, answers: NativeSpeakAnswer[] }) => void;
  initialData?: NativeSpeakItem | null;
  onOpenAiRefine: (currentData: Partial<NativeSpeakItem>) => void;
}

const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData, onOpenAiRefine }) => {
  const [standard, setStandard] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [answers, setAnswers] = useState<NativeSpeakAnswer[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStandard(initialData?.standard || '');
      setNote(initialData?.note || '');
      setTagsInput(initialData?.tags?.join(', ') || '');
      setAnswers(initialData?.answers || []);
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!standard.trim()) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ standard: standard.trim(), tags, note: note.trim(), answers });
  };

  const handleAiClick = () => {
    onOpenAiRefine({
        standard,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        note,
        answers
    });
  };
  
  const addAnswer = () => {
    setAnswers(prev => [...prev, { tone: 'casual', anchor: '', sentence: '', note: '' }]);
  };

  const updateAnswer = (index: number, field: keyof NativeSpeakAnswer, value: string | NativeSpeakAnswer['tone']) => {
      setAnswers(prev => {
          const next = [...prev];
          next[index] = { ...next[index], [field]: value };
          return next;
      });
  };

  const removeAnswer = (index: number) => {
      setAnswers(prev => prev.filter((_, i) => i !== index));
  };

  const handleJsonPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const jsonString = e.target.value;
    if (!jsonString.trim()) {
        setAnswers([]);
        return;
    }
    try {
        const parsed = JSON.parse(jsonString);
        if (parsed.standard && Array.isArray(parsed.answers)) {
            setStandard(parsed.standard);
            setAnswers(parsed.answers);
        } else if (Array.isArray(parsed.answers)) {
            setAnswers(parsed.answers);
        }
    } catch (error) {
        console.warn("Invalid JSON pasted");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Expression' : 'New Expression'}</h3>
            <p className="text-sm text-neutral-500">Define context and generate expressions.</p>
          </div>
          <div className="flex items-center gap-2">
               <button type="button" onClick={handleAiClick} className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors" title="Generate/Refine with AI"><Sparkles size={18} /></button>
               <button type="button" onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={20}/></button>
          </div>
        </header>
        
        <main className="p-8 space-y-6 overflow-y-auto">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Context / Standard Meaning</label>
            <textarea value={standard} onChange={e => setStandard(e.target.value)} placeholder="e.g., Expressing skepticism or doubt" rows={3} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none" required autoFocus/>
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><StickyNote size={12}/> User Note (Optional)</label>
             <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Usage tips, nuance explanation..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm focus:ring-1 focus:ring-neutral-300 outline-none resize-none"/>
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><Tag size={12}/> Tags (Optional)</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Business, Casual, Speaking Part 3..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm focus:ring-1 focus:ring-neutral-300 outline-none"/>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-neutral-100">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1.5"><AudioLines size={12}/> Expressions ({answers.length})</label>
              <button type="button" onClick={addAnswer} className="px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-neutral-200 transition-colors">
                  <Plus size={14}/> Add
              </button>
            </div>
            
            <div className="space-y-3 max-h-[250px] overflow-y-auto -mr-3 pr-3 stable-scrollbar">
              {answers.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-neutral-200 rounded-xl">
                  <p className="text-sm font-bold text-neutral-400">No expressions yet.</p>
                  <p className="text-xs text-neutral-400 mt-1">Click "Add" or paste JSON below.</p>
                </div>
              )}
              {answers.map((answer, index) => (
                <div key={index} className="p-3 bg-white border border-neutral-200 rounded-xl space-y-2 relative group animate-in fade-in">
                  <button type="button" onClick={() => removeAnswer(index)} className="absolute top-2 right-2 p-1 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Trash2 size={12} />
                  </button>
                  <div className="flex items-center gap-2">
                    <select
                      value={answer.tone}
                      onChange={(e) => updateAnswer(index, 'tone', e.target.value as NativeSpeakAnswer['tone'])}
                      className="px-2 py-1 bg-neutral-100 border border-neutral-200 rounded-md text-xs font-bold text-neutral-600 focus:ring-1 focus:ring-neutral-900 outline-none"
                    >
                      <option value="casual">Casual</option>
                      <option value="semi-academic">Semi-Academic</option>
                      <option value="academic">Academic</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Anchor"
                      value={answer.anchor}
                      onChange={(e) => updateAnswer(index, 'anchor', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-md text-xs font-bold text-neutral-800 focus:ring-1 focus:ring-neutral-900 outline-none"
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Sentence (use {curly braces} to highlight)"
                    value={answer.sentence}
                    onChange={(e) => updateAnswer(index, 'sentence', e.target.value)}
                    className="w-full px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-md text-xs font-medium text-neutral-800 focus:ring-1 focus:ring-neutral-900 outline-none resize-none"
                  />
                  <input
                    type="text"
                    placeholder="Note (optional)"
                    value={answer.note || ''}
                    onChange={(e) => updateAnswer(index, 'note', e.target.value)}
                    className="w-full px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-md text-[10px] font-medium text-neutral-500 focus:ring-1 focus:ring-neutral-900 outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-bold text-neutral-500">Quick-add from JSON</label>
              <textarea
                  placeholder="Paste JSON from AI here to populate expressions..."
                  rows={2}
                  onFocus={(e) => e.target.select()}
                  onChange={handleJsonPaste}
                  className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-xs focus:ring-1 focus:ring-neutral-900 outline-none resize-none"
              />
            </div>
          </div>
        </main>
        
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button>
        </footer>
      </form>
    </div>
  );
};

// --- SpeakingCardItem: Individual Card Logic ---
const SpeakingCardItem: React.FC<{ 
    item: NativeSpeakItem;
    viewSettings: { showTags: boolean; compact: boolean };
    isSelected: boolean;
    onSelect: (id: string) => void;
    onEdit: (item: NativeSpeakItem) => void;
    onDelete: (item: NativeSpeakItem) => void;
    onFocusChange: (item: NativeSpeakItem, color: FocusColor | null) => void;
    onToggleFocus: (item: NativeSpeakItem) => void;
    onPractice: (item: NativeSpeakItem) => void;
}> = ({ item, viewSettings, isSelected, onSelect, onEdit, onDelete, onFocusChange, onToggleFocus, onPractice }) => {
    const answerCount = item.answers?.length || 0;

    return (
         <UniversalCard
            key={item.id}
            title={item.standard}
            path={item.path}
            tags={viewSettings.showTags ? item.tags : undefined}
            compact={viewSettings.compact}
            onClick={() => answerCount > 0 && onPractice(item)}
            focusColor={item.focusColor}
            onFocusChange={(c) => onFocusChange(item, c)}
            isFocused={item.isFocused}
            onToggleFocus={() => onToggleFocus(item)}
            className={isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}
            actions={
                <>
                    <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"><Edit3 size={14}/></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14}/></button>
                </>
            }
         >
             <div className="absolute top-4 left-4 z-20">
                <button 
                    onClick={(e) => { e.stopPropagation(); onSelect(item.id); }} 
                    className={`p-1 rounded-md transition-all duration-200 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-white/30 backdrop-blur-sm text-neutral-400 opacity-0 group-hover:opacity-100'}`}
                    aria-label={isSelected ? `Deselect ${item.standard}` : `Select ${item.standard}`}
                >
                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
            </div>
             <div className="flex justify-between items-center mt-2">
                <div className="text-xs font-medium text-neutral-500">
                    {answerCount > 0 ? `${answerCount} expressions available` : 'No expressions yet. Refine with AI!'}
                </div>
                <button onClick={(e) => { e.stopPropagation(); onPractice(item); }} className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 active:scale-95 disabled:opacity-50" disabled={answerCount === 0}>
                    <Volume2 size={14}/> Speak
                </button>
             </div>
         </UniversalCard>
    );
};

// --- NEW COMPONENT: SpeakingPracticeModal ---
interface SpeakingPracticeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: NativeSpeakItem | null;
}

const SpeakingPracticeModal: React.FC<SpeakingPracticeModalProps> = ({ isOpen, onClose, item }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [userTranscript, setUserTranscript] = useState('');
    const recognitionManager = useRef(new SpeechRecognitionManager());

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setIsRevealed(false);
            setUserTranscript('');
            setIsRecording(false);
        }
    }, [isOpen]);

    if (!isOpen || !item || !item.answers || item.answers.length === 0) return null;

    const currentAnswer = item.answers[currentIndex];
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === item.answers.length - 1;

    const handleRecord = async () => {
        if (isRecording) {
            recognitionManager.current.stop();
            await stopRecording();
            setIsRecording(false);
        } else {
            setUserTranscript('');
            try {
                await startRecording();
                setIsRecording(true);
                recognitionManager.current.start(
                    (final, interim) => setUserTranscript(final + interim),
                    (final) => { setUserTranscript(final); setIsRecording(false); }
                );
            } catch(e) { console.error(e); setIsRecording(false); }
        }
    };

    const getToneConfig = (tone: string) => {
        switch(tone) {
            case 'casual': return { icon: Coffee, colorClass: 'bg-sky-100 text-sky-700 border-sky-200', label: 'Casual' };
            case 'semi-academic': return { icon: School, colorClass: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Semi-Academic' };
            case 'academic': return { icon: GraduationCap, colorClass: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Academic' };
            default: return { icon: Mic, colorClass: 'bg-neutral-100 text-neutral-600 border-neutral-200', label: 'Expression' };
        }
    };
    const toneConfig = getToneConfig(currentAnswer.tone);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-6 py-4 flex justify-end items-center shrink-0">
                     <button type="button" onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={20}/></button>
                </header>
                <main className="p-6 pt-0 flex-1 flex flex-col items-center justify-center text-center space-y-4">
                    <h3 className="text-xl font-bold text-neutral-800 tracking-tight">{item.standard}</h3>
                    
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border ${toneConfig.colorClass}`}>
                        <toneConfig.icon size={12} /> {toneConfig.label}
                    </div>
                    
                    <div className="w-full min-h-[150px] p-6 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col items-center justify-center">
                        {isRevealed ? (
                            <div className="space-y-4 animate-in fade-in duration-300">
                                <div className="text-xl font-medium leading-relaxed text-neutral-900">
                                    <PatternRenderer text={currentAnswer.sentence} />
                                </div>
                                {currentAnswer.note && (
                                    <div className="p-3 bg-sky-50 rounded-xl border border-sky-200 text-xs font-medium text-sky-800 leading-relaxed">
                                        <PatternRenderer text={currentAnswer.note} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <h2 className="text-4xl font-black text-neutral-900 animate-in fade-in duration-300">{currentAnswer.anchor}</h2>
                        )}
                    </div>
                    
                    <button onClick={() => setIsRevealed(prev => !prev)} className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] hover:bg-neutral-50 transition-all active:scale-95 uppercase tracking-widest shadow-sm">
                        {isRevealed ? <EyeOff size={14}/> : <Eye size={14}/>}
                        <span>{isRevealed ? 'Hide Answer' : 'Show Answer'}</span>
                    </button>
                    
                    {userTranscript && <p className="text-sm font-medium italic text-neutral-500 mt-4">"{userTranscript}"</p>}

                </main>
                <footer className="px-6 py-6 border-t border-neutral-100 flex items-center justify-between shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    <button onClick={() => { setIsRevealed(false); setCurrentIndex(i => i - 1); }} disabled={isFirst} className="p-4 rounded-full bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30"><ChevronLeft size={20}/></button>
                    
                    <div className="flex items-center gap-4">
                        <button onClick={() => speak(currentAnswer.sentence)} className="p-5 rounded-full bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-indigo-600 transition-colors shadow-sm"><Volume2 size={24}/></button>
                        <button onClick={handleRecord} className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-rose-500 text-white hover:bg-rose-600'}`}>
                            {isRecording ? <Square size={28} fill="currentColor"/> : <Mic size={28} />}
                        </button>
                    </div>
                    
                    <button onClick={() => { setIsRevealed(false); setCurrentIndex(i => i + 1); }} disabled={isLast} className="p-4 rounded-full bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30"><ChevronRight size={20}/></button>
                </footer>
            </div>
        </div>
    );
};


export const SpeakingCardPage: React.FC<Props> = ({ user, onNavigate }) => {
  const [items, setItems] = useState<NativeSpeakItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, {
      showTags: true,
      compact: false
  }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);

  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isGroupBrowserOpen, setIsGroupBrowserOpen] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NativeSpeakItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<NativeSpeakItem | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [itemToRefine, setItemToRefine] = useState<Partial<NativeSpeakItem> | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const { showToast } = useToast();
  
  const [practiceModalItem, setPracticeModalItem] = useState<NativeSpeakItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    const data = await db.getNativeSpeakItemsByUserId(user.id);
    setItems(data.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user.id]);
  useEffect(() => { setPage(0); }, [selectedTag, pageSize, focusFilter, colorFilter]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (focusFilter === 'focused' && !item.isFocused) return false;
      if (colorFilter !== 'all' && item.focusColor !== colorFilter) return false;

      if (selectedTag) {
          if (selectedTag === 'Uncategorized') {
             if (item.path && item.path !== '/') return false;
          } else {
             if (!item.path?.startsWith(selectedTag) && !item.tags?.includes(selectedTag)) return false;
          }
      }
      return true;
    });
  }, [items, selectedTag, focusFilter, colorFilter]);
  
  const pagedItems = useMemo(() => {
      const start = page * pageSize;
      return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const handleRandomize = () => { setItems(prev => [...prev].sort(() => Math.random() - 0.5)); showToast("Shuffled!", "success"); };
  const handleAdd = () => { setEditingItem(null); setIsModalOpen(true); };
  const handleEdit = (item: NativeSpeakItem) => { setEditingItem(item); setIsModalOpen(true); };
  const handleDelete = async () => { if (!itemToDelete) return; await db.deleteNativeSpeakItem(itemToDelete.id); setItemToDelete(null); loadData(); };
  
  const handleSave = async (data: { standard: string, tags: string[], note: string, answers: NativeSpeakAnswer[] }) => {
    const now = Date.now();
    if (editingItem) {
        await db.saveNativeSpeakItem({ ...editingItem, ...data, updatedAt: now });
    } else {
        const newItem: NativeSpeakItem = { 
            id: `ns-${now}-${Math.random()}`, 
            userId: user.id, 
            createdAt: now, 
            updatedAt: now,
            ...data
        };
        await db.saveNativeSpeakItem(newItem);
    }
    setIsModalOpen(false);
    loadData();
    showToast("Saved successfully!", "success");
  };
  
  const handleFocusChange = async (item: NativeSpeakItem, color: FocusColor | null) => {
      const updatedItem = { ...item, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete updatedItem.focusColor;
      setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
      await db.saveNativeSpeakItem(updatedItem);
  };
  
  const handleToggleFocus = async (item: NativeSpeakItem) => {
      const updatedItem = { ...item, isFocused: !item.isFocused, updatedAt: Date.now() };
      setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
      await db.saveNativeSpeakItem(updatedItem);
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };
  
  const selectedItems = useMemo(() => items.filter(item => selectedIds.has(item.id)), [items, selectedIds]);

  const handleMergeResult = async (mergedData: any) => {
      if (!mergedData || !mergedData.standard || !Array.isArray(mergedData.answers)) {
          showToast("Invalid JSON format from AI for merging.", "error");
          return;
      }
      setIsMergeModalOpen(false);
      setIsProcessing(true);
      try {
          const now = Date.now();
          const mergedTags = new Set<string>();
          selectedItems.forEach(item => { (item.tags || []).forEach(tag => mergedTags.add(tag)); });
          mergedTags.add('merged');

          const newItem: NativeSpeakItem = {
              id: `ns-${now}-${Math.random()}`,
              userId: user.id,
              standard: mergedData.standard,
              answers: mergedData.answers,
              tags: Array.from(mergedTags),
              createdAt: now,
              updatedAt: now,
          };
          await db.saveNativeSpeakItem(newItem);
          await db.bulkDeleteNativeSpeakItems(Array.from(selectedIds));

          showToast(`Successfully merged ${selectedIds.size} cards!`, 'success');
          setSelectedIds(new Set());
          await loadData();
      } catch (e) {
          showToast("Failed to merge cards.", "error");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <>
    <ResourcePage
      title="Speaking Library"
      subtitle="Master natural phrases and expressions for any context."
      icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png" className="w-8 h-8 object-contain" alt="Speaking" />}
      config={{}}
      isLoading={loading || isProcessing}
      isEmpty={filteredItems.length === 0}
      emptyMessage="No expressions found."
      activeFilters={{}}
      onFilterChange={() => {}}
      pagination={{ page, totalPages: Math.ceil(filteredItems.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredItems.length }}
      minorSkills={
          onNavigate ? (
            <button onClick={() => onNavigate('MIMIC')} className="flex items-center gap-2 px-3 py-2 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-bold hover:bg-neutral-200 transition-colors">
                <Mic size={16} />
                <span className="hidden sm:inline">Pronunciation</span>
            </button>
          ) : undefined
      }
      actions={
        <ResourceActions
            viewMenu={
                <ViewMenu 
                    isOpen={isViewMenuOpen} 
                    setIsOpen={setIsViewMenuOpen} 
                    customSection={
                        <>
                            <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2">
                                <Target size={10}/> Focus & Status
                            </div>
                            <div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2">
                                <button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                                    {focusFilter === 'focused' ? 'Focused Only' : 'All Items'}
                                </button>
                                <div className="flex gap-1">
                                    <button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} />
                                    <button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} />
                                </div>
                            </div>
                        </>
                    }
                    viewOptions={[
                        { label: 'Show Tags', checked: viewSettings.showTags, onChange: () => setViewSettings(v => ({...v, showTags: !v.showTags})) }, 
                        { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }
                    ]}
                />
            }
            browseGroups={{ isOpen: isGroupBrowserOpen, onToggle: () => { setIsGroupBrowserOpen(!isGroupBrowserOpen); setIsTagBrowserOpen(false); } }}
            browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); setIsGroupBrowserOpen(false); } }}
            addActions={[{ label: 'Add', icon: Plus, onClick: handleAdd }]}
            extraActions={<button onClick={handleRandomize} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button>}
        />
      }
      aboveGrid={
        <>
            {isGroupBrowserOpen && <TagBrowser items={items} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="groups" title="Browse Groups" icon={<FolderTree size={16}/>} />}
            {isTagBrowserOpen && <TagBrowser items={items} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}
        </>
      }
    >
      {() => (
        <>
          {pagedItems.map(item => (
             <SpeakingCardItem 
                key={item.id} 
                item={item} 
                viewSettings={viewSettings}
                isSelected={selectedIds.has(item.id)}
                onSelect={handleSelect}
                onEdit={handleEdit} 
                onDelete={setItemToDelete} 
                onFocusChange={handleFocusChange} 
                onToggleFocus={handleToggleFocus}
                onPractice={setPracticeModalItem}
            />
          ))}
        </>
      )}
    </ResourcePage>
    
    {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] w-full max-w-md px-4 animate-in slide-in-from-bottom-8">
            <div className="bg-neutral-900 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-neutral-800 gap-4">
                <div className="flex items-center gap-3 pl-2">
                    <button onClick={() => setSelectedIds(new Set())} className="p-1 text-neutral-500 hover:text-white"><X size={16}/></button>
                    <span className="text-sm font-bold">{selectedIds.size} selected</span>
                </div>
                <button
                    onClick={() => setIsMergeModalOpen(true)}
                    disabled={selectedIds.size < 2 || isProcessing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-black text-xs flex items-center gap-2 uppercase tracking-wider hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Combine size={14} /> Merge
                </button>
            </div>
        </div>
    )}

    {isProcessing && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[250] flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-neutral-900" />
        </div>
    )}
    
    <AddEditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingItem} onOpenAiRefine={(d) => { setItemToRefine(d); setIsAiModalOpen(true); }} />
    <ConfirmationModal isOpen={!!itemToDelete} title="Delete Card?" message="Delete this expression?" confirmText="Delete" isProcessing={false} onConfirm={handleDelete} onClose={() => setItemToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    {isAiModalOpen && <UniversalAiModal 
        isOpen={isAiModalOpen} 
        onClose={() => setIsAiModalOpen(false)} 
        type="REFINE_UNIT"
        title="Refine Expression"
        description="Enter instructions for the AI to generate expressions."
        initialData={{}}
        onGeneratePrompt={(i) => getRefineNativeSpeakPrompt(itemToRefine?.standard || '', i.request)} 
        onJsonReceived={(d) => { 
            if (d.answers) { 
                setEditingItem(prev => {
                    const baseItem = prev || { id: '', userId: user.id, createdAt: 0, updatedAt: 0, standard: '', answers: [], tags: [], note: '' };
                    return { ...baseItem, standard: d.standard, answers: d.answers };
                });
                setIsAiModalOpen(false); 
                showToast("Refined! Expressions generated.", "success"); 
            } 
        }} 
        actionLabel="Apply" 
    />}
    {isMergeModalOpen && (
        <UniversalAiModal 
            isOpen={isMergeModalOpen}
            onClose={() => setIsMergeModalOpen(false)}
            type="REFINE_UNIT"
            title="Merge Expressions"
            description="AI will combine the selected cards into a single, cohesive one."
            initialData={{}}
            onGeneratePrompt={() => getMergeNativeSpeakPrompt(selectedItems)}
            onJsonReceived={handleMergeResult}
            actionLabel="Apply Merge"
        />
    )}
    <SpeakingPracticeModal 
        isOpen={!!practiceModalItem}
        onClose={() => setPracticeModalItem(null)}
        item={practiceModalItem}
    />
    </>
  );
};
