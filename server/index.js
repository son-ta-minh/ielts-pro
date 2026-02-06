
/**
 * Unified Vocab Pro Server
 * Features:
 * 1. Streaming Backup System (Unlimited size, low RAM usage)
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

function getMetaPath() {
    return path.join(BACKUP_DIR, META_FILENAME);
}

function loadMetadata() {
    try {
        const p = getMetaPath();
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    } catch (e) {
        console.error("[Meta] Failed to load metadata", e);
    }
    return {};
}

function saveMetadata(data) {
    try {
        fs.writeFileSync(getMetaPath(), JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("[Meta] Failed to save metadata", e);
    }
}

// --- Feature 0: Server Configuration ---

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        backupDir: BACKUP_DIR,
        ttsEngine: process.platform === 'darwin' ? 'macOS' : 'mock'
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

// --- Feature 1: Backup System (Streaming) ---

app.get('/api/backups', (req, res) => {
    const meta = loadMetadata();

    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) {
            console.error(`[Backup] List error: ${err.message}`);
            return res.status(500).json({ error: 'Failed to scan backup directory' });
        }

        const backups = files
            .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(BACKUP_DIR, file);
                try {
                    const stats = fs.statSync(filePath);
                    // Extract identifier from "backup_{identifier}.json"
                    const id = file.slice(7, -5); 
                    
                    // Use display name from metadata if available, otherwise prettify the filename
                    const displayName = meta[file]?.displayName || id.replace(/_/g, ' ');

                    return {
                        id: id, // The identifier used for restore (the filename part)
                        name: displayName, 
                        size: stats.size,
                        date: stats.mtime
                    };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

        res.json({ backups });
    });
});

app.post('/api/backup', (req, res) => {
    // Prefer username, fallback to userId
    const identifier = req.query.username || req.query.userId;

    if (!identifier) {
        return res.status(400).json({ error: 'Missing username or userId in query parameters.' });
    }

    // Sanitize filename to ASCII (e.g. Đình -> Dinh)
    const safeIdentifier = sanitizeToAscii(identifier);
    const fileName = `backup_${safeIdentifier}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);
    const writeStream = fs.createWriteStream(filePath);

    console.log(`[Backup] Receiving stream for: ${identifier} -> ${fileName}`);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
        try {
            const stats = fs.statSync(filePath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            
            // Save metadata to map the clean filename back to the original display name
            const meta = loadMetadata();
            meta[fileName] = {
                displayName: identifier, // "Đình"
                originalId: req.query.userId,
                updatedAt: Date.now()
            };
            saveMetadata(meta);

            console.log(`[Backup] Saved ${sizeMB} MB for ${identifier}`);
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
    const identifier = req.params.identifier;
    console.log(`[Backup] Request received for restore: ${identifier}`);
    
    // Sanitize again to ensure we match the storage convention
    // If client sends "Dinh" (from list ID), it remains "Dinh".
    // If client sends "Đình" (from user input?), it becomes "Dinh".
    const safeIdentifier = sanitizeToAscii(identifier);
    const fileName = `backup_${safeIdentifier}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        console.warn(`[Backup] No file found at ${filePath}`);
        return res.status(404).json({ error: `No backup found for ${identifier} (file: ${fileName}).` });
    }

    console.log(`[Backup] Streaming download for: ${fileName}`);

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
