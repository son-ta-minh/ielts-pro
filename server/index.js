/**
 * Unified Vocab Pro Server
 * Features:
 * 1. Streaming Backup System (Unlimited size, low RAM usage) with daily rotation.
 * 2. Local macOS TTS (High quality, unlimited usage)
 * 3. HTTPS Support (Auto-detects certificates)
 * 4. Dynamic Configuration
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const minimist = require('minimist');
const os = require('os');

// --- Stability Fix: Force CWD ---
try {
    process.chdir(__dirname);
} catch (err) {
    console.warn(`[Server] Failed to set CWD to ${__dirname}: ${err.message}`);
}

// --- Configuration ---
const args = minimist(process.argv.slice(2));
const PORT = args.p || args.port || process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DAILY_BACKUP_RETENTION = 3; // Keep the last 3 daily backups

// Directories
const AUDIO_DIR = path.join(__dirname, 'audio');
const CERT_DIR = path.join(__dirname, '.certs');
const META_FILENAME = 'metadata.json';

// Determine Backup Directory (Prioritize iCloud)
function getInitialBackupPath() {
    const homeDir = os.homedir();
    const iCloudPath = path.join(homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'VocabPro');
    const localPath = path.join(__dirname, 'backups');

    try {
        // Only attempt iCloud on macOS
        if (process.platform === 'darwin') {
            const cloudDocsRoot = path.join(homeDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
            
            // Check if iCloud Drive is actually enabled/present
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

let BACKUP_DIR = getInitialBackupPath();

// Ensure directories exist
[AUDIO_DIR, CERT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const app = express();

// --- DEBUG: Global Logger ---
app.use((req, res, next) => {
    console.log(`[Incoming] ${req.method} ${req.url}`);
    next();
});

// --- Middleware ---

app.use(cors({ origin: true, credentials: false }));
// Explicitly handle preflight requests for all routes
app.options('*', cors({ origin: true, credentials: false }));

app.use((req, res, next) => {
    if (req.path === '/api/backup' && req.method === 'POST') {
        next(); // Skip parsing for backup stream
    } else {
        express.json()(req, res, next);
    }
});

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${req.method}] ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// --- Helper Functions ---

// Transliterate Unicode to ASCII (e.g. "Đình" -> "Dinh")
function sanitizeToAscii(str) {
    if (!str) return 'unknown';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .replace(/[^a-zA-Z0-9\-_]/g, "_");
}

function getAppBackupPath(appName, createIfNotExist = false) {
    if (!appName) return null;
    const safeAppName = sanitizeToAscii(appName);
    const appDir = path.join(BACKUP_DIR, safeAppName);
    if (createIfNotExist && !fs.existsSync(appDir)) {
        fs.mkdirSync(appDir, { recursive: true });
    }
    return appDir;
}

function getMetaPath(appDir) {
    if (!appDir) return null;
    return path.join(appDir, META_FILENAME);
}

function loadMetadata(appDir) {
    try {
        const p = getMetaPath(appDir);
        if (p && fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    } catch (e) {
        console.error("[Meta] Failed to load metadata", e);
    }
    return {};
}

function saveMetadata(data, appDir) {
    try {
        const p = getMetaPath(appDir);
        if (p) {
            fs.writeFileSync(p, JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("[Meta] Failed to save metadata", e);
    }
}

// --- Feature 0: Server Configuration ---

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        backupDir: BACKUP_DIR,
        ttsEngine: process.platform === 'darwin' ? 'mock' : 'mock'
    });
});

app.post('/api/config/backup-path', (req, res) => {
    let { path: newPath } = req.body;
    
    if (!newPath) {
        return res.status(400).json({ error: 'Path is required' });
    }

    if (newPath.startsWith('~')) {
        newPath = path.join(os.homedir(), newPath.slice(1));
    }

    const resolvedPath = path.resolve(newPath);

    try {
        if (!fs.existsSync(resolvedPath)) {
            // Try to create it. If it fails (e.g. permission), catch block handles it.
            fs.mkdirSync(resolvedPath, { recursive: true });
        }
        
        // Verify write access specifically
        const testFile = path.join(resolvedPath, '.test_write');
        try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (writeErr) {
            throw new Error(`Write permission denied: ${writeErr.message}`);
        }

        BACKUP_DIR = resolvedPath;
        console.log(`[Config] Backup directory updated to: ${BACKUP_DIR}`);
        res.json({ success: true, path: BACKUP_DIR });
    } catch (err) {
        console.error(`[Config] Failed to set backup path: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// --- Feature 1: Backup System (Streaming with Daily Rotation) ---

app.get('/api/backups', async (req, res) => {
    const appName = req.query.app;
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    
    const appDir = getAppBackupPath(appName);
    if (!appDir || !fs.existsSync(appDir)) {
        return res.json({ backups: [] });
    }

    const meta = loadMetadata(appDir);

    const readDirSafe = async (dir) => {
        try {
            if (fs.existsSync(dir)) {
                const files = await fs.promises.readdir(dir);
                return files.map(file => ({ file, dir }));
            }
        } catch (e) {
            console.error(`[Backup] Error reading dir ${dir}:`, e.message);
        }
        return [];
    };

    try {
        const allFilesPromises = [
            readDirSafe(appDir) // MODIFIED: Do not read from archive
        ];
        const allFilesNested = await Promise.all(allFilesPromises);
        const allFiles = allFilesNested.flat();

        const backups = allFiles
            .filter(({ file }) => file.startsWith('backup_') && file.endsWith('.json'))
            .map(({ file, dir }) => {
                const filePath = path.join(dir, file);
                try {
                    const stats = fs.statSync(filePath);
                    const id = file.startsWith('backup_') ? file.substring(7, file.lastIndexOf('.json')) : file;
                    const displayName = meta[file]?.displayName || id.replace(/_\d{4}-\d{2}-\d{2}$/, '').replace(/_/g, ' ');

                    return { id, name: displayName, size: stats.size, date: stats.mtime };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ backups });

    } catch (err) {
        console.error(`[Backup] List error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to scan backup directories' });
    }
});

app.post('/api/backup', (req, res) => {
    const appName = req.query.app;
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    
    const appDir = getAppBackupPath(appName, true); // Create directory if it doesn't exist
    if (!appDir) {
        return res.status(500).json({ error: 'Could not resolve app backup path' });
    }

    const identifier = req.query.username || req.query.userId;
    if (!identifier) {
        return res.status(400).json({ error: 'Missing username or userId in query parameters.' });
    }

    const safeIdentifier = sanitizeToAscii(identifier);
    const fileName = `backup_${safeIdentifier}.json`;
    const filePath = path.join(appDir, fileName);

    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const today = new Date().toISOString().split('T')[0];
            const lastModDate = new Date(stats.mtime).toISOString().split('T')[0];

            if (today !== lastModDate) {
                console.log(`[Backup] New day detected. Archiving previous day's data for ${safeIdentifier}.`);
                
                const archiveDir = path.join(appDir, 'archive');
                if (!fs.existsSync(archiveDir)) {
                    fs.mkdirSync(archiveDir, { recursive: true });
                }

                const archiveFileName = `backup_${safeIdentifier}_${lastModDate}.json`;
                const archivePath = path.join(archiveDir, archiveFileName);
                
                fs.copyFileSync(filePath, archivePath);
                console.log(`[Backup] Archived '${fileName}' to '${archivePath}'`);

                // Retention policy: Keep the last N daily backups
                const allArchivedFiles = fs.readdirSync(archiveDir);
                const userArchives = allArchivedFiles
                    .filter(f => f.startsWith(`backup_${safeIdentifier}_`) && f.endsWith('.json'))
                    .sort();

                if (userArchives.length > DAILY_BACKUP_RETENTION) {
                    const filesToDelete = userArchives.slice(0, userArchives.length - DAILY_BACKUP_RETENTION);
                    filesToDelete.forEach(fileToDelete => {
                        fs.unlinkSync(path.join(archiveDir, fileToDelete));
                        console.log(`[Backup] Rotated out old backup: ${fileToDelete} from archive.`);
                    });
                }
            }
        }
    } catch (backupErr) {
        console.error(`[Backup] Daily archival process failed: ${backupErr.message}. The main backup will still proceed.`);
    }

    const writeStream = fs.createWriteStream(filePath);
    console.log(`[Backup] Receiving stream for: ${identifier} -> ${fileName}`);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
        try {
            const stats = fs.statSync(filePath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            
            const meta = loadMetadata(appDir);
            meta[fileName] = {
                displayName: identifier,
                originalId: req.query.userId,
                updatedAt: Date.now()
            };
            saveMetadata(meta, appDir);

            console.log(`[Backup] Saved ${sizeMB} MB for ${identifier} in app '${appName}'`);
            res.json({ success: true, size: stats.size, timestamp: Date.now() });
        } catch (err) {
            console.error(`[Backup] Stat error: ${err.message}`);
            res.status(500).json({ error: 'Backup saved but failed to verify size.' });
        }
    });

    writeStream.on('error', (err) => {
        console.error(`[Backup] Write error: ${err.message}`);
        res.status(500).json({ error: 'Failed to write backup file.' });
    });
});


app.get('/api/backup/:identifier', (req, res) => {
    const appName = req.query.app;
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    
    const appDir = getAppBackupPath(appName);
    if (!appDir || !fs.existsSync(appDir)) {
        return res.status(404).json({ error: `No backups found for app ${appName}.` });
    }

    const identifier = req.params.identifier;
    console.log(`[Backup] Request received for restore: ${identifier} in app '${appName}'`);
    
    const safeIdentifier = sanitizeToAscii(identifier);
    const fileName = `backup_${safeIdentifier}.json`;
    const filePath = path.join(appDir, fileName);

    // MODIFIED: Do not check archive directory.
    if (!fs.existsSync(filePath)) {
        console.warn(`[Backup] No backup file found for identifier '${identifier}' in app '${appName}'. Looked for: ${filePath}`);
        return res.status(404).json({ error: `No backup found for ${identifier}.` });
    }

    console.log(`[Backup] Streaming download for: ${filePath}`);

    const readStream = fs.createReadStream(filePath);
    readStream.on('error', (err) => {
        console.error(`[Backup] Read error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to read backup file.' });
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    readStream.pipe(res);
});


// --- Feature 2: TTS System (macOS 'say') ---

let selectedVoice = ""; 
let selectedLanguage = "en";
let selectedAccent = "";
let voiceIndex = {};

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
}

function mapLanguage(accent) {
    if (!accent) return null;
    const lower = accent.toLowerCase();
    if (lower.startsWith("vi")) return "vi";
    if (lower.startsWith("en")) return "en";
    return null;
}

async function loadVoicesFromOS() {
    try {
        // macOS 'say -v ?' returns name, locale and description
        const raw = await runCommand("say -v ?");
        const lines = raw.split("\n").filter(Boolean);
        voiceIndex = {};

        for (const line of lines) {
            // Regex improved to handle names with spaces and locales with underscores or hyphens (en_AU, en-US)
            const match = line.match(/^(.+?)\s{2,}([a-zA-Z_\-]+)\s+#/i);
            if (!match) continue;

            const name = match[1].trim();
            const accent = match[2];
            const language = mapLanguage(accent);

            if (!language) continue;

            voiceIndex[name] = { 
                language, 
                accent: accent.replace('-', '_') // Normalize to underscore format
            };
        }
        console.log(`[TTS] Successfully loaded ${Object.keys(voiceIndex).length} voices from OS.`);
    } catch (e) {
        console.error("[TTS] Failed to load voices (Are you on macOS?):", e.message);
    }
}

app.get('/voices', (req, res) => {
    const voices = Object.entries(voiceIndex).map(([name, info]) => ({
        name,
        language: info.language,
        accent: info.accent
    })).sort((a, b) => {
        // Prioritize English, then specific high-quality indicators
        if (a.language === 'en' && b.language !== 'en') return -1;
        if (a.language !== 'en' && b.language === 'en') return 1;
        
        const aIsHigh = a.name.includes('Siri') || a.name.includes('Enhanced');
        const bIsHigh = b.name.includes('Siri') || b.name.includes('Enhanced');
        if (aIsHigh && !bIsHigh) return -1;
        if (!aIsHigh && bIsHigh) return 1;
        
        return a.name.localeCompare(b.name);
    });

    res.json({
        currentVoice: selectedVoice || "",
        count: voices.length,
        voices
    });
});

app.post('/select-voice', (req, res) => {
    const { voice } = req.body;

    if (!voice) {
        selectedVoice = "";
        selectedLanguage = "en";
        selectedAccent = "";
        return res.json({ success: true, voice: "", system: true });
    }

    const info = voiceIndex[voice];
    if (!info) return res.status(404).json({ error: "voice_not_found" });

    selectedVoice = voice;
    selectedLanguage = info.language;
    selectedAccent = info.accent;

    console.log(`[TTS] Selected voice context: ${voice} (${selectedAccent})`);
    res.json({
        success: true,
        voice: selectedVoice,
        language: selectedLanguage,
        accent: selectedAccent
    });
});

app.post('/speak', async (req, res) => {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: "text_required" });

    let voiceToUse = selectedVoice;
    if (typeof voice === "string" && voice !== "") {
        if (voiceIndex[voice]) voiceToUse = voice;
        else return res.status(404).json({ error: "voice_not_found" });
    }

    const cleanText = text.replace(/"/g, '\\"');
    const outFile = path.join(AUDIO_DIR, `tts_${Date.now()}.aiff`);
    
    const cmd = voiceToUse
        ? `say -v "${voiceToUse}" "${cleanText}" -o "${outFile}"`
        : `say "${cleanText}" -o "${outFile}"`;

    try {
        await runCommand(cmd);

        if (!fs.existsSync(outFile)) {
            throw new Error("Output file was not generated.");
        }

        res.setHeader("Content-Type", "audio/aiff");
        const stream = fs.createReadStream(outFile);
        
        stream.pipe(res);
        
        stream.on('close', () => {
            fs.unlink(outFile, (err) => {
                if (err) console.error("Failed to delete temp audio:", err);
            });
        });
    } catch (err) {
        console.error("[TTS] Generation failed:", err.message);
        res.status(500).json({ error: "tts_generation_failed" });
    }
});

// --- Server Startup ---

function loadHttpsCertificates() {
    if (!fs.existsSync(CERT_DIR)) return null;

    const files = fs.readdirSync(CERT_DIR);
    const keyFile = files.find(f => f.endsWith('key.pem'));
    const certFile = files.find(f => f.endsWith('.pem') && !f.endsWith('key.pem'));

    if (keyFile && certFile) {
        return {
            key: fs.readFileSync(path.join(CERT_DIR, keyFile)),
            cert: fs.readFileSync(path.join(CERT_DIR, certFile))
        };
    }
    return null;
}

(async () => {
    await loadVoicesFromOS();

    const httpsOptions = loadHttpsCertificates();
    let server;
    let protocol = 'http';

    if (httpsOptions) {
        server = https.createServer(httpsOptions, app);
        protocol = 'https';
    } else {
        server = http.createServer(app);
    }

    server.listen(PORT, HOST, () => {
        console.log(`==================================================`);
        console.log(`[INFO] Unified Server running`);
        console.log(`[INFO] Protocol: ${protocol.toUpperCase()}`);
        console.log(`[INFO] Address:  ${protocol}://localhost:${PORT}`);
        console.log(`[INFO] Storage:  ${BACKUP_DIR}`);
        console.log(`[INFO] TTS:      ${Object.keys(voiceIndex).length} voices loaded`);
        if (protocol === 'http') {
            console.log(`[TIP]  To enable HTTPS, generate certs in ${CERT_DIR}`);
        }
        console.log(`==================================================`);
    });
})();
