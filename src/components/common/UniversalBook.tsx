
import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

export const BOOK_COLORS = [
    '#5d4037', '#3e2723', '#1a237e', '#1b5e20', '#b71c1c', 
    '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#0f172a', '#171717', '#334155', '#450a0a', '#1e1b4b',
    '#bae6fd', '#bbf7d0', '#fef08a', '#fecaca', '#ddd6fe'
];

export const stringToBookColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return BOOK_COLORS[Math.abs(hash) % BOOK_COLORS.length];
};

interface UniversalBookProps {
    id: string;
    title: string;
    subTitle?: string;
    icon?: React.ReactNode;
    color?: string; // Optional override, otherwise generated from ID
    onClick: () => void;
    actions?: React.ReactNode; // Edit, Delete, etc.
    status?: 'completed' | 'active' | 'new';
    footer?: React.ReactNode;
    
    // Advanced Styling
    titleColor?: string;
    titleSize?: number;
    titleTop?: number;
    titleLeft?: number;
    iconTop?: number;
    iconLeft?: number;
}

export const UniversalBook: React.FC<UniversalBookProps> = ({ 
    id, title, subTitle, icon, color, onClick, actions, status, footer,
    titleColor, titleSize, titleTop, titleLeft, iconTop, iconLeft
}) => {
    const bgColor = color || stringToBookColor(id);
    const isImage = !!(bgColor.startsWith('http') || bgColor.startsWith('data:image'));
    const isCompleted = status === 'completed';
    
    // Determine if we are using custom positioning
    const isCustomLayout = titleTop !== undefined || titleLeft !== undefined || iconTop !== undefined || iconLeft !== undefined;

    return (
        <div className="group [perspective:1000px] translate-y-0 cursor-pointer" onClick={onClick}>
            <div 
                className={`relative w-full aspect-[5/7] rounded-lg shadow-lg transition-all duration-300 transform group-hover:shadow-2xl group-hover:shadow-black/40 group-hover:[transform:rotateY(-15deg)_scale(1.05)] overflow-hidden ${isCompleted ? 'ring-2 ring-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : ''}`} 
                style={{ 
                    backgroundColor: isImage ? '#262626' : bgColor, 
                    transformStyle: 'preserve-3d', 
                    transform: 'rotateY(-5deg) rotateX(2deg)' 
                }}
            >
                {isImage && <img src={bgColor} className="absolute inset-0 w-full h-full object-cover" alt="" />}
                <div className="absolute top-0 left-0 bottom-0 w-6 bg-gradient-to-r from-black/40 to-transparent rounded-l-lg z-10"></div>
                
                {/* Book Spine Detail */}
                <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-white/10 z-10 border-r border-white/5"></div>

                <div className={`absolute inset-2 border-2 border-black/10 rounded-sm z-10 ${isImage ? '' : 'bg-black/5'} ${isCustomLayout ? '' : 'flex flex-col items-center justify-center p-3 text-center'}`}>
                    
                    {/* Top Status Icon */}
                    {status === 'completed' && (
                        <div className="absolute top-2 right-2 text-emerald-500 bg-white rounded-full p-1 shadow-md z-20" title="Completed">
                            <CheckCircle2 size={16} fill="currentColor" className="text-white" />
                        </div>
                    )}
                    {status === 'active' && (
                        <div className="absolute top-2 right-2 text-blue-300" title="Active">
                            <Circle size={10} fill="currentColor" />
                        </div>
                    )}

                    {/* Icon */}
                    {icon && (
                        <div 
                            className={`text-white drop-shadow-md transform group-hover:scale-110 transition-transform ${isCustomLayout ? 'absolute' : 'mb-4'}`}
                            style={isCustomLayout ? {
                                top: `${iconTop ?? 40}%`,
                                left: `${iconLeft ?? 50}%`,
                                transform: 'translate(-50%, -50%)'
                            } : undefined}
                        >
                            {icon}
                        </div>
                    )}

                    {/* Title */}
                    <h3 
                        className={`font-serif font-bold leading-tight drop-shadow-md line-clamp-3 ${isCustomLayout ? 'absolute w-full text-center px-2' : 'mb-1'}`}
                        style={{ 
                            fontSize: titleSize ? `${Math.min(titleSize, 24)}px` : '16px',
                            color: titleColor || '#ffffff',
                            top: isCustomLayout ? `${titleTop ?? 55}%` : undefined,
                            left: isCustomLayout ? `${titleLeft ?? 50}%` : undefined,
                            transform: isCustomLayout ? 'translate(-50%, -50%)' : undefined
                        }}
                    >
                        {title}
                    </h3>

                    {/* Subtitle (Only show in default layout or if positioned manually - currently only default) */}
                    {subTitle && !isCustomLayout && (
                        <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{subTitle}</p>
                    )}

                    {/* Footer */}
                    {footer && !isCustomLayout && (
                        <div className="mt-auto pt-2 text-white/80 text-[10px]">
                            {footer}
                        </div>
                    )}
                </div>
                
                {!isImage && (
                    <>
                        <div className="absolute top-4 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent z-10 opacity-50"></div>
                        <div className="absolute bottom-4 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent z-10 opacity-50"></div>
                    </>
                )}
                
                {/* Actions Overlay */}
                {actions && (
                    <div className="absolute top-2 left-2 z-20 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};
