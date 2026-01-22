
import React from 'react';
import { FlaskConical, Check, X } from 'lucide-react';
import { TestConfig } from '../../app/settingsManager';

// Duplicated structure from TestModal_UI for consistency in settings, but simplified.
const TEST_AREAS = [
    {
        id: 'core',
        title: 'Core Skills',
        types: [
            { id: 'SPELLING', label: 'Spelling (Dictation)' },
            { id: 'PRONUNCIATION', label: 'Pronunciation (Speak)' },
            { id: 'IPA_QUIZ', label: 'IPA Recognition' },
            { id: 'MEANING_QUIZ', label: 'Meaning Select' },
            { id: 'PREPOSITION_QUIZ', label: 'Preposition Fill' },
        ]
    },
    {
        id: 'advanced',
        title: 'Advanced Usage',
        types: [
            { id: 'WORD_FAMILY', label: 'Word Family' },
            { id: 'COLLOCATION_CONTEXT_QUIZ', label: 'Collocation Match' },
            { id: 'COLLOCATION_MULTICHOICE_QUIZ', label: 'Collocation Multi' },
            { id: 'COLLOCATION_QUIZ', label: 'Collocation Fill' },
            { id: 'PARAPHRASE_CONTEXT_QUIZ', label: 'Paraphrase Match' },
            { id: 'PARAPHRASE_QUIZ', label: 'Paraphrase Fill' },
        ]
    },
    {
        id: 'bonus',
        title: 'Context & Flair',
        types: [
            { id: 'IDIOM_QUIZ', label: 'Idiom Fill' },
            { id: 'SENTENCE_SCRAMBLE', label: 'Sentence Builder' },
            { id: 'HETERONYM_QUIZ', label: 'Heteronym Match' },
        ]
    }
];

interface TestSettingsProps {
    testConfig: TestConfig;
    onTestConfigChange: (newConfig: TestConfig) => void;
    onSaveSettings: () => void;
}

export const TestSettings: React.FC<TestSettingsProps> = ({ testConfig, onTestConfigChange, onSaveSettings }) => {
    const selectedSet = new Set(testConfig.preferredTypes);

    const toggleType = (typeId: string) => {
        const newSet = new Set(selectedSet);
        if (newSet.has(typeId)) {
            newSet.delete(typeId);
        } else {
            newSet.add(typeId);
        }
        onTestConfigChange({ ...testConfig, preferredTypes: Array.from(newSet) });
    };

    const selectAll = () => {
        const allTypes = TEST_AREAS.flatMap(g => g.types.map(t => t.id));
        onTestConfigChange({ ...testConfig, preferredTypes: allTypes });
    };

    const selectNone = () => {
        onTestConfigChange({ ...testConfig, preferredTypes: [] });
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-pink-50 text-pink-600 rounded-2xl"><FlaskConical size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Test Preferences</h3>
                    <p className="text-xs text-neutral-400">Choose which challenges appear when you click "Prefer".</p>
                </div>
            </div>

            <div className="flex gap-2">
                <button onClick={selectAll} className="px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-200">Select All</button>
                <button onClick={selectNone} className="px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-neutral-200">Clear</button>
            </div>

            <div className="space-y-6 pt-4 border-t border-neutral-100">
                {TEST_AREAS.map(group => (
                    <div key={group.id} className="space-y-3">
                        <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">{group.title}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {group.types.map(type => {
                                const isSelected = selectedSet.has(type.id);
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => toggleType(type.id)}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                                            isSelected 
                                            ? 'bg-neutral-900 border-neutral-900 text-white' 
                                            : 'bg-white border-neutral-100 text-neutral-500 hover:border-neutral-200'
                                        }`}
                                    >
                                        <span className="text-xs font-bold">{type.label}</span>
                                        {isSelected ? <Check size={14} className="text-white"/> : <div className="w-3.5 h-3.5 rounded-full border border-neutral-200" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

             <div className="flex gap-3 pt-4 border-t border-neutral-100">
                <button onClick={onSaveSettings} className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2">
                    Save Preferences
                </button>
            </div>
        </section>
    );
};
