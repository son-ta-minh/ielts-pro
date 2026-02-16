/**
 * Data transformation and mapping for Import/Export.
 * Uses short keys to reduce JSON size for storage and transfer.
 */

import { VocabularyItem, Unit, ParaphraseLog, User, WordQuality, WordSource, SpeakingLog, SpeakingTopic, WritingTopic, WritingLog, WordFamilyMember, WordFamily, CollocationDetail, PrepositionPattern, ParaphraseOption, IrregularVerb, AdventureProgress, Lesson, ListeningItem, NativeSpeakItem, Composition, DataScope, WordBook, ReadingBook, PlanningGoal, ConversationItem, FreeTalkItem } from '../app/types';
import { getAllWordsForExport, bulkSaveWords, getUnitsByUserId, bulkSaveUnits, bulkSaveParaphraseLogs, getParaphraseLogs, saveUser, getAllSpeakingTopicsForExport, getAllSpeakingLogsForExport, bulkSaveSpeakingTopics, bulkSaveSpeakingLogs, getAllWritingTopicsForExport, getAllWritingLogsForExport, bulkSaveWritingTopics, bulkSaveWritingLogs, getIrregularVerbsByUserId, bulkSaveIrregularVerbs, getLessonsByUserId, bulkSaveLessons, getListeningItemsByUserId, bulkSaveListeningItems, getNativeSpeakItemsByUserId, bulkSaveNativeSpeakItems, getCompositionsByUserId, bulkSaveCompositions, getWordBooksByUserId, bulkSaveWordBooks, getReadingBooksByUserId, bulkSaveReadingBooks, getPlanningGoalsByUserId, bulkSavePlanningGoals, getConversationItemsByUserId, bulkSaveConversationItems, getFreeTalkItemsByUserId, bulkSaveFreeTalkItems } from '../app/db';
import { createNewWord, resetProgress, getAllValidTestKeys } from './srs';
import { ADVENTURE_CHAPTERS } from '../data/adventure_content';
import { generateMap, BOSSES } from '../data/adventure_map';

const keyMap: { [key: string]: string } = {
    // VocabularyItem top-level - 'ipa' removed, 'ipaUs' uses 'i_us'
    userId: 'uid', word: 'w', ipaUs: 'i_us', ipaUk: 'i_uk', pronSim: 'ps', ipaMistakes: 'im', meaningVi: 'm', example: 'ex', collocationsArray: 'col', idiomsList: 'idm', note: 'nt', tags: 'tg', groups: 'gr', createdAt: 'ca', updatedAt: 'ua', wordFamily: 'fam', prepositions: 'prp', paraphrases: 'prph', register: 'reg', isIdiom: 'is_id', isPhrasalVerb: 'is_pv', isCollocation: 'is_col', isStandardPhrase: 'is_phr', isIrregular: 'is_irr', isExampleLocked: 'is_exl', isPassive: 'is_pas', quality: 'q', source: 's', nextReview: 'nr', interval: 'iv', easeFactor: 'ef', consecutiveCorrect: 'cc', lastReview: 'lr', lastGrade: 'lg', forgotCount: 'fc', lastTestResults: 'ltr', lastXpEarnedTime: 'lxp', gameEligibility: 'ge',
    masteryScore: 'ms',
    complexity: 'cx',

    // WordBook / Generic
    topic: 'tp',
    icon: 'ic',
    words: 'wds',
    color: 'clr',
    titleColor: 'tc',
    titleSize: 'ts',

    // Nested properties
    d: 'ds',          // in CollocationDetail
    text: 'x',        // in CollocationDetail
    isIgnored: 'g',   // in many nested objects
    prep: 'p',        // in PrepositionPattern
    usage: 'u',       // in PrepositionPattern
    tone: 't',        // in ParaphraseOption / NativeSpeakAnswer
    context: 'c',     // in ParaphraseOption
    anchor: 'anch',   // in NativeSpeakAnswer
    sentence: 'sent', // in NativeSpeakAnswer
    nouns: 'ns',       // fixed: was 'n' (conflict with note)
    verbs: 'v',       // in WordFamily
    adjs: 'j',        // in WordFamily
    advs: 'd',        // in WordFamily
    
    // Native Speak & Conversation & Free Talk
    standard: 'std',  // in NativeSpeakItem
    answers: 'ans',   // in NativeSpeakItem
    speakers: 'spks',
    sentences: 'snts',
    speakerName: 'sn',
    voiceName: 'vn',
    accentCode: 'ac',
    sex: 'sx',
    title: 'tl',
    content: 'ct',
    sentenceScores: 'ss'
};

