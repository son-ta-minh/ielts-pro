
import React, { useState } from 'react';
import { User } from '../../app/types';
import { DiscoverGame } from '../../app/types';
import { RefreshCw, Trophy, Map, Crown, Key, GitCommit, ShoppingBag, Star, Edit3, Lock, Quote, Zap, BoxSelect, Loader2, Split, Move, BookOpen, Shuffle, AtSign, SlidersHorizontal, User as UserIcon, Sparkles } from 'lucide-react';
import { BADGES } from '../../data/adventure_content';
import { AvatarSelectionModal } from '../common/AvatarSelectionModal';

// RPG Roles config re-declared here for game title logic if needed, but primarily used in Modal now.
// For the UI panel display logic we keep a simplified reference or import if possible.
// To keep it simple, we re-declare the levels for title mapping only.
const RPG_LEVELS: { level: number; title: string }[] = [
    { level: 1, title: 'Novice Soul' },
    { level: 5, title: 'Forest Kin' },
    { level: 10, title: 'Lamp Spirit' },
    { level: 20, title: 'Undead Walker' },
    { level: 30, title: 'Night Stalker' },
    { level: 50, title: 'Mystic Fairy' },
    { level: 75, title: 'Arcane Mage' },
    { level: 100, title: 'Shadow Ninja' },
    { level: 150, title: 'Heroic Savior' },
    { level: 200, title: 'Master Villain' },
    { level: 500, title: 'Royal Heir' }, 
    { level: 999, title: 'The Legend' },
];

const getGameTitleForLevel = (level: number): string => {
  let title = 'Novice Soul'; 
  for (const r of RPG_LEVELS) {
    if (level >= r.level) {
      title = r.title;
    } else {
      break; 
    }
  }
  return title;
};

// ... Removed local AvatarSelectionModal ...

