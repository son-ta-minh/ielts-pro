
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');
const { sanitizeToAscii, getAppBackupPath, loadMetadata, saveMetadata } = require('../utils');

router.get('/backups', async (req, res) => {
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
        const allFilesNested = await Promise.all([readDirSafe(appDir)]);
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

router.post('/backup', (req, res) => {
    const appName = req.query.app;
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    
    const appDir = getAppBackupPath(appName, true); 
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

                // Retention policy
                const allArchivedFiles = fs.readdirSync(archiveDir);
                const userArchives = allArchivedFiles
                    .filter(f => f.startsWith(`backup_${safeIdentifier}_`) && f.endsWith('.json'))
                    .sort();

                if (userArchives.length > settings.DAILY_BACKUP_RETENTION) {
                    const filesToDelete = userArchives.slice(0, userArchives.length - settings.DAILY_BACKUP_RETENTION);
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

router.get('/backup/:identifier', (req, res) => {
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

module.exports = router;
