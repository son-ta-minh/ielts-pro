
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');

// --- Courses Storage ---
const COURSES_DIR = path.join(settings.BACKUP_DIR, 'server', 'courses');

// Ensure courses directory exists
if (!fs.existsSync(COURSES_DIR)) {
    fs.mkdirSync(COURSES_DIR, { recursive: true });
}

// Helper to get course path
const getCoursePath = (courseId) => path.join(COURSES_DIR, courseId);

// Helper to get modules path for a course
const getModulesPath = (courseId) => path.join(getCoursePath(courseId), 'modules');

// --- Routes ---

// 1. List all courses
router.get('/courses', (req, res) => {
    try {
        if (!fs.existsSync(COURSES_DIR)) {
            return res.json([]);
        }
        const dirs = fs.readdirSync(COURSES_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        const courses = dirs.map(id => {
            // Try to read metadata if exists, else use folder name
            const metaPath = path.join(COURSES_DIR, id, 'metadata.json');
            let title = id.replace(/_/g, ' ');
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.title) title = meta.title;
                } catch (e) {}
            }
            return { id, title };
        });

        res.json(courses);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create new course
router.post('/courses', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const coursePath = getCoursePath(id);

    try {
        if (fs.existsSync(coursePath)) {
            return res.status(400).json({ error: 'Course already exists' });
        }
        fs.mkdirSync(coursePath, { recursive: true });
        fs.mkdirSync(path.join(coursePath, 'modules'), { recursive: true });
        fs.writeFileSync(path.join(coursePath, 'metadata.json'), JSON.stringify({ title }, null, 2));
        
        res.json({ id, title });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete course
router.delete('/courses/:courseId', (req, res) => {
    const { courseId } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    
    const coursePath = getCoursePath(courseId);
    try {
        if (fs.existsSync(coursePath)) {
            fs.rmSync(coursePath, { recursive: true, force: true });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update course metadata
router.put('/courses/:courseId', (req, res) => {
    const { courseId } = req.params;
    const { title } = req.body;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });

    const coursePath = getCoursePath(courseId);
    const metaPath = path.join(coursePath, 'metadata.json');

    try {
        if (!fs.existsSync(coursePath)) return res.status(404).json({ error: 'Course not found' });
        
        const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
        meta.title = title;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        
        res.json({ id: courseId, title });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. List modules for a specific course
router.get('/courses/:courseId/modules', (req, res) => {
    const { courseId } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });

    const modulesDir = getModulesPath(courseId);
    
    try {
        if (!fs.existsSync(modulesDir)) {
            // Auto-create if course exists but modules folder doesn't (or just return empty)
            // For now, return empty
            return res.json([]);
        }
        
        const files = fs.readdirSync(modulesDir)
            .filter(f => f.endsWith('.md'))
            .sort(); // Sort alphabetically
        
        const modules = files.map(filename => ({
            id: filename,
            title: filename.replace(/^\d+_/, '').replace('.md', '').replace(/_/g, ' '),
            filename: filename
        }));
        res.json(modules);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create new module
router.post('/courses/:courseId/modules', (req, res) => {
    const { courseId } = req.params;
    const { title, content } = req.body;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (!title) return res.status(400).json({ error: 'Title required' });

    const modulesDir = getModulesPath(courseId);
    try {
        if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true });

        const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
        const nextIndex = files.length + 1;
        const prefix = String(nextIndex).padStart(2, '0');
        const safeTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_');
        const filename = `${prefix}_${safeTitle}.md`;
        
        fs.writeFileSync(path.join(modulesDir, filename), content || `# ${title}\n\n`, 'utf8');
        res.json({ success: true, filename });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete module
router.delete('/courses/:courseId/modules/:filename', (req, res) => {
    const { courseId, filename } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (filename.includes('..') || filename.includes('/')) return res.status(400).json({ error: 'Invalid filename' });

    const filePath = path.join(getModulesPath(courseId), filename);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reorder modules
router.put('/courses/:courseId/modules/order', (req, res) => {
    const { courseId } = req.params;
    const { orderedFilenames } = req.body; // Array of filenames in desired order
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (!Array.isArray(orderedFilenames)) return res.status(400).json({ error: 'Invalid order data' });

    const modulesDir = getModulesPath(courseId);
    try {
        // 1. Rename all to temporary names to avoid collisions (e.g. swapping 01 and 02)
        const tempMap = {};
        orderedFilenames.forEach((oldName, idx) => {
            const oldPath = path.join(modulesDir, oldName);
            if (fs.existsSync(oldPath)) {
                const tempName = `TEMP_${Date.now()}_${idx}_${oldName}`;
                const tempPath = path.join(modulesDir, tempName);
                fs.renameSync(oldPath, tempPath);
                tempMap[oldName] = tempName;
            }
        });

        // 2. Rename from temp to new ordered names
        orderedFilenames.forEach((oldName, idx) => {
            const tempName = tempMap[oldName];
            if (tempName) {
                const tempPath = path.join(modulesDir, tempName);
                
                // Extract original title part (remove old prefix if exists)
                // Assuming format: 01_Title.md or Title.md
                let titlePart = oldName.replace(/^\d+_/, ''); 
                const prefix = String(idx + 1).padStart(2, '0');
                const newName = `${prefix}_${titlePart}`;
                
                fs.renameSync(tempPath, path.join(modulesDir, newName));
            }
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get module content
router.get('/courses/:courseId/modules/:filename', (req, res) => {
    const { courseId, filename } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (filename.includes('..') || filename.includes('/')) return res.status(400).json({ error: 'Invalid filename' });

    const filePath = path.join(getModulesPath(courseId), filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ content });
        } else {
            res.status(404).json({ error: 'Module not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Save module content
router.post('/courses/:courseId/modules/:filename', (req, res) => {
    const { courseId, filename } = req.params;
    const { content } = req.body;

    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (filename.includes('..') || filename.includes('/')) return res.status(400).json({ error: 'Invalid filename' });

    const modulesDir = getModulesPath(courseId);
    const filePath = path.join(modulesDir, filename);

    try {
        if (!fs.existsSync(modulesDir)) {
            fs.mkdirSync(modulesDir, { recursive: true });
        }
        fs.writeFileSync(filePath, content || '', 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Migration / Initialization Logic ---
// Create default courses if they don't exist
const defaultCourses = ['pronunciation_roadmap', 'grammar'];

defaultCourses.forEach(courseId => {
    const coursePath = getCoursePath(courseId);
    if (!fs.existsSync(coursePath)) {
        fs.mkdirSync(coursePath, { recursive: true });
        // Create metadata
        const title = courseId === 'pronunciation_roadmap' ? 'Pronunciation Roadmap' : 'Grammar';
        fs.writeFileSync(path.join(coursePath, 'metadata.json'), JSON.stringify({ title }, null, 2));
        
        // Create modules folder
        fs.mkdirSync(path.join(coursePath, 'modules'), { recursive: true });
    }
});

// Special Migration: Move existing IPA modules to pronunciation_roadmap course
const OLD_IPA_MODULES_DIR = path.join(settings.BACKUP_DIR, 'server', 'modules');
const NEW_IPA_MODULES_DIR = getModulesPath('pronunciation_roadmap');

if (fs.existsSync(OLD_IPA_MODULES_DIR)) {
    try {
        const files = fs.readdirSync(OLD_IPA_MODULES_DIR);
        if (files.length > 0) {
            console.log("[Courses] Migrating IPA modules to Pronunciation Roadmap course...");
            if (!fs.existsSync(NEW_IPA_MODULES_DIR)) fs.mkdirSync(NEW_IPA_MODULES_DIR, { recursive: true });
            
            files.forEach(file => {
                const src = path.join(OLD_IPA_MODULES_DIR, file);
                const dest = path.join(NEW_IPA_MODULES_DIR, file);
                // Only move if dest doesn't exist to avoid overwriting if migration ran partially
                if (!fs.existsSync(dest)) {
                    fs.copyFileSync(src, dest);
                }
            });
            // Optional: Remove old dir? Keeping for safety for now.
        }
    } catch (e) {
        console.error("[Courses] Migration failed:", e.message);
    }
}

module.exports = router;
