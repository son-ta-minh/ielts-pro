
import { VocabularyItem, User, Unit, ParaphraseLog, WordQuality, ReviewGrade } from './types';
import * as db from './db';
import { filterItem } from './db'; 
import { calculateMasteryScore, calculateComplexity } from '../utils/srs';
import { calculateGameEligibility } from '../utils/gameEligibility';

// --- Store State ---
let _isInitialized = false;
let _isInitializing = false; 
let _allWords = new Map<string, VocabularyItem>();
let _statsCache: any = {
    reviewCounts: { total: 0, due: 0, new: 0, learned: 0, mastered: 0, statusForgot: 0, statusHard: 0, statusEasy: 0, statusLearned: 0 },
    dashboardStats: { categories: { 'vocab': { total: 0, learned: 0 }, 'idiom': { total: 0, learned: 0 }, 'phrasal': { total: 0, learned: 0 }, 'colloc': { total: 0, learned: 0 }, 'phrase': { total: 0, learned: 0 }, 'preposition': { total: 0, learned: 0 }, 'pronun': { total: 0, learned: 0 } }, refinedCount: 0, rawCount: 0 },
    dayProgress: { learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] }
};

// --- Private Functions ---

function _recalculateStats(userId: string) {
    const now = Date.now();
    const wordsArray = Array.from(_allWords.values());
    const activeWords = wordsArray.filter(w => !w.isPassive && w.userId === userId);

    const total = activeWords.length;
    
    // Due: Matches DB logic (Learned = has history, not failed). Allows reviewing raw words if they were learned before.
    const due = activeWords.filter(w => w.lastReview && w.nextReview <= now && w.quality !== WordQuality.FAILED).length;
    
    // New: STRICTLY requires VERIFIED quality.
    const newCount = activeWords.filter(w => !w.lastReview && w.quality === WordQuality.VERIFIED).length;
    
    const masteredCount = activeWords.filter(w => w.interval > 21).length;
    const learningCount = total - newCount - masteredCount; 
    
    const learningWords = activeWords.filter(w => !!w.lastReview && w.interval <= 21);
    const calculatedLearningCount = learningWords.length;

    const statusForgot = learningWords.filter(w => w.lastGrade === ReviewGrade.FORGOT).length;
    const statusHard = learningWords.filter(w => w.lastGrade === ReviewGrade.HARD).length;
    const statusEasy = learningWords.filter(w => w.lastGrade === ReviewGrade.EASY).length;
    const statusLearned = learningWords.filter(w => w.lastGrade === ReviewGrade.LEARNED).length;

    const refinedCount = activeWords.filter(w => w.quality === WordQuality.REFINED).length;
    const rawCount = activeWords.filter(w => w.quality === WordQuality.RAW).length;

    const categories: Record<string, { total: number; learned: number }> = {
      'vocab': { total: 0, learned: 0 }, 'idiom': { total: 0, learned: 0 }, 'phrasal': { total: 0, learned: 0 }, 'colloc': { total: 0, learned: 0 }, 'phrase': { total: 0, learned: 0 }, 'preposition': { total: 0, learned: 0 }, 'pronun': { total: 0, learned: 0 },
    };

    activeWords.forEach(w => {
        const isLearned = !!w.lastReview;
        const inc = (key: string) => { categories[key].total++; if (isLearned) categories[key].learned++; };
        if (w.isIdiom) inc('idiom');
        if (w.isPhrasalVerb) inc('phrasal');
        if (w.isCollocation) inc('colloc');
        if (w.isStandardPhrase) inc('phrase');
        if (w.needsPronunciationFocus) inc('pronun');
        if (w.prepositions && w.prepositions.length > 0 && !w.isPhrasalVerb) inc('preposition');
        if (!w.isIdiom && !w.isPhrasalVerb && !w.isCollocation && !w.isStandardPhrase) inc('vocab');
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const todayLearnedWords: VocabularyItem[] = [];
    const todayReviewedWords: VocabularyItem[] = [];

    activeWords.forEach(w => {
        // Exclude reviews from boss battles from daily stats to prevent energy farming
        if (w.lastReview && w.lastReview >= todayTimestamp && w.lastReviewSessionType !== 'boss_battle') {
            if (w.lastGrade === ReviewGrade.FORGOT) todayReviewedWords.push(w);
            else if (w.consecutiveCorrect === 1) todayLearnedWords.push(w);
            else todayReviewedWords.push(w);
        }
    });

    _statsCache = {
        reviewCounts: { total, due, new: newCount, learned: calculatedLearningCount, mastered: masteredCount, statusForgot, statusHard, statusEasy, statusLearned },
        dashboardStats: { categories, refinedCount, rawCount },
        dayProgress: { learned: todayLearnedWords.length, reviewed: todayReviewedWords.length, learnedWords: todayLearnedWords, reviewedWords: todayReviewedWords }
    };
}

let _notifyTimeout: number | null = null;
function _notifyChanges() {
    if (_notifyTimeout) clearTimeout(_notifyTimeout);
    _notifyTimeout = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('datastore-updated'));
        _notifyTimeout = null;
    }, 100);
}

let _lastWriteTime = 0;
const canWrite = (): boolean => {
    const now = Date.now();
    if (now - _lastWriteTime < 1000) {
        window.dispatchEvent(new CustomEvent('datastore-cooldown'));
        return false;
    }
    _lastWriteTime = now;
    return true;
};

// --- Public API ---

