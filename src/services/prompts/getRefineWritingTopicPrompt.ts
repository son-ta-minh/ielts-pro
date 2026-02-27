import { User, WritingTopic } from '../../app/types';

export function getRefineWritingTopicPrompt(
    currentTopic: WritingTopic,
    userRequest: string,
    user: User
): string {
    const hasExistingContent = currentTopic.name !== "New Topic" || currentTopic.description.trim() || currentTopic.task1.trim() || currentTopic.task2.trim();
    
    let currentDataBlock = '';
    if (hasExistingContent) {
      currentDataBlock = `CURRENT TOPIC DATA:\n- Name: ${currentTopic.name}\n- Description: ${currentTopic.description || '(empty)'}\n- Task 1: ${currentTopic.task1 || '(empty)'}\n- Task 2: ${currentTopic.task2 || '(empty)'}\n`;
    }
    
    const requestBlock = userRequest ? `USER REQUEST: "${userRequest}"` : "USER REQUEST: General improvement and expansion.";

    return `You are an expert IELTS coach. Your task is to refine or create an IELTS Writing topic based on user context and a request.

USER PROFILE:
- Role: ${user.role}
- Level: ${user.currentLevel}

${currentDataBlock}
${requestBlock}

TASK:
1.  Read the user request and apply it to the CURRENT TOPIC DATA. If no data exists, create a new topic from the request.
2.  The goal is to generate a high-quality, realistic set of IELTS Writing tasks (Task 1 and Task 2).
3.  Ensure the topic name and description are concise and accurate.
4.  For Task 1, create a prompt describing a chart, graph, table, or diagram (for Academic) or a letter-writing scenario (for General Training). Be descriptive.
5.  For Task 2, create an essay question that is thematically linked to Task 1 if appropriate, or a standard standalone essay prompt.

Return in code block format a strict JSON object with this schema:
{ 
  "name": "string (The updated topic name)", 
  "description": "string (The updated description, max 1-2 sentences)", 
  "task1": "string (The full Task 1 prompt)",
  "task2": "string (The full Task 2 prompt)"
}`;
}