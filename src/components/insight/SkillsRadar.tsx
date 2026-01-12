
import React, { useState, useEffect } from 'react';
import * as dataStore from '../../app/dataStore';
import { SkillsRadarUI } from './SkillsRadar_UI';

interface Props { 
  userId: string;
}

const SkillsRadar: React.FC<Props> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [skillsData, setSkillsData] = useState<any[]>([]);

  useEffect(() => {
    const analyzeSkills = () => {
      setLoading(true);
      const masteryInterval = 21 * 24 * 60 * 60 * 1000;
      
      // Get all words from dataStore and filter them by type.
      const allWords = dataStore.getAllWords().filter(w => w.userId === userId);
      const vocab = allWords.filter(w => !w.isIdiom && !w.isPhrasalVerb && !w.isCollocation && !w.isStandardPhrase);
      const idioms = allWords.filter(w => w.isIdiom);
      const phrasal = allWords.filter(w => w.isPhrasalVerb);
      const colloc = allWords.filter(w => w.isCollocation);
      const prepos = allWords.filter(w => w.prepositions && w.prepositions.length > 0 && !w.isPhrasalVerb);

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
      setLoading(false);
    };
    if (userId) {
      analyzeSkills();
    }
  }, [userId]);
  
  return <SkillsRadarUI loading={loading} skillsData={skillsData} />;
};

export default SkillsRadar;
