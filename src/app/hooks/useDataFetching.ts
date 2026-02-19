
import { useState, useCallback, useEffect } from 'react';
import { User, VocabularyItem, AppView, WordQuality } from '../types';
import * as dataStore from '../dataStore';
import { getStoredJSON } from '../../utils/storage';
import { useToast } from '../../contexts/ToastContext';
import * as adventureService from '../../services/adventureService';

interface UseDataFetchingProps {
    currentUser: User | null;
    view: AppView;
    onUpdateUser: (user: User) => void;
}

export const useDataFetching = ({ currentUser, onUpdateUser }: UseDataFetchingProps) => {
    const [stats, setStats] = useState({ total: 0, due: 0, new: 0, learned: 0 });
    const [wotd, setWotd] = useState<VocabularyItem | null>(null);
    const [randomWotd, setRandomWotd] = useState<VocabularyItem | null>(null);
    const [isWotdComposed, setIsWotdComposed] = useState(false);
    
    const [apiUsage, setApiUsage] = useState({ count: 0, date: '' });
    const { showToast } = useToast();

    const refreshGlobalStats = useCallback(async () => {
        if (!currentUser) return;

        // Initialize store if not already
        await dataStore.init(currentUser.id);
    
        const cachedStats = dataStore.getStats();
        setStats(cachedStats.reviewCounts);

        const allUserWords = dataStore.getAllWords().filter(w => w.userId === currentUser.id);
        const activeWords = allUserWords.filter(w => !w.isPassive);
        
        // Create a specific pool for Word of the Day from verified words
        const wotdPool = activeWords.filter(w => w.quality === WordQuality.VERIFIED);
        
        let selectedWotd: VocabularyItem | null = null;

        if (randomWotd) {
            // If user manually shuffled, use that
            selectedWotd = randomWotd;
        } else if (wotdPool.length > 0) {
            // Default deterministic calculation using only verified words
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const userSeed = currentUser.id.length > 4 ? parseInt(currentUser.id.substring(currentUser.id.length - 4), 16) || 1234 : 1234;
            const seed = parseInt(todayStr) + userSeed;
            const index = seed % wotdPool.length;
            selectedWotd = wotdPool[index];
        }

        setWotd(selectedWotd);
        if (selectedWotd) {
            setIsWotdComposed(dataStore.isWordComposed(selectedWotd.id));
        } else {
            setIsWotdComposed(false);
        }
        
        const chapters = adventureService.getChapters();
    
        const progress = currentUser.adventure;
        if (progress) {
            const wordsByText = new Map(allUserWords.map(w => [w.word.toLowerCase(), w]));
            const updatedProgress = { ...progress };
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
                        if (currentStars < 1 && segment.basicWords.length > 0 && segment.basicWords.every(w => (wordsByText.get(w.toLowerCase())?.consecutiveCorrect ?? 0) > 0)) {
                            awardStar(1, `🌟 1-Star Mastery for "${segment.title}"! (+1 Key Fragment)`);
                            currentStars = 1; 
                        }
    
                        if (currentStars === 1 && segment.intermediateWords.length > 0 && segment.intermediateWords.every(w => (wordsByText.get(w.toLowerCase())?.consecutiveCorrect ?? 0) > 0)) {
                            awardStar(2, `🌟🌟 2-Star Mastery for "${segment.title}"! (+1 Key Fragment)`);
                            currentStars = 2;
                        }
    
                        if (currentStars === 2 && segment.advancedWords.length > 0 && segment.advancedWords.every(w => (wordsByText.get(w.toLowerCase())?.consecutiveCorrect ?? 0) > 0)) {
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
    }, [currentUser, showToast, onUpdateUser, randomWotd]);

    // Force re-run logic if randomWotd changes
    useEffect(() => {
        if (randomWotd) {
            refreshGlobalStats();
        }
    }, [randomWotd]);

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
    
    const randomizeWotd = () => {
        if (!currentUser) return;
        const allUserWords = dataStore.getAllWords().filter(w => w.userId === currentUser.id);
        const wotdPool = allUserWords.filter(w => !w.isPassive && w.quality === WordQuality.VERIFIED);
        if (wotdPool.length > 0) {
            const random = wotdPool[Math.floor(Math.random() * wotdPool.length)];
            setRandomWotd(random);
        }
    };

    return { stats, wotd, setWotd, apiUsage, refreshGlobalStats, isWotdComposed, randomizeWotd };
};
