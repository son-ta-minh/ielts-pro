export function getRefineNativeSpeakPrompt(
    userInput: string,
    userRequest: string
): string {
    return `You are an expert English linguist and communication coach.
    
    TASK: Analyze a user's input to identify a core concept and example phrases. You MUST refine the provided phrases and generate additional ones to create a structured set of native-like expressions.

    RAW USER INPUT:
    "${userInput}"

    USER REFINEMENT REQUEST: "${userRequest || 'Generate a variety of expressions.'}"

    INSTRUCTIONS:
    1.  **Analyze and Split Input (CRITICAL FIRST STEP)**:
        -   Read the "RAW USER INPUT". It may contain both a core concept and several example phrases, often separated by colons or newlines.
        -   **Identify the Core Concept**: Extract the main idea or topic (e.g., "Disagree", "Expressing excitement"). This will be the value for the "standard" field in your output JSON.
        -   **Extract Example Phrases**: Identify any full example sentences or phrases from the input. These are your primary material.

    2.  **Refine and Augment**:
        -   **MUST REFINE**: Take each "Example Phrase" you extracted. Improve its wording, identify its core 'anchor', and assign it to the most appropriate tone ('casual', 'semi-academic', or 'academic'). These refined phrases will form the base of your "answers" list.
        -   **MUST AUGMENT**: After refining the user's examples, check if you have at least one answer for EACH of the three tones. If any tone is missing, generate a NEW, high-quality expression for that tone.
        -   The final "answers" list must contain a mix of refined user examples and newly generated expressions, with at least one for each tone.

    3.  **Identify Anchor**: For EACH answer in your final list, identify the single most important keyword or short phrase. This is the 'anchor'.
    4.  **Create Sentence**: Write a full, natural example sentence for each expression.
    5.  **Keyword Highlighting**: In the 'sentence' field, you MUST highlight the core lexical chunk using curly braces \`{}\`. Example: "I'm {skeptical about} that."
    6.  **Add Optional Note**: If useful, add a brief 'note'. Use angle brackets \`<...>\` for grammar tips (e.g., preposition variations) inside the sentence. Example: "I'm {skeptical} about that <'skeptical' can be followed by 'about' or 'of'>".
    7.  **Format Final JSON**: The "standard" field must contain ONLY the core concept you identified. The "answers" list must contain the final, combined set of refined and augmented expressions.

    EXAMPLE WALKTHROUGH:
    -   RAW USER INPUT: "Disagree: I’m not convinced that would work\\nI'm strongly against..."
    -   Step 1 Result:
        -   Core Concept identified: "Expressing disagreement". This becomes the 'standard' value.
        -   Extracted examples: "I'm not convinced that would work", "I'm strongly against...".
    -   Step 2-7: You will now **refine** these two examples, assign them to tones, then **augment** by creating new expressions for any missing tones, and finally format them all into the final JSON.

    STRICT JSON OUTPUT FORMAT:
    {
      "standard": "string (The extracted core concept, e.g., 'Expressing disagreement')",
      "answers": [
        {
          "tone": "casual",
          "anchor": "string (e.g., 'not buying it')",
          "sentence": "string (e.g., 'Honestly, I'm {not buying it}.')",
          "note": "string (e.g., 'A very informal way to show disbelief.')"
        },
        {
          "tone": "semi-academic",
          "anchor": "string (e.g., 'skeptical')",
          "sentence": "string (e.g., 'I'm a bit {skeptical of} that claim.')"
        },
        {
          "tone": "academic",
          "anchor": "string (e.g., 'reservations')",
          "sentence": "string (e.g., 'I {have some reservations about} the validity of this data.')",
          "note": "string (e.g., 'Use 'reservations' in formal contexts to express doubt politely.')"
        }
      ]
    }
    `;
}