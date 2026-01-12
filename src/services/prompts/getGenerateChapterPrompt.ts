
export function getGenerateChapterPrompt(request: string, existingChapters: { title: string; segments: string[] }[] = []): string {
    const existingChaptersBlock = existingChapters.length > 0
        ? `EXISTING CONTENT (DO NOT REPEAT TOPICS):\n${existingChapters.map(c => `- Chapter: "${c.title}" (Sub-topics: ${c.segments.map(s => `"${s}"`).join(', ')})`).join('\n')}\n`
        : '';

    return `You are an expert IELTS coach and creative content designer.
    
    TASK: Generate a new "Adventure Chapter" based on the user's request.
    
    USER REQUEST: "${request}"
    
    ${existingChaptersBlock}
    INSTRUCTIONS:
    1. Create a main chapter theme based on the request. If the request is empty, create a general knowledge chapter. The new chapter MUST be a completely new topic, different from the existing content provided above.
    2. Design 3 to 5 distinct sub-topics (segments) within that theme.
    3. For each segment, provide lists for "basicWords", "intermediateWords", and "advancedWords". Each of these lists must contain at least 10 words.
    4. Provide a unique, flavorful name for a "Boss" and a "Badge" for each segment.
    5. For each segment, generate a simple, abstract, vector-style SVG image string (\`image_svg\`). It should be a single, complete, valid XML string, less than 1KB, representing the sub-topic. Use simple shapes and a limited color palette. The SVG should be square (e.g., \`viewBox='0 0 100 100'\`).
    
    STRICT JSON OUTPUT FORMAT:
    Return a single JSON object with the following structure. Do not include any text outside the JSON block.
    
    {
      "title": "string (Chapter Title)",
      "description": "string (A short, engaging description of the chapter)",
      "icon": "string (A single, relevant emoji for the chapter icon)",
      "segments": [
        {
          "title": "string (Segment 1 Title)",
          "description": "string (Short description for this segment)",
          "bossName": "string (e.g., 'The Data Sovereign')",
          "badgeName": "string (e.g., 'Digital Crest')",
          "basicWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
          "intermediateWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
          "advancedWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
          "image_svg": "string (A complete, valid SVG string. e.g. '<svg viewBox=...></svg>')"
        },
        {
          "title": "string (Segment 2 Title)",
          "description": "string (Short description for this segment)",
          "bossName": "string (e.g., 'The Bio-Engineer')",
          "badgeName": "string (e.g., 'Genetic Sigil')",
          "basicWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
          "intermediateWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
          "advancedWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
          "image_svg": "string (A complete, valid SVG string. e.g. '<svg viewBox=...></svg>')"
        }
      ]
    }
    `;
}