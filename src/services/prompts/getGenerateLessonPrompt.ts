
export interface LessonGenerationParams {
  topic: string;
  language: 'English' | 'Vietnamese';
  targetAudience: 'Kid' | 'Adult';
  tone: 'friendly_elementary' | 'professional_professor';
  coachName: string;
}

export function getGenerateLessonPrompt(params: LessonGenerationParams): string {
  const { topic, language, targetAudience, tone, coachName } = params;

  return `You are an expert educational content creator.
  ROLE: You are '${coachName}'.

  STRICT CONTENT RULES:
  1. **NO LINGUISTIC THEORY**: Don't define what idioms/collocations are. Explain the specific phrase "${topic}" only.
  2. **NO ENGLISH IN VN TAGS**: Every English word MUST be in [Audio-EN]. Break [Audio-VN] tags to accommodate this.
     Example: [Audio-VN]Cụm từ[/] [Audio-EN]from the horse's mouth[/] [Audio-VN]nghĩa là...[/]
  3. **TRANSLATE TERMS**: Use "thành ngữ", "ví dụ", "cụm từ" instead of "idiom", "example", "collocation" inside Vietnamese blocks.
  4. **NO EMPTY/PUNCTUATION TAGS**: Absolutely no tags like [Audio-VN].[/].
  5. **NO IPA**: Do not include phonetic symbols in audio tags.

  COMPACT LAYOUT RULES:
  - **NO HORIZONTAL LINES**: Do not use "---" or any thematic breaks.
  - **MINIMAL SPACING**: Use single newlines for standard separation. Use double newlines (\n\n) ONLY between major sections. NEVER use triple newlines.
  - **AUDIO TAG INTEGRITY**: Ensure the text inside [Audio-XX]...[/] does NOT contain actual line breaks.

  INTERACTIVE QUIZ RULES:
  - **PRIORITIZE SELECTION**: Use [Select: Correct | Distractor 1 | Distractor 2] for context-based blanks.
  - **USE MULTI-CHOICE**: Use [Multi: Correct | Distractor 1 | Distractor 2] for choosing between meanings or synonyms.
  - **AVOID AMBIGUOUS FILL-INS**: Only use [Quiz: answer] if the answer is 100% unique and obvious (e.g., a fixed preposition). If multiple synonyms could fit, you MUST use [Select: ...].
  - **GOOD DISTRACTORS**: For [Select], use distractors that make sense grammatically but are slightly off in meaning or collocation nuance.

  LANGUAGE RULES:
  - CORE MATERIAL: English.
  - EXPLANATIONS: ${language}.

  TASK: Create a focused lesson for a ${targetAudience} on topic: "${topic}".

  OUTPUT: Return a single JSON object:
  {
    "title": "string",
    "description": "string",
    "content": "string (Markdown with interactive tags and Audio tags. Apply strict tag splitting and term translation.)"
  }`;
}
