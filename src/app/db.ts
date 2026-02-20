import { VocabularyItem, User, Unit, ParaphraseLog, WordQuality, WordSource, SpeakingTopic, WritingTopic, Lesson, ListeningItem, NativeSpeakItem, Composition, ReviewGrade, WordBook, ReadingBook, LessonBook, ListeningBook, SpeakingBook, WritingBook, PlanningGoal, ConversationItem, FreeTalkItem } from './types';
import { initialVocabulary, DEFAULT_USER_ID, LOCAL_SHIPPED_DATA_PATH } from '../data/user_data';
import { ADVENTURE_CHAPTERS } from '../data/adventure_content';

const DB_NAME = 'IELTSVocabProDB_V2';
const STORE_NAME = 'vocabulary';
const USER_STORE = 'users';
const UNIT_STORE = 'units';
const LOG_STORE = 'paraphrase_logs';
const SPEAKING_LOG_STORE = 'speaking_logs';
const SPEAKING_TOPIC_STORE = 'speaking_topics';
const WRITING_TOPIC_STORE = 'writing_topics';
const WRITING_LOG_STORE = 'writing_logs';
const IRREGULAR_VERBS_STORE = 'irregular_verbs';
const LESSON_STORE = 'lessons';
const LISTENING_STORE = 'listening_items';
const NATIVE_SPEAK_STORE = 'native_speak_items';
const CONVERSATION_STORE = 'conversation_items';
const FREE_TALK_STORE = 'free_talk_items'; // New Store
const COMPOSITIONS_STORE = 'compositions';
const WORDBOOK_STORE = 'word_books';
const READING_BOOK_STORE = 'reading_books';
const LESSON_BOOK_STORE = 'lesson_books';
const LISTENING_BOOK_STORE = 'listening_books';
const SPEAKING_BOOK_STORE = 'speaking_books';
const WRITING_BOOK_STORE = 'writing_books';
const PLANNING_STORE = 'planning_goals';

const DB_VERSION = 27; // Bumped version for global migration

let _dbInstance: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

// --- PERSISTENCE REQUEST FOR SAFARI ---
export const tryPersistStorage = async () => {
    if (navigator.storage && navigator.storage.persist) {
        try {
            const isPersisted = await navigator.storage.persisted();
            if (!isPersisted) {
                await navigator.storage.persist();
            }
        } catch {
            // Silent fail is fine here
        }
    }
};

// --- DIAGNOSTIC TOOLS ---
export const getDatabaseStats = async (): Promise<Record<string, number>> => {
    try {
        const db = await openDB();
        const storeNames = Array.from(db.objectStoreNames);
        const stats: Record<string, number> = {};
        
        const tx = db.transaction(storeNames, 'readonly');
        
        await Promise.all(storeNames.map(storeName => {
            return new Promise<void>((resolve) => {
                const req = tx.objectStore(storeName).count();
                req.onsuccess = () => {
                    stats[storeName] = req.result;
                    resolve();
                };
                req.onerror = () => {
                    stats[storeName] = -1; // Error indicator
                    resolve();
                }
            });
        }));
        
        return stats;
    } catch (e) {
        console.error("Diagnostic error:", e);
        return { 'ERROR': 0 };
    }
};

