
export function getGeneratePlanningGoalPrompt(request: string): string {
    return `You are an expert study planner and productivity coach.

TASK:
Create a structured learning goal based on the user's request. The goal should be broken down into specific, actionable tasks (todos).

USER REQUEST: "${request}"

INSTRUCTIONS:
1.  **Analyze the Request**: Identify the main subject (e.g., "Collins Reading for IELTS", "Learn 50 phrasal verbs", "Writing Task 1 practice").
2.  **Create a Title**: A concise, motivating title for the goal.
3.  **Create a Description**: A brief overview of what this goal achieves.
4.  **Generate Todos**: Break the goal down into logical steps or units.
    -   If the request refers to a specific book or course (e.g., "18 lessons of Collins Reading"), generate exactly that number of tasks, matching the unit titles if possible or using logical generic titles.
    -   If the request is general (e.g., "Learn vocabulary"), create a logical progression (e.g., "Day 1: Family", "Day 2: Work").
    -   Each task should be clear and actionable.

STRICT JSON OUTPUT FORMAT:
Return a single JSON object. Do not include any text outside the JSON block.

{
  "title": "string (Goal Title)",
  "description": "string (Goal Description)",
  "todos": [
    {
      "text": "string (Task description, e.g., 'Unit 1: Family & Relationships - Complete exercises')"
    },
    {
      "text": "string (Task description, e.g., 'Unit 2: Health & Fitness - Review vocabulary')"
    }
  ]
}`;
}
