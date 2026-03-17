const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const cheerio = require('cheerio');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
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

const normalizeText = (value) => {
    return String(value || '').replace(/\s+/g, ' ').trim();
};

router.get('/reading/from-url', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
                'Accept':
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://www.google.com/',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Connection': 'keep-alive'
            },
            redirect: 'follow'
        });

        if (!response.ok) {
            // --- First fallback: textise mirror (often bypasses bot protection like DataDome) ---
            try {
                const textiseUrl = `https://textise.net/showtext.aspx?strURL=${encodeURIComponent(targetUrl)}`;
                console.warn('[Reading] Primary fetch blocked. Trying textise mirror:', textiseUrl);

                const mirrorResponse = await fetch(textiseUrl, {
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    redirect: 'follow'
                });

                if (mirrorResponse.ok) {
                    console.log('[Reading] textise fallback succeeded');
                    const mirrorHtml = await mirrorResponse.text();

                    const dom = new JSDOM(mirrorHtml, { url: targetUrl });
                    const reader = new Readability(dom.window.document);
                    const article = reader.parse();

                    if (article && article.textContent && article.textContent.length > 200) {
                        const essay = normalizeText(article.textContent).slice(0, 8000);
                        const title = normalizeText(article.title) || parsedUrl.hostname;
                        return res.json({ title, essay });
                    }

                    // secondary extraction if Readability fails
                    const $ = cheerio.load(mirrorHtml);
                    $('script, style, noscript').remove();
                    const text = normalizeText($('body').text()).slice(0, 8000);
                    if (text.length > 200) {
                        return res.json({ title: parsedUrl.hostname, essay: text });
                    }
                }
            } catch (mirrorError) {
                console.warn('[Reading] textise fallback failed:', mirrorError.message);
            }

            // --- Second fallback: AMP version (some sites allow it) ---
            if (parsedUrl.hostname.includes('reuters.com')) {
                try {
                    const ampUrl = targetUrl.includes('?')
                        ? `${targetUrl}&outputType=amp`
                        : `${targetUrl}?outputType=amp`;

                    console.warn('[Reading] Trying AMP fallback:', ampUrl);

                    const ampResponse = await fetch(ampUrl, {
                        headers: {
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
                            'Accept':
                                'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Referer': 'https://www.google.com/'
                        },
                        redirect: 'follow'
                    });

                    if (ampResponse.ok) {
                        console.log('[Reading] AMP fallback succeeded');
                        const ampHtml = await ampResponse.text();

                        const dom = new JSDOM(ampHtml, { url: targetUrl });
                        const reader = new Readability(dom.window.document);
                        const article = reader.parse();

                        if (article && article.textContent && article.textContent.length > 200) {
                            const essay = normalizeText(article.textContent).slice(0, 8000);
                            const title = normalizeText(article.title) || parsedUrl.hostname;
                            return res.json({ title, essay });
                        }
                    }
                } catch (ampError) {
                    console.warn('[Reading] AMP fallback failed:', ampError.message);
                }
            }

            let bodyPreview = '';
            try {
                const clone = response.clone();
                const text = await clone.text();
                bodyPreview = text.slice(0, 500);
            } catch (e) {
                bodyPreview = '[unable to read body]';
            }

            console.error('[Reading] Upstream fetch failed:', {
                url: targetUrl,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                bodyPreview
            });

            return res.status(response.status).json({
                error: `Failed to fetch URL`,
                status: response.status,
                statusText: response.statusText
            });
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            return res.status(400).json({ error: 'URL did not return HTML content' });
        }

        const html = await response.text();

        // --- Primary extraction using Mozilla Readability (like Firefox Reader Mode) ---
        let essay = '';
        let title = '';
        let readerAvailable = false;

        try {
            const dom = new JSDOM(html, { url: targetUrl });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();

            if (article && article.textContent && article.textContent.length > 200) {
                essay = normalizeText(article.textContent);
                title = normalizeText(article.title);
                readerAvailable = true;
            }
        } catch (e) {
            console.warn('[Reading] Readability failed, falling back to cheerio:', e.message);
        }

        // --- Fallback extraction using cheerio if Readability fails ---
        if (!essay) {
            const $ = cheerio.load(html);
            $('script, style, noscript, nav, footer, header, form').remove();

            const selectors = ['article', 'main', '[role=main]', 'body'];
            const candidates = [];

            selectors.forEach(selector => {
                $(selector).each((_, element) => {
                    const text = normalizeText($(element).text());
                    if (text.length > 200) {
                        candidates.push(text);
                    }
                });
            });

            essay = candidates.sort((a, b) => b.length - a.length)[0] || normalizeText($('body').text());
            title = normalizeText($('title').text());
            readerAvailable = readerAvailable || false;
        }

        if (!essay) essay = '';
        if (!title) title = parsedUrl.hostname;

        if (essay.length > 8000) {
            essay = essay.slice(0, 8000) + '...';
        }

        res.json({ title, essay, readerAvailable });
    } catch (error) {
        console.error('[Reading] Failed to fetch URL', targetUrl, error);
        res.status(500).json({ error: 'Could not fetch the URL' });
    }
});

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
        const validExtensions = ['.txt', '.md', '.json', '.pdf', '.doc', '.docx'];
        
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
        const filename = path.basename(fullPath, ext);
        const encodePathForApi = (p) => p.split('/').map(seg => encodeURIComponent(seg)).join('/');
        const rawFileUrl = `/api/reading/raw/${encodeURIComponent(mapName)}/${encodePathForApi(filePathRel)}`;

        if (['.pdf', '.doc', '.docx'].includes(ext)) {
            const mimeMap = {
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            };
            return res.json({
                title: filename.replace(/_/g, ' '),
                contentType: 'binary',
                fileUrl: rawFileUrl,
                mimeType: mimeMap[ext] || 'application/octet-stream'
            });
        }

        const rawContent = fs.readFileSync(fullPath, 'utf8');

        if (ext === '.json') {
            try {
                const json = JSON.parse(rawContent);
                return res.json({
                    title: json.name || json.title || filename,
                    essay: json.essay || json.content || '',
                    // Support both new 'customVocabString' and legacy/generic 'words'
                    words: json.customVocabString || json.words || json.vocab || '',
                    contentType: 'text'
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
                words: words,
                contentType: 'text'
            });
        }
    } catch (e) {
        console.error(`[Reading] Failed to read file ${fullPath}:`, e);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

router.get('/reading/raw/:mapName/*', (req, res) => {
    loadMappings();
    const { mapName } = req.params;
    const filePathRel = req.params[0];

    const rootDir = folderMappings[mapName];
    if (!rootDir) return res.status(404).json({ error: 'Mapping not found' });

    const fullPath = path.join(rootDir, filePathRel);
    if (!fullPath.startsWith(rootDir)) return res.status(403).json({ error: 'Access denied' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    return res.sendFile(fullPath);
});

module.exports = router;
