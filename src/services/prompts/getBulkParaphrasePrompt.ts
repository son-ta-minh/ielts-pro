import { VocabularyItem } from '../../app/types';

export function getBulkParaphrasePrompt(words: VocabularyItem[]): string {
    const wordList = words.map(w => `"${w.word}"`).join(', ');

    return `You are an expert IELTS coach, examiner, and native English speaker.
    
    TASK: Analyze this list of vocabulary items: [${wordList}].

    For EACH item, generate a controlled paraphrase system (max 5 items total). 
    
    RULES:
    - ONLY generate categories if a natural equivalent exists. 
    - DO NOT force all tone types.
    - Each item MUST be an object: {"w": "word_or_phrase", "t": "tone_type", "c": "recall cue"}.
    - 't' (tone) MUST be one of: "academic", "casual", "intensified", "synonym", "idiomatic".
    - 'c' (context) = a short (2-5 words) situational recall cue (e.g., "job interview", "arguing with friend").

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON array of objects. Each object represents one word from the input list.
    
    [
      {
        "og": "string (the EXACT original word from the input list)",
        "para": [
          {
            "w": "string",
            "t": "string",
            "c": "string"
          }
        ]
      }
    ]
    `;
}