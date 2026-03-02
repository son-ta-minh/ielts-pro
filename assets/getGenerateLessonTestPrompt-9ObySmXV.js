function S(n){const{currentLesson:e,userRequest:a,language:r,tone:l,coachName:T,task:i,topic:t}=n,g=r==="Vietnamese"?"Vietnamese":"English",c=(e==null?void 0:e.type)==="intensity"||(e==null?void 0:e.type)==="comparison"||(e==null?void 0:e.type)==="mistake"||(t==null?void 0:t.toLowerCase().includes("intensity"))||(t==null?void 0:t.toLowerCase().includes("comparison"))||(t==null?void 0:t.toLowerCase().includes("mistake"));let o="",s="",d="",u="";i==="create_reading"?o=c?`Create a structured study guide for a ${n.targetAudience} comparing nuanced vocabulary related to: "${t}".`:`Create an immersive, high-impact lesson for a ${n.targetAudience} on: "${t}".`:i==="convert_to_listening"?(o="TRANSFORM the provided Reading Lesson into a high-quality NATURAL AUDIO SCRIPT.",d=`SOURCE: ${e==null?void 0:e.title}
${e==null?void 0:e.content}`):(o=c?"REFINE the reading material into a structured analysis table for the current vocabulary set.":"REFINE the lesson to focus on Contextual Nuance and Visual Clarity.",d=`CURRENT: ${e==null?void 0:e.title}
${e==null?void 0:e.content}
REQUEST: "${a||"Improve layout and examples."}"`);const E=`
  METADATA RULES (STRICT):
  1. **title**: Concept-driven, metaphorical title (MAX 5 WORDS). Think: "Frozen Heat", "Moral Compass".
  2. **description**: Define the core conceptual boundary (MAX 15 WORDS). Sharp and precise. NO fluff.
  3. **searchKeywords**: Array of strings. Include all primary words/synonyms. For comparison/intensity, include every compared word.`;return c&&i!=="convert_to_listening"?(s=`
      STYLE: SYSTEMATIC ANALYSIS TABLE
      - You MUST use a Markdown Table as the primary structure.
      - COLUMNS: | Word | Explanation | Examples |
      - "Explanation": Keep it short (max 15 words). **Bold important phrases**.
      - "Examples": Provide EXACTLY TWO distinct examples per word.
      ${E}`,u=`
      CONTENT REQUIREMENTS:
      1. Analyze the core words provided.
      2. **EXPANSION**: Introduce 2-3 NEW related high-frequency words.`):i==="convert_to_listening"?s=`
      STYLE: NATURAL SPOKEN AUDIO SCRIPT
      - STRUCTURE: Natural spoken narrative.
      - **EVERY SENTENCE** must be wrapped in audio tags, closed audio tag is [/].
      - **AUDIO STRATEGY (CRITICAL)**:
        1. **NO MIXED LANGUAGES INSIDE ONE TAG**: Do NOT put English words inside Vietnamese tags. English words MUST be wrapped separately in [Audio-EN]...[/].
        2. **SAME SENTENCE CONTINUITY**: If a sentence contains both English and Vietnamese, keep them on the SAME LINE with adjacent tags. Do NOT insert line breaks between tags that belong to the same sentence.
           Correct: [Audio-EN]The Sun[/][Audio-VN]không chỉ là một ngôi sao...[/]
           Incorrect: [Audio-EN]The Sun[/]
              [Audio-VN]không chỉ là một ngôi sao...[/]
        3. **NO NESTED TAGS**: Never nest audio tags. Each segment must have its own flat tag.
      - No Markdown headers (###).
      - No tables in listening mode.`:s=`
      STYLE: COMPACT RICH ARTICLE
      - Use Headers (###), Tips [Tip: ...], and Spoilers [HIDDEN: ...].
      - Use Blockquotes (>) for examples.
      ${E}`,`You are expert IELTS coach '${T}', acting as a ${l==="friendly_elementary"?"friendly mentor":"professor"}.
    
  TASK: ${o}

  ${d}
  ${u}
  ${s}

  STRICT CONTENT RULES:
  1. NO generic introductions.
  2. MANDATORY: All coaching/explanations in ${g}.
  3. **TAGS**: Return EXACTLY ONE tag from: ["Grammar", "Pattern", "Speaking", "Listening", "Reading", "Writing", "General", "Comparison", "Vocabulary"].

  CRITICAL OUTPUT RULES:
  1. **MARKDOWN CODE BLOCK**: Wrap entire JSON response in \`\`\`json ... \`\`\`.
  2. **NO RAW NEWLINES**: Use literal '\\n' for line breaks.
  3. **TABLES**: Use \`<br>\` for line breaks inside table cells.

  Return in code block format OUTPUT TEMPLATE:
  \`\`\`json
  {
    "title": "string",
    "description": "string",
    "content": "string",
    "searchKeywords": ["string"],
    "tags": ["string"]
  }
  \`\`\``}function m(n,e,a,r=[]){const l=r.join(", ");return`You are an expert IELTS examiner. 
  
  TASK: Generate a creative and comprehensive PRACTICE TEST based on the following lesson content.
  
  LESSON TITLE: "${n}"
  LESSON CONTENT: "${e}"
  USER REQUEST: "${a||""}"
  TAGS: "${l}"

  AVAILABLE INTERACTIVE TAGS:
  1. **Dropdown**: [Select: Correct | Distractor 1 | Distractor 2]
     - Use for sentence completion, synonyms, or choosing the best fit.
  2. **Multiple Choice**: [Multi: Correct | Distractor 1 | Distractor 2]
     - Use for checking definitions, tones, or concepts.
  3. **Fill-in-the-blank**: [Quiz: Answer]
     - **CONSTRAINT**: Use this ONLY if the answer is absolutely unambiguous (e.g. spelling check, specific term recall) OR if the User Request specifically asks for fill-in/typing questions.

  STRUCTURE STRATEGY:
  Analyze the content and tags.

  **CASE A: VOCABULARY LESSON** (e.g. tags include "Vocabulary", "Vocab", or content is a list of words/phrases)
  If this is primarily a vocabulary lesson, follow this structure:
  1. **Section 1: Vocabulary Selection (3-5 items)**: Use [Select: Correct | Wrong 1 | Wrong 2] to test the nuance of collocations or specific words from the lesson.
  2. **Section 2: Meaning Matching (2-4 items)**: Use [Multi: Correct | Option 2 | Option 3] to match a term to its definition.
  3. **Section 3: Contextual Use (2-4 items)**: Provide short sentences with blanks using [Select: ...] where the user chooses the best synonym for a specific tone.

  **CASE B: OTHER LESSONS** (Grammar, General, Skills, etc.)
  - **Creative Flow**: Design a test flow that best suits the specific concepts taught (e.g., rewriting sentences, identifying errors, filling gaps).
  - Do NOT follow the fixed 3-section structure of Case A unless it fits perfectly.
  - **Contextual**: Focus on testing application in context.

  **DISTRACTOR DESIGN RULES (MANDATORY)**
   - Distractors must be semantically close to the correct answer.
   - All options must belong to the same lexical field and grammatical category.
   - Avoid obviously wrong answers.
   - The incorrect options should be plausible but fail due to nuance, intensity, tone, or collocation.
   - The difficulty should test subtle distinctions (e.g., demonstrate vs illustrate vs indicate).
   - Do NOT create distractors that are logically unrelated to the sentence.

  GENERAL GUIDELINES:
  - **No Repetition**: Do not simply repeat the essay text. Create new sentences or scenarios to test the knowledge.
  - **Language**: Instructions in the same language as the lesson's explanations (Vietnamese/English). Target material in English.
  - Do not use emoji, compact layout, no consecutive new lines, or an empty line.

  Return in code block format a JSON object:
  {
    "content": "string (Markdown with interactive test components)"
  }`}export{S as a,m as g};
