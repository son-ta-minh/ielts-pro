
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { settings } = require('./config');

// Transliterate Unicode to ASCII (e.g. "Đình" -> "Dinh")
function sanitizeToAscii(str) {
    if (!str) return 'unknown';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .replace(/[^a-zA-Z0-9\-_]/g, "_");
}

function getAppBackupPath(appName, createIfNotExist = false) {
    if (!appName) return null;
    const safeAppName = sanitizeToAscii(appName);
    const appDir = path.join(settings.BACKUP_DIR, safeAppName);
    if (createIfNotExist && !fs.existsSync(appDir)) {
        fs.mkdirSync(appDir, { recursive: true });
    }
    return appDir;
}

function getMetaPath(appDir) {
    if (!appDir) return null;
    return path.join(appDir, settings.META_FILENAME);
}

function loadMetadata(appDir) {
    try {
        const p = getMetaPath(appDir);
        if (p && fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    } catch (e) {
        console.error("[Meta] Failed to load metadata", e);
    }
    return {};
}

function saveMetadata(data, appDir) {
    try {
        const p = getMetaPath(appDir);
        if (p) {
            fs.writeFileSync(p, JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("[Meta] Failed to save metadata", e);
    }
}

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
}

module.exports = {
    sanitizeToAscii,
    getAppBackupPath,
    loadMetadata,
    saveMetadata,
    runCommand
};
