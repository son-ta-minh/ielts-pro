import React from 'react';
import { X, Lightbulb, Check, MinusCircle, BookOpen, Combine, Quote, Zap } from 'lucide-react';

interface Suggestion {
    item: string;
    suggestion: 'learn' | 'ignore';
    reason: string;
}

interface SuggestionsData {
    overall_summary: string;
    wordFamily: Suggestion[];
    collocations: Suggestion[];
    idioms: Suggestion[];
    paraphrases: Suggestion[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    suggestions: SuggestionsData | null;
}

const SuggestionSection: React.FC<{ title: string; icon: React.ReactNode; suggestions: Suggestion[] }> = ({ title, icon, suggestions }) => {
    if (!suggestions || suggestions.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2 border-b border-neutral-200 pb-2">
                {icon}
                {title}
            </h4>
            <ul className="space-y-3">
                {suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                        {s.suggestion === 'learn' ? (
                            <Check size={16} className="text-green-500 shrink-0 mt-0.5" />
                        ) : (
                            <MinusCircle size={16} className="text-neutral-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                            <p className={`font-bold text-sm ${s.suggestion === 'ignore' ? 'text-neutral-500' : 'text-neutral-900'}`}>{s.item}</p>
                            <p className="text-xs text-neutral-600 italic">&quot;{s.reason}&quot;</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const LearningSuggestionModal: React.FC<Props> = ({ isOpen, onClose, suggestions }) => {
    if (!isOpen || !suggestions) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><Lightbulb size={20} className="text-amber-500"/> Learning Suggestions</h3>
                        <p className="text-sm text-neutral-500 mt-1">{suggestions.overall_summary}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 overflow-y-auto space-y-6">
                    <SuggestionSection title="Word Family" icon={<BookOpen size={14}/>} suggestions={suggestions.wordFamily} />
                    <SuggestionSection title="Collocations" icon={<Combine size={14}/>} suggestions={suggestions.collocations} />
                    <SuggestionSection title="Idioms" icon={<Quote size={14}/>} suggestions={suggestions.idioms} />
                    <SuggestionSection title="Paraphrases (Word Power)" icon={<Zap size={14}/>} suggestions={suggestions.paraphrases} />
                </main>
            </div>
        </div>
    );
};

export default LearningSuggestionModal;
