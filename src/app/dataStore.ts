
import { VocabularyItem, User, Unit, ParaphraseLog, WordQuality, ReviewGrade, Composition, WordBook, PlanningGoal } from './types';
import * as db from './db';
import { filterItem } from './db'; 
import { calculateMasteryScore, calculateComplexity } from '../utils/srs';
import { calculateGameEligibility } from '../utils/gameEligibility';
import { performAutoBackup } from '../services/backupService'; // Import
import { getConfig } from './settingsManager';

// --- Store State ---
let _isInitialized = false;
let _isInitializing = false; 
let _allWords = new Map<string, VocabularyItem>();
let _composedWordIds = new Set<string>(); // Fast lookup for 'composed' filter
let _bookWordIds = new Set<string>(); // Fast lookup for 'in book' filter
let _currentUserId: string | null = null; // Track user ID for backups

let _statsCache: any = {
    reviewCounts: { total: 0, due: 0, new: 0, learned: 0, mastered: 0, statusForgot: 0, statusHard: 0, statusEasy: 0, statusLearned: 0 },
    dashboardStats: { categories: { 'vocab': { total: 0, learned: 0 }, 'idiom': { total: 0, learned: 0 }, 'phrasal': { total: 0, learned: 0 }, 'colloc': { total: 0, learned: 0 }, 'phrase': { total: 0, learned: 0 }, 'preposition': { total: 0, learned: 0 }, 'pronun': { total: 0, learned: 0 } }, refinedCount: 0, rawCount: 0 },
    dayProgress: { learned: 0, reviewed: 0, learnedWords: [], reviewedWords: [] }
};

// --- Private Functions ---

function _updateLocalLastModified() {
    localStorage.setItem('vocab_pro_local_last_modified', String(Date.now()));
}

// Timers
let _backupTimeout: number | null = null; // Resets on every activity (Debounce)
let _maxWaitTimeout: number | null = null; // Does NOT reset on activity (Safety Net)

async function _executeBackup() {
    // Clear both timers to prevent double execution
    if (_backupTimeout) { clearTimeout(_backupTimeout); _backupTimeout = null; }
    if (_maxWaitTimeout) { clearTimeout(_maxWaitTimeout); _maxWaitTimeout = null; }

    try {
        // 1. Local Storage Backup
        const allItems = Array.from(_allWords.values());
        const json = JSON.stringify(allItems);
        localStorage.setItem('vocab_pro_emergency_backup', json);
        
        // 2. Server Auto Backup
        if (_currentUserId) {
            // Fetch full user object to ensure sync
            const user = (await db.getAllUsers()).find(u => u.id === _currentUserId);
            if (user) {
                    await performAutoBackup(_currentUserId, user);
            }
        }
    } catch (e) {
        console.warn("[DataStore] Backup failed:", e);
    }
}

function _triggerBackup() {
    const config = getConfig();
    const delay = (config.sync.autoBackupInterval || 60) * 1000;
    
    // Safety Net: Force backup after 5 minutes OR 3x the interval (whichever is larger)
    // This prevents continuous typing/updating from blocking backup forever.
    const maxDelay = Math.max(delay * 3, 300000); 

    // 1. Handle Debounce (Standard behavior: wait for idle)
    if (_backupTimeout) clearTimeout(_backupTimeout);
    
    // Notify UI that a backup is pending (targetTime is the optimistic idle time)
    const targetTime = Date.now() + delay;
    window.dispatchEvent(new CustomEvent('backup-scheduled', { detail: { targetTime } }));
    
    _backupTimeout = window.setTimeout(_executeBackup, delay);

    // 2. Handle Max Wait (Safety behavior: ensure execution eventually)
    // If a max timer is NOT running, start it. We do NOT clear/reset it here.
    if (!_maxWaitTimeout) {
        _maxWaitTimeout = window.setTimeout(() => {
            console.log("[DataStore] Max wait time reached. Forcing backup.");
            _executeBackup();
        }, maxDelay);
    }
}

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
            if (w.lastGrade === ReviewGrade.FORGOT) {
                todayReviewedWords.push(w);
            }
            // FIX: Only count as "Learned" if it's the first success (cc=1) AND it wasn't Hard.
            // If it was Hard, it implies struggle, so we count it as Reviewed.
            else if (w.consecutiveCorrect === 1 && w.lastGrade !== ReviewGrade.HARD) {
                todayLearnedWords.push(w);
            } 
            else {
                todayReviewedWords.push(w);
            }
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

