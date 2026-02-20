import React, { useState } from 'react';
import { X, Star } from 'lucide-react';

interface Props {
    onComplete: () => void;
    badge: { name: string; icon: string } | null;
}

const PARTICLE_COUNT = 30;

const Fireworks: React.FC<Props> = ({ onComplete, badge }) => {
    // Generate particles only once on mount
    const [particles] = useState(() => Array.from({ length: PARTICLE_COUNT }).map(() => ({
        angle: Math.random() * 360,
        distance: Math.random() * 200 + 100, // Distance from center
        size: Math.random() * 6 + 2,
        color: ['#FFD700', '#FFA500', '#FF4500', '#00FFFF', '#FF00FF'][Math.floor(Math.random() * 5)],
        delay: Math.random() * 0.5,
        duration: Math.random() * 1 + 0.5
    })));

    if (!badge) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 animate-in fade-in duration-500 backdrop-blur-sm">
            {/* --- BACKGROUND RAYS (Sunburst Effect) --- */}
            <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none">
                <div className="w-[200vw] h-[200vw] opacity-20 animate-spin-slow" style={{ 
                    background: 'conic-gradient(from 0deg, transparent 0deg, #FCD34D 20deg, transparent 40deg, #FCD34D 60deg, transparent 80deg, #FCD34D 100deg, transparent 120deg, #FCD34D 140deg, transparent 160deg, #FCD34D 180deg, transparent 200deg, #FCD34D 220deg, transparent 240deg, #FCD34D 260deg, transparent 280deg, #FCD34D 300deg, transparent 320deg, #FCD34D 340deg, transparent 360deg)',
                    animationDuration: '20s'
                }}></div>
                <div className="absolute w-[150vw] h-[150vw] opacity-10 animate-spin-slow" style={{ 
                    background: 'conic-gradient(from 15deg, transparent 0deg, #FFFFFF 20deg, transparent 40deg, #FFFFFF 60deg, transparent 80deg, #FFFFFF 100deg, transparent 120deg, #FFFFFF 140deg, transparent 160deg, #FFFFFF 180deg, transparent 200deg, #FFFFFF 220deg, transparent 240deg, #FFFFFF 260deg, transparent 280deg, #FFFFFF 300deg, transparent 320deg, #FFFFFF 340deg, transparent 360deg)',
                    animationDuration: '15s',
                    animationDirection: 'reverse'
                }}></div>
            </div>

            {/* --- EXPLODING PARTICLES --- */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    {particles.map((p, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full"
                            style={{
                                width: `${p.size}px`,
                                height: `${p.size}px`,
                                backgroundColor: p.color,
                                transform: `rotate(${p.angle}deg) translate(${p.distance}px)`,
                                opacity: 0,
                                animation: `explode ${p.duration}s ease-out ${p.delay}s forwards`
                            }}
                        />
                    ))}
                </div>
            </div>
            
            <style>{`
                @keyframes explode {
                    0% { transform: rotate(var(--tw-rotate)) translate(0px); opacity: 1; }
                    100% { transform: rotate(var(--tw-rotate)) translate(var(--tw-translate-x)); opacity: 0; }
                }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* --- MAIN REWARD CONTENT --- */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center p-8 animate-in zoom-in-50 duration-700">
                <div className="relative mb-8">
                    {/* Glow behind badge */}
                    <div className="absolute inset-0 bg-yellow-400 blur-3xl opacity-40 rounded-full animate-pulse"></div>
                    
                    {/* The Badge Icon - Bouncing */}
                    <div className="relative text-9xl animate-bounce" style={{ animationDuration: '2s' }}>
                        {badge.icon}
                    </div>
                    
                    {/* Stars decoration */}
                    <Star className="absolute -top-4 -right-8 text-yellow-300 w-12 h-12 animate-ping" style={{ animationDuration: '3s' }} fill="currentColor" />
                    <Star className="absolute top-1/2 -left-12 text-white w-8 h-8 animate-pulse" fill="currentColor" />
                </div>

                <div className="space-y-2 mb-10">
                    <h2 className="text-sm font-black text-yellow-400 uppercase tracking-[0.3em] animate-in slide-in-from-bottom-4 duration-1000 delay-200">
                        Unlocked Reward
                    </h2>
                    <h1 className="text-4xl md:text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-in slide-in-from-bottom-8 duration-1000 delay-300">
                        {badge.name}
                    </h1>
                </div>

                <button 
                    onClick={onComplete}
                    className="group relative px-10 py-4 bg-white hover:bg-yellow-50 text-neutral-900 rounded-full font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.4)] animate-in fade-in duration-1000 delay-700"
                >
                    <span className="flex items-center gap-2">
                        Collect Reward <X size={16} />
                    </span>
                </button>
            </div>
        </div>
    );
};

export default Fireworks;