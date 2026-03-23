export function getStudyBuddyCoachPrompt(
    selectedText: string,
    type: 'examples' | 'collocations' | 'paraphrase' | 'wordFamily' | 'preposition' | 'idioms' | 'compare'
): string {
    const baseRules = `Rules:
- Use English only
- Do NOT translate into Vietnamese
- Keep concise, natural, IELTS-friendly
- Use bullet list ONLY (-)
- Do NOT use {}, numbers, or any other symbols
- Follow the format STRICTLY`;

    if (type === 'examples') {
        return `Give max 3 example sentences for '"${selectedText}' use the exact words provided, do not paraphrases".

${baseRules}
- Each bullet = 1 natural sentence`;
    }

    if (type === 'collocations') {
        return `Give max 5 popular natural collocations for "${selectedText}".

${baseRules}
- Format: - **collocation**: short explanation`;
    }

    if (type === 'idioms') {
        return `Give max 5 natural idioms related to "${selectedText}".

${baseRules}
- Format: - **idiom**: short explanation`;
    }

    if (type === 'wordFamily') {
        return `Give the most useful word family forms for "${selectedText}".

${baseRules}
- Output ONLY the list, no greeting, no intro, no conclusion
- Max 6 lines
- Each line must be exactly: - **word form** (noun|verb|adjective|adverb): short meaning
- Use only these part-of-speech labels: noun, verb, adjective, adverb
- If a part of speech does not exist or is uncommon, skip it
- Do not repeat the same word form
- Example format:
- successful (adjective): achieving the result you wanted
- succeed (verb): achieve the result you wanted`;
    }

    if (type === 'preposition') {
        return `Give the most useful dependent prepositions or preposition patterns for "${selectedText}".

${baseRules}
- Output ONLY the list, no greeting, no intro, no conclusion
- Max 5 lines
- Format: - **preposition or pattern**: short usage note
- Prefer natural, common learner-useful patterns
- If a pattern is limited or formal, say that briefly`;
    }

    if (type === 'compare') {
        return `Compare the words in "${selectedText}" and explain the nuance differences.

${baseRules}
- Output as a Markdown table
- Columns: Word | Nuance | Example (collocations)
- Each cell must be concise
- In the Example column, include 2-3 natural collocations
- Use </br> for line breaks inside a cell
- Do NOT add any text before or after the table`;
    }

    return `Give natural paraphrases for "${selectedText}".

${baseRules}
- Format: - **paraphrase**(Register): short explanation
- Register must be one of: Academic, Casual, Synonym
- Always put Register immediately after the paraphrase, before the colon
- Do NOT put Register at the end of the explanation
- If unsure, use Synonym`;
}
