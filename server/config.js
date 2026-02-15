
const path = require('path');
const fs = require('fs');
const os = require('os');
const minimist = require('minimist');

// --- Configuration ---
const args = minimist(process.argv.slice(2));
const PORT = args.p || args.port || process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DAILY_BACKUP_RETENTION = 3;

// Directories
const AUDIO_DIR = path.join(__dirname, 'audio');
const CERT_DIR = path.join(__dirname, '.certs');
const META_FILENAME = 'metadata.json';
const DICT_PATH = path.join(__dirname, 'cmudict.dict');

// 1. DATA BACKUP DIRECTORY (User Data: iCloud/VocabPro or Local)
function getInitialBackupPath() {
    const homeDir = os.homedir();
    const iCloudPath = path.join(homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'VocabPro');
    const localPath = path.join(__dirname, 'backups');

    try {
        if (process.platform === 'darwin') {
            const cloudDocsRoot = path.join(homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
            if (fs.existsSync(cloudDocsRoot)) {
                if (!fs.existsSync(iCloudPath)) {
                    fs.mkdirSync(iCloudPath, { recursive: true });
                }
                // Verify Write Access
                const testFile = path.join(iCloudPath, '.test_write');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
                
                console.log(`[Config] Using iCloud Data directory: ${iCloudPath}`);
                return iCloudPath;
            }
        }
    } catch (e) {
        console.warn(`[Config] iCloud Data auto-detection failed (${e.message}). Falling back to local.`);
    }

    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
    console.log(`[Config] Using local backup directory: ${localPath}`);
    return localPath;
}

const BACKUP_DIR = getInitialBackupPath();

// 2. SERVER CONFIG DIRECTORY (Inside the main Data Directory: VocabPro/server)
const CLOUD_CONFIG_DIR = path.join(BACKUP_DIR, 'server');
if (!fs.existsSync(CLOUD_CONFIG_DIR)) {
    console.log(`[Config] Creating Server Config folder: ${CLOUD_CONFIG_DIR}`);
    fs.mkdirSync(CLOUD_CONFIG_DIR, { recursive: true });
}

// Global State Object for Config
const settings = {
    PORT,
    HOST,
    DAILY_BACKUP_RETENTION,
    AUDIO_DIR,
    CERT_DIR,
    META_FILENAME,
    DICT_PATH,
    BACKUP_DIR
};

// Ensure standard directories exist
[AUDIO_DIR, CERT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Paths for Config Files (In VocabPro/server) ---
const FOLDER_MAPPINGS_FILE = () => path.join(CLOUD_CONFIG_DIR, 'folder_mappings.json');
const MASTER_LIBRARY_FILE = () => path.join(CLOUD_CONFIG_DIR, 'master_library.json');
const MASTER_READING_FILE = () => path.join(CLOUD_CONFIG_DIR, 'master_reading.json');
const MASTER_PLANNING_FILE = () => path.join(CLOUD_CONFIG_DIR, 'master_planning.json');

// --- Initialization Logic: Create files if missing ---
try {
    const filesToInit = [
        { path: FOLDER_MAPPINGS_FILE(), defaultContent: '{}', label: 'Mappings' },
        { path: MASTER_LIBRARY_FILE(), defaultContent: '[]', label: 'Master Library' },
        { path: MASTER_READING_FILE(), defaultContent: '[]', label: 'Master Reading' },
        { path: MASTER_PLANNING_FILE(), defaultContent: '[]', label: 'Master Planning' }
    ];

    filesToInit.forEach(f => {
        if (!fs.existsSync(f.path)) {
            console.log(`[Config] Creating empty ${f.label} file: ${f.path}`);
            fs.writeFileSync(f.path, f.defaultContent);
        }
    });
} catch (e) {
    console.warn("[Config] File initialization failed:", e.message);
}

// --- Minimal Migration Logic (Legacy -> New Cloud) ---
try {
    // 1. Migrate Mappings
    const mappingsDest = FOLDER_MAPPINGS_FILE();
    // Check possible old locations
    const oldMappingsBackup = path.join(BACKUP_DIR, 'folder_mappings.json'); // VocabPro/folder_mappings.json
    const oldMappingsRoot = path.join(__dirname, 'audio_mappings.json');     // Local root

    // If destination is empty (just created), try to migrate
    let destIsEmpty = false;
    try {
        const content = fs.readFileSync(mappingsDest, 'utf8').trim();
        if (content === '{}' || !content) destIsEmpty = true;
    } catch(e) { destIsEmpty = true; }

    if (destIsEmpty) {
        if (fs.existsSync(oldMappingsBackup)) {
             console.log("[Config] Migrating folder_mappings.json from VocabPro root -> VocabPro/server...");
             fs.copyFileSync(oldMappingsBackup, mappingsDest);
             // Optional: fs.unlinkSync(oldMappingsBackup); // Cleanup old file?
        } else if (fs.existsSync(oldMappingsRoot)) {
             console.log("[Config] Migrating audio_mappings.json from Local root -> VocabPro/server...");
             fs.copyFileSync(oldMappingsRoot, mappingsDest);
        }
    }
    
    // 2. Migrate Master Library
    const masterDest = MASTER_LIBRARY_FILE();
    const oldMasterBackup = path.join(BACKUP_DIR, 'master_library.json');
    const oldMasterRoot = path.join(__dirname, 'master_library.json');
    
    let masterIsEmpty = false;
    try {
        const content = fs.readFileSync(masterDest, 'utf8').trim();
        if (content === '[]' || !content) masterIsEmpty = true;
    } catch(e) { masterIsEmpty = true; }

    if (masterIsEmpty) {
        if (fs.existsSync(oldMasterBackup)) {
            console.log("[Config] Migrating master_library.json from VocabPro root -> VocabPro/server...");
            fs.copyFileSync(oldMasterBackup, masterDest);
        } else if (fs.existsSync(oldMasterRoot)) {
             console.log("[Config] Migrating master_library.json from Local root -> VocabPro/server...");
             fs.copyFileSync(oldMasterRoot, masterDest);
        }
    }
    
} catch(e) {
    console.warn("[Config] Migration check skipped:", e.message);
}

console.log(`[Config] 📂 Mappings: ${FOLDER_MAPPINGS_FILE()}`);
console.log(`[Config] 📚 Library:  ${MASTER_LIBRARY_FILE()}`);
console.log(`[Config] 📖 Reading:  ${MASTER_READING_FILE()}`);
console.log(`[Config] 📅 Planning: ${MASTER_PLANNING_FILE()}`);
console.log(`[Config] 💾 Backups:  ${BACKUP_DIR}`);

module.exports = {
    settings,
    FOLDER_MAPPINGS_FILE,
    MASTER_LIBRARY_FILE,
    MASTER_READING_FILE,
    MASTER_PLANNING_FILE
};
