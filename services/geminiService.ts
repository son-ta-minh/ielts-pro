
import { GoogleGenAI, Type } from "@google/genai";
import { ParaphraseMode } from "../types";

export async function generateWordDetails(word: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this English word/phrase: "${word}". 
    1. Provide IPA. 
    2. High-quality example. 
    3. Concise Vietnamese meaning. 
    4. Determine if it's an idiom (isIdiom).
    5. Determine if it's a Phrasal Verb (isPhrasalVerb).
    6. Determine if it's a multi-word collocation, expression, or fixed sentence pattern (isCollocation).
    7. Determine if it's phonetically challenging (needsPronunciationFocus).
    Use JSON format.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ipa: { type: Type.STRING },
          example: { type: Type.STRING },
          meaningVi: { type: Type.STRING },
          isIdiom: { type: Type.BOOLEAN },
          isPhrasalVerb: { type: Type.BOOLEAN },
          isCollocation: { type: Type.BOOLEAN },
          needsPronunciationFocus: { type: Type.BOOLEAN }
        },
        required: ["ipa", "example", "meaningVi", "isIdiom", "isPhrasalVerb", "isCollocation", "needsPronunciationFocus"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    return { ipa: "", example: "", meaningVi: "", isIdiom: false, isPhrasalVerb: false, isCollocation: false, needsPronunciationFocus: false };
  }
}

export async function generateSmartKeywords(topic: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Given the IELTS topic "${topic}", provide a list of 20 related English keywords, synonyms, and sub-concepts that a student might have in their vocabulary list. Return a simple JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text) as string[];
  } catch (e) {
    return [topic];
  }
}

export async function generateBatchWordDetails(words: string[]) {
  if (words.length === 0) return [];
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate accurate IPA, a formal IELTS example sentence, and concise Vietnamese meaning for these words: ${words.join(', ')}. Return an array of objects.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            ipa: { type: Type.STRING },
            example: { type: Type.STRING },
            meaningVi: { type: Type.STRING }
          },
          required: ["word", "ipa", "example", "meaningVi"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Batch AI Error:", e);
    return [];
  }
}

export async function generateParaphraseTask(mode: ParaphraseMode) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let prompt = mode === ParaphraseMode.SPEAK_TO_WRITE ? "Casual to Formal" : mode === ParaphraseMode.WRITE_TO_SPEAK ? "Formal to Natural" : "Structural Variety";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate an IELTS sentence for task: ${prompt}. Return JSON with "sentence" and "meaningVi".`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentence: { type: Type.STRING },
          meaningVi: { type: Type.STRING }
        }
      }
    }
  });
  try { return JSON.parse(response.text); } catch { return null; }
}

export async function evaluateParaphrase(original: string, userDraft: string, mode: ParaphraseMode) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Evaluate IELTS paraphrase. Original: "${original}", User: "${userDraft}". Provide score(0-100), feedback, and modelAnswer in JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          modelAnswer: { type: Type.STRING }
        }
      }
    }
  });
  try { return JSON.parse(response.text); } catch { return null; }
}
