
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');

// --- Courses Storage ---
const COURSES_DIR = path.join(settings.BACKUP_DIR, 'server', 'courses');
const SYSTEM_COURSES = ['grammar', 'pronunciation_roadmap'];

// Ensure courses directory exists
if (!fs.existsSync(COURSES_DIR)) {
    fs.mkdirSync(COURSES_DIR, { recursive: true });
}

// Helper to get course path
const getCoursePath = (courseId) => path.join(COURSES_DIR, courseId);

// Helper to get modules path for a course
const getModulesPath = (courseId) => path.join(getCoursePath(courseId), 'modules');

const getCourseMetadataPath = (courseId) => path.join(getCoursePath(courseId), 'metadata.json');

const readCourseMetadata = (courseId) => {
    const metaPath = getCourseMetadataPath(courseId);
    if (!fs.existsSync(metaPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8')) || {};
    } catch (e) {
        return {};
    }
};

const writeCourseMetadata = (courseId, metadata) => {
    const metaPath = getCourseMetadataPath(courseId);
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
};

const sortFilesByMetadataOrder = (files, moduleOrder) => {
    if (!Array.isArray(moduleOrder) || moduleOrder.length === 0) {
        return [...files].sort((a, b) => a.localeCompare(b));
    }

    const fileSet = new Set(files);
    const seen = new Set();
    const sorted = [];

    for (const filename of moduleOrder) {
        if (fileSet.has(filename) && !seen.has(filename)) {
            sorted.push(filename);
            seen.add(filename);
        }
    }

    const remaining = files
        .filter(filename => !seen.has(filename))
        .sort((a, b) => a.localeCompare(b));

    return [...sorted, ...remaining];
};

const getModuleTitleFromFilename = (filename) => path.parse(filename).name;
const sanitizeModuleBaseName = (input) => {
    const base = String(input || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');
    return base || 'Untitled';
};
const DEFAULT_SESSION_COLOR = '#22c55e';

const ensureCourseSessions = (courseId, files) => {
    const meta = readCourseMetadata(courseId);
    let changed = false;
    const existingFiles = [...files];
    const canonicalFiles = sortFilesByMetadataOrder(existingFiles, meta.moduleOrder);
    const uniqueModuleSet = new Set(existingFiles);

    if (!Array.isArray(meta.sessions)) {
        meta.sessions = [];
        changed = true;
    }
    if (!meta.moduleDescriptions || typeof meta.moduleDescriptions !== 'object' || Array.isArray(meta.moduleDescriptions)) {
        meta.moduleDescriptions = {};
        changed = true;
    }

    let sessions = meta.sessions.map((s, idx) => {
        const session = {
            id: typeof s?.id === 'string' && s.id.trim() ? s.id : `session-${Date.now()}-${idx}`,
            title: typeof s?.title === 'string' ? s.title : '',
            borderColor: typeof s?.borderColor === 'string' && s.borderColor.trim() ? s.borderColor : DEFAULT_SESSION_COLOR,
            moduleOrder: Array.isArray(s?.moduleOrder) ? [...s.moduleOrder] : []
        };
        if (session.id !== s?.id || session.borderColor !== s?.borderColor || !Array.isArray(s?.moduleOrder) || session.title !== s?.title) changed = true;
        return session;
    });

    if (!sessions.length) {
        sessions.push({
            id: 'default',
            title: '',
            borderColor: DEFAULT_SESSION_COLOR,
            moduleOrder: []
        });
        changed = true;
    }

    let defaultSessionId = typeof meta.defaultSessionId === 'string' ? meta.defaultSessionId : '';
    if (!defaultSessionId || !sessions.some(s => s.id === defaultSessionId)) {
        const fallback = sessions.find(s => s.id === 'default') || sessions[0];
        defaultSessionId = fallback.id;
        meta.defaultSessionId = defaultSessionId;
        changed = true;
    }

    const seen = new Set();
    sessions = sessions.map(session => {
        const filtered = [];
        for (const filename of session.moduleOrder) {
            if (uniqueModuleSet.has(filename) && !seen.has(filename)) {
                filtered.push(filename);
                seen.add(filename);
            } else if (!uniqueModuleSet.has(filename)) {
                changed = true;
            }
        }
        if (filtered.length !== session.moduleOrder.length) changed = true;
        return { ...session, moduleOrder: filtered };
    });

    const unassigned = canonicalFiles.filter(filename => !seen.has(filename));
    if (unassigned.length) {
        sessions = sessions.map(session => {
            if (session.id !== defaultSessionId) return session;
            changed = true;
            return { ...session, moduleOrder: [...session.moduleOrder, ...unassigned] };
        });
    }

    const previousSessionOrder = Array.isArray(meta.sessionOrder) ? meta.sessionOrder : sessions.map(s => s.id);
    const orderedSessionIds = sortFilesByMetadataOrder(sessions.map(s => s.id), previousSessionOrder);
    if (orderedSessionIds.join('|') !== sessions.map(s => s.id).join('|')) changed = true;
    sessions = orderedSessionIds.map(id => sessions.find(s => s.id === id)).filter(Boolean);

    const existingDescriptionKeys = Object.keys(meta.moduleDescriptions || {});
    for (const key of existingDescriptionKeys) {
        if (!uniqueModuleSet.has(key)) {
            delete meta.moduleDescriptions[key];
            changed = true;
        }
    }

    meta.sessions = sessions;
    meta.moduleOrder = canonicalFiles;
    meta.sessionOrder = orderedSessionIds;

    return { meta, changed, defaultSessionId, sessions };
};

const persistSessionsIfNeeded = (courseId, files) => {
    const normalized = ensureCourseSessions(courseId, files);
    if (normalized.changed) writeCourseMetadata(courseId, normalized.meta);
    return normalized;
};

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
        
        // Read order file
        let order = [];
        const orderPath = path.join(COURSES_DIR, 'order.json');
        if (fs.existsSync(orderPath)) {
            try {
                order = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
            } catch (e) {}
        }

        const courses = dirs.map(id => {
            // Try to read metadata if exists, else use folder name
            const metaPath = path.join(COURSES_DIR, id, 'metadata.json');
            let title = id.replace(/_/g, ' ');
            let icon = null;
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.title) title = meta.title;
                    if (meta.icon) icon = meta.icon;
                } catch (e) {}
            }
            return { 
                id, 
                title,
                icon,
                isSystem: SYSTEM_COURSES.includes(id)
            };
        });

        // Sort courses based on order array
        courses.sort((a, b) => {
            const indexA = order.indexOf(a.id);
            const indexB = order.indexOf(b.id);
            
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            
            // Fallback to alphabetical
            return a.title.localeCompare(b.title);
        });

        res.json(courses);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reorder courses
