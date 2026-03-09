import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import UniversalAiModal from '../common/UniversalAiModal';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';

interface PromptTemplate {
    id: string;
    name: string;
    template: string;
}

const STORAGE_KEY = 'vocab_pro_prompt_helper_templates_v1';

const DEFAULT_TEMPLATES: PromptTemplate[] = [
    {
        id: 'ipa_distractor',
        name: 'make distractor IPA for word',
        template: `You are an English pronunciation expert.

Word: #Input

Task:
1. Return ONLY 1 - 2 incorrect IPA distractors that learners commonly confuse with this word.
2. Do NOT include the correct pronunciation.
3. Use Cambridge-style IPA notation (slashes and stress marks).
4. Focus on realistic learner errors (vowel shifts, stress misplacement, consonant substitution, syllable reduction).
5. Include only IPA forms (no normal spelling).
6. Output must be compact and single-line.

Output format:
/.../, /.../`
    },
    {
        id: 'distinguish_words',
        name: 'differentiate words',
        template: `Differentiate these words/phrases: #Input

Rules:
- Return ONLY one markdown code block.
- Keep it simple and compact.
- Use bullet list format.
- For each word, include:
  - short meaning
  - 2-3 common collocations
- No extra explanation outside the code block.

Example style:
- **plentiful**: available in large quantities, often for resources or supplies
  - collocations: plentiful resources, plentiful evidence, plentiful supply
- **ample**: more than enough for a specific need or purpose
  - collocations: ample time, ample opportunity, ample space`
    }
];

const createId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const PromptHelperTool: React.FC = () => {
    const mergeWithDefaults = (saved: PromptTemplate[]): PromptTemplate[] => {
        const savedById = new Map(saved.map(item => [item.id, item]));
        const defaultIds = new Set(DEFAULT_TEMPLATES.map(item => item.id));

        const mergedDefaults = DEFAULT_TEMPLATES.map(def => {
            const existing = savedById.get(def.id);
            return existing ? { ...existing, name: def.name, template: def.template } : def;
        });

        const custom = saved.filter(item => !defaultIds.has(item.id));
        return [...mergedDefaults, ...custom];
    };

    const [templates, setTemplates] = useState<PromptTemplate[]>(() => {
        const saved = getStoredJSON<PromptTemplate[]>(STORAGE_KEY, []);
        return saved.length > 0 ? mergeWithDefaults(saved) : DEFAULT_TEMPLATES;
    });
    const [selectedId, setSelectedId] = useState<string>(() => {
        const saved = getStoredJSON<PromptTemplate[]>(STORAGE_KEY, []);
        const seeded = saved.length > 0 ? mergeWithDefaults(saved) : DEFAULT_TEMPLATES;
        return seeded[0]?.id || '';
    });
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);

    const selectedTemplate = useMemo(
        () => templates.find(t => t.id === selectedId) || templates[0] || null,
        [templates, selectedId]
    );

    useEffect(() => {
        if (templates.length === 0) return;
        setStoredJSON(STORAGE_KEY, templates);
    }, [templates]);

    useEffect(() => {
        if (!selectedTemplate && templates.length > 0) {
            setSelectedId(templates[0].id);
        }
    }, [selectedTemplate, templates]);

    const updateSelected = (updater: (current: PromptTemplate) => PromptTemplate) => {
        setTemplates(prev => prev.map(item => {
            if (item.id !== selectedTemplate?.id) return item;
            return updater(item);
        }));
    };

    const handleCreateNew = () => {
        const newItem: PromptTemplate = {
            id: createId(),
            name: 'new prompt',
            template: 'Your prompt here. Use #Input to inject text from modal input.'
        };
        setTemplates(prev => [newItem, ...prev]);
        setSelectedId(newItem.id);
    };

    if (!selectedTemplate) {
        return <div className="p-6 text-sm font-semibold text-neutral-500">No prompt templates available.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Prompt Helper</p>
                        <p className="text-sm font-bold text-neutral-900">Select, edit, or create reusable prompt templates.</p>
                    </div>
                    <button
                        onClick={handleCreateNew}
                        className="px-3 py-2 rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                    >
                        <Plus size={13} />
                        New Prompt
                    </button>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Template</label>
                    <select
                        value={selectedTemplate.id}
                        onChange={(e) => setSelectedId(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                        {templates.map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Prompt Name</label>
                    <input
                        value={selectedTemplate.name}
                        onChange={(e) => updateSelected(current => ({ ...current, name: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="Prompt display name"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Prompt Template</label>
                    <textarea
                        value={selectedTemplate.template}
                        onChange={(e) => updateSelected(current => ({ ...current, template: e.target.value }))}
                        rows={12}
                        className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-xs font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-y"
                    />
                    <p className="text-[11px] font-medium text-neutral-500 px-1">
                        Use <span className="font-black text-neutral-800">#Input</span> to inject content from Universal AI Modal input box.
                    </p>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={() => setIsAiModalOpen(true)}
                        className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                    >
                        <Sparkles size={14} />
                        Generate
                    </button>
                </div>
            </div>

            <UniversalAiModal
                isOpen={isAiModalOpen}
                onClose={() => setIsAiModalOpen(false)}
                type="GENERATE_UNIT"
                title={`Prompt Helper: ${selectedTemplate.name}`}
                description="Enter input and copy the command. No JSON response processing is required."
                initialData={{}}
                onGeneratePrompt={(inputs) => {
                    const sourceInput = typeof inputs?.request === 'string' ? inputs.request : '';
                    return selectedTemplate.template.replace(/#Input/g, sourceInput.trim());
                }}
                onJsonReceived={() => {}}
                copyOnly={true}
            />
        </div>
    );
};
