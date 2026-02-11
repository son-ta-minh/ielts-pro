
export interface LessonPromptParams {
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
  task: 'create_reading' | 'refine_reading' | 'convert_to_listening';
  topic?: string;
  currentLesson?: { title: string; description: string; content: string; listeningContent?: string };
  userRequest?: string;
  format?: 'reading' | 'listening';
}

export function getLessonPrompt(params: LessonPromptParams): string {
  const { currentLesson, userRequest, language, tone, coachName, task, topic } = params;
  
  const isVietnamese = language === 'Vietnamese';
  const explanationLang = isVietnamese ? 'Vietnamese' : 'English';
  const explanationAudioTag = isVietnamese ? '[Audio-VN]' : '[Audio-EN]';

  let systemTask = "";
  let formattingInstructions = "";
  let contextBlock = "";
  let contentRules = "";

  if (task === 'create_reading') {
      systemTask = `Create an immersive, high-impact lesson for a ${params.targetAudience} on: "${topic}".`;
      
      formattingInstructions = `
       STYLE: COMPACT RICH ARTICLE (READING)
       - **COMPACT FORMAT**: Minimize vertical space. **NO double newlines (\n\n)**. **NO horizontal rules (---)**. Keep the layout dense.
       - Use Markdown Headers (###) to separate sections.
       - **RICH ELEMENTS**: 
         1. **TABLES**: Use strictly for **Comparative Matrices** or **System Maps** at the end. ❌ **PROHIBITED**: Do NOT use tables to enumerate words without contrast or explanation per cell. Use bullet points for lists.
         2. Use **[Tip: ...]** blocks for "Did you know?" or "Examiner Tip".
         3. Use **[HIDDEN: ...]** tags ONLY for **Interactive Q&A**. 
            - **RULE**: The QUESTION must be visible OUTSIDE the tag. Only the ANSWER is inside.
            - Format: "Question? [HIDDEN: Answer]"
         4. Use **[Formula: Part | Part]** for grammar patterns. Format: "[Formula: If | S | V(past)]".
         5. Use **Emojis** to engage the ${params.targetAudience} audience.
       - **EXAMPLES**: Use Markdown Blockquotes (>) for examples.`;
      
      contentRules = `
      PEDAGOGICAL FLOW:
      1. **TEACHING**: Teach concepts clearly with nuance and examples.
      2. **CONSOLIDATION**: End with a summary or comparison table.
      
      CRITICAL FORMATTING RULES:
      1. **NO META LABELS**: DO NOT use labels like "Nuance:", "Scenario Change:", "Context:", "Meaning:", "Definition:".
      2. **NATURAL WRITING**: Weave the nuance and context *into* the sentence naturally.
      3. **HEADERS**: Use standard Markdown headers (###) for the specific content topics.

      STRICT TEACHING RULES:
      1. **EXPLAIN EVERY ITEM**: For every vocabulary item, collocation, or idiom:
         - You MUST explain the **Nuance** (Why this word? What does it imply that others don't?).
         - You MUST provide a natural **Example Sentence**.
      2. **COMPARE PARAPHRASES**: Do not just list synonyms. Explain the **Scenario Change**. 
      3. **COACHING FLOW**: Structure the lesson as a guided walkthrough.
      `;

  } else if (task === 'convert_to_listening') {
    systemTask = `TRANSFORM the provided Reading Lesson into a high-quality NATURAL AUDIO SCRIPT.`;
    contextBlock = `SOURCE: ${currentLesson?.title}\n${currentLesson?.content}`;
    formattingInstructions = `
    - **Narrative Style**: Convert bullet points into natural spoken sentences.
    - **Context Focus**: For every term, explain 'When' and 'Why'.
    - **Individual Examples**: Provide an example sentence for every phrase mentioned.
    - **Language**: All coaching in ${explanationLang}.
    - **Audio Strategy (CRITICAL)**: 
      1. Wrap EVERY sentence in audio tags. 
      2. **NO MIXED LANGUAGES**: Do NOT put English words inside ${explanationAudioTag} tags. Split them out into [Audio-EN] tags.
         - ❌ Bad: ${explanationAudioTag}Từ hello nghĩa là xin chào[/]
         - ✅ Good: ${explanationAudioTag}Từ[/] [Audio-EN]hello[/] ${explanationAudioTag}nghĩa là xin chào[/]`;
  } else {
    // Refine Reading (Default)
    systemTask = `REFINE the lesson to focus on Contextual Nuance and Visual Clarity.`;
    contextBlock = `CURRENT: ${currentLesson?.title}\n${currentLesson?.content}\nREQUEST: "${userRequest || 'Improve layout and examples.'}"`;
    formattingInstructions = `
    - **Teach, Don't List**: Convert any bulleted lists of words into guided explanations.
    - **COMPACT FORMAT**: Minimize vertical space. **NO double newlines (\n\n)**. **NO horizontal rules (---)**.
    - **Rich Formatting**: Incorporate Markdown Tables ONLY for Comparisons/Matrices. ❌ **PROHIBITED**: Do NOT use tables for simple word lists without contrast. Use **[HIDDEN: ...]** ONLY for Q&A reveals (Question outside, Answer inside).
    - **Nuance Mapping**: Explain the difference between similar paraphrases or collocations.
    - **REMOVE QUIZZES**: Strictly remove any [Quiz:], [Select:], or [Multi:] tags. This content is for reading only.`;
    
    contentRules = `
    PEDAGOGICAL FLOW:
    1. **TEACHING**: Ensure concepts are explained separately first with nuance and examples.
    2. **SUMMARY**: Ensure the lesson ends with a structural summary. Use a table if applicable.
    
    CRITICAL FORMATTING RULES:
    1. **NO META LABELS**: DO NOT use labels like "Nuance:", "Scenario Change:", "Context:", "Meaning:".
    2. **NATURAL WRITING**: Weave the nuance and context *into* the sentence naturally.
    3. **HEADERS**: Use standard Markdown headers (###).
    `;
  }

  return `You are expert IELTS coach '${coachName}', acting as a ${tone === 'friendly_elementary' ? 'friendly mentor' : 'professor'}.
    
  TASK: ${systemTask}

  ${contextBlock}

  ${contentRules}

  ${formattingInstructions}

  STRICT CONTENT RULES:
  1. NO generic introductions.
  2. MANDATORY: All coaching text in ${explanationLang}.
  3. **NO QUIZZES**: Absolutely NO interactive tags ([Quiz], [Select], [Multi]). Provide pure educational content.
  4. **TAGS**: Select tags ONLY from: ["Grammar", "Pattern", "Speaking", "Listening", "Reading", "Writing", "General", "Comparison", "Vocabulary"].
  5. **QUANTITY**: Return EXACTLY ONE tag. Choose the most primary skill only.

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
    "content": "string",
    "tags": ["string"]
  }
  \`\`\``;
}
