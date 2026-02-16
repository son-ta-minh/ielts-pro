
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
}

export function getLessonPrompt(params: LessonPromptParams): string {
  const { currentLesson, userRequest, language, tone, coachName, task, topic } = params;
  
  const isVietnamese = language === 'Vietnamese';
  const explanationLang = isVietnamese ? 'Vietnamese' : 'English';
  const isSpecialty = currentLesson?.type === 'intensity' || currentLesson?.type === 'comparison' || topic?.toLowerCase().includes('intensity') || topic?.toLowerCase().includes('comparison');

  let systemTask = "";
  let formattingInstructions = "";
  let contextBlock = "";
  let contentRules = "";

  if (task === 'create_reading') {
      systemTask = isSpecialty 
        ? `Create a structured study guide for a ${params.targetAudience} comparing nuanced vocabulary related to: "${topic}".`
        : `Create an immersive, high-impact lesson for a ${params.targetAudience} on: "${topic}".`;
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
      - STRUCTURE: Natural spoken narrative.
      - AUDIO STRATEGY: Wrap EVERY sentence in [Audio-VN] or [Audio-EN] tags.`;
  } else {
      formattingInstructions = `
      STYLE: COMPACT RICH ARTICLE
      - Use Headers (###), Tips [Tip: ...], and Spoilers [HIDDEN: ...].
      - Use Blockquotes (>) for examples.
      ${metadataInstructions}`;
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
