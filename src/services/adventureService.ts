
import { AdventureChapter, AdventureBadge, ADVENTURE_CHAPTERS, BADGES } from '../data/adventure_content';
import { getStoredJSON, setStoredJSON } from '../utils/storage';

const CHAPTERS_KEY = 'vocab_pro_adventure_chapters';
const BADGES_KEY = 'vocab_pro_custom_badges';

export function getChapters(): AdventureChapter[] {
    return getStoredJSON<AdventureChapter[]>(CHAPTERS_KEY, ADVENTURE_CHAPTERS);
}

export function saveChapters(chapters: AdventureChapter[]): void {
    setStoredJSON(CHAPTERS_KEY, chapters);
}

export function getCustomBadges(): Record<string, AdventureBadge> {
    return getStoredJSON<Record<string, AdventureBadge>>(BADGES_KEY, {});
}

export function saveCustomBadges(badges: Record<string, AdventureBadge>): void {
    setStoredJSON(BADGES_KEY, badges);
}

export function getAllBadges(): Record<string, AdventureBadge> {
    const custom = getCustomBadges();
    return { ...BADGES, ...custom };
}

export function deleteChapter(chapterId: string): AdventureChapter[] {
    const chapters = getChapters();
    const newChapters = chapters.filter(c => c.id !== chapterId);
    saveChapters(newChapters);
    return newChapters;
}

export function deleteSegment(chapterId: string, segmentId: string): AdventureChapter[] {
    const chapters = getChapters();
    const newChapters = chapters.map(c => 
        c.id === chapterId 
        ? { ...c, segments: c.segments.filter(s => s.id !== segmentId) } 
        : c
    );
    saveChapters(newChapters);
    return newChapters;
}