const MenuCard: React.FC<{ title: string; desc: string; icon: React.ElementType; color: string; onClick: () => void; }> = ({ title, desc, icon: Icon, color, onClick }) => (
    <button 
        onClick={onClick} 
        className={`group bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm hover:shadow-lg hover:border-neutral-300 transition-all text-left flex flex-col h-full justify-between relative overflow-hidden`}
    >
        <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-20 bg-${color}-500 group-hover:scale-150 transition-transform duration-500`} />
        
        <div className={`p-3 bg-${color}-50 text-${color}-600 rounded-2xl w-fit`}>
            <Icon size={24} />
        </div>

        <div className="space-y-1 relative z-10 mt-4">
            <h3 className={`text-lg font-black text-neutral-900`}>{title}</h3>
            <p className={`text-xs font-medium text-neutral-500`}>{desc}</p>
        </div>
    </button>
);

const getLevelAppearance = (level: number) => {
    if (level >= 50) return { frame: "bg-gradient-to-br from-amber-400 to-yellow-600", shadow: "shadow-amber-400/20" };
    if (level >= 30) return { frame: "bg-gradient-to-br from-yellow-300 to-amber-400", shadow: "shadow-yellow-400/15" };
    if (level >= 20) return { frame: "bg-gradient-to-br from-slate-300 to-gray-500", shadow: "shadow-slate-400/15" };
    if (level >= 10) return { frame: "bg-gradient-to-br from-amber-600 to-yellow-800", shadow: "shadow-amber-600/15" };
    return { frame: "bg-gradient-to-br from-neutral-600 to-neutral-800", shadow: "shadow-neutral-500/10" };
};

const PlayerHubPanel: React.FC<{ user: User, xpToNextLevel: number, onUpdateUser: (user: User) => Promise<void>, isRecalculatingXp: boolean }> = ({ user, xpToNextLevel, onUpdateUser, isRecalculatingXp }) => {
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

    const xpProgress = xpToNextLevel > 0 ? Math.min(100, Math.max(0, (user.experience / xpToNextLevel) * 100)) : 0;
    const peakLevel = user.peakLevel || user.level;
    const levelProgress = peakLevel > 0 ? Math.min(100, Math.max(0, (user.level / peakLevel) * 100)) : 100;

    const appearance = getLevelAppearance(user.level);
    const adventureProgress = user.adventure;
    const gameTitle = getGameTitleForLevel(user.level);
    const nextRole = RPG_LEVELS.find(r => r.level > user.level);

    const handleSelectAvatar = async (newAvatarUrl: string) => {
        await onUpdateUser({ ...user, avatar: newAvatarUrl });
        setIsAvatarModalOpen(false);
    };

    return (
        <>
            <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col gap-4">
                {/* --- ROW 1: PROFILE --- */}
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                    {/* Avatar + Name/Role */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                        <button onClick={() => setIsAvatarModalOpen(true)} className="group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 rounded-2xl">
                            <div className={`relative p-1 rounded-2xl ${appearance.frame} shadow-md ${appearance.shadow}`}>
                                <img src={user.avatar} className="w-16 h-16 rounded-xl bg-white border-2 border-white/50 object-contain p-1" alt="User Avatar" />
                                <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Edit3 size={20} className="text-white" />
                                </div>
                            </div>
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black text-neutral-900 tracking-tight">{user.name}</h2>
                                {isRecalculatingXp && <Loader2 size={14} className="animate-spin text-neutral-400" />}
                            </div>
                            <p className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
                                <Crown size={12} className="text-yellow-500"/> {gameTitle}
                            </p>
                        </div>
                    </div>
                    
                    {/* XP & Level Bars */}
                    <div className="flex items-center gap-4 flex-grow min-w-[200px]">
                        <div className="px-4 py-1 bg-neutral-900 text-white rounded-full font-black text-xs border-2 border-white shadow-sm text-center">
                            LVL {user.level}
                        </div>
                        <div className="w-full space-y-3">
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                                    <span>Experience</span>
                                    <span>{user.experience} / {xpToNextLevel} XP</span>
                                </div>
                                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/80 mt-1">
                                    <div className="h-full bg-emerald-500" style={{ width: `${xpProgress}%` }} />
                                </div>
                            </div>
                            {(peakLevel > user.level) && (
                                <div className="animate-in fade-in">
                                    <div className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                                        <span>Level vs Peak</span>
                                        <span>{user.level} / {peakLevel} (Peak)</span>
                                    </div>
                                    <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/80 mt-1">
                                        <div className="h-full bg-amber-500" style={{ width: `${levelProgress}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- ROW 2: ACTIONS & PROGRESSION --- */}
                <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 p-2 bg-neutral-50 border border-neutral-100 rounded-xl" title="Unlock Keys & Fragments">
                            <Key size={14} className="text-amber-500"/>
                            <span className="text-sm font-black text-neutral-900">{adventureProgress?.keys ?? 0}</span>
                            <div className="w-px h-4 bg-neutral-200"></div>
                            <GitCommit size={14} className="text-neutral-500"/>
                            <span className="text-sm font-black text-neutral-900">{adventureProgress?.keyFragments ?? 0}/3</span>
                        </div>
                        
                        <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-100 rounded-xl" title="Energy">
                            <Zap size={14} className="text-yellow-600 fill-yellow-600"/>
                            <span className="text-sm font-black text-yellow-900">{adventureProgress?.energy ?? 0}</span>
                        </div>
                    </div>
                    
                    {nextRole && (
                        <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-neutral-400 animate-in fade-in">
                            <span>Reach LVL {nextRole.level} for: <strong>{nextRole.title}</strong></span>
                            <Star size={12} className="text-amber-400" />
                        </div>
                    )}
                </div>
            </div>

            <AvatarSelectionModal isOpen={isAvatarModalOpen} onClose={() => setIsAvatarModalOpen(false)} onSelectAvatar={handleSelectAvatar} currentUser={user} />
        </>
    );
};

export interface DiscoverUIProps {
    user: User;
    xpToNextLevel: number;
    gameMode: DiscoverGame;
    setGameMode: (mode: DiscoverGame) => void;
    score: number;
    onExit: () => void;
    onRestart: () => void;
    isGameOver: boolean;
    xpGained: { amount: number, levelUp: boolean, newLevel: number | null } | null;
    renderGame: () => React.ReactNode;
    onUpdateUser: (user: User) => Promise<void>;
    isRecalculatingXp: boolean;
}

