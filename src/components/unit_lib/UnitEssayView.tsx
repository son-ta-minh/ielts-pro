import React, { useState, useEffect } from 'react';
import { UnitEssayViewUI, HighlightColor } from './UnitEssayView_UI';
import { VocabularyItem } from '../../app/types';
import { getStoredJSON, setStoredJSON } from '../../utils/storage';

interface Props {
    text: string;
    vocabString?: string;
    wordsByText: Map<string, VocabularyItem>;
    onHoverWord?: (word: VocabularyItem | null, rect: DOMRect | null) => void;
    onWordAction?: (text: string, action: 'add' | 'remove') => void;
    isPracticeMode?: boolean;
    className?: string;
}

const SETTINGS_KEY = 'ielts_pro_essay_view_settings';

interface EssayViewSettings {
    highlightColor: HighlightColor;
    isUnderlined: boolean;
    fontSize: number;
    isSerif: boolean;
}

const defaultEssaySettings: EssayViewSettings = {
    highlightColor: 'amber',
    isUnderlined: false,
    fontSize: 16,
    isSerif: false,
};

export const UnitEssayView: React.FC<Props> = (props) => {
    const [settings, setSettings] = useState<EssayViewSettings>(() => getStoredJSON(SETTINGS_KEY, defaultEssaySettings));

    useEffect(() => { setStoredJSON(SETTINGS_KEY, settings); }, [settings]);

    return (
        <UnitEssayViewUI
            {...props}
            highlightColor={settings.highlightColor}
            setHighlightColor={(c) => setSettings(s => ({ ...s, highlightColor: c }))}
            isUnderlined={settings.isUnderlined}
            setIsUnderlined={(b) => setSettings(s => ({ ...s, isUnderlined: b }))}
            fontSize={settings.fontSize}
            setFontSize={(size) => setSettings(s => ({ ...s, fontSize: size }))}
            isSerif={settings.isSerif}
            setIsSerif={(b) => setSettings(s => ({ ...s, isSerif: b }))}
        />
    );
};
