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

    IMPORTANT RULES FOR HEADWORD (hw) IDENTIFICATION:
    1. FOR PHRASES/IDIOMS/EXPRESSIONS: If the input is a multi-word unit (e.g., "cut the road", "break the ice", "get over"), the headword (hw) MUST be the EXACT phrase provided. DO NOT reduce it to a single word.
    2. FOR SINGLE WORDS: If the input is a single inflected word, identify its base form and ensure it is in SINGULAR form (e.g., "running" -> "run", "cities" -> "city", "problems" -> "problem").
    3. All details (meaning, IPA, examples) MUST correspond to the identified headword (the whole phrase or the base word).
    4. If input has multiple distinct meanings as a phrase vs a single word, prioritize the meaning of the input as provided.
    5. If input is adverb, use the base adjective as headword.

    LANGUAGE RULES:
    - All content in English, except "m" (Meaning) which must be in ${nativeLanguage}.

    FIELD GENERATION RULES:
    - If the headword (hw) is a PHRASE, PHRASAL VERB, or IDIOM (e.g., "break the ice"):
      - DO NOT generate 'col' (collocations). Return an empty array [].
    - A-MUST / IMPORTANT:
      - 'reg' MUST be ONLY one of: "academic", "casual", "neutral".
      - NEVER output any other register label such as "formal", "informal", "synonym", "professional", or "general".
    - A-MUST / IMPORTANT:
      - If the headword (hw) is a SINGLE WORD, 'col' MUST NOT be empty.
      - For SINGLE-WORD headwords, always return at least 3 collocations in 'col'.
      - Collocations should be natural and tightly related to the headword, but they do NOT need to literally contain the exact headword string.
    - A-MUST / IMPORTANT:
      - In 'para', 't' (tone) MUST be ONLY one of: "academic", "casual", "synonym".
      - NEVER output any other tone labels.
    - A-MUST / IMPORTANT:
      - In 'prep', every usage/context example MUST explicitly contain the exact same preposition "p".
      - Example: if "p" is "against", then "c" MUST contain the word "against".
      - 'prep' items MUST include BOTH fields: "p" and "c". NEVER return only the preposition without context.
      - If there is no natural dependent preposition with a usable context/example, return [].
      - Do NOT paraphrase or omit the preposition inside the usage/context field.
    - Do NOT generate 'para' (paraphrase) for orthographic variants (e.g., space vs no space, hyphen vs no hyphen).

    RESPONSE OPTIMIZATION:
    - Omit "og" if it is identical to "hw".
    ${pronunciationOptimizationRule}

    FIELD DEFINITIONS:
    - og: The EXACT string from the input list. (Include ONLY if different from "hw").
    - hw: The headword (Full phrase for expressions; base form for single words).
    ${pronunciationFieldDefinitions}
    - m: Definition of the headword in ${nativeLanguage}.
    - reg: Register. A-MUST / IMPORTANT: MUST be ONLY one of: "academic", "casual", or "neutral". NEVER output any other register label.
    - ex: A high-quality example sentence using the headword.
    - col: Array of 3-5 collocations. ONLY for single-word headwords. A-MUST / IMPORTANT: for every single-word headword, "col" MUST NOT be empty. Each "text" should be a natural collocation strongly associated with the headword. It does NOT need to literally contain the headword string. Do NOT return loose synonyms or unrelated standalone words. Items: {"text": "natural collocation", "d": "minimal descriptive cue for recall (5-10 words)"}.
    - idm: Array of 1-3 common idioms containing the headword (only if hw is a single word). Items: {"text": "phrase", "d": "descriptive cue"}.
    - prep: Array of dependent prepositions. If the headword does NOT take a fixed preposition, return an empty array []. Format: [{"p": "preposition", "c": "short usage example"}]. A-MUST / IMPORTANT: every item MUST include BOTH "p" and "c". The usage example in "c" MUST explicitly contain the exact same preposition "p". Example: if "p" = "against", then "c" must contain "against".
    - para: Controlled paraphrase system (max 5 items total). ONLY generate categories if a natural equivalent exists. Try to force all tone types but avoid unnatural versions.        - Each item MUST be an object: {"w": "word_or_phrase", "t": "tone_type", "c": "recall cue"}.
        - A-MUST / IMPORTANT: 't' (tone) MUST be ONLY one of: "academic", "casual", "synonym"
        - NEVER output any other tone label
        - 'c' (context) = a short (2-5 words) situational recall cue (e.g., "job interview", "arguing with friend").
    - type: The grammatical classification. MUST be one of: "idiom", "phrasal_verb", "collocation", "phrase", "vocabulary", "irregular_verb".
    - is_pas: Boolean. True if the word is "Passive" (vulgar, slang, or should be archived).

    Response Example (Return in code block format Strict JSON Array):
    [{
      "hw": "unhappy",
${pronunciationExampleBlock}
      "m": "không vui, buồn",
      "reg": "neutral",
      "ex": "She was unhappy with the results of the experiment.",
      "col": [{"text": "deeply unhappy", "d": "extreme sadness about a life event"}],
      "idm": [],
      "prep": [{"p": "with", "c": "unhappy with the service"}], 
      "para": [
        { "w": "dissatisfied", "t": "academic", "c": "complaining about product quality" },
        { "w": "miserable", "t": "synonym", "c": "sitting alone in the rain" }
      ],
      "type": "vocabulary",
      "is_pas": false
    }]`;
}
