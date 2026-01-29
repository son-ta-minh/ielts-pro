import React, { ReactNode } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';

interface ResourceGridProps {
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const ResourceGrid: React.FC<ResourceGridProps> = ({
  isLoading,
  isEmpty,
  emptyMessage = "No items found.",
  emptyAction,
  children,
  className = ""
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 animate-in fade-in">
        <Loader2 className="animate-spin text-neutral-300 mb-4" size={32} />
        <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Loading Content...</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-neutral-200 rounded-[2rem] text-center animate-in zoom-in-95">
        <div className="p-4 bg-neutral-50 rounded-full mb-4">
          <PackageOpen size={32} className="text-neutral-300" />
        </div>
        <p className="text-sm font-bold text-neutral-500 mb-4">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 ${className}`}>
      {children}
    </div>
  );
};