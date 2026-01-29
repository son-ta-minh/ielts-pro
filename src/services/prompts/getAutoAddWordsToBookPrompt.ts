export function getAutoAddWordsToBookPrompt(topic: string, existingWords: string[], userRequest: string): string {
    const existingList = existingWords.join(', ');

    return `You are an expert IELTS coach and vocabulary curator.
    
    TASK: Generate new vocabulary items for an existing Word Book based on a user's request.

    CONTEXT:
    - Word Book Topic: "${topic}"
    - Words Already in the Book (DO NOT REPEAT THESE): [${existingList}]

    USER REQUEST: "${userRequest || 'Suggest 5-10 more relevant words.'}"

    INSTRUCTIONS:
    1.  Analyze the topic, the existing words, and the user's request.
    2.  Generate a list of NEW, high-value vocabulary items (words or short phrases) that fit the request and topic.
    3.  You MUST NOT include any of the words from the "Words Already in the Book" list.
    4.  For each new word, provide a very concise, easy-to-understand definition in English.
    
    STRICT JSON OUTPUT FORMAT:
    Return a single JSON array of objects. Do not include any text outside the JSON block.

    [
      {
        "word": "string (The new word)",
        "definition": "string (The concise definition)"
      },
      {
        "word": "string (Another new word)",
        "definition": "string (Its definition)"
      }
    ]
    `;
}