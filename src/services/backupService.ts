
import { generateJsonExport, processJsonImport, ImportResult, _mapToShortKeys, _mapUserToShortKeys } from '../utils/dataHandler';
import { User, DataScope } from '../app/types';
import { getConfig, saveConfig, getServerUrl } from '../app/settingsManager';
import * as dataStore from '../app/dataStore';
import * as db from '../app/db';

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

export const performAutoBackup = async (userId: string, user: User, force: boolean = false) => {
    // CRITICAL SAFETY: Never backup if we are in restoration mode
    if ((window as any).isRestoring) {
        return;
    }

    const config = getConfig();
    if (!config.sync.autoBackupEnabled && !force) return;
    
    const serverUrl = getServerUrl(config);

    try {
        const payloadObj = await getFullExportData(userId, user);
        const payloadString = JSON.stringify(payloadObj);
        const sizeInMB = (new Blob([payloadString]).size / (1024 * 1024)).toFixed(2);
        
        // Pass username as query param. Server logic prioritizes username for filename if present.
        const usernameParam = user.name ? `&username=${encodeURIComponent(user.name)}` : '';
        const response = await fetch(`${serverUrl}/api/backup?userId=${encodeURIComponent(userId)}${usernameParam}`, {
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
    }
};

export interface ServerBackupItem {
    id: string;
    name: string;
    size: number;
    date: string;
}

export const fetchServerBackups = async (): Promise<ServerBackupItem[]> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        const response = await fetch(`${serverUrl}/api/backups`);
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

export const restoreFromServer = async (identifier: string): Promise<ImportResult | null> => {
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        // Note: Server URL comes from LocalStorage, so it persists even if DB is lost.
        
        // Use the generic identifier (can be username or userId)
        const targetUrl = `${serverUrl}/api/backup/${encodeURIComponent(identifier)}?t=${Date.now()}`;

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

async function getFullExportData(userId: string, user: User) {
     const [wordsData, unitsData, readingBooksData, logsData, speakingTopicsData, speakingLogsData, nativeSpeakItemsDataRaw, conversationItemsDataRaw, writingTopicsData, writingLogsData, compositionsData, irregularVerbsData, lessonsData, listeningItemsData, wordBooksDataRaw, planningGoalsData] = await Promise.all([
        db.getAllWordsForExport(userId),
        db.getUnitsByUserId(userId),
        db.getReadingBooksByUserId(userId),
        db.getParaphraseLogs(userId),
        db.getAllSpeakingTopicsForExport(userId),
        db.getAllSpeakingLogsForExport(userId),
        db.getNativeSpeakItemsByUserId(userId),
        db.getConversationItemsByUserId(userId),
        db.getAllWritingTopicsForExport(userId),
        db.getAllWritingLogsForExport(userId),
        db.getCompositionsByUserId(userId),
        db.getIrregularVerbsByUserId(userId),
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

     return {
        v: 8,
        ca: new Date().toISOString(),
        user: _mapUserToShortKeys(user), // Consistent shortening using the specific user mapper
        vocab: wordsData.map(w => _mapToShortKeys(w)),
        u: unitsData,
        pl: logsData,
        st: speakingTopicsData,
        sl: speakingLogsData,
        wt: writingTopicsData,
        wl: writingLogsData,
        iv: irregularVerbsData,
        lessons: lessonsData,
        listeningItems: listeningItemsData,
        nativeSpeakItems: nativeSpeakItemsDataRaw.map(w => _mapToShortKeys(w)),
        conversationItems: conversationItemsDataRaw.map(w => _mapToShortKeys(w)),
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
        settings: systemConfig ? JSON.parse(systemConfig) : null
     };
}
