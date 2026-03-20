const express = require('express');
const http = require('http');
const https = require('https');
const { settings } = require('../config');
const { searchUserVocabularyIndex } = require('../vocabularySearchIndex');

const router = express.Router();


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

function probeAndSelectActiveUrl(callback) {
    const urls = getCandidateUrls();
    let index = 0;

    function tryNextProbe() {
        if (index >= urls.length) {
            activeBaseUrl = null;
            console.error('[StudyBuddy] No AI upstream available');
            return callback(new Error('No upstream available'));
        }

        const url = new URL(urls[index++]);
        const client = url.protocol === 'https:' ? https : http;

        const probeUrl = new URL(url.href);
        probeUrl.pathname = '/v1/models'; // safer probe endpoint for OpenAI-compatible APIs

        const req = client.request(
            probeUrl,
            { method: 'GET', timeout: 5000 },
            (res) => {
                if (res.statusCode && res.statusCode < 500) {
                    console.log('[StudyBuddy] Connected to AI:', url.href, 'status:', res.statusCode);
                    activeBaseUrl = url.href;
                    res.resume(); // drain
                    return callback(null, activeBaseUrl);
                } else {
                    console.warn('[StudyBuddy] Probe bad status:', url.href, res.statusCode);
                    res.resume();
                    tryNextProbe();
                }
            }
        );

        req.on('error', (err) => {
            console.warn('[StudyBuddy] Probe failed:', url.href, err.message);
            tryNextProbe();
        });

        req.on('timeout', () => {
            req.destroy();
            console.warn('[StudyBuddy] Probe timeout (skip):', url.href);
            tryNextProbe();
        });

        req.end();
    }

    tryNextProbe();
}

function ensureActiveUrl(callback) {
    if (activeBaseUrl) return callback(null, activeBaseUrl);
    if (isProbing) {
        const interval = setInterval(() => {
            if (activeBaseUrl) {
                clearInterval(interval);
                return callback(null, activeBaseUrl);
            }
        }, 100);
        return;
    }
    isProbing = true;
    probeAndSelectActiveUrl((err, url) => {
        isProbing = false;
        callback(err, url);
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

function looksVietnamese(text) {
    const source = String(text || '').toLowerCase();
    if (!source.trim()) return false;
    if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(source)) {
        return true;
    }

    return /\b(khong|khong|la|cua|cho|voi|nhung|mot|cach|nghia|tu|cum|vi du)\b/i.test(source);
}

function parseExpandedQueries(raw, fallbackQuery) {
    const source = String(raw || '').trim();
    const fallback = [String(fallbackQuery || '').trim()].filter(Boolean);
    if (!source) return fallback;

    const fenced = source.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    try {
        const parsed = JSON.parse(fenced);
        if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean)));
        }
        if (Array.isArray(parsed?.queries)) {
            return Array.from(new Set(parsed.queries.map((item) => String(item || '').trim()).filter(Boolean)));
        }
    } catch {
        // Ignore parse failures and fall back below.
    }

    const lines = fenced
        .split('\n')
        .map((line) => line.replace(/^\s*[-*0-9.]+\s*/, '').trim())
        .filter(Boolean);

    return Array.from(new Set([...fallback, ...lines])).filter(Boolean);
}

function expandSearchQueries(query, callback) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return callback(null, []);

    if (!looksVietnamese(cleanQuery)) {
        console.log('[StudyBuddySearch] Query is non-Vietnamese, using original query only:', cleanQuery);
        return callback(null, [cleanQuery]);
    }

    console.log('[StudyBuddySearch] Expanding Vietnamese query:', cleanQuery);
    requestStudyBuddyAiText(
        [
            {
                role: 'system',
                content: 'You convert a Vietnamese library search request into short English search variants for semantic vocabulary lookup.'
            },
            {
                role: 'user',
                content: `Rewrite this Vietnamese query into 4 short English search variants across different registers.

Rules:
- Return JSON only
- Format: {"queries":["...", "...", "...", "..."]}
- Keep each query under 12 words
- Focus on natural English phrases a learner may want to find
- No explanations

Vietnamese query: ${cleanQuery}`
            }
        ],
        (error, content) => {
            if (error) {
                console.warn('[StudyBuddySearch] Query expansion failed:', error.message);
                return callback(null, [cleanQuery]);
            }

            const queries = parseExpandedQueries(content, cleanQuery);
            console.log('[StudyBuddySearch] Expanded queries:', queries);
            callback(null, queries.length ? queries : [cleanQuery]);
        }
    );
}

