
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { settings, FOLDER_MAPPINGS_FILE } = require('../config');

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
        console.log(`[Config] Backup directory updated to: ${settings.BACKUP_DIR}`);
        res.json({ success: true, path: settings.BACKUP_DIR });
    } catch (err) {
        console.error(`[Config] Failed to set backup path: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
