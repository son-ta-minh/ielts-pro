
import React from 'react';
import { WordBook } from '../../app/types';
import { Move, X } from 'lucide-react';

export const COLORS = [
    '#5d4037', '#3e2723', '#1a237e', '#1b5e20', '#b71c1c', 
    '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#0f172a', '#171717', '#334155', '#450a0a', '#1e1b4b',
    '#bae6fd', '#bbf7d0', '#fef08a', '#fecaca', '#ddd6fe'
];

export const TITLE_COLORS = [
    '#ffffff', '#000000', '#fef08a', '#bae6fd', '#fecaca', '#ddd6fe',
    '#f59e0b', '#0ea5e9', '#10b981', '#ef4444', '#8b5cf6', '#ec4899',
    '#3e2723', '#1e1b4b', '#1b5e20', '#450a0a', '#171717', '#334155',
    '#94a3b8', '#475569'
];

export const BookIcon: React.FC<{ icon: string; className?: string }> = ({ icon, className }) => {
    if (!icon) return null;
    const isUrl = icon?.startsWith('http') || icon?.startsWith('data:image');
    if (isUrl) {
        return <img src={icon} className={`object-contain ${className}`} alt="Book icon" />;
    }
    return <span className={className}>{icon}</span>;
};

const stringToHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
};

interface WordBookCardProps {
    book: WordBook;
    onClick: () => void;
    onMove: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
}

export const WordBookCard: React.FC<WordBookCardProps> = ({ book, onClick, onMove, onDelete }) => {
    const color = book.color || COLORS[Math.abs(stringToHash(book.id)) % COLORS.length];
    const bookParts = book.topic.split(':').map(p => p.trim());
    const bookDisplayTitle = bookParts.length > 1 ? bookParts.slice(1).join(':').trim() : book.topic;
    const isImage = !!(color.startsWith('http') || color.startsWith('data:image'));

    return (
        <div className="group [perspective:1000px] translate-y-0 cursor-pointer" onClick={onClick}>
            <div 
                className="relative w-full aspect-[5/7] rounded-lg shadow-lg transition-all duration-300 transform group-hover:shadow-2xl group-hover:shadow-black/40 group-hover:[transform:rotateY(-15deg)_scale(1.05)] overflow-hidden" 
                style={{ 
                    backgroundColor: isImage ? '#262626' : color, 
                    transformStyle: 'preserve-3d', 
                    transform: 'rotateY(-5deg) rotateX(2deg)' 
                }}
            >
                {isImage && <img src={color} className="absolute inset-0 w-full h-full object-cover" alt="" />}
                <div className="absolute top-0 left-0 bottom-0 w-6 bg-gradient-to-r from-black/40 to-transparent rounded-l-lg z-10"></div>
                
                <div className={`absolute inset-2 border-2 border-black/10 rounded-sm z-10 ${isImage ? '' : 'bg-black/5'}`}>
                    {book.icon && (
                        <div 
                            className="absolute flex items-center justify-center w-12 h-12"
                            style={{ top: `${book.iconTop ?? 40}%`, left: `${book.iconLeft ?? 50}%`, transform: 'translate(-50%, -50%)' }}
                        >
                            <BookIcon icon={book.icon} className="text-4xl w-full h-full object-contain drop-shadow-lg" />
                        </div>
                    )}
                    <h3 
                        className="absolute w-full text-center font-serif font-bold leading-tight drop-shadow-md px-2 line-clamp-3" 
                        style={{ 
                            color: book.titleColor || '#ffffff', 
                            fontSize: book.titleSize ? `${Math.min(book.titleSize, 18)}px` : '18px',
                            top: `${book.titleTop ?? 55}%`,
                            left: `${book.titleLeft ?? 50}%`,
                            transform: 'translate(-50%, -50%)'
                        }}
                    >
                        {bookDisplayTitle}
                    </h3>
                </div>
                
                {!isImage && (
                    <>
                        <div className="absolute top-4 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent z-10"></div>
                        <div className="absolute bottom-4 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent z-10"></div>
                    </>
                )}
                
                <div className="absolute top-2 right-2 z-20 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={onMove} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-neutral-700 hover:text-white transition-all shadow-sm"><Move size={16} /></button>
                    <button onClick={onDelete} className="p-1.5 bg-black/30 text-white/60 rounded-full hover:bg-red-600 hover:text-white transition-all shadow-sm"><X size={16} /></button>
                </div>
            </div>
        </div>
    );
};
