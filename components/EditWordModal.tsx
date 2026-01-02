
import React, { useState } from 'react';
import { X, Save, Sparkles, Loader2, Tag, Mic, Quote, Layers, Combine } from 'lucide-react';
import { VocabularyItem } from '../types';
import { generateWordDetails } from '../services/geminiService';

interface Props {
  word: VocabularyItem;
  onSave: (updatedWord: VocabularyItem) => void;
  onClose: () => void;
}

const EditWordModal: React.FC<Props> = ({ word, onSave, onClose }) => {
  const [formData, setFormData] = useState({ 
    ...word, 
    tagsString: word.tags ? word.tags.join(', ') : '',
    isIdiom: word.isIdiom || false,
    isPhrasalVerb: word.isPhrasalVerb || false,
    isCollocation: word.isCollocation || false,
    needsPronunciationFocus: word.needsPronunciationFocus || false
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAISuggest = async () => {
    if (!formData.word) return;
    setIsGenerating(true);
    try {
      const details = await generateWordDetails(formData.word);
      setFormData(prev => ({
        ...prev,
        ipa: details.ipa || prev.ipa,
        meaningVi: details.meaningVi || prev.meaningVi,
        example: details.example || prev.example,
        isIdiom: details.isIdiom !== undefined ? details.isIdiom : prev.isIdiom,
        isPhrasalVerb: details.isPhrasalVerb !== undefined ? details.isPhrasalVerb : prev.isPhrasalVerb,
        isCollocation: details.isCollocation !== undefined ? details.isCollocation : prev.isCollocation,
        needsPronunciationFocus: details.needsPronunciationFocus !== undefined ? details.needsPronunciationFocus : prev.needsPronunciationFocus
      }));
    } catch (e) {
      alert("Failed to get AI suggestions.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { tagsString, ...rest } = formData;
    const updatedWord: VocabularyItem = {
      ...rest,
      tags: tagsString.split(',').map(t => t.trim()).filter(t => t !== ''),
      updatedAt: Date.now()
    };
    onSave(updatedWord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-neutral-900 text-white rounded-xl">
              <Sparkles size={18} />
            </div>
            <h3 className="font-black text-xl text-neutral-900">Vocabulary Details</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-full transition-colors text-neutral-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 mb-2">
              <button 
                type="button"
                onClick={() => setFormData(p => ({...p, isIdiom: !p.isIdiom}))}
                className={`flex flex-col items-center justify-center space-y-1 py-2 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${formData.isIdiom ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
              >
                <Quote size={12} />
                <span>Idiom</span>
              </button>
              <button 
                type="button"
                onClick={() => setFormData(p => ({...p, isCollocation: !p.isCollocation}))}
                className={`flex flex-col items-center justify-center space-y-1 py-2 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${formData.isCollocation ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
              >
                <Combine size={12} />
                <span>Colloc.</span>
              </button>
              <button 
                type="button"
                onClick={() => setFormData(p => ({...p, isPhrasalVerb: !p.isPhrasalVerb}))}
                className={`flex flex-col items-center justify-center space-y-1 py-2 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${formData.isPhrasalVerb ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
              >
                <Layers size={12} />
                <span>Phrase</span>
              </button>
              <button 
                type="button"
                onClick={() => setFormData(p => ({...p, needsPronunciationFocus: !p.needsPronunciationFocus}))}
                className={`flex flex-col items-center justify-center space-y-1 py-2 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${formData.needsPronunciationFocus ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-white border-neutral-100 text-neutral-400'}`}
              >
                <Mic size={12} />
                <span>Pronun.</span>
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 ml-1">Word or Phrase</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={formData.word}
                  onChange={(e) => setFormData({...formData, word: e.target.value})}
                  className="flex-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:outline-none font-bold text-lg"
                />
                <button 
                  type="button"
                  onClick={handleAISuggest}
                  disabled={isGenerating || !formData.word}
                  className="px-4 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 disabled:opacity-50 transition-all flex items-center justify-center"
                >
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 ml-1">IPA</label>
                <input 
                  type="text" 
                  value={formData.ipa}
                  onChange={(e) => setFormData({...formData, ipa: e.target.value})}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:outline-none font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 ml-1">Meaning</label>
                <input 
                  type="text" 
                  value={formData.meaningVi}
                  onChange={(e) => setFormData({...formData, meaningVi: e.target.value})}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:outline-none font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 ml-1">Tags</label>
              <div className="relative">
                <Tag size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input 
                  type="text" 
                  value={formData.tagsString}
                  onChange={(e) => setFormData({...formData, tagsString: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:outline-none text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 ml-1">Example</label>
              <textarea 
                rows={3}
                value={formData.example}
                onChange={(e) => setFormData({...formData, example: e.target.value})}
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none text-sm leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 ml-1">Note</label>
              <textarea 
                rows={2}
                value={formData.note}
                onChange={(e) => setFormData({...formData, note: e.target.value})}
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none text-sm italic text-neutral-600"
              />
            </div>
          </div>
        </form>

        <div className="p-6 bg-neutral-50 border-t border-neutral-100 flex space-x-3">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 py-4 bg-white border border-neutral-200 text-neutral-500 rounded-2xl font-bold hover:bg-neutral-100 transition-all"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            onClick={handleSubmit}
            className="flex-[2] py-4 bg-neutral-900 text-white rounded-2xl font-bold flex items-center justify-center space-x-2 hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
          >
            <Save size={18} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditWordModal;
