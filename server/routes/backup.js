
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');
const { sanitizeToAscii, getAppBackupPath, loadMetadata, saveMetadata } = require('../utils');
const { rebuildUserVocabularySearchIndexFromFile } = require('../vocabularySearchIndex');
const logger = require('../logger');

function resolveBackupPaths(appName, identifier, createIfNotExist = false) {
    const appDir = getAppBackupPath(appName, createIfNotExist);
    if (!appDir) return null;
    const safeIdentifier = sanitizeToAscii(identifier);
    const fileName = `backup_${safeIdentifier}.json`;
    const filePath = path.join(appDir, fileName);
    const archiveDir = path.join(appDir, 'archive');
    return {
        appDir,
        safeIdentifier,
        fileName,
        filePath,
        archiveDir,
    };
}

function ensureArchiveDir(archiveDir) {
    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
    }
}

function archiveCurrentBackupFile({ filePath, fileName, archiveDir, safeIdentifier }) {
    if (!fs.existsSync(filePath)) {
        const err = new Error('Current backup file does not exist.');
        err.code = 'BACKUP_NOT_FOUND';
        throw err;
    }

    ensureArchiveDir(archiveDir);

    const stats = fs.statSync(filePath);
    const sourceDate = new Date(stats.mtime).toISOString().split('T')[0];
    let archiveFileName = `backup_${safeIdentifier}_${sourceDate}.json`;
    let archivePath = path.join(archiveDir, archiveFileName);

    if (fs.existsSync(archivePath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        archiveFileName = `backup_${safeIdentifier}_${sourceDate}_${stamp}.json`;
        archivePath = path.join(archiveDir, archiveFileName);
    }

    fs.copyFileSync(filePath, archivePath);
    logger.info(`[Backup] Archived '${fileName}' to '${archivePath}'`);
    return { archiveFileName, archivePath };
}

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
            logger.error(`[Backup] Error reading dir ${dir}:`, e.message);
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
        logger.error(`[Backup] List error: ${err.message}`);
        return res.status(500).json({ error: 'Failed to scan backup directories' });
    }
});

