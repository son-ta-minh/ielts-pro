
import { VocabularyItem, LessonPreferences } from '../../app/types';

export function getGenerateWordLessonEssayPrompt(word: VocabularyItem, prefs: LessonPreferences, coachName?: string): string {
  const language = prefs.language || 'English';

  const wordDetails = {
    word: word.word,
    meaning: word.meaningVi,
    family: word.wordFamily,
    collocations: word.collocationsArray?.filter(c => !c.isIgnored).map(c => ({ text: c.text, hint: c.d })),
    idioms: word.idiomsList?.filter(i => !i.isIgnored).map(i => ({ text: i.text, hint: i.d })),
    paraphrases: word.paraphrases?.filter(p => !p.isIgnored).map(p => ({ word: p.word, tone: p.tone, context: p.context })),
    prepositions: word.prepositions?.filter(p => !p.isIgnored)
  };

  return `You are an expert IELTS coach${coachName ? ` named '${coachName}'` : ''}. 
  
  TASK: Generate a highly structured "Usage Guide" for the word: "${word.word}".
  
  DATA: ${JSON.stringify(wordDetails)}

  INSTRUCTIONS:
  1. Create 5 distinct sections, each containing a Markdown Table:
     - **Prepositions**
     - **Word Family**
     - **Collocations**
     - **Variations (Paraphrases)**
     - **Idioms**
  
  2. Each table MUST have exactly these 3 columns:
     - **Word**: The specific form, collocation, or phrase.
     - **Context**: A brief explanation of *when* or *how* to use it (nuance, tone, or grammatical rule).
     - **Examples**: EXACTLY one high-quality, natural example sentence using that specific item.

  3. CONSTRAINTS:
     - Use ONLY Markdown tables for the usage data.
     - For line breaks WITHIN a table cell, use \`<br>\`. Do NOT use \`\\n\` or \`\\\\n\` inside table rows.
     - You MUST provide at least 1 example for every single item listed in the tables.
     - Keep the "Context" column concise (max 15 words).
     - If no data exists for a category (e.g., no idioms), you may skip that section or note it as "No common idioms".
     - All instructional text and headers should be in ${language}. All material/examples in English.

  Return a JSON object:
  {
    "content": "string (Markdown formatted with headers and tables, use \\n for newlines)"
  }`;
}

export function getGenerateWordLessonTestPrompt(word: VocabularyItem, prefs: LessonPreferences, coachName?: string): string {
    const language = prefs.language || 'English';
    const wordDetails = {
      word: word.word,
      meaning: word.meaningVi,
      collocations: word.collocationsArray?.filter(c => !c.isIgnored).map(c => ({ text: c.text, hint: c.d })),
      idioms: word.idiomsList?.filter(i => !i.isIgnored).map(i => ({ text: i.text, hint: i.d })),
      paraphrases: word.paraphrases?.filter(p => !p.isIgnored).map(p => ({ word: p.word, tone: p.tone, context: p.context }))
    };

    return `You are an expert IELTS examiner${coachName ? ` working with coach '${coachName}'` : ''}. Design an interactive PRACTICE TEST for: "${word.word}".
    
    DATA: ${JSON.stringify(wordDetails)}

    AVAILABLE TAGS:
    - [Select: Correct | Wrong 1 | Wrong 2] (Dropdown)
    - [Multi: Correct | Option 2 | Option 3] (Multiple Choice Buttons)
    - [Quiz: Answer] (Fill-in)

    TASK:
    Generate 5-8 questions covering:
    1. Nuanced collocation choice.
    2. Meaning selection.
    3. Sentence completion with correct word forms.
    4. Synonym selection for specific contexts.

    LANGUAGE: Instructions in ${language}, questions in English.

    Return a JSON object:
    {
      "content": "string (Markdown with interactive tags)"
    }`;
}

/* Added unified function expected by templates */
export function getGenerateWordLessonPrompt(word: VocabularyItem, prefs: any, coachName: string): string {
  const format = prefs.format || 'reading';
  if (format === 'test') {
      return getGenerateWordLessonTestPrompt(word, prefs, coachName);
  }
  return getGenerateWordLessonEssayPrompt(word, prefs, coachName);
}
