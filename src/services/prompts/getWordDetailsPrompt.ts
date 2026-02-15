
export function getWordDetailsPrompt(words: string[], nativeLanguage: string = 'Vietnamese'): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

    return `You are an expert IELTS coach, examiner, and native English speaker.
    
    Analyze this list of vocabulary items: [${wordList}].

    IMPORTANT RULES FOR HEADWORD (hw) IDENTIFICATION:
    1. FOR PHRASES/IDIOMS/EXPRESSIONS: If the input is a multi-word unit (e.g., "cut the road", "break the ice", "get over"), the headword (hw) MUST be the EXACT phrase provided. DO NOT reduce it to a single word (e.g., do NOT return "cut" for "cut the road").
    2. FOR SINGLE WORDS: If the input is a single inflected word, identify its base form and ensure it is in SINGULAR form (e.g., "running" -> "run", "cities" -> "city", "problems" -> "problem").
    3. All details (meaning, IPA, examples) MUST correspond to the identified headword (the whole phrase or the base word).
    4. If input has multiple distinct meanings as a phrase vs a single word, prioritize the meaning of the input as provided.

    LANGUAGE RULES:
    - All content in English, except "m" (Meaning) which must be in ${nativeLanguage}.

    FIELD GENERATION RULES:
    - If the headword (hw) is a PHRASE, PHRASAL VERB, or IDIOM (e.g., "break the ice"):
      - DO NOT generate 'fam' (word family). Return an empty object {} or null.
      - DO NOT generate 'col' (collocations). Return an empty array [].
    - Other fields should be generated as normal.

    FIELD DEFINITIONS:
    - og: The EXACT string from the input list.
    - hw: The headword (Full phrase for expressions; base form for single words).
    - ipa: The primary IPA transcription.
    - ipa_m: 2-4 common mispronunciations.
    - m: Definition of the headword in ${nativeLanguage}.
    - reg: The word's register. MUST be one of: "academic", "casual", or "neutral".
    - ex: A high-quality example sentence using the headword.
    - col: Array of 3-5 essential collocations. ONLY for single-word headwords. Each item MUST be an object: {"text": "the collocation phrase", "d": "minimal descriptive cue that helps recall the colocation, limit to 5 - 10 words. This field is REQUIRED."}.
    - idm: Array of 1-3 common idioms containing the headword (only if hw is a single word). Each item MUST be an object: {"text": "the idiom phrase", "d": "minimal descriptive cue for recall, 5-10 words. This field is REQUIRED."}.
    - prep: Array of dependent prepositions. Format: [{"p": "preposition", "c": "short usage example"}].
    - para: List of synonyms/paraphrases. Generate a variety of tones, but max 6-8 items total.
        - 't' = tone. MUST be one of: "intensified", "softened", "synonym", "academic", "casual", "idiomatic".
        - "intensified": A word with a stronger meaning (e.g., for 'happy', return 'ecstatic').
        - "softened": A word with a weaker/milder meaning (e.g., for 'furious', return 'annoyed').
        - "synonym": A neutral synonym with a similar meaning.
        - "academic": A formal or academic equivalent.
        - "casual": An informal or conversational equivalent.
        - "idiomatic": A related idiom or figurative phrase.
        - 'c' = short context where the paraphrase would be used.
    - fam: Word family. ONLY for single-word headwords. 'n'=nouns, 'v'=verbs, 'j'=adjectives, 'adv'=adverbs. Format: [{"w": "word"}]. DO NOT include IPA.
    - is_pas: True if vulgar/slang.
    - is_pron: True if it's a pronunciation trap.
    - is_id: True if it's an Idiom.
    - is_pv: True if it's a Phrasal Verb.
    - is_col: True if it's a Collocation.
    - is_phr: True if it's a fixed Standard Phrase/Expression.
    - is_irr: True if it's an Irregular verb (single words only).

    EXAMPLES:
    - Input "cut the road" -> hw: "cut the road", m: "mở đường", is_phr: true, fam: null, col: [].
    - Input "better late than never" -> hw: "better late than never", is_id: true, fam: null, col: [].
    - Input "implications" -> hw: "implication", m: "hệ quả", fam: { n: [{"w": "implication"}], v: [{"w": "imply"}] }.

    Response Example (Strict JSON Array):
    [{
      "og": "input_string",
      "hw": "headword_or_full_phrase",
      "ipa": "/ipa/",
      "ipa_m": ["wrong1", "wrong2"],
      "m": "meaning in ${nativeLanguage}",
      "reg": "academic",
      "ex": "Example sentence.",
      "col": [{"text": "heavy rain", "d": "when it is raining a lot"}],
      "idm": [],
      "prep": [], 
      "para": [{ "w": "synonym", "t": "academic", "c": "context" }],
      "is_id": false, "is_pv": false, "is_col": false, "is_phr": true, "is_irr": false,
      "is_pas": false, "is_pron": false,
      "fam": null
    }]`;
}
