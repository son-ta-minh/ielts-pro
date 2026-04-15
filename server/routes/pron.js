
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cheerio = require('cheerio');
const https = require('https');
const { settings, FOLDER_MAPPINGS_FILE } = require('../config');
const logger = require('../logger');

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
        logger.debug("[IPA] cmudict.dict missing. Downloading...");
        try {
            execSync(`curl -L -o "${settings.DICT_PATH}" https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict`);
        } catch (e) {
            logger.error("[IPA] Failed to download dictionary:", e.message);
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
        logger.debug(`[IPA] Dictionary loaded: ${loadedCount} words.`);
    } catch (err) {
        logger.error("[IPA] Failed to parse dictionary:", err.message);
    }
}
ensureDictionary();

function cmuToIPA(cmu) {
  const tokens = cmu.split(" ");
  const syllableCount = tokens.filter(t => /[012]$/.test(t)).length;

  const syllables = [];
  let consonantBuffer = "";

  for (const token of tokens) {
    const m = token.match(/^([A-Z]+)([012])?$/);
    if (!m) continue;

    const [, ph, stress] = m;
    let symbol = MAP[ph] || "";

    // Schwa handling
    if (ph === "AH" && (stress === "0" || !stress)) {
      symbol = "ə";
    }

    // If this token has stress digit => vowel nucleus => start new syllable
    if (stress !== undefined) {
      const syllableText = consonantBuffer + symbol;
      consonantBuffer = "";
      syllables.push({
        stress: stress,
        text: syllableText
      });
    } else {
      // Consonant → store in buffer until next vowel
      consonantBuffer += symbol;
    }
  }

  // Attach trailing consonants to last syllable
  if (consonantBuffer && syllables.length > 0) {
    syllables[syllables.length - 1].text += consonantBuffer;
  }

  // Build final IPA string
  let ipa = "";

  syllables.forEach((syl) => {
    if (syllableCount > 1) {
      if (syl.stress === "1") ipa += "ˈ";
      if (syl.stress === "2") ipa += "ˌ";
    }
    ipa += syl.text;
  });

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

    // Split by sentence punctuation (.!?)
    const sentences = text.match(/[^.!?]+[.!?]?/g) || [];

    const converted = sentences.map(sentence => {
        const words = sentence.trim().split(/\s+/);

        const result = words.map((raw, i) => {
            const clean = raw.toLowerCase().replace(/[^a-z-]/g, "");
            if (!clean) return "";

            if (clean === "the") {
                const next = words[i + 1]?.[0]?.toLowerCase();
                if (next && "aeiou".includes(next)) return "ði";
                return "ðə";
            }

            const ipa = wordToIPA(clean);
            return ipa ?? raw;
        }).filter(Boolean).join(" ");

        return result ? `/${result}/` : "";
    }).filter(Boolean);

    return converted.join(" ");
}

