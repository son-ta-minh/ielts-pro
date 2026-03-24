const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { settings } = require('../config');
const { FOLDER_MAPPINGS_FILE } = require('../config');
const { searchUserVocabularyIndex } = require('../vocabularySearchIndex');
const logger = require('../logger');

const router = express.Router();

const COMFY_UI_URL = process.env.COMFY_UI_URL || 'http://127.0.0.1:8188';
const IMAGE_FLOW_PATH = path.join(__dirname, '..', 'image_gen_flow.json');
const IMAGE_RATIO_MAP = {
    portrait: { width: 512, height: 768 },
    square: { width: 512, height: 512 },
    landscape: { width: 768, height: 512 }
};
const BASE_NEGATIVE_PROMPT = 'blurry, bad anatomy, extra fingers, low quality, worst quality, distorted face';
const IMAGE_PARAM_DEFAULTS = {
    aspect_ratio: 'square',
    steps: 20,
    cfg: 7,
    seed: null
};
const IMAGE_PRESETS = {
    fast: { steps: 15, cfg: 6 },
    balanced: { steps: 20, cfg: 7 },
    quality: { steps: 25, cfg: 7.5 },
    ultra: { steps: 30, cfg: 8 }
};
const IMAGE_STYLE_HINTS = {
    cinematic: 'cinematic lighting, high contrast, film look',
    portrait: '85mm lens, shallow depth of field, bokeh',
    anime: 'anime style, vibrant colors, sharp lines',
    realistic: 'ultra realistic, skin texture, natural lighting'
};


const DEFAULT_STUDY_BUDDY_AI_URL = process.env.STUDY_BUDDY_AI_URL || 'http://127.0.0.1:63392/v1/chat/completions';

function getCandidateUrls() {
    const raw = settings.STUDY_BUDDY_AI_URL || DEFAULT_STUDY_BUDDY_AI_URL;
    return String(raw)
        .split(';')
        .map(u => u.trim())
        .filter(Boolean);
}

const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'content-length',
    'content-encoding',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

function filterHeaders(headers = {}) {
    const nextHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        if (HOP_BY_HOP_HEADERS.has(String(key).toLowerCase())) continue;
        nextHeaders[key] = value;
    }
    return nextHeaders;
}

let activeBaseUrl = null;
let isProbing = false;
let pendingActiveUrlCallbacks = [];

function probeAndSelectActiveUrl(callback) {
    const urls = getCandidateUrls();
    let index = 0;
    let finished = false;

    const finishProbe = (error, url) => {
        if (finished) return;
        finished = true;
        callback(error, url);
    };

    function tryNextProbe() {
        if (finished) return;

        if (index >= urls.length) {
            activeBaseUrl = null;
            logger.error('[StudyBuddy] No AI upstream available');
            return finishProbe(new Error('No upstream available'));
        }

        const url = new URL(urls[index++]);
        const client = url.protocol === 'https:' ? https : http;
        let probeSettled = false;

        const settleProbe = (runner) => {
            if (probeSettled || finished) return;
            probeSettled = true;
            runner();
        };

        const probeUrl = new URL(url.href);
        probeUrl.pathname = '/v1/models'; // safer probe endpoint for OpenAI-compatible APIs

        const req = client.request(
            probeUrl,
            { method: 'GET', timeout: 5000 },
            (res) => {
                settleProbe(() => {
                    if (res.statusCode && res.statusCode < 500) {
                        logger.info('[StudyBuddy] Connected to AI:', url.href, 'status:', res.statusCode);
                        activeBaseUrl = url.href;
                        res.resume(); // drain
                        return finishProbe(null, activeBaseUrl);
                    }

                    logger.warn('[StudyBuddy] Probe bad status:', url.href, res.statusCode);
                    res.resume();
                    tryNextProbe();
                });
            }
        );

        req.on('error', (err) => {
            settleProbe(() => {
                logger.warn('[StudyBuddy] Probe failed:', url.href, err.message);
                tryNextProbe();
            });
        });

        req.on('timeout', () => {
            settleProbe(() => {
                logger.warn('[StudyBuddy] Probe timeout (skip):', url.href);
                req.destroy(new Error('Probe timeout'));
                tryNextProbe();
            });
        });

        req.end();
    }

    tryNextProbe();
}

function ensureActiveUrl(callback) {
    if (activeBaseUrl) return callback(null, activeBaseUrl);
    if (isProbing) {
        pendingActiveUrlCallbacks.push(callback);
        return;
    }
    isProbing = true;
    pendingActiveUrlCallbacks.push(callback);
    probeAndSelectActiveUrl((err, url) => {
        isProbing = false;
        const queued = pendingActiveUrlCallbacks.splice(0, pendingActiveUrlCallbacks.length);
        queued.forEach((cb) => {
            try {
                cb(err, url);
            } catch (callbackError) {
                logger.error('[StudyBuddy] Active URL callback failed:', callbackError);
            }
        });
    });
}

function requestStudyBuddyAiText(messages, callback) {
    let settled = false;
    const finish = (error, content) => {
        if (settled) return;
        settled = true;
        callback(error, content);
    };

    ensureActiveUrl((err, baseUrl) => {
        if (err || !baseUrl) {
            return finish(new Error('No StudyBuddy AI available'));
        }

        const upstreamUrl = new URL(baseUrl);
        const client = upstreamUrl.protocol === 'https:' ? https : http;
        const payload = JSON.stringify({
            temperature: 0.2,
            top_p: 0.85,
            repetition_penalty: 1.05,
            stream: false,
            messages
        });

        const upstreamReq = client.request(
            upstreamUrl,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'Accept': 'application/json'
                }
            },
            (upstreamRes) => {
                let raw = '';

                upstreamRes.on('data', (chunk) => {
                    raw += chunk.toString();
                });

                upstreamRes.on('end', () => {
                    if (!upstreamRes.statusCode || upstreamRes.statusCode >= 400) {
                        return finish(new Error(`StudyBuddy AI status ${upstreamRes.statusCode || 500}`));
                    }

                    try {
                        const data = JSON.parse(raw);
                        const content = data?.choices?.[0]?.message?.content;
                        if (typeof content === 'string' && content.trim()) {
                            return finish(null, content.trim());
                        }
                        return finish(new Error('StudyBuddy AI returned empty content'));
                    } catch (parseError) {
                        return finish(parseError);
                    }
                });
            }
        );

        upstreamReq.setTimeout(60000, () => {
            upstreamReq.destroy(new Error('StudyBuddy AI upstream timeout'));
        });

        upstreamReq.on('error', (error) => {
            activeBaseUrl = null;
            finish(error);
        });

        upstreamReq.write(payload);
        upstreamReq.end();
    });
}

function requestStudyBuddyAiTextAsync(messages) {
    return new Promise((resolve, reject) => {
        requestStudyBuddyAiText(messages, (error, content) => {
            if (error) return reject(error);
            resolve(content);
        });
    });
}

function ensureActiveUrlAsync() {
    return new Promise((resolve, reject) => {
        ensureActiveUrl((error, url) => {
            if (error || !url) {
                return reject(error || new Error('No StudyBuddy AI available'));
            }
            resolve(url);
        });
    });
}

async function checkComfyUiAvailable() {
    try {
        const response = await httpRequestAsync(COMFY_UI_URL, {
            method: 'GET',
            timeout: 3000
        });
        return response.statusCode < 500;
    } catch {
        return false;
    }
}

function loadFolderMappings() {
    try {
        const filePath = FOLDER_MAPPINGS_FILE();
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        logger.error('[StudyBuddyImage] Failed to load folder mappings:', error.message);
    }
    return {};
}

function httpRequestAsync(targetUrl, options = {}, bodyBuffer = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(targetUrl);
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(
            url,
            options,
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode || 500,
                        headers: res.headers,
                        body: Buffer.concat(chunks)
                    });
                });
            }
        );

        req.on('error', reject);
        req.setTimeout(options.timeout || 300000, () => {
            req.destroy(new Error('Request timeout'));
        });

        if (bodyBuffer) {
            req.write(bodyBuffer);
        }
        req.end();
    });
}

function extractFirstJsonObject(raw) {
    const source = String(raw || '').trim();
    if (!source) return null;
    const fenced = source.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = fenced.indexOf('{');
    const end = fenced.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return fenced.slice(start, end + 1);
}

