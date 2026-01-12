import { VocabularyItem, Unit, ParaphraseLog, User, WordQuality, WordSource, SpeakingLog, SpeakingTopic, WritingTopic, WritingLog } from '../app/types';
import { getAllWordsForExport, bulkSaveWords, getUnitsByUserId, bulkSaveUnits, bulkSaveParaphraseLogs, getParaphraseLogs, saveUser, getAllSpeakingTopicsForExport, getAllSpeakingLogsForExport, bulkSaveSpeakingTopics, bulkSaveSpeakingLogs, getAllWritingTopicsForExport, getAllWritingLogsForExport, bulkSaveWritingTopics, bulkSaveWritingLogs } from '../app/db';
import { createNewWord, resetProgress } from './srs';

export interface ImportResult {
    type: 'success' | 'error';
    message: string;
    detail?: string;
    updatedUser?: User;
    customAdventureRestored?: boolean;
}

export const processJsonImport = async (
    file: File, 
    userId: string, 
    includeProgress: boolean
): Promise<ImportResult> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            console.log("JSON file loaded by FileReader. Starting parsing...");
            try {
                const rawJson = JSON.parse(ev.target?.result as string);
                console.log("JSON parsed successfully. Version:", rawJson.version);
                const incomingItems: Partial<VocabularyItem>[] = Array.isArray(rawJson) ? rawJson : (rawJson.vocabulary || []);
                const incomingUnits: Unit[] | undefined = rawJson.units;
                const incomingLogs: any[] | undefined = rawJson.paraphraseLogs;
                const incomingSpeakingTopics: SpeakingTopic[] | undefined = rawJson.speakingTopics;
                const incomingSpeakingLogs: SpeakingLog[] | undefined = rawJson.speakingLogs;
                const incomingWritingTopics: WritingTopic[] | undefined = rawJson.writingTopics;
                const incomingWritingLogs: WritingLog[] | undefined = rawJson.writingLogs;
                const incomingUser: User | undefined = rawJson.user;
                const incomingAdventure: any | undefined = rawJson.customAdventure;
                
                if (!Array.isArray(incomingItems)) {
                    console.error("Invalid JSON format: 'vocabulary' array not found.");
                    throw new Error("Invalid JSON format: 'vocabulary' array not found.");
                }
                
                console.log(`Found ${incomingItems.length} vocabulary items, ${incomingUnits?.length || 0} units, ${incomingLogs?.length || 0} logs to process.`);

                const localItems = await getAllWordsForExport(userId);
                const localItemsByWord = new Map(localItems.map(item => [item.word.toLowerCase().trim(), item]));
                const itemsToSave: VocabularyItem[] = []; 
                let newCount = 0, mergedCount = 0, skippedCount = 0;
                
                for (const incoming of incomingItems) {
                    if (!incoming.word) continue;
                    
                    const { userId: oldUserId, ...restOfIncoming } = incoming;
                    const local = localItemsByWord.get(incoming.word.toLowerCase().trim());
                    
                    if (local) {
                        if ((restOfIncoming.updatedAt || 0) > (local.updatedAt || 0)) {
                            const { source: _incomingSource, ...restOfIncomingWithoutSource } = restOfIncoming;
                            const merged = { ...local, ...restOfIncomingWithoutSource, id: local.id, userId: userId, updatedAt: Date.now() };
                            if (!includeProgress) Object.assign(merged, resetProgress(merged as VocabularyItem));
                            itemsToSave.push(merged as VocabularyItem); 
                            mergedCount++;
                        } else { 
                            skippedCount++; 
                        }
                    } else {
                        const now = Date.now();
                        const newId = restOfIncoming.id || 'id-' + now + '-' + Math.random().toString(36).substr(2, 9);
                        
                        // Handle legacy 'seed' source
                        const finalSource: WordSource = (restOfIncoming as any).source === 'seed' ? 'app' : 'manual';
                        
                        const newItem: VocabularyItem = {
                            id: newId,
                            userId: userId,
                            word: restOfIncoming.word!,
                            ipa: restOfIncoming.ipa || '',
                            meaningVi: restOfIncoming.meaningVi || '',
                            example: restOfIncoming.example || '',
                            note: restOfIncoming.note || '',
                            tags: restOfIncoming.tags || [],
                            groups: restOfIncoming.groups,
                            quality: restOfIncoming.quality || WordQuality.RAW,
                            register: restOfIncoming.register || 'raw',
                            source: finalSource,

                            // SRS data
                            nextReview: includeProgress ? (restOfIncoming.nextReview || now) : now,
                            interval: includeProgress ? (restOfIncoming.interval || 0) : 0,
                            easeFactor: includeProgress ? (restOfIncoming.easeFactor || 2.5) : 2.5,
                            consecutiveCorrect: includeProgress ? (restOfIncoming.consecutiveCorrect || 0) : 0,
                            lastReview: includeProgress ? restOfIncoming.lastReview : undefined,
                            lastGrade: includeProgress ? restOfIncoming.lastGrade : undefined,
                            forgotCount: includeProgress ? (restOfIncoming.forgotCount || 0) : 0,
                            
                            // Other fields from import
                            v2: restOfIncoming.v2,
                            v3: restOfIncoming.v3,
                            ipaMistakes: restOfIncoming.ipaMistakes,
                            collocations: restOfIncoming.collocations,
                            collocationsArray: restOfIncoming.collocationsArray,
                            idioms: restOfIncoming.idioms,
                            idiomsList: restOfIncoming.idiomsList,
                            wordFamily: restOfIncoming.wordFamily,
                            prepositions: restOfIncoming.prepositions,
                            paraphrases: restOfIncoming.paraphrases,
                            isIdiom: restOfIncoming.isIdiom || false,
                            isPhrasalVerb: restOfIncoming.isPhrasalVerb || false,
                            isCollocation: restOfIncoming.isCollocation || false,
                            isStandardPhrase: restOfIncoming.isStandardPhrase || false,
                            isIrregular: restOfIncoming.isIrregular || false,
                            needsPronunciationFocus: restOfIncoming.needsPronunciationFocus || false,
                            isExampleLocked: restOfIncoming.isExampleLocked || false,
                            isPassive: restOfIncoming.isPassive || false,
                            lastTestResults: includeProgress ? restOfIncoming.lastTestResults : undefined,
                            lastXpEarnedTime: includeProgress ? restOfIncoming.lastXpEarnedTime : undefined,
                            gameEligibility: restOfIncoming.gameEligibility,
                            
                            createdAt: restOfIncoming.createdAt || now,
                            updatedAt: now,
                        };
                        itemsToSave.push(newItem); 
                        newCount++;
                    }
                }
                
                console.log(`Word processing complete. New: ${newCount}, Merged: ${mergedCount}, Skipped: ${skippedCount}. Total to save: ${itemsToSave.length}.`);
                if (itemsToSave.length > 0) await bulkSaveWords(itemsToSave);
                
                if (incomingUnits && Array.isArray(incomingUnits)) { 
                    const unitsWithUser = incomingUnits.map(u => ({...u, userId: userId})); 
                    await bulkSaveUnits(unitsWithUser); 
                }
                if (incomingLogs && Array.isArray(incomingLogs)) { 
                    const logsWithUser = incomingLogs.map(l => ({...l, userId: userId})); 
                    await bulkSaveParaphraseLogs(logsWithUser); 
                }
                if (incomingSpeakingTopics && Array.isArray(incomingSpeakingTopics)) {
                    const topicsWithUser = incomingSpeakingTopics.map(t => ({...t, userId}));
                    await bulkSaveSpeakingTopics(topicsWithUser);
                }
                if (incomingSpeakingLogs && Array.isArray(incomingSpeakingLogs)) {
                    const logsWithUser = incomingSpeakingLogs.map(l => ({...l, userId}));
                    await bulkSaveSpeakingLogs(logsWithUser);
                }
                if (incomingWritingTopics && Array.isArray(incomingWritingTopics)) {
                    const topicsWithUser = incomingWritingTopics.map(t => ({...t, userId}));
                    await bulkSaveWritingTopics(topicsWithUser);
                }
                if (incomingWritingLogs && Array.isArray(incomingWritingLogs)) {
                    const logsWithUser = incomingWritingLogs.map(l => ({...l, userId}));
                    await bulkSaveWritingLogs(logsWithUser);
                }


                let updatedUser: User | undefined = undefined;
                if (includeProgress && incomingUser) {
                    const userToSave = { ...incomingUser, id: userId };
                    await saveUser(userToSave);
                    updatedUser = userToSave;
                }

                let customAdventureRestored = false;
                if (incomingAdventure) {
                    if (incomingAdventure.chapters) {
                        localStorage.setItem('vocab_pro_adventure_chapters', JSON.stringify(incomingAdventure.chapters));
                        customAdventureRestored = true;
                    }
                    if (incomingAdventure.badges) {
                        localStorage.setItem('vocab_pro_custom_badges', JSON.stringify(incomingAdventure.badges));
                        customAdventureRestored = true;
                    }
                }
                
                const successMessage = 'Restore data successfully';

                console.log("Import process finished successfully.");
                resolve({ 
                    type: 'success', 
                    message: successMessage,
                    detail: `Words: ${newCount} new, ${mergedCount} updated, ${skippedCount} skipped.`,
                    updatedUser,
                    customAdventureRestored
                });
            } catch(err: any) { 
                console.error("Error parsing JSON during import:", err);
                resolve({ type: 'error', message: "JSON Import Error", detail: err.message }); 
            } 
        };
        reader.onerror = () => {
            console.error("FileReader error on restore:", reader.error);
            resolve({ type: 'error', message: "File Read Error", detail: reader.error?.message || 'Could not read the file.' });
        };
        reader.readAsText(file);
    });
};

