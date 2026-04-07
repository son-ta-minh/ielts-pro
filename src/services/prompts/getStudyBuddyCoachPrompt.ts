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
        return `Give max 3 example sentences for '"${selectedText}' use the words provided, do not paraphrases".

${baseRules}
- Each bullet = 1 natural sentence`;
    }

    if (type === 'collocations') {
        return `Generate max 5 most common, natural collocations, cover IELTS topics for "${selectedText}" following common usage patterns.
Replace placeholders like 'something' with realistic words/phrases, and include variations for reflexive pronouns or tenses where applicable.
Do not paraphrase.

${baseRules}
- Format: - **collocation**: short explanation`;
    }

    if (type === 'idioms') {
        return `Give max 5 natural idioms related to "${selectedText}".

${baseRules}
- Only include real idioms that native speakers naturally use.
- Idioms are fixed expressions whose meanings are not predictable from the meanings of its individual words.
- Idioms often rely on metaphors, similes, or other literary devices to create a unique meaning.
- Do NOT give collocations, ordinary example phrases, or loose word combinations.
- If there are idioms, format: - idiom: short explanation
- If there are no natural idioms for this word/phrase, output exactly: No common natural idioms for this word.`;
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
        return `Give the dependent prepositions for "${selectedText}".

${baseRules}
- Output ONLY the list, no greeting, no intro, no conclusion
- Max 5 lines, no duplicated prepositions.
- Format: - **preposition**: context to use it in, and context must include the mentioned preposition.
For example, if the preposition of "interest" is "in", the context could be "interested in sports".`;
    }

    if (type === 'compare') {
        return `Compare the words in "${selectedText}" and explain the nuance differences.

${baseRules}
- Output as a Markdown table
- Columns: Word | Nuance | Example (collocations)
- Each cell must be concise
- In the Example column, include 2-3 natural collocations
- Use </br> for line breaks inside a cell
- Do NOT give any text before or after the table`;
    }

    return `Give natural paraphrases for "${selectedText}".

${baseRules}
- Only include real natural paraphrases with similar meaning and usable learner value
- Do NOT give collocations, explanations, definitions, examples, or unrelated near-topic words
- If there are no good natural paraphrases, output exactly:
- No strong natural paraphrases for this word.
- Format: - **paraphrase**(Register): short explanation
- Register must be one of: Academic, Casual, Neutral
- Always put Register immediately after the paraphrase, before the colon
- Do NOT put Register at the end of the explanation
- If unsure, use Synonym`;
}
