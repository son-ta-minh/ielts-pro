
import React from 'react';
import { ChevronLeft, ChevronRight, Folder } from 'lucide-react';
import { BookIcon } from '../wordbook/WordBookCard';

interface UniversalShelfProps {
    label: string;
    onNext?: () => void;
    onPrev?: () => void;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    isEmpty?: boolean;
    emptyAction?: React.ReactNode;
    
    // Style props
    coverColor?: string;
    coverIcon?: string;
    titleColor?: string;
}

export const UniversalShelf: React.FC<UniversalShelfProps> = ({ 
    label, onNext, onPrev, actions, children, className, isEmpty, emptyAction,
    coverColor, coverIcon, titleColor
}) => {
    const bgColor = coverColor || '#4e342e';
    const isImageBg = bgColor.startsWith('http') || bgColor.startsWith('data:image');
    
    return (
        <div className={`px-4 md:px-12 pt-10 pb-4 rounded-3xl transition-all duration-500 relative overflow-hidden ${className}`} 
             style={{ 
                 backgroundColor: isImageBg ? '#262626' : bgColor,
                 boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5)' 
             }}>
            
            {/* Background Texture/Image */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                 style={{
                     backgroundImage: isImageBg ? `url(${bgColor})` : `repeating-linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 1px, transparent 1px, transparent 30px)`,
                     backgroundSize: isImageBg ? 'cover' : 'auto',
                     backgroundPosition: 'center'
                 }}
            />

            {/* Shelf Header */}
            <div className="flex items-center justify-between group mb-12 relative -top-3.5 z-10" style={{ borderBottom: '3px solid rgba(0,0,0,0.4)', paddingBottom: '0.1rem', boxShadow: '0 5px 5px -3px rgba(0,0,0,0.5)' }}>
                
                <div className="flex items-center gap-2">
                    {onPrev && (
                        <button onClick={onPrev} className="p-2 md:p-3 bg-black/20 text-white/50 rounded-full hover:bg-black/40 hover:text-white transition-all">
                            <ChevronLeft size={24}/>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-4 relative">
                    <div className="bg-gradient-to-b from-slate-200 to-slate-400 px-6 py-2 rounded-lg shadow-inner border-t border-slate-400/50 w-fit flex items-center gap-3 min-h-[50px]">
                         {coverIcon ? (
                             <BookIcon icon={coverIcon} className="text-2xl drop-shadow-md w-8 h-8 object-contain" />
                         ) : (
                             <Folder size={20} className="text-slate-600 opacity-50" />
                         )}
                        <h3 className="text-xl md:text-2xl font-black text-neutral-900 tracking-tight truncate max-w-[200px] md:max-w-md text-center select-none drop-shadow-sm" style={{ color: titleColor }}>
                            {label}
                        </h3>
                    </div>
                    {actions && (
                         <div className="absolute left-full ml-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                            {actions}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {onNext && (
                        <button onClick={onNext} className="p-2 md:p-3 bg-black/20 text-white/50 rounded-full hover:bg-black/40 hover:text-white transition-all">
                            <ChevronRight size={24}/>
                        </button>
                    )}
                </div>
            </div>

            {/* Books Grid */}
            <div 
                className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,10rem)] gap-x-6 md:gap-x-8 gap-y-10 min-h-[50vh] -mt-12 pb-8 relative z-10" 
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 14rem, rgba(0,0,0,0.4) 14rem, rgba(0,0,0,0.4) 14.25rem, transparent 14.25rem, transparent 16.5rem)` }}
            >
                {children}
                
                {isEmpty && (
                    <div className="col-span-full flex flex-col items-center justify-center text-white/30 h-64 border-2 border-dashed border-white/10 rounded-3xl">
                        <p className="font-black uppercase tracking-widest text-xs mb-4">This collection is empty</p>
                        {emptyAction}
                    </div>
                )}
            </div>
        </div>
    );
};
