interface WordDetailsPromptOptions {
    includePronunciation?: boolean;
    includeMeaning?: boolean;
    meaningLanguage?: 'vi' | 'en';
    includeExamples?: boolean;
    collocationCount?: number;
    includeParaphrases?: boolean;
    includeIdioms?: boolean;
    exampleCount?: number;
    includePrepositions?: boolean;
    locale?: 'default' | 'japanese';
}

export function getWordDetailsPrompt(
    words: string[],
    nativeLanguage: string = 'Vietnamese',
    options: WordDetailsPromptOptions = {}
): string {
    const wordList = words.map((word) => `"${word}"`).join(', ');
    const includePronunciation = options.includePronunciation !== false;
    const includeMeaning = options.includeMeaning !== false;
    const meaningLanguage = options.meaningLanguage || 'vi';
    const includeExamples = options.includeExamples !== false;
    const collocationCount = Math.max(0, Math.min(5, options.collocationCount ?? 3));
    const includeParaphrases = options.includeParaphrases !== false;
    const includeIdioms = options.includeIdioms === true;
    const exampleCount = Math.max(1, Math.min(3, options.exampleCount ?? 1));
    const includePrepositions = options.includePrepositions !== false;
    const meaningFieldLanguage = meaningLanguage === 'en' ? 'English' : 'Vietnamese';
    const locale = options.locale === 'japanese' ? 'japanese' : 'default';
    const isJapaneseLocale = locale === 'japanese';

    const pronunciationOptimizationRule = includePronunciation
        ? (isJapaneseLocale
            ? '- For Japanese entries, use "ipa_us" as the reading written ONLY in Hiragana. Do not use IPA symbols, katakana, romaji, or slashes. Copy the same Hiragana reading into "ipa_uk" only when needed; otherwise omit "ipa_uk" and set "pron_sim" to "same".'
            : '- Omit "ipa_uk" if "pron_sim" is "same".')
        : '- Do NOT output "ipa_us", "ipa_uk", or "pron_sim".';
    const pronunciationFieldDefinitions = includePronunciation
        ? (isJapaneseLocale
            ? `- ipa_us: Japanese reading written ONLY in Hiragana.
    - ipa_uk: Optional duplicate Hiragana reading when needed. Usually omit it when the reading is identical.
    - pron_sim: For Japanese entries, set to "same".`
            : `- ipa_us: Primary IPA transcription (General American).
    - ipa_uk: Received Pronunciation (UK) IPA. (Omit if "pron_sim" is "same").
    - pron_sim: Similarity between US and UK pronunciation. MUST be: "same", "near", or "different".`)
        : '';
    const pronunciationExampleBlock = includePronunciation
        ? (isJapaneseLocale
            ? `      "ipa_us": "しあわせ",
      "pron_sim": "same",`
            : `      "ipa_us": "/ʌnˈhæpi/",
      "pron_sim": "same",`)
        : '';
    const fieldDefinitions = [
        `- og: The EXACT string from the input list. (Include ONLY if different from "hw").`,
        `- hw: The headword (Full phrase for expressions; base form for single words).`,
        pronunciationFieldDefinitions,
        includeMeaning ? `- m: Definition of the headword in ${meaningFieldLanguage}.` : '',
        `- reg: Register. MUST be ONLY one of: "academic", "casual", "neutral" (mix of academic and casual).`,
        includeExamples ? `- ex: ${exampleCount} high-quality example sentence${exampleCount > 1 ? 's' : ''} using the headword. If more than one example, return them in one string separated by newline.${isJapaneseLocale ? ' MUST be written in natural Japanese.' : ''}` : '',
        collocationCount > 0
            ? `- col: up to ${collocationCount} most common, natural collocations, cover IELTS topics, if exist.
        - Items: {"text": "natural collocation", "d": "minimal descriptive cue for recall (5-10 words)"}.
        - Collocations must include the headword, combined with natural co-occurring words
        - Inflections or word-family forms of headword are allowed (e.g., plural, V-ed, V-ing)
        - Do not replace the headword with paraphrases${isJapaneseLocale ? '\n        - For Japanese entries, both "text" and "d" MUST be in Japanese.' : ''}`
            : '',
        includeIdioms
            ? `- idm: Array of idioms containing the headword when natural. Items: {"text": "phrase", "d": "descriptive cue"}.`
            : '',
        includePrepositions
            ? `- prep: Array of dependent prepositions.
        - Format: [{"p": "preposition", "c": "short usage example"}].
        - Every item MUST include BOTH "p" and "c".
        - The usage example in "c" MUST explicitly contain the exact same preposition "p". Example: if "p" = "against", then "c" must contain "against".${isJapaneseLocale ? '\n        - For Japanese entries, use Japanese particles/postpositions and write both "p" and "c" in Japanese.' : ''}`
            : '',
        includeParaphrases
            ? `- para: Controlled paraphrase system.
        - Each item MUST be an object: {"w": "word_or_phrase", "t": "tone_type", "c": "recall cue"}.
        - 'w': ONLY generate paraphrased text if a natural equivalent exists.
        - 't' (tone) MUST be ONLY one of: "academic", "casual", "neutral" (fit both academic and casual). NEVER output any other tone labels.
        - 'c' (context) = a short (2-5 words) situational recall cue (e.g., "job interview", "arguing with friend").
        - Do NOT generate 'para' (paraphrase) for orthographic variants (e.g., space vs no space, hyphen vs no hyphen).${isJapaneseLocale ? '\n        - For Japanese entries, both "w" and "c" MUST be in Japanese.' : ''}`
            : '',
        `- type: MUST be one of: "idiom", "phrasal_verb", "collocation", "phrase", "vocabulary", "irregular_verb".`,
        `- is_pas: Boolean. True if the word is "Passive" (vulgar, slang, or should be archived).`
    ].filter(Boolean).join('\n');
    const responseExampleLines = [
        `      "hw": "unhappy",`,
        pronunciationExampleBlock,
        includeMeaning ? `      "m": "${isJapaneseLocale ? 'しあわせではない' : (meaningLanguage === 'en' ? 'not happy' : 'không vui')}",` : '',
        `      "reg": "neutral",`,
        includeExamples ? `      "ex": ${exampleCount > 1 ? (isJapaneseLocale ? `"会議のあと、彼女はしあわせそうではなかった。\\n結果を聞いて、彼はしあわせではなかった。",` : `"She was unhappy after the meeting.\\nHe felt unhappy about the result.",`) : (isJapaneseLocale ? `"会議のあと、彼女はしあわせそうではなかった。",` : `"She was unhappy after the meeting.",`)}` : '',
        collocationCount > 0
            ? `      "col": [{"text": "${isJapaneseLocale ? 'しあわせな 生活' : 'deeply unhappy'}", "d": "${isJapaneseLocale ? '前向きで明るい暮らし' : 'extreme sadness about a life event'}"}],`
            : '',
        includeIdioms
            ? `      "idm": [{"text": "not a happy camper", "d": "clearly annoyed or upset"}],`
            : '',
        includePrepositions
            ? `      "prep": [{"p": "${isJapaneseLocale ? 'に' : 'with'}", "c": "${isJapaneseLocale ? '変化に 強い' : 'unhappy with the service'}"}],`
            : '',
        includeParaphrases
            ? `      "para": [{"w": "${isJapaneseLocale ? 'うれしくない' : 'miserable'}", "t": "neutral", "c": "${isJapaneseLocale ? '気分が沈む' : 'feeling very bad'}"}],`
            : '',
        `      "type": "vocabulary",`,
        `      "is_pas": false`
    ].filter(Boolean).join('\n');

    return `You are an expert ${isJapaneseLocale ? 'Japanese vocabulary coach and lexicography assistant' : 'IELTS coach, examiner, and native English speaker'}.

Analyze this list of vocabulary items: [${wordList}].

HEADWORD (hw) RULES:
    - Phrase/idiom → keep the EXACT full phrase (no reduction)
    - Single word → convert to base form (singular)
    - All fields (meaning, IPA, examples) must match the headword
    - If adverb → use its base adjective as headword

LANGUAGE:
    - ${isJapaneseLocale
        ? `Use natural Japanese for example, collocation hint, paraphrase text/context, and preposition usage.${includeMeaning ? ` Field "m" must still be in ${meaningFieldLanguage}.` : ''}`
        : `Use English for all fields${includeMeaning ? ` except "m", which must be in ${meaningFieldLanguage}` : ''}.`}

${pronunciationOptimizationRule}

FIELD DEFINITIONS:
${fieldDefinitions}

    Response Example (Return in code block format Strict JSON Array):
    [{
${responseExampleLines}
    }]`;
}
