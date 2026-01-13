import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ParaphraseMode, User, WritingTopic } from "../app/types";
import { 
  getWordDetailsPrompt,
  getParaphraseTaskPrompt,
  getParaphraseEvaluationPrompt,
  getSpeechGenerationParts,
  getRefineSpeakingTopicPrompt,
  getSpeakingEvaluationFromAudioPrompt,
  getTranscriptionForSpeakingPrompt,
  getFullSpeakingTestPrompt,
  getRefineWritingTopicPrompt,
  getFullWritingTestPrompt,
  getWritingEvaluationPrompt,
  getIpaAccentsPrompt,
  getComparisonPrompt,
  getIrregularVerbFormsPrompt
} from './promptService';
import { getConfig } from "../app/settingsManager";
import { getStoredJSON, setStoredJSON } from "../utils/storage";

// Custom error to carry the prompt when quota is exceeded
export class ManualApiResponseError extends Error {
  prompt: any;
  constructor(message: string, prompt: any) {
    super(message);
    this.name = 'ManualApiResponseError';
    this.prompt = prompt;
  }
}

const getClient = () => {
  if (!process.env.API_KEY) throw new Error("API_KEY_MISSING");
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cleanJsonResponse(text: string): string {
  let clean = text.trim();
  
  // Prioritize finding markdown blocks
  const mdJsonStart = clean.indexOf('```json');
  if (mdJsonStart !== -1) {
      const startIndex = mdJsonStart + 7; // Skip ```json
      const endIndex = clean.lastIndexOf('```');
      if (endIndex > startIndex) {
          return clean.substring(startIndex, endIndex).trim();
      }
  }

  // Fallback to finding the first and last brace/bracket
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let jsonStartIndex = -1;
  if (firstBrace === -1) jsonStartIndex = firstBracket;
  else if (firstBracket === -1) jsonStartIndex = firstBrace;
  else jsonStartIndex = Math.min(firstBrace, firstBracket);
  
  if (jsonStartIndex === -1) {
    return clean; // Nothing that looks like JSON
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
    try { return JSON.parse(fixedText); } 
    catch (e2) { return defaultValue; }
  }
}

const trackApiUsage = () => {
  const today = new Date().toISOString().split('T')[0];
  let usage = getStoredJSON('vocab_pro_api_usage', { count: 0, date: '1970-01-01' });
  if (usage.date !== today) usage = { count: 0, date: today };
  usage.count += 1;
  setStoredJSON('vocab_pro_api_usage', usage);
  window.dispatchEvent(new CustomEvent('apiUsageUpdated'));
};

async function callAiWithRetry(requestPayload: any, maxRetries = 3) {
  trackApiUsage();
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const ai = getClient();
      const response = await ai.models.generateContent(requestPayload);
      // Fix: Access text property instead of calling text() method
      return response;
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message?.toLowerCase() || "";
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("exhausted") || errorMsg.includes("503")) {
        if (attempt < maxRetries) { await delay(Math.pow(2, attempt) * 1000); continue; }
        throw new ManualApiResponseError("API quota exceeded.", requestPayload.contents);
      }
      throw err;
    }
  }
  throw lastError;
}

export async function generateWordDetails(words: string[], nativeLanguage: string = 'Vietnamese'): Promise<any[]> {
    const config = getConfig();
    const prompt = getWordDetailsPrompt(words, nativeLanguage);
    const response = await callAiWithRetry({ model: config.ai.modelForComplexTasks, contents: prompt, config: { responseMimeType: "application/json" } });
    const result = safeJsonParse(response.text, []);
    return Array.isArray(result) ? result : [result];
}

export async function generateIpaAccents(words: string[]): Promise<any[]> {
    const config = getConfig();
    const prompt = getIpaAccentsPrompt(words);
    const response = await callAiWithRetry({
        model: config.ai.modelForBasicTasks,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    const result = safeJsonParse(response.text, []);
    return Array.isArray(result) ? result : [result];
}

export async function generateParaphraseTaskWithHints(tone: 'CASUAL' | 'ACADEMIC', targetMode: ParaphraseMode, user: User, context: string, sentence?: string): Promise<{ sentence: string; hints: string[] }> {
    const config = getConfig();
    const prompt = getParaphraseTaskPrompt(tone, targetMode, user, context, sentence);
    const response = await callAiWithRetry({ model: config.ai.modelForBasicTasks, contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { sentence: { type: Type.STRING }, hints: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["sentence", "hints"] } } });
    return safeJsonParse(response.text, { sentence: '', hints: [] });
}

export async function evaluateParaphrase(original: string, draft: string, mode: ParaphraseMode): Promise<{ score: number; meaningScore: number; lexicalScore: number; grammarScore: number; feedback: string; modelAnswer: string }> {
    const config = getConfig();
    const prompt = getParaphraseEvaluationPrompt(original, draft, mode);
    const response = await callAiWithRetry({ model: config.ai.modelForComplexTasks, contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, meaningScore: { type: Type.NUMBER }, lexicalScore: { type: Type.NUMBER }, grammarScore: { type: Type.NUMBER }, feedback: { type: Type.STRING }, modelAnswer: { type: Type.STRING } }, required: ["score", "meaningScore", "lexicalScore", "grammarScore", "feedback", "modelAnswer"] } } });
    return safeJsonParse(response.text, { score: 0, meaningScore: 0, lexicalScore: 0, grammarScore: 0, feedback: '', modelAnswer: '' });
}

export async function generateSpeech(text: string): Promise<string | null> {
    try {
        const config = getConfig();
        const ai = getClient();
        const response = await ai.models.generateContent({ model: config.ai.modelForTts, contents: [{ parts: getSpeechGenerationParts(text) }], config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } });
        const audioPart = response.candidates?.[0]?.content?.parts?.[0];
        if (audioPart && 'inlineData' in audioPart && audioPart.inlineData) return audioPart.inlineData.data;
        return null;
    } catch (e) { return null; }
}

