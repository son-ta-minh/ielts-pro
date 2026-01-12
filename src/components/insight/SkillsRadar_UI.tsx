import React from 'react';
import { Loader2, BrainCircuit } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface SkillsRadarUIProps {
    loading: boolean;
    skillsData: any[];
}

export const SkillsRadarUI: React.FC<SkillsRadarUIProps> = ({ loading, skillsData }) => {
    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-white rounded-[2rem] border border-neutral-200">
                <Loader2 className="animate-spin text-neutral-300" />
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-[2rem] border border-neutral-200 shadow-sm flex flex-col h-full min-h-[320px]">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-neutral-900 flex items-center"><BrainCircuit size={18} className="mr-2" /> Skills Radar</h3>
            </div>
            <div className="flex-1 w-full h-full min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={skillsData}>
                        <PolarGrid stroke="#e5e5e5" />
                        <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fontWeight: 700, fill: '#737373' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Strength" dataKey="score" stroke="#171717" fill="#171717" fillOpacity={0.1} strokeWidth={3} />
                        <Tooltip contentStyle={{ borderRadius: '1rem', border: '1px solid #eee', fontSize: '12px', fontWeight: 'bold', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};