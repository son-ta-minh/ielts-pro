
import { VocabularyItem, LessonPreferences } from '../../app/types';

export function getGenerateWordLessonPrompt(word: VocabularyItem, prefs: LessonPreferences, coachName: string): string {
  const language = prefs.language || 'English';
  const tone = prefs.tone || 'friendly_elementary';
  const format = (prefs as any).format || 'reading';
  const isListeningMode = format === 'listening';

  const wordDetails = {
    word: word.word,
    meaning: word.meaningVi,
    ipa: word.ipa,
    family: word.wordFamily,
    collocations: word.collocationsArray?.filter(c => !c.isIgnored).map(c => ({ text: c.text, hint: c.d })),
    idioms: word.idiomsList?.filter(i => !i.isIgnored).map(i => ({ text: i.text, hint: i.d })),
    paraphrases: word.paraphrases?.filter(p => !p.isIgnored).map(p => ({ word: p.word, tone: p.tone, context: p.context })),
    prepositions: word.prepositions?.filter(p => !p.isIgnored)
  };

  const formatInstructions = isListeningMode ? 
    `FORMATTING STYLE: LISTENING ONLY (PODCAST SCRIPT)
    - **Word-Centric**: Focus only on the nuances of "${word.word}".
    - **TAG SPLITTING (CRITICAL)**: Never include the English word "${word.word}" or any example inside an [Audio-VN] tag. You MUST split the tags.
    - **Term Translation**: Use Vietnamese for "thành ngữ", "ví dụ", "cụm từ".
    - **Voice**: Speak as '${coachName}'.` :
    `FORMATTING STYLE: READING & INTERACTIVE
    - **Direct Knowledge**: Use strict tag splitting.
    - **Interactive**: 
        - Use [Select: Correct | Wrong1 | Wrong2] for most interactive elements.
        - Use [Multi: Correct | Wrong1 | Wrong2] for standalone checks.
        - DO NOT use [Quiz: ...] if multiple answers could fit (e.g., synonyms). Use [Select: ...] instead to guide the user.` ;

  return `You are an expert IELTS coach named '${coachName}'.
  
  TASK: Generate a high-quality ${isListeningMode ? 'LISTENING (PODCAST)' : 'READING'} lesson about: "${word.word}".
  
  DATA: ${JSON.stringify(wordDetails)}

  ${formatInstructions}

  STRICT RULES:
  1. **NO ENGLISH WORDS IN [Audio-VN]**. Split tags every time.
  2. **QUIZ CLARITY**: Avoid [Quiz: ...] for open-ended blanks. If the user has to guess between "misinterpreted" and "misunderstood", use [Select: misinterpreted | misunderstood | mistaken].
  3. **COMPACT LAYOUT**: No horizontal rules (---). Minimal empty lines.
  4. **AUDIO TAG INTEGRITY**: Content inside [Audio-XX]...[/] MUST be on a single continuous string with no literal newlines.

  Return a JSON object:
  {
    "title": "Mastering: ${word.word}",
    "description": "string",
    "content": "string (Markdown with [Audio-VN] and [Audio-EN])",
    "tags": ["Vocabulary"]
  }`;
}
