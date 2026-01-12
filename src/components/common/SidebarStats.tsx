import React from 'react';
import { Library, RotateCw, BrainCircuit } from 'lucide-react';

interface Props {
  activeWords: number;
  dueReview: number;
  apiRequestCount: number;
  showApiStats?: boolean;
}

const SidebarStats: React.FC<Props> = ({ activeWords, dueReview, apiRequestCount, showApiStats = true }) => {
  const stats = [
    { label: 'Active', value: activeWords, icon: Library, color: 'text-blue-500' },
    { label: 'Action', value: dueReview, icon: RotateCw, color: 'text-orange-500' },
  ];

  if (showApiStats) {
      stats.push({ label: 'API', value: apiRequestCount, icon: BrainCircuit, color: 'text-purple-500' });
  }

  const gridCols = showApiStats ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="mt-6 pt-4 border-t border-neutral-100">
        <h3 className="px-4 text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-2">Quick Stats</h3>
        <div className={`grid ${gridCols} gap-1 px-2`}>
            {stats.map(stat => (
                <div key={stat.label} className="flex flex-col items-center text-center p-2 rounded-lg hover:bg-neutral-50 transition-colors">
                    <stat.icon size={16} className={`shrink-0 ${stat.color}`} />
                    <span className="text-lg font-black text-neutral-900 mt-1">{stat.value}</span>
                    <span className="text-[9px] font-bold text-neutral-400 leading-tight">{stat.label}</span>
                </div>
            ))}
        </div>
    </div>
  );
};

export default SidebarStats;