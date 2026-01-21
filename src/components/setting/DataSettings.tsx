import React, { useState } from 'react';
import { FileJson, Upload, Download, RefreshCw, Loader2, Gamepad2, Wrench } from 'lucide-react';

interface DataSettingsProps {
    jsonInputRef: React.RefObject<HTMLInputElement>;
    includeProgress: boolean;
    setIncludeProgress: (value: boolean) => void;
    includeEssays: boolean;
    setIncludeEssays: (value: boolean) => void;
    onJSONImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onJSONExport: () => void;
    isNormalizing: boolean;
    onOpenNormalizeModal: () => void;
}

const ToggleSwitch = ({ checked, onChange, label, subLabel }: { checked: boolean; onChange: (c: boolean) => void; label: string; subLabel: string }) => (
    <label onClick={(e) => { e.preventDefault(); onChange(!checked); }} className="flex items-center justify-between px-6 py-4 cursor-pointer group hover:bg-white hover:shadow-sm rounded-xl transition-all">
        <div className="flex flex-col"><span className="text-[10px] font-black text-neutral-400 group-hover:text-neutral-900 uppercase tracking-widest">{label}</span><span className="text-[8px] text-neutral-400 font-bold italic">{subLabel}</span></div>
        <div className={`w-10 h-6 rounded-full transition-all flex items-center p-1 ${checked ? 'bg-neutral-900' : 'bg-neutral-200'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} /></div>
    </label>
);

export const DataSettings: React.FC<DataSettingsProps> = ({
    jsonInputRef, includeProgress, setIncludeProgress, includeEssays, setIncludeEssays, onJSONImport, onJSONExport, isNormalizing, onOpenNormalizeModal
}) => {

    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4 mb-2">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><FileJson size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Data Management</h3>
                    <p className="text-xs text-neutral-400">Sync files and optimize your local library.</p>
                </div>
            </div>

            <div className="p-1 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-1">
                <ToggleSwitch checked={includeProgress} onChange={setIncludeProgress} label="Include Progress" subLabel="Sync SRS learning data" />
                <ToggleSwitch checked={includeEssays} onChange={setIncludeEssays} label="Include Essay Content" subLabel="Sync generated Unit essays" />
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
                        <div className="text-[9px] font-bold text-neutral-400 mt-1">Clean legacy data from phrases</div>
                    </div>
                </button>
            </div>
        </section>
    );
};