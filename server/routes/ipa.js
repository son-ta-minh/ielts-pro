
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cheerio = require('cheerio');
const https = require('https');
const { settings } = require('../config');

// --- CMU Logic ---
const CMU = {};
const MAP = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ",
  AW: "aʊ", AY: "aɪ", EH: "ɛ", ER: "ɝ",
  EY: "eɪ", IH: "ɪ", IY: "iː",
  OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "uː",

  P: "p", B: "b", T: "t", D: "d", K: "k", G: "ɡ",
  F: "f", V: "v", TH: "θ", DH: "ð",
  S: "s", Z: "z", SH: "ʃ", ZH: "ʒ",
  M: "m", N: "n", NG: "ŋ",
  L: "l", R: "r", W: "w", Y: "j",
  CH: "tʃ", JH: "dʒ", HH: "h"
};

function ensureDictionary() {
    if (!fs.existsSync(settings.DICT_PATH)) {
        console.log("[IPA] cmudict.dict missing. Downloading...");
        try {
            execSync(`curl -L -o "${settings.DICT_PATH}" https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict`);
        } catch (e) {
            console.error("[IPA] Failed to download dictionary:", e.message);
            return;
        }
    }
    try {
        const lines = fs.readFileSync(settings.DICT_PATH, "utf8").split("\n");
        let loadedCount = 0;
        for (const line of lines) {
            if (!line || line.startsWith(";;;")) continue;
            const parts = line.split(/\s+/);
            if (parts.length < 2) continue;
            const word = parts[0].toLowerCase();
            const phones = parts.slice(1).join(" ");
            CMU[word] = phones;
            loadedCount++;
        }
        console.log(`[IPA] Dictionary loaded: ${loadedCount} words.`);
    } catch (err) {
        console.error("[IPA] Failed to parse dictionary:", err.message);
    }
}
ensureDictionary();

function cmuToIPA(cmu) {
  let ipa = "";
  let stressed = false;
  for (const token of cmu.split(" ")) {
    const m = token.match(/^([A-Z]+)([012])?$/);
    if (!m) continue;
    const [, ph, stress] = m;
    
    let symbol = MAP[ph] || "";
    if (ph === 'AH' && (stress === '0' || !stress)) {
        symbol = "ə";
    }

    if (stress === "1" && !stressed) {
        ipa += "ˈ";
        stressed = true;
    }
    if (stress === "2") ipa += "ˌ";
    ipa += symbol;
  }
  return ipa;
}

function splitCompound(word) {
  for (let i = 3; i < word.length - 2; i++) {
    const left = word.slice(0, i);
    const right = word.slice(i);
    if (CMU[left] && CMU[right]) {
      return [left, right];
    }
  }
  return null;
}

function wordToIPA(word) {
  const clean = word.toLowerCase().trim();
  if (!clean) return word;

  const cmu = CMU[clean];
  if (cmu) {
    return cmuToIPA(cmu);
  }

  if (clean.includes("-")) {
    return clean.split("-").map(w => wordToIPA(w)).join("-");
  }

  if (clean.startsWith("cyber") && CMU["crime"]) {
      const cyber = CMU["cyber"] ? cmuToIPA(CMU["cyber"]) : "ˈsaɪbər";
      return cyber + wordToIPA(clean.replace("cyber", ""));
  }

  const parts = splitCompound(clean.replace(/[^a-z']/g, ""));
  if (parts) {
    return parts.map(p => wordToIPA(p)).join(" ");
  }

  return word;
}

function textToIPA(text) {
    if (!text) return "";
    const words = text.split(/\s+/);
    const result = words.map((raw, i) => {
        const clean = raw.toLowerCase().replace(/[^a-z-]/g, "");
        if (clean === "the") {
            const next = words[i + 1]?.[0]?.toLowerCase();
            if (next && "aeiou".includes(next)) return "ði";
            return "ðə";
        }
        const ipa = wordToIPA(clean);
        return ipa ?? raw;
    }).join(" ");
    return `/${result}/`;
}

// --- Cambridge Logic ---

async function getCambridgeIPA(word) {
    const cleanWord = word.toLowerCase().replace(/[^a-z-]/g, "");
    if (!cleanWord) return word;

    const url = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(cleanWord)}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(url, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://dictionary.cambridge.org/"
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.warn(`[IPA MODE 2] Cambridge fetch failed for "${cleanWord}" status: ${response.status}`);
            return null;
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        
        const pageHw = $(".hw.dhw").first().text().toLowerCase().trim();
        if (pageHw && pageHw !== cleanWord) {
            console.warn(`[IPA MODE 2] Mismatch (Redirect): requested "${cleanWord}", found "${pageHw}".`);
            return null;
        }

        let usIpa = null;
        $(".pron-info").each((i, el) => {
            const label = $(el).find(".region").text().toLowerCase();
            const ipaText = $(el).find(".ipa").first().text();
            if (label.includes("us") && !usIpa) usIpa = ipaText;
        });

        if (!usIpa) {
            $(".us .ipa").each((i, el) => {
                const text = $(el).text();
                if (text && !usIpa) usIpa = text;
            });
        }

        if (!usIpa) {
            $(".ipa").each((i, el) => {
                const context = $(el).closest(".pos-header").text().toLowerCase();
                if (context.includes("us") && !usIpa) usIpa = $(el).text();
            });
        }
        
        return usIpa;
    } catch (e) {
        console.error(`[IPA MODE 2] Error scraping "${cleanWord}":`, e.message);
        return null;
    }
}

async function textToCambridgeIPA(text) {
    if (!text) return "";
    const words = text.split(/\s+/);
    const promises = words.map(async (raw, i) => {
        const clean = raw.toLowerCase().replace(/[^a-z-]/g, "");
        if (clean === "the") {
            const next = words[i + 1]?.[0]?.toLowerCase();
            if (next && "aeiou".includes(next)) return "ði";
            return "ðə";
        }
        const cambridge = await getCambridgeIPA(clean);
        if (cambridge) return cambridge;
        return wordToIPA(clean);
    });
    const results = await Promise.all(promises);
    return `/${results.join(" ")}/`;
}

router.get('/convert/ipa', async (req, res) => {
    const { text, mode } = req.query;
    if (!text) return res.status(400).json({ error: 'Text required' });
    
    let result;
    if (String(mode) === '2') {
        result = await textToCambridgeIPA(text);
    } else {
        result = textToIPA(text);
    }
    
    res.json({ text, ipa: result });
});

router.get('/lookup/cambridge', (req, res) => {
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word_required' });
    const slug = word.toLowerCase().replace(/\s+/g, '-');
    const url = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(slug)}`;
    
    const options = { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } };
    const checkReq = https.request(url, options, (checkRes) => {
        res.json({ exists: checkRes.statusCode === 200, url });
    });
    checkReq.on('error', () => res.json({ exists: false }));
    checkReq.end();
});

// --- IPA Markdown Storage ---
const IPA_FILE = path.join(settings.BACKUP_DIR, 'server', 'ipa_pronunciation.md');

router.get('/ipa/content', (req, res) => {
    try {
        if (fs.existsSync(IPA_FILE)) {
            const content = fs.readFileSync(IPA_FILE, 'utf8');
            res.json({ content });
        } else {
            res.json({ content: '' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/ipa/content', (req, res) => {
    const { content } = req.body;
    try {
        fs.writeFileSync(IPA_FILE, content || '', 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
