
export function getGenerateLessonTestPrompt(lessonTitle: string, lessonContent: string, userRequest?: string, tags: string[] = []): string {
  const tagsString = tags.join(', ');

  return `You are an expert IELTS examiner. 
  
  TASK: Generate a creative and comprehensive PRACTICE TEST based on the following lesson content.
  
  LESSON TITLE: "${lessonTitle}"
  LESSON CONTENT: "${lessonContent}"
  USER REQUEST: "${userRequest || ''}"
  TAGS: "${tagsString}"

  AVAILABLE INTERACTIVE TAGS:
  1. **Dropdown**: [Select: Correct | Distractor 1 | Distractor 2]
     - Use for sentence completion, synonyms, or choosing the best fit.
  2. **Multiple Choice**: [Multi: Correct | Distractor 1 | Distractor 2]
     - Use for checking definitions, tones, or concepts.
  3. **Fill-in-the-blank**: [Quiz: Answer]
     - **CONSTRAINT**: Use this ONLY if the answer is absolutely unambiguous (e.g. spelling check, specific term recall) OR if the User Request specifically asks for fill-in/typing questions.

  STRUCTURE STRATEGY:
  Analyze the content and tags.

  **CASE A: VOCABULARY LESSON** (e.g. tags include "Vocabulary", "Vocab", or content is a list of words/phrases)
  If this is primarily a vocabulary lesson, follow this structure:
  1. **Section 1: Vocabulary Selection (3-5 items)**: Use [Select: Correct | Wrong 1 | Wrong 2] to test the nuance of collocations or specific words from the lesson.
  2. **Section 2: Meaning Matching (2-4 items)**: Use [Multi: Correct | Option 2 | Option 3] to match a term to its definition.
  3. **Section 3: Contextual Use (2-4 items)**: Provide short sentences with blanks using [Select: ...] where the user chooses the best synonym for a specific tone.

  **CASE B: OTHER LESSONS** (Grammar, General, Skills, etc.)
  - **Creative Flow**: Design a test flow that best suits the specific concepts taught (e.g., rewriting sentences, identifying errors, filling gaps).
  - Do NOT follow the fixed 3-section structure of Case A unless it fits perfectly.
  - **Contextual**: Focus on testing application in context.

  **DISTRACTOR DESIGN RULES (MANDATORY)**
   - Distractors must be semantically close to the correct answer.
   - All options must belong to the same lexical field and grammatical category.
   - Avoid obviously wrong answers.
   - The incorrect options should be plausible but fail due to nuance, intensity, tone, or collocation.
   - The difficulty should test subtle distinctions (e.g., demonstrate vs illustrate vs indicate).
   - Do NOT create distractors that are logically unrelated to the sentence.

  GENERAL GUIDELINES:
  - **No Repetition**: Do not simply repeat the essay text. Create new sentences or scenarios to test the knowledge.
  - **Language**: Instructions in the same language as the lesson's explanations (Vietnamese/English). Target material in English.
  - Do not use emoji, compact layout, no consecutive new lines.

  Return in code block format a JSON object:
  {
    "content": "string (Markdown with interactive test components)"
  }`;
}
