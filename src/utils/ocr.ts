
import { createWorker } from 'tesseract.js';

/**
 * Extracts text from an image using Tesseract.js (Client-side/Offline).
 * @param imageSource Data URL or Image URL
 * @returns Extracted text
 */
export async function extractTextOffline(imageSource: string): Promise<string> {
    // Initialize worker for English (optimized for IELTS context)
    // You can add 'vie' for Vietnamese if needed: createWorker(['eng', 'vie'])
    const worker = await createWorker('eng');
    
    try {
        const ret = await worker.recognize(imageSource);
        await worker.terminate();
        return ret.data.text;
    } catch (e) {
        await worker.terminate();
        throw e;
    }
}
