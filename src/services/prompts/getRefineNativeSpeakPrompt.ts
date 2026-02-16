
import { NativeSpeakAnswer } from '../../app/types';

export function getRefineNativeSpeakPrompt(
    userInput: string,
    userRequest: string,
    existingAnswers: NativeSpeakAnswer[] = []
): string {
    // Extract actual expressions from sentences (content inside {}) or fallback to anchor
    const existingList = existingAnswers.map(a => {
        const match = a.sentence.match(/\{(.*?)\}/);
        return match ? `"${match[1]}"` : `"${a.anchor}"`;
    }).join(', ');
    
    const contextStr = existingList ? `EXISTING EXPRESSIONS (DO NOT DUPLICATE THESE): [${existingList}]` : "";

    return `You are an expert English linguist and communication coach.
    
    TASK: Analyze a user's input/context to generate high-quality native expressions.
    
    ${contextStr}

    CONTEXT / CORE CONCEPT:
    "${userInput}"

    USER REQUEST: "${userRequest || 'Generate a variety of expressions.'}"

    INSTRUCTIONS:
    1.  **Analyze**: Understand the core concept (e.g., "Disagreeing", "Showing excitement").
    2.  **Generate NEW Expressions**: Create 3-5 NEW, distinct, and natural expressions for this concept.
        -   **IMPORTANT**: If "EXISTING EXPRESSIONS" are provided, you MUST NOT repeat them. You must find *alternatives* or *variations*.
    3.  **Tones**: Try to provide a mix of 'casual', 'semi-academic', and 'academic' tones if possible.
    4.  **Format**:
        -   **Anchor (Situation/Context)**: A short, natural phrase describing the *specific situation* or *intent* where this expression is used (e.g., 'Disagreeing with a boss', 'Refusing an invitation').
            -   **DO NOT** put the expression itself here. This is the cue for the user to guess the expression.
            -   Use **English** for simple situations.
            -   Use **Vietnamese** if the situation is nuanced, abstract, or hard to describe simply in English.
        -   **Sentence**: Write a full example sentence containing the expression. Use curly braces \`{}\` to highlight the target expression.
        -   **Note**: Brief usage tip.
    5.  **Standard (Context) Field**: 
        -   Keep it **EXTREMELY CONCISE (MAX 8 WORDS)**.
        -   Make it descriptive and visual. Avoid long, explanatory sentences. 
        -   Example: Use "Sick and symptoms" instead of "Different ways to describe being sick or having a headache".
        -   If the core concept is simple, use **English**. If abstract/complex, use **Vietnamese**.

    STRICT JSON OUTPUT FORMAT:
    {
      "standard": "string (Concise Context/Title - Max 8 words)",
      "answers": [
        {
          "tone": "casual" | "semi-academic" | "academic",
          "anchor": "string (The situation cue - EN or VI)",
          "sentence": "string (e.g., 'Honestly, I'm {not buying it}.')",
          "note": "string"
        }
      ]
    }
    `;
}
