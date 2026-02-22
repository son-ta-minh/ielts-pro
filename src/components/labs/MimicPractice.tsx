
import React from 'react';
import { PronunciationFocus } from './PronunciationFocus';
import { VocabularyItem } from '../../app/types';

interface Props {
    scopedWord?: VocabularyItem;
    onClose?: () => void;
}

export const MimicPractice: React.FC<Props> = ({ scopedWord, onClose }) => {
    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-grow overflow-hidden">
                <PronunciationFocus scopedWord={scopedWord} onClose={onClose} />
            </div>
        </div>
    );
};