const JAPANESE_CHAR_PATTERN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const KANJI_CHAR_PATTERN = /[\u4E00-\u9FFF]/;
const SMALL_TSU_PATTERN = /^[っッ]$/;
const LONG_VOWEL_MARK_PATTERN = /^[ー]$/;
const KANA_DIGRAPHS = {
    きゃ: "kya", きゅ: "kyu", きょ: "kyo",
    ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
    しゃ: "sha", しゅ: "shu", しょ: "sho",
    じゃ: "ja", じゅ: "ju", じょ: "jo",
    ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
    にゃ: "nya", にゅ: "nyu", にょ: "nyo",
    ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
    びゃ: "bya", びゅ: "byu", びょ: "byo",
    ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
    みゃ: "mya", みゅ: "myu", みょ: "myo",
    りゃ: "rya", りゅ: "ryu", りょ: "ryo",
    ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
    てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
    つぁ: "tsa", つぃ: "tsi", つぇ: "tse", つぉ: "tso",
    うぃ: "wi", うぇ: "we", うぉ: "wo",
    ヴァ: "va", ヴィ: "vi", ヴェ: "ve", ヴォ: "vo", ヴュ: "vyu",
    キャ: "kya", キュ: "kyu", キョ: "kyo",
    ギャ: "gya", ギュ: "gyu", ギョ: "gyo",
    シャ: "sha", シュ: "shu", ショ: "sho",
    ジャ: "ja", ジュ: "ju", ジョ: "jo",
    チャ: "cha", チュ: "chu", チョ: "cho",
    ニャ: "nya", ニュ: "nyu", ニョ: "nyo",
    ヒャ: "hya", ヒュ: "hyu", ヒョ: "hyo",
    ビャ: "bya", ビュ: "byu", ビョ: "byo",
    ピャ: "pya", ピュ: "pyu", ピョ: "pyo",
    ミャ: "mya", ミュ: "myu", ミョ: "myo",
    リャ: "rya", リュ: "ryu", リョ: "ryo",
    ファ: "fa", フィ: "fi", フェ: "fe", フォ: "fo",
    ティ: "ti", ディ: "di", トゥ: "tu", ドゥ: "du",
    ツァ: "tsa", ツィ: "tsi", ツェ: "tse", ツォ: "tso",
    ウィ: "wi", ウェ: "we", ウォ: "wo",
    シェ: "she", ジェ: "je", チェ: "che"
};
const KANA_MONOGRAPHS = {
    あ: "a", い: "i", う: "u", え: "e", お: "o",
    か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
    た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
    は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
    ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
    や: "ya", ゆ: "yu", よ: "yo",
    ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
    わ: "wa", を: "o", ん: "n",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
    ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
    ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
    ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
    ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa",
    ゔ: "vu",
    ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
    カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
    サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so",
    タ: "ta", チ: "chi", ツ: "tsu", テ: "te", ト: "to",
    ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no",
    ハ: "ha", ヒ: "hi", フ: "fu", ヘ: "he", ホ: "ho",
    マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo",
    ヤ: "ya", ユ: "yu", ヨ: "yo",
    ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro",
    ワ: "wa", ヲ: "o", ン: "n",
    ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go",
    ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
    ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do",
    バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
    パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po",
    ァ: "a", ィ: "i", ゥ: "u", ェ: "e", ォ: "o",
    ャ: "ya", ュ: "yu", ョ: "yo", ヮ: "wa",
    ヴ: "vu"
};

function normalizePronunciationLang(lang) {
    const value = String(lang || '').trim().toLowerCase();
    if (!value) return 'en';
    if (['ja', 'jp', 'jpn', 'japanese'].includes(value)) return 'ja';
    return 'en';
}

function getLeadingConsonant(romaji) {
    const match = String(romaji || '').match(/^(ch|sh|ts|[bcdfghjklmnpqrstvwxyz])/i);
    return match ? match[1].toLowerCase() : '';
}

function getTrailingVowel(romaji) {
    const match = String(romaji || '').match(/([aeiou])$/i);
    return match ? match[1].toLowerCase() : '';
}

function kanaToRomaji(text) {
    if (!text) return "";

    let result = "";
    let shouldDoubleNext = false;

    for (let i = 0; i < text.length; i++) {
        const pair = text.slice(i, i + 2);
        let romaji = KANA_DIGRAPHS[pair];

        if (romaji) {
            i += 1;
        } else {
            const char = text[i];

            if (SMALL_TSU_PATTERN.test(char)) {
                shouldDoubleNext = true;
                continue;
            }

            if (LONG_VOWEL_MARK_PATTERN.test(char)) {
                const prevVowel = getTrailingVowel(result);
                if (prevVowel) result += prevVowel;
                continue;
            }

            romaji = KANA_MONOGRAPHS[char];
            if (!romaji) {
                result += char;
                shouldDoubleNext = false;
                continue;
            }
        }

        if (shouldDoubleNext) {
            const consonant = getLeadingConsonant(romaji);
            if (consonant) result += consonant;
            shouldDoubleNext = false;
        }

        result += romaji;
    }

    return result;
}

function textToRomaji(text) {
    if (!text) return "";
    const normalizedText = String(text).trim();
    if (!JAPANESE_CHAR_PATTERN.test(normalizedText)) return normalizedText;
    return kanaToRomaji(normalizedText);
}

