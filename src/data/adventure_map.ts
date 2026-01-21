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

const BOSSES = [
    { name: 'Grammar Guardian', image: '🤖', hp: 20, dialogueIntro: "Prove your mastery!", dialogueWin: "Well done, scholar.", dialogueLose: "Return when you are stronger." },
    { name: 'Lexical Leviathan', image: '🦑', hp: 20, dialogueIntro: "Your words are but whispers.", dialogueWin: "A worthy lexicon.", dialogueLose: "Your vocabulary fails you." },
    { name: 'Syntax Serpent', image: '🐍', hp: 20, dialogueIntro: "Untangle my sentences if you can.", dialogueWin: "Your logic is impeccable.", dialogueLose: "Your structure is flawed." },
    { name: 'Fluency Fiend', image: '👻', hp: 20, dialogueIntro: "Speak without hesitation.", dialogueWin: "You are eloquent.", dialogueLose: "You stumble over your words." },
    { name: 'Pronunciation Phantom', image: '🗣️', hp: 20, dialogueIntro: "Clarity is key.", dialogueWin: "Every syllable is perfect.", dialogueLose: "Mumbling will not suffice." },
    { name: 'Collocation Colossus', image: '🗿', hp: 20, dialogueIntro: "Words belong together. Do you know which?", dialogueWin: "You understand the bonds between words.", dialogueLose: "Your phrasing is unnatural." },
    { name: 'Idiom Imp', image: '😈', hp: 20, dialogueIntro: "Think outside the literal box.", dialogueWin: "You speak like a native.", dialogueLose: "You are too literal." },
    { name: 'Cohesion Chimera', image: '🦁', hp: 20, dialogueIntro: "Connect your ideas, or be lost.", dialogueWin: "Your arguments flow like a river.", dialogueLose: "Your thoughts are disjointed." },
];

export function generateMap(length: number): MapNode[] {
    const map: MapNode[] = [];
    let bossCounter = 0;

    for (let i = 0; i < length; i++) {
        const node: MapNode = { id: i, type: 'standard' };

        if ((i + 1) % 10 === 0) {
            node.type = 'boss';
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