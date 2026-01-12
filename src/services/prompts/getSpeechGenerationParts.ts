/**
 * Generates prompt parts for text-to-speech.
 */
export function getSpeechGenerationParts(text: string): any[] {
    return [{ text: `Speak: ${text}` }];
}
