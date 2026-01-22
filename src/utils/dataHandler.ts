
import { VocabularyItem, Unit, ParaphraseLog, User, WordQuality, WordSource, SpeakingLog, SpeakingTopic, WritingTopic, WritingLog, WordFamilyMember, WordFamily, CollocationDetail, PrepositionPattern, ParaphraseOption, ComparisonGroup, IrregularVerb, AdventureProgress } from '../app/types';
import { getAllWordsForExport, bulkSaveWords, getUnitsByUserId, bulkSaveUnits, bulkSaveParaphraseLogs, getParaphraseLogs, saveUser, getAllSpeakingTopicsForExport, getAllSpeakingLogsForExport, bulkSaveSpeakingTopics, bulkSaveSpeakingLogs, getAllWritingTopicsForExport, getAllWritingLogsForExport, bulkSaveWritingTopics, bulkSaveWritingLogs, getComparisonGroupsByUserId, bulkSaveComparisonGroups, getIrregularVerbsByUserId, bulkSaveIrregularVerbs } from '../app/db';
import { createNewWord, resetProgress, getAllValidTestKeys } from './srs';
import { ADVENTURE_CHAPTERS } from '../data/adventure_content';
import { generateMap, BOSSES } from '../data/adventure_map';

const keyMap: { [key: string]: string } = {
    // VocabularyItem top-level
    userId: 'uid', word: 'w', ipa: 'i', ipaUs: 'i_us', ipaUk: 'i_uk', pronSim: 'ps', ipaMistakes: 'im', meaningVi: 'm', example: 'ex', collocationsArray: 'col', idiomsList: 'idm', note: 'n', tags: 'tg', groups: 'gr', createdAt: 'ca', updatedAt: 'ua', wordFamily: 'fam', prepositions: 'prp', paraphrases: 'prph', register: 'reg', isIdiom: 'is_id', isPhrasalVerb: 'is_pv', isCollocation: 'is_col', isStandardPhrase: 'is_phr', isIrregular: 'is_irr', needsPronunciationFocus: 'is_pron', isExampleLocked: 'is_exl', isPassive: 'is_pas', quality: 'q', source: 's', nextReview: 'nr', interval: 'iv', easeFactor: 'ef', consecutiveCorrect: 'cc', lastReview: 'lr', lastGrade: 'lg', forgotCount: 'fc', lastTestResults: 'ltr', lastXpEarnedTime: 'lxp', gameEligibility: 'ge',
    v2: 'v2', v3: 'v3',
    masteryScore: 'ms',
    complexity: 'cx',

    // Nested properties
    d: 'ds',          // in CollocationDetail
    text: 'x',        // in CollocationDetail
    isIgnored: 'g',   // in many nested objects
    prep: 'p',        // in PrepositionPattern
    usage: 'u',       // in PrepositionPattern
    // 'word' ('w'), 'ipa' ('i'), etc., are reused from top-level
    tone: 't',        // in ParaphraseOption
    context: 'c',     // in ParaphraseOption
    nouns: 'n',       // in WordFamily
    verbs: 'v',       // in WordFamily
    adjs: 'j',        // in WordFamily
    advs: 'd',        // in WordFamily
};
const reverseKeyMap = Object.fromEntries(Object.entries(keyMap).map(([k, v]) => [v, k]));

const userKeyMap: { [key: string]: string } = {
    // User fields
    name: 'n', avatar: 'av', lastLogin: 'll', role: 'r', currentLevel: 'cl',
    target: 't', nativeLanguage: 'nl', experience: 'xp', level: 'lv',
    peakLevel: 'pl', adventure: 'adv', adventureLastDailyStar: 'alds',
    // AdventureProgress fields
    unlockedChapterIds: 'uc', completedSegmentIds: 'cs', segmentStars: 'ss',
    badges: 'b', keys: 'k', keyFragments: 'kf',
    // Added missing map fields for completeness
    currentNodeIndex: 'cni', energy: 'e', energyShards: 'es', map: 'm'
};
const reverseUserKeyMap = Object.fromEntries(Object.entries(userKeyMap).map(([k, v]) => [v, k]));


