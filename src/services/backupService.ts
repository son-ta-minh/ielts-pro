
import { processJsonImport, ImportResult, _mapToShortKeys, _mapUserToShortKeys } from '../utils/dataHandler';
import { User, DataScope, StudyItem, DailyStreakSnapshot } from '../app/types';
import { getConfig, saveConfig, getServerUrl } from '../app/settingsManager';
import * as dataStore from '../app/dataStore';
import * as db from '../app/db';
import { _mapToLongKeys } from '../utils/dataHandler';
import { readDailyStreaks } from '../utils/dailyStreaks';
import { getStoredJSON } from '../utils/storage';

const FOCUS_PERIOD_TIMERS_KEY = 'focus_period_timers';
const FOCUS_PERIOD_HISTORY_KEY = 'focus_period_history';
const countLibraryItems = (payload: any): number => {
    const vocabCount = Array.isArray(payload?.vocab) ? payload.vocab.length : (Array.isArray(payload?.vocabulary) ? payload.vocabulary.length : 0);
    const kotobaCount = Array.isArray(payload?.kotoba) ? payload.kotoba.length : 0;
    return vocabCount + kotobaCount;
};

// Scope for auto backup - usually everything
const FULL_SCOPE: DataScope = {
    user: true,
    vocabulary: true,
    lesson: true,
    reading: true,
    writing: true,
    speaking: true,
    listening: true,
    mimic: true,
    wordBook: true,
    planning: true
};

let _isSyncing = false;

const fetchExistingBackupWordCount = async (serverUrl: string, identifier: string): Promise<number | null> => {
    try {
        const res = await fetch(`${serverUrl}/api/backup/${encodeURIComponent(identifier)}?app=vocab&t=${Date.now()}`, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            signal: AbortSignal.timeout(12000)
        });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (!data || typeof data !== 'object') return null;
        return countLibraryItems(data);
    } catch {
        return null;
    }
};

export const performAutoBackup = async (
    userId: string,
    user: User,
    force: boolean = false,
    allowRiskOverwrite: boolean = false
) => {
    // CRITICAL SAFETY: Never backup if we are in restoration mode or already syncing
    if ((window as any).isRestoring || _isSyncing) {
        return;
    }

    const config = getConfig();
    if (!config.sync.autoBackupEnabled && !force) return;
    
    _isSyncing = true;
    const serverUrl = getServerUrl(config);

    try {
        const payloadObj = await getFullExportData(userId, user);
        const localWordCount = countLibraryItems(payloadObj);
        const identifier = user.name || userId;

        // Safety warning: large drop in vocab count vs existing server backup.
        if (force && identifier) {
            const serverWordCount = await fetchExistingBackupWordCount(serverUrl, identifier);
            const dangerThreshold = Math.max(300, Math.floor((serverWordCount || 0) * 0.3));
            if (
                serverWordCount !== null &&
                serverWordCount >= 1000 &&
                localWordCount > 0 &&
                localWordCount <= dangerThreshold
            ) {
                const riskDetail = {
                    identifier,
                    localWordCount,
                    serverWordCount
                };
                window.dispatchEvent(new CustomEvent('backup-risk-warning', { detail: riskDetail }));
                console.warn(`[Backup] Risk warning for ${identifier}: local=${localWordCount}, server=${serverWordCount}`);
                if (!allowRiskOverwrite) {
                    const err: any = new Error('Sync risk confirmation required');
                    err.code = 'SYNC_RISK_CONFIRM_REQUIRED';
                    err.detail = riskDetail;
                    throw err;
                }
            }
        }

        // Server sync/backup should stay compact to reduce transfer + storage size.
        const payloadString = JSON.stringify(payloadObj);
        const sizeInMB = (new Blob([payloadString]).size / (1024 * 1024)).toFixed(2);
        
        // Pass username as query param. Server logic prioritizes username for filename if present.
        const usernameParam = user.name ? `&username=${encodeURIComponent(user.name)}` : '';
        const response = await fetch(`${serverUrl}/api/backup?userId=${encodeURIComponent(userId)}${usernameParam}&app=vocab`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadString 
        });

        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

        const now = Date.now();
        const newConfig = { ...config };
        newConfig.sync.lastSyncTime = now;
        // Pass true to suppress backup trigger, avoiding a loop
        saveConfig(newConfig, true);
        
        // CRITICAL: When we successfully backup to server, the local "modified" state 
        // effectively matches the server's newest version.
        localStorage.setItem('vocab_pro_local_last_modified', String(now));
        
        window.dispatchEvent(new CustomEvent('backup-complete', { detail: { success: true, size: sizeInMB } }));
    } catch (e) {
        console.warn("[Backup] Upload failed:", e);
        window.dispatchEvent(new CustomEvent('backup-complete', { detail: { success: false } }));
        throw e;
    } finally {
        _isSyncing = false;
    }
};

