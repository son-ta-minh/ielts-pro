import React from 'react';
import { ComparisonRow } from '../../app/types';

interface Props {
    rows: ComparisonRow[];
}

export const ComparisonTable: React.FC<Props> = ({ rows }) => {
    if (!rows || rows.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map((row, idx) => (
                <div key={idx} className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm flex flex-col gap-3 group hover:border-indigo-200 transition-all">
                    <div className="flex items-center justify-between border-b border-neutral-50 pb-2">
                        <h4 className="text-lg font-black text-indigo-900 tracking-tight">{row.word}</h4>
                    </div>
                    <div className="space-y-2">
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Usage & Nuance</span>
                            <p className="text-sm font-medium text-neutral-700 leading-relaxed italic">
                                {row.nuance || 'No nuance specified.'}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">Example</span>
                            <p className="text-xs font-bold text-neutral-800 leading-relaxed bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                                "{row.example || '...'}"
                            </p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};