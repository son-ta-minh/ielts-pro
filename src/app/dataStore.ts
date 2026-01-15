import { VocabularyItem, User, Unit, ParaphraseLog, WordQuality, ReviewGrade } from './types';
import * as db from './db';
import { filterItem } from './db'; // We can reuse the filter logic

// --- Store State ---
let _isInitialized = false;
let _allWords = new Map<string, VocabularyItem>();
let _statsCache: any = {};

// --- Private Functions ---

function _recalculateStats(userId: string) {
    const now = Date.now();
    const wordsArray = Array.from(_allWords.values());
    const activeWords = wordsArray.filter(w => !w.isPassive && w.userId === userId);

    const total = activeWords.length;
    // Strictly only verified words are due or considered "new" for learn sessions
    const due = activeWords.filter(w => w.lastReview && w.nextReview <= now && w.quality === WordQuality.VERIFIED).length;
    const newCount = activeWords.filter(w => !w.lastReview && w.quality === WordQuality.VERIFIED).length;
    const learned = activeWords.filter(w => !!w.lastReview).length;
    const refinedCount = activeWords.filter(w => w.quality === WordQuality.VERIFIED).length;

    const categories: Record<string, { total: number; learned: number }> = {
      'vocab': { total: 0, learned: 0 }, 'idiom': { total: 0, learned: 0 },
      'phrasal': { total: 0, learned: 0 }, 'colloc': { total: 0, learned: 0 },
      'phrase': { total: 0, learned: 0 }, 'preposition': { total: 0, learned: 0 },
      'pronun': { total: 0, learned: 0 },
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

    // New logic for daily progress
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todayLearnedWords: VocabularyItem[] = [];
    const todayReviewedWords: VocabularyItem[] = [];

    activeWords.forEach(w => {
        if (w.lastReview && w.lastReview >= todayTimestamp) {
            if (w.consecutiveCorrect === 1 && w.lastGrade !== ReviewGrade.FORGOT) {
                todayLearnedWords.push(w);
            } else {
                todayReviewedWords.push(w);
            }
        }
    });

    _statsCache = {
        reviewCounts: { total, due, new: newCount, learned },
        dashboardStats: { categories, refinedCount },
        dayProgress: {
            learned: todayLearnedWords.length,
            reviewed: todayReviewedWords.length,
            learnedWords: todayLearnedWords,
            reviewedWords: todayReviewedWords,
        }
    };
}

let _notifyTimeout: number | null = null;
function _notifyChanges() {
    if (_notifyTimeout) {
        clearTimeout(_notifyTimeout);
    }
    _notifyTimeout = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('datastore-updated'));
        _notifyTimeout = null;
    }, 100); // Debounce by 100ms
}

// --- Cooldown Logic ---
let _lastWriteTime = 0;
const WRITE_COOLDOWN_MS = 1000; // 1 second

const canWrite = (): boolean => {
    const now = Date.now();
    if (now - _lastWriteTime < WRITE_COOLDOWN_MS) {
        console.warn('Write operation throttled.');
        window.dispatchEvent(new CustomEvent('datastore-cooldown'));
        return false;
    }
    _lastWriteTime = now;
    return true;
};


// --- Public API ---

export async function init(userId: string) {
    if (_isInitialized) return;
    console.log("DataStore: Initializing...");
    const words = await db.getAllWordsForExport(userId);

    // --- MIGRATION LOGIC for 'register' field ---
    const wordsToMigrate: VocabularyItem[] = [];
    for (const word of words) {
        if (typeof word.register === 'undefined') {
            word.register = 'raw';
            wordsToMigrate.push(word);
        }
    }

    if (wordsToMigrate.length > 0) {
        console.log(`DataStore: Migrating ${wordsToMigrate.length} words to include 'register' field (defaulting to 'raw').`);
        await db.bulkSaveWords(wordsToMigrate);
        console.log(`DataStore: Migration complete.`);
    }
    // --- END MIGRATION LOGIC ---

    _allWords = new Map(words.map(w => [w.id, w]));
    _recalculateStats(userId);
    _isInitialized = true;
    console.log(`DataStore: Ready. Loaded ${_allWords.size} items.`);
}

