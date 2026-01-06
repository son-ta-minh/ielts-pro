
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ParaphraseMode, User } from "../app/types";

// Custom error to carry the prompt when quota is exceeded
export class ManualApiResponseError extends Error {
  prompt: any;
  constructor(message: string, prompt: any) {
    super(message);
    this.name = 'ManualApiResponseError';
    this.prompt = prompt;
  }
}

/**
 * Guideline compliance: Exclusively use process.env.API_KEY.
 * The application must not ask the user for it or provide UI to manage it.
 */
const getClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cleanJsonResponse(text: string): string {
  let clean = text.trim();
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let jsonStartIndex = -1;
  if (firstBrace === -1) {
    jsonStartIndex = firstBracket;
  } else if (firstBracket === -1) {
    jsonStartIndex = firstBrace;
  } else {
    jsonStartIndex = Math.min(firstBrace, firstBracket);
  }
  if (jsonStartIndex === -1) {
    if (clean.startsWith('```json')) {
      clean = clean.substring(7);
      if (clean.endsWith('```')) {
        clean = clean.substring(0, clean.length - 3);
      }
      return clean.trim();
    }
    return clean;
  }
  const lastBrace = clean.lastIndexOf('}');
  const lastBracket = clean.lastIndexOf(']');
  const jsonEndIndex = Math.max(lastBrace, lastBracket);
  if (jsonEndIndex > jsonStartIndex) {
    return clean.substring(jsonStartIndex, jsonEndIndex + 1);
  }
  return clean;
}

function safeJsonParse(text: string | undefined, defaultValue: any): any {
  if (!text) return defaultValue;
  const cleaned = cleanJsonResponse(text);
  if (!cleaned) return defaultValue;
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const fixedText = cleaned.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(fixedText);
    } catch (e2) {
      return defaultValue;
    }
  }
}

const trackApiUsage = () => {
  const today = new Date().toISOString().split('T')[0];
  let usage = { count: 0, date: today };
  try {
    const storedUsage = localStorage.getItem('ielts_pro_api_usage');
    if (storedUsage) {
      const parsed = JSON.parse(storedUsage);
      if (parsed.date === today) usage = parsed;
    }
  } catch (e) {}
  usage.count += 1;
  localStorage.setItem('ielts_pro_api_usage', JSON.stringify(usage));
  window.dispatchEvent(new CustomEvent('apiUsageUpdated'));
};

async function callAiWithRetry(requestPayload: any, maxRetries = 3) {
  trackApiUsage();
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      /**
       * Guideline compliance: Create a new GoogleGenAI instance right before making an API call.
       */
      const ai = getClient();
      const response = await ai.models.generateContent(requestPayload);
      return response;
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message?.toLowerCase() || "";
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("exhausted") || errorMsg.includes("503")) {
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          await delay(waitTime);
          continue;
        }
        throw new ManualApiResponseError("API quota exceeded.", requestPayload.contents);
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Guideline compliance: Use 'gemini-3-pro-preview' for complex text tasks.
 */
export async function generateWordDetails(word: string): Promise<any> {
    const prompt = `Analyze this IELTS vocabulary item: "${word}". Provide a breakdown in JSON format.
    {
      "ipa": "string",
      "meaningVi": "string",
      "example": "string",
      "collocations": "string (3-5 essential collocations, format: 'collocation: meaning', separated by newlines)",
      "preposition": "string | null",
      "isIdiom": "boolean",
      "isPhrasalVerb": "boolean",
      "isCollocation": "boolean",
      "isStandardPhrase": "boolean",
      "isIrregular": "boolean",
      "v2": "string | null",
      "v3": "string | null",
      "isPassive": "boolean",
      "needsPronunciationFocus": "boolean",
      "tags": ["string"],
      "wordFamily": {
        "nouns": [{"word": "string", "ipa": "string"}],
        "verbs": [{"word": "string", "ipa": "string"}],
        "adjs": [{"word": "string", "ipa": "string"}],
        "advs": [{"word": "string", "ipa": "string"}]
      }
    }`;
    const response = await callAiWithRetry({ 
      model: 'gemini-3-pro-preview', 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json" 
      } 
    });
    return safeJsonParse(response.text, {});
}

