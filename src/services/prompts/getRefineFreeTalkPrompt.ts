
export function getRefineFreeTalkPrompt(
    currentContent: string,
    userRequest: string
): string {
    return `You are an expert IELTS Speaking coach.
    
    TASK: Refine and upgrade the following speech draft to achieve a higher Band Score (8.0+).

    CURRENT DRAFT:
    "${currentContent}"

    USER REQUEST: "${userRequest || 'Improve vocabulary, grammar, and flow.'}"

    INSTRUCTIONS:
    1.  **Upgrade Vocabulary**: Replace simple words with more precise, less common lexical resources (idioms, collocations).
    2.  **Fix Grammar**: Ensure complex structures are used correctly.
    3.  **Improve Flow**: Use natural discourse markers and linking words.
    4.  **Maintain Voice**: Keep it sounding like a natural spoken response, not a written essay.

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON object.
    {
      "content": "string (The fully rewritten, improved paragraph)"
    }
    `;
}
