import { VocabularyItem } from '../../app/types';

export function getCollocationHintPrompt(words: VocabularyItem[]): string {
    const wordDataForPrompt = words.map(word => ({
        word: word.word,
        // Send only collocations that are missing the 'd' field
        collocations: (word.collocationsArray || [])
            .filter(c => !c.d)
            .map(c => c.text)
    })).filter(w => w.collocations.length > 0);

    const wordListJson = JSON.stringify(wordDataForPrompt, null, 2);

    return `You are an expert IELTS coach. Your task is to provide descriptive hints for collocations.

    TASK:
    Analyze the following JSON array. Each object contains a word and a list of its collocations that are missing a descriptive hint ("d").
    For EACH collocation string, you MUST generate a minimal descriptive cue that helps recall it. This cue should be 5-10 words.
    
    INPUT DATA:
    ${wordListJson}

    INSTRUCTIONS:
    1.  Read the input data.
    2.  For each word, take its list of collocation strings.
    3.  Return a new JSON array. Each object in the array must contain:
        - "og": The original word.
        - "col": An array of objects, where each object has "text" (the original collocation) and "d" (your new descriptive hint).
    4.  Do NOT modify the "text" of the collocation. Do NOT add any collocations that were not in the input.

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON array of objects. Do not include any text outside the JSON block.

    [
      {
        "og": "original_word_1",
        "col": [
          { "text": "collocation_string_1", "d": "your new descriptive hint for it" },
          { "text": "collocation_string_2", "d": "your new hint for the second one" }
        ]
      },
      {
        "og": "original_word_2",
        "col": [
          { "text": "collocation_string_3", "d": "a hint for this collocation" }
        ]
      }
    ]
    `;
}