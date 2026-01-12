export function getWordRegisterPrompt(words: string[]): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

    return `You are an expert linguist specializing in English for Academic Purposes.
    
    Analyze the register of the following vocabulary items: [${wordList}].

    For each item, classify its typical usage context. The classification MUST be one of three values:
    - "academic": Commonly used in formal, academic, or technical writing/speaking.
    - "casual": Commonly used in informal, conversational, or colloquial settings.
    - "neutral": Can be used in both formal and informal contexts without sounding out of place.

    Return your analysis as a strict JSON array of objects. Each object must contain the original word and its register classification. Do not return any other fields.

    Response Example (Strict JSON Array):
    [
      {
        "word": "ubiquitous",
        "register": "academic"
      },
      {
        "word": "get over",
        "register": "casual"
      },
      {
        "word": "important",
        "register": "neutral"
      }
    ]`;
}
