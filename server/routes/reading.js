
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { FOLDER_MAPPINGS_FILE } = require('../config');
const { getReadingUnits } = require('../libraryManager');

console.log("[Reading Route] Module loaded.");

let folderMappings = {};

function loadMappings() {
    try {
        const mappingFile = FOLDER_MAPPINGS_FILE();
        if (fs.existsSync(mappingFile)) {
            folderMappings = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        }
    } catch (e) {
        console.error("[Reading] Failed to load mappings:", e.message);
    }
}
loadMappings();

// --- API ---

// NEW: Get aggregated Master Reading Units
router.get('/reading/master', (req, res) => {
    console.log("[Reading] GET /reading/master called");
    try {
        const units = getReadingUnits();
        
        // Normalize data for frontend consumption
        const mappedUnits = units.map(u => ({
            id: u.id,
            name: u.name || u.n,
            description: u.description || u.d,
            essay: u.essay || u.e,
            // Map vocabulary string
            words: u.customVocabString || u.cvs || (Array.isArray(u.wordIds) ? `${u.wordIds.length} linked words` : ''),
            // Map tags (support both long and short keys)
            tags: u.tags || u.t || [],
            // Helper for display
            displayName: u.name || u.n || 'Untitled Unit'
        }));
        
        // Sort by name
        mappedUnits.sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        res.json({ items: mappedUnits });
    } catch (e) {
        console.error("[Reading] Error serving master list:", e);
        res.status(500).json({ error: e.message });
    }
});

// List text files in a mapped folder
router.get('/reading/files/:mapName', (req, res) => {
    loadMappings(); // Ensure latest
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
        const validExtensions = ['.txt', '.md', '.json'];
        
        const items = dirents.map(dirent => {
            const item = {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file'
            };

            // If it's a file, peek inside JSONs for a display name
            if (item.type === 'file') {
                 const ext = path.extname(dirent.name).toLowerCase();
                 if (ext === '.json') {
                     try {
                         const fullPath = path.join(targetDir, dirent.name);
                         // Read first 1KB to try and find name without parsing whole file if possible? 
                         // Or just parse it if they are small essays. Essays are small.
                         const content = fs.readFileSync(fullPath, 'utf8');
                         const json = JSON.parse(content);
                         if (json.name) {
                             item.displayName = json.name;
                         }
                     } catch (e) {
                         // Ignore parse errors, just use filename
                     }
                 }
            }

            return item;
        }).filter(item => {
            if (item.name.startsWith('.')) return false;
            if (item.type === 'directory') return true;
            const ext = path.extname(item.name).toLowerCase();
            return validExtensions.includes(ext);
        });

        items.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });

        res.json({ items, currentPath: safeSubPath });
    } catch (e) {
        console.error(`[Reading] Failed to read dir ${targetDir}:`, e);
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

// Get content of a specific file
router.get('/reading/content/:mapName/*', (req, res) => {
    loadMappings();
    const { mapName } = req.params;
    const filePathRel = req.params[0]; 
    
    const rootDir = folderMappings[mapName];
    if (!rootDir) return res.status(404).json({ error: 'Mapping not found' });

    const fullPath = path.join(rootDir, filePathRel);
    
    // Security check
    if (!fullPath.startsWith(rootDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        const ext = path.extname(fullPath).toLowerCase();
        const rawContent = fs.readFileSync(fullPath, 'utf8');
        const filename = path.basename(fullPath, ext);

        if (ext === '.json') {
            try {
                const json = JSON.parse(rawContent);
                return res.json({
                    title: json.name || json.title || filename,
                    essay: json.essay || json.content || '',
                    // Support both new 'customVocabString' and legacy/generic 'words'
                    words: json.customVocabString || json.words || json.vocab || ''
                });
            } catch (e) {
                return res.status(500).json({ error: 'Invalid JSON file' });
            }
        } else {
            // Text or Markdown parsing
            // Heuristic: Look for "Words:" or "Vocabulary:" line
            let essay = rawContent;
            let words = '';
            
            const lines = rawContent.split('\n');
            const wordLineIndex = lines.findIndex(line => 
                line.trim().match(/^(Words|Vocabulary|Vocab):/i)
            );

            if (wordLineIndex !== -1) {
                // Found words line
                const wordLine = lines[wordLineIndex];
                words = wordLine.replace(/^(Words|Vocabulary|Vocab):/i, '').trim();
            }

            res.json({
                title: filename.replace(/_/g, ' '),
                essay: rawContent,
                words: words
            });
        }
    } catch (e) {
        console.error(`[Reading] Failed to read file ${fullPath}:`, e);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

module.exports = router;
