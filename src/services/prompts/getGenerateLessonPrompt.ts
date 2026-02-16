
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
       - **EVERY SENTENCE** must be wrapped in audio tags.
       - **AUDIO STRATEGY (CRITICAL)**: 
         1. **NO MIXED LANGUAGES**: Do NOT put English words inside ${explanationAudioTag} tags. Split them out into [Audio-EN] tags.
       - No Markdown headers (###).
       - Use specific visual cues for the speaker (e.g. [Pause], [Excited]).`
    : `STYLE: COMPACT RICH ARTICLE (READING)
       - **COMPACT FORMAT**: Minimize vertical space. **NO double newlines (\n\n)**. **NO horizontal rules (---)**. Keep the layout dense.
       - Use Markdown Headers (###) for specific topics/sections.
       - **VISUAL STRUCTURE**: Do NOT use nested bullet points for examples.
       - **RICH ELEMENTS**: 
         1. **TABLES**: STRICTLY for **Comparative Matrices** (e.g. Pros vs Cons, Tense vs Usage) or **System Maps** at the end.
         2. Use **[Tip: ...]** blocks for quick insights.
         3. Use **[HIDDEN: ...]** tags ONLY for **Interactive Q&A**. 
         4. Use **[Formula: Part | Part]** for grammar patterns. 
         5. Use **Emojis** in headers.
       - **EXAMPLES**: Use Markdown Blockquotes (>) for examples.`;

  return `You are an expert IELTS coach named '${coachName}'. 
  
  TASK: Create an immersive, high-impact lesson for a ${targetAudience} on: "${topic}".

  METADATA RULES (STRICT):
  1. **title**: Concept-driven, metaphorical title (MAX 5 WORDS). 
     - Think: "Frozen Heat" (temperature), "Moral Compass" (ethics), "Fading Echoes" (memory). 
     - AVOID: "Words about...", "Vocabulary for...", "Advanced Verbs".
  2. **description**: Define the core conceptual boundary (MAX 15 WORDS). 
     - Sharp and precise. NO fluff ("This lesson covers..."). Focus on usage limits or unique value.
     - Example: "Distinguishes between physical impact and abstract influence in formal writing contexts."
  3. **searchKeywords**: Array of strings. 
     - Include ALL primary vocabulary, synonyms, and related terms.
     - FOR COMPARISON/INTENSITY: You MUST include every word being compared or placed on the scale.

  PEDAGOGICAL FLOW:
  1. **TEACHING**: Teach concepts clearly with nuance and examples.
  2. **CONSOLIDATION**: End with a summary using a **Comparison Matrix (Table)**.
  
  CRITICAL FORMATTING RULES:
  1. **NO META LABELS**: DO NOT use labels like "Nuance:", "Meaning:", "Definition:".
  2. **NATURAL WRITING**: Weave context *into* sentences.
  3. **HEADERS**: Use standard Markdown headers (###).

  STRICT TEACHING RULES:
  1. **EXPLAIN EVERY ITEM**: Explain *why* we use it (nuance) and provide a natural **Example Sentence**.
  2. **COACHING FLOW**: Walk through materials for "${topic}".
  3. **NO QUIZZES**: This is for the "Reading" tab only. No [Quiz:], [Select:], [Multi:].
  
  ${styleInstruction}

  LANGUAGE:
  - Explanations: ${language}.
  - Material: English.

  TAGGING RULES:
  - **"tags"**: EXACTLY ONE from: ["Grammar", "Pattern", "Speaking", "Listening", "Reading", "Writing", "General", "Comparison", "Vocabulary"].

  CRITICAL OUTPUT RULES:
  1. **MARKDOWN CODE BLOCK**: Wrap JSON in \`\`\`json ... \`\`\`.
  2. **NO RAW NEWLINES**: Use \`\\n\` (double backslash n) for line breaks in strings.
  3. **TABLES**: Use \`<br>\` for line breaks inside table cells. Do NOT use \`\\n\` or newlines inside table rows.

  OUTPUT TEMPLATE:
  \`\`\`json
  {
    "title": "string",
    "description": "string",
    "content": "string",
    "searchKeywords": ["string"],
    "tags": ["string"]
  }
  \`\`\``;
}
