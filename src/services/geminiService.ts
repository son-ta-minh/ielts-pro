
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
  getIrregularVerbFormsPrompt,
  getPronunciationAnalysisPrompt,
  getGenerateLessonPrompt,
  LessonGenerationParams,
  getGenerateWordBookPrompt,
  getGeneratePlanningGoalPrompt
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

// Fix: The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const getApiKey = () => {
  return process.env.API_KEY || '';
};

const getClient = () => {
  const key = getApiKey();
  if (!key) throw new Error("API_KEY_MISSING");
  // Always use a named parameter for apiKey initialization.
  return new GoogleGenAI({ apiKey: key });
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

  // Fallback for just markdown block without json specifier
  const mdStart = clean.indexOf('```');
  if (mdStart !== -1) {
       // Check if it's the start
       const startIndex = mdStart + 3;
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
    // Strategy 1: Mixed Quote Fix (Smart Structure / Standard Content)
    // If we detect smart quotes, assume they are structural.
    // 1. Escape ALL existing standard quotes (assuming they are content).
    // 2. Replace Smart Quotes with Standard Quotes (restoring structure).
    if (/[\u201C\u201D]/.test(cleaned)) {
         const mixedFixed = cleaned
            .replace(/"/g, '\\"') // Escape content quotes
            .replace(/[\u201C\u201D]/g, '"'); // Normalize structural quotes
         try {
             return JSON.parse(mixedFixed);
         } catch (eMixed) {
             // Fall through
         }
    }

    // Strategy 2: Simple Smart Quote Replacement
    // Works if the entire JSON uses smart quotes consistently or if no internal quotes exist.
    const simpleSmartFixed = cleaned.replace(/[\u201C\u201D]/g, '"');
    try {
        return JSON.parse(simpleSmartFixed);
    } catch (eSimple) {
        // Fall through
    }

    // Strategy 3: Trailing Commas + Simple Smart Quotes
    // Removing trailing commas before closing braces/brackets
    const trailingCommaFixed = simpleSmartFixed.replace(/,\s*([}\]])/g, "$1");
    try { 
        return JSON.parse(trailingCommaFixed); 
    } 
    catch (eTrailing) {
         // Strategy 4: Trailing Commas + Mixed Quotes
         // Apply mixed quote fix logic, then remove trailing commas
         if (/[\u201C\u201D]/.test(cleaned)) {
             const mixedAndTrailing = cleaned
                .replace(/"/g, '\\"')
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/,\s*([}\]])/g, "$1");
             try {
                 return JSON.parse(mixedAndTrailing);
             } catch(e4) {}
         }

         console.error("JSON Parse Failed:", e);
         return defaultValue; 
    }
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
      // Guidelines: Call generateContent with model name and contents in a single object.
      const response = await ai.models.generateContent(requestPayload);
      // Guidelines: Access text property instead of calling text() method.
      return response;
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message?.toLowerCase() || "";
      
      // If API key is missing, fail immediately (allow UI to switch to manual mode)
      if (errorMsg.includes("api_key_missing")) {
          throw err;
      }

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
    const response = await callAiWithRetry({ 
        model: config.ai.modelForComplexTasks, 
        contents: prompt, 
        config: { responseMimeType: "application/json" } 
    });
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
    const response = await callAiWithRetry({ 
        model: config.ai.modelForBasicTasks, 
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

export async function evaluateParaphrase(original: string, draft: string, mode: ParaphraseMode): Promise<{ score: number; meaningScore: number; lexicalScore: number; grammarScore: number; feedback: string; modelAnswer: string }> {
    const config = getConfig();
    const prompt = getParaphraseEvaluationPrompt(original, draft, mode);
    const response = await callAiWithRetry({ 
        model: config.ai.modelForComplexTasks, 
        contents: prompt, 
        config: { 
            responseMimeType: "application/json", 
            responseSchema: { 
                type: Type.OBJECT, 
                properties: { 
                    score: { type: Type.NUMBER }, 
                    meaningScore: { type: Type.NUMBER }, 
                    lexicalScore: { type: Type.NUMBER }, 
                    grammarScore: { type: Type.NUMBER }, 
                    feedback: { type: Type.STRING }, 
                    modelAnswer: { type: Type.STRING } 
                }, 
                required: ["score", "meaningScore", "lexicalScore", "grammarScore", "feedback", "modelAnswer"] 
            } 
        } 
    });
    return safeJsonParse(response.text, { score: 0, meaningScore: 0, lexicalScore: 0, grammarScore: 0, feedback: '', modelAnswer: '' });
}

export async function generateSpeech(text: string): Promise<string | null> {
    try {
        const config = getConfig();
        const ai = getClient();
        const response = await ai.models.generateContent({ 
            model: config.ai.modelForTts, 
            contents: [{ parts: getSpeechGenerationParts(text) }], 
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

export async function refineSpeakingTopic(topicName: string, description: string, currentQuestions: string, userRequest: string, user: User): Promise<{ name: string; description: string; questions: string[] }> {
    const config = getConfig();
    const prompt = getRefineSpeakingTopicPrompt(topicName, description, currentQuestions, userRequest, user);
    const response = await callAiWithRetry({ 
        model: config.ai.modelForComplexTasks, 
        contents: prompt, 
        config: { 
            responseMimeType: "application/json", 
            responseSchema: { 
                type: Type.OBJECT, 
                properties: { 
                    name: { type: Type.STRING }, 
                    description: { type: Type.STRING }, 
                    questions: { type: Type.ARRAY, items: { type: Type.STRING } } 
                }, 
                required: ["name", "description", "questions"] 
            } 
        } 
    });
    return safeJsonParse(response.text, { name: topicName, description, questions: currentQuestions.split('\n') });
}

export async function generateFullSpeakingTest(theme: string): Promise<any> {
    const config = getConfig();
    const prompt = getFullSpeakingTestPrompt(theme);
    const response = await callAiWithRetry({
        model: config.ai.modelForComplexTasks,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING },
                    part1: { type: Type.ARRAY, items: { type: Type.STRING } },
                    part2: {
                        type: Type.OBJECT,
                        properties: {
                            cueCard: { type: Type.STRING },
                            points: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["cueCard", "points"]
                    },
                    part3: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["topic", "part1", "part2", "part3"]
            }
        }
    });
    return safeJsonParse(response.text, null);
}

export async function evaluateSpeakingSessionFromAudio(topic: string, sessionData: { question: string, audioBase64: string, mimeType: string }[]): Promise<{ band: number; feedback: string; transcripts: { question: string, transcript: string }[] }> {
    const config = getConfig();
    const prompt = getSpeakingEvaluationFromAudioPrompt(topic, sessionData.map(s => s.question));
    
    const contents: any[] = [{ text: prompt }];
    sessionData.forEach(item => {
        contents.push({
            inlineData: {
                mimeType: item.mimeType || 'audio/webm',
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

export async function analyzePronunciation(audioBase64: string, targetText: string, mimeType: string = 'audio/webm'): Promise<{ isCorrect: boolean, score: number, feedbackHtml: string }> {
    const config = getConfig();
    const prompt = getPronunciationAnalysisPrompt(targetText);

    const contents = [
        { text: prompt },
        { inlineData: { mimeType: mimeType, data: audioBase64 } }
    ];

    const response = await callAiWithRetry({
        model: config.ai.modelForComplexTasks,
        contents: { parts: contents },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    isCorrect: { type: Type.BOOLEAN },
                    score: { type: Type.NUMBER },
                    feedbackHtml: { type: Type.STRING }
                },
                required: ["isCorrect", "score", "feedbackHtml"]
            }
        }
    });

    return safeJsonParse(response.text, { isCorrect: false, score: 0, feedbackHtml: "Analysis failed." });
}

export async function transcribeAudios(sessionData: { question: string, audioBase64: string, mimeType: string }[]): Promise<{ question: string; transcript: string }[]> {
    const config = getConfig();
    const questions = sessionData.map(s => s.question);
    const prompt = getTranscriptionForSpeakingPrompt(questions);

    const contents: any[] = [{ text: prompt }];
    sessionData.forEach(item => {
        contents.push({ inlineData: { mimeType: item.mimeType || 'audio/webm', data: item.audioBase64 } });
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
    const response = await callAiWithRetry({ 
        model: config.ai.modelForComplexTasks, 
        contents: prompt, 
        config: { 
            responseMimeType: "application/json", 
            responseSchema: { 
                type: Type.OBJECT, 
                properties: { 
                    name: { type: Type.STRING }, 
                    description: { type: Type.STRING }, 
                    task1: { type: Type.STRING }, 
                    task2: { type: Type.STRING } 
                }, 
                required: ["name", "description", "task1", "task2"] 
            } 
        } 
    });
    return safeJsonParse(response.text, { name: currentTopic.name, description: currentTopic.description, task1: currentTopic.task1, task2: currentTopic.task2 });
}

export async function evaluateWriting(task1Response: string, task2Response: string, topic: WritingTopic): Promise<{ band: number, feedback: string }> {
    const config = getConfig();
    const prompt = getWritingEvaluationPrompt(task1Response, task2Response, topic);
    const response = await callAiWithRetry({ 
        model: config.ai.modelForComplexTasks, 
        contents: prompt, 
        config: { 
            responseMimeType: "application/json", 
            responseSchema: { 
                type: Type.OBJECT, 
                properties: { 
                    band: { type: Type.NUMBER }, 
                    feedback: { type: Type.STRING } 
                }, 
                required: ["band", "feedback"] 
            } 
        } 
    });
    return safeJsonParse(response.text, { band: 0, feedback: '<p>Error evaluating response.</p>' });
}

export async function generateFullWritingTest(theme: string): Promise<any> {
    const config = getConfig();
    const prompt = getFullWritingTestPrompt(theme);
    const response = await callAiWithRetry({ 
        model: config.ai.modelForComplexTasks, 
        contents: prompt, 
        config: { 
            responseMimeType: "application/json", 
            responseSchema: { 
                type: Type.OBJECT, 
                properties: { 
                    topic: { type: Type.STRING }, 
                    task1: { type: Type.STRING }, 
                    task2: { type: Type.STRING } 
                }, 
                required: ["topic", "task1", "task2"] 
            } 
        } 
    });
    return safeJsonParse(response.text, null);
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

export async function generateLessonContent(params: LessonGenerationParams): Promise<{ title: string; description: string; content: string }> {
  const config = getConfig();
  const prompt = getGenerateLessonPrompt(params);
  const response = await callAiWithRetry({
      model: config.ai.modelForComplexTasks,
      contents: prompt,
      config: {
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  content: { type: Type.STRING }
              },
              required: ["title", "description", "content"]
          }
      }
  });
  return safeJsonParse(response.text, { title: params.topic, description: "Generated lesson.", content: "" });
}

export async function generateWordBook(topic: string): Promise<{ topic: string, icon: string, words: { word: string, definition: string }[] }> {
    const config = getConfig();
    const prompt = getGenerateWordBookPrompt(topic);
    const response = await callAiWithRetry({
        model: config.ai.modelForComplexTasks,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING },
                    icon: { type: Type.STRING },
                    words: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                word: { type: Type.STRING },
                                definition: { type: Type.STRING }
                            },
                            required: ["word", "definition"]
                        }
                    }
                },
                required: ["topic", "icon", "words"]
            }
        }
    });
    return safeJsonParse(response.text, { topic: '', icon: '', words: [] });
}

export async function generatePlanningGoal(request: string): Promise<{ title: string; description: string; todos: { text: string }[] }> {
  const config = getConfig();
  const prompt = getGeneratePlanningGoalPrompt(request);
  const response = await callAiWithRetry({
      model: config.ai.modelForComplexTasks,
      contents: prompt,
      config: {
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  todos: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              text: { type: Type.STRING }
                          },
                          required: ["text"]
                      }
                  }
              },
              required: ["title", "description", "todos"]
          }
      }
  });
  return safeJsonParse(response.text, { title: "New Goal", description: "", todos: [] });
}
