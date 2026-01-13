import { VocabularyItem, Unit, ParaphraseLog, User, WordQuality, WordSource, SpeakingLog, SpeakingTopic, WritingTopic, WritingLog, WordFamilyMember } from '../app/types';
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
            try {
                const rawJson = JSON.parse(ev.target?.result as string);
                const incomingItems: Partial<VocabularyItem & { ipaUs?: string, ipaUk?: string }>[] = Array.isArray(rawJson) ? rawJson : (rawJson.vocabulary || []);
                const incomingUnits: Unit[] | undefined = rawJson.units;
                const incomingLogs: any[] | undefined = rawJson.paraphraseLogs;
                const incomingSpeakingTopics: SpeakingTopic[] | undefined = rawJson.speakingTopics;
                const incomingSpeakingLogs: SpeakingLog[] | undefined = rawJson.speakingLogs;
                const incomingWritingTopics: WritingTopic[] | undefined = rawJson.writingTopics;
                const incomingWritingLogs: WritingLog[] | undefined = rawJson.writingLogs;
                const incomingUser: User | undefined = rawJson.user;
                const incomingAdventure: any | undefined = rawJson.customAdventure;
                
                if (!Array.isArray(incomingItems)) {
                    throw new Error("Invalid JSON format: 'vocabulary' array not found.");
                }
                
                const localItems = await getAllWordsForExport(userId);
                const localItemsByWord = new Map(localItems.map(item => [item.word.toLowerCase().trim(), item]));
                const itemsToSave: VocabularyItem[] = []; 
                let newCount = 0, mergedCount = 0, skippedCount = 0;

                const processWordFamily = (family: any) => {
                    if (!family) return undefined;
                    const newFamily = { ...family };
                    (['nouns', 'verbs', 'adjs', 'advs'] as const).forEach(key => {
                        if (Array.isArray(newFamily[key])) {
                            newFamily[key] = newFamily[key].map((m: any) => {
                                if (typeof m === 'string') return { word: m, ipa: '' };
                                const member: WordFamilyMember = {
                                    word: m.word,
                                    ipa: m.ipa || m.i || '', // for backward compatibility with `i`
                                    ipaUs: m.ipaUs,
                                    ipaUk: m.ipaUk,
                                    pronSim: m.pronSim,
                                    isIgnored: m.isIgnored
                                };
                                return member;
                            });
                        }
                    });
                    return newFamily;
                };

                for (const incoming of incomingItems) {
                    if (!incoming.word) continue;
                    
                    const { userId: oldUserId, ...restOfIncoming } = incoming;
                    const local = localItemsByWord.get(incoming.word.toLowerCase().trim());
                    
                    if (local) {
                        if ((restOfIncoming.updatedAt || 0) > (local.updatedAt || 0)) {
                            const { source: _incomingSource, ...restOfIncomingWithoutSource } = restOfIncoming;
                            let merged = { ...local, ...restOfIncomingWithoutSource, id: local.id, userId: userId, updatedAt: Date.now() };
                            
                            merged.wordFamily = processWordFamily(merged.wordFamily);
                            
                            if (!includeProgress) {
                                merged = resetProgress(merged);
                            } else if (merged.lastReview && typeof merged.interval !== 'undefined') {
                                const ONE_DAY = 24 * 60 * 60 * 1000;
                                merged.nextReview = merged.lastReview + (merged.interval * ONE_DAY);
                            }
                            
                            itemsToSave.push(merged); 
                            mergedCount++;
                        } else { 
                            skippedCount++; 
                        }
                    } else {
                        const now = Date.now();
                        const finalSource: WordSource = (restOfIncoming as any).source === 'seed' ? 'app' : 'manual';
                        let newItem = createNewWord(
                            restOfIncoming.word!, '', '', '', '', [], 
                            restOfIncoming.isIdiom, restOfIncoming.needsPronunciationFocus, restOfIncoming.isPhrasalVerb, 
                            restOfIncoming.isCollocation, restOfIncoming.isStandardPhrase, restOfIncoming.isPassive, finalSource
                        );
                        
                        newItem = {
                            ...newItem,
                            ...restOfIncoming,
                            id: restOfIncoming.id || newItem.id,
                            userId: userId,
                            wordFamily: processWordFamily(restOfIncoming.wordFamily),
                            quality: restOfIncoming.quality || WordQuality.RAW,
                            register: restOfIncoming.register || 'raw',
                            source: finalSource,
                            createdAt: restOfIncoming.createdAt || now,
                            updatedAt: now,
                        };

                        if (!includeProgress) {
                            newItem = resetProgress(newItem);
                        } else {
                            if (newItem.lastReview && typeof newItem.interval !== 'undefined') {
                                const ONE_DAY = 24 * 60 * 60 * 1000;
                                newItem.nextReview = newItem.lastReview + (newItem.interval * ONE_DAY);
                            } else {
                                newItem.nextReview = now;
                            }
                        }

                        itemsToSave.push(newItem); 
                        newCount++;
                    }
                }
                
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

                resolve({ 
                    type: 'success', 
                    message: successMessage,
                    detail: `Words: ${newCount} new, ${mergedCount} updated, ${skippedCount} skipped.`,
                    updatedUser,
                    customAdventureRestored
                });
            } catch(err: any) { 
                resolve({ type: 'error', message: "JSON Import Error", detail: err.message }); 
            } 
        };
        reader.onerror = () => {
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