function parseImageParamsResponse(raw) {
    const jsonText = extractFirstJsonObject(raw);
    if (!jsonText) return null;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

function createStudyBuddyError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getImageRefusalError(parsed, raw = '', imageSettings = normalizeIncomingImageSettings()) {
    if (!parsed || typeof parsed !== 'object' || !parsed.refuse) return null;

    const refuseCode = String(parsed.refuse || '').trim().toLowerCase();
    const rawDetail = [
        parsed.message,
        parsed.error,
        parsed.reason,
        parsed.detail
    ].find((value) => typeof value === 'string' && value.trim());
    const detail = rawDetail ? String(rawDetail).trim() : '';
    const rawText = String(raw || '').trim();

    if (refuseCode === 'unsafe') {
        const fallbackMessage = imageSettings.safeMode
            ? 'Yeu cau tao hinh bi tu choi vi co noi dung nhay cam hoac bao luc.'
            : 'AI prompt generator da tu choi yeu cau nay du Safe mode cua app dang tat. Day la tu choi tu AI upstream, khong phai app Safe mode.';
        return createStudyBuddyError(
            detail || fallbackMessage,
            422
        );
    }

    if (detail) {
        return createStudyBuddyError(detail, 422);
    }

    if (rawText && !extractFirstJsonObject(rawText)) {
        return createStudyBuddyError(rawText, 422);
    }

    return createStudyBuddyError(`Yeu cau tao hinh bi tu choi (${refuseCode}).`, 422);
}

function uniqueCommaPhrases(...parts) {
    const seen = new Set();
    const result = [];
    for (const part of parts) {
        const text = String(part || '').trim();
        if (!text) continue;
        const phrases = text.split(',').map((item) => item.trim()).filter(Boolean);
        for (const phrase of phrases) {
            const key = phrase.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(phrase);
        }
    }
    return result.join(', ');
}

function looksEnglishImagePrompt(text) {
    const source = String(text || '').trim();
    if (!source) return false;
    if (looksVietnamese(source)) return false;
    if (!/[a-z]/i.test(source)) return false;
    const words = source.match(/[A-Za-z]+/g) || [];
    return words.length >= 3;
}

function looksEnglishLookupTerm(text) {
    const source = String(text || '').trim();
    if (!source) return false;
    if (looksVietnamese(source)) return false;
    const words = source.match(/[A-Za-z][A-Za-z'_-]*/g) || [];
    return words.length >= 1 && words.length <= 8;
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

async function getWikiSummary(input) {
    let query = String(input || '').trim();

    logger.debug("[Wiki] Input:", query);

    if (!query) {
        logger.warn("[Wiki] Empty input");
        return null;
    }

    const headers = {
        Accept: 'application/json',
        'User-Agent': 'StudyBuddy/1.0'
    };

    // ===== helpers =====
    const safeParse = (body) => {
        try {
            return JSON.parse(body?.toString('utf8') || '{}');
        } catch {
            return {};
        }
    };

    const isBadTitle = (title) => {
        if (!title) return true;
        const t = title.toLowerCase();
        return (
            t.includes("list of") ||
            t.includes("lists of") ||
            t.includes("episode") ||
            t.includes("episodes") ||
            t.includes("season") ||
            t.includes("series")
        );
    };

    const rewriteQuery = (q) => {
        return String(q || "")
            .replace(/\b(list|character|anime|manga|series|episodes?)\b/gi, '')
            .trim();
    };

    // ===== retry loop =====
    for (let attempt = 1; attempt <= 3; attempt++) {
        logger.debug(`\n[Wiki] Attempt ${attempt}:`, query);

        // ===== 1. SEARCH =====
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;

        const searchRes = await httpRequestAsync(searchUrl, {
            method: 'GET',
            headers,
            timeout: 7000
        });

        const searchData = safeParse(searchRes.body);
        const results = searchData?.query?.search || [];

        logger.debug("[Wiki] Results:", results.length);

        if (!results.length) return null;

        const top = results[0];
        const title = top.title;

        logger.debug("[Wiki] Top result:", title);

        // ===== 2. BAD TITLE → rewrite =====
        if (isBadTitle(title)) {
            logger.warn("[Wiki] Bad title → rewriting query");

            query = rewriteQuery(query);

            if (!query.toLowerCase().includes("character")) {
                query += " character";
            }

            continue;
        }

        // ===== 3. FETCH FULL CONTENT =====
        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&titles=${encodeURIComponent(title)}&format=json`;

        logger.debug("[Wiki] Fetching FULL content:", contentUrl);

        const res = await httpRequestAsync(contentUrl, {
            method: 'GET',
            headers,
            timeout: 10000
        });

        const data = safeParse(res.body);
        const pages = data?.query?.pages || {};
        const page = Object.values(pages)[0];

        let content = String(page?.extract || '').trim();

        logger.debug("[Wiki] Content length:", content.length);

        // ===== 4. BAD CONTENT → retry =====
        if (!content) {
            logger.warn("[Wiki] Bad content → retry");

            query = rewriteQuery(title);
            continue;
        }

        // optional: limit size (VERY IMPORTANT for LLM)
        const MAX_CHARS = 8000;
        if (content.length > MAX_CHARS) {
            logger.warn("[Wiki] Trimming content to", MAX_CHARS);
            content = content.slice(0, MAX_CHARS);
        }

        logger.debug("[Wiki] Success:", title);

        return {
            title,
            content
        };
    }

    logger.warn("[Wiki] Failed after retries");
    return null;
}

// helper
function safeParse(body) {
    try {
        return JSON.parse(body?.toString('utf8') || '{}');
    } catch {
        return {};
    }
}

async function searchFandom(name) {
    logger.debug("\n[Fandom] ===== START =====");
    logger.debug("[Fandom] Input:", name);

    const cleanName = String(name || '').trim();
    if (!cleanName) {
        logger.warn("[Fandom] Empty input");
        return null;
    }

    // Cross-wiki search URL
    const url = `https://community.fandom.com/wiki/Special:Search?query=${encodeURIComponent(cleanName)}&scope=cross-wiki&limit=5&format=json`;
    logger.debug("[Fandom] Request URL:", url);

    try {
        const response = await httpRequestAsync(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'StudyBuddy/1.0'
            },
            timeout: 7000
        });

        if (response.statusCode >= 400) {
            logger.warn("[Fandom] Bad status code:", response.statusCode);
            return null;
        }

        const raw = response.body?.toString('utf8') || '';
        if (!raw) {
            logger.warn("[Fandom] Empty response body");
            return null;
        }

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            logger.error("[Fandom] JSON parse error:", err.message);
            return null;
        }

        const results = Array.isArray(parsed?.items) ? parsed.items : [];
        logger.debug("[Fandom] Results count:", results.length);

        if (!results.length) return null;

        const snippets = results.map(item => {
            const title = String(item.title || '').trim();
            const wikiDomain = item?.wiki?.domain || 'community.fandom.com';
            return title ? {
                title,
                snippet: stripHtml(item?.excerpt || '(no snippet)'),
                url: `https://${wikiDomain}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
            } : null;
        }).filter(Boolean).slice(0, 5);

        snippets.forEach((s, i) => logger.debug(`[Fandom] #${i + 1} URL:`, s.url));

        logger.debug("[Fandom] ===== END =====\n");
        return snippets.length ? snippets : null;

    } catch (err) {
        logger.error("[Fandom] Fatal error:", err.message);
        return null;
    }
}

async function getDanbooruTags(name) {
    const cleanName = String(name || '').trim().replace(/\s+/g, '_');
    if (!cleanName) return null;
    try {
        const response = await httpRequestAsync(
            `https://danbooru.donmai.us/tags.json?search[name_matches]=${encodeURIComponent(`${cleanName}*`)}&search[order]=count&limit=12`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'StudyBuddy/1.0'
                },
                timeout: 7000
            }
        );
        if (response.statusCode >= 400) return null;
        const parsed = JSON.parse(response.body.toString('utf8') || '[]');
        const tags = Array.isArray(parsed)
            ? parsed.map((item) => String(item?.name || '').trim()).filter(Boolean).slice(0, 12)
            : [];
        return tags.length ? tags : null;
    } catch {
        return null;
    }
}

function parseReferenceQueryResponse(raw, maxQueries) {
    const jsonText = extractFirstJsonObject(raw);
    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText);
            if (Array.isArray(parsed?.queries)) {
                return Array.from(new Set(
                    parsed.queries
                        .map((item) => String(item || '').trim())
                        .filter(looksEnglishLookupTerm)
                )).slice(0, maxQueries);
            }
        } catch {
            // Fall through to loose parsing.
        }
    }

    return Array.from(new Set(
        String(raw || '')
            .split(/[\n,]/)
            .map((item) => item.replace(/^[-*]\s*/, '').trim())
            .filter(looksEnglishLookupTerm)
    )).slice(0, maxQueries);
}

async function generateReferenceQueries(userRequest, mode = 'chat') {
    const isImageMode = mode === 'image';
    const maxQueries = isImageMode ? 4 : 3;
    const raw = await requestStudyBuddyAiTextAsync([
        {
            role: 'system',
            content: `You decide whether external reference lookup would help answer a user request.

Return ONLY valid JSON:
{"queries":["name 1","name 2"]}

Rules:
- English only
- each query should be a short search term, title, proper noun, concept name, object category, franchise, character, location, or visual reference phrase
- max ${maxQueries} queries
- if external lookup is not helpful, return {"queries":[]}
- do not explain`
        },
        {
            role: 'user',
            content: isImageMode
                ? `User image request: ${userRequest}\nReturn only the most useful English visual-reference search terms.`
                : `User request: ${userRequest}\nReturn only the most useful English factual-reference search terms, if any.`
        }
    ]);

    const queries = parseReferenceQueryResponse(raw, maxQueries);
    logger.debug(`[StudyBuddySearchAssist] ${mode} query planner raw:`, raw);
    logger.debug(`[StudyBuddySearchAssist] ${mode} queries:`, queries);
    return queries;
}

async function collectExternalReferenceContext(userRequest, mode = 'chat') {
    const queries = await generateReferenceQueries(userRequest, mode);
    if (!queries.length) {
        return { queries: [], contextText: '' };
    }

    const sections = [];
    let wikiFound = true;
    for (const name of queries) {
        if (!wikiFound) {
            const wiki = await getWikiSummary(name);
            if (wiki) {
                sections.push(`Wiki for ${name}: ${wiki.title} - ${wiki.content}`);
                wikiFound = true;
            }
        }

        // if (mode === 'image') {
            // const fandom = await searchFandom(name);
            // if (fandom?.length) {
            //     sections.push(`Fandom for ${name}: ${fandom.map((item) => `${item.title}: ${item.snippet}`).join(' | ')}`);
            // }

            // const tags = await getDanbooruTags(name);
            // if (tags?.length) {
            //     sections.push(`Danbooru tags for ${name}: ${tags.join(', ')}`);
            // }
        // }
    }

    return {
        queries,
        contextText: sections.join('\n\n').trim()
    };
}

