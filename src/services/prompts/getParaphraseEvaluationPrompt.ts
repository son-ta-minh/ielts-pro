import { ParaphraseMode } from '../../app/types';

/**
 * Generates prompt for evaluating a user's paraphrase attempt.
 */
export function getParaphraseEvaluationPrompt(original: string, draft: string, mode: ParaphraseMode): string {
    return `You are an expert IELTS coach, examiner, and native English speaker.
Task: Evaluate the student's paraphrase attempt.

Original Sentence: "${original}"
Student's Paraphrase: "${draft}"
Target Transformation: "${mode}"

Scoring Criteria:
1. Meaning (50%): Accuracy of preserving the original message.
2. Lexical Resource (25%): Sophistication of vocabulary/synonyms.
3. Grammar (25%): Structural variety and accuracy.

Mode Guidelines:
- MORE_ACADEMIC: Should use nominalization, passive voice, formal vocabulary.
- LESS_ACADEMIC: Natural, native-like conversation style.
- VARIETY: Different sentence structure.

Return a JSON object with:
{
  "score": number (0-100 overall),
  "meaningScore": number (0-100),
  "lexicalScore": number (0-100),
  "grammarScore": number (0-100),
  "feedback": "Analysis in HTML (<ul>, <li>, <b>). Detail the 3 criteria. Be strict.",
  "modelAnswer": "The ideal version."
}`;
}