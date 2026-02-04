
import React, { useState, useEffect, useRef } from 'react';
import { ComparisonGroup } from '../../app/types';
import * as db from '../../app/db';
import * as dataStore from '../../app/dataStore';
import { ComparisonReadViewUI } from './ComparisonReadView_UI';

interface Props {
    group: ComparisonGroup;
    onBack: () => void;
    onEdit: () => void;
}

export const ComparisonReadView: React.FC<Props> = ({ group, onBack, onEdit }) => {
    const [libraryWords, setLibraryWords] = useState<Set<string>>(new Set());
    const [noteSavingStatus, setNoteSavingStatus] = useState<Record<number, 'saving' | 'saved' | null>>({});
    const timeoutRefs = useRef<Record<number, number>>({});
    const [localGroup, setLocalGroup] = useState(group);

    useEffect(() => {
        const words = dataStore.getAllWords();
        setLibraryWords(new Set(words.map(w => w.word.toLowerCase())));
        
        // Only reset local group if the group ID changes (navigation).
        // If the 'group' prop updates due to a parent re-render (but same ID), 
        // we ignore it to preserve unsaved notes being typed.
        if (group.id !== localGroup.id) {
            setLocalGroup(group);
        }
    }, [group.id, group.words]); // Depend on ID specifically, or maybe list of words if re-generated.

    const handleNoteChange = (index: number, newNote: string) => {
        const newData = [...localGroup.comparisonData];
        newData[index] = { ...newData[index], userNote: newNote };
        const updatedGroup = { ...localGroup, comparisonData: newData };
        setLocalGroup(updatedGroup);

        setNoteSavingStatus(prev => ({ ...prev, [index]: 'saving' }));
        if (timeoutRefs.current[index]) clearTimeout(timeoutRefs.current[index]);

        timeoutRefs.current[index] = window.setTimeout(async () => {
            const finalGroupToSave = { ...updatedGroup, updatedAt: Date.now() };
            await db.saveComparisonGroup(finalGroupToSave);
            setNoteSavingStatus(prev => ({ ...prev, [index]: 'saved' }));
            setTimeout(() => setNoteSavingStatus(prev => ({ ...prev, [index]: null })), 2000);
        }, 1000);
    };

    return (
        <ComparisonReadViewUI
            group={localGroup}
            libraryWords={libraryWords}
            noteSavingStatus={noteSavingStatus}
            onBack={onBack}
            onEdit={onEdit}
            onNoteChange={handleNoteChange}
        />
    );
};