const reverseKeyMap: { [key: string]: string } = Object.fromEntries(Object.entries(keyMap).map(([k, v]) => [v, k]));

const userKeyMap: { [key: string]: string } = {
    name: 'n', avatar: 'av', lastLogin: 'll', role: 'r', currentLevel: 'cl',
    target: 't', nativeLanguage: 'nl', experience: 'xp', level: 'lv',
    peakLevel: 'pl', adventure: 'adv', adventureLastDailyStar: 'alds',
    unlockedChapterIds: 'uc', completedSegmentIds: 'cs', segmentStars: 'ss',
    badges: 'b', keys: 'k', keyFragments: 'kf',
    currentNodeIndex: 'cni', energy: 'e', energyShards: 'es', map: 'm'
};

const reverseUserKeyMap: { [key: string]: string } = Object.fromEntries(Object.entries(userKeyMap).map(([k, v]) => [v, k]));

const gameEligibilityMap: { [key: string]: string } = {
    'COLLO_CONNECT': 'cc', 'MEANING_MATCH': 'mm', 'IPA_SORTER': 'is',
    'SENTENCE_SCRAMBLE': 'ss', 'PREPOSITION_POWER': 'pp', 'WORD_TRANSFORMER': 'wt',
    'IDIOM_CONNECT': 'ic', 'PARAPHRASE_CONTEXT': 'pc'
};

const reverseGameEligibilityMap: { [key: string]: string } = Object.fromEntries(Object.entries(gameEligibilityMap).map(([k, v]) => [v, k]));

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

const reverseTestResultKeyMap: { [key: string]: string } = Object.fromEntries(Object.entries(testResultKeyMap).map(([k, v]) => [v, k]));

const paraphraseToneMap: { [key: string]: string } = {
    'intensified': 'int',
    'softened': 'sft',
    'synonym': 'syn',
    'academic': 'acd',
    'casual': 'cas',
    'idiomatic': 'idm',
};

const reverseParaphraseToneMap: { [key: string]: string } = Object.fromEntries(Object.entries(paraphraseToneMap).map(([k, v]) => [v, k]));

const FULL_SCOPE: DataScope = {
    user: true, vocabulary: true, lesson: true, reading: true, writing: true, 
    speaking: true, listening: true, mimic: true, wordBook: true, 
    planning: true
};

// --- Export Helpers ---

