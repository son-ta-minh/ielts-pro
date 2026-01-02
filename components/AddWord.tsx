
import React, { useState } from 'react';
import { Sparkles, Save, Loader2, Quote, Mic, Layers, Combine } from 'lucide-react';
import { generateWordDetails } from '../services/geminiService';
import { createNewWord } from '../utils/srs';
import { VocabularyItem } from '../types';

interface Props {
  onAdd: (word: VocabularyItem) => void;
}

const AddWord: React.FC<Props> = ({ onAdd }) => {
  const [word, setWord] = useState('');
  const [ipa, setIpa] = useState('');
  const [meaningVi, setMeaningVi] = useState('');
  const [example, setExample] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [isIdiom, setIsIdiom] = useState(false);
  const [isPhrasalVerb, setIsPhrasalVerb] = useState(false);
  const [isCollocation, setIsCollocation] = useState(false);
  const [needsPronunciationFocus, setNeedsPronunciationFocus] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleAISuggest = async () => {
    if (!word) return;
    setIsLoading(true);
    try {
      const details = await generateWordDetails(word);
      if (details.ipa) setIpa(details.ipa);
      if (details.example) setExample(details.example);
      if (details.meaningVi) setMeaningVi(details.meaningVi);
      if (details.isIdiom !== undefined) setIsIdiom(details.isIdiom);
      if (details.isPhrasalVerb !== undefined) setIsPhrasalVerb(details.isPhrasalVerb);
      if (details.isCollocation !== undefined) setIsCollocation(details.isCollocation);
      if (details.needsPronunciationFocus !== undefined) setNeedsPronunciationFocus(details.needsPronunciationFocus);
    } catch (e) {
      alert("Failed to get AI suggestions.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word) {
      alert("Word or Phrase is required.");
      return;
    }
    
    setIsSaving(true);
    try {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t !== '');
      const newItem = {
        ...createNewWord(
          word, 
          ipa, 
          meaningVi, 
          example, 
          note, 
          tagArray, 
          isIdiom, 
          needsPronunciationFocus
        ),
        isPhrasalVerb,
        isCollocation
      };
      await onAdd(newItem);
      
      setWord('');
      setIpa('');
      setMeaningVi('');
      setExample('');
      setNote('');
      setTags('');
      setIsIdiom(false);
      setIsPhrasalVerb(false);
      setIsCollocation(false);
      setNeedsPronunciationFocus(false);
    } catch (err) {
      console.error("Submit Error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-3xl font-bold text-neutral-900">New Vocabulary</h2>
        <p className="text-neutral-500 mt-2">Add words you encountered in your IELTS preparation.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2 pb-2">
            <button 
              type="button"
              onClick={() => setIsIdiom(!isIdiom)}
              className={`flex flex-col items-center justify-center space-y-1 py-3 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${isIdiom ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm' : 'bg-neutral-50 border-neutral-100 text-neutral-400'}`}
            >
              <Quote size={12} />
              <span>Idiom</span>
            </button>
            <button 
              type="button"
              onClick={() => setIsCollocation(!isCollocation)}
              className={`flex flex-col items-center justify-center space-y-1 py-3 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${isCollocation ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm' : 'bg-neutral-50 border-neutral-100 text-neutral-400'}`}
            >
              <Combine size={12} />
              <span>Colloc.</span>
            </button>
            <button 
              type="button"
              onClick={() => setIsPhrasalVerb(!isPhrasalVerb)}
              className={`flex flex-col items-center justify-center space-y-1 py-3 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${isPhrasalVerb ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'bg-neutral-50 border-neutral-100 text-neutral-400'}`}
            >
              <Layers size={12} />
              <span>Phrase</span>
            </button>
            <button 
              type="button"
              onClick={() => setNeedsPronunciationFocus(!needsPronunciationFocus)}
              className={`flex flex-col items-center justify-center space-y-1 py-3 px-1 rounded-xl border-2 transition-all font-bold text-[8px] uppercase tracking-wider ${needsPronunciationFocus ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm' : 'bg-neutral-50 border-neutral-100 text-neutral-400'}`}
            >
              <Mic size={12} />
              <span>Pronun.</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Word or Phrase</label>
            <div className="flex space-x-2">
              <input 
                type="text" 
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="e.g. have much in common"
                className="flex-1 px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none text-lg font-medium"
              />
              <button 
                type="button"
                onClick={handleAISuggest}
                disabled={!word || isLoading || isSaving}
                className="px-4 py-3 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 transition-colors flex items-center space-x-2 shadow-sm active:scale-95"
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} className="text-purple-500" />}
                <span className="font-semibold text-sm">AI Assist</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">IPA</label>
              <input 
                type="text" 
                value={ipa}
                onChange={(e) => setIpa(e.target.value)}
                placeholder="/.../"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Meaning</label>
              <input 
                type="text" 
                value={meaningVi}
                onChange={(e) => setMeaningVi(e.target.value)}
                placeholder="Nghĩa tiếng Việt..."
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Tags</label>
            <input 
              type="text" 
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Writing, Speaking, Social..."
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Example Sentence <span className="text-xs text-neutral-400 font-normal ml-1">(Optional)</span></label>
            <textarea 
              rows={3}
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="Provide a context sentence..."
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Note <span className="text-xs text-neutral-400 font-normal ml-1">(Optional)</span></label>
            <textarea 
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none"
            />
          </div>
        </div>

        <button 
          type="submit"
          disabled={isSaving}
          className="w-full py-4 bg-neutral-900 text-white rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          <span>Save Vocabulary</span>
        </button>
      </form>
    </div>
  );
};

export default AddWord;
