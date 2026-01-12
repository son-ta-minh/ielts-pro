import React, { useState } from 'react';
import { User, SpeakingTopic } from '../../app/types';
import * as db from '../../app/db';
// FIX: Import getRefineSpeakingTopicPrompt from promptService
import { getRefineSpeakingTopicPrompt } from '../../services/promptService';
import { Loader2, Save, Sparkles, ArrowLeft, Mic } from 'lucide-react';
import UniversalAiModal from '../common/UniversalAiModal';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  user: User;
  topic: SpeakingTopic;
  onSave: () => void;
  onCancel: () => void;
}

const SpeakingTopicEditView: React.FC<Props> = ({ user, topic, onSave, onCancel }) => {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description);
  const [questions, setQuestions] = useState(topic.questions.join('\n'));
  const [isSaving, setIsSaving] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const { showToast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    const updatedTopic: SpeakingTopic = {
      ...topic,
      name: name.trim() || 'Untitled Topic',
      description: description.trim(),
      questions: questions.split('\n').map(q => q.trim()).filter(Boolean),
    };
    await db.saveSpeakingTopic(updatedTopic);
    showToast('Topic saved!', 'success');
    setIsSaving(false);
    onSave();
  };
  
  const handleGeneratePrompt = (inputs: { request: string }) => {
    // FIX: Call the imported function directly
    return getRefineSpeakingTopicPrompt(topic.name, topic.description, topic.questions.join('\n'), inputs.request, user);
  }

  const handleAiResult = (data: { name: string; description: string; questions: string[] }) => {
    setName(data.name);
    setDescription(data.description);
    setQuestions(data.questions.join('\n'));
    showToast('AI refinement applied!', 'success');
    setIsAiModalOpen(false);
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <button onClick={onCancel} className="flex items-center space-x-2 text-sm font-bold text-neutral-400 hover:text-neutral-900 transition-colors mb-1">
              <ArrowLeft size={16} /><span>Back to Library</span>
            </button>
            <h2 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3"><Mic size={28}/> Edit Topic</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsAiModalOpen(true)} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all">
              <Sparkles size={14} className="text-amber-500"/><span>AI Refine</span>
            </button>
            <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 transition-all active:scale-95 hover:bg-neutral-800 disabled:opacity-50 uppercase tracking-widest shadow-sm">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </header>
        
        <div className="space-y-6 bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Topic Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-neutral-900 outline-none"/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"/>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Questions (one per line)</label>
            <textarea value={questions} onChange={(e) => setQuestions(e.target.value)} rows={12} className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm leading-relaxed resize-y focus:ring-2 focus:ring-neutral-900 outline-none font-medium"/>
          </div>
        </div>
      </div>
      
      {isAiModalOpen && (
        <UniversalAiModal 
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          type="REFINE_UNIT"
          title="Refine Speaking Topic"
          description="Let AI improve or generate questions for your topic."
          onGeneratePrompt={handleGeneratePrompt}
          onJsonReceived={handleAiResult}
        />
      )}
    </>
  );
};

export default SpeakingTopicEditView;