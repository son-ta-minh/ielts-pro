import { VocabularyItem, User, Unit, ReviewGrade } from './types';
import { initialVocabulary, DEFAULT_USER_ID, LOCAL_SHIPPED_DATA_PATH } from '../data/user_data';

const DB_NAME = 'IELTSVocabProDB_V2';
const STORE_NAME = 'vocabulary';
const USER_STORE = 'users';
const UNIT_STORE = 'units'; // New unit store
const DB_VERSION = 5; 

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;

        if (!db || !transaction) {
          console.error("Database or transaction not available during onupgradeneeded");
          if(transaction) transaction.abort();
          return;
        }

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('nextReview', 'nextReview', { unique: false });
        }
        if (!db.objectStoreNames.contains(USER_STORE)) {
          db.createObjectStore(USER_STORE, { keyPath: 'id' });
        }
        
        if (event.oldVersion < 5) {
          if (!db.objectStoreNames.contains(UNIT_STORE)) {
            const unitStore = db.createObjectStore(UNIT_STORE, { keyPath: 'id' });
            unitStore.createIndex('userId', 'userId', { unique: false });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        console.error("IndexedDB error:", (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    } catch (e) {
      reject(e);
    }
  });
};

export const clearVocabularyOnly = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, UNIT_STORE], 'readwrite'); // Clear units as well
    const vocabStore = tx.objectStore(STORE_NAME);
    const unitStore = tx.objectStore(UNIT_STORE);
    
    vocabStore.clear();
    unitStore.clear();
    
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const seedDatabaseIfEmpty = async (force: boolean = false): Promise<User | null> => {
  if (!force && sessionStorage.getItem('ielts_pro_skip_seed') === 'true') return null;
  
  const users = await getAllUsers();
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const countReq = tx.objectStore(STORE_NAME).count();
  
  const hasData = await new Promise<boolean>((resolve) => {
    countReq.onsuccess = () => resolve(countReq.result > 0);
    countReq.onerror = () => resolve(false);
  });
  db.close();

  if (!force && hasData) return null;

  let targetUser: User;
  if (users.length === 0) {
    targetUser = {
      id: DEFAULT_USER_ID,
      name: "IELTS Master",
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=Master`,
      lastLogin: Date.now(),
      role: "IELTS Candidate",
      currentLevel: "Band 6.0",
      target: "Band 7.5+"
    };
    await saveUser(targetUser);
  } else {
    targetUser = users[0];
  }

  let vocabToSeed: VocabularyItem[] = [];
  try {
    const localResponse = await fetch(LOCAL_SHIPPED_DATA_PATH);
    if (localResponse.ok) {
      const json = await localResponse.json();
      vocabToSeed = Array.isArray(json) ? json : (json.vocabulary || []);
    }
  } catch (e) {}

  if (vocabToSeed.length === 0) vocabToSeed = initialVocabulary;
  const finalVocab = vocabToSeed.map(item => ({
    ...item,
    userId: targetUser.id,
    nextReview: item.nextReview || Date.now()
  }));

  await bulkSaveWords(finalVocab);
  return targetUser;
};

export const getAllUsers = async (): Promise<User[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(USER_STORE, 'readonly');
    const req = tx.objectStore(USER_STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const saveUser = async (user: User): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_STORE, 'readwrite');
    tx.objectStore(USER_STORE).put(user);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const findWordByText = async (userId: string, wordText: string): Promise<VocabularyItem | null> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('userId');
    const req = index.openCursor(IDBKeyRange.only(userId));
    const target = wordText.toLowerCase().trim();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (cursor.value.word.toLowerCase().trim() === target) {
          db.close();
          resolve(cursor.value);
        } else cursor.continue();
      } else { db.close(); resolve(null); }
    };
    req.onerror = () => { db.close(); resolve(null); };
  });
};

export const getWordCount = async (
    userId: string, 
    query: string = '', 
    filterType: string = 'all', 
    refinedFilter: 'all' | 'refined' | 'not_refined' = 'all',
    statusFilter: string = 'all'
): Promise<number> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('userId');
    const req = index.openCursor(IDBKeyRange.only(userId));
    let count = 0;
    const lowerQuery = query.toLowerCase().trim();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value;

        if (filterType !== 'archive' && item.isPassive) {
            cursor.continue();
            return;
        }

        const matchesQuery = !lowerQuery || item.word.toLowerCase().includes(lowerQuery) || item.meaningVi.toLowerCase().includes(lowerQuery);
        
        let matchesType = true;
        if (filterType === 'idiom') matchesType = !!item.isIdiom;
        else if (filterType === 'phrasal') matchesType = !!item.isPhrasalVerb;
        else if (filterType === 'colloc') matchesType = !!item.isCollocation;
        else if (filterType === 'phrase') matchesType = !!item.isStandardPhrase;
        else if (filterType === 'pronun') matchesType = !!item.needsPronunciationFocus;
        else if (filterType === 'preposition') matchesType = item.prepositions && item.prepositions.length > 0 && !item.isPhrasalVerb;
        else if (filterType === 'vocab') matchesType = !item.isIdiom && !item.isPhrasalVerb && !item.isCollocation && !item.isStandardPhrase;
        else if (filterType === 'archive') matchesType = !!item.isPassive;

        let matchesRefined = true;
        if (refinedFilter !== 'all') {
            const isEssentiallyFull = !!(item.meaningVi && item.ipa && item.example);
            if (refinedFilter === 'refined') matchesRefined = isEssentiallyFull;
            else matchesRefined = !isEssentiallyFull;
        }

        let matchesStatus = true;
        if (statusFilter !== 'all') {
            if (statusFilter === 'new') matchesStatus = !item.lastReview;
            else if (statusFilter === 'forgot') matchesStatus = !!item.lastReview && item.lastGrade === ReviewGrade.FORGOT;
            else if (statusFilter === 'hard') matchesStatus = !!item.lastReview && item.lastGrade === ReviewGrade.HARD;
            else if (statusFilter === 'easy') matchesStatus = !!item.lastReview && item.lastGrade === ReviewGrade.EASY;
        }

        if (matchesQuery && matchesType && matchesRefined && matchesStatus) count++;
        cursor.continue();
      } else { db.close(); resolve(count); }
    };
    req.onerror = () => { db.close(); resolve(0); };
  });
};

export const getDueWords = async (userId: string, limit: number = 30): Promise<VocabularyItem[]> => {
  const db = await openDB();
  const now = Date.now();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('nextReview');
    const req = index.getAll(IDBKeyRange.upperBound(now));
    req.onsuccess = () => {
      db.close();
      const results = (req.result as VocabularyItem[]).filter(w => w.userId === userId && !w.isPassive && w.lastReview);
      
      const shuffled = [...results].sort(() => Math.random() - 0.5);
      
      resolve(shuffled.slice(0, limit));
    };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getRegularVocabulary = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => {
      db.close();
      const results = (req.result as VocabularyItem[]).filter(w => 
        !w.isIdiom && !w.isPhrasalVerb && !w.isCollocation && !w.isStandardPhrase && !w.isPassive
      );
      resolve(results);
    };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getPrepositionWords = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve((req.result as VocabularyItem[]).filter(w => w.prepositions && w.prepositions.length > 0 && !w.isPhrasalVerb && !w.isPassive)); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getIdioms = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve((req.result as VocabularyItem[]).filter(w => !!w.isIdiom && !w.isPassive)); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getPhrasalVerbs = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve((req.result as VocabularyItem[]).filter(w => !!w.isPhrasalVerb && !w.isPassive)); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getCollocations = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve((req.result as VocabularyItem[]).filter(w => !!w.isCollocation && !w.isPassive)); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getStandardPhrases = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve((req.result as VocabularyItem[]).filter(w => !!w.isStandardPhrase && !w.isPassive)); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getPassiveWords = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve((req.result as VocabularyItem[]).filter(w => !!w.isPassive)); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getPronunciationFocusWords = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').openCursor(IDBKeyRange.only(userId));
    const results: VocabularyItem[] = [];
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (cursor.value.needsPronunciationFocus && !cursor.value.isPassive) results.push(cursor.value);
        cursor.continue();
      } else { db.close(); resolve(results); }
    };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getNewWords = async (userId: string, limit: number = 20): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => {
      db.close();
      const results = (req.result as VocabularyItem[]).filter(w => !w.lastReview && !w.isPassive);
      resolve(results.slice(0, limit));
    };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const getWordsPaged = async (
    userId: string, 
    page: number, 
    pageSize: number, 
    query: string = '', 
    filterType: string = 'all', 
    refinedFilter: 'all' | 'refined' | 'not_refined' = 'all',
    statusFilter: string = 'all'
): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').openCursor(IDBKeyRange.only(userId));
    const results: VocabularyItem[] = [];
    let matchedCount = 0;
    const skipTo = page * pageSize;
    const lowerQuery = query.toLowerCase().trim();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) { db.close(); resolve(results); return; }
      
      const item = cursor.value;
      
      if (filterType !== 'archive' && item.isPassive) {
          cursor.continue();
          return;
      }

      const matchesQuery = !lowerQuery || item.word.toLowerCase().includes(lowerQuery) || item.meaningVi.toLowerCase().includes(lowerQuery);
      
      let matchesType = true;
      if (filterType === 'idiom') matchesType = !!item.isIdiom;
      else if (filterType === 'phrasal') matchesType = !!item.isPhrasalVerb;
      else if (filterType === 'colloc') matchesType = !!item.isCollocation;
      else if (filterType === 'phrase') matchesType = !!item.isStandardPhrase;
      else if (filterType === 'pronun') matchesType = !!item.needsPronunciationFocus;
      else if (filterType === 'preposition') matchesType = item.prepositions && item.prepositions.length > 0 && !item.isPhrasalVerb;
      else if (filterType === 'vocab') matchesType = !item.isIdiom && !item.isPhrasalVerb && !item.isCollocation && !item.isStandardPhrase;
      else if (filterType === 'archive') matchesType = !!item.isPassive;

      let matchesRefined = true;
      if (refinedFilter !== 'all') {
          const isEssentiallyFull = !!(item.meaningVi && item.ipa && item.example);
          if (refinedFilter === 'refined') matchesRefined = isEssentiallyFull;
          else matchesRefined = !isEssentiallyFull;
      }

      let matchesStatus = true;
      if (statusFilter !== 'all') {
          if (statusFilter === 'new') matchesStatus = !item.lastReview;
          else if (statusFilter === 'forgot') matchesStatus = !!item.lastReview && item.lastGrade === ReviewGrade.FORGOT;
          else if (statusFilter === 'hard') matchesStatus = !!item.lastReview && item.lastGrade === ReviewGrade.HARD;
          else if (statusFilter === 'easy') matchesStatus = !!item.lastReview && item.lastGrade === ReviewGrade.EASY;
      }

      if (matchesQuery && matchesType && matchesRefined && matchesStatus) {
        if (matchedCount >= skipTo && results.length < pageSize) results.push(item);
        matchedCount++;
      }
      
      if (results.length < pageSize) cursor.continue();
      else { db.close(); resolve(results); }
    };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const saveWord = async (item: VocabularyItem): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    item.updatedAt = Date.now();
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const deleteWordFromDB = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const bulkSaveWithMerge = async (incomingItems: VocabularyItem[]): Promise<{ merged: number, skipped: number }> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  let merged = 0, skipped = 0;
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const localMap = new Map((req.result as VocabularyItem[]).map(i => [i.id, i]));
      for (const inc of incomingItems) {
        const loc = localMap.get(inc.id);
        if (!loc || (inc.updatedAt || 0) > (loc.updatedAt || 0)) {
          store.put(inc);
          merged++;
        } else skipped++;
      }
    };
    tx.oncomplete = () => { db.close(); resolve({ merged, skipped }); };
  });
};

export const bulkSaveWords = async (items: VocabularyItem[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    items.forEach(i => store.put(i));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const getAllWordsForExport = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).index('userId').getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

// --- TAG MANAGEMENT FUNCTIONS ---

export const renameTagForAllWords = async (userId: string, oldTag: string, newTag: string): Promise<number> => {
  if (!oldTag || typeof oldTag !== 'string' || !newTag || typeof newTag !== 'string') {
    console.warn('renameTagForAllWords called with invalid arguments', { oldTag, newTag });
    return 0;
  }
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('userId');
  const req = index.openCursor(IDBKeyRange.only(userId));
  let updatedCount = 0;
  
  const oldTagLower = oldTag.toLowerCase().trim();
  const newTagLower = newTag.toLowerCase().trim();

  return new Promise((resolve) => {
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value;
        const tags = item.tags?.map(t => t.toLowerCase().trim()) || []; // Ensure tags are trimmed and lowercased
        
        if (tags.includes(oldTagLower)) {
          const newTags = Array.from(new Set(tags.map(t => t === oldTagLower ? newTagLower : t)));
          cursor.update({ ...item, tags: newTags });
          updatedCount++;
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(updatedCount); };
    tx.onerror = (event) => {
      console.error("Error renaming tag in DB:", (event.target as IDBRequest).error);
      db.close();
      resolve(updatedCount); // Resolve even on error to not block the UI
    };
  });
};

export const deleteTagForAllWords = async (userId: string, tagToDelete: string): Promise<number> => {
  if (!tagToDelete || typeof tagToDelete !== 'string') {
    console.warn('deleteTagForAllWords called with invalid argument', { tagToDelete });
    return 0;
  }
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('userId');
  const req = index.openCursor(IDBKeyRange.only(userId));
  let updatedCount = 0;
  const tagLower = tagToDelete.toLowerCase();

  return new Promise((resolve) => {
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value;
        if (item.tags?.some(t => t.toLowerCase() === tagLower)) {
          const newTags = item.tags.filter(t => t.toLowerCase() !== tagLower);
          cursor.update({ ...item, tags: newTags });
          updatedCount++;
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(updatedCount); };
  });
};

export const addTagToWords = async (wordIds: string[], tag: string): Promise<void> => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const tagLower = tag.trim().toLowerCase();

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };

      if (wordIds.length === 0) return;

      let processedCount = 0;
      wordIds.forEach(id => {
          const req = store.get(id);
          req.onsuccess = () => {
              const item = req.result;
              if (item) {
                  const newTags = Array.from(new Set([...(item.tags || []).map(t => t.toLowerCase()), tagLower]));
                  store.put({ ...item, tags: newTags });
              }
              processedCount++;
          };
      });
  });
};


export const removeTagFromWords = async (wordIds: string[], tag: string): Promise<void> => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const tagLower = tag.trim().toLowerCase();

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    
    if (wordIds.length === 0) return;

    wordIds.forEach(id => {
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          const newTags = (item.tags || []).filter(t => t.toLowerCase() !== tagLower);
          store.put({ ...item, tags: newTags });
        }
      };
    });
  });
};

export const getWordsWithoutTag = async (userId: string, tagToExclude: string, query: string): Promise<VocabularyItem[]> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.objectStore(STORE_NAME).index('userId');
  const req = index.openCursor(IDBKeyRange.only(userId));
  const results: VocabularyItem[] = [];
  const tagLower = tagToExclude.toLowerCase();
  const queryLower = query.toLowerCase();

  return new Promise(resolve => {
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value;
        const hasTag = item.tags?.some(t => t.toLowerCase() === tagLower);
        if (!item.isPassive && !hasTag) {
          if (!queryLower || item.word.toLowerCase().includes(queryLower) || item.meaningVi.toLowerCase().includes(queryLower)) {
            results.push(item);
          }
        }
        cursor.continue();
      } else {
        db.close();
        resolve(results);
      }
    };
  });
};

// --- UNIT (CUSTOM COLLECTION) MANAGEMENT ---

export const saveUnit = async (unit: Unit): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNIT_STORE, 'readwrite');
    unit.updatedAt = Date.now();
    tx.objectStore(UNIT_STORE).put(unit);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const deleteUnit = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNIT_STORE, 'readwrite');
    tx.objectStore(UNIT_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const getUnitsByUserId = async (userId: string): Promise<Unit[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(UNIT_STORE, 'readonly');
    const index = tx.objectStore(UNIT_STORE).index('userId');
    const req = index.getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
};

export const bulkSaveUnits = async (items: Unit[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNIT_STORE, 'readwrite');
    const store = tx.objectStore(UNIT_STORE);
    items.forEach(i => store.put(i));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};
