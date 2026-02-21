
import React, { useState } from 'react';
import { PronunciationRoadmap } from './PronunciationRoadmap';
import { PronunciationFocus } from './PronunciationFocus';
import { VocabularyItem } from '../../app/types';

interface Props {
    scopedWord?: VocabularyItem;
    onClose?: () => void;
}

type PronunciationTab = 'IPA' | 'FOCUS';

export const MimicPractice: React.FC<Props> = ({ scopedWord, onClose }) => {
    const [activeTab, setActiveTab] = useState<PronunciationTab>('IPA');

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-shrink-0 border-b bg-white">
                <div className="px-4 flex items-center justify-center gap-1">
                    <button 
                        onClick={() => setActiveTab('IPA')} 
                        className={`px-4 py-2 text-xs font-bold transition-all relative ${activeTab === 'IPA' ? 'text-indigo-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                        Pronunciation Roadmap
                        {activeTab === 'IPA' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
                    </button>
                    <button 
                        onClick={() => setActiveTab('FOCUS')} 
                        className={`px-4 py-2 text-xs font-bold transition-all relative ${activeTab === 'FOCUS' ? 'text-indigo-600' : 'text-neutral-500 hover:text-neutral-700'}`}>
                        Pronunciation Focus
                        {activeTab === 'FOCUS' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
                    </button>
                </div>
            </div>
            <div className="flex-grow overflow-hidden">
                {activeTab === 'IPA' && <PronunciationRoadmap />}
                {activeTab === 'FOCUS' && <PronunciationFocus scopedWord={scopedWord} onClose={onClose} />}
            </div>
        </div>
    );
};
