
export interface LessonPromptParams {
  // Common
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
  
  // Create New Mode
  topic?: string;
  
  // Refine Mode
  currentLesson?: { title: string; description: string; content: string };
  userRequest?: string;
}

export function getLessonPrompt(params: LessonPromptParams): string {
  const { topic, currentLesson, userRequest, language, targetAudience, tone, coachName } = params;
  
  const audioTag = language === 'Vietnamese' ? 'Audio-VN' : 'Audio-EN';
  const isRefineMode = !!currentLesson;

  let taskDescription = "";
  let contextBlock = "";

  if (isRefineMode && currentLesson) {
    taskDescription = `Refine and reformat the user's lesson notes into a structured, high-quality study resource.`;
    contextBlock = `
    CURRENT CONTENT:
    Title: ${currentLesson.title}
    Description: ${currentLesson.description}
    Body:
    ${currentLesson.content || '(empty)'}
    
    USER INSTRUCTIONS: "${userRequest || 'Format deeply, improve structure, correct errors, and add educational value.'}"
    `;
  } else {
    taskDescription = `Create a brand new lesson for a ${targetAudience} on topic: "${topic || 'General Knowledge'}".`;
    contextBlock = `USER REQUEST: "${userRequest || 'Create a comprehensive lesson.'}"`;
  }

  return `You are an expert educational content designer and IELTS coach.
  ROLE: You are '${coachName}', acting as a ${tone === 'friendly_elementary' ? 'friendly teacher' : 'professional professor'}.
    
  TASK: ${taskDescription}

  ${contextBlock}

  STRICT LANGUAGE RULES:
  1. CORE MATERIAL (Vocabulary Lists, Example Sentences, Exercises): Must be in English.
  2. META CONTENT (Greetings, CONCEPT DEFINITIONS, Explanations, Strategy Tips): In ${language}.

  FORMATTING RULES (CRITICAL):
  - **VOCAB LISTS**: List simple words on a SINGLE line separated by commas.
  - **NUMBERED LISTS**: Use sequential numbering (e.g., 1., 2., 3.) for ordered lists.
  - **DEFINITIONS**: Treat definitions as explanations. They MUST be spoken in ${language}.
  - **CONCISE TITLE**: Keep the title short and direct.
  - **TITLE OVERRIDE RULE**: If it's a pattern, use the BASE form (e.g., "be associated with", not "is associated with").
  - **COMPACT SPACING**: Keep the text dense. No extra empty lines between headings and content.

  INTERACTIVE ELEMENTS SYNTAX:
  1. **Hidden Answer**: Use \`[HIDDEN: content]\` for answers that should be hidden initially.
  2. **Tips**: Use \`[Content]\` (text inside brackets on a NEW LINE) for tips and notes.
  3. **Fill-in Quiz**: Use \`[Quiz: answer]\` for a text input field checking against 'answer'.
  4. **Multiple Choice**: Use \`[Multi: Correct Answer | Wrong Option | Wrong Option]\`. The FIRST option provided must be the correct one. The system will shuffle them automatically.
  5. **Dropdown Select**: Use \`[Select: Correct Answer | Wrong Option | Wrong Option]\`. It renders as a dropdown menu. The FIRST option provided must be the correct one. The system will shuffle them automatically. Use this for "Fill in the blank" exercises where you want to give hints.

  AUDIO BLOCK RULE (TOKEN SAVER - CRITICAL):
  - **WRAP ONLY META CONTENT**: Only wrap your explanations, greetings, and definitions inside \`[${audioTag}]\` and \`[/]\`.
  - **EXCLUDE CORE MATERIAL**: Do NOT wrap vocabulary lists, exercises, or headers (##) inside audio tags.
  
  EXAMPLE OF CORRECT STRUCTURE:
    ## Key Concepts
    [${audioTag}]
    ${language === 'Vietnamese' ? 'Chào con! Hôm nay chúng mình sẽ học về...' : 'Hello! Today we will learn about...'}
    [/]
    [Make sure to practice these daily!]
    * Word1, Word2, Word3
    
    1. Select the correct word:
    [Multi: Apple | Car | Sky]
    
    2. Type the missing word:
    The sky is [Quiz: blue].
    
    3. Choose the best fit:
    The ocean is [Select: deep | high | tall].

  TAGGING (STRICT): Return exactly ONE tag from: ["Writing", "Speaking", "Listening", "Reading", "Grammar", "Writing Task 1", "Writing Task 2", "Speaking Academic", "Speaking Casual", "Pattern", "Comparison"].

  STRICT JSON OUTPUT FORMAT:
  {
    "title": "string",
    "description": "string",
    "content": "string (Markdown using the tags defined above)",
    "tags": ["string"]
  }`;
}
