const fs = require('fs');
const path = require('path');
const { getAppBackupPath, loadMetadata } = require('./utils');
const logger = require('./logger');

const VECTOR_DIMENSIONS = 384;
const DEFAULT_RESULT_LIMIT = 8;

const userSearchIndices = new Map();

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitTextIntoChunks(text) {
    const source = String(text || '').replace(/\r/g, '\n').trim();
    if (!source) return [];

    const rawParts = source
        .split(/\n+/)
        .flatMap(part => part.split(/(?<=[.!?])\s+(?=[A-Z0-9"])/))
        .map(part => part.trim())
        .filter(Boolean);

    const seen = new Set();
    return rawParts.filter((part) => {
        const key = part.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function hashToken(token) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function tokenizeNormalized(text) {
    return normalizeText(text).split(' ').filter(Boolean);
}

function buildNgrams(tokens, size) {
    const grams = [];
    for (let index = 0; index <= tokens.length - size; index += 1) {
        grams.push(tokens.slice(index, index + size).join(' '));
    }
    return grams;
}

function embedText(text) {
    const tokens = tokenizeNormalized(text);
    const vector = new Float32Array(VECTOR_DIMENSIONS);

    if (tokens.length === 0) return vector;

    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        const unigramHash = hashToken(token);
        const unigramIndex = unigramHash % VECTOR_DIMENSIONS;
        vector[unigramIndex] += 1;

        if (i < tokens.length - 1) {
            const bigramHash = hashToken(`${token}_${tokens[i + 1]}`);
            const bigramIndex = bigramHash % VECTOR_DIMENSIONS;
            vector[bigramIndex] += 0.7;
        }
    }

    let magnitude = 0;
    for (let i = 0; i < vector.length; i += 1) {
        magnitude += vector[i] * vector[i];
    }

    magnitude = Math.sqrt(magnitude);
    if (!magnitude) return vector;

    for (let i = 0; i < vector.length; i += 1) {
        vector[i] /= magnitude;
    }

    return vector;
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let score = 0;
    for (let i = 0; i < a.length; i += 1) {
        score += a[i] * b[i];
    }
    return score;
}

function getIgnoredFlag(item) {
    if (!item || typeof item !== 'object') return false;
    return Boolean(item.isIgnored || item.g);
}

function readText(item, longKey, shortKey) {
    return String(item?.[longKey] || item?.[shortKey] || '').trim();
}

function normalizeVocabItem(rawItem, fallbackUserName) {
    if (!rawItem || typeof rawItem !== 'object') return null;

    const collocationsArray = Array.isArray(rawItem.collocationsArray || rawItem.col)
        ? (rawItem.collocationsArray || rawItem.col)
        : [];
    const idiomsList = Array.isArray(rawItem.idiomsList || rawItem.idm)
        ? (rawItem.idiomsList || rawItem.idm)
        : [];
    const paraphrases = Array.isArray(rawItem.paraphrases || rawItem.prph)
        ? (rawItem.paraphrases || rawItem.prph)
        : [];

    return {
        id: String(rawItem.id || '').trim(),
        ownerName: String(fallbackUserName || '').trim(),
        word: readText(rawItem, 'word', 'w'),
        example: readText(rawItem, 'example', 'ex'),
        note: readText(rawItem, 'note', 'nt'),
        isIdiom: Boolean(rawItem.isIdiom || rawItem.is_id),
        collocationsArray,
        idiomsList,
        paraphrases
    };
}

function createChunk(section, text, word, wordId, ownerName, extra = {}) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;

    const searchableText = [word, cleanText, extra.hint || '', extra.context || '', extra.register || '']
        .filter(Boolean)
        .join(' | ');

    return {
        ownerName,
        wordId,
        word,
        section,
        text: cleanText,
        searchableText,
        textVector: embedText(cleanText),
        searchableVector: embedText(searchableText),
        textTokens: tokenizeNormalized(cleanText),
        searchableTokens: tokenizeNormalized(searchableText),
        hint: extra.hint || '',
        context: extra.context || '',
        register: extra.register || '',
        isIdiom: Boolean(extra.isIdiom)
    };
}

function buildChunksFromWord(item) {
    if (!item?.ownerName || !item?.word) return [];

    const chunks = [];
    const wordChunk = createChunk('word', item.word, item.word, item.id, item.ownerName, {
        isIdiom: item.isIdiom
    });
    const exampleChunks = splitTextIntoChunks(item.example);
    const noteChunks = splitTextIntoChunks(item.note);

    if (wordChunk) chunks.push(wordChunk);

    exampleChunks.forEach((text) => {
        const chunk = createChunk('example', text, item.word, item.id, item.ownerName);
        if (chunk) chunks.push(chunk);
    });

    noteChunks.forEach((text) => {
        const chunk = createChunk('note', text, item.word, item.id, item.ownerName);
        if (chunk) chunks.push(chunk);
    });

    item.collocationsArray
        .filter((entry) => !getIgnoredFlag(entry))
        .forEach((entry) => {
            const text = readText(entry, 'text', 'x');
            const hint = readText(entry, 'd', 'ds');
            const chunk = createChunk('collocation', text, item.word, item.id, item.ownerName, { hint });
            if (chunk) chunks.push(chunk);
        });

    item.idiomsList
        .filter((entry) => !getIgnoredFlag(entry))
        .forEach((entry) => {
            const text = readText(entry, 'text', 'x');
            const hint = readText(entry, 'd', 'ds');
            const chunk = createChunk('idiom', text, item.word, item.id, item.ownerName, { hint });
            if (chunk) chunks.push(chunk);
        });

    item.paraphrases
        .filter((entry) => !getIgnoredFlag(entry))
        .forEach((entry) => {
            const text = readText(entry, 'word', 'w');
            const context = readText(entry, 'context', 'c');
            const register = readText(entry, 'tone', 't');
            const chunk = createChunk('paraphrase', text, item.word, item.id, item.ownerName, { context, register });
            if (chunk) chunks.push(chunk);
        });

    return chunks;
}

function scoreChunk(chunk, queryProfile) {
    const cosineText = cosineSimilarity(queryProfile.vector, chunk.textVector);
    const cosineSearchable = cosineSimilarity(queryProfile.vector, chunk.searchableVector);
    if (!queryProfile.tokens.length) return cosineText * 0.75 + cosineSearchable * 0.25;

    const textTokenSet = new Set(chunk.textTokens);
    const searchableTokenSet = new Set(chunk.searchableTokens);
    let textOverlapCount = 0;
    let searchableOverlapCount = 0;

    queryProfile.tokens.forEach((token) => {
        if (textTokenSet.has(token)) textOverlapCount += 1;
        if (searchableTokenSet.has(token)) searchableOverlapCount += 1;
    });

    const textOverlap = textOverlapCount / queryProfile.tokens.length;
    const searchableOverlap = searchableOverlapCount / queryProfile.tokens.length;

    const textBigrams = new Set(buildNgrams(chunk.textTokens, 2));
    const textTrigrams = new Set(buildNgrams(chunk.textTokens, 3));
    let bigramOverlapCount = 0;
    let trigramOverlapCount = 0;

    queryProfile.bigrams.forEach((gram) => {
        if (textBigrams.has(gram)) bigramOverlapCount += 1;
    });
    queryProfile.trigrams.forEach((gram) => {
        if (textTrigrams.has(gram)) trigramOverlapCount += 1;
    });

    const bigramOverlap = queryProfile.bigrams.length ? bigramOverlapCount / queryProfile.bigrams.length : 0;
    const trigramOverlap = queryProfile.trigrams.length ? trigramOverlapCount / queryProfile.trigrams.length : 0;

    let score =
        cosineText * 0.48 +
        cosineSearchable * 0.12 +
        textOverlap * 0.2 +
        searchableOverlap * 0.08 +
        bigramOverlap * 0.22 +
        trigramOverlap * 0.28;

    if (queryProfile.tokens.length >= 4 && textOverlapCount <= 1 && bigramOverlapCount === 0 && trigramOverlapCount === 0) {
        score *= 0.58;
    }

    if (textOverlapCount >= 2) {
        score += 0.05;
    }

    if (bigramOverlapCount > 0) {
        score += 0.08;
    }

    if (trigramOverlapCount > 0) {
        score += 0.12;
    }

    return score;
}

function parseVocabularyPayload(raw, fallbackUserName) {
    if (!raw || typeof raw !== 'object') return [];

    const topLevelUserName = String(raw?.user?.name || raw?.user?.n || fallbackUserName || '').trim();
    const rawVocab = Array.isArray(raw.vocab)
        ? raw.vocab
        : (Array.isArray(raw.vocabulary) ? raw.vocabulary : (Array.isArray(raw) ? raw : []));

    return rawVocab
        .map((item) => normalizeVocabItem(item, topLevelUserName))
        .filter((item) => item?.ownerName && item?.word);
}

function buildIndexFromBackupFile(filePath, fallbackUserName = '') {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const vocabItems = parseVocabularyPayload(parsed, fallbackUserName);

    const chunks = vocabItems.flatMap(buildChunksFromWord);
    if (!chunks.length) return null;

    const userName = vocabItems[0]?.ownerName || fallbackUserName;
    if (!userName) return null;

    return {
        userName,
        chunkCount: chunks.length,
        chunks,
        filePath,
        updatedAt: Date.now()
    };
}

function getVocabularyBackupFiles() {
    const appDir = getAppBackupPath('vocab');
    if (!appDir || !fs.existsSync(appDir)) return [];

    return fs.readdirSync(appDir)
        .filter((file) => file.startsWith('backup_') && file.endsWith('.json'))
        .map((file) => path.join(appDir, file));
}

function rebuildAllUserVocabularySearchIndices() {
    userSearchIndices.clear();

    const appDir = getAppBackupPath('vocab');
    const metadata = appDir ? loadMetadata(appDir) : {};
    const backupFiles = getVocabularyBackupFiles();

    backupFiles.forEach((filePath) => {
        try {
            const fileName = path.basename(filePath);
            const meta = metadata[fileName] || {};
            const fallbackUserName = String(meta.displayName || '').trim();
            const index = buildIndexFromBackupFile(filePath, fallbackUserName);
            if (index?.userName) {
                userSearchIndices.set(index.userName, index);
            }
        } catch (error) {
            logger.warn('[VocabularySearch] Failed to index file:', filePath, error.message);
        }
    });

    logger.info('[VocabularySearch] Indexed users:', userSearchIndices.size);
    return getVocabularySearchStats();
}

function rebuildUserVocabularySearchIndexFromFile(filePath, fallbackUserName = '') {
    try {
        const index = buildIndexFromBackupFile(filePath, fallbackUserName);
        if (!index?.userName) return null;
        userSearchIndices.set(index.userName, index);
        logger.info('[VocabularySearch] Rebuilt user index:', index.userName, 'chunks:', index.chunkCount);
        return index;
    } catch (error) {
        logger.warn('[VocabularySearch] Failed to rebuild user index from file:', filePath, error.message);
        return null;
    }
}

function searchUserVocabularyIndex(userName, queries, limit = DEFAULT_RESULT_LIMIT, options = {}) {
    const index = userSearchIndices.get(String(userName || '').trim());
    if (!index || !Array.isArray(index.chunks) || !index.chunks.length) {
        return [];
    }

    const sectionFilter = String(options?.section || 'all').trim().toLowerCase();
    const searchableChunks = sectionFilter && sectionFilter !== 'all'
        ? index.chunks.filter((chunk) => {
            const chunkSection = String(chunk.section || '').toLowerCase();
            if (sectionFilter === 'idiom') {
                return chunkSection === 'idiom' || (chunkSection === 'word' && chunk.isIdiom);
            }
            return chunkSection === sectionFilter;
        })
        : index.chunks;

    if (!searchableChunks.length) return [];

    const normalizedQueries = Array.from(new Set(
        (Array.isArray(queries) ? queries : [queries])
            .map((query) => String(query || '').trim())
            .filter(Boolean)
    ));

    if (!normalizedQueries.length) return [];

    const queryProfiles = normalizedQueries.map((query) => {
        const tokens = tokenizeNormalized(query);
        return {
        raw: query,
        vector: embedText(query),
        tokens,
        bigrams: buildNgrams(tokens, 2),
        trigrams: buildNgrams(tokens, 3)
    };
    });

    const scored = searchableChunks
        .map((chunk) => {
            let bestScore = 0;
            let bestQuery = normalizedQueries[0] || '';

            queryProfiles.forEach((queryProfile) => {
                const score = scoreChunk(chunk, queryProfile);
                if (score > bestScore) {
                    bestScore = score;
                    bestQuery = queryProfile.raw;
                }
            });

            return {
                ...chunk,
                score: bestScore,
                matchedQuery: bestQuery
            };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

    const seen = new Set();
    return scored.filter((item) => {
        const key = `${item.wordId}:${item.section}:${item.text.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

function getVocabularySearchStats() {
    let chunkCount = 0;
    userSearchIndices.forEach((index) => {
        chunkCount += index.chunkCount || 0;
    });

    return {
        users: userSearchIndices.size,
        chunks: chunkCount
    };
}

module.exports = {
    rebuildAllUserVocabularySearchIndices,
    rebuildUserVocabularySearchIndexFromFile,
    searchUserVocabularyIndex,
    getVocabularySearchStats
};
