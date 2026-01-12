
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import * as dataStore from '../../app/dataStore';
import { VocabularyItem } from '../../app/types';
import { InsightsUI } from './Insights_UI';

interface Props {
  userId: string;
  onStartSession: (words: VocabularyItem[]) => void;
}

const Insights: React.FC<Props> = ({ userId }) => {
  const [total, setTotal] = useState(0);
  const [learnedCount, setLearnedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    const counts = dataStore.getStats().reviewCounts;
    if (counts) {
      setTotal(counts.total);
      setLearnedCount(counts.learned);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('datastore-updated', loadData);
    return () => {
        window.removeEventListener('datastore-updated', loadData);
    };
  }, [loadData]);

  // Make estimatedScore proportional to learned words in the current library, not a fixed 400.
  // This provides a more realistic and dynamic score relative to user's actual progress.
  const estimatedScore = total > 0 ? (learnedCount / total * 100) : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Loader2 className="animate-spin text-neutral-300" size={32} />
        <p className="text-neutral-400 text-sm font-medium">Analyzing your learning data...</p>
      </div>
    );
  }

  return (
    <InsightsUI
      loading={loading}
      userId={userId}
      total={total}
      learnedCount={learnedCount}
      estimatedScore={estimatedScore}
    />
  );
};

export default Insights;
