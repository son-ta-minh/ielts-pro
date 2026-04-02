const HEADWORD_TOKEN_VARIANTS: Record<string, string[]> = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
};

export const IGNORED_HEADWORD_TOKENS = new Set([
    'a',
    'an',
    'the',
    'someone',
    'somebody',
    'something',
    'somewhere',
    'somehow',
    'somewhat',
    'anyone',
    'anybody',
    'anything',
    'anywhere',
    'everyone',
    'everybody',
    'everything',
    'everywhere',
]);

const normalize = (value: string): string => value.trim().toLowerCase();

const NON_INFLECTABLE_TOKENS = new Set([
    'with',
    'to',
    'for',
    'of',
    'in',
    'on',
    'at',
    'by',
    'from',
    'about',
    'into',
    'over',
    'after',
    'before',
    'between',
    'through',
    'under',
    'against',
    'without',
    'within',
    'as',
    'like',
    'than',
    'off',
    'up',
    'down',
    'out',
    'away',
    'around'
]);

const isConsonant = (char: string): boolean => /^[bcdfghjklmnpqrstvwxyz]$/i.test(char);

const buildRegularVerbVariants = (token: string): string[] => {
    const value = normalize(token);
    if (!value || value.length < 2) return [];
    if (NON_INFLECTABLE_TOKENS.has(value)) return [value];

    const variants = new Set<string>();
    variants.add(value);

    if (/[sxz]$/.test(value) || /(sh|ch)$/.test(value)) {
        variants.add(`${value}es`);
    } else if (/[^aeiou]y$/.test(value)) {
        variants.add(`${value.slice(0, -1)}ies`);
    } else {
        variants.add(`${value}s`);
    }

    if (/e$/.test(value)) {
        variants.add(`${value}d`);
        variants.add(`${value.slice(0, -1)}ing`);
    } else if (/[^aeiou]y$/.test(value)) {
        variants.add(`${value.slice(0, -1)}ied`);
        variants.add(`${value}ing`);
    } else {
        variants.add(`${value}ed`);
        variants.add(`${value}ing`);
    }

    const last = value[value.length - 1];
    const middle = value[value.length - 2];
    const first = value[value.length - 3];
    if (
        value.length >= 3
        && isConsonant(first)
        && /[aeiou]/i.test(middle)
        && isConsonant(last)
        && !/[wxy]$/i.test(value)
    ) {
        variants.add(`${value}${last}ed`);
        variants.add(`${value}${last}ing`);
    }

    return Array.from(variants);
};

const getTokenVariants = (token: string): string[] => {
    const normalized = normalize(token);
    const variants = new Set<string>([normalized]);
    const mapped = HEADWORD_TOKEN_VARIANTS[normalized] || [];
    mapped.forEach((variant) => variants.add(variant));
    buildRegularVerbVariants(normalized).forEach((variant) => variants.add(variant));
    return Array.from(variants);
};

export const buildIgnoredTokenRemovalVariants = (phrase: string): string[] => {
    const normalizedPhrase = normalize(phrase);
    if (!normalizedPhrase) return [];

    const tokens = normalizedPhrase.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const variants = new Set<string>();
    const queue: string[][] = [tokens];
    const visited = new Set<string>([tokens.join(' ')]);

    while (queue.length > 0) {
        const currentTokens = queue.shift() || [];
        currentTokens.forEach((token, index) => {
            if (!IGNORED_HEADWORD_TOKENS.has(token)) return;
            const nextTokens = currentTokens.filter((_, tokenIndex) => tokenIndex !== index);
            if (nextTokens.length === 0) return;
            const nextPhrase = nextTokens.join(' ');
            if (visited.has(nextPhrase)) return;
            visited.add(nextPhrase);
            variants.add(nextPhrase);
            queue.push(nextTokens);
        });
    }

    return Array.from(variants).sort((left, right) => right.length - left.length);
};

export const expandHighlightTerms = (phrase: string): string[] => {
    const normalizedPhrase = normalize(phrase);
    if (!normalizedPhrase) return [];

    const seedTerms = [normalizedPhrase, ...buildIgnoredTokenRemovalVariants(normalizedPhrase)];
    const uniqueTerms = new Set<string>(seedTerms);

    seedTerms.forEach((seed) => {
        const tokens = seed.split(/\s+/).filter(Boolean);
        tokens.forEach((token, index) => {
            if (IGNORED_HEADWORD_TOKENS.has(token)) return;

            const variants = getTokenVariants(token);
            if (variants.length === 0) return;

            variants.forEach((variant) => {
                const nextTokens = [...tokens];
                nextTokens[index] = variant;
                uniqueTerms.add(nextTokens.join(' '));
            });
        });
    });

    return Array.from(uniqueTerms)
        .map((item) => item.trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
};

export const getHeadwordHighlightTerms = (headword: string): string[] => expandHighlightTerms(headword);
