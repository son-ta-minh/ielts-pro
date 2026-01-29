
import React, { useState } from 'react';
import { BookText, Plus, Trash2, Save, ChevronRight, List } from 'lucide-react';
import { LessonConfig } from '../../app/settingsManager';

interface LessonSettingsProps {
    lessonConfig: LessonConfig;
    onLessonConfigChange: (newConfig: LessonConfig) => void;
    onSaveSettings: () => void;
}

export const LessonSettings: React.FC<LessonSettingsProps> = ({ lessonConfig, onLessonConfigChange, onSaveSettings }) => {
    const [mainTopics, setMainTopics] = useState(lessonConfig.topic1Options);
    const [subTopics, setSubTopics] = useState(lessonConfig.topic2Options);
    const [newMainTopic, setNewMainTopic] = useState('');
    const [activeMainTopic, setActiveMainTopic] = useState<string | null>(mainTopics[0] || null);
    const [newSubTopic, setNewSubTopic] = useState('');

    const handleAddMainTopic = () => {
        const topic = newMainTopic.trim();
        if (topic && !mainTopics.includes(topic)) {
            const newMain = [...mainTopics, topic];
            setMainTopics(newMain);
            setSubTopics(prev => ({...prev, [topic]: [] }));
            setNewMainTopic('');
        }
    };

    const handleDeleteMainTopic = (topicToDelete: string) => {
        const newMain = mainTopics.filter(t => t !== topicToDelete);
        setMainTopics(newMain);
        const newSub = {...subTopics};
        delete newSub[topicToDelete];
        setSubTopics(newSub);
        if (activeMainTopic === topicToDelete) {
            setActiveMainTopic(newMain[0] || null);
        }
    };

    const handleAddSubTopic = () => {
        if (!activeMainTopic) return;
        const sub = newSubTopic.trim();
        const currentSubs = subTopics[activeMainTopic] || [];
        if (sub && !currentSubs.includes(sub)) {
            setSubTopics(prev => ({
                ...prev,
                [activeMainTopic]: [...currentSubs, sub]
            }));
            setNewSubTopic('');
        }
    };

    const handleDeleteSubTopic = (subToDelete: string) => {
        if (!activeMainTopic) return;
        setSubTopics(prev => ({
            ...prev,
            [activeMainTopic]: (prev[activeMainTopic] || []).filter(s => s !== subToDelete)
        }));
    };
    
    const handleSave = () => {
        onLessonConfigChange({ topic1Options: mainTopics, topic2Options: subTopics });
        onSaveSettings();
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-cyan-50 text-cyan-600 rounded-2xl"><BookText size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Lesson Topic Settings</h3>
                    <p className="text-xs text-neutral-400">Manage the categories for your lessons.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-neutral-100">
                {/* Main Topics */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><List size={12}/> Main Topics</h4>
                    <div className="flex gap-2">
                        <input value={newMainTopic} onChange={e => setNewMainTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMainTopic()} placeholder="New main topic..." className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold" />
                        <button onClick={handleAddMainTopic} className="p-2.5 bg-neutral-900 text-white rounded-lg"><Plus size={14}/></button>
                    </div>
                    <div className="space-y-2 p-2 bg-neutral-50 rounded-lg border border-neutral-100 max-h-60 overflow-y-auto">
                        {mainTopics.map(topic => (
                            <button key={topic} onClick={() => setActiveMainTopic(topic)} className={`w-full text-left flex justify-between items-center p-3 rounded-md transition-colors ${activeMainTopic === topic ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-neutral-100'}`}>
                                <span className="font-bold text-sm">{topic}</span>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-neutral-400">({(subTopics[topic] || []).length})</span>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteMainTopic(topic); }} className="p-1 text-neutral-400 hover:text-red-500 rounded-full"><Trash2 size={12}/></button>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Sub Topics */}
                <div className="space-y-4">
                     <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2"><ChevronRight size={12}/> Sub-topics for <span className="text-indigo-600">{activeMainTopic}</span></h4>
                     {activeMainTopic ? (
                         <>
                            <div className="flex gap-2">
                                <input value={newSubTopic} onChange={e => setNewSubTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubTopic()} placeholder="New sub-topic..." className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold" />
                                <button onClick={handleAddSubTopic} className="p-2.5 bg-neutral-900 text-white rounded-lg"><Plus size={14}/></button>
                            </div>
                            <div className="space-y-2 p-2 bg-neutral-50 rounded-lg border border-neutral-100 max-h-60 overflow-y-auto">
                                {(subTopics[activeMainTopic] || []).map(sub => (
                                    <div key={sub} className="flex justify-between items-center p-3 rounded-md hover:bg-neutral-100">
                                        <span className="font-medium text-sm text-neutral-700">{sub}</span>
                                        <button onClick={() => handleDeleteSubTopic(sub)} className="p-1 text-neutral-400 hover:text-red-500 rounded-full"><Trash2 size={12}/></button>
                                    </div>
                                ))}
                            </div>
                         </>
                     ) : (
                        <div className="p-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
                            Select a main topic to see its sub-topics.
                        </div>
                     )}
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-100">
                <button onClick={handleSave} className="w-full md:w-auto py-3 px-6 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2">
                    <Save size={16} /> <span>SAVE ALL CHANGES</span>
                </button>
            </div>
        </section>
    );
};
