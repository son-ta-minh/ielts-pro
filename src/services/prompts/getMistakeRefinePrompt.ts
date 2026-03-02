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
    6. **DEDUPLICATION REQUIRED**: Automatically detect and merge duplicated or overlapping mistakes (e.g., the same uncountable noun error appearing twice). Keep only ONE focused item per unique error type.
    7. If two rows contain multiple issues, split or refine them so each row targets ONE primary error only.
    8. **EXPANSION**: If the table is short after deduplication, add 2-3 additional high-frequency IELTS-relevant mistakes.
    9. Mistakes may be either a minimal complete sentence OR a minimal self-contained phrase (e.g., “higher educations”) if the error can be clearly detected without additional context. Do not add unnecessary words.
    10. Only require time markers when the PRIMARY error is tense-related. Do NOT add unnecessary time context for logic, collocation, word form, or noun errors. If tense is the target error, include clear time markers (e.g., “in 2010”, “between 2000 and 2010”) so the error can be detected independently.
    11. ${outputRule}

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
