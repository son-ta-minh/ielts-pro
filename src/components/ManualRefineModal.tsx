import React, { useState } from 'react';
import { X, Clipboard, Check, AlertTriangle, Send, Loader2, Sparkles } from 'lucide-react';
// FIX: Import WordFamily to use in the AI result interface.
import { VocabularyItem, WordFamily, PrepositionPattern } from '../app/types';
import { bulkSaveWords } from '../app/db';

interface Props {
  wordsToRefine: VocabularyItem[];
  onClose: () => void;
  onComplete: () => void;
}

// FIX: Add a specific interface for the expected AI refinement result to ensure type safety.
interface AiRefinementResult {
  word: string;
  ipa?: string;
  meaningVi?: string;
  example?: string;
  collocations?: string;
  preposition?: string;
  isIdiom?: boolean;
  isPhrasalVerb?: boolean;
  isCollocation?: boolean;
  isStandardPhrase?: boolean;
  isIrregular?: boolean;
  v2?: string;
  v3?: string;
  isPassive?: boolean;
  tags?: string[];
  wordFamily?: WordFamily;
}

const parsePrepositionPatterns = (prepositionStr: string | null | undefined): PrepositionPattern[] | undefined => {
    if (!prepositionStr || typeof prepositionStr !== 'string' || prepositionStr.trim().toLowerCase() === 'null') {
        return undefined;
    }

    const multiWordPrepositions = [
        'out of', 'because of', 'according to', 'in front of', 'next to', 
        'due to', 'instead of', 'in spite of', 'on top of', 'as for', 
        'except for', 'apart from', 'along with', 'in addition to', 'in case of',
        'with regard to', 'as well as', 'in accordance with', 'on behalf of',
        'in relation to', 'in terms of', 'by means of', 'in charge of'
    ];

    const patterns = prepositionStr.split(',').map(p => p.trim()).filter(Boolean);
    if (patterns.length === 0) {
        return undefined;
    }

    const results: PrepositionPattern[] = patterns.map(pattern => {
        // Check for multi-word prepositions first, longest match first to handle cases like "in spite of" vs "in"
        const sortedMultiWord = [...multiWordPrepositions].sort((a, b) => b.length - a.length);
        const foundMultiWord = sortedMultiWord.find(mwp => pattern.toLowerCase().startsWith(mwp + ' '));

        if (foundMultiWord) {
            const prep = foundMultiWord;
            const usage = pattern.substring(prep.length + 1).trim();
            return { prep, usage };
        }

        // Fallback to single-word preposition logic
        const firstSpaceIndex = pattern.indexOf(' ');
        if (firstSpaceIndex > 0) {
            const prep = pattern.substring(0, firstSpaceIndex);
            const usage = pattern.substring(firstSpaceIndex + 1).trim();
            return { prep, usage };
        }
        
        // If no space, the whole thing is the preposition.
        return { prep: pattern, usage: '' };
    });
    
    return results.length > 0 ? results : undefined;
};


