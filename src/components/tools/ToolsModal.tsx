import React, { useState, useEffect } from 'react';
import { X, ScanLine, Image as ImageIcon, Mic, Library, PenTool, Sparkles } from 'lucide-react';
import { User } from '../../app/types';
import { OCRTool } from './OCRTool';
import { AudioTool } from './AudioTool';
import { ImageManager } from './ImageManager';
import { WordLibraryTool } from './WordLibraryTool';
import { FreeNoteTool } from './FreeNote';
import { PromptHelperTool } from './PromptHelperTool';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    user: User;
}

export const ToolsModal: React.FC<Props> = ({ isOpen, onClose, user }) => {
    const [activeTab, setActiveTab] = useState<'OCR' | 'IMAGES' | 'AUDIO' | 'WORD_LIBRARY' | 'FREE_NOTE' | 'PROMPT_HELPER'>('FREE_NOTE');

    const allTabs = [
        { id: 'FREE_NOTE', label: 'Note', icon: PenTool },
        { id: 'WORD_LIBRARY', label: 'Word Insert', icon: Library },
        { id: 'PROMPT_HELPER', label: 'Prompts', icon: Sparkles },
        // { id: 'OCR', label: 'Image to Text', icon: ScanLine },
        { id: 'IMAGES', label: 'Image Manager', icon: ImageIcon },
        // { id: 'AUDIO', label: 'Audio Tool', icon: Mic },
    ] as const;

    const tabs = allTabs;

    useEffect(() => {
        if (tabs.length > 0) {
            setActiveTab(tabs[0].id);
        }
    }, [isOpen]);

    if (!user) {
        console.warn('[ToolsModal] WARNING: user is undefined');
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col h-[85vh]">
                
                {/* Header */}
                <header className="px-6 py-3 border-b border-neutral-100 flex justify-between items-center shrink-0">
                    <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                                >
                                    <Icon size={16} />
                                    <span className="whitespace-nowrap">{tab.label}</span>
                                </button>
                            )
                        })}
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors"><X size={24}/></button>
                </header>

                {/* Content - Changed overflow-hidden to overflow-y-auto to allow scrolling on small screens */}
                <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
                    {activeTab === 'FREE_NOTE' && <FreeNoteTool user={user} />}
                    {activeTab === 'WORD_LIBRARY' && <WordLibraryTool user={user} />}
                    {activeTab === 'PROMPT_HELPER' && <PromptHelperTool />}
                    {activeTab === 'OCR' && <OCRTool />}
                    {activeTab === 'IMAGES' && <ImageManager />}
                    {activeTab === 'AUDIO' && <AudioTool />}
                </main>
            </div>
        </div>
    );
};
