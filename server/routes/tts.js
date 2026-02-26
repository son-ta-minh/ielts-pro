
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
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

function normalizeLookupWord(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    return rawText
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9'-]/g, '');
}

function compactText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function toSafeFileToken(text) {
    return compactText(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function toAbsoluteCambridgeUrl(src) {
    const value = compactText(src);
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return `https://dictionary.cambridge.org${value}`;
    return `https://dictionary.cambridge.org/${value}`;
}

function toPosShort(partOfSpeech) {
    const lower = compactText(partOfSpeech).toLowerCase();
    if (/\bnoun\b/.test(lower)) return 'N';
    if (/\badverb\b/.test(lower)) return 'ADV';
    if (/\bverb\b/.test(lower)) return 'V';
    if (/\badjective\b/.test(lower)) return 'ADJ';
    if (/\bpronoun\b/.test(lower)) return 'PRO';
    if (/\bpreposition\b/.test(lower)) return 'PREP';
    if (/\bconjunction\b/.test(lower)) return 'CONJ';
    if (/\binterjection\b/.test(lower)) return 'INTJ';
    return 'X';
}

function getQualitySoundDir() {
    const mappings = loadFolderMappings();
    const dir = mappings[QUALITY_SOUND_MAP_NAME];
    if (!dir) return null;
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    return resolved;
}

function getLookupCachePath(word) {
    const qualityRoot = getQualitySoundDir();
    if (!qualityRoot) return null;
    const token = toSafeFileToken(word).toLowerCase() || 'word';
    return path.join(qualityRoot, `${token}.txt`);
}

function readLookupCache(word) {
    try {
        const txtPath = getLookupCachePath(word);
        if (!txtPath || !fs.existsSync(txtPath)) return null;
        const raw = fs.readFileSync(txtPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (parsed.exists === false) return { exists: false };
        if (parsed.exists === true && Array.isArray(parsed.pronunciations)) return parsed;
        return null;
    } catch {
        return null;
    }
}

function writeLookupCache(word, payload) {
    try {
        const txtPath = getLookupCachePath(word);
        if (!txtPath) return;
        fs.writeFileSync(txtPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
        console.warn(`[TTS] Failed writing lookup cache for "${word}": ${e.message}`);
    }
}

async function ensureCachedAudio(remoteUrl, targetPath) {
    if (!remoteUrl || !targetPath) return false;
    if (fs.existsSync(targetPath)) return true;
    try {
        const response = await fetch(remoteUrl, {
            headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://dictionary.cambridge.org/" },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) return false;
        const arrayBuffer = await response.arrayBuffer();
        const content = Buffer.from(arrayBuffer);
        if (!content.length) return false;
        const tmp = `${targetPath}.tmp`;
        fs.writeFileSync(tmp, content);
        fs.renameSync(tmp, targetPath);
        return fs.existsSync(targetPath);
    } catch {
        return false;
    }
}

async function ensureCambridgeLookupCacheDirect(wordText) {
    const requested = normalizeLookupWord(wordText);
    if (!requested) return false;

    const existed = readLookupCache(requested);
    if (existed) return !!existed.exists;

    const slug = requested.replace(/\s+/g, '-');
    const url = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(slug)}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://dictionary.cambridge.org/"
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 404) {
                writeLookupCache(requested, { exists: false, word: requested, url, cachedAt: Date.now() });
            }
            return false;
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const matchedEntries = [];
        $('.entry-body__el').each((_, el) => {
            const hw = normalizeLookupWord($(el).find('.hw.dhw').first().text());
            if (hw && hw === requested) matchedEntries.push(el);
        });
        if (matchedEntries.length === 0) {
            writeLookupCache(requested, { exists: false, word: requested, url, cachedAt: Date.now() });
            return false;
        }

        const pronunciations = [];
        matchedEntries.forEach((entryEl) => {
            $(entryEl).find('.pos-header').each((_, header) => {
                const $header = $(header);
                const partOfSpeech = compactText($header.find('.pos').first().text()) || null;
                const ipaUs = compactText($header.find('.us .ipa').first().text()) || null;
                const ipaUk = compactText($header.find('.uk .ipa').first().text()) || null;
                const audioUs = toAbsoluteCambridgeUrl($header.find('.us source[type="audio/mpeg"]').first().attr('src'));
                const audioUk = toAbsoluteCambridgeUrl($header.find('.uk source[type="audio/mpeg"]').first().attr('src'));
                if (!partOfSpeech && !ipaUs && !ipaUk && !audioUs && !audioUk) return;
                pronunciations.push({ partOfSpeech, ipaUs, ipaUk, audioUs: audioUs || null, audioUk: audioUk || null });
            });
        });

        if (pronunciations.length === 0) {
            writeLookupCache(requested, { exists: false, word: requested, url, cachedAt: Date.now() });
            return false;
        }

        const dedup = [];
        const seen = new Set();
        for (const p of pronunciations) {
            const key = `${p.partOfSpeech || ''}|${p.ipaUs || ''}|${p.ipaUk || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            dedup.push(p);
        }

        const qualityRoot = getQualitySoundDir();
        if (qualityRoot) {
            const wordToken = toSafeFileToken(requested).toLowerCase() || 'word';
            for (const p of dedup) {
                const pos = toPosShort(p.partOfSpeech);
                if (p.audioUs) {
                    const usName = `${wordToken}_${pos}_US.mp3`;
                    const usPath = path.join(qualityRoot, usName);
                    const ok = await ensureCachedAudio(p.audioUs, usPath);
                    if (ok) p.audioUs = `/api/audio/stream/Quality_Sound/${encodeURIComponent(usName)}`;
                }
                if (p.audioUk) {
                    const ukName = `${wordToken}_${pos}_UK.mp3`;
                    const ukPath = path.join(qualityRoot, ukName);
                    const ok = await ensureCachedAudio(p.audioUk, ukPath);
                    if (ok) p.audioUk = `/api/audio/stream/Quality_Sound/${encodeURIComponent(ukName)}`;
                }
            }
        }

        writeLookupCache(requested, {
            exists: true,
            word: requested,
            url,
            pronunciations: dedup,
            cachedAt: Date.now()
        });
        console.log(`[TTS] Ensure cache direct created txt for "${requested}"`);
        return true;
    } catch (e) {
        console.log(`[TTS] Ensure cache direct error "${requested}": ${e.message}`);
        return false;
    }
}

function isSingleWordText(rawText) {
    return toWordCandidates(rawText).length > 0;
}

async function ensureCambridgeLookupCache(req, wordText) {
    const normalized = normalizeLookupWord(wordText);
    if (!normalized) return false;

    const host = req.get('host');
    const localPort = req.socket && req.socket.localPort ? Number(req.socket.localPort) : null;
    const baseCandidates = [];
    if (host) {
        // Reverse-proxy headers may report https even when app serves plain http locally.
        baseCandidates.push(`http://${host}`);
        baseCandidates.push(`https://${host}`);
    }
    if (localPort) {
        baseCandidates.push(`http://127.0.0.1:${localPort}`);
        baseCandidates.push(`http://localhost:${localPort}`);
    }

    const uniqueBases = Array.from(new Set(baseCandidates)).filter(Boolean);
    if (uniqueBases.length === 0) {
        console.log(`[TTS] Ensure cache skipped "${normalized}": no candidate base URL`);
        return false;
    }

    for (const base of uniqueBases) {
        const lookupUrl = `${base}/api/lookup/cambridge/simple?word=${encodeURIComponent(normalized)}`;
        try {
            const res = await fetch(lookupUrl, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) {
                console.log(`[TTS] Ensure cache failed "${normalized}" url=${lookupUrl} status=${res.status}`);
                continue;
            }
            const data = await res.json().catch(() => null);
            if (data?.exists) {
                console.log(`[TTS] Ensure cache ready for "${normalized}" via ${base}`);
                return true;
            }
            console.log(`[TTS] Ensure cache no exact entry for "${normalized}" via ${base}`);
            return false;
        } catch (e) {
            console.log(`[TTS] Ensure cache error "${normalized}" url=${lookupUrl}: ${e.message}`);
        }
    }

    return await ensureCambridgeLookupCacheDirect(normalized);
}

function findQualitySoundFile(wordText) {
    const candidates = toWordCandidates(wordText);
    if (candidates.length === 0) return null;

    const mappings = loadFolderMappings();
    const qualityRoot = mappings[QUALITY_SOUND_MAP_NAME];
    console.log(`[TTS] Quality lookup "${wordText}" candidates=${JSON.stringify(candidates)} mapPath=${qualityRoot || '(missing)'}`);
    if (!qualityRoot || !fs.existsSync(qualityRoot)) return null;

    const resolvedRoot = path.resolve(qualityRoot);
    for (const word of candidates) {
        for (const ext of AUDIO_EXTENSIONS) {
            const directPath = path.resolve(path.join(resolvedRoot, `${word}${ext}`));
            if (directPath.startsWith(resolvedRoot) && fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
                console.log(`[TTS] Quality hit "${wordText}" -> ${directPath}`);
                return directPath;
            }
        }
    }

    return null;
}

async function getCambridgeUsAudioUrl(wordText) {
    const candidates = toWordCandidates(wordText);
    if (candidates.length === 0) return null;

    const requestedWord = normalizeLookupWord(wordText);
    const slug = requestedWord || candidates[0].toLowerCase().replace(/[^a-z0-9'-]/g, '');
    if (!slug) return null;

    const pageUrl = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(slug)}`;
    console.log(`[TTS] Cambridge lookup start word="${wordText}" slug="${slug}" url=${pageUrl}`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(pageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://dictionary.cambridge.org/"
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);

        let matchedEntry = null;
        $('.entry-body__el').each((_, el) => {
            if (matchedEntry) return;
            const entryHead = normalizeLookupWord($(el).find('.hw.dhw').first().text());
            if (entryHead && entryHead === requestedWord) {
                matchedEntry = el;
            }
        });

        const firstHeadword = normalizeLookupWord($(".hw.dhw").first().text());
        console.log(`[TTS] Cambridge page headword word="${wordText}" requested="${requestedWord}" first="${firstHeadword || '(empty)'}" matchedEntry=${matchedEntry ? 'yes' : 'no'}`);

        // Require exact headword match; otherwise reject Cambridge audio.
        if (!requestedWord || !matchedEntry) {
            console.log(`[TTS] Skip Cambridge audio due to missing exact entry match for "${requestedWord || wordText}"`);
            return null;
        }

        let src = null;
        $(matchedEntry).find('source[type="audio/mpeg"]').each((_, el) => {
            if (src) return;
            const candidate = ($(el).attr('src') || '').trim();
            if (candidate.includes('/media/english/us_pron/')) {
                src = candidate;
            }
        });

        if (!src) {
            console.log(`[TTS] No US audio source in matched entry for "${requestedWord}"`);
            return null;
        }
        console.log(`[TTS] Cambridge audio source selected word="${wordText}" src="${src}"`);
        if (src.startsWith('http://') || src.startsWith('https://')) return src;
        if (src.startsWith('//')) return `https:${src}`;
        if (src.startsWith('/')) return `https://dictionary.cambridge.org${src}`;
        return `https://dictionary.cambridge.org/${src}`;
    } catch (e) {
        console.warn(`[TTS] Cambridge audio lookup failed for "${wordText}": ${e.message}`);
        return null;
    }
}

async function downloadCambridgeAudioToQuality(wordText) {
    const mappings = loadFolderMappings();
    const qualityRoot = mappings[QUALITY_SOUND_MAP_NAME];
    console.log(`[TTS] Cambridge cache attempt word="${wordText}" mapPath=${qualityRoot || '(missing)'}`);
    if (!qualityRoot) return null;

    const resolvedRoot = path.resolve(qualityRoot);
    if (!fs.existsSync(resolvedRoot)) {
        fs.mkdirSync(resolvedRoot, { recursive: true });
    }

    const candidates = toWordCandidates(wordText);
    if (candidates.length === 0) return null;

    const targetName = candidates[0].toLowerCase().replace(/[^a-z0-9'-]/g, '').replace(/'/g, '');
    if (!targetName) return null;

    const targetPath = path.resolve(path.join(resolvedRoot, `${targetName}.mp3`));
    console.log(`[TTS] Cambridge cache target word="${wordText}" target=${targetPath}`);
    if (!targetPath.startsWith(resolvedRoot)) return null;
    if (fs.existsSync(targetPath)) return targetPath;

    const audioUrl = await getCambridgeUsAudioUrl(wordText);
    if (!audioUrl) return null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(audioUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://dictionary.cambridge.org/"
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) return null;

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);
        if (!audioBuffer.length) return null;

        const tmpPath = `${targetPath}.tmp`;
        fs.writeFileSync(tmpPath, audioBuffer);
        fs.renameSync(tmpPath, targetPath);

        if (fs.existsSync(targetPath)) {
            console.log(`[TTS] Cached Cambridge audio: ${targetPath}`);
            return targetPath;
        }
    } catch (e) {
        console.warn(`[TTS] Failed to cache Cambridge audio for "${wordText}": ${e.message}`);
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
    console.log(`[TTS] /speak request text="${cleanText}" voice="${voiceToUse || '(default)'}" lang="${language || '(auto)'}"`);

    const effectiveLanguage = language || selectedLanguage || 'en';

    // If Vietnamese, skip Quality_Sound and Cambridge completely
    if (effectiveLanguage === 'vi') {
        console.log(`[TTS] Vietnamese detected → skip quality & Cambridge for "${cleanText}"`);
    } else {
        if (isSingleWordText(cleanText)) {
            await ensureCambridgeLookupCache(req, cleanText);
        }

        // Fast path: for single-word requests, serve pre-recorded quality audio if available.
        const qualityAudioFile = findQualitySoundFile(cleanText);
        if (qualityAudioFile) {
            res.setHeader("X-TTS-Source", "quality");
            res.setHeader("X-TTS-Word", normalizeLookupWord(cleanText));
            console.log(`[TTS] /speak source=quality file=${qualityAudioFile}`);
            return res.sendFile(qualityAudioFile);
        }

        // Fallback: try fetching US pronunciation MP3 from Cambridge and cache into Quality_Sound.
        const cachedCambridgeFile = await downloadCambridgeAudioToQuality(cleanText);
        if (cachedCambridgeFile) {
            res.setHeader("X-TTS-Source", "cambridge");
            res.setHeader("X-TTS-Word", normalizeLookupWord(cleanText));
            console.log(`[TTS] /speak source=cambridge file=${cachedCambridgeFile}`);
            return res.sendFile(cachedCambridgeFile);
        }
    }

    console.log(`[TTS] /speak source=tts word="${cleanText}"`);
    
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

        res.setHeader("X-TTS-Source", "tts");
        res.setHeader("X-TTS-Word", normalizeLookupWord(cleanText));
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
