
import React, { useState, useEffect, useRef } from 'react';
import { User, VocabularyItem, DiscoverGame, SessionType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { DiscoverUI } from './Discover_UI';
import Adventure from './games/adventure/Adventure';

// Game Imports
import { IpaSorter } from './games/IpaSorter';
import { SentenceScramble } from './games/SentenceScramble';
import { PrepositionPower } from './games/PrepositionPower';
import { ParaphraseContext } from './games/ParaphraseContext';
import { WordScatter } from './games/WordScatter';
import { Dictation } from './games/Dictation';
import { NaturalExpressionGame } from './games/NaturalExpressionGame';
import { IntensityScaleGame } from './games/IntensityScaleGame';
import { ComparisonLabGame } from './games/ComparisonLabGame';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { useToast } from '../../contexts/ToastContext';

interface Props {
    user: User;
    onExit: () => void;
    onRecalculateXp: (totalXp: number) => Promise<void>;
    xpToNextLevel: number;
    onStartSession: (words: VocabularyItem[], type: SessionType) => void;
    onUpdateUser: (user: User) => Promise<void>;
    lastMasteryScoreUpdateTimestamp: number;
    onBulkUpdate: (words: VocabularyItem[]) => Promise<void>;
    initialGameMode?: DiscoverGame | null;
    onConsumeGameMode?: () => void;
}

const Discover: React.FC<Props> = ({ user, onExit, onRecalculateXp, xpToNextLevel, onStartSession, onUpdateUser, lastMasteryScoreUpdateTimestamp, onBulkUpdate, initialGameMode, onConsumeGameMode }) => {
    const [gameMode, setGameMode] = useState<DiscoverGame>('ADVENTURE');
    const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
    const [isRecalculatingXp, setIsRecalculatingXp] = useState(true);
    const lastRecalcTimestamp = useRef(0);
    const { showToast } = useToast();

    useEffect(() => {
        if (initialGameMode && initialGameMode !== 'MENU') {
            setGameMode(initialGameMode);
            onConsumeGameMode?.();
        }
    }, [initialGameMode, onConsumeGameMode]);

    const onRecalculateXpRef = useRef(onRecalculateXp);
    useEffect(() => {
        onRecalculateXpRef.current = onRecalculateXp;
    }, [onRecalculateXp]);

    useEffect(() => {
        const loadAndRecalculate = async () => {
            setIsRecalculatingXp(true);
            const data = dataStore.getAllWords().filter(w => w.userId === user.id);
            const activeWords = data.filter(w => w && !w.isPassive);
            setAllWords(activeWords);

            if (lastMasteryScoreUpdateTimestamp > lastRecalcTimestamp.current) {
                const totalMasteryXp = activeWords.reduce((sum, word) => sum + (word.masteryScore || 0), 0);
                await onRecalculateXpRef.current(totalMasteryXp);
                lastRecalcTimestamp.current = Date.now();
            }
            setIsRecalculatingXp(false);
        };
        loadAndRecalculate();
    }, [user.id, lastMasteryScoreUpdateTimestamp]);

    const handleGameComplete = (score: number) => {
        showToast(`Game Complete! Score: ${score}`, 'success');
        onExit(); 
    };

    const handleGameExit = () => {
        onExit(); 
    };

    const getEligibleWords = (mode: string) => {
        return allWords.filter(w => {
            if (w.gameEligibility) return w.gameEligibility.includes(mode);
            return calculateGameEligibility(w).includes(mode);
        });
    };
    
    const getEligibleWordsForContextGame = () => {
        return allWords.filter(w => {
            const hasSufficientParaphrases = w.paraphrases && w.paraphrases.filter(p => !p.isIgnored && p.context && p.context.trim()).length >= 2;
            const hasSufficientCollocs = w.collocationsArray && w.collocationsArray.filter(c => !c.isIgnored && c.d && c.d.trim()).length >= 2;
            const hasSufficientIdioms = w.idiomsList && w.idiomsList.filter(i => !i.isIgnored && i.d && i.d.trim()).length >= 2;
            return hasSufficientParaphrases || hasSufficientCollocs || hasSufficientIdioms;
        });
    };

    const renderContent = () => {
        const commonProps = {
            onComplete: handleGameComplete,
            onExit: handleGameExit
        };

        switch (gameMode) {
            case 'ADVENTURE': return <Adventure user={user} onUpdateUser={onUpdateUser} onStartSession={onStartSession} onExit={onExit} />;
            case 'IPA_SORTER': return <IpaSorter {...commonProps} words={getEligibleWords('IPA_SORTER')} onBulkUpdate={onBulkUpdate} />;
            case 'SENTENCE_SCRAMBLE': return <SentenceScramble {...commonProps} words={getEligibleWords('SENTENCE_SCRAMBLE')} />;
            case 'DICTATION': return <Dictation {...commonProps} words={getEligibleWords('DICTATION')} />;
            case 'PREPOSITION_POWER': return <PrepositionPower {...commonProps} words={getEligibleWords('PREPOSITION_POWER')} />;
            case 'PARAPHRASE_CONTEXT': return <ParaphraseContext {...commonProps} words={getEligibleWordsForContextGame()} />;
            case 'WORD_SCATTER': return <WordScatter {...commonProps} words={getEligibleWords('MEANING_MATCH')} />;
            case 'NATURAL_EXPRESSION': return <NaturalExpressionGame userId={user.id} {...commonProps} />;
            case 'INTENSITY_SCALE': return <IntensityScaleGame user={user} {...commonProps} />;
            case 'COMPARISON_LAB': return <ComparisonLabGame user={user} {...commonProps} />;
            default: return <Adventure user={user} onUpdateUser={onUpdateUser} onStartSession={onStartSession} onExit={onExit} />;
        }
    };

    if (gameMode === 'ADVENTURE') {
        return (
            <DiscoverUI
                user={user}
                xpToNextLevel={xpToNextLevel}
                onUpdateUser={onUpdateUser}
                isRecalculatingXp={isRecalculatingXp}
            >
                 <Adventure user={user} onUpdateUser={onUpdateUser} onStartSession={onStartSession} onExit={onExit} />
            </DiscoverUI>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-neutral-100 p-4 md:p-6 animate-in zoom-in-95 duration-300 flex flex-col">
             <div className="w-full h-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-neutral-200 relative p-6">
                {renderContent()}
             </div>
        </div>
    );
};

export default Discover;
