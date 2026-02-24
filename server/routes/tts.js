
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { settings, FOLDER_MAPPINGS_FILE } = require('../config');
const { runCommand } = require('../utils');

let selectedVoice = ""; 
let selectedLanguage = "en";
let selectedAccent = "";
let voiceIndex = {};
const QUALITY_SOUND_MAP_NAME = 'Quality_Sound';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.webm', '.aiff'];

function mapLanguage(accent) {
    if (!accent) return null;
    const lower = accent.toLowerCase();
    if (lower.startsWith("vi")) return "vi";
    if (lower.startsWith("en")) return "en";
    return null;
}

function loadFolderMappings() {
    try {
        const mappingFile = FOLDER_MAPPINGS_FILE();
        if (!fs.existsSync(mappingFile)) return {};
        return JSON.parse(fs.readFileSync(mappingFile, 'utf8')) || {};
    } catch (e) {
        console.error("[TTS] Failed to load folder mappings:", e.message);
        return {};
    }
}

function toWordCandidates(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const trimmed = rawText.trim();
    if (!trimmed || /\s/.test(trimmed)) return [];

    const base = trimmed
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    if (!base) return [];

    const candidates = new Set([
        base,
        base.toLowerCase(),
        base.replace(/'/g, ''),
        base.toLowerCase().replace(/'/g, '')
    ]);

    return Array.from(candidates).filter(Boolean);
}

function findQualitySoundFile(wordText) {
    const candidates = toWordCandidates(wordText);
    if (candidates.length === 0) return null;

    const mappings = loadFolderMappings();
    const qualityRoot = mappings[QUALITY_SOUND_MAP_NAME];
    if (!qualityRoot || !fs.existsSync(qualityRoot)) return null;

    const resolvedRoot = path.resolve(qualityRoot);
    for (const word of candidates) {
        for (const ext of AUDIO_EXTENSIONS) {
            const directPath = path.resolve(path.join(resolvedRoot, `${word}${ext}`));
            if (directPath.startsWith(resolvedRoot) && fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
                return directPath;
            }
        }
    }

    return null;
}

// Initialize TTS
async function loadVoicesFromOS() {
    try {
        const raw = await runCommand("say -v ?");
        const lines = raw.split("\n").filter(Boolean);
        voiceIndex = {};

        for (const line of lines) {
            const match = line.match(/^(.+?)\s{2,}([a-zA-Z_\-]+)\s+#/i);
            if (!match) continue;

            const name = match[1].trim();
            const accent = match[2];
            const language = mapLanguage(accent);

            if (!language) continue;

            voiceIndex[name] = { 
                language, 
                accent: accent.replace('-', '_') 
            };
        }
        console.log(`[TTS] Successfully loaded ${Object.keys(voiceIndex).length} voices from OS.`);
    } catch (e) {
        console.error("[TTS] Failed to load voices (Are you on macOS?):", e.message);
    }
}
loadVoicesFromOS();

router.get('/voices', (req, res) => {
    const voices = Object.entries(voiceIndex).map(([name, info]) => ({
        name,
        language: info.language,
        accent: info.accent
    })).sort((a, b) => {
        if (a.language === 'en' && b.language !== 'en') return -1;
        if (a.language !== 'en' && b.language === 'en') return 1;
        const aIsHigh = a.name.includes('Siri') || a.name.includes('Enhanced');
        const bIsHigh = b.name.includes('Siri') || b.name.includes('Enhanced');
        if (aIsHigh && !bIsHigh) return -1;
        if (!aIsHigh && bIsHigh) return 1;
        return a.name.localeCompare(b.name);
    });

    res.json({
        currentVoice: selectedVoice || "",
        count: voices.length,
        voices
    });
});

router.post('/select-voice', (req, res) => {
    const { voice } = req.body;

    if (!voice) {
        selectedVoice = "";
        selectedLanguage = "en";
        selectedAccent = "";
        return res.json({ success: true, voice: "", system: true });
    }

    const info = voiceIndex[voice];
    if (!info) return res.status(404).json({ error: "voice_not_found" });

    selectedVoice = voice;
    selectedLanguage = info.language;
    selectedAccent = info.accent;

    console.log(`[TTS] Selected voice context: ${voice} (${selectedAccent})`);
    res.json({
        success: true,
        voice: selectedVoice,
        language: selectedLanguage,
        accent: selectedAccent
    });
});

router.post('/speak', async (req, res) => {
    const { text, voice, language } = req.body;
    if (!text) return res.status(400).json({ error: "text_required" });

    let voiceToUse = selectedVoice;
    if (typeof voice === "string" && voice !== "") {
        if (voiceIndex[voice]) voiceToUse = voice;
        else return res.status(404).json({ error: "voice_not_found" });
    }

    // Ensure text is NFC normalized
    const cleanText = text.normalize('NFC');

    // Fast path: for single-word requests, serve pre-recorded quality audio if available.
    const qualityAudioFile = findQualitySoundFile(cleanText);
    if (qualityAudioFile) {
        return res.sendFile(qualityAudioFile);
    }
    
    const timestamp = Date.now();
    const outFile = path.join(settings.AUDIO_DIR, `tts_${timestamp}.aiff`);
    const txtFile = path.join(settings.AUDIO_DIR, `tts_${timestamp}.txt`);

    // Write to a temporary text file to handle special characters/hyphens safely
    try {
        fs.writeFileSync(txtFile, cleanText);
    } catch (e) {
        console.error("[TTS] Failed to write temp text file:", e.message);
        return res.status(500).json({ error: "tts_prep_failed" });
    }
    
    // Use -f to read from file
    const cmd = (voiceToUse)
        ? `say -v "${voiceToUse}" -f "${txtFile}" -o "${outFile}"`
        : `say -f "${txtFile}" -o "${outFile}"`;

    try {
        await runCommand(cmd);

        if (!fs.existsSync(outFile)) {
            throw new Error("Output file was not generated.");
        }

        res.setHeader("Content-Type", "audio/aiff");
        const stream = fs.createReadStream(outFile);
        
        stream.pipe(res);
        
        stream.on('close', () => {
            // Cleanup both files
            fs.unlink(outFile, (err) => { if (err) console.error("Failed to delete temp audio:", err); });
            fs.unlink(txtFile, (err) => { if (err) console.error("Failed to delete temp text:", err); });
        });
    } catch (err) {
        console.error("[TTS] Generation failed:", err.message);
        // Attempt cleanup on error
        try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch(e) {}
        try { if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile); } catch(e) {}
        
        res.status(500).json({ error: "tts_generation_failed" });
    }
});

module.exports = router;
