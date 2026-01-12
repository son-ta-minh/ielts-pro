
export interface AdventureBadge {
    id: string;
    name: string;
    icon: string;
    description: string;
    color: string;
}

export interface AdventureBoss {
    name: string;
    hp: number;
    dialogueIntro: string;
    dialogueWin: string;
    dialogueLose: string;
    image: string;
    dropBadgeId: string;
}

export interface AdventureSegment {
    id: string;
    title: string;
    description: string;
    tagCriteria: string;
    basicWords: string[];
    intermediateWords: string[];
    advancedWords: string[];
    boss: AdventureBoss;
    visualIcon: string;
    image?: string; // To store base64 encoded SVG
}

export interface AdventureChapter {
    id: string;
    title: string;
    description: string;
    segments: AdventureSegment[];
    backgroundTheme: string;
    icon: string;
}

export const BADGES: Record<string, AdventureBadge> = {
    'family_crest': { id: 'family_crest', name: 'Kinship Crest', icon: '🏡', description: 'Mastered the vocabulary of Family & Relationships.', color: 'bg-orange-100 text-orange-700' },
    'education_scroll': { id: 'education_scroll', name: 'Scholar\'s Scroll', icon: '📜', description: 'Expert in the language of Education.', color: 'bg-yellow-100 text-yellow-700' },
    'work_briefcase': { id: 'work_briefcase', name: 'Executive Briefcase', icon: '💼', description: 'Dominated the vocabulary of Work & Business.', color: 'bg-blue-100 text-blue-700' },
};

export const ADVENTURE_CHAPTERS: AdventureChapter[] = [
    {
        id: 'topic_family',
        title: 'Family & Roots',
        description: 'Relationships, upbringing, and the foundations of society.',
        backgroundTheme: 'from-orange-100 to-rose-50',
        icon: '👨‍👩‍👧',
        segments: [
            { 
                id: 'seg_fam_1', 
                title: 'Family Ties', 
                description: 'The core units of human connection.', 
                tagCriteria: 'family',
                basicWords: ['mother', 'father', 'brother', 'sister', 'child'],
                intermediateWords: ['upbringing', 'nuclear family', 'sibling', 'guardian', 'relative'],
                advancedWords: ['genealogy', 'consanguinity', 'authoritarian', 'matriarch', 'progeny'],
                visualIcon: '👨‍👩‍👧‍👦', 
                boss: { name: 'Family Elder', hp: 4, dialogueIntro: "Do you truly know those you share your blood with?", dialogueWin: "The bonds of kinship are well understood.", dialogueLose: "You ignore your foundations.", image: '👴', dropBadgeId: 'family_crest' }
            },
            { 
                id: 'seg_fam_2', 
                title: 'Modern Society', 
                description: 'How we live together in the 21st century.', 
                tagCriteria: 'society',
                basicWords: ['people', 'city', 'house', 'friend', 'neighbor'],
                intermediateWords: ['community', 'urbanization', 'demographics', 'infrastructure', 'diversity'],
                advancedWords: ['egalitarian', 'stratification', 'cosmopolitan', 'secular', 'socioeconomic'],
                visualIcon: '🏘️', 
                boss: { name: 'The Architect', hp: 5, dialogueIntro: "A city is more than stone and mortar. It is a collective mind.", dialogueWin: "You see the patterns in the crowd.", dialogueLose: "Lost in the concrete jungle.", image: '🏙️', dropBadgeId: 'family_crest' }
            },
        ]
    },
    {
        id: 'topic_education',
        title: 'The Academy',
        description: 'Learning systems, pedagogy, and academic pursuits.',
        backgroundTheme: 'from-yellow-100 to-amber-50',
        icon: '📚',
        segments: [
            { 
                id: 'seg_edu_1', 
                title: 'Primary School', 
                description: 'The beginning of the educational journey.', 
                tagCriteria: 'school',
                basicWords: ['study', 'learn', 'teacher', 'book', 'class'],
                intermediateWords: ['curriculum', 'assignment', 'literacy', 'discipline', 'tuition'],
                advancedWords: ['pedagogy', 'didactic', 'erudition', 'rote learning', 'epistemology'],
                visualIcon: '🏫', 
                boss: { name: 'The Headmaster', hp: 4, dialogueIntro: "Class is in session. Don't be late.", dialogueWin: "A star student indeed.", dialogueLose: "Detention for you.", image: '👨‍🏫', dropBadgeId: 'education_scroll' }
            },
            { 
                id: 'seg_edu_2', 
                title: 'Higher Education', 
                description: 'University life and specialized research.', 
                tagCriteria: 'university',
                basicWords: ['college', 'exam', 'paper', 'degree', 'lesson'],
                intermediateWords: ['undergraduate', 'scholarship', 'dissertation', 'vocational', 'faculty'],
                advancedWords: ['theoretical', 'specialization', 'prestigious', 'alumnus', 'doctoral'],
                visualIcon: '🎓', 
                boss: { name: 'The Dean', hp: 6, dialogueIntro: "Submit your thesis or fail the semester.", dialogueWin: "Your research is groundbreaking.", dialogueLose: "Insufficient evidence for your claims.", image: '👩‍🔬', dropBadgeId: 'education_scroll' }
            },
        ]
    }
];

export const CHAPTER_PROGRESSION: Record<string, string[]> = {
    'topic_family': ['topic_education'],
};