export const checkLocalStorageHealth = (): { hasBackup: boolean, backupSize: number, backupTimestamp: string } => {
    const backup = localStorage.getItem('vocab_pro_emergency_backup');
    const hasBackup = !!backup;
    let size = 0;
    let timestamp = 'N/A';
    
    if (backup) {
        size = backup.length;
        // Try to estimate date from file stats (not stored directly, so just checking validity)
        try {
            const parsed = JSON.parse(backup);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Check timestamp of first item as proxy
                if (parsed[0].updatedAt) {
                    timestamp = new Date(parsed[0].updatedAt).toLocaleString();
                }
            }
        } catch {
            // Silent fail is acceptable here
        }
    }
    return { hasBackup, backupSize: size, backupTimestamp: timestamp };
};

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
      
      request.onblocked = () => {
          console.warn("[DB] Database upgrade blocked. Please close other tabs/windows of this app.");
      };

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
          // Global word index for fast lookup without userId
          vocabStore.createIndex('word', 'word', { unique: false });
        } else {
            // Migration: Add global word index if missing
            const vocabStore = request.transaction!.objectStore(STORE_NAME);
            if (!vocabStore.indexNames.contains('word')) {
                vocabStore.createIndex('word', 'word', { unique: false });
            }
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

        if (event.oldVersion < 12) {
             // Cleanup old comparison store if it exists
            if (db.objectStoreNames.contains('word_comparison_groups')) {
                db.deleteObjectStore('word_comparison_groups');
            }
        }

        if (event.oldVersion < 13) {
            if (!db.objectStoreNames.contains(IRREGULAR_VERBS_STORE)) {
                const verbStore = db.createObjectStore(IRREGULAR_VERBS_STORE, { keyPath: 'id' });
                verbStore.createIndex('userId', 'userId', { unique: false });
            }
        }
        
        if (event.oldVersion < 14) {
            if (!db.objectStoreNames.contains(LESSON_STORE)) {
                const lessonStore = db.createObjectStore(LESSON_STORE, { keyPath: 'id' });
                lessonStore.createIndex('userId', 'userId', { unique: false });
            }
        }

        if (event.oldVersion < 15) {
            if (!db.objectStoreNames.contains(LISTENING_STORE)) {
                const listeningStore = db.createObjectStore(LISTENING_STORE, { keyPath: 'id' });
                listeningStore.createIndex('userId', 'userId', { unique: false });
            }
        }

        if (event.oldVersion < 16) {
            if (!db.objectStoreNames.contains(NATIVE_SPEAK_STORE)) {
                const nativeStore = db.createObjectStore(NATIVE_SPEAK_STORE, { keyPath: 'id' });
                nativeStore.createIndex('userId', 'userId', { unique: false });
            }
        }

        if (event.oldVersion < 17) {
             if (!db.objectStoreNames.contains(COMPOSITIONS_STORE)) {
                const compositionStore = db.createObjectStore(COMPOSITIONS_STORE, { keyPath: 'id' });
                compositionStore.createIndex('userId', 'userId', { unique: false });
            }
        }
        
        // Removed Calendar Store logic for version 18 check or cleanup
        if (db.objectStoreNames.contains('calendar_events')) {
             db.deleteObjectStore('calendar_events');
        }

        if (event.oldVersion < 19) {
          if (!db.objectStoreNames.contains(WORDBOOK_STORE)) {
             const wordBookStore = db.createObjectStore(WORDBOOK_STORE, { keyPath: 'id' });
             wordBookStore.createIndex('userId', 'userId', { unique: false });
         }
        }

        if (event.oldVersion < 20) {
           if (!db.objectStoreNames.contains(READING_BOOK_STORE)) {
               const rbStore = db.createObjectStore(READING_BOOK_STORE, { keyPath: 'id' });
               rbStore.createIndex('userId', 'userId', { unique: false });
           }
        }

        if (event.oldVersion < 21) {
           if (!db.objectStoreNames.contains(LESSON_BOOK_STORE)) {
               const lbStore = db.createObjectStore(LESSON_BOOK_STORE, { keyPath: 'id' });
               lbStore.createIndex('userId', 'userId', { unique: false });
           }
        }

        if (event.oldVersion < 22) {
           if (!db.objectStoreNames.contains(LISTENING_BOOK_STORE)) {
               const lstStore = db.createObjectStore(LISTENING_BOOK_STORE, { keyPath: 'id' });
               lstStore.createIndex('userId', 'userId', { unique: false });
           }
           if (!db.objectStoreNames.contains(SPEAKING_BOOK_STORE)) {
               const spkStore = db.createObjectStore(SPEAKING_BOOK_STORE, { keyPath: 'id' });
               spkStore.createIndex('userId', 'userId', { unique: false });
           }
           if (!db.objectStoreNames.contains(WRITING_BOOK_STORE)) {
               const wrtStore = db.createObjectStore(WRITING_BOOK_STORE, { keyPath: 'id' });
               wrtStore.createIndex('userId', 'userId', { unique: false });
           }
        }

        if (event.oldVersion < 23) {
            if (!db.objectStoreNames.contains(PLANNING_STORE)) {
                const planningStore = db.createObjectStore(PLANNING_STORE, { keyPath: 'id' });
                planningStore.createIndex('userId', 'userId', { unique: false });
            }
        }

        if (event.oldVersion < 24) {
            if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
                const convStore = db.createObjectStore(CONVERSATION_STORE, { keyPath: 'id' });
                convStore.createIndex('userId', 'userId', { unique: false });
            }
        }
        
        if (event.oldVersion < 26) {
             if (!db.objectStoreNames.contains(FREE_TALK_STORE)) {
                 const ftStore = db.createObjectStore(FREE_TALK_STORE, { keyPath: 'id' });
                 ftStore.createIndex('userId', 'userId', { unique: false });
             }
        }

        // Cleanup deprecated stores if they exist
        if (db.objectStoreNames.contains('comparison_groups')) {
            db.deleteObjectStore('comparison_groups');
        }
      };
      
      request.onsuccess = () => {
        _dbInstance = request.result;
        _dbInstance.onclose = () => { 
            console.warn("[DB] Database connection closed unexpectedly.");
            _dbInstance = null; 
            _dbPromise = null; 
            window.dispatchEvent(new CustomEvent('db-connection-lost'));
        };
        _dbInstance.onversionchange = () => { 
            console.warn("[DB] Database version change detected. Closing connection.");
            _dbInstance?.close(); 
            _dbInstance = null; 
            _dbPromise = null; 
            window.location.reload(); 
        };
        resolve(_dbInstance);
      };
      
      request.onerror = (event) => { 
          console.error("[DB] Open DB Error:", (event.target as IDBOpenDBRequest).error);
          _dbPromise = null; 
          reject((event.target as IDBOpenDBRequest).error); 
      };
    } catch (e) { 
        console.error("[DB] Open DB Exception:", e);
        _dbPromise = null; 
        reject(e); 
    }
  });

  return _dbPromise;
};

// ... (Rest of existing CRUD logic) ...

export const clearVocabularyOnly = async (): Promise<void> => {
  return withRetry(async () => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const stores: string[] = [USER_STORE, STORE_NAME, UNIT_STORE, LOG_STORE, SPEAKING_LOG_STORE, SPEAKING_TOPIC_STORE, WRITING_LOG_STORE, WRITING_TOPIC_STORE, IRREGULAR_VERBS_STORE, LESSON_STORE, LISTENING_STORE, NATIVE_SPEAK_STORE, CONVERSATION_STORE, FREE_TALK_STORE, COMPOSITIONS_STORE, WORDBOOK_STORE, READING_BOOK_STORE, LESSON_BOOK_STORE, LISTENING_BOOK_STORE, SPEAKING_BOOK_STORE, WRITING_BOOK_STORE, PLANNING_STORE];
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(s => {
             if (db.objectStoreNames.contains(s)) {
                 tx.objectStore(s).clear();
             }
        });
        tx.oncomplete = () => {
            localStorage.removeItem('vocab_pro_mimic_practice_queue');
            localStorage.removeItem('vocab_pro_db_marker'); // REMOVE SAFETY MARKER
            localStorage.removeItem('vocab_pro_emergency_backup'); // Remove Emergency Backup
            resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
  });
};

