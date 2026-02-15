
const fs = require('fs');
const path = require('path');
const { settings, MASTER_LIBRARY_FILE, MASTER_READING_FILE, MASTER_PLANNING_FILE } = require('./config');

// In-memory store: Map<lowercase_word, VocabularyItem>
const globalLibrary = new Map();
// In-memory store: Map<unit_name, Unit> (Keyed by Name to prevent duplicates)
const globalReadingLibrary = new Map();
// In-memory store: Map<goal_title, PlanningGoal> (Keyed by Title to prevent duplicates)
const globalPlanningLibrary = new Map();

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
                if (file !== 'archive' && file !== 'server') { // Also skip server config folder
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
    console.log("[Library] --- Initializing Global Library & Reading & Planning ---");
    const start = Date.now();
    
    // Ensure backup dir exists
    if (!fs.existsSync(settings.BACKUP_DIR)) {
        console.log(`[Library] Backup directory not found. Creating: ${settings.BACKUP_DIR}`);
        fs.mkdirSync(settings.BACKUP_DIR, { recursive: true });
    }

    const MASTER_FILE = MASTER_LIBRARY_FILE();
    const READING_FILE = MASTER_READING_FILE();
    const PLANNING_FILE = MASTER_PLANNING_FILE();

    // 1. Load existing Master Library first (Vocabulary)
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
                console.log(`[Library] Loaded ${masterData.length} words from existing Master File.`);
            }
        } catch (e) {
            console.error("[Library] Failed to load Master File:", e.message);
        }
    }

    // 2. Load existing Master Reading first
    if (fs.existsSync(READING_FILE)) {
        try {
            const rawReading = fs.readFileSync(READING_FILE, 'utf8');
            const readingData = JSON.parse(rawReading);
            if (Array.isArray(readingData)) {
                readingData.forEach(item => {
                    const name = item.name || item.n;
                    if (name) {
                        // Key by Name to prevent duplicates
                        globalReadingLibrary.set(name.trim(), item);
                    }
                });
                console.log(`[Library] Loaded ${readingData.length} units from existing Master Reading File.`);
            }
        } catch (e) {
            console.error("[Library] Failed to load Master Reading File:", e.message);
        }
    }

    // 3. Load existing Master Planning first
    if (fs.existsSync(PLANNING_FILE)) {
        try {
            const rawPlanning = fs.readFileSync(PLANNING_FILE, 'utf8');
            const planningData = JSON.parse(rawPlanning);
            if (Array.isArray(planningData)) {
                planningData.forEach(item => {
                    const title = item.title || item.t;
                    if (title) {
                        globalPlanningLibrary.set(title.trim(), item);
                    }
                });
                console.log(`[Library] Loaded ${planningData.length} plans from existing Master Planning File.`);
            }
        } catch (e) {
            console.error("[Library] Failed to load Master Planning File:", e.message);
        }
    }

    try {
        // 4. Scan and Merge User Backups
        const files = findBackupFiles(settings.BACKUP_DIR);
        // Sort by time ascending so newer user data overrides older user data (and Master data if conflicts)
        files.sort((a, b) => a.mtime - b.mtime);

        let fileCount = 0;
        let unitCount = 0;
        let planCount = 0;

        files.forEach(f => {
            try {
                const raw = fs.readFileSync(f.path, 'utf8');
                const data = JSON.parse(raw);
                
                // --- VOCABULARY MERGE ---
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
                        const wordText = item.word || item.w;
                        const quality = item.quality || item.q;

                        const isGoodQuality = 
                            quality === 'VERIFIED' || quality === 'REFINED' || 
                            quality === 'v' || quality === 'r';

                        if (wordText && isGoodQuality) {
                            const key = wordText.toLowerCase().trim();
                            globalLibrary.set(key, item);
                        }
                    });
                }

                // --- READING UNITS MERGE ---
                let units = [];
                if (data.units) {
                    units = data.units;
                } else if (data.u) {
                    units = data.u;
                }

                if (Array.isArray(units)) {
                    units.forEach(unit => {
                        if (unit.id && (unit.name || unit.n) && (unit.essay || unit.e)) {
                            const cleanUnit = {
                                id: unit.id,
                                name: unit.name || unit.n,
                                description: unit.description || unit.d || '',
                                essay: unit.essay || unit.e || '',
                                customVocabString: unit.customVocabString || unit.cvs || '',
                                tags: unit.tags || unit.t || []
                            };

                            globalReadingLibrary.set(cleanUnit.name.trim(), cleanUnit);
                            unitCount++;
                        }
                    });
                }

                // --- PLANNING GOALS MERGE ---
                let goals = [];
                if (data.planningGoals) {
                    goals = data.planningGoals;
                } else if (data.pg) {
                    goals = data.pg;
                }

                if (Array.isArray(goals)) {
                    goals.forEach(goal => {
                        const title = goal.title || goal.t;
                        if (goal.id && title) {
                            const cleanGoal = {
                                id: goal.id,
                                title: title,
                                description: goal.description || goal.d || '',
                                todos: goal.todos || goal.td || []
                            };
                            globalPlanningLibrary.set(title.trim(), cleanGoal);
                            planCount++;
                        }
                    });
                }

            } catch (err) {
                console.warn(`[Library] Failed to parse ${f.path}:`, err.message);
            }
        });

        // 5. Save Updated Master Library (Vocab)
        const allItems = Array.from(globalLibrary.values());
        try {
            fs.writeFileSync(MASTER_FILE, JSON.stringify(allItems, null, 2));
            console.log(`[Library] Master Library updated. Saved ${allItems.length} words to disk.`);
        } catch (writeErr) {
            console.error("[Library] Failed to write Master Library file:", writeErr.message);
        }

        // 6. Save Updated Master Reading (Units)
        const allUnits = Array.from(globalReadingLibrary.values());
        try {
            fs.writeFileSync(READING_FILE, JSON.stringify(allUnits, null, 2));
            console.log(`[Library] Master Reading updated. Saved ${allUnits.length} units to disk.`);
        } catch (writeErr) {
            console.error("[Library] Failed to write Master Reading file:", writeErr.message);
        }

        // 7. Save Updated Master Planning (Goals)
        const allPlans = Array.from(globalPlanningLibrary.values());
        try {
            fs.writeFileSync(PLANNING_FILE, JSON.stringify(allPlans, null, 2));
            console.log(`[Library] Master Planning updated. Saved ${allPlans.length} plans to disk.`);
        } catch (writeErr) {
            console.error("[Library] Failed to write Master Planning file:", writeErr.message);
        }

        console.log(`[Library] Complete. Processed ${fileCount} user files. Time: ${Date.now() - start}ms`);
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

function getReadingUnits() {
    return Array.from(globalReadingLibrary.values());
}

function getPlanningGoals() {
    return Array.from(globalPlanningLibrary.values());
}

function getStats() {
    return {
        totalWords: globalLibrary.size,
        totalUnits: globalReadingLibrary.size,
        totalPlans: globalPlanningLibrary.size
    };
}

module.exports = {
    loadGlobalLibrary,
    lookupWords,
    getReadingUnits,
    getPlanningGoals,
    getStats
};
