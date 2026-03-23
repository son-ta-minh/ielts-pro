export function getStudyBuddyTestPrompt(input: string): string {
    return `You are an IELTS examiner.
TASK: Generate a vocabulary practice test for: "${input}"

OUTPUT: Markdown ONLY. No explanation. No extra text.

IMPORTANT:
- This is a TEST, not an explanation
- Follow EXACT output format
- Do NOT copy instruction text

---

OUTPUT FORMAT:

PRACTICE TEST for "${input}"

### Section 1: Vocabulary Selection
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
- DO NOT introduce questions that focus on unrelated vocabulary, the testing focus must be on the target word(s) : "${input}"

- Each [Multi] MUST contain EXACTLY 4 options
- FIRST option = correct answer
- Correct answer MUST appear ONLY inside [Multi]
- DO NOT reveal the answer anywhere else
- DO NOT write: "correct", "answer", "explanation"

- No empty lines
- No definitions
- No extra text

---

SECTION RULES:

Section 1: Vocabulary Selection
- MUST be a sentence with a blank: ______
- Focus on COLLOCATION (word combinations)
- Each question tests which word naturally fits with surrounding words
- The correct answer is chosen because it collocates correctly

Section 2: Meaning Matching
- Test meaning or synonym of the target word
- Questions must be definition-style or replacement-style
- DO NOT explain meanings

Section 3: Contextual Use
- MUST be a sentence with a blank: ______
- Focus on CONTEXT and NUANCE (tone, situation, intensity)
- All options must be grammatically possible
- Only ONE option fits the meaning or tone correctly
- NOT collocation-based

---
EXAMPLE (FOLLOW THIS STYLE EXACTLY):

### Section 1: Vocabulary Selection
Question: He expressed deep ______ about the situation.
[Multi: concern | happiness | humor | curiosity]
Question: The company made a ______ decision to expand overseas.
[Multi: strategic | accidental | emotional | random]

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

Generate now.
`;
}
