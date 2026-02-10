import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, NativeSpeakItem, VocabularyItem, WordQuality, FocusColor, SpeakingTopic, NativeSpeakAnswer, AppView, SpeakingBook, ConversationItem, ConversationSpeaker, ConversationSentence } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ResourcePage } from '../page/ResourcePage';
import { Mic, Volume2, Eye, EyeOff, Tag, ChevronRight, Shuffle, Plus, Edit3, Trash2, AudioLines, Sparkles, Save, X, StickyNote, Info, ChevronLeft, Loader2, Target, Library, FolderPlus, Pen, Move, Book, ArrowLeft, Users, MessageSquare, Play, ChevronDown, Pause, MessageCircle, UserCircle, Square as SquareIcon, Languages, Headphones, Download, LayoutList, LayoutGrid, Target as TargetIcon, ChevronsLeft, Ear } from 'lucide-react';
import { speak, startRecording, stopRecording, fetchServerVoices, ServerVoicesResponse, stopSpeaking } from '../../utils/audio';
import { useToast } from '../../contexts/ToastContext';
import { TagBrowser } from '../../components/common/TagBrowser';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import UniversalAiModal from '../../components/common/UniversalAiModal';
// Fixed: Removed getMergeNativeSpeakPrompt which is not exported by promptService
import { getRefineNativeSpeakPrompt, getGenerateConversationPrompt } from '../../services/promptService';
import { ViewMenu } from '../../components/common/ViewMenu';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';
import { UniversalCard } from '../../components/common/UniversalCard';
import { ResourceActions } from '../page/ResourceActions';
import { useShelfLogic } from '../../app/hooks/useShelfLogic';
import { AddShelfModal, RenameShelfModal, MoveBookModal } from '../../components/wordbook/ShelfModals';
import { UniversalBook } from '../../components/common/UniversalBook';
import { UniversalShelf } from '../../components/common/UniversalShelf';
import { GenericBookDetail, GenericBookItem } from '../../components/common/GenericBookDetail';
import { ShelfSearchBar } from '../../components/common/ShelfSearchBar';
import { SimpleMimicModal } from '../../components/common/SimpleMimicModal';
import { getConfig, getServerUrl } from '../../app/settingsManager';
import { SpeechRecognitionManager } from '../../utils/speechRecognition';

const VIEW_SETTINGS_KEY = 'vocab_pro_speaking_card_view';

interface Props {
  user: User;
  onNavigate?: (view: AppView) => void;
}

type SpeakingItem = 
  | { type: 'card'; data: NativeSpeakItem }
  | { type: 'conversation'; data: ConversationItem };

const PatternRenderer: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/({.*?}|\[.*?\]|<.*?>)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('{') && part.endsWith('}')) {
                    return (
                        <span key={i} className="mx-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold font-mono text-[0.9em] border border-amber-200 inline-block shadow-sm">
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                if (part.startsWith('[') && part.endsWith(']')) {
                    return (
                         <span key={i} className="mx-1 inline-flex items-center gap-1.5 text-[10px] text-sky-700 bg-sky-100 border border-sky-200 px-2 py-1 rounded-full font-medium">
                            <Info size={12} />
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};

// --- Helper: WAV Encoder for combining audio ---
function bufferToWav(abuffer: AudioBuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0; // scale
            view.setInt16(pos, sample, true); // write 16-bit sample
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }
}

// --- Add/Edit Card Modal ---
interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { standard: string, tags: string[], note: string, answers: NativeSpeakAnswer[] }) => void;
  initialData?: NativeSpeakItem | null;
}

const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
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
    onSave({ standard: standard.trim(), tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean), note: note.trim(), answers });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Expression' : 'New Expression'}</h3>
            <p className="text-sm text-neutral-500">Define context and generate expressions.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>
        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Context / Meaning</label>
            <textarea value={standard} onChange={e => setStandard(e.target.value)} placeholder="e.g., Disagreeing politely" rows={2} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none" required />
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><Tag size={12}/> Tags</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="linking, academic..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
          <div className="space-y-3 pt-2">
             <div className="flex justify-between items-center">
                 <label className="text-xs font-bold text-neutral-500 uppercase">Answers</label>
                 <button type="button" onClick={() => setAnswers([...answers, { tone: 'semi-academic', anchor: '', sentence: '' }])} className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 transition-colors"><Plus size={14}/></button>
             </div>
             {answers.map((ans, idx) => (
                 <div key={idx} className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2 relative group">
                     <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={12}/></button>
                     <div className="flex gap-2">
                         <select value={ans.tone} onChange={e => { const n = [...answers]; n[idx].tone = e.target.value as any; setAnswers(n); }} className="px-2 py-1 bg-white border border-neutral-200 rounded-lg text-[10px] font-bold outline-none">
                             <option value="casual">Casual</option>
                             <option value="semi-academic">Semi-Academic</option>
                             <option value="academic">Academic</option>
                         </select>
                         <input value={ans.anchor} onChange={e => { const n = [...answers]; n[idx].anchor = e.target.value; setAnswers(n); }} placeholder="Anchor phrase" className="flex-1 px-2 py-1 bg-white border border-neutral-200 rounded-lg text-xs font-bold outline-none" />
                     </div>
                     <textarea value={ans.sentence} onChange={e => { const n = [...answers]; n[idx].sentence = e.target.value; setAnswers(n); }} placeholder="Example sentence with {curly braces}" className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-medium resize-none outline-none" rows={2} />
                 </div>
             ))}
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button>
        </footer>
      </form>
    </div>
  );
};

// --- Add/Edit Conversation Modal ---
interface AddEditConversationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<ConversationItem>) => void;
    initialData?: ConversationItem | null;
    onOpenAiGen: () => void;
}

