
import React from 'react';
import { Tag, X, Target } from 'lucide-react';
import { FocusColor } from '../../app/types';

export interface CardBadge {
  label: string;
  colorClass: string; // e.g., 'bg-blue-50 text-blue-700 border-blue-100'
  icon?: React.ElementType;
}

interface UniversalCardProps {
  /** Main title of the card */
  title: React.ReactNode;
  /** Primary identifier or visual grouping (e.g., "Part 1", "Essay", "Casual") */
  badge?: CardBadge;
  /** Additional badges/info to display in the header */
  badges?: CardBadge[];
  /** A single string for the hierarchical path */
  path?: string;
  /** Array of single keyword tags to display in the footer */
  tags?: string[];
  /** Secondary actions (Edit, Delete) appearing on hover in the top right */
  actions?: React.ReactNode;
  /** Footer metadata (e.g. "5 words", "Last reviewed...") */
  footer?: React.ReactNode;
  /** Main card click handler */
  onClick?: () => void;
  /** Compact mode reduces padding */
  compact?: boolean;
  /** Custom content for the body (Description, Tap to Reveal, etc.) */
  children?: React.ReactNode;
  
  /** Focus Color State (Visual Indicator) */
  focusColor?: FocusColor | null;
  /** Callback when focus color is changed via the mini menu */
  onFocusChange?: (color: FocusColor | null) => void;

  /** Focus Toggle State */
  isFocused?: boolean;
  /** Callback to toggle focus state */
  onToggleFocus?: () => void;

  className?: string;
}

const getTagColor = (tag: string): string => {
    const lower = tag.toLowerCase();
    
    if (lower.includes('speaking')) return 'bg-teal-50 text-teal-700 border-teal-200';
    if (lower.includes('writing')) return 'bg-pink-50 text-pink-700 border-pink-200';
    if (lower.includes('reading')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (lower.includes('listening')) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (lower.includes('grammar')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (lower.includes('pattern')) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    if (lower.includes('comparison')) return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
    
    // Default neutral style for non-system tags
    return 'bg-neutral-100 text-neutral-600 border-neutral-200';
};

const focusColorClasses = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-400',
    red: 'bg-rose-500'
};

export const UniversalCard: React.FC<UniversalCardProps> = ({
  title,
  badge,
  badges = [],
  path,
  tags = [],
  actions,
  footer,
  onClick,
  compact = false,
  children,
  focusColor,
  onFocusChange,
  isFocused,
  onToggleFocus,
  className = ''
}) => {
  const displayBadges = [...(badge ? [badge] : []), ...badges];

  return (
    <div 
      onClick={onClick} 
      className={`
        group relative flex flex-col bg-white rounded-3xl border border-neutral-200 shadow-sm 
        hover:shadow-md hover:border-neutral-300 transition-all h-full overflow-hidden 
        ${onClick ? 'cursor-pointer' : ''} ${className}
      `}
    >
      {/* Focus Color Triangle Indicator (Visual Only) */}
      {focusColor && (
          <div 
            className={`absolute top-0 left-0 w-9 h-9 ${focusColorClasses[focusColor]} z-0 pointer-events-none transition-all duration-300`} 
            style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
          />
      )}

      {/* Red Dot if Focused */}
      {isFocused && (
          <div className="absolute top-1.5 left-1.5 w-2 h-2 bg-red-600 rounded-full z-10 shadow-sm pointer-events-none animate-in zoom-in" />
      )}

      {/* Actions & Focus - Positioned Absolute Top-Right */}
      {(actions || onFocusChange || onToggleFocus) && (
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-sm rounded-xl p-1 border border-neutral-200 shadow-sm z-30">
            {/* Focus Toggle */}
            {onToggleFocus && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onToggleFocus(); }} 
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all mr-1 ${isFocused ? 'bg-red-50 text-red-600' : 'text-neutral-300 hover:text-neutral-600 hover:bg-neutral-50'}`}
                    title="Toggle Focus"
                 >
                    <Target size={14} />
                 </button>
            )}

            {/* Focus Color Menu */}
            {onFocusChange && (
                <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-neutral-200" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onFocusChange('green')} className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${focusColor === 'green' ? 'bg-emerald-500 border-emerald-600 scale-110 shadow-sm' : 'bg-emerald-100 border-emerald-200 hover:bg-emerald-200 hover:border-emerald-300'}`} title="Mark Green">
                        {focusColor === 'green' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                    </button>
                    <button onClick={() => onFocusChange('yellow')} className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${focusColor === 'yellow' ? 'bg-amber-400 border-amber-500 scale-110 shadow-sm' : 'bg-amber-100 border-amber-200 hover:bg-amber-200 hover:border-amber-300'}`} title="Mark Yellow">
                        {focusColor === 'yellow' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                    </button>
                    <button onClick={() => onFocusChange('red')} className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${focusColor === 'red' ? 'bg-rose-500 border-rose-600 scale-110 shadow-sm' : 'bg-rose-100 border-rose-200 hover:bg-rose-200 hover:border-rose-300'}`} title="Mark Red">
                        {focusColor === 'red' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                    </button>
                    {focusColor && (
                        <button onClick={() => onFocusChange(null)} className="ml-0.5 p-1 text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors" title="Clear Color">
                            <X size={12} />
                        </button>
                    )}
                </div>
            )}
            
            {/* Action Slot */}
            {actions}
        </div>
      )}

      <div className={`flex-grow flex flex-col ${compact ? 'p-4' : 'p-6'}`}>
        
        {/* ZONE A: Header (Badges & Tags) */}
        {(displayBadges.length > 0 || tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 mb-3 relative z-10">
                {displayBadges.map((b, i) => (
                <span key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${b.colorClass}`}>
                    {b.icon && <b.icon size={10} />}
                    {b.label}
                </span>
                ))}
                
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                      {tags.map(tag => (
                          <span key={tag} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getTagColor(tag)}`}>
                              {tag}
                          </span>
                      ))}
                  </div>
                )}
            </div>
        )}

        {/* ZONE B: Title */}
        <div className="mb-2">
            {typeof title === 'string' ? (
                 <h3 className="font-black text-lg text-neutral-900 tracking-tight leading-tight line-clamp-2">
                    {title}
                 </h3>
            ) : (
                title
            )}
        </div>

        {/* ZONE C: Body Content (Description or Interactive) */}
        <div className="flex-1 text-sm text-neutral-500 font-medium leading-relaxed">
           {children}
        </div>
      </div>
    </div>
  );
};
