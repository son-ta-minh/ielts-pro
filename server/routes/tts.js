
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');
const { runCommand } = require('../utils');

let selectedVoice = ""; 
let selectedLanguage = "en";
let selectedAccent = "";
let voiceIndex = {};

function mapLanguage(accent) {
    if (!accent) return null;
    const lower = accent.toLowerCase();
    if (lower.startsWith("vi")) return "vi";
    if (lower.startsWith("en")) return "en";
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
