import React, { useState, useCallback, useMemo } from 'react';
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
    if (word.needsPronunciationFocus) baseXP += 15;
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

const XP_MULTIPLIERS: { level: number; multiplier: number; }[] = [
    { level: 10, multiplier: 1.05 },
    { level: 25, multiplier: 1.10 },
    { level: 50, multiplier: 1.20 },
];

const getRoleForLevel = (level: number): string => {
    let role = 'Vocab Novice';
    for (const r of RPG_ROLES) {
        if (level >= r.level) role = r.title;
        else break;
    }
    return role;
};

const XP_COOLDOWN_QUICK_RETRY = 5 * 60 * 1000;
const XP_COOLDOWN_1_DAY = 24 * 60 * 60 * 1000;
const XP_COOLDOWN_3_DAYS = 3 * XP_COOLDOWN_1_DAY;

interface UseGamificationProps {
    currentUser: User | null;
    onSaveWordAndUser: (word: VocabularyItem, user: User) => Promise<void>;
}

export const useGamification = ({ currentUser, onSaveWordAndUser }: UseGamificationProps) => {
    const [xpGained, setXpGained] = useState<{ amount: number, levelUp: boolean, newLevel: number | null } | null>(null);
    const { showToast } = useToast();

    const gainExperienceAndLevelUp = useCallback(async (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade, testCounts?: { correct: number, tested: number }) => {
        if (!currentUser || !wordToUpdate) return 0;
        
        let effectiveXpAmount = baseXpAmount;
        let finalWordToSave: VocabularyItem = { ...wordToUpdate };
        
        if (testCounts) {
            if (testCounts.tested > 0) {
                const correctRatio = testCounts.correct / testCounts.tested;
                effectiveXpAmount = Math.round(baseXpAmount * correctRatio);
            } else {
                effectiveXpAmount = 0;
            }
        } else {
            if (grade === ReviewGrade.HARD) effectiveXpAmount = Math.round(baseXpAmount * 0.75);
            else if (grade === ReviewGrade.FORGOT) effectiveXpAmount = Math.round(baseXpAmount * 0.50);
        }

        const now = Date.now();
        if (wordToUpdate.lastXpEarnedTime) {
            const timeSinceLastXp = now - wordToUpdate.lastXpEarnedTime;
            if (timeSinceLastXp < XP_COOLDOWN_QUICK_RETRY) effectiveXpAmount = 0;
            else if (timeSinceLastXp < XP_COOLDOWN_1_DAY) effectiveXpAmount = Math.round(effectiveXpAmount * 0.1);
            else if (timeSinceLastXp < XP_COOLDOWN_3_DAYS) effectiveXpAmount = Math.round(effectiveXpAmount * 0.5);
        }
        
        effectiveXpAmount = Math.max(0, effectiveXpAmount);

        if (effectiveXpAmount > 0) {
            finalWordToSave.lastXpEarnedTime = now;
        }

        if (baseXpAmount <= 0) {
            // Still save the word if it was updated (e.g., SRS data), even with 0 XP
            await onSaveWordAndUser(finalWordToSave, currentUser);
            return 0;
        }
        
        if (effectiveXpAmount === 0 && baseXpAmount > 0) {
            showToast(`+0 XP`, 'info', 1500);
            // Save the word even if no XP is gained to update SRS stats
            await onSaveWordAndUser(finalWordToSave, currentUser);
            return 0;
        }

        let finalXpForUser = effectiveXpAmount;
        for (const xpM of XP_MULTIPLIERS) {
          if (currentUser.level >= xpM.level) {
            finalXpForUser = Math.round(effectiveXpAmount * xpM.multiplier);
          }
        }

        let newExperience = currentUser.experience + finalXpForUser;
        let newLevel = currentUser.level;
        let levelUp = false;
        let xpNeededForNextLevel = getXpForNextLevel(newLevel);

        while (newExperience >= xpNeededForNextLevel) {
          newExperience -= xpNeededForNextLevel;
          newLevel++;
          levelUp = true;
          xpNeededForNextLevel = getXpForNextLevel(newLevel);
        }

        const newAutoRole = getRoleForLevel(newLevel);
        let finalRole = currentUser.role;

        const isCurrentRoleAutoAssigned = RPG_ROLES.some(r => r.title === currentUser.role);
        if (isCurrentRoleAutoAssigned || !currentUser.role || currentUser.role.trim() === '') {
          finalRole = newAutoRole;
        }
        const roleChanged = finalRole !== currentUser.role;

        const updatedUser: User = { ...currentUser, experience: newExperience, level: newLevel, role: finalRole };
        
        // Atomic save operation for both word and user
        await onSaveWordAndUser(finalWordToSave, updatedUser);

        if (levelUp) {
            if (updatedUser.adventure) {
                let fragmentsAwarded = 1;
                let keyAssembled = false;
                let toastMessage = `🌟 Level Up to ${newLevel}! +1 Key Fragment`;

                if (roleChanged) {
                    fragmentsAwarded++;
                    toastMessage = `New Title: "${finalRole}"! +2 Key Fragments`;
                }

                updatedUser.adventure.keyFragments = (updatedUser.adventure.keyFragments || 0) + fragmentsAwarded;
                
                while (updatedUser.adventure.keyFragments >= 3) {
                    updatedUser.adventure.keyFragments -= 3;
                    updatedUser.adventure.keys = (updatedUser.adventure.keys || 0) + 1;
                    keyAssembled = true;
                }
                
                showToast(toastMessage, 'success', 6000);
                if (keyAssembled) showToast("✨ Key Fragments assembled into a Magic Key!", "success", 4000);
            } else {
                showToast(`🌟 Level Up! You reached Level ${newLevel}!`, 'success', 5000);
            }
        } else if (finalXpForUser > 0) {
            showToast(`+${finalXpForUser} XP gained!`, 'info', 2000);
        }

        setXpGained({ amount: finalXpForUser, levelUp, newLevel: levelUp ? newLevel : null });
        setTimeout(() => setXpGained(null), levelUp ? 5000 : 2000);

        return finalXpForUser;
    }, [currentUser, showToast, onSaveWordAndUser]);

    const xpToNextLevel = useMemo(() => {
        if (!currentUser) return 0;
        return getXpForNextLevel(currentUser.level);
    }, [currentUser]);

    return { gainExperienceAndLevelUp, xpGained, xpToNextLevel };
};
