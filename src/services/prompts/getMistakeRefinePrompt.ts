import { MistakeRow } from '../../app/types';

export function getMistakeRefinePrompt(rows: MistakeRow[]): string {
    const rowsJson = JSON.stringify(rows);

    return `You are an expert English linguist and IELTS writing coach.
    
    TASK: Refine and complete a "Common Mistakes" correction table.
    
    INPUT DATA:
    ${rowsJson}

    INSTRUCTIONS:
    1. For each row, improve clarity and teaching value.
    2. Keep "mistake" short and realistic (typical learner error).
    3. "explanation" must be concise and specific: explain exactly what is wrong and why.
    4. "correction" must provide the best corrected form. If useful, include 1-2 valid alternatives separated by " / ".
    5. Remove low-quality rows (empty or duplicated meaning).
    6. **EXPANSION**: If the table is short, add 2-3 additional high-frequency IELTS-relevant mistakes.

    METADATA RULES:
    1. **title**: Concept-driven, short title (MAX 5 WORDS).
    2. **description**: Define the focus boundary (MAX 15 WORDS). No fluff.

    STRICT JSON OUTPUT FORMAT:
    Return in code block format a single JSON object:
    {
      "title": "string",
      "description": "string",
      "data": [
        {
          "mistake": "string",
          "explanation": "string",
          "correction": "string"
        }
      ]
    }
    `;
}
