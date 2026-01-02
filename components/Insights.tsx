
import React, { useState, useEffect } from 'react';
import { Brain, Loader2, TrendingUp, Calendar, Award, BookCheck, Library } from 'lucide-react';
import { getWordCount, getDueWords, getAllWordsForExport } from '../services/db';
import { VocabularyItem } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface Props {
  userId: string;
}

const Insights: React.FC<Props> = ({ userId }) => {
  const [total, setTotal] = useState(0);
  const [learnedCount, setLearnedCount] = useState(0);
  const [due, setDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const allWords = await getAllWordsForExport(userId);
      const dueWords = await getDueWords(userId);
      
      const learned = allWords.filter(w => w.consecutiveCorrect > 0);
      
      setTotal(allWords.length);
      setLearnedCount(learned.length);
      setDue(dueWords.length);

      // Generate growth data based on when the word was FIRST learned (lastReview)
      // or created if we want to see library growth vs learning growth
      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(23, 59, 59, 999);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        // Only count as "learned" if they were reviewed before or on this day
        const learnedAtDate = learned.filter(w => (w.lastReview || 0) <= d.getTime()).length;
        return { name: dateStr, learned: learnedAtDate };
      });
      
      setChartData(last7Days);
      setLoading(false);
    };
    
    loadData();
  }, [userId]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <Loader2 className="animate-spin text-neutral-300" size={32} />
      <p className="text-neutral-400 text-sm font-medium">Analyzing your learning data...</p>
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <header>
        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Learning Insights</h2>
        <p className="text-neutral-500 mt-2">Tracking your actual memory progress, not just your collection.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl w-fit mb-4">
            <Library size={18} />
          </div>
          <div className="text-2xl font-black text-neutral-900">{total}</div>
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">Words in Library</div>
        </div>

        <div className="bg-neutral-900 p-6 rounded-3xl text-white shadow-xl">
          <div className="p-2 bg-white/10 text-green-400 rounded-xl w-fit mb-4">
            <BookCheck size={18} />
          </div>
          <div className="text-2xl font-black">{learnedCount}</div>
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">Successfully Learned</div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl w-fit mb-4">
            <Calendar size={18} />
          </div>
          <div className="text-2xl font-black text-neutral-900">{due}</div>
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">Due for Review</div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-xl w-fit mb-4">
            <Award size={18} />
          </div>
          <div className="text-2xl font-black text-neutral-900">Band {(learnedCount / 400 + 4.5).toFixed(1)}</div>
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">Estimated Band</div>
        </div>
      </div>

      <section className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-bold flex items-center space-x-2 text-neutral-900">
              <TrendingUp size={18} />
              <span>Learning Velocity</span>
            </h3>
            <p className="text-xs text-neutral-400">Showing cumulative "Hard/Easy" interactions over the last 7 days.</p>
          </div>
        </div>
        
        <div className="h-[300px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorLearned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#171717" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#171717" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fontSize: 10, fontWeight: 700, fill: '#737373'}} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fontSize: 10, fontWeight: 700, fill: '#737373'}}
              />
              <Tooltip 
                cursor={{stroke: '#171717', strokeWidth: 1}}
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold', padding: '12px 16px' }}
                itemStyle={{ color: '#171717' }}
              />
              <Area 
                type="monotone" 
                dataKey="learned" 
                name="Words Learned"
                stroke="#171717" 
                strokeWidth={4}
                fillOpacity={1} 
                fill="url(#colorLearned)" 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="bg-neutral-50 p-8 rounded-[2.5rem] border border-neutral-200 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-neutral-200 shadow-sm text-neutral-900">
            <Brain size={24} />
          </div>
          <div>
            <h4 className="font-bold text-neutral-900">Memory Efficiency</h4>
            <p className="text-xs text-neutral-400">Only {((learnedCount / (total || 1)) * 100).toFixed(0)}% of your library has been reviewed.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="h-2 w-48 bg-neutral-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-neutral-900 transition-all duration-1000" 
              style={{ width: `${(learnedCount / (total || 1)) * 100}%` }} 
            />
          </div>
          <span className="text-xs font-black text-neutral-900">{learnedCount}/{total}</span>
        </div>
      </div>
    </div>
  );
};

export default Insights;
