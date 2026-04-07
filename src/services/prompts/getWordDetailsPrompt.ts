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
    const meaningFieldLanguage = meaningLanguage === 'en' ? 'English' : nativeLanguage;

    const pronunciationOptimizationRule = includePronunciation
        ? '- Omit "ipa_uk" if "pron_sim" is "same".'
        : '- Do NOT output "ipa_us", "ipa_uk", or "pron_sim".';
    const pronunciationFieldDefinitions = includePronunciation
        ? `- ipa_us: Primary IPA transcription (General American).
    - ipa_uk: Received Pronunciation (UK) IPA. (Omit if "pron_sim" is "same").
    - pron_sim: Similarity between US and UK pronunciation. MUST be: "same", "near", or "different".`
        : '';
    const pronunciationExampleBlock = includePronunciation
        ? `      "ipa_us": "/ʌnˈhæpi/",
      "pron_sim": "same",`
        : '';
    const fieldDefinitions = [
        `- og: The EXACT string from the input list. (Include ONLY if different from "hw").`,
        `- hw: The headword (Full phrase for expressions; base form for single words).`,
        pronunciationFieldDefinitions,
        includeMeaning ? `- m: Definition of the headword in ${meaningFieldLanguage}.` : '',
        `- reg: Register. MUST be ONLY one of: "academic", "casual", "neutral" (mix of academic and casual).`,
        includeExamples ? `- ex: ${exampleCount} high-quality example sentence${exampleCount > 1 ? 's' : ''} using the headword. If more than one example, return them in one string separated by newline.` : '',
        collocationCount > 0
            ? `- col: up to ${collocationCount} most common, natural collocations, cover IELTS topics, if exist.
        - Items: {"text": "natural collocation", "d": "minimal descriptive cue for recall (5-10 words)"}.
        - Collocations must include the headword, combined with natural co-occurring words
        - Inflections or word-family forms of headword are allowed (e.g., plural, V-ed, V-ing)
        - Do not replace the headword with paraphrases`
            : '',
        includeIdioms
            ? `- idm: Array of idioms containing the headword when natural. Items: {"text": "phrase", "d": "descriptive cue"}.`
            : '',
        includePrepositions
            ? `- prep: Array of dependent prepositions.
        - Format: [{"p": "preposition", "c": "short usage example"}].
        - Every item MUST include BOTH "p" and "c".
        - The usage example in "c" MUST explicitly contain the exact same preposition "p". Example: if "p" = "against", then "c" must contain "against".`
            : '',
        includeParaphrases
            ? `- para: Controlled paraphrase system.
        - Each item MUST be an object: {"w": "word_or_phrase", "t": "tone_type", "c": "recall cue"}.
        - 'w': ONLY generate paraphrased text if a natural equivalent exists.
        - 't' (tone) MUST be ONLY one of: "academic", "casual", "neutral" (fit both academic and casual). NEVER output any other tone labels.
        - 'c' (context) = a short (2-5 words) situational recall cue (e.g., "job interview", "arguing with friend").
        - Do NOT generate 'para' (paraphrase) for orthographic variants (e.g., space vs no space, hyphen vs no hyphen).`
            : '',
        `- type: MUST be one of: "idiom", "phrasal_verb", "collocation", "phrase", "vocabulary", "irregular_verb".`,
        `- is_pas: Boolean. True if the word is "Passive" (vulgar, slang, or should be archived).`
    ].filter(Boolean).join('\n');
    const responseExampleLines = [
        `      "hw": "unhappy",`,
        pronunciationExampleBlock,
        includeMeaning ? `      "m": "${meaningLanguage === 'en' ? 'not happy' : 'không vui'}",` : '',
        `      "reg": "neutral",`,
        includeExamples ? `      "ex": ${exampleCount > 1 ? `"She was unhappy after the meeting.\\nHe felt unhappy about the result.",` : `"She was unhappy after the meeting.",`}` : '',
        collocationCount > 0
            ? `      "col": [{"text": "deeply unhappy", "d": "extreme sadness about a life event"}],`
            : '',
        includeIdioms
            ? `      "idm": [{"text": "not a happy camper", "d": "clearly annoyed or upset"}],`
            : '',
        includePrepositions
            ? `      "prep": [{"p": "with", "c": "unhappy with the service"}],`
            : '',
        includeParaphrases
            ? `      "para": [{"w": "miserable", "t": "neutral", "c": "feeling very bad"}],`
            : '',
        `      "type": "vocabulary",`,
        `      "is_pas": false`
    ].filter(Boolean).join('\n');

    return `You are an expert IELTS coach, examiner, and native English speaker.

Analyze this list of vocabulary items: [${wordList}].

HEADWORD (hw) RULES:
    - Phrase/idiom → keep the EXACT full phrase (no reduction)
    - Single word → convert to base form (singular)
    - All fields (meaning, IPA, examples) must match the headword
    - If adverb → use its base adjective as headword

LANGUAGE:
    - Use English for all fields${includeMeaning ? ` except "m", which must be in ${meaningFieldLanguage}` : ''}.

${pronunciationOptimizationRule}

FIELD DEFINITIONS:
${fieldDefinitions}

    Response Example (Return in code block format Strict JSON Array):
    [{
${responseExampleLines}
    }]`;
}