// --- Listen for external triggers (like Settings save) ---
if (typeof window !== 'undefined') {
    window.addEventListener('vocab-pro-trigger-backup', () => {
        if (_isInitialized) {
            _notifyChanges(); // Update UI to show 'unsaved' state immediately
            _triggerBackup(); // Schedule the backup
        }
    });
}

// --- Public API ---

export async function init(userId: string) {
    if (_isInitialized || _isInitializing) return;
    _isInitializing = true;
    _currentUserId = userId; // Store ID
    console.log("DataStore: Initializing...");

    try {
        let words = await db.getAllWordsForExport(userId);
        
        // --- AUTO-RESTORE CHECK ---
        // If DB returns 0 words, check Emergency Backup
        if (words.length === 0) {
             const backupJson = localStorage.getItem('vocab_pro_emergency_backup');
             if (backupJson) {
                 try {
                     console.log("[DataStore] DB empty. Found backup in LocalStorage. Attempting auto-restore...");
                     const backupWords = JSON.parse(backupJson);
                     if (Array.isArray(backupWords) && backupWords.length > 0) {
                         // Restore to DB
                         await db.bulkSaveWords(backupWords);
                         // Re-fetch
                         words = await db.getAllWordsForExport(userId);
                         console.log(`[DataStore] Auto-restored ${words.length} items from backup.`);
                     }
                 } catch (e) {
                     console.error("[DataStore] Failed to restore from emergency backup:", e);
                 }
             }
        }
        
        const [compositions, books] = await Promise.all([
            db.getCompositionsByUserId(userId),
            db.getWordBooksByUserId(userId)
        ]);

        // --- Build Inverted Index for Composition Usage ---
        _composedWordIds.clear();
        compositions.forEach(comp => {
            (comp.linkedWordIds || []).forEach(wordId => _composedWordIds.add(wordId));
        });

        // --- Build Inverted Index for Word Book Membership ---
        _bookWordIds.clear();
        books.forEach(book => {
            (book.words || []).forEach(item => _bookWordIds.add(item.word.toLowerCase()));
        });
        
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
        console.log(`DataStore: Ready. Loaded ${_allWords.size} items, indexed ${_composedWordIds.size} composed and ${_bookWordIds.size} book words.`);
    } catch (error) {
        console.error("DataStore initialization failed:", error);
        _isInitialized = false; 
    } finally {
        _isInitializing = false;
    }
}

/**
 * Force re-initializes the data store from the database.
 * Call this after bulk import/restore operations to ensure the UI reflects new data.
 */
export async function forceReload(userId: string) {
    console.log("DataStore: Forcing reload from DB...");
    _isInitialized = false;
    _isInitializing = false;
    _allWords.clear();
    _composedWordIds.clear();
    _bookWordIds.clear();
    await init(userId);
    _notifyChanges();
}

/**
 * Destructive wipe of ALL local data. 
 * Clears database and in-memory caches.
 * Preserves ONLY the system config (server connection info).
 */
export async function wipeAllLocalData() {
    console.warn("DataStore: Wiping all local data...");
    
    // 1. Clear In-Memory Cache
    _allWords.clear();
    _composedWordIds.clear();
    _bookWordIds.clear();
    _isInitialized = false;
    _currentUserId = null;
    
    // 2. Clear Database
    await db.clearVocabularyOnly();
    
    // 3. Clear relevant LocalStorage keys (Identity, History, Session)
    const preserveKeys = ['vocab_pro_system_config', 'gemini_api_keys'];
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !preserveKeys.includes(key)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    // Clear session storage too
    sessionStorage.clear();
    
    console.log("DataStore: Wipe complete.");
}

