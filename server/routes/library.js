
const express = require('express');
const router = express.Router();
const { lookupWords, getStats, loadGlobalLibrary } = require('../libraryManager');

// Batch lookup words
router.post('/library/lookup', (req, res) => {
    const { words } = req.body;
    if (!Array.isArray(words)) {
        return res.status(400).json({ error: "Expected 'words' array" });
    }
    
    // Limit batch size if needed, but 1000 is usually fine
    const results = lookupWords(words);
    res.json({ found: results });
});

// Get stats
router.get('/library/stats', (req, res) => {
    res.json(getStats());
});

// Trigger manual reload (useful after a big upload)
router.post('/library/reload', (req, res) => {
    loadGlobalLibrary();
    res.json({ success: true, stats: getStats() });
});

module.exports = router;
