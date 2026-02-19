
import React, { useState, useEffect } from 'react';
import { User, AdventureProgress, MapNode } from '../../../../app/types';
import { X, ArrowRight, Zap, Key, GitCommit, ShoppingBag, ChevronLeft, ChevronRight, MapPin, Terminal, ShieldCheck, Swords, Skull, Trophy } from 'lucide-react';

interface Props {
    user: User;
    progress: AdventureProgress;
    onExit: () => void;
    map: MapNode[];
    onMove: () => void;
    onNodeClick: (node: MapNode) => void;
    onOpenInventory: () => void;
    onAdminAction?: (action: 'add_energy' | 'remove_energy' | 'add_key' | 'remove_key' | 'add_hp' | 'remove_hp' | 'add_fruit' | 'remove_fruit' | 'pass_boss') => void;
}

// Fluent Emoji URLs
const ASSETS = {
    rocket: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Rocket.png",
    planet: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Ringed%20Planet.png",
    comet: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Comet.png",
    saucer: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Flying%20Saucer.png",
    star: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Star.png",
    telescope: "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Telescope.png"
};

const getNodeIcon = (node: MapNode) => {
    switch (node.type) {
        case 'boss': 
            // If defeated, show the boss icon but grayscaled/dimmed to indicate history
            if (node.isDefeated) {
                return (
                    <div className="relative grayscale opacity-60">
                        {node.boss_details?.image || '👹'}
                        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border border-white">
                             <ShieldCheck size={10} className="text-white" />
                        </div>
                    </div>
                );
            }
            // If alive, show the specific boss icon
            return node.boss_details?.image || '👹';
        case 'treasure': return '👑';
        case 'key_fragment': return '🗝️';
        default: return '★';
    }
};

const getSpaceshipTier = (level: number) => {
    if (level >= 50) return 4;
    if (level >= 25) return 3;
    if (level >= 10) return 2;
    return 1;
};

const SpaceshipAvatar: React.FC<{ user: User }> = ({ user }) => {
    const tier = getSpaceshipTier(user.peakLevel || 1);
    
    // Tier effects (Glow color)
    const glowColor = 
        tier === 1 ? 'shadow-indigo-500/50' :
        tier === 2 ? 'shadow-cyan-500/60' :
        tier === 3 ? 'shadow-orange-500/70' :
        'shadow-fuchsia-500/80';

    return (
        <div className="absolute -top-24 z-30 flex flex-col items-center animate-bounce duration-[2000ms]">
            <div className={`relative w-24 h-24 transition-all duration-500`}>
                {/* The Rocket Image */}
                <img 
                    src={ASSETS.rocket} 
                    alt="Rocket" 
                    className={`w-full h-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] filter`}
                    style={{ transform: 'rotate(-45deg)' }}
                />
                
                {/* User Avatar "In the window" */}
                <div className="absolute top-1/2 left-1/2 -translate-x-[50%] -translate-y-[50%] w-8 h-8 rounded-full overflow-hidden border-2 border-white/50 shadow-inner bg-black/20">
                    <img src={user.avatar} className="w-full h-full object-cover" alt="Pilot" />
                </div>

                {/* Engine Exhaust Effect */}
                <div className="absolute bottom-2 left-2 w-4 h-4 bg-orange-500 rounded-full blur-md animate-ping opacity-75"></div>
                <div className="absolute bottom-3 left-3 w-2 h-2 bg-yellow-300 rounded-full blur-sm animate-pulse"></div>
            </div>

            <div className={`mt-1 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider text-white border border-white/20 shadow-lg ${glowColor}`}>
                Lvl {user.peakLevel || 1}
            </div>
        </div>
    );
};

