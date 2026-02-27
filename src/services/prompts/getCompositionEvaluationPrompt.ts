
export function getCompositionEvaluationPrompt(text: string, context: string): string {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    
    let roleDescription = "an expert English teacher";
    let criteria = "Coherence, Vocabulary, and Grammar";

    const contextLower = context.toLowerCase();

    if (contextLower.includes('task 1')) {
        roleDescription = "a certified IELTS examiner";
        criteria = "Task Achievement, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy";
    } else if (contextLower.includes('task 2')) {
        roleDescription = "a certified IELTS examiner";
        criteria = "Task Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy";
    } else if (contextLower.includes('academic')) {
        roleDescription = "a university professor";
        criteria = "Formality, Clarity, Academic Vocabulary, and Structure";
    } else if (contextLower.includes('professional') || contextLower.includes('business')) {
        roleDescription = "a business communication expert";
        criteria = "Professionalism, Conciseness, Clarity, and Tone";
    } else if (contextLower.includes('informal') || contextLower.includes('email')) {
        roleDescription = "a native English speaker";
        criteria = "Naturalness, Idiomatic Usage, and Conversational Tone";
    } else {
        roleDescription = "a creative writing coach";
        criteria = "Creativity, Flow, Vocabulary, and Grammar";
    }

    return `You are ${roleDescription}.

    TASK:
    Analyze the following text written by a student. The context/tags are: **${context}**.
    
    TEXT (${wordCount} words):
    "${text}"

    YOUR ANALYSIS MUST INCLUDE:
    1.  **Overall Impression**: A very brief summary.
    2.  **Key Feedback**: 2-3 bullet points based on: **${criteria}**. Format as HTML (<ul>, <li>, <b>).
    3.  **Improvements**: Rewrite 1 sentence to show improvement.
    
    CONSTRAINT:
    Keep the entire feedback response **under 100 words**. Be concise and direct.
    
    Return in code block format a strict JSON object with this exact schema. Do not include any text outside the JSON block.

    {
      "feedback": "string (The feedback formatted as an HTML string)"
    }
    `;
}
