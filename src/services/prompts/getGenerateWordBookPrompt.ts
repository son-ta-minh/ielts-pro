export function getGenerateWordBookPrompt(topic: string): string {
    const availableColors = `["#5d4037", "#263238", "#2e7d32", "#821c21", "#4a2c2a", "#37474f", "#4e342e", "#004d40"]`;
    return `You are an expert IELTS coach and vocabulary curator. Your task is to generate a thematic "Word Book".
    
    USER REQUESTED TOPIC: "${topic}"

    INSTRUCTIONS:
    1.  **Analyze the Topic**: Understand the core concept of "${topic}".
    2.  **Find a Central Icon**: Select a single, simple, high-quality emoji that best represents the topic.
    3.  **Generate Vocabulary**: Create a list of 15-20 essential, high-value vocabulary items (words or short phrases) directly related to the topic.
    4.  **Provide Definitions**: For each vocabulary item, write a very concise, easy-to-understand definition in English.
    5.  **Format Topic**: The "topic" field MUST be in the format 'Category: Topic Name'. For example, if the user requests 'Trees', a good response would be 'Environment: Trees'.
    6.  **Select a Color**: From the provided list of classic book cover colors, choose ONE hex code that best fits the theme. For example, 'Environment' topics might be green or brown, 'Ocean' topics might be blue. AVAILABLE COLORS: ${availableColors}.
    
    STRICT JSON OUTPUT FORMAT:
    Return in code block format a single JSON object with the following structure. Do not include any text outside the JSON block.

    {
      "topic": "string (The topic name, MUST be in 'Category: Topic Name' format. e.g., 'Environment: Trees')",
      "icon": "string (A single emoji character, e.g., '🌳')",
      "color": "string (The chosen hex code from the available list, e.g., '#2e7d32')",
      "words": [
        {
          "word": "string (e.g., 'Trunk')",
          "definition": "string (e.g., 'The main woody stem of a tree.')"
        },
        {
          "word": "string (e.g., 'Branch')",
          "definition": "string (e.g., 'A limb extending from the main trunk.')"
        },
        {
          "word": "string (e.g., 'Canopy')",
          "definition": "string (e.g., 'The upper layer of leaves and branches.')"
        }
      ]
    }
    `;
}