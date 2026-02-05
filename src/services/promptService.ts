
/**
 * Centralized service for generating AI prompts to ensure consistency.
 * This file imports and exports all individual prompt functions from the /prompts directory.
 */

export * from './prompts/getWordDetailsPrompt';
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
export * from './prompts/getGenerateLessonPrompt';
export * from './prompts/getRefineLessonPrompt'; 
export * from './prompts/getCompositionEvaluationPrompt'; 
export * from './prompts/getRefineNativeSpeakPrompt'; 
export * from './prompts/getMergeNativeSpeakPrompt'; 
export * from './prompts/getGenerateWordBookPrompt';
export * from './prompts/getAutoAddWordsToBookPrompt';
export * from './prompts/getGeneratePlanningGoalPrompt';
export * from './prompts/getGenerateConversationPrompt';
// Added missing export for pronunciation analysis prompt
export * from './prompts/getPronunciationAnalysisPrompt';

// Speaking feature prompts
export { getTranscriptionForSpeakingPrompt, getFullSpeakingTestPrompt, getRefineSpeakingTopicPrompt } from './prompts/getSpeakingPart1QuestionsPrompt';
export { getSpeakingEvaluationFromAudioPrompt, getSpeakingEvaluationFromTextPrompt } from './prompts/getSpeakingEvaluationPrompt';

// Writing feature prompts
export * from './prompts/getRefineWritingTopicPrompt';
export * from './prompts/getFullWritingTestPrompt';
export * from './prompts/getWritingEvaluationPrompt';