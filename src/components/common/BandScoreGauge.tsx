import React from 'react';

interface Props {
  score: number;
  size?: 'large' | 'inline';
}

const getScoreColor = (s: number) => {
    if (s >= 8.0) return 'text-green-500';
    if (s >= 7.0) return 'text-emerald-500';
    if (s >= 6.0) return 'text-amber-500';
    return 'text-rose-500';
};

export const BandScoreGauge: React.FC<Props> = ({ score, size = 'large' }) => {
    if (size === 'inline') {
        return (
            <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-neutral-400">Band:</span>
                <span className={`font-black ${getScoreColor(score)}`}>{score.toFixed(1)}</span>
            </div>
        );
    }

    // large size
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Est. Band</span>
        <div className={`text-5xl font-black ${getScoreColor(score)}`}>{score.toFixed(1)}</div>
      </div>
    );
};