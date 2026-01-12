
import { AdventureChapter } from "../../../data/adventure_content";

interface ChapterContext {
    title: string;
    description: string;
    existingSegments: string[];
}

export function getGenerateSegmentPrompt(chapterContext: ChapterContext, userRequest: string): string {
    return `You are an expert IELTS coach and creative content designer.
    
    TASK: Generate one or more new sub-topics (an "Adventure Segment") for an existing chapter based on the user's request.
    
    CHAPTER CONTEXT:
    - Title: "${chapterContext.title}"
    - Description: "${chapterContext.description}"
    - Existing Sub-topics: [${chapterContext.existingSegments.map(s => `"${s}"`).join(', ')}]
    
    USER REQUEST: "${userRequest}"
    
    INSTRUCTIONS:
    1. Generate new sub-topics that are thematically relevant to the chapter but are distinct and do not overlap with the "Existing Sub-topics".
    2. For each new segment, provide lists for "basicWords", "intermediateWords", and "advancedWords". Each of these lists must contain at least 10 words.
    3. For each new segment, provide a unique, flavorful name for a "Boss" and a "Badge".
    4. For each new segment, generate a simple, abstract, vector-style SVG image string (\`image_svg\`). It should be a single, complete, valid XML string, less than 1KB, representing the sub-topic. Use simple shapes and a limited color palette. The SVG should be square (e.g., \`viewBox='0 0 100 100'\`).
    
    STRICT JSON OUTPUT FORMAT:
    Return a JSON array of segment objects. Each object must be complete. Do not include any text outside the JSON block.

    [
      {
        "title": "string (New Segment Title)",
        "description": "string (Short description for this new segment)",
        "bossName": "string (e.g., 'The AI Overlord')",
        "badgeName": "string (e.g., 'Silicon Badge')",
        "basicWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
        "intermediateWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
        "advancedWords": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8", "word9", "word10"],
        "image_svg": "string (A complete, valid SVG string. e.g. '<svg viewBox=...></svg>')"
      }
    ]
    `;
}