export interface ServerBackupItem {
    id: string;
    name: string;
    size: number;
    date: string;
}

export interface ServerArchiveItem {
    id: string;
    name: string;
    size: number;
    date: string;
}

export const fetchServerBackups = async (): Promise<ServerBackupItem[]> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/backups?app=vocab`);
        if (response.ok) {
            const data = await response.json();
            return data.backups || [];
        }
        return [];
    } catch (e) {
        console.warn("[Backup] Failed to fetch list:", e);
        return [];
    }
};

export const fetchServerArchives = async (identifier: string): Promise<ServerArchiveItem[]> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/archives?app=vocab&identifier=${encodeURIComponent(identifier)}`);
        if (response.ok) {
            const data = await response.json();
            return data.archives || [];
        }
        return [];
    } catch (e) {
        console.warn('[Backup] Failed to fetch archives:', e);
        return [];
    }
};

export const createServerArchive = async (identifier: string): Promise<boolean> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/archive?app=vocab&identifier=${encodeURIComponent(identifier)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        return response.ok;
    } catch (e) {
        console.warn('[Backup] Failed to create archive:', e);
        return false;
    }
};

export const restoreArchiveOnServer = async (identifier: string, archiveId: string): Promise<boolean> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/archive/restore?app=vocab`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, archiveId })
        });
        return response.ok;
    } catch (e) {
        console.warn('[Backup] Failed to restore archive:', e);
        return false;
    }
};

export const deleteServerArchive = async (identifier: string, archiveId: string): Promise<boolean> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/archive?app=vocab&identifier=${encodeURIComponent(identifier)}&archiveId=${encodeURIComponent(archiveId)}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (e) {
        console.warn('[Backup] Failed to delete archive:', e);
        return false;
    }
};

export const restoreFromServer = async (identifier: string): Promise<ImportResult | null> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        // Note: Server URL comes from LocalStorage, so it persists even if DB is lost.
        
        // Use the generic identifier (can be username or userId)
        const targetUrl = `${serverUrl}/api/backup/${encodeURIComponent(identifier)}?t=${Date.now()}&app=vocab`;

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            mode: 'cors'
        });
        
        if (!response.ok) {
            return null;
        }

        const blob = await response.blob();
        const file = new File([blob], "restore.json", { type: "application/json" });

        // We temporarily pass 'identifier' as userId placeholder, but processJsonImport extracts real user ID from JSON
        const result = await processJsonImport(file, identifier, FULL_SCOPE);
        
        if (result.type === 'success' && result.updatedUser) {
            await dataStore.forceReload(result.updatedUser.id);
            return result;
        }
        return null;

    } catch (e: any) {
        console.error("[Backup] Restore exception:", e);
        return null;
    }
};

/**
 * Triggers the server to re-scan all backup files and rebuild the global dictionary.
 * Useful when User B wants to fetch data just uploaded by User A.
 */
export const refreshServerLibrary = async (): Promise<boolean> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        
        const response = await fetch(`${serverUrl}/api/library/reload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        return response.ok;
    } catch (e) {
        console.warn("[Backup] Failed to refresh server library:", e);
        return false;
    }
};

/**
 * Queries the Global Server Library for refined definitions.
 * @param words Array of words to look up
 * @returns Array of found StudyItem objects (with short keys expanded)
 */
