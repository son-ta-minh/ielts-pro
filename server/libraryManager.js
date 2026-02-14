
const fs = require('fs');
const path = require('path');
const { settings } = require('./config');

// In-memory store: Map<lowercase_word, VocabularyItem>
// We keep this persistent in memory so lookup is fast.
const globalLibrary = new Map();

// Helper to recursively find json files
function findBackupFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                // Skip archive folders to avoid stale data overriding new data
                if (file !== 'archive') {
                    findBackupFiles(filePath, fileList);
                }
            } else {
                if (file.endsWith('.json') && file.startsWith('backup_')) {
                    fileList.push({ path: filePath, mtime: stat.mtimeMs });
                }
            }
        });
    } catch (e) {
        console.warn(`[Library] Error scanning directory ${dir}: ${e.message}`);
    }
    return fileList;
}

function loadGlobalLibrary() {
    console.log("[Library] --- Initializing Global Library ---");
    const start = Date.now();
    
    // Ensure backup dir exists
    if (!fs.existsSync(settings.BACKUP_DIR)) {
        console.log(`[Library] Backup directory not found. Creating: ${settings.BACKUP_DIR}`);
        fs.mkdirSync(settings.BACKUP_DIR, { recursive: true });
    }

    const MASTER_FILE = path.join(settings.BACKUP_DIR, 'master_library.json');
    console.log(`[Library] Master File Path: ${MASTER_FILE}`);

    // 1. Load existing Master Library first (Accumulation base)
    let masterCount = 0;
    if (fs.existsSync(MASTER_FILE)) {
        try {
            const rawMaster = fs.readFileSync(MASTER_FILE, 'utf8');
            const masterData = JSON.parse(rawMaster);
            if (Array.isArray(masterData)) {
                masterData.forEach(item => {
                    const wordText = item.word || item.w;
                    if (wordText) {
                        globalLibrary.set(wordText.toLowerCase().trim(), item);
                    }
                });
                masterCount = masterData.length;
                console.log(`[Library] Loaded ${masterCount} words from existing Master File.`);
            }
        } catch (e) {
            console.error("[Library] Failed to load Master File:", e.message);
        }
    } else {
        console.log("[Library] Master File does not exist yet. It will be created.");
    }

    try {
        // 2. Scan and Merge User Backups
        const files = findBackupFiles(settings.BACKUP_DIR);
        // Sort by time ascending so newer user data overrides older user data (and Master data if conflicts)
        files.sort((a, b) => a.mtime - b.mtime);

        let userMergeCount = 0;
        let fileCount = 0;

        files.forEach(f => {
            try {
                const raw = fs.readFileSync(f.path, 'utf8');
                const data = JSON.parse(raw);
                
                // Handle different export formats (legacy vs new)
                let items = [];
                if (Array.isArray(data)) {
                    items = data;
                } else if (data.vocabulary) {
                    items = data.vocabulary;
                } else if (data.vocab) {
                    items = data.vocab;
                }

                if (Array.isArray(items)) {
                    fileCount++;
                    items.forEach(item => {
                        // Short key mapping check
                        const wordText = item.word || item.w;
                        const quality = item.quality || item.q;

                        // Only ingest REFINED or VERIFIED words from users
                        // We map quality values to string checks to handle both long/short forms
                        // VERIFIED/REFINED or 'v'/'r' (if short keys used for quality)
                        const isGoodQuality = 
                            quality === 'VERIFIED' || quality === 'REFINED' || 
                            quality === 'v' || quality === 'r';

                        if (wordText && isGoodQuality) {
                            const key = wordText.toLowerCase().trim();
                            // We set it in the map. 
                            // Since files are sorted by time, the latest version of the word from ANY user wins.
                            // If it already existed in Master, this updates it to the latest user version.
                            globalLibrary.set(key, item);
                            userMergeCount++;
                        }
                    });
                }
            } catch (err) {
                console.warn(`[Library] Failed to parse ${f.path}:`, err.message);
            }
        });

        // 3. Save Updated Master Library
        // This ensures that words found in user backups are permanently added to the server's knowledge base.
        const allItems = Array.from(globalLibrary.values());
        try {
            fs.writeFileSync(MASTER_FILE, JSON.stringify(allItems, null, 2));
            console.log(`[Library] Master Library updated. Saved ${allItems.length} words to disk.`);
        } catch (writeErr) {
            console.error("[Library] Failed to write Master Library file:", writeErr.message);
        }

        console.log(`[Library] Complete. Processed ${fileCount} user files. Total index: ${globalLibrary.size}. Time: ${Date.now() - start}ms`);
        console.log("[Library] ---------------------------------------");
    } catch (e) {
        console.error("[Library] Critical error loading library:", e);
    }
}

function lookupWords(words) {
    const results = [];
    words.forEach(w => {
        const key = w.toLowerCase().trim();
        if (globalLibrary.has(key)) {
            results.push(globalLibrary.get(key));
        }
    });
    return results;
}

function getStats() {
    return {
        totalWords: globalLibrary.size
    };
}

module.exports = {
    loadGlobalLibrary,
    lookupWords,
    getStats
};