function attachExternalReferenceContext(messages, contextText, mode = 'chat', queries = []) {
    const currentMessages = Array.isArray(messages) ? messages : [];
    if (!contextText.trim()) return currentMessages;

    const systemMessage = {
        role: 'system',
        content: mode === 'image'
            ? `External reference material gathered by the app for image generation. Use it as supporting visual/context clues, not as text to copy literally into the final answer.\n\nQueries: ${queries.join(', ') || 'none'}\n\n${contextText}`
            : `External reference material gathered by the app. Use it only when relevant, and do not quote or overstate it if uncertain.\n\nQueries: ${queries.join(', ') || 'none'}\n\n${contextText}`
    };

    return [systemMessage, ...currentMessages];
}

function detectUnsafeImageRequest(text) {
    const source = String(text || '').toLowerCase();
    if (!source.trim()) return false;
    const unsafePatterns = [
        /\b(sex|sexy|nude|naked|porn|explicit|nsfw|boobs?|breasts?|nipples?|genitals?|vagina|penis|cum|fetish)\b/i,
        /\b(blood|bloody|gore|gory|dismember|decapitat|corpse|dead body|mutilat|intestines?)\b/i,
        /\b(stab|stabbing|slash|slashing|behead|beheading|murder|kill|killing|knife fight|sword fight|massacre)\b/i,
        /\b(tinh duc|khoa than|mau me|dam chem|giet nguoi|chat xac|chem giet)\b/i
    ];
    return unsafePatterns.some((pattern) => pattern.test(source));
}

async function classifyImageSafetyWithAi(userRequest) {
    const messages = [
        {
            role: 'system',
            content: `You are a safety classifier for image-generation requests.

Return ONLY valid JSON in this exact format:
{"safe":true,"reason":""}
or
{"safe":false,"reason":"sexual|graphic_violence|gore|self_harm|other"}

Rules:
- Judge the user's intended image content, not whether it is educational or fictional
- Mark unsafe for explicit sexual content, nudity, pornographic intent, graphic gore, bloody violence, dismemberment, stabbing, murder scenes, or similarly graphic harmful imagery
- If the request is harmless or non-graphic, mark safe true
- Do not explain outside JSON`
        },
        {
            role: 'user',
            content: `Classify this image request:\n${userRequest}`
        }
    ];

    const raw = await requestStudyBuddyAiTextAsync(messages);
    const parsed = parseImageParamsResponse(raw);
    logger.debug('[StudyBuddyImage] AI safety raw:', raw);

    if (parsed && typeof parsed.safe === 'boolean') {
        return {
            safe: parsed.safe,
            reason: String(parsed.reason || '').trim()
        };
    }

    throw new Error('Image safety classifier returned invalid JSON.');
}

function buildInfographicThemePrompt(input) {
    const theme = String(input || '').trim();
    return `Create a clean educational vocabulary infographic illustrating words related to this theme: ${theme}

The vocabulary may include objects, natural features, environments, weather phenomena, human actions, facial expressions, or abstract concepts.

Requirements:

- Do NOT include any title or header text.
- Do NOT include any Vietnamese or non-English text.
- All labels must be in English only.
- Use lowercase headword/base form for labels.
- Include 10–14 labeled vocabulary items.
- Every vocabulary item must have its label visibly written inside the image.
- Each concept must have a thin pointer line connecting the illustration to its label.
- One label per concept. No unlabeled objects. No extra labels beyond the chosen vocabulary.
- If the concept is not a physical object (for example weather, emotion, or action), illustrate a clear visual scene that represents it.

Examples of acceptable vocabulary types:
- geographical features (estuary, mangrove forest, glacier)
- weather events (blizzard, thunderstorm, drought)
- human actions (frown, whisper, shrug)
- environments (wetland, coral reef)
- processes or phenomena (erosion, evaporation)

Design style:
- clean educational infographic
- minimalist composition
- light neutral background
- soft lighting
- clear spacing
- consistent sans-serif labels
- thin pointer lines
- realistic illustrations or scenes

If any label sounds unnatural or like a direct translation, replace it with a natural English headword.`;
}

async function generateInfographicWordList(theme, searchContext = '') {
    const raw = await requestStudyBuddyAiTextAsync([
        {
            role: 'system',
            content: `You create English vocabulary lists for educational infographics.

Return ONLY plain text in exactly this format:
Word list (comma separated):
word1, word2, word3

Rules:
- English only
- lowercase labels
- 10 to 14 items
- use natural headwords/base forms
- no explanation`
        },
        {
            role: 'user',
            content: `Theme: ${theme}${searchContext ? `\n\nReference context:\n${searchContext}` : ''}`
        }
    ]);

    const cleaned = String(raw || '').trim().replace(/^```(?:text)?/i, '').replace(/```$/i, '').trim();
    const match = cleaned.match(/Word list \(comma separated\):\s*([\s\S]+)/i);
    const words = (match ? match[1] : cleaned)
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 14);

    if (words.length < 5) {
        throw new Error('Could not generate a valid infographic word list.');
    }

    return `Word list (comma separated):\n${words.join(', ')}`;
}

function parseInfographicWordList(wordListText) {
    const cleaned = String(wordListText || '').trim();
    const match = cleaned.match(/Word list \(comma separated\):\s*([\s\S]+)/i);
    return (match ? match[1] : cleaned)
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 14);
}

async function generateInfographicThemeLabel(theme, wordListText, searchContext = '') {
    const raw = await requestStudyBuddyAiTextAsync([
        {
            role: 'system',
            content: `You create a short English-only theme label for an educational vocabulary infographic.

Return ONLY plain text.

Rules:
- English only
- 2 to 5 words
- short natural category phrase
- no punctuation except spaces or hyphen if needed
- no explanation`
        },
        {
            role: 'user',
            content: `Original user theme: ${theme}\n${wordListText}${searchContext ? `\n\nReference context:\n${searchContext}` : ''}\n\nReturn one short English category label that best fits the listed vocabulary.`
        }
    ]);

    const cleaned = String(raw || '')
        .trim()
        .replace(/^```(?:text)?/i, '')
        .replace(/```$/i, '')
        .trim()
        .split('\n')[0]
        .trim()
        .replace(/[.:;!?]+$/g, '');

    if (!looksEnglishImagePrompt(cleaned)) {
        return 'vocabulary theme';
    }

    const words = cleaned.match(/[A-Za-z-]+/g) || [];
    if (words.length < 2 || words.length > 5) {
        return 'vocabulary theme';
    }

    return words.join(' ');
}

function buildInfographicChatResponse(imageUrl, wordListText) {
    return [
        `[IMG ${imageUrl}]`,
        '',
        wordListText
    ].join('\n');
}

function normalizeIncomingImageSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const safeMode = source.safeMode !== false;
    const aspectRatioMode = source.aspectRatioMode === 'manual' ? 'manual' : 'auto';
    const aspectRatio = IMAGE_RATIO_MAP[String(source.aspectRatio || '').trim().toLowerCase()]
        ? String(source.aspectRatio).trim().toLowerCase()
        : IMAGE_PARAM_DEFAULTS.aspect_ratio;
    const presetMode = source.presetMode === 'manual' ? 'manual' : 'auto';
    const preset = IMAGE_PRESETS[String(source.preset || '').trim().toLowerCase()]
        ? String(source.preset).trim().toLowerCase()
        : 'balanced';
    const stepsMode = source.stepsMode === 'manual' ? 'manual' : 'auto';
    const steps = Number.isFinite(Number(source.steps)) ? Math.max(15, Math.min(30, Math.round(Number(source.steps)))) : IMAGE_PARAM_DEFAULTS.steps;
    const cfgMode = source.cfgMode === 'manual' ? 'manual' : 'auto';
    const cfg = Number.isFinite(Number(source.cfg)) ? Math.max(5, Math.min(9, Math.round(Number(source.cfg) * 2) / 2)) : IMAGE_PARAM_DEFAULTS.cfg;
    const seedMode = source.seedMode === 'manual' ? 'manual' : 'auto';
    const seed = source.seed === null || source.seed === undefined || source.seed === ''
        ? null
        : (Number.isFinite(Number(source.seed)) ? Math.max(1, Math.floor(Number(source.seed))) : null);
    const negativeMode = source.negativeMode === 'manual' ? 'manual' : 'auto';
    const negative = String(source.negative || '').trim();

    return {
        safeMode,
        aspectRatioMode,
        aspectRatio,
        presetMode,
        preset,
        stepsMode,
        steps,
        cfgMode,
        cfg,
        seedMode,
        seed,
        negativeMode,
        negative
    };
}

function applyImageModeOverrides(imageSettings, mode) {
    const next = { ...imageSettings };
    if (mode === 'infographic') {
        next.aspectRatio = 'landscape';
        next.preset = 'ultra';
        next.steps = 30;
        next.cfg = 8;
    }
    return next;
}

