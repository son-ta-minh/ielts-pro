import React from 'react';
import { Mic, Square } from 'lucide-react';

interface Props {
    isListening: boolean;
    onClick: () => void;
    disabled: boolean;
    className?: string;
}

export const SpeechInputButton: React.FC<Props> = ({ isListening, onClick, disabled, className }) => (
    <button 
        onClick={onClick} 
        disabled={disabled} 
        className={`p-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center
            ${isListening 
                ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-200 border-transparent' 
                : 'bg-white border border-neutral-200 text-neutral-400 hover:text-indigo-600 hover:border-indigo-300'
            } ${className}`}
        title={isListening ? "Stop Recording" : "Use Voice Input"}
        tabIndex={-1}
    >
        {isListening ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
    </button>
);