const gameEligibilityMap: { [key: string]: string } = {
    'COLLO_CONNECT': 'cc', 'MEANING_MATCH': 'mm', 'IPA_SORTER': 'is',
    'SENTENCE_SCRAMBLE': 'ss', 'PREPOSITION_POWER': 'pp', 'WORD_TRANSFORMER': 'wt',
    'IDIOM_CONNECT': 'ic', 'PARAPHRASE_CONTEXT': 'pc'
};
const reverseGameEligibilityMap = Object.fromEntries(Object.entries(gameEligibilityMap).map(([k, v]) => [v, k]));

const testResultKeyMap: { [key: string]: string } = {
    'SPELLING': 'sp', 'IPA_QUIZ': 'iq', 'PREPOSITION_QUIZ': 'pq',
    'WORD_FAMILY': 'wf', 'MEANING_QUIZ': 'mq', 'PARAPHRASE_QUIZ': 'prq',
    'SENTENCE_SCRAMBLE': 'sc', 'HETERONYM_QUIZ': 'hq', 'PRONUNCIATION': 'p',
    'COLLOCATION_QUIZ': 'cq', 'IDIOM_QUIZ': 'idq',
    'PARAPHRASE_CONTEXT_QUIZ': 'pcq',
    'WORD_FAMILY_NOUNS': 'wf_n',
    'WORD_FAMILY_VERBS': 'wf_v',
    'WORD_FAMILY_ADJS': 'wf_j',
    'WORD_FAMILY_ADVS': 'wf_d',
};
const reverseTestResultKeyMap = Object.fromEntries(Object.entries(testResultKeyMap).map(([k, v]) => [v, k]));

const paraphraseToneMap: { [key: string]: string } = {
    'intensified': 'int',
    'softened': 'sft',
    'synonym': 'syn',
    'academic': 'acd',
    'casual': 'cas',
    'idiomatic': 'idm',
};
const reverseParaphraseToneMap = Object.fromEntries(Object.entries(paraphraseToneMap).map(([k, v]) => [v, k]));

// --- Export Helper Functions (Refactored) ---

function _mapNestedArrayToShort(arr: any[] | undefined, outerKey: string): any[] | undefined {
    if (!arr) return arr;

    // Explicit, robust handling for paraphrases to fix the persistent bug.
    if (outerKey === 'paraphrases') {
        return (arr as ParaphraseOption[]).map(p => {
            const shortP: any = {
                [keyMap.word]: p.word,
                [keyMap.tone]: paraphraseToneMap[p.tone] || p.tone,
                [keyMap.context]: p.context,
            };
            if (p.isIgnored !== undefined) {
                shortP[keyMap.isIgnored] = p.isIgnored;
            }
            return shortP;
        });
    }

    // Generic handling for other types (e.g., collocations, family members)
    return arr.map(obj => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const mapped: any = {};
        for (const subKey in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, subKey)) {
                mapped[keyMap[subKey] || subKey] = obj[subKey];
            }
        }
        return mapped;
    });
}

function _mapWordFamilyToShort(fam: WordFamily | undefined): any | undefined {
    if (!fam) return fam;
    const shortFam: any = {};
    const familyKeys: (keyof WordFamily)[] = ['nouns', 'verbs', 'adjs', 'advs'];
    for (const famKey of familyKeys) {
        if (fam[famKey]) {
            const shortFamKey = keyMap[famKey] || famKey;
            shortFam[shortFamKey] = _mapNestedArrayToShort(fam[famKey], famKey);
        }
    }
    return shortFam;
}

