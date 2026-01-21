import React from 'react';
import { X, ShoppingBag, Send } from 'lucide-react';
import { BADGE_DEFINITIONS } from '../../../../data/adventure_map';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    badges: string[];
    onUseBadge: (badgeId: string) => void;
}

export const InventoryModal: React.FC<Props> = ({ isOpen, onClose, badges, onUseBadge }) => {
    if (!isOpen) return null;

    const uniqueBadgeCount = new Set(badges.filter(b => b !== 'locked_chest')).size;
    const totalBadges = Object.keys(BADGE_DEFINITIONS).filter(k => k !== 'locked_chest').length;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-neutral-200 flex flex-col max-h-[90vh]">
                <header className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2"><ShoppingBag size={20}/> Huy hiệu</h3>
                            <span className="text-xs font-bold bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full border border-neutral-200">{uniqueBadgeCount}/{totalBadges}</span>
                        </div>
                        <p className="text-sm text-neutral-500 mt-1">Vật phẩm thu thập được từ hành trình.</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:bg-neutral-100 rounded-full"><X size={20}/></button>
                </header>
                <main className="p-8 overflow-y-auto">
                    {badges.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-2xl text-neutral-400">
                            <p className="font-bold mb-2">Túi đồ trống.</p>
                            <p>Mở Rương Báu trên bản đồ để nhận huy hiệu.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                            {badges.map((badgeId, index) => {
                                const badgeInfo = BADGE_DEFINITIONS[badgeId];
                                if (!badgeInfo) return null;
                                return (
                                    <div key={`${badgeId}-${index}`} className="group relative flex flex-col items-center text-center gap-2">
                                        <div className="aspect-square w-full bg-neutral-100 rounded-2xl flex items-center justify-center p-4 border border-neutral-200">
                                            <span className="text-4xl">{badgeInfo.icon}</span>
                                        </div>
                                        <p className="text-xs font-bold text-neutral-700">{badgeInfo.name}</p>
                                        <button 
                                            onClick={() => onUseBadge(badgeId)}
                                            className="absolute inset-0 bg-black/70 rounded-2xl flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Send size={24}/>
                                            <span className="text-xs font-bold mt-1">Use</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};