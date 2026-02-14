
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { settings, AUDIO_MAPPINGS_FILE } = require('../config');

// Audio Mappings State
let audioMappings = {};
try {
    if (fs.existsSync(AUDIO_MAPPINGS_FILE())) {
        audioMappings = JSON.parse(fs.readFileSync(AUDIO_MAPPINGS_FILE(), 'utf8'));
    }
} catch (e) {
    console.error("[Audio] Failed to load mappings:", e);
}

function saveAudioMappings() {
    try {
        fs.writeFileSync(AUDIO_MAPPINGS_FILE(), JSON.stringify(audioMappings, null, 2));
    } catch (e) {
        console.error("[Audio] Failed to save mappings:", e);
    }
}

// Multer Config
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const mapName = req.body.mapName;
            if (!mapName || !audioMappings[mapName]) {
                return cb(new Error('Invalid map name'), null);
            }
            const targetDir = audioMappings[mapName];
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
    })
});

// Routes

router.get('/audio/mappings', (req, res) => {
    res.json(audioMappings);
});

router.post('/audio/mappings', (req, res) => {
    const { name, path: folderPath } = req.body;
    if (!name || !folderPath) return res.status(400).json({ error: 'Name and path required' });
    
    let resolvedPath = folderPath;
    if (resolvedPath.startsWith('~')) {
        resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
    }
    
    if (!fs.existsSync(resolvedPath)) {
        try {
            fs.mkdirSync(resolvedPath, { recursive: true });
        } catch (e) {
            return res.status(400).json({ error: `Path does not exist and cannot be created: ${e.message}` });
        }
    }

    audioMappings[name] = resolvedPath;
    saveAudioMappings();
    res.json({ success: true, mappings: audioMappings });
});

router.delete('/audio/mappings/:name', (req, res) => {
    const { name } = req.params;
    if (audioMappings[name]) {
        delete audioMappings[name];
        saveAudioMappings();
    }
    res.json({ success: true, mappings: audioMappings });
});

router.get('/audio/stream/:mapName/*', (req, res) => {
    const { mapName } = req.params;
    const filePathRel = req.params[0]; 
    
    const rootDir = audioMappings[mapName];
    if (!rootDir) return res.status(404).send('Mapping not found');

    const fullPath = path.join(rootDir, filePathRel);
    
    // Security check
    if (!fullPath.startsWith(rootDir)) {
        return res.status(403).send('Access denied');
    }

    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).send('File not found');
    }
});

router.get('/audio/files/:mapName', (req, res) => {
    const { mapName } = req.params;
    const subPath = req.query.path || '';
    const rootDir = audioMappings[mapName];
    
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
        const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'];
        
        const items = dirents.map(dirent => {
            return {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file'
            };
        }).filter(item => {
            if (item.name.startsWith('.')) return false;
            if (item.type === 'directory') return true;
            const ext = path.extname(item.name).toLowerCase();
            return audioExtensions.includes(ext);
        });

        items.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });

        res.json({ items, currentPath: safeSubPath });
    } catch (e) {
        console.error(`[Audio] Failed to read dir ${targetDir}:`, e);
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

router.post('/audio/upload', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ success: true, path: req.file.path, filename: req.file.filename });
});

module.exports = router;