async function buildInfographicImageParams(theme, wordListText, rawImageSettings, searchContext = '') {
    const imageSettings = applyImageModeOverrides(normalizeIncomingImageSettings(rawImageSettings), 'infographic');
    const words = parseInfographicWordList(wordListText);
    if (words.length < 5) {
        throw new Error('Could not generate enough infographic labels.');
    }

    const rawThemeLabel = String(theme || '').trim();
    const themeLabel = looksEnglishImagePrompt(rawThemeLabel)
        ? rawThemeLabel
        : await generateInfographicThemeLabel(rawThemeLabel, wordListText, searchContext);
    const prompt = uniqueCommaPhrases(
        `clean educational vocabulary infographic about ${themeLabel}`,
        `use exactly these lowercase English labels written visibly inside the image: ${words.join(', ')}`,
        searchContext ? `reference context: ${searchContext}` : '',
        `${words.length} labeled vocabulary items`,
        'every listed word must appear as a visible label in the image',
        'one pointer line per label connecting to the correct illustration',
        'one label per concept',
        'no unlabeled objects',
        'no extra labels beyond the listed words',
        'clear realistic illustration or scene for every label',
        'minimalist poster composition',
        'light neutral background',
        'soft studio lighting',
        'clear spacing',
        'consistent sans-serif labels',
        'crisp readable text',
        'educational poster layout',
        'print-quality educational poster',
        'ultra sharp',
        'maximum clarity',
        'high detail',
        'cinematic'
    );

    const negative = uniqueCommaPhrases(
        BASE_NEGATIVE_PROMPT,
        'blurry text, unreadable labels, duplicate labels, cropped labels, missing labels, unlabeled objects, extra labels, cluttered layout, overlapping objects, missing pointer lines'
    );

    const params = {
        prompt,
        negative,
        aspect_ratio: 'landscape',
        steps: 30,
        cfg: 8,
        seed: imageSettings.seedMode === 'manual' ? imageSettings.seed : null
    };

    if (imageSettings.negativeMode === 'manual') {
        params.negative = uniqueCommaPhrases(params.negative, imageSettings.negative);
    }

    return { params, wordListText, words, themeLabel };
}

function applyManualImageSettings(params, imageSettings) {
    const next = { ...params };

    if (imageSettings.presetMode === 'manual' && IMAGE_PRESETS[imageSettings.preset]) {
        next.steps = IMAGE_PRESETS[imageSettings.preset].steps;
        next.cfg = IMAGE_PRESETS[imageSettings.preset].cfg;
    }
    if (imageSettings.aspectRatioMode === 'manual') {
        next.aspect_ratio = imageSettings.aspectRatio;
    }
    if (imageSettings.stepsMode === 'manual') {
        next.steps = imageSettings.steps;
    }
    if (imageSettings.cfgMode === 'manual') {
        next.cfg = imageSettings.cfg;
    }
    if (imageSettings.seedMode === 'manual') {
        next.seed = imageSettings.seed;
    }
    if (imageSettings.negativeMode === 'manual') {
        next.negative = uniqueCommaPhrases(BASE_NEGATIVE_PROMPT, imageSettings.negative);
    }

    return next;
}

function normalizeImageParams(params, userRequest, imageSettings = normalizeIncomingImageSettings()) {
    const rawPrompt = String(params?.prompt || '').trim();
    const rawNegative = String(params?.negative || '').trim();
    const rawAspect = String(params?.aspect_ratio || '').trim().toLowerCase();
    const aspect_ratio = IMAGE_RATIO_MAP[rawAspect] ? rawAspect : IMAGE_PARAM_DEFAULTS.aspect_ratio;
    const steps = Number.isFinite(Number(params?.steps)) ? Math.max(15, Math.min(30, Math.round(Number(params.steps)))) : IMAGE_PARAM_DEFAULTS.steps;
    const cfg = Number.isFinite(Number(params?.cfg)) ? Math.max(5, Math.min(9, Number(params.cfg))) : IMAGE_PARAM_DEFAULTS.cfg;
    const seed = params?.seed === null || params?.seed === undefined || params?.seed === ''
        ? null
        : (Number.isFinite(Number(params.seed)) ? Math.max(1, Math.floor(Number(params.seed))) : null);

    const fallbackPrompt = `${userRequest}, soft natural lighting, 85mm lens, shallow depth of field, ultra realistic, cinematic`;
    const prompt = uniqueCommaPhrases(
        rawPrompt || fallbackPrompt,
        'high detail',
        'cinematic'
    );

    const negative = uniqueCommaPhrases(
        BASE_NEGATIVE_PROMPT,
        rawNegative
    );

    return applyManualImageSettings({
        prompt,
        negative,
        aspect_ratio,
        steps,
        cfg,
        seed
    }, imageSettings);
}

function getMissingImageParamFields(params, imageSettings = normalizeIncomingImageSettings()) {
    const missing = [];
    if (!params || typeof params !== 'object') return ['prompt', 'negative', 'aspect_ratio', 'steps', 'cfg', 'seed'];
    if (!String(params.prompt || '').trim() || !looksEnglishImagePrompt(params.prompt)) missing.push('prompt');
    if (imageSettings.negativeMode !== 'manual' && !String(params.negative || '').trim()) missing.push('negative');
    if (imageSettings.aspectRatioMode !== 'manual' && !IMAGE_RATIO_MAP[String(params.aspect_ratio || '').trim().toLowerCase()]) missing.push('aspect_ratio');
    if (imageSettings.stepsMode !== 'manual' && imageSettings.presetMode !== 'manual' && !Number.isFinite(Number(params.steps))) missing.push('steps');
    if (imageSettings.cfgMode !== 'manual' && imageSettings.presetMode !== 'manual' && !Number.isFinite(Number(params.cfg))) missing.push('cfg');
    if (imageSettings.seedMode !== 'manual' && !(params.seed === null || params.seed === undefined || Number.isFinite(Number(params.seed)))) missing.push('seed');
    return missing;
}

async function generateImageParamsWithRetry(userRequest, rawImageSettings, mode = 'image', searchContext = '') {
    const imageSettings = applyImageModeOverrides(normalizeIncomingImageSettings(rawImageSettings), mode);
    if (imageSettings.safeMode && detectUnsafeImageRequest(userRequest)) {
        throw new Error('Request violated standard rules and considered unsafe.');
    }
    if (imageSettings.safeMode) {
        const safetyResult = await classifyImageSafetyWithAi(userRequest);
        if (!safetyResult.safe) {
            throw new Error(`Unsafe request ${safetyResult.reason ? ` (${safetyResult.reason})` : ''}.`);
        }
    }
    const promptInstructions = `You are an image prompt generator for Stable Diffusion.

Output ONLY valid JSON with the following fields:
- prompt (string)
- negative (string)
- aspect_ratio ("portrait" | "square" | "landscape")
- steps (integer 15–30)
- cfg (float 5–9)
- seed (integer or null)

Rules:
- prompt and negative must be English only
- prompt must be detailed, include subject, lighting, camera, style
- prompt format should feel like: [subject], [details], [lighting], [camera], [style], high detail, cinematic
- never use Vietnamese words such as "meo", "meo con", "ao dai" in Vietnamese spelling, etc. Translate them to natural English
- current app safe mode is ${imageSettings.safeMode ? 'ON' : 'OFF'}
- if safe mode is ON, refuse any sexual, nude, pornographic, gory, bloody, stabbing, murder, or graphic violence request by returning {"refuse":"unsafe"}
- if safe mode is OFF, do not use the refuse field just because the request is edgy or violent; still return the best possible JSON image parameters
- negative must include common defects
- base negative prompt is: ${BASE_NEGATIVE_PROMPT}
- You may only append more negative terms. Do not remove or replace the base negative prompt.
- Steps default to 20. Use 25-30 only when the request clearly needs high detail.
- CFG default to 7. Prefer 6-7 for realistic images, 7-9 for more creative images.
- Aspect ratio should match the subject when obvious.
- Style examples you may reflect in prompt when appropriate:
  cinematic: ${IMAGE_STYLE_HINTS.cinematic}
  portrait: ${IMAGE_STYLE_HINTS.portrait}
  anime: ${IMAGE_STYLE_HINTS.anime}
  realistic: ${IMAGE_STYLE_HINTS.realistic}
- DO NOT invent fields
- DO NOT output explanation`;

    const manualHints = [
        imageSettings.aspectRatioMode === 'manual' ? `Locked aspect_ratio: ${imageSettings.aspectRatio}` : '',
        imageSettings.presetMode === 'manual' ? `Locked preset: ${imageSettings.preset} (${IMAGE_PRESETS[imageSettings.preset].steps} steps, cfg ${IMAGE_PRESETS[imageSettings.preset].cfg})` : '',
        imageSettings.stepsMode === 'manual' ? `Locked steps: ${imageSettings.steps}` : '',
        imageSettings.cfgMode === 'manual' ? `Locked cfg: ${imageSettings.cfg}` : '',
        imageSettings.seedMode === 'manual' ? `Locked seed: ${imageSettings.seed ?? 'null'}` : '',
        imageSettings.negativeMode === 'manual' ? `Locked extra negative terms: ${imageSettings.negative || '(none)'}` : ''
    ].filter(Boolean).join('\n');

    let lastParsed = null;
    let lastMissing = [];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const messages = [
            { role: 'system', content: promptInstructions },
            {
                role: 'user',
                content: attempt === 1
                    ? `User request: ${userRequest}${mode === 'infographic' ? '\n\nThis must be an educational infographic image request, not a normal illustration.' : ''}${searchContext ? `\n\nExternal reference context:\n${searchContext}` : ''}${manualHints ? `\n\nManual settings locked by the app:\n${manualHints}` : ''}`
                    : `User request: ${userRequest}${mode === 'infographic' ? '\n\nThis must be an educational infographic image request, not a normal illustration.' : ''}${searchContext ? `\n\nExternal reference context:\n${searchContext}` : ''}${manualHints ? `\n\nManual settings locked by the app:\n${manualHints}` : ''}\n\nYour previous JSON was missing or invalid for these fields: ${lastMissing.join(', ')}.\nReturn ONLY corrected JSON with all required fields present.`
            }
        ];

        const raw = await requestStudyBuddyAiTextAsync(messages);
        const parsed = parseImageParamsResponse(raw);
        const refusalError = getImageRefusalError(parsed, raw, imageSettings);
        if (refusalError) {
            logger.error('[StudyBuddyImage] Prompt generator rejected request:', {
                source: 'studybuddy-ai-prompt-generator',
                mode,
                attempt,
                safeMode: imageSettings.safeMode,
                userRequest,
                parsedRefusal: parsed,
                rawResponse: raw
            });
            throw refusalError;
        }
        const missing = getMissingImageParamFields(parsed, imageSettings);
        logger.debug(`[StudyBuddyImage] AI params raw (attempt ${attempt}):`, raw);

        if (missing.length === 0) {
            const normalized = normalizeImageParams(parsed, userRequest, imageSettings);
            if (imageSettings.safeMode && detectUnsafeImageRequest(normalized.prompt)) {
                throw new Error('Unsafe request');
            }
            if (imageSettings.safeMode) {
                const promptSafety = await classifyImageSafetyWithAi(normalized.prompt);
                if (!promptSafety.safe) {
                    throw new Error(`Unsafe request ${promptSafety.reason ? ` (${promptSafety.reason})` : ''}.`);
                }
            }
            return normalized;
        }

        lastParsed = parsed;
        lastMissing = missing;
        logger.warn(`[StudyBuddyImage] Missing/invalid image params (attempt ${attempt}):`, missing);
    }

    const fallback = normalizeImageParams(lastParsed || {}, userRequest, imageSettings);
    if (!looksEnglishImagePrompt(fallback.prompt)) {
        throw new Error('Could not generate a valid English-only image prompt. Please retry.');
    }
    if (imageSettings.safeMode && detectUnsafeImageRequest(fallback.prompt)) {
        throw new Error('Unsafe request.');
    }
    if (imageSettings.safeMode) {
        const promptSafety = await classifyImageSafetyWithAi(fallback.prompt);
        if (!promptSafety.safe) {
            throw new Error(`Unsafe request${promptSafety.reason ? ` (${promptSafety.reason})` : ''}.`);
        }
    }
    return fallback;
}

