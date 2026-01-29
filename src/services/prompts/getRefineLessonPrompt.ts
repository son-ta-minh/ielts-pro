import { Lesson } from '../../app/types';

export function getRefineLessonPrompt(
    currentLesson: { title: string; description: string; content: string },
    userRequest: string
): string {
    const contentBlock = `CURRENT CONTENT:\nTitle: ${currentLesson.title}\nDescription: ${currentLesson.description}\nBody:\n${currentLesson.content || '(empty)'}`;
    
    const requestBlock = userRequest ? `USER INSTRUCTIONS: "${userRequest}"` : "USER INSTRUCTIONS: Format deeply, improve structure, correct errors, and add educational value.";

    return `You are an expert educational content designer and IELTS coach.
    
    TASK: Refine and reformat the user's lesson notes into a structured, high-quality study resource using Markdown.

    ${contentBlock}
    ${requestBlock}

    GUIDELINES:
    1.  **Structure**: 
        - Organize the content logically with H1, H2, H3 headings.
        - **CONCISE TITLE**: Keep the title short and direct. Remove fluff like "Introduction to...", "Usage of...", or "...: Meaning and Examples". (e.g., Change "Adjective + V-ing Pattern: Meaning, Usage, and Examples" to just "Adjective + V-ing Pattern").
        - **TITLE OVERRIDE RULE (CRITICAL)**:
          If the lesson teaches a grammatical or lexical pattern,
          the title MUST be written in its BASE PATTERN form
          (e.g. "be associated with", "have long + V3", "It is ... that ..."),
          NOT in a conjugated or sentence-level form
          (e.g. NOT "is associated with", "has long been", "it is").
    2.  **Formatting & Layout (COMPACT UX)**: 
        - Use **Tables** for vocabulary lists, grammar structures, or comparisons.
        - **NO REDUNDANCY**: If a grammar pattern or form is defined in a text section (e.g. "Form: be + adj + V-ing"), **DO NOT** repeat this pattern as a column in the subsequent table. The table should focus on **Meaning** and **Usage/Examples** only.
        - Use **Bold** for key terms.
        - Use *Italics* for examples. **Important**: Examples must be in italics ONLY. Do NOT use bold or change the font style for examples.
        - Use > Blockquotes for important rules or summary points.
        - **STRICTLY NO HORIZONTAL LINES**: Do NOT use '---' or <hr /> tags to separate sections.
        - **COMPACT SPACING (CRITICAL)**: Keep the text dense and efficient for reading. Do NOT add extra empty lines (e.g., \`\\n\\n\`) between headings and content or between sections.
    3.  **Pedagogy & Interaction**: 
        - Add a "💡 Pro Tip" section if relevant.
        - Correct any obvious grammar or spelling errors.
        - **HIDDEN ANSWERS**: If there are questions, quizzes, or practice exercises, you MUST hide the answers using the syntax: [HIDDEN: The Answer Here]. This creates a click-to-reveal button.
    4.  LANGUAGE RULES (VERY STRICT):
        - The document is ENGLISH-ONLY.
        - Vietnamese is allowed ONLY in the following cases:
          1. Inside a table column explicitly labeled “Meaning”, “Nghĩa”, or similar.
          2. Inside parentheses immediately following a word or phrase to explain its meaning
             (e.g. plateau (đỉnh), dip (giảm nhẹ)).
        - Vietnamese must NEVER appear as:
          • sentence-level explanations
          • standalone notes
          • paragraph comments
          • labels such as “Vietnamese note”
        - Do NOT translate any sentence into Vietnamese.
        - Do NOT add new Vietnamese explanations beyond those already provided.
    5.  **Tagging (STRICT)**:
        - Analyze the content and return exactly **ONE** tag from the allowed list below.
        - **ALLOWED TAGS**: [
            "Writing", "Speaking", "Listening", "Reading", "Grammar", 
            "Writing Task 1", "Writing Task 2", 
            "Speaking Academic", "Speaking Casual", 
            "Pattern", "Comparison"
          ].
        - **FORBIDDEN TAGS**: Do NOT use "Vocabulary", "Idiom", "Collocation".
        - **Selection Logic**: 
          - Prioritize specific tags (e.g., "Writing Task 2") over broad ones (e.g., "Writing") if the content is specific.
          - If the content doesn't fit a specific tag, use the broad system tags (e.g., "Grammar").
        
        - **TAGGING OVERRIDE RULE (VERY HIGH PRIORITY)**:
          If the lesson focuses on a reusable grammatical structure or formula
          that can naturally appear in both speaking and writing,
          and the goal is pattern recognition rather than task-specific strategy,
          you MUST tag it as "Pattern",
          even if the structure is commonly used in IELTS Speaking/Writing Task.

        - **TAGGING OVERRIDE RULE (HIGH PRIORITY)**:
          If the pattern is primarily used in natural conversation, spoken fluency, or informal expression,
          and is NOT recommended for formal writing or academic essays,
          you MUST tag it as "Speaking Casual" even if it involves grammar structures.

    STRICT JSON OUTPUT FORMAT:
    Return a single JSON object. Do not include any text outside the JSON block.

    {
      "title": "string (Refined title)",
      "description": "string (Refined short description)",
      "content": "string (The complete, formatted Markdown content)",
      "tags": ["string (Single tag from the allowed list)"]
    }
    `;
}