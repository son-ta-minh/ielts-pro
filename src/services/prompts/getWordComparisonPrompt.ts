export function getWordComparisonPrompt(groupName: string, words: string[]): string {
    const wordList = words.map(w => `"${w}"`).join(', ');

    return `You are an expert IELTS coach and lexicographer, skilled at explaining nuanced differences between similar words.

    TASK:
    Analyze a group of confusing English words. The user wants to understand the subtle differences in meaning, context, grammar, and usage for each.
    
    GROUP CONCEPT: "${groupName}"
    WORDS TO ANALYZE: [${wordList}]

    INSTRUCTIONS:
    1.  **Analyze Each Word**: For every word in the provided list, provide a detailed breakdown.
    2.  **Suggest New Words**: Based on the group concept, suggest 1-3 NEW, highly relevant words that learners also find confusing. Add these new words to your analysis as if they were part of the original list.
    3.  **Generate HTML**: Format the entire analysis as a single, well-structured HTML string.
        - Use a main \`<div>\` for each word.
        - Use \`<h4>\` for the word itself.
        - Use \`<h6>\` for sub-sections: "Meaning & Nuance", "Context & Usage", "Grammar & Collocations", and "Example".
        - Use standard \`<p>\`, \`<ul>\`, \`<li>\`, and \`<b>\` for content.
        - Be concise but clear. Use bullet points for easy reading.
    4.  **Final JSON Output**: Your final response must be a single, strict JSON object with two keys:
        - \`updatedWords\`: An array of strings containing ALL words analyzed (the original list PLUS your new suggestions).
        - \`comparisonHtml\`: The complete HTML string of your analysis.

    EXAMPLE OF ONE WORD'S HTML STRUCTURE:
    \`\`\`html
    <div>
        <h4>Word/Phrase</h4>
        <h6>Meaning & Nuance</h6>
        <p><b>Subtle meaning 1:</b> Explanation. <b>Subtle meaning 2:</b> Explanation.</p>
        <h6>Context & Usage</h6>
        <ul>
            <li><b>Formal/Informal:</b> Explanation.</li>
            <li><b>Best used for:</b> Explanation of specific scenarios.</li>
        </ul>
        <h6>Grammar & Collocations</h6>
        <ul>
            <li>(collocation 1)</li>
            <li>(collocation 2)</li>
        </ul>
        <h6>Example</h6>
        <p><i>"A clear example sentence..."</i></p>
    </div>
    <hr />
    \`\`\`

    STRICT JSON RESPONSE FORMAT:
    {
      "updatedWords": ["original_word_1", "original_word_2", "new_suggestion_1"],
      "comparisonHtml": "<div><h4>...</h4>...</div><hr /><div><h4>...</h4>...</div>"
    }
    `;
}
