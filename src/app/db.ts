import { VocabularyItem, User, Unit, ReviewGrade, WordQuality, ParaphraseLog, WordSource, SpeakingLog, SpeakingTopic, WritingTopic, WritingLog, ComparisonGroup, IrregularVerb } from './types';
import { initialVocabulary, DEFAULT_USER_ID, LOCAL_SHIPPED_DATA_PATH } from '../data/user_data';
import { ADVENTURE_CHAPTERS } from '../data/adventure_content';

const DB_NAME = 'IELTSVocabProDB_V2';
const STORE_NAME = 'vocabulary';
const USER_STORE = 'users';
const UNIT_STORE = 'units';
const LOG_STORE = 'paraphrase_logs';
const SPEAKING_LOG_STORE = 'speaking_logs';
const SPEAKING_TOPIC_STORE = 'speaking_topics';
const WRITING_LOG_STORE = 'writing_logs';
const WRITING_TOPIC_STORE = 'writing_topics';
const COMPARISON_STORE = 'comparison_groups';
const IRREGULAR_VERBS_STORE = 'irregular_verbs';
const DB_VERSION = 13; 

let _dbInstance: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (_dbInstance) {
    return Promise.resolve(_dbInstance);
  }
  if (_dbPromise) {
    return _dbPromise;
  }

  _dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db) {
          console.error("Database not available during onupgradeneeded");
          return;
        }

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const vocabStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          vocabStore.createIndex('userId', 'userId', { unique: false });
          vocabStore.createIndex('nextReview', 'nextReview', { unique: false });
          vocabStore.createIndex('userId_word', ['userId', 'word'], { unique: false });
        }
        
        if (!db.objectStoreNames.contains(USER_STORE)) {
          db.createObjectStore(USER_STORE, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(UNIT_STORE)) {
          const unitStore = db.createObjectStore(UNIT_STORE, { keyPath: 'id' });
          unitStore.createIndex('userId', 'userId', { unique: false });
        }

        if (!db.objectStoreNames.contains(LOG_STORE)) {
          const logStore = db.createObjectStore(LOG_STORE, { keyPath: 'id' });
          logStore.createIndex('userId', 'userId', { unique: false });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(SPEAKING_LOG_STORE)) {
          const speakingLogStore = db.createObjectStore(SPEAKING_LOG_STORE, { keyPath: 'id' });
          speakingLogStore.createIndex('userId', 'userId', { unique: false });
          speakingLogStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (event.oldVersion < 9) {
          if (!db.objectStoreNames.contains(SPEAKING_TOPIC_STORE)) {
            const topicStore = db.createObjectStore(SPEAKING_TOPIC_STORE, { keyPath: 'id' });
            topicStore.createIndex('userId', 'userId', { unique: false });
          }
        }
        
        if (event.oldVersion < 10) {
            if (!db.objectStoreNames.contains(WRITING_TOPIC_STORE)) {
                const topicStore = db.createObjectStore(WRITING_TOPIC_STORE, { keyPath: 'id' });
                topicStore.createIndex('userId', 'userId', { unique: false });
            }
            if (!db.objectStoreNames.contains(WRITING_LOG_STORE)) {
                const logStore = db.createObjectStore(WRITING_LOG_STORE, { keyPath: 'id' });
                logStore.createIndex('userId', 'userId', { unique: false });
                logStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        }

        if (event.oldVersion < 11) {
            // This store name is now deprecated. Will be cleaned up by browser if not used.
        }

        if (event.oldVersion < 12) {
            if (db.objectStoreNames.contains('word_comparison_groups')) {
                db.deleteObjectStore('word_comparison_groups');
            }
            if (!db.objectStoreNames.contains(COMPARISON_STORE)) {
                const pairStore = db.createObjectStore(COMPARISON_STORE, { keyPath: 'id' });
                pairStore.createIndex('userId', 'userId', { unique: false });
            }
        }

        if (event.oldVersion < 13) {
            if (!db.objectStoreNames.contains(IRREGULAR_VERBS_STORE)) {
                const verbStore = db.createObjectStore(IRREGULAR_VERBS_STORE, { keyPath: 'id' });
                verbStore.createIndex('userId', 'userId', { unique: false });
            }
        }
      };
      request.onsuccess = () => {
        _dbInstance = request.result;
        _dbInstance.onclose = () => { _dbInstance = null; _dbPromise = null; };
        _dbInstance.onversionchange = () => { _dbInstance?.close(); _dbInstance = null; _dbPromise = null; window.location.reload(); };
        resolve(_dbInstance);
      };
      request.onerror = (event) => { _dbPromise = null; reject((event.target as IDBOpenDBRequest).error); };
    } catch (e) { _dbPromise = null; reject(e); }
  });

  return _dbPromise;
};

