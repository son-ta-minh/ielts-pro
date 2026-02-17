
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { FOLDER_MAPPINGS_FILE } = require('../config');

// Load mappings (shared with Audio/Reading)
let folderMappings = {};
try {
    if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
        folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
    }
} catch (e) {
    console.error("[Images] Failed to load mappings:", e);
}

// Multer Config
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const mapName = req.body.mapName;
            if (!mapName || !folderMappings[mapName]) {
                return cb(new Error('Invalid map name'), null);
            }
            const targetDir = folderMappings[mapName];
            if (!fs.existsSync(targetDir)) {
                try {
                    fs.mkdirSync(targetDir, { recursive: true });
                } catch (e) {
                    return cb(e, null);
                }
            }
            cb(null, targetDir);
        },
        filename: (req, file, cb) => {
            const name = req.body.filename || file.originalname;
            cb(null, name.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
        }
    }),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// Stream Image
router.get('/images/stream/:mapName/*', (req, res) => {
    const { mapName } = req.params;
    const filePathRel = req.params[0];
    
    // Reload mappings to ensure fresh state
    try {
        if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
            folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
        }
    } catch (e) {}

    const rootDir = folderMappings[mapName];
    if (!rootDir) return res.status(404).send('Mapping not found');

    const fullPath = path.join(rootDir, filePathRel);
    
    if (!fullPath.startsWith(rootDir)) {
        return res.status(403).send('Access denied');
    }

    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).send('File not found');
    }
});

// List Images
router.get('/images/files/:mapName', (req, res) => {
    // Reload mappings
    try {
        if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
            folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
        }
    } catch (e) {}

    const { mapName } = req.params;
    const subPath = req.query.path || '';
    const rootDir = folderMappings[mapName];
    
    if (!rootDir || !fs.existsSync(rootDir)) {
        return res.status(404).json({ error: 'Mapping path not found' });
    }

    const safeSubPath = subPath.replace(/\.\./g, '');
    const targetDir = path.join(rootDir, safeSubPath);

    if (!targetDir.startsWith(rootDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Directory not found' });
    }

    try {
        const dirents = fs.readdirSync(targetDir, { withFileTypes: true });
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
        
        const items = dirents.map(dirent => {
            return {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file'
            };
        }).filter(item => {
            if (item.name.startsWith('.')) return false;
            if (item.type === 'directory') return true;
            const ext = path.extname(item.name).toLowerCase();
            return imageExtensions.includes(ext);
        });

        items.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });

        res.json({ items, currentPath: safeSubPath });
    } catch (e) {
        console.error(`[Images] Failed to read dir ${targetDir}:`, e);
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

// Upload Image
router.post('/images/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or invalid type' });
    }
    res.json({ success: true, path: req.file.path, filename: req.file.filename });
});

// Delete Image
router.delete('/images/file', (req, res) => {
    // Reload mappings
    try {
        if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
            folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
        }
    } catch (e) {}

    const { mapName, filename } = req.query;
    
    if (!mapName || !filename) {
        return res.status(400).json({ error: 'mapName and filename are required' });
    }

    const rootDir = folderMappings[mapName];
    if (!rootDir) return res.status(404).json({ error: 'Mapping not found' });

    const safeFilename = filename.replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(rootDir, safeFilename);
    
    if (!fullPath.startsWith(rootDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (fs.existsSync(fullPath)) {
        try {
            fs.unlinkSync(fullPath);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: `Failed to delete file: ${e.message}` });
        }
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

module.exports = router;
