
import React, { useState } from 'react';
import { VocabularyItem } from '../../app/types';
import { CalendarCheck, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
    learnedToday: number;
    reviewedToday: number;
    maxLearn: number;
    maxReview: number;
    learnedWords: VocabularyItem[];
    reviewedWords: VocabularyItem[];
    onViewWord: (word: VocabularyItem) => void;
}

const ProgressBar: React.FC<{ value: number, max: number, label: string }> = ({ value, max, label }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{label}</span>
                <span className="text-xs font-bold text-neutral-500">{value} / {max}</span>
            </div>
            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/50">
                <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
};

const getScoreBadgeClasses = (score: number | undefined | null): string => {
    const s = score ?? 0;
    if (s >= 80) return 'bg-green-100 text-green-700';
    if (s >= 50) return 'bg-yellow-100 text-yellow-700';
    if (s > 0) return 'bg-orange-100 text-orange-700';
    return 'bg-neutral-100 text-neutral-500';
};

export const DayProgress: React.FC<Props> = ({ learnedToday, reviewedToday, maxLearn, maxReview, learnedWords, reviewedWords, onViewWord }) => {
    const allTodayWords = [...learnedWords, ...reviewedWords].sort((a,b) => (b.lastReview || 0) - (a.lastReview || 0));

    return (
        <section className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
                <div className="space-y-0.5">
                    <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest flex items-center gap-2">Daily Progress</h3>
                    <p className="text-[10px] text-neutral-400 font-medium">Activity for today.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-center">
                        <p className="text-xl font-black text-blue-600 leading-none">{learnedToday}</p>
                        <p className="text-[8px] font-bold text-blue-500 uppercase tracking-wider">New</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-black text-orange-600 leading-none">{reviewedToday}</p>
                        <p className="text-[8px] font-bold text-orange-500 uppercase tracking-wider">Rev</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 flex-1">
                <div className="flex flex-col gap-2">
                    <ProgressBar value={learnedToday} max={maxLearn} label="Learn Goal" />
                    <ProgressBar value={reviewedToday} max={maxReview} label="Review Goal" />
                </div>
                
                {allTodayWords.length > 0 ? (
                    <div className="pt-2 border-t border-neutral-100 flex-1 min-h-0 flex flex-col">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Recent Activity ({allTodayWords.length})</h4>
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar max-h-32">
                            {allTodayWords.map(word => (
                                <button 
                                    key={word.id} 
                                    onClick={() => onViewWord(word)}
                                    className="w-full flex items-center gap-2 text-left p-1.5 rounded-lg hover:bg-neutral-50 group"
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${learnedWords.some(lw => lw.id === word.id) ? 'bg-blue-500' : 'bg-orange-500'}`} />
                                    <span className="text-xs font-bold text-neutral-700 flex-1 truncate group-hover:text-neutral-900">{word.word}</span>
                                    <span className={`text-[9px] font-black px-1 py-0.5 rounded ${getScoreBadgeClasses(word.masteryScore)}`}>{word.masteryScore ?? 0}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[10px] text-neutral-300 italic pt-4">
                        No activity recorded today.
                    </div>
                )}
            </div>
        </section>
    );
};
