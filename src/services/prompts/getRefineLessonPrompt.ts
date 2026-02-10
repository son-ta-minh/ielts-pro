
export interface LessonPromptParams {
  // Common
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
  task: 'create_reading' | 'refine_reading' | 'convert_to_listening';
  
  // Data
  topic?: string;
  currentLesson?: { title: string; description: string; content: string; listeningContent?: string };
  userRequest?: string;
  format?: 'reading' | 'listening';
}

export function getLessonPrompt(params: LessonPromptParams): string {
  const { topic, currentLesson, userRequest, language, targetAudience, tone, coachName, task } = params;
  
  const isVietnamese = language === 'Vietnamese';
  const explanationLang = isVietnamese ? 'Vietnamese' : 'English';
  const audioTag = isVietnamese ? 'Audio-VN' : 'Audio-EN';

  let systemTask = "";
  let formattingInstructions = "";
  let contextBlock = "";

  if (task === 'convert_to_listening') {
    systemTask = `TRANSFORM the provided Reading Lesson into a high-quality, focused LISTENING SCRIPT (Podcast style).`;
    contextBlock = `
    READING CONTENT TO CONVERT:
    Title: ${currentLesson?.title}
    Content: ${currentLesson?.content}
    `;
    formattingInstructions = `
    FORMATTING STYLE: LISTENING ONLY (PODCAST SCRIPT)
    - **No Meta-Talk**: Skip explaining what an idiom or collocation is. Focus 100% on usage.
    - **Language of Instruction**: Explain everything in ${explanationLang}. 
    - **Tagging**: Inside [${audioTag}], you MUST translate all linguistic terms to ${explanationLang}.
    - **Strict Tag Splitting**: [${audioTag}]Meaning of[/] [Audio-EN]word[/] [${audioTag}]is...[/]
    `;
  } else if (task === 'refine_reading') {
    systemTask = `Refine the provided Reading Lesson. Fix ambiguous quizzes.`;
    contextBlock = `
    CURRENT CONTENT:
    Title: ${currentLesson?.title}
    Body: ${currentLesson?.content}
    USER REQUEST: "${userRequest || 'Make it sharper and remove redundant meta-explanation.'}"
    `;
    formattingInstructions = `
    FORMATTING STYLE: READING & INTERACTIVE
    - **Fix Quizzes**: If there are [Quiz: ...] tags where the answer isn't 100% unique (like a fixed preposition), you MUST CONVERT them to [Select: Correct | Distractor 1 | Distractor 2] to ensure the user knows exactly what is expected.
    - **Explanation Language**: Strictly use ${explanationLang} for all instructional text.
    - **Tagging**: Apply strict tag splitting.
    `;
  } else {
    systemTask = `Create a sharp, focused Reading Lesson in ${explanationLang} for a ${targetAudience} on: "${topic}".`;
    contextBlock = `USER REQUEST: "${userRequest || 'Create a targeted lesson.'}"`;
    formattingInstructions = `
    FORMATTING STYLE: READING & INTERACTIVE
    - **Rule**: Prefer [Select: ...] over [Quiz: ...] unless the answer is a fixed single word.
    - **Language**: Instructions and explanations MUST be in ${explanationLang}.
    `;
  }

  return `You are an expert IELTS coach.
  ROLE: You are '${coachName}', acting as a ${tone === 'friendly_elementary' ? 'friendly teacher' : 'professional professor'}.
    
  TASK: ${systemTask}

  ${contextBlock}

  ${formattingInstructions}

  STRICT CONTENT RULES:
  1. DO NOT explain definitions of linguistic terms (e.g., "what an idiom is").
  2. QUIZ CLARITY: Use [Select: ...] for any blank that could have multiple synonyms. Provide clear distractors.
  3. MANDATORY: All explanations, feedback, and meta-text MUST be in ${explanationLang}.
  4. Use Markdown with [Audio-VN] (for Vietnamese explanation parts) and [Audio-EN] (for English examples/words) tags correctly.

  Return a strict JSON object:
  {
    "title": "string",
    "description": "string",
    "content": "string",
    "tags": ["string"]
  }`;
}
