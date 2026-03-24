
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const multer = require('multer');
const { settings, FOLDER_MAPPINGS_FILE } = require('../config');
const logger = require('../logger');
let FFMPEG_COMMAND = process.env.FFMPEG_PATH || 'ffmpeg';
try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) {
        FFMPEG_COMMAND = ffmpegStatic;
    }
} catch (err) {
    logger.warn('[Audio] ffmpeg-static not installed, falling back to system ffmpeg');
}

// Folder Mappings State
let folderMappings = {};
try {
    if (fs.existsSync(FOLDER_MAPPINGS_FILE())) {
        folderMappings = JSON.parse(fs.readFileSync(FOLDER_MAPPINGS_FILE(), 'utf8'));
    }
} catch (e) {
    logger.error("[Audio] Failed to load mappings:", e);
}

function saveMappings() {
    try {
        fs.writeFileSync(FOLDER_MAPPINGS_FILE(), JSON.stringify(folderMappings, null, 2));
    } catch (e) {
        logger.error("[Audio] Failed to save mappings:", e);
    }
}

// Helper: Normalize transcript text
function normalizeTranscript(text) {
    if (!text) return "";
    
    const lines = text.split(/\r?\n/);
    if (lines.length <= 1) return text;

    return lines.reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed) return acc;
        
        if (!acc) return trimmed;

        const lastChar = acc.slice(-1);
        const isSentenceEnd = /[.!?"]/.test(lastChar);
        const startsWithLower = /^[a-z]/.test(trimmed);

        if (!isSentenceEnd || startsWithLower) {
            return acc + " " + trimmed;
        } else {
            return acc + "\n" + trimmed;
        }
    }, "");
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
    })
});

// Routes

router.get('/audio/mappings', (req, res) => {
    res.json(folderMappings);
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

    folderMappings[name] = resolvedPath;
    saveMappings();
    res.json({ success: true, mappings: folderMappings });
});

router.delete('/audio/mappings/:name', (req, res) => {
    const { name } = req.params;
    if (folderMappings[name]) {
        delete folderMappings[name];
        saveMappings();
    }
    res.json({ success: true, mappings: folderMappings });
});

router.delete('/audio/file', (req, res) => {
    const { mapName, filename } = req.query;
    
    if (!mapName || !filename) {
        return res.status(400).json({ error: 'mapName and filename are required' });
    }

    const rootDir = folderMappings[mapName];
    if (!rootDir) return res.status(404).json({ error: 'Mapping not found' });

    // Basic security check to prevent directory traversal
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

router.get('/audio/stream/:mapName/*', (req, res) => {
    const { mapName } = req.params;
    const filePathRel = req.params[0]; 
    
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

router.get('/audio/download/:mapName/*', (req, res) => {
    const { mapName } = req.params;
    const filePathRel = req.params[0] || '';

    const rootDir = folderMappings[mapName];
    if (!rootDir) return res.status(404).send('Mapping not found');

    const safeRel = filePathRel.replace(/^([\.\/\\])+/, '').replace(/(\.\.(\/|\\|$))+/g, '');
    const fullPath = path.join(rootDir, safeRel);

    if (!fullPath.startsWith(rootDir)) {
        return res.status(403).send('Access denied');
    }

    if (!fs.existsSync(fullPath)) {
        return res.status(404).send('File not found');
    }

    const downloadName = `${path.basename(fullPath, path.extname(fullPath))}.mp3`;
    const safeDownloadName = downloadName.replace(/"/g, '');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
    res.setHeader('Cache-Control', 'no-cache');

    let ffmpegError = false;
    const ffmpeg = spawn(FFMPEG_COMMAND, ['-y', '-i', fullPath, '-f', 'mp3', '-q:a', '2', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on('data', chunk => {
        logger.debug(`[Audio] ffmpeg: ${chunk.toString('utf8')}`);
    });

    ffmpeg.on('error', err => {
        logger.error('[Audio] ffmpeg spawn failed', err);
        ffmpegError = true;
        if (!res.headersSent) {
            res.status(500).send('Failed to convert audio');
        } else {
            res.end();
        }
    });

    const cleanup = () => {
        if (!ffmpeg.killed) {
            ffmpeg.kill('SIGKILL');
        }
    };

    res.on('close', cleanup);
    req.on('close', cleanup);

    ffmpeg.on('close', (code) => {
        if (!ffmpegError && code !== 0 && !res.writableEnded) {
            res.end();
        }
    });
});

router.get('/audio/files/:mapName', (req, res) => {
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

    // Transcript Logic
    let transcripts = [];
    const transcriptRawPath = path.join(targetDir, 'transcript.json');
    const transcriptRefinePath = path.join(targetDir, 'transcript_refine.json');

    if (fs.existsSync(transcriptRefinePath)) {
        try {
            const content = fs.readFileSync(transcriptRefinePath, 'utf8');
            transcripts = JSON.parse(content);
            if (!Array.isArray(transcripts)) transcripts = [];
        } catch (e) {}
    } 
    else if (fs.existsSync(transcriptRawPath)) {
        try {
            const content = fs.readFileSync(transcriptRawPath, 'utf8');
            const rawTranscripts = JSON.parse(content);
            if (Array.isArray(rawTranscripts)) {
                transcripts = rawTranscripts.map(item => ({
                    ...item,
                    content: normalizeTranscript(item.content)
                }));
                try {
                    fs.writeFileSync(transcriptRefinePath, JSON.stringify(transcripts, null, 2), 'utf8');
                } catch (writeErr) {}
            }
        } catch (e) {}
    }

    try {
        const dirents = fs.readdirSync(targetDir, { withFileTypes: true });
        const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.webm'];
        
        const items = dirents.map(dirent => {
            const item = {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file'
            };

            if (item.type === 'file' && transcripts.length > 0) {
                const cleanName = dirent.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const match = transcripts.find(t => {
                    if (!t.title) return false;
                    const cleanTitle = t.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return cleanName.includes(cleanTitle);
                });

                if (match && match.content) {
                    item.transcript = match.content;
                    item.transcriptTitle = match.title; 
                }
            }

            return item;
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
        logger.error(`[Audio] Failed to read dir ${targetDir}:`, e);
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