const ManualRefineModal: React.FC<Props> = ({ wordsToRefine, onClose, onComplete }) => {
  const [jsonResponse, setJsonResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const wordList = wordsToRefine.map(w => `"${w.word}"`).join(', ');

  const finalPrompt = `Analyze this list of IELTS vocabulary items: [${wordList}].
    
Return a JSON array where each object corresponds to an item from the list. Each object in the array MUST strictly adhere to the following JSON schema:

\`\`\`json
{
  "word": "string",
  "ipa": "string",
  "meaningVi": "string",
  "example": "string",
  "collocations": "string (3-5 essential collocations, format: 'collocation: meaning', separated by newlines)",
  "preposition": "string | null",
  "isIdiom": "boolean",
  "isPhrasalVerb": "boolean",
  "isCollocation": "boolean",
  "isStandardPhrase": "boolean",
  "isIrregular": "boolean",
  "v2": "string | null",
  "v3": "string | null",
  "isPassive": "boolean",
  "tags": ["string"],
  "wordFamily": {
    "nouns": [{"word": "string", "ipa": "string"}],
    "verbs": [{"word": "string", "ipa": "string"}],
    "adjs": [{"word": "string", "ipa": "string"}],
    "advs": [{"word": "string", "ipa": "string"}]
  }
}
\`\`\`

CRITICAL INSTRUCTIONS:
- Process each word from the input list sequentially and completely.
- If you reach any output limit (e.g., response size), you MUST ensure the last item in the JSON array is a complete, valid object.
- DO NOT return a partially filled object. It is better to return a shorter array of complete objects than an array with an incomplete final object.

Detailed instructions for each field:
- word: The original word from the list (critical for mapping).
- ipa: The correct IPA transcription, e.g., /wɜːrd/.
- meaningVi: The primary Vietnamese meaning.
- example: A contextually rich example sentence suitable for IELTS.
- collocations: Provide essential IELTS collocations in 'phrase: meaning' format, separated by newlines.
- preposition: If the word takes prepositions, provide a comma-separated list of patterns. For each unique preposition, provide only ONE concise usage pattern (e.g., "prep usage"). Do not repeat prepositions.
- Classification Booleans: Set ONE of \`isIdiom\`, \`isPhrasalVerb\`, \`isCollocation\`, or \`isStandardPhrase\` to \`true\`. If it's a standard word, all four are \`false\`.
- Irregular Verb Forms: If irregular, set \`isIrregular\` to \`true\` and provide \`v2\` and \`v3\` forms.
- wordFamily: A complete word family tree. If a part of speech has no members, provide an empty array.
- isPassive: Set to \`true\` for archaic/literary words.
- tags: Suggest 3-5 relevant IELTS topic tags (e.g., 'technology', 'environment', 'health'). AVOID descriptive/grammatical tags like 'verb', 'adjective', 'irregular', or 'common'.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(finalPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setJsonResponse('');
  };

  const handleRefine = async () => {
    setError(null);
    if (!jsonResponse.trim()) {
        setError('Response JSON cannot be empty.');
        return;
    }
    setIsProcessing(true);
    try {
        let cleanJson = jsonResponse.trim();
        if (cleanJson.startsWith('```json')) {
            cleanJson = cleanJson.substring(7);
        }
        if (cleanJson.endsWith('```')) {
            cleanJson = cleanJson.substring(0, cleanJson.length - 3);
        }
        
        const results: AiRefinementResult[] = JSON.parse(cleanJson);
        if (!Array.isArray(results)) {
            throw new Error('Invalid JSON structure. The response must be an array.');
        }

        const aiMap = new Map<string, AiRefinementResult>(results.filter(r => r && r.word).map((r) => [r.word.toLowerCase(), r]));
        const originalWordsMap = new Map<string, VocabularyItem>(wordsToRefine.map(w => [w.word.toLowerCase(), w]));
        
        const updatedWords: VocabularyItem[] = [];

        aiMap.forEach((aiResult, wordKey) => {
            const originalItem = originalWordsMap.get(wordKey);
            if (originalItem) {
                const updatedItem: VocabularyItem = { ...originalItem };
                updatedItem.ipa = aiResult.ipa ?? originalItem.ipa;
                updatedItem.meaningVi = aiResult.meaningVi ?? originalItem.meaningVi;
                
                // Append collocations
                let finalCollocations = originalItem.collocations || '';
                if (aiResult.collocations) {
                    const newCollocs = aiResult.collocations.split('\n').filter((c: string) => {
                        const cleanC = c.trim().toLowerCase();
                        return cleanC && !finalCollocations.toLowerCase().includes(cleanC);
                    });
                    if (newCollocs.length > 0) {
                        finalCollocations = finalCollocations.trim() ? `${finalCollocations}\n${newCollocs.join('\n')}` : newCollocs.join('\n');
                    }
                }
                updatedItem.collocations = finalCollocations;

                if (typeof aiResult.preposition === 'string' && !aiResult.isPhrasalVerb) {
                    updatedItem.prepositions = parsePrepositionPatterns(aiResult.preposition);
                }
                updatedItem.wordFamily = aiResult.wordFamily ?? originalItem.wordFamily;
                
                // Append examples
                let finalExample = originalItem.example || '';
                if (aiResult.example && !finalExample.toLowerCase().includes(aiResult.example.toLowerCase())) {
                    finalExample = finalExample.trim() ? `${finalExample}\n${aiResult.example}` : aiResult.example;
                }
                updatedItem.example = finalExample;

                const newTags = new Set((originalItem.tags || []).map(t => t.toLowerCase()));
                (aiResult.tags || []).forEach((t: string) => newTags.add(t.toLowerCase()));
                updatedItem.tags = Array.from(newTags);

                updatedItem.isIdiom = !!aiResult.isIdiom;
                updatedItem.isPhrasalVerb = !!aiResult.isPhrasalVerb;
                updatedItem.isCollocation = !!aiResult.isCollocation;
                updatedItem.isStandardPhrase = !!aiResult.isStandardPhrase;
                updatedItem.isIrregular = !!aiResult.isIrregular;
                updatedItem.isPassive = !!aiResult.isPassive;
                updatedItem.v2 = aiResult.v2 ?? originalItem.v2;
                updatedItem.v3 = aiResult.v3 ?? originalItem.v3;
                updatedItem.updatedAt = Date.now();
                updatedWords.push(updatedItem);
            }
        });

        if (updatedWords.length > 0) {
            await bulkSaveWords(updatedWords);
        }
        
        onComplete();

    } catch (e: any) {
        setError(e.message || 'Failed to parse JSON.');
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col h-[90vh]">
        <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
          <div>
            <h3 className="font-black text-xl text-neutral-900 flex items-center"><Sparkles size={20} className="mr-2 text-blue-500" /> Manual AI Refinement</h3>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{wordsToRefine.length} words selected</p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">1. Copy Generated Prompt</label>
              <button onClick={handleCopy} className="flex items-center space-x-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-bold text-neutral-600 transition-colors">
                {copied ? <Check size={14} className="text-green-600"/> : <Clipboard size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Prompt'}</span>
              </button>
            </div>
            <input
              type="text"
              readOnly
              value={`AI prompt for ${wordsToRefine.length} words is ready to be copied.`}
              className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-mono text-neutral-500 italic"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">2. Paste JSON Response Here</label>
                <button onClick={handleClear} className="flex items-center space-x-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-xs font-bold text-neutral-600 transition-colors">
                  <X size={14} />
                  <span>Clear</span>
                </button>
            </div>
            <textarea
              value={jsonResponse}
              onChange={(e) => setJsonResponse(e.target.value)}
              placeholder='[{ "word": "...", "ipa": "...", ... }, ...]'
              className="w-full h-40 p-4 bg-white border border-neutral-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-blue-400 focus:outline-none resize-y"
            />
             {error && (
              <div className="flex items-center space-x-2 text-red-600 text-xs font-bold px-1 pt-1">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <footer className="p-6 bg-neutral-50 border-t border-neutral-100 flex justify-end">
          <button 
            onClick={handleRefine}
            disabled={isProcessing || !jsonResponse.trim()}
            className="px-8 py-4 bg-neutral-900 text-white rounded-2xl font-black text-sm flex items-center space-x-2 shadow-lg hover:bg-neutral-800 transition-all active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span>{isProcessing ? 'REFINING...' : 'REFINE WORDS'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ManualRefineModal;