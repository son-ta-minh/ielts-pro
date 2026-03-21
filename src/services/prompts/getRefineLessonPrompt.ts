
export interface LessonPromptParams {
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
  task: 'create_reading' | 'refine_reading' | 'convert_to_listening';
  topic?: string;
  currentLesson?: { 
    title: string; 
    description: string; 
    content: string; 
    listeningContent?: string;
    intensityRows?: any[];
    comparisonRows?: any[];
    type?: string;
  };
  userRequest?: string;
  format?: 'reading' | 'listening';
  displayDirect?: boolean;
}

export function getLessonPrompt(params: LessonPromptParams): string {
  const { currentLesson, userRequest, language, tone, coachName, task, topic, displayDirect = false } = params;
  
  const isVietnamese = language === 'Vietnamese';
  const explanationLang = isVietnamese ? 'Vietnamese' : 'English';
  const isSpecialty = currentLesson?.type === 'intensity' || currentLesson?.type === 'comparison' || currentLesson?.type === 'mistake' || topic?.toLowerCase().includes('intensity') || topic?.toLowerCase().includes('comparison') || topic?.toLowerCase().includes('mistake');

  let systemTask = "";
  let formattingInstructions = "";
  let contextBlock = "";
  let contentRules = "";

  if (task === 'create_reading') {
      systemTask = isSpecialty 
        ? `Create a structured study guide for a ${params.targetAudience} comparing nuanced vocabulary related to: "${topic}".`
        : `Create an immersive, high-impact lesson for a ${params.targetAudience} on: "${topic}".`;
      if (userRequest?.trim()) {
        contextBlock = `FOCUS REQUEST: "${userRequest.trim()}"`;
      }
  } else if (task === 'convert_to_listening') {
      systemTask = `TRANSFORM the provided Reading Lesson into a high-quality NATURAL AUDIO SCRIPT.`;
      contextBlock = `SOURCE: ${currentLesson?.title}\n${currentLesson?.content}`;
  } else {
      systemTask = isSpecialty 
        ? `REFINE the reading material into a structured analysis table for the current vocabulary set.`
        : `REFINE the lesson to focus on Contextual Nuance and Visual Clarity.`;
      contextBlock = `CURRENT: ${currentLesson?.title}\n${currentLesson?.content}\nREQUEST: "${userRequest || 'Improve layout and examples.'}"`;
  }

  const metadataInstructions = `
  METADATA RULES (STRICT):
  1. **title**: Concept-driven, metaphorical title (MAX 5 WORDS). Think: "Frozen Heat", "Moral Compass".
  2. **description**: Define the core conceptual boundary (MAX 15 WORDS). Sharp and precise. NO fluff.
  3. **searchKeywords**: Array of strings. Include all primary words/synonyms. For comparison/intensity, include every compared word.`;

  if (isSpecialty && task !== 'convert_to_listening') {
      formattingInstructions = `
      STYLE: SYSTEMATIC ANALYSIS TABLE
      - You MUST use a Markdown Table as the primary structure.
      - COLUMNS: | Word | Explanation | Examples |
      - "Explanation": Keep it short (max 15 words). **Bold important phrases**.
      - "Examples": Provide EXACTLY TWO distinct examples per word.
      ${metadataInstructions}`;
      
      contentRules = `
      CONTENT REQUIREMENTS:
      1. Analyze the core words provided.
      2. **EXPANSION**: Introduce 2-3 NEW related high-frequency words.`;
  } else if (task === 'convert_to_listening') {
      formattingInstructions = `
      STYLE: NATURAL SPOKEN AUDIO SCRIPT
      - STRUCTURE: Natural spoken narrative.
      - **EVERY SENTENCE** must be wrapped in audio tags, closed audio tag is [/].
      - **AUDIO STRATEGY (CRITICAL)**:
        1. **NO MIXED LANGUAGES INSIDE ONE TAG**: Do NOT put English words inside Vietnamese tags. English words MUST be wrapped separately in [Audio-EN]...[/].
        2. **SAME SENTENCE CONTINUITY**: If a sentence contains both English and Vietnamese, keep them on the SAME LINE with adjacent tags. Do NOT insert line breaks between tags that belong to the same sentence.
           Correct: [Audio-EN]The Sun[/][Audio-VN]không chỉ là một ngôi sao...[/]
           Incorrect: [Audio-EN]The Sun[/]
              [Audio-VN]không chỉ là một ngôi sao...[/]
        3. **NO NESTED TAGS**: Never nest audio tags. Each segment must have its own flat tag.
      - No Markdown headers (###).
      - No tables in listening mode.`;
  } else {
      formattingInstructions = `
      STYLE: COMPACT RICH ARTICLE
      - Use Headers (###), Tips [Tip: ...], and Spoilers [HIDDEN: ...].
      - Use Blockquotes (>) for examples.
      ${metadataInstructions}`;
  }

  if (displayDirect) {
    return `You are expert IELTS coach '${coachName}', acting as a ${tone === 'friendly_elementary' ? 'friendly mentor' : 'professor'}.
    
  TASK: ${systemTask}

  ${contextBlock}
  ${contentRules}
  ${formattingInstructions}

  STRICT CONTENT RULES:
  1. NO generic introductions.
  2. MANDATORY: All coaching/explanations in ${explanationLang}.
  3. Do not return JSON, metadata fields, or code fences.
  4. Return only the final lesson body/content in Markdown that can be shown directly to the learner.
  5. If tables are needed, write them directly in Markdown.
  6. Do not add any explanation about the format.
  7. Use compacted layout, DO NOT add an empty line`;
  }

  return `You are expert IELTS coach '${coachName}', acting as a ${tone === 'friendly_elementary' ? 'friendly mentor' : 'professor'}.
    
  TASK: ${systemTask}

  ${contextBlock}
  ${contentRules}
  ${formattingInstructions}

  STRICT CONTENT RULES:
  1. NO generic introductions.
  2. MANDATORY: All coaching/explanations in ${explanationLang}.
  3. **TAGS**: Return EXACTLY ONE tag from: ["Grammar", "Pattern", "Speaking", "Listening", "Reading", "Writing", "General", "Comparison", "Vocabulary"].

  CRITICAL OUTPUT RULES:
  1. **MARKDOWN CODE BLOCK**: Wrap entire JSON response in \`\`\`json ... \`\`\`.
  2. **NO RAW NEWLINES**: Use literal '\\n' for line breaks.
  3. **TABLES**: Use \`<br>\` for line breaks inside table cells.

  Return in code block format OUTPUT TEMPLATE:
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
