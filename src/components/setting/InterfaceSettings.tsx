import React, { useState } from 'react';
import { LayoutTemplate, Table, List, Eye } from 'lucide-react';
import { DEFAULT_VISIBILITY } from '../word_lib/WordTable_UI';

interface InterfaceSettingsProps {
    // No props needed as it manages localStorage directly
}

const ToggleSwitch = ({ checked, onChange, label, subLabel }: { checked: boolean; onChange: (c: boolean) => void; label: string; subLabel?: string }) => (
    <label onClick={(e) => { e.preventDefault(); onChange(!checked); }} className="flex items-center justify-between px-4 py-3 cursor-pointer group hover:bg-neutral-50 rounded-xl transition-all border border-transparent hover:border-neutral-100">
        <div className="flex flex-col">
            <span className="text-xs font-bold text-neutral-700 group-hover:text-neutral-900">{label}</span>
            {subLabel && <span className="text-[10px] text-neutral-400 font-medium">{subLabel}</span>}
        </div>
        <div className={`w-9 h-5 rounded-full transition-all flex items-center p-1 ${checked ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
            <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
    </label>
);

export const InterfaceSettings: React.FC<InterfaceSettingsProps> = () => {
    // Library Table Defaults
    const [libVis, setLibVis] = useState(() => {
        try {
            const stored = localStorage.getItem('ielts_pro_library_view_settings');
            return stored ? { ...DEFAULT_VISIBILITY, ...JSON.parse(stored) } : DEFAULT_VISIBILITY;
        } catch { return DEFAULT_VISIBILITY; }
    });

    // Unit List Defaults
    const [unitVis, setUnitVis] = useState(() => {
        try {
            const stored = localStorage.getItem('ielts_pro_unit_visibility');
            return stored ? JSON.parse(stored) : { showDesc: false, showWords: true, showStatus: true };
        } catch { return { showDesc: false, showWords: true, showStatus: true }; }
    });

    // Word Detail View Defaults
    const [wordViewVis, setWordViewVis] = useState(() => {
        const defaultSettings = { showHidden: false, highlightFailed: true, isLearnView: true };
        try {
            const stored = localStorage.getItem('ielts_pro_word_view_settings');
            return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
        } catch { return defaultSettings; }
    });

    // Handlers
    const handleLibVisChange = (key: string, val: boolean) => {
        const newVal = { ...libVis, [key]: val };
        setLibVis(newVal);
        localStorage.setItem('ielts_pro_library_view_settings', JSON.stringify(newVal));
    };

    const handleUnitVisChange = (key: string, val: boolean) => {
        const newVal = { ...unitVis, [key]: val };
        setUnitVis(newVal);
        localStorage.setItem('ielts_pro_unit_visibility', JSON.stringify(newVal));
    };

    const handleWordViewVisChange = (key: string, val: boolean) => {
        const newVal = { ...wordViewVis, [key]: val };
        setWordViewVis(newVal);
        localStorage.setItem('ielts_pro_word_view_settings', JSON.stringify(newVal));
    };

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-8 animate-in fade-in duration-300">
            
            {/* Header */}
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl"><LayoutTemplate size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Interface Defaults</h3>
                    <p className="text-xs text-neutral-400">Customize what you see across the app.</p>
                </div>
            </div>

            {/* Library Table Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><Table size={12}/> Word Library Columns</div>
                <div className="bg-white border border-neutral-200 rounded-2xl p-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <ToggleSwitch checked={libVis.showMeaning} onChange={(v) => handleLibVisChange('showMeaning', v)} label="Definition / Meaning" />
                    <ToggleSwitch checked={libVis.blurMeaning} onChange={(v) => handleLibVisChange('blurMeaning', v)} label="Blur Definition (Spoiler)" subLabel="Hide meaning until hovered" />
                    <ToggleSwitch checked={libVis.showIPA} onChange={(v) => handleLibVisChange('showIPA', v)} label="IPA Phonetic" />
                    <ToggleSwitch checked={libVis.showProgress} onChange={(v) => handleLibVisChange('showProgress', v)} label="Progress Badge" />
                    <ToggleSwitch checked={libVis.showDue} onChange={(v) => handleLibVisChange('showDue', v)} label="Due Date" />
                    <ToggleSwitch checked={libVis.showAiIcon} onChange={(v) => handleLibVisChange('showAiIcon', v)} label="AI Refined Indicator" />
                    <ToggleSwitch checked={libVis.showComplexity} onChange={(v) => handleLibVisChange('showComplexity', v)} label="Complexity Column" />
                </div>
            </div>

            {/* Unit List Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><List size={12}/> Essay / Unit List Columns</div>
                <div className="bg-white border border-neutral-200 rounded-2xl p-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <ToggleSwitch checked={unitVis.showDesc} onChange={(v) => handleUnitVisChange('showDesc', v)} label="Description" />
                    <ToggleSwitch checked={unitVis.showWords} onChange={(v) => handleUnitVisChange('showWords', v)} label="Word Count" />
                    <ToggleSwitch checked={unitVis.showStatus} onChange={(v) => handleUnitVisChange('showStatus', v)} label="Completion Status" />
                </div>
            </div>

            {/* Word Detail View Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1"><Eye size={12}/> Word Detail View</div>
                <div className="bg-white border border-neutral-200 rounded-2xl p-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <ToggleSwitch checked={wordViewVis.isLearnView} onChange={(v) => handleWordViewVisChange('isLearnView', v)} label="Learn View by Default" subLabel="Hides extra info like examples, tags" />
                    <ToggleSwitch checked={wordViewVis.highlightFailed} onChange={(v) => handleWordViewVisChange('highlightFailed', v)} label="Highlight Failed Tests" subLabel="Red highlight for failed drill items" />
                    <ToggleSwitch checked={wordViewVis.showHidden} onChange={(v) => handleWordViewVisChange('showHidden', v)} label="Show Ignored Items" subLabel="Show ignored collocations/family members" />
                </div>
            </div>

        </section>
    );
};