function parseRerankedIndexes(raw, resultCount) {
    const source = String(raw || '').trim();
    if (!source) return [];
    const fenced = source.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

    try {
        const parsed = JSON.parse(fenced);
        const indexes = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.ranking)
                ? parsed.ranking
                : Array.isArray(parsed?.indexes)
                    ? parsed.indexes
                    : [];
        return Array.from(new Set(indexes
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value < resultCount)));
    } catch {
        const numbers = fenced.match(/\d+/g) || [];
        return Array.from(new Set(numbers
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value < resultCount)));
    }
}

function isIdentityRanking(ranking, candidateCount) {
    if (!Array.isArray(ranking) || ranking.length !== candidateCount) return false;
    for (let index = 0; index < candidateCount; index += 1) {
        if (ranking[index] !== index) return false;
    }
    return true;
}

function rerankSearchResults(originalQuery, expandedQueries, results, callback, attempt = 1) {
    if (!Array.isArray(results) || results.length <= 1) {
        return callback(null, results || []);
    }

    const candidateResults = results.slice(0, 10);
    requestStudyBuddyAiText(
        [
            {
                role: 'system',
                content: attempt === 1
                    ? 'You rerank semantic vocabulary search matches. Choose the most relevant matches for the user query, prioritizing meaning fit over lexical overlap.'
                    : 'You rerank semantic vocabulary search matches. You must critically reorder candidates by meaning fit. Do not keep the original order unless it is truly the best order after careful comparison.'
            },
            {
                role: 'user',
                content: `Rerank these candidate matches for the user query.

Rules:
- Return JSON only
- Format: {"ranking":[0,1,2]}
- ranking must contain the candidate indexes in best-first order
- Consider meaning match, register fit, and whether the phrase actually helps express the query
- Original retrieval score is only a hint, not the final answer
- If candidate 0 is not clearly the best meaning match, move it down
- If the original order already happens to be best, you may keep it, but only after careful comparison
- Do not explain

Original query: ${originalQuery}
Expanded queries: ${JSON.stringify(expandedQueries)}

Candidates:
${candidateResults.map((item, index) => JSON.stringify({
    index,
    word: item.word,
    section: item.section,
    text: item.text,
    context: item.context || '',
    register: item.register || '',
    hint: item.hint || '',
    matchedQuery: item.matchedQuery,
    score: Number(item.score.toFixed(4))
})).join('\n')}`
            }
        ],
        (error, content) => {
            if (error) {
                console.warn('[StudyBuddySearch] AI rerank failed:', error.message);
                return callback(null, results);
            }

            const ranking = parseRerankedIndexes(content, candidateResults.length);
            if (ranking.length === 0) {
                console.warn('[StudyBuddySearch] AI rerank returned unusable ranking, keeping original order.');
                return callback(null, results);
            }

            if (attempt === 1 && isIdentityRanking(ranking, candidateResults.length)) {
                console.warn('[StudyBuddySearch] AI rerank returned identity order, retrying with stricter prompt.');
                return rerankSearchResults(originalQuery, expandedQueries, results, callback, 2);
            }

            const used = new Set(ranking);
            const rerankedTop = ranking.map((index) => candidateResults[index]);
            const remainingTop = candidateResults.filter((_, index) => !used.has(index));
            const reranked = [...rerankedTop, ...remainingTop, ...results.slice(candidateResults.length)];
            console.log(`[StudyBuddySearch] AI reranked order (attempt ${attempt}):`, ranking);
            callback(null, reranked);
        }
    );
}

router.post('/studybuddy/chat', (req, res) => {
    const payload = JSON.stringify(req.body || {});

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

            console.log('[StudyBuddy] Using AI:', upstreamUrl.href);

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
                console.error('[StudyBuddy] Active AI failed:', upstreamUrl.href, error.message);
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

    if (!userName) {
        return res.status(400).json({ error: 'Missing userName' });
    }

    if (!data) {
        return res.status(400).json({ error: 'Missing search data' });
    }

    console.log('User requested to search:', data);
    let responded = false;

    expandSearchQueries(data, (_error, queries) => {
        if (responded || res.headersSent) {
            console.warn('[StudyBuddySearch] Ignoring duplicate callback for query:', data);
            return;
        }
        responded = true;
        const rawResults = searchUserVocabularyIndex(userName, queries, 20);
        console.log('[StudyBuddySearch] Search request detail:', {
            userName,
            originalQuery: data,
            expandedQueries: queries,
            resultCount: rawResults.length
        });
        console.log(
            '[StudyBuddySearch] Top matches before rerank:',
            rawResults.map((item) => ({
                word: item.word,
                section: item.section,
                text: item.text,
                matchedQuery: item.matchedQuery,
                score: Number(item.score.toFixed(4))
            }))
        );

        rerankSearchResults(data, queries, rawResults, (_rerankError, results) => {
            if (res.headersSent) return;
            console.log(
                '[StudyBuddySearch] Top matches after rerank:',
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

            return res.json({
                response: response[0],
                responses: response,
                queries
            });
        });
    });
});

module.exports = router;
