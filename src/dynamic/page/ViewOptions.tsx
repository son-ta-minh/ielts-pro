import React, { useState, useRef, useEffect } from 'react';
import { Eye, CheckCircle2, ChevronDown } from 'lucide-react';
import { ViewOption } from '../types';

interface ViewOptionsProps {
  schema: ViewOption[];
  currentSettings: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

export const ViewOptions: React.FC<ViewOptionsProps> = ({ schema, currentSettings, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (schema.length === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`px-4 py-3 rounded-xl transition-all shadow-sm border flex items-center gap-2 font-bold text-xs ${
          isOpen 
          ? 'bg-neutral-900 text-white border-neutral-900' 
          : 'bg-white text-neutral-600 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300'
        }`}
        title="View Options"
      >
        <Eye size={16} /> 
        <span className="hidden sm:inline">View</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
          <div className="px-3 py-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-50 mb-1">
            Display Settings
          </div>
          {schema.map(opt => {
            const isToggle = !opt.type || opt.type === 'toggle';
            
            if (isToggle) {
               return (
                <button 
                  key={opt.key}
                  onClick={() => onChange(opt.key, !currentSettings[opt.key])}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-50 text-xs font-bold text-neutral-700 transition-colors"
                >
                  <span>{opt.label}</span>
                  {currentSettings[opt.key] ? (
                    <CheckCircle2 size={16} className="text-green-500" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-neutral-200"></div>
                  )}
                </button>
              );
            }

            if (opt.type === 'select' && opt.choices) {
              return (
                <div key={opt.key} className="px-3 py-2 flex flex-col gap-1">
                   <span className="text-[10px] font-bold text-neutral-500">{opt.label}</span>
                   <div className="relative">
                      <select 
                        value={currentSettings[opt.key]}
                        onChange={(e) => onChange(opt.key, e.target.value)}
                        className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-lg py-1.5 pl-3 pr-8 text-xs font-bold text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      >
                         {opt.choices.map(c => (
                           <option key={String(c.value)} value={c.value}>{c.label}</option>
                         ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                   </div>
                </div>
              )
            }
            
            return null;
          })}
        </div>
      )}
    </div>
  );
};