router.put('/courses/order', (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid order data' });

    try {
        const orderPath = path.join(COURSES_DIR, 'order.json');
        fs.writeFileSync(orderPath, JSON.stringify(orderedIds, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create new course
router.post('/courses', (req, res) => {
    const { title, icon } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const coursePath = getCoursePath(id);

    try {
        if (fs.existsSync(coursePath)) {
            return res.status(400).json({ error: 'Course already exists' });
        }
        fs.mkdirSync(coursePath, { recursive: true });
        fs.mkdirSync(path.join(coursePath, 'modules'), { recursive: true });
        fs.writeFileSync(path.join(coursePath, 'metadata.json'), JSON.stringify({
            title,
            icon,
            defaultSessionId: 'default',
            sessions: [{ id: 'default', title: '', borderColor: DEFAULT_SESSION_COLOR, moduleOrder: [] }],
            sessionOrder: ['default'],
            moduleOrder: []
        }, null, 2));
        
        res.json({ id, title, icon, isSystem: false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete course
router.delete('/courses/:courseId', (req, res) => {
    const { courseId } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    
    if (SYSTEM_COURSES.includes(courseId)) {
        return res.status(403).json({ error: 'Cannot delete system course' });
    }

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
    const { title, icon } = req.body;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });

    const coursePath = getCoursePath(courseId);
    const metaPath = getCourseMetadataPath(courseId);

    try {
        if (!fs.existsSync(coursePath)) return res.status(404).json({ error: 'Course not found' });
        
        const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
        if (title) meta.title = title;
        if (icon !== undefined) meta.icon = icon;
        
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        
        res.json({ id: courseId, title: meta.title, icon: meta.icon });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rename module
router.put('/courses/:courseId/modules/:filename/rename', (req, res) => {
    const { courseId, filename } = req.params;
    const { newTitle, description } = req.body || {};
    
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (filename.includes('..') || filename.includes('/')) return res.status(400).json({ error: 'Invalid filename' });
    if (!newTitle) return res.status(400).json({ error: 'New title required' });

    const modulesDir = getModulesPath(courseId);
    const oldPath = path.join(modulesDir, filename);

    try {
        if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Module not found' });
        const safeTitle = sanitizeModuleBaseName(newTitle);
        const newFilename = `${safeTitle}.md`;
        const newPath = path.join(modulesDir, newFilename);

        if (fs.existsSync(newPath) && newFilename !== filename) {
            return res.status(400).json({ error: 'Module with this name already exists' });
        }

        fs.renameSync(oldPath, newPath);
        if (newFilename !== filename) {
            const filesAfterRename = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
            const { meta, sessions } = persistSessionsIfNeeded(courseId, filesAfterRename);
            meta.moduleOrder = (meta.moduleOrder || []).map(name => (name === filename ? newFilename : name));
            meta.sessions = sessions.map(session => ({
                ...session,
                moduleOrder: session.moduleOrder.map(name => (name === filename ? newFilename : name))
            }));
            if (meta.moduleDescriptions && Object.prototype.hasOwnProperty.call(meta.moduleDescriptions, filename)) {
                meta.moduleDescriptions[newFilename] = meta.moduleDescriptions[filename];
                delete meta.moduleDescriptions[filename];
            }
            if (typeof description === 'string') {
                meta.moduleDescriptions[newFilename] = description.trim();
            }
            writeCourseMetadata(courseId, meta);
        } else if (typeof description === 'string') {
            const filesCurrent = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
            const { meta } = persistSessionsIfNeeded(courseId, filesCurrent);
            meta.moduleDescriptions[newFilename] = description.trim();
            writeCourseMetadata(courseId, meta);
        }
        res.json({ success: true, newFilename });
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
        
        const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
        const { sessions, meta } = persistSessionsIfNeeded(courseId, files);

        const modules = sessions.flatMap(session =>
            session.moduleOrder.map(filename => ({
                id: filename,
                title: getModuleTitleFromFilename(filename),
                filename,
                sessionId: session.id,
                description: (meta.moduleDescriptions || {})[filename] || ''
            }))
        );
        res.json(modules);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create new module
router.post('/courses/:courseId/modules', (req, res) => {
    const { courseId } = req.params;
    const { title, content, description } = req.body || {};
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (!title) return res.status(400).json({ error: 'Title required' });

    const modulesDir = getModulesPath(courseId);
    try {
        if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true });

        const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
        const existing = new Set(files);
        const safeTitle = sanitizeModuleBaseName(title);
        let filename = `${safeTitle}.md`;
        let counter = 2;
        while (existing.has(filename)) {
            filename = `${safeTitle} (${counter}).md`;
            counter += 1;
        }
        
        fs.writeFileSync(path.join(modulesDir, filename), content || `# ${title}\n\n`, 'utf8');
        const filesAfterCreate = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
        const { meta, sessions, defaultSessionId } = persistSessionsIfNeeded(courseId, filesAfterCreate);
        const requestedSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : defaultSessionId;
        const targetSessionId = sessions.some(s => s.id === requestedSessionId) ? requestedSessionId : defaultSessionId;
        meta.sessions = sessions.map(session => {
            const removed = session.moduleOrder.filter(name => name !== filename);
            if (session.id === targetSessionId) return { ...session, moduleOrder: [...removed, filename] };
            return { ...session, moduleOrder: removed };
        });
        meta.moduleOrder = sortFilesByMetadataOrder(filesAfterCreate, meta.moduleOrder);
        meta.moduleDescriptions = meta.moduleDescriptions || {};
        meta.moduleDescriptions[filename] = typeof description === 'string' ? description.trim() : '';
        writeCourseMetadata(courseId, meta);
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
        const filesAfterDelete = fs.existsSync(getModulesPath(courseId))
            ? fs.readdirSync(getModulesPath(courseId)).filter(f => f.endsWith('.md'))
            : [];
        const { meta } = persistSessionsIfNeeded(courseId, filesAfterDelete);
        meta.sessions = (meta.sessions || []).map(session => ({
            ...session,
            moduleOrder: Array.isArray(session.moduleOrder) ? session.moduleOrder.filter(name => name !== filename) : []
        }));
        meta.moduleOrder = (meta.moduleOrder || []).filter(name => name !== filename);
        if (meta.moduleDescriptions && Object.prototype.hasOwnProperty.call(meta.moduleDescriptions, filename)) {
            delete meta.moduleDescriptions[filename];
        }
        writeCourseMetadata(courseId, meta);
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
        if (!fs.existsSync(modulesDir)) {
            return res.status(404).json({ error: 'Modules folder not found' });
        }

        const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
        const { meta, sessions } = persistSessionsIfNeeded(courseId, files);
        const rank = new Map(orderedFilenames.map((name, idx) => [name, idx]));
        meta.sessions = sessions.map(session => {
            const reordered = [...session.moduleOrder].sort((a, b) => {
                const ra = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
                const rb = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
                if (ra !== rb) return ra - rb;
                return session.moduleOrder.indexOf(a) - session.moduleOrder.indexOf(b);
            });
            return { ...session, moduleOrder: reordered };
        });
        meta.moduleOrder = sortFilesByMetadataOrder(files, orderedFilenames);
        writeCourseMetadata(courseId, meta);

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

router.get('/courses/:courseId/sessions', (req, res) => {
    const { courseId } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    const modulesDir = getModulesPath(courseId);
    try {
        if (!fs.existsSync(modulesDir)) return res.json([]);
        const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.md'));
        const { sessions, defaultSessionId, meta } = persistSessionsIfNeeded(courseId, files);
        const payload = sessions.map(session => ({
            id: session.id,
            title: session.title || '',
            borderColor: session.borderColor || DEFAULT_SESSION_COLOR,
            isDefault: session.id === defaultSessionId,
            modules: session.moduleOrder.map(filename => ({
                id: filename,
                title: getModuleTitleFromFilename(filename),
                filename,
                description: (meta.moduleDescriptions || {})[filename] || ''
            }))
        }));
        res.json(payload);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/courses/:courseId/sessions', (req, res) => {
    const { courseId } = req.params;
    const { title, borderColor } = req.body || {};
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    const modulesDir = getModulesPath(courseId);
    try {
        const files = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.md')) : [];
        const { meta, sessions } = persistSessionsIfNeeded(courseId, files);
        const newSession = {
            id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: typeof title === 'string' ? title : '',
            borderColor: typeof borderColor === 'string' && borderColor.trim() ? borderColor : DEFAULT_SESSION_COLOR,
            moduleOrder: []
        };
        meta.sessions = [...sessions, newSession];
        meta.sessionOrder = meta.sessions.map(s => s.id);
        writeCourseMetadata(courseId, meta);
        res.json({ success: true, session: { ...newSession, isDefault: false, modules: [] } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/courses/:courseId/sessions/order', (req, res) => {
    const { courseId } = req.params;
    const { orderedSessionIds } = req.body || {};
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (!Array.isArray(orderedSessionIds)) return res.status(400).json({ error: 'Invalid order data' });
    const modulesDir = getModulesPath(courseId);
    try {
        const files = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.md')) : [];
        const { meta, sessions } = persistSessionsIfNeeded(courseId, files);
        const orderedIds = sortFilesByMetadataOrder(sessions.map(s => s.id), orderedSessionIds);
        meta.sessions = orderedIds.map(id => sessions.find(s => s.id === id)).filter(Boolean);
        meta.sessionOrder = orderedIds;
        writeCourseMetadata(courseId, meta);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/courses/:courseId/sessions/:sessionId', (req, res) => {
    const { courseId, sessionId } = req.params;
    const { title, borderColor } = req.body || {};
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (sessionId.includes('..') || sessionId.includes('/')) return res.status(400).json({ error: 'Invalid sessionId' });
    const modulesDir = getModulesPath(courseId);
    try {
        const files = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.md')) : [];
        const { meta, sessions } = persistSessionsIfNeeded(courseId, files);
        if (!sessions.some(s => s.id === sessionId)) return res.status(404).json({ error: 'Session not found' });
        meta.sessions = sessions.map(session => {
            if (session.id !== sessionId) return session;
            return {
                ...session,
                title: typeof title === 'string' ? title : session.title,
                borderColor: typeof borderColor === 'string' && borderColor.trim() ? borderColor : session.borderColor
            };
        });
        writeCourseMetadata(courseId, meta);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/courses/:courseId/sessions/:sessionId', (req, res) => {
    const { courseId, sessionId } = req.params;
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (sessionId.includes('..') || sessionId.includes('/')) return res.status(400).json({ error: 'Invalid sessionId' });
    const modulesDir = getModulesPath(courseId);
    try {
        const files = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.md')) : [];
        const { meta, sessions, defaultSessionId } = persistSessionsIfNeeded(courseId, files);
        const target = sessions.find(s => s.id === sessionId);
        if (!target) return res.status(404).json({ error: 'Session not found' });
        if (sessionId === defaultSessionId) return res.status(400).json({ error: 'Cannot delete default session' });
        if (target.moduleOrder.length > 0) return res.status(400).json({ error: 'Only empty sessions can be deleted' });
        meta.sessions = sessions.filter(s => s.id !== sessionId);
        meta.sessionOrder = meta.sessions.map(s => s.id);
        writeCourseMetadata(courseId, meta);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/courses/:courseId/sessions/:sessionId/modules/order', (req, res) => {
    const { courseId, sessionId } = req.params;
    const { orderedFilenames } = req.body || {};
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (sessionId.includes('..') || sessionId.includes('/')) return res.status(400).json({ error: 'Invalid sessionId' });
    if (!Array.isArray(orderedFilenames)) return res.status(400).json({ error: 'Invalid order data' });
    const modulesDir = getModulesPath(courseId);
    try {
        const files = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.md')) : [];
        const { meta, sessions } = persistSessionsIfNeeded(courseId, files);
        const target = sessions.find(s => s.id === sessionId);
        if (!target) return res.status(404).json({ error: 'Session not found' });
        const reordered = sortFilesByMetadataOrder(target.moduleOrder, orderedFilenames);
        meta.sessions = sessions.map(s => (s.id === sessionId ? { ...s, moduleOrder: reordered } : s));
        writeCourseMetadata(courseId, meta);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/courses/:courseId/modules/:filename/session', (req, res) => {
    const { courseId, filename } = req.params;
    const { targetSessionId } = req.body || {};
    if (courseId.includes('..') || courseId.includes('/')) return res.status(400).json({ error: 'Invalid courseId' });
    if (filename.includes('..') || filename.includes('/')) return res.status(400).json({ error: 'Invalid filename' });
    if (typeof targetSessionId !== 'string' || !targetSessionId.trim()) return res.status(400).json({ error: 'Invalid target session' });
    const modulesDir = getModulesPath(courseId);
    try {
        const files = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.md')) : [];
        if (!files.includes(filename)) return res.status(404).json({ error: 'Module not found' });
        const { meta, sessions } = persistSessionsIfNeeded(courseId, files);
        if (!sessions.some(s => s.id === targetSessionId)) return res.status(404).json({ error: 'Target session not found' });
        meta.sessions = sessions.map(session => {
            const removed = session.moduleOrder.filter(name => name !== filename);
            if (session.id === targetSessionId) return { ...session, moduleOrder: [...removed, filename] };
            return { ...session, moduleOrder: removed };
        });
        writeCourseMetadata(courseId, meta);
        res.json({ success: true });
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
        const icon = courseId === 'pronunciation_roadmap' ? 'Mic' : 'BookOpen';
        fs.writeFileSync(path.join(coursePath, 'metadata.json'), JSON.stringify({
            title,
            icon,
            defaultSessionId: 'default',
            sessions: [{ id: 'default', title: '', borderColor: DEFAULT_SESSION_COLOR, moduleOrder: [] }],
            sessionOrder: ['default'],
            moduleOrder: []
        }, null, 2));
        
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
