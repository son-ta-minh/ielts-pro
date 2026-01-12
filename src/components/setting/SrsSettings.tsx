import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { SrsConfig } from '../../app/settingsManager';

interface SrsSettingsProps {
    srsConfig: SrsConfig;
    onSrsConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onResetSrsConfig: () => void;
    onSaveSettings: () => void;
}

export const SrsSettings: React.FC<SrsSettingsProps> = ({ srsConfig, onSrsConfigChange, onResetSrsConfig, onSaveSettings }) => {
    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl"><BrainCircuit size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Spaced Repetition Algorithm</h3>
                    <p className="text-xs text-neutral-400">Customize the learning intervals and multipliers.</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-neutral-100">
                <div className="col-span-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1">Initial Intervals</div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">New word (Easy)</label>
                    <input type="number" step="1" min="1" name="initialEasy" value={srsConfig.initialEasy} onChange={onSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" />
                    <p className="text-[9px] text-neutral-400 mt-1">Next review in X days.</p>
                </div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">New word (Hard)</label>
                    <input type="number" step="1" min="1" name="initialHard" value={srsConfig.initialHard} onChange={onSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" />
                    <p className="text-[9px] text-neutral-400 mt-1">Next review in X days.</p>
                </div>
                <div className="col-span-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest px-1 pt-2">Interval Multipliers</div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">'Easy' after 'Easy'</label>
                    <input type="number" step="0.1" min="1" name="easyEasy" value={srsConfig.easyEasy} onChange={onSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" />
                    <p className="text-[9px] text-neutral-400 mt-1">Grows interval fastest (e.g., 2.5x).</p>
                </div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">'Easy' after 'Hard'</label>
                    <input type="number" step="0.1" min="1" name="hardEasy" value={srsConfig.hardEasy} onChange={onSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" />
                    <p className="text-[9px] text-neutral-400 mt-1">Helps recover from a 'Hard' rating (e.g., 2.0x).</p>
                </div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">'Hard' after 'Hard'</label>
                    <input type="number" step="0.1" min="1" name="hardHard" value={srsConfig.hardHard} onChange={onSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" />
                    <p className="text-[9px] text-neutral-400 mt-1">Slowly increases interval (e.g., 1.3x).</p>
                </div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">'Hard' after 'Easy' (Penalty)</label>
                    <input type="number" step="0.1" max="1" name="easyHardPenalty" value={srsConfig.easyHardPenalty} onChange={onSrsConfigChange} className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" />
                    <p className="text-[9px] text-neutral-400 mt-1">Reduces interval if you forget (e.g., 0.5x).</p>
                </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-neutral-100">
                <button onClick={onResetSrsConfig} type="button" className="flex-1 py-3 bg-neutral-100 text-neutral-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-200 transition-all">Reset Defaults</button>
                <button onClick={onSaveSettings} type="button" className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all">Save Settings</button>
            </div>
        </section>
    );
};