function extractJsonObjectFromText(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (_) {
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenceMatch?.[1]) {
            try {
                return JSON.parse(fenceMatch[1].trim());
            } catch (_) {}
        }

        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch?.[0]) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch (_) {}
        }
    }

    return null;
}

function getStudyBuddyAiCandidates() {
    return String(settings.STUDY_BUDDY_AI_URL || '')
        .split(';')
        .map((url) => url.trim())
        .filter(Boolean);
}

async function requestJapaneseReadingFromLocalAi(text) {
    const candidates = getStudyBuddyAiCandidates();
    if (candidates.length === 0) return null;

    const systemPrompt = [
        'You convert Japanese text into reading and romaji.',
        'Return JSON only.',
        'Use this schema exactly: {"reading":"<hiragana or katakana reading>","romaji":"<lowercase romaji>"}',
        'Rules:',
        '- Resolve kanji into the correct reading for the full phrase.',
        '- "reading" must be Japanese kana only.',
        '- "romaji" must be Hepburn-style lowercase Latin letters and spaces only.',
        '- No markdown, no explanation, no extra keys.'
    ].join(' ');

    const userPrompt = `Japanese text: ${text}`;

    for (const candidate of candidates) {
        let timeoutId = null;
        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(candidate, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    temperature: 0.1,
                    top_p: 0.85,
                    repetition_penalty: 1.02,
                    stream: false,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                logger.warn(`[PRON JA] AI status ${response.status} from ${candidate}`);
                continue;
            }

            const payload = await response.json().catch(() => null);
            const rawContent = payload?.choices?.[0]?.message?.content;
            const parsed = extractJsonObjectFromText(rawContent);
            const reading = String(parsed?.reading || '').trim();
            const romaji = String(parsed?.romaji || '').trim().toLowerCase();

            if (!reading || !romaji) {
                logger.warn(`[PRON JA] AI returned incomplete payload for "${text}"`);
                continue;
            }

            return { reading, romaji };
        } catch (error) {
            logger.warn(`[PRON JA] AI request failed for "${text}": ${error.message}`);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    return null;
}

// --- Cambridge Logic ---

async function getCambridgeIPA(word) {
    const cleanWord = word.toLowerCase().replace(/[^a-z-]/g, "");
    if (!cleanWord) return word;

    // Respect negative cache from getCambridgeSimplified:
    // if Cambridge was previously determined to have no usable data,
    // skip scraping entirely.
    const cached = readLookupCache(cleanWord);
    if (cached && cached.exists === false) {
        return null;
    }

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
            logger.warn(`[IPA MODE 2] Cambridge fetch failed for "${cleanWord}" status: ${response.status}`);
            if (response.status === 404) {
                writeLookupCache(cleanWord, {
                    exists: false,
                    word: cleanWord,
                    url,
                    cachedAt: Date.now()
                });
            }
            return null;
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        
        const pageHw = $(".hw.dhw").first().text().toLowerCase().trim();
        if (pageHw && pageHw !== cleanWord) {
            logger.warn(`[IPA MODE 2] Mismatch (Redirect): requested "${cleanWord}", found "${pageHw}".`);
            writeLookupCache(cleanWord, {
                exists: false,
                word: cleanWord,
                url,
                cachedAt: Date.now()
            });
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
        
        if (!usIpa) {
            writeLookupCache(cleanWord, {
                exists: false,
                word: cleanWord,
                url,
                cachedAt: Date.now()
            });
            return null;
        }

        return usIpa;
    } catch (e) {
        logger.error(`[IPA MODE 2] Error scraping "${cleanWord}":`, e.message);
        return null;
    }
}

async function textToCambridgeIPA(text) {
    if (!text) return "";

    const sentences = text.match(/[^.!?]+[.!?]?/g) || [];

    const converted = [];

    for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/);

        const promises = words.map(async (raw, i) => {
            const clean = raw.toLowerCase().replace(/[^a-z-]/g, "");
            if (!clean) return "";

            if (clean === "the") {
                const next = words[i + 1]?.[0]?.toLowerCase();
                if (next && "aeiou".includes(next)) return "ði";
                return "ðə";
            }

            const cambridge = await getCambridgeIPA(clean);
            if (cambridge) return cambridge;

            return wordToIPA(clean);
        });

        const results = (await Promise.all(promises))
            .filter(Boolean)
            .join(" ");

        if (results) {
            converted.push(`/${results}/`);
        }
    }

    return converted.join(" ");
}

