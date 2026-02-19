import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { User, VocabularyItem, ReviewGrade } from '../types';
import { useToast } from '../../contexts/ToastContext';

// --- Constants (moved from useAppController) ---

export const calculateWordDifficultyXp = (word: VocabularyItem): number => {
    if (word.isPassive) return 0;
    let baseXP = 50;
    if (word.ipaMistakes?.length) baseXP += 20;
    if (word.collocationsArray) baseXP += Math.min(word.collocationsArray.filter(c => !c.isIgnored).length * 10, 50);
    if (word.idiomsList) baseXP += Math.min(word.idiomsList.filter(c => !c.isIgnored).length * 15, 45);
    if (word.prepositions) baseXP += Math.min(word.prepositions.filter(p => !p.isIgnored).length * 10, 40);
    if (word.wordFamily) {
        const familyCount = (word.wordFamily.nouns?.filter(m => !m.isIgnored).length || 0) +
                            (word.wordFamily.verbs?.filter(m => !m.isIgnored).length || 0) +
                            (word.wordFamily.adjs?.filter(m => !m.isIgnored).length || 0) +
                            (word.wordFamily.advs?.filter(m => !m.isIgnored).length || 0);
        baseXP += Math.min(familyCount * 5, 50);
    }
    if (word.paraphrases) baseXP += Math.min(word.paraphrases.filter(p => !p.isIgnored).length * 10, 30);
    if (word.isIrregular) baseXP += 20;
    if (word.isIdiom || word.isPhrasalVerb || word.isCollocation || word.isStandardPhrase) baseXP += 10;
    if (word.word.length > 7) baseXP += 5;
    if (word.word.length > 10) baseXP += 5;
    return Math.round(baseXP);
};

const getXpForNextLevel = (level: number): number => {
    if (level < 1) return 0;
    if (level <= 5) return 100 + (level * 50);
    if (level <= 10) return 350 + ((level - 5) * 100);
    return 850 + ((level - 10) * 200);
};

const RPG_ROLES: { level: number; title: string; }[] = [
  { level: 1, title: 'Vocab Novice' },
  { level: 5, title: 'Word Apprentice' },
  { level: 10, title: 'Lexical Explorer' },
  { level: 20, title: 'Master Grammarian' },
  { level: 30, title: 'IELTS Wordsmith' },
  { level: 50, title: 'IELTS Luminary' },
];

const getRoleForLevel = (level: number): string => {
    let role = 'Vocab Novice';
    for (const r of RPG_ROLES) {
        if (level >= r.level) role = r.title;
        else break;
    }
    return role;
};

const calculateAbsoluteXp = (level: number, experienceInLevel: number): number => {
    let total = 0;
    for (let i = 1; i < level; i++) {
        total += getXpForNextLevel(i);
    }
    total += experienceInLevel;
    return total;
}

interface UseGamificationProps {
    currentUser: User | null;
    onUpdateUser: (user: User) => Promise<void>;
    onSaveWordAndUser: (word: VocabularyItem, user: User) => Promise<void>;
}

