import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { Plus, ChevronDown, FolderTree, Tag } from 'lucide-react';

export interface AddAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
}

interface ResourceActionsProps {
  viewMenu?: ReactNode;
  browseGroups?: {
    isOpen: boolean;
    onToggle: () => void;
  };
  browseTags?: {
    isOpen: boolean;
    onToggle: () => void;
  };
  addActions: AddAction[];
  extraActions?: ReactNode;
}

export const ResourceActions: React.FC<ResourceActionsProps> = ({
  viewMenu,
  browseGroups,
  browseTags,
  addActions,
  extraActions,
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setIsAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasMultipleAddActions = addActions.length > 1;

  const renderAddButton = () => {
    if (addActions.length === 0) return null;

    if (!hasMultipleAddActions) {
      const action = addActions[0];
      const Icon = action.icon;
      return (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm disabled:opacity-50"
        >
          <Icon size={16} />
          <span>{action.label}</span>
        </button>
      );
    }

    return (
      <div className="relative" ref={addMenuRef}>
        <button
          onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
          className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-black text-xs flex items-center space-x-2 transition-all hover:bg-neutral-800 active:scale-95 uppercase tracking-widest shadow-sm"
        >
          <Plus size={16} />
          <span>Add</span>
          <ChevronDown size={14} className={`transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {isAddMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-neutral-100 z-50 p-2 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col gap-1">
            {addActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => {
                    action.onClick();
                    setIsAddMenuOpen(false);
                  }}
                  disabled={action.disabled}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors disabled:opacity-50"
                >
                  <Icon size={16} className="text-neutral-500" />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {viewMenu}
      
      {browseGroups && (
        <button onClick={browseGroups.onToggle} className={`p-3 border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm ${browseGroups.isOpen ? 'bg-neutral-100' : 'bg-white'}`}>
            <FolderTree size={16} />
        </button>
      )}

      {browseTags && (
        <button onClick={browseTags.onToggle} className={`p-3 border border-neutral-200 text-neutral-600 rounded-xl hover:bg-neutral-50 active:scale-95 transition-all shadow-sm ${browseTags.isOpen ? 'bg-neutral-100' : 'bg-white'}`}>
            <Tag size={16} />
        </button>
      )}

      {extraActions}

      {renderAddButton()}
    </>
  );
};