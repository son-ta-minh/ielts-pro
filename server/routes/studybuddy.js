const express = require('express');
const http = require('http');
const https = require('https');
const { settings } = require('../config');

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

module.exports = router;
