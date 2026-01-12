import React, { useState, useEffect } from 'react';
import { User, VocabularyItem, DiscoverGame, SessionType } from '../../app/types';
import { getAllWordsForExport } from '../../app/db';
import { DiscoverUI } from './Discover_UI';
import { ColloConnect } from './games/ColloConnect';
import { MeaningMatch } from './games/MeaningMatch';
import { IpaSorter } from './games/IpaSorter';
import { SentenceScramble } from './games/SentenceScramble';
import { PrepositionPower } from './games/PrepositionPower';
import { WordTransformer } from './games/WordTransformer';
import Adventure from './games/adventure/Adventure';
import { calculateGameEligibility } from '../../utils/gameEligibility';

interface Props {
    user: User;
    onExit: () => void;
    onGainXp: (xpAmount: number) => void; 
    xpGained: { amount: number, levelUp: boolean, newLevel: number | null } | null;
    xpToNextLevel: number;
    totalWords: number;
    onStartSession: (words: VocabularyItem[], type: SessionType) => void;
    onUpdateUser: (user: User) => Promise<void>;
}

const Discover: React.FC<Props> = ({ user, onExit, onGainXp, xpGained, xpToNextLevel, totalWords, onStartSession, onUpdateUser }) => {
    const [gameMode, setGameMode] = useState<DiscoverGame>('MENU');
    const [allWords, setAllWords] = useState<VocabularyItem[]>([]);
    const [wordsLoading, setWordsLoading] = useState(true);
    const [score, setScore] = useState(0);
    const [isGameOver, setIsGameOver] = useState(false);

    useEffect(() => {
        const load = async () => {
            setWordsLoading(true);
            try {
                const data = await getAllWordsForExport(user.id);
                const activeWords = data.filter(w => w && !w.isPassive);
                setAllWords(activeWords);
            } catch (error) {
                console.error("[Discover] Failed to load words for games:", error);
                setAllWords([]); 
                alert("Failed to load your vocabulary.");
            } finally {
                setWordsLoading(false);
            }
        };
        load();
    }, [user.id]);

    const handleSetGameMode = (mode: DiscoverGame) => {
        if (wordsLoading) return;
        setGameMode(mode);
        setIsGameOver(false);
        setScore(0);
    };

    const handleGameComplete = (finalScore: number) => {
        setScore(finalScore);
        setIsGameOver(true);
        onGainXp(finalScore + 5); 
    };

    const handleRestart = () => {
        setIsGameOver(false);
        setScore(0);
        const current = gameMode;
        setGameMode('MENU');
        setTimeout(() => setGameMode(current), 0);
    };

    if (wordsLoading) {
        return <div className="h-full flex items-center justify-center text-neutral-400 font-bold">Loading Discover Hub...</div>;
    }

    if (gameMode === 'ADVENTURE') {
        return <Adventure 
            user={user}
            xpToNextLevel={xpToNextLevel}
            totalWords={totalWords}
            onExit={() => setGameMode('MENU')}
            onUpdateUser={onUpdateUser}
            onStartSession={onStartSession}
        />
    }

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
            case 'COLLO_CONNECT': return <ColloConnect {...commonGameProps} words={getEligibleWords('COLLO_CONNECT')} />;
            case 'MEANING_MATCH': return <MeaningMatch {...commonGameProps} words={getEligibleWords('MEANING_MATCH')} />;
            case 'IPA_SORTER': return <IpaSorter {...commonGameProps} words={getEligibleWords('IPA_SORTER')} />;
            case 'SENTENCE_SCRAMBLE': return <SentenceScramble {...commonGameProps} words={getEligibleWords('SENTENCE_SCRAMBLE')} />;
            case 'PREPOSITION_POWER': return <PrepositionPower {...commonGameProps} words={getEligibleWords('PREPOSITION_POWER')} />;
            case 'WORD_TRANSFORMER': return <WordTransformer {...commonGameProps} words={getEligibleWords('WORD_TRANSFORMER')} />;
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
        />
    );
};

export default Discover;