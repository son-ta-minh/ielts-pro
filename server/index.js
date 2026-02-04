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
let BACKUP_DIR = path.join(__dirname, 'backups');
const AUDIO_DIR = path.join(__dirname, 'audio');
const CERT_DIR = path.join(__dirname, '.certs');

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

app.post('/api/backup', (req, res) => {
    const userId = req.query.userId;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in query parameters.' });
    }

    // Sanitize filename to prevent directory traversal
    const safeUserId = userId.replace(/[^a-z0-9\-_]/gi, '_');
    const fileName = `backup_${safeUserId}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);
    const writeStream = fs.createWriteStream(filePath);

    console.log(`[Backup] Receiving stream for user: ${userId} into ${filePath}`);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
        try {
            const stats = fs.statSync(filePath);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`[Backup] Saved ${sizeMB} MB for ${userId}`);
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

app.get('/api/backup/:userId', (req, res) => {
    const userId = req.params.userId;
    console.log(`[Backup] Request received for restore: ${userId}`);
    
    const safeUserId = userId.replace(/[^a-z0-9\-_]/gi, '_');
    const fileName = `backup_${safeUserId}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        console.warn(`[Backup] No file found at ${filePath}`);
        return res.status(404).json({ error: 'No backup found for this user.' });
    }

    console.log(`[Backup] Streaming download for user: ${userId}`);

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
    if (accent.startsWith("vi")) return "vi";
    if (accent.startsWith("en")) return "en";
    return null;
}

async function loadVoicesFromOS() {
    try {
        const raw = await runCommand("say -v ?");
        const lines = raw.split("\n").filter(Boolean);
        voiceIndex = {};

        for (const line of lines) {
            const match = line.match(/^(.+?)\s{2,}([a-z_]+)\s+#/i);
            if (!match) continue;

            const name = match[1].trim();
            const accent = match[2];
            const language = mapLanguage(accent);

            if (!language) continue;

            voiceIndex[name] = { language, accent };
        }
        console.log(`[TTS] Loaded ${Object.keys(voiceIndex).length} voices.`);
    } catch (e) {
        console.error("[TTS] Failed to load voices (Are you on macOS?):", e.message);
    }
}

app.get('/voices', (req, res) => {
    const voices = Object.entries(voiceIndex).map(([name, info]) => ({
        name,
        language: info.language,
        accent: info.accent
    }));

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

    console.log(`[TTS] Selected voice: ${voice}`);
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