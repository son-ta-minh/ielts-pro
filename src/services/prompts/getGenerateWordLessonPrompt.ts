
import { VocabularyItem, LessonPreferences } from '../../app/types';

export function getGenerateWordLessonPrompt(word: VocabularyItem, prefs: LessonPreferences, coachName: string): string {
  const language = prefs.language || 'English';
  const format = (prefs as any).format || 'reading';
  const isListeningMode = format === 'listening';
  const explanationAudioTag = language === 'Vietnamese' ? '[Audio-VN]' : '[Audio-EN]';

  const wordDetails = {
    word: word.word,
    meaning: word.meaningVi,
    family: word.wordFamily,
    collocations: word.collocationsArray?.filter(c => !c.isIgnored).map(c => ({ text: c.text, hint: c.d })),
    idioms: word.idiomsList?.filter(i => !i.isIgnored).map(i => ({ text: i.text, hint: i.d })),
    paraphrases: word.paraphrases?.filter(p => !p.isIgnored).map(p => ({ word: p.word, tone: p.tone, context: p.context })),
    prepositions: word.prepositions?.filter(p => !p.isIgnored)
  };

  const styleInstruction = isListeningMode 
    ? `STYLE: NATURAL SPOKEN AUDIO SCRIPT
       - Structure the content as a natural spoken narrative or conversation.
       - **EVERY SENTENCE** must be wrapped in either ${explanationAudioTag}text[/] (for explanations) or [Audio-EN]text[/] (for examples/terms).
       - No Markdown headers (###). Use transitional phrases instead.`
    : `STYLE: COMPACT RICH TEXTBOOK (READING)
       - **COMPACT FORMAT**: Minimize vertical space. **NO double newlines (\n\n)**. **NO horizontal rules (---)**.
       - Structure the content with Markdown Headers (###) for sections.
       - **RICH ELEMENTS**: 
         1. **TABLES**: Use Markdown Tables strictly for **comparing data** (e.g. Columns: Phrase | Nuance | Context) or **System Maps**. ❌ **PROHIBITED**: Do NOT use tables to enumerate words without contrast or explanation per cell.
         2. Use **[Tip: ...]** blocks for pronunciation tips or common mistakes.
         3. Use **[HIDDEN: ...]** tags ONLY for **Interactive Q&A**. 
            - **RULE**: The QUESTION must be visible OUTSIDE the tag. Only the ANSWER is inside.
            - Format: "Question? [HIDDEN: Answer]"
         4. Use **[Formula: Part | Part]** for grammar patterns. 
            - Format: "[Formula: Subject | Verb | Object]".
         5. Use **Emojis** liberally to make sections distinct.
       - **VISUALS**: Use Blockquotes (>) for ALL example sentences. Never use nested bullets.
       - **AUDIO**: Wrap the ${language} EXPLANATIONS/TEACHING in ${explanationAudioTag}text[/] tags. 
       - **NO AUDIO ON EXAMPLES**: Leave English examples as plain text (or bold) within the blockquote.`;

  return `You are expert IELTS Coach '${coachName}'.
  
  TASK: Generate a high-quality ${isListeningMode ? 'AUDIO SCRIPT' : 'READING'} lesson for the word: "${word.word}".
  
  DATA: ${JSON.stringify(wordDetails)}

  PEDAGOGICAL FLOW:
  1. **TEACHING**: Teach the word's family, collocations, and nuances.
  2. **SUMMARY**: End with a **System Map** or **Comparison Matrix** (Table) to summarize the word's ecosystem (e.g., Collocation types vs Tones).
  
  CRITICAL FORMATTING RULES:
  1. **NO META LABELS**: DO NOT use labels like "Nuance:", "Scenario Change:", "Context:", "Meaning:", "Definition:", or "Phase 1".
  2. **NATURAL WRITING**: Weave the nuance and context *into* the sentence. 
     - ❌ Bad: "Nuance: Used for formal events."
     - ✅ Good: "This phrase is specifically reserved for formal events..."
  3. **HEADERS**: Use standard Markdown headers (###) for content topics.

  ${styleInstruction}

  STRICT RULES:
  1. **NO SIMPLE LISTS**: Do not just list the data. Teach it with context and nuance.
  2. **EXAMPLE MANDATE**: Every key term MUST have an example sentence.
  3. **NO QUIZZES**: Do NOT generate [Select:], [Quiz:], or [Multi:] tags. This content is for explanation only.
  4. **TAGS**: Select tags ONLY from: ["grammar", "pattern", "speaking", "listening", "reading", "writing", "general", "comparison", "vocabulary"].
  5. **QUANTITY**: Return EXACTLY ONE tag. Choose the most primary skill only.

  CRITICAL OUTPUT RULES:
  1. **MARKDOWN CODE BLOCK**: You MUST wrap your entire JSON response in a markdown code block (e.g. \`\`\`json { ... } \`\`\`).
  2. **VALID JSON**: The content inside the code block must be valid, parsable JSON.
  3. **NO RAW NEWLINES IN STRINGS**: Inside the "content" string, you MUST use literal '\\n' for line breaks. Do NOT use actual newline characters.
  4. **ESCAPE CHARACTERS**: Properly escape all double quotes and backslashes within strings.

  OUTPUT TEMPLATE:
  \`\`\`json
  {
    "title": "Mastering: ${word.word}",
    "description": "string (Strategic usage overview)",
    "content": "string (Markdown formatted with \\n for newlines)",
    "tags": ["vocabulary"]
  }
  \`\`\``;
}