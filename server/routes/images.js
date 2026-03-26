const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { FOLDER_MAPPINGS_FILE } = require('../config');
const https = require('https');
const http = require('http');
const logger = require('../logger');
const fetch = require('node-fetch');

// Load mappings (shared with Audio/Reading)
let folderMappings = {};
try {
    if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
        folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
    }
} catch (e) {
    logger.error("[Images] Failed to load mappings:", e);
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
        logger.error(`[Images] Failed to read dir ${targetDir}:`, e);
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

// Cache Remote Image to local mapped "Image" folder
router.post('/images/cache', express.json(), async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Reload mappings
        if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
            folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
        }

        const targetDir = folderMappings['Image'];
        if (!targetDir) {
            return res.status(404).json({ error: 'Image mapping not found' });
        }

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const parsedUrl = new URL(url);
        const ext = path.extname(parsedUrl.pathname) || '.jpg';
        const safeName = path.basename(parsedUrl.pathname)
            .replace(/[^a-zA-Z0-9.\-_]/g, '_') || `img_${Date.now()}${ext}`;

        const filename = `${Date.now()}_${safeName}`;
        const fullPath = path.join(targetDir, filename);

        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const fileStream = fs.createWriteStream(fullPath);

        protocol.get(url, response => {
            if (response.statusCode !== 200) {
                const reason = `Remote server responded with ${response.statusCode} ${response.statusMessage || ''}`.trim();
                fs.unlink(fullPath, () => {});
                return res.status(400).json({ error: reason });
            }

            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                res.json({
                    success: true,
                    url: `/api/images/stream/Image/${filename}`
                });
            });
        }).on('error', err => {
            fs.unlink(fullPath, () => {});
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        logger.error('[Images] Cache error:', err);
        res.status(500).json({ error: 'Failed to cache image' });
    }
});

/**
 * Search images from Unsplash and cache locally
 */
router.get('/images/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Missing query param q' });
        }

        const ACCESS_KEY = global.imgAdmin?.imageKey;
        if (!ACCESS_KEY) {
            return res.status(500).json({ error: 'Missing imageKey (imgAdmin not initialized)' });
        }

        // Reload mappings
        if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
            folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
        }

        const targetDir = folderMappings['Image'];
        if (!targetDir) {
            return res.status(404).json({ error: 'Image mapping not found' });
        }

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const apiUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&client_id=${ACCESS_KEY}`;
        const apiRes = await fetch(apiUrl);
        const data = await apiRes.json();

        if (!apiRes.ok) {
            return res.status(apiRes.status).json(data);
        }

        const results = [];

        const downloadImage = (imgUrl, filename) => {
            return new Promise((resolve, reject) => {
                const protocol = imgUrl.startsWith('https') ? https : http;
                const filePath = path.join(targetDir, filename);
                const fileStream = fs.createWriteStream(filePath);

                protocol.get(imgUrl, response => {
                    if (response.statusCode !== 200) {
                        fs.unlink(filePath, () => {});
                        return reject(new Error(`Failed ${response.statusCode}`));
                    }

                    response.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close(() => resolve(filename));
                    });
                }).on('error', err => {
                    fs.unlink(filePath, () => {});
                    reject(err);
                });
            });
        };

        const first = data.results[0];
        if (first) {
            const imgUrl = first.urls.small;
            const filename = `${Date.now()}_${first.id}.jpg`;

            try {
                await downloadImage(imgUrl, filename);
                results.push({
                    id: first.id,
                    url: `/api/images/stream/Image/${filename}`
                });
            } catch (e) {
                logger.error('[Images] Download failed:', e.message);
            }
        }

        res.json({ images: results });

    } catch (err) {
        logger.error('[Images] Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;