const AddEditConversationModal: React.FC<AddEditConversationModalProps> = ({ isOpen, onClose, onSave, initialData, onOpenAiGen }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [speakers, setSpeakers] = useState<ConversationSpeaker[]>([]);
    const [sentences, setSentences] = useState<ConversationSentence[]>([]);
    const [tagsInput, setTagsInput] = useState('');
    const [serverVoices, setServerVoices] = useState<ServerVoicesResponse | null>(null);

    useEffect(() => {
        if (isOpen) {
            setTitle(initialData?.title || '');
            setDescription(initialData?.description || '');
            setSpeakers(initialData?.speakers || []);
            setSentences(initialData?.sentences || []);
            setTagsInput(initialData?.tags?.join(', ') || '');
            
            const url = getServerUrl(getConfig());
            fetchServerVoices(url).then(setServerVoices).catch(() => setServerVoices(null));
        }
    }, [isOpen, initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ title: title.trim(), description, speakers, sentences, tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean) });
    };

    const updateSpeaker = (idx: number, updates: Partial<ConversationSpeaker>) => {
        setSpeakers(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
    };

    const enVoices = useMemo(() => {
        if (!serverVoices) return [];
        return serverVoices.voices.filter(v => 
            v.language.startsWith('en') && 
            (v.name.toLowerCase().includes('enhanced') || v.name.toLowerCase().includes('premium'))
        );
    }, [serverVoices]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <form onSubmit={handleSubmit} className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Conversation' : 'New Conversation'}</h3>
                        <p className="text-sm text-neutral-500">Create interactive multi-speaker dialogues.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onOpenAiGen} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors" title="Generate with AI"><Sparkles size={18} /></button>
                        <button type="button" onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                </header>
                <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400">Title</label>
                            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-bold focus:ring-2 focus:ring-neutral-900 outline-none" required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-400">Tags</label>
                            <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm focus:ring-1 focus:ring-neutral-300 outline-none" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2"><Users size={14}/> Speakers ({speakers.length}/3)</label>
                            <button type="button" onClick={() => setSpeakers([...speakers, { name: '', sex: 'female' }])} disabled={speakers.length >= 3} className="p-1.5 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 transition-colors disabled:opacity-50"><Plus size={14}/></button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {speakers.map((s, i) => (
                                <div key={i} className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 relative group animate-in zoom-in-95 grid grid-cols-1 sm:grid-cols-[1fr,auto,2fr] gap-4 items-center">
                                    <button type="button" onClick={() => setSpeakers(speakers.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 p-1 bg-white text-neutral-300 hover:text-red-500 border border-neutral-200 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"><X size={10} /></button>
                                    
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-neutral-400">Speaker Name</label>
                                        <input value={s.name} onChange={e => updateSpeaker(i, { name: e.target.value })} placeholder="Name" className="w-full bg-white border border-neutral-200 rounded-lg px-3 py-1.5 font-bold text-xs outline-none focus:border-neutral-900" />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-neutral-400">Sex</label>
                                        <div className="flex bg-white rounded-lg p-0.5 border border-neutral-200 h-[32px]">
                                            <button type="button" onClick={() => updateSpeaker(i, { sex: 'male' })} className={`flex-1 px-3 py-1 text-[8px] font-black uppercase rounded ${s.sex === 'male' ? 'bg-blue-500 text-white shadow-sm' : 'text-neutral-400'}`}>Male</button>
                                            <button type="button" onClick={() => updateSpeaker(i, { sex: 'female' })} className={`flex-1 px-3 py-1 text-[8px] font-black uppercase rounded ${s.sex === 'female' ? 'bg-pink-500 text-white shadow-sm' : 'text-neutral-400'}`}>Female</button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-neutral-400">High Quality Voice</label>
                                        <div className="relative">
                                            <select 
                                                value={s.voiceName || ''} 
                                                onChange={e => {
                                                    const v = enVoices.find(v => v.name === e.target.value);
                                                    updateSpeaker(i, { voiceName: e.target.value, accentCode: v?.accent });
                                                    if (e.target.value) {
                                                        speak(`Hello, this is ${e.target.value}`, false, 'en', e.target.value, v?.accent);
                                                    }
                                                }}
                                                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 pr-10 text-[10px] font-bold outline-none focus:border-neutral-900 appearance-none"
                                            >
                                                <option value="">Auto Select</option>
                                                {enVoices.map(v => (
                                                    <option key={v.name} value={v.name}>{v.name} ({v.accent})</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-neutral-100">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2"><MessageSquare size={14}/> Script ({sentences.length})</label>
                            <button type="button" onClick={() => setSentences([...sentences, { speakerName: speakers[0]?.name || '', text: '' }])} disabled={speakers.length === 0} className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-neutral-800 disabled:opacity-50 transition-colors"><Plus size={14}/> Add Line</button>
                        </div>
                        <div className="space-y-2">
                            {sentences.map((s, i) => (
                                <div key={i} className="flex gap-2 items-start animate-in slide-in-from-top-2">
                                    <select value={s.speakerName} onChange={e => { const n = [...sentences]; n[i].speakerName = e.target.value; setSentences(n); }} className="w-24 shrink-0 px-2 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-[10px] font-black uppercase tracking-wider outline-none focus:ring-1 focus:ring-neutral-900">
                                        {speakers.map(sp => <option key={sp.name} value={sp.name}>{sp.name || '?'}</option>)}
                                    </select>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <textarea value={s.text} onChange={e => { const n = [...sentences]; n[i].text = e.target.value; setSentences(n); }} rows={2} placeholder="Speech..." className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-neutral-900 outline-none resize-none" />
                                        <div className="flex gap-2 items-center">
                                            <label className="text-[8px] font-black text-neutral-400 uppercase">Emoji</label>
                                            <input value={s.icon || ''} onChange={e => { const n = [...sentences]; n[i].icon = e.target.value; setSentences(n); }} className="bg-neutral-50 border border-neutral-100 rounded px-2 py-1 text-xs w-12" placeholder="😊" />
                                        </div>
                                    </div>
                                    <button type="button" onClick={setSentences.bind(null, sentences.filter((_, idx) => idx !== i))} className="p-2 text-neutral-300 hover:text-red-500"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
                <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
                    <button type="submit" className="px-8 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save Conversation</button>
                </footer>
            </form>
        </div>
    );
};

// --- SpeakingPracticeModal Definition ---
const SpeakingPracticeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    item: NativeSpeakItem | null;
}> = ({ isOpen, onClose, item }) => {
    const [revealed, setRevealed] = useState<Set<number>>(new Set());
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);

    if (!isOpen || !item) return null;

    const toggleReveal = (idx: number) => {
        setRevealed(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const handleMimic = (sentence: string) => {
        const cleanText = sentence.replace(/{|}/g, '');
        setMimicTarget(cleanText);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[85vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">{item.standard}</h3>
                        <p className="text-xs text-neutral-500 font-bold mt-1">Native Expressions Practice</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                </header>
                <main className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-neutral-50/30">
                    {item.answers.map((ans, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm space-y-3 relative overflow-hidden group">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${ans.tone === 'academic' ? 'bg-purple-50 text-purple-700 border-purple-100' : ans.tone === 'semi-academic' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-neutral-50 text-neutral-600 border-neutral-100'}`}>{ans.tone}</span>
                                    <span className="text-sm font-black text-neutral-900">{ans.anchor}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => speak(ans.sentence.replace(/{|}/g, ''))} className="p-2 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Listen"><Volume2 size={16}/></button>
                                    <button onClick={() => handleMimic(ans.sentence)} className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Practice Speaking"><Mic size={16}/></button>
                                    <button onClick={() => toggleReveal(idx)} className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-all">{revealed.has(idx) ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                                </div>
                            </div>
                            <div className="min-h-[1.5rem] flex items-center">
                                {revealed.has(idx) ? <div className="text-base font-medium text-neutral-800 animate-in fade-in slide-in-from-top-1"><PatternRenderer text={ans.sentence} /></div> : <div className="flex gap-1 items-center">{Array.from({length: 3}).map((_, i) => (<div key={i} className="h-1.5 w-8 bg-neutral-100 rounded-full animate-pulse"></div>))}</div>}
                            </div>
                            {ans.note && revealed.has(idx) && <div className="pt-2 mt-2 border-t border-neutral-50 text-[10px] text-neutral-500 font-medium italic">"{ans.note}"</div>}
                        </div>
                    ))}
                </main>
                <footer className="px-8 py-4 border-t border-neutral-100 bg-white rounded-b-[2.5rem] flex justify-end">
                    <button onClick={onClose} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-md">Done</button>
                </footer>
            </div>
            {mimicTarget && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />}
        </div>
    );
};

// --- NEW COMPONENT: ConversationPracticeModal ---
interface ConversationPracticeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: ConversationItem | null;
}

const ConversationPracticeModal: React.FC<ConversationPracticeModalProps> = ({ isOpen, onClose, item }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPlayingAll, setIsPlayingAll] = useState(false);
    const [actingAs, setActingAs] = useState<string | null>(null); // Name of character user is playing
    const [isUserTurn, setIsUserTurn] = useState(false);
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(true); // Default: Focus on current turn
    
    // Role change confirmation state
    const [roleChangeCandidate, setRoleChangeCandidate] = useState<string | null>(null);

    // User recordings state
    const [userRecordings, setUserRecordings] = useState<Record<number, { base64: string, mime: string }>>({});
    // AI audio cache to avoid re-fetching
    const [aiAudioCache, setAiAudioCache] = useState<Record<number, { base64: string, mime: string }>>({});
    
    // Inline recording state
    const [isRecordingUser, setIsRecordingUser] = useState(false);
    const [userTranscript, setUserTranscript] = useState('');
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const [userAudioMime, setUserAudioMime] = useState<string>('audio/webm');
    const [isListeningForStt, setIsListeningForStt] = useState(false);
    const [mimicTarget, setMimicTarget] = useState<string | null>(null);
    
    // Preview Full Audio State
    const [isPreviewing, setIsPreviewing] = useState(false);

    const [config] = useState(() => getConfig());
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const recognitionManager = useRef(new SpeechRecognitionManager());
    const activeAudioRef = useRef<HTMLAudioElement | null>(null);
    const { showToast } = useToast();

    const stopAllAudio = () => {
        if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            activeAudioRef.current.src = "";
            activeAudioRef.current = null;
        }
        stopSpeaking(); // Browser fallback stop
    };

    // Clear all audio caches when modal closes to save RAM
    const handleClose = () => {
        stopAllAudio();
        recognitionManager.current.stop();
        // Clear caches
        setAiAudioCache({});
        setUserRecordings({});
        setUserAudioUrl(null);
        onClose();
    };

    // Autoplay & Turn Management Logic
    useEffect(() => {
        if (!(isPlaying || isPlayingAll) || !item) return;
        
        let isCancelled = false;

        const runCurrentItem = async () => {
            if (currentIndex >= item.sentences.length || isCancelled) return;
            
            const s = item.sentences[currentIndex];
            
            // 1. CHECK IF USER TURN (Skip check if isPlayingAll is active)
            if (!isPlayingAll && actingAs && s.speakerName === actingAs) {
                setIsPlaying(false);
                setIsUserTurn(true);
                return;
            }

            // 2. CHECK FOR USER SOUND (Priority in Play All mode)
            const userAudioData = userRecordings[currentIndex];
            if (userAudioData && isPlayingAll) {
                stopAllAudio();
                await new Promise((resolve) => {
                    const audio = new Audio(`data:${userAudioData.mime};base64,${userAudioData.base64}`);
                    activeAudioRef.current = audio;
                    audio.onended = () => resolve(true);
                    audio.onerror = () => resolve(false);
                    audio.play().catch(() => resolve(false));
                    
                    if (isCancelled) {
                        audio.pause();
                        resolve(false);
                    }
                });
            } else {
                // 3. AI Speaker Logic with Cache Check
                const cachedAiAudio = aiAudioCache[currentIndex];
                if (cachedAiAudio) {
                    stopAllAudio();
                    await new Promise((resolve) => {
                        const audio = new Audio(`data:${cachedAiAudio.mime};base64,${cachedAiAudio.base64}`);
                        activeAudioRef.current = audio;
                        audio.onended = () => resolve(true);
                        audio.onerror = () => resolve(false);
                        audio.play().catch(() => resolve(false));

                        if (isCancelled) {
                            audio.pause();
                            resolve(false);
                        }
                    });
                } else {
                    // FETCH AND CACHE
                    const sp = item.speakers.find(src => src.name === s.speakerName);
                    let voice = sp?.voiceName;
                    let accent = sp?.accentCode;

                    if (!voice) {
                        const activeType = sp?.sex === 'male' ? 'male' : 'female';
                        const coach = config.audioCoach.coaches[activeType];
                        voice = coach.enVoice;
                        accent = coach.enAccent;
                    }

                    try {
                        const serverUrl = getServerUrl(config);
                        const payload = { text: s.text, language: 'en', accent, voice };
                        const res = await fetch(`${serverUrl}/speak`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        if (res.ok) {
                            const blob = await res.blob();
                            const reader = new FileReader();
                            const base64Promise = new Promise<string>((resolve) => {
                                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                            });
                            reader.readAsDataURL(blob);
                            const base64 = await base64Promise;
                            const mime = res.headers.get('Content-Type') || 'audio/aiff';

                            setAiAudioCache(prev => ({ ...prev, [currentIndex]: { base64, mime } }));
                            
                            if (!isCancelled) {
                                stopAllAudio();
                                const audio = new Audio(`data:${mime};base64,${base64}`);
                                activeAudioRef.current = audio;
                                await new Promise((resolve) => {
                                    audio.onended = () => resolve(true);
                                    audio.onerror = () => resolve(false);
                                    audio.play().catch(() => resolve(false));
                                    
                                    if (isCancelled) {
                                        audio.pause();
                                        resolve(false);
                                    }
                                });
                            }
                        } else {
                            // Fallback to browser speak if server fails
                            await speak(s.text, true, 'en', voice, accent);
                        }
                    } catch (e) {
                        console.error("Playback error", e);
                    }
                }
            }

            if (!isCancelled && (isPlaying || isPlayingAll)) {
                if (currentIndex < item.sentences.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                } else {
                    setIsPlaying(false);
                    setIsPlayingAll(false);
                }
            }
        };

        runCurrentItem();
        return () => { isCancelled = true; };
    }, [isPlaying, isPlayingAll, currentIndex, item, actingAs]);

    // Auto-scroll logic
    useEffect(() => {
        const activeEl = itemRefs.current[currentIndex];
        if (activeEl && scrollContainerRef.current) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentIndex, isPlaying, isPlayingAll, isUserTurn, isFocusMode]);
    
    // --- ROLE CHANGE LOGIC WITH CONFIRMATION ---
    const hasProgress = currentIndex > 0 || Object.keys(userRecordings).length > 0;

    const requestRoleChange = (role: string | null) => {
        if (hasProgress) {
            setRoleChangeCandidate(role); // Triggers Modal
        } else {
            // Apply immediately if fresh start
            confirmRoleChange(role);
        }
    };

    const confirmRoleChange = (role: string | null) => {
        // Reset everything
        stopAllAudio();
        setIsPlaying(false);
        setIsPlayingAll(false);
        setIsUserTurn(false);
        setCurrentIndex(0);
        setUserRecordings({}); 
        // We keep AI cache as that is expensive/slow to re-fetch
        
        setActingAs(role);
        setRoleChangeCandidate(null); // Close modal if open via state
        
        // If switching to spectator, we might want to auto-play or just reset.
        // Let's just reset and let user decide.
        if (role) {
             showToast(`Role changed to ${role}. Practice reset.`, 'info');
        } else {
             showToast("Role changed to Spectator. Practice reset.", 'info');
        }
    };

    if (!isOpen || !item || !item.sentences || item.sentences.length === 0) return null;

    const sentences = item.sentences;
    const activeSentence = sentences[currentIndex];
    
    // --- NAVIGATION HANDLERS ---
    const handleNavFirst = () => {
        stopAllAudio();
        setIsUserTurn(false);
        setCurrentIndex(0);
    };

    const handleNavPrev = () => {
        if (currentIndex > 0) {
            stopAllAudio();
            setIsUserTurn(false);
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleNavNext = () => {
        if (currentIndex < sentences.length - 1) {
            stopAllAudio();
            setIsUserTurn(false);
            setCurrentIndex(prev => prev + 1);
        }
    };
    
    // --- USER INTERACTION HANDLERS ---
    
    const handleToggleRecording = async () => {
        if (isRecordingUser) {
            recognitionManager.current.stop();
            setIsListeningForStt(false);
            const result = await stopRecording();
            if (result) {
                setUserAudioUrl(result.base64);
                setUserAudioMime(result.mimeType);
            }
            setIsRecordingUser(false);
        } else {
            stopAllAudio(); 
            setUserTranscript('');
            setUserAudioUrl(null);
            try {
                await startRecording();
                setIsRecordingUser(true);
                setIsListeningForStt(true);
                recognitionManager.current.start(
                    (final, interim) => setUserTranscript(final + interim),
                    (finalTranscript) => setUserTranscript(finalTranscript)
                );
            } catch (e) {
                console.error("Failed to start recording", e);
                setIsRecordingUser(false);
            }
        }
    };

    const handlePlayUserAudio = (index?: number) => {
        const audioData = index !== undefined ? userRecordings[index] : (userAudioUrl ? { base64: userAudioUrl, mime: userAudioMime } : null);
        if (audioData) {
            stopAllAudio();
            const audio = new Audio(`data:${audioData.mime};base64,${audioData.base64}`);
            activeAudioRef.current = audio;
            audio.play();
        }
    };

    const handleConfirmUserTurn = () => {
        if (userAudioUrl) {
            setUserRecordings(prev => ({ ...prev, [currentIndex]: { base64: userAudioUrl, mime: userAudioMime } }));
        }
        
        setIsUserTurn(false);
        setUserTranscript('');
        setUserAudioUrl(null);
        if (currentIndex < sentences.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setIsPlaying(true);
        } else {
            setIsPlaying(false);
        }
    };

    const handleSpeakAiSentence = async (s: ConversationSentence, idx: number) => {
        stopAllAudio();
        const cached = aiAudioCache[idx];
        if (cached) {
            const audio = new Audio(`data:${cached.mime};base64,${cached.base64}`);
            activeAudioRef.current = audio;
            audio.play();
            return;
        }

        const sp = item.speakers.find(src => src.name === s.speakerName);
        let voice = sp?.voiceName;
        let accent = sp?.accentCode;

        if (!voice) {
            const activeType = sp?.sex === 'male' ? 'male' : 'female';
            const coach = config.audioCoach.coaches[activeType];
            voice = coach.enVoice;
            accent = coach.enAccent;
        }

        const serverUrl = getServerUrl(config);
        const payload = { text: s.text, language: 'en', accent, voice };
        try {
            const res = await fetch(`${serverUrl}/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const blob = await res.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    const mime = res.headers.get('Content-Type') || 'audio/aiff';
                    setAiAudioCache(prev => ({ ...prev, [idx]: { base64, mime } }));
                };
                reader.readAsDataURL(blob);
                const audio = new Audio(URL.createObjectURL(blob));
                activeAudioRef.current = audio;
                audio.play();
            } else {
                speak(s.text, false, 'en', voice, accent);
            }
        } catch (e) {
            speak(s.text, false, 'en', voice, accent);
        }
    };

    const handleToggleFullPlayback = () => {
        if (isPlayingAll) {
            setIsPlayingAll(false);
            stopAllAudio();
        } else {
            stopAllAudio();
            setIsPlaying(false);
            setIsUserTurn(false);
            setIsPlayingAll(true);
            setCurrentIndex(0);
        }
    };

    // Shared logic for generating full audio buffer
    const generateFullAudioBuffer = async () => {
         const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
         const segments: AudioBuffer[] = [];
         let hasContent = false;

         for (let i = 0; i < item.sentences.length; i++) {
             const userRec = userRecordings[i];
             const aiRec = aiAudioCache[i];
             
             const data = userRec || aiRec;
             if (!data) continue; 
             hasContent = true;

             const binaryString = atob(data.base64);
             const bytes = new Uint8Array(binaryString.length);
             for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
             
             try {
                 const decodedBuffer = await audioCtx.decodeAudioData(bytes.buffer);
                 segments.push(decodedBuffer);
             } catch (e) {
                 console.warn(`Failed to decode segment ${i}`, e);
             }
         }

         if (!hasContent || segments.length === 0) return null;

         const totalLength = segments.reduce((sum, buf) => sum + buf.length, 0);
         const combinedBuffer = audioCtx.createBuffer(
             segments[0].numberOfChannels,
             totalLength,
             segments[0].sampleRate
         );

         let offset = 0;
         segments.forEach(buf => {
             for (let channel = 0; channel < buf.numberOfChannels; channel++) {
                 combinedBuffer.getChannelData(channel).set(buf.getChannelData(channel), offset);
             }
             offset += buf.length;
         });
         
         return combinedBuffer;
    };

    const handlePreviewFullAudio = async () => {
        if (isPreviewing) return;
        setIsPreviewing(true);
        stopAllAudio();

        try {
            const buffer = await generateFullAudioBuffer();
            if (!buffer) {
                showToast("No audio segments available to play.", "info");
                setIsPreviewing(false);
                return;
            }

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.onended = () => setIsPreviewing(false);
            source.start(0);

            // Store ref to stop if needed (not activeAudioRef as it's an Audio Element, but close enough concept)
            // Ideally we'd store source node, but simplest is just let it play out or stop via context if implemented.
            // For now, simple play.

        } catch (e) {
            console.error("Preview failed", e);
            showToast("Failed to preview audio.", "error");
            setIsPreviewing(false);
        }
    };

    const handleSaveAll = async () => {
        if (isSavingAll) return;
        setIsSavingAll(true);
        showToast("Generating full audio file...", "info");

        try {
            const combinedBuffer = await generateFullAudioBuffer();
            
            if (!combinedBuffer) {
                showToast("No audio segments available to save.", "info");
                setIsSavingAll(false);
                return;
            }

            const wavBlob = bufferToWav(combinedBuffer);
            const url = URL.createObjectURL(wavBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Full_Dialogue_${item.title.replace(/\s+/g, '_')}.wav`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast("Audio file saved!", "success");
        } catch (e) {
            console.error("Save All failed", e);
            showToast("Error generating audio file.", "error");
        } finally {
            setIsSavingAll(false);
        }
    };

    const hasAnyRecordings = Object.keys(userRecordings).length > 0 || Object.keys(aiAudioCache).length > 0;

    // Filter list to only show current sentence when practicing if focus mode is on
    const visibleSentences = isFocusMode 
        ? [sentences[currentIndex]] 
        : sentences;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh] overflow-hidden">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center shrink-0 bg-white z-10">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-black text-neutral-900 tracking-tight leading-none">{item.title}</h3>
                        <div className="flex items-center gap-3">
                             <div className="flex items-center gap-1 text-[9px] font-black uppercase text-neutral-400">
                                <UserCircle size={10}/> Role Play:
                             </div>
                             <div className="flex bg-neutral-100 p-0.5 rounded-lg">
                                <button onClick={() => requestRoleChange(null)} className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${!actingAs && !isPlayingAll ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>Spectator</button>
                                {item.speakers.map(s => (
                                    <button key={s.name} onClick={() => requestRoleChange(s.name)} className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${actingAs === s.name ? 'bg-indigo-600 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>Act as {s.name}</button>
                                ))}
                             </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex bg-neutral-100 p-1 rounded-xl gap-1">
                            <button onClick={handleToggleFullPlayback} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${isPlayingAll ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-900'}`} title="Play whole conversation non-stop">
                                <Headphones size={14} /> 
                                {isPlayingAll ? 'Stop' : 'Play All'}
                            </button>
                            {!isPlayingAll && (
                                <>
                                    <button onClick={() => { stopAllAudio(); setIsPlaying(true); setIsPlayingAll(false); }} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${isPlaying ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-700'}`}><Play size={14} fill="currentColor"/> Play</button>
                                    <button onClick={() => { setIsPlaying(false); stopAllAudio(); }} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${!isPlaying ? 'bg-neutral-900 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-900'}`}><Pause size={14} fill="currentColor"/> Pause</button>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={handleClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                    </div>
                </header>

                <div className="bg-neutral-50/50 py-6 px-8 border-b border-neutral-100 shrink-0">
                    <div className="flex justify-center items-end gap-10 md:gap-20">
                        {item.speakers.map((s, idx) => {
                            const isTalking = activeSentence.speakerName === s.name;
                            const isUser = actingAs === s.name;
                            return (
                                <div key={idx} className="flex flex-col items-center relative group">
                                    {isTalking && (
                                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-3 py-1.5 rounded-xl text-lg animate-bounce shadow-xl whitespace-nowrap z-20">
                                            {activeSentence.icon || '💬'}
                                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 rotate-45"></div>
                                        </div>
                                    )}
                                    
                                    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-3xl md:text-4xl transition-all duration-300 ${isTalking ? 'bg-white scale-110 shadow-2xl ring-4 ring-indigo-500/20' : 'bg-neutral-200/50 grayscale opacity-40'} ${isUser ? 'border-2 border-indigo-500' : ''}`}>
                                        {s.sex === 'male' ? '👨' : '👩'}
                                    </div>
                                    <div className={`mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors ${isTalking ? 'bg-neutral-900 text-white' : 'text-neutral-400 bg-neutral-100'} ${isUser ? 'ring-1 ring-indigo-500' : ''}`}>
                                        {isUser ? 'YOU' : s.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                {/* TOOLBAR: Mode & Navigation */}
                <div className="px-6 py-2 bg-white border-b border-neutral-100 flex items-center justify-between">
                    {/* Display Mode Toggle */}
                    <div className="flex bg-neutral-100 p-1 rounded-lg gap-1">
                        <button 
                            onClick={() => setIsFocusMode(true)} 
                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5 transition-all ${isFocusMode ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                            title="Show current turn only"
                        >
                            <TargetIcon size={12} /> Focus
                        </button>
                        <button 
                            onClick={() => setIsFocusMode(false)} 
                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5 transition-all ${!isFocusMode ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}
                            title="Show full script"
                        >
                            <LayoutGrid size={12} /> Script
                        </button>
                    </div>

                    {/* Manual Navigation - Only visible in Focus Mode */}
                    {isFocusMode && (
                        <div className="flex items-center gap-1 bg-neutral-50 p-1 rounded-lg border border-neutral-100 animate-in fade-in slide-in-from-right-2">
                             <button onClick={handleNavFirst} disabled={currentIndex === 0 || isUserTurn} className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all rounded hover:bg-white"><ChevronsLeft size={16}/></button>
                             <div className="w-px h-4 bg-neutral-200"></div>
                             <button onClick={handleNavPrev} disabled={currentIndex === 0 || isUserTurn} className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all rounded hover:bg-white"><ChevronLeft size={16}/></button>
                             <button onClick={handleNavNext} disabled={currentIndex === sentences.length - 1 || isUserTurn} className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all rounded hover:bg-white"><ChevronRight size={16}/></button>
                        </div>
                    )}
                </div>

                <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 custom-scrollbar bg-white scroll-smooth pb-32">
                    {visibleSentences.map((s, i) => {
                        const actualIndex = isFocusMode ? currentIndex : i;
                        const isCurrent = isFocusMode ? true : i === currentIndex;
                        const isUserRole = actingAs === s.speakerName;
                        const sp = item.speakers.find(src => src.name === s.speakerName);
                        const isMale = sp?.sex === 'male';
                        const hasUserRecording = userRecordings[actualIndex] !== undefined;

                        const needsToAct = isUserTurn && actualIndex === currentIndex;

                        return (
                            <div 
                                key={`${actualIndex}-${i}`} 
                                ref={el => { if (isCurrent) itemRefs.current[actualIndex] = el; }}
                                onClick={() => { if (!isPlaying && !isPlayingAll && !isUserTurn && !isFocusMode) { setCurrentIndex(i); stopAllAudio(); } }} 
                                className={`flex items-start gap-4 p-4 rounded-[2rem] transition-all border-2 ${isCurrent ? 'bg-indigo-50/30 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-neutral-50'} ${isPlaying || isPlayingAll || isUserTurn || isFocusMode ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center text-xl shadow-sm ${isMale ? 'bg-blue-100' : 'bg-pink-100'} ${isCurrent ? 'scale-110 ring-2 ring-white' : ''}`}>
                                    {isUserRole ? '🌟' : (s.icon || (isMale ? '👨' : '👩'))}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isCurrent ? 'text-indigo-600' : 'text-neutral-400'}`}>
                                            {isUserRole ? `YOU (as ${s.speakerName})` : s.speakerName}
                                        </span>
                                        
                                        <div className="flex items-center gap-1">
                                            {hasUserRecording && (
                                                <button onClick={(e) => { e.stopPropagation(); handlePlayUserAudio(actualIndex); }} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all" title="Listen back to your attempt">
                                                    <Mic size={14}/>
                                                </button>
                                            )}

                                            {isCurrent && !isPlaying && !isPlayingAll && !isUserTurn && (
                                                <div className="flex items-center gap-2 animate-in fade-in zoom-in-95">
                                                    <button onClick={(e) => { e.stopPropagation(); handleSpeakAiSentence(s, actualIndex); }} className="p-2 bg-neutral-900 text-white rounded-xl hover:scale-105 transition-transform"><Volume2 size={14}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setMimicTarget(s.text); }} className="p-2 bg-rose-500 text-white rounded-xl hover:scale-105 transition-transform"><Mic size={14}/></button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <p className={`text-sm md:text-lg leading-relaxed font-bold transition-colors ${isCurrent ? 'text-neutral-900' : 'text-neutral-500'}`}>
                                        {s.text}
                                    </p>

                                    {needsToAct && (
                                        <div className="mt-4 p-6 bg-white border-2 border-indigo-500 rounded-[2rem] shadow-xl animate-in zoom-in-95 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-indigo-600">
                                                    <Languages size={18}/>
                                                    <span className="text-xs font-black uppercase tracking-widest">Your Turn to Speak</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleSpeakAiSentence(s, actualIndex)} className="p-2 bg-neutral-100 text-neutral-600 rounded-lg hover:text-neutral-900 transition-all" title="Listen to Model">
                                                        <Volume2 size={16}/>
                                                    </button>
                                                    {isListeningForStt && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span>}
                                                </div>
                                            </div>

                                            <div className="min-h-[60px] p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex flex-col items-center justify-center text-center">
                                                {userTranscript ? (
                                                    <p className="text-sm font-medium italic text-neutral-800 leading-relaxed">"{userTranscript}"</p>
                                                ) : (
                                                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Tap mic and read the sentence aloud</p>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-center gap-4">
                                                <button 
                                                    onClick={handleToggleRecording} 
                                                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all transform active:scale-90 ${isRecordingUser ? 'bg-red-500 text-white animate-pulse ring-8 ring-red-100' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
                                                >
                                                    {isRecordingUser ? <SquareIcon size={24} fill="white" /> : <Mic size={24} />}
                                                </button>
                                                
                                                {userAudioUrl && (
                                                    <button onClick={() => handlePlayUserAudio()} className="p-4 bg-white border border-neutral-200 text-neutral-600 rounded-2xl hover:text-indigo-600 hover:border-indigo-300 transition-all">
                                                        <Play size={20} fill="currentColor"/>
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={handleConfirmUserTurn} 
                                                    disabled={isRecordingUser}
                                                    className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                                                >
                                                    Confirm & Continue
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </main>
                
                <footer className="px-8 py-6 border-t border-neutral-100 bg-white/80 backdrop-blur-md flex justify-between items-center shrink-0 absolute bottom-0 left-0 right-0 z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={handleNavPrev} disabled={currentIndex === 0 || isUserTurn} className="p-3 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all"><ChevronLeft size={20}/></button>
                        <div className="flex flex-col items-center min-w-[80px]">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-1">Sentence</span>
                            <span className="text-sm font-black text-neutral-900">{currentIndex + 1} / {sentences.length}</span>
                        </div>
                        <button onClick={handleNavNext} disabled={currentIndex === sentences.length - 1 || isUserTurn} className="p-3 rounded-xl border border-neutral-200 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-all"><ChevronRight size={20}/></button>
                    </div>

                    <div className="flex items-center gap-3">
                         {isPlayingAll ? (
                             <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-2xl shadow-lg animate-in fade-in">
                                <Headphones size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Full Playback Mode</span>
                             </div>
                         ) : isUserTurn ? (
                             <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in slide-in-from-right-2">
                                <Sparkles size={14} className="text-indigo-600" />
                                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Waiting for User</span>
                             </div>
                         ) : !isPlaying && (
                             <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-neutral-50 rounded-2xl border border-indigo-100 animate-in fade-in">
                                <Info size={14} className="text-neutral-400" />
                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Manual Mode Active</span>
                             </div>
                         )}
                         
                         <button 
                             onClick={handlePreviewFullAudio}
                             disabled={isPreviewing || !hasAnyRecordings}
                             className={`px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50 ${isPreviewing ? 'bg-amber-100 text-amber-700' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                             title="Listen to full audio without downloading"
                         >
                             {isPreviewing ? <Loader2 size={14} className="animate-spin" /> : <Ear size={14}/>}
                             <span className="hidden sm:inline">{isPreviewing ? 'Playing...' : 'Listen Full'}</span>
                         </button>

                         <button 
                            onClick={handleSaveAll}
                            disabled={isSavingAll || !hasAnyRecordings}
                            className="px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            title="Save all audio (User & AI) to one file"
                         >
                            {isSavingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14}/>}
                            <span className="hidden sm:inline">Save All</span>
                         </button>

                         <button onClick={handleClose} className="px-8 py-3 bg-neutral-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg active:scale-95">Finish Session</button>
                    </div>
                </footer>
            </div>
            {mimicTarget && <SimpleMimicModal target={mimicTarget} onClose={() => setMimicTarget(null)} />}
            
            <ConfirmationModal
                 isOpen={!!roleChangeCandidate}
                 title="Switch Role?"
                 message="Changing roles will reset your current practice progress. Recordings will be lost."
                 confirmText="Switch & Reset"
                 isProcessing={false}
                 onConfirm={() => confirmRoleChange(roleChangeCandidate)}
                 onClose={() => setRoleChangeCandidate(null)}
            />
        </div>
    );
};

const SpeakingCardItem: React.FC<{ 
    item: NativeSpeakItem; 
    viewSettings: any; 
    onEdit: () => void;
    onDelete: () => void;
    onFocusChange: (item: NativeSpeakItem, color: FocusColor | null) => void;
    onToggleFocus: () => void;
    onPractice: (item: NativeSpeakItem) => void;
}> = ({ item, viewSettings, onEdit, onDelete, onFocusChange, onToggleFocus, onPractice }) => {
    return (
        <UniversalCard
            title={<div className="flex items-center gap-2 font-black text-neutral-900">{item.standard}</div>}
            badge={{ label: 'Native Expression', colorClass: 'bg-teal-50 text-teal-700 border-teal-100', icon: AudioLines }}
            tags={viewSettings.showTags ? item.tags : undefined}
            compact={viewSettings.compact}
            onClick={() => onPractice(item)}
            focusColor={item.focusColor}
            onFocusChange={(c) => onFocusChange(item, c)}
            isFocused={item.isFocused}
            onToggleFocus={onToggleFocus}
            isCompleted={item.focusColor === 'green'}
            actions={
                <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"><Edit3 size={14}/></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14}/></button>
                </div>
            }
        >
            <div className="space-y-2 mt-2">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{item.answers.length} variations</div>
                <div className="flex justify-end">
                    <button onClick={(e) => { e.stopPropagation(); onPractice(item); }} className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg active:scale-95">
                        <Play size={14} fill="currentColor"/> Practice
                    </button>
                </div>
            </div>
        </UniversalCard>
    );
};

export const SpeakingCardPage: React.FC<Props> = ({ user, onNavigate }) => {
  const [items, setItems] = useState<SpeakingItem[]>([]);
  const [speakingBooks, setSpeakingBooks] = useState<SpeakingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [viewSettings, setViewSettings] = useState(() => getStoredJSON(VIEW_SETTINGS_KEY, { showTags: true, compact: false, resourceType: 'ALL' }));
  const handleSettingChange = (key: string, value: any) => setViewSettings(prev => ({ ...prev, [key]: value }));
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [focusFilter, setFocusFilter] = useState<'all' | 'focused'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  
  const [viewMode, setViewMode] = useState<'LIST' | 'SHELF' | 'BOOK_DETAIL'>('LIST');
  const [activeBook, setActiveBook] = useState<SpeakingBook | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NativeSpeakItem | null>(null);
  const [editingConversation, setEditingConversation] = useState<ConversationItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'card' | 'conversation' } | null>(null);
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isConversationAiModalOpen, setIsConversationAiModalOpen] = useState(false);
  const [itemToRefine, setItemToRefine] = useState<Partial<NativeSpeakItem> | null>(null);
  const { showToast } = useToast();
  
  const [practiceModalItem, setPracticeModalItem] = useState<NativeSpeakItem | null>(null);
  const [practiceConversation, setPracticeConversation] = useState<ConversationItem | null>(null);
  
  const { currentShelfName, booksOnCurrentShelf, allShelves, addShelf, renameShelf, removeShelf, nextShelf, prevShelf, selectShelf } = useShelfLogic(speakingBooks, 'speaking_books_shelves');
  const [isAddShelfModalOpen, setIsAddShelfModalOpen] = useState(false);
  const [isRenameShelfModalOpen, setIsRenameShelfModalOpen] = useState(false);
  const [bookToMove, setBookToMove] = useState<SpeakingBook | null>(null);
  const [bookToDelete, setBookToDelete] = useState<SpeakingBook | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [cards, conversations, books] = await Promise.all([ db.getNativeSpeakItemsByUserId(user.id), db.getConversationItemsByUserId(user.id), db.getSpeakingBooksByUserId(user.id) ]);
    const combined: SpeakingItem[] = [ ...cards.map(c => ({ type: 'card' as const, data: c })), ...conversations.map(c => ({ type: 'conversation' as const, data: c })) ];
    // Fixed: Corrected sorting logic b.data instead of b.date.
    setItems(combined.sort((a, b) => b.data.createdAt - a.data.createdAt));
    setSpeakingBooks(books.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user.id]);
  useEffect(() => { setPage(0); }, [selectedTag, pageSize, focusFilter, colorFilter, viewSettings.resourceType]);
  useEffect(() => { setStoredJSON(VIEW_SETTINGS_KEY, viewSettings); }, [viewSettings]);

  const hasActiveFilters = useMemo(() => {
    return viewSettings.resourceType !== 'ALL' || focusFilter !== 'all' || colorFilter !== 'all';
  }, [viewSettings.resourceType, focusFilter, colorFilter]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (viewSettings.resourceType !== 'ALL' && item.type.toUpperCase() !== viewSettings.resourceType) return false;
      if (focusFilter === 'focused' && !item.data.isFocused) return false;
      if (colorFilter !== 'all' && item.data.focusColor !== colorFilter) return false;
      if (selectedTag) {
          if (selectedTag === 'Uncategorized') { if (item.data.path && item.data.path !== '/') return false; } 
          else { if (!item.data.path?.startsWith(selectedTag) && !item.data.tags?.includes(selectedTag)) return false; }
      }
      return true;
    });
  }, [items, selectedTag, focusFilter, colorFilter, viewSettings.resourceType]);
  
  const pagedItems = useMemo(() => { const start = page * pageSize; return filteredItems.slice(start, start + pageSize); }, [filteredItems, page, pageSize]);

  const handleSaveItem = async (data: any) => {
    const now = Date.now();
    if (editingItem && editingItem.id) { 
        await dataStore.saveNativeSpeakItem({ ...editingItem, ...data, updatedAt: now }); 
    } else { 
        await dataStore.saveNativeSpeakItem({ id: `ns-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, ...data }); 
    }
    setIsModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleSaveConversation = async (formData: Partial<ConversationItem>) => {
    const now = Date.now();
    if (editingConversation && editingConversation.id) { 
        await dataStore.saveConversationItem({ ...editingConversation, ...formData, updatedAt: now } as ConversationItem); 
    } else { 
        await dataStore.saveConversationItem({ id: `conv-${now}-${Math.random()}`, userId: user.id, createdAt: now, updatedAt: now, title: formData.title || '', description: formData.description || '', speakers: formData.speakers || [], sentences: formData.sentences || [], tags: formData.tags || [] } as ConversationItem); 
    }
    setIsConversationModalOpen(false); loadData(); showToast("Saved!", "success");
  };

  const handleEditItem = (item: SpeakingItem) => {
    if (item.type === 'card') { setEditingItem(item.data as NativeSpeakItem); setIsModalOpen(true); } 
    else { setEditingConversation(item.data as ConversationItem); setIsConversationModalOpen(true); }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'card') await dataStore.deleteNativeSpeakItem(itemToDelete.id);
    else await dataStore.deleteConversationItem(itemToDelete.id);
    setItemToDelete(null); loadData(); showToast("Deleted!", "success");
  };

  const handleFocusChange = async (item: SpeakingItem, color: FocusColor | null) => {
      const updated = { ...item.data, focusColor: color || undefined, updatedAt: Date.now() };
      if (!color) delete (updated as any).focusColor;
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else await dataStore.saveConversationItem(updated as ConversationItem);
      loadData();
  };
  
  const handleToggleFocus = async (item: SpeakingItem) => {
      const updated = { ...item.data, isFocused: !item.data.isFocused, updatedAt: Date.now() };
      if (item.type === 'card') await dataStore.saveNativeSpeakItem(updated as NativeSpeakItem);
      else await dataStore.saveConversationItem(updated as ConversationItem);
      loadData();
  };

  const handleConversationAiResult = (data: any) => {
      setEditingConversation(prev => ({ ...prev || {}, title: data.title, description: data.description, speakers: data.speakers, sentences: data.sentences, tags: data.tags } as ConversationItem));
      setIsConversationAiModalOpen(false); showToast("Conversation generated!", "success");
  };

  // --- Shelf Navigation ---
  const handleNavigateShelf = (name: string) => { selectShelf(name); setViewMode('SHELF'); };
  const handleNavigateBook = (book: SpeakingBook) => { setActiveBook(book); setViewMode('BOOK_DETAIL'); };
  const handleCreateEmptyBook = async () => {
    const nb: SpeakingBook = { id: `sb-${Date.now()}`, userId: user.id, title: `${currentShelfName}: New Book`, itemIds: [], createdAt: Date.now(), updatedAt: Date.now(), color: '#d81b60', icon: '🗣️' };
    await dataStore.saveSpeakingBook(nb); await loadData(); setActiveBook(nb); setViewMode('BOOK_DETAIL');
  };

  const handleRenameShelfAction = (newName: string) => {
      const success = renameShelf(newName, async (oldS, nS) => {
          setLoading(true);
          const booksToUpdate = speakingBooks.filter(b => {
               const parts = b.title.split(':');
               const shelf = parts.length > 1 ? parts[0].trim() : 'General';
               return shelf === oldS;
          });

          await Promise.all(booksToUpdate.map(b => {
               const parts = b.title.split(':');
               const bookTitle = parts.length > 1 ? parts.slice(1).join(':').trim() : parts[0];
               const newFullTitle = `${nS}: ${bookTitle}`;
               return db.saveSpeakingBook({ ...b, title: newFullTitle, updatedAt: Date.now() });
          }));
          await loadData();
      });
      if (success) setIsRenameShelfModalOpen(false);
  };

  if (viewMode === 'BOOK_DETAIL' && activeBook) {
      const itemsMap = new Map(items.map(i => [i.data.id, i]));
      const gItems = activeBook.itemIds.map(id => {
          const item = itemsMap.get(id); if (!item) return null;
          return { id, title: item.type === 'card' ? (item.data as NativeSpeakItem).standard : (item.data as ConversationItem).title, subtitle: item.type === 'card' ? 'Expression' : 'Conversation', data: item, focusColor: item.data.focusColor, isFocused: item.data.isFocused } as GenericBookItem;
      }).filter((x): x is GenericBookItem => x !== null);
      // Fixed: item -> i in mapping title.
      const avItems = items.map(i => ({ id: i.data.id, title: i.type === 'card' ? (i.data as NativeSpeakItem).standard : (i.data as ConversationItem).title, subtitle: i.type === 'card' ? 'Expression' : 'Conversation', data: i } as GenericBookItem));

      return <GenericBookDetail book={activeBook} items={gItems} availableItems={avItems} onBack={() => { setActiveBook(null); setViewMode('SHELF'); loadData(); }} onUpdateBook={async (u) => { const nb = { ...activeBook, ...u }; await dataStore.saveSpeakingBook(nb); setActiveBook(nb); }} onAddItem={async (ids) => { const nb = { ...activeBook, itemIds: Array.from(new Set([...activeBook.itemIds, ...ids])) }; await dataStore.saveSpeakingBook(nb); setActiveBook(nb); }} onRemoveItem={async (id) => { const nb = { ...activeBook, itemIds: activeBook.itemIds.filter(x => x !== id) }; await dataStore.saveSpeakingBook(nb); setActiveBook(nb); }} onOpenItem={(g) => { const si = g.data as SpeakingItem; if (si.type === 'card') setPracticeModalItem(si.data); else setPracticeConversation(si.data); }} onEditItem={(g) => handleEditItem(g.data as SpeakingItem)} onFocusChange={(g, c) => handleFocusChange(g.data as SpeakingItem, c)} onToggleFocus={(g) => handleToggleFocus(g.data as SpeakingItem)} itemIcon={<Mic size={16}/>} />;
  }

  if (viewMode === 'SHELF') {
      return (
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="flex flex-col gap-4">
               <button onClick={() => setViewMode('LIST')} className="w-fit flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors group"><ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /><span>Back to Main Library</span></button>
               <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><div className="shrink-0"><h2 className="text-3xl font-black text-neutral-900 tracking-tight">Speaking Shelf</h2><p className="text-neutral-500 mt-1 font-medium">Organize your speaking topics.</p></div><ShelfSearchBar shelves={allShelves} books={speakingBooks} onNavigateShelf={handleNavigateShelf} onNavigateBook={handleNavigateBook} /><button onClick={() => setIsAddShelfModalOpen(true)} className="px-6 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm"><FolderPlus size={14}/> Add Shelf</button></header>
           </div>
          <UniversalShelf label={currentShelfName} onNext={allShelves.length > 1 ? nextShelf : undefined} onPrev={allShelves.length > 1 ? prevShelf : undefined} actions={<div className="flex items-center gap-2"><button onClick={() => setIsRenameShelfModalOpen(true)} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white" title="Rename Shelf"><Pen size={14}/></button><button onClick={removeShelf} disabled={booksOnCurrentShelf.length > 0} className="p-2 bg-white/20 text-white/70 rounded-full hover:bg-white/40 hover:text-white disabled:opacity-30 disabled:hover:bg-white/20" title="Remove Empty Shelf"><Trash2 size={14}/></button></div>} isEmpty={booksOnCurrentShelf.length === 0} emptyAction={<button onClick={handleCreateEmptyBook} className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-widest border border-white/20">Create First Book</button>} >
             {booksOnCurrentShelf.map(book => {
                 const displayTitle = book.title.split(':').pop()?.trim() || book.title;
                 return <UniversalBook key={book.id} id={book.id} title={displayTitle} subTitle={`${book.itemIds.length} Items`} icon={<Mic size={24}/>} color={book.color} titleColor={book.titleColor} titleSize={book.titleSize} titleTop={book.titleTop} titleLeft={book.titleLeft} iconTop={book.iconTop} iconLeft={book.iconLeft} onClick={() => { setActiveBook(book); setViewMode('BOOK_DETAIL'); }} actions={<><button onClick={(e) => { e.stopPropagation(); setBookToMove(book); }} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-neutral-700 hover:text-white transition-all shadow-sm" title="Move to Shelf"><Move size={16}/></button><button onClick={(e) => { e.stopPropagation(); setBookToDelete(book); }} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Delete"><Trash2 size={16}/></button></>} />;
             })}
             <div className="group translate-y-0"><div className="relative w-full aspect-[5/7] rounded-lg bg-neutral-800/50 border-2 border-dashed border-neutral-500/50 transition-all duration-300 group-hover:border-neutral-400 group-hover:bg-neutral-800/80 group-hover:shadow-xl flex flex-col items-stretch justify-center overflow-hidden"><button onClick={handleCreateEmptyBook} className="flex-1 flex flex-col items-center justify-center p-2 text-center text-neutral-400 hover:bg-white/5 transition-colors"><Plus size={32} className="mb-2 text-neutral-500"/><h3 className="font-sans text-xs font-black uppercase tracking-wider">New Book</h3></button></div></div>
          </UniversalShelf>
          <ConfirmationModal isOpen={!!bookToDelete} title="Delete Book?" message={<>Are you sure you want to delete <strong>"{bookToDelete?.title.split(':').pop()?.trim()}"</strong>? Items inside will not be deleted.</>} confirmText="Delete" isProcessing={false} onConfirm={async () => { if (bookToDelete) await dataStore.deleteSpeakingBook(bookToDelete.id); setBookToDelete(null); loadData(); }} onClose={() => setBookToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
          {/* Fixed: Replaced 'topic' with 'title' to match SpeakingBook type. */}
          <MoveBookModal isOpen={!!bookToMove} onClose={() => setBookToMove(null)} onConfirm={async (s) => { if (bookToMove) { const nb = { ...bookToMove, title: `${s}: ${bookToMove.title.split(':').pop()?.trim()}` }; await dataStore.saveSpeakingBook(nb); setBookToMove(null); loadData(); } }} shelves={allShelves} currentShelf={bookToMove ? (bookToMove.title.split(':')[0].trim()) : 'General'} bookTitle={bookToMove?.title || ''} />
          <AddShelfModal isOpen={isAddShelfModalOpen} onClose={() => setIsAddShelfModalOpen(false)} onSave={(name) => { if(addShelf(name)) setIsAddShelfModalOpen(false); }} />
          <RenameShelfModal isOpen={isRenameShelfModalOpen} onClose={() => setIsRenameShelfModalOpen(false)} onSave={handleRenameShelfAction} initialName={currentShelfName} />
        </div>
      );
  }

  return (
    <>
    <ResourcePage title="Speaking Library" subtitle="Master natural phrases." icon={<img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Microphone.png" className="w-8 h-8 object-contain" alt="Speaking" />} centerContent={<ShelfSearchBar shelves={allShelves} books={speakingBooks} onNavigateShelf={handleNavigateShelf} onNavigateBook={handleNavigateBook} />} config={{}} isLoading={loading || isProcessing} isEmpty={filteredItems.length === 0} emptyMessage="No items found." activeFilters={{}} onFilterChange={() => {}} pagination={{ page, totalPages: Math.ceil(filteredItems.length / pageSize), onPageChange: setPage, pageSize, onPageSizeChange: setPageSize, totalItems: filteredItems.length }} aboveGrid={<>{isTagBrowserOpen && <TagBrowser items={items.map(i => i.data)} selectedTag={selectedTag} onSelectTag={setSelectedTag} forcedView="tags" title="Browse Tags" icon={<Tag size={16}/>} />}</>} minorSkills={<button onClick={() => onNavigate?.('MIMIC')} className="flex items-center gap-2 px-3 py-2 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-bold hover:bg-neutral-200 transition-colors"><Mic size={16} /><span className="hidden sm:inline">Pronunciation</span></button>} actions={<ResourceActions viewMenu={<ViewMenu isOpen={isViewMenuOpen} setIsOpen={setIsViewMenuOpen} hasActiveFilters={hasActiveFilters} filterOptions={[{ label: 'All', value: 'ALL', isActive: viewSettings.resourceType === 'ALL', onClick: () => handleSettingChange('resourceType', 'ALL') }, { label: 'Card', value: 'CARD', isActive: viewSettings.resourceType === 'CARD', onClick: () => handleSettingChange('resourceType', 'CARD') }, { label: 'Conv.', value: 'CONVERSATION', isActive: viewSettings.resourceType === 'CONVERSATION', onClick: () => handleSettingChange('resourceType', 'CONVERSATION') }]} customSection={<><div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 flex items-center gap-2"><Target size={10}/> Focus & Status</div><div className="p-1 flex flex-col gap-1 bg-neutral-100 rounded-xl mb-2"><button onClick={() => setFocusFilter(focusFilter === 'all' ? 'focused' : 'all')} className={`w-full py-1.5 text-[9px] font-black rounded-lg transition-all ${focusFilter === 'focused' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}>{focusFilter === 'focused' ? 'Focused Only' : 'All Items'}</button><div className="flex gap-1"><button onClick={() => setColorFilter(colorFilter === 'green' ? 'all' : 'green')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'green' ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-neutral-200 hover:bg-emerald-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'yellow' ? 'all' : 'yellow')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'yellow' ? 'bg-amber-400 border-amber-500' : 'bg-white border-neutral-200 hover:bg-amber-50'}`} /><button onClick={() => setColorFilter(colorFilter === 'red' ? 'all' : 'red')} className={`flex-1 h-6 rounded-lg border-2 transition-all ${colorFilter === 'red' ? 'bg-rose-50 border-rose-600' : 'bg-white border-neutral-200 hover:bg-rose-50'}`} /></div></div></>} viewOptions={[{ label: 'Show Tags', checked: viewSettings.showTags, onChange: () => setViewSettings(v => ({...v, showTags: !v.showTags})) }, { label: 'Compact', checked: viewSettings.compact, onChange: () => setViewSettings(v => ({...v, compact: !v.compact})) }]} />} browseTags={{ isOpen: isTagBrowserOpen, onToggle: () => { setIsTagBrowserOpen(!isTagBrowserOpen); } }} addActions={[{ label: 'New Card', icon: Plus, onClick: () => { setEditingItem(null); setIsModalOpen(true); } }, { label: 'New Conversation', icon: MessageSquare, onClick: () => { setEditingConversation(null); setIsConversationModalOpen(true); } }]} extraActions={<><button onClick={() => setItems([...items].sort(() => Math.random() - 0.5))} disabled={items.length < 2} className="p-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm disabled:opacity-50" title="Randomize"><Shuffle size={16} /></button><button onClick={() => setViewMode('SHELF')} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200" title="Bookshelf Mode"><Library size={16} /><span>Bookshelf</span></button></>} />}>
      {() => (
        <>
          {pagedItems.map((item: SpeakingItem) => item.type === 'card' ? (
             <SpeakingCardItem 
                key={item.data.id} 
                item={item.data as NativeSpeakItem} 
                viewSettings={viewSettings} 
                onEdit={() => handleEditItem(item)} 
                onDelete={() => setItemToDelete({ id: item.data.id, type: 'card' })} 
                onFocusChange={(i, c) => handleFocusChange(item, c)} 
                onToggleFocus={() => handleToggleFocus(item)} 
                onPractice={(i) => setPracticeModalItem(i)} 
             /> 
          ) : ( 
             <UniversalCard 
                key={item.data.id} 
                title={(item.data as ConversationItem).title} 
                badge={{ label: 'Conversation', colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: MessageSquare }} 
                tags={viewSettings.showTags ? item.data.tags : undefined} 
                compact={viewSettings.compact} 
                onClick={() => setPracticeConversation(item.data as ConversationItem)} 
                focusColor={item.data.focusColor} 
                onFocusChange={(c) => handleFocusChange(item, c)} 
                isFocused={item.data.isFocused} 
                onToggleFocus={handleToggleFocus.bind(null, item)} 
                actions={<><button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors" title="Edit"><Edit3 size={14}/></button><button onClick={(e) => { e.stopPropagation(); setItemToDelete({ id: item.data.id, type: 'conversation' }); }} className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14}/></button></>} 
             >
                <div className="flex justify-between items-center mt-2">
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(item.data as ConversationItem).sentences.length} lines</div>
                    <button onClick={(e) => { e.stopPropagation(); setPracticeConversation(item.data as ConversationItem); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-indigo-200 active:scale-95"><Play size={14}/> Practice</button>
                </div>
             </UniversalCard> 
          ))}
        </>
      )}
    </ResourcePage>
    
    <AddEditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveItem} initialData={editingItem} />
    <AddEditConversationModal isOpen={isConversationModalOpen} onClose={() => setIsConversationModalOpen(false)} onSave={handleSaveConversation} initialData={editingConversation} onOpenAiGen={() => setIsConversationAiModalOpen(true)} />
    <ConfirmationModal isOpen={!!itemToDelete} title="Delete Item?" message="This action cannot be undone." confirmText="Delete" isProcessing={false} onConfirm={handleConfirmDelete} onClose={() => setItemToDelete(null)} icon={<Trash2 size={40} className="text-red-500"/>} />
    
    {isAiModalOpen && <UniversalAiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} type="REFINE_UNIT" title="Refine Expression" description="Enter instructions for AI refinement." initialData={{}} onGeneratePrompt={(i) => getRefineNativeSpeakPrompt(itemToRefine?.standard || '', i.request)} onJsonReceived={(d) => { if (d.answers) { setEditingItem(prev => ({ ...prev || { id: '', userId: user.id, createdAt: 0, updatedAt: 0, standard: '', answers: [], tags: [], note: '' }, standard: d.standard, answers: d.answers })); setIsAiModalOpen(false); showToast("Refined!", "success"); } }} actionLabel="Apply" />}
    {isConversationAiModalOpen && <UniversalAiModal isOpen={isConversationAiModalOpen} onClose={() => setIsConversationAiModalOpen(false)} type="GENERATE_UNIT" title="AI Conversation Creator" description="Enter a topic to generate a dialogue." initialData={{}} onGeneratePrompt={(i) => getGenerateConversationPrompt(i.request)} onJsonReceived={handleConversationAiResult} actionLabel="Generate" closeOnSuccess={true} />}
    
    <SpeakingPracticeModal isOpen={!!practiceModalItem} onClose={() => setPracticeModalItem(null)} item={practiceModalItem} />
    <ConversationPracticeModal isOpen={!!practiceConversation} onClose={() => setPracticeConversation(null)} item={practiceConversation} />
    </>
  );
};

export default SpeakingCardPage;