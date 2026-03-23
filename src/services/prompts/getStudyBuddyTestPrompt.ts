export function getStudyBuddyTestPrompt(
    input: string,
    focusArea?: 'collocation' | 'preposition' | 'paraphrase' | 'wordFamily'
): string {
    const focusRule = focusArea === 'collocation'
        ? '- Prioritize collocation testing across all sections when possible'
        : focusArea === 'preposition'
            ? '- Prioritize dependent prepositions and preposition patterns across all sections when possible'
            : focusArea === 'paraphrase'
                ? '- Prioritize paraphrase choice, synonym nuance, and register differences across all sections when possible'
                : focusArea === 'wordFamily'
                    ? '- Prioritize word family forms, part-of-speech shifts, and form-choice accuracy across all sections when possible'
                    : '';

    return `You are an IELTS examiner.
TASK: Generate a vocabulary practice test for: "${input}"

OUTPUT: Markdown ONLY. No explanation. No extra text.

IMPORTANT:
- This is a TEST, not an explanation
- Follow EXACT output format
- Do NOT copy instruction text
${focusRule}

---

OUTPUT FORMAT:

PRACTICE TEST for "${input}"

### Section 1: Collocation Selection
Question: ...
[Multi: correct | distractor | distractor | distractor]

### Section 2: Meaning Matching
Question: ...
[Multi: correct | distractor | distractor | distractor]

### Section 3: Contextual Use
Question: ...
[Multi: correct | distractor | distractor | distractor]

---

STRICT RULES (CRITICAL):
If any rule is violated, the output is incorrect.

- IMPORTANT: ALL questions MUST be directly based on the target word(s): "${input}"
- DO NOT introduce questions that focus on unrelated vocabulary, the testing focus must be on the target word(s): "${input}"

- Each [Multi] MUST contain EXACTLY 4 options
- **Important**: The correct answer MUST be the FIRST option in the [Multi]
- DO NOT reveal the answer anywhere else
- Do NOT write: "correct", "answer", "explanation"

- No empty lines
- No definitions
- No extra text

---

SECTION RULES:

Section 1: Collocation Selection
- **Important**: MUST be a sentence with a blank: ______
- Focus only on COLLOCATION (word combinations) of the target word
- The blank _____ can only appear **RIGHT BEFORE, or RIGHT AFTER** the target word
- Each question tests which word naturally fits in the collocation with the target word
- The correct answer is chosen because it collocates correctly with the target word

Section 2: Meaning Matching
- Test meaning or synonym of the target word
- Questions must be definition-style or replacement-style
- DO NOT explain meanings

Section 3: Contextual Use
- **Important**: MUST be a sentence with a blank: ______
- Focus on CONTEXT and NUANCE (tone, situation, intensity)
- All options must be grammatically possible
- Only ONE option fits the meaning or tone correctly
- NOT collocation-based

---
EXAMPLE (FOLLOW THIS STYLE EXACTLY). As you can see the target word "harsh" is not necessarily always inside the [Multi] in section 1:
PRACTICE TEST for "harsh"

### Section 1: Collocation Selection
Question: He received a harsh ______ for missing the deadline.
[Multi: punishment | compliment | gift | greeting]
Question: The judge delivered a harsh ______ on the defendant.
[Multi: verdict | apology | remark | suggestion]
Question: She spoke in a ______ tone that made everyone uneasy.
[Multi: harsh | gentle | soft | playful]

### Section 2: Meaning Matching
Question: Which word is closest in meaning to "rapid"?
[Multi: fast | weak | silent | distant]
Question: Which word best replaces "difficult" in this sentence: "The exam was very difficult."?
[Multi: challenging | easy | boring | short]

### Section 3: Contextual Use
Question: She gave a ______ smile after hearing the bad news.
[Multi: forced | joyful | relaxed | cheerful]
Question: He spoke in a ______ tone, making everyone uncomfortable.
[Multi: harsh | friendly | calm | playful]

---
OTHER RULES:

- Section 1: 3–5 questions
- Section 2: 2–4 questions
- Section 3: 2–4 questions

- All content in English
- Each question must test a different nuance or usage
- Avoid repeating structure

---

DISTRACTOR RULES:

- Same part of speech as correct answer
- Semantically similar (nuance-level difference)
- Same context/topic
- Plausible but incorrect
- No obviously wrong answers

---

DIFFICULTY:

- IELTS 6.5–8.0
- Focus on subtle distinctions (tone, intensity, usage)

---

--- MUST avoid common invalid outputs that violate rules:
- Questions that do not focus on the target word(s)
- [Multi] with less or more than 4 options
- Correct answer not in the first position
- Revealing the correct answer in the question or elsewhere
- Questions in section 1 that do not have a blank or do not test collocation
- Questions in section 2 that are not definition-style or replacement-style
- Questions in section 3 that do not have a blank or do not test context/nuance

Generate now.
`;
}