export async function generateBatchWordDetails(words: string[]): Promise<any[]> {
    const wordList = words.map(w => `"${w}"`).join(', ');
    const prompt = `Analyze: [${wordList}]. Return JSON array of objects with ipa, meaningVi, example, collocations, preposition, type booleans, tags, wordFamily.`;
    const response = await callAiWithRetry({ 
      model: 'gemini-3-pro-preview', 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json" 
      } 
    });
    return safeJsonParse(response.text, []);
}

export async function generateWordFamilyOnly(word: string): Promise<any> {
    const prompt = `Word family for "${word}" in JSON: { "wordFamily": { "nouns": [], "verbs": [], "adjs": [], "advs": [] } }`;
    const response = await callAiWithRetry({ 
      model: 'gemini-3-pro-preview', 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json" 
      } 
    });
    return safeJsonParse(response.text, {});
}

// Fix: Added missing generateUnitData function to resolve import error in CreateUnitWithAiModal.tsx
/**
 * Generates unit data including name, description, words, and an essay based on user request.
 */
export async function generateUnitData(request: string, user: User): Promise<any> {
    const prompt = `You are an IELTS expert creating a vocabulary lesson unit. All generated content (name, description, words, essay) must be in English.

USER PROFILE CONTEXT:
- Role: ${user.role || 'IELTS Learner'}
- Current Level: ${user.currentLevel || 'Intermediate'}
- Target: ${user.target || 'Improve vocabulary'}

USER REQUEST FOR THIS UNIT:
"${request}"

Based on the user's request, generate a complete lesson unit in a strict JSON format.
For the "words" array:
1. Use "essay_word:base_word" format ONLY if the word used in the essay differs from the base dictionary form (e.g. "running:run", "cities:city", "better:good").
2. If the essay word is identical to the base word (e.g. "cat" in essay and "cat" is base), you MUST use just the single word string (e.g. "cat"). DO NOT return "cat:cat".`;

    const response = await callAiWithRetry({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    words: { type: Type.ARRAY, items: { type: Type.STRING } },
                    essay: { type: Type.STRING }
                },
                required: ["name", "description", "words", "essay"]
            }
        }
    });
    return safeJsonParse(response.text, null);
}

export function getParaphraseTaskPrompt(tone: 'CASUAL' | 'ACADEMIC', targetMode: ParaphraseMode, user: User, context: string): string {
    let toneInstruction = tone === 'CASUAL' ? 'Generate a casual, spoken English sentence.' : 'Generate a formal, academic sentence from an IELTS essay.';
    let hintInstruction = '';
    switch(targetMode) {
        case ParaphraseMode.MORE_ACADEMIC: hintInstruction = 'Provide hints on making the phrasing more formal and sophisticated.'; break;
        case ParaphraseMode.LESS_ACADEMIC: hintInstruction = 'Provide hints on making the phrasing sound more natural and conversational.'; break;
        case ParaphraseMode.VARIETY: hintInstruction = 'Provide hints on using different grammatical structures or synonyms.'; break;
    }
    return `You are an IELTS coach. User: ${user.role}, Level ${user.currentLevel}. Topic: "${context || 'General'}".
Task: ${toneInstruction}
Return JSON:
{
  "sentence": "ONLY the sentence itself. No hints or labels inside.",
  "hints": ["Strategic Hint 1", "Strategic Hint 2", "..."]
}
IMPORTANT: 
- Provide between 1 to 5 hints based on the sentence's complexity. 
- The "sentence" field must contain ONLY the English sentence. 
- All guidance MUST go into "hints".
${hintInstruction}`;
}

