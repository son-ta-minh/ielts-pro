interface TopicRecallPromptOptions {
    brainstormList: string;
    candidateBlock: string;
    currentTopic: string;
}

export function getTopicRecallEvaluationPrompt(
    { currentTopic, brainstormList, candidateBlock }: TopicRecallPromptOptions
): string {
    return [
        `You are StudyBuddy helping an IELTS learner in a Topic Recall game.`,

        `Topic: "${currentTopic}"`,

        `USER BRAINSTORM (grouped by categories):`,
        brainstormList,

        `WORD LIBRARY (reference only – DO NOT evaluate these words):`,
        candidateBlock,

        ``,
        `====================`,
        `EVALUATION RULES`,
        `====================`,

        `1. ONLY evaluate words from the USER BRAINSTORM.`,
        `2. Group names define MEANING CONTEXT (e.g., Habitat, Causes, Effects, Behavior).`,

        ``,
        `CORE LOGIC (VERY IMPORTANT):`,
        `A word is RELEVANT if:`,
        `- It relates to the topic, OR`,
        `- It logically fits its group meaning`,

        ``,
        `This means:`,
        `- Words do NOT need to directly mention the topic`,
        `- Group context ALONE is enough to make a word relevant`,

        ``,
        `STRICT FILTER:`,
        `Mark a word as NOT relevant ONLY IF:`,
        `- It does NOT relate to the topic`,
        `AND`,
        `- It does NOT fit its group meaning`,

        ``,
        `If there is ANY reasonable connection → KEEP the word`,
        `When unsure → KEEP the word`,

        ``,
        `====================`,
        `OUTPUT FORMAT`,
        `====================`,

        `A. NOT RELEVANT WORDS (if any):`,
        `- word → short reason (max 1 line)`,

        ``,
        `B. NEW SUGGESTED WORDS (max 10):`,
        `- Must be useful for this topic`,
        `- Must NOT repeat any brainstorm words`,
        `- PRIORITIZE words from the Word Library`,
        `- Output as a simple bullet list`,

        ``,
        `====================`,
        `STRICT OUTPUT RULES`,
        `====================`,

        `- DO NOT mention relevant words`,
        `- DO NOT explain your reasoning process`,
        `- DO NOT evaluate Word Library words`,
        `- KEEP everything concise`,
    ].join('\n');
}