export async function refineSpeakingTopic(topicName: string, description: string, currentQuestions: string, userRequest: string, user: User): Promise<{ name: string; description: string; questions: string[] }> {
    const config = getConfig();
    const prompt = getRefineSpeakingTopicPrompt(topicName, description, currentQuestions, userRequest, user);
    const response = await callAiWithRetry({ model: config.ai.modelForComplexTasks, contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, questions: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "description", "questions"] } } });
    return safeJsonParse(response.text, { name: topicName, description, questions: currentQuestions.split('\n') });
}

export async function evaluateSpeakingSessionFromAudio(topic: string, sessionData: { question: string, audioBase64: string }[]): Promise<{ band: number; feedback: string; transcripts: { question: string, transcript: string }[] }> {
    const config = getConfig();
    const prompt = getSpeakingEvaluationFromAudioPrompt(topic, sessionData.map(s => s.question));
    
    const contents: any[] = [{ text: prompt }];
    sessionData.forEach(item => {
        contents.push({
            inlineData: {
                mimeType: 'audio/webm',
                data: item.audioBase64,
            },
        });
    });

    const response = await callAiWithRetry({
        model: config.ai.modelForComplexTasks,
        contents: { parts: contents },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    band: { type: Type.NUMBER },
                    feedback: { type: Type.STRING },
                    transcripts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                question: { type: Type.STRING },
                                transcript: { type: Type.STRING }
                            },
                            required: ["question", "transcript"]
                        }
                    }
                },
                required: ["band", "feedback", "transcripts"]
            }
        }
    });
    return safeJsonParse(response.text, { band: 0, feedback: '<p>Error evaluating response.</p>', transcripts: [] });
}

export async function transcribeAudios(sessionData: { question: string, audioBase64: string }[]): Promise<{ question: string; transcript: string }[]> {
    const config = getConfig();
    const questions = sessionData.map(s => s.question);
    const prompt = getTranscriptionForSpeakingPrompt(questions);

    const contents: any[] = [{ text: prompt }];
    sessionData.forEach(item => {
        contents.push({ inlineData: { mimeType: 'audio/webm', data: item.audioBase64 } });
    });

    const response = await callAiWithRetry({
        model: config.ai.modelForComplexTasks,
        contents: { parts: contents },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    transcripts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                question: { type: Type.STRING },
                                transcript: { type: Type.STRING }
                            },
                            required: ["question", "transcript"]
                        }
                    }
                },
                required: ["transcripts"]
            }
        }
    });

    const result = safeJsonParse(response.text, { transcripts: [] });
    return result.transcripts;
}

export async function refineWritingTopic(currentTopic: WritingTopic, userRequest: string, user: User): Promise<{ name: string; description: string; task1: string; task2: string }> {
    const config = getConfig();
    const prompt = getRefineWritingTopicPrompt(currentTopic, userRequest, user);
    const response = await callAiWithRetry({ model: config.ai.modelForComplexTasks, contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, task1: { type: Type.STRING }, task2: { type: Type.STRING } }, required: ["name", "description", "task1", "task2"] } } });
    return safeJsonParse(response.text, { name: currentTopic.name, description: currentTopic.description, task1: currentTopic.task1, task2: currentTopic.task2 });
}

export async function evaluateWriting(task1Response: string, task2Response: string, topic: WritingTopic): Promise<{ band: number, feedback: string }> {
    const config = getConfig();
    const prompt = getWritingEvaluationPrompt(task1Response, task2Response, topic);
    const response = await callAiWithRetry({ model: config.ai.modelForComplexTasks, contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { band: { type: Type.NUMBER }, feedback: { type: Type.STRING } }, required: ["band", "feedback"] } } });
    return safeJsonParse(response.text, { band: 0, feedback: '<p>Error evaluating response.</p>' });
}

export async function generateFullWritingTest(theme: string): Promise<any> {
    const config = getConfig();
    const prompt = getFullWritingTestPrompt(theme);
    const response = await callAiWithRetry({ model: config.ai.modelForComplexTasks, contents: prompt, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { topic: { type: Type.STRING }, task1: { type: Type.STRING }, task2: { type: Type.STRING } }, required: ["topic", "task1", "task2"] } } });
    return safeJsonParse(response.text, null);
}

export async function generateWordComparison(groupName: string, words: string[]): Promise<{ updatedWords: string[], comparisonHtml: string }> {
    const config = getConfig();
    // FIX: Corrected function name from getWordComparisonPrompt to getComparisonPrompt.
    const prompt = getComparisonPrompt(groupName, words);
    const response = await callAiWithRetry({
        model: config.ai.modelForComplexTasks,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    updatedWords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    comparisonHtml: { type: Type.STRING }
                },
                required: ["updatedWords", "comparisonHtml"]
            }
        }
    });
    return safeJsonParse(response.text, { updatedWords: words, comparisonHtml: '<p>Error generating comparison.</p>' });
}

export async function generateIrregularVerbForms(verbs: string[]): Promise<{v1: string, v2: string, v3: string}[]> {
    const config = getConfig();
    const prompt = getIrregularVerbFormsPrompt(verbs);
    const response = await callAiWithRetry({
        model: config.ai.modelForBasicTasks,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        v1: { type: Type.STRING },
                        v2: { type: Type.STRING },
                        v3: { type: Type.STRING }
                    },
                    required: ["v1", "v2", "v3"]
                }
            }
        }
    });
    return safeJsonParse(response.text, []);
}