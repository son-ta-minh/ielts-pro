/**
 * Centralized service for generating AI prompts to ensure consistency.
 * This file imports and exports all individual prompt functions from the /prompts directory.
 */

export * from './prompts/getWordDetailsPrompt';
// Fix: Add missing export for getIpaAccentsPrompt.
export * from './prompts/getIpaAccentsPrompt';
export * from './prompts/getRefineUnitPrompt';
export * from './prompts/getParaphraseTaskPrompt';
export * from './prompts/getParaphraseEvaluationPrompt';
export * from './prompts/getSpeechGenerationParts';
export * from './prompts/getGenerateChapterPrompt';
export * from './prompts/getGenerateSegmentPrompt';
export * from './prompts/getComparisonPrompt';
export * from './prompts/getIrregularVerbFormsPrompt';
export * from './prompts/getLearningSuggestionsPrompt';
export * from './prompts/getHintsPrompt';
export * from './prompts/getPronunciationAnalysisPrompt';
export * from './prompts/getRefineLessonPrompt'; 
export * from './prompts/getCompositionEvaluationPrompt'; 
export * from './prompts/getRefineNativeSpeakPrompt'; 
export * from './prompts/getGenerateLessonPrompt'; // Added
export * from './prompts/getMergeNativeSpeakPrompt'; // Added for merging cards
export * from './prompts/getGenerateWordBookPrompt';
export * from './prompts/getAutoAddWordsToBookPrompt';

// Speaking feature prompts
// FIX: Add getRefineSpeakingTopicPrompt to the export list to fix the error in geminiService.ts.
export { getTranscriptionForSpeakingPrompt, getFullSpeakingTestPrompt, getRefineSpeakingTopicPrompt } from './prompts/getSpeakingPart1QuestionsPrompt';
export { getSpeakingEvaluationFromAudioPrompt, getSpeakingEvaluationFromTextPrompt } from './prompts/getSpeakingEvaluationPrompt';

// Writing feature prompts
export * from './prompts/getRefineWritingTopicPrompt';
export * from './prompts/getFullWritingTestPrompt';
export * from './prompts/getWritingEvaluationPrompt';