
import { User } from '../../app/types';

/**
 * Generates the prompt for the AI to refine an existing unit. (For manual AI workflow)
 */
export function getRefineUnitPrompt(editName: string, editDesc: string, editWords: string, editEssay: string, userRequest: string, user: User): string {
    const isDefaultName = editName === "New Unit";
    const hasNoContent = !editDesc.trim() && !editWords.trim() && !editEssay.trim();
    const shouldSkipCurrentData = isDefaultName && hasNoContent;
    
    let currentDataBlock = '';
    if (!shouldSkipCurrentData) {
      currentDataBlock = `CURRENT UNIT DATA:\n- Name: ${editName}\n- Description: ${editDesc || '(empty)'}\n- Current Words: ${editWords || '(empty)'} (Add more words/phrase/idioms from new essay for user to learn, max additional 20 items)\n- Essay: ${editEssay || '(empty)'}\n`;
    }
    
    const requestBlock = userRequest ? `USER REQUEST FOR REFINEMENT: "${userRequest}"` : "USER REQUEST FOR REFINEMENT: General improvement.";

    return `You are an expert IELTS coach, examiner, and native English speaker. Your task is to refine a vocabulary unit based on user context, existing data, and a new request.

USER PROFILE:
- Role: ${user.role}
- Level: ${user.currentLevel}

${currentDataBlock}
${requestBlock}

TASK:
1.  Read the user request and apply it to the CURRENT UNIT DATA to generate an improved essay.
2.  After generating the new essay, you MUST re-analyze its content to identify all relevant, high-value vocabulary.
3.  The 'words' array in your JSON response must be EXPANDED. It must include both original words (if they still appear in the essay) AND any NEW, useful words you've added to the essay. The goal is to grow the vocabulary list based on the new essay.
4.  Generate 3-5 reading comprehension questions based on the new essay. For each question, provide a concise, correct answer.

Return in code block format a strict JSON object with this schema:
{ 
  "name": "string (The updated unit name)", 
  "description": "string (The updated description)", 
  "words": ["string"], 
  "essay": "string (The full, updated essay text)",
  "comprehensionQuestions": [
    { "question": "string (Question 1)", "answer": "string (Concise answer 1)" },
    { "question": "string (Question 2)", "answer": "string (Concise answer 2)" }
  ]
}

'words' array format rules:
- Use "essay_word:base_word" ONLY if the word in the essay is a variation of the base form (e.g., "running:run", "cities:city").
- If the essay word IS the base form, use just the word (e.g., "environment"). DO NOT use "environment:environment".`;
}