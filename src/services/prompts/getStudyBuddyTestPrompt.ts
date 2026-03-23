export function baseRules(input: string, focusArea: string): string {
    return `You are an IELTS examiner tasked with creating a ${focusArea} practice test for: "${input}"

BASE RULES:
- Go straight to create 1 question only focused solely on ${focusArea} and the target word(s) "${input}".
- Output only in Markdown, no title, no section, no chapter, no explanations and no intro/out-tro.
- Use clear, concise English suitable for IELTS 6.5–8.0.
- Do not reveal answers in questions.

QUESTION & ANSWER FORMAT:
  Question: ...
  [Multi: correct | distractor | distractor | distractor]
  [HIDDEN: Explanation with line breaks <br/> for clarity]
- Each [Multi] has exactly 4 options; correct answer is always first.
- Avoid words like "correct", "answer", or "explanation".

DISTRACTOR RULES:
- Distractors match the part of speech and context of the correct answer.
- They should be plausible, semantically close but incorrect.

Avoid these common MISTAKES:
- AVOID: No unrelated questions or blanks without clear ask.
- AVOID: No [Multi] with exact 4 options.
- AVOID: No [HIDDEN: Explanation] to explain why the correct answer is correct and why the distractors are wrong.
- AVOID: The correct answer is not first option.
`;
}

export function collocationPrompt(input: string): string {
    return `${baseRules(input, 'collocation')}
Test content:
- Focus on collocation testing across all sections whenever possible.
- Question must have blank ___.
- The blank ___ must be right before or right after the target word "${input}" in the question.
- The explanation must clearly explain the collocation and why the correct answer fits while the distractors do not. Answer one by one if there are multiple collocations in the question

EXAMPLE to generate for "harsh":
Question: He received a harsh ______ for missing the deadline.
[Multi: punishment | compliment | gift | greeting]
[HIDDEN: The correct answer is ... because ...<br/>compliment is wrong because ...<br/gift is wrong because ...<br/greeting is wrong because ...]
`;
}

export function prepositionPrompt(input: string): string {
    return `${baseRules(input, 'preposition')}
FOCUS RULE:
Emphasize dependent prepositions and preposition patterns throughout the test.

EXAMPLE:
PREPOSITION PRACTICE TEST for "${input}"

Question: She is interested ______ learning new languages.
[Multi: in | on | at | for]
Question: They apologized ______ the mistake.
[Multi: for | to | with | by]
Question: He is good ______ playing tennis.
[Multi: at | in | on | with]

Generate now.
`;
}

export function paraphrasePrompt(input: string): string {
    return `${baseRules(input, 'paraphrase')}
FOCUS RULE:
Prioritize paraphrase choice, synonym nuances, and register differences in all questions.

EXAMPLE:
PARAPHRASE PRACTICE TEST for "${input}"

Question: Choose the best paraphrase for "happy".
[Multi: joyful | angry | sad | tired]
Question: Which word best replaces "quickly"?
[Multi: rapidly | slowly | loudly | softly]
Question: Select the synonym for "help".
[Multi: assist | ignore | hinder | neglect]

Generate now.
`;
}

export function wordFamilyPrompt(input: string): string {
    return `${baseRules(input, 'wordFamily')}
FOCUS RULE:
Highlight word family forms, part-of-speech shifts, and form-choice accuracy in every section.

EXAMPLE:
WORD FAMILY PRACTICE TEST for "${input}"

Question: Choose the correct noun form of "decide".
[Multi: decision | decide | decisive | deciding]
Question: Select the adjective form of "beauty".
[Multi: beautiful | beauty | beautify | beautifully]
Question: Pick the verb form of "strength".
[Multi: strengthen | strength | strong | strongly]

Generate now.
`;
}

export function getStudyBuddyTestPrompt(
    input: string,
    focusArea?: 'collocation' | 'preposition' | 'paraphrase' | 'wordFamily'
): string {
    switch (focusArea) {
        case 'collocation':
            return collocationPrompt(input);
        case 'preposition':
            return prepositionPrompt(input);
        case 'paraphrase':
            return paraphrasePrompt(input);
        case 'wordFamily':
            return wordFamilyPrompt(input);
        default:
            return `Please specify a valid focusArea: 'collocation', 'preposition', 'paraphrase', or 'wordFamily'.`;
    }
}
