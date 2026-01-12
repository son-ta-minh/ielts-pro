
export function getWordTypePrompt(words: string[]): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

    return `You are an expert linguist and IELTS examiner. Your task is to classify a list of English vocabulary items based on their grammatical and semantic structure.

Analyze this list: [${wordList}].

For each item, you MUST classify it into ONE of the following types based on these strict rules:

1.  **is_idiom (Idiom)**:
    - A multi-word expression where the meaning is not deducible from the individual words (e.g., "break a leg", "bite the bullet").
    - A single word CANNOT be an idiom.
    - It must have a figurative, non-literal meaning.

2.  **is_pv (Phrasal Verb)**:
    - MUST be a verb followed by one or two prepositions/adverbs (e.g., "get over", "look up to", "run out of").
    - A single word CANNOT be a phrasal verb.

3.  **is_col (Collocation)**:
    - Two or more words that frequently occur together (e.g., "heavy rain", "make a decision", "strong coffee").
    - A single word CANNOT be a collocation.
    - The meaning is generally literal, but the combination is natural and conventional.

4.  **is_phr (Standard Phrase)**:
    - A general multi-word expression or a fixed phrase that doesn't fit the other categories.
    - Often longer constructions (e.g., "better late than never", "on the other hand").
    - The meaning is literal.

5.  **is_vocab (Standard Vocabulary)**:
    - Use this classification if the item is a single word (noun, verb, adjective, adverb) and does not fit any of the multi-word categories above.

Your response MUST be a strict JSON array of objects. Each object must contain the original word ("og") and ONLY ONE of the boolean flags set to \`true\`. All other flags for that object must be \`false\`.

Response Example (Strict JSON Array):
[
  {
    "og": "ubiquitous",
    "is_vocab": true, "is_idiom": false, "is_pv": false, "is_col": false, "is_phr": false
  },
  {
    "og": "break the ice",
    "is_vocab": false, "is_idiom": true, "is_pv": false, "is_col": false, "is_phr": false
  },
  {
    "og": "get over",
    "is_vocab": false, "is_idiom": false, "is_pv": true, "is_col": false, "is_phr": false
  },
  {
    "og": "heavy rain",
    "is_vocab": false, "is_idiom": false, "is_pv": false, "is_col": true, "is_phr": false
  },
  {
    "og": "on the other hand",
    "is_vocab": false, "is_idiom": false, "is_pv": false, "is_col": false, "is_phr": true
  }
]`;
}
