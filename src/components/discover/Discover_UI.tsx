
import React, { useState } from 'react';
import { User } from '../../app/types';
import { DiscoverGame } from '../../app/types';
import { Gamepad2, ArrowLeft, RefreshCw, Trophy, Target, Split, Move, BookOpen, Shuffle, X, AtSign, SlidersHorizontal, Sparkles, User as UserIcon, Crown, Map, Key, GitCommit, Award, ShoppingBag, Star, Edit3, Lock } from 'lucide-react';
import { BADGES } from '../../data/adventure_content';

// RPG Roles/Titles for Leveling Up
const RPG_ROLES: { level: number; title: string; }[] = [
    { level: 1, title: 'Vocab Novice' },
    { level: 5, title: 'Word Apprentice' },
    { level: 10, title: 'Lexical Explorer' },
    { level: 15, title: 'Phrase Finder' },
    { level: 20, title: 'Master Grammarian' },
    { level: 25, title: 'Collocation Captain' },
    { level: 30, title: 'IELTS Wordsmith' },
    { level: 40, title: 'Articulate Architect' },
    { level: 50, title: 'IELTS Luminary' },
    { level: 75, title: 'Grand Lexicographer' },
    { level: 100, title: 'Vocabulary Virtuoso' },
    { level: 150, title: 'Oracle of Oration' },
    { level: 200, title: 'Grandmaster of Grammar' },
    { level: 400, title: 'Lord of Linguistics' },
    { level: 500, title: 'Legendary Lexicon' },
    { level: 750, title: 'Word-Ender' },
    { level: 999, title: 'The Logophile' },
];

const STANDARD_AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Bella',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Lucy',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Vocab',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Pro'
];

const TITLE_AVATARS = RPG_ROLES.map(role => ({
    title: role.title,
    level: role.level,
    url: `https://api.dicebear.com/7.x/micah/svg?seed=${role.title.replace(/\s/g, '')}`
}));

const getGameTitleForLevel = (level: number): string => {
  let title = 'Vocab Novice'; // Default starting role
  for (const r of RPG_ROLES) {
    if (level >= r.level) {
      title = r.title;
    } else {
      break; 
    }
  }
  return title;
};

const AvatarSelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectAvatar: (url: string) => void;
  currentUser: User;
}> = ({ isOpen, onClose, onSelectAvatar, currentUser }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 relative shadow-xl border border-neutral-200 flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={18} /></button>
        <h3 className="text-xl font-black text-neutral-900 mb-6 flex items-center gap-2"><UserIcon size={20}/> Select Avatar</h3>
        
        <div className="overflow-y-auto space-y-6 pr-2 -mr-2">
            {/* Standard Avatars */}
            <div>
                <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-3">Standard</h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                    {STANDARD_AVATARS.map((url, index) => (
                        <button key={index} onClick={() => onSelectAvatar(url)} className={`group relative aspect-square rounded-2xl p-2 transition-all ${currentUser.avatar === url ? 'bg-indigo-500 ring-4 ring-indigo-200' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
                            <img src={url} alt={`Avatar ${index + 1}`} className="w-full h-full rounded-lg" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Title Avatars */}
            <div>
                <h4 className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-3">Title Avatars</h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                    {TITLE_AVATARS.map((avatar) => {
                        const isUnlocked = true; // User requested all avatars be selectable for now
                        const isSelected = currentUser.avatar === avatar.url;
                        return (
                            <button key={avatar.title} onClick={() => isUnlocked && onSelectAvatar(avatar.url)} disabled={!isUnlocked} className={`group relative aspect-square rounded-2xl p-2 transition-all ${isSelected ? 'bg-indigo-500 ring-4 ring-indigo-200' : 'bg-neutral-100 hover:bg-neutral-200'} ${!isUnlocked ? 'grayscale opacity-50 cursor-not-allowed' : ''}`}>
                                <img src={avatar.url} alt={avatar.title} className="w-full h-full rounded-lg bg-neutral-200" />
                                {!isUnlocked && <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center"><Lock size={20} className="text-white"/></div>}
                                <div className="absolute -bottom-2 w-full flex justify-center"><span className="text-[8px] bg-neutral-800 text-white font-bold px-1.5 py-0.5 rounded-full shadow">{avatar.title}</span></div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};


// Card for main training modes (Explore/Arcade)
const TrainingModeCard: React.FC<{ title: string; desc: string; icon: React.ElementType; color: string; onClick: () => void; }> = ({ title, desc, icon: Icon, color, onClick }) => (
    <button 
        onClick={onClick}
        className={`group relative w-full p-8 rounded-[2.5rem] border-2 shadow-sm transition-all duration-300 text-left overflow-hidden
            bg-white hover:shadow-xl hover:border-${color}-300 border-neutral-200`}
    >
        <div className={`absolute -right-8 -bottom-8 w-40 h-40 rounded-full bg-${color}-500/10 transition-transform duration-500 group-hover:scale-125`} />
        <div className={`relative z-10 flex flex-col h-full`}>
            <div className={`p-4 bg-${color}-100 text-${color}-600 rounded-2xl w-fit mb-4`}>
                <Icon size={32} />
            </div>
            <div className="mt-auto">
                <h3 className={`text-2xl font-black text-neutral-900`}>{title}</h3>
                <p className={`text-sm font-medium text-neutral-500 mt-1`}>{desc}</p>
            </div>
        </div>
    </button>
);

// Card for individual arcade games (light theme)
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

const AchievementsModal: React.FC<{ badges: string[], onClose: () => void }> = ({ badges, onClose }) => (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 relative shadow-xl border border-neutral-200">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={18} /></button>
            <h3 className="text-xl font-black text-neutral-900 mb-6 flex items-center gap-2"><Award size={20}/> Achievements</h3>
            {badges.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-neutral-200 rounded-xl text-neutral-500 text-sm font-bold">No badges earned yet.</div>
            ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                    {Object.values(BADGES).map(badge => {
                        const isEarned = badges.includes(badge.id);
                        return (
                            <div key={badge.id} className="group relative" title={isEarned ? `${badge.name}: ${badge.description}` : badge.name}>
                                <div className={`aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 ${isEarned ? `${badge.color} border-2 border-white/20 shadow-lg` : 'bg-neutral-100 grayscale opacity-50'}`}>
                                    <span className="text-4xl drop-shadow-md">{badge.icon}</span>
                                </div>
                                <p className={`text-[9px] font-bold text-center mt-1 truncate ${isEarned ? 'text-neutral-800' : 'text-neutral-400'}`}>{badge.name}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    </div>
);

const InventoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 relative shadow-xl border border-neutral-200">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={18} /></button>
            <h3 className="text-xl font-black text-neutral-900 mb-6 flex items-center gap-2"><ShoppingBag size={20}/> Bag</h3>
            <div className="p-8 text-center border-2 border-dashed border-neutral-200 rounded-xl text-neutral-500 text-sm font-bold">
                Additional inventory items will appear here in the future.
            </div>
        </div>
    </div>
);

const PlayerHubPanel: React.FC<{ user: User, xpToNextLevel: number, onUpdateUser: (user: User) => Promise<void> }> = ({ user, xpToNextLevel, onUpdateUser }) => {
    const [isAchievementsModalOpen, setIsAchievementsModalOpen] = useState(false);
    const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

    const xpProgress = Math.min(100, Math.max(0, (user.experience / xpToNextLevel) * 100));
    const appearance = getLevelAppearance(user.level);
    const adventureProgress = user.adventure;
    const gameTitle = getGameTitleForLevel(user.level);
    const nextRole = RPG_ROLES.find(r => r.level > user.level);

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
                                <img src={user.avatar} className="w-12 h-12 rounded-xl bg-neutral-100 border-2 border-white/50" alt="User Avatar" />
                                <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Edit3 size={20} className="text-white" />
                                </div>
                            </div>
                        </button>
                        <div>
                            <h2 className="text-lg font-black text-neutral-900 tracking-tight">{user.name}</h2>
                            <p className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
                                <Crown size={12} className="text-yellow-500"/> {gameTitle}
                            </p>
                        </div>
                    </div>
                    
                    {/* XP Bar + Level */}
                    <div className="flex items-center gap-4 flex-grow min-w-[200px]">
                        <div className="w-full">
                            <div className="flex justify-between text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                                <span>Experience</span>
                                <span>{user.experience} / {xpToNextLevel} XP</span>
                            </div>
                            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/80 mt-1">
                                <div className="h-full bg-emerald-500" style={{ width: `${xpProgress}%` }} />
                            </div>
                        </div>
                        <div className="px-4 py-1 bg-neutral-900 text-white rounded-full font-black text-xs border-2 border-white shadow-sm text-center">
                            LVL {user.level}
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
                        
                        <button onClick={() => setIsInventoryModalOpen(true)} className="p-2.5 bg-white border border-neutral-200 rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors shadow-sm" title="Open Bag">
                            <ShoppingBag size={18} />
                        </button>
                        <button onClick={() => setIsAchievementsModalOpen(true)} className="p-2.5 bg-white border border-neutral-200 rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors shadow-sm" title="View Achievements">
                            <Award size={18} />
                        </button>
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
            {isAchievementsModalOpen && <AchievementsModal badges={user.adventure?.badges || []} onClose={() => setIsAchievementsModalOpen(false)} />}
            {isInventoryModalOpen && <InventoryModal onClose={() => setIsInventoryModalOpen(false)} />}
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
}

export const DiscoverUI: React.FC<DiscoverUIProps> = ({
    user, xpToNextLevel, gameMode, setGameMode, score, 
    onExit, onRestart, isGameOver, xpGained, renderGame, onUpdateUser
}) => {
    const [arcadeVisible, setArcadeVisible] = useState(false);

    if (gameMode === 'MENU') {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <PlayerHubPanel user={user} xpToNextLevel={xpToNextLevel} onUpdateUser={onUpdateUser} />

                <div className="space-y-4">
                    <header>
                        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Training Grounds</h2>
                        <p className="text-neutral-500 mt-2 font-medium">Hone your skills, earn experience, and conquer challenges.</p>
                    </header>
                    
                    {arcadeVisible ? (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-black text-neutral-900">Arcade Games</h3>
                                <button onClick={() => setArcadeVisible(false)} className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 font-bold text-xs"><ArrowLeft size={14}/> Back to Training</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <MenuCard title="Collocation Connect" desc="Match words with partners." icon={Split} color="blue" onClick={() => setGameMode('COLLO_CONNECT')} />
                                <MenuCard title="IPA Sorter" desc="Distinguish similar sounds." icon={Move} color="rose" onClick={() => setGameMode('IPA_SORTER')} />
                                <MenuCard title="Meaning Match" desc="Word to definition." icon={BookOpen} color="teal" onClick={() => setGameMode('MEANING_MATCH')} />
                                <MenuCard title="Sentence Scramble" desc="Reconstruct sentences." icon={Shuffle} color="emerald" onClick={() => setGameMode('SENTENCE_SCRAMBLE')} />
                                <MenuCard title="Preposition Power" desc="Fill in the blanks." icon={AtSign} color="violet" onClick={() => setGameMode('PREPOSITION_POWER')} />
                                <MenuCard title="Word Transformer" desc="Change word forms." icon={SlidersHorizontal} color="orange" onClick={() => setGameMode('WORD_TRANSFORMER')} />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                            <TrainingModeCard title="Explore" desc="Embark on a journey, conquer regions, and defeat bosses." icon={Map} color="indigo" onClick={() => setGameMode('ADVENTURE')} />
                            <TrainingModeCard title="Arcade" desc="Play quick mini-games to practice specific vocabulary skills." icon={Gamepad2} color="rose" onClick={() => setArcadeVisible(true)} />
                        </div>
                    )}
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
        <div className="bg-white min-h-full rounded-[2.5rem] border border-neutral-200 shadow-sm animate-in fade-in duration-500 overflow-hidden">
            {renderGame()}
        </div>
    );
};
