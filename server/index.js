
/**
 * Unified Vocab Pro Server
 * Features:
 * 1. Streaming Backup System
 * 2. Local macOS TTS
 * 3. HTTPS Support
 * 4. IPA/Cambridge Logic
 * 5. Audio Server
 * 6. Consolidated Global Library
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { settings } = require('./config');
const { loadGlobalLibrary } = require('./libraryManager');

// --- Stability Fix: Force CWD ---
try {
    process.chdir(__dirname);
} catch (err) {
    console.warn(`[Server] Failed to set CWD to ${__dirname}: ${err.message}`);
}

const app = express();

// --- Middleware ---
app.use(cors({ origin: true, credentials: false }));
app.options('*', cors({ origin: true, credentials: false }));

app.use((req, res, next) => {
    console.log(`[Incoming] ${req.method} ${req.url}`);
    next();
});

app.use((req, res, next) => {
    if ((req.path === '/api/backup' && req.method === 'POST') || 
        (req.path === '/api/audio/upload' && req.method === 'POST')) {
        next(); 
    } else {
        express.json({ limit: '10mb' })(req, res, next);
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

// --- Mount Routes ---
app.use('/api', require('./routes/system'));
app.use('/api', require('./routes/backup'));
app.use('/', require('./routes/tts')); // TTS often uses root paths like /speak
app.use('/api', require('./routes/ipa'));
app.use('/api', require('./routes/audio'));
app.use('/api', require('./routes/library'));

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.path}: ${err.message}`);
    if (res.headersSent) {
        return next(err);
    }
    if (err.message === 'Invalid map name') {
        return res.status(400).json({ error: 'Invalid or missing map name. Please ensure mapName is sent before the file.' });
    }
    res.status(500).json({ error: err.message });
});

// --- Server Startup ---

function loadHttpsCertificates() {
    if (!fs.existsSync(settings.CERT_DIR)) return null;

    const files = fs.readdirSync(settings.CERT_DIR);
    const keyFile = files.find(f => f.endsWith('key.pem'));
    const certFile = files.find(f => f.endsWith('.pem') && !f.endsWith('key.pem'));

    if (keyFile && certFile) {
        return {
            key: fs.readFileSync(path.join(settings.CERT_DIR, keyFile)),
            cert: fs.readFileSync(path.join(settings.CERT_DIR, certFile))
        };
    }
    return null;
}

const httpsOptions = loadHttpsCertificates();
let server;
let protocol = 'http';

if (httpsOptions) {
    server = https.createServer(httpsOptions, app);
    protocol = 'https';
} else {
    server = http.createServer(app);
}

server.listen(settings.PORT, settings.HOST, () => {
    console.log(`==================================================`);
    console.log(`[INFO] Unified Server running on port ${settings.PORT}`);
    console.log(`[INFO] Protocol: ${protocol.toUpperCase()}`);
    console.log(`[INFO] Address:  ${protocol}://localhost:${settings.PORT}`);
    console.log(`[INFO] Storage:  ${settings.BACKUP_DIR}`);
    if (protocol === 'http') {
        console.log(`[TIP]  To enable HTTPS, generate certs in ${settings.CERT_DIR}`);
    }
    console.log(`==================================================`);
    
    // Initialize Library
    try {
        loadGlobalLibrary();
    } catch (e) {
        console.error("[Startup] Failed to load library:", e);
    }
});
