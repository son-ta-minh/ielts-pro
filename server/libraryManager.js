
const fs = require('fs');
const path = require('path');
const { settings, MASTER_LIBRARY_FILE, MASTER_READING_FILE, MASTER_PLANNING_FILE } = require('./config');
const logger = require('./logger');

// In-memory store: Map<lowercase_word, StudyItem>
const globalLibrary = new Map();
// In-memory store: Map<unit_name, Unit> (Keyed by Name to prevent duplicates)
const globalReadingLibrary = new Map();
// In-memory store: Map<goal_title, PlanningGoal> (Keyed by Title to prevent duplicates)
const globalPlanningLibrary = new Map();

logger.debug("[LibraryManager] Loading version with Strict Data Cleaning...");

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
        logger.warn(`[Library] Error scanning directory ${dir}: ${e.message}`);
    }
    return fileList;
}

// --- Data Cleaning Helpers (Strict Allowlist + Key Normalization) ---
function cleanUnit(item) {
    return {
        id: item.id,
        name: item.name || item.n,
        description: item.description || item.d || '',
        essay: item.essay || item.e || '',
        customVocabString: item.customVocabString || item.cvs || '',
        tags: item.tags || item.t || [],
        comprehensionQuestions: item.comprehensionQuestions || []
        // Removed: userId, isLearned, focusColor, isFocused
    };
}

function cleanPlan(item) {
    const rawTodos = item.todos || item.td || [];
    const cleanTodos = Array.isArray(rawTodos) ? rawTodos.map(t => ({
        id: t.id,
        text: t.text,
        status: 'NEW' // Reset status for master template
    })) : [];

    return {
        id: item.id,
        title: item.title || item.t,
        description: item.description || item.d || '',
        todos: cleanTodos
        // Removed: userId, focusColor, isFocused, order
    };
}

// -----------------------------

function loadGlobalLibrary() {
    logger.debug("[Library] --- Initializing Global Library & Reading & Planning ---");
    const start = Date.now();
    
    // Ensure backup dir exists
    if (!fs.existsSync(settings.BACKUP_DIR)) {
        logger.debug(`[Library] Backup directory not found. Creating: ${settings.BACKUP_DIR}`);
        fs.mkdirSync(settings.BACKUP_DIR, { recursive: true });
    }

    const READING_FILE = MASTER_READING_FILE();
    const PLANNING_FILE = MASTER_PLANNING_FILE();

    // Load existing Master Reading first
    if (fs.existsSync(READING_FILE)) {
        try {
            const rawReading = fs.readFileSync(READING_FILE, 'utf8');
            const readingData = JSON.parse(rawReading);
            if (Array.isArray(readingData)) {
                readingData.forEach(item => {
                    const cleanItem = cleanUnit(item);
                    if (cleanItem.name) {
                        globalReadingLibrary.set(cleanItem.name.trim(), cleanItem);
                    }
                });
                logger.debug(`[Library] Loaded ${readingData.length} units from existing Master Reading File.`);
            }
        } catch (e) {
            logger.error("[Library] Failed to load Master Reading File:", e.message);
        }
    }

    // Load existing Master Planning first
    if (fs.existsSync(PLANNING_FILE)) {
        try {
            const rawPlanning = fs.readFileSync(PLANNING_FILE, 'utf8');
            const planningData = JSON.parse(rawPlanning);
            if (Array.isArray(planningData)) {
                planningData.forEach(item => {
                    const cleanItem = cleanPlan(item);
                    if (cleanItem.title) {
                        globalPlanningLibrary.set(cleanItem.title.trim(), cleanItem);
                    }
                });
                logger.debug(`[Library] Loaded ${planningData.length} plans from existing Master Planning File.`);
            }
        } catch (e) {
            logger.error("[Library] Failed to load Master Planning File:", e.message);
        }
    }

    try {
        // Scan and Merge User Backups
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

                // --- READING UNITS MERGE ---
                let units = [];
                if (data.units) {
                    units = data.units;
                } else if (data.u) {
                    units = data.u;
                }

                if (Array.isArray(units)) {
                    units.forEach(unit => {
                        const unitName = unit.name || unit.n;
                        if (unit.id && unitName) {
                            // Validate content
                            const essay = unit.essay || unit.e || '';
                            const vocab = unit.customVocabString || unit.cvs || '';
                            
                            if (essay.length > 50 || vocab.length > 10) {
                                // CLEAN IMMEDIATELY
                                globalReadingLibrary.set(unitName.trim(), cleanUnit(unit));
                                unitCount++;
                            }
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
                            // CLEAN IMMEDIATELY
                            globalPlanningLibrary.set(title.trim(), cleanPlan(goal));
                            planCount++;
                        }
                    });
                }

            } catch (err) {
                logger.warn(`[Library] Failed to parse ${f.path}:`, err.message);
            }
        });

        // Save Updated Master Reading (Units)
        const allUnits = Array.from(globalReadingLibrary.values());
        try {
            fs.writeFileSync(READING_FILE, JSON.stringify(allUnits, null, 2));
            logger.debug(`[Library] Master Reading updated. Saved ${allUnits.length} units to disk.`);
        } catch (writeErr) {
            logger.error("[Library] Failed to write Master Reading file:", writeErr.message);
        }

        // Save Updated Master Planning (Goals)
        const allPlans = Array.from(globalPlanningLibrary.values());
        try {
            fs.writeFileSync(PLANNING_FILE, JSON.stringify(allPlans, null, 2));
            logger.debug(`[Library] Master Planning updated. Saved ${allPlans.length} plans to disk.`);
        } catch (writeErr) {
            logger.error("[Library] Failed to write Master Planning file:", writeErr.message);
        }

        logger.debug(`[Library] Complete. Processed ${fileCount} user files. Time: ${Date.now() - start}ms`);
        logger.debug("[Library] ---------------------------------------");
    } catch (e) {
        logger.error("[Library] Critical error loading library:", e);
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