/**
 * Triggers a rebuild of the composition index. 
 * Should be called whenever a composition is added, updated, or deleted.
 */
export async function notifyCompositionChange(userId: string) {
    try {
        const compositions = await db.getCompositionsByUserId(userId);
        _composedWordIds.clear();
        compositions.forEach(comp => {
            (comp.linkedWordIds || []).forEach(wordId => _composedWordIds.add(wordId));
        });
        _notifyChanges(); 
    } catch (e) {
        console.error("Failed to refresh composition index", e);
    }
}

/**
 * Triggers a rebuild of the Word Book index.
 */
export async function notifyWordBookChange(userId: string) {
    try {
        const books = await db.getWordBooksByUserId(userId);
        _bookWordIds.clear();
        books.forEach(book => {
            (book.words || []).forEach(item => _bookWordIds.add(item.word.toLowerCase()));
        });
        _notifyChanges();
    } catch (e) {
        console.error("Failed to refresh word book index", e);
    }
}

export function isWordComposed(id: string): boolean {
    return _composedWordIds.has(id);
}

export function isWordInBook(wordText: string): boolean {
    return _bookWordIds.has(wordText.toLowerCase());
}

export function getComposedWordIds(): Set<string> {
    return _composedWordIds;
}

export function getBookWordIds(): Set<string> {
    return _bookWordIds;
}

export function getStats() { return _statsCache; }
export function getAllWords(): VocabularyItem[] { return Array.from(_allWords.values()); }
export function getWordById(id: string): VocabularyItem | undefined { return _allWords.get(id); }

export function getWordsPaged(
    userId: string, 
    page: number, 
    pageSize: number, 
    query = '', 
    filterTypes = ['all'], 
    refinedFilter: 'all' | 'raw' | 'refined' | 'verified' | 'failed' | 'not_refined' = 'all', 
    statusFilter = 'all', 
    registerFilter = 'all', 
    sourceFilter = 'all', 
    groupFilter: string | null = null, 
    compositionFilter: 'all' | 'composed' | 'not_composed' = 'all',
    bookFilter: 'all' | 'in_book' | 'not_in_book' = 'all'
): { words: VocabularyItem[], totalCount: number } {
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
    
    const filtered = baseItems.filter(item => filterItem(
        item, 
        query, 
        otherFilterTypes, 
        refinedFilter, 
        statusFilter, 
        registerFilter, 
        sourceFilter, 
        groupFilter, 
        compositionFilter, 
        _composedWordIds,
        bookFilter,
        _bookWordIds
    ));
    
    if (filterTypes.includes('duplicate')) filtered.sort((a, b) => a.word.localeCompare(b.word) || a.createdAt - b.createdAt);
    else filtered.sort((a, b) => b.createdAt - a.createdAt); // Default sort
    
    const start = page * pageSize;
    return { words: filtered.slice(start, start + pageSize), totalCount: filtered.length };
}

export async function saveWordAndUser(word: VocabularyItem, user: User) {
    if (!canWrite()) return;
    _updateLocalLastModified();
    word.complexity = calculateComplexity(word);
    word.masteryScore = calculateMasteryScore(word);
    word.gameEligibility = calculateGameEligibility(word);
    await db.saveWordAndUser(word, user);
    _allWords.set(word.id, word);
    _recalculateStats(word.userId);
    _triggerBackup(); // Trigger backup
    _notifyChanges();
}

export async function saveWordAndUnit(word: VocabularyItem | null, unit: Unit) {
    if (!canWrite()) return;
    _updateLocalLastModified();
    if (word) {
        word.complexity = calculateComplexity(word);
        word.masteryScore = calculateMasteryScore(word);
        word.gameEligibility = calculateGameEligibility(word);
    }
    await db.saveWordAndUnit(word, unit);
    if (word) {
        _allWords.set(word.id, word);
        _triggerBackup(); // Trigger backup
    }
    _recalculateStats(unit.userId);
    _notifyChanges();
}

