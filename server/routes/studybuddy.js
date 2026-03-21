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
        console.log('[StudyBuddySearch] Query is non-Vietnamese, using original query only:', cleanQuery);
        return callback(null, [cleanQuery]);
    }

    console.log('[StudyBuddySearch] Expanding Vietnamese query:', cleanQuery);
    requestStudyBuddyAiText(
        getSearchExpansionPrompt(section, attempt, cleanQuery),
        (error, content) => {
            if (error) {
                console.warn('[StudyBuddySearch] Query expansion failed:', error.message);
                if (attempt < 2) {
                    console.warn('[StudyBuddySearch] Retrying query expansion with stricter English-only prompt.');
                    return expandSearchQueries(cleanQuery, callback, attempt + 1, section);
                }
                return callback(new Error('I could not generate valid English search queries. Please retry.'));
            }

            const queries = parseExpandedQueries(content, cleanQuery);
            if (!queries.length) {
                console.warn('[StudyBuddySearch] Expansion returned non-English or unusable queries.');
                if (attempt < 2) {
                    console.warn('[StudyBuddySearch] Retrying query expansion with stricter English-only prompt.');
                    return expandSearchQueries(cleanQuery, callback, attempt + 1, section);
                }
                return callback(new Error('I could not generate valid English search queries. Please retry.'));
            }
            console.log('[StudyBuddySearch] Expanded queries:', queries);
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
                console.warn('[StudyBuddySearch] AI filter failed:', error.message);
                return callback(null, results);
            }

            console.log(`[StudyBuddySearch] AI filter raw response (attempt ${attempt}):`, content);
            const keptTexts = parseKeptTexts(content);
            if (Array.isArray(keptTexts) && keptTexts.length === 0) {
                if (attempt === 1) {
                    console.log('[StudyBuddySearch] Attempt 1 returned empty keepTexts; retrying with remove-irrelevant strategy.');
                    return requestFilter('remove-irrelevant', (retryError, retryContent) => {
                        if (retryError) {
                            console.warn('[StudyBuddySearch] AI remove-irrelevant retry failed:', retryError.message);
                            return callback(null, []);
                        }
                        console.log('[StudyBuddySearch] AI filter raw response (attempt 1 retry remove-irrelevant):', retryContent);
                        const retryKeptTexts = parseKeptTexts(retryContent);
                        if (!Array.isArray(retryKeptTexts) || retryKeptTexts.length === 0) {
                            const stage = 'Mình lọc lần 1: không còn kết quả nào đủ phù hợp.';
                            stageCollector.push(stage);
                            if (typeof onStage === 'function') onStage(stage);
                            return callback(null, []);
                        }
                        const retryKeepIndexes = mapKeptTextsToIndexes(retryKeptTexts, candidateResults);
                        if (retryKeepIndexes.length === 0) {
                            console.warn('[StudyBuddySearch] AI remove-irrelevant retry returned texts that did not match any candidate exactly.');
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
                        console.log('[StudyBuddySearch] AI filter keep indexes (attempt 1 retry remove-irrelevant):', retryKeepIndexes);
                        console.log('[StudyBuddySearch] AI filter kept texts (attempt 1 retry remove-irrelevant):', retryFilteredTop.map((item) => item.text));

                        if (retryFiltered.length <= 1) {
                            const finalStage = `Mình dừng lọc ở lần ${attempt} và còn ${retryFiltered.length} kết quả.`;
                            stageCollector.push(finalStage);
                            if (typeof onStage === 'function') onStage(finalStage);
                            return callback(null, sortAccumulatedResults(accumulatedMap, retryFiltered));
                        }

                        return filterSearchResultsUntilStable(originalQuery, expandedQueries, retryFiltered, callback, attempt + 1, stageCollector, onStage, accumulatedMap);
                    });
                }
                console.log(`[StudyBuddySearch] AI filter returned empty keepTexts at attempt ${attempt}; stopping with previous results.`);
                const stage = attempt > 1
                    ? `Mình dừng lọc ở lần ${attempt} và giữ lại các kết quả tốt nhất từ những vòng trước.`
                    : `Mình lọc lần ${attempt}: không còn kết quả nào đủ phù hợp.`;
                stageCollector.push(stage);
                if (typeof onStage === 'function') onStage(stage);
                return callback(null, attempt > 1 ? sortAccumulatedResults(accumulatedMap, results) : []);
            }
            const keepIndexes = mapKeptTextsToIndexes(keptTexts, candidateResults);
            if (keepIndexes.length === 0) {
                console.warn('[StudyBuddySearch] AI filter returned texts that did not match any candidate exactly, keeping current results.');
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
                console.log(`[StudyBuddySearch] AI filter stable at attempt ${attempt}; no more removals.`);
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
            console.log(`[StudyBuddySearch] AI filter keep indexes (attempt ${attempt}):`, keepIndexes);
            console.log(`[StudyBuddySearch] AI filter kept texts (attempt ${attempt}):`, filteredTop.map((item) => item.text));
            console.log(
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

    console.log('User requested to search:', data);
    let responded = false;

    expandSearchQueries(searchQuery, (expandError, queries) => {
        if (responded || (!wantsStream && res.headersSent) || res.writableEnded) {
            console.warn('[StudyBuddySearch] Ignoring duplicate callback for query:', searchQuery);
            return;
        }
        responded = true;
        if (expandError) {
            console.warn('[StudyBuddySearch] Expansion aborted search:', expandError.message);
            return sendError(422, expandError.message);
        }
        const expandStage = `Mình đang thử tìm các bản tiếng Anh như: ${queries.join(' | ')}`;
        stages.push(expandStage);
        sendStage(expandStage);
        const rawResults = searchUserVocabularyIndex(userName, queries, 20, { section: searchSection });
        const foundStage = `Mình tìm thấy vài kết quả ban đầu, mình đang lọc bớt.`;
        stages.push(foundStage);
        sendStage(foundStage);
        console.log('[StudyBuddySearch] Search request detail:', {
            userName,
            originalQuery: searchQuery,
            searchSection,
            expandedQueries: queries,
            resultCount: rawResults.length
        });
        console.log(
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
            console.log(
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

module.exports = router;
