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
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/50">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${percentage}%` }} />
            </div>
        </div>
    );
};

export const DayProgress: React.FC<Props> = ({ learnedToday, reviewedToday, maxLearn, maxReview, learnedWords, reviewedWords, onViewWord }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
    const allTodayWords = [...learnedWords, ...reviewedWords].sort((a,b) => (b.lastReview || 0) - (a.lastReview || 0));

    return (
        <section className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2"><CalendarCheck size={18} /> Daily Progress</h3>
                    <p className="text-xs text-neutral-400 font-medium">Your learning and review activity for today.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <p className="text-2xl font-black text-blue-600">{learnedToday}</p>
                        <p className="text-[9px] font-bold text-blue-500 uppercase">Learned</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-black text-orange-600">{reviewedToday}</p>
                        <p className="text-[9px] font-bold text-orange-500 uppercase">Reviewed</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-100 space-y-4">
                <div className="flex gap-4">
                    <ProgressBar value={learnedToday} max={maxLearn} label="Learn Goal" />
                    <ProgressBar value={reviewedToday} max={maxReview} label="Review Goal" />
                </div>
                
                {allTodayWords.length > 0 && (
                    <div>
                        <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex justify-between items-center text-left py-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Today's Activity ({allTodayWords.length})</h4>
                            {isExpanded ? <ChevronDown size={16} className="text-neutral-400"/> : <ChevronRight size={16} className="text-neutral-400"/>}
                        </button>
                        {isExpanded && (
                            <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-2">
                                {allTodayWords.map(word => (
                                    <button 
                                        key={word.id} 
                                        onClick={() => onViewWord(word)}
                                        className="w-full flex items-center gap-2 text-left p-2 rounded-lg hover:bg-neutral-50"
                                    >
                                        <div className={`w-2 h-2 rounded-full ${learnedWords.some(lw => lw.id === word.id) ? 'bg-blue-500' : 'bg-orange-500'}`} />
                                        <span className="text-sm font-bold text-neutral-800 flex-1 truncate">{word.word}</span>
                                        <span className="text-xs text-neutral-400 font-mono">{new Date(word.lastReview!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};