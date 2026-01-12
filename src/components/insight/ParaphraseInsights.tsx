import React, { useState, useEffect } from 'react';
import { getParaphraseLogs } from '../../app/db';
import { ParaphraseInsightsUI } from './ParaphraseInsights_UI';

interface Props {
  userId: string;
}

const ParaphraseInsights: React.FC<Props> = ({ userId }) => {
    const [loading, setLoading] = useState(true);
    const [chartData, setChartData] = useState<any[]>([]);
    const [advice, setAdvice] = useState('');

    useEffect(() => {
        const loadLogs = async () => {
            setLoading(true);
            const logs = await getParaphraseLogs(userId);
            
            if (logs.length === 0) {
                setLoading(false);
                setAdvice("Complete your first paraphrase task to unlock detailed analytics.");
                return;
            }
            
            const recentLogs = logs.slice(0, 15).reverse(); 
            
            const data = recentLogs.map((log, index) => ({
                name: `Task ${index + 1}`,
                date: new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                overall: log.overallScore,
                meaning: log.meaningScore || log.overallScore,
                lexical: log.lexicalScore || log.overallScore,
                grammar: log.grammarScore || log.overallScore,
            }));
            
            setChartData(data);

            const sum = logs.reduce((acc, log) => ({
                meaning: acc.meaning + (log.meaningScore || log.overallScore),
                lexical: acc.lexical + (log.lexicalScore || log.overallScore),
                grammar: acc.grammar + (log.grammarScore || log.overallScore)
            }), { meaning: 0, lexical: 0, grammar: 0 });
            
            const count = logs.length;
            const avgs = {
                meaning: sum.meaning / count,
                lexical: sum.lexical / count,
                grammar: sum.grammar / count
            };

            const lowest = Math.min(avgs.meaning, avgs.lexical, avgs.grammar);
            if (lowest === avgs.meaning) setAdvice("Your Meaning score is lagging. Focus on preserving the core message without altering the nuances when using synonyms.");
            else if (lowest === avgs.lexical) setAdvice("Your Lexical Resource is the weakest area. Try incorporating more C1/C2 synonyms and idiomatic collocations instead of basic words.");
            else setAdvice("Grammar accuracy needs attention. Practice varying sentence structures (compound/complex) and ensuring tense consistency.");

            setLoading(false);
        };
        if (userId) {
            loadLogs();
        }
    }, [userId]);

    if (loading) return null;

    return <ParaphraseInsightsUI chartData={chartData} advice={advice} />;
};

export default ParaphraseInsights;