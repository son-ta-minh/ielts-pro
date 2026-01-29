import { NativeSpeakItem } from '../../app/types';

export function getMergeNativeSpeakPrompt(items: NativeSpeakItem[]): string {
    const itemsJson = JSON.stringify(items.map(item => ({
        standard: item.standard,
        answers: item.answers,
        note: item.note,
        tags: item.tags
    })), null, 2);

    return `You are an expert English linguist and communication coach.
    
    TASK: Merge the following speaking cards into a single, cohesive card.

    CARDS TO MERGE:
    ${itemsJson}

    INSTRUCTIONS:
    1.  **Synthesize Context**: Analyze the "standard" contexts from all cards and create a new, overarching "standard" context that covers all of them. For example, if you see "Expressing doubt" and "Showing skepticism", the new context could be "Expressing doubt and skepticism".
    2.  **Combine & De-duplicate Expressions**:
        -   Collect all unique expressions ('answers') from all cards.
        -   If two expressions are very similar, keep only the best one.
        -   Organize the final list of expressions logically by tone (casual, semi-academic, academic).
    3.  **Create a New Card**: Format the result as a single JSON object that follows the same structure as the input cards. The goal is to produce one high-quality card that replaces all the input cards.

    STRICT JSON OUTPUT FORMAT:
    {
      "standard": "string (The new, synthesized core concept)",
      "answers": [
        {
          "tone": "casual",
          "anchor": "string (The core phrase)",
          "sentence": "string (Example sentence with {highlight})",
          "note": "string (Optional usage note)"
        }
      ]
    }
    `;
}
