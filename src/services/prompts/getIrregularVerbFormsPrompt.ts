export function getIrregularVerbFormsPrompt(verbs: string[]): string {
    const verbList = verbs.map(v => `"${v}"`).join(', ');

    return `You are an expert English linguist.
    
    TASK: Provide the principal parts (past simple and past participle) for the following list of irregular verbs: [${verbList}].

    RULES:
    1.  For each verb, provide its V1 (base form), V2 (past simple), and V3 (past participle).
    2.  If a verb has multiple common forms (e.g., "dreamt" / "dreamed"), provide the most common one first.
    3.  If a word is not an irregular verb, return its regular "-ed" forms.
    
    Return in code block format your analysis as a strict JSON array of objects. Each object must contain "v1", "v2", and "v3".

    Response Example (Strict JSON Array):
    [
      {
        "v1": "go",
        "v2": "went",
        "v3": "gone"
      },
      {
        "v1": "begin",
        "v2": "began",
        "v3": "begun"
      },
      {
        "v1": "dream",
        "v2": "dreamt",
        "v3": "dreamt"
      }
    ]`;
}