router.get('/archives', async (req, res) => {
    const appName = req.query.app;
    const identifier = String(req.query.identifier || '').trim();
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    if (!identifier) {
        return res.status(400).json({ error: 'identifier parameter is required' });
    }

    const resolved = resolveBackupPaths(appName, identifier);
    if (!resolved || !fs.existsSync(resolved.archiveDir)) {
        return res.json({ archives: [] });
    }

    try {
        const archives = fs.readdirSync(resolved.archiveDir)
            .filter((file) => file.startsWith(`backup_${resolved.safeIdentifier}_`) && file.endsWith('.json'))
            .map((file) => {
                const filePath = path.join(resolved.archiveDir, file);
                const stats = fs.statSync(filePath);
                return {
                    id: file,
                    name: file.replace(/^backup_/, '').replace(/\.json$/i, ''),
                    size: stats.size,
                    date: stats.mtime,
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        return res.json({ archives });
    } catch (err) {
        logger.error(`[Backup] Failed to list archives: ${err.message}`);
        return res.status(500).json({ error: 'Failed to list archive files.' });
    }
});

router.post('/archive', (req, res) => {
    const appName = req.query.app;
    const identifier = String(req.query.identifier || req.query.username || req.query.userId || '').trim();
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    if (!identifier) {
        return res.status(400).json({ error: 'identifier parameter is required' });
    }

    try {
        const resolved = resolveBackupPaths(appName, identifier, true);
        const { archiveFileName } = archiveCurrentBackupFile(resolved);
        return res.json({ success: true, archiveId: archiveFileName });
    } catch (err) {
        if (err.code === 'BACKUP_NOT_FOUND') {
            return res.status(404).json({ error: `No current backup found for ${identifier}.` });
        }
        logger.error(`[Backup] Failed to archive current backup: ${err.message}`);
        return res.status(500).json({ error: 'Failed to archive current backup.' });
    }
});

router.post('/archive/restore', (req, res) => {
    const appName = req.query.app;
    const identifier = String(req.body?.identifier || req.query.identifier || '').trim();
    const archiveId = String(req.body?.archiveId || '').trim();
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    if (!identifier || !archiveId) {
        return res.status(400).json({ error: 'identifier and archiveId are required' });
    }

    try {
        const resolved = resolveBackupPaths(appName, identifier, true);
        const archivePath = path.join(resolved.archiveDir, archiveId);
        if (!archiveId.startsWith(`backup_${resolved.safeIdentifier}_`) || !archiveId.endsWith('.json') || !fs.existsSync(archivePath)) {
            return res.status(404).json({ error: 'Archive file not found for this user.' });
        }

        fs.copyFileSync(archivePath, resolved.filePath);
        const meta = loadMetadata(resolved.appDir);
        meta[resolved.fileName] = {
            ...(meta[resolved.fileName] || {}),
            displayName: identifier,
            originalId: meta[resolved.fileName]?.originalId || req.body?.userId || null,
            updatedAt: Date.now(),
            restoredFromArchive: archiveId
        };
        saveMetadata(meta, resolved.appDir);

        if (appName === 'vocab') {
            rebuildUserVocabularySearchIndexFromFile(resolved.filePath, String(identifier || '').trim());
        }

        logger.info(`[Backup] Restored archive '${archiveId}' as current backup for '${identifier}'.`);
        return res.json({ success: true });
    } catch (err) {
        logger.error(`[Backup] Failed to restore archive: ${err.message}`);
        return res.status(500).json({ error: 'Failed to restore archive.' });
    }
});

router.delete('/archive', (req, res) => {
    const appName = req.query.app;
    const identifier = String(req.query.identifier || '').trim();
    const archiveId = String(req.query.archiveId || '').trim();
    if (!appName) {
        return res.status(400).json({ error: 'app parameter is required' });
    }
    if (!identifier || !archiveId) {
        return res.status(400).json({ error: 'identifier and archiveId are required' });
    }

    try {
        const resolved = resolveBackupPaths(appName, identifier, true);
        const archivePath = path.join(resolved.archiveDir, archiveId);
        if (!archiveId.startsWith(`backup_${resolved.safeIdentifier}_`) || !archiveId.endsWith('.json') || !fs.existsSync(archivePath)) {
            return res.status(404).json({ error: 'Archive file not found for this user.' });
        }

        fs.unlinkSync(archivePath);
        logger.info(`[Backup] Deleted archive '${archiveId}' for '${identifier}'.`);
        return res.json({ success: true });
    } catch (err) {
        logger.error(`[Backup] Failed to delete archive: ${err.message}`);
        return res.status(500).json({ error: 'Failed to delete archive.' });
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
                logger.info(`[Backup] New day detected. Archiving previous day's data for ${safeIdentifier}.`);
                
                const archiveDir = path.join(appDir, 'archive');
                if (!fs.existsSync(archiveDir)) {
                    fs.mkdirSync(archiveDir, { recursive: true });
                }

                const archiveFileName = `backup_${safeIdentifier}_${lastModDate}.json`;
                const archivePath = path.join(archiveDir, archiveFileName);
                
                fs.copyFileSync(filePath, archivePath);
                logger.info(`[Backup] Archived '${fileName}' to '${archivePath}'`);

                // Retention policy
                const allArchivedFiles = fs.readdirSync(archiveDir);
                const userArchives = allArchivedFiles
                    .filter(f => f.startsWith(`backup_${safeIdentifier}_`) && f.endsWith('.json'))
                    .sort();

                if (userArchives.length > settings.DAILY_BACKUP_RETENTION) {
                    const filesToDelete = userArchives.slice(0, userArchives.length - settings.DAILY_BACKUP_RETENTION);
                    filesToDelete.forEach(fileToDelete => {
                        fs.unlinkSync(path.join(archiveDir, fileToDelete));
                        logger.info(`[Backup] Rotated out old backup: ${fileToDelete} from archive.`);
                    });
                }
            }
        }
    } catch (backupErr) {
        logger.error(`[Backup] Daily archival process failed: ${backupErr.message}. The main backup will still proceed.`);
    }

    const writeStream = fs.createWriteStream(filePath);
    logger.info(`[Backup] Receiving stream for: ${identifier} -> ${fileName}`);
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

            if (appName === 'vocab') {
                rebuildUserVocabularySearchIndexFromFile(filePath, String(identifier || '').trim());
            }

            logger.info(`[Backup] Saved ${sizeMB} MB for ${identifier} in app '${appName}'`);
            res.json({ success: true, size: stats.size, timestamp: Date.now() });
        } catch (err) {
            logger.error(`[Backup] Stat error: ${err.message}`);
            res.status(500).json({ error: 'Backup saved but failed to verify size.' });
        }
    });

    writeStream.on('error', (err) => {
        logger.error(`[Backup] Write error: ${err.message}`);
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
    logger.info(`[Backup] Request received for restore: ${identifier} in app '${appName}'`);
    
    const safeIdentifier = sanitizeToAscii(identifier);
    const fileName = `backup_${safeIdentifier}.json`;
    const filePath = path.join(appDir, fileName);

    if (!fs.existsSync(filePath)) {
        logger.warn(`[Backup] No backup file found for identifier '${identifier}' in app '${appName}'. Looked for: ${filePath}`);
        return res.status(404).json({ error: `No backup found for ${identifier}.` });
    }

    logger.info(`[Backup] Streaming download for: ${filePath}`);

    const readStream = fs.createReadStream(filePath);
    readStream.on('error', (err) => {
        logger.error(`[Backup] Read error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to read backup file.' });
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    readStream.pipe(res);
});

module.exports = router;
