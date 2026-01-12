import React from 'react';
import { RefreshCw, Lightbulb } from 'lucide-react';
import { CartesianGrid, XAxis, YAxis, LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface ParaphraseInsightsUIProps {
    chartData: any[];
    advice: string;
}

export const ParaphraseInsightsUI: React.FC<ParaphraseInsightsUIProps> = ({ chartData, advice }) => {
    return (
        <section className="space-y-6 animate-in slide-in-from-bottom-4">
            <h3 className="font-black text-lg text-neutral-900 flex items-center"><RefreshCw size={16} className="mr-2" /> Paraphrase Analytics</h3>
            
            <div className="bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col gap-6">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                    <div>
                        <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Performance Trend</h4>
                        <p className="text-xs font-bold text-neutral-500">{chartData.length > 0 ? `Tracking Overall vs. Criteria (Last ${chartData.length} Tasks)` : 'No data yet.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-neutral-900"></div><span className="text-[10px] font-bold text-neutral-600">Overall</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-[10px] font-bold text-neutral-600">Meaning</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500"></div><span className="text-[10px] font-bold text-neutral-600">Lexical</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-pink-500"></div><span className="text-[10px] font-bold text-neutral-600">Grammar</span></div>
                    </div>
                </div>

                {chartData.length > 0 && (
                    <div className="h-[300px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fontWeight: 700, fill: '#a3a3a3'}} 
                                    dy={10}
                                />
                                <YAxis 
                                    domain={[0, 100]} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fontWeight: 700, fill: '#a3a3a3'}}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold', padding: '12px' }}
                                    itemStyle={{ padding: 0 }}
                                    labelStyle={{ color: '#a3a3a3', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}
                                />
                                <Line type="monotone" dataKey="meaning" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeOpacity={0.6} />
                                <Line type="monotone" dataKey="lexical" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeOpacity={0.6} />
                                <Line type="monotone" dataKey="grammar" stroke="#ec4899" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeOpacity={0.6} />
                                <Line type="monotone" dataKey="overall" stroke="#171717" strokeWidth={4} dot={{ r: 4, fill: '#171717', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-start gap-3">
                    <div className="p-2 bg-yellow-100 text-yellow-600 rounded-full shrink-0 mt-0.5">
                        <Lightbulb size={14} className="fill-yellow-600" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">AI Strategic Advice</span>
                        <p className="text-xs font-medium text-neutral-700 leading-relaxed">{advice}</p>
                    </div>
                </div>
            </div>
        </section>
    );
};