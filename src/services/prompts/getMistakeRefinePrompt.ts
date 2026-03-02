import { MistakeRow } from '../../app/types';

export function getMistakeRefinePrompt(rows: MistakeRow[], userInput?: string, mode: 'append' | 'replace' = 'replace'): string {
    const rowsJson = JSON.stringify(rows);
    const normalizedInput = (userInput || '').trim();
    const outputRule = mode === 'append'
        ? 'APPEND MODE: Return only NEW rows to add. Do NOT preserve, rewrite, or include old rows.'
        : 'REPLACE MODE: Return the full refined final table.';
    const backupContext = mode === 'append'
        ? ''
        : `\n    EXISTING TABLE JSON (for backup context):\n    ${rowsJson}\n`;

    return `You are an expert English linguist and IELTS writing coach.
    
    TASK: Refine and complete a "Common Mistakes" correction table.
    MODE: ${mode.toUpperCase()}
    
    INPUT DATA:
    ${normalizedInput || rowsJson}
    ${backupContext}

    INSTRUCTIONS:
    1. For each row, improve clarity and teaching value.
    2. Keep "mistake" short and realistic (typical learner error).
    3. "explanation" must be concise and specific: explain exactly what is wrong and why.
    4. "correction" must provide the best corrected form. If useful, include 1-2 valid alternatives separated by " / ".
    5. Remove low-quality rows (empty or duplicated meaning).
    6. **EXPANSION**: If the table is short, add 2-3 additional high-frequency IELTS-relevant mistakes.
    7. Every mistake must be presented in a minimal complete, natural IELTS-style sentence. Avoid isolated fragments. The learner must have enough context to logically detect the error.
    8. ${outputRule}

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
