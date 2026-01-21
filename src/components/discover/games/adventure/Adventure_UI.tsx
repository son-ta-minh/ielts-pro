import React, { useState, useEffect, useRef } from 'react';
import { User, AdventureProgress, MapNode } from '../../../../app/types';
import { X, ArrowRight, Zap, Key, GitCommit, ShoppingBag, ChevronLeft, ChevronRight, MapPin, Lock, Disc, Terminal, ShieldCheck, Rocket, Swords, Skull } from 'lucide-react';

interface Props {
    user: User;
    progress: AdventureProgress;
    onExit: () => void;
    map: MapNode[];
    onMove: () => void;
    onNodeClick: (node: MapNode) => void;
    onOpenInventory: () => void;
    onAdminAction?: (action: 'add_energy' | 'remove_energy' | 'add_key' | 'remove_key' | 'pass_boss') => void;
}

const getNodeIcon = (node: MapNode) => {
    switch (node.type) {
        case 'boss': 
            return node.isDefeated ? <Skull size={24} className="text-neutral-500" /> : '👹';
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

    return (
        <div className="absolute -top-24 z-30 flex flex-col items-center animate-bounce duration-[2000ms]">
            <div className="relative">
                <div className={`w-16 h-16 flex items-center justify-center relative z-10 overflow-hidden shadow-[0_0_40px_rgba(139,92,246,0.6)] ${tier >= 3 ? 'rounded-2xl' : 'rounded-full'}`}>
                    {/* Dynamic Border/Bg based on tier */}
                    <div className={`absolute inset-0 opacity-80 ${
                        tier === 1 ? 'bg-gradient-to-b from-indigo-500 to-purple-600' :
                        tier === 2 ? 'bg-gradient-to-b from-cyan-500 to-blue-600' :
                        tier === 3 ? 'bg-gradient-to-b from-red-600 to-orange-500' :
                        'bg-gradient-to-b from-fuchsia-600 to-purple-900'
                    }`}></div>
                    
                    <img src={user.avatar} alt="Me" className="w-full h-full object-cover relative z-10 mix-blend-overlay opacity-90" />
                    <img src={user.avatar} alt="Me" className="absolute w-full h-full object-cover z-0 opacity-50 blur-[1px]" />

                    {/* Cockpit shine */}
                    <div className="absolute top-0 right-0 w-8 h-8 bg-white opacity-20 rounded-full blur-sm z-20"></div>
                </div>

                {/* Tier 1: Basic Thruster */}
                {tier === 1 && (
                    <>
                        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-4 h-8 bg-orange-500 blur-sm rounded-full animate-pulse"></div>
                        <div className="absolute top-6 -left-4 w-6 h-8 bg-indigo-700 -skew-y-12 -z-10 rounded-l-lg border-2 border-indigo-900"></div>
                        <div className="absolute top-6 -right-4 w-6 h-8 bg-indigo-700 skew-y-12 -z-10 rounded-r-lg border-2 border-indigo-900"></div>
                    </>
                )}

                {/* Tier 2: Seeker (Forward Swept) */}
                {tier === 2 && (
                    <>
                        <div className="absolute -bottom-5 left-1/3 w-3 h-10 bg-cyan-400 blur-sm rounded-full animate-pulse"></div>
                        <div className="absolute -bottom-5 right-1/3 w-3 h-10 bg-cyan-400 blur-sm rounded-full animate-pulse"></div>
                        
                        <div className="absolute top-4 -left-6 w-8 h-12 bg-cyan-700 skew-y-12 -z-10 rounded-l-md border-2 border-cyan-300"></div>
                        <div className="absolute top-4 -right-6 w-8 h-12 bg-cyan-700 -skew-y-12 -z-10 rounded-r-md border-2 border-cyan-300"></div>
                    </>
                )}

                {/* Tier 3: Cruiser (Heavy Armor) */}
                {tier === 3 && (
                    <>
                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-8 h-12 bg-orange-500 blur-md rounded-full animate-pulse"></div>
                        <div className="absolute top-2 -left-8 w-10 h-14 bg-red-800 -z-10 rounded-l-xl border-4 border-red-950 shadow-lg"></div>
                        <div className="absolute top-2 -right-8 w-10 h-14 bg-red-800 -z-10 rounded-r-xl border-4 border-red-950 shadow-lg"></div>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-4 h-8 bg-red-900 -z-10"></div>
                    </>
                )}

                {/* Tier 4: Dreadnought (Energy Ring) */}
                {tier === 4 && (
                    <>
                        <div className="absolute inset-0 -m-4 border-2 border-fuchsia-400 rounded-full animate-spin-slow opacity-60"></div>
                        <div className="absolute inset-0 -m-4 border-2 border-transparent border-t-fuchsia-200 rounded-full animate-spin-reverse opacity-80"></div>
                        
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-6 h-16 bg-purple-400 blur-md rounded-full animate-pulse"></div>
                        <div className="absolute top-8 -left-10 w-12 h-2 bg-purple-500 -z-10 shadow-[0_0_15px_rgba(255,255,255,0.8)]"></div>
                        <div className="absolute top-8 -right-10 w-12 h-2 bg-purple-500 -z-10 shadow-[0_0_15px_rgba(255,255,255,0.8)]"></div>
                    </>
                )}
            </div>
            <div className="mt-3 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider text-indigo-200 border border-indigo-500/30">
                Lvl {user.peakLevel || 1}
            </div>
        </div>
    );
};

export const AdventureUI: React.FC<Props> = ({ user, progress, onExit, map, onMove, onNodeClick, onOpenInventory, onAdminAction }) => {
    const VISIBLE_COUNT = 6;
    const TOTAL_NODES = map.length;
    const VISIBLE_FUTURE_RANGE = 5; // User can only see detailed nodes up to 5 steps ahead
    
    // Viewport state (which index is the left-most visible node)
    const [viewStartIndex, setViewStartIndex] = useState(0);

    // Calculate the maximum index the viewport can start at.
    // We limit scrolling so the user cannot scroll purely into "Deep Space" (Black Holes).
    const maxViewStartIndex = Math.min(TOTAL_NODES - VISIBLE_COUNT, progress.currentNodeIndex);

    // Initialize view to center the current user node
    useEffect(() => {
        centerViewOnPlayer();
    }, [progress.currentNodeIndex]);

    const centerViewOnPlayer = () => {
        let newStart = progress.currentNodeIndex - Math.floor(VISIBLE_COUNT / 2);
        
        // Clamp bounds
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
    
    // Dynamic padding to ensure line starts exactly at center of first node and ends at center of last node
    const halfNodePercent = 50 / TOTAL_NODES;

    // Check if the player is currently stuck at a boss node (is boss AND not defeated)
    const currentNode = map[progress.currentNodeIndex];
    const isStuckAtBoss = currentNode?.type === 'boss' && !currentNode?.isDefeated;

    return (
        <div className="h-full flex flex-col bg-[#0f172a] text-white rounded-[2rem] overflow-hidden relative border-4 border-[#1e293b] shadow-2xl">
            {/* --- COSMIC BACKGROUND --- */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#0f172a] to-[#0f172a]"></div>
                {/* Stars */}
                <div className="absolute top-10 left-20 w-1 h-1 bg-white rounded-full opacity-60 animate-pulse"></div>
                <div className="absolute top-40 right-40 w-1.5 h-1.5 bg-blue-200 rounded-full opacity-40"></div>
                <div className="absolute bottom-20 left-1/3 w-1 h-1 bg-purple-300 rounded-full opacity-50 animate-ping" style={{animationDuration: '3s'}}></div>
            </div>

            {/* --- HUD HEADER --- */}
            <header className="relative z-20 px-6 py-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center gap-4">
                    {/* Energy Bar */}
                    <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 shadow-lg">
                        <div className="p-1.5 bg-yellow-500/20 rounded-lg"><Zap size={16} className="text-yellow-400 fill-yellow-400"/></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Energy</span>
                            <span className="text-sm font-black leading-none">{progress.energy} <span className="text-slate-500 text-[10px]">/ 10</span></span>
                        </div>
                    </div>
                    
                    {/* Key Status */}
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
                
                {/* Navigation Buttons (Floating) */}
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

                {/* Track Container */}
                <div className="w-full h-96 relative overflow-hidden">
                    {/* The Sliding Track */}
                    <div 
                        className="absolute top-0 h-full flex items-center transition-transform duration-500 ease-out will-change-transform"
                        style={{ 
                            width: `${trackWidthPercent}%`,
                            transform: `translateX(${translatePercent}%)` 
                        }}
                    >
                        {/* Connecting Line Layer */}
                        <div 
                            className="absolute top-1/2 -translate-y-1/2 h-1"
                            style={{ 
                                left: `${halfNodePercent}%`,
                                right: `${halfNodePercent}%`
                            }}
                        > 
                            <div className="w-full h-full bg-slate-800 rounded-full relative">
                                {/* Progress Fill */}
                                <div 
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all duration-1000"
                                    style={{ width: `${(progress.currentNodeIndex / (TOTAL_NODES - 1)) * 100}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Nodes Layer */}
                        {map.map((node, index) => {
                            // Logic specifically requested: Show real content only for passed nodes + next 5 nodes.
                            // Beyond that, show "Black Holes"
                            const isFarFuture = index > progress.currentNodeIndex + VISIBLE_FUTURE_RANGE;

                            if (isFarFuture) {
                                return (
                                    <div 
                                        key={node.id}
                                        className="h-full flex items-center justify-center relative"
                                        style={{ width: `${100 / TOTAL_NODES}%` }}
                                    >
                                        <div className="relative group flex items-center justify-center">
                                            {/* Black Hole Visual */}
                                            <div className="w-10 h-10 rounded-full bg-black shadow-[0_0_25px_rgba(0,0,0,1)] border border-slate-800 opacity-60 flex items-center justify-center">
                                                <div className="w-full h-full rounded-full bg-slate-900 animate-pulse opacity-50"></div>
                                            </div>
                                            {/* Optional: Small debris particles */}
                                            <div className="absolute w-14 h-14 border border-slate-800/30 rounded-full animate-spin-slow pointer-events-none"></div>
                                        </div>
                                    </div>
                                );
                            }

                            // Standard Node Rendering for Passed, Current, and Near Future
                            const isCurrent = index === progress.currentNodeIndex;
                            const isPassed = index < progress.currentNodeIndex;
                            const isBoss = node.type === 'boss';
                            const isDefeated = node.isDefeated;
                            
                            let nodeSize = 'w-16 h-16';
                            let nodeBase = 'bg-slate-800 border-slate-600 text-slate-500 cursor-default';
                            let shadow = '';
                            let transform = 'scale(1)';

                            if (isCurrent) {
                                // If current, we highlight the node base slightly, but the Avatar is floating above
                                nodeBase = 'bg-slate-700 border-slate-500 text-slate-300';
                                shadow = 'shadow-[0_0_30px_rgba(99,102,241,0.2)]';
                            } else if (isPassed) {
                                nodeBase = 'bg-emerald-900/80 border-emerald-500 text-emerald-400';
                                shadow = 'shadow-[0_0_15px_rgba(16,185,129,0.3)]';
                            } 
                            
                            if (isBoss) {
                                nodeSize = 'w-24 h-24';
                                if (isDefeated) {
                                    nodeBase = 'bg-slate-800 border-slate-600 text-slate-500'; // Defeated look
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
                                    style={{ width: `${100 / TOTAL_NODES}%` }} // Equal width for every node slot in the track
                                >
                                    <div className="relative group flex flex-col items-center">
                                        
                                        {/* SPACESHIP AVATAR (Floats above current node) */}
                                        {isCurrent && <SpaceshipAvatar user={user} />}

                                        {/* Tooltip for Current Node */}
                                        {isCurrent && (
                                            <div className="absolute -top-32 bg-amber-500 text-black text-[10px] font-black py-1 px-3 rounded-full shadow-lg animate-bounce whitespace-nowrap z-40 mb-2">
                                                HERE
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-500"></div>
                                            </div>
                                        )}

                                        {/* The Node Visual */}
                                        <div
                                            onClick={() => onNodeClick(node)}
                                            className={`rounded-full border-[3px] flex items-center justify-center transition-all duration-300 z-10 relative ${nodeSize} ${nodeBase} ${shadow}`}
                                            style={{ transform }}
                                        >
                                            <span className="text-3xl font-black">{getNodeIcon(node)}</span>
                                            
                                            {/* Battle Hover Effect: Only show if boss is active and NOT defeated */}
                                            {isBoss && isCurrent && !isDefeated && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-red-900/90 rounded-full opacity-0 hover:opacity-100 transition-opacity z-20 backdrop-blur-sm cursor-pointer">
                                                    <div className="flex flex-col items-center animate-pulse">
                                                        <Swords size={32} className="text-white"/>
                                                        <span className="text-[8px] font-black uppercase text-red-200 tracking-widest mt-1">Fight!</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Node Number */}
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
                <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-yellow-500/30 shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-2 text-yellow-500 border-r border-white/10 pr-3">
                        <Terminal size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Admin</span>
                    </div>
                    <div className="flex items-center gap-1 bg-yellow-500/10 p-1 rounded-lg">
                        <button onClick={() => onAdminAction('add_energy')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold flex items-center gap-1" title="Add 10 Energy"><Zap size={12}/> +10</button>
                        <button onClick={() => onAdminAction('remove_energy')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold" title="Remove 1 Energy">-1</button>
                    </div>
                    <div className="flex items-center gap-1 bg-yellow-500/10 p-1 rounded-lg">
                        <button onClick={() => onAdminAction('add_key')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold flex items-center gap-1" title="Add 1 Key"><Key size={12}/> +1</button>
                        <button onClick={() => onAdminAction('remove_key')} className="px-2 py-1 hover:bg-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-bold" title="Remove 1 Key">-1</button>
                    </div>
                    <button onClick={() => onAdminAction('pass_boss')} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold uppercase transition-colors">
                        <ShieldCheck size={12}/> Pass Boss
                    </button>
                </div>
            )}

            {/* --- FOOTER ACTION --- */}
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
        </div>
    );
};