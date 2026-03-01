export function getWordDetailsPrompt(words: string[], nativeLanguage: string = 'Vietnamese'): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

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
      - DO NOT generate 'fam' (word family). Return an empty object {} or null.
      - DO NOT generate 'col' (collocations). Return an empty array [].
    - Do NOT generate 'para' (paraphrase) for orthographic variants (e.g., space vs no space, hyphen vs no hyphen).

    RESPONSE OPTIMIZATION:
    - Omit "og" if it is identical to "hw".
    - Omit "ipa_uk" if "pron_sim" is "same".

    FIELD DEFINITIONS:
    - og: The EXACT string from the input list. (Include ONLY if different from "hw").
    - hw: The headword (Full phrase for expressions; base form for single words).
    - ipa_us: Primary IPA transcription (General American).
    - ipa_uk: Received Pronunciation (UK) IPA. (Omit if "pron_sim" is "same").
    - pron_sim: Similarity between US and UK pronunciation. MUST be: "same", "near", or "different".
    - ipa_m: Array of 2-4 common mispronunciation transcriptions (to test the user).
    - m: Definition of the headword in ${nativeLanguage}.
    - reg: Register. MUST be one of: "academic", "casual", or "neutral".
    - ex: A high-quality example sentence using the headword.
    - col: Array of 3-5 collocations. ONLY for single-word headwords. Items: {"text": "phrase", "d": "minimal descriptive cue for recall (5-10 words)"}.
    - idm: Array of 1-3 common idioms containing the headword (only if hw is a single word). Items: {"text": "phrase", "d": "descriptive cue"}.
    - prep: Array of dependent prepositions. If the headword does NOT take a fixed preposition, return an empty array []. Format: [{"p": "preposition", "c": "short usage example"}].
    - para: Controlled paraphrase system (max 5 items total). ONLY generate categories if a natural equivalent exists. Try to force all tone types but avoid unnatural versions.        - Each item MUST be an object: {"w": "word_or_phrase", "t": "tone_type", "c": "recall cue"}.
        - 't' (tone) MUST be one of: "academic", "casual", "synonym" (no hypernyms or hyponyms)
        - 'c' (context) = a short (2-5 words) situational recall cue (e.g., "job interview", "arguing with friend").
    - fam: Word family. ONLY for single-word headwords. 'n'=nouns, 'v'=verbs, 'j'=adjectives, 'adv'=adverbs. Format: [{"w": "word"}].
    - type: The grammatical classification. MUST be one of: "idiom", "phrasal_verb", "collocation", "phrase", "vocabulary", "irregular_verb".
    - is_pas: Boolean. True if the word is "Passive" (vulgar, slang, or should be archived).

    Response Example (Return in code block format Strict JSON Array):
    [{
      "hw": "unhappy",
      "ipa_us": "/ʌnˈhæpi/",
      "pron_sim": "same",
      "ipa_m": ["/ʌnˈhepi/"],
      "m": "không vui, buồn",
      "reg": "neutral",
      "ex": "She was unhappy with the results of the experiment.",
      "col": [{"text": "deeply unhappy", "d": "extreme sadness about a life event"}],
      "idm": [],
      "prep": [{"p": "with", "c": "unhappy with the service"}], 
      "para": [
        { "w": "dissatisfied", "t": "academic", "c": "complaining about product quality" },
        { "w": "miserable", "t": "intensified", "c": "sitting alone in the rain" }
      ],
      "type": "vocabulary",
      "is_pas": false,
      "fam": { "n": [{"w": "unhappiness"}], "adv": [{"w": "unhappily"}] }
    }]`;
}