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
const { settings } = require('./config');
const { loadGlobalLibrary } = require('./libraryManager');
const admin = require('firebase-admin');

// --- Stability Fix: Force CWD ---
try {
    process.chdir(__dirname);
} catch (err) {
    console.warn(`[Server] Failed to set CWD to ${__dirname}: ${err.message}`);
}

// --- Firebase Admin Init (No REST API / No Billing Required) ---
if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

    if (!fs.existsSync(serviceAccountPath)) {
        console.error('[Firebase] serviceAccountKey.json not found at:', serviceAccountPath);
        process.exit(1);
    }

    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
    });

    console.log('[Firebase] Admin initialized with project:', serviceAccount.project_id);
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
        console.log(`[${req.method}] ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// --- Mount Routes ---
app.use('/api', require('./routes/system'));
app.use('/api', require('./routes/backup'));
app.use('/', require('./routes/tts')); // TTS often uses root paths like /speak
app.use('/api', require('./routes/ipa'));
const coursesModule = require('./routes/courses');
app.use('/api', coursesModule.router);
app.use('/api', require('./routes/audio'));
app.use('/api', require('./routes/images')); // New Image Route
// IMPORTANT: Ensure this line exists to activate the reading routes
app.use('/api', require('./routes/reading'));
app.use('/api', require('./routes/planning')); // Registered Planning Route
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
        coursesModule.exportAllCoursesToBackup();
    } catch (e) {
        console.error("[Startup] Failed to load library:", e);
    }
});

// --- Auto Start Cloudflare Tunnel (if available) ---
function startCloudflareTunnel() {
    try {
        console.log('[Cloudflare] Attempting to start tunnel...');
        const tunnel = spawn('cloudflared', [
            'tunnel',
            '--url',
            `${protocol}://localhost:${settings.PORT}`
        ]);

        let hostUpdated = false;

        function handleTunnelOutput(raw) {
            const output = raw.toString();
            process.stdout.write(`[Cloudflare] ${output}`);

            const match = output.match(/https:\/\/[-a-zA-Z0-9]+\.trycloudflare\.com/);
            if (match && !hostUpdated) {
                hostUpdated = true;
                const publicUrl = match[0];
                console.log(`[Cloudflare] Public URL detected: ${publicUrl}`);

                // --- Update Firestore with new host ---
                updateHostInFirestore(publicUrl);
            }
        }

        tunnel.stdout.on('data', handleTunnelOutput);
        tunnel.stderr.on('data', handleTunnelOutput);

        tunnel.on('close', (code) => {
            console.log(`[Cloudflare] Tunnel process exited with code ${code}`);
        });

    } catch (err) {
        console.warn('[Cloudflare] cloudflared not found or failed to start:', err.message);
    }
}

async function updateHostInFirestore(hostUrl) {
    try {
        console.log('[Firebase] Updating host in Firestore (Admin SDK)...');

        const db = admin.firestore();

        await db.collection('vocabpro').doc('server').set({
            host: hostUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log('[Firebase] Host updated successfully.');
    } catch (err) {
        console.error('[Firebase] Admin update failed:', err.message);
    }
}

// Start tunnel automatically if cloudflared exists
startCloudflareTunnel();

function gracefulShutdown(signal) {
    console.log(`\n[Shutdown] Received ${signal}. Backing up courses...`);

    try {
        coursesModule.exportAllCoursesToBackup();
    } catch (e) {
        console.error('[Shutdown] Backup failed:', e);
    }

    server.close(() => {
        console.log('[Shutdown] Server closed.');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Shutdown] Force exit.');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // PM2 / Docker
process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled Rejection:', reason);
    gracefulShutdown('unhandledRejection');
});
