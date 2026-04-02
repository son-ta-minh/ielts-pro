const HEADWORD_TOKEN_VARIANTS: Record<string, string[]> = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
};

const IGNORED_HEADWORD_TOKENS = new Set([
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

export const expandHighlightTerms = (phrase: string): string[] => {
    const normalizedPhrase = normalize(phrase);
    if (!normalizedPhrase) return [];

    const tokens = normalizedPhrase.split(/\s+/).filter(Boolean);
    const uniqueTerms = new Set<string>([normalizedPhrase]);

    tokens.forEach((token, index) => {
        if (IGNORED_HEADWORD_TOKENS.has(token)) {
            const nextTokens = tokens.filter((_, tokenIndex) => tokenIndex !== index);
            if (nextTokens.length > 0) {
                uniqueTerms.add(nextTokens.join(' '));
            }
            return;
        }

        const variants = HEADWORD_TOKEN_VARIANTS[token];
        if (!variants || variants.length === 0) return;

        variants.forEach((variant) => {
            const nextTokens = [...tokens];
            nextTokens[index] = variant;
            uniqueTerms.add(nextTokens.join(' '));
        });
    });

    return Array.from(uniqueTerms)
        .map((item) => item.trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
};

export const getHeadwordHighlightTerms = (headword: string): string[] => expandHighlightTerms(headword);
