
import React from 'react';
import { ComparisonGroup, VocabularyItem } from '../../app/types';
import { Puzzle, Edit3, ArrowLeft, Loader2, CheckCircle2, Eye, Info } from 'lucide-react';

interface Props {
    group: ComparisonGroup;
    libraryWords: Set<string>;
    noteSavingStatus: Record<number, 'saving' | 'saved' | null>;
    onBack: () => void;
    onEdit: () => void;
    onNoteChange: (index: number, newNote: string) => void;
}

const BoldableText: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-bold text-neutral-900">{part.slice(2, -2)}</strong>;
                }
                return part;
            })}
        </>
    );
};

export const ComparisonReadViewUI: React.FC<Props> = ({ group, libraryWords, noteSavingStatus, onBack, onEdit, onNoteChange }) => {
    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
             <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                    <button onClick={onBack} className="flex items-center space-x-2 text-xs font-bold text-neutral-400 hover:text-neutral-900 transition-colors uppercase tracking-wider">
                        <ArrowLeft size={14} /><span>Back to Library</span>
                    </button>
                    <div className="flex items-center gap-3">
                         <Puzzle size={28} className="text-purple-500" />
                         <h2 className="text-3xl font-black text-neutral-900 tracking-tight">{group.name}</h2>
                    </div>
                </div>
                <button onClick={onEdit} className="px-5 py-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl font-black text-[10px] flex items-center space-x-2 active:scale-95 uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm">
                    <Edit3 size={14}/><span>Edit Group</span>
                </button>
            </header>

            <div className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-sm overflow-hidden min-h-[400px]">
                {group.comparisonData.length === 0 ? (
                    <div className="text-center p-20 text-neutral-400">
                        <Info size={32} className="mx-auto mb-2 opacity-50"/>
                        <p className="font-bold">No analysis data available.</p>
                        <p className="text-sm">Use "Refine with AI" in Edit mode to generate comparisons.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="bg-neutral-50/50">
                                <tr>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-neutral-400 w-1/6">Word</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-neutral-400 w-1/3">Nuance & Usage</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-neutral-400 w-1/3">Example</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-neutral-400 w-1/6">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {group.comparisonData.map((row, index) => (
                                    <tr key={index} className="group hover:bg-neutral-50/30 transition-colors">
                                        <td className="p-6 align-top">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-lg text-neutral-900">{row.word}</span>
                                                {libraryWords.has(row.word.toLowerCase()) && (
                                                    <span title="In Library">
                                                        <Eye size={14} className="text-neutral-300" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-6 align-top">
                                            <div className="text-sm text-neutral-600 leading-relaxed font-medium">
                                                <BoldableText text={row.explanation} />
                                            </div>
                                        </td>
                                        <td className="p-6 align-top">
                                            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-sm italic text-neutral-600">
                                                "{row.example}"
                                            </div>
                                        </td>
                                        <td className="p-6 align-top">
                                            <div className="relative">
                                                <textarea
                                                    value={row.userNote || ''}
                                                    onChange={(e) => onNoteChange(index, e.target.value)}
                                                    placeholder="Add note..."
                                                    rows={3}
                                                    className="w-full bg-transparent border-b border-transparent focus:border-neutral-300 focus:bg-white p-2 rounded-lg text-xs font-medium text-neutral-600 resize-none outline-none transition-all"
                                                />
                                                <div className="absolute top-2 right-2 pointer-events-none">
                                                    {noteSavingStatus[index] === 'saving' && <Loader2 size={12} className="animate-spin text-neutral-400"/>}
                                                    {noteSavingStatus[index] === 'saved' && <CheckCircle2 size={12} className="text-green-500"/>}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
