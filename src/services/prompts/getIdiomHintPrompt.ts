import { VocabularyItem } from '../../app/types';

export function getIdiomHintPrompt(words: VocabularyItem[]): string {
    const wordDataForPrompt = words.map(word => ({
        word: word.word,
        idioms: (word.idiomsList || [])
            .filter(i => !i.d)
            .map(i => i.text)
    })).filter(w => w.idioms.length > 0);

    const wordListJson = JSON.stringify(wordDataForPrompt, null, 2);

    return `You are an expert IELTS coach. Your task is to provide descriptive hints for idioms.

    TASK:
    Analyze the following JSON array. Each object contains a word and a list of its idioms that are missing a descriptive hint ("d").
    For EACH idiom string, you MUST generate a minimal descriptive cue that helps recall it. This cue should be 5-10 words.
    
    INPUT DATA:
    ${wordListJson}

    INSTRUCTIONS:
    1.  Read the input data.
    2.  For each word, take its list of idiom strings.
    3.  Return a new JSON array. Each object in the array must contain:
        - "og": The original word.
        - "idm": An array of objects, where each object has "text" (the original idiom) and "d" (your new descriptive hint).
    4.  Do NOT modify the "text" of the idiom. Do NOT add any idioms that were not in the input.

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON array of objects. Do not include any text outside the JSON block.

    [
      {
        "og": "original_word_1",
        "idm": [
          { "text": "idiom_string_1", "d": "your new descriptive hint for it" },
          { "text": "idiom_string_2", "d": "your new hint for the second one" }
        ]
      },
      {
        "og": "original_word_2",
        "idm": [
          { "text": "idiom_string_3", "d": "a hint for this idiom" }
        ]
      }
    ]
    `;
}