export function getFullWritingTestPrompt(theme: string): string {
    return `You are an expert IELTS examiner creating a full academic writing test. The main topic is "${theme}".

    TASK: Generate a complete, cohesive 2-part IELTS academic writing test.
    
    STRUCTURE:
    1.  **Task 1 (Report Writing)**:
        - Create a prompt that describes a visual data representation (e.g., bar chart, line graph, table, diagram, or a combination).
        - The prompt must instruct the user to "Summarise the information by selecting and reporting the main features, and make comparisons where relevant."
        - The description of the visual data should be clear and concise. Do NOT generate the visual data itself.
    
    2.  **Task 2 (Essay Writing)**:
        - Create an essay question that is thematically related to the Task 1 prompt.
        - The question should present an opinion, problem, or argument for the user to discuss. It should be a standard IELTS Task 2 format (e.g., agree/disagree, discuss both views, advantages/disadvantages, problem/solution).
    
    Return a strict JSON object with this exact schema. Do not include any text outside the JSON block.
    
    {
      "topic": "string (The main theme, e.g., '${theme}')",
      "task1": "string (The full Task 1 prompt, e.g., 'The chart below shows the percentage of the population in four European countries who used the internet between 2010 and 2020. Summarise...')",
      "task2": "string (The full Task 2 essay prompt, e.g., 'Some people believe that the internet has brought people closer together, while others think it has created more social isolation. Discuss both these views and give your own opinion.')"
    }
    `;
}