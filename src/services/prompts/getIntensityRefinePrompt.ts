import { IntensityRow } from '../../app/types';

export function getIntensityRefinePrompt(rows: IntensityRow[]): string {
    const rowsJson = JSON.stringify(rows);

    return `You are an expert English linguist and IELTS coach.
    
    TASK: Refine and complete a "Word Intensity Scale" table.
    
    INPUT DATA (Existing Rows):
    ${rowsJson}

    INSTRUCTIONS:
    1. For each row provided, analyze the existing word(s). 
    2. Complete any missing columns (Softened, Neutral, Intensified) to create a perfect scale.
    3. Ensure the progression is logical (e.g., chilly -> cold -> freezing).
    4. For EACH word, assign a register if it is distinctly "academic" or "casual". Leave empty if neutral.
    5. **EXPANSION**: You MUST introduce 1-2 ADDITIONAL rows of related vocabulary that fit the theme of the provided words. Choose only natural, high-frequency words useful for IELTS (e.g., if input is "hurt, pain", add rows for "anguish", "discomfort", etc.).

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON array of objects, each representing a full row:
    [
      {
        "softened": [{"word": "string", "register": "academic" | "casual" | null}],
        "neutral": [{"word": "string", "register": "academic" | "casual" | null}],
        "intensified": [{"word": "string", "register": "academic" | "casual" | null}]
      }
    ]
    `;
}