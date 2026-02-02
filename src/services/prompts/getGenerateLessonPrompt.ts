
export interface LessonGenerationParams {
  topic: string;
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
}

export function getGenerateLessonPrompt(params: LessonGenerationParams): string {
  const { topic, language, targetAudience, tone, coachName } = params;

  // Set audio tag based on user's language preference
  const audioTag = language === 'Vietnamese' ? 'Audio-VN' : 'Audio-EN';

  return `You are an expert educational content creator.
  ROLE: You are '${coachName}', acting as a ${tone === 'friendly_elementary' ? 'friendly teacher' : 'professional professor'}.

  STRICT LANGUAGE RULES:
  1. CORE MATERIAL (Vocabulary Lists, Example Sentences, Exercises): Must be in English.
  2. META CONTENT (Greetings, CONCEPT DEFINITIONS, Explanations, Strategy Tips): In ${language}.
  
  FORMATTING RULES (CRITICAL):
  - **VOCAB LISTS**: If you are listing simple words (like pronouns, basic nouns), do NOT put them one-per-line. List them on a SINGLE line separated by commas or bullets.
  - **NUMBERED LISTS**: Use sequential numbering (e.g., 1., 2., 3.) for ordered lists.
  - **DEFINITIONS**: Treat definitions (e.g., "A pronoun is...") as explanations. They MUST be wrapped in audio tags and written in ${language}.
  - **INTERACTIVE ELEMENTS**:
    - **Hidden/Reveal**: Use \`[HIDDEN: content]\` for answers to questions, key takeaways, or pop-quiz answers.
    - **Tips**: Use \`[Content]\` (text inside brackets on a NEW LINE) for strategy tips, exam advice, or important notes.
    - **Fill-in Quiz**: Use \`[Quiz: answer]\` for input fields.
    - **Multi Choice Buttons**: Use \`[Multi: Correct | Option | Option]\`.
    - **Dropdown Select**: Use \`[Select: Correct | Option | Option]\`. (Good for sentence completion with hints).

  AUDIO BLOCK RULE (TOKEN SAVER - CRITICAL):
  - **WRAP ONLY META CONTENT**: Only wrap your explanations, greetings, and definitions inside \`[${audioTag}]\` and \`[/]\`.
  - **EXCLUDE CORE MATERIAL**: Do NOT wrap vocabulary lists meant for study or exercises inside audio tags.
  - **NO HEADERS INSIDE**: Do NOT wrap headers (##) inside audio tags.
  
  EXAMPLE OF CORRECT STRUCTURE:
    ## What Is a Pronoun?
    [${audioTag}]
    ${language === 'Vietnamese' ? 'Đại từ là từ dùng để thay thế cho danh từ để tránh lặp lại đấy con!' : 'A pronoun is a word used to replace a noun to avoid repetition!'}
    [/]
    [Remember: Pronouns must agree with the noun!]
    * I, You, He, She, It, We, They
    
    1. What replaces a noun?
    Answer: [HIDDEN: A pronoun]
    
    2. Give an example.
    Answer: [Select: He | The | A]

  TASK: Create a lesson for a ${targetAudience} on topic: "${topic}".

  OUTPUT: Return a single JSON object:
  {
    "title": "string",
    "description": "string",
    "content": "string (Markdown using the [${audioTag}]...[/] wrappers, [HIDDEN:...] blocks, [Quiz:...], [Multi:...] and [Select:...] tags)"
  }`;
}
