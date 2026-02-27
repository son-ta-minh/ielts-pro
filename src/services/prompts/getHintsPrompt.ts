import { VocabularyItem } from '../../app/types';

export function getHintsPrompt(words: VocabularyItem[]): string {
    const wordDataForPrompt = words.map(word => {
        const data: { word: string; collocations?: string[]; idioms?: string[] } = { word: word.word };
        const collocsToHint = (word.collocationsArray || []).filter(c => !c.d).map(c => c.text);
        const idiomsToHint = (word.idiomsList || []).filter(i => !i.d).map(i => i.text);
        if (collocsToHint.length > 0) data.collocations = collocsToHint;
        if (idiomsToHint.length > 0) data.idioms = idiomsToHint;
        return data;
    }).filter(w => w.collocations || w.idioms);

    const wordListJson = JSON.stringify(wordDataForPrompt, null, 2);

    return `You are an expert IELTS coach. Your task is to provide descriptive hints for collocations and idioms.

    TASK:
    Analyze the following JSON array. For each word, there is a list of its collocations and/or idioms that are missing a descriptive hint ("d").
    For EACH collocation and idiom string, you MUST generate a minimal descriptive cue that helps recall it. This cue should be 5-10 words.
    
    INPUT DATA:
    ${wordListJson}

    INSTRUCTIONS:
    1.  Read the input data.
    2.  For each word, process its 'collocations' and/or 'idioms' lists.
    3.  Return a new JSON array. Each object in the array must contain:
        - "og": The original word.
        - "col": (if present in input) An array of objects, where each object has "text" (the original collocation) and "d" (your new descriptive hint).
        - "idm": (if present in input) An array of objects, where each object has "text" (the original idiom) and "d" (your new descriptive hint).
    4.  Do NOT modify the "text" of the items. Do NOT add any items that were not in the input.

    Return in code block format STRICT JSON OUTPUT FORMAT:
    [
      {
        "og": "original_word_1",
        "col": [
          { "text": "collocation_string_1", "d": "your new descriptive hint for it" }
        ],
        "idm": [
          { "text": "idiom_string_1", "d": "your new hint for this idiom" }
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