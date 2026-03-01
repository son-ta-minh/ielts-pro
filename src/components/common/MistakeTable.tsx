import React from 'react';
import { MistakeRow } from '../../app/types';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Props {
    rows: MistakeRow[];
}

export const MistakeTable: React.FC<Props> = ({ rows }) => {
    if (!rows || rows.length === 0) return null;

    return (
        <div className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-rose-600 tracking-[0.2em] w-[30%]">Mistake</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] w-[35%]">Explanation</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-emerald-600 tracking-[0.2em] w-[35%]">Correction</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                    {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 align-top">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-neutral-900 text-sm">{row.mistake || '-'}</span>
                                    {row.lastResult === 'correct' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                                    {row.lastResult === 'incorrect' && <XCircle size={14} className="text-rose-500 shrink-0" />}
                                </div>
                            </td>
                            <td className="px-6 py-4 align-top">
                                <p className="text-xs text-neutral-600 font-medium leading-relaxed">{row.explanation || '-'}</p>
                            </td>
                            <td className="px-6 py-4 align-top bg-neutral-50/20">
                                <p className="text-xs text-emerald-800 leading-relaxed font-bold">{row.correction || '-'}</p>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
