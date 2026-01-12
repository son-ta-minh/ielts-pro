import React from 'react';
import { Target } from 'lucide-react';
import { DailyGoalConfig } from '../../app/settingsManager';

interface GoalSettingsProps {
    goalConfig: DailyGoalConfig;
    onGoalConfigChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const GoalSettings: React.FC<GoalSettingsProps> = ({ goalConfig, onGoalConfigChange }) => {
    return (
        <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col space-y-6">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-50 text-green-600 rounded-2xl"><Target size={24} /></div>
                <div>
                    <h3 className="text-xl font-black text-neutral-900">Daily Goals</h3>
                    <p className="text-xs text-neutral-400">Set your daily learning and review targets.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-neutral-100">
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">Max New Words per Day</label>
                    <input 
                        type="number" 
                        step="1" 
                        min="1" 
                        name="max_learn_per_day" 
                        value={goalConfig.max_learn_per_day} 
                        onChange={onGoalConfigChange} 
                        className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" 
                    />
                    <p className="text-[9px] text-neutral-400 mt-1">Target for learning new vocabulary.</p>
                </div>
                <div>
                    <label className="block text-sm font-bold text-neutral-600 mb-1">Max Reviews per Day</label>
                    <input 
                        type="number" 
                        step="1" 
                        min="1" 
                        name="max_review_per_day" 
                        value={goalConfig.max_review_per_day} 
                        onChange={onGoalConfigChange} 
                        className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold" 
                    />
                    <p className="text-[9px] text-neutral-400 mt-1">Target for reviewing existing vocabulary.</p>
                </div>
            </div>
        </section>
    );
};