export const useGamification = ({ currentUser, onUpdateUser, onSaveWordAndUser }: UseGamificationProps) => {
    const [xpGained, setXpGained] = useState<{ amount: number, levelUp: boolean, newLevel: number | null } | null>(null);
    const { showToast } = useToast();
    
    // Ref to hold latest currentUser without making callbacks dependent on it.
    const currentUserRef = useRef(currentUser);
    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    const gainExperienceAndLevelUp = useCallback(async (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number; tested: number; }) => {
        const user = currentUserRef.current;
        if (!user) return 0;

        let finalXp = baseXpAmount;

        if (wordToUpdate) {
            const now = Date.now();
            const todayStr = new Date(now).toDateString();
            
            // Limit XP award to once per word per day to prevent farming
            if (wordToUpdate.lastXpEarnedTime) {
                const lastEarnedDate = new Date(wordToUpdate.lastXpEarnedTime).toDateString();
                if (lastEarnedDate === todayStr) {
                    return 0; // Already earned XP for this word today
                }
            }
            
            // Bonus/penalty logic
            if (testCounts && testCounts.tested > 0) {
                const accuracy = testCounts.correct / testCounts.tested;
                finalXp *= (1 + (accuracy - 0.7)); // Bonus for >70% accuracy, penalty for less
            }
            if (grade === ReviewGrade.EASY) finalXp *= 1.1;
            if (grade === ReviewGrade.FORGOT) finalXp *= 0.1; // Penalty for forgetting

            finalXp = Math.round(Math.max(5, finalXp)); // Award at least 5 xp for trying
            
            wordToUpdate.lastXpEarnedTime = now;
        }

        const currentAbsoluteXp = calculateAbsoluteXp(user.level, user.experience);
        const newAbsoluteXp = currentAbsoluteXp + Math.round(finalXp);
        
        let newLevel = 1;
        let experienceLeft = newAbsoluteXp;
        let xpForNext = getXpForNextLevel(newLevel);

        while (experienceLeft >= xpForNext) {
            experienceLeft -= xpForNext;
            newLevel++;
            xpForNext = getXpForNextLevel(newLevel);
        }
        
        const newExperienceInLevel = Math.floor(experienceLeft);

        const oldLevel = user.level;
        const levelUpOccurred = newLevel > oldLevel;
        const newRole = getRoleForLevel(newLevel);

        const updatedUser: User = { 
            ...user, 
            experience: newExperienceInLevel, 
            level: newLevel,
            peakLevel: Math.max(user.peakLevel || oldLevel, newLevel),
            role: newRole,
        };

        let keyAssembled = false;
        // If wordToUpdate is null, it's a generic XP gain from an arcade game.
        // NOTE: Arcade XP is disabled, so this block likely won't trigger for generic XP anymore, 
        // but kept for potential future use or other non-word interactions.
        if (!wordToUpdate && baseXpAmount > 0) {
            if (Math.random() < 0.2) { // 20% chance
                const newAdventure = { ...updatedUser.adventure };
                newAdventure.keyFragments = (newAdventure.keyFragments || 0) + 1;
                showToast('You found a Key Fragment! 🔑', 'success', 2000);
                
                if (newAdventure.keyFragments >= 3) {
                    newAdventure.keyFragments -= 3;
                    newAdventure.keys = (newAdventure.keys || 0) + 1;
                    keyAssembled = true;
                }
                updatedUser.adventure = newAdventure;
            }
        }


        if (wordToUpdate) {
            await onSaveWordAndUser(wordToUpdate, updatedUser);
        } else {
            await onUpdateUser(updatedUser);
        }

        if (keyAssembled) {
            showToast("✨ Key Fragments assembled into a Magic Key!", "success", 4000);
        }

        setXpGained({ amount: Math.round(finalXp), levelUp: levelUpOccurred, newLevel: levelUpOccurred ? newLevel : null });
        setTimeout(() => setXpGained(null), levelUpOccurred ? 5000 : 2000);

        if (levelUpOccurred) {
            showToast(`⬆️ Level Up to ${newLevel}! New title: "${newRole}"`, 'success', 5000);
        }
        
        return Math.round(finalXp);
    }, [onUpdateUser, onSaveWordAndUser, showToast]);

    const recalculateXpAndLevelUp = useCallback(async (absoluteTotalXp: number) => {
        const user = currentUserRef.current;
        if (!user) return;

        const oldAbsoluteXp = calculateAbsoluteXp(user.level, user.experience);
        const xpChange = absoluteTotalXp - oldAbsoluteXp;
        
        if (xpChange === 0) {
            return;
        }

        let newLevel = 1;
        let experienceLeft = absoluteTotalXp;
        let xpForNext = getXpForNextLevel(newLevel);

        while (experienceLeft >= xpForNext) {
            experienceLeft -= xpForNext;
            newLevel++;
            xpForNext = getXpForNextLevel(newLevel);
        }
        
        const newExperienceInLevel = Math.floor(experienceLeft);

        const oldLevel = user.level;
        const oldPeakLevel = user.peakLevel || oldLevel;
        const newPeakLevel = Math.max(oldPeakLevel, newLevel);
        const newRole = getRoleForLevel(newLevel);

        const levelUpOccurred = newLevel > oldLevel;
        const newPeakReached = newLevel > oldPeakLevel;
        const roleChanged = newRole !== getRoleForLevel(oldPeakLevel);

        const updatedUser: User = { 
            ...user, 
            experience: newExperienceInLevel, 
            level: newLevel,
            peakLevel: newPeakLevel,
            role: newRole,
        };
        
        // --- Award Adventure fragments only on reaching a new peak level ---
        if (newPeakReached) {
            let fragmentsAwarded = 1;
            let keyAssembled = false;
            let toastMessage = `🌟 New Peak Level: ${newLevel}! +1 Key Fragment`;

            if (roleChanged) {
                fragmentsAwarded++;
                toastMessage = `New Title: "${newRole}"! +2 Key Fragments`;
            }

            updatedUser.adventure.keyFragments = (updatedUser.adventure.keyFragments || 0) + fragmentsAwarded;
            
            while (updatedUser.adventure.keyFragments >= 3) {
                updatedUser.adventure.keyFragments -= 3;
                updatedUser.adventure.keys = (updatedUser.adventure.keys || 0) + 1;
                keyAssembled = true;
            }
            
            showToast(toastMessage, 'success', 6000);
            if (keyAssembled) showToast("✨ Key Fragments assembled into a Magic Key!", "success", 4000);

        } else if (levelUpOccurred) {
            showToast(`⬆️ Level Up to ${newLevel}!`, 'success', 4000);
        } else if (xpChange !== 0) {
            const sign = xpChange > 0 ? '+' : '';
            showToast(`XP Recalculated: ${sign}${xpChange} XP`, 'info', 2000);
        }
        
        await onUpdateUser(updatedUser);

        setXpGained({ amount: xpChange, levelUp: levelUpOccurred, newLevel: levelUpOccurred ? newLevel : null });
        setTimeout(() => setXpGained(null), levelUpOccurred ? 5000 : 2000);

    }, [showToast, onUpdateUser]);

    const xpToNextLevel = useMemo(() => {
        if (!currentUser) return 0;
        return getXpForNextLevel(currentUser.level);
    }, [currentUser]);

    return { recalculateXpAndLevelUp, gainExperienceAndLevelUp, xpGained, xpToNextLevel };
};