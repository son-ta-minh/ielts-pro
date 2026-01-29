import React from 'react';
import { Type, Minus, Plus } from 'lucide-react';

interface Props {
    fontSize: number;
    setFontSize: (s: number) => void;
    isSerif: boolean;
    toggleFontFamily: () => void;
}

export const TextFormatControls: React.FC<Props> = ({ fontSize, setFontSize, isSerif, toggleFontFamily }) => (
    <div className="flex items-center gap-1 px-1">
        <button onClick={toggleFontFamily} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors" title={isSerif ? "Switch to Sans-Serif" : "Switch to Serif"}><Type size={16} /></button>
        <div className="w-px h-4 bg-neutral-200 mx-1"></div>
        <button onClick={() => setFontSize(Math.max(12, fontSize - 1))} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors" aria-label="Decrease font size"><Minus size={14} /></button>
        <span className="text-[10px] font-black min-w-[24px] text-center select-none text-neutral-400" aria-live="polite">{fontSize}px</span>
        <button onClick={() => setFontSize(Math.min(24, fontSize + 1))} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors" aria-label="Increase font size"><Plus size={14} /></button>
    </div>
);
