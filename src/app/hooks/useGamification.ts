import React, { useState, useCallback, useMemo } from 'react';
import { User, VocabularyItem, ReviewGrade } from '../types';
import { saveWord } from '../db';
import { useToast } from '../../contexts/ToastContext';

// --- Constants (moved from useAppController) ---

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
    onUpdateUser: (user: User) => Promise<void>;
    sessionWords: VocabularyItem[] | null;
    setSessionWords: React.Dispatch<React.SetStateAction<VocabularyItem[] | null>>;
}

export const useGamification = ({ currentUser, onUpdateUser, sessionWords, setSessionWords }: UseGamificationProps) => {
    const [xpGained, setXpGained] = useState<{ amount: number, levelUp: boolean, newLevel: number | null } | null>(null);
    const { showToast } = useToast();

    const gainExperienceAndLevelUp = useCallback(async (baseXpAmount: number, wordToUpdate?: VocabularyItem, grade?: ReviewGrade) => {
        if (!currentUser) return 0;
        
        const oldRole = currentUser.role;
        let effectiveXpAmount = baseXpAmount;
        let finalWordToSave: VocabularyItem | undefined = wordToUpdate;
        
        if (wordToUpdate) {
            if (grade === ReviewGrade.HARD) effectiveXpAmount = Math.round(baseXpAmount * 0.75);
            else if (grade === ReviewGrade.FORGOT) effectiveXpAmount = Math.round(baseXpAmount * 0.50);

            const now = Date.now();
            if (wordToUpdate.lastXpEarnedTime) {
                const timeSinceLastXp = now - wordToUpdate.lastXpEarnedTime;
                if (timeSinceLastXp < XP_COOLDOWN_QUICK_RETRY) effectiveXpAmount = 0;
                else if (timeSinceLastXp < XP_COOLDOWN_1_DAY) effectiveXpAmount = Math.round(effectiveXpAmount * 0.1);
                else if (timeSinceLastXp < XP_COOLDOWN_3_DAYS) effectiveXpAmount = Math.round(effectiveXpAmount * 0.5);
            }
            
            effectiveXpAmount = Math.max(0, effectiveXpAmount);

            if (effectiveXpAmount > 0) {
                finalWordToSave = { ...wordToUpdate, lastXpEarnedTime: now };
            }
            
            await saveWord(finalWordToSave!);
            if (sessionWords) {
                const wordForState = finalWordToSave!;
                setSessionWords(prev => (prev || []).map(w => w.id === wordForState.id ? wordForState : w));
            }
        }

        if (baseXpAmount <= 0) return 0;
        
        if (effectiveXpAmount === 0 && baseXpAmount > 0) {
            showToast(`+0 XP (Cooldown)`, 'info', 1500);
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
        const roleChanged = finalRole !== oldRole;

        const updatedUser: User = { ...currentUser, experience: newExperience, level: newLevel, role: finalRole };

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

        await onUpdateUser(updatedUser);

        setXpGained({ amount: finalXpForUser, levelUp, newLevel: levelUp ? newLevel : null });
        setTimeout(() => setXpGained(null), levelUp ? 5000 : 2000);

        return finalXpForUser;
    }, [currentUser, onUpdateUser, showToast, sessionWords, setSessionWords]);

    const xpToNextLevel = useMemo(() => {
        if (!currentUser) return 0;
        return getXpForNextLevel(currentUser.level);
    }, [currentUser]);

    return { gainExperienceAndLevelUp, xpGained, xpToNextLevel };
};
