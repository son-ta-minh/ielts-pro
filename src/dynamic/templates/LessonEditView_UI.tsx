import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Save, Loader2, Eye, PenLine, Sparkles, BookOpen, Tag, Headphones, BookText, ClipboardList, Zap, Plus, Trash2, ChevronRight, Volume2, Split, X } from 'lucide-react';
import { parseMarkdown } from '../../utils/markdownParser';
import { speak } from '../../utils/audio';
import { IntensityRow, IntensityItem, ComparisonRow, LessonType } from '../../app/types';

interface Props {
  type: LessonType;
  title: string;
  setTitle: (t: string) => void;
  description: string;
  setDescription: (d: string) => void;
  path: string;
  setPath: (p: string) => void;
  tagsInput: string;
  setTagsInput: (t: string) => void;
  content: string;
  setContent: (c: string) => void;
  listeningContent: string;
  setListeningContent: (c: string) => void;
  testContent: string;
  setTestContent: (c: string) => void;
  intensityRows: IntensityRow[];
  setIntensityRows: (rows: IntensityRow[]) => void;
  comparisonRows: ComparisonRow[];
  setComparisonRows: (rows: ComparisonRow[]) => void;
  isSaving: boolean;
  onSave: () => void;
  onPractice: () => void;
  onCancel: () => void;
  onOpenAiRefine: (format?: 'reading' | 'listening' | 'test' | 'intensity' | 'comparison') => void;
}

