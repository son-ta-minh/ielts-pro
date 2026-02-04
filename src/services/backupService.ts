
import { generateJsonExport, processJsonImport } from '../utils/dataHandler';
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
    calendar: true
};

export const performAutoBackup = async (userId: string, user: User, force: boolean = false) => {
    const config = getConfig();
    if (!config.sync.autoBackupEnabled && !force) return;
    
    const serverUrl = getServerUrl(config);

    try {
        const payloadObj = await getFullExportData(userId, user);
        const payloadString = JSON.stringify(payloadObj);
        const sizeInMB = (new Blob([payloadString]).size / (1024 * 1024)).toFixed(2);
        
        const response = await fetch(`${serverUrl}/api/backup?userId=${encodeURIComponent(userId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadString 
        });

        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

        const newConfig = { ...config };
        newConfig.sync.lastSyncTime = Date.now();
        // Pass true to suppress backup trigger, avoiding a loop
        saveConfig(newConfig, true);
        
        // console.log(`[Backup] Auto-backup success (${sizeInMB} MB)`);
        window.dispatchEvent(new CustomEvent('backup-complete', { detail: { success: true, size: sizeInMB } }));
    } catch (e) {
        console.warn("[Backup] Upload failed:", e);
        window.dispatchEvent(new CustomEvent('backup-complete', { detail: { success: false } }));
    }
};

export const restoreFromServer = async (userId: string): Promise<boolean> => {
    console.log("[Backup] Attempting restore for:", userId);
    
    try {
        const config = getConfig();
        const serverUrl = getServerUrl(config);
        // Note: Server URL comes from LocalStorage, so it persists even if DB is lost.
        console.log(`[Backup] Connecting to: ${serverUrl}`);
        
        const targetUrl = `${serverUrl}/api/backup/${encodeURIComponent(userId)}?t=${Date.now()}`;

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            mode: 'cors'
        });
        
        if (!response.ok) {
            console.warn(`[Backup] Restore fetch failed: ${response.status}`);
            return false;
        }

        const blob = await response.blob();
        const file = new File([blob], "restore.json", { type: "application/json" });

        const result = await processJsonImport(file, userId, FULL_SCOPE);
        
        if (result.type === 'success') {
            console.log(`[Backup] Restore success. Reloading store...`);
            await dataStore.forceReload(userId);
            return true;
        }
        return false;

    } catch (e: any) {
        console.error("[Backup] Restore exception:", e);
        return false;
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
     const writingTopicsData = await db.getAllWritingTopicsForExport(userId);
     const writingLogsData = await db.getAllWritingLogsForExport(userId);
     const compositionsData = await db.getCompositionsByUserId(userId);
     const irregularVerbsData = await db.getIrregularVerbsByUserId(userId);
     const lessonsData = await db.getLessonsByUserId(userId);
     const comparisonGroupsData = await db.getComparisonGroupsByUserId(userId);
     const listeningItemsData = await db.getListeningItemsByUserId(userId);
     const wordBooksDataRaw = await db.getWordBooksByUserId(userId);
     const calendarEventsData = await db.getCalendarEventsByUserId(userId);
     
     const mimicQueueData = localStorage.getItem('vocab_pro_mimic_practice_queue');
     const customChapters = localStorage.getItem('vocab_pro_adventure_chapters');
     const customBadges = localStorage.getItem('vocab_pro_custom_badges');
     const readingShelves = localStorage.getItem('reading_books_shelves');
     const systemConfig = localStorage.getItem('vocab_pro_system_config');

     const shortWords = wordsData.map(w => _mapToShortKeys(w));
     const shortNative = nativeSpeakItemsDataRaw.map(w => _mapToShortKeys(w));
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
        compositions: compositionsData,
        mimicQueue: mimicQueueData ? JSON.parse(mimicQueueData) : [],
        wordBooks: shortBooks,
        ce: calendarEventsData,
        readingBooks: readingBooksData,
        adv: {
            ch: customChapters ? JSON.parse(customChapters) : null,
            b: customBadges ? JSON.parse(customBadges) : null
        },
        readingShelves: readingShelves ? JSON.parse(readingShelves) : null,
        settings: systemConfig ? JSON.parse(systemConfig) : null
     };
}