// --- Hall of Fame Modal ---
const HallOfFameModal: React.FC<{ isOpen: boolean; onClose: () => void; defeatedBosses: MapNode[] }> = ({ isOpen, onClose, defeatedBosses }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[80vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-black text-amber-500 flex items-center gap-2"><Trophy size={20} fill="currentColor"/> Hall of Fame</h3>
                        </div>
                        <p className="text-sm text-neutral-500 mt-1">Bosses conquered on your journey.</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 overflow-y-auto">
                    {defeatedBosses.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">
                            <Skull size={32} className="mx-auto mb-2 opacity-50"/>
                            <p className="font-bold text-xs">No bosses defeated yet.</p>
                            <p className="text-[10px] mt-1">Defeat bosses at every 10th level!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            {defeatedBosses.map((node) => (
                                <div key={node.id} className="bg-neutral-50 border border-neutral-100 p-4 rounded-2xl flex flex-col items-center text-center shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-2 right-2 text-green-500"><ShieldCheck size={16} /></div>
                                    <div className="text-5xl mb-3 grayscale group-hover:grayscale-0 transition-all duration-300 transform group-hover:scale-110">
                                        {node.boss_details?.image}
                                    </div>
                                    <h4 className="text-sm font-black text-neutral-900 leading-tight">{node.boss_details?.name}</h4>
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mt-1">Level {node.id + 1}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};


export const AdventureUI: React.FC<Props> = ({ user, progress, onExit, map, onMove, onNodeClick, onOpenInventory, onAdminAction }) => {
    const VISIBLE_COUNT = 6;
    const TOTAL_NODES = map.length;
    const VISIBLE_FUTURE_RANGE = 5; 
    
    const [viewStartIndex, setViewStartIndex] = useState(0);
    const [isTrophyModalOpen, setIsTrophyModalOpen] = useState(false);

    const maxViewStartIndex = Math.min(TOTAL_NODES - VISIBLE_COUNT, progress.currentNodeIndex);

    // Filter defeated bosses for Hall of Fame
    const defeatedBosses = map.filter(node => node.type === 'boss' && node.isDefeated);

    useEffect(() => {
        centerViewOnPlayer();
    }, [progress.currentNodeIndex]);

    const centerViewOnPlayer = () => {
        let newStart = progress.currentNodeIndex - Math.floor(VISIBLE_COUNT / 2);
        if (newStart < 0) newStart = 0;
        if (newStart > maxViewStartIndex) newStart = maxViewStartIndex;
        setViewStartIndex(newStart);
    };

    const handleScroll = (direction: 'left' | 'right') => {
        setViewStartIndex(prev => {
            let next = direction === 'left' ? prev - 1 : prev + 1;
            if (next < 0) next = 0;
            if (next > maxViewStartIndex) next = maxViewStartIndex;
            return next;
        });
    };

    const trackWidthPercent = (TOTAL_NODES / VISIBLE_COUNT) * 100;
    const translatePercent = -(viewStartIndex * (100 / TOTAL_NODES));
    const parallaxTranslatePercent = translatePercent * 0.3; // Parallax effect
    const halfNodePercent = 50 / TOTAL_NODES;
    const currentNode = map[progress.currentNodeIndex];
    const isStuckAtBoss = currentNode?.type === 'boss' && !currentNode?.isDefeated;

    return (
        <div className="h-full flex flex-col bg-[#0f172a] text-white rounded-[2rem] overflow-hidden relative border-4 border-[#1e293b] shadow-2xl">
            {/* --- COSMIC BACKGROUND --- */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#1e1b4b] via-[#0f172a] to-[#020617]"></div>
                
                <div 
                    className="absolute top-0 bottom-0 left-0 transition-transform duration-500 ease-out will-change-transform"
                    style={{
                        width: `${trackWidthPercent}%`,
                        transform: `translateX(${parallaxTranslatePercent}%)`
                    }}
                >
                    {/* --- DENSE STARTING AREA --- */}
                    {/* Big planet near start */}
                    <img src={ASSETS.planet} alt="Planet" className="absolute w-40 h-40 opacity-40 animate-float" style={{ animationDuration: '8s', top: '5%', left: '2%' }} />
                    
                    {/* Comet streaking by */}
                    <img src={ASSETS.comet} alt="Comet" className="absolute w-28 h-28 opacity-60 animate-pulse" style={{ animationDuration: '3s', top: '50%', left: '5%' }} />
                    
                    {/* Flying Saucer */}
                    <img src={ASSETS.saucer} alt="Saucer" className="absolute w-20 h-20 opacity-30 animate-bounce" style={{ animationDuration: '6s', bottom: '10%', left: '7%' }} />

                    {/* Galaxy and Planets (Emojis) */}
                    <div className="absolute text-9xl opacity-10 animate-spin-slow" style={{ top: '60%', left: '8%', animationDuration: '50s' }}>🌀</div>
                    <div className="absolute text-5xl opacity-50 animate-float" style={{ top: '10%', left: '1%', animationDuration: '7s' }}>🌚</div>

                    {/* Stars (Images) */}
                    <img src={ASSETS.star} alt="Star" className="absolute w-10 h-10 opacity-70 animate-pulse" style={{ top: '15%', left: '9%' }} />
                    <img src={ASSETS.star} alt="Star" className="absolute w-6 h-6 opacity-50 animate-pulse" style={{ animationDelay: '0.5s', bottom: '40%', left: '3%' }} />
                    <img src={ASSETS.star} alt="Star" className="absolute w-8 h-8 opacity-60 animate-pulse" style={{ animationDelay: '1s', top: '75%', left: '6%' }} />
                    
                    {/* Tiny dot stars for depth */}
                    <div className="absolute w-1 h-1 bg-white rounded-full opacity-70 animate-pulse" style={{ top: '25%', left: '1%' }}></div>
                    <div className="absolute w-1.5 h-1.5 bg-blue-200 rounded-full opacity-50" style={{ top: '80%', left: '4%' }}></div>
                    <div className="absolute w-1 h-1 bg-purple-300 rounded-full opacity-60 animate-ping" style={{animationDuration: '4s', bottom: '60%', left: '8.5%' }}></div>
                    <div className="absolute w-1 h-1 bg-white rounded-full opacity-50 animate-pulse" style={{ animationDelay: '1.5s', top: '5%', left: '7%' }}></div>
                    <div className="absolute w-1 h-1 bg-white rounded-full opacity-70" style={{ top: '90%', left: '9.5%' }}></div>

                    {/* --- SPREAD OUT ELEMENTS FOR THE REST OF THE MAP --- */}
                    <img src={ASSETS.planet} alt="Planet" className="absolute w-32 h-32 opacity-30 animate-float" style={{ animationDuration: '7s', top: '15%', left: '22%' }} />
                    <img src={ASSETS.star} alt="Star" className="absolute w-8 h-8 opacity-60 animate-pulse" style={{ top: '70%', left: '35%' }} />
                    <div className="absolute text-8xl opacity-10 animate-spin-slow" style={{ top: '20%', left: '55%', animationDuration: '45s' }}>🌀</div>
                    <img src={ASSETS.comet} alt="Comet" className="absolute w-24 h-24 opacity-50" style={{ bottom: '25%', left: '65%' }} />
                    <div className="absolute text-6xl opacity-40 animate-float" style={{ top: '60%', left: '80%', animationDuration: '9s' }}>🌚</div>
                    <div className="absolute w-1.5 h-1.5 bg-blue-200 rounded-full opacity-50" style={{ top: '10%', left: '95%' }}></div>
                </div>
            </div>

            {/* --- HUD HEADER --- */}
            <header className="relative z-20 px-6 py-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 shadow-lg">
                        <div className="p-1.5 bg-yellow-500/20 rounded-lg"><Zap size={16} className="text-yellow-400 fill-yellow-400"/></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Energy</span>
                            <span className="text-sm font-black leading-none">{progress.energy} <span className="text-slate-500 text-[10px]">/ 10</span></span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 shadow-lg">
                        <div className="p-1.5 bg-amber-500/20 rounded-lg"><Key size={16} className="text-amber-400 fill-amber-400"/></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Keys</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black leading-none">{progress.keys}</span>
                                <div className="h-3 w-px bg-slate-600"></div>
                                <div className="flex items-center gap-1">
                                    <GitCommit size={12} className="text-slate-400"/>
                                    <span className="text-xs font-bold text-slate-300">{progress.keyFragments}/3</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Trophy Button */}
                    <button onClick={() => setIsTrophyModalOpen(true)} className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-400 hover:text-amber-300 rounded-xl transition-all active:scale-95 relative" title="Hall of Fame">
                        <Trophy size={18} />
                        {defeatedBosses.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-slate-800"></span>}
                    </button>
                    <button onClick={centerViewOnPlayer} className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-900/20 transition-all active:scale-95" title="Jump to my location">
                        <MapPin size={18} />
                    </button>
                    <button onClick={onOpenInventory} className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-xl transition-all active:scale-95">
                        <ShoppingBag size={18}/>
                    </button>
                    <button onClick={onExit} className="p-3 bg-slate-800 hover:bg-red-900/50 border border-slate-600 hover:border-red-500/50 text-slate-300 hover:text-red-200 rounded-xl transition-all active:scale-95">
                        <X size={18}/>
                    </button>
                </div>
            </header>

            {/* --- MAIN MAP VIEWPORT --- */}
            <main className="flex-1 relative z-10 flex flex-col justify-center overflow-hidden">
                <button 
                    onClick={() => handleScroll('left')} 
                    disabled={viewStartIndex === 0}
                    className="absolute left-4 z-30 p-3 bg-black/40 hover:bg-black/70 backdrop-blur-sm rounded-full border border-white/10 text-white transition-all disabled:opacity-0 hover:scale-110 active:scale-95"
                >
                    <ChevronLeft size={32} />
                </button>
                <button 
                    onClick={() => handleScroll('right')} 
                    disabled={viewStartIndex >= maxViewStartIndex}
                    className="absolute right-4 z-30 p-3 bg-black/40 hover:bg-black/70 backdrop-blur-sm rounded-full border border-white/10 text-white transition-all disabled:opacity-0 hover:scale-110 active:scale-95"
                >
                    <ChevronRight size={32} />
                </button>

                <div className="w-full h-96 relative overflow-hidden">
                    <div 
                        className="absolute top-0 h-full flex items-center transition-transform duration-500 ease-out will-change-transform"
                        style={{ 
                            width: `${trackWidthPercent}%`,
                            transform: `translateX(${translatePercent}%)` 
                        }}
                    >
                        <div 
                            className="absolute top-1/2 -translate-y-1/2 h-1"
                            style={{ 
                                left: `${halfNodePercent}%`,
                                right: `${halfNodePercent}%`
                            }}
                        > 
                            <div className="w-full h-full bg-slate-800 rounded-full relative">
                                <div 
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all duration-1000"
                                    style={{ width: `${(progress.currentNodeIndex / (TOTAL_NODES - 1)) * 100}%` }}
                                ></div>
                            </div>
                        </div>

                        {map.map((node, index) => {
                            const isFarFuture = index > progress.currentNodeIndex + VISIBLE_FUTURE_RANGE;

                            if (isFarFuture) {
                                return (
                                    <div 
                                        key={node.id}
                                        className="h-full flex items-center justify-center relative"
                                        style={{ width: `${100 / TOTAL_NODES}%` }}
                                    >
                                        <div className="relative group flex items-center justify-center">
                                            <div className="w-10 h-10 rounded-full bg-black shadow-[0_0_25px_rgba(0,0,0,1)] border border-slate-800 opacity-60 flex items-center justify-center">
                                                <div className="w-full h-full rounded-full bg-slate-900 animate-pulse opacity-50"></div>
                                            </div>
                                            <div className="absolute w-14 h-14 border border-slate-800/30 rounded-full animate-spin-slow pointer-events-none"></div>
                                        </div>
                                    </div>
                                );
                            }

                            const isCurrent = index === progress.currentNodeIndex;
                            const isPassed = index < progress.currentNodeIndex;
                            const isBoss = node.type === 'boss';
                            const isDefeated = node.isDefeated;
                            
                            let nodeSize = 'w-16 h-16';
                            let nodeBase = 'bg-slate-800 border-slate-600 text-slate-500 cursor-default';
                            let shadow = '';
                            let transform = 'scale(1)';

                            if (isCurrent) {
                                nodeBase = 'bg-slate-700 border-slate-500 text-slate-300';
                                shadow = 'shadow-[0_0_30px_rgba(99,102,241,0.2)]';
                            } else if (isPassed) {
                                nodeBase = 'bg-emerald-900/80 border-emerald-500 text-emerald-400';
                                shadow = 'shadow-[0_0_15px_rgba(16,185,129,0.3)]';
                            } 
                            
                            if (isBoss) {
                                nodeSize = 'w-24 h-24';
                                if (isDefeated) {
                                    nodeBase = 'bg-slate-800 border-slate-600 text-slate-500';
                                    if (isCurrent) nodeBase = 'bg-slate-700 border-slate-500 text-slate-400';
                                } else {
                                    nodeBase = 'bg-red-950 border-red-600 text-red-500 cursor-pointer';
                                    shadow = 'shadow-[0_0_20px_rgba(220,38,38,0.4)]';
                                    if (isCurrent) {
                                        nodeBase = 'bg-red-900 border-red-500 text-red-400 ring-4 ring-red-500/30';
                                        transform = 'scale(1.1)';
                                    }
                                }
                            }

                            return (
                                <div 
                                    key={node.id}
                                    className="h-full flex items-center justify-center relative"
                                    style={{ width: `${100 / TOTAL_NODES}%` }}
                                >
                                    <div className="relative group flex flex-col items-center">
                                        {isCurrent && <SpaceshipAvatar user={user} />}

                                        {isCurrent && (
                                            <div className="absolute -top-32 bg-amber-500 text-black text-[10px] font-black py-1 px-3 rounded-full shadow-lg animate-bounce whitespace-nowrap z-40 mb-2">
                                                HERE
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-500"></div>
                                            </div>
                                        )}

                                        <div
                                            onClick={() => onNodeClick(node)}
                                            className={`rounded-full border-[3px] flex items-center justify-center transition-all duration-300 z-10 relative ${nodeSize} ${nodeBase} ${shadow}`}
                                            style={{ transform }}
                                        >
                                            <span className="text-3xl font-black">{getNodeIcon(node)}</span>
                                            
                                            {isBoss && isCurrent && !isDefeated && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-red-900/90 rounded-full opacity-0 hover:opacity-100 transition-opacity z-20 backdrop-blur-sm cursor-pointer">
                                                    <div className="flex flex-col items-center animate-pulse">
                                                        <Swords size={32} className="text-white"/>
                                                        <span className="text-[8px] font-black uppercase text-red-200 tracking-widest mt-1">Fight!</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {!isCurrent && (
                                            <div className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-bold ${isPassed ? 'text-emerald-500' : 'text-slate-600'}`}>
                                                {index + 1}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>

            {/* --- ADMIN PANEL --- */}
            {user.isAdmin && onAdminAction && (
                <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-yellow-500/30 shadow-2xl flex flex-wrap items-center gap-2 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-2 text-yellow-500 border-r border-white/10 pr-3">
                        <Terminal size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Admin</span>
                    </div>
                    {/* Energy */}
                    <div className="flex items-center gap-1 bg-yellow-500/10 p-1 rounded-lg">
                        <button onClick={() => onAdminAction('add_energy')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold flex items-center gap-1" title="Add 10 Energy"><Zap size={12}/> +10</button>
                        <button onClick={() => onAdminAction('remove_energy')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold" title="Remove 1 Energy">-1</button>
                    </div>
                    {/* Keys */}
                    <div className="flex items-center gap-1 bg-yellow-500/10 p-1 rounded-lg">
                        <button onClick={() => onAdminAction('add_key')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold flex items-center gap-1" title="Add 1 Key"><Key size={12}/> +1</button>
                        <button onClick={() => onAdminAction('remove_key')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold" title="Remove 1 Key">-1</button>
                    </div>
                    {/* Supplies */}
                    <div className="flex items-center gap-1 bg-green-500/10 p-1 rounded-lg">
                        <button onClick={() => onAdminAction('add_hp')} className="px-2 py-1 hover:bg-green-500/20 text-green-400 rounded-md text-[10px] font-bold flex items-center gap-1" title="Add HP">🧪+</button>
                        <button onClick={() => onAdminAction('remove_hp')} className="px-2 py-1 hover:bg-green-500/20 text-green-400 rounded-md text-[10px] font-bold" title="Remove HP">-</button>
                        <button onClick={() => onAdminAction('add_fruit')} className="px-2 py-1 hover:bg-green-500/20 text-green-400 rounded-md text-[10px] font-bold flex items-center gap-1" title="Add Fruit">🍎+</button>
                        <button onClick={() => onAdminAction('remove_fruit')} className="px-2 py-1 hover:bg-green-500/20 text-green-400 rounded-md text-[10px] font-bold" title="Remove Fruit">-</button>
                    </div>
                    
                    <button onClick={() => onAdminAction('pass_boss')} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold uppercase transition-colors">
                        <ShieldCheck size={12}/> Pass Boss
                    </button>
                </div>
            )}

            <footer className="relative z-20 p-6 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-4">
                <div className="text-slate-400 text-xs font-medium tracking-wide">
                    Level {progress.currentNodeIndex + 1} / {map.length}
                </div>
                <button 
                    onClick={onMove} 
                    disabled={progress.energy <= 0 || isStuckAtBoss}
                    className="w-full max-w-sm py-4 bg-white hover:bg-slate-200 text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_25px_rgba(255,255,255,0.2)] transition-all active:scale-95 disabled:opacity-50 disabled:bg-slate-500 disabled:shadow-none flex items-center justify-center gap-3"
                >
                    <span>Move Forward</span>
                    <ArrowRight size={18} />
                </button>
            </footer>

            <HallOfFameModal isOpen={isTrophyModalOpen} onClose={() => setIsTrophyModalOpen(false)} defeatedBosses={defeatedBosses} />
        </div>
    );
};
