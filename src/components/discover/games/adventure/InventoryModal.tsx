
import React from 'react';
import { X, ShoppingBag, Send, Swords, Zap } from 'lucide-react';
import { BADGE_DEFINITIONS } from '../../../../data/adventure_map';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    badges: string[];
    hpPotions: number;
    wisdomFruits: number;
    energy: number;
    onUseBadge: (badgeId: string) => void;
    onExchangeEnergyForDice: () => void;
}

export const InventoryModal: React.FC<Props> = ({
    isOpen,
    onClose,
    badges,
    hpPotions,
    wisdomFruits,
    energy,
    onUseBadge,
    onExchangeEnergyForDice
}) => {
    if (!isOpen) return null;

    const uniqueBadgeCount = new Set(badges.filter(b => b !== 'locked_chest')).size;
    const totalBadges = Object.keys(BADGE_DEFINITIONS).filter(k => k !== 'locked_chest').length;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><ShoppingBag size={20}/> Túi đồ</h3>
                        </div>
                        <p className="text-sm text-neutral-500 mt-1">Vật phẩm & Huy hiệu thu thập được.</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 overflow-y-auto space-y-8">
                    
                    {/* Battle Supplies Section */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Swords size={12} /> Battle Supplies
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100">
                                <div className="text-3xl bg-white p-2 rounded-xl shadow-sm">🧪</div>
                                <div>
                                    <div className="text-sm font-black text-indigo-900">HP Potion</div>
                                    <div className="text-xs font-medium text-indigo-600">Quantity: {hpPotions}</div>
                                    <div className="text-[9px] text-indigo-400 mt-0.5 font-bold uppercase tracking-wider">Restores 1 HP</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-100">
                                <div className="text-3xl bg-white p-2 rounded-xl shadow-sm">🍎</div>
                                <div>
                                    <div className="text-sm font-black text-amber-900">Wisdom Fruit</div>
                                    <div className="text-xs font-medium text-amber-600">Quantity: {wisdomFruits}</div>
                                    <div className="text-[9px] text-amber-400 mt-0.5 font-bold uppercase tracking-wider">Reveals Hint</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Energy Exchange Section */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Zap size={12} /> Exchange
                        </h4>
                        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-black text-cyan-900">Energy: {energy}</div>
                                <div className="text-xs text-cyan-700">Exchange 3 Energies for 1 Lucky Dice 🎲</div>
                            </div>
                            <button
                                type="button"
                                onClick={onExchangeEnergyForDice}
                                disabled={energy < 3}
                                className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-cyan-600 text-white hover:bg-cyan-500 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors"
                            >
                                Exchange
                            </button>
                        </div>
                    </div>

                    {/* Badges Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                             <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                <Zap size={12} /> Badges & Loot
                            </h4>
                            <span className="text-[10px] font-bold bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">{uniqueBadgeCount}/{totalBadges}</span>
                        </div>
                       
                        {badges.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">
                                <p className="font-bold mb-2 text-xs">Chưa có huy hiệu.</p>
                                <p className="text-xs">Mở Rương hoặc đánh Boss để nhận.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                {badges.map((badgeId, index) => {
                                    const badgeInfo = BADGE_DEFINITIONS[badgeId];
                                    if (!badgeInfo) return null;
                                    const isUsable = badgeId === 'locked_chest' || badgeId === 'lucky_dice';
                                    
                                    return (
                                        <div key={`${badgeId}-${index}`} className="group relative flex flex-col items-center text-center gap-2">
                                            <div className="aspect-square w-full bg-neutral-100 rounded-2xl flex items-center justify-center p-4 border border-neutral-200 relative overflow-hidden">
                                                <span className="text-4xl relative z-10">{badgeInfo.icon}</span>
                                                {isUsable && <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>}
                                            </div>
                                            <p className="text-[10px] font-bold text-neutral-700 leading-tight">{badgeInfo.name}</p>
                                            
                                            {isUsable && (
                                                <button 
                                                    onClick={() => onUseBadge(badgeId)}
                                                    className="absolute inset-0 bg-black/80 rounded-2xl flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-[1px]"
                                                >
                                                    <Send size={20}/>
                                                    <span className="text-[10px] font-bold mt-1 uppercase tracking-widest">Use</span>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};
