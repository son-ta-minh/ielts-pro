
export interface LessonGenerationParams {
  topic: string;
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
  format?: 'reading' | 'listening';
}

export function getGenerateLessonPrompt(params: LessonGenerationParams): string {
  const { topic, language, targetAudience, tone, coachName, format } = params;
  const isListeningMode = format === 'listening';
  const explanationAudioTag = language === 'Vietnamese' ? '[Audio-VN]' : '[Audio-EN]';

  const styleInstruction = isListeningMode 
    ? `STYLE: NATURAL SPOKEN AUDIO SCRIPT
       - Structure the content as a natural spoken narrative or conversation.
       - **EVERY SENTENCE** must be wrapped in either ${explanationAudioTag}text[/] (for explanations) or [Audio-EN]text[/] (for examples/terms).
       - No Markdown headers (###).
       - Use specific visual cues for the speaker (e.g. [Pause], [Excited]).`
    : `STYLE: COMPACT RICH ARTICLE (READING)
       - **COMPACT FORMAT**: Minimize vertical space. **NO double newlines (\n\n)**. **NO horizontal rules (---)**. Keep the layout dense.
       - Use Markdown Headers (###) for specific topics/sections.
       - **VISUAL STRUCTURE**: Do NOT use nested bullet points for examples.
       - **RICH ELEMENTS**: 
         1. **TABLES**: STRICTLY for **Comparative Matrices** (e.g. Pros vs Cons, Tense vs Usage) or **System Maps** at the end where every column adds dimension. 
            - ❌ **PROHIBITED**: Do NOT use tables to enumerate words without contrast or explanation per cell (e.g. | word1 | word2 | word3 |). Use bullet points for lists.
         2. Use **[Tip: ...]** blocks for quick insights or "Did you know" facts.
         3. Use **[HIDDEN: ...]** tags ONLY for **Interactive Q&A**. 
            - **RULE**: The QUESTION must be visible OUTSIDE the tag. Only the ANSWER is inside.
            - Format: "Question here? [HIDDEN: Answer here]"
         4. Use **[Formula: Part | Part]** for grammar patterns. 
            - Format: "[Formula: If | S | V(past), S | would | V(base)]".
         5. Use **Emojis** in headers and key points to make it engaging for ${targetAudience}.
       - **EXAMPLES**: Use Markdown Blockquotes (>) for examples to make them stand out visually.
       - **AUDIO STRATEGY**: Wrap the ${language} EXPLANATIONS in ${explanationAudioTag}text[/] tags. Do NOT put audio tags on the English examples.`;

  return `You are an expert IELTS coach named '${coachName}'. 
  
  TASK: Create an immersive, high-impact lesson for a ${targetAudience} on: "${topic}".

  PEDAGOGICAL FLOW:
  1. **TEACHING**: Teach concepts clearly with nuance and examples.
  2. **CONSOLIDATION**: End with a summary using a **Comparison Matrix (Table)** or a clear **Pattern Blueprint**.
  
  CRITICAL FORMATTING RULES:
  1. **NO META LABELS**: DO NOT use labels like "Nuance:", "Scenario Change:", "Context:", "Meaning:", "Definition:", or "Phase 1".
  2. **NATURAL WRITING**: Weave the nuance and context *into* the sentence. 
     - ❌ Bad: "Nuance: Used for formal events."
     - ✅ Good: "This phrase is specifically reserved for formal events..."
  3. **HEADERS**: Use standard Markdown headers (###) for the specific content topics.

  STRICT TEACHING RULES:
  1. **EXPLAIN EVERY ITEM**: For every vocabulary item, collocation, or idiom:
     - You MUST explain *why* we use it (nuance) directly in the explanation sentence.
     - You MUST provide a natural **Example Sentence**.
  2. **COMPARE PARAPHRASES**: Do not just list synonyms. Explain the difference in scenario directly.
  3. **COACHING FLOW**: Structure the lesson as a guided walkthrough.
  4. **NO LINGUISTIC DEFINITIONS**: Skip "What is a collocation". Focus 100% on the materials for "${topic}".
  5. **PURE TEACHING CONTENT**: This output is for the "Reading" tab only. **DO NOT GENERATE QUIZZES**. Do not use [Quiz:], [Select:], [Multi:].
  
  ${styleInstruction}

  LANGUAGE:
  - Explanations: ${language}.
  - Material: English.

  TAGGING RULES:
  - **"tags" MUST be selected ONLY from this list**: ["grammar", "pattern", "speaking", "listening", "reading", "writing", "general", "comparison", "vocabulary"].
  - **QUANTITY**: Return EXACTLY ONE tag. Choose the most primary skill only.

  CRITICAL OUTPUT RULES:
  1. **MARKDOWN CODE BLOCK**: You MUST wrap your entire JSON response in a markdown code block (e.g. \`\`\`json { ... } \`\`\`).
  2. **VALID JSON**: The content inside the code block must be valid, parsable JSON.
  3. **NO RAW NEWLINES IN STRINGS**: Inside the "content" string, you MUST use literal '\\n' for line breaks. Do NOT use actual newline characters.
  4. **ESCAPE CHARACTERS**: Properly escape all double quotes and backslashes within strings.

  OUTPUT TEMPLATE:
  \`\`\`json
  {
    "title": "string",
    "description": "string",
    "content": "string (Markdown formatted with \\n for newlines)",
    "tags": ["string"]
  }
  \`\`\``;
}