export async function init(userId: string) {
    if (_isInitialized || _isInitializing) return;
    _isInitializing = true;
    console.log("DataStore: Initializing...");

    try {
        const words = await db.getAllWordsForExport(userId);
        const wordsToMigrate: VocabularyItem[] = [];
        
        for (const word of words) {
            let changed = false;
            
            // Recalculate everything to ensure UI is in sync with latest formulas
            const currentComplexity = calculateComplexity(word);
            const currentMastery = calculateMasteryScore(word);
            const currentGameEligibility = calculateGameEligibility(word);
            
            if (word.complexity !== currentComplexity) {
                word.complexity = currentComplexity;
                changed = true;
            }
            if (word.masteryScore !== currentMastery) {
                word.masteryScore = currentMastery;
                changed = true;
            }
            if (JSON.stringify(word.gameEligibility) !== JSON.stringify(currentGameEligibility)) {
                word.gameEligibility = currentGameEligibility;
                changed = true;
            }
            if (typeof word.register === 'undefined') {
                word.register = 'raw';
                changed = true;
            }

            if (changed) wordsToMigrate.push(word);
        }

        if (wordsToMigrate.length > 0) {
            console.log(`DataStore: Repairing Complexity/Mastery data for ${wordsToMigrate.length} words...`);
            await db.bulkSaveWords(wordsToMigrate);
        }

        _allWords = new Map(words.map(w => [w.id, w]));
        _recalculateStats(userId);
        _isInitialized = true;
        console.log(`DataStore: Ready. Loaded ${_allWords.size} items.`);
    } catch (error) {
        console.error("DataStore initialization failed:", error);
        _isInitialized = false; 
    } finally {
        _isInitializing = false;
    }
}

export function getStats() { return _statsCache; }
export function getAllWords(): VocabularyItem[] { return Array.from(_allWords.values()); }
export function getWordById(id: string): VocabularyItem | undefined { return _allWords.get(id); }

export function getWordsPaged(userId: string, page: number, pageSize: number, query = '', filterTypes = ['all'], refinedFilter: 'all' | 'raw' | 'refined' | 'verified' | 'failed' | 'not_refined' = 'all', statusFilter = 'all', registerFilter = 'all', sourceFilter = 'all'): { words: VocabularyItem[], totalCount: number } {
    const allItems = Array.from(_allWords.values()).filter(w => w.userId === userId);
    let baseItems = allItems;
    if (filterTypes.includes('duplicate')) {
        const wordCounts = new Map<string, number>();
        allItems.forEach(item => { const key = item.word.toLowerCase().trim(); wordCounts.set(key, (wordCounts.get(key) || 0) + 1); });
        const duplicateWords = new Set<string>();
        for (const [word, count] of wordCounts.entries()) if (count > 1) duplicateWords.add(word);
        baseItems = baseItems.filter(item => duplicateWords.has(item.word.toLowerCase().trim()));
    }
    const otherFilterTypes = filterTypes.filter(t => t !== 'duplicate');
    const filtered = baseItems.filter(item => filterItem(item, query, otherFilterTypes, refinedFilter, statusFilter, registerFilter, sourceFilter));
    if (filterTypes.includes('duplicate')) filtered.sort((a, b) => a.word.localeCompare(b.word) || a.createdAt - b.createdAt);
    const start = page * pageSize;
    return { words: filtered.slice(start, start + pageSize), totalCount: filtered.length };
}

export async function saveWordAndUser(word: VocabularyItem, user: User) {
    if (!canWrite()) return;
    word.complexity = calculateComplexity(word);
    word.masteryScore = calculateMasteryScore(word);
    word.gameEligibility = calculateGameEligibility(word);
    await db.saveWordAndUser(word, user);
    _allWords.set(word.id, word);
    _recalculateStats(word.userId);
    _notifyChanges();
}

export async function saveWord(item: VocabularyItem) {
    if (!canWrite()) return;
    item.complexity = calculateComplexity(item);
    item.masteryScore = calculateMasteryScore(item);
    item.gameEligibility = calculateGameEligibility(item);
    await db.saveWord(item);
    _allWords.set(item.id, item);
    _recalculateStats(item.userId);
    _notifyChanges();
}

export async function bulkSaveWords(items: VocabularyItem[]) {
    if (items.length === 0) return;
    items.forEach(item => {
        item.complexity = calculateComplexity(item);
        item.masteryScore = calculateMasteryScore(item);
        item.gameEligibility = calculateGameEligibility(item);
    });
    await db.bulkSaveWords(items);
    items.forEach(item => _allWords.set(item.id, item));
    if (items[0]) _recalculateStats(items[0].userId);
    _notifyChanges();
}

export async function deleteWord(id: string) {
    const item = _allWords.get(id);
    if (!item || !canWrite()) return;
    await db.deleteWordFromDB(id);
    _allWords.delete(id);
    _recalculateStats(item.userId);
    _notifyChanges();
}

export async function bulkDeleteWords(ids: string[]) {
    if (ids.length === 0) return;
    const item = _allWords.get(ids[0]);
    if (!item) return;
    await db.bulkDeleteWords(ids);
    ids.forEach(id => _allWords.delete(id));
    _recalculateStats(item.userId);
    _notifyChanges();
}

export async function saveUser(user: User): Promise<void> { if (canWrite()) await db.saveUser(user); }
export async function saveUnit(unit: Unit): Promise<void> { if (canWrite()) { await db.saveUnit(unit); _notifyChanges(); } }

export const { getAllUsers, deleteUnit, getUnitsByUserId, getUnitsContainingWord, bulkSaveUnits, saveParaphraseLog, getParaphraseLogs, bulkSaveParaphraseLogs, seedDatabaseIfEmpty, clearVocabularyOnly, findWordByText, getRandomMeanings } = db;
