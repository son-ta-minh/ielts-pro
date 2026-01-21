import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb } from 'lucide-react';

interface TestModalFooterProps {
    onBack: () => void;
    onNext: () => void;
    onIgnore: () => void;
    onHint: () => void;
    showHint: boolean;
    isBackDisabled: boolean;
    isNextDisabled: boolean;
    isLastChallenge: boolean;
    nextLabel?: string;
    disableHints?: boolean;
}

export const TestModalFooter: React.FC<TestModalFooterProps> = ({ 
    onBack, onNext, onIgnore, onHint, showHint, isBackDisabled, isNextDisabled, isLastChallenge, nextLabel, disableHints
}) => {
    // Determine if we should show the "Finish" checkmark icon
    // We only show it if it's the absolute last challenge and no custom label (like "Next Item") is provided
    const showCheckmark = isLastChallenge && !nextLabel;

    return (
        <div className="p-4 bg-white border-t border-neutral-100 flex items-center justify-between gap-3 shrink-0">
            <button 
                onClick={onBack}
                disabled={isBackDisabled}
                className="p-4 rounded-2xl bg-neutral-50 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-neutral-50 disabled:hover:text-neutral-400 transition-all"
                title="Previous Question"
            >
                <ArrowLeft size={20} />
            </button>

            {!isLastChallenge && !isNextDisabled && (
                <button
                    onClick={onIgnore}
                    className="px-4 py-4 rounded-2xl text-neutral-400 hover:text-neutral-600 font-bold text-xs uppercase tracking-wider hover:bg-neutral-50 transition-colors"
                >
                    Ignore
                </button>
            )}
            
            {!isNextDisabled && !disableHints && (
                <button
                    onClick={onHint}
                    className={`p-4 rounded-2xl transition-colors ${showHint ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100' : 'text-neutral-400 hover:text-yellow-500 hover:bg-neutral-50'}`}
                    title="Show Hint"
                >
                    <Lightbulb size={20} className={showHint ? "fill-yellow-500" : ""} />
                </button>
            )}

            <button 
                onClick={onNext}
                disabled={isNextDisabled}
                className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 bg-neutral-900 text-white hover:bg-neutral-800`}
            >
                <span>{nextLabel || (isLastChallenge ? 'Finish' : 'Next')}</span>
                {showCheckmark ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
            </button>
        </div>
    );
};