export const lookupWordsInGlobalLibrary = async (words: string[]): Promise<StudyItem[]> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        
        const response = await fetch(`${serverUrl}/api/library/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words })
        });

        if (response.ok) {
            const data = await response.json();
            // Data comes back as short-key objects (stored in server memory). 
            // We need to expand them back to StudyItem using _mapToLongKeys
            if (Array.isArray(data.found)) {
                return data.found.map((item: any) => _mapToLongKeys(item) as StudyItem);
            }
        }
        return [];
    } catch (e) {
        console.warn("[Backup] Library lookup failed:", e);
        return [];
    }
};


async function getFullExportData(userId: string, user: User) {
     const [wordsData, unitsData, readingBooksData, logsData, speakingTopicsData, speakingLogsData, nativeSpeakItemsDataRaw, conversationItemsDataRaw, freeTalkItemsDataRaw, writingTopicsData, writingLogsData, compositionsData, irregularVerbsData, wordFamilyGroupsData, lessonsData, listeningItemsData, wordBooksDataRaw, planningGoalsData] = await Promise.all([
        db.getAllWordsForExport(userId),
        db.getUnitsByUserId(userId),
        db.getReadingBooksByUserId(userId),
        db.getParaphraseLogs(userId),
        db.getAllSpeakingTopicsForExport(userId),
        db.getAllSpeakingLogsForExport(userId),
        db.getNativeSpeakItemsByUserId(userId),
        db.getConversationItemsByUserId(userId),
        db.getFreeTalkItemsByUserId(userId),
        db.getAllWritingTopicsForExport(userId),
        db.getAllWritingLogsForExport(userId),
        db.getCompositionsByUserId(userId),
        db.getIrregularVerbsByUserId(userId),
        db.getWordFamilyGroupsByUserId(userId),
        db.getLessonsByUserId(userId),
        // getComparisonGroupsByUserId removed
        db.getListeningItemsByUserId(userId),
        db.getWordBooksByUserId(userId),
        // getCalendarEventsByUserId removed
        db.getPlanningGoalsByUserId(userId)
     ]);

    const mimicQueueData = localStorage.getItem('vocab_pro_mimic_practice_queue');
    const customChapters = localStorage.getItem('vocab_pro_adventure_chapters');
    const customBadges = localStorage.getItem('vocab_pro_custom_badges');
    const readingShelves = localStorage.getItem('reading_books_shelves');
    const systemConfig = localStorage.getItem('vocab_pro_system_config');
    const dailyStreaks = readDailyStreaks(userId);
    const focusTimersData = localStorage.getItem(FOCUS_PERIOD_TIMERS_KEY);
    const focusHistoryData = localStorage.getItem(FOCUS_PERIOD_HISTORY_KEY);

     return {
        v: 8,
        ca: new Date().toISOString(),
        user: _mapUserToShortKeys(user), // Consistent shortening using the specific user mapper
        vocab: wordsData.filter(w => (w.libraryType || 'vocab') === 'vocab').map(w => _mapToShortKeys(w)),
        kotoba: wordsData.filter(w => w.libraryType === 'kotoba').map(w => _mapToShortKeys(w)),
        u: unitsData,
        pl: logsData,
        st: speakingTopicsData,
        sl: speakingLogsData,
        wt: writingTopicsData,
        wl: writingLogsData,
        iv: irregularVerbsData,
        wfg: wordFamilyGroupsData,
        lessons: lessonsData,
        listeningItems: listeningItemsData,
        nativeSpeakItems: nativeSpeakItemsDataRaw.map(w => _mapToShortKeys(w)),
        conversationItems: conversationItemsDataRaw.map(w => _mapToShortKeys(w)),
        freeTalkItems: freeTalkItemsDataRaw.map(w => _mapToShortKeys(w)),
        compositions: compositionsData,
        mimicQueue: mimicQueueData ? JSON.parse(mimicQueueData) : [],
        wordBooks: wordBooksDataRaw.map(b => _mapToShortKeys(b)),
        // ce (calendar events) removed
        readingBooks: readingBooksData,
        pg: planningGoalsData,
        adv: {
            ch: customChapters ? JSON.parse(customChapters) : null,
            b: customBadges ? JSON.parse(customBadges) : null
        },
        readingShelves: readingShelves ? JSON.parse(readingShelves) : null,
        settings: systemConfig ? JSON.parse(systemConfig) : null,
        ds: dailyStreaks,
        focusTimers: focusTimersData ? JSON.parse(focusTimersData) : [],
        focusHistory: focusHistoryData ? JSON.parse(focusHistoryData) : []
     };
}