export const generateJsonExport = async (userId: string, includeProgress: boolean, includeEssays: boolean, currentUser: User) => {
    const [wordsData, unitsData, logsData, speakingTopicsData, speakingLogsData, writingTopicsData, writingLogsData] = await Promise.all([ 
        getAllWordsForExport(userId), 
        getUnitsByUserId(userId),
        getParaphraseLogs(userId),
        getAllSpeakingTopicsForExport(userId),
        getAllSpeakingLogsForExport(userId),
        getAllWritingTopicsForExport(userId),
        getAllWritingLogsForExport(userId),
    ]);
    
    const finalWordsData = includeProgress ? wordsData : wordsData.map(w => resetProgress(w));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const finalUnitsData = includeEssays ? unitsData : unitsData.map(({ essay, ...rest }) => rest);
    
    const customChapters = localStorage.getItem('vocab_pro_adventure_chapters');
    const customBadges = localStorage.getItem('vocab_pro_custom_badges');

    const exportObject = { 
        version: 5, 
        createdAt: new Date().toISOString(), 
        user: currentUser,
        vocabulary: finalWordsData, 
        units: finalUnitsData,
        paraphraseLogs: logsData,
        speakingTopics: speakingTopicsData,
        speakingLogs: speakingLogsData,
        writingTopics: writingTopicsData,
        writingLogs: writingLogsData,
        customAdventure: {
            chapters: customChapters ? JSON.parse(customChapters) : null,
            badges: customBadges ? JSON.parse(customBadges) : null
        }
    };
    
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `vocab-pro-backup-${new Date().toISOString().split('T')[0]}.json`; 
    a.click(); 
    URL.revokeObjectURL(url);
};

export const parseVocabMapping = (vocabString?: string): Map<string, string> => {
    const map = new Map<string, string>();
    if (!vocabString) return map;
    
    const entries = vocabString.split(/[;\n\r\t]+/).map(s => s.trim()).filter(Boolean);
    entries.forEach(entry => {
        const parts = entry.split(':').map(s => s.trim());
        const essayWord = parts[0]; 
        const baseWord = parts.length > 1 ? parts[1] : parts[0];
        
        if (essayWord && baseWord) { 
            const essayLower = essayWord.toLowerCase(); 
            const baseLower = baseWord.toLowerCase(); 
            map.set(essayLower, baseLower); 
            // Also map the base word to itself to ensure simple matches work too
            if (!map.has(baseLower)) map.set(baseLower, baseLower); 
        }
    });
    return map;
};