import { User } from '../../app/types';

export function getRefineSpeakingTopicPrompt(
    topicName: string,
    description: string,
    currentQuestions: string,
    userRequest: string,
    user: User
): string {
    const hasExistingContent = topicName !== "New Topic" || description.trim() || currentQuestions.trim();
    
    let currentDataBlock = '';
    if (hasExistingContent) {
      currentDataBlock = `CURRENT TOPIC DATA:\n- Name: ${topicName}\n- Description: ${description || '(empty)'}\n- Current Questions:\n${currentQuestions || '(empty)'}\n`;
    }
    
    const requestBlock = userRequest ? `USER REQUEST: "${userRequest}"` : "USER REQUEST: General improvement and expansion.";

    return `You are an expert IELTS coach. Your task is to refine a speaking topic based on user context and a new request.

USER PROFILE:
- Role: ${user.role}
- Level: ${user.currentLevel}

${currentDataBlock}
${requestBlock}

TASK:
1.  Read the user request and apply it to the CURRENT TOPIC DATA. If no data exists, create a new topic from the request.
2.  The goal is to generate a high-quality, relevant set of IELTS Speaking questions for the topic.
3.  Ensure the topic name and description are concise and accurate.
4.  Generate between 5 to 10 questions. The questions should cover different aspects of the topic and be typical of a real Part 1 or Part 2/3 follow-up interview.

Return a strict JSON object with this schema:
{ 
  "name": "string (The updated topic name)", 
  "description": "string (The updated description, max 1-2 sentences)", 
  "questions": ["string"] (An array of 5-10 question strings)
}`;
}

export function getFullSpeakingTestPrompt(theme: string): string {
    return `You are an expert IELTS examiner creating a full speaking test. The main topic is "${theme}".

    TASK: Generate a complete, cohesive 3-part IELTS speaking test.
    
    STRUCTURE:
    1.  **Part 1 (Introduction & Interview)**:
        - Generate 4-5 general, introductory questions. These can be on common topics like 'work', 'hometown', 'hobbies' to simulate a real test's warm-up. They do not have to be directly about the main theme.
    
    2.  **Part 2 (Individual Long Turn)**:
        - Create a cue card based on the main theme: "${theme}".
        - The cue card should have a main task (e.g., "Describe a piece of technology you own...") and 3-4 bullet points to guide the speaker.
    
    3.  **Part 3 (Two-way Discussion)**:
        - Generate 4-5 abstract, discussion-based questions that are a logical extension of the Part 2 topic. These questions should invite speculation, comparison, and opinion.
    
    Return a strict JSON object with this exact schema. Do not include any text outside the JSON block.
    
    {
      "topic": "string (The main theme, e.g., '${theme}')",
      "part1": ["string", "string", "string", "string"],
      "part2": {
        "cueCard": "string (The main instruction for the cue card, e.g., 'Describe an important historical event in your country.')",
        "points": ["string", "string", "string"]
      },
      "part3": ["string", "string", "string", "string"]
    }
    `;
}


export function getTranscriptionForSpeakingPrompt(questions: string[]): string {
    const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

    return `You are an expert audio transcription service.
    
    TASK:
    You will receive a sequence of audio files. Each audio file corresponds to one of the questions listed below, in order. Your task is to transcribe each audio file.
    
    QUESTIONS:
    ${questionList}
    
    Return a strict JSON object with a single key "transcripts", which is an array of objects. Each object must contain the original question and the verbatim transcription of the user's corresponding audio.

    STRICT JSON OUTPUT FORMAT:
    {
      "transcripts": [
        {
          "question": "string (The first question asked)",
          "transcript": "string (The verbatim transcription of the user's first audio)"
        },
        {
          "question": "string (The second question asked)",
          "transcript": "string (The verbatim transcription of the user's second audio)"
        }
      ]
    }
    `;
}