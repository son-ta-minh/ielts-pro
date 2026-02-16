
import React, { useState, useEffect } from 'react';
import { FreeTalkItem } from '../../app/types';
import { X, Save, FileText, Tag, Sparkles, Plus, FileAudio } from 'lucide-react';
import UniversalAiModal from '../common/UniversalAiModal';
import { getRefineFreeTalkPrompt } from '../../services/promptService';
import { useToast } from '../../contexts/ToastContext';
import { FileSelector } from '../common/FileSelector';
import ConfirmationModal from '../common/ConfirmationModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string, content: string, tags: string[], audioLinks: string[] }) => void;
  initialData?: FreeTalkItem | null;
}

export const AddEditFreeTalkModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
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
      setContent(initialData?.content || '');
      setTagsInput(initialData?.tags?.join(', ') || '');
      setAudioLinks(initialData?.audioLinks || []);
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSave({ 
        title: title.trim(), 
        content: content.trim(), 
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        audioLinks
    });
  };
  
  const handleAiRefine = (data: any) => {
      // Robust handling for various AI return shapes
      const resultData = data.result || data;
      const newContent = resultData.content || resultData.rewritten || resultData.text;
      
      if (newContent && typeof newContent === 'string') {
          setContent(newContent);
          setIsAiModalOpen(false);
          showToast("Content refined!", "success");
      } else {
          console.error("Invalid AI response for Free Talk:", data);
          showToast("Could not parse AI response.", "error");
      }
  };
  
  const handleAddAudio = (fileData: any) => {
      const { url, transcript } = fileData;
      setAudioLinks(prev => [...prev, url]);
      
      if (transcript) {
          if (!content.trim()) {
              setContent(transcript);
          } else {
              setTranscriptToApply(transcript);
              setIsTranscriptConfirmOpen(true);
          }
      }
  };
  
  const handleConfirmTranscript = () => {
      if (transcriptToApply) {
          setContent(transcriptToApply);
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
      <form onSubmit={handleSubmit} className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh]">
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
        <main className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-500">Title / Topic</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., My Hometown" className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none" required />
          </div>
          
          <div className="space-y-2">
               <div className="flex justify-between items-center">
                   <label className="block text-xs font-bold text-neutral-500">Reference Audio</label>
                   <button type="button" onClick={() => setIsAudioSelectorOpen(true)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"><Plus size={12}/> From Server</button>
               </div>
               
               <div className="space-y-2">
                   {audioLinks.length === 0 && <p className="text-[10px] text-neutral-400 italic px-2">No reference audio attached.</p>}
                   {audioLinks.map((link, idx) => (
                       <div key={idx} className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-200">
                           <div className="flex items-center gap-2 overflow-hidden">
                               <FileAudio size={14} className="text-emerald-500 shrink-0" />
                               <span className="text-xs font-mono text-neutral-600 truncate">{decodeURIComponent(link.split('/').pop() || 'file')}</span>
                           </div>
                           <button type="button" onClick={() => handleRemoveAudio(idx)} className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full"><X size={14}/></button>
                       </div>
                   ))}
               </div>
          </div>
          
          <div className="space-y-1 flex flex-col flex-1 h-full min-h-[300px]">
            <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><FileText size={12}/> Speech Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Enter the full paragraph you want to practice..." className="w-full flex-1 p-4 bg-neutral-50 border border-neutral-200 rounded-xl font-medium focus:ring-2 focus:ring-neutral-900 outline-none resize-none leading-relaxed" required />
            <p className="text-[10px] text-neutral-400 italic text-right mt-1">The app will split this into sentences for practice.</p>
          </div>
          <div className="space-y-1">
             <label className="block text-xs font-bold text-neutral-500 flex items-center gap-1"><Tag size={12}/> Tags</label>
             <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="part1, personal..." className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm" />
          </div>
        </main>
        <footer className="px-8 py-6 border-t border-neutral-100 flex justify-end shrink-0 bg-neutral-50/50 rounded-b-[2.5rem]">
          <button type="submit" className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center gap-2 uppercase tracking-widest"><Save size={14}/> Save</button>
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
            onGeneratePrompt={(i) => getRefineFreeTalkPrompt(content, i.request)}
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
        message="This audio file comes with a linked transcript. Do you want to replace your current speech content with it?"
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
