export function getWordFamilyFormsPrompt(seed: {
    verbs?: string[];
    nouns?: string[];
    adjectives?: string[];
    adverbs?: string[];
}): string {
    const normalize = (items?: string[]) => (items || []).map(item => `"${item}"`).join(', ') || 'none';

    return `You are an expert English linguist.

TASK: Given a word family group, infer the related forms and fill any missing entries.

CURRENT GROUP:
- Verbs: [${normalize(seed.verbs)}]
- Nouns: [${normalize(seed.nouns)}]
- Adjectives: [${normalize(seed.adjectives)}]
- Adverbs: [${normalize(seed.adverbs)}]

RULES:
1. Return one coherent English word family for the same root/meaning.
2. Preserve valid existing words whenever possible.
3. Fill missing forms when they exist naturally in common English usage.
4. Each field may contain multiple words if that family commonly has multiple options.
5. Do not invent rare, obscure, or unnatural words just to fill every slot.
6. If a form truly does not exist or is not natural, return an empty array for that field.
7. Remove duplicates.
8. Return data only, not code.

OUTPUT RULES:
- Return ONLY one strict JSON object.
- Do NOT return Python, JavaScript, pseudocode, explanations, markdown, or comments.
- Do NOT wrap the answer in a code block.
- The JSON object must contain exactly these keys: "verbs", "nouns", "adjectives", "adverbs".
- Every value must be a JSON array of lowercase strings.

Response Example:
{
  "verbs": ["decide"],
  "nouns": ["decision"],
  "adjectives": ["decisive"],
  "adverbs": ["decisively"]
}`;
}
