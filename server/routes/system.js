
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { settings, FOLDER_MAPPINGS_FILE } = require('../config');
const logger = require('../logger');

router.get('/health', (req, res) => {
    // Check mappings count dynamically
    let mappingsCount = 0;
    try {
        if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
            const data = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
            mappingsCount = Object.keys(data).length;
        }
    } catch (e) {}

    // Check dict size
    let dictSize = 0;
    if (fs.existsSync(settings.DICT_PATH)) {
        dictSize = 'Loaded in Memory'; 
    }

    res.json({ 
        status: 'ok', 
        backupDir: settings.BACKUP_DIR,
        dictSize: dictSize,
        ttsEngine: process.platform === 'darwin' ? 'macOS-Say' : 'none',
        audioMappingsCount: mappingsCount
    });
});

router.post('/config/backup-path', (req, res) => {
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
            fs.mkdirSync(resolvedPath, { recursive: true });
        }
        
        // Verify Write Access
        const testFile = path.join(resolvedPath, '.test_write');
        try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (writeErr) {
            throw new Error(`Write permission denied: ${writeErr.message}`);
        }

        settings.BACKUP_DIR = resolvedPath;
        logger.debug(`[Config] Backup directory updated to: ${settings.BACKUP_DIR}`);
        res.json({ success: true, path: settings.BACKUP_DIR });
    } catch (err) {
        logger.error(`[Config] Failed to set backup path: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

router.get('/extension/chrome/download', (req, res) => {
    const extensionDir = path.resolve(__dirname, '../../extension/chrome');
    if (!fs.existsSync(extensionDir)) {
        return res.status(404).json({ error: 'Chrome extension folder not found.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="mini-study-buddy-chrome.zip"');

    const zipProcess = spawn('zip', ['-r', '-', '.', '-x', '*.DS_Store'], {
        cwd: extensionDir,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    zipProcess.stdout.pipe(res);
    zipProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
    });

    zipProcess.on('error', (err) => {
        logger.error(`[System] Failed to start zip for Chrome extension: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to package Chrome extension.' });
        } else {
            res.end();
        }
    });

    zipProcess.on('close', (code) => {
        if (code === 0) {
            return;
        }
        logger.error(`[System] Chrome extension zip exited with code ${code}: ${stderr.trim()}`);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to package Chrome extension.' });
        } else if (!res.writableEnded) {
            res.end();
        }
    });
});

module.exports = router;
