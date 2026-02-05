
import { 
    User, Unit, 
    DataScope 
} from '../app/types';
import * as db from '../app/db';

export interface ImportResult {
    type: 'success' | 'error' | 'info';
    message: string;
    detail?: string;
    updatedUser?: User;
    customAdventureRestored?: boolean;
    backupTimestamp?: number;
}

/**
 * Helper to map object keys to shorter versions for export if needed.
 * Currently set to identity (no minification) to ensure data integrity with full keys.
 */
export const _mapToShortKeys = (item: any): any => {
    return { ...item };
};

export const generateJsonExport = async (userId: string, user: User, scope: DataScope): Promise<void> => {
    const exportData: any = {
        v: 7, // Schema Version
        date: new Date().toISOString(),
        userId: userId
    };

    if (scope.user) {
        exportData.user = user;
        // Settings
        const settings = localStorage.getItem('vocab_pro_system_config');
        if (settings) exportData.settings = JSON.parse(settings);
        
        // Adventure Customization
        const chapters = localStorage.getItem('vocab_pro_adventure_chapters');
        const badges = localStorage.getItem('vocab_pro_custom_badges');
        if (chapters || badges) {
            exportData.adv = {
                ch: chapters ? JSON.parse(chapters) : null,
                b: badges ? JSON.parse(badges) : null
            };
        }
    }

    if (scope.vocabulary) exportData.vocab = await db.getAllWordsForExport(userId);
    
    if (scope.lesson) {
        exportData.lessons = await db.getLessonsByUserId(userId);
        exportData.comparisonGroups = await db.getComparisonGroupsByUserId(userId);
        exportData.lessonBooks = await db.getLessonBooksByUserId(userId);
        exportData.irregularVerbs = await db.getIrregularVerbsByUserId(userId);
    }
    
    if (scope.reading) {
        exportData.units = await db.getUnitsByUserId(userId);
        exportData.readingBooks = await db.getReadingBooksByUserId(userId);
    }
    
    if (scope.writing) {
        exportData.writingTopics = await db.getWritingTopicsByUserId(userId);
        exportData.writingLogs = await db.getWritingLogsByUserId(userId);
        exportData.compositions = await db.getCompositionsByUserId(userId);
        exportData.writingBooks = await db.getWritingBooksByUserId(userId);
    }
    
    if (scope.speaking) {
        exportData.speakingTopics = await db.getSpeakingTopicsByUserId(userId);
        exportData.speakingLogs = await db.getSpeakingLogsByUserId(userId);
        exportData.nativeSpeakItems = await db.getNativeSpeakItemsByUserId(userId);
        exportData.speakingBooks = await db.getSpeakingBooksByUserId(userId);
    }
    
    if (scope.listening) {
        exportData.listeningItems = await db.getListeningItemsByUserId(userId);
        exportData.listeningBooks = await db.getListeningBooksByUserId(userId);
    }
    
    if (scope.mimic) {
        const mimicQueue = localStorage.getItem('vocab_pro_mimic_practice_queue');
        if (mimicQueue) exportData.mimicQueue = JSON.parse(mimicQueue);
    }
    
    if (scope.wordBook) {
        exportData.wordBooks = await db.getWordBooksByUserId(userId);
    }
    
    if (scope.calendar) {
        exportData.calendarEvents = await db.getCalendarEventsByUserId(userId);
    }
    
    if (scope.planning) {
        exportData.planningGoals = await db.getPlanningGoalsByUserId(userId);
    }

    // Trigger Download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab_pro_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const exportUnitsToJson = async (units: Unit[], userId: string): Promise<void> => {
    const exportData = {
        v: 1,
        type: 'units_export',
        date: new Date().toISOString(),
        units
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab_pro_units_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const processJsonImport = (file: File, currentUserId: string, scope: DataScope = {
    user: true, vocabulary: true, lesson: true, reading: true, writing: true,
    speaking: true, listening: true, mimic: true, wordBook: true, calendar: true, planning: true
}): Promise<ImportResult> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) throw new Error("File is empty");
                const json = JSON.parse(text);

                // Initialize counters
                let newCount = 0;
                let mergedCount = 0;
                let skippedCount = 0;

                // User ID handling: prefer ID from file if importing user, else map to current
                const importedUserId = json.user?.id || json.userId;
                const targetUserId = scope.user && importedUserId ? importedUserId : currentUserId;
                
                let updatedUser: User | undefined;
                let backupTimestamp: number | undefined = json.date ? new Date(json.date).getTime() : undefined;

                // --- SCOPE: USER ---
                if (scope.user && json.user) {
                    updatedUser = { ...json.user, id: targetUserId };
                    await db.saveUser(updatedUser!);
                }

                // Helper to map items to the target User ID
                const mapId = (item: any) => ({ ...item, userId: targetUserId });

                // --- SCOPE: VOCABULARY ---
                if (scope.vocabulary) {
                    // Support both 'vocab' (standard) and 'vocabulary' (legacy) keys
                    const vocabItems = json.vocab || json.vocabulary;
                    if (Array.isArray(vocabItems)) {
                        const items = vocabItems.map(mapId);
                        await db.bulkSaveWords(items);
                        newCount += items.length;
                    }
                }

                // --- SCOPE: READING (Units & Books) ---
                if (scope.reading) {
                    if (json.u || json.units) {
                        const items = (json.u || json.units).map(mapId);
                        await db.bulkSaveUnits(items);
                    }
                    if (json.readingBooks) {
                        const items = json.readingBooks.map(mapId);
                        await db.bulkSaveReadingBooks(items);
                    }
                }

                // --- SCOPE: WRITING ---
                if (scope.writing) {
                    if (json.wt || json.writingTopics) await db.bulkSaveWritingTopics((json.wt || json.writingTopics).map(mapId));
                    if (json.wl || json.writingLogs) await db.bulkSaveWritingLogs((json.wl || json.writingLogs).map(mapId));
                    if (json.compositions) await db.bulkSaveCompositions(json.compositions.map(mapId));
                    if (json.writingBooks) await db.bulkSaveWritingBooks(json.writingBooks.map(mapId));
                }

                // --- SCOPE: SPEAKING ---
                if (scope.speaking) {
                    if (json.st || json.speakingTopics) await db.bulkSaveSpeakingTopics((json.st || json.speakingTopics).map(mapId));
                    if (json.sl || json.speakingLogs) await db.bulkSaveSpeakingLogs((json.sl || json.speakingLogs).map(mapId));
                    if (json.nativeSpeakItems) await db.bulkSaveNativeSpeakItems(json.nativeSpeakItems.map(mapId));
                    if (json.speakingBooks) await db.bulkSaveSpeakingBooks(json.speakingBooks.map(mapId));
                }

                // --- SCOPE: LESSON ---
                if (scope.lesson) {
                    if (json.lessons) await db.bulkSaveLessons(json.lessons.map(mapId));
                    if (json.comparisonGroups) await db.bulkSaveComparisonGroups(json.comparisonGroups.map(mapId));
                    if (json.lessonBooks) await db.bulkSaveLessonBooks(json.lessonBooks.map(mapId));
                    if (json.iv || json.irregularVerbs) await db.bulkSaveIrregularVerbs((json.iv || json.irregularVerbs).map(mapId));
                }

                // --- SCOPE: LISTENING ---
                if (scope.listening) {
                    if (json.listeningItems) await db.bulkSaveListeningItems(json.listeningItems.map(mapId));
                    if (json.listeningBooks) await db.bulkSaveListeningBooks(json.listeningBooks.map(mapId));
                }

                // --- SCOPE: WORD BOOK ---
                if (scope.wordBook && json.wordBooks) {
                    await db.bulkSaveWordBooks(json.wordBooks.map(mapId));
                }

                // --- SCOPE: CALENDAR ---
                if (scope.calendar && (json.ce || json.calendarEvents)) {
                    await db.bulkSaveCalendarEvents((json.ce || json.calendarEvents).map(mapId));
                }

                // --- SCOPE: PLANNING ---
                if (scope.planning && (json.pg || json.planningGoals)) {
                    await db.bulkSavePlanningGoals((json.pg || json.planningGoals).map(mapId));
                }

                // --- SCOPE: MIMIC ---
                if (scope.mimic && json.mimicQueue) {
                    localStorage.setItem('vocab_pro_mimic_practice_queue', JSON.stringify(json.mimicQueue));
                }

                // --- SCOPE: SETTINGS / ADVENTURE METADATA ---
                let customAdventureRestored = false;
                const incomingAdventure = json.adv || json.adventure; // support legacy key
                if (incomingAdventure && scope.user) {
                    const chapters = incomingAdventure.chapters || incomingAdventure.ch;
                    const badges = incomingAdventure.badges || incomingAdventure.b;
                    if (chapters) {
                        localStorage.setItem('vocab_pro_adventure_chapters', JSON.stringify(chapters));
                        customAdventureRestored = true;
                    }
                    if (badges) {
                        localStorage.setItem('vocab_pro_custom_badges', JSON.stringify(badges));
                        customAdventureRestored = true;
                    }
                }
                
                const incomingSettings = json.settings;
                if (scope.user && incomingSettings) {
                     // Preserve server connection if needed
                     const currentConfigStr = localStorage.getItem('vocab_pro_system_config');
                     if (currentConfigStr) {
                         try {
                             const currentConfig = JSON.parse(currentConfigStr);
                             if (currentConfig.server) {
                                 incomingSettings.server = {
                                     ...incomingSettings.server,
                                     ...currentConfig.server
                                 };
                             }
                         } catch (e) {
                             console.warn("[DataHandler] Failed to merge server settings", e);
                         }
                     }
                     localStorage.setItem('vocab_pro_system_config', JSON.stringify(incomingSettings));
                     window.dispatchEvent(new Event('config-updated'));
                }
                
                // Cleanup session state to force refresh
                sessionStorage.removeItem('vocab_pro_active_session');
                sessionStorage.removeItem('vocab_pro_session_progress');
                sessionStorage.removeItem('vocab_pro_session_outcomes');

                resolve({ 
                    type: 'success', 
                    message: "Restore successful",
                    detail: `Processed data for user ${targetUserId}`,
                    updatedUser,
                    customAdventureRestored,
                    backupTimestamp
                });

            } catch (err: any) {
                console.error(err);
                resolve({ type: 'error', message: "JSON Import Error", detail: err.message });
            }
        };
        reader.onerror = () => resolve({ type: 'error', message: "File Read Error" });
        reader.readAsText(file);
    });
};
