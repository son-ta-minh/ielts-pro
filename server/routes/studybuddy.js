const express = require('express');
const http = require('http');
const https = require('https');
const { settings } = require('../config');

const router = express.Router();

const DEFAULT_STUDY_BUDDY_AI_URL = process.env.STUDY_BUDDY_AI_URL || 'http://127.0.0.1:63392/v1/chat/completions';

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

router.post('/studybuddy/chat', (req, res) => {
    const upstreamUrl = new URL(settings.STUDY_BUDDY_AI_URL || DEFAULT_STUDY_BUDDY_AI_URL);
    const client = upstreamUrl.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(req.body || {});

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
            const responseHeaders = filterHeaders(upstreamRes.headers);
            res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
            upstreamRes.pipe(res);
        }
    );

    upstreamReq.setTimeout(300000, () => {
        upstreamReq.destroy(new Error('StudyBuddy AI upstream timeout'));
    });

    upstreamReq.on('error', (error) => {
        console.error('[StudyBuddy Proxy] Upstream error:', error.message);
        if (!res.headersSent) {
            res.status(502).json({ error: 'StudyBuddy AI upstream unavailable' });
            return;
        }
        res.end();
    });

    upstreamReq.write(payload);
    upstreamReq.end();
});

module.exports = router;
