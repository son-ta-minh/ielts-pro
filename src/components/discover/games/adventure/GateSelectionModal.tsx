import React from 'react';
import { X, Star, BookOpen, Brain, Swords, CheckCircle2, ChevronRight } from 'lucide-react';
import { AdventureSegment } from '../../../../data/adventure_content';
import { AdventureProgress } from '../../../../app/types';

interface GateButtonProps {
    title: string;
    wordCount: number;
    isMastered: boolean;
    onClick: () => void;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    disabled?: boolean;
}

const GateButton: React.FC<GateButtonProps> = ({ title, wordCount, isMastered, onClick, icon: Icon, color, bgColor, borderColor, disabled = false }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`group relative p-6 rounded-3xl border-2 text-left w-full transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${isMastered ? 'bg-white' : bgColor} ${borderColor}`}
    >
        <div className="flex justify-between items-start">
            <div className={`p-3 rounded-2xl ${isMastered ? 'bg-neutral-100' : 'bg-white/20'}`}>
                <Icon size={24} className={color} />
            </div>
            {isMastered && <CheckCircle2 size={20} className="text-green-500 fill-white" />}
        </div>
        <div className="mt-8">
            <h4 className={`text-lg font-black ${isMastered ? 'text-neutral-400' : 'text-white'}`}>{title}</h4>
            <p className={`text-sm font-medium ${isMastered ? 'text-neutral-400' : 'text-white/70'}`}>{wordCount} words</p>
        </div>
        {!isMastered && <div className="absolute bottom-4 right-6 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight size={20} className="text-white" /></div>}
    </button>
);

interface Props {
    isOpen: boolean;
    onClose: () => void;
    segment: AdventureSegment;
    chapterId: string;
    progress: AdventureProgress;
    onStartSession: (wordList: string[]) => void;
    onChallengeBoss: (chapterId: string, segment: AdventureSegment) => void;
}

export const GateSelectionModal: React.FC<Props> = ({ isOpen, onClose, segment, chapterId, progress, onStartSession, onChallengeBoss }) => {
    if (!isOpen) return null;

    const stars = progress.segmentStars[segment.id] || 0;
    const hasBadge = progress.badges.includes(segment.boss.dropBadgeId);
    const canChallengeBoss = stars === 3 && !hasBadge;

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-neutral-900/50 backdrop-blur-xl w-full max-w-2xl rounded-[3rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <header className="p-6 flex justify-between items-center text-white shrink-0">
                    <div className="space-y-0.5">
                        <h3 className="text-2xl font-black tracking-tight">{segment.title}</h3>
                        <div className="flex gap-1.5">
                            {[1, 2, 3].map(s => (<Star key={s} size={18} className={`transition-colors duration-500 ${stars >= s ? 'text-amber-400 fill-amber-400' : 'text-white/20'}`} />))}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
                </header>
                <main className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <GateButton
                        title="Basic Words"
                        wordCount={segment.basicWords.length}
                        isMastered={stars >= 1}
                        onClick={() => onStartSession(segment.basicWords)}
                        icon={BookOpen}
                        color="text-sky-400"
                        bgColor="bg-sky-900/50"
                        borderColor="border-sky-500/50"
                    />
                    <GateButton
                        title="Intermediate"
                        wordCount={segment.intermediateWords.length}
                        isMastered={stars >= 2}
                        onClick={() => onStartSession(segment.intermediateWords)}
                        icon={Brain}
                        color="text-emerald-400"
                        bgColor="bg-emerald-900/50"
                        borderColor="border-emerald-500/50"
                    />
                    <GateButton
                        title="Advanced"
                        wordCount={segment.advancedWords.length}
                        isMastered={stars >= 3}
                        onClick={() => onStartSession(segment.advancedWords)}
                        icon={Swords}
                        color="text-rose-400"
                        bgColor="bg-rose-900/50"
                        borderColor="border-rose-500/50"
                    />
                </main>
                {canChallengeBoss && (
                    <footer className="p-6 pt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <button 
                            onClick={() => onChallengeBoss(chapterId, segment)}
                            className="w-full p-6 rounded-3xl bg-red-600 text-white flex flex-col items-center justify-center text-center transition-all transform hover:scale-[1.02] hover:shadow-2xl shadow-red-500/20"
                        >
                            <Swords size={32} className="mb-2"/>
                            <h4 className="text-lg font-black uppercase tracking-widest">Challenge Boss</h4>
                            <p className="text-xs font-medium text-white/70">&quot;{segment.boss.name}&quot; awaits!</p>
                        </button>
                    </footer>
                )}
            </div>
        </div>
    );
};