export function getStats() {
    return _statsCache;
}

export function getAllWords(): VocabularyItem[] {
    return Array.from(_allWords.values());
}

export function getWordById(id: string): VocabularyItem | undefined {
    return _allWords.get(id);
}

export function getWordsPaged(
    userId: string,
    page: number,
    pageSize: number,
    query: string = '',
    filterTypes: string[] = ['all'],
    refinedFilter: 'all' | 'raw' | 'refined' | 'verified' | 'failed' | 'not_refined' = 'all',
    statusFilter: string = 'all',
    registerFilter: string = 'all',
    sourceFilter: string = 'all'
): { words: VocabularyItem[], totalCount: number } {
    const allItems = Array.from(_allWords.values()).filter(w => w.userId === userId);
    
    let baseItems = allItems;
    const hasDuplicateFilter = filterTypes.includes('duplicate');

    // Apply 'duplicate' filter as an initial AND condition if present
    if (hasDuplicateFilter) {
        const wordCounts = new Map<string, number>();
        allItems.forEach(item => {
            const key = item.word.toLowerCase().trim();
            wordCounts.set(key, (wordCounts.get(key) || 0) + 1);
        });

        const duplicateWords = new Set<string>();
        for (const [word, count] of wordCounts.entries()) {
            if (count > 1) {
                duplicateWords.add(word);
            }
        }
        baseItems = baseItems.filter(item => duplicateWords.has(item.word.toLowerCase().trim()));
    }
    
    // Pass other filters to the main filter function
    const otherFilterTypes = filterTypes.filter(t => t !== 'duplicate');
    const filtered = baseItems.filter(item => filterItem(item, query, otherFilterTypes, refinedFilter, statusFilter, registerFilter, sourceFilter));

    // Sort duplicates together
    if (hasDuplicateFilter) {
        filtered.sort((a, b) => a.word.localeCompare(b.word) || a.createdAt - b.createdAt);
    }

    const start = page * pageSize;
    return {
        words: filtered.slice(start, start + pageSize),
        totalCount: filtered.length
    };
}


// --- Write Operations ---

export async function saveWordAndUser(word: VocabularyItem, user: User) {
    if (!canWrite()) return;
    await db.saveWordAndUser(word, user);
    _allWords.set(word.id, word);
    // User state is handled by the calling hook, no need to manage here.
    _recalculateStats(word.userId);
    _notifyChanges();
}

export async function saveWord(item: VocabularyItem) {
    if (!canWrite()) return;
    await db.saveWord(item);
    _allWords.set(item.id, item);
    _recalculateStats(item.userId);
    _notifyChanges();
}

export async function bulkSaveWords(items: VocabularyItem[]) {
    if (items.length === 0) return;
    await db.bulkSaveWords(items);
    items.forEach(item => _allWords.set(item.id, item));
    if (items[0]) _recalculateStats(items[0].userId);
    _notifyChanges();
}

export async function deleteWord(id: string) {
    const item = _allWords.get(id);
    if (!item) return;
    if (!canWrite()) return;
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

export async function saveUser(user: User): Promise<void> {
    if (!canWrite()) return;
    await db.saveUser(user);
}

export async function saveUnit(unit: Unit): Promise<void> {
    if (!canWrite()) return;
    await db.saveUnit(unit);
    _notifyChanges();
}

// Re-export other db functions that are not related to vocabulary
export const {
    getAllUsers,
    deleteUnit,
    getUnitsByUserId,
    getUnitsContainingWord,
    bulkSaveUnits,
    saveParaphraseLog,
    getParaphraseLogs,
    bulkSaveParaphraseLogs,
    seedDatabaseIfEmpty,
    clearVocabularyOnly,
    findWordByText,
    getRandomMeanings,
} = db;