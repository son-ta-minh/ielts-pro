import { User, VocabularyItem } from '../../app/types';

export function getLearningSuggestionsPrompt(word: VocabularyItem, user: User): string {
    // Sanitize word data to send to AI
    const wordData = {
        word: word.word,
        meaning: word.meaningVi,
        family: word.wordFamily,
        collocations: word.collocationsArray?.map(c => c.text),
        idioms: word.idiomsList?.map(i => i.text),
        paraphrases: word.paraphrases?.map(p => ({ word: p.word, tone: p.tone, context: p.context }))
    };

    return `You are an expert IELTS coach and English teacher. Your task is to provide learning recommendations for a vocabulary item based on a user's profile.

    USER PROFILE:
    - Role: ${user.role || 'N/A'}
    - Current Level: ${user.currentLevel || 'N/A'}
    - Target: ${user.target || 'N/A'}

    VOCABULARY ITEM TO ANALYZE:
    ${JSON.stringify(wordData, null, 2)}

    INSTRUCTIONS:
    1.  Analyze all components of the vocabulary item (word family, collocations, idioms, paraphrases).
    2.  Based on the USER PROFILE, decide whether each component is essential to learn ('learn') or can be ignored for now ('ignore').
    3.  Provide a concise, sharp 'reason' for each decision. Your reasoning is the most important part.
    4.  Be strict. For an IELTS learner, prioritize academic, high-impact, and flexible vocabulary. For a beginner, prioritize core meanings and common usage.

    EXAMPLE REASONING:
    - For an IELTS goal, if a paraphrase is "the process of a liquid turning into a gas," you should suggest 'ignore' and reason: "This is too descriptive and wordy for IELTS. A single academic term like 'evaporation' is more effective and scores higher for lexical resource."
    - For a primary school student goal, you might suggest 'learn' for the same phrase, reasoning: "This simple explanation is great for building foundational understanding before learning the scientific term."
    - For a common idiom, you might suggest 'learn' for an IELTS student: "Essential for demonstrating natural, native-like language in Speaking Part 1."

    Return a single, strict JSON object. Do not include any text outside the JSON block.

    STRICT JSON OUTPUT FORMAT:
    {
      "overall_summary": "string (A one-sentence summary of the learning strategy for this word, based on the user's goal.)",
      "wordFamily": [
        { "item": "string (the word form)", "suggestion": "learn" | "ignore", "reason": "string (your concise explanation)" }
      ],
      "collocations": [
        { "item": "string (the collocation)", "suggestion": "learn" | "ignore", "reason": "string" }
      ],
      "idioms": [
        { "item": "string (the idiom)", "suggestion": "learn" | "ignore", "reason": "string" }
      ],
      "paraphrases": [
        { "item": "string (the paraphrase word)", "suggestion": "learn" | "ignore", "reason": "string" }
      ]
    }
    `;
}