export function getEvaluationPrompt(original: string, draft: string, mode: ParaphraseMode): string {
    return `You are an IELTS Writing/Speaking Examiner.
Task: Evaluate the student's paraphrase attempt based on the following criteria:
1. Meaning Accuracy (50%): Does it preserve the original message exactly?
2. Lexical Resource (25%): Use of advanced synonyms, appropriate academic/natural collocations.
3. Grammatical Range & Accuracy (25%): Sentence structure variety and correctness.

Original Sentence: "${original}"
Student's Paraphrase: "${draft}"
Target Transformation: "${mode}"

Mode Guidelines:
- MORE_ACADEMIC: Should use nominalization, passive voice, or formal vocabulary (e.g., "commence" instead of "start").
- LESS_ACADEMIC: Should sound like a native speaker in a conversation (natural, clear, potentially using phrasal verbs).
- VARIETY: Should use a different clause structure (e.g., active to passive, starting with a subordinator).

Return a JSON object with:
{
  "score": number (0 to 100. 90+ is Band 9, 80+ is Band 8, etc. Be strict but fair. A perfect paraphrase gets 100.),
  "feedback": "Analysis in structured HTML. Use <ul> and <li> to list the 3 criteria (Meaning, Lexical, Grammar). Use <b> tags to highlight the criteria names (e.g. <b>Meaning:</b>). Use <br> for line breaks between general comments. Do not use Markdown.",
  "modelAnswer": "Provide the most ideal paraphrase that fits the requested mode perfectly."
}`;
}

/**
 * Guideline compliance: Use 'gemini-3-flash-preview' for basic text tasks.
 */
export async function generateParaphraseTaskWithHints(tone: 'CASUAL' | 'ACADEMIC', targetMode: ParaphraseMode, user: User, context: string): Promise<{ sentence: string; hints: string[] }> {
    const prompt = getParaphraseTaskPrompt(tone, targetMode, user, context);
    const response = await callAiWithRetry({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    sentence: { type: Type.STRING },
                    hints: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["sentence", "hints"]
            }
        }
    });
    return safeJsonParse(response.text, { sentence: '', hints: [] });
}

export async function generateHintsForSentence(sentence: string, mode: ParaphraseMode, user: User, context: string): Promise<{ hints: string[] }> {
    const prompt = `Coach user on paraphrasing this sentence: "${sentence}". 
Target Mode: ${mode}. 
Provide 1 to 5 actionable strategic hints.
Return JSON: { "hints": ["hint1", "hint2", "..."] }`;
    const response = await callAiWithRetry({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: { hints: { type: Type.ARRAY, items: { type: Type.STRING } } },
                required: ["hints"]
            }
        }
    });
    return safeJsonParse(response.text, { hints: [] });
}

export async function evaluateParaphrase(original: string, draft: string, mode: ParaphraseMode): Promise<{ score: number; feedback: string; modelAnswer: string }> {
    const prompt = getEvaluationPrompt(original, draft, mode);
    const response = await callAiWithRetry({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    score: { type: Type.NUMBER },
                    feedback: { type: Type.STRING },
                    modelAnswer: { type: Type.STRING }
                },
                required: ["score", "feedback", "modelAnswer"]
            }
        }
    });
    return safeJsonParse(response.text, { score: 0, feedback: '', modelAnswer: '' });
}

export async function evaluatePronunciation(word: string, audioBase64: string): Promise<any> {
  const response = await callAiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: { 
      parts: [
        { inlineData: { mimeType: 'audio/webm', data: audioBase64 } }, 
        { text: `Evaluate pronunciation of "${word}". Return JSON.` }
      ] 
    },
    config: { responseMimeType: "application/json" }
  });
  return safeJsonParse(response.text, { score: 0, feedback: 'Error.', phoneticTips: [] });
}

export async function generateSpeech(text: string): Promise<string | null> {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text: `Speak: ${text}` }] },
            config: { 
              responseModalities: [Modality.AUDIO], 
              speechConfig: { 
                voiceConfig: { 
                  prebuiltVoiceConfig: { voiceName: 'Kore' } 
                } 
              } 
            }
        });
        const audioPart = response.candidates?.[0]?.content?.parts?.[0];
        if (audioPart && 'inlineData' in audioPart && audioPart.inlineData) return audioPart.inlineData.data;
        return null;
    } catch (e) { return null; }
}

export async function generateSmartKeywords(topic: string): Promise<string[]> {
    const prompt = `Keywords for topic "${topic}". Return JSON array of strings.`;
    const response = await callAiWithRetry({ 
      model: 'gemini-3-flash-preview', 
      contents: prompt, 
      config: { 
        responseMimeType: "application/json" 
      } 
    });
    return safeJsonParse(response.text, []);
}
