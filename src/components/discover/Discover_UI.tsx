
import React, { useState } from 'react';
import { User } from '../../app/types';
import { Crown, Key, GitCommit, Zap, Edit3, Star, Loader2 } from 'lucide-react';
import { AvatarSelectionModal } from '../common/AvatarSelectionModal';

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
    onUpdateUser: (user: User) => Promise<void>;
    isRecalculatingXp: boolean;
    children?: React.ReactNode;
}

export const DiscoverUI: React.FC<DiscoverUIProps> = ({
    user, xpToNextLevel, onUpdateUser, isRecalculatingXp, children
}) => {
    return (
        <div className="flex flex-col h-[calc(100vh-100px)] space-y-6 animate-in fade-in duration-500">
            <div className="shrink-0">
                <PlayerHubPanel user={user} xpToNextLevel={xpToNextLevel} onUpdateUser={onUpdateUser} isRecalculatingXp={isRecalculatingXp} />
            </div>
            
            {/* Adventure Game Area */}
            <div className="flex-1 min-h-0 relative">
                 {children}
            </div>
        </div>
    );
};