function buildComfyWorkflow(imageParams) {
    const ratio = IMAGE_RATIO_MAP[imageParams.aspect_ratio] || IMAGE_RATIO_MAP.square;
    const seed = imageParams.seed ?? Math.floor(Math.random() * 2147483647);
    const filename = `studybuddy_${Date.now()}`;
    const template = fs.readFileSync(IMAGE_FLOW_PATH, 'utf8');
    const workflowText = template
        .replace('"__PROMPT__"', JSON.stringify(imageParams.prompt))
        .replace('"__NEGATIVE__"', JSON.stringify(imageParams.negative))
        .replace('__WIDTH__', String(ratio.width))
        .replace('__HEIGHT__', String(ratio.height))
        .replace('__SEED__', String(seed))
        .replace('__STEPS__', String(imageParams.steps))
        .replace('__CFG__', String(imageParams.cfg))
        .replace('"__FILENAME__"', JSON.stringify(filename));
    return JSON.parse(workflowText);
}

function createComfyClientId() {
    return `studybuddy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createComfyProgressSocket(clientId, promptId, onProgress) {
    if (typeof WebSocket !== 'function') {
        return { close() {} };
    }

    const wsUrl = new URL(COMFY_UI_URL);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.pathname = '/ws';
    wsUrl.searchParams.set('clientId', clientId);

    let closed = false;
    let lastPercent = -1;
    let didReachCompletion = false;

    const socket = new WebSocket(wsUrl.toString());
    socket.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(String(event.data || ''));
            if (msg?.type === 'progress') {
                const sourcePromptId = msg?.data?.prompt_id;
                if (sourcePromptId && sourcePromptId !== promptId) return;
                const value = Number(msg?.data?.value);
                const max = Number(msg?.data?.max);
                if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return;
                const percent = Math.max(0, Math.min(100, Math.floor((value / max) * 100)));
                if (percent === lastPercent) return;
                lastPercent = percent;
                onProgress(percent);
                if (percent >= 100) {
                    didReachCompletion = true;
                }
                return;
            }

            if (msg?.type === 'executing') {
                const sourcePromptId = msg?.data?.prompt_id;
                if (sourcePromptId && sourcePromptId !== promptId) return;
                if (msg?.data?.node == null && !didReachCompletion) {
                    didReachCompletion = true;
                    if (lastPercent < 100) {
                        lastPercent = 100;
                        onProgress(100);
                    }
                }
            }
        } catch {
            // Ignore malformed progress payloads from ComfyUI.
        }
    });

    const close = () => {
        if (closed) return;
        closed = true;
        try {
            socket.close();
        } catch {
            // ignore close failures
        }
    };

    socket.addEventListener('error', () => {
        // Progress is best-effort; history polling remains the source of truth.
    });

    return { close };
}

async function queueComfyPrompt(workflow, clientId) {
    const requestPayload = clientId
        ? { ...workflow, client_id: clientId }
        : workflow;
    const payload = Buffer.from(JSON.stringify(requestPayload));
    const response = await httpRequestAsync(`${COMFY_UI_URL}/prompt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
        }
    }, payload);

    if (response.statusCode >= 400) {
        throw new Error(`ComfyUI prompt error ${response.statusCode}`);
    }

    const data = JSON.parse(response.body.toString('utf8'));
    if (!data?.prompt_id) {
        throw new Error('ComfyUI did not return prompt_id');
    }
    return data.prompt_id;
}

function extractFirstComfyImage(historyJson, promptId) {
    const historyEntry = historyJson?.[promptId] || historyJson?.prompt_id || historyJson;
    const outputs = historyEntry?.outputs || {};
    for (const nodeOutput of Object.values(outputs)) {
        if (Array.isArray(nodeOutput?.images) && nodeOutput.images.length > 0) {
            return nodeOutput.images[0];
        }
    }
    return null;
}

async function waitForComfyImage(promptId, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 180000;
    const clientId = String(options.clientId || '').trim();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const progressSocket = onProgress && clientId
        ? createComfyProgressSocket(clientId, promptId, onProgress)
        : null;
    const started = Date.now();
    try {
        while (Date.now() - started < timeoutMs) {
            const response = await httpRequestAsync(`${COMFY_UI_URL}/history/${encodeURIComponent(promptId)}`, {
                method: 'GET',
                timeout: 30000
            });
            if (response.statusCode < 400) {
                const data = JSON.parse(response.body.toString('utf8'));
                const imageInfo = extractFirstComfyImage(data, promptId);
                if (imageInfo) {
                    return imageInfo;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    } finally {
        progressSocket?.close();
    }
    throw new Error('Timed out waiting for ComfyUI image');
}

async function downloadComfyImage(imageInfo) {
    const viewUrl = new URL(`${COMFY_UI_URL}/view`);
    viewUrl.searchParams.set('filename', imageInfo.filename);
    viewUrl.searchParams.set('subfolder', imageInfo.subfolder || '');
    viewUrl.searchParams.set('type', imageInfo.type || 'output');
    const response = await httpRequestAsync(viewUrl.toString(), { method: 'GET', timeout: 120000 });
    if (response.statusCode >= 400) {
        throw new Error(`ComfyUI image download failed ${response.statusCode}`);
    }
    return response.body;
}

function saveGeneratedImage(buffer, originalFilename) {
    const mappings = loadFolderMappings();
    const targetDir = mappings.Image;
    if (!targetDir) {
        throw new Error('Image mapping not found');
    }
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const extension = path.extname(originalFilename || '').toLowerCase() || '.png';
    const safeName = `studybuddy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extension}`;
    const filePath = path.join(targetDir, safeName);
    fs.writeFileSync(filePath, buffer);
    return {
        filename: safeName,
        url: `/api/images/stream/Image/${safeName}`
    };
}

function looksVietnamese(text) {
    const source = String(text || '').toLowerCase();
    if (!source.trim()) return false;
    if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(source)) {
        return true;
    }

    return /\b(khong|khong|la|cua|cho|voi|nhung|mot|cach|nghia|tu|cum|vi du)\b/i.test(source);
}

function looksEnglishSearchQuery(text) {
    const source = String(text || '').trim();
    if (!source) return false;
    if (looksVietnamese(source)) return false;
    if (!/[a-z]/i.test(source)) return false;
    const lettersOnly = source.match(/[a-z]/gi) || [];
    const alphaNumeric = source.match(/[a-z0-9]/gi) || [];
    if (lettersOnly.length === 0 || alphaNumeric.length === 0) return false;
    return lettersOnly.length / alphaNumeric.length >= 0.7;
}

function normalizeSearchTypeAlias(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseTypedSearchInput(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) {
        return { section: 'all', query: '' };
    }

    const colonIndex = raw.indexOf(':');
    if (colonIndex <= 0) {
        return { section: 'all', query: raw };
    }

    const rawType = raw.slice(0, colonIndex).trim();
    const query = raw.slice(colonIndex + 1).trim();
    const alias = normalizeSearchTypeAlias(rawType);
    const aliasMap = new Map([
        ['idm', 'idiom'],
        ['idom', 'idiom'],
        ['idiom', 'idiom'],
        ['thanh ngu', 'idiom'],
        ['col', 'collocation'],
        ['collocation', 'collocation'],
        ['collocations', 'collocation'],
        ['ex', 'example'],
        ['exam', 'example'],
        ['example', 'example'],
        ['examples', 'example'],
        ['ví dụ', 'example'],
        ['para', 'paraphrase'],
        ['phrase', 'paraphrase'],
        ['paraphrase', 'paraphrase'],
        ['word', 'word'],
        ['headword', 'word'],
        ['từ', 'word']
    ]);
    const section = aliasMap.get(alias);

    if (!section || !query) {
        return { section: 'all', query: raw };
    }

    return { section, query };
}

function parseExpandedQueries(raw, fallbackQuery) {
    const source = String(raw || '').trim();
    const fallback = [String(fallbackQuery || '').trim()].filter(looksEnglishSearchQuery);
    if (!source) return fallback;

    const fenced = source.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    try {
        const parsed = JSON.parse(fenced);
        if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(looksEnglishSearchQuery)));
        }
        if (Array.isArray(parsed?.queries)) {
            return Array.from(new Set(parsed.queries.map((item) => String(item || '').trim()).filter(looksEnglishSearchQuery)));
        }
    } catch {
        // Ignore parse failures and fall back below.
    }

    const lines = fenced
        .split('\n')
        .map((line) => line.replace(/^\s*[-*0-9.]+\s*/, '').trim())
        .filter(looksEnglishSearchQuery);

    return Array.from(new Set([...fallback, ...lines])).filter(Boolean);
}

