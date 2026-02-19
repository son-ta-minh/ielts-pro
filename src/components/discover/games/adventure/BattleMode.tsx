import React, { useState, useEffect, useMemo } from 'react';
import { AdventureBoss } from '../../../../data/adventure_content';
import { VocabularyItem, ReviewGrade } from '../../../../app/types';
import { Heart, Swords, ShieldAlert, X, Loader2 } from 'lucide-react';
import { updateSRS } from '../../../../utils/srs';
import TestModal from '../../../practice/TestModal';
import { getRandomMeanings } from '../../../../app/db';
import { Challenge, ChallengeType, IpaQuizChallenge, PrepositionQuizChallenge, MeaningQuizChallenge, ParaphraseQuizChallenge, SentenceScrambleChallenge } from '../../../practice/TestModalTypes';
import { WordFamily, PrepositionPattern } from '../../../../app/types';

interface Props {
    boss: AdventureBoss;
    words: VocabularyItem[];
    onVictory: () => void;
    onDefeat: () => void;
    onExit: () => void;
}

const PLAYER_MAX_HP = 3;

export const BattleMode: React.FC<Props> = ({ boss, words, onVictory, onDefeat, onExit }) => {
    const [bossHp, setBossHp] = useState(boss.hp);
    const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [feedback, setFeedback] = useState<'hit' | 'miss' | null>(null);
    const [gameState, setGameState] = useState<'intro' | 'fighting' | 'transitioning' | 'won' | 'lost'>('intro');

    const battleWords = useMemo(() => [...words].sort(() => Math.random() - 0.5), [words]);
    const currentWord = battleWords[currentWordIndex % battleWords.length];

    useEffect(() => {
        if (gameState === 'transitioning') {
            const timer = setTimeout(() => {
                setFeedback(null);
                if (bossHp <= 0) {
                    setGameState('won');
                } else if (playerHp <= 0) {
                    setGameState('lost');
                } else {
                    setCurrentWordIndex(prev => prev + 1);
                    setGameState('fighting');
                }
            }, 1200); // Animation time
            return () => clearTimeout(timer);
        }
    }, [gameState, bossHp, playerHp]);

    const handleTestComplete = (grade: ReviewGrade) => {
        if (grade === ReviewGrade.EASY) {
            setFeedback('hit');
            setBossHp(prev => prev - 1);
            updateSRS(currentWord, ReviewGrade.EASY);
        } else {
            setFeedback('miss');
            setPlayerHp(prev => prev - 1);
            updateSRS(currentWord, ReviewGrade.HARD);
        }
        setGameState('transitioning');
    };

    if (gameState === 'intro') {
        return (
            <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in duration-500">
                <div className="text-8xl mb-6 animate-bounce">{boss.image}</div>
                <h2 className="text-4xl font-black text-red-500 mb-2 uppercase tracking-widest">{boss.name}</h2>
                <div className="bg-neutral-800/80 p-6 rounded-2xl border-l-4 border-red-500 max-w-md mb-8"><p className="text-xl font-medium italic">&quot;{boss.dialogueIntro}&quot;</p></div>
                <button onClick={() => setGameState('fighting')} className="px-10 py-4 bg-red-600 hover:bg-red-500 text-white font-black text-xl rounded-2xl uppercase tracking-widest shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all transform hover:scale-105 flex items-center gap-3"><Swords size={24} /> FIGHT!</button>
            </div>
        );
    }
    
    if (gameState === 'won' || gameState === 'lost') {
        const isWin = gameState === 'won';
        return (
            <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center text-white p-6 text-center animate-in zoom-in duration-500 ${isWin ? 'bg-emerald-900/90' : 'bg-neutral-900/95'}`}>
                <div className={`text-8xl mb-6 ${!isWin && 'grayscale opacity-50'}`}>{isWin ? '🏆' : '💀'}</div>
                <h2 className={`text-4xl font-black mb-2 ${isWin ? 'text-emerald-400' : 'text-red-500'}`}>{isWin ? 'VICTORY!' : 'DEFEATED'}</h2>
                <p className="text-lg opacity-80 mb-8 italic">{isWin ? `&quot;${boss.dialogueWin}&quot;` : `&quot;${boss.dialogueLose}&quot;`}</p>
                <button onClick={isWin ? onVictory : onDefeat} className={`px-8 py-3 font-bold rounded-xl transition-all ${isWin ? 'bg-white text-emerald-900 hover:scale-105' : 'bg-neutral-700 text-white hover:bg-neutral-600'}`}>{isWin ? 'Claim Reward' : 'Retreat & Study'}</button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] bg-neutral-900 flex flex-col items-center justify-between py-10 px-4">
            <div className="w-full max-w-lg flex flex-col items-center gap-4">
                <div className={`text-6xl transition-transform duration-300 ${feedback === 'hit' ? 'scale-90 opacity-50 text-red-500' : ''}`}>{boss.image}</div>
                <div className="flex flex-col items-center w-full"><h3 className="text-red-500 font-black uppercase tracking-widest text-lg">{boss.name}</h3><div className="w-full h-4 bg-neutral-800 rounded-full border border-neutral-700 mt-2 overflow-hidden relative"><div className="h-full bg-red-600 transition-all duration-500 ease-out" style={{ width: `${(bossHp / boss.hp) * 100}%` }}/></div><span className="text-xs font-bold text-red-400 mt-1">{bossHp} / {boss.hp} HP</span></div>
            </div>

            <div className="flex-1 w-full max-w-lg flex flex-col items-center justify-center my-6 relative min-h-[40vh]">
                {feedback && <div className="absolute inset-0 flex items-center justify-center z-20 animate-out fade-out zoom-out duration-700 pointer-events-none"><span className={`text-6xl font-black drop-shadow-[0_0_10px_rgba(52,211,153,0.8)] ${feedback === 'hit' ? 'text-emerald-400' : 'text-red-500'}`}>{feedback === 'hit' ? 'CRITICAL HIT!' : 'MISS!'}</span></div>}
                
                {gameState === 'fighting' && currentWord ? (
                    <div className="w-full h-full animate-in fade-in duration-300">
                        {/* FIX: Remove onGainXp prop from TestModal call. */}
                        <TestModal word={currentWord} isQuickFire={true} onComplete={handleTestComplete} onClose={onExit} isModal={false} />
                    </div>
                ) : gameState === 'transitioning' ? (
                    <div className="w-full max-w-md h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-neutral-600" size={40} />
                    </div>
                ) : null}
            </div>

            <div className="w-full max-w-lg bg-neutral-800 rounded-2xl p-4 flex items-center justify-between border border-neutral-700">
                <div className="flex items-center gap-3"><div className="p-2 bg-neutral-700 rounded-full"><ShieldAlert className="text-emerald-400" size={20} /></div><div><div className="text-[10px] font-bold text-neutral-400 uppercase">Your Health</div><div className="flex gap-1 mt-1 text-emerald-500">{Array.from({length: PLAYER_MAX_HP}).map((_, i) => (<Heart key={i} size={16} fill={i < playerHp ? "currentColor" : "none"} className={i < playerHp ? "text-emerald-500" : "text-neutral-600"} />))}</div></div></div>
                <button onClick={onExit} className="p-2 text-neutral-500 hover:text-white transition-colors"><X size={20}/></button>
            </div>
        </div>
    );
};
