
import React, { useState, useEffect } from 'react';
import { FileJson, Upload, Download, RefreshCw, Loader2, Gamepad2, Wrench, Plus, Trash2, Tag, Check, Circle, Ear, BookMarked, Calendar, Cloud, Wifi, Link, ListTodo } from 'lucide-react';
import { DataScope } from '../../app/types';
import { useToast } from '../../contexts/ToastContext';
import ConfirmationModal from '../common/ConfirmationModal';

interface JunkTagManagerProps {
    junkTags: string[];
    onJunkTagsChange: (tags: string[]) => void;
}

const JunkTagManager: React.FC<JunkTagManagerProps> = ({ junkTags, onJunkTagsChange }) => {
    const [newTag, setNewTag] = useState('');

    const handleAdd = () => {
        const tagToAdd = newTag.trim().toLowerCase();
        if (tagToAdd && !junkTags.includes(tagToAdd)) {
            onJunkTagsChange([...junkTags, tagToAdd].sort());
        }
        setNewTag('');
    };
    
    const handleRemove = (tagToRemove: string) => {
        onJunkTagsChange(junkTags.filter(t => t !== tagToRemove));
    };

    return (
        <div className="space-y-4 pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><Tag size={12}/> Junk Tag List</div>
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-3">
                <div className="flex gap-2">
                    <input 
                        value={newTag}
                        onChange={e => setNewTag(e.target.value)}
                        onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                        placeholder="Add a tag to remove..."
                        className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                    />
                    <button onClick={handleAdd} className="p-2.5 bg-neutral-900 text-white rounded-lg flex items-center justify-center"><Plus size={14}/></button>
                </div>
                {junkTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {junkTags.map(tag => (
                            <div key={tag} className="flex items-center gap-1 bg-white pl-3 pr-1 py-1 rounded-full border border-neutral-200 text-xs font-bold text-neutral-700">
                                <span>{tag}</span>
                                <button onClick={() => handleRemove(tag)} className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-full"><Trash2 size={12}/></button>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-center text-xs text-neutral-400 py-2">No junk tags defined.</p>}
            </div>
        </div>
    );
};

interface DataSettingsProps {
    jsonInputRef: React.RefObject<HTMLInputElement>;
    dataScope: DataScope;
    onDataScopeChange: (scope: DataScope) => void;
    onJSONImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onJSONExport: () => void;
    isNormalizing: boolean;
    onOpenNormalizeModal: () => void;
    
    // Junk Tag Props
    junkTags: string[];
    onJunkTagsChange: (tags: string[]) => void;

    // Normalization Options
    normalizeOptions: { removeJunkTags: boolean; removeMultiWordData: boolean; cleanHeadwords: boolean };
    onNormalizeOptionsChange: (options: { removeJunkTags: boolean; removeMultiWordData: boolean; cleanHeadwords: boolean }) => void;
}

const ScopeCheckbox = ({ checked, onChange, label, icon: Icon }: { checked: boolean; onChange: () => void; label: string, icon?: React.ElementType }) => (
    <button onClick={onChange} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${checked ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}>
        {Icon && <Icon size={14} />}
        {checked ? <Check size={14} /> : <Circle size={14} />}
        <span className="text-xs font-bold uppercase">{label}</span>
    </button>
);

export const DataSettings: React.FC<DataSettingsProps> = (props) => {
    const {
        jsonInputRef, dataScope, onDataScopeChange, onJSONImport, onJSONExport, isNormalizing, onOpenNormalizeModal,
        junkTags, onJunkTagsChange, normalizeOptions, onNormalizeOptionsChange
    } = props;

    const toggleScope = (key: keyof DataScope) => {
        onDataScopeChange({ ...dataScope, [key]: !dataScope[key] });
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8">
            <div className="flex items-center space-x-4 mb-2">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><FileJson size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Data Management</h3>
                    <p className="text-xs text-neutral-400">Backup, restore, and optimize your library.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Manual Backup / Restore</label>
                        <div className="flex flex-wrap gap-2">
                            <ScopeCheckbox checked={dataScope.user} onChange={() => toggleScope('user')} label="User Profile" />
                            <ScopeCheckbox checked={dataScope.vocabulary} onChange={() => toggleScope('vocabulary')} label="Word Library" />
                            <ScopeCheckbox checked={dataScope.wordBook} onChange={() => toggleScope('wordBook')} label="Word Books" icon={BookMarked} />
                            <ScopeCheckbox checked={dataScope.lesson} onChange={() => toggleScope('lesson')} label="Lessons" />
                            <ScopeCheckbox checked={dataScope.reading} onChange={() => toggleScope('reading')} label="Reading" />
                            <ScopeCheckbox checked={dataScope.writing} onChange={() => toggleScope('writing')} label="Writing" />
                            <ScopeCheckbox checked={dataScope.speaking} onChange={() => toggleScope('speaking')} label="Speaking" />
                            <ScopeCheckbox checked={dataScope.listening} onChange={() => toggleScope('listening')} label="Listening" />
                            <ScopeCheckbox checked={dataScope.mimic} onChange={() => toggleScope('mimic')} label="Pronunciation Queue" icon={Ear} />
                            <ScopeCheckbox checked={dataScope.calendar} onChange={() => toggleScope('calendar')} label="Calendar" icon={Calendar} />
                            <ScopeCheckbox checked={dataScope.planning} onChange={() => toggleScope('planning')} label="Planning" icon={ListTodo} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => jsonInputRef.current?.click()} className="py-4 border-2 border-neutral-900 text-neutral-900 rounded-2xl font-black text-xs hover:bg-neutral-50 transition-all flex items-center justify-center space-x-2">
                            <Upload size={16} /> <span>IMPORT</span>
                            <input type="file" ref={jsonInputRef} className="hidden" accept=".json" onChange={onJSONImport} />
                        </button>
                        <button onClick={onJSONExport} className="py-4 bg-neutral-900 text-white rounded-2xl font-black text-xs hover:bg-neutral-800 transition-all flex items-center justify-center space-x-2">
                            <Download size={16} /> <span>EXPORT</span>
                        </button>
                    </div>
                </div>
            </div>
            
            <JunkTagManager junkTags={junkTags} onJunkTagsChange={onJunkTagsChange} />

            <div className="pt-4 border-t border-neutral-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                 <button 
                    onClick={onOpenNormalizeModal}
                    disabled={isNormalizing}
                    className="w-full py-4 bg-white border border-neutral-200 rounded-2xl text-neutral-600 hover:bg-neutral-50 transition-all flex items-center justify-center space-x-3 group"
                >
                    <div className="p-2 bg-neutral-100 group-hover:bg-orange-50 rounded-lg transition-colors">
                        {isNormalizing ? <Loader2 size={16} className="animate-spin text-orange-600" /> : <Wrench size={16} className="text-orange-600" />}
                    </div>
                    <div className="text-left">
                        <div className="text-xs font-black uppercase tracking-widest leading-none">Normalize Data</div>
                        <div className="text-[9px] font-bold text-neutral-400 mt-1">Clean junk tags & legacy data</div>
                    </div>
                </button>
            </div>
        </section>
    );
};
