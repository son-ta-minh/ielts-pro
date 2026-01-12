import { User, ParaphraseMode } from '../../app/types';

/**
 * Generates prompt for creating a new paraphrase task or getting hints for an existing one.
 */
export function getParaphraseTaskPrompt(tone: 'CASUAL' | 'ACADEMIC', targetMode: ParaphraseMode, user: User, context: string, sentence?: string): string {
    
    const toneInstruction = tone === 'CASUAL' ? 'a casual, spoken English' : 'a formal, academic';

    let hintInstruction = '';
    switch(targetMode) {
        case ParaphraseMode.MORE_ACADEMIC: hintInstruction = 'Provide hints on making the phrasing more formal and sophisticated.'; break;
        case ParaphraseMode.LESS_ACADEMIC: hintInstruction = 'Provide hints on making the phrasing sound more natural and conversational.'; break;
        case ParaphraseMode.VARIETY: hintInstruction = 'Provide hints on using different grammatical structures or synonyms.'; break;
    }

    return `You are an expert IELTS coach, examiner, and native English speaker.
User Profile: Role: ${user.role}, Level: ${user.currentLevel}, Native Language: ${user.nativeLanguage || 'N/A'}.
Topic context: "${context || 'General'}".

TASK:
- A sentence is provided below, which may be empty.
- If the "Provided Sentence" is NOT empty, you MUST use it for the task. The returned "sentence" field in the JSON MUST be this exact sentence.
- If the "Provided Sentence" IS empty, you MUST generate ${toneInstruction} sentence for the user to paraphrase.

Provided Sentence: "${sentence || ''}"

HINTS:
- You MUST ALWAYS generate 1 to 5 strategic hints for the final sentence (either the one provided or the one you generated).
- ${hintInstruction}

Return a strict JSON object with this exact schema:
{
  "sentence": "string (The sentence for the task. If a sentence was provided, return it verbatim. If not, this is the new sentence you generated.)",
  "hints": ["string"] (An array of hint strings.)
}
`;
}