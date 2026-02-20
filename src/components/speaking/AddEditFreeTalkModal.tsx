
import React, { useState, useEffect } from 'react';
import { FreeTalkItem, ScriptItem } from '../../app/types';
import { X, Save, FileText, Tag, Sparkles, Plus, FileAudio, StickyNote, Trash2, GripVertical, Type } from 'lucide-react';
import UniversalAiModal from '../common/UniversalAiModal';
import { getRefineFreeTalkPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import { FileSelector } from '../common/FileSelector';
import ConfirmationModal from '../common/ConfirmationModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string, content: string, scriptItems: ScriptItem[], tags: string[], audioLinks: string[] }) => void;
  initialData?: FreeTalkItem | null;
}

export const AddEditFreeTalkModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [scriptItems, setScriptItems] = useState<ScriptItem[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [audioLinks, setAudioLinks] = useState<string[]>([]);
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isAudioSelectorOpen, setIsAudioSelectorOpen] = useState(false);
  const [transcriptToApply, setTranscriptToApply] = useState<string | null>(null);
  const [isTranscriptConfirmOpen, setIsTranscriptConfirmOpen] = useState(false);
  
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setTagsInput(initialData?.tags?.join(', ') || '');
      setAudioLinks(initialData?.audioLinks || []);
      
      if (initialData?.scriptItems && initialData.scriptItems.length > 0) {
          setScriptItems(initialData.scriptItems);
      } else if (initialData?.content) {
          // Fallback: Create single script item from content
          setScriptItems([{
              id: Date.now().toString(),
              type: 'script',
              content: initialData.content
          }]);
      } else {
          // Default empty item
          setScriptItems([{
              id: Date.now().toString(),
              type: 'script',
              content: ''
          }]);
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { showToast("Title is required", "error"); return; }
    
    const validItems = scriptItems.filter(i => i.content.trim());
    if (validItems.length === 0) { showToast("At least one script item is required", "error"); return; }

    // Construct legacy content for search/preview
    const legacyContent = validItems
        .filter(i => i.type === 'script')
        .map(i => i.content)
        .join('\n\n');

    onSave({ 
        title: title.trim(), 
        content: legacyContent,
        scriptItems: validItems,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        audioLinks
    });
  };
  
  const handleAddItem = (type: 'script' | 'note') => {
      setScriptItems(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          type,
          content: ''
      }]);
  };

  const handleRemoveItem = (index: number) => {
      setScriptItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, updates: Partial<ScriptItem>) => {
      setScriptItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };
  
  const handleAiRefine = (data: any) => {
      const resultData = data.result || data;
      const newContent = resultData.content || resultData.rewritten || resultData.text;
      
      if (newContent && typeof newContent === 'string') {
          // Replace all script items with one refined script? 
          // Or try to be smart? Let's just append or replace the first one.
          // Better: Replace all with one refined script item.
          setScriptItems([{
              id: Date.now().toString(),
              type: 'script',
              content: newContent
          }]);
          setIsAiModalOpen(false);
          showToast("Content refined!", "success");
      } else {
          showToast("Could not parse AI response.", "error");
      }
  };
  
  const handleAddAudio = (fileData: any) => {
      const { url, transcript } = fileData;
      setAudioLinks(prev => [...prev, url]);
      
      if (transcript) {
          setTranscriptToApply(transcript);
          setIsTranscriptConfirmOpen(true);
      }
  };
  
  const handleConfirmTranscript = () => {
      if (transcriptToApply) {
          setScriptItems([{
              id: Date.now().toString(),
              type: 'script',
              content: transcriptToApply
          }]);
      }
      setTranscriptToApply(null);
      setIsTranscriptConfirmOpen(false);
  };
  
  const handleRemoveAudio = (index: number) => {
      setAudioLinks(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-xl font-black text-neutral-900">{initialData ? 'Edit Free Talk' : 'New Free Talk'}</h3>
            <p className="text-sm text-neutral-500">Practice speaking natural paragraphs.</p>
          </div>
          <div className="flex items-center gap-2">
              <button type="button" onClick={() => setIsAiModalOpen(true)} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors" title="Refine with AI"><Sparkles size={18} /></button>
              <button type="button" onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
          </div>
        </header>
        
        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 bg-neutral-50/30">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Title / Topic</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., My Hometown" className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none shadow-sm" required />
          </div>
          
          <div className="space-y-2">
               <div className="flex justify-between items-center">
                   <label className="block text-xs font-bold text-neutral-500">Reference Audio</label>
                   <button type="button" onClick={() => setIsAudioSelectorOpen(true)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"><Plus size={12}/> From Server</button>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   {audioLinks.length === 0 && <p className="text-[10px] text-neutral-400 italic px-2 col-span-full">No reference audio attached.</p>}
                   {audioLinks.map((link, idx) => (
                       <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-neutral-200 shadow-sm">
                           <div className="flex items-center gap-2 overflow-hidden">
                               <FileAudio size={14} className="text-emerald-500 shrink-0" />
                               <span className="text-xs font-mono text-neutral-600 truncate">{decodeURIComponent(link.split('/').pop() || 'file')}</span>
                           </div>
                           <button type="button" onClick={() => handleRemoveAudio(idx)} className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full"><X size={14}/></button>
                       </div>
                   ))}
               </div>
          </div>
          
          <div className="space-y-3">
            <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><FileText size={12}/> Content Blocks</label>
            
            <div className="space-y-3">
                {scriptItems.map((item, idx) => (
                    <div key={item.id} className={`group relative p-4 rounded-2xl border transition-all ${item.type === 'note' ? 'bg-yellow-50/50 border-yellow-200' : 'bg-white border-neutral-200 shadow-sm'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 bg-neutral-100 rounded-md cursor-move text-neutral-400"><GripVertical size={12}/></span>
                                <div className="flex bg-neutral-100 p-0.5 rounded-lg">
                                    <button 
                                        type="button"
                                        onClick={() => handleUpdateItem(idx, { type: 'script' })}
                                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${item.type === 'script' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
                                    >
                                        Script
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleUpdateItem(idx, { type: 'note' })}
                                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${item.type === 'note' ? 'bg-white shadow-sm text-yellow-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                                    >
                                        Note
                                    </button>
                                </div>
                            </div>
                            <button type="button" onClick={() => handleRemoveItem(idx)} className="p-1.5 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14}/></button>
                        </div>
                        <textarea 
                            value={item.content} 
                            onChange={e => handleUpdateItem(idx, { content: e.target.value })} 
                            placeholder={item.type === 'script' ? "Enter speech text..." : "Enter notes, cues, or reminders..."}
                            className={`w-full p-3 rounded-xl outline-none resize-none text-sm leading-relaxed min-h-[100px] ${item.type === 'note' ? 'bg-yellow-50/50 placeholder:text-yellow-300/50 text-yellow-900 italic' : 'bg-neutral-50 focus:bg-white focus:ring-2 focus:ring-neutral-900 placeholder:text-neutral-300'}`}
                        />
                    </div>
                ))}
            </div>

            <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => handleAddItem('script')} className="flex-1 py-3 border-2 border-dashed border-neutral-200 rounded-xl text-neutral-400 font-bold text-xs hover:border-neutral-400 hover:text-neutral-600 transition-all flex items-center justify-center gap-2">
                    <Type size={14}/> Add Script
                </button>
                <button type="button" onClick={() => handleAddItem('note')} className="flex-1 py-3 border-2 border-dashed border-yellow-200 rounded-xl text-yellow-600/50 font-bold text-xs hover:border-yellow-400 hover:text-yellow-700 transition-all flex items-center justify-center gap-2 bg-yellow-50/30">
                    <StickyNote size={14}/> Add Note
                </button>
            </div>
          </div>

          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><Tag size={12}/> Tags</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="part1, personal..." className="w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl font-medium text-sm shadow-sm" />
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg"><Save size={14}/> Save</button>
        </footer>
      </form>
    </div>
    
    {isAiModalOpen && (
        <UniversalAiModal
            isOpen={isAiModalOpen}
            onClose={() => setIsAiModalOpen(false)}
            type="REFINE_UNIT"
            title="Refine Free Talk"
            description="Improve vocabulary and grammar for a higher band score."
            initialData={{ request: '' }}
            onGeneratePrompt={(i) => getRefineFreeTalkPrompt(scriptItems.map(s => s.content).join('\n'), i.request)}
            onJsonReceived={handleAiRefine}
            actionLabel="Refine"
            closeOnSuccess={true}
        />
    )}
    
    <FileSelector 
        isOpen={isAudioSelectorOpen} 
        onClose={() => setIsAudioSelectorOpen(false)} 
        onSelect={handleAddAudio}
        type="audio"
        title="Select Audio" 
    />
    
    <ConfirmationModal 
        isOpen={isTranscriptConfirmOpen}
        title="Replace Content?"
        message="This audio file comes with a linked transcript. Do you want to replace your current content with it?"
        confirmText="Replace"
        isProcessing={false}
        onConfirm={handleConfirmTranscript}
        onClose={() => setIsTranscriptConfirmOpen(false)}
        icon={<FileText size={40} className="text-indigo-500"/>}
        confirmButtonClass="bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200"
    />
    </>
  );
};