function getSearchExpansionPrompt(section, attempt, cleanQuery) {
    const englishOnlyRule = attempt === 1
        ? ''
        : ' Every output query must be English only. Vietnamese output is invalid.';

    if (section === 'idiom') {
        return [
            {
                role: 'system',
                content: `You convert a Vietnamese idiom search request into likely English idioms and natural fixed expressions for vocabulary lookup.${englishOnlyRule}`
            },
            {
                role: 'user',
                content: `Rewrite this Vietnamese idiom meaning into 4 short English idiom or expression search variants.

Rules:
- Return JSON only
- Format: {"queries":["...", "...", "...", "..."]}
- Prefer common idioms, natural fixed expressions, and phrase-like search terms
- Do not use abstract academic paraphrases unless they are also natural phrase searches
- Keep each query under 8 words when possible
- Every query must be English only
- Do not copy Vietnamese words
- No explanations

Vietnamese idiom meaning: ${cleanQuery}`
            }
        ];
    }

    if (section === 'word') {
        return [
            {
                role: 'system',
                content: `You convert a Vietnamese headword search request into likely English headword candidates for vocabulary lookup.${englishOnlyRule}`
            },
            {
                role: 'user',
                content: `Rewrite this Vietnamese word meaning into 4 short English headword candidates.

Rules:
- Return JSON only
- Format: {"queries":["...", "...", "...", "..."]}
- Prefer single words or very short lexical items
- Avoid long paraphrases
- Every query must be English only
- Do not copy Vietnamese words
- No explanations

Vietnamese meaning: ${cleanQuery}`
            }
        ];
    }

    return [
        {
            role: 'system',
            content: attempt === 1
                ? 'You convert a Vietnamese library search request into short English search variants for semantic vocabulary lookup.'
                : 'You convert a Vietnamese library search request into short English search variants for semantic vocabulary lookup. Every output query must be English only. Vietnamese output is invalid.'
        },
        {
            role: 'user',
            content: `Rewrite this Vietnamese query into 4 short English search variants across different registers.

Rules:
- Return JSON only
- Format: {"queries":["...", "...", "...", "..."]}
- Keep each query under 12 words
- Focus on natural English phrases a learner may want to find
- Every query must be English only
- Do not copy Vietnamese words
- No explanations

Vietnamese query: ${cleanQuery}`
        }
    ];
}

function expandSearchQueries(query, callback, attempt = 1, section = 'all') {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return callback(null, []);

    if (!looksVietnamese(cleanQuery)) {
        logger.debug('[StudyBuddySearch] Query is non-Vietnamese, using original query only:', cleanQuery);
        return callback(null, [cleanQuery]);
    }

    logger.debug('[StudyBuddySearch] Expanding Vietnamese query:', cleanQuery);
    requestStudyBuddyAiText(
        getSearchExpansionPrompt(section, attempt, cleanQuery),
        (error, content) => {
            if (error) {
                logger.warn('[StudyBuddySearch] Query expansion failed:', error.message);
                if (attempt < 2) {
                    logger.warn('[StudyBuddySearch] Retrying query expansion with stricter English-only prompt.');
                    return expandSearchQueries(cleanQuery, callback, attempt + 1, section);
                }
                return callback(new Error('I could not generate valid English search queries. Please retry.'));
            }

            const queries = parseExpandedQueries(content, cleanQuery);
            if (!queries.length) {
                logger.warn('[StudyBuddySearch] Expansion returned non-English or unusable queries.');
                if (attempt < 2) {
                    logger.warn('[StudyBuddySearch] Retrying query expansion with stricter English-only prompt.');
                    return expandSearchQueries(cleanQuery, callback, attempt + 1, section);
                }
                return callback(new Error('I could not generate valid English search queries. Please retry.'));
            }
            logger.debug('[StudyBuddySearch] Expanded queries:', queries);
            callback(null, queries);
        }
    );
}

function normalizeFilterText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseKeptTexts(raw) {
    const source = String(raw || '').trim();
    if (!source) return [];
    const fenced = source.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    try {
        const parsed = JSON.parse(fenced);
        const texts = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.keepTexts)
                ? parsed.keepTexts
                : Array.isArray(parsed?.texts)
                    ? parsed.texts
                    : Array.isArray(parsed?.keep)
                        ? parsed.keep
                        : [];
        return Array.from(new Set(texts
            .map((value) => String(value || '').trim())
            .filter(Boolean)));
    } catch {
        const quotedTexts = [...fenced.matchAll(/"([^"]+)"/g)]
            .map((match) => String(match[1] || '').trim())
            .filter(Boolean);
        return Array.from(new Set(quotedTexts));
    }
}

function mapKeptTextsToIndexes(keptTexts, candidateResults) {
    const normalizedWanted = new Set((keptTexts || []).map(normalizeFilterText).filter(Boolean));
    if (!normalizedWanted.size) return [];

    const indexes = [];
    candidateResults.forEach((item, index) => {
        if (normalizedWanted.has(normalizeFilterText(item?.text))) {
            indexes.push(index);
        }
    });
    return indexes;
}

function isIdentityKeep(keepIndexes, candidateCount) {
    if (!Array.isArray(keepIndexes) || keepIndexes.length !== candidateCount) return false;
    for (let index = 0; index < candidateCount; index += 1) {
        if (keepIndexes[index] !== index) return false;
    }
    return true;
}

function buildItemKey(item) {
    return JSON.stringify([
        item?.ownerName || '',
        item?.wordId || '',
        item?.word || '',
        item?.section || '',
        item?.text || ''
    ]);
}

function sortAccumulatedResults(accumulatedMap, fallbackResults = []) {
    const results = Array.from(accumulatedMap.values());
    if (!results.length) return fallbackResults;
    return results.sort((a, b) => {
        if ((b.aiFilterScore || 0) !== (a.aiFilterScore || 0)) {
            return (b.aiFilterScore || 0) - (a.aiFilterScore || 0);
        }
        return (b.score || 0) - (a.score || 0);
    });
}

