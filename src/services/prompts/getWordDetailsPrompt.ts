export function getWordDetailsPrompt(words: string[], nativeLanguage: string = 'Vietnamese'): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

    return `You are an expert IELTS coach, examiner, and native English speaker.
    
    Analyze this list of vocabulary items: [${wordList}].

    IMPORTANT RULES FOR HEADWORD (hw) IDENTIFICATION:
    1. Preserve the original word count of the input. Normalize only grammatical form (base form, singular/plural); never remove or reduce words.
       For example:
       - DO NOT return "cut" for "cut the road"
       - Normalize "running" -> "run", "cities" -> "city"
    2. All details (meaning, IPA, examples) MUST correspond to the identified normalized headword.
    3. If input has multiple distinct meanings as a phrase vs a single word, prioritize the meaning of the input as provided.

    LANGUAGE RULES:
    - All content in English, except "m" (Meaning) which must be in ${nativeLanguage}.

    FIELD GENERATION RULES:
    - If the headword (hw) is a PHRASE, PHRASAL VERB, or IDIOM:
      - DO NOT generate 'fam' (word family). Return an empty object {} or null.
      - DO NOT generate 'col' (collocations). Return an empty array [].
    - Other fields should be generated as normal.

    FIELD DEFINITIONS:
    - og: The EXACT string from the input list.
    - hw: The headword (Full phrase for expressions; base form for single words).
    - ipa: The primary IPA transcription (default to US).
    - ipa_us: IPA for General American accent.
    - ipa_uk: IPA for Received Pronunciation.
    - pron_sim: Pronunciation similarity. MUST be one of: "same", "near", "different".
    - ipa_m: 2-4 common mispronunciations.
    - m: Definition of the headword in ${nativeLanguage}.
    - reg: The word's register. MUST be one of: "academic", "casual", or "neutral".
    - ex: A high-quality example sentence using the headword.
    - col: Array of 3-5 essential collocations. ONLY for single-word headwords.
    - idm: Array of 1-3 common idioms containing the headword (only if hw is a single word).
    - prep: Array of dependent prepositions. Format: [{"p": "preposition", "c": "short usage example"}].
    - para: List of synonyms/paraphrases. Generate a variety of tones, but max 6-8 items total.
        - 't' = tone. MUST be one of: "intensified", "softened", "synonym", "academic", "casual"
        - 'c' = short context where the paraphrase would be used.
    - fam: Word family. ONLY for single-word headwords. 'n'=nouns, 'v'=verbs, 'j'=adjectives, 'adv'=adverbs. Format: [{"w": "word", "i": "/US IPA/"}].
    - is_pas: True if vulgar, slang, profanity, or archaic.
    - is_pron: True if it's a pronunciation trap.
    - is_id: True if it's an Idiom.
    - is_pv: True if it's a Phrasal Verb.
    - is_col: True if it's a Collocation.
    - is_phr: True if it's a fixed Standard Phrase/Expression.
    - is_irr: True if it's an Irregular verb (single words only).
    - tags: 3-5 IELTS topic tags.

    EXAMPLES:
    - Input "cut the road" -> hw: "cut the road", m: "mở đường", is_phr: true, fam: null, col: [].
    - Input "better late than never" -> hw: "better late than never", is_id: true, fam: null, col: [].
    - Input "implications" -> hw: "implication", m: "hệ quả", fam: { n: [{"w": "implication", "i": "/ˌɪmplɪˈkeɪʃən/"}], v: [{"w": "imply", "i": "/ɪmˈplaɪ/"}] }.

    Response Example (Strict JSON Array):
    [{
      "og": "input_string",
      "hw": "headword_or_full_phrase",
      "ipa": "/ipa_us/",
      "ipa_us": "/ipa_us/",
      "ipa_uk": "/ipa_uk/",
      "pron_sim": "near",
      "ipa_m": ["wrong1", "wrong2"],
      "m": "meaning in ${nativeLanguage}",
      "reg": "academic",
      "ex": "Example sentence.",
      "col": [],
      "idm": [],
      "prep": [{"p": "on", "c": "rely on someone"}], 
      "para": [{ "w": "synonym", "t": "academic", "c": "context" }],
      "is_id": false, "is_pv": false, "is_col": false, "is_phr": true, "is_irr": false,
      "v2": null, "v3": null,
      "is_pas": false,
      "is_pron": false,
      "tags": ["topic"],
      "fam": null
    }]`;
}