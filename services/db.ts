
import { VocabularyItem, User } from '../types';
import { initialVocabulary, DEFAULT_USER_ID, REMOTE_VOCAB_URL, LOCAL_SHIPPED_DATA_PATH } from '../data/user_data';

const DB_NAME = 'IELTSVocabProDB_V2';
const STORE_NAME = 'vocabulary';
const USER_STORE = 'users';
const DB_VERSION = 2;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('nextReview', 'nextReview', { unique: false });
        }
        if (!db.objectStoreNames.contains(USER_STORE)) {
          db.createObjectStore(USER_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("IndexedDB failed to open."));
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Khởi tạo dữ liệu thông minh.
 * Hỗ trợ data.json dạng Array hoặc Object có key 'vocabulary'.
 */
export const seedDatabaseIfEmpty = async (): Promise<User | null> => {
  const users = await getAllUsers();
  
  let targetUser: User;
  if (users.length === 0) {
    targetUser = {
      id: DEFAULT_USER_ID,
      name: "IELTS Master",
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=Master`,
      lastLogin: Date.now()
    };
    await saveUser(targetUser);
  } else {
    return null;
  }

  let vocabToSeed: VocabularyItem[] = [];

  const extractVocab = (json: any): VocabularyItem[] => {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.vocabulary)) return json.vocabulary;
    return [];
  };

  // 1. Thử tải file data.json nội bộ
  try {
    console.log("Fetching shipped data from:", LOCAL_SHIPPED_DATA_PATH);
    const localResponse = await fetch(LOCAL_SHIPPED_DATA_PATH);
    if (localResponse.ok) {
      const json = await localResponse.json();
      vocabToSeed = extractVocab(json);
      if (vocabToSeed.length > 0) {
        console.log(`Successfully extracted ${vocabToSeed.length} words from local data.json`);
      }
    }
  } catch (e) {
    console.log("No local data.json found or format error.");
  }

  // 2. Thử remote nếu local trống
  if (vocabToSeed.length === 0 && REMOTE_VOCAB_URL) {
    try {
      const remoteResponse = await fetch(REMOTE_VOCAB_URL);
      if (remoteResponse.ok) {
        const json = await remoteResponse.json();
        vocabToSeed = extractVocab(json);
      }
    } catch (e) {
      console.warn("Remote fetch failed.");
    }
  }

  // 3. Fallback
  if (vocabToSeed.length === 0) {
    vocabToSeed = initialVocabulary;
  }

  const finalVocab = vocabToSeed.map(item => ({
    ...item,
    userId: DEFAULT_USER_ID,
    nextReview: item.nextReview || Date.now()
  }));

  await bulkSaveWords(finalVocab);
  return targetUser;
};

// Các hàm khác giữ nguyên...
export const getAllUsers = async (): Promise<User[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readonly');
    const store = transaction.objectStore(USER_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveUser = async (user: User): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(USER_STORE, 'readwrite');
    const store = transaction.objectStore(USER_STORE);
    store.put(user);
    transaction.oncomplete = () => resolve();
  });
};

export const getWordCount = async (userId: string): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.count(IDBKeyRange.only(userId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getDueWords = async (userId: string, limit: number = 30): Promise<VocabularyItem[]> => {
  const db = await initDB();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('nextReview');
    const range = IDBKeyRange.upperBound(now);
    const request = index.getAll(range);

    request.onsuccess = () => {
      let results = (request.result as VocabularyItem[]).filter(w => w.userId === userId);
      for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [results[i], results[j]] = [results[j], results[i]];
      }
      resolve(results.slice(0, limit));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getIdioms = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const results = (request.result as VocabularyItem[]).filter(w => !!w.isIdiom);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getPhrasalVerbs = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const results = (request.result as VocabularyItem[]).filter(w => !!w.isPhrasalVerb);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getCollocations = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const results = (request.result as VocabularyItem[]).filter(w => !!w.isCollocation);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getPronunciationFocusWords = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const results = (request.result as VocabularyItem[]).filter(w => w.needsPronunciationFocus === true);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getNewWords = async (userId: string, limit: number = 20): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));

    request.onsuccess = () => {
      const results = (request.result as VocabularyItem[])
        .filter(w => w.consecutiveCorrect === 0)
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(results.slice(0, limit));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getWordsPaged = async (userId: string, page: number, pageSize: number): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.openCursor(IDBKeyRange.only(userId));
    const results: VocabularyItem[] = [];
    let skipped = 0;
    const skipTo = page * pageSize;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) {
        resolve(results);
        return;
      }
      if (skipped < skipTo) {
        skipped++;
        cursor.continue();
        return;
      }
      results.push(cursor.value);
      if (results.length < pageSize) {
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const saveWord = async (item: VocabularyItem): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    item.updatedAt = Date.now();
    store.put(item);
    transaction.oncomplete = () => resolve();
  });
};

export const deleteWordFromDB = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.oncomplete = () => resolve();
  });
};

export const bulkSaveWithMerge = async (incomingItems: VocabularyItem[]): Promise<{ merged: number, skipped: number }> => {
  const db = await initDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  
  let merged = 0;
  let skipped = 0;

  return new Promise((resolve, reject) => {
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      const localItems = getAllRequest.result as VocabularyItem[];
      const localMap = new Map(localItems.map(item => [item.id, item]));

      for (const incoming of incomingItems) {
        const local = localMap.get(incoming.id);
        if (!local || (incoming.updatedAt || 0) > (local.updatedAt || 0)) {
          store.put(incoming);
          merged++;
        } else {
          skipped++;
        }
      }
    };

    transaction.oncomplete = () => resolve({ merged, skipped });
    transaction.onerror = () => reject(transaction.error);
  });
};

export const bulkSaveWords = async (items: VocabularyItem[]): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    items.forEach(item => store.put(item));
    transaction.oncomplete = () => resolve();
  });
};

export const getAllWordsForExport = async (userId: string): Promise<VocabularyItem[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
