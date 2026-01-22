
import { MapNode } from '../app/types';

export const BADGE_DEFINITIONS: Record<string, {name: string, icon: string}> = {
    'locked_chest': { name: 'Locked Chest', icon: '🧰' },
    'lucky_dice': { name: 'Lucky Dice', icon: '🎲' },
    
    // Tier 1: Attributes (Originals)
    'badge_of_courage': { name: 'Badge of Courage', icon: '🦁' },
    'badge_of_wisdom': { name: 'Badge of Wisdom', icon: '🦉' },
    'badge_of_strength': { name: 'Badge of Strength', icon: '🦍' },
    'badge_of_speed': { name: 'Badge of Speed', icon: '🦅' },
    'badge_of_endurance': { name: 'Badge of Endurance', icon: '🐢' },
    
    // Tier 2: Skills
    'badge_of_precision': { name: 'Badge of Precision', icon: '🎯' },
    'badge_of_focus': { name: 'Badge of Focus', icon: '🔭' },
    'badge_of_logic': { name: 'Badge of Logic', icon: '🧩' },
    'badge_of_creativity': { name: 'Badge of Creativity', icon: '🎨' },
    'badge_of_eloquence': { name: 'Badge of Eloquence', icon: '🎙️' },

    // Tier 3: Virtues
    'badge_of_resilience': { name: 'Badge of Resilience', icon: '🛡️' },
    'badge_of_harmony': { name: 'Badge of Harmony', icon: '⚖️' },
    'badge_of_vitality': { name: 'Badge of Vitality', icon: '🌱' },
    'badge_of_willpower': { name: 'Badge of Willpower', icon: '🔥' },
    'badge_of_serenity': { name: 'Badge of Serenity', icon: '💧' },

    // Tier 4: Concepts
    'badge_of_insight': { name: 'Badge of Insight', icon: '👁️' },
    'badge_of_mystery': { name: 'Badge of Mystery', icon: '🔮' },
    'badge_of_adventure': { name: 'Badge of Adventure', icon: '🗺️' },
    'badge_of_fortune': { name: 'Badge of Fortune', icon: '🍀' },
    'badge_of_innovation': { name: 'Badge of Innovation', icon: '💡' },
};

export const BOSSES = [
    { name: 'Cyber Sentinel', image: '🤖', hp: 20, dialogueIntro: "Logic is absolute. Prove yours.", dialogueWin: "Error... System... Crash...", dialogueLose: "Your logic is flawed." },
    { name: 'Inferno Dragon', image: '🐉', hp: 25, dialogueIntro: "I breathe fire. What do you breathe?", dialogueWin: "Your spirit burns brighter...", dialogueLose: "Burn to ash!" },
    { name: 'Abyssal Kraken', image: '🐙', hp: 20, dialogueIntro: "The depths hold many secrets.", dialogueWin: "You have navigated the abyss.", dialogueLose: "Join the sunken ones." },
    { name: 'Spectral Wraith', image: '👻', hp: 15, dialogueIntro: "Can you touch what isn't there?", dialogueWin: "I fade into the light...", dialogueLose: "Your soul is mine." },
    { name: 'Ancient Mummy', image: '🧟', hp: 20, dialogueIntro: "My curse is eternal.", dialogueWin: "Rest... finally...", dialogueLose: "Join my tomb." },
    { name: 'Alien Warlord', image: '👽', hp: 20, dialogueIntro: "Your language is primitive.", dialogueWin: "Acknowledged. You are superior.", dialogueLose: "Earth is ours." },
    { name: 'Primal T-Rex', image: '🦖', hp: 25, dialogueIntro: "ROOOARRR! The earth shakes beneath me!", dialogueWin: "Extinction... comes for me...", dialogueLose: "You are merely prey." },
    { name: 'Shadow Ninja', image: '🥷', hp: 18, dialogueIntro: "Silence is the loudest scream.", dialogueWin: "Honorable defeat...", dialogueLose: "Too slow." },
    { name: 'Vampire Lord', image: '🧛', hp: 20, dialogueIntro: "The night is young.", dialogueWin: "The sun... it burns...", dialogueLose: "Delicious." },
    { name: 'Oni Warlord', image: '👺', hp: 22, dialogueIntro: "Face the demon within!", dialogueWin: "Your spirit is unbreakable.", dialogueLose: "Another soul for the mask." },
    { name: 'Syntax Serpent', image: '🐍', hp: 20, dialogueIntro: "Untangle my sentences if you can.", dialogueWin: "Your logic is impeccable.", dialogueLose: "Your structure is flawed." },
    { name: 'Dread Scorpion', image: '🦂', hp: 25, dialogueIntro: "One sting is all it takes.", dialogueWin: "My venom... ineffective?", dialogueLose: "Paralyzed by fear." },
];

export function generateMap(length: number): MapNode[] {
    const map: MapNode[] = [];
    let bossCounter = 0;

    for (let i = 0; i < length; i++) {
        const node: MapNode = { id: i, type: 'standard' };

        if ((i + 1) % 10 === 0) {
            node.type = 'boss';
            // Use distinct boss based on index to ensure variety
            node.boss_details = BOSSES[bossCounter % BOSSES.length];
            bossCounter++;
        } else {
            const rand = Math.random();
            if (rand < 0.10) { // 10% chance for treasure
                node.type = 'treasure';
            } else if (rand < 0.30) { // 20% chance for key fragment (10% to 30%)
                node.type = 'key_fragment';
            }
        }
        map.push(node);
    }
    return map;
}

export const ADVENTURE_MAP: MapNode[] = generateMap(100);