export const LessonEditViewUI: React.FC<Props> = (props) => {
    const { 
        type, title, setTitle, description, setDescription, tagsInput, setTagsInput, 
        content, setContent, listeningContent, setListeningContent, testContent, setTestContent,
        intensityRows, setIntensityRows,
        comparisonRows, setComparisonRows,
        isSaving, onSave, onPractice, onCancel, onOpenAiRefine 
    } = props;
    
    const [activeTab, setActiveTab] = useState<'READING' | 'LISTENING' | 'TEST' | 'INTENSITY' | 'COMPARISON'>('READING');
    const [isPreview, setIsPreview] = useState(false);

    useEffect(() => {
        if (type === 'intensity') setActiveTab('INTENSITY');
        else if (type === 'comparison') setActiveTab('COMPARISON');
        else setActiveTab('READING');
    }, [type]);

    const previewHtml = useMemo(() => {
        let raw = "";
        if (activeTab === 'READING') raw = content;
        else if (activeTab === 'LISTENING') raw = listeningContent;
        else raw = testContent;
        return parseMarkdown(raw);
    }, [content, listeningContent, testContent, activeTab]);

    useEffect(() => {
        (window as any).handleLessonSpeak = (text: string, lang?: 'en' | 'vi') => {
            speak(text, false, lang);
        };
        return () => { delete (window as any).handleLessonSpeak; };
    }, []);

    // --- Intensity Handlers ---
    const addIntensityRow = () => setIntensityRows([...intensityRows, { softened: [], neutral: [], intensified: [] }]);
    const removeIntensityRow = (idx: number) => setIntensityRows(intensityRows.filter((_, i) => i !== idx));
    const updateIntensityCell = (rowIdx: number, cellType: keyof IntensityRow, value: string) => {
        const newRows = [...intensityRows];
        const items: IntensityItem[] = value.split(/[;,]+/).map(s => {
            const raw = s.trim();
            if (!raw) return null;
            const regMatch = raw.match(/\[(academic|casual)\]$/i);
            const item: IntensityItem = regMatch 
                ? { word: raw.replace(regMatch[0], '').trim(), register: regMatch[1].toLowerCase() as any }
                : { word: raw };
            return item;
        }).filter((x): x is IntensityItem => x !== null);
        newRows[rowIdx][cellType] = items;
        setIntensityRows(newRows);
    };

    const getIntensityCellValue = (items: IntensityItem[]) => {
        return items.map(i => i.register ? `${i.word} [${i.register}]` : i.word).join('; ');
    };

    // --- Comparison Handlers ---
    const addComparisonRow = () => setComparisonRows([...comparisonRows, { word: '', nuance: '', example: '' }]);
    const removeComparisonRow = (idx: number) => setComparisonRows(comparisonRows.filter((_, i) => i !== idx));
    const updateComparisonRow = (idx: number, field: keyof ComparisonRow, value: string) => {
        const newRows = [...comparisonRows];
        newRows[idx] = { ...newRows[idx], [field]: value };
        setComparisonRows(newRows);
    };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button onClick={onCancel} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors mb-1">
            <ArrowLeft size={16} /><span>Back to Lesson Library</span>
          </button>
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Edit Lesson</h2>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onPractice} disabled={isSaving} className="px-5 py-3 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-xs flex items-center space-x-2 active:scale-95 uppercase tracking-widest shadow-sm">
                <BookOpen size={14}/>
                <span>Read Mode</span>
            </button>
            <button onClick={onSave} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>{isSaving ? 'Saving...' : 'Save Lesson'}</span>
            </button>
        </div>
      </header>
      
      <div className="space-y-6 bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Lesson Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 flex items-center gap-1"><Tag size={12}/> Tags (Keywords)</label>
                <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. Grammar, Writing Task 2" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none" />
            </div>
        </div>
        
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                <div className="flex bg-neutral-100 p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar">
                    {type === 'intensity' && (
                        <button onClick={() => { setActiveTab('INTENSITY'); setIsPreview(false); }} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all shrink-0 ${activeTab === 'INTENSITY' ? 'bg-white text-orange-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}><Zap size={12} className="inline mr-1"/> Intensity</button>
                    )}
                    {type === 'comparison' && (
                        <button onClick={() => { setActiveTab('COMPARISON'); setIsPreview(false); }} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all shrink-0 ${activeTab === 'COMPARISON' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}><Split size={12} className="inline mr-1"/> Contrast</button>
                    )}
                    <button onClick={() => { setActiveTab('READING'); setIsPreview(false); }} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all shrink-0 ${activeTab === 'READING' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}><BookText size={12} className="inline mr-1"/> Reading</button>
                    <button onClick={() => { setActiveTab('LISTENING'); setIsPreview(false); }} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all shrink-0 ${activeTab === 'LISTENING' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}><Headphones size={12} className="inline mr-1"/> Listening</button>
                    <button onClick={() => { setActiveTab('TEST'); setIsPreview(false); }} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all shrink-0 ${activeTab === 'TEST' ? 'bg-white text-emerald-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}><ClipboardList size={12} className="inline mr-1"/> Test</button>
                </div>
                <div className="flex items-center gap-2">
                    {activeTab === 'INTENSITY' && (
                        <button onClick={() => onOpenAiRefine('intensity')} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-100 hover:bg-orange-100 transition-all text-[10px] font-black uppercase text-orange-600 shadow-sm"><Sparkles size={12}/><span>AI Refine</span></button>
                    )}
                    {activeTab === 'COMPARISON' && (
                        <button onClick={() => onOpenAiRefine('comparison')} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-all text-[10px] font-black uppercase text-indigo-600 shadow-sm"><Sparkles size={12}/><span>AI Refine</span></button>
                    )}
                    {(activeTab === 'READING' || activeTab === 'LISTENING' || activeTab === 'TEST') && (
                        <>
                            <button onClick={() => onOpenAiRefine(activeTab === 'READING' ? 'reading' : activeTab === 'LISTENING' ? 'listening' : 'test')} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-all text-[10px] font-black uppercase text-indigo-600 shadow-sm"><Sparkles size={12}/><span>AI Generate</span></button>
                            <button onClick={() => setIsPreview(!isPreview)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 transition-all text-[10px] font-black uppercase text-neutral-500 hover:text-neutral-900 shadow-sm">{isPreview ? <PenLine size={12}/> : <Eye size={12}/>}<span>{isPreview ? 'Edit' : 'Preview'}</span></button>
                        </>
                    )}
                </div>
            </div>
            
            <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm h-[550px] relative overflow-hidden">
                {activeTab === 'INTENSITY' ? (
                    <div className="absolute inset-0 p-6 overflow-y-auto space-y-4 bg-neutral-50/30 no-scrollbar">
                        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Edit Intensity Rows</h4>
                            <p className="text-[10px] text-neutral-500 italic">Separate multiple words with semicolons. Use [academic] or [casual] tags for register.</p>
                        </div>
                        <div className="space-y-4">
                            {intensityRows.map((row, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-[2rem] border border-neutral-200 shadow-sm grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,auto] gap-4 items-start animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-blue-500 uppercase tracking-wider pl-1">Softened</label>
                                        <textarea value={getIntensityCellValue(row.softened)} onChange={e => updateIntensityCell(idx, 'softened', e.target.value)} rows={2} className="w-full p-2 bg-neutral-50 border border-neutral-100 rounded-xl text-xs font-bold focus:bg-white outline-none resize-none" placeholder="chilly; cool..." />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-wider pl-1">Neutral</label>
                                        <textarea value={getIntensityCellValue(row.neutral)} onChange={e => updateIntensityCell(idx, 'neutral', e.target.value)} rows={2} className="w-full p-2 bg-neutral-50 border border-neutral-100 rounded-xl text-xs font-bold focus:bg-white outline-none resize-none" placeholder="hot; warm..." />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-orange-500 uppercase tracking-wider pl-1">Intensified</label>
                                        <textarea value={getIntensityCellValue(row.intensified)} onChange={e => updateIntensityCell(idx, 'intensified', e.target.value)} rows={2} className="w-full p-2 bg-neutral-50 border border-neutral-100 rounded-xl text-xs font-bold focus:bg-white outline-none resize-none" placeholder="scorching; boiling..." />
                                    </div>
                                    <button onClick={() => removeIntensityRow(idx)} className="p-2 text-neutral-300 hover:text-red-500 mt-5"><Trash2 size={16}/></button>
                                </div>
                            ))}
                            <button onClick={addIntensityRow} className="w-full py-4 border-2 border-dashed border-neutral-200 rounded-[2rem] text-neutral-400 font-black text-xs uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"><Plus size={16}/> Add Scale Row</button>
                        </div>
                    </div>
                ) : activeTab === 'COMPARISON' ? (
                    <div className="absolute inset-0 p-6 overflow-y-auto space-y-4 bg-neutral-50/30 no-scrollbar">
                        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm space-y-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Edit Contrast Pairs</h4>
                            <p className="text-[10px] text-neutral-500 italic">Break down confusing word pairs with clear nuances and examples.</p>
                        </div>
                        <div className="space-y-4">
                            {comparisonRows.map((row, idx) => (
                                <div key={idx} className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 relative group">
                                    <button onClick={() => removeComparisonRow(idx)} className="absolute top-4 right-4 p-2 text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1 md:col-span-1">
                                            <label className="text-[9px] font-black text-indigo-500 uppercase tracking-wider pl-1">Target Word</label>
                                            <input value={row.word} onChange={e => updateComparisonRow(idx, 'word', e.target.value)} className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-100 rounded-xl text-sm font-black focus:bg-white outline-none" placeholder="e.g. Damage" />
                                        </div>
                                        <div className="space-y-1 md:col-span-2">
                                            <label className="text-[9px] font-black text-neutral-400 uppercase tracking-wider pl-1">Usage & Nuance</label>
                                            <input value={row.nuance} onChange={e => updateComparisonRow(idx, 'nuance', e.target.value)} className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-100 rounded-xl text-sm font-medium focus:bg-white outline-none italic" placeholder="When and why to use this..." />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-neutral-400 uppercase tracking-wider pl-1">Contextual Example</label>
                                        <textarea value={row.example} onChange={e => updateComparisonRow(idx, 'example', e.target.value)} rows={2} className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-bold focus:bg-white outline-none resize-none leading-relaxed" placeholder="Write a clear example sentence..." />
                                    </div>
                                </div>
                            ))}
                            <button onClick={addComparisonRow} className="w-full py-6 border-2 border-dashed border-neutral-200 rounded-[2.5rem] text-neutral-400 font-black text-xs uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 bg-white/50"><Plus size={20}/> Add Comparison Pair</button>
                        </div>
                    </div>
                ) : isPreview ? (
                    <div className="p-6 prose prose-sm max-w-none prose-headings:font-black prose-p:text-neutral-600 prose-img:rounded-xl prose-img:shadow-md prose-strong:text-neutral-900 prose-a:text-indigo-600 overflow-y-auto absolute inset-0 bg-neutral-50/30" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                    <textarea value={activeTab === 'READING' ? content : activeTab === 'LISTENING' ? listeningContent : testContent} onChange={(e) => { if (activeTab === 'READING') setContent(e.target.value); else if (activeTab === 'LISTENING') setListeningContent(e.target.value); else setTestContent(e.target.value); }} className="absolute inset-0 w-full h-full p-6 resize-none focus:outline-none text-sm leading-relaxed font-medium text-neutral-900 bg-white font-mono" placeholder={`Write ${activeTab.toLowerCase()} content here...`} spellCheck={false} />
                )}
            </div>
        </div>
      </div>
    </div>
  );
};