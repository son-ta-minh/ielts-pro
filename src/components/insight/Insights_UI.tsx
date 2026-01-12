import React from 'react';
import { Brain, Award } from 'lucide-react';
import SkillsRadar from './SkillsRadar';
import ParaphraseInsights from './ParaphraseInsights';

interface InsightsUIProps {
    loading: boolean;
    userId: string;
    total: number;
    learnedCount: number;
    estimatedScore: number;
}

export const InsightsUI: React.FC<InsightsUIProps> = ({ userId, total, learnedCount, estimatedScore }) => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <header>
                <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Learning Insights</h2>
                <p className="text-neutral-500 mt-2 font-medium">Tracking your mastery and skill balance.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-[2rem] border border-neutral-200 shadow-sm flex flex-col justify-between h-full min-h-[320px]">
                    <div className="space-y-6">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-neutral-900 flex items-center"><Brain size={18} className="mr-2"/> Memory Efficiency</h3>
                                <p className="text-xs text-neutral-400 font-medium">Words permanently learned vs Total library.</p>
                            </div>
                            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
                                <span className="text-3xl font-black text-neutral-900">{((learnedCount / (total || 1)) * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                        
                        <div className="space-y-2 pt-2">
                            <div className="flex justify-between text-xs font-bold text-neutral-600">
                                <span>Mastery Progress</span>
                                <span>{learnedCount} / {total} words</span>
                            </div>
                            <div className="h-6 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-100">
                                <div className="h-full bg-neutral-900 transition-all duration-1000 ease-out" style={{ width: `${(learnedCount / (total || 1)) * 100}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-neutral-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Estimated Score</span>
                        <div className="flex items-center space-x-2 text-purple-600 bg-purple-50 px-4 py-2 rounded-xl">
                            <Award size={18} />
                            <span className="text-lg font-black">{estimatedScore.toFixed(0)}</span>
                        </div>
                    </div>
                </div>

                <SkillsRadar userId={userId} />
            </div>
            
            <ParaphraseInsights userId={userId} />
        </div>
    );
};