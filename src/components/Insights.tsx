import React, { useState, useEffect } from 'react';
import { Brain, Loader2, TrendingUp, Calendar, Award, BookCheck, Library, BrainCircuit, Target } from 'lucide-react';
import { getDueWords, getAllWordsForExport, getRegularVocabulary, getIdioms, getPhrasalVerbs, getCollocations, getPrepositionWords } from '../app/db';
import { VocabularyItem } from '../app/types';
// FIX: Import CartesianGrid, XAxis, and YAxis from recharts.
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis } from 'recharts';

interface Props {
  userId: string;
  onStartSession: (words: VocabularyItem[]) => void;
}

const SkillsRadar: React.FC<{ userId: string; onStartSession: (words: VocabularyItem[]) => void; }> = ({ userId, onStartSession }) => {
  const [loading, setLoading] = useState(true);
  const [skillsData, setSkillsData] = useState<any[]>([]);
  const [weakestSkill, setWeakestSkill] = useState<{ name: string; words: VocabularyItem[] } | null>(null);

  useEffect(() => {
    const analyzeSkills = async () => {
      setLoading(true);
      const masteryInterval = 21 * 24 * 60 * 60 * 1000;
      
      const [vocab, idioms, phrasal, colloc, prepos] = await Promise.all([
        getRegularVocabulary(userId),
        getIdioms(userId),
        getPhrasalVerbs(userId),
        getCollocations(userId),
        getPrepositionWords(userId)
      ]);

      const categories = [
        { name: 'Vocabulary', words: vocab },
        { name: 'Idioms', words: idioms },
        { name: 'Phrasal V.', words: phrasal },
        { name: 'Colloc.', words: colloc },
        { name: 'Prepos.', words: prepos }
      ];

      const data = categories.map(cat => {
        const total = cat.words.length;
        if (total === 0) return { skill: cat.name, score: 0, fullMark: 100 };
        const mastered = cat.words.filter(w => w.interval * 24 * 60 * 60 * 1000 > masteryInterval).length;
        return { skill: cat.name, score: Math.round((mastered / total) * 100), fullMark: 100 };
      });

      setSkillsData(data);
      
      let minScore = 101;
      let weakest: { name: string; words: VocabularyItem[] } | null = null;
      categories.forEach((cat, index) => {
        if (data[index].score < minScore) {
          minScore = data[index].score;
          weakest = cat;
        }
      });
      setWeakestSkill(weakest);

      setLoading(false);
    };
    analyzeSkills();
  }, [userId]);
  
  const handleWeakestSkillSession = () => {
    if (!weakestSkill || weakestSkill.words.length === 0) return;
    const due = weakestSkill.words.filter(w => w.nextReview <= Date.now());
    const fresh = weakestSkill.words.filter(w => !w.lastReview);
    const sessionItems = [...due, ...fresh].slice(0, 15);
    onStartSession(sessionItems.length > 0 ? sessionItems : weakestSkill.words.slice(0,10));
  };

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center space-y-3 bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
        <Loader2 className="animate-spin text-neutral-300" size={32} />
        <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Analyzing Skills...</p>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white p-6 rounded-[2.5rem] border border-neutral-200 shadow-sm">
        <h3 className="font-black text-lg text-neutral-900 mb-2 flex items-center"><BrainCircuit size={16} className="mr-2" /> Skills Radar</h3>
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skillsData}>
            <PolarGrid stroke="#e5e5e5" />
            <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fontWeight: 700, fill: '#737373' }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Strength" dataKey="score" stroke="#171717" fill="#171717" fillOpacity={0.1} strokeWidth={3} />
            <Tooltip contentStyle={{ borderRadius: '1rem', border: '1px solid #eee', fontSize: '12px', fontWeight: 'bold' }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white p-8 rounded-[2.5rem] border border-neutral-200 shadow-sm flex flex-col items-center justify-center text-center">
        <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Smart Suggestion</h3>
        {weakestSkill && weakestSkill.words.length > 0 ? (
          <>
            <p className="mt-2 text-lg font-bold text-neutral-900">Focus on improving your</p>
            <p className="text-3xl font-black text-orange-600 tracking-tight my-2">{weakestSkill.name}</p>
            <button onClick={handleWeakestSkillSession} className="mt-4 px-6 py-3 bg-neutral-900 text-white rounded-2xl font-black text-xs flex items-center space-x-2 shadow-xl hover:scale-105 transition-transform">
              <Target size={14} />
              <span>START FOCUSED SESSION</span>
            </button>
          </>
        ) : (
          <p className="mt-4 text-neutral-500 font-medium">Add more words to get a skill analysis!</p>
        )}
      </div>
    </div>
  );
};


const Insights: React.FC<Props> = ({ userId, onStartSession }) => {
  const [total, setTotal] = useState(0);
  const [learnedCount, setLearnedCount] = useState(0);
  const [due, setDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const allWordsRaw = await getAllWordsForExport(userId);
      // Ensure archived words are excluded from all statistics
      const allWords = allWordsRaw.filter(w => !w.isPassive);
      
      const dueWords = await getDueWords(userId);
      
      // A word is "learned" if it has been reviewed at least once.
      const learned = allWords.filter(w => !!w.lastReview);
      
      setTotal(allWords.length);
      setLearnedCount(learned.length);
      setDue(dueWords.length);

      const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(23, 59, 59, 999);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
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
    <div className="space-y-10">
      <header>
        <h2 className="text-3xl font-black text-neutral-900 tracking-tight">Learning Insights</h2>
        <p className="text-neutral-500 mt-2">Tracking your actual memory progress, not just your collection.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl w-fit mb-4">
            <Library size={18} />
          </div>
          <div className="text-2xl font-black text-neutral-900">{total}</div>
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">Active Words</div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
          <div className="p-2 bg-green-50 text-green-600 rounded-xl w-fit mb-4">
            <BookCheck size={18} />
          </div>
          <div className="text-2xl font-black text-neutral-900">{learnedCount}</div>
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

      <SkillsRadar userId={userId} onStartSession={onStartSession} />

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