function filterSearchResultsUntilStable(originalQuery, expandedQueries, results, callback, attempt = 1, stageCollector = [], onStage = null, accumulatedMap = new Map()) {
    if (!Array.isArray(results) || results.length <= 1) {
        if (Array.isArray(results) && results.length === 1) {
            const item = results[0];
            const key = buildItemKey(item);
            const previous = accumulatedMap.get(key);
            accumulatedMap.set(key, {
                ...item,
                aiFilterScore: Math.max(previous?.aiFilterScore || 0, attempt)
            });
        }
        return callback(null, sortAccumulatedResults(accumulatedMap, results || []));
    }

    const candidateResults = results.slice(0, 20);
    const requestFilter = (mode, done) => {
        const isRemoveIrrelevantMode = mode === 'remove-irrelevant';
        requestStudyBuddyAiText(
            [
                {
                    role: 'system',
                    content: isRemoveIrrelevantMode
                        ? 'You filter semantic vocabulary search matches by removing only clearly irrelevant candidates. Be conservative about removal.'
                        : attempt === 1
                            ? 'You filter semantic vocabulary search matches by strict literal meaning relevance.'
                            : 'You filter semantic vocabulary search matches by strict literal meaning relevance. Critically remove any candidate that does not directly express the query.'
                },
                {
                    role: 'user',
                    content: isRemoveIrrelevantMode
                        ? `Remove only the clearly irrelevant candidate texts for this search query.

Rules:
- Return JSON only
- Format: {"keepTexts":["text 1","text 2"]}
- keepTexts must contain the exact candidate text strings that should remain after you remove clearly irrelevant ones
- Copy each kept text exactly from the candidate list
- Keep texts in their current order
- Do not try to find only the best match
- Instead, remove only the texts that are little or not relevant at all
- If a candidate might still plausibly help express the query, keep it for now
- Use literal meaning only
- Do not use metaphor, analogy, symbolism, shape similarity, or associative reasoning
- Do not explain

Original query: ${originalQuery}
Search variants: ${JSON.stringify(expandedQueries)}

Candidates:
${candidateResults.map((item, index) => JSON.stringify({
    index,
    text: item.text
})).join('\n')}

Bad examples of reasoning that must be rejected:
- "political circles" is relevant because a plane circles before landing
- "circular depression" is relevant because both involve a circular shape
- any candidate is relevant just because it can be loosely compared to flying, turning, safety, or motion

Remove only the clearly irrelevant candidates.`
                        : `Remove irrelevant candidate texts for this search query.

Rules:
- Return JSON only
- Format: {"keepTexts":["text 1","text 2"]}
- keepTexts must contain only the exact candidate text strings that are still relevant
- Copy each kept text exactly from the candidate list
- Keep texts in their current order
- Be strict
- Use literal meaning only
- Do not use metaphor, analogy, symbolism, shape similarity, or associative reasoning
- A candidate is relevant only if it directly helps express the user's intended meaning
- If a candidate merely shares one word like "circle", "landing", or "pattern" but describes a different concept, remove it
- If you are unsure, remove it
- Do not explain

Original query: ${originalQuery}
Search variants: ${JSON.stringify(expandedQueries)}

Candidates:
${candidateResults.map((item, index) => JSON.stringify({
    index,
    text: item.text
})).join('\n')}

Bad examples of reasoning that must be rejected:
- "political circles" is relevant because a plane circles before landing
- "circular depression" is relevant because both involve a circular shape
- any candidate is relevant just because it can be loosely compared to flying, turning, safety, or motion

Only keep candidates with direct meaning match.`
                }
            ],
            done
        );
    };

    requestFilter('strict', (error, content) => {
            if (error) {
                logger.warn('[StudyBuddySearch] AI filter failed:', error.message);
                return callback(null, results);
            }

            logger.debug(`[StudyBuddySearch] AI filter raw response (attempt ${attempt}):`, content);
            const keptTexts = parseKeptTexts(content);
            if (Array.isArray(keptTexts) && keptTexts.length === 0) {
                if (attempt === 1) {
                    logger.debug('[StudyBuddySearch] Attempt 1 returned empty keepTexts; retrying with remove-irrelevant strategy.');
                    return requestFilter('remove-irrelevant', (retryError, retryContent) => {
                        if (retryError) {
                            logger.warn('[StudyBuddySearch] AI remove-irrelevant retry failed:', retryError.message);
                            return callback(null, []);
                        }
                        logger.debug('[StudyBuddySearch] AI filter raw response (attempt 1 retry remove-irrelevant):', retryContent);
                        const retryKeptTexts = parseKeptTexts(retryContent);
                        if (!Array.isArray(retryKeptTexts) || retryKeptTexts.length === 0) {
                            const stage = 'Mình lọc lần 1: không còn kết quả nào đủ phù hợp.';
                            stageCollector.push(stage);
                            if (typeof onStage === 'function') onStage(stage);
                            return callback(null, []);
                        }
                        const retryKeepIndexes = mapKeptTextsToIndexes(retryKeptTexts, candidateResults);
                        if (retryKeepIndexes.length === 0) {
                            logger.warn('[StudyBuddySearch] AI remove-irrelevant retry returned texts that did not match any candidate exactly.');
                            return callback(null, []);
                        }
                        const retryFilteredTop = retryKeepIndexes.map((index) => candidateResults[index]);
                        retryFilteredTop.forEach((item) => {
                            const key = buildItemKey(item);
                            const previous = accumulatedMap.get(key);
                            accumulatedMap.set(key, {
                                ...item,
                                aiFilterScore: (previous?.aiFilterScore || 0) + attempt
                            });
                        });
                        const retryFiltered = [...retryFilteredTop, ...results.slice(candidateResults.length)];
                        const stage = `Mình lọc lần ${attempt}: từ ${results.length} kết quả còn ${retryFiltered.length} kết quả.`;
                        stageCollector.push(stage);
                        if (typeof onStage === 'function') onStage(stage);
                        logger.debug('[StudyBuddySearch] AI filter keep indexes (attempt 1 retry remove-irrelevant):', retryKeepIndexes);
                        logger.debug('[StudyBuddySearch] AI filter kept texts (attempt 1 retry remove-irrelevant):', retryFilteredTop.map((item) => item.text));

                        if (retryFiltered.length <= 1) {
                            const finalStage = `Mình dừng lọc ở lần ${attempt} và còn ${retryFiltered.length} kết quả.`;
                            stageCollector.push(finalStage);
                            if (typeof onStage === 'function') onStage(finalStage);
                            return callback(null, sortAccumulatedResults(accumulatedMap, retryFiltered));
                        }

                        return filterSearchResultsUntilStable(originalQuery, expandedQueries, retryFiltered, callback, attempt + 1, stageCollector, onStage, accumulatedMap);
                    });
                }
                logger.debug(`[StudyBuddySearch] AI filter returned empty keepTexts at attempt ${attempt}; stopping with previous results.`);
                const stage = attempt > 1
                    ? `Mình dừng lọc ở lần ${attempt} và giữ lại các kết quả tốt nhất từ những vòng trước.`
                    : `Mình lọc lần ${attempt}: không còn kết quả nào đủ phù hợp.`;
                stageCollector.push(stage);
                if (typeof onStage === 'function') onStage(stage);
                return callback(null, attempt > 1 ? sortAccumulatedResults(accumulatedMap, results) : []);
            }
            const keepIndexes = mapKeptTextsToIndexes(keptTexts, candidateResults);
            if (keepIndexes.length === 0) {
                logger.warn('[StudyBuddySearch] AI filter returned texts that did not match any candidate exactly, keeping current results.');
                return callback(null, sortAccumulatedResults(accumulatedMap, results));
            }

            const filteredTop = keepIndexes.map((index) => candidateResults[index]);
            filteredTop.forEach((item) => {
                const key = buildItemKey(item);
                const previous = accumulatedMap.get(key);
                accumulatedMap.set(key, {
                    ...item,
                    aiFilterScore: (previous?.aiFilterScore || 0) + attempt
                });
            });

            if (isIdentityKeep(keepIndexes, candidateResults.length)) {
                logger.debug(`[StudyBuddySearch] AI filter stable at attempt ${attempt}; no more removals.`);
                const finalResults = sortAccumulatedResults(accumulatedMap, results);
                const stage = `Mình lọc xong và giữ lại ${finalResults.length} kết quả phù hợp nhất.`;
                stageCollector.push(stage);
                if (typeof onStage === 'function') onStage(stage);
                return callback(null, finalResults);
            }

            const filtered = [...filteredTop, ...results.slice(candidateResults.length)];
            const stage = `Mình lọc lần ${attempt}: từ ${results.length} kết quả còn ${filtered.length} kết quả.`;
            stageCollector.push(stage);
            if (typeof onStage === 'function') onStage(stage);
            logger.debug(`[StudyBuddySearch] AI filter keep indexes (attempt ${attempt}):`, keepIndexes);
            logger.debug(`[StudyBuddySearch] AI filter kept texts (attempt ${attempt}):`, filteredTop.map((item) => item.text));
            logger.debug(
                `[StudyBuddySearch] AI filter accumulated scores (attempt ${attempt}):`,
                sortAccumulatedResults(accumulatedMap).map((item) => ({
                    text: item.text,
                    aiFilterScore: item.aiFilterScore,
                    score: Number((item.score || 0).toFixed(4))
                }))
            );

            if (attempt >= 4 || filtered.length <= 1) {
                const finalStage = `Mình dừng lọc ở lần ${attempt} và còn ${filtered.length} kết quả.`;
                stageCollector.push(finalStage);
                if (typeof onStage === 'function') onStage(finalStage);
                return callback(null, sortAccumulatedResults(accumulatedMap, filtered));
            }

            return filterSearchResultsUntilStable(originalQuery, expandedQueries, filtered, callback, attempt + 1, stageCollector, onStage, accumulatedMap);
        });
}

