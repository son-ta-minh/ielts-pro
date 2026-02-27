import { WritingTopic } from '../../app/types';

export function getWritingEvaluationPrompt(
    task1Response: string,
    task2Response: string,
    topic: WritingTopic
): string {

    return `You are a certified IELTS examiner providing feedback on a full writing practice test.

    TASK:
    Analyze the user's responses for Task 1 and Task 2. Provide a single, holistic evaluation and an overall band score.

    TASK 1 PROMPT:
    "${topic.task1}"

    USER'S TASK 1 RESPONSE (Word Count: ${task1Response.split(/\s+/).filter(Boolean).length}):
    "${task1Response}"

    ---

    TASK 2 PROMPT:
    "${topic.task2}"

    USER'S TASK 2 RESPONSE (Word Count: ${task2Response.split(/\s+/).filter(Boolean).length}):
    "${task2Response}"

    ---

    YOUR ANALYSIS MUST INCLUDE:
    1.  **Overall Band Score**: Provide a single, overall estimated band score for the ENTIRE test, from 5.0 to 9.0, in 0.5 increments. Remember that Task 2 is weighted more heavily than Task 1.
    2.  **Holistic Feedback**: Write detailed feedback in HTML format. Use <ul>, <li>, and <b> tags. The feedback must provide a combined analysis, covering all four official IELTS writing criteria. For each criterion, comment on both tasks where relevant.
        - **Task Achievement (for Task 1) / Task Response (for Task 2)**: Did the writer address all parts of the tasks? Is the overview/position clear? Are ideas well-supported?
        - **Coherence and Cohesion**: Is the writing well-organized? Is paragraphing logical? Is there effective use of cohesive devices?
        - **Lexical Resource**: What is the range and accuracy of the vocabulary? Are there good collocations? Is the tone appropriate?
        - **Grammatical Range and Accuracy**: Is there a good range of sentence structures? How frequent are grammatical errors?

    Return in code block format a strict JSON object with this exact schema. Do not include any text outside the JSON block.

    {
      "band": number (e.g., 6.5, 7.0, 8.5),
      "feedback": "string (The holistic feedback for the whole test, formatted as an HTML string)"
    }
    `;
}