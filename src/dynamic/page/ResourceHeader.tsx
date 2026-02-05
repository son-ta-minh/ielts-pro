import React, { ReactNode } from 'react';

interface ResourceHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  minorSkills?: ReactNode;
  centerContent?: ReactNode;
  actions?: ReactNode;
}

export const ResourceHeader: React.FC<ResourceHeaderProps> = ({ 
  title, 
  subtitle, 
  icon, 
  minorSkills, 
  centerContent,
  actions 
}) => {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="shrink-0">
        <div className="flex items-center gap-3">
          {icon && <div className="text-indigo-600">{icon}</div>}
          <h2 className="text-3xl font-black text-neutral-900 tracking-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-neutral-500 mt-1 font-medium">{subtitle}</p>}
      </div>

      {centerContent}

      <div className="flex items-center gap-3 flex-wrap justify-end">
        {/* Minor Skills Slot (e.g. Paraphrase, Mimic buttons) */}
        {minorSkills && (
          <div className="flex items-center gap-2 pr-3 border-r border-neutral-200">
            {minorSkills}
          </div>
        )}

        {/* Primary Actions Slot (e.g. Add New, Randomize) */}
        {actions}
      </div>
    </header>
  );
};