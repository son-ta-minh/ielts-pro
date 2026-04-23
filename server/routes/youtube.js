const express = require('express');
const https = require('https');
const cheerio = require('cheerio');

const router = express.Router();

function decodeHtml(value) {
    const $ = cheerio.load('<div></div>');
    $('div').html(String(value || ''));
    return $('div').text();
}

function extractVideoId(input) {
    const value = String(input || '').trim();
    if (!value) return null;

    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

    try {
        const parsed = new URL(value);
        if (parsed.hostname.includes('youtu.be')) {
            const id = parsed.pathname.replace(/\//g, '').trim();
            return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
        }
        if (parsed.hostname.includes('youtube.com')) {
            const shortId = parsed.searchParams.get('v');
            if (shortId && /^[a-zA-Z0-9_-]{11}$/.test(shortId)) return shortId;

            const pathParts = parsed.pathname.split('/').filter(Boolean);
            const embedId = pathParts[pathParts.length - 1];
            return embedId && /^[a-zA-Z0-9_-]{11}$/.test(embedId) ? embedId : null;
        }
    } catch {}

    return null;
}

function fetchText(url, redirects = 3, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/json',
                'Cookie': 'CONSENT=YES+;',
                ...extraHeaders
            }
        }, (res) => {
            const { statusCode = 0, headers } = res;
            if (statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0) {
                res.resume();
                const nextUrl = headers.location.startsWith('http')
                    ? headers.location
                    : new URL(headers.location, url).toString();
                resolve(fetchText(nextUrl, redirects - 1));
                return;
            }

            if (statusCode < 200 || statusCode >= 300) {
                res.resume();
                reject(new Error(`Request failed (${statusCode})`));
                return;
            }

            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve(body));
        }).on('error', (err) => {
            console.error('HTTPS error:', err.message);
            reject(err);
        });
    });
}

function extractBalancedJson(source, marker) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex === -1) return null;

    const startIndex = source.indexOf('{', markerIndex);
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < source.length; index += 1) {
        const char = source[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(startIndex, index + 1);
            }
        }
    }

    return null;
}

function pickCaptionTrack(captionTracks = []) {
    if (!Array.isArray(captionTracks) || captionTracks.length === 0) return null;

    const scored = captionTracks.map((track) => {
        const languageCode = String(track.languageCode || '');
        const kind = String(track.kind || '');
        let score = 0;
        if (languageCode === 'en') score += 6;
        else if (languageCode.startsWith('en')) score += 5;
        if (!kind) score += 3;
        if (kind === 'asr') score -= 1;
        return { track, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.track || captionTracks[0];
}

function normalizeSubtitleEvents(payload) {
    const events = Array.isArray(payload?.events) ? payload.events : [];
    return events
        .map((event) => {
            const text = Array.isArray(event?.segs)
                ? event.segs.map((segment) => decodeHtml(segment?.utf8 || '')).join('').replace(/\s+/g, ' ').trim()
                : '';

            return {
                startMs: Number(event?.tStartMs || 0),
                durationMs: Number(event?.dDurationMs || 0),
                text
            };
        })
        .filter((segment) => segment.text);
}

router.get('/youtube/transcript', async (req, res) => {
    const videoId = extractVideoId(req.query.url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL.' });
    }

    try {
        const watchHtml = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
        const playerResponseJson = extractBalancedJson(watchHtml, 'ytInitialPlayerResponse');
        if (!playerResponseJson) {
            return res.status(404).json({ error: 'Unable to load YouTube player data.' });
        }

        let playerResponse;
        try {
            playerResponse = JSON.parse(playerResponseJson);
        } catch (err) {
            console.error('Parse playerResponse failed');
            return res.status(500).json({ error: 'Invalid YouTube player JSON' });
        }
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const selectedTrack = pickCaptionTrack(captionTracks);

        if (!selectedTrack?.baseUrl) {
            console.error('No caption track:', captionTracks);
            return res.status(404).json({ error: 'No subtitles found for this video.' });
        }

        const transcriptUrl = new URL(selectedTrack.baseUrl);

        // remove bot-like params that break request
        transcriptUrl.searchParams.delete('ip');
        transcriptUrl.searchParams.delete('ipbits');

        // keep auth params but enforce format
        transcriptUrl.searchParams.set('fmt', 'json3');

        let rawTranscript = await fetchText(
            transcriptUrl.toString(),
            3,
            {
                'Referer': `https://www.youtube.com/watch?v=${videoId}`
            }
        );

        if (!rawTranscript) {
            // try xml with original params
            const xmlUrl = new URL(selectedTrack.baseUrl);

            xmlUrl.searchParams.delete('ip');
            xmlUrl.searchParams.delete('ipbits');

            xmlUrl.searchParams.set('fmt', 'xml');

            rawTranscript = await fetchText(
                xmlUrl.toString(),
                3,
                {
                    'Referer': `https://www.youtube.com/watch?v=${videoId}`
                }
            );
        }

        let transcriptPayload;
        try {
            transcriptPayload = JSON.parse(rawTranscript);
        } catch (err) {
            console.error('Transcript is not JSON');
            console.error('Status URL:', transcriptUrl.toString());
            console.error('Raw length:', rawTranscript.length);
            console.error('Raw preview (500 chars):', rawTranscript.slice(0, 500));
            return res.status(500).json({
                error: 'Invalid transcript format',
                debug: {
                    url: transcriptUrl.toString(),
                    preview: rawTranscript.slice(0, 200)
                }
            });
        }
        const subtitleSegments = normalizeSubtitleEvents(transcriptPayload);

        if (subtitleSegments.length === 0) {
            return res.status(404).json({ error: 'Subtitle track was empty.' });
        }

        return res.json({
            videoId,
            title: playerResponse?.videoDetails?.title || `YouTube ${videoId}`,
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
            transcript: subtitleSegments.map((segment) => segment.text).join(' '),
            subtitleTrack: {
                languageCode: selectedTrack.languageCode || null,
                name: decodeHtml(selectedTrack?.name?.simpleText || selectedTrack?.name?.runs?.map((item) => item.text).join('') || ''),
                isAutoGenerated: selectedTrack.kind === 'asr'
            },
            subtitleSegments
        });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to fetch YouTube transcript.' });
    }
});

module.exports = router;
