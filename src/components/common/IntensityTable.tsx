import React from 'react';
import { IntensityRow, IntensityItem } from '../../app/types';

interface Props {
    rows: IntensityRow[];
    compact?: boolean;
}

const RegisterBadge: React.FC<{ register?: 'academic' | 'casual' }> = ({ register }) => {
    if (!register) return null;
    const isAcademic = register === 'academic';
    return (
        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ml-1 ${
            isAcademic 
            ? 'bg-purple-50 text-purple-700 border-purple-100' 
            : 'bg-sky-50 text-sky-700 border-sky-100'
        }`}>
            {register}
        </span>
    );
};

const WordItem: React.FC<{ item: IntensityItem }> = ({ item }) => (
    <div className="flex items-center gap-1">
        <span className="font-bold text-neutral-800">
            {item.word}
        </span>
        <RegisterBadge register={item.register} />
    </div>
);

export const IntensityTable: React.FC<Props> = ({ rows, compact = false }) => {
    if (!rows || rows.length === 0) return null;

    return (
        <div className={`bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-sm ${compact ? 'scale-95 origin-top' : ''}`}>
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-blue-500 tracking-[0.2em] w-1/3">Softened</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] w-1/3">Neutral</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-orange-500 tracking-[0.2em] w-1/3">Intensified</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                    {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-6 py-4 align-top bg-blue-50/10">
                                <div className="flex flex-col gap-2">
                                    {row.softened.map((item, i) => <WordItem key={i} item={item} />)}
                                    {row.softened.length === 0 && <span className="text-[10px] text-neutral-300 italic">...</span>}
                                </div>
                            </td>
                            <td className="px-6 py-4 align-top">
                                <div className="flex flex-col gap-2">
                                    {row.neutral.map((item, i) => <WordItem key={i} item={item} />)}
                                    {row.neutral.length === 0 && <span className="text-[10px] text-neutral-300 italic">...</span>}
                                </div>
                            </td>
                            <td className="px-6 py-4 align-top bg-orange-50/10">
                                <div className="flex flex-col gap-2">
                                    {row.intensified.map((item, i) => <WordItem key={i} item={item} />)}
                                    {row.intensified.length === 0 && <span className="text-[10px] text-neutral-300 italic">...</span>}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};