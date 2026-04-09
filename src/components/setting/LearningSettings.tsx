import React, { useMemo, useState } from 'react';
import { GraduationCap, Plus, Save, Trash2 } from 'lucide-react';
import { LessonConfig } from '../../app/settingsManager';

interface Props {
    lessonConfig: LessonConfig;
    onConfigChange: (section: 'lesson', key: any, value: any) => void;
    onSaveSettings: () => void;
}

const normalizeKnowledgeType = (value: string) => value.trim().replace(/\s+/g, ' ');

export const LearningSettings: React.FC<Props> = ({ lessonConfig, onConfigChange, onSaveSettings }) => {
    const [newKnowledgeType, setNewKnowledgeType] = useState('');

    const knowledgeTypes = useMemo(
        () => (lessonConfig.knowledgeTypes || []).map(normalizeKnowledgeType).filter(Boolean),
        [lessonConfig.knowledgeTypes]
    );

    const updateKnowledgeTypes = (nextTypes: string[]) => {
        onConfigChange('lesson', null, {
            ...lessonConfig,
            knowledgeTypes: nextTypes
        });
    };

    const handleAddKnowledgeType = () => {
        const nextType = normalizeKnowledgeType(newKnowledgeType);
        if (!nextType) return;

        const exists = knowledgeTypes.some((item) => item.toLowerCase() === nextType.toLowerCase());
        if (exists) return;

        updateKnowledgeTypes([...knowledgeTypes, nextType]);
        setNewKnowledgeType('');
    };

    const handleDeleteKnowledgeType = (target: string) => {
        updateKnowledgeTypes(knowledgeTypes.filter((item) => item !== target));
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl"><GraduationCap size={24} /></div>
                    <div>
                        <h3 className="text-xl font-black text-neutral-900">Knowledge Types</h3>
                        <p className="text-xs text-neutral-400">Create dynamic card groups for Knowledge Library.</p>
                    </div>
                </div>
                <button onClick={onSaveSettings} className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-800 transition-all">
                    <Save size={14} />
                    <span>Save</span>
                </button>
            </div>

            <div className="p-6 bg-neutral-50 rounded-[2rem] border border-neutral-100 space-y-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Add New Type</label>
                    <div className="flex flex-col md:flex-row gap-3">
                        <input
                            value={newKnowledgeType}
                            onChange={(e) => setNewKnowledgeType(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddKnowledgeType();
                                }
                            }}
                            placeholder="e.g. Tech, Management, Finance"
                            className="flex-1 px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 outline-none"
                        />
                        <button
                            onClick={handleAddKnowledgeType}
                            disabled={!normalizeKnowledgeType(newKnowledgeType)}
                            className="px-4 py-3 bg-neutral-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-neutral-800 disabled:opacity-50"
                        >
                            <Plus size={14} />
                            <span>Add Type</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Active Types</label>
                    {knowledgeTypes.length === 0 ? (
                        <div className="p-6 text-center text-xs text-neutral-400 bg-white rounded-2xl border border-neutral-200">
                            No dynamic knowledge types yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {knowledgeTypes.map((item) => (
                                <div key={item} className="flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-2xl border border-neutral-200">
                                    <span className="font-bold text-sm text-neutral-800">{item}</span>
                                    <button
                                        onClick={() => handleDeleteKnowledgeType(item)}
                                        className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                        title={`Delete ${item}`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};
