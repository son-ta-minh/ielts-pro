
import { generateJsonExport, processJsonImport, ImportResult } from '../utils/dataHandler';
import { User, DataScope } from '../app/types';
import { getConfig, saveConfig, getServerUrl } from '../app/settingsManager';
import * as dataStore from '../app/dataStore';
import { _mapToShortKeys } from '../utils/dataHandler';
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
    calendar: true,
    planning: true
};

export const performAutoBackup = async (userId: string, user: User, force: boolean = false) => {
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
        
        // console.log(`[Backup] Auto-backup success (${sizeInMB} MB)`);
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
    console.log("[Backup] Attempting restore for:", identifier);
    
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        // Note: Server URL comes from LocalStorage, so it persists even if DB is lost.
        console.log(`[Backup] Connecting to: ${serverUrl}`);
        
        // Use the generic identifier (can be username or userId)
        const targetUrl = `${serverUrl}/api/backup/${encodeURIComponent(identifier)}?t=${Date.now()}`;

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            mode: 'cors'
        });
        
        if (!response.ok) {
            console.warn(`[Backup] Restore fetch failed: ${response.status}`);
            return null;
        }

        const blob = await response.blob();
        const file = new File([blob], "restore.json", { type: "application/json" });

        // We temporarily pass 'identifier' as userId placeholder, but processJsonImport extracts real user ID from JSON
        const result = await processJsonImport(file, identifier, FULL_SCOPE);
        
        if (result.type === 'success' && result.updatedUser) {
            console.log(`[Backup] Restore success. Reloading store for user ${result.updatedUser.id}...`);
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
     const wordsData = await db.getAllWordsForExport(userId);
     const unitsData = await db.getUnitsByUserId(userId);
     const readingBooksData = await db.getReadingBooksByUserId(userId);
     const logsData = await db.getParaphraseLogs(userId);
     const speakingTopicsData = await db.getAllSpeakingTopicsForExport(userId);
     const speakingLogsData = await db.getAllSpeakingLogsForExport(userId);
     const nativeSpeakItemsDataRaw = await db.getNativeSpeakItemsByUserId(userId);
     const conversationItemsDataRaw = await db.getConversationItemsByUserId(userId);
     const writingTopicsData = await db.getAllWritingTopicsForExport(userId);
     const writingLogsData = await db.getAllWritingLogsForExport(userId);
     const compositionsData = await db.getCompositionsByUserId(userId);
     const irregularVerbsData = await db.getIrregularVerbsByUserId(userId);
     const lessonsData = await db.getLessonsByUserId(userId);
     const comparisonGroupsData = await db.getComparisonGroupsByUserId(userId);
     const listeningItemsData = await db.getListeningItemsByUserId(userId);
     const wordBooksDataRaw = await db.getWordBooksByUserId(userId);
     const calendarEventsData = await db.getCalendarEventsByUserId(userId);
     const planningGoalsData = await db.getPlanningGoalsByUserId(userId);
     
     const mimicQueueData = localStorage.getItem('vocab_pro_mimic_practice_queue');
     const customChapters = localStorage.getItem('vocab_pro_adventure_chapters');
     const customBadges = localStorage.getItem('vocab_pro_custom_badges');
     const readingShelves = localStorage.getItem('reading_books_shelves');
     const systemConfig = localStorage.getItem('vocab_pro_system_config');

     const shortWords = wordsData.map(w => _mapToShortKeys(w));
     const shortNative = nativeSpeakItemsDataRaw.map(w => _mapToShortKeys(w));
     const shortConversation = conversationItemsDataRaw.map(w => _mapToShortKeys(w));
     const shortBooks = wordBooksDataRaw.map(b => _mapToShortKeys(b));

     const comparisonLessons = comparisonGroupsData.map(cg => ({
        id: cg.id, userId: cg.userId, type: 'comparison', title: cg.name,
        description: `Comparison: ${cg.words.join(', ')}`, content: '',
        comparisonData: cg.comparisonData, words: cg.words, tags: cg.tags,
        createdAt: cg.createdAt, updatedAt: cg.updatedAt, topic1: '', topic2: ''
    }));

     return {
        v: 7,
        ca: new Date().toISOString(),
        user: user,
        vocab: shortWords,
        u: unitsData,
        pl: logsData,
        st: speakingTopicsData,
        sl: speakingLogsData,
        wt: writingTopicsData,
        wl: writingLogsData,
        iv: irregularVerbsData,
        lessons: [...lessonsData, ...comparisonLessons],
        listeningItems: listeningItemsData,
        nativeSpeakItems: shortNative,
        conversationItems: shortConversation,
        compositions: compositionsData,
        mimicQueue: mimicQueueData ? JSON.parse(mimicQueueData) : [],
        wordBooks: shortBooks,
        ce: calendarEventsData,
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
