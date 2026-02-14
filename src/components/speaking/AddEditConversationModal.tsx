
import React, { useState, useEffect, useMemo } from 'react';
import { ConversationItem, ConversationSpeaker, ConversationSentence } from '../../app/types';
import { X, Sparkles, Plus, Trash2, Users, MessageSquare, Save, ChevronDown } from 'lucide-react';
import { fetchServerVoices, ServerVoicesResponse, speak } from '../../utils/audio';
import { getConfig, getServerUrl } from '../../app/settingsManager';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<ConversationItem>) => void;
    initialData?: ConversationItem | null;
    onOpenAiGen: () => void;
}

export const AddEditConversationModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData, onOpenAiGen }) => {
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
                                            <button type="button" onClick={() => updateSpeaker(i, { sex: 'male' })} className={`flex-1 px-3 py-1 text-[8px] font-black uppercase rounded ${s.sex === 'male' ? 'bg-blue-50 text-white shadow-sm' : 'text-neutral-400'}`}>Male</button>
                                            <button type="button" onClick={() => updateSpeaker(i, { sex: 'female' })} className={`flex-1 px-3 py-1 text-[8px] font-black uppercase rounded ${s.sex === 'female' ? 'bg-pink-50 text-white shadow-sm' : 'text-neutral-400'}`}>Female</button>
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