function _mapNestedArrayToShort(arr: any[] | undefined, outerKey: string): any[] | undefined {
    if (!arr) return arr;

    if (outerKey === 'paraphrases') {
        return (arr as ParaphraseOption[]).map(p => {
            const shortP: any = {
                [keyMap.word]: p.word,
                [keyMap.tone]: paraphraseToneMap[p.tone] || p.tone,
                [keyMap.context]: p.context,
            };
            // Only export true booleans to save space
            if (p.isIgnored === true) shortP[keyMap.isIgnored] = true;
            return shortP;
        });
    }

    return arr.map(obj => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const mapped: any = {};
        for (const subKey in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, subKey)) {
                const val = obj[subKey];
                // Only export true booleans or non-boolean values
                if (val === false) continue;
                mapped[keyMap[subKey] || subKey] = val;
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

export function _mapToShortKeys(item: any): any {
    const shortItem: any = {};
    for (const key in item) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        
        // Skip deprecated fields explicitly
        if (key === 'tags' || key === 'v2' || key === 'v3' || key === 'ipa' || key === 'needsPronunciationFocus') continue;

        const value = (item as any)[key];
        
        // MINIMAL: Omit false booleans
        if (value === false) continue;
        
        const shortKey = keyMap[key] || key;

        if (['collocationsArray', 'idiomsList', 'prepositions', 'paraphrases', 'words', 'speakers', 'sentences', 'answers'].includes(key)) {
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
                    if (legacyKeys.has(testKey)) continue;
                    const parts = testKey.split(':');
                    if (parts[0] === 'WORD_FAMILY' && parts.length === 2) continue;
                    
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

export function _mapUserToShortKeys(user: User): any {
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

// --- Import Helpers ---

function _mapNestedArrayToLong(arr: any[] | undefined, outerLongKey: string): any[] | undefined {
    if (!arr) return arr;

    if (outerLongKey === 'paraphrases') {
        return arr.map(p => {
            const longP: any = {
                word: p[keyMap.word],
                tone: reverseParaphraseToneMap[p[keyMap.tone]] || p[keyMap.tone],
                context: p[keyMap.context],
            };
            if (p[keyMap.isIgnored] !== undefined) longP.isIgnored = p[keyMap.isIgnored];
            else longP.isIgnored = false; // Default for missing
            return longP as ParaphraseOption;
        });
    }

    return arr.map(obj => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const mapped: any = {};
        for (const sKey in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, sKey)) {
                const newLongKey = reverseKeyMap[sKey] || sKey;

                // CLEANUP: Remove IPA fields from Word Family Members during import
                if (['nouns', 'verbs', 'adjs', 'advs'].includes(outerLongKey)) {
                    if (newLongKey === 'ipa' || newLongKey === 'ipaUs' || newLongKey === 'ipaUk') {
                        continue; // Skip this field
                    }
                }
                
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

export function _mapToLongKeys(item: any): any {
    const longItem: any = {};
    for (const shortKey in item) {
        if (!Object.prototype.hasOwnProperty.call(item, shortKey)) continue;

        const value = item[shortKey];
        const longKey = reverseKeyMap[shortKey] || shortKey;

        // CLEANUP: Skip deprecated fields at the root level during import (Short Key path)
        if (longKey === 'tags' || longKey === 'v2' || longKey === 'v3' || longKey === 'needsPronunciationFocus') {
            continue;
        }

        // Special handling for legacy 'i' (ipa) short key mapping
        if (shortKey === 'i' && !longItem.ipaUs) {
             longItem.ipaUs = value;
             continue;
        }
        if (longKey === 'ipa') { 
             if (!longItem.ipaUs) longItem.ipaUs = value;
             continue;
        }

        if (['collocationsArray', 'idiomsList', 'prepositions', 'paraphrases', 'words', 'speakers', 'sentences', 'answers'].includes(longKey)) {
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
            longItem[longKey] = value.map((ge: string) => reverseGameEligibilityMap[ge] || ge);
        } else {
            longItem[longKey] = value;
        }
    }
    return longItem;
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

// Cleanup function for long-format JSON import
function cleanImportedItem(item: any): any {
    if (!item) return item;
    const cleaned = { ...item };
    
    // MIGRATION: 'ipa' -> 'ipaUs'
    if (cleaned.ipa && !cleaned.ipaUs) {
        cleaned.ipaUs = cleaned.ipa;
    }
    
    // Remove obsolete root fields
    delete cleaned.v2;
    delete cleaned.v3;
    delete cleaned.tags;
    delete cleaned.ipa; 
    delete cleaned.needsPronunciationFocus;
    
    // Default booleans if missing
    if (cleaned.isIdiom === undefined) cleaned.isIdiom = false;
    if (cleaned.isPhrasalVerb === undefined) cleaned.isPhrasalVerb = false;
    if (cleaned.isCollocation === undefined) cleaned.isCollocation = false;
    if (cleaned.isStandardPhrase === undefined) cleaned.isStandardPhrase = false;
    if (cleaned.isIrregular === undefined) cleaned.isIrregular = false;
    if (cleaned.isPassive === undefined) cleaned.isPassive = false;

    // Remove obsolete family member fields
    if (cleaned.wordFamily) {
         const cleanFamilyMembers = (members: any[]) => {
             if (!Array.isArray(members)) return members;
             return members.map(m => {
                 const cm = { ...m };
                 delete cm.ipa;
                 delete cm.ipaUs;
                 delete cm.ipaUk;
                 return cm;
             });
         };
         
         if (cleaned.wordFamily.nouns) cleaned.wordFamily.nouns = cleanFamilyMembers(cleaned.wordFamily.nouns);
         if (cleaned.wordFamily.verbs) cleaned.wordFamily.verbs = cleanFamilyMembers(cleaned.wordFamily.verbs);
         if (cleaned.wordFamily.adjs) cleaned.wordFamily.adjs = cleanFamilyMembers(cleaned.wordFamily.adjs);
         if (cleaned.wordFamily.advs) cleaned.wordFamily.advs = cleanFamilyMembers(cleaned.wordFamily.advs);
    }
    return cleaned;
}

export interface ImportResult {
    type: 'success' | 'error';
    message: string;
    detail?: string;
    updatedUser?: User;
    customAdventureRestored?: boolean;
    backupTimestamp?: number;
}

export const processJsonImport = async (
    file: File, 
    userId: string, 
    scopeInput: any = FULL_SCOPE
): Promise<ImportResult> => {
    return new Promise((resolve) => {
        const scope = (scopeInput && typeof scopeInput === 'object' && typeof scopeInput.vocabulary === 'boolean') ? scopeInput : FULL_SCOPE;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const rawJson = JSON.parse(ev.target?.result as string);
                
                const backupTimestamp = rawJson.ca ? new Date(rawJson.ca).getTime() : undefined;

                const incomingItemsRaw: any[] = Array.isArray(rawJson) ? rawJson : (rawJson.vocabulary || rawJson.vocab || []);
                const isShortKeyFormat = incomingItemsRaw.length > 0 && (incomingItemsRaw[0].uid || !incomingItemsRaw[0].userId);
                
                let incomingItems: Partial<VocabularyItem>[] = isShortKeyFormat 
                    ? incomingItemsRaw.map(_mapToLongKeys) 
                    : incomingItemsRaw;

                // Apply rigorous cleanup to ALL incoming vocab items to ensure v2, v3, tags, and family IPA are gone
                incomingItems = incomingItems.map(cleanImportedItem);

                const incomingUnits: Unit[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.units || rawJson.u);
                const incomingLogs: any[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.paraphraseLogs || rawJson.pl);
                const incomingSpeakingTopics: SpeakingTopic[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.speakingTopics || rawJson.st);
                const incomingSpeakingLogs: SpeakingLog[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.speakingLogs || rawJson.sl);
                const incomingWritingTopics: WritingTopic[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.writingTopics || rawJson.wt);
                const incomingWritingLogs: WritingLog[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.writingLogs || rawJson.wl);
                const incomingIrregularVerbs: IrregularVerb[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.irregularVerbs || rawJson.iv);
                const incomingLessons: Lesson[] | undefined = Array.isArray(rawJson) ? undefined : rawJson.lessons;
                const incomingListeningItems: ListeningItem[] | undefined = Array.isArray(rawJson) ? undefined : rawJson.listeningItems;
                
                const incomingNativeSpeakItemsRaw: any[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.nativeSpeakItems || rawJson.nsi);
                const incomingNativeSpeakItems = incomingNativeSpeakItemsRaw ? incomingNativeSpeakItemsRaw.map(_mapToLongKeys) : undefined;
                
                const incomingConversationItemsRaw: any[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.conversationItems || rawJson.ci);
                const incomingConversationItems = incomingConversationItemsRaw ? incomingConversationItemsRaw.map(_mapToLongKeys) : undefined;

                const incomingFreeTalkItemsRaw: any[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.freeTalkItems || rawJson.fti);
                const incomingFreeTalkItems = incomingFreeTalkItemsRaw ? incomingFreeTalkItemsRaw.map(_mapToLongKeys) : undefined;

                const incomingCompositions: Composition[] | undefined = Array.isArray(rawJson) ? undefined : rawJson.compositions;
                const incomingMimicQueue: any[] | undefined = Array.isArray(rawJson) ? undefined : rawJson.mimicQueue;
                const incomingWordBooksRaw: any[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.wordBooks || rawJson.wb);
                const incomingWordBooks = incomingWordBooksRaw ? incomingWordBooksRaw.map(_mapToLongKeys) : undefined;
                const incomingReadingShelves = Array.isArray(rawJson) ? undefined : (rawJson.readingShelves || rawJson.rs);
                const incomingReadingBooks: ReadingBook[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.readingBooks || rawJson.rb);
                const incomingPlanningGoals: PlanningGoal[] | undefined = Array.isArray(rawJson) ? undefined : (rawJson.planningGoals || rawJson.pg);

                const incomingUserRaw: User | undefined = Array.isArray(rawJson) ? undefined : rawJson.user;
                let incomingUser: User | undefined;
                if (incomingUserRaw) {
                    const isUserShort = 'n' in incomingUserRaw || 'av' in incomingUserRaw;
                    incomingUser = isUserShort ? _mapUserToLongKeys(incomingUserRaw) : incomingUserRaw;
                }
                
                const importedUserId = incomingUser ? incomingUser.id : userId;

                const incomingAdventure: any | undefined = Array.isArray(rawJson) ? undefined : (rawJson.customAdventure || rawJson.adv);
                const incomingSettings: any | undefined = Array.isArray(rawJson) ? undefined : (rawJson.settings || rawJson.sys);

                if (!Array.isArray(incomingItems)) throw new Error("Invalid JSON: 'vocabulary' array missing.");

                // --- VOCABULARY ---
                let newCount = 0, mergedCount = 0, skippedCount = 0;
                if (scope.vocabulary) {
                    const localItems = await getAllWordsForExport(userId);
                    const localItemsByWord = new Map(localItems.map(item => [item.word.toLowerCase().trim(), item]));
                    const itemsToSave: VocabularyItem[] = []; 

                    for (const incoming of incomingItems) {
                        if (!incoming.word) continue;
                        const local = localItemsByWord.get(incoming.word.toLowerCase().trim());
                        if (local) {
                            if ((incoming.updatedAt || 0) > (local.updatedAt || 0)) {
                                itemsToSave.push({ ...local, ...incoming, id: local.id, userId: importedUserId, updatedAt: Date.now() } as VocabularyItem); 
                                mergedCount++;
                            } else skippedCount++;
                        } else {
                            const now = Date.now();
                            itemsToSave.push({ ...incoming, id: incoming.id || `w-${now}-${Math.random()}`, userId: importedUserId, createdAt: incoming.createdAt || now, updatedAt: now } as VocabularyItem);
                            newCount++;
                        }
                    }
                    if (itemsToSave.length > 0) await bulkSaveWords(itemsToSave);
                }
                
                // --- READING ---
                if (scope.reading) {
                    if (incomingUnits) await bulkSaveUnits(incomingUnits.map(u => ({...u, userId: importedUserId}))); 
                    if (incomingReadingBooks) await bulkSaveReadingBooks(incomingReadingBooks.map(b => ({ ...b, userId: importedUserId })));
                    if (incomingReadingShelves) localStorage.setItem('reading_books_shelves', JSON.stringify(incomingReadingShelves));
                }
                
                // --- LOGS ---
                if (scope.lesson || scope.writing) {
                    if (incomingLogs) await bulkSaveParaphraseLogs(incomingLogs.map(l => ({...l, userId: importedUserId}))); 
                }

                // --- SPEAKING ---
                if (scope.speaking) {
                    if (incomingSpeakingTopics) await bulkSaveSpeakingTopics(incomingSpeakingTopics.map(t => ({...t, userId: importedUserId})));
                    if (incomingSpeakingLogs) await bulkSaveSpeakingLogs(incomingSpeakingLogs.map(l => ({...l, userId: importedUserId})));
                    if (incomingNativeSpeakItems) {
                        await bulkSaveNativeSpeakItems(incomingNativeSpeakItems.map(item => ({ ...item, userId: importedUserId })));
                    }
                    if (incomingConversationItems) {
                        await bulkSaveConversationItems(incomingConversationItems.map(c => ({ ...c, userId: importedUserId })));
                    }
                    if (incomingFreeTalkItems) {
                        await bulkSaveFreeTalkItems(incomingFreeTalkItems.map(f => ({ ...f, userId: importedUserId })));
                    }
                }

                // --- WRITING ---
                if (scope.writing) {
                    if (incomingWritingTopics) await bulkSaveWritingTopics(incomingWritingTopics.map(t => ({...t, userId: importedUserId})));
                    if (incomingWritingLogs) await bulkSaveWritingLogs(incomingWritingLogs.map(l => ({...l, userId: importedUserId})));
                    if (incomingCompositions) await bulkSaveCompositions(incomingCompositions.map(c => ({...c, userId: importedUserId})));
                }

                // --- LESSON ---
                if (scope.lesson) {
                    if (incomingIrregularVerbs) await bulkSaveIrregularVerbs(incomingIrregularVerbs.map(v => ({...v, userId: importedUserId})));
                    if (incomingLessons) await bulkSaveLessons(incomingLessons.map(l => ({...l, userId: importedUserId})));
                }

                // --- OTHERS ---
                if (scope.listening && incomingListeningItems) await bulkSaveListeningItems(incomingListeningItems.map(l => ({...l, userId: importedUserId})));
                if (scope.mimic && incomingMimicQueue) localStorage.setItem('vocab_pro_mimic_practice_queue', JSON.stringify(incomingMimicQueue));
                if (scope.wordBook && incomingWordBooks) await bulkSaveWordBooks(incomingWordBooks.map(b => ({ ...b, userId: importedUserId })));
                if (scope.planning && incomingPlanningGoals) await bulkSavePlanningGoals(incomingPlanningGoals.map(g => ({...g, userId: importedUserId})));

                let updatedUser: User | undefined = undefined;
                if (scope.user && incomingUser) {
                    const userToSave = { ...incomingUser, id: importedUserId };
                    await saveUser(userToSave);
                    updatedUser = userToSave;
                }

                if (incomingAdventure && scope.user) {
                    if (incomingAdventure.ch) localStorage.setItem('vocab_pro_adventure_chapters', JSON.stringify(incomingAdventure.ch));
                    if (incomingAdventure.b) localStorage.setItem('vocab_pro_custom_badges', JSON.stringify(incomingAdventure.b));
                }
                if (scope.user && incomingSettings) {
                    localStorage.setItem('vocab_pro_system_config', JSON.stringify(incomingSettings));
                    window.dispatchEvent(new Event('config-updated'));
                }

                resolve({ 
                    type: 'success', 
                    message: 'Restore data successfully',
                    detail: `Words: ${newCount} new, ${mergedCount} updated.`,
                    updatedUser,
                    backupTimestamp 
                });
            } catch(err: any) { resolve({ type: 'error', message: "JSON Import Error", detail: err.message }); } 
        };
        reader.readAsText(file);
    });
};

export const generateJsonExport = async (userId: string, currentUser: User, scopeInput: any = FULL_SCOPE) => {
    const scope = (scopeInput && typeof scopeInput === 'object' && typeof scopeInput.vocabulary === 'boolean') ? scopeInput : FULL_SCOPE;

    const [wordsData, unitsData, readingBooksData, logsData, speakingTopicsData, speakingLogsData, nativeSpeakItemsDataRaw, conversationItemsDataRaw, freeTalkItemsDataRaw, writingTopicsData, writingLogsData, compositionsData, irregularVerbsData, lessonsData, listeningItemsData, wordBooksDataRaw, planningGoalsData] = await Promise.all([
        scope.vocabulary ? getAllWordsForExport(userId) : [],
        scope.reading ? getUnitsByUserId(userId) : [],
        scope.reading ? getReadingBooksByUserId(userId) : [],
        (scope.lesson || scope.writing) ? getParaphraseLogs(userId) : [],
        scope.speaking ? getAllSpeakingTopicsForExport(userId) : [],
        scope.speaking ? getAllSpeakingLogsForExport(userId) : [],
        scope.speaking ? getNativeSpeakItemsByUserId(userId) : [],
        scope.speaking ? getConversationItemsByUserId(userId) : [],
        scope.speaking ? getFreeTalkItemsByUserId(userId) : [],
        scope.writing ? getAllWritingTopicsForExport(userId) : [],
        scope.writing ? getAllWritingLogsForExport(userId) : [],
        scope.writing ? getCompositionsByUserId(userId) : [],
        scope.lesson ? getIrregularVerbsByUserId(userId) : [],
        scope.lesson ? getLessonsByUserId(userId) : [],
        scope.listening ? getListeningItemsByUserId(userId) : [],
        scope.wordBook ? getWordBooksByUserId(userId) : [],
        scope.planning ? getPlanningGoalsByUserId(userId) : []
    ]);

    const mimicQueueData = localStorage.getItem('vocab_pro_mimic_practice_queue');
    const customChapters = localStorage.getItem('vocab_pro_adventure_chapters');
    const customBadges = localStorage.getItem('vocab_pro_custom_badges');
    const readingShelves = localStorage.getItem('reading_books_shelves');
    const systemConfig = localStorage.getItem('vocab_pro_system_config');

     return {
        v: 8,
        ca: new Date().toISOString(),
        user: _mapUserToShortKeys(currentUser), 
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
        freeTalkItems: freeTalkItemsDataRaw.map(w => _mapToShortKeys(w)),
        compositions: compositionsData,
        mimicQueue: mimicQueueData ? JSON.parse(mimicQueueData) : [],
        wordBooks: wordBooksDataRaw.map(b => _mapToShortKeys(b)),
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

export const exportUnitsToJson = async (units: Unit[], userId: string) => {
    const exportObject = { v: 8, ca: new Date().toISOString(), u: units, user: { id: userId } };
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `vocab-pro-units-${new Date().toISOString().split('T')[0]}.json`; 
    a.click(); 
    URL.revokeObjectURL(url);
};