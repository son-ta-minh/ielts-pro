
import React, { useState, useEffect } from 'react';
import { User, VocabularyItem, SessionType } from '../../../../app/types';
import * as dataStore from '../../../../app/dataStore';
import { AdventureUI } from './Adventure_UI';
import { BattleMode } from './BossBattle';
import { BADGE_DEFINITIONS, generateMap } from '../../../../data/adventure_map';
import { useToast } from '../../../../contexts/ToastContext';
import { InventoryModal } from './InventoryModal';
import Fireworks from './Fireworks';

interface Props {
    user: User;
    onExit: () => void;
    onUpdateUser: (user: User) => Promise<void>;
    onStartSession: (words: VocabularyItem[], type: SessionType) => void;
}

const Adventure: React.FC<Props> = ({ user, onExit, onUpdateUser }) => {
    const { showToast } = useToast();
    const [activeBoss, setActiveBoss] = useState<{ boss: any, words: VocabularyItem[] } | null>(null);
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    
    // Changed from boolean to object to pass data to Fireworks
    const [celebrationData, setCelebrationData] = useState<{ name: string, icon: string } | null>(null);

    // Ensure user has a persistent map. If not, create and save one.
    useEffect(() => {
        if (!user.adventure.map) {
            const newMap = generateMap(100);
            onUpdateUser({
                ...user,
                adventure: { ...user.adventure, map: newMap }
            });
        }
    }, []);

    const activeMap = user.adventure.map || generateMap(100); // Fallback to temp map if sync is pending

    const handleMove = async () => {
        // 1. Basic Validation
        const currentProgress = { ...user.adventure };
        if (currentProgress.energy <= 0) {
            showToast("Not enough energy to move!", 'error');
            return;
        }

        // 2. Consume Energy & Move
        currentProgress.energy -= 1;
        const nextIndex = currentProgress.currentNodeIndex + 1;
        currentProgress.currentNodeIndex = nextIndex;

        const nextNode = activeMap[nextIndex];

        // 3. Auto Interaction Logic (ONLY for items, NOT for bosses)
        if (nextNode) {
            if (nextNode.type === 'standard') {
                currentProgress.energyShards = (currentProgress.energyShards || 0) + 1;
                showToast("+1 Energy Shard ⚡", 'success', 2000);
            } 
            else if (nextNode.type === 'key_fragment') {
                currentProgress.keyFragments = (currentProgress.keyFragments || 0) + 1;
                showToast("Picked up a Key Fragment 🗝️", 'success', 3000);
            } 
            else if (nextNode.type === 'treasure') {
                // Collect Treasure into Inventory
                currentProgress.badges = [...(currentProgress.badges || []), 'locked_chest'];
                showToast("Picked up a Locked Chest! 🧰 (Check Inventory)", 'success', 3000);
            } 
            // Boss logic removed from here to allow manual interaction
        }

        // 4. Random Item Drops (Potions & Fruits) - 15% Chance
        const itemRoll = Math.random();
        if (itemRoll < 0.15) {
            if (Math.random() < 0.5) {
                currentProgress.hpPotions = (currentProgress.hpPotions || 0) + 1;
                showToast("You found an HP Potion! 🧪", 'success', 4000);
            } else {
                currentProgress.wisdomFruits = (currentProgress.wisdomFruits || 0) + 1;
                showToast("You found a Wisdom Fruit! 🍎", 'success', 4000);
            }
        }

        // 5. Random Dice Drop (20% chance on any move) - Independent of items
        if (Math.random() < 0.2) {
            currentProgress.badges = [...(currentProgress.badges || []), 'lucky_dice'];
            showToast("You found a Lucky Dice! 🎲", 'success', 4000);
        }

        // 6. Save State
        await onUpdateUser({ ...user, adventure: currentProgress });
    };

    // Manual interaction for Bosses
    const handleNodeClick = async (node: any) => {
        // Only allow interaction if we are AT this node
        if (node.id !== user.adventure.currentNodeIndex) return;

        if (node.type === 'boss') {
            // Check if already defeated
            if (node.isDefeated) {
                showToast("This boss has already been defeated.", "info");
                return;
            }

            // Trigger Boss Battle
            const allUserWords = dataStore.getAllWords().filter(w => w.userId === user.id);
            if (allUserWords.length === 0) {
                showToast("You have no words in your library to fight a boss. Add some words first!", "error");
                return;
            }

            const learnedWords = allUserWords.filter(w => w.lastReview);

            if (learnedWords.length < 20) {
                showToast("Warning: Boss ahead! You need more learned words to fight effectively. Other words from your library will be used.", "info");
            }

            let battleWords = [...learnedWords].sort(() => 0.5 - Math.random());

            if (battleWords.length < 20) {
                const learnedIds = new Set(battleWords.map(w => w.id));
                const otherWords = allUserWords.filter(w => !learnedIds.has(w.id));
                const needed = 20 - battleWords.length;
                battleWords.push(...[...otherWords].sort(() => 0.5 - Math.random()).slice(0, needed));
            }
            
            // Cap at 20
            battleWords = battleWords.slice(0, 20);
            
            // Force boss HP to 20 to ensure consistency regardless of stored data
            const bossData = { ...node.boss_details!, hp: 20 };
            
            setActiveBoss({ boss: bossData, words: battleWords });
        }
    };
    
    const handleBattleVictory = async () => {
        showToast("Boss defeated! +1 Key Fragment", 'success');
        const newProgress = { ...user.adventure };
        
        // Award rewards
        newProgress.keyFragments = (newProgress.keyFragments || 0) + 1;

        // Mark map node as defeated
        if (newProgress.map) {
            const newMap = [...newProgress.map];
            const nodeIndex = newProgress.currentNodeIndex;
            if (newMap[nodeIndex]) {
                newMap[nodeIndex] = { ...newMap[nodeIndex], isDefeated: true };
            }
            newProgress.map = newMap;
        }

        await onUpdateUser({ ...user, adventure: newProgress });
        setActiveBoss(null);
    };

    const handleUseBadge = async (badgeId: string) => {
        const newProgress = { ...user.adventure };
        newProgress.badges = newProgress.badges || [];

        if (badgeId === 'locked_chest') {
            if ((newProgress.keys || 0) <= 0) {
                showToast("You need a Magic Key 🗝️ to open this chest!", 'error');
                return;
            }

            // Consume Key and Chest
            newProgress.keys -= 1;
            
            // Remove ONE instance of locked_chest
            const chestIndex = newProgress.badges.indexOf('locked_chest');
            if (chestIndex > -1) {
                newProgress.badges.splice(chestIndex, 1);
            }

            // Award random real badge
            const realBadgeKeys = Object.keys(BADGE_DEFINITIONS).filter(k => k !== 'locked_chest' && k !== 'lucky_dice');
            const userBadges = newProgress.badges || [];
            
            // Prioritize badges the user does NOT have yet
            const unownedBadges = realBadgeKeys.filter(k => !userBadges.includes(k));
            
            let randomBadgeId: string;
            if (unownedBadges.length > 0) {
                randomBadgeId = unownedBadges[Math.floor(Math.random() * unownedBadges.length)];
            } else {
                // If user has all badges, give a random duplicate
                randomBadgeId = realBadgeKeys[Math.floor(Math.random() * realBadgeKeys.length)];
            }

            newProgress.badges.push(randomBadgeId);

            await onUpdateUser({ ...user, adventure: newProgress });
            
            // Trigger Fireworks with specific badge data
            setCelebrationData(BADGE_DEFINITIONS[randomBadgeId]);
            setIsInventoryOpen(false); // Close inventory to show fireworks
            
        } else if (badgeId === 'lucky_dice') {
            // Remove ONE instance of lucky_dice
            const diceIndex = newProgress.badges.indexOf('lucky_dice');
            if (diceIndex > -1) {
                newProgress.badges.splice(diceIndex, 1);
            } else {
                return; // Should not happen
            }

            const roll = Math.random();
            // 20% Energy, 20% Key, 20% Chest, 20% HP Potion, 20% Wisdom Fruit
            if (roll < 0.2) {
                newProgress.energy += 3;
                showToast("Dice rolled! +3 Energy ⚡", 'success', 3000);
            } else if (roll < 0.4) {
                newProgress.keys = (newProgress.keys || 0) + 1;
                showToast("Dice rolled! +1 Magic Key 🗝️", 'success', 3000);
            } else if (roll < 0.6) {
                newProgress.badges.push('locked_chest');
                showToast("Dice rolled! +1 Locked Chest 🧰", 'success', 3000);
            } else if (roll < 0.8) {
                newProgress.hpPotions = (newProgress.hpPotions || 0) + 1;
                showToast("Dice rolled! +1 HP Potion 🧪", 'success', 3000);
            } else {
                newProgress.wisdomFruits = (newProgress.wisdomFruits || 0) + 1;
                showToast("Dice rolled! +1 Wisdom Fruit 🍎", 'success', 3000);
            }

            await onUpdateUser({ ...user, adventure: newProgress });

        } else {
            // Logic for using other badges (just show them for now)
            setCelebrationData(BADGE_DEFINITIONS[badgeId]);
        }
    };

    const handleExchangeEnergyForDice = async () => {
        const newProgress = { ...user.adventure };
        const currentEnergy = newProgress.energy || 0;

        if (currentEnergy < 3) {
            showToast("Need at least 3 Energy to exchange for a Lucky Dice.", 'error');
            return;
        }

        newProgress.energy = currentEnergy - 3;
        newProgress.badges = [...(newProgress.badges || []), 'lucky_dice'];
        await onUpdateUser({ ...user, adventure: newProgress });
        showToast("Exchanged 3 Energy for 1 Lucky Dice! 🎲", 'success', 3000);
    };

    const handleAdminAction = async (action: 'add_energy' | 'remove_energy' | 'add_key' | 'remove_key' | 'add_hp' | 'remove_hp' | 'add_fruit' | 'remove_fruit' | 'pass_boss') => {
        const newProgress = { ...user.adventure };
        if (action === 'add_energy') {
            newProgress.energy = (newProgress.energy || 0) + 10;
            showToast("Admin: +10 Energy", 'success');
        } else if (action === 'remove_energy') {
            newProgress.energy = Math.max(0, (newProgress.energy || 0) - 1);
            showToast("Admin: -1 Energy", 'info');
        } else if (action === 'add_key') {
            newProgress.keys = (newProgress.keys || 0) + 1;
            showToast("Admin: +1 Key", 'success');
        } else if (action === 'remove_key') {
            newProgress.keys = Math.max(0, (newProgress.keys || 0) - 1);
            showToast("Admin: -1 Key", 'info');
        } else if (action === 'add_hp') {
            newProgress.hpPotions = (newProgress.hpPotions || 0) + 1;
            showToast("Admin: +1 HP Potion", 'success');
        } else if (action === 'remove_hp') {
            newProgress.hpPotions = Math.max(0, (newProgress.hpPotions || 0) - 1);
            showToast("Admin: -1 HP Potion", 'info');
        } else if (action === 'add_fruit') {
            newProgress.wisdomFruits = (newProgress.wisdomFruits || 0) + 1;
            showToast("Admin: +1 Wisdom Fruit", 'success');
        } else if (action === 'remove_fruit') {
            newProgress.wisdomFruits = Math.max(0, (newProgress.wisdomFruits || 0) - 1);
            showToast("Admin: -1 Wisdom Fruit", 'info');
        } else if (action === 'pass_boss') {
            // Check if current node is boss
            const currentNode = activeMap[newProgress.currentNodeIndex];
            if (currentNode && currentNode.type === 'boss') {
                // If in battle mode, win it
                if (activeBoss) {
                    await handleBattleVictory();
                    return;
                }
                
                // If just on map, trigger victory logic manually
                showToast("Admin: Force Boss Victory", 'success');
                
                // Simulate boss loot logic
                newProgress.keyFragments = (newProgress.keyFragments || 0) + 1;

                // Update Map
                if (newProgress.map) {
                    const newMap = [...newProgress.map];
                    const nodeIndex = newProgress.currentNodeIndex;
                    if (newMap[nodeIndex]) {
                        newMap[nodeIndex] = { ...newMap[nodeIndex], isDefeated: true };
                    }
                    newProgress.map = newMap;
                }

            } else {
                showToast("Not currently at a boss node.", 'info');
            }
        }
        await onUpdateUser({ ...user, adventure: newProgress });
    };

    if (activeBoss) {
        return (
            <BattleMode
                user={user}
                boss={activeBoss.boss}
                words={activeBoss.words}
                onVictory={handleBattleVictory}
                onDefeat={() => {
                    showToast("You were defeated. Study more and try again!", "error");
                    setActiveBoss(null);
                }}
                onExit={() => setActiveBoss(null)}
                onUpdateUser={onUpdateUser}
            />
        );
    }

    return (
        <>
            <AdventureUI
                user={user}
                progress={user.adventure}
                onExit={onExit}
                map={activeMap}
                onMove={handleMove}
                onNodeClick={handleNodeClick}
                onOpenInventory={() => setIsInventoryOpen(true)}
                onAdminAction={handleAdminAction}
            />
            <InventoryModal 
                isOpen={isInventoryOpen}
                onClose={() => setIsInventoryOpen(false)}
                badges={user.adventure.badges || []}
                onUseBadge={handleUseBadge}
                hpPotions={user.adventure.hpPotions || 0}
                wisdomFruits={user.adventure.wisdomFruits || 0}
                energy={user.adventure.energy || 0}
                onExchangeEnergyForDice={handleExchangeEnergyForDice}
            />
            {celebrationData && (
                <Fireworks 
                    badge={celebrationData} 
                    onComplete={() => setCelebrationData(null)} 
                />
            )}
        </>
    );
};

export default Adventure;
