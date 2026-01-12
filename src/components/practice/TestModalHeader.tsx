
import React from 'react';
import { X, Flag } from 'lucide-react';
import { ChallengeType } from './TestModalTypes';

interface TestModalHeaderProps {
    title: string;
    type: ChallengeType;
    currentStep: number;
    totalSteps: number;
    onClose: () => void;
    onFinish: (stopSession?: boolean) => void;
    label?: string;
    isQuickFire?: boolean;
}

export const TestModalHeader: React.FC<TestModalHeaderProps> = ({ title, type, currentStep, totalSteps, onClose, onFinish, label = "Challenge", isQuickFire }) => {
    return (
        <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50 shrink-0">
            <button onClick={onClose} className="p-2 -ml-2 text-neutral-400 hover:text-neutral-900 transition-colors" title={isQuickFire ? "Exit to Dashboard" : "Close"}>
                <X size={20} />
            </button>
            <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                    {label} {currentStep} of {totalSteps}
                </span>
                <span className="text-xs font-black text-neutral-900">{title}</span>
            </div>
            <button onClick={() => onFinish(isQuickFire)} className="p-2 -mr-2 text-amber-500 hover:text-amber-700 transition-colors" title={isQuickFire ? "Finish Session & See Results" : "Finish & Save"}>
                <Flag size={20} className={isQuickFire ? "fill-amber-500" : ""} />
            </button>
        </div>
    );
};
