import { ComparisonRow } from '../../app/types';

export function getComparisonRefinePrompt(rows: ComparisonRow[]): string {
    const rowsJson = JSON.stringify(rows);

    return `You are an expert English linguist and IELTS coach.
    
    TASK: Refine and complete a "Confusing Word Comparison" table.
    
    INPUT DATA:
    ${rowsJson}

    INSTRUCTIONS:
    1. For each row provided, analyze the word(s). 
    2. If a nuance or example is missing, generate high-quality explanations.
    3. The "nuance" should explain exactly WHEN and WHY to use this word compared to its synonyms. Be sharp and IELTS-focused.
    4. Provide one natural, clear example sentence.
    5. **EXPANSION**: If the list is short, you MUST suggest 1-2 ADDITIONAL confusing words that belong to the same semantic group.

    METADATA RULES:
    1. **title**: Concept-driven, metaphorical title (MAX 5 WORDS). Think: "Visual Deception", "Mental Strain".
    2. **description**: Define the core conceptual boundary (MAX 15 WORDS). Sharp and precise. NO fluff.

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON object:
    {
      "title": "string",
      "description": "string",
      "data": [
        {
          "word": "string",
          "nuance": "string (The sharp explanation of usage)",
          "example": "string (The example sentence)"
        }
      ]
    }
    `;
}