function normalizeLookupWord(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9'-]/g, '')
        .trim();
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function compactText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteCambridgeUrl(src) {
    const value = compactText(src);
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    if (value.startsWith('//')) return `https:${value}`;
    if (value.startsWith('/')) return `https://dictionary.cambridge.org${value}`;
    return `https://dictionary.cambridge.org/${value}`;
}

function loadFolderMappings() {
    try {
        const mappingFile = FOLDER_MAPPINGS_FILE();
        if (!fs.existsSync(mappingFile)) return {};
        return JSON.parse(fs.readFileSync(mappingFile, 'utf8')) || {};
    } catch {
        return {};
    }
}

function getQualitySoundDir() {
    const mappings = loadFolderMappings();
    const dir = mappings['Quality_Sound'];
    if (!dir) return null;
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    return resolved;
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

function getLookupCachePath(word) {
    const qualityRoot = getQualitySoundDir();
    if (!qualityRoot) return null;
    const wordToken = toSafeFileToken(word).toLowerCase() || 'word';
    return path.join(qualityRoot, `${wordToken}.txt`);
}

function readLookupCache(word) {
    try {
        const txtPath = getLookupCachePath(word);
        if (!txtPath || !fs.existsSync(txtPath)) return null;
        const raw = fs.readFileSync(txtPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;

        // Negative cache: confirmed no exact Cambridge data for this word.
        if (parsed.exists === false) {
            return {
                exists: false,
                word: parsed.word || word,
                url: parsed.url || null,
                cachedAt: parsed.cachedAt || null
            };
        }

        // Positive cache (backward compatible with old format without explicit exists flag).
        if (parsed.word && Array.isArray(parsed.pronunciations)) {
            const hasMissingHeadword = parsed.pronunciations.some(
                p => p && typeof p === 'object' && !p.headword
            );

            if (hasMissingHeadword) {
                logger.debug(`[Cambridge Cache] Missing headword detected for "${parsed.word}" -> invalidating cache and forcing fresh Cambridge query.`);
                return null; // force re-fetch from Cambridge
            }

            return {
                exists: true,
                word: parsed.word,
                url: parsed.url || null,
                pronunciations: parsed.pronunciations,
                cachedAt: parsed.cachedAt || null
            };
        }
        logger.debug(`[Cambridge Cache] Cache miss or invalid structure for "${word}" -> will query Cambridge.`);
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
        logger.warn(`[Cambridge Cache] Failed writing cache for "${word}": ${e.message}`);
    }
}

async function cachePronunciationAudios(word, pronunciations) {
    const mappings = loadFolderMappings();
    const qualityRoot = mappings['Quality_Sound'];
    if (!qualityRoot || !Array.isArray(pronunciations) || pronunciations.length === 0) {
        return pronunciations;
    }

    const root = path.resolve(qualityRoot);
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

    const wordToken = toSafeFileToken(word).toLowerCase() || 'word';
    let defaultUsAssigned = false;

    for (const p of pronunciations) {
        const pos = toPosShort(p.partOfSpeech);

        if (p.audioUs) {
            const usName = `${wordToken}_${pos}_US.mp3`;
            const usPath = path.join(root, usName);
            const usCached = await ensureCachedAudio(p.audioUs, usPath);
            if (usCached) p.audioUs = `/api/audio/stream/Quality_Sound/${encodeURIComponent(usName)}`;

            if (!defaultUsAssigned) {
                const defaultName = `${wordToken}.mp3`;
                const defaultPath = path.join(root, defaultName);
                if (usCached && !fs.existsSync(defaultPath)) {
                    try {
                        fs.copyFileSync(usPath, defaultPath);
                    } catch {}
                }
                defaultUsAssigned = true;
            }
        }

        if (p.audioUk) {
            const ukName = `${wordToken}_${pos}_UK.mp3`;
            const ukPath = path.join(root, ukName);
            const ukCached = await ensureCachedAudio(p.audioUk, ukPath);
            if (ukCached) p.audioUk = `/api/audio/stream/Quality_Sound/${encodeURIComponent(ukName)}`;
        }
    }

    return pronunciations;
}

async function getCambridgeSimplified(word) {
    const requested = normalizeLookupWord(word);
    if (!requested) return null;

    const cached = readLookupCache(requested);
    if (cached) {
        if (cached.exists === false) {
            return {
                exists: false,
                url: cached.url || `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(requested)}`
            };
        }
        return {
            exists: true,
            url: cached.url || `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(requested)}`,
            word: cached.word,
            pronunciations: cached.pronunciations
        };
    }

    const slug = requested.replace(/\s+/g, '-');
    const url = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(slug)}`;

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
        // Cache only definitive not-found responses to avoid pinning transient failures.
        if (response.status === 404) {
            writeLookupCache(requested, {
                exists: false,
                word: requested,
                url,
                cachedAt: Date.now()
            });
        }
        return { exists: false, url };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const matchedEntries = [];
    $('.entry-body__el').each((_, el) => {
        const hw = normalizeLookupWord($(el).find('.hw.dhw').first().text());
        if (hw && hw === requested) matchedEntries.push(el);
    });

    if (matchedEntries.length === 0) {
        const firstHw = normalizeLookupWord($('.hw.dhw').first().text());
        if (firstHw === requested) {
            const first = $('.entry-body__el').first().get(0);
            if (first) matchedEntries.push(first);
        }
    }

    if (matchedEntries.length === 0) {
        writeLookupCache(requested, {
            exists: false,
            word: requested,
            url,
            cachedAt: Date.now()
        });
        return { exists: false, url };
    }

    const $entry = $(matchedEntries[0]);
    const headword = compactText($entry.find('.hw.dhw').first().text()) || word;

    const rawPronunciations = [];

    matchedEntries.forEach((entryEl) => {
        const $entryEl = $(entryEl);

        // 1) Main headword block (e.g., "inclination")
        const mainHead = compactText($entryEl.find('> .pos-header .hw.dhw').first().text())
            || compactText($entryEl.find('.hw.dhw').first().text())
            || headword;

        $entryEl.find('> .pos-header').each((_, header) => {
            const $header = $(header);
            const partOfSpeech = compactText($header.find('.pos').first().text()) || null;
            const ipaUs = compactText($header.find('.us .ipa').first().text()) || null;
            const ipaUk = compactText($header.find('.uk .ipa').first().text()) || null;
            const audioUs = toAbsoluteCambridgeUrl($header.find('.us source[type="audio/mpeg"]').first().attr('src'));
            const audioUk = toAbsoluteCambridgeUrl($header.find('.uk source[type="audio/mpeg"]').first().attr('src'));

            if (!partOfSpeech && !ipaUs && !ipaUk && !audioUs && !audioUk) return;
            rawPronunciations.push({
                headword: mainHead,
                partOfSpeech,
                ipaUs,
                ipaUk,
                audioUs: audioUs || null,
                audioUk: audioUk || null
            });
        });

        // 2) Runon blocks (word family, e.g., "inclined")
        $entryEl.find('.runon').each((_, runonEl) => {
            const $runon = $(runonEl);
            const runonHead = compactText($runon.find('.runon-title .w.dw').first().text());
            if (!runonHead) return;

            $runon.find('.pos-header').each((_, header) => {
                const $header = $(header);
                const partOfSpeech = compactText($header.find('.pos').first().text()) || null;
                const ipaUs = compactText($header.find('.us .ipa').first().text()) || null;
                const ipaUk = compactText($header.find('.uk .ipa').first().text()) || null;
                const audioUs = toAbsoluteCambridgeUrl($header.find('.us source[type="audio/mpeg"]').first().attr('src'));
                const audioUk = toAbsoluteCambridgeUrl($header.find('.uk source[type="audio/mpeg"]').first().attr('src'));

                if (!partOfSpeech && !ipaUs && !ipaUk && !audioUs && !audioUk) return;
                rawPronunciations.push({
                    headword: runonHead,
                    partOfSpeech,
                    ipaUs,
                    ipaUk,
                    audioUs: audioUs || null,
                    audioUk: audioUk || null
                });
            });
        });
    });

    if (rawPronunciations.length === 0) {
        rawPronunciations.push({
            headword,
            partOfSpeech: compactText($entry.find('.pos').first().text()) || null,
            ipaUs: compactText($entry.find('.us .ipa').first().text()) || null,
            ipaUk: compactText($entry.find('.uk .ipa').first().text()) || null,
            audioUs: toAbsoluteCambridgeUrl($entry.find('.us source[type="audio/mpeg"]').first().attr('src')),
            audioUk: toAbsoluteCambridgeUrl($entry.find('.uk source[type="audio/mpeg"]').first().attr('src'))
        });
    }

    // Merge duplicate rows into one row per headword + part-of-speech.
    const byKey = new Map();
    rawPronunciations.forEach((p) => {
        const key = `${(p.headword || '').toLowerCase()}__${(p.partOfSpeech || 'n/a').toLowerCase()}`;
        const current = byKey.get(key) || {
            headword: p.headword,
            partOfSpeech: p.partOfSpeech || 'N/A',
            ipaUs: null,
            ipaUk: null,
            audioUs: null,
            audioUk: null
        };

        if (!current.ipaUs && p.ipaUs) current.ipaUs = p.ipaUs;
        if (!current.ipaUk && p.ipaUk) current.ipaUk = p.ipaUk;
        if (!current.audioUs && p.audioUs) current.audioUs = p.audioUs;
        if (!current.audioUk && p.audioUk) current.audioUk = p.audioUk;

        byKey.set(key, current);
    });

    const pronunciations = Array.from(byKey.values());

    // If Cambridge page exists but contains no usable pronunciation data
    // (e.g., only "past simple of ..." without IPA/audio), treat as not found
    const hasUsablePron = pronunciations.some(p =>
        (p.ipaUs || p.ipaUk || p.audioUs || p.audioUk)
    );

    if (!hasUsablePron) {
        writeLookupCache(requested, {
            exists: false,
            word: requested,
            url,
            cachedAt: Date.now()
        });
        return { exists: false, url };
    }

    const cachedPronunciations = await cachePronunciationAudios(headword, pronunciations);

    const result = {
        exists: true,
        url,
        requestedWord: requested,
        headword: headword,
        word: headword, // keep backward compatibility
        pronunciations: cachedPronunciations
    };
    const payload = {
        exists: true,
        requestedWord: requested,
        headword: headword,
        word: headword, // backward compatibility
        url,
        pronunciations: cachedPronunciations,
        cachedAt: Date.now()
    };

    // Cache under requested word
    writeLookupCache(requested, payload);

    // If this is a word-family redirect (requested !== headword),
    // also cache under the actual headword so future lookups hit directly.
    const normalizedHead = normalizeLookupWord(headword);
    if (normalizedHead && normalizedHead !== requested) {
        writeLookupCache(normalizedHead, payload);
    }

    return result;
}

router.get('/convert/pron', async (req, res) => {
    const { text, mode, lang } = req.query;
    if (!text) return res.status(400).json({ error: 'Text required' });

    const rawText = String(text).trim();
    const normalizedLang = normalizePronunciationLang(lang);

    if (normalizedLang === 'ja') {
        const aiResult = KANJI_CHAR_PATTERN.test(rawText)
            ? await requestJapaneseReadingFromLocalAi(rawText)
            : null;
        const reading = aiResult?.reading || rawText;
        const romaji = aiResult?.romaji || textToRomaji(reading);
        const romajiWords = romaji ? romaji.split(/\s+/) : [];

        return res.json({
            text: rawText,
            lang: normalizedLang,
            pronunciationType: 'romaji',
            reading,
            romaji,
            ipa: romaji,
            ipaWords: romajiWords
        });
    }

    // Determine if input is a single word (no whitespace after trimming)
    const isSingleWord = rawText.split(/\s+/).length === 1;

    let result;

    // Cambridge mode (mode=2) only applies to SINGLE WORD
    if (String(mode) === '2' && isSingleWord) {
        result = await textToCambridgeIPA(rawText);
    } else {
        // Fallback to CMU-based paragraph IPA
        result = textToIPA(rawText);
    }

    // Build structured IPA array for word-level alignment (remove sentence slashes)
    const ipaClean = String(result || '').replace(/\//g, '').trim();
    const ipaWords = ipaClean ? ipaClean.split(/\s+/) : [];

    res.json({
        text: rawText,
        lang: normalizedLang,
        pronunciationType: 'ipa',
        ipa: result,          // original string format (backward compatible)
        ipaWords: ipaWords    // new structured array for hover/highlight mapping
    });
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

router.get('/lookup/cambridge/simple', async (req, res) => {
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word_required' });
    try {
        const result = await getCambridgeSimplified(String(word));
        if (!result) return res.status(200).json({ exists: false });
        res.json(result);
    } catch (e) {
        logger.error("[Cambridge Simple] Failed:", e.message);
        res.status(500).json({ error: 'cambridge_lookup_failed' });
    }
});

router.get('/lookup/cambridge/cache', (req, res) => {
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: 'word_required' });
    const requested = normalizeLookupWord(String(word));
    if (!requested) return res.json({ exists: false });
    const cached = readLookupCache(requested);
    if (!cached) return res.json({ exists: false });
    if (cached.exists === false) {
        return res.json({
            exists: false,
            word: cached.word || requested,
            url: cached.url || `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(requested)}`,
            cachedAt: cached.cachedAt || null
        });
    }
    res.json({
        exists: true,
        requestedWord: requested,
        headword: cached.word,
        url: cached.url || `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(requested)}`,
        pronunciations: cached.pronunciations
    });
});

// --- IPA Markdown Storage ---
const MODULES_DIR = path.join(settings.BACKUP_DIR, 'server', 'modules');
const OLD_IPA_FILE = path.join(settings.BACKUP_DIR, 'server', 'ipa_pronunciation.md');

// Ensure modules directory exists
if (!fs.existsSync(MODULES_DIR)) {
    fs.mkdirSync(MODULES_DIR, { recursive: true });
}

// Migration: Move old single file to modules if modules is empty
try {
    const files = fs.readdirSync(MODULES_DIR);
    if (files.length === 0 && fs.existsSync(OLD_IPA_FILE)) {
        const content = fs.readFileSync(OLD_IPA_FILE, 'utf8');
        fs.writeFileSync(path.join(MODULES_DIR, '01_General.md'), content);
        // Optional: fs.unlinkSync(OLD_IPA_FILE); // Keep backup for safety
        logger.debug("[IPA] Migrated old single file to modules/01_General.md");
    }
} catch (e) {
    logger.error("[IPA] Migration failed:", e.message);
}

router.get('/pron/modules', (req, res) => {
    try {
        if (!fs.existsSync(MODULES_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(MODULES_DIR)
            .filter(f => f.endsWith('.md'))
            .sort(); // Sort alphabetically
        
        const modules = files.map(filename => ({
            id: filename,
            title: filename.replace('.md', '').replace(/_/g, ' '),
            filename: filename
        }));
        res.json(modules);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/pron/modules/:filename', (req, res) => {
    const { filename } = req.params;
    // Basic security check to prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(MODULES_DIR, filename);
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

router.post('/pron/modules/:filename', (req, res) => {
    const { filename } = req.params;
    const { content } = req.body;

    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(MODULES_DIR, filename);
    try {
        fs.writeFileSync(filePath, content || '', 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
