import { useState, useCallback, useEffect } from 'react';
import { User, VocabularyItem, AppView } from '../types';
import * as db from '../db';
import * as dataStore from '../dataStore';
import { getStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';
import * as adventureService from '../../services/adventureService';

interface UseDataFetchingProps {
    currentUser: User | null;
    view: AppView;
    onUpdateUser: (user: User) => void;
}

export const useDataFetching = ({ currentUser, view, onUpdateUser }: UseDataFetchingProps) => {
    const [stats, setStats] = useState({ total: 0, due: 0, new: 0, learned: 0 });
    const [wotd, setWotd] = useState<VocabularyItem | null>(null);
    const [apiUsage, setApiUsage] = useState({ count: 0, date: '' });
    const { showToast } = useToast();

    const refreshGlobalStats = useCallback(async () => {
        if (!currentUser) return;

        // Initialize store if not already
        await dataStore.init(currentUser.id);
    
        const cachedStats = dataStore.getStats();
        setStats(cachedStats.reviewCounts);

        // Word of the day still needs a custom calculation, but on in-memory data
        const allUserWords = dataStore.getAllWords().filter(w => w.userId === currentUser.id);
        const activeWords = allUserWords.filter(w => !w.isPassive);
        if (activeWords.length > 0) {
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const userSeed = currentUser.id.length > 4 ? parseInt(currentUser.id.substring(currentUser.id.length - 4), 16) || 1234 : 1234;
            const seed = parseInt(todayStr) + userSeed;
            const index = seed % activeWords.length;
            setWotd(activeWords[index]);
        } else {
            setWotd(null);
        }
        
        const chapters = adventureService.getChapters();
    
        const progress = currentUser.adventure;
        if (progress) {
            const wordsById = new Map(allUserWords.map(w => [w.id, w]));
            let updatedProgress = { ...progress };
            let masteryUnlocked = false;
            let dailyStarAwarded = false;
            const todayStr = new Date().toISOString().split('T')[0];
    
            for (const chapter of chapters) {
                for (const segment of chapter.segments) {
                    if (!updatedProgress.completedSegmentIds.includes(segment.id)) continue; 
                    
                    let currentStars = updatedProgress.segmentStars[segment.id] || 0;
    
                    const awardStar = (newStarLevel: number, message: string) => {
                        updatedProgress.segmentStars[segment.id] = newStarLevel;
                        updatedProgress.keyFragments = (updatedProgress.keyFragments || 0) + 1;
                        masteryUnlocked = true;
                        showToast(message, 'success', 5000);
    
                        if (!dailyStarAwarded && currentUser.adventureLastDailyStar !== todayStr) {
                            updatedProgress.keyFragments++;
                            dailyStarAwarded = true;
                            showToast("Bonus: First star of the day! (+1 Key Fragment)", 'success', 6000);
                        }
                    };
    
                    if (currentStars < 3) {
                        if (currentStars < 1 && segment.basicWords.length > 0 && segment.basicWords.every(w => wordsById.get(w.toLowerCase())?.consecutiveCorrect ?? 0 > 0)) {
                            awardStar(1, `🌟 1-Star Mastery for "${segment.title}"! (+1 Key Fragment)`);
                            currentStars = 1; 
                        }
    
                        if (currentStars === 1 && segment.intermediateWords.length > 0 && segment.intermediateWords.every(w => wordsById.get(w.toLowerCase())?.consecutiveCorrect ?? 0 > 0)) {
                            awardStar(2, `🌟🌟 2-Star Mastery for "${segment.title}"! (+1 Key Fragment)`);
                            currentStars = 2;
                        }
    
                        if (currentStars === 2 && segment.advancedWords.length > 0 && segment.advancedWords.every(w => wordsById.get(w.toLowerCase())?.consecutiveCorrect ?? 0 > 0)) {
                            awardStar(3, `🌟🌟🌟 Boss unlocked for "${segment.title}"! (+1 Key Fragment)`);
                        }
                    }
                }
            }
            
            if (masteryUnlocked) {
                while (updatedProgress.keyFragments >= 3) {
                    updatedProgress.keyFragments -= 3;
                    updatedProgress.keys = (updatedProgress.keys || 0) + 1;
                    showToast("✨ Key Fragments assembled into a Magic Key!", "success", 4000);
                }
                const updatedUser = { ...currentUser, adventure: updatedProgress, adventureLastDailyStar: dailyStarAwarded ? todayStr : currentUser.adventureLastDailyStar };
                onUpdateUser(updatedUser);
            }
        }
    }, [currentUser, showToast, onUpdateUser]);

    useEffect(() => {
        if (currentUser) {
          refreshGlobalStats();
        }
        
        const handleCooldown = () => {
            showToast('Saving too quickly. Please wait.', 'info', 1500);
        };

        // Listen for data changes from the store
        window.addEventListener('datastore-updated', refreshGlobalStats);
        window.addEventListener('datastore-cooldown', handleCooldown);
        return () => {
            window.removeEventListener('datastore-updated', refreshGlobalStats);
            window.removeEventListener('datastore-cooldown', handleCooldown);
        };
    }, [currentUser, refreshGlobalStats, showToast]);

    const loadApiUsage = useCallback(() => {
        const today = new Date().toISOString().split('T')[0];
        let usage = getStoredJSON('vocab_pro_api_usage', { count: 0, date: '1970-01-01' });
        if (usage.date !== today) {
            usage = { count: 0, date: today };
        }
        setApiUsage(usage);
    }, []);
      
    useEffect(() => {
        loadApiUsage();
        window.addEventListener('apiUsageUpdated', loadApiUsage);
        return () => {
            window.removeEventListener('apiUsageUpdated', loadApiUsage);
        };
    }, [loadApiUsage]);

    return { stats, wotd, setWotd, apiUsage, refreshGlobalStats };
};