export const DiscoverUI: React.FC<DiscoverUIProps> = ({
    user, xpToNextLevel, gameMode, setGameMode, score, 
    onExit, onRestart, isGameOver, xpGained, renderGame, onUpdateUser, isRecalculatingXp
}) => {

    if (gameMode === 'MENU') {
        return (
            <div className="space-y-8 animate-in fade-in duration-500 pb-20">
                <PlayerHubPanel user={user} xpToNextLevel={xpToNextLevel} onUpdateUser={onUpdateUser} isRecalculatingXp={isRecalculatingXp} />

                <div className="space-y-4">
                    <header className="flex justify-between items-end">
                      <div>
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Game Modes</h2>
                        <p className="text-neutral-500 mt-2 font-medium">Practice specific vocabulary skills through challenges.</p>
                      </div>
                      <button onClick={() => setGameMode('ADVENTURE')} className="group flex items-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95">
                          <Map size={16}/>
                          <span>Adventure</span>
                      </button>
                    </header>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                        <MenuCard title="Collocation Connect" desc="Match words with partners." icon={Split} color="blue" onClick={() => setGameMode('COLLO_CONNECT')} />
                        <MenuCard title="Idiom Connect" desc="Match words to form idioms." icon={Quote} color="amber" onClick={() => setGameMode('IDIOM_CONNECT')} />
                        <MenuCard title="IPA Sorter" desc="Distinguish similar sounds." icon={Move} color="rose" onClick={() => setGameMode('IPA_SORTER')} />
                        <MenuCard title="Meaning Match" desc="Word to definition." icon={BookOpen} color="teal" onClick={() => setGameMode('MEANING_MATCH')} />
                        <MenuCard title="Sentence Scramble" desc="Reconstruct sentences." icon={Shuffle} color="emerald" onClick={() => setGameMode('SENTENCE_SCRAMBLE')} />
                        <MenuCard title="Preposition Power" desc="Fill in the blanks." icon={AtSign} color="violet" onClick={() => setGameMode('PREPOSITION_POWER')} />
                        <MenuCard title="Word Transformer" desc="Change word forms." icon={SlidersHorizontal} color="orange" onClick={() => setGameMode('WORD_TRANSFORMER')} />
                        <MenuCard title="Paraphrase Context" desc="Match variations to context." icon={Zap} color="cyan" onClick={() => setGameMode('PARAPHRASE_CONTEXT')} />
                        <MenuCard title="Word Scatter" desc="Find words that match the cue." icon={BoxSelect} color="fuchsia" onClick={() => setGameMode('WORD_SCATTER')} />
                    </div>
                </div>
            </div>
        );
    }

    if (isGameOver) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-8 animate-in zoom-in-95 pb-20">
                <div className="p-8 bg-yellow-100 rounded-full text-yellow-600 mb-4 shadow-lg animate-bounce">
                    <Trophy size={64} />
                </div>
                <h2 className="text-4xl font-black text-neutral-900">Stage Cleared!</h2>
                <div className="text-center space-y-1">
                    <p className="text-neutral-400 font-bold uppercase tracking-widest text-xs">Final Score</p>
                    <p className="text-6xl font-black text-neutral-900">{score}</p>
                </div>
                {xpGained && (
                    <div className="text-center space-y-2 animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-lg font-black text-emerald-600">+ {xpGained.amount} XP</p>
                        {xpGained.levelUp && (
                            <p className="text-2xl font-black text-yellow-600 flex items-center gap-2">
                                <Sparkles size={24} className="fill-yellow-500 text-yellow-500" />
                                <span>Level Up! Now Level {xpGained.newLevel}!</span>
                                <Sparkles size={24} className="fill-yellow-500 text-yellow-500" />
                            </p>
                        )}
                    </div>
                )}
                <div className="flex gap-4">
                    <button onClick={onExit} className="px-8 py-4 bg-white border border-neutral-200 text-neutral-500 font-bold rounded-2xl hover:bg-neutral-50 transition-all">Exit</button>
                    <button onClick={onRestart} className="px-8 py-4 bg-neutral-900 text-white font-bold rounded-2xl hover:bg-neutral-800 transition-all shadow-lg flex items-center gap-2"><RefreshCw size={18}/> Play Again</button>
                </div>
            </div>
        );
    }
    
    // Render the active game, wrapped in a light container
    return (
        <div className="bg-white h-full rounded-[2.5rem] border border-neutral-200 shadow-sm animate-in fade-in duration-500 overflow-hidden">
            {renderGame()}
        </div>
    );
};