router.post('/studybuddy/chat', async (req, res) => {
    const requestBody = req.body && typeof req.body === 'object' ? { ...req.body } : {};

    if (requestBody.searchEnabled && Array.isArray(requestBody.messages)) {
        const latestUserMessage = [...requestBody.messages]
            .reverse()
            .find((item) => item?.role === 'user' && typeof item?.content === 'string' && item.content.trim());
        if (latestUserMessage?.content) {
            try {
                const externalContext = await collectExternalReferenceContext(latestUserMessage.content.trim(), 'chat');
                if (externalContext.contextText) {
                    requestBody.messages = attachExternalReferenceContext(
                        requestBody.messages,
                        externalContext.contextText,
                        'chat',
                        externalContext.queries
                    );
                }
            } catch (error) {
                logger.warn('[StudyBuddySearchAssist] chat context collection failed:', error?.message || error);
            }
        }
    }

    const payload = JSON.stringify(requestBody || {});

    ensureActiveUrl((err, baseUrl) => {
        if (err || !baseUrl) {
            return res.status(502).json({ error: 'No StudyBuddy AI available' });
        }

        let currentUrl = baseUrl;
        let activeUpstreamReq = null;
        let responseCommitted = false;
        let requestClosed = false;

        const cleanupUpstream = () => {
            if (activeUpstreamReq) {
                activeUpstreamReq.removeAllListeners();
                activeUpstreamReq.destroy();
                activeUpstreamReq = null;
            }
        };

        req.on('aborted', () => {
            requestClosed = true;
            cleanupUpstream();
        });

        res.on('close', () => {
            requestClosed = true;
            cleanupUpstream();
        });

        function sendRequest(urlToUse) {
            if (requestClosed) return;

            const upstreamUrl = new URL(urlToUse);
            const client = upstreamUrl.protocol === 'https:' ? https : http;

            logger.debug('[StudyBuddy] Using AI:', upstreamUrl.href);

            const upstreamReq = client.request(
                upstreamUrl,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        'Accept': req.body?.stream ? 'text/event-stream' : 'application/json'
                    }
                },
                (upstreamRes) => {
                    if (requestClosed) {
                        upstreamRes.resume();
                        return;
                    }

                    if (responseCommitted || res.headersSent) {
                        upstreamRes.resume();
                        return;
                    }

                    responseCommitted = true;
                    const responseHeaders = filterHeaders(upstreamRes.headers);
                    res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
                    upstreamRes.pipe(res);
                }
            );
            activeUpstreamReq = upstreamReq;

            upstreamReq.setTimeout(300000, () => {
                upstreamReq.destroy(new Error('StudyBuddy AI upstream timeout'));
            });

            upstreamReq.on('error', (error) => {
                logger.error('[StudyBuddy] Active AI failed:', upstreamUrl.href, error.message);
                activeBaseUrl = null;

                if (requestClosed) {
                    return;
                }

                if (responseCommitted || res.headersSent) {
                    if (!res.writableEnded) {
                        res.end();
                    }
                    return;
                }

                ensureActiveUrl((err2, newUrl) => {
                    if (err2 || !newUrl) {
                        if (!res.headersSent) {
                            return res.status(502).json({ error: 'All StudyBuddy AI upstreams failed' });
                        }
                        return res.end();
                    }
                    sendRequest(newUrl);
                });
            });

            upstreamReq.write(payload);
            upstreamReq.end();
        }

        sendRequest(currentUrl);
    });
});

router.post('/studybuddy/search', (req, res) => {
    const data = String(req.body?.data || '').trim();
    const userName = String(req.body?.userName || '').trim();
    const parsedInput = parseTypedSearchInput(data);
    const searchSection = parsedInput.section;
    const searchQuery = parsedInput.query;
    const wantsStream = String(req.headers.accept || '').includes('text/event-stream');
    const stages = [];

    const sendStage = (text) => {
        if (!text) return;
        if (wantsStream && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'stage', text })}\n\n`);
        }
    };

    const sendFinal = (payload) => {
        if (wantsStream) {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'final', ...payload })}\n\n`);
                res.end();
            }
            return;
        }
        return res.json(payload);
    };

    const sendError = (status, error) => {
        if (wantsStream) {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
                res.end();
            }
            return;
        }
        return res.status(status).json({ error });
    };

    if (wantsStream) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        });
    }

    if (!userName) {
        return sendError(400, 'Missing userName');
    }

    if (!searchQuery) {
        return sendError(400, 'Missing search data');
    }

    logger.info('User requested to search:', data);
    let responded = false;

    expandSearchQueries(searchQuery, (expandError, queries) => {
        if (responded || (!wantsStream && res.headersSent) || res.writableEnded) {
            logger.warn('[StudyBuddySearch] Ignoring duplicate callback for query:', searchQuery);
            return;
        }
        responded = true;
        if (expandError) {
            logger.warn('[StudyBuddySearch] Expansion aborted search:', expandError.message);
            return sendError(422, expandError.message);
        }
        const expandStage = `Mình đang thử tìm các bản tiếng Anh như: ${queries.join(' | ')}`;
        stages.push(expandStage);
        sendStage(expandStage);
        const rawResults = searchUserVocabularyIndex(userName, queries, 20, { section: searchSection });
        const foundStage = `Mình tìm thấy vài kết quả ban đầu, mình đang lọc bớt.`;
        stages.push(foundStage);
        sendStage(foundStage);
        logger.debug('[StudyBuddySearch] Search request detail:', {
            userName,
            originalQuery: searchQuery,
            searchSection,
            expandedQueries: queries,
            resultCount: rawResults.length
        });
        logger.debug(
            '[StudyBuddySearch] Top matches before AI filter:',
            rawResults.map((item) => ({
                word: item.word,
                section: item.section,
                text: item.text,
                matchedQuery: item.matchedQuery,
                score: Number(item.score.toFixed(4))
            }))
        );

        filterSearchResultsUntilStable(searchQuery, queries, rawResults, (_filterError, results) => {
            if ((!wantsStream && res.headersSent) || res.writableEnded) return;
            logger.debug(
                '[StudyBuddySearch] Top matches after AI filter:',
                results.map((item) => ({
                    word: item.word,
                    section: item.section,
                    text: item.text,
                    matchedQuery: item.matchedQuery,
                    score: Number(item.score.toFixed(4))
                }))
            );

            const response = results.length
                ? results.map((item) => {
                    const extras = [];
                    if (item.register) extras.push(`register: ${item.register}`);
                    if (item.context) extras.push(`context: ${item.context}`);
                    if (item.hint) extras.push(`hint: ${item.hint}`);
                    return `Word: ${item.word}\nSection: ${item.section}\nMatch: ${item.text}${extras.length ? `\n${extras.join('\n')}` : ''}`;
                })
                : ['Khong tim thay ket qua phu hop trong Vocabulary Library cua ban.'];

            return sendFinal({
                response: response[0],
                responses: response,
                matches: results.map((item) => ({
                    word: item.word,
                    section: item.section,
                    text: item.text,
                    register: item.register || '',
                    context: item.context || '',
                    hint: item.hint || ''
                })),
                queries,
                stages
            });
        }, 1, stages, sendStage);
    }, 1, searchSection);
});

router.get('/studybuddy/status', async (req, res) => {
    let chatConnected = false;
    let imageConnected = false;
    let activeAiUrl = null;

    try {
        activeAiUrl = await ensureActiveUrlAsync();
        chatConnected = true;
    } catch (error) {
        logger.warn('[StudyBuddyStatus] AI chat unavailable:', error?.message || error);
    }

    imageConnected = await checkComfyUiAvailable();

    return res.json({
        mode: imageConnected ? 'image' : (chatConnected ? 'chat' : 'offline'),
        chatConnected,
        imageConnected,
        activeAiUrl,
        imageServerUrl: COMFY_UI_URL
    });
});

router.post('/studybuddy/image', async (req, res) => {
    const data = String(req.body?.data || '').trim();
    const mode = String(req.body?.mode || 'image').trim().toLowerCase() === 'infographic' ? 'infographic' : 'image';
    const imageSettings = normalizeIncomingImageSettings(req.body?.settings);
    const searchEnabled = req.body?.searchEnabled === true;
    const wantsStream = String(req.headers.accept || '').includes('text/event-stream');

    const sendProgress = (progress) => {
        if (wantsStream && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'progress', progress: Math.max(0, Math.min(100, Math.floor(Number(progress) || 0))) })}\n\n`);
        }
    };

    const sendFinal = (payload) => {
        if (wantsStream) {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'final', ...payload })}\n\n`);
                res.end();
            }
            return;
        }
        return res.json(payload);
    };

    const sendError = (status, error) => {
        if (wantsStream) {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
                res.end();
            }
            return;
        }
        return res.status(status).json({ error });
    };

    if (wantsStream) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        });
    }

    if (!data) {
        return sendError(400, 'Missing image request data');
    }

    try {
        sendProgress(4);
        let imageParams;
        let infographicWordList = '';
        let imageSearchContext = '';
        if (searchEnabled) {
            try {
                const externalContext = await collectExternalReferenceContext(data, 'image');
                imageSearchContext = externalContext.contextText;
            } catch (error) {
                logger.warn('[StudyBuddySearchAssist] image context collection failed:', error?.message || error);
            }
        }
        if (mode === 'infographic') {
            const wordListText = await generateInfographicWordList(data, imageSearchContext);
            infographicWordList = wordListText;
            const built = await buildInfographicImageParams(data, wordListText, imageSettings, imageSearchContext);
            imageParams = built.params;
        } else {
            imageParams = await generateImageParamsWithRetry(data, imageSettings, mode, imageSearchContext);
        }
        logger.debug('[StudyBuddyImage] Original request:', data);
        logger.debug('[StudyBuddyImage] Mode:', mode);
        logger.debug('[StudyBuddyImage] Incoming settings:', imageSettings);
        logger.debug('[StudyBuddyImage] Final params:', imageParams);
        sendProgress(10);

        const clientId = createComfyClientId();
        const workflow = buildComfyWorkflow(imageParams);
        const promptId = await queueComfyPrompt(workflow, clientId);

        let lastProgressStage = -1;
        sendProgress(14);
        const imageInfo = await waitForComfyImage(promptId, {
            clientId,
            onProgress: (percent) => {
                const rounded = Math.max(14, Math.min(96, Math.floor(percent)));
                if (rounded === lastProgressStage) return;
                lastProgressStage = rounded;
                sendProgress(rounded);
            }
        });
        sendProgress(97);
        const imageBuffer = await downloadComfyImage(imageInfo);
        const saved = saveGeneratedImage(imageBuffer, imageInfo.filename);
        sendProgress(100);

        let response = `[IMG ${saved.url}]`;
        if (mode === 'infographic') {
            response = buildInfographicChatResponse(saved.url, infographicWordList);
        }

        return sendFinal({
            params: imageParams,
            imageUrl: saved.url,
            response
        });
    } catch (error) {
        logger.error('[StudyBuddyImage] Generation failed:', error);
        return sendError(error?.statusCode || 500, error.message || 'Failed to generate image.');
    }
});

module.exports = router;