// Retry wrapper for DB operations
const withRetry = async <T,>(operation: () => Promise<T>, retries = 3, delay = 200): Promise<T> => {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (err: any) {
            console.warn(`[DB] Operation failed, retrying (${i + 1}/${retries}). Error:`, err);
            
            if (err?.name === 'InvalidStateError' || err?.message?.toLowerCase().includes('closed') || err?.target?.error?.name === 'InvalidStateError') {
                 _dbInstance = null;
                 _dbPromise = null;
            }

            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        }
    }
    throw new Error("Operation failed after retries");
};

const crudTemplate = async <T,>(storeName: string | string[], operation: (tx: IDBTransaction) => IDBRequest | void, mode: IDBTransactionMode = 'readwrite'): Promise<T> => {
    return withRetry(async () => {
        const db = await openDB();
        return new Promise<T>((resolve, reject) => {
            try {
                const tx = db.transaction(storeName, mode);
                const req = operation(tx);
                
                tx.oncomplete = () => resolve(req ? (req as IDBRequest).result : undefined);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(new Error("Transaction aborted"));
            } catch (e) {
                reject(e);
            }
        });
    });
};

export const seedDatabaseIfEmpty = async (force: boolean = false): Promise<User | null> => {
  try {
      const db = await openDB();
      const usersTx = db.transaction(USER_STORE, 'readonly');
      const existingUsers = await new Promise<User[]>((resolve, reject) => {
          const req = usersTx.objectStore(USER_STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
      });

      // --- AUTO-HEAL: CHECK EMERGENCY BACKUP ---
      const emergencyBackupJson = localStorage.getItem('vocab_pro_emergency_backup');
      const dbMarker = localStorage.getItem('vocab_pro_db_marker');
      
      if (existingUsers.length === 0 && emergencyBackupJson) {
           try {
               const backup = JSON.parse(emergencyBackupJson);
               if (Array.isArray(backup) && backup.length > 0) {
                   await bulkSaveWords(backup);
                   
                   if (existingUsers.length === 0) {
                        const targetUser = {
                            id: backup[0].userId || DEFAULT_USER_ID,
                            name: "Recovered User",
                            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=Recovered`,
                            lastLogin: Date.now(),
                            role: "Language Learner",
                            experience: 0,
                            level: 1,
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
                                map: [], 
                            }
                        };
                        await saveUser(targetUser);
                        return targetUser;
                   }
               }
           } catch (e) {
               console.error("[DB] 🚑 Failed to restore from Emergency Backup:", e);
           }
      }

      if (existingUsers.length === 0 && dbMarker === 'exists' && !force) {
          console.error("[DB] 🛑 CRITICAL: LocalStorage marker found but IDB returned 0 users. Aborting auto-seed to prevent data loss.");
          return null;
      }

      const vocabTx = db.transaction(STORE_NAME, 'readonly');
      const countReq = vocabTx.objectStore(STORE_NAME).count();
      const hasData = await new Promise<boolean>((resolve) => {
        countReq.onsuccess = () => resolve(countReq.result > 0);
        countReq.onerror = () => {
            console.error("[DB] Failed to check for existing data. Assuming data exists to prevent overwrite.");
            resolve(true); 
        };
      });
      
      if (!force && existingUsers.length > 0) {
          if (dbMarker !== 'exists') {
               localStorage.setItem('vocab_pro_db_marker', 'exists');
          }
          
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
            map: [], 
          }
        };
        await saveUser(targetUser);
        localStorage.setItem('vocab_pro_db_marker', 'exists');
      } else {
        targetUser = existingUsers[0];
        if (targetUser.experience === undefined) targetUser.experience = 0;
        if (targetUser.level === undefined) targetUser.level = 1;
        if (targetUser.peakLevel === undefined) targetUser.peakLevel = targetUser.level;
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
            // userId: targetUser.id, // Stop mapping to specific user to keep data global
            nextReview: item.nextReview || Date.now(),
            lastXpEarnedTime: item.lastXpEarnedTime || undefined, 
            quality: item.quality || WordQuality.VERIFIED,
            source: 'app' as WordSource
          }));
          await bulkSaveWords(finalVocab);
      }
      return targetUser;
  } catch (e) {
      console.error("[DB] Seed check failed completely:", e);
      return null;
  }
};
export const getAllUsers = async (): Promise<User[]> => { return crudTemplate(USER_STORE, tx => tx.objectStore(USER_STORE).getAll(), 'readonly'); };
export const saveUser = async (user: User): Promise<void> => { 
    if (user && user.id) {
        localStorage.setItem('vocab_pro_db_marker', 'exists');
    }
    return crudTemplate(USER_STORE, tx => tx.objectStore(USER_STORE).put(user)); 
};
export const findWordByText = async (wordText: string): Promise<VocabularyItem | null> => {
  return withRetry(async () => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const target = wordText.trim(); 
        const resolveImmediately = (result: VocabularyItem | null) => resolve(result);
        const useCursorFallback = (currentDb: IDBDatabase, currentTarget: string) => {
            const fallbackTx = currentDb.transaction(STORE_NAME, 'readonly');
            // const index = fallbackTx.objectStore(STORE_NAME).index('userId');
            // const req = index.openCursor(IDBKeyRange.only(currentUserId));
            const req = fallbackTx.objectStore(STORE_NAME).openCursor();
            const targetLower = currentTarget.toLowerCase();
            req.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
              if (cursor) { if (cursor.value.word.toLowerCase().trim() === targetLower) resolveImmediately(cursor.value); else cursor.continue(); } 
              else { resolveImmediately(null); }
            };
            req.onerror = () => resolveImmediately(null);
        };
        if (store.indexNames.contains('word')) {
            const index = store.index('word');
            const req = index.get(target); 
            req.onsuccess = () => { if (req.result) resolveImmediately(req.result); else useCursorFallback(db, target); };
            req.onerror = () => useCursorFallback(db, target);
        } else { useCursorFallback(db, target); }
    });
  });
};
export const getRandomMeanings = async (count: number, excludeId: string): Promise<string[]> => {
  return withRetry(async () => {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        // const index = tx.objectStore(STORE_NAME).index('userId');
        // const req = index.getAll(IDBKeyRange.only(userId));
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const allItems = req.result as VocabularyItem[];
          const GENERIC_DISTRACTORS = [ "To express an idea or feeling", "A state of great comfort and luxury", "Happening or developing gradually", "To influence or change someone or something", "A formal meeting for discussion", "Necessary for a particular purpose", "The ability to do something well", "A careful and detailed study of something", "To make something new or original", ];
          const potential = Array.from(new Set(allItems.filter(i => i.id !== excludeId && i.quality === WordQuality.VERIFIED && i.meaningVi && i.meaningVi.trim().length > 0 && i.meaningVi.length < 150).map(i => i.meaningVi.trim())));
          const shuffled = [...potential].sort(() => Math.random() - 0.5);
          const finalMeanings = shuffled.slice(0, count);
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
        req.onerror = () => { resolve([]); }; 
      });
  });
};
export const filterItem = (
    item: VocabularyItem, 
    query: string, 
    filterTypes: string[], 
    refinedFilter: string, 
    statusFilter: string, 
    registerFilter: string, 
    sourceFilter: string = 'all', 
    groupFilter: string | null = null,
    compositionFilter: string = 'all',
    composedWordIds: Set<string> | null = null,
    bookFilter: string = 'all',
    bookWordIds: Set<string> | null = null
) => {
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery && !(item.word.toLowerCase().includes(lowerQuery) || item.meaningVi.toLowerCase().includes(lowerQuery))) return false;
    if (item.isPassive && !filterTypes.includes('archive')) return false;

    if (refinedFilter !== 'all') {
        if (refinedFilter === 'refined' && item.quality !== WordQuality.REFINED) return false;
        if (refinedFilter === 'verified' && item.quality !== WordQuality.VERIFIED) return false;
        if (refinedFilter === 'failed' && item.quality !== WordQuality.FAILED) return false;
        if (refinedFilter === 'raw' && item.quality !== WordQuality.RAW) return false;
        if (refinedFilter === 'not_refined' && item.quality !== WordQuality.RAW) return false;
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
    
    if (groupFilter) {
        if (groupFilter === 'Uncategorized') {
            if (item.groups && item.groups.length > 0) return false;
        } else {
            if (!item.groups?.some(t => t.startsWith(groupFilter))) return false;
        }
    }
    
    if (compositionFilter !== 'all' && composedWordIds) {
        const isComposed = composedWordIds.has(item.id);
        if (compositionFilter === 'composed' && !isComposed) return false;
        if (compositionFilter === 'not_composed' && isComposed) return false;
    }

    if (bookFilter !== 'all' && bookWordIds) {
        const isInBook = bookWordIds.has(item.word.toLowerCase());
        if (bookFilter === 'in_book' && !isInBook) return false;
        if (bookFilter === 'not_in_book' && isInBook) return false;
    }

    const isAll = filterTypes.includes('all') || filterTypes.length === 0;
    if (isAll) return !item.isPassive; 
    for (const type of filterTypes) {
        if ((type === 'archive' && item.isPassive) || (type === 'idiom' && item.isIdiom) || (type === 'phrasal' && item.isPhrasalVerb) || (type === 'colloc' && item.isCollocation) || (type === 'phrase' && item.isStandardPhrase) || (type === 'vocab' && !item.isIdiom && !item.isPhrasalVerb && !item.isCollocation && !item.isStandardPhrase)) return true;
    }
    return false;
};
export const getReviewCounts = async (): Promise<{ total: number, due: number, newWords: number, learned: number }> => {
  return withRetry(async () => {
      const db = await openDB();
      const now = Date.now();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        // const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const all = (req.result || []) as VocabularyItem[];
          const active = all.filter(w => !w.isPassive);
          const isDueWord = (w: VocabularyItem) => w.lastReview && w.nextReview <= now && w.quality !== WordQuality.FAILED;
          const isNewWord = (w: VocabularyItem) => !w.lastReview && w.quality === WordQuality.VERIFIED;
          resolve({ 
              total: active.length, 
              due: active.filter(isDueWord).length, 
              newWords: active.filter(isNewWord).length, 
              learned: active.filter(w => !!w.lastReview).length 
          });
        };
        req.onerror = () => reject(req.error);
      });
  });
};
export const getDueWords = async (limit: number = 30): Promise<VocabularyItem[]> => {
  return withRetry(async () => {
      const db = await openDB();
      const now = Date.now();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        // const index = tx.objectStore(STORE_NAME).index('userId');
        // const req = index.getAll(IDBKeyRange.only(userId));
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const allItems = (req.result || []) as VocabularyItem[];
          const dueWords = allItems
            .filter(w => !w.isPassive && w.lastReview && w.nextReview <= now && w.quality !== WordQuality.FAILED)
            .sort((a, b) => a.nextReview - b.nextReview)
            .slice(0, limit);
          resolve(dueWords);
        };
        req.onerror = () => reject(req.error);
      });
  });
};
export const getNewWords = async (limit: number = 20): Promise<VocabularyItem[]> => {
  return withRetry(async () => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        // const index = tx.objectStore(STORE_NAME).index('userId');
        // const req = index.getAll(IDBKeyRange.only(userId));
        const req = tx.objectStore(STORE_NAME).getAll();
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
  });
};
export const saveWordAndUser = async (word: VocabularyItem, user: User): Promise<void> => {
    if (user && user.id) localStorage.setItem('vocab_pro_db_marker', 'exists');
    await crudTemplate<void>([STORE_NAME, USER_STORE], (tx) => {
        tx.objectStore(STORE_NAME).put(word);
        tx.objectStore(USER_STORE).put(user);
    });
};
export const saveWordAndUnit = async (word: VocabularyItem | null, unit: Unit): Promise<void> => {
    await crudTemplate<void>([STORE_NAME, UNIT_STORE], (tx) => {
        if (word) {
            tx.objectStore(STORE_NAME).put(word);
        }
        tx.objectStore(UNIT_STORE).put(unit);
    });
};
export const saveWord = async (item: VocabularyItem): Promise<void> => { 
    item.updatedAt = Date.now(); 
    // if (!item.userId) {
    //    console.error(`[DB_CRITICAL] Attempting to save word ${item.word} with NO USER ID!`);
    //    throw new Error("Cannot save word without UserID");
    // }
    await crudTemplate(STORE_NAME, tx => tx.objectStore(STORE_NAME).put(item)); 
};
export const deleteWordFromDB = async (id: string): Promise<void> => { 
    await crudTemplate(STORE_NAME, tx => tx.objectStore(STORE_NAME).delete(id)); 
};
export const bulkDeleteWords = async (ids: string[]): Promise<void> => { 
    await crudTemplate(STORE_NAME, tx => { const store = tx.objectStore(STORE_NAME); ids.forEach(id => store.delete(id)); }); 
};
export const bulkSaveWords = async (items: VocabularyItem[]): Promise<void> => { 
    if (items.length === 0) return;
    // if (!items[0].userId) {
    //      console.error(`[DB_CRITICAL] Attempting to bulk save words with NO USER ID on first item!`);
    //      throw new Error("Cannot bulk save words without UserID");
    // }
    await crudTemplate(STORE_NAME, tx => { const store = tx.objectStore(STORE_NAME); items.forEach(i => store.put(i)); }); 
};
export const getAllWordsForExport = async (): Promise<VocabularyItem[]> => await crudTemplate(STORE_NAME, tx => tx.objectStore(STORE_NAME).getAll(), 'readonly');
export const saveUnit = async (unit: Unit): Promise<void> => { unit.updatedAt = Date.now(); await crudTemplate(UNIT_STORE, tx => tx.objectStore(UNIT_STORE).put(unit)); };
export const deleteUnit = async (id: string): Promise<void> => { await crudTemplate(UNIT_STORE, tx => tx.objectStore(UNIT_STORE).delete(id)); };
export const getUnitsByUserId = async (): Promise<Unit[]> => await crudTemplate(UNIT_STORE, tx => tx.objectStore(UNIT_STORE).getAll(), 'readonly');
export const getUnitsContainingWord = async (wordId: string): Promise<Unit[]> => { const units = await getUnitsByUserId(); return units.filter(u => u.wordIds.includes(wordId)); };
export const bulkSaveUnits = async (items: Unit[]): Promise<void> => { await crudTemplate(UNIT_STORE, tx => { const store = tx.objectStore(UNIT_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteUnits = async (ids: string[]): Promise<void> => { await crudTemplate(UNIT_STORE, tx => { const store = tx.objectStore(UNIT_STORE); ids.forEach(id => store.delete(id)); }); };
export const saveParaphraseLog = async (log: ParaphraseLog): Promise<void> => { await crudTemplate(LOG_STORE, tx => tx.objectStore(LOG_STORE).put(log)); };
export const getParaphraseLogs = async (): Promise<ParaphraseLog[]> => { const logs = await crudTemplate<ParaphraseLog[]>(LOG_STORE, tx => tx.objectStore(LOG_STORE).getAll(), 'readonly'); return logs.sort((a,b) => b.timestamp - a.timestamp); };
export const bulkSaveParaphraseLogs = async (items: ParaphraseLog[]): Promise<void> => { await crudTemplate(LOG_STORE, tx => { const store = tx.objectStore(LOG_STORE); items.forEach(i => store.put(i)); }); };

// --- Speaking Feature ---
export const saveSpeakingLog = async (log: SpeakingLog): Promise<void> => { await crudTemplate(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).put(log)); };
export const getSpeakingLogs = async (): Promise<SpeakingLog[]> => { const logs = await crudTemplate<SpeakingLog[]>(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).getAll(), 'readonly'); return logs.sort((a,b) => b.timestamp - a.timestamp); };
export const deleteSpeakingLog = async (id: string): Promise<void> => { await crudTemplate(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).delete(id)); };
export const getAllSpeakingLogsForExport = async (): Promise<SpeakingLog[]> => await crudTemplate(SPEAKING_LOG_STORE, tx => tx.objectStore(SPEAKING_LOG_STORE).getAll(), 'readonly');
export const bulkSaveSpeakingLogs = async (items: SpeakingLog[]): Promise<void> => { await crudTemplate(SPEAKING_LOG_STORE, tx => { const store = tx.objectStore(SPEAKING_LOG_STORE); items.forEach(i => store.put(i)); }); };

export const saveSpeakingTopic = async (topic: SpeakingTopic): Promise<void> => { topic.updatedAt = Date.now(); await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).put(topic)); };
export const deleteSpeakingTopic = async (id: string): Promise<void> => { await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).delete(id)); };
export const getSpeakingTopicsByUserId = async (): Promise<SpeakingTopic[]> => await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).getAll(), 'readonly');
export const getAllSpeakingTopicsForExport = async (): Promise<SpeakingTopic[]> => await crudTemplate(SPEAKING_TOPIC_STORE, tx => tx.objectStore(SPEAKING_TOPIC_STORE).getAll(), 'readonly');
export const bulkSaveSpeakingTopics = async (items: SpeakingTopic[]): Promise<void> => { await crudTemplate(SPEAKING_TOPIC_STORE, tx => { const store = tx.objectStore(SPEAKING_TOPIC_STORE); items.forEach(i => store.put(i)); }); };

// --- Native Speak & Conversation Features ---
export const saveNativeSpeakItem = async (item: NativeSpeakItem): Promise<void> => { item.updatedAt = Date.now(); await crudTemplate(NATIVE_SPEAK_STORE, tx => tx.objectStore(NATIVE_SPEAK_STORE).put(item)); };
export const getNativeSpeakItemsByUserId = async (): Promise<NativeSpeakItem[]> => await crudTemplate(NATIVE_SPEAK_STORE, tx => tx.objectStore(NATIVE_SPEAK_STORE).getAll(), 'readonly');
export const deleteNativeSpeakItem = async (id: string): Promise<void> => { await crudTemplate(NATIVE_SPEAK_STORE, tx => tx.objectStore(NATIVE_SPEAK_STORE).delete(id)); };
export const bulkSaveNativeSpeakItems = async (items: NativeSpeakItem[]): Promise<void> => { await crudTemplate(NATIVE_SPEAK_STORE, tx => { const store = tx.objectStore(NATIVE_SPEAK_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteNativeSpeakItems = async (ids: string[]): Promise<void> => { await crudTemplate(NATIVE_SPEAK_STORE, tx => { const store = tx.objectStore(NATIVE_SPEAK_STORE); ids.forEach(id => store.delete(id)); }); };

export const saveConversationItem = async (item: ConversationItem): Promise<void> => { item.updatedAt = Date.now(); await crudTemplate(CONVERSATION_STORE, tx => tx.objectStore(CONVERSATION_STORE).put(item)); };
export const getConversationItemsByUserId = async (): Promise<ConversationItem[]> => await crudTemplate(CONVERSATION_STORE, tx => tx.objectStore(CONVERSATION_STORE).getAll(), 'readonly');
export const deleteConversationItem = async (id: string): Promise<void> => { await crudTemplate(CONVERSATION_STORE, tx => tx.objectStore(CONVERSATION_STORE).delete(id)); };
export const bulkSaveConversationItems = async (items: ConversationItem[]): Promise<void> => { await crudTemplate(CONVERSATION_STORE, tx => { const store = tx.objectStore(CONVERSATION_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteConversationItems = async (ids: string[]): Promise<void> => { await crudTemplate(CONVERSATION_STORE, tx => { const store = tx.objectStore(CONVERSATION_STORE); ids.forEach(id => store.delete(id)); }); };

// --- Free Talk Feature ---
export const saveFreeTalkItem = async (item: FreeTalkItem): Promise<void> => { item.updatedAt = Date.now(); await crudTemplate(FREE_TALK_STORE, tx => tx.objectStore(FREE_TALK_STORE).put(item)); };
export const getFreeTalkItemsByUserId = async (): Promise<FreeTalkItem[]> => await crudTemplate(FREE_TALK_STORE, tx => tx.objectStore(FREE_TALK_STORE).getAll(), 'readonly');
export const deleteFreeTalkItem = async (id: string): Promise<void> => { await crudTemplate(FREE_TALK_STORE, tx => tx.objectStore(FREE_TALK_STORE).delete(id)); };
export const bulkSaveFreeTalkItems = async (items: FreeTalkItem[]): Promise<void> => { await crudTemplate(FREE_TALK_STORE, tx => { const store = tx.objectStore(FREE_TALK_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteFreeTalkItems = async (ids: string[]): Promise<void> => { await crudTemplate(FREE_TALK_STORE, tx => { const store = tx.objectStore(FREE_TALK_STORE); ids.forEach(id => store.delete(id)); }); };

// --- Writing Feature ---
export const saveWritingLog = async (log: WritingLog): Promise<void> => { await crudTemplate(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).put(log)); };
export const getWritingLogs = async (): Promise<WritingLog[]> => { const logs = await crudTemplate<WritingLog[]>(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).getAll(), 'readonly'); return logs.sort((a,b) => b.timestamp - a.timestamp); };
export const deleteWritingLog = async (id: string): Promise<void> => { await crudTemplate(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).delete(id)); };
export const getAllWritingLogsForExport = async (): Promise<WritingLog[]> => await crudTemplate(WRITING_LOG_STORE, tx => tx.objectStore(WRITING_LOG_STORE).getAll(), 'readonly');
export const bulkSaveWritingLogs = async (items: WritingLog[]): Promise<void> => { await crudTemplate(WRITING_LOG_STORE, tx => { const store = tx.objectStore(WRITING_LOG_STORE); items.forEach(i => store.put(i)); }); };

export const saveWritingTopic = async (topic: WritingTopic): Promise<void> => { topic.updatedAt = Date.now(); await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).put(topic)); };
export const deleteWritingTopic = async (id: string): Promise<void> => { await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).delete(id)); };
export const getWritingTopicsByUserId = async (): Promise<WritingTopic[]> => await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).getAll(), 'readonly');
export const getAllWritingTopicsForExport = async (): Promise<WritingTopic[]> => await crudTemplate(WRITING_TOPIC_STORE, tx => tx.objectStore(WRITING_TOPIC_STORE).getAll(), 'readonly');
export const bulkSaveWritingTopics = async (items: WritingTopic[]): Promise<void> => { await crudTemplate(WRITING_TOPIC_STORE, tx => { const store = tx.objectStore(WRITING_TOPIC_STORE); items.forEach(i => store.put(i)); }); };

// --- Irregular Verbs Feature ---
export const saveIrregularVerb = async (verb: IrregularVerb): Promise<void> => { verb.updatedAt = Date.now(); await crudTemplate(IRREGULAR_VERBS_STORE, tx => tx.objectStore(IRREGULAR_VERBS_STORE).put(verb)); };
export const getIrregularVerbsByUserId = async (): Promise<IrregularVerb[]> => await crudTemplate(IRREGULAR_VERBS_STORE, tx => tx.objectStore(IRREGULAR_VERBS_STORE).getAll(), 'readonly');
export const deleteIrregularVerb = async (id: string): Promise<void> => { await crudTemplate(IRREGULAR_VERBS_STORE, tx => tx.objectStore(IRREGULAR_VERBS_STORE).delete(id)); };
export const bulkSaveIrregularVerbs = async (items: IrregularVerb[]): Promise<void> => { await crudTemplate(IRREGULAR_VERBS_STORE, tx => { const store = tx.objectStore(IRREGULAR_VERBS_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteIrregularVerbs = async (ids: string[]): Promise<void> => { await crudTemplate(IRREGULAR_VERBS_STORE, tx => { const store = tx.objectStore(IRREGULAR_VERBS_STORE); ids.forEach(id => store.delete(id)); }); };

// --- Lessons Feature ---
export const saveLesson = async (lesson: Lesson): Promise<void> => { lesson.updatedAt = Date.now(); await crudTemplate(LESSON_STORE, tx => tx.objectStore(LESSON_STORE).put(lesson)); };
export const getLessonsByUserId = async (): Promise<Lesson[]> => await crudTemplate(LESSON_STORE, tx => tx.objectStore(LESSON_STORE).getAll(), 'readonly');
export const deleteLesson = async (id: string): Promise<void> => { await crudTemplate(LESSON_STORE, tx => tx.objectStore(LESSON_STORE).delete(id)); };
export const bulkSaveLessons = async (items: Lesson[]): Promise<void> => { await crudTemplate(LESSON_STORE, tx => { const store = tx.objectStore(LESSON_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteLessons = async (ids: string[]): Promise<void> => { await crudTemplate(LESSON_STORE, tx => { const store = tx.objectStore(LESSON_STORE); ids.forEach(id => store.delete(id)); }); };

// --- Listening Items Feature ---
export const saveListeningItem = async (item: ListeningItem): Promise<void> => { item.updatedAt = Date.now(); await crudTemplate(LISTENING_STORE, tx => tx.objectStore(LISTENING_STORE).put(item)); };
export const getListeningItemsByUserId = async (): Promise<ListeningItem[]> => await crudTemplate(LISTENING_STORE, tx => tx.objectStore(LISTENING_STORE).getAll(), 'readonly');
export const deleteListeningItem = async (id: string): Promise<void> => { await crudTemplate(LISTENING_STORE, tx => tx.objectStore(LISTENING_STORE).delete(id)); };
export const bulkSaveListeningItems = async (items: ListeningItem[]): Promise<void> => { await crudTemplate(LISTENING_STORE, tx => { const store = tx.objectStore(LISTENING_STORE); items.forEach(i => store.put(i)); }); };

// --- Composition Feature ---
export const saveComposition = async (comp: Composition): Promise<void> => { comp.updatedAt = Date.now(); await crudTemplate(COMPOSITIONS_STORE, tx => tx.objectStore(COMPOSITIONS_STORE).put(comp)); };
export const getCompositionsByUserId = async (): Promise<Composition[]> => await crudTemplate(COMPOSITIONS_STORE, tx => tx.objectStore(COMPOSITIONS_STORE).getAll(), 'readonly');
export const deleteComposition = async (id: string): Promise<void> => { await crudTemplate(COMPOSITIONS_STORE, tx => tx.objectStore(COMPOSITIONS_STORE).delete(id)); };
export const bulkSaveCompositions = async (items: Composition[]): Promise<void> => { await crudTemplate(COMPOSITIONS_STORE, tx => { const store = tx.objectStore(COMPOSITIONS_STORE); items.forEach(i => store.put(i)); }); };
export const bulkDeleteCompositions = async (ids: string[]): Promise<void> => { await crudTemplate(COMPOSITIONS_STORE, tx => { const store = tx.objectStore(COMPOSITIONS_STORE); ids.forEach(id => store.delete(id)); }); };

// --- Word Book Feature ---
export const saveWordBook = async (book: WordBook): Promise<void> => { await crudTemplate(WORDBOOK_STORE, tx => tx.objectStore(WORDBOOK_STORE).put(book)); };
export const getWordBooksByUserId = async (): Promise<WordBook[]> => await crudTemplate(WORDBOOK_STORE, tx => tx.objectStore(WORDBOOK_STORE).getAll(), 'readonly');
export const deleteWordBook = async (id: string): Promise<void> => { await crudTemplate(WORDBOOK_STORE, tx => tx.objectStore(WORDBOOK_STORE).delete(id)); };
export const bulkSaveWordBooks = async (items: WordBook[]): Promise<void> => { await crudTemplate(WORDBOOK_STORE, tx => { const store = tx.objectStore(WORDBOOK_STORE); items.forEach(i => store.put(i)); }); };

// --- Reading Book Feature ---
export const saveReadingBook = async (book: ReadingBook): Promise<void> => { await crudTemplate(READING_BOOK_STORE, tx => tx.objectStore(READING_BOOK_STORE).put(book)); };
export const getReadingBooksByUserId = async (): Promise<ReadingBook[]> => await crudTemplate(READING_BOOK_STORE, tx => tx.objectStore(READING_BOOK_STORE).getAll(), 'readonly');
export const deleteReadingBook = async (id: string): Promise<void> => { await crudTemplate(READING_BOOK_STORE, tx => tx.objectStore(READING_BOOK_STORE).delete(id)); };
export const bulkSaveReadingBooks = async (items: ReadingBook[]): Promise<void> => { await crudTemplate(READING_BOOK_STORE, tx => { const store = tx.objectStore(READING_BOOK_STORE); items.forEach(i => store.put(i)); }); };

// --- Lesson Book Feature ---
export const saveLessonBook = async (book: LessonBook): Promise<void> => { await crudTemplate(LESSON_BOOK_STORE, tx => tx.objectStore(LESSON_BOOK_STORE).put(book)); };
export const getLessonBooksByUserId = async (): Promise<LessonBook[]> => await crudTemplate(LESSON_BOOK_STORE, tx => tx.objectStore(LESSON_BOOK_STORE).getAll(), 'readonly');
export const deleteLessonBook = async (id: string): Promise<void> => { await crudTemplate(LESSON_BOOK_STORE, tx => tx.objectStore(LESSON_BOOK_STORE).delete(id)); };
export const bulkSaveLessonBooks = async (items: LessonBook[]): Promise<void> => { await crudTemplate(LESSON_BOOK_STORE, tx => { const store = tx.objectStore(LESSON_BOOK_STORE); items.forEach(i => store.put(i)); }); };

// --- Listening Book Feature ---
export const saveListeningBook = async (book: ListeningBook): Promise<void> => { await crudTemplate(LISTENING_BOOK_STORE, tx => tx.objectStore(LISTENING_BOOK_STORE).put(book)); };
export const getListeningBooksByUserId = async (): Promise<ListeningBook[]> => await crudTemplate(LISTENING_BOOK_STORE, tx => tx.objectStore(LISTENING_BOOK_STORE).getAll(), 'readonly');
export const deleteListeningBook = async (id: string): Promise<void> => { await crudTemplate(LISTENING_BOOK_STORE, tx => tx.objectStore(LISTENING_BOOK_STORE).delete(id)); };
export const bulkSaveListeningBooks = async (items: ListeningBook[]): Promise<void> => { await crudTemplate(LISTENING_BOOK_STORE, tx => { const store = tx.objectStore(LISTENING_BOOK_STORE); items.forEach(i => store.put(i)); }); };

// --- Speaking Book Feature ---
export const saveSpeakingBook = async (book: SpeakingBook): Promise<void> => { await crudTemplate(SPEAKING_BOOK_STORE, tx => tx.objectStore(SPEAKING_BOOK_STORE).put(book)); };
export const getSpeakingBooksByUserId = async (): Promise<SpeakingBook[]> => await crudTemplate(SPEAKING_BOOK_STORE, tx => tx.objectStore(SPEAKING_BOOK_STORE).getAll(), 'readonly');
export const deleteSpeakingBook = async (id: string): Promise<void> => { await crudTemplate(SPEAKING_BOOK_STORE, tx => tx.objectStore(SPEAKING_BOOK_STORE).delete(id)); };
export const bulkSaveSpeakingBooks = async (items: SpeakingBook[]): Promise<void> => { await crudTemplate(SPEAKING_BOOK_STORE, tx => { const store = tx.objectStore(SPEAKING_BOOK_STORE); items.forEach(i => store.put(i)); }); };

// --- Writing Book Feature ---
export const saveWritingBook = async (book: WritingBook): Promise<void> => { await crudTemplate(WRITING_BOOK_STORE, tx => tx.objectStore(WRITING_BOOK_STORE).put(book)); };
/* Fixed: Changed getAl to getAll in the index lookup */
export const getWritingBooksByUserId = async (): Promise<WritingBook[]> => await crudTemplate(WRITING_BOOK_STORE, tx => tx.objectStore(WRITING_BOOK_STORE).getAll(), 'readonly');
export const deleteWritingBook = async (id: string): Promise<void> => { await crudTemplate(WRITING_BOOK_STORE, tx => tx.objectStore(WRITING_BOOK_STORE).delete(id)); };
export const bulkSaveWritingBooks = async (items: WritingBook[]): Promise<void> => { await crudTemplate(WRITING_BOOK_STORE, tx => { const store = tx.objectStore(WRITING_BOOK_STORE); items.forEach(i => store.put(i)); }); };

// --- Planning Feature ---
export const savePlanningGoal = async (goal: PlanningGoal): Promise<void> => { await crudTemplate(PLANNING_STORE, tx => tx.objectStore(PLANNING_STORE).put(goal)); };
export const getPlanningGoalsByUserId = async (): Promise<PlanningGoal[]> => await crudTemplate(PLANNING_STORE, tx => tx.objectStore(PLANNING_STORE).getAll(), 'readonly');
export const deletePlanningGoal = async (id: string): Promise<void> => { await crudTemplate(PLANNING_STORE, tx => tx.objectStore(PLANNING_STORE).delete(id)); };
export const bulkSavePlanningGoals = async (items: PlanningGoal[]): Promise<void> => { await crudTemplate(PLANNING_STORE, tx => { const store = tx.objectStore(PLANNING_STORE); items.forEach(i => store.put(i)); }); };