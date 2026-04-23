/****
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
const { spawn } = require('child_process');
const logger = require('./logger');

logger.patchGlobalConsole();

const { settings } = require('./config');
const { loadGlobalLibrary } = require('./libraryManager');
const { rebuildAllUserVocabularySearchIndices } = require('./vocabularySearchIndex');
const admin = require('firebase-admin');
const os = require('os');

// --- Stability Fix: Force CWD ---
try {
    process.chdir(__dirname);
} catch (err) {
    logger.warn(`[Server] Failed to set CWD to ${__dirname}: ${err.message}`);
}

// --- Firebase Admin Init (No REST API / No Billing Required) ---
if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

    if (!fs.existsSync(serviceAccountPath)) {
        logger.error('[Firebase] serviceAccountKey.json not found at:', serviceAccountPath);
        process.exit(1);
    }

    const serviceAccount = require(serviceAccountPath);

    // Expose image key globally (singleton like Firebase Admin)
    global.imgAdmin = {
        imageKey: serviceAccount.imageKey
    };

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
    });

    logger.debug('[Firebase] Admin initialized with project:', serviceAccount.project_id);
}

const app = express();

// --- Middleware ---
app.use(cors({ origin: true, credentials: false }));
app.options('*', cors({ origin: true, credentials: false }));

app.use((req, res, next) => {
    logger.debug(`[Incoming] ${req.method} ${req.url}`);
    next();
});

app.use((req, res, next) => {
    if ((req.path === '/api/backup' && req.method === 'POST') || 
        (req.path === '/api/audio/upload' && req.method === 'POST') ||
        (req.path === '/api/images/upload' && req.method === 'POST')) {
        next(); 
    } else {
        express.json({ limit: '10mb' })(req, res, next);
    }
});

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(`[${req.method}] ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// --- Mount Routes ---
app.use('/api', require('./routes/system'));
app.use('/api', require('./routes/backup'));
app.use('/', require('./routes/tts')); // TTS often uses root paths like /speak
app.use('/api', require('./routes/pron'));
const coursesModule = require('./routes/courses');
app.use('/api', coursesModule.router);
app.use('/api', require('./routes/audio'));
app.use('/api', require('./routes/images')); // New Image Route
app.use('/api', require('./routes/gallery'));
// IMPORTANT: Ensure this line exists to activate the reading routes
app.use('/api', require('./routes/reading'));
app.use('/api', require('./routes/planning')); // Registered Planning Route
app.use('/api', require('./routes/library'));
app.use('/api', require('./routes/studybuddy'));
app.use('/api', require('./routes/youtube'));

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    logger.error(`[Error] ${req.method} ${req.path}: ${err.message}`);
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
    logger.debug('==================================================');
    logger.debug(`[INFO] Unified Server running on port ${settings.PORT}`);
    logger.debug(`[INFO] Protocol: ${protocol.toUpperCase()}`);
    logger.debug(`[INFO] Address:  ${protocol}://localhost:${settings.PORT}`);
    logger.debug(`[INFO] Storage:  ${settings.BACKUP_DIR}`);
    logger.debug(`[INFO] Log level: ${logger.level}`);
    if (protocol === 'http') {
        logger.debug(`[TIP]  To enable HTTPS, generate certs in ${settings.CERT_DIR}`);
    }
    logger.debug('==================================================');
    
    // Initialize Library
    try {
        loadGlobalLibrary();
        rebuildAllUserVocabularySearchIndices();
        coursesModule.exportAllCoursesToBackup();
    } catch (e) {
        logger.error("[Startup] Failed to load library:", e);
    }
});

// --- Auto Start Cloudflare Tunnel (if available) ---
function startCloudflareTunnel() {
    try {
        logger.debug('[Cloudflare] Attempting to start tunnel...');
        const tunnel = spawn('cloudflared', [
            'tunnel',
            '--url',
            `${protocol}://localhost:${settings.PORT}`
        ]);

        let hostUpdated = false;

        function handleTunnelOutput(raw) {
            const output = raw.toString().trim();
            if (output) {
                logger.debug(`[Cloudflare] ${output}`);
            }

            const match = output.match(/https:\/\/[-a-zA-Z0-9]+\.trycloudflare\.com/);
            if (match && !hostUpdated) {
                hostUpdated = true;
                const publicUrl = match[0];
                logger.debug(`[Cloudflare] Public URL detected: ${publicUrl}`);

                // --- Update Firestore with new host ---
                updateHostInFirestore(publicUrl);
            }
        }

        tunnel.stdout.on('data', handleTunnelOutput);
        tunnel.stderr.on('data', handleTunnelOutput);

        tunnel.on('close', (code) => {
            logger.debug(`[Cloudflare] Tunnel process exited with code ${code}`);
        });

    } catch (err) {
        logger.warn('[Cloudflare] cloudflared not found or failed to start:', err.message);
    }
}

async function updateHostInFirestore(hostUrl) {
    try {
        logger.debug('[Firebase] Updating host in Firestore (Admin SDK)...');

        const db = admin.firestore();

        // Try to get proper macOS LocalHostName (for mDNS .local access)
        let localHostname = null;

        try {
            const { execSync } = require('child_process');
            localHostname = execSync('scutil --get LocalHostName', { encoding: 'utf8' }).trim();
        } catch (e) {
            // Fallback to OS hostname
            localHostname = os.hostname();
        }

        // If hostname is actually an IP, fallback to "localhost"
        const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(localHostname);
        if (isIp || !localHostname) {
            localHostname = 'localhost';
        }

        const localUrl = `${protocol}://${localHostname}.local:${settings.PORT}`;

        await db.collection('vocabpro').doc('server').set({
            host: hostUrl,                 // Cloudflare public URL
            local: localUrl,               // Full local network URL
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        logger.debug('[Firebase] Host updated successfully.');
    } catch (err) {
        logger.error('[Firebase] Admin update failed:', err.message);
    }
}

// Start tunnel only if --public flag is provided
const isPublicMode = process.argv.includes('--public');

if (isPublicMode) {
    logger.debug('[Cloudflare] Public mode enabled via --public');
    startCloudflareTunnel();
} else {
    logger.debug('[Cloudflare] Skipped (run with --public to enable)');
}

function gracefulShutdown(signal) {
    logger.debug(`\n[Shutdown] Received ${signal}. Backing up courses...`);

    try {
        coursesModule.exportAllCoursesToBackup();
    } catch (e) {
        logger.error('[Shutdown] Backup failed:', e);
    }

    server.close(() => {
        logger.debug('[Shutdown] Server closed.');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('[Shutdown] Force exit.');
        process.exit(1);
    }, 5000);
}

function isIgnorableTransientNetworkError(errorLike) {
    const error = errorLike && typeof errorLike === 'object' && 'code' in errorLike
        ? errorLike
        : null;
    const code = error?.code || '';
    const message = String(error?.message || errorLike || '').toLowerCase();

    return (
        code === 'ECONNRESET' ||
        code === 'EPIPE' ||
        code === 'ETIMEDOUT' ||
        code === 'UND_ERR_SOCKET' ||
        message.includes('socket hang up') ||
        message.includes('aborted') ||
        message.includes('network timeout')
    );
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // PM2 / Docker
process.on('uncaughtException', (err) => {
    if (isIgnorableTransientNetworkError(err)) {
        logger.warn('[Warn] Ignored transient uncaught network error:', err);
        return;
    }
    logger.error('[Fatal] Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    if (isIgnorableTransientNetworkError(reason)) {
        logger.warn('[Warn] Ignored transient unhandled network rejection:', reason);
        return;
    }
    logger.error('[Fatal] Unhandled Rejection:', reason);
    gracefulShutdown('unhandledRejection');
});