export function _mapToShortKeys(item: Partial<VocabularyItem>): any {
    const shortItem: any = {};
    for (const key in item) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        
        const value = (item as any)[key];
        const shortKey = keyMap[key] || key;

        if (['collocationsArray', 'idiomsList', 'prepositions', 'paraphrases'].includes(key)) {
            shortItem[shortKey] = _mapNestedArrayToShort(value, key);
        } else if (key === 'wordFamily') {
            shortItem[shortKey] = _mapWordFamilyToShort(value);
        } else if (key === 'lastTestResults' && value) {
            const shortResults: any = {};
            const legacyKeys = new Set([
                'WORD_FAMILY', 'WORD_FAMILY_NOUNS', 'WORD_FAMILY_VERBS', 'WORD_FAMILY_ADJS', 'WORD_FAMILY_ADVS',
                'wf', 'wf_n', 'wf_v', 'wf_j', 'wf_d'
            ]);

            for (const testKey in value) {
                if (Object.prototype.hasOwnProperty.call(value, testKey)) {
                    // Check if the key itself is a legacy key to be removed.
                    if (legacyKeys.has(testKey)) {
                        continue;
                    }

                    const parts = testKey.split(':');
                    if (parts[0] === 'WORD_FAMILY' && parts.length === 2) {
                        continue; // This is a legacy key like "WORD_FAMILY:decorate". Skip it.
                    }
                    
                    const type = parts[0];
                    
                    const shortType = testResultKeyMap[type] || type;
                    const newKey = [shortType, ...parts.slice(1)].join(':');
                    shortResults[newKey] = value[testKey];
                }
            }
            shortItem[shortKey] = shortResults;
        } else if (key === 'gameEligibility' && Array.isArray(value)) {
            shortItem[shortKey] = value.map(ge => gameEligibilityMap[ge] || ge);
        } else {
            shortItem[shortKey] = value;
        }
    }
    return shortItem;
}

function _mapUserToShortKeys(user: User): any {
    const shortUser: any = {};
    for (const key in user) {
        if (!Object.prototype.hasOwnProperty.call(user, key)) continue;
        
        const value = (user as any)[key];
        const shortKey = userKeyMap[key] || key;

        if (key === 'adventure' && value) {
            const shortAdventure: any = {};
            for (const advKey in value) {
                if (!Object.prototype.hasOwnProperty.call(value, advKey)) continue;
                const advShortKey = userKeyMap[advKey] || advKey;
                shortAdventure[advShortKey] = value[advKey];
            }
            shortUser[shortKey] = shortAdventure;
        } else {
            shortUser[shortKey] = value;
        }
    }
    return shortUser;
}

function _mapUserToLongKeys(shortUser: any): User {
    const longUser: any = {};
    for (const shortKey in shortUser) {
        if (!Object.prototype.hasOwnProperty.call(shortUser, shortKey)) continue;
        
        const value = shortUser[shortKey];
        const longKey = reverseUserKeyMap[shortKey] || shortKey;

        if (longKey === 'adventure' && value) {
            const longAdventure: any = {};
            for (const advShortKey in value) {
                if (!Object.prototype.hasOwnProperty.call(value, advShortKey)) continue;
                const advLongKey = reverseUserKeyMap[advShortKey] || advShortKey;
                longAdventure[advLongKey] = value[advShortKey];
            }
            longUser[longKey] = longAdventure;
        } else {
            longUser[longKey] = value;
        }
    }
    return longUser as User;
}

// --- Import Helper Functions (Refactored) ---

function _mapNestedArrayToLong(arr: any[] | undefined, outerLongKey: string): any[] | undefined {
    if (!arr) return arr;

    // Explicit, robust handling for paraphrases to ensure backward compatibility.
    if (outerLongKey === 'paraphrases') {
        return arr.map(p => {
            const longP: any = {
                word: p[keyMap.word],
                tone: reverseParaphraseToneMap[p[keyMap.tone]] || p[keyMap.tone],
                context: p[keyMap.context],
            };
            if (p[keyMap.isIgnored] !== undefined) {
                longP.isIgnored = p[keyMap.isIgnored];
            }
            return longP as ParaphraseOption;
        });
    }

    // Generic handling for other types
    return arr.map(obj => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const mapped: any = {};
        for (const sKey in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, sKey)) {
                const newLongKey = reverseKeyMap[sKey] || sKey;
                mapped[newLongKey] = obj[sKey];
            }
        }
        return mapped;
    });
}

function _mapFamilyToLong(fam: any): any {
    const mappedFam: any = {};
    for (const shortFamKey in fam) {
        const longFamKey = reverseKeyMap[shortFamKey] || shortFamKey;
        mappedFam[longFamKey] = _mapNestedArrayToLong(fam[shortFamKey], longFamKey);
    }
    return mappedFam;
}


