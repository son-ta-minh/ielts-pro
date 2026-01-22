
import React, { useState, useEffect, useRef } from 'react';
import { User, VocabularyItem, DiscoverGame, SessionType } from '../../app/types';
import * as dataStore from '../../app/dataStore';
import { DiscoverUI } from './Discover_UI';
import { ColloConnect } from './games/ColloConnect';
import { MeaningMatch } from './games/MeaningMatch';
import { IpaSorter } from './games/IpaSorter';
import { SentenceScramble } from './games/SentenceScramble';
import { PrepositionPower } from './games/PrepositionPower';
import { WordTransformer } from './games/WordTransformer';
import { calculateGameEligibility } from '../../utils/gameEligibility';
import { IdiomConnect } from './games/IdiomConnect';
import { ParaphraseContext } from './games/ParaphraseContext';
import { WordScatter } from './games/WordScatter';
import Adventure from './games/adventure/Adventure';
import { useToast } from '../../contexts/ToastContext';

interface Props {
    user: User;
    onExit: () => void;
    onGainXp: (xpAmount: number) => Promise<number>; 
    onRecalculateXp: (totalXp: number) => Promise<void>;
    xpGained: { amount: number, levelUp: boolean, newLevel: number | null } | null;
    xpToNextLevel: number;
    totalWords: number;
    onStartSession: (words: VocabularyItem[], type: SessionType) => void;
    onUpdateUser: (user: User) => Promise<void>;
    lastMasteryScoreUpdateTimestamp: number;
    onBulkUpdate: (words: VocabularyItem[]) => Promise<void>;
}

const Discover: React.FC<Props> = ({ user, onExit, onGainXp, onRecalculateXp, xpGained, xpToNextLevel, totalWords, onStartSession, onUpdateUser, lastMasteryScoreUpdateTimestamp, onBulkUpdate }) => {
    const [gameMode, setGameMode] = useState<DiscoverGame>('MENU');
    const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
    const [isRecalculatingXp, setIsRecalculatingXp] = useState(true);
    const [score, setScore] = useState(0);
    const [isGameOver, setIsGameOver] = useState(false);
    const lastRecalcTimestamp = useRef(0);
    const { showToast } = useToast();

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

    const handleSetGameMode = (mode: DiscoverGame) => {
        setGameMode(mode);
        setIsGameOver(false);
        setScore(0);
    };

    const handleGameComplete = async (finalScore: number) => {
        setScore(finalScore);
        setIsGameOver(true);
        
        let newAdventure = { ...user.adventure };
        let adventureUpdated = false;

        // 1. Award key fragment for perfect scores/boss kills (assuming 100 is max)
        if (finalScore >= 100) { 
            newAdventure.keyFragments = (newAdventure.keyFragments || 0) + 1;
            adventureUpdated = true;
        }

        // 2. Chance to drop Lucky Dice (20%)
        if (Math.random() < 0.2) {
            newAdventure.badges = [...(newAdventure.badges || []), 'lucky_dice'];
            showToast("You found a Lucky Dice! 🎲", 'success', 4000);
            adventureUpdated = true;
        }

        // 3. Chance to drop Supplies (15%)
        // Same logic as map movement to keep economy balanced
        if (Math.random() < 0.15) {
            if (Math.random() < 0.5) {
                newAdventure.hpPotions = (newAdventure.hpPotions || 0) + 1;
                showToast("Bonus Drop: HP Potion! 🧪", 'success', 4000);
            } else {
                newAdventure.wisdomFruits = (newAdventure.wisdomFruits || 0) + 1;
                showToast("Bonus Drop: Wisdom Fruit! 🍎", 'success', 4000);
            }
            adventureUpdated = true;
        }

        if (adventureUpdated) {
            await onUpdateUser({ ...user, adventure: newAdventure });
        }

        // XP REMOVED: Games no longer award XP. XP is strictly from Mastery (onRecalculateXp).
    };

    const handleRestart = () => {
        setIsGameOver(false);
        setScore(0);
        const current = gameMode;
        setGameMode('MENU');
        setTimeout(() => setGameMode(current), 0);
    };

    // Optimization: Filter words based on pre-calculated eligibility tags
    const getEligibleWords = (mode: string) => {
        return allWords.filter(w => {
            if (w.gameEligibility) return w.gameEligibility.includes(mode);
            // Fallback for legacy words not yet indexed
            return calculateGameEligibility(w).includes(mode);
        });
    };

    const commonGameProps = {
        onComplete: handleGameComplete,
        onExit: () => setGameMode('MENU')
    };

    const renderGame = () => {
        switch (gameMode) {
            case 'ADVENTURE': return <Adventure user={user} onUpdateUser={onUpdateUser} onStartSession={onStartSession} onExit={() => setGameMode('MENU')} />;
            case 'COLLO_CONNECT': return <ColloConnect {...commonGameProps} words={getEligibleWords('COLLO_CONNECT')} />;
            case 'IDIOM_CONNECT': return <IdiomConnect {...commonGameProps} words={getEligibleWords('IDIOM_CONNECT')} />;
            case 'MEANING_MATCH': return <MeaningMatch {...commonGameProps} words={getEligibleWords('MEANING_MATCH')} />;
            case 'IPA_SORTER': return <IpaSorter {...commonGameProps} words={getEligibleWords('IPA_SORTER')} />;
            case 'SENTENCE_SCRAMBLE': return <SentenceScramble {...commonGameProps} words={getEligibleWords('SENTENCE_SCRAMBLE')} />;
            case 'PREPOSITION_POWER': return <PrepositionPower {...commonGameProps} words={getEligibleWords('PREPOSITION_POWER')} />;
            case 'WORD_TRANSFORMER': return <WordTransformer {...commonGameProps} words={getEligibleWords('WORD_TRANSFORMER')} />;
            case 'PARAPHRASE_CONTEXT': return <ParaphraseContext {...commonGameProps} words={getEligibleWords('PARAPHRASE_CONTEXT')} />;
            case 'WORD_SCATTER': return <WordScatter {...commonGameProps} words={getEligibleWords('MEANING_MATCH')} />; // Re-uses MEANING_MATCH eligibility for now
            default: return null;
        }
    }

    return (
        <DiscoverUI
            user={user}
            xpToNextLevel={xpToNextLevel}
            gameMode={gameMode}
            setGameMode={handleSetGameMode}
            score={score}
            onExit={onExit}
            onRestart={handleRestart}
            isGameOver={isGameOver}
            xpGained={xpGained}
            renderGame={renderGame}
            onUpdateUser={onUpdateUser}
            isRecalculatingXp={isRecalculatingXp}
        />
    );
};

export default Discover;