export async function saveWord(item: VocabularyItem) {
    if (!canWrite()) return;
    _updateLocalLastModified();
    item.complexity = calculateComplexity(item);
    item.masteryScore = calculateMasteryScore(item);
    item.gameEligibility = calculateGameEligibility(item);
    await db.saveWord(item);
    _allWords.set(item.id, item);
    _recalculateStats(item.userId);
    _triggerBackup(); // Trigger backup
    _notifyChanges();
}

export async function bulkSaveWords(items: VocabularyItem[]) {
    if (items.length === 0) return;
    _updateLocalLastModified();
    items.forEach(item => {
        item.complexity = calculateComplexity(item);
        item.masteryScore = calculateMasteryScore(item);
        item.gameEligibility = calculateGameEligibility(item);
    });
    await db.bulkSaveWords(items);
    items.forEach(item => _allWords.set(item.id, item));
    if (items[0]) _recalculateStats(items[0].userId);
    _triggerBackup(); // Trigger backup
    _notifyChanges();
}

export async function deleteWord(id: string) {
    const item = _allWords.get(id);
    if (!item || !canWrite()) return;
    _updateLocalLastModified();
    await db.deleteWordFromDB(id);
    _allWords.delete(id);
    _recalculateStats(item.userId);
    _triggerBackup(); // Trigger backup
    _notifyChanges();
}

export async function bulkDeleteWords(ids: string[]) {
    if (ids.length === 0) return;
    const item = _allWords.get(ids[0]);
    if (!item) return;
    _updateLocalLastModified();
    await db.bulkDeleteWords(ids);
    ids.forEach(id => _allWords.delete(id));
    _recalculateStats(item.userId);
    _triggerBackup(); // Trigger backup
    _notifyChanges();
}

export async function saveUser(user: User): Promise<void> { 
    if (canWrite()) {
         _updateLocalLastModified();
         await db.saveUser(user);
         _triggerBackup();
    }
}
export async function saveUnit(unit: Unit): Promise<void> { if (canWrite()) { _updateLocalLastModified(); await db.saveUnit(unit); _triggerBackup(); _notifyChanges(); } }

export async function saveComposition(comp: Composition): Promise<void> {
    if (canWrite()) {
        _updateLocalLastModified();
        await db.saveComposition(comp);
        await notifyCompositionChange(comp.userId);
        _triggerBackup();
    }
}

export async function deleteComposition(id: string, userId: string): Promise<void> {
    _updateLocalLastModified();
    await db.deleteComposition(id);
    await notifyCompositionChange(userId);
    _triggerBackup();
}

export async function saveWordBook(book: WordBook): Promise<void> {
    if (canWrite()) {
        _updateLocalLastModified();
        await db.saveWordBook(book);
        await notifyWordBookChange(book.userId);
        _triggerBackup();
    }
}

export async function bulkSaveWordBooks(books: WordBook[]) {
    if (books.length === 0 || !canWrite()) return;
    _updateLocalLastModified();
    await db.bulkSaveWordBooks(books);
    await notifyWordBookChange(books[0].userId);
    _triggerBackup();
    _notifyChanges();
}

export async function deleteWordBook(id: string, userId: string): Promise<void> {
    _updateLocalLastModified();
    await db.deleteWordBook(id, userId);
    await notifyWordBookChange(userId);
    _triggerBackup();
}

// --- Planning Feature Wrapper ---
export async function savePlanningGoal(goal: PlanningGoal): Promise<void> {
    if (canWrite()) {
        _updateLocalLastModified();
        await db.savePlanningGoal(goal);
        _triggerBackup();
        _notifyChanges();
    }
}

export async function deletePlanningGoal(id: string): Promise<void> {
    if (canWrite()) {
        _updateLocalLastModified();
        await db.deletePlanningGoal(id);
        _triggerBackup();
        _notifyChanges();
    }
}

export const { getAllUsers, deleteUnit, getUnitsByUserId, getUnitsContainingWord, bulkSaveUnits, saveParaphraseLog, getParaphraseLogs, bulkSaveParaphraseLogs, seedDatabaseIfEmpty, clearVocabularyOnly, findWordByText, getRandomMeanings, getCompositionsByUserId, getPlanningGoalsByUserId, bulkSavePlanningGoals } = db;