function _mapToLongKeys(item: any): Partial<VocabularyItem> {
    const longItem: any = {};
    for (const shortKey in item) {
        if (!Object.prototype.hasOwnProperty.call(item, shortKey)) continue;

        const value = item[shortKey];
        const longKey = reverseKeyMap[shortKey] || shortKey;

        if (['collocationsArray', 'idiomsList', 'prepositions', 'paraphrases'].includes(longKey)) {
            longItem[longKey] = _mapNestedArrayToLong(value, longKey);
        } else if (longKey === 'wordFamily' && value) {
            longItem[longKey] = _mapFamilyToLong(value);
        } else if (longKey === 'lastTestResults' && value) {
            const longResults: any = {};
            for (const testKey in value) {
                if (Object.prototype.hasOwnProperty.call(value, testKey)) {
                    const parts = testKey.split(':');
                    const shortType = parts[0];
                    const longType = reverseTestResultKeyMap[shortType] || shortType;
                    const newKey = [longType, ...parts.slice(1)].join(':');
                    longResults[newKey] = value[testKey];
                }
            }
            longItem[longKey] = longResults;
        } else if (longKey === 'gameEligibility' && Array.isArray(value)) {
            longItem[longKey] = value.map(ge => reverseGameEligibilityMap[ge] || ge);
        } else {
            longItem[longKey] = value;
        }
    }
    return longItem;
}

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
                
                const incomingItemsRaw: any[] = Array.isArray(rawJson) ? rawJson : (rawJson.vocabulary || rawJson.vocab);
                // Enhanced check for backward compatibility
                const isShortKeyFormat = incomingItemsRaw.length > 0 && (
                    (incomingItemsRaw[0].uid || !incomingItemsRaw[0].userId) || 
                    (incomingItemsRaw[0].col && incomingItemsRaw[0].col.length > 0 && incomingItemsRaw[0].col[0].x !== undefined) ||
                    (incomingItemsRaw[0].ge && incomingItemsRaw[0].ge.length > 0 && incomingItemsRaw[0].ge[0].length <= 3) ||
                    (incomingItemsRaw[0].prph && incomingItemsRaw[0].prph.length > 0 && incomingItemsRaw[0].prph[0].t && Object.values(paraphraseToneMap).includes(incomingItemsRaw[0].prph[0].t))
                );
                
                const incomingItems: Partial<VocabularyItem & { ipaUs?: string, ipaUk?: string }>[] = isShortKeyFormat 
                    ? incomingItemsRaw.map(_mapToLongKeys) 
                    : incomingItemsRaw;

                const incomingUnits: Unit[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.units || rawJson.u);
                const incomingLogs: any[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.paraphraseLogs || rawJson.pl);
                const incomingSpeakingTopics: SpeakingTopic[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.speakingTopics || rawJson.st);
                const incomingSpeakingLogs: SpeakingLog[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.speakingLogs || rawJson.sl);
                const incomingWritingTopics: WritingTopic[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.writingTopics || rawJson.wt);
                const incomingWritingLogs: WritingLog[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.writingLogs || rawJson.wl);
                const incomingComparisonGroups: ComparisonGroup[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.comparisonGroups || rawJson.cg);
                const incomingIrregularVerbs: IrregularVerb[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.irregularVerbs || rawJson.iv);
                
                const incomingUserRaw: User | undefined = Array.isArray(rawJson) ? undefined : rawJson.user;
                let incomingUser: User | undefined;
                if (incomingUserRaw) {
                    const isShortFormat = 'n' in incomingUserRaw || 'av' in incomingUserRaw || 'll' in incomingUserRaw || 'adv' in incomingUserRaw;
                    incomingUser = isShortFormat ? _mapUserToLongKeys(incomingUserRaw) : incomingUserRaw;
                }
                
                const incomingAdventure: any | undefined = Array.isArray(rawJson) ? undefined : (rawJson.customAdventure || rawJson.adv);
                
                if (!Array.isArray(incomingItems)) {
                    throw new Error("Invalid JSON format: 'vocabulary' array not found.");
                }
                
                const importedUserId = incomingUser ? incomingUser.id : userId;

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
                            let merged = { ...local, ...restOfIncomingWithoutSource, id: local.id, userId: importedUserId, updatedAt: Date.now() };
                            
                            merged.wordFamily = processWordFamily(merged.wordFamily);
                            
                            if (merged.lastTestResults) {
                                const validKeys = getAllValidTestKeys(merged);
                                const sanitizedResults: Record<string, boolean> = {};
                                for (const key in merged.lastTestResults) {
                                    if (validKeys.has(key)) {
                                        sanitizedResults[key] = merged.lastTestResults[key];
                                    }
                                }
                                merged.lastTestResults = sanitizedResults;
                            }

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
                            userId: importedUserId,
                            wordFamily: processWordFamily(restOfIncoming.wordFamily),
                            quality: restOfIncoming.quality || WordQuality.RAW,
                            register: restOfIncoming.register || 'raw',
                            source: finalSource,
                            createdAt: restOfIncoming.createdAt || now,
                            updatedAt: now,
                        };

                        if (newItem.lastTestResults) {
                            const validKeys = getAllValidTestKeys(newItem);
                            const sanitizedResults: Record<string, boolean> = {};
                            for (const key in newItem.lastTestResults) {
                                if (validKeys.has(key)) {
                                    sanitizedResults[key] = newItem.lastTestResults[key];
                                }
                            }
                            newItem.lastTestResults = sanitizedResults;
                        }

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
                    const unitsWithUser = incomingUnits.map(u => ({...u, userId: importedUserId})); 
                    await bulkSaveUnits(unitsWithUser); 
                }
                if (incomingLogs && Array.isArray(incomingLogs)) { 
                    const logsWithUser = incomingLogs.map(l => ({...l, userId: importedUserId})); 
                    await bulkSaveParaphraseLogs(logsWithUser); 
                }
                if (incomingSpeakingTopics && Array.isArray(incomingSpeakingTopics)) {
                    const topicsWithUser = incomingSpeakingTopics.map(t => ({...t, userId: importedUserId}));
                    await bulkSaveSpeakingTopics(topicsWithUser);
                }
                if (incomingSpeakingLogs && Array.isArray(incomingSpeakingLogs)) {
                    const logsWithUser = incomingSpeakingLogs.map(l => ({...l, userId: importedUserId}));
                    await bulkSaveSpeakingLogs(logsWithUser);
                }
                if (incomingWritingTopics && Array.isArray(incomingWritingTopics)) {
                    const topicsWithUser = incomingWritingTopics.map(t => ({...t, userId: importedUserId}));
                    await bulkSaveWritingTopics(topicsWithUser);
                }
                if (incomingWritingLogs && Array.isArray(incomingWritingLogs)) {
                    const logsWithUser = incomingWritingLogs.map(l => ({...l, userId: importedUserId}));
                    await bulkSaveWritingLogs(logsWithUser);
                }
                if (incomingComparisonGroups && Array.isArray(incomingComparisonGroups)) {
                    const groupsWithUser = incomingComparisonGroups.map(g => ({...g, userId: importedUserId}));
                    await bulkSaveComparisonGroups(groupsWithUser);
                }
                if (incomingIrregularVerbs && Array.isArray(incomingIrregularVerbs)) {
                    const verbsWithUser = incomingIrregularVerbs.map(v => ({...v, userId: importedUserId}));
                    await bulkSaveIrregularVerbs(verbsWithUser);
                }

                let updatedUser: User | undefined = undefined;
                if (includeProgress && incomingUser) {
                    // --- REPAIR / SANITIZE USER DATA ---
                    const sanitizedUser = { ...incomingUser };
                    
                    // Robust numeric parsing
                    let safeLevel = parseInt(String(sanitizedUser.level), 10);
                    if (isNaN(safeLevel) || safeLevel < 1) safeLevel = 1;
                    sanitizedUser.level = safeLevel;

                    let safePeak = parseInt(String(sanitizedUser.peakLevel), 10);
                    if (isNaN(safePeak) || safePeak < 1) safePeak = safeLevel;
                    sanitizedUser.peakLevel = safePeak;

                    sanitizedUser.experience = typeof sanitizedUser.experience === 'number' && !isNaN(sanitizedUser.experience) ? sanitizedUser.experience : 0;

                    if (!sanitizedUser.adventure) {
                        sanitizedUser.adventure = {} as any;
                    }

                    const adv = sanitizedUser.adventure;
                    adv.currentNodeIndex = typeof adv.currentNodeIndex === 'number' && !isNaN(adv.currentNodeIndex) ? adv.currentNodeIndex : 0;
                    
                    // Auto-repair Energy: If invalid or missing, reset to 5. Allows 0.
                    if (typeof adv.energy !== 'number' || isNaN(adv.energy)) {
                        adv.energy = 5;
                    }
                    
                    adv.keys = typeof adv.keys === 'number' && !isNaN(adv.keys) ? adv.keys : 1;
                    adv.keyFragments = typeof adv.keyFragments === 'number' && !isNaN(adv.keyFragments) ? adv.keyFragments : 0;
                    adv.energyShards = typeof adv.energyShards === 'number' && !isNaN(adv.energyShards) ? adv.energyShards : 0;
                    
                    adv.badges = Array.isArray(adv.badges) ? adv.badges : [];
                    adv.unlockedChapterIds = Array.isArray(adv.unlockedChapterIds) ? adv.unlockedChapterIds : ADVENTURE_CHAPTERS.map(c => c.id);
                    adv.completedSegmentIds = Array.isArray(adv.completedSegmentIds) ? adv.completedSegmentIds : [];
                    adv.segmentStars = adv.segmentStars || {};

                    // Regenerate Map if missing or invalid
                    if (!adv.map || !Array.isArray(adv.map) || adv.map.length === 0) {
                        adv.map = generateMap(100);
                    } else {
                        // Refresh Bosses: If using old map data, ensure boss details are current
                        let bossCounter = 0;
                        adv.map = adv.map.map((node: any, index: number) => {
                            // Standard logic: every 10th node is a boss. 
                            // Update details from the master list but preserve status.
                            if ((index + 1) % 10 === 0) {
                                node.type = 'boss';
                                const newBossData = BOSSES[bossCounter % BOSSES.length];
                                node.boss_details = {
                                    ...newBossData,
                                    // Preserve defeated status from the imported map if it exists
                                    // (node is the imported node)
                                };
                                bossCounter++;
                            }
                            return node;
                        });
                    }
                    
                    const userToSave = { ...sanitizedUser, id: importedUserId };
                    await saveUser(userToSave);
                    updatedUser = userToSave;
                }

                let customAdventureRestored = false;
                if (incomingAdventure) {
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
                
                // Clear any potentially invalid session state from before the import.
                sessionStorage.removeItem('vocab_pro_active_session');
                sessionStorage.removeItem('vocab_pro_session_progress');
                sessionStorage.removeItem('vocab_pro_session_outcomes');

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
    const [wordsData, unitsData, logsData, speakingTopicsData, speakingLogsData, writingTopicsData, writingLogsData, comparisonGroupsData, irregularVerbsData] = await Promise.all([ 
        getAllWordsForExport(userId), 
        getUnitsByUserId(userId),
        getParaphraseLogs(userId),
        getAllSpeakingTopicsForExport(userId),
        getAllSpeakingLogsForExport(userId),
        getAllWritingTopicsForExport(userId),
        getAllWritingLogsForExport(userId),
        getComparisonGroupsByUserId(userId),
        getIrregularVerbsByUserId(userId),
    ]);
    
    const processedWords = includeProgress ? wordsData : wordsData.map(w => resetProgress(w));
    const finalWordsData = processedWords.map(({ collocations, idioms, ...rest }) => rest);
    const shortWordsData = finalWordsData.map(w => _mapToShortKeys(w as VocabularyItem));

    const finalUnitsData = includeEssays ? unitsData : unitsData.map(({ essay, ...rest }) => rest);
    
    const customChapters = localStorage.getItem('vocab_pro_adventure_chapters');
    const customBadges = localStorage.getItem('vocab_pro_custom_badges');

    const exportObject = { 
        v: 6, 
        ca: new Date().toISOString(), 
        user: _mapUserToShortKeys(currentUser),
        vocab: shortWordsData, 
        u: finalUnitsData,
        pl: logsData,
        st: speakingTopicsData,
        sl: speakingLogsData,
        wt: writingTopicsData,
        wl: writingLogsData,
        cg: comparisonGroupsData,
        iv: irregularVerbsData,
        adv: {
            ch: customChapters ? JSON.parse(customChapters) : null,
            b: customBadges ? JSON.parse(customBadges) : null
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
