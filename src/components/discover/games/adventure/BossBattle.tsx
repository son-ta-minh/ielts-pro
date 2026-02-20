
import React, { useState, useEffect, useMemo } from 'react';
import { VocabularyItem, ReviewGrade, User } from '../../../../app/types';
import { Heart, Swords, Clock, Skull, Sword, Briefcase } from 'lucide-react';
import { updateSRS } from '../../../../utils/srs';
import TestModal from '../../../practice/TestModal';
import * as dataStore from '../../../../app/dataStore';
import { useToast } from '../../../../contexts/ToastContext';

interface Boss {
    name: string;
    image: string;
    hp: number;
    dialogueIntro: string;
    dialogueWin: string;
    dialogueLose: string;
    dropBadgeId: string;
}

interface Props {
    user: User;
    boss: Boss;
    words: VocabularyItem[];
    onVictory: () => void;
    onDefeat: () => void;
    onExit: () => void;
    onUpdateUser: (user: User) => Promise<void>;
}

const PLAYER_MAX_HP = 5;

type AnimState = 'idle' | 'player-attacking' | 'boss-attacking';
type ImpactState = 'none' | 'boss-hit' | 'player-hit';

export const BattleMode: React.FC<Props> = ({ user, boss, words, onVictory, onDefeat, onExit, onUpdateUser }) => {
    const { showToast } = useToast();
    const [bossHp, setBossHp] = useState(boss.hp);
    const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    
    // Animation states
    const [animState, setAnimState] = useState<AnimState>('idle');
    const [impactState, setImpactState] = useState<ImpactState>('none');

    // Game Flow States
    const [gameState, setGameState] = useState<'intro' | 'fighting' | 'animating' | 'won' | 'lost'>('intro');
    const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
    
    // Inventory States
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [hintActive, setHintActive] = useState(false);
    
    const battleWords = useMemo(() => [...words].sort(() => Math.random() - 0.5), [words]);
    const currentWord = battleWords[currentWordIndex % battleWords.length];

    useEffect(() => {
        if (gameState === 'fighting') {
            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        setGameState('lost');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState]);
    
    // Reset hint state when question changes
    useEffect(() => {
        setHintActive(false);
    }, [currentWordIndex]);

    const handleTestComplete = async (grade: ReviewGrade) => {
        const isCorrect = grade !== ReviewGrade.FORGOT;
        
        // Switch state to animate (hides the test card)
        setGameState('animating');

        if (isCorrect) {
            // Player Attacks
            setAnimState('player-attacking');
            
            // 1. Wait for projectile to travel
            setTimeout(() => {
                setAnimState('idle');
                setImpactState('boss-hit');
                setBossHp(prev => Math.max(0, prev - 1));
                
                // 2. Wait for impact animation
                setTimeout(() => {
                    setImpactState('none');
                    checkWinCondition(true);
                }, 800);
            }, 600); // Projectile flight time
            
        } else {
            // Boss Attacks
            setAnimState('boss-attacking');
            
            // 1. Wait for projectile to travel
            setTimeout(() => {
                setAnimState('idle');
                setImpactState('player-hit');
                setPlayerHp(prev => Math.max(0, prev - 1));
                
                // 2. Wait for impact animation
                setTimeout(() => {
                    setImpactState('none');
                    checkWinCondition(false);
                }, 800);
            }, 600);
        }

        // Update SRS data quietly in background
        const finalGradeForSrs = isCorrect ? ReviewGrade.EASY : ReviewGrade.FORGOT;
        const updatedWord = updateSRS(currentWord, finalGradeForSrs);
        updatedWord.lastReviewSessionType = 'boss_battle';
        await dataStore.saveWord(updatedWord);
    };

    const checkWinCondition = () => {
        setBossHp(currentBossHp => {
            setPlayerHp(currentPlayerHp => {
                if (currentBossHp <= 0) {
                    setGameState('won');
                } else if (currentPlayerHp <= 0) {
                    setGameState('lost');
                } else {
                    // Next Round
                    setCurrentWordIndex(prev => prev + 1);
                    setGameState('fighting');
                }
                return currentPlayerHp;
            });
            return currentBossHp;
        });
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const battleChallengeFilter = (challenge: any) => {
        if (challenge.type === 'SPELLING') return false;
        // Filter out very long challenges to keep battle pace fast
        if (challenge.type === 'COLLOCATION_QUIZ') {
            const validCollocs = challenge.word.collocationsArray?.filter((c: any) => !c.isIgnored && c.d) || [];
            if (validCollocs.length > 2) return false;
        }
        if (challenge.type === 'PARAPHRASE_QUIZ') {
            const validParas = challenge.word.paraphrases?.filter((p: any) => !p.isIgnored) || [];
            if (validParas.length > 2) return false;
        }
        return true;
    };
    
    // Inventory Actions
    const handleUsePotion = async () => {
        if ((user.adventure.hpPotions || 0) <= 0) return;
        if (playerHp >= PLAYER_MAX_HP) {
            showToast("Health is already full!", "info");
            return;
        }

        setPlayerHp(prev => Math.min(PLAYER_MAX_HP, prev + 1));
        
        const newProgress = { ...user.adventure };
        newProgress.hpPotions = (newProgress.hpPotions || 0) - 1;
        await onUpdateUser({ ...user, adventure: newProgress });
        
        showToast("+1 HP Recovered!", "success");
    };

    const handleUseFruit = async () => {
        if ((user.adventure.wisdomFruits || 0) <= 0) return;
        if (hintActive) {
            showToast("Hint is already active!", "info");
            return;
        }

        setHintActive(true);
        
        const newProgress = { ...user.adventure };
        newProgress.wisdomFruits = (newProgress.wisdomFruits || 0) - 1;
        await onUpdateUser({ ...user, adventure: newProgress });
        
        showToast("Wisdom Fruit Used! Hint revealed.", "success");
    };
    
    const hasItems = (user.adventure.hpPotions || 0) > 0 || (user.adventure.wisdomFruits || 0) > 0;

    if (gameState === 'intro') {
        return (
            <div className="absolute inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in duration-500">
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
            <div className={`absolute inset-0 z-[100] flex flex-col items-center justify-center text-white p-6 text-center animate-in zoom-in duration-500 ${isWin ? 'bg-emerald-900/90' : 'bg-neutral-900/95'}`}>
                <div className={`text-8xl mb-6 ${!isWin && 'grayscale opacity-50'}`}>{isWin ? '🏆' : '💀'}</div>
                <h2 className={`text-4xl font-black mb-2 ${isWin ? 'text-emerald-400' : 'text-red-500'}`}>{isWin ? 'VICTORY!' : 'DEFEATED'}</h2>
                <p className="text-lg opacity-80 mb-8 italic">{isWin ? `&quot;${boss.dialogueWin}&quot;` : `&quot;${boss.dialogueLose}&quot;`}</p>
                <button onClick={isWin ? onVictory : onDefeat} className={`px-8 py-3 font-bold rounded-xl transition-all ${isWin ? 'bg-white text-emerald-900 hover:scale-105' : 'bg-neutral-700 text-white hover:bg-neutral-600'}`}>{isWin ? 'Claim Reward' : 'Retreat & Study'}</button>
            </div>
        );
    }

    // --- MAIN BATTLE RENDER ---
    return (
        <div className="absolute inset-0 z-[100] bg-slate-900 flex flex-col overflow-hidden">
            {/* Background Atmosphere */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-black opacity-50 pointer-events-none"></div>
            
            {/* --- TOP ZONE: BOSS (25%) --- */}
            <div className="relative z-10 flex flex-col items-center justify-center pt-2 pb-2 h-[25%] shrink-0">
                {/* Boss Stats */}
                <div className="flex flex-col items-center w-64 mb-2">
                    <h3 className="text-red-500 font-black uppercase tracking-widest text-base drop-shadow-md">{boss.name}</h3>
                    <div className="w-full h-3 bg-slate-800 rounded-full border border-slate-600 mt-1 overflow-hidden relative shadow-inner">
                        <div className="h-full bg-red-600 transition-all duration-300 ease-out" style={{ width: `${(bossHp / boss.hp) * 100}%` }}/>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <Heart size={14} className="text-red-500 fill-red-500 animate-pulse" />
                        <span className="text-xs font-black text-red-100 tracking-wider text-shadow-sm">{bossHp} / {boss.hp} HP</span>
                    </div>
                </div>

                {/* Boss Avatar & Effects */}
                <div className="relative">
                    <div className={`text-7xl transition-transform duration-200 ${impactState === 'boss-hit' ? 'scale-90 brightness-200 translate-x-2' : 'animate-float'}`}>
                        {boss.image}
                    </div>
                    {/* Boss Hit Visual */}
                    {impactState === 'boss-hit' && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                            <div className="text-6xl animate-ping opacity-75 absolute text-yellow-500">💥</div>
                            <div className="absolute -top-10 -right-10 text-4xl text-red-500 font-black animate-bounce">-1</div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- MIDDLE ZONE: BATTLEFIELD & CARDS (Flex 1) --- */}
            <div className="flex-1 relative z-10 flex items-center justify-center w-full px-4 overflow-hidden">
                
                {/* 1. Projectile Layer (Z-Index 30 - Above Card) */}
                 {animState === 'player-attacking' && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-6xl animate-fly-up text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] z-30 pointer-events-none">
                        <Sword className="fill-cyan-400 rotate-45" size={48} />
                    </div>
                 )}
                 {animState === 'boss-attacking' && (
                    <div className="absolute top-10 left-1/2 -translate-x-1/2 text-6xl animate-fly-down text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] z-30 pointer-events-none">
                         <Skull className="fill-red-900" size={48} />
                    </div>
                 )}
                 
                 {/* 2. UI Layer (Timer/Inventory) - UPDATED STYLES */}
                 <div className={`absolute top-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-black border-2 backdrop-blur-md z-20 transition-all duration-300 ${
                    timeLeft < 60 
                        ? 'bg-red-950/90 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse scale-110' 
                        : 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                }`}>
                    <Clock size={18} className={timeLeft < 60 ? "animate-spin" : ""} />
                    <span className="text-lg tracking-widest">{formatTime(timeLeft)}</span>
                </div>

                <button 
                    onClick={() => setIsInventoryOpen(!isInventoryOpen)}
                    className={`absolute top-4 left-4 p-3 rounded-xl border-2 backdrop-blur-md transition-all duration-300 z-20 group ${
                        isInventoryOpen 
                            ? 'bg-indigo-600 border-indigo-300 text-white shadow-[0_0_25px_rgba(99,102,241,0.6)] scale-105' 
                            : 'bg-indigo-950/80 border-indigo-500/60 text-indigo-300 shadow-[0_0_15px_rgba(129,140,248,0.3)] hover:bg-indigo-900 hover:text-white hover:border-indigo-400 hover:shadow-[0_0_20px_rgba(129,140,248,0.5)] active:scale-95'
                    }`}
                    title="Items"
                >
                    <div className="relative">
                         <Briefcase size={24} />
                         {/* Small indicator dot if items exist */}
                         {hasItems && (
                             <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white animate-bounce shadow-sm"></span>
                         )}
                    </div>
                </button>

                 {/* Inventory Dropdown */}
                 {isInventoryOpen && (
                    <div className="absolute top-16 left-4 z-40 bg-slate-800/95 border border-slate-600 rounded-2xl p-4 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-left-4 w-64">
                        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3">Battle Supplies</h4>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-xl border border-slate-700">
                                <div className="flex items-center gap-2">
                                    <div className="text-xl">🧪</div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-200">HP Potion</span>
                                        <span className="text-[10px] text-slate-500">x{user.adventure.hpPotions || 0}</span>
                                    </div>
                                </div>
                                <button onClick={handleUsePotion} disabled={(user.adventure.hpPotions || 0) <= 0 || playerHp >= PLAYER_MAX_HP} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase disabled:opacity-50 disabled:bg-slate-700">Use</button>
                            </div>
                            <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-xl border border-slate-700">
                                <div className="flex items-center gap-2">
                                    <div className="text-xl">🍎</div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-200">Wisdom Fruit</span>
                                        <span className="text-[10px] text-slate-500">x{user.adventure.wisdomFruits || 0}</span>
                                    </div>
                                </div>
                                <button onClick={handleUseFruit} disabled={(user.adventure.wisdomFruits || 0) <= 0 || hintActive} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase disabled:opacity-50 disabled:bg-slate-700">Use</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. The Test Card (Centered) */}
                {gameState === 'fighting' && currentWord ? (
                    <div className="w-full max-w-md h-full max-h-[420px] z-10 animate-in zoom-in-95 duration-300 flex items-center">
                        <TestModal 
                            word={currentWord} 
                            isQuickFire={true} 
                            onComplete={handleTestComplete} 
                            onClose={onExit} 
                            isModal={false} 
                            disableHints={!hintActive} 
                            forceShowHint={hintActive}
                            challengeFilter={battleChallengeFilter}
                            skipRecap={true}
                        />
                    </div>
                ) : gameState === 'animating' ? (
                     <div className="text-white/50 font-black text-sm uppercase tracking-widest animate-pulse">Battle in progress...</div>
                ) : null}
            </div>

            {/* --- BOTTOM ZONE: PLAYER (20%) --- */}
            <div className="relative z-10 flex flex-col items-center justify-end pb-6 h-[20%] shrink-0">
                 {/* Player Hit Effect */}
                 {impactState === 'player-hit' && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                        <div className="text-6xl animate-ping opacity-75 absolute text-red-600">💥</div>
                        <div className="absolute -top-16 text-4xl text-red-500 font-black animate-bounce">-1 HP</div>
                    </div>
                )}
                
                {/* Player Avatar */}
                <div className={`relative mb-3 w-16 h-16 rounded-2xl overflow-hidden border-4 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] bg-indigo-900 transition-transform duration-100 ${impactState === 'player-hit' ? 'animate-shake border-red-500' : ''}`}>
                    <img src={user.avatar} alt="Hero" className="w-full h-full object-cover" />
                </div>

                {/* Player Stats */}
                <div className="flex items-center gap-3 bg-slate-800/80 backdrop-blur-md px-6 py-2 rounded-2xl border border-slate-700">
                    <div className="flex gap-1">
                        {Array.from({length: PLAYER_MAX_HP}).map((_, i) => (
                            <Heart 
                                key={i} 
                                size={18} 
                                fill={i < playerHp ? "#ef4444" : "none"} 
                                className={`transition-all duration-300 ${i < playerHp ? "text-red-500 scale-100" : "text-slate-600 scale-90"}`} 
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes flyUp {
                    0% { transform: translateY(0) scale(0.5); opacity: 0; }
                    10% { opacity: 1; }
                    100% { transform: translateY(-40vh) scale(1.5); opacity: 1; }
                }
                @keyframes flyDown {
                    0% { transform: translateY(0) scale(0.5); opacity: 0; }
                    10% { opacity: 1; }
                    100% { transform: translateY(40vh) scale(1.5); opacity: 1; }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-fly-up { animation: flyUp 0.6s ease-in forwards; }
                .animate-fly-down { animation: flyDown 0.6s ease-in forwards; }
                .animate-shake { animation: shake 0.3s ease-in-out; }
                .animate-float { animation: float 3s ease-in-out infinite; }
            `}</style>
        </div>
    );
};
