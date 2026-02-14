
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

// Determine Backup Directory (Prioritize iCloud)
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
                
                console.log(`[Init] iCloud detected. Defaulting storage to: ${iCloudPath}`);
                return iCloudPath;
            }
        }
    } catch (e) {
        console.warn(`[Init] iCloud auto-detection failed (${e.message}). Falling back to local.`);
    }

    console.log(`[Init] Using local backup directory: ${localPath}`);
    return localPath;
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
    BACKUP_DIR: getInitialBackupPath()
};

// Ensure directories exist
[AUDIO_DIR, CERT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(settings.BACKUP_DIR)) fs.mkdirSync(settings.BACKUP_DIR, { recursive: true });

// --- Audio Mappings Migration Logic ---
const OLD_MAPPINGS_FILE = path.join(__dirname, 'audio_mappings.json');
const AUDIO_MAPPINGS_FILE = () => path.join(settings.BACKUP_DIR, 'audio_mappings.json');

try {
    if (fs.existsSync(OLD_MAPPINGS_FILE) && !fs.existsSync(AUDIO_MAPPINGS_FILE())) {
        console.log("[Audio] Migrating mappings file to Backup Directory...");
        fs.copyFileSync(OLD_MAPPINGS_FILE, AUDIO_MAPPINGS_FILE());
    }
} catch (e) {
    console.warn("[Audio] Migration warning:", e.message);
}

module.exports = {
    settings,
    AUDIO_MAPPINGS_FILE
};
