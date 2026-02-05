
export function getGenerateConversationPrompt(topic: string): string {
    return `You are an expert IELTS coach and scenario designer.
    
    TASK: Generate a natural, realistic English conversation based on the topic: "${topic}".
    
    CONSTRAINTS:
    1.  The conversation must involve 2 to 3 distinct speakers.
    2.  Assign each speaker a name and a sex (male or female).
    3.  The conversation should have 10 to 15 sentences in total.
    4.  The language should be appropriate for an IELTS candidate (ranging from casual to semi-formal depending on the topic).
    5.  Use high-value vocabulary and natural lexical chunks.
    6.  Assign an "icon" (emoji string) to EVERY single sentence representing the speaker's specific emotion or tone at that moment. Use emojis exclusively from the "Smiley and Emotion" fluent group.
    
    STRICT JSON OUTPUT FORMAT:
    Return a single JSON object. Do not include any text outside the JSON block.
    
    {
      "title": "string (A catchy title for the conversation)",
      "description": "string (Short context for the conversation)",
      "speakers": [
        { "name": "string (e.g., 'Alice')", "sex": "male" | "female" }
      ],
      "sentences": [
        { "speakerName": "string", "text": "string (verbatim what they say)", "icon": "string (emotional emoji)" }
      ],
      "tags": ["string (3-5 relevant IELTS tags)"]
    }
    `;
}
