interface WordDetailsPromptOptions {
    includePronunciation?: boolean;
}

export function getWordDetailsPrompt(
    words: string[],
    nativeLanguage: string = 'Vietnamese',
    options: WordDetailsPromptOptions = {}
): string {
    const wordList = words.map(w => `"${w}"`).join(', ');
    const includePronunciation = options.includePronunciation !== false;
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

    return `You are an expert IELTS coach, examiner, and native English speaker.
    
    Analyze this list of vocabulary items: [${wordList}].

    HEADWORD (hw) RULES:
    - Phrase/idiom → keep the EXACT full phrase (no reduction)
    - Single word → convert to base form (singular)
    - All fields (meaning, IPA, examples) must match the headword
    - If adverb → use its base adjective as headword

    LANGUAGE:
    - Use English for all fields except "m", which must be in ${nativeLanguage}

    ${pronunciationOptimizationRule}

    FIELD DEFINITIONS:
    - og: The EXACT string from the input list. (Include ONLY if different from "hw").
    - hw: The headword (Full phrase for expressions; base form for single words).
    ${pronunciationFieldDefinitions}
    - m: Definition of the headword in ${nativeLanguage}.
    - reg: Register. MUST be ONLY one of: "academic", "casual", "neutral" (mix of academic and casual).
    - ex: A high-quality IELTS example sentence using the headword.
    - col: up to 5 most common, natural collocations if exist; if none → [].
        - Items: {"text": "natural collocation", "d": "minimal descriptive cue for recall (5-10 words)"}.
        - Collocations must include the headword, combined with natural co-occurring words
        - Inflections or word-family forms of headword are allowed (e.g., plural, V-ed, V-ing)
        - Do not replace the headword with paraphrases
    - idm: Array of 1-3 common idioms containing the headword (only if hw is a single word). Items: {"text": "phrase", "d": "descriptive cue"}.
    - prep: Array of dependent prepositions.
        - If the headword does NOT take a fixed preposition, return an empty array [].
        - Format: [{"p": "preposition", "c": "short usage example"}].
        - Every item MUST include BOTH "p" and "c".
        - The usage example in "c" MUST explicitly contain the exact same preposition "p". Example: if "p" = "against", then "c" must contain "against".
    - para: Controlled paraphrase system (max 1 item per tone type).
        - Each item MUST be an object: {"w": "word_or_phrase", "t": "tone_type", "c": "recall cue"}.
        - 'w': ONLY generate paraphrased text if a natural equivalent exists. Try to force all tone types but avoid unnatural versions.
        - 't' (tone) MUST be ONLY one of: "academic", "casual", "neutral" (fit both academic and casual). NEVER output any other tone labels.
        - 'c' (context) = a short (2-5 words) situational recall cue (e.g., "job interview", "arguing with friend").
        - Do NOT generate 'para' (paraphrase) for orthographic variants (e.g., space vs no space, hyphen vs no hyphen).

    - type: MUST be one of: "idiom", "phrasal_verb", "collocation", "phrase", "vocabulary", "irregular_verb".
    - is_pas: Boolean. True if the word is "Passive" (vulgar, slang, or should be archived).

    Response Example (Return in code block format Strict JSON Array):
    [{
      "hw": "unhappy",
${pronunciationExampleBlock}
      "m": "không vui",
      "reg": "neutral",
      "ex": "She was unhappy",
      "col": [{"text": "deeply unhappy", "d": "extreme sadness about a life event"}],
      "idm": [],
      "prep": [{"p": "with", "c": "unhappy with the service"}], 
      "para": [
        { "w": "dissatisfied", "t": "academic", "c": "complaining about product quality" },
        { "w": "miserable", "t": "neutral", "c": "sitting alone in the rain" }
      ],
      "type": "vocabulary",
      "is_pas": false
    }]`;
}
