export function getIpaAccentsPrompt(words: string[]): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

    return `You are an expert linguist specializing in English phonetics.
    
    Analyze the following vocabulary items: [${wordList}].

    For each item, provide:
    1. The International Phonetic Alphabet (IPA) transcription for both General American (US) and Received Pronunciation (UK) English.
    2. A pronunciation similarity classification ("pron_sim").

    - If an item does not have a distinct pronunciation for one accent, you can omit that field or provide the same IPA as the other. In this case, "pron_sim" should be "same".
    - Focus on the most common pronunciation for each accent.
    - "pron_sim" MUST be one of three values:
      - "same": The pronunciations are practically identical or indistinguishable to a non-expert listener.
      - "near": There are slight, noticeable differences in vowels or stress that an accent learner should be aware of, but comprehension is not typically affected.
      - "different": The differences are significant (e.g., major vowel shifts, different stress patterns, or added/omitted syllables) and could potentially lead to misunderstanding or sound very distinct.

    Return in code block format your analysis as a strict JSON array of objects. Each object MUST contain the original word ("og"), may contain "ipa_us" and "ipa_uk", and MUST contain the "pron_sim" field. Do not return any other fields.

    Response Example (Strict JSON Array):
    [
      {
        "og": "specialty",
        "ipa_us": "/ˈspɛʃəlti/",
        "ipa_uk": "/ˈspɛʃiæləti/",
        "pron_sim": "different"
      },
      {
        "og": "get over",
        "ipa_us": "/ɡɛt ˈoʊvər/",
        "ipa_uk": "/ɡɛt ˈəʊvə/",
        "pron_sim": "near"
      },
      {
        "og": "important",
        "ipa_us": "/ɪmˈpɔːrtənt/",
        "ipa_uk": "/ɪmˈpɔːtənt/",
        "pron_sim": "same"
      }
    ]`;
}
