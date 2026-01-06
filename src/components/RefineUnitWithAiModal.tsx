
import React, { useState } from 'react';
import { X, Clipboard, Check, AlertTriangle, ArrowRight, Edit3, ClipboardList, Info, Code } from 'lucide-react';
import { User } from '../app/types';

interface UnitData {
  name: string;
  description: string;
  words: string;
  essay: string;
}

interface Props {
  user: User;
  currentData: UnitData;
  onApply: (refined: UnitData) => void;
  onClose: () => void;
}

const RefineUnitWithAiModal: React.FC<Props> = ({ user, currentData, onApply, onClose }) => {
  const [request, setRequest] = useState('');
  const [jsonResponse, setJsonResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = () => {
    const isDefaultName = currentData.name === "New Unit";
    const hasNoContent = !currentData.description.trim() && !currentData.words.trim() && !currentData.essay.trim();
    const shouldSkipCurrentData = isDefaultName && hasNoContent;

    let currentDataBlock = '';
    if (!shouldSkipCurrentData) {
      currentDataBlock = `
CURRENT UNIT DATA (Reference or Update this):
- Name: ${currentData.name}
- Description: ${currentData.description || '(empty)'}
- Words: ${currentData.words || '(empty)'}
- Essay: ${currentData.essay || '(empty)'}
`;
    }

    const prompt = `You are an IELTS expert refining a vocabulary lesson unit. 

USER PROFILE CONTEXT:
- Role: ${user.role || 'IELTS Candidate'}
- Level: ${user.currentLevel || 'Intermediate'}
- Goal: ${user.target || 'Improve band score'}
${currentDataBlock}
USER REFINEMENT REQUEST:
"${request}"

Based on the request, provide the updated unit in strict JSON format:
{
  "name": "Updated name",
  "description": "Updated description",
  "words": ["word1", "word2", "..."],
  "essay": "Updated essay content"
}

IMPORTANT:
- Ensure the JSON is valid. 
- Use double quotes for keys and values.
- Do NOT include trailing commas.
- Escape all internal newlines in the essay using \\n.
- For the "words" array, strictly use the format "essay_word:base_word" ONLY if the word used in the essay differs from the base dictionary form (e.g. "running:run", "cities:city", "better:good"). If they are identical, just use "word" (DO NOT use "word:word").`;
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Safe JSON Extraction & Cleaning
   */
  const handleManualApply = () => {
    setError(null);
    try {
        let input = jsonResponse.trim();
        
        // 1. Locate the actual JSON block within the response
        const firstBrace = input.indexOf('{');
        const lastBrace = input.lastIndexOf('}');
        
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error("Missing JSON structure. Ensure the text contains '{' and '}'.");
        }
        
        let jsonString = input.substring(firstBrace, lastBrace + 1);
        
        // 2. Syntax Cleanup: Remove trailing commas before closing braces/brackets
        jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
        
        // 3. Attempt standard parse
        const data = JSON.parse(jsonString);
        
        // 4. Map to UnitData
        const refined: UnitData = {
            name: String(data.name || currentData.name || "Untitled Unit"),
            description: String(data.description || currentData.description || ""),
            words: Array.isArray(data.words) 
                   ? data.words.join('; ') 
                   : (typeof data.words === 'string' ? data.words : currentData.words),
            essay: String(data.essay || currentData.essay || "")
        };
        
        onApply(refined);
    } catch (e: any) {
        console.error("JSON Parse Error:", e);
        setError(`Parser Error: ${e.message}. Ensure the AI output is copied exactly.`);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-neutral-200 font-sans">
        <header className="px-8 py-5 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 shrink-0">
          <div className="flex items-center space-x-3">
             <div className="p-2 bg-neutral-900 text-white rounded-xl shadow-sm"><Edit3 size={16} /></div>
             <div>
              <h3 className="font-black text-lg text-neutral-900 leading-tight">Unit Refiner</h3>
              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">AI Workflow Sync</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={20}/></button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Step 1: Describe Changes</label>
            <textarea value={request} onChange={(e) => setRequest(e.target.value)} placeholder='e.g., "Add 5 environment words and make the essay more formal."' className="w-full h-24 p-5 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 focus:outline-none resize-none transition-all shadow-inner leading-relaxed" />
            <button type="button" onClick={handleCopyPrompt} disabled={!request.trim()} className={`w-full flex items-center justify-center space-x-2 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm border ${copied ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-neutral-200 text-neutral-900 hover:bg-neutral-50'} disabled:opacity-30`}>
              {copied ? <Check size={14} /> : <ClipboardList size={14} />}
              <span>{copied ? 'Prompt Copied' : 'Copy Prompt for AI'}</span>
            </button>
          </div>

          <div className="space-y-3 pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between px-1">
               <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Step 2: Paste AI Response</label>
               <Code size={14} className="text-neutral-300" />
            </div>
            <textarea rows={5} value={jsonResponse} onChange={(e) => setJsonResponse(e.target.value)} placeholder='Paste the JSON response starting with "{" and ending with "}"...' className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs font-mono text-neutral-600 focus:ring-2 focus:ring-neutral-900 outline-none resize-none shadow-inner" />
            <button onClick={handleManualApply} disabled={!jsonResponse.trim()} className="w-full py-4 bg-neutral-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-30 shadow-lg">
              <ArrowRight size={16} />
              <span>Apply Refinement</span>
            </button>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start space-x-3 text-rose-600 animate-in fade-in">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-tight">Parser Failure</span>
                <span className="text-[11px] font-medium leading-relaxed">{error}</span>
              </div>
            </div>
          )}
          
          <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start space-x-4">
              <Info size={18} className="text-indigo-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                  <p className="text-[10px] text-indigo-700 font-black uppercase tracking-widest">How to use</p>
                  <p className="text-[10px] text-indigo-600 leading-relaxed font-medium">Click "Apply Refinement" after pasting the JSON. The tool automatically repairs basic syntax errors like trailing commas.</p>
              </div>
          </div>
        </div>
        
        <footer className="p-4 bg-neutral-50 border-t border-neutral-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-3 text-neutral-400 font-black text-[10px] uppercase tracking-widest hover:text-neutral-900 transition-colors">Close Refiner</button>
        </footer>
      </div>
    </div>
  );
};

export default RefineUnitWithAiModal;
