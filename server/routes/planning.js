
const express = require('express');
const router = express.Router();
const libraryManager = require('../libraryManager');

console.log("[Planning Route] Module loaded.");

// Get aggregated Master Planning Goals
router.get('/planning/master', (req, res) => {
    console.log("[Planning] GET /planning/master called");
    try {
        if (typeof libraryManager.getPlanningGoals !== 'function') {
            console.error("[Planning] Critical Error: getPlanningGoals is not a function. LibraryManager exports:", Object.keys(libraryManager));
            return res.status(500).json({ error: 'Server misconfiguration: Library function missing' });
        }

        const goals = libraryManager.getPlanningGoals();
        
        const mappedGoals = goals.map(g => ({
            id: g.id,
            name: g.title,
            description: g.description,
            todos: g.todos,
            displayName: g.title
        }));
        
        mappedGoals.sort((a, b) => a.displayName.localeCompare(b.displayName));
        
        res.json({ items: mappedGoals });
    } catch (e) {
         console.error("[Planning] Error serving master list:", e);
         res.status(500).json({ error: e.message });
    }
});

module.exports = router;