export const clearVocabularyOnly = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stores: string[] = [STORE_NAME, UNIT_STORE, LOG_STORE, SPEAKING_LOG_STORE, SPEAKING_TOPIC_STORE, WRITING_LOG_STORE, WRITING_TOPIC_STORE, COMPARISON_STORE, IRREGULAR_VERBS_STORE];
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const seedDatabaseIfEmpty = async (force: boolean = false): Promise<User | null> => {
  const db = await openDB();
  
  // 1. Check existing users
  const usersTx = db.transaction(USER_STORE, 'readonly');
  const existingUsers = await new Promise<User[]>((resolve, reject) => {
      const req = usersTx.objectStore(USER_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
  });

  // 2. Check existing vocabulary
  const vocabTx = db.transaction(STORE_NAME, 'readonly');
  const countReq = vocabTx.objectStore(STORE_NAME).count();
  
  const hasData = await new Promise<boolean>((resolve) => {
    countReq.onsuccess = () => resolve(countReq.result > 0);
    countReq.onerror = () => resolve(false);
  });
  
  // 3. Decision Logic:
  // If we have users, we generally respect the existing data state and skip seeding unless forced.
  // HOWEVER, if we have NO users (existingUsers.length === 0), we MUST seed a user, 
  // even if 'hasData' is true (which implies orphaned vocabulary).
  if (!force && existingUsers.length > 0) {
      if (hasData || sessionStorage.getItem('ielts_pro_skip_seed') === 'true') {
          return null;
      }
  }

  let targetUser: User;
  if (existingUsers.length === 0) {
    targetUser = {
      id: DEFAULT_USER_ID,
      name: "Vocab Master",
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=Master`,
      lastLogin: Date.now(),
      role: "Language Learner",
      currentLevel: "Intermediate",
      target: "Advanced Fluency",
      experience: 0,
      level: 1,
      peakLevel: 1,
      adventure: {
        currentNodeIndex: 0,
        energy: 5,
        energyShards: 0,
        unlockedChapterIds: ADVENTURE_CHAPTERS.map(c => c.id),
        completedSegmentIds: [],
        segmentStars: {},
        badges: [],
        keys: 1,
        keyFragments: 0,
        map: [], // Will be generated if empty
      }
    };
    await saveUser(targetUser);
  } else {
    targetUser = existingUsers[0];
    if (targetUser.experience === undefined) targetUser.experience = 0;
    if (targetUser.level === undefined) targetUser.level = 1;
    if (targetUser.peakLevel === undefined) targetUser.peakLevel = targetUser.level;
    
    // Ensure Adventure structure is valid
    if (!targetUser.adventure) {
        targetUser.adventure = {
            currentNodeIndex: 0,
            energy: 5,
            energyShards: 0,
            unlockedChapterIds: ADVENTURE_CHAPTERS.map(c => c.id),
            completedSegmentIds: [],
            segmentStars: {},
            badges: [],
            keys: 1,
            keyFragments: 0,
            map: []
        };
    }
    await saveUser(targetUser); 
  }

  // Only seed vocabulary if there is no data
  if (!hasData) {
      let vocabToSeed: VocabularyItem[] = [];
      try {
        const localResponse = await fetch(LOCAL_SHIPPED_DATA_PATH);
        if (localResponse.ok) {
          const json = await localResponse.json();
          vocabToSeed = Array.isArray(json) ? json : (json.vocabulary || []);
        }
      } catch (e) { console.error("Failed to fetch local seed data:", e); }

      if (vocabToSeed.length === 0) vocabToSeed = initialVocabulary;
      const finalVocab = vocabToSeed.map(item => ({
        ...item,
        userId: targetUser.id,
        nextReview: item.nextReview || Date.now(),
        lastXpEarnedTime: item.lastXpEarnedTime || undefined, 
        quality: item.quality || WordQuality.VERIFIED,
        source: 'app' as WordSource
      }));

      await bulkSaveWords(finalVocab);
  }
  
  return targetUser;
};

export const getAllUsers = async (): Promise<User[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_STORE, 'readonly');
    const req = tx.objectStore(USER_STORE).getAll();
    req.onsuccess = () => { resolve(req.result || []); };
    req.onerror = () => { reject(req.error); };
  });
};

export const saveUser = async (user: User): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_STORE, 'readwrite');
    tx.objectStore(USER_STORE).put(user);
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error); };
  });
};

export const findWordByText = async (userId: string, wordText: string): Promise<VocabularyItem | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const target = wordText.trim(); 
    
    const resolveImmediately = (result: VocabularyItem | null) => resolve(result);

    const useCursorFallback = (currentDb: IDBDatabase, currentUserId: string, currentTarget: string) => {
        const fallbackTx = currentDb.transaction(STORE_NAME, 'readonly');
        const index = fallbackTx.objectStore(STORE_NAME).index('userId');
        const req = index.openCursor(IDBKeyRange.only(currentUserId));
        const targetLower = currentTarget.toLowerCase();
        
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) { if (cursor.value.word.toLowerCase().trim() === targetLower) resolveImmediately(cursor.value); else cursor.continue(); } 
          else { resolveImmediately(null); }
        };
        req.onerror = () => resolveImmediately(null);
    };

    if (store.indexNames.contains('userId_word')) {
        const index = store.index('userId_word');
        const req = index.get([userId, target]); 
        req.onsuccess = () => { if (req.result) resolveImmediately(req.result); else useCursorFallback(db, userId, target); };
        req.onerror = () => useCursorFallback(db, userId, target);
    } else { useCursorFallback(db, userId, target); }
  });
};

const GENERIC_DISTRACTORS = [ "To express an idea or feeling", "A state of great comfort and luxury", "Happening or developing gradually", "To influence or change someone or something", "A formal meeting for discussion", "Necessary for a particular purpose", "The ability to do something well", "A careful and detailed study of something", "To make something new or original", ];

export const getRandomMeanings = async (userId: string, count: number, excludeId: string): Promise<string[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('userId');
    const req = index.getAll(IDBKeyRange.only(userId));

    req.onsuccess = () => {
      const allItems = req.result as VocabularyItem[];
      const potential = allItems.filter(i => i.id !== excludeId && i.quality === WordQuality.VERIFIED && i.meaningVi && i.meaningVi.trim().length > 0 && i.meaningVi.length < 150).map(i => i.meaningVi);
      const shuffled = [...potential].sort(() => Math.random() - 0.5);
      let finalMeanings = shuffled.slice(0, count);
      if (finalMeanings.length < count) {
          const needed = count - finalMeanings.length;
          const shuffledGenerics = [...GENERIC_DISTRACTORS].sort(() => Math.random() - 0.5);
          for (let i = 0; i < needed; i++) {
              const genericToAdd = shuffledGenerics[i % shuffledGenerics.length];
              if (!finalMeanings.includes(genericToAdd)) finalMeanings.push(genericToAdd);
          }
      }
      resolve([...finalMeanings].sort(() => Math.random() - 0.5));
    };
    req.onerror = () => { resolve([...GENERIC_DISTRACTORS].sort(() => Math.random() - 0.5).slice(0, count)); }; 
  });
};

export const filterItem = (item: VocabularyItem, query: string, filterTypes: string[], refinedFilter: string, statusFilter: string, registerFilter: string, sourceFilter: string = 'all') => {
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery && !(item.word.toLowerCase().includes(lowerQuery) || item.meaningVi.toLowerCase().includes(lowerQuery))) return false;
    if (item.isPassive && !filterTypes.includes('archive')) return false;

    if (refinedFilter !== 'all') {
        if ((refinedFilter === 'refined' && item.quality !== WordQuality.REFINED) ||
            (refinedFilter === 'verified' && item.quality !== WordQuality.VERIFIED) ||
            (refinedFilter === 'failed' && item.quality !== WordQuality.FAILED) ||
            (refinedFilter === 'raw' && item.quality !== WordQuality.RAW) ||
            (refinedFilter === 'not_refined' && item.quality !== WordQuality.RAW)) return false;
    }
    if (statusFilter !== 'all') {
        const isNew = !item.lastReview;
        const isLearned = !!item.lastReview && item.consecutiveCorrect === 1 && item.lastGrade !== ReviewGrade.FORGOT;
        const isEasy = !!item.lastReview && item.consecutiveCorrect > 1 && item.lastGrade === ReviewGrade.EASY;
        const isHard = !!item.lastReview && item.consecutiveCorrect > 1 && item.lastGrade === ReviewGrade.HARD;
        const isForgot = !!item.lastReview && item.lastGrade === ReviewGrade.FORGOT;
        if ((statusFilter === 'new' && !isNew) || (statusFilter === 'learned' && !isLearned) || (statusFilter === 'easy' && !isEasy) || (statusFilter === 'hard' && !isHard) || (statusFilter === 'forgot' && !isForgot)) return false;
    }
    if (registerFilter !== 'all' && (item.register || 'raw') !== registerFilter) return false;
    if (sourceFilter !== 'all' && (item.source || 'raw') !== sourceFilter) return false;

    const isAll = filterTypes.includes('all') || filterTypes.length === 0;
    if (isAll) return !item.isPassive; 
    for (const type of filterTypes) {
        if ((type === 'archive' && item.isPassive) || (type === 'idiom' && item.isIdiom) || (type === 'phrasal' && item.isPhrasalVerb) || (type === 'colloc' && item.isCollocation) || (type === 'phrase' && item.isStandardPhrase) || (type === 'pronun' && item.needsPronunciationFocus) || (type === 'preposition' && item.prepositions && item.prepositions.length > 0 && !item.isPhrasalVerb) || (type === 'vocab' && !item.isIdiom && !item.isPhrasalVerb && !item.isCollocation && !item.isStandardPhrase)) return true;
    }
    return false;
};

// --- CRUD for VocabularyItem and related ---
export const getReviewCounts = async (userId: string): Promise<{ total: number, due: number, newWords: number, learned: number }> => {
  const db = await openDB();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => {
      const all = (req.result || []) as VocabularyItem[];
      const active = all.filter(w => !w.isPassive);
      resolve({ total: active.length, due: active.filter(w => w.lastReview && w.nextReview <= now && w.quality === WordQuality.VERIFIED).length, newWords: active.filter(w => !w.lastReview && w.quality === WordQuality.VERIFIED).length, learned: active.filter(w => !!w.lastReview).length });
    };
    req.onerror = () => reject(req.error);
  });
};

export const getDueWords = async (userId: string, limit: number = 30): Promise<VocabularyItem[]> => {
  const db = await openDB();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('userId');
    const req = index.getAll(IDBKeyRange.only(userId));

    req.onsuccess = () => {
      const allItems = (req.result || []) as VocabularyItem[];
      const dueWords = allItems
        .filter(w => !w.isPassive && w.lastReview && w.nextReview <= now && w.quality === WordQuality.VERIFIED)
        .sort((a, b) => a.nextReview - b.nextReview)
        .slice(0, limit);
      resolve(dueWords);
    };
    req.onerror = () => reject(req.error);
  });
};
export const getNewWords = async (userId: string, limit: number = 20): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('userId');
    const req = index.getAll(IDBKeyRange.only(userId));

    req.onsuccess = () => {
      const allItems = (req.result || []) as VocabularyItem[];
      const newWords = allItems
        .filter(w => !w.isPassive && !w.lastReview && w.quality === WordQuality.VERIFIED)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit);
      resolve(newWords);
    };
    req.onerror = () => reject(req.error);
  });
};

const crudTemplate = async <T,>(storeName: string | string[], operation: (tx: IDBTransaction) => IDBRequest | void, mode: IDBTransactionMode = 'readwrite'): Promise<T> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = operation(tx);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
    });
};

export const saveWordAndUser = async (word: VocabularyItem, user: User): Promise<void> => {
    await crudTemplate<void>([STORE_NAME, USER_STORE], (tx) => {
        tx.objectStore(STORE_NAME).put(word);
        tx.objectStore(USER_STORE).put(user);
    });
};

export const saveWord = async (item: VocabularyItem): Promise<void> => { item.updatedAt = Date.now(); await crudTemplate(STORE_NAME, tx => tx.objectStore(STORE_NAME).put(item)); };
export const deleteWordFromDB = async (id: string): Promise<void> => { await crudTemplate(STORE_NAME, tx => tx.objectStore(STORE_NAME).delete(id)); };
export const bulkDeleteWords = async (ids: string[]): Promise<void> => { await crudTemplate(STORE_NAME, tx => { const store = tx.objectStore(STORE_NAME); ids.forEach(id => store.delete(id)); }); };
export const bulkSaveWords = async (items: VocabularyItem[]): Promise<void> => { await crudTemplate(STORE_NAME, tx => { const store = tx.objectStore(STORE_NAME); items.forEach(i => store.put(i)); }); };
export const getAllWordsForExport = async (userId: string): Promise<VocabularyItem[]> => await crudTemplate(STORE_NAME, tx => tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const saveUnit = async (unit: Unit): Promise<void> => { unit.updatedAt = Date.now(); await crudTemplate(UNIT_STORE, tx => tx.objectStore(UNIT_STORE).put(unit)); };
export const deleteUnit = async (id: string): Promise<void> => { await crudTemplate(UNIT_STORE, tx => tx.objectStore(UNIT_STORE).delete(id)); };
export const getUnitsByUserId = async (userId: string): Promise<Unit[]> => await crudTemplate(UNIT_STORE, tx => tx.objectStore(UNIT_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const getUnitsContainingWord = async (userId: string, wordId: string): Promise<Unit[]> => { const units = await getUnitsByUserId(userId); return units.filter(u => u.wordIds.includes(wordId)); };
export const bulkSaveUnits = async (items: Unit[]): Promise<void> => { await crudTemplate(UNIT_STORE, tx => { const store = tx.objectStore(UNIT_STORE); items.forEach(i => store.put(i)); }); };
export const saveParaphraseLog = async (log: ParaphraseLog): Promise<void> => { await crudTemplate(LOG_STORE, tx => tx.objectStore(LOG_STORE).put(log)); };
export const getParaphraseLogs = async (userId: string): Promise<ParaphraseLog[]> => { const logs = await crudTemplate<ParaphraseLog[]>(LOG_STORE, tx => tx.objectStore(LOG_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly'); return logs.sort((a,b) => b.timestamp - a.timestamp); };
export const bulkSaveParaphraseLogs = async (items: ParaphraseLog[]): Promise<void> => { await crudTemplate(LOG_STORE, tx => { const store = tx.objectStore(LOG_STORE); items.forEach(i => store.put(i)); }); };

// --- Speaking Feature ---
export const saveSpeakingLog = async (log: SpeakingLog): Promise<void> => { await crudTemplate(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).put(log)); };
export const getSpeakingLogs = async (userId: string): Promise<SpeakingLog[]> => { const logs = await crudTemplate<SpeakingLog[]>(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly'); return logs.sort((a,b) => b.timestamp - a.timestamp); };
export const deleteSpeakingLog = async (id: string): Promise<void> => { await crudTemplate(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).delete(id)); };
export const getAllSpeakingLogsForExport = async (userId: string): Promise<SpeakingLog[]> => await crudTemplate(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const bulkSaveSpeakingLogs = async (items: SpeakingLog[]): Promise<void> => { await crudTemplate(SPEAKING_LOG_STORE, tx => { const store = tx.objectStore(SPEAKING_LOG_STORE); items.forEach(i => store.put(i)); }); };

export const saveSpeakingTopic = async (topic: SpeakingTopic): Promise<void> => { topic.updatedAt = Date.now(); await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).put(topic)); };
export const deleteSpeakingTopic = async (id: string): Promise<void> => { await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).delete(id)); };
export const getSpeakingTopicsByUserId = async (userId: string): Promise<SpeakingTopic[]> => await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const getAllSpeakingTopicsForExport = async (userId: string): Promise<SpeakingTopic[]> => await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const bulkSaveSpeakingTopics = async (items: SpeakingTopic[]): Promise<void> => { await crudTemplate(SPEAKING_TOPIC_STORE, tx => { const store = tx.objectStore(SPEAKING_TOPIC_STORE); items.forEach(i => store.put(i)); }); };

// --- Writing Feature ---
export const saveWritingLog = async (log: WritingLog): Promise<void> => { await crudTemplate(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).put(log)); };
export const getWritingLogs = async (userId: string): Promise<WritingLog[]> => { const logs = await crudTemplate<WritingLog[]>(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly'); return logs.sort((a,b) => b.timestamp - a.timestamp); };
export const deleteWritingLog = async (id: string): Promise<void> => { await crudTemplate(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).delete(id)); };
export const getAllWritingLogsForExport = async (userId: string): Promise<WritingLog[]> => await crudTemplate(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const bulkSaveWritingLogs = async (items: WritingLog[]): Promise<void> => { await crudTemplate(WRITING_LOG_STORE, tx => { const store = tx.objectStore(WRITING_LOG_STORE); items.forEach(i => store.put(i)); }); };

export const saveWritingTopic = async (topic: WritingTopic): Promise<void> => { topic.updatedAt = Date.now(); await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).put(topic)); };
export const deleteWritingTopic = async (id: string): Promise<void> => { await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).delete(id)); };
export const getWritingTopicsByUserId = async (userId: string): Promise<WritingTopic[]> => await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const getAllWritingTopicsForExport = async (userId: string): Promise<WritingTopic[]> => await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const bulkSaveWritingTopics = async (items: WritingTopic[]): Promise<void> => { await crudTemplate(WRITING_TOPIC_STORE, tx => { const store = tx.objectStore(WRITING_TOPIC_STORE); items.forEach(i => store.put(i)); }); };

// --- Comparison Feature ---
export const saveComparisonGroup = async (group: ComparisonGroup): Promise<void> => { group.updatedAt = Date.now(); await crudTemplate(COMPARISON_STORE, tx => tx.objectStore(COMPARISON_STORE).put(group)); };
export const getComparisonGroupsByUserId = async (userId: string): Promise<ComparisonGroup[]> => await crudTemplate(COMPARISON_STORE, tx => tx.objectStore(COMPARISON_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const deleteComparisonGroup = async (id: string): Promise<void> => { await crudTemplate(COMPARISON_STORE, tx => tx.objectStore(COMPARISON_STORE).delete(id)); };
export const bulkSaveComparisonGroups = async (items: ComparisonGroup[]): Promise<void> => { await crudTemplate(COMPARISON_STORE, tx => { const store = tx.objectStore(COMPARISON_STORE); items.forEach(i => store.put(i)); }); };

// --- Irregular Verbs Feature ---
export const saveIrregularVerb = async (verb: IrregularVerb): Promise<void> => { verb.updatedAt = Date.now(); await crudTemplate(IRREGULAR_VERBS_STORE, tx => tx.objectStore(IRREGULAR_VERBS_STORE).put(verb)); };
export const getIrregularVerbsByUserId = async (userId: string): Promise<IrregularVerb[]> => await crudTemplate(IRREGULAR_VERBS_STORE, tx => tx.objectStore(IRREGULAR_VERBS_STORE).index('userId').getAll(IDBKeyRange.only(userId)), 'readonly');
export const deleteIrregularVerb = async (id: string): Promise<void> => { await crudTemplate(IRREGULAR_VERBS_STORE, tx => tx.objectStore(IRREGULAR_VERBS_STORE).delete(id)); };
export const bulkSaveIrregularVerbs = async (items: IrregularVerb[]): Promise<void> => { await crudTemplate(IRREGULAR_VERBS_STORE, tx => { const store = tx.objectStore(IRREGULAR_VERBS_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteIrregularVerbs = async (ids: string[]): Promise<void> => { await crudTemplate(IRREGULAR_VERBS_STORE, tx => { const store = tx.objectStore(IRREGULAR_VERBS_STORE); ids.forEach(